// Revisión de firmas en el servidor: cada FIRMAS_CADA_SEG (5 min) consulta en Portalfirma, con la sesión de cada
// corredora, el detalle de lo que está en firma, y deja el resultado en la base para todos (antes lo hacía solo el
// equipo de quien envió, y solo mientras estaba abierto).
//  · Documentos en firma (tabla firmas): estado, firmantes (quién firmó), legalizado. Si algo cambió, queda en el
//    historial de sus propiedades y se avisa a quien lo envió (tabla avisos: la app lo muestra y se lo dice por WhatsApp).
//  · Firmas ligadas a etapas de negocios (negocios.datos.firmas[etapa]): avance, y al quedar firmada, aviso al corredor
//    a cargo con `avanzar` si es la etapa actual (su app mueve el negocio a la siguiente etapa: las etapas viven en la app).
//  · Cada documento se revisa a lo más cada 4 min. Los cambios se guardan con `version`: si la app cambió el documento
//    entremedio, se deja para la próxima vuelta (y el aviso sale una sola vez, con el cambio que sí se guardó).
//  · POST /v1/firmas/revisar: «revisar ahora» (cualquier usuario, para su corredora; lo de hace menos de 30 s no se repite).
/* eslint-disable @typescript-eslint/no-unsafe-assignment --
   el detalle de Portalfirma es JSON sin tipo (Detalle) y se lee campo a campo */
import {
  ConflictException,
  Controller,
  HttpCode,
  Injectable,
  Logger,
  Post,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Firma, Negocio, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ActividadService } from '../comun/actividad.service';
import { AvisosService, type NuevoAviso } from '../avisos/avisos';
import { PortalfirmaService } from '../conexiones/portalfirma';
import type { Env } from '../config/env';
import { igualJson } from '../comun/asignados';

const CADA_DOC_MS = 4 * 60_000;
const MAX_POR_VUELTA = 100;
const FINALES = ['firmado', 'anulado', 'rechazado'];

interface Firmante {
  nombre?: string;
  rut?: string;
  rol?: string;
  calidad?: string | null;
  email?: string;
  telefono?: string;
  firmo?: boolean;
  [k: string]: unknown;
}
interface FirmaNegocio {
  operacion?: number | string;
  estado?: string;
  firmados?: number;
  total?: number;
  revisado?: string;
  firmado?: string;
  error?: string | null;
  avanzar?: boolean;
  [k: string]: unknown;
}

type Detalle = Record<string, any>;

const rutLimpio = (r?: string | null) => (r ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
/** 12.345.678-9, como la app */
const fmtRut = (r: string) => {
  const c = rutLimpio(r);
  return c.length < 2 ? r : c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1);
};

/** detalle de Portalfirma → estado normalizado (lo mismo que hacía la app en firmas.js › leerDetalle) */
export function leerDetalle(d: Detalle, previos: Firmante[] = []) {
  const sig = ((d?.signatories as Detalle[]) || []).map((s) => ({
    nombre: [s.name, s.paternalLastName, s.maternalLastName].filter(Boolean).join(' ') || s.fullName || '',
    rut: String(s.rut || ''),
    email: String(s.email || ''),
    telefono: String(s.phone || ''),
    firmo: !!s.signed,
    calidad: (s.alias as string) || null,
  }));
  const firmados = sig.filter((s) => s.firmo).length;
  const legalizado = !!(
    d?.legalized ||
    (d?.protocolizationNumber && d.protocolizationNumber !== 'none' && d?.status === 'finalized')
  );
  const estado =
    d?.status === 'unPayed'
      ? 'pendiente_pago'
      : (sig.length && firmados === sig.length) || d?.status === 'finalized'
        ? 'firmado'
        : /cancel|anul|reject|rechaz/i.test(String(d?.status))
          ? 'anulado'
          : 'en_firma';
  // calidades: las que mandó Asset (por RUT) si Portalfirma no las informa
  for (const s of sig)
    if (!s.calidad)
      s.calidad =
        previos.find((x) => x.rut && rutLimpio(x.rut) === rutLimpio(s.rut))?.calidad ||
        previos.find((x) => x.rut && rutLimpio(x.rut) === rutLimpio(s.rut))?.rol ||
        null;
  return { estado, firmados, total: sig.length, firmantes: sig, legalizado, finalizado: d?.status === 'finalized' };
}

