// Ayudas comunes de las herramientas del servidor: encontrar una propiedad, un negocio (por su código NG-014, su id o un texto) o una persona,
// respetando lo que ve cada usuario (el corredor, lo suyo; el administrador, todo), y dar formato a montos y fechas.
import { Injectable } from '@nestjs/common';
import type { Negocio, Persona, Prisma, Propiedad } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { norm } from '../comun';
import { normalizar } from '../../comun/texto';
import type { CtxHerr } from './tipos';

export type Hallado<T> = { ok: true; v: T } | { ok: false; error: string };

export const fechaIso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const pesos = (n: unknown, m?: string | null) =>
  n == null ? null : `${m === 'UF' ? 'UF ' : m === 'USD' ? 'US$ ' : '$'}${Number(n).toLocaleString('es-CL')}`;
export const ddmmaaaa = (f: string | null | undefined) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');
const uuid = /^[0-9a-f-]{36}$/i;

@Injectable()
export class AyudasHerramientas {
  constructor(private readonly db: PrismaService) {}

  /** el filtro de «lo mío»: el corredor ve sus negocios, leads y agenda; el administrador, todo */
  mio(c: CtxHerr) {
    return c.admin ? {} : { corredorId: c.usuarioId };
  }

  /** una propiedad por su código (CV-9001, sin importar mayúsculas) o su id */
  async propiedad(c: CtxHerr, ref: unknown): Promise<Propiedad | null> {
    const k = String(ref ?? '').trim();
    if (!k) return null;
    return this.db.propiedad.findFirst({
      where: {
        corredoraId: c.corredoraId,
        eliminadoEn: null,
        OR: [{ codigo: { equals: k, mode: 'insensitive' } }, ...(uuid.test(k) ? [{ id: k }] : [])],
      },
    });
  }

  /** el código de un negocio tal como lo escribe la gente («NG-014», «ng14», «NG 14») → los códigos guardados que le corresponden */
  codigosNegocio(ref: string) {
    const m = /^ng[\s-]*0*(\d+)$/i.exec(ref.trim());
    return m ? [`NG-${m[1].padStart(3, '0')}`, `NG-${m[1]}`] : [];
  }

  /**
   * Un negocio por su código NG-XXX, su id o un texto (código de la propiedad, nombre del cliente). Si hay varios que coinciden, devuelve un error
   * con sus códigos para que se le pregunte al corredor cuál. `soloAbiertos` (por defecto sí) deja fuera los ganados y perdidos.
   */
  async negocio(c: CtxHerr, ref: unknown, soloAbiertos = true): Promise<Hallado<Negocio>> {
    const k = String(ref ?? '').trim();
    if (!k) return { ok: false, error: 'Falta indicar el negocio (su código NG-XXX).' };
    const base: Prisma.NegocioWhereInput = { corredoraId: c.corredoraId, eliminadoEn: null, ...this.mio(c) };
    const cods = this.codigosNegocio(k);
    if (cods.length || uuid.test(k) || /^n[a-z0-9]{6,}$/i.test(k)) {
      const n = await this.db.negocio.findFirst({
        where: { ...base, OR: [...cods.map((x) => ({ datos: { path: ['codigo'], equals: x } })), { id: k }] },
      });
      return n ? { ok: true, v: n } : { ok: false, error: `No encontré el negocio «${k}» entre los tuyos.` };
    }
    // por texto: el código de la propiedad o el nombre del cliente
    const l = await this.db.negocio.findMany({
      where: { ...base, ...(soloAbiertos ? { estado: 'abierto' } : {}) },
      orderBy: { actualizadoEn: 'desc' },
      take: 200,
    });
    const props = await this.db.propiedad.findMany({
      where: { id: { in: l.map((n) => n.propiedadId).filter((x): x is string => !!x) } },
      select: { id: true, codigo: true, titulo: true },
    });
    const pers = await this.db.persona.findMany({
      where: { id: { in: l.map((n) => n.clienteId).filter((x): x is string => !!x) } },
      select: { id: true, nombre: true },
    });
    const q = norm(k).split(/\s+/).filter((t) => t.length > 1);
    const hit = l.filter((n) => {
      const p = props.find((x) => x.id === n.propiedadId);
      const cli = pers.find((x) => x.id === n.clienteId);
      const h = norm(`${(n.datos as { codigo?: string })?.codigo ?? ''} ${p?.codigo ?? ''} ${p?.titulo ?? ''} ${cli?.nombre ?? ''} ${n.tipo}`);
      return q.length > 0 && q.every((t) => h.includes(t));
    });
    if (!hit.length) return { ok: false, error: `No encontré un negocio que coincida con «${k}». Búscalo con la herramienta de negocios.` };
    if (hit.length > 1)
      return {
        ok: false,
        error: `Hay ${hit.length} negocios que coinciden: ${hit
          .slice(0, 6)
          .map((n) => {
            const p = props.find((x) => x.id === n.propiedadId);
            const cli = pers.find((x) => x.id === n.clienteId);
            return `${(n.datos as { codigo?: string })?.codigo ?? n.id} (${n.tipo} · ${p?.codigo ?? 's/propiedad'} · ${cli?.nombre ?? 's/cliente'})`;
          })
          .join(' | ')}. Pregúntale al corredor cuál (por su código NG-XXX).`,
      };
    return { ok: true, v: hit[0] };
  }

  /** una persona del CRM por RUT, nombre, correo o id */
  async persona(c: CtxHerr, ref: unknown): Promise<Hallado<Persona>> {
    const k = String(ref ?? '').trim();
    if (!k) return { ok: false, error: 'Falta indicar la persona.' };
    if (uuid.test(k)) {
      const p = await this.db.persona.findFirst({ where: { id: k, corredoraId: c.corredoraId, eliminadoEn: null } });
      return p ? { ok: true, v: p } : { ok: false, error: 'No encontré a esa persona.' };
    }
    const rut = k.replace(/[^0-9kK]/g, '').toUpperCase();
    const l = await this.db.persona.findMany({
      where: {
        corredoraId: c.corredoraId,
        eliminadoEn: null,
        OR: [...(rut.length > 6 ? [{ rut }] : []), { busqueda: { contains: normalizar(k) } }],
      },
      orderBy: { creadoEn: 'desc' },
      take: 6,
    });
    if (!l.length) return { ok: false, error: `No encontré a «${k}» en el CRM. Puedes crearla con la herramienta de personas (necesita el nombre; el RUT es opcional).` };
    if (l.length > 1)
      return { ok: false, error: `Hay ${l.length} personas que coinciden: ${l.map((p) => `${p.nombre}${p.rutFormato ? ' (' + p.rutFormato + ')' : ''}`).join(' | ')}. Pregúntale al corredor cuál.` };
    return { ok: true, v: l[0] };
  }
}
