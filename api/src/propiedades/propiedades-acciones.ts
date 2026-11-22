/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- la ficha es JSON libre */
// Reglas de propiedades que antes vivían solo en la app de escritorio (inmo.js, dictado.js, ficha-campos.js), ahora UNA vez en
// el servidor: la app de escritorio las usa por REST y las herramientas de WhatsApp (whatsapp/herramientas/propiedades.ts) son una
// capa delgada encima.
//  · POST /v1/propiedades/dictar              { texto, previo? }  → campos, qué falta, dudas y avisos (no guarda nada)
//  · POST /v1/propiedades/desde-dictado       { campos }          → crea la propiedad (y vincula al propietario dictado)
//  · GET  /v1/propiedades/:id/ficha-pendiente                     → la ficha por bloques: qué falta y qué pedir ahora
//  · POST /v1/propiedades/:id/completar-ficha { texto }           → cualquier dato dictado a la ficha
//  · PUT  /v1/propiedades/:id/estado          { operacion, estado } → estado comercial (ajusta el aviso del portal)
// Reglas: el corredor ve la cartera entera pero los datos del propietario solo si captó la propiedad (o es admin); cada cambio
// queda en el historial y sube `version` (lo hace PropiedadesService).
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import { limpiarRut, palabras, rutValido } from '../comun/texto';
import { PersonasService } from '../personas/personas.service';
import { PropiedadesService } from './propiedades.service';
import { PortalInmobiliarioService } from '../conexiones/portal-inmobiliario';
import { ESTADOS, type PropiedadEntrada } from './propiedades.esquemas';
import { aEntrada, avisosDictado, DictadoService, normalizarCampos, propietarioDe, type CamposDictado, type PropietarioDictado } from './dictado';
import * as FC from './ficha-campos';

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEL_DUENO = /^propietario/;

export type Hallada = { ok: true; v: { id: string; codigo: string; titulo: string } } | { ok: false; error: string };
export type ResultadoPropietario =
  | { ok: true; nombre: string; rut: string }
  | { ok: false; nombre: string; motivo: string }
  | null;

@Injectable()
export class PropiedadesAccionesService {
  constructor(
    private readonly db: PrismaService,
    private readonly propiedades: PropiedadesService,
    private readonly personas: PersonasService,
    private readonly dictado: DictadoService,
    private readonly portal: PortalInmobiliarioService,
  ) {}

  /**
   * Una propiedad por su código (PF-1001, sin importar mayúsculas), su id o un texto (dirección, comuna, título…). Si el texto
   * coincide con varias, el error las lista para que se le pregunte al corredor cuál.
   */
  async resolver(u: UsuarioToken, ref: unknown): Promise<Hallada> {
    const k = String(ref ?? '').trim();
    if (!k) return { ok: false, error: 'Falta indicar la propiedad (su código, por ejemplo PF-1001).' };
    const base = { corredoraId: u.corredoraId, eliminadoEn: null };
    const exacta = await this.db.propiedad.findFirst({
      where: { ...base, OR: [{ codigo: { equals: k, mode: 'insensitive' } }, ...(uuid.test(k) ? [{ id: k }] : [])] },
      select: { id: true, codigo: true, titulo: true },
    });
    if (exacta) return { ok: true, v: exacta };
    const l = await this.db.propiedad.findMany({
      where: { ...base, archivada: false, AND: palabras(k) },
      select: { id: true, codigo: true, titulo: true, comuna: true },
      take: 6,
      orderBy: { actualizadoEn: 'desc' },
    });
    if (!l.length) return { ok: false, error: `No encontré una propiedad que coincida con «${k}». Búscala con buscar_propiedades.` };
    if (l.length > 1)
      return {
        ok: false,
        error: `Hay ${l.length} propiedades que coinciden: ${l.map((p) => `${p.codigo} ${p.titulo} (${p.comuna || 's/comuna'})`).join(' | ')}. Pregúntale al corredor cuál.`,
      };
    return { ok: true, v: l[0] };
  }

  // ------------------------------------------------------------------ dictar y crear