@Injectable()
export class FirmasRondaService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('RevisionFirmas');
  private reloj: NodeJS.Timeout | null = null;
  private readonly cadaMs: number;
  /** corredoras en revisión ahora (en este proceso) */
  private readonly enCurso = new Map<string, Promise<{ revisadas: number; cambios: string[] }>>();

  constructor(
    private readonly db: PrismaService,
    private readonly pf: PortalfirmaService,
    private readonly actividad: ActividadService,
    private readonly avisos: AvisosService,
    config: ConfigService<Env, true>,
  ) {
    this.cadaMs = config.get('FIRMAS_CADA_SEG', { infer: true }) * 1000;
  }

  onModuleInit() {
    if (this.cadaMs <= 0) return;
    this.reloj = setInterval(() => void this.ronda(), this.cadaMs);
    this.reloj.unref?.();
  }
  onModuleDestroy() {
    if (this.reloj) clearInterval(this.reloj);
  }

  /** todas las corredoras con Portalfirma conectado */
  async ronda() {
    const cs = await this.db.conexion.findMany({
      where: { proveedor: 'portalfirma', dueno: 'corredora', estado: 'activa' },
      select: { corredoraId: true },
    });
    for (const c of cs)
      await this.revisarCorredora(c.corredoraId).catch((e: Error) =>
        this.log.warn(`corredora ${c.corredoraId}: ${e.message}`),
      );
  }

  /** una corredora (si ya se está revisando, espera esa misma vuelta) */
  revisarCorredora(corredoraId: string, minimoMs = CADA_DOC_MS) {
    let p = this.enCurso.get(corredoraId);
    if (!p) {
      p = this.vuelta(corredoraId, minimoMs).finally(() => this.enCurso.delete(corredoraId));
      this.enCurso.set(corredoraId, p);
    }
    return p;
  }

  private async detalle(corredoraId: string, op: number): Promise<Detalle> {
    const r = await this.pf.llamarComo({ corredoraId, usuarioId: null }, 'process_detail_get_by_operation', {
      operation: op,
    });
    const t = (r.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n');
    let d: Detalle | null = null;
    try {
      d = JSON.parse(t) as Detalle;
    } catch {
      /* no es JSON */
    }
    if (r.isError || !d || typeof d !== 'object')
      throw new Error(`Portalfirma no entregó el detalle de la operación ${op}${t ? ': ' + t.slice(0, 160) : '.'}`);
    return d;
  }

  private async vuelta(corredoraId: string, minimoMs: number) {
    const antes = new Date(Date.now() - minimoMs);
    const cambios: string[] = [];
    let revisadas = 0;
    // ---- documentos en firma
    const firmas = await this.db.firma.findMany({
      where: {
        corredoraId,
        eliminadoEn: null,
        operacion: { not: null },
        estado: { notIn: FINALES },
        OR: [{ revisadoEn: null }, { revisadoEn: { lt: antes } }],
      },
      orderBy: { revisadoEn: { sort: 'asc', nulls: 'first' } },
      take: MAX_POR_VUELTA,
    });
    for (const f of firmas) {
      let d: Detalle;
      try {
        d = await this.detalle(corredoraId, f.operacion as number);
      } catch (e) {
        if (e instanceof ConflictException) throw e; // sin sesión: no sigue con esta corredora
        this.log.warn((e as Error).message);
        // se reintenta en la próxima vuelta (no en cada pedido de «revisar ahora»)
        await this.db.$executeRaw`UPDATE firmas SET revisado_en = now() WHERE id = ${f.id}`;
        continue;
      }
      revisadas++;
      const c = await this.aplicarFirma(f, d);
      cambios.push(...c);
    }
    // ---- firmas de las etapas de los negocios
    const ids = await this.db.$queryRaw<{ id: string }[]>`
      SELECT n.id FROM negocios n
      WHERE n.corredora_id = ${corredoraId}::uuid AND n.estado = 'abierto' AND n.eliminado_en IS NULL
        AND jsonb_typeof(n.datos->'firmas') = 'object'
        AND EXISTS (SELECT 1 FROM jsonb_each(n.datos->'firmas') e
                    WHERE jsonb_typeof(e.value) = 'object' AND coalesce(e.value->>'operacion', '') <> ''
                      AND coalesce(e.value->>'estado', '') <> 'firmado'
                      AND coalesce(e.value->>'revisado', '') < ${antes.toISOString()})
      LIMIT ${MAX_POR_VUELTA}`;
    for (const { id } of ids) {
      const n = await this.db.negocio.findUnique({ where: { id } });
      if (n) {
        const r = await this.aplicarNegocio(n, antes);
        revisadas += r.revisadas;
        cambios.push(...r.cambios);
      }
    }
    return { revisadas, cambios };
  }

  /** guarda lo que dijo Portalfirma de un documento; devuelve los cambios (y los avisa) */
  private async aplicarFirma(f: Firma, d: Detalle): Promise<string[]> {
    const previos = (f.firmantes as Firmante[]) || [];
    const x = leerDetalle(d, previos);
    const doc = f.documento;
    const cambios: string[] = [];
    const yaFirmaron = new Set(previos.filter((s) => s.firmo).map((s) => rutLimpio(s.rut)));
    for (const s of x.firmantes)
      if (s.firmo && !yaFirmaron.has(rutLimpio(s.rut)))
        cambios.push(`${s.nombre || 'Un firmante'}${s.calidad ? ` (${s.calidad})` : ''} firmó «${doc}»`);
    if (x.estado === 'firmado' && f.estado !== 'firmado') cambios.push(`«${doc}» quedó firmado por todos`);
    if (x.legalizado && !f.legalizado) cambios.push(`«${doc}» quedó legalizado`);
    const firmantes = x.firmantes.map((s) => {
      const p = previos.find((y) => y.rut && rutLimpio(y.rut) === rutLimpio(s.rut)) || {};
      return {
        ...p,
        nombre: s.nombre || p.nombre,
        rut: s.rut ? fmtRut(s.rut) : '',
        rol: s.calidad || p.rol || '',
        firmo: s.firmo,
        email: s.email,
        telefono: s.telefono,
      };
    });
    const ahora = new Date();
    const igual = x.estado === f.estado && x.legalizado === f.legalizado && igualJson(firmantes, previos);
    if (igual) {
      // nada nuevo: solo la hora de revisión (sin cambiar la versión: no hay nada que la app deba bajar)
      await this.db.$executeRaw`UPDATE firmas SET revisado_en = ${ahora} WHERE id = ${f.id}`;
      return [];
    }
    const r = await this.db.firma.updateMany({
      where: { id: f.id, version: f.version },
      data: {
        estado: x.estado,
        legalizado: x.legalizado,
        firmados: firmantes.filter((s) => s.firmo).length,
        total: firmantes.length,
        firmantes: firmantes,
        revisadoEn: ahora,
        ...(x.estado === 'firmado' && f.estado !== 'firmado' ? { firmadoEn: ahora } : {}),
        version: { increment: 1 },
      },
    });
    if (!r.count || !cambios.length) return [];
    const texto = `${cambios.join(' · ')} (operación ${f.operacion})`;
    await this.actividad
      .registrar(
        f.propiedadIds.map((p) => ({
          corredoraId: f.corredoraId,
          entidadTipo: 'propiedad' as const,
          entidadId: p,
          texto,
        })),
      )
      .catch(() => null);
    if (f.enviadoPorId)
      await this.avisos.crear({
        corredoraId: f.corredoraId,
        usuarioId: f.enviadoPorId,
        tipo: 'firmas',
        texto,
        datos: { operacion: f.operacion, propiedadIds: f.propiedadIds, negocioId: f.negocioId },
      });
    return cambios;
  }

  private async aplicarNegocio(n: Negocio, antes: Date) {
    const datos = { ...((n.datos as Record<string, unknown>) ?? {}) };
    const firmas = { ...((datos.firmas as Record<string, FirmaNegocio>) ?? {}) };
    const avisos: NuevoAviso[] = [];
    const cambios: string[] = [];
    let revisadas = 0;
    let cambio = false;
    const titulo = await this.titulo(n);
    for (const [etapaId, f0] of Object.entries(firmas)) {
      if (!f0?.operacion || f0.estado === 'firmado' || String(f0.revisado || '') >= antes.toISOString()) continue;
      const f: FirmaNegocio = { ...f0 };
      try {
        const d = await this.detalle(n.corredoraId, Number(f.operacion));
        revisadas++;
        const sig = (d.signatories as Detalle[]) || [];
        f.firmados = sig.filter((s) => s.signed).length;
        f.total = sig.length;
        f.error = null;
        if (d.status === 'finalized') {
          f.estado = 'firmado';
          f.firmado = new Date().toISOString();
          if (n.etapa === etapaId) f.avanzar = true; // la app del corredor mueve el negocio
          const m = `${titulo}: se firmó el documento de la etapa «${etapaId}» (operación ${f.operacion}).`;
          cambios.push(m);
          const quien = n.corredorId ?? n.creadoPorId;
          if (quien)
            avisos.push({
              corredoraId: n.corredoraId,
              usuarioId: quien,
              tipo: 'firma_negocio',
              texto: m,
              datos: { negocioId: n.id, etapa: etapaId, operacion: f.operacion, avanzar: !!f.avanzar },
            });
        }
      } catch (e) {
        if (e instanceof ConflictException) throw e;
        f.error = (e as Error).message.slice(0, 300);
      }
      f.revisado = new Date().toISOString();
      firmas[etapaId] = f;
      cambio = true;
    }
    if (!cambio) return { revisadas, cambios: [] };
    datos.firmas = firmas;
    const r = await this.db.negocio.updateMany({
      where: { id: n.id, version: n.version },
      data: { datos: datos as Prisma.InputJsonObject, version: { increment: 1 } },
    });
    if (!r.count) return { revisadas, cambios: [] }; // la app lo cambió entremedio: la próxima vuelta
    if (cambios.length) {
      await this.actividad
        .registrar(
          cambios.map((t) => ({
            corredoraId: n.corredoraId,
            entidadTipo: 'negocio' as const,
            entidadId: n.id,
            ref2: n.propiedadId,
            texto: t,
          })),
        )
        .catch(() => null);
      await this.avisos.crear(avisos);
    }
    return { revisadas, cambios };
  }

  private async titulo(n: Negocio) {
    const [p, c] = await Promise.all([
      n.propiedadId
        ? this.db.propiedad.findUnique({ where: { id: n.propiedadId }, select: { codigo: true, titulo: true } })
        : null,
      n.clienteId ? this.db.persona.findUnique({ where: { id: n.clienteId }, select: { nombre: true } }) : null,
    ]);
    return [p ? p.titulo || p.codigo : 'Sin propiedad', c?.nombre].filter(Boolean).join(' · ');
  }
}

@Controller('firmas')
export class FirmasRondaController {
  constructor(private readonly s: FirmasRondaService) {}

  /** «revisar ahora»: lo que está en firma en la corredora (lo revisado hace menos de 30 s no se repite) */
  @Post('revisar')
  @HttpCode(200)
  revisar(@UsuarioActual() u: UsuarioToken) {
    return this.s.revisarCorredora(u.corredoraId, 30_000);
  }
}