  /** el dictado (texto) → campos de la ficha, qué falta y las dudas. No guarda nada. */
  async dictar(u: UsuarioToken, texto: string, previo?: CamposDictado | null) {
    try {
      return await this.dictado.extraer(u.corredoraId, { texto, previo: previo ?? null });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  /** crea una propiedad ya confirmada y, si se dio, el propietario (queda en el CRM y vinculado). Nunca falla por el propietario. */
  async crear(u: UsuarioToken, entrada: PropiedadEntrada, propietario?: PropietarioDictado | { personaId: string } | null) {
    const o = { ...entrada };
    // sin operación dicha: venta si hay precio de venta o no hay precio de arriendo
    if (o.venta == null && o.arriendo == null) {
      o.venta = !!o.precioVenta || !o.precioArriendo;
      o.arriendo = !!o.precioArriendo;
    }
    const p = await this.propiedades.crear(u, o);
    let res: ResultadoPropietario = null;
    if (propietario) res = await this.registrarPropietario(u, p.id, propietario);
    return { propiedad: p, propietario: res };
  }

  /** crea desde lo que dejó dictar() (el cliente lo devuelve tal cual, quizá con correcciones) */
  async crearDesdeDictado(u: UsuarioToken, campos: Record<string, unknown>) {
    const c = normalizarCampos(campos);
    if (!c.tipo) throw new BadRequestException('Falta el tipo de propiedad (casa, departamento, oficina…).');
    if (!c.venta && !c.arriendo) throw new BadRequestException('Falta indicar si está en venta, en arriendo o ambas.');
    const malos = avisosDictado(c);
    // el RUT mal dictado no impide crear la propiedad: se crea el propietario sin RUT y se avisa
    const pr = c.propietario && malos.some((m) => /RUT/.test(m)) ? { ...c.propietario, rut: '' } : c.propietario;
    const r = await this.crear(u, aEntrada(c), pr);
    return { ...r, avisos: malos };
  }

  /** guarda al propietario dictado en el CRM y lo vincula a la propiedad. Nunca lanza: devuelve qué pasó */
  async registrarPropietario(
    u: UsuarioToken,
    propId: string,
    x: PropietarioDictado | { personaId: string },
  ): Promise<ResultadoPropietario> {
    try {
      if ('personaId' in x) {
        const c = await this.db.persona.findFirst({ where: { id: x.personaId, corredoraId: u.corredoraId, eliminadoEn: null } });
        if (!c) return { ok: false, nombre: '', motivo: 'esa persona no existe' };
        await this.propiedades.vincular(u, propId, { personaId: c.id, rol: 'propietario' });
        return { ok: true, nombre: c.nombre, rut: c.rutFormato ?? '' };
      }
      const pr = propietarioDe(x);
      if (!pr) return null;
      if (!pr.nombre) return { ok: false, nombre: '', motivo: 'falta el nombre del propietario' };
      if (pr.email && !emailOk(pr.email)) return { ok: false, nombre: pr.nombre, motivo: `el correo ${pr.email} no es válido` };
      if (pr.rut && !rutValido(pr.rut)) return { ok: false, nombre: pr.nombre, motivo: `el RUT ${pr.rut} no es válido` };
      // si ya está en el CRM (mismo RUT), se usa esa persona y se le suma el rol
      const existente = pr.rut
        ? await this.db.persona.findFirst({ where: { corredoraId: u.corredoraId, rut: limpiarRut(pr.rut), eliminadoEn: null } })
        : null;
      const c =
        existente ??
        ((await this.personas.crear(u, {
          nombre: pr.nombre,
          rut: pr.rut || null,
          email: pr.email || null,
          telefono: pr.telefono || null,
          roles: ['propietario'],
        })) as { id: string; nombre: string; rut: string });
      await this.propiedades.vincular(u, propId, { personaId: c.id, rol: 'propietario' });
      return { ok: true, nombre: c.nombre, rut: ('rutFormato' in c ? (c.rutFormato as string | null) : (c as { rut: string }).rut) ?? '' };
    } catch (e) {
      return { ok: false, nombre: 'nombre' in x ? String(x.nombre ?? '') : '', motivo: mensajeDe(e).replace(/\.$/, '') };
    }
  }

  // ------------------------------------------------------------------ cambios (ajustan el aviso del portal)

  /** cambia datos de una propiedad y deja al día su aviso en Portal Inmobiliario (precio, fotos, título, estado) */
  async cambiar(u: UsuarioToken, id: string, cambios: PropiedadEntrada) {
    const antes = await this.propiedades.obtener(u, id);
    const propiedad = await this.propiedades.actualizar(u, id, cambios);
    const portal = await this.portal.reaccionar(u, antes, propiedad);
    return { propiedad: portal.length ? await this.propiedades.obtener(u, id) : propiedad, portal };
  }

  /** estado comercial de una operación (disponible, reservada, vendida, arrendada, no_disponible) */
  async cambiarEstado(u: UsuarioToken, id: string, operacion: 'venta' | 'arriendo', estado: (typeof ESTADOS)[number]) {
    const p = await this.propiedades.obtener(u, id);
    if (!p[operacion]) throw new BadRequestException(`${p.codigo} no está en ${operacion}.`);
    return this.cambiar(u, id, { [operacion === 'venta' ? 'estadoVenta' : 'estadoArriendo']: estado });
  }

  // ------------------------------------------------------------------ ficha por bloques

  /** la propiedad como la mira la ficha: sus datos + el propietario vinculado (solo si este usuario puede verlo) */
  private async fichaDe(u: UsuarioToken, id: string) {
    const p = await this.propiedades.obtener(u, id);
    let propietario: FC.PropFicha['propietario'] = null;
    if (p.duenoVisible) {
      const v = p.vinculos.find((x) => x.rol === 'propietario');
      const c = v ? await this.db.persona.findFirst({ where: { id: v.personaId, eliminadoEn: null } }) : null;
      if (c) propietario = { nombre: c.nombre, telefono: c.telefono, rut: c.rutFormato, email: c.email };
    }
    return { p, ficha: { ...p, propietario, ocultarDueno: !p.duenoVisible } as FC.PropFicha };
  }

  /** qué le falta a la ficha, por bloques, y qué hay que pedir ahora */
  async fichaPendiente(u: UsuarioToken, id: string) {
    const { p, ficha } = await this.fichaDe(u, id);
    const sg = FC.siguiente(ficha);
    return {
      propiedad: { id: p.id, codigo: p.codigo, tipo: p.tipo },
      bloques: sg.av.map((b) => ({
        id: b.id,
        bloque: b.t,
        listo: b.listo,
        faltaClave: b.faltanClave,
        faltaOpcional: b.faltan.slice(0, 8),
        avance: `${b.completos}/${b.total}`,
      })),
      pedirAhora: sg.pedir,
      bloqueActual: sg.bloque ? { id: sg.bloque.id, nombre: sg.bloque.t } : null,
    };
  }

  /** cualquier dato dictado a la ficha (N° de depto, piso, orientación, equipamiento…): lo guarda y dice qué sigue faltando */
  async completarFicha(u: UsuarioToken, id: string, texto: string) {
    const { p } = await this.fichaDe(u, id);
    let r;
    try {
      r = await this.dictado.completar(u.corredoraId, { texto, p: { ...p } });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    let ficha = r.ficha;
    const avisos: string[] = [];
    // los datos del propietario solo los toca quien captó la propiedad o el administrador
    if (!p.duenoVisible && Object.keys(ficha).some((k) => DEL_DUENO.test(k))) {
      ficha = Object.fromEntries(Object.entries(ficha).filter(([k]) => !DEL_DUENO.test(k)));
      avisos.push('Los datos del propietario solo los edita quien captó la propiedad o el administrador: no se guardaron.');
    }
    const o = { ...r.plano, ...(Object.keys(ficha).length ? { ficha } : {}) } as PropiedadEntrada;
    if (!Object.keys(o).length)
      return { ok: false as const, guardado: [], dudas: r.dudas, avisos, portal: [], sigueFaltando: null, motivo: 'No encontré datos de la ficha en lo que dijo.' };
    const { portal } = await this.cambiar(u, id, o);
    const sg = FC.siguiente((await this.fichaDe(u, id)).ficha);
    return {
      ok: true as const,
      guardado: [...Object.keys(r.plano), ...Object.keys(ficha)].map((k) => FC.POR_ID[k]?.t || k),
      dudas: r.dudas,
      avisos,
      portal,
      sigueFaltando: sg.bloque ? { bloque: sg.bloque.t, pedir: sg.pedir } : null,
      motivo: null,
    };
  }
}

/** el texto de un error (de Nest o cualquiera) para mostrárselo al usuario */
export function mensajeDe(e: unknown): string {
  const r = (e as { getResponse?: () => unknown })?.getResponse?.();
  if (r && typeof r === 'object') {
    const m = (r as { message?: unknown }).message;
    if (Array.isArray(m)) return m.join('; ');
    if (typeof m === 'string') return m;
  }
  if (typeof r === 'string') return r;
  return (e as Error)?.message || 'No se pudo completar.';
}

const dictarEsquema = z.object({ texto: z.string().trim().min(1).max(8000), previo: z.record(z.string(), z.unknown()).nullish() });
const desdeDictadoEsquema = z.object({ campos: z.record(z.string(), z.unknown()) });
const completarEsquema = z.object({ texto: z.string().trim().min(1).max(8000) });
const estadoEsquema = z.object({ operacion: z.enum(['venta', 'arriendo']), estado: z.enum(ESTADOS) });

@Controller('propiedades')
export class PropiedadesAccionesController {
  constructor(private readonly s: PropiedadesAccionesService) {}

  @Post('dictar')
  @HttpCode(200)
  dictar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(dictarEsquema)) b: z.infer<typeof dictarEsquema>) {
    return this.s.dictar(u, b.texto, (b.previo ?? null) as CamposDictado | null);
  }

  @Post('desde-dictado')
  desdeDictado(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(desdeDictadoEsquema)) b: z.infer<typeof desdeDictadoEsquema>) {
    return this.s.crearDesdeDictado(u, b.campos);
  }

  @Get(':id/ficha-pendiente')
  fichaPendiente(@UsuarioActual() u: UsuarioToken, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.fichaPendiente(u, id);
  }

  @Post(':id/completar-ficha')
  @HttpCode(200)
  completar(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(completarEsquema)) b: z.infer<typeof completarEsquema>,
  ) {
    return this.s.completarFicha(u, id, b.texto);
  }

  @Put(':id/estado')
  estado(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(estadoEsquema)) b: z.infer<typeof estadoEsquema>,
  ) {
    return this.s.cambiarEstado(u, id, b.operacion, b.estado);
  }
}
