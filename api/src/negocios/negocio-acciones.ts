/* eslint-disable @typescript-eslint/no-explicit-any -- el negocio es un documento JSON libre (datos + columnas), igual que en la app */
// Acciones de un negocio (venta o arriendo) con SUS reglas, en el servidor: crear, mover de etapa, tareas, pasos, próxima acción, notas, cerrar y
// reabrir, firmas, pagos y comprobantes, factura de la comisión, aceptación del propietario, aprobación del contrato y postarriendo. La lógica
// vive aquí UNA sola vez (las reglas puras, en negocio-reglas.ts): los endpoints REST de abajo y las herramientas de WhatsApp
// (whatsapp/herramientas/negocios.ts) llaman a los mismos métodos. La app de escritorio es solo la parte visual.
//
//  · Permisos: el corredor solo toca sus negocios; el administrador, todos (buscarVisible → 404/403).
//  · Todo cambio sube la `version` del negocio (guardar() de NegociosService, con updateMany where version) y queda en el historial
//    (ActividadService) con el usuario. Con `version` en el cuerpo el cambio falla (409) si otra persona lo cambió antes; sin ella se reintenta
//    sobre lo último (2 veces).
//  · Efectos que el escritorio hacía al mover o cerrar: la propiedad pasa a reservada, vendida o arrendada (o vuelve a disponible) por la misma
//    ruta que el estado manual (PropiedadesAccionesService.cambiarEstado), así que el aviso de Portal Inmobiliario se pausa, reactiva o finaliza
//    igual (sin cuenta conectada no se ajusta nada y no falla).
//
// REST (todos bajo /v1/negocios, con la sesión de la app):
//   POST   acciones/crear                    { tipo, propiedadId, clienteId, valor?, comision?, etapa?, proximaAccion?, corredorId? }
//   GET    :id/acciones/ver                  la vista completa (etapa, pasos, documentos, pagos, historial)
//   POST   :id/acciones/mover                { etapa, motivo?, version? }
//   POST   :id/acciones/tarea                { etapa?, indice, hecha?, version? }
//   POST   :id/acciones/paso                 { paso, estado: ok|fail|pend|auto, detalle?, quien?, vence? }
//   POST   :id/acciones/proxima-accion       { texto (vacío = quitar), fecha? }
//   POST   :id/acciones/nota                 { texto }
//   POST   :id/acciones/condiciones          { valor?, comision?, oferta?, cierreEstimado?, comisionPagada? }
//   POST   :id/acciones/cerrar               { resultado: ganado|perdido, motivo? }
//   POST   :id/acciones/reabrir
//   POST   :id/acciones/vincular-firma       { operacion, etapa? }
//   POST   :id/acciones/firma-fuera          { etapa }
//   POST   :id/acciones/pago                 { tipo, monto, moneda, fecha, medio, nota?, referencia?, comprobante? | archivo? }
//   POST   :id/acciones/pago/quitar          { tipo: reserva|garantia|primer_mes|comision }
//   POST   :id/acciones/factura              { numero?, fecha, monto, moneda }
//   POST   :id/acciones/factura/quitar
//   POST   :id/acciones/aceptacion           { accion: acepta|contraoferta|rechaza|oferta, monto?, moneda?, garantia?, plazo?, condiciones?, nota? }
//   POST   :id/acciones/contrato/aprobar     { personaId? | todos?, aprobado? }
//   POST   :id/acciones/postarriendo         { tipo: reajuste|renovacion|devolucion|quitar_renovacion|quitar_devolucion, … }
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Negocio } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { ActividadService, type NuevaActividad } from '../comun/actividad.service';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { buscarVisible, fechaDia, idDoc } from '../comun/asignados';
import { AlmacenamientoService } from '../archivos/almacenamiento.service';
import { PropiedadesService } from '../propiedades/propiedades.service';
import { INCLUIR, propiedadApp, puedeVerDueno } from '../propiedades/propiedades.mapper';
import type { PropFicha } from '../propiedades/ficha-campos';
import { ahora as ahoraChile, hoy as hoyChile } from '../whatsapp/comun';
import { NegociosService, negocioApp } from './negocios';
import {
  ETAPAS_VALIDAS,
  FIRMAS_FUERA,
  MEDIO_PAGO,
  PASOS_CAPTACION,
  PASOS_POR_TIPO,
  TIPO_PAGO,
  documentos,
  estadoNegociacion,
  estadoObjetivo,
  etapa,
  etapas,
  fdm,
  fdmy,
  mas,
  montoTxt,
  normComision,
  normOferta,
  normProximaAccion,
  normValor,
  ofertaVigente,
  pasos,
  plazosContrato,
  vista,
  dia,
  type CtxPasos,
  type Doc,
  type FirmaCtx,
  type VisitaCtx,
} from './negocio-reglas';

const err = (m: string) => new BadRequestException(m);
const ahoraIso = () => new Date().toISOString();
const MB = 1024 * 1024;
const COMPROBANTE_MAX = 15 * MB;

/** lo que un cambio deja en el historial (negocio y, si hace falta, propiedad) */
interface Efecto {
  actividad?: string[];
  actividadProp?: string[];
}
/** el resultado de una acción: el negocio ya guardado y los avisos para el usuario */
export interface Resultado {
  negocio: Doc;
  avisos: string[];
}

// ---------------------------------------------------------------------------------------------------- esquemas REST
const version = z.number().int().positive().optional();
const moneda = z.enum(['UF', 'CLP', 'USD']);
const comprobanteEsquema = z.object({
  clave: z.string().max(400),
  nombre: z.string().max(200),
  tipo: z.string().max(120).default(''),
  bytes: z.number().int().min(0).default(0),
  fecha: z.string().max(40).optional(),
});
const crearEsquema = z.object({
  tipo: z.enum(['venta', 'arriendo']),
  propiedadId: z.uuid(),
  clienteId: z.uuid(),
  valor: z.object({ valor: z.coerce.number().min(0), moneda: moneda.optional() }).nullable().optional(),
  comision: z.object({ tipo: z.enum(['%', 'monto']).optional(), valor: z.coerce.number().min(0) }).nullable().optional(),
  etapa: z.enum(ETAPAS_VALIDAS as [string, ...string[]]).optional(),
  proximaAccion: z.object({ texto: z.string().trim().max(160), fecha: fechaDia.nullable().optional() }).nullable().optional(),
  /** solo el administrador (o, por WhatsApp, el que lo crea): a cargo de quién queda */
  corredorId: z.uuid().optional(),
});
const moverEsquema = z.object({ etapa: z.enum(ETAPAS_VALIDAS as [string, ...string[]]), motivo: z.string().trim().max(160).optional(), version });
const tareaEsquema = z.object({ etapa: z.string().max(40).optional(), indice: z.number().int().min(0).max(30), hecha: z.boolean().default(true), version });
const pasoEsquema = z.object({
  paso: z.string().max(40),
  estado: z.enum(['ok', 'fail', 'pend', 'auto']),
  detalle: z.string().max(240).default(''),
  quien: z.string().max(80).default(''),
  vence: fechaDia.nullable().optional(),
});
const proximaEsquema = z.object({ texto: z.string().trim().max(160), fecha: fechaDia.nullable().optional(), version });
const notaEsquema = z.object({ texto: z.string().trim().min(1).max(1000) });
const condicionesEsquema = z.object({
  valor: z.object({ valor: z.coerce.number().min(0), moneda: moneda.optional() }).nullable().optional(),
  comision: z.object({ tipo: z.enum(['%', 'monto']).optional(), valor: z.coerce.number().min(0) }).nullable().optional(),
  oferta: z.record(z.string(), z.unknown()).nullable().optional(),
  cierreEstimado: fechaDia.nullable().optional(),
  comisionPagada: z.object({ fecha: fechaDia }).nullable().optional(),
  version,
});
const cerrarEsquema = z.object({ resultado: z.enum(['ganado', 'perdido']), motivo: z.string().trim().max(300).optional(), version });
const vacioEsquema = z.object({ version }).default({});
const firmaEsquema = z.object({ operacion: z.coerce.number().int().positive(), etapa: z.string().max(40).optional() });
const firmaFueraEsquema = z.object({ etapa: z.string().max(40) });
const pagoEsquema = z.object({
  tipo: z.enum(['reserva', 'garantia', 'primer_mes', 'comision', 'otro']),
  monto: z.coerce.number().positive().max(1e12),
  moneda,
  fecha: fechaDia,
  medio: z.enum(['transferencia', 'deposito', 'efectivo', 'cheque', 'tarjeta', 'otro']),
  nota: z.string().trim().max(240).default(''),
  referencia: z.string().trim().max(80).default(''),
  /** el comprobante ya subido a R2 (la app lo sube con la subida firmada de registros) */
  comprobante: comprobanteEsquema.nullable().optional(),
  /** o el archivo mismo, en base64 */
  archivo: z.object({ nombre: z.string().max(200), mime: z.string().max(120).default('application/pdf'), base64: z.string().min(20) }).optional(),
});
const quitarPagoEsquema = z.object({ tipo: z.enum(['reserva', 'garantia', 'primer_mes', 'comision']) });
const facturaEsquema = z.object({ numero: z.string().trim().max(40).default(''), fecha: fechaDia, monto: z.coerce.number().positive().max(1e12), moneda });
const aceptacionEsquema = z.object({
  accion: z.enum(['acepta', 'contraoferta', 'rechaza', 'oferta']),
  monto: z.coerce.number().positive().optional(),
  moneda: moneda.optional(),
  garantia: z.string().trim().max(120).default(''),
  plazo: z.string().trim().max(80).default(''),
  condiciones: z.string().trim().max(800).default(''),
  nota: z.string().trim().max(400).default(''),
  version,
});
const contratoAprobarEsquema = z.object({ personaId: z.string().max(80).optional(), todos: z.boolean().optional(), aprobado: z.boolean().default(true) });
const postEsquema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('reajuste'), desde: fechaDia.optional(), ipc: z.coerce.number().min(-50).max(100), rentaNueva: z.coerce.number().positive().optional() }),
  z.object({ tipo: z.literal('renovacion'), decision: z.enum(['renovar', 'termino']), meses: z.coerce.number().int().min(1).max(600).optional(), nota: z.string().trim().max(400).default('') }),
  z.object({
    tipo: z.literal('devolucion'),
    fechaRecepcion: fechaDia,
    conforme: z.boolean().default(true),
    descuento: z.coerce.number().min(0).default(0),
    motivo: z.string().trim().max(300).default(''),
    fechaDevolucion: fechaDia,
    comprobante: comprobanteEsquema.nullable().optional(),
    archivo: z.object({ nombre: z.string().max(200), mime: z.string().max(120).default('application/pdf'), base64: z.string().min(20) }).optional(),
  }),
  z.object({ tipo: z.literal('quitar_renovacion') }),
  z.object({ tipo: z.literal('quitar_devolucion') }),
]);

export type CrearEntrada = z.infer<typeof crearEsquema>;
export type PagoEntrada = z.infer<typeof pagoEsquema>;
export type AceptacionEntrada = z.infer<typeof aceptacionEsquema>;
export type PostEntrada = z.infer<typeof postEsquema>;
export type ArchivoEntrada = { nombre: string; mime: string; bytes: Buffer };

@Injectable()
export class NegocioAccionesService {
  constructor(
    private readonly db: PrismaService,
    private readonly negocios: NegociosService,
    private readonly actividad: ActividadService,
    private readonly propiedades: PropiedadesService,
    private readonly r2: AlmacenamientoService,
    private readonly modulo: ModuleRef,
  ) {}

  // ================================================================================================ base: leer, mutar, contexto
  private async cargar(u: UsuarioToken, id: string): Promise<Negocio> {
    return buscarVisible(this.db.negocio, u, id, 'El negocio');
  }

  private async anotar(u: UsuarioToken, n: Doc, ef: Efecto) {
    const filas: NuevaActividad[] = [
      ...(ef.actividad ?? []).map((texto) => ({ corredoraId: u.corredoraId, entidadTipo: 'negocio' as const, entidadId: n.id, ref2: n.propId ?? null, texto, usuarioId: u.sub })),
      ...(ef.actividadProp ?? []).map((texto) => ({ corredoraId: u.corredoraId, entidadTipo: 'propiedad' as const, entidadId: n.propId, ref2: n.id, texto, usuarioId: u.sub })),
    ];
    if (filas.length) await this.actividad.registrar(filas).catch(() => null);
  }

  /**
   * Lee el negocio, le aplica `fn` (que solo cambia el documento y devuelve qué dejar en el historial; no escribe en la base) y lo guarda
   * respetando la versión. Con `version` falla si cambió; sin ella reintenta con lo último (2 veces).
   */
  private async mutar(u: UsuarioToken, id: string, fn: (n: Doc, fila: Negocio) => Efecto | void | Promise<Efecto | void>, version?: number): Promise<Doc> {
    for (let intento = 0; ; intento++) {
      const fila = await this.cargar(u, id);
      if (version && version !== fila.version) throw new ConflictException({ message: 'Otra persona cambió el negocio recién.', code: 'VERSION' });
      const n: Doc = structuredClone(negocioApp(fila));
      const ef = (await fn(n, fila)) || {};
      n.actualizado = ahoraIso();
      let guardado: Doc;
      try {
        guardado = (await this.negocios.guardar(u, id, { ...n, version: fila.version } as any)) as Doc;
      } catch (e) {
        const codigo = e instanceof ConflictException ? (e.getResponse() as { code?: string })?.code : null;
        if (codigo === 'VERSION' && !version && intento < 2) continue;
        throw e;
      }
      await this.anotar(u, guardado, ef);
      return guardado;
    }
  }

  /** lo que hace falta de afuera (propiedad, firmas, agenda, cliente) para deducir los pasos y los documentos */
  async contexto(u: UsuarioToken, n: Doc): Promise<CtxPasos> {
    const corredoraId = u.corredoraId;
    const [p, firmas, visitas, cli] = await Promise.all([
      n.propId ? this.db.propiedad.findFirst({ where: { id: n.propId, corredoraId }, include: INCLUIR }) : null,
      this.db.firma.findMany({
        where: { corredoraId, eliminadoEn: null, OR: [{ negocioId: n.id }, ...(n.propId ? [{ propiedadIds: { has: n.propId as string } }] : [])] },
        orderBy: { enviadoEn: 'desc' },
        take: 200,
      }),
      n.propId ? this.db.evento.findMany({ where: { corredoraId, eliminadoEn: null, tipo: 'visita', propiedadId: n.propId }, orderBy: [{ fecha: 'asc' }, { hora: 'asc' }], take: 200 }) : [],
      n.clienteId ? this.db.persona.findFirst({ where: { id: n.clienteId, corredoraId }, select: { nombre: true, rut: true, rutFormato: true } }) : null,
    ]);
    // la propiedad como la mira la ficha (con el propietario vinculado si este usuario puede verlo): de ahí salen los bloques de la captación
    let ficha: PropFicha | null = null;
    if (p) {
      const visible = puedeVerDueno(u, p);
      const v = visible ? p.vinculos.find((x) => x.rol === 'propietario') : null;
      const dueno = v ? await this.db.persona.findFirst({ where: { id: v.personaId, eliminadoEn: null } }) : null;
      ficha = {
        ...propiedadApp(p, u),
        propietario: dueno ? { nombre: dueno.nombre, telefono: dueno.telefono, rut: dueno.rutFormato, email: dueno.email } : null,
        ocultarDueno: !visible,
      } as PropFicha;
    }
    const portales = (p?.portales ?? {}) as Record<string, Record<string, { status?: string } | undefined>>;
    const publicada = Object.values(portales).some((x) => Object.values(x || {}).some((a) => a && ['active', 'en_feed', 'publicada'].includes(String(a.status))));
    return {
      prop: p
        ? { id: p.id, codigo: p.codigo, titulo: p.titulo, comuna: p.comuna, venta: p.venta, arriendo: p.arriendo, estadoVenta: p.estadoVenta, estadoArriendo: p.estadoArriendo, fotos: p.fotos.length, publicada, ficha, creado: p.creadoEn.toISOString() }
        : null,
      firmasProp: firmas.map(
        (f): FirmaCtx => ({
          plantilla: f.documento,
          estado: f.estado,
          operacion: f.operacion,
          fecha: f.enviadoEn.toISOString(),
          firmado: f.firmadoEn?.toISOString() ?? null,
          negocioId: f.negocioId,
          firmantes: ((f.firmantes as any[]) ?? []).map((s) => ({ personaId: s?.personaId, rut: s?.rut })),
        }),
      ),
      visitas: visitas.map(
        (e): VisitaCtx => ({
          fecha: e.fecha.toISOString().slice(0, 10),
          hora: e.hora,
          estado: e.estado,
          negocioId: e.negocioId,
          personaIds: e.personaIds,
          confirmacion: ((e.datos as any)?.confirmacion ?? null) as VisitaCtx['confirmacion'],
        }),
      ),
      clienteNombre: cli?.nombre ?? null,
      clienteRut: cli?.rutFormato || cli?.rut || null,
      hoy: hoyChile(),
      ahora: ahoraChile(),
    };
  }

  /**
   * La propiedad cambia de estado según la etapa más avanzada de sus negocios (reservada / vendida / arrendada) o vuelve a disponible si
   * se cayó el negocio. Usa la misma ruta que el estado manual de la propiedad (PropiedadesAccionesService.cambiarEstado): el aviso de Portal
   * Inmobiliario se pausa, reactiva o finaliza igual que en el escritorio. Devuelve los avisos («PF-1001 quedó reservada.», «Aviso de venta
   * pausado en Portal Inmobiliario.»). Sin cuenta de portal conectada no se ajusta el aviso y no falla.
   */
  async aplicarEstado(u: UsuarioToken, n: Doc): Promise<string[]> {
    if (!n.propId) return [];
    const p = await this.db.propiedad.findFirst({ where: { id: n.propId, corredoraId: u.corredoraId, eliminadoEn: null } });
    if (!p || !(n.tipo === 'venta' ? p.venta : p.arriendo)) return [];
    const campo = n.tipo === 'venta' ? 'estadoVenta' : 'estadoArriendo';
    const hermanos = await this.db.negocio.findMany({
      where: { corredoraId: u.corredoraId, propiedadId: p.id, tipo: n.tipo, eliminadoEn: null, estado: { in: ['abierto', 'ganado'] } },
    });
    const objetivo = estadoObjetivo(n.tipo, hermanos.map((h) => negocioApp(h)), p[campo]);
    if (!objetivo) return [];
    const avisos = [`${p.codigo} quedó ${objetivo}.`];
    const acciones = await this.accionesPropiedad();
    if (acciones) {
      const r = await acciones.cambiarEstado(u, p.id, n.tipo as 'venta' | 'arriendo', objetivo as any);
      avisos.push(...r.portal);
    } else {
      await this.propiedades.actualizar(u, p.id, { [campo]: objetivo } as any);
    }
    await this.anotar(u, n, { actividad: [`La propiedad quedó ${objetivo}`] });
    return avisos;
  }

  /** el servicio de propiedades (con el ajuste del portal); se pide al módulo al usarlo para no atar los módulos en círculo */
  private async accionesPropiedad() {
    try {
      const { PropiedadesAccionesService } = await import('../propiedades/propiedades-acciones.js');
      return this.modulo.get(PropiedadesAccionesService, { strict: false });
    } catch {
      return null;
    }
  }

  // ================================================================================================ lectura
  /** La vista completa de un negocio: etapa, lo que falta, pasos con su estado, documentos, pagos, negociación e historial reciente. */
  async ver(u: UsuarioToken, id: string) {
    const n = negocioApp(await this.cargar(u, id)) as Doc;
    const ctx = await this.contexto(u, n);
    const v = vista(n, ctx.hoy);
    const ps = pasos(n, ctx);
    const capt = ctx.prop ? pasos(null, ctx, 'captacion') : null;
    const neg = estadoNegociacion(n);
    const c = n.ciclo || {};
    const tareas = (v.etapaInfo?.tareas || []).map((t, i) => ({ n: i + 1, texto: t, hecha: !!n.tareas?.[n.etapa]?.[i] }));
    const hist = await this.actividad.de(u.corredoraId, id, 12);
    return {
      id: n.id,
      codigo: n.codigo ?? null,
      version: n.version,
      tipo: n.tipo,
      estado: n.estado,
      etapa: { id: n.etapa, nombre: v.etapaInfo?.t ?? n.etapa, numero: v.orden + 1, de: v.total, diasEnEtapa: v.diasEnEtapa, firma: v.etapaInfo?.firma ?? null },
      propiedad: ctx.prop ? { id: ctx.prop.id, codigo: ctx.prop.codigo, titulo: ctx.prop.titulo, comuna: ctx.prop.comuna, estado: n.tipo === 'venta' ? ctx.prop.estadoVenta : ctx.prop.estadoArriendo } : null,
      cliente: n.clienteId ? { id: n.clienteId, nombre: ctx.clienteNombre, rut: ctx.clienteRut } : null,
      corredor: n.corredor || null,
      valor: n.valor ?? null,
      comision: n.comision ?? null,
      comisionMonto: v.comisionMonto,
      proximaAccion: n.proximaAccion ?? null,
      vencida: v.vencida,
      cierreEstimado: n.cierreEstimado ?? null,
      cierre: n.estado === 'abierto' ? null : { fecha: typeof n.cierre === 'string' ? n.cierre : null, motivoPerdida: n.motivoPerdida ?? null },
      falta: v.siguiente,
      tareas,
      pasos: { etapas: ps.etapas.map((e) => ({ id: e.id, nombre: e.nombre, aviso: e.aviso, logrados: e.ok, de: e.total, actual: e.actual, pasos: e.pasos.map((x) => ({ id: x.id, nombre: x.t, estado: x.e, detalle: x.d || null, esperando: x.q === 'otro' ? x.quien || 'otra persona' : null, vence: x.vence, manual: x.manual })) })), siguiente: ps.actual ? { id: ps.actual.id, nombre: ps.actual.t, etapa: ps.actual.etapa, estado: ps.actual.e, detalle: ps.actual.d || null } : null },
      captacion: capt
        ? { logrados: capt.etapas[0].ok, de: capt.etapas[0].total, siguiente: capt.actual ? { id: capt.actual.id, nombre: capt.actual.t, estado: capt.actual.e, detalle: capt.actual.d || null } : null, pasos: capt.etapas[0].pasos.map((x) => ({ id: x.id, nombre: x.t, estado: x.e, detalle: x.d || null, esperando: x.q === 'otro' ? x.quien || 'otra persona' : null })) }
        : null,
      documentos: documentos(n, ctx),
      pagos: {
        reserva: c.pagos?.reserva ?? null,
        garantia: c.pagos?.garantia ?? null,
        primerMes: c.pagos?.primerMes ?? null,
        comision: { facturaFecha: c.comision?.facturaFecha ?? null, factura: c.comision?.factura ?? null, pago: c.comision?.pago ?? null },
        otros: (c.comprobantes || []).slice(-5),
      },
      negociacion: { rondas: neg.rondas.length, ultima: neg.ultima ?? null, vigente: ofertaVigente(n), final: neg.final, esperaInteresado: neg.esperaInteresado },
      contrato: (() => {
        const k = c.contrato;
        const ult = (k?.versiones || []).slice(-1)[0];
        return ult ? { version: ult.n, firmantes: (ult.firmantes || []).map((q: any) => ({ personaId: q.personaId, nombre: q.nombre, aprobo: !!k.aprobado?.[q.personaId] })) } : null;
      })(),
      postarriendo: (() => {
        const pc = n.tipo === 'arriendo' ? plazosContrato(n) : null;
        return pc ? { termino: pc.termino, avisarHasta: pc.limite, reajusteIpc: pc.periodo ? `cada ${pc.periodo} meses` : null, proximoReajuste: pc.periodo && pc.proximo < pc.termino ? pc.proximo : null, rentaActual: pc.renta, reajustes: pc.reajustes.length, renovacion: pc.reno ?? null, devolucion: pc.dev ?? null } : null;
      })(),
      historial: hist.slice(0, 8).map((x) => `${x.fecha.slice(0, 10)} ${x.texto}`),
    };
  }

  // ================================================================================================ crear
  /**
   * Crea un negocio (el servidor le da su código NG-XXX). REGLA: todo negocio necesita propiedad e interesado; la propiedad debe estar en venta
   * (o arriendo) según el tipo. Comisión por defecto: 2 % en venta y 50 % en arriendo; precio por defecto: el de la ficha.
   */
  async crear(u: UsuarioToken, o: CrearEntrada): Promise<Resultado> {
    const p = await this.db.propiedad.findFirst({ where: { id: o.propiedadId, corredoraId: u.corredoraId, eliminadoEn: null } });
    if (!p) throw new NotFoundException('La propiedad no existe.');
    if (!(o.tipo === 'venta' ? p.venta : p.arriendo)) throw err(`La propiedad no está en ${o.tipo}. Márcala en su ficha primero.`);
    const c = await this.db.persona.findFirst({ where: { id: o.clienteId, corredoraId: u.corredoraId, eliminadoEn: null } });
    if (!c) throw new NotFoundException(`Elige al ${o.tipo === 'venta' ? 'comprador' : 'arrendatario'}: esa persona no existe.`);
    const repetido = await this.db.negocio.findFirst({ where: { corredoraId: u.corredoraId, propiedadId: p.id, clienteId: c.id, tipo: o.tipo, estado: 'abierto', eliminadoEn: null } });
    if (repetido) throw err(`Ya hay un negocio de ${o.tipo} abierto de ${c.nombre} en ${p.codigo} (${(repetido.datos as any)?.codigo ?? repetido.id}).`);
    const precio = o.tipo === 'venta' ? p.precioVenta : p.precioArriendo;
    const monedaFicha = o.tipo === 'venta' ? p.monedaVenta : p.monedaArriendo;
    const valor = o.valor !== undefined ? normValor(o.valor) : precio ? { valor: Number(precio), moneda: monedaFicha ?? 'UF' } : null;
    const comision = normComision(o.comision ?? { tipo: '%', valor: o.tipo === 'venta' ? 2 : 50 });
    const ini = etapas(o.tipo).some((e) => e.id === o.etapa) ? (o.etapa as string) : 'interes';
    const yo = await this.db.usuario.findUnique({ where: { id: o.corredorId ?? u.sub }, select: { id: true, nombre: true } });
    const ahora = ahoraIso();
    const id = 'n' + Date.now().toString(36) + randomBytes(2).toString('hex');
    const doc: Doc = {
      tipo: o.tipo,
      estado: 'abierto',
      etapa: ini,
      etapaDesde: ahora,
      tareas: { interes: [true] }, // el cliente ya quedó registrado con su RUT
      firmas: {},
      creado: ahora,
      actualizado: ahora,
      propId: p.id,
      clienteId: c.id,
      corredorId: yo?.id ?? u.sub,
      corredor: yo?.nombre ?? '',
      valor,
      comision,
      proximaAccion: normProximaAccion(o.proximaAccion),
    };
    const creado = (await this.negocios.guardar(u, id, doc as any)) as Doc;
    await this.anotar(u, creado, {
      actividad: [`Negocio de ${o.tipo} creado en etapa «${etapa(o.tipo, ini)!.t}»`],
      actividadProp: [`Nuevo negocio de ${o.tipo} con ${c.nombre}`],
    });
    // el cliente queda vinculado a la propiedad con su rol
    await this.propiedades.vincular(u, p.id, { personaId: c.id, rol: o.tipo === 'venta' ? 'comprador' : 'arrendatario' }).catch(() => null);
    const avisos = await this.aplicarEstado(u, creado);
    return { negocio: creado, avisos };
  }

  // ================================================================================================ etapas, tareas, pasos
  async mover(u: UsuarioToken, id: string, o: z.infer<typeof moverEsquema>): Promise<Resultado> {
    let igual = false;
    const n = await this.mutar(
      u,
      id,
      (n) => {
        igual = false;
        if (n.estado !== 'abierto') throw err('El negocio está cerrado. Reábrelo para moverlo.');
        const e = etapa(n.tipo, o.etapa);
        if (!e) throw err(`La etapa «${o.etapa}» no existe en un negocio de ${n.tipo}.`);
        if (n.etapa === o.etapa) {
          igual = true;
          return;
        }
        const desde = etapa(n.tipo, n.etapa);
        n.etapa = o.etapa;
        n.etapaDesde = ahoraIso();
        return { actividad: [`${o.motivo || 'Movido'}: de «${desde?.t ?? '—'}» a «${e.t}»`] };
      },
      o.version,
    );
    return { negocio: n, avisos: igual ? [] : await this.aplicarEstado(u, n) };
  }

  /** marca o desmarca una tarea de una etapa (por defecto la actual) */
  async tarea(u: UsuarioToken, id: string, o: z.infer<typeof tareaEsquema>): Promise<Resultado> {
    const n = await this.mutar(
      u,
      id,
      (n) => {
        const etId = o.etapa || n.etapa;
        const et = etapa(n.tipo, etId);
        if (!et) throw err(`La etapa «${etId}» no existe en un negocio de ${n.tipo}.`);
        if (o.indice >= et.tareas.length) throw err(`La etapa «${et.t}» tiene estas tareas: ${et.tareas.map((t, i) => `${i + 1}. ${t}`).join(' | ')}.`);
        n.tareas ||= {};
        const l: boolean[] = Array.isArray(n.tareas[etId]) ? [...n.tareas[etId]] : [];
        while (l.length <= o.indice) l.push(false);
        l[o.indice] = !!o.hecha;
        n.tareas[etId] = l.map(Boolean);
        return o.hecha ? { actividad: [`Hecho: ${et.tareas[o.indice]}`] } : undefined;
      },
      o.version,
    );
    return { negocio: n, avisos: [] };
  }

  /** marca a mano un paso: logrado, no logrado, pendiente (con a quién se espera y plazo) o vuelve a lo automático */
  async paso(u: UsuarioToken, id: string, o: z.infer<typeof pasoEsquema>): Promise<Resultado> {
    if (PASOS_CAPTACION.includes(o.paso) && !Object.values(PASOS_POR_TIPO).some((l) => l.some((d) => d.id === o.paso))) throw err('Ese paso es de la captación de la propiedad, no del negocio: se marca en la propiedad.');
    const n = await this.mutar(u, id, (n) => {
      const def = PASOS_POR_TIPO[n.tipo as 'venta' | 'arriendo']?.find((x) => x.id === o.paso);
      if (!def) throw err(`No conozco el paso «${o.paso}» en un negocio de ${n.tipo}: ${(PASOS_POR_TIPO[n.tipo as 'venta' | 'arriendo'] || []).map((x) => x.id).join(', ')}.`);
      const estado = o.estado === 'auto' ? null : o.estado;
      n.pasos ||= {};
      if (estado == null) delete n.pasos[o.paso];
      else n.pasos[o.paso] = { e: estado, f: estado === 'ok' ? ahoraIso() : null, d: String(o.detalle || '').slice(0, 240), quien: String(o.quien || '').slice(0, 80), vence: dia(o.vence) };
      if (estado === 'ok') {
        // las tareas que el paso representa quedan marcadas
        if (def.tarea) {
          n.tareas ||= {};
          n.tareas[def.tarea[0]] ||= [];
          n.tareas[def.tarea[0]][def.tarea[1]] = true;
        }
        if (def.tareas) {
          n.tareas ||= {};
          n.tareas[def.tareas[0]] ||= [];
          for (const i of def.tareas[1]) n.tareas[def.tareas[0]][i] = true;
        }
      }
      if (estado === 'pend' && o.vence) n.proximaAccion = { texto: o.detalle || def.t, fecha: o.vence };
      const texto =
        estado === 'ok'
          ? `Paso logrado: ${def.t}`
          : estado === 'fail'
            ? `Paso no logrado: ${def.t}${o.detalle ? ' · ' + o.detalle : ''}`
            : estado === 'pend'
              ? `${def.t}: ${o.quien ? 'esperando a ' + o.quien : 'pendiente'}${o.vence ? ' (plazo ' + fdm(o.vence) + ')' : ''}`
              : `${def.t}: vuelve a lo automático`;
      return { actividad: [texto] };
    });
    return { negocio: n, avisos: [] };
  }

  /** la próxima acción del negocio, con fecha (texto vacío la quita) */
  async proximaAccion(u: UsuarioToken, id: string, o: z.infer<typeof proximaEsquema>): Promise<Resultado> {
    const n = await this.mutar(
      u,
      id,
      (n) => {
        const antes = n.proximaAccion?.texto;
        n.proximaAccion = normProximaAccion({ texto: o.texto, fecha: o.fecha });
        if (n.proximaAccion?.texto && n.proximaAccion.texto !== antes) return { actividad: [`Próxima acción: ${n.proximaAccion.texto}${n.proximaAccion.fecha ? ' (' + n.proximaAccion.fecha + ')' : ''}`] };
      },
      o.version,
    );
    return { negocio: n, avisos: [] };
  }

  /** una nota en el historial del negocio (no cambia el negocio ni su versión) */
  async nota(u: UsuarioToken, id: string, texto: string) {
    const fila = await this.cargar(u, id);
    const t = String(texto || '').trim();
    if (!t) throw err('Escribe la nota.');
    await this.actividad.registrar({ corredoraId: u.corredoraId, entidadTipo: 'negocio', entidadId: id, ref2: fila.propiedadId, tipo: 'nota', texto: t.slice(0, 600), usuarioId: u.sub });
    return { ok: true };
  }

  /** valor, comisión, condiciones de la oferta y fechas del negocio */
  async condiciones(u: UsuarioToken, id: string, o: z.infer<typeof condicionesEsquema>): Promise<Resultado> {
    const n = await this.mutar(
      u,
      id,
      (n) => {
        if (o.valor !== undefined) n.valor = normValor(o.valor);
        if (o.comision !== undefined) n.comision = normComision(o.comision);
        if (o.oferta !== undefined) n.oferta = o.oferta ? normOferta(o.oferta, n.oferta) : null;
        if (o.cierreEstimado !== undefined) n.cierreEstimado = dia(o.cierreEstimado);
        if (o.comisionPagada !== undefined) n.comisionPagada = dia(o.comisionPagada?.fecha) ? { fecha: o.comisionPagada!.fecha } : null;
        return { actividad: ['Condiciones actualizadas'] };
      },
      o.version,
    );
    return { negocio: n, avisos: [] };
  }

  // ================================================================================================ cerrar y reabrir
  async cerrar(u: UsuarioToken, id: string, o: z.infer<typeof cerrarEsquema>): Promise<Resultado> {
    if (o.resultado === 'perdido' && !String(o.motivo || '').trim()) throw err('Indica por qué se perdió el negocio.');
    const n = await this.mutar(
      u,
      id,
      (n) => {
        if (n.estado !== 'abierto') throw err(`El negocio ya está cerrado (${n.estado}). Reábrelo si quieres cambiarlo.`);
        n.estado = o.resultado;
        n.cierre = ahoraIso();
        n.motivoPerdida = o.resultado === 'perdido' ? String(o.motivo).trim() : null;
        if (o.resultado === 'ganado') n.etapa = etapas(n.tipo).at(-1)!.id;
        return {
          actividad: [o.resultado === 'ganado' ? 'Negocio cerrado con éxito' : `Negocio perdido: ${n.motivoPerdida}`],
          actividadProp: [o.resultado === 'ganado' ? `Negocio de ${n.tipo} cerrado con éxito` : `Se cayó un negocio de ${n.tipo}: ${n.motivoPerdida}`],
        };
      },
      o.version,
    );
    return { negocio: n, avisos: await this.aplicarEstado(u, n) };
  }

  async reabrir(u: UsuarioToken, id: string, o: { version?: number } = {}): Promise<Resultado> {
    const n = await this.mutar(
      u,
      id,
      (n) => {
        if (n.estado === 'abierto') throw err('El negocio ya está abierto.');
        n.estado = 'abierto';
        n.cierre = null;
        n.motivoPerdida = null;
        n.etapaDesde = ahoraIso();
        return { actividad: ['Negocio reabierto'] };
      },
      o.version,
    );
    return { negocio: n, avisos: await this.aplicarEstado(u, n) };
  }

  // ================================================================================================ firmas
  /** liga la operación de firma de Portalfirma a la etapa (por defecto la actual); al firmarse, la ronda del servidor la detecta */
  async vincularFirma(u: UsuarioToken, id: string, o: z.infer<typeof firmaEsquema>): Promise<Resultado> {
    const op = Number(String(o.operacion).replace(/\D/g, ''));
    if (!op) throw err('Indica un número de operación válido.');
    const n = await this.mutar(u, id, (n) => {
      const etId = o.etapa || n.etapa;
      const e = etapa(n.tipo, etId) || FIRMAS_FUERA[etId] || null;
      if (!e?.firma) throw err(`La etapa «${etId}» no requiere firma. Indica la etapa del documento (en un arriendo: oferta, reserva, contrato o entrega_acta).`);
      n.firmas ||= {};
      n.firmas[etId] = { operacion: op, estado: 'en_firma', firmados: 0, total: 0, revisado: null };
      return { actividad: [`${e.firma}: operación ${op} vinculada`] };
    });
    return { negocio: n, avisos: [] };
  }

  /** firmado fuera de Asset (papel u otra plataforma): la etapa queda cumplida igual */
  async firmaFuera(u: UsuarioToken, id: string, o: z.infer<typeof firmaFueraEsquema>): Promise<Resultado> {
    const n = await this.mutar(u, id, (n) => {
      const e = etapa(n.tipo, o.etapa);
      if (!e?.firma) throw err('Esta etapa no requiere firma.');
      n.firmas ||= {};
      n.firmas[o.etapa] = { operacion: null, estado: 'firmado', fuera: true, firmado: ahoraIso() };
      return { actividad: [`${e.firma}: firmado fuera de Asset`] };
    });
    return { negocio: n, avisos: [] };
  }

  /**
   * Cuando la revisión de firmas del servidor (ronda.ts) deja una firma con `avanzar`, el negocio avanza solo: a la etapa siguiente, o se cierra
   * ganado si era la última (el acta de entrega del arriendo solo deja la propiedad arrendada). Sin sesión: actúa con el corredor a cargo.
   */
  async avanzarPorFirma(corredoraId: string, negocioId: string, etapaId: string): Promise<Resultado | null> {
    const fila = await this.db.negocio.findFirst({ where: { id: negocioId, corredoraId, eliminadoEn: null } });
    if (!fila) return null;
    const u: UsuarioToken = { sub: fila.corredorId ?? fila.creadoPorId ?? '', corredoraId, rol: 'ADMIN', sid: '' };
    const n0 = negocioApp(fila) as Doc;
    const f = n0.firmas?.[etapaId];
    if (!f?.avanzar) return null;
    const n = await this.mutar(u, negocioId, (n) => {
      delete n.firmas[etapaId].avanzar;
    });
    if (etapaId === 'entrega_acta') return { negocio: n, avisos: await this.aplicarEstado(u, n) };
    if (n.estado !== 'abierto' || n.etapa !== etapaId || f.estado !== 'firmado') return { negocio: n, avisos: [] };
    const lst = etapas(n.tipo);
    const idx = lst.findIndex((x) => x.id === etapaId);
    if (idx < 0) return { negocio: n, avisos: [] };
    const e = lst[idx];
    return e.final || idx === lst.length - 1
      ? this.cerrar(u, negocioId, { resultado: 'ganado' })
      : this.mover(u, negocioId, { etapa: lst[idx + 1].id, motivo: 'Avanzó solo al firmarse el documento' });
  }

  // ================================================================================================ comprobantes y pagos
  /** sube un comprobante (PDF o foto) a R2 en la carpeta de archivos del negocio: la misma que lee la app (registros › archivos_negocio) */
  async subirComprobante(u: UsuarioToken, id: string, a: ArchivoEntrada) {
    await this.cargar(u, id);
    if (a.bytes.length > COMPROBANTE_MAX) throw err('El comprobante pesa más de 15 MB.');
    const pdf = a.bytes.subarray(0, 4).toString() === '%PDF';
    if (!pdf && !/^image\//i.test(a.mime)) throw err('El comprobante tiene que ser un PDF o una imagen.');
    const ext = (a.nombre.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? (pdf ? 'pdf' : 'jpg')).toLowerCase();
    const clave = `${this.carpeta(u, id)}${randomUUID()}.${ext}`;
    await this.r2.subir(clave, a.bytes, pdf ? 'application/pdf' : a.mime);
    return { clave, nombre: String(a.nombre).slice(0, 200), tipo: pdf ? 'application/pdf' : a.mime, bytes: a.bytes.length, fecha: ahoraIso() };
  }
  private carpeta = (u: UsuarioToken, id: string) => `c/${u.corredoraId}/r/archivos_negocio/todos/${id}/`;

  private async comprobanteDe(u: UsuarioToken, id: string, o: { comprobante?: z.infer<typeof comprobanteEsquema> | null; archivo?: { nombre: string; mime: string; base64: string } }) {
    if (o.archivo) return this.subirComprobante(u, id, { nombre: o.archivo.nombre, mime: o.archivo.mime, bytes: Buffer.from(o.archivo.base64.replace(/^data:[^,]*,/, ''), 'base64') });
    if (o.comprobante) {
      if (!o.comprobante.clave.startsWith(this.carpeta(u, id))) throw err('Ese archivo no es de este negocio.');
      return { clave: o.comprobante.clave, nombre: o.comprobante.nombre, tipo: o.comprobante.tipo, bytes: o.comprobante.bytes, fecha: o.comprobante.fecha ?? ahoraIso() };
    }
    return null;
  }

  /**
   * Registra un pago con su monto, fecha y comprobante. En un arriendo: reserva, garantía, primer mes o comisión van a su lugar del ciclo («otro»
   * queda en la lista de comprobantes); en una venta todo es «otro». Efectos: la reserva mueve el negocio a «Reserva» (la propiedad queda
   * reservada) si estaba antes; el pago de la comisión lo cierra como ganado y parte el postarriendo.
   */
  async pago(u: UsuarioToken, id: string, o: PagoEntrada): Promise<Resultado & { reemplazo: boolean }> {
    const previo = negocioApp(await this.cargar(u, id)) as Doc;
    if (previo.tipo === 'venta' && o.tipo !== 'otro') throw err('En una venta el comprobante se guarda como «otro»: no hay reserva, garantía ni primer mes.');
    const comprobante = await this.comprobanteDe(u, id, o);
    const nota = [o.referencia ? `Ref. ${o.referencia}` : '', o.medio === 'deposito' ? 'Depósito' : '', o.nota].filter(Boolean).join(' · ').slice(0, 240);
    const pago = { monto: Number(o.monto), moneda: o.moneda, fecha: o.fecha, medio: o.medio === 'deposito' ? 'otro' : o.medio, nota, comprobante };
    let reemplazo = false;
    const n = await this.mutar(u, id, (n) => {
      const ciclo = JSON.parse(JSON.stringify(n.ciclo || {}));
      const arr = n.tipo === 'arriendo';
      reemplazo = arr && !!({ reserva: ciclo.pagos?.reserva, garantia: ciclo.pagos?.garantia, primer_mes: ciclo.pagos?.primerMes, comision: ciclo.comision?.pago } as Record<string, unknown>)[o.tipo];
      if (arr && o.tipo === 'reserva') ciclo.pagos = { ...(ciclo.pagos || {}), reserva: pago };
      else if (arr && o.tipo === 'garantia') ciclo.pagos = { ...(ciclo.pagos || {}), garantia: pago };
      else if (arr && o.tipo === 'primer_mes') ciclo.pagos = { ...(ciclo.pagos || {}), primerMes: pago };
      else if (arr && o.tipo === 'comision') ciclo.comision = { ...(ciclo.comision || {}), pago };
      else ciclo.comprobantes = [...(ciclo.comprobantes || []), { tipo: 'otro', ...pago, referencia: o.referencia || '' }].slice(-60);
      n.ciclo = ciclo;
      return { actividad: [`Pago registrado: ${TIPO_PAGO[o.tipo]} · ${montoTxt(o.monto, o.moneda)} (${MEDIO_PAGO[o.medio] || o.medio}, ${fdmy(o.fecha)})${comprobante ? ' · con comprobante' : ''}`] };
    });
    const avisos: string[] = [];
    let actual = n;
    if (previo.tipo === 'arriendo' && o.tipo === 'reserva' && actual.estado === 'abierto' && etapas('arriendo').findIndex((e) => e.id === actual.etapa) < 2) {
      try {
        const m = await this.mover(u, id, { etapa: 'reserva', motivo: 'Reserva pagada' });
        actual = m.negocio;
        avisos.push(...m.avisos, 'El negocio pasó a «Reserva».');
      } catch {
        /* ya estaba más adelante */
      }
    }
    if (previo.tipo === 'arriendo' && o.tipo === 'comision' && actual.estado === 'abierto') {
      try {
        const c = await this.cerrar(u, id, { resultado: 'ganado' });
        actual = c.negocio;
        avisos.push(...c.avisos, 'El negocio se cerró como ganado y parte el postarriendo.');
      } catch (e) {
        avisos.push('No pude cerrar el negocio: ' + (e as Error).message);
      }
    }
    return { negocio: actual, avisos, reemplazo };
  }

  /** borra el registro de un pago del arriendo (el comprobante queda guardado en los archivos del negocio) */
  async quitarPago(u: UsuarioToken, id: string, tipo: z.infer<typeof quitarPagoEsquema>['tipo']): Promise<Resultado> {
    const n = await this.mutar(u, id, (n) => {
      const ciclo = JSON.parse(JSON.stringify(n.ciclo || {}));
      const clave = { reserva: 'reserva', garantia: 'garantia', primer_mes: 'primerMes' }[tipo as 'reserva'];
      if (tipo === 'comision') {
        if (!ciclo.comision?.pago) throw err('No hay un pago de la comisión registrado.');
        delete ciclo.comision.pago;
      } else {
        if (!ciclo.pagos?.[clave]) throw err('Ese pago no está registrado.');
        delete ciclo.pagos[clave];
      }
      n.ciclo = ciclo;
      return { actividad: [`Pago eliminado: ${TIPO_PAGO[tipo]}`] };
    });
    return { negocio: n, avisos: [] };
  }

  /** la fecha en que se entregó la propiedad (acta de entrega firmada), o la registrada, o hoy: de ahí salen los 30 días para facturar */
  private async fechaEntrega(corredoraId: string, n: Doc): Promise<string> {
    const f = n.firmas?.entrega_acta?.firmado;
    if (f) return String(f).slice(0, 10);
    const filas = await this.db.firma.findMany({ where: { corredoraId, negocioId: n.id, estado: 'firmado', eliminadoEn: null, documento: { contains: 'entrega', mode: 'insensitive' } }, select: { firmadoEn: true, enviadoEn: true } });
    const d = filas.map((x) => (x.firmadoEn ?? x.enviadoEn).toISOString().slice(0, 10)).sort().pop();
    return d || n.ciclo?.entrega?.fecha || hoyChile();
  }

  /** la factura de la comisión del arriendo (n.º, fecha, monto); queda la fecha de facturación a 30 días de la entrega */
  async factura(u: UsuarioToken, id: string, o: z.infer<typeof facturaEsquema>): Promise<Resultado> {
    const n0 = negocioApp(await this.cargar(u, id)) as Doc;
    const entrega = await this.fechaEntrega(u.corredoraId, n0);
    const n = await this.mutar(u, id, (n) => {
      if (n.tipo !== 'arriendo') throw err('La factura de la comisión es de los negocios de arriendo.');
      const ciclo = JSON.parse(JSON.stringify(n.ciclo || {}));
      const co = ciclo.comision || {};
      ciclo.comision = { ...co, facturaFecha: co.facturaFecha || mas(entrega, 0, 30), corredor: n.corredor || '', factura: { numero: o.numero.trim(), fecha: o.fecha, monto: o.monto, moneda: o.moneda } };
      n.ciclo = ciclo;
      return { actividad: [`Factura de la comisión registrada${o.numero ? ' nº ' + o.numero : ''} · ${montoTxt(o.monto, o.moneda)}`] };
    });
    return { negocio: n, avisos: [] };
  }

  async quitarFactura(u: UsuarioToken, id: string): Promise<Resultado> {
    const n = await this.mutar(u, id, (n) => {
      const ciclo = JSON.parse(JSON.stringify(n.ciclo || {}));
      if (!ciclo.comision?.factura) throw err('No hay una factura registrada.');
      delete ciclo.comision.factura;
      n.ciclo = ciclo;
      return { actividad: ['Factura de la comisión eliminada'] };
    });
    return { negocio: n, avisos: [] };
  }

  // ================================================================================================ aceptación del propietario
  /**
   * La respuesta del propietario (acepta, contraoferta, rechaza) y, si hubo contraoferta, la del interesado (acepta, otra oferta o desiste).
   * Al aceptarse, el monto y las condiciones del negocio quedan con lo acordado: el contrato parte de ahí.
   */
  async aceptacion(u: UsuarioToken, id: string, o: AceptacionEntrada): Promise<Resultado> {
    const n = await this.mutar(
      u,
      id,
      (n) => {
        const { rondas, ultima, final, esperaInteresado } = estadoNegociacion(n);
        const vig = ofertaVigente(n);
        const nueva = o.accion === 'contraoferta' || o.accion === 'oferta';
        if (final && o.accion !== 'oferta') throw err(`La negociación ya terminó (${ultima.tipo}). Para retomarla registra una nueva oferta del interesado.`);
        if (esperaInteresado && o.accion === 'contraoferta') throw err('Hay una contraoferta del propietario: ahora responde el interesado (acepta, hace otra oferta o desiste).');
        if (nueva && !(Number(o.monto) > 0)) throw err(`Escribe el monto de la ${o.accion === 'oferta' ? 'oferta' : 'contraoferta'}.`);
        if (o.accion === 'rechaza' && !o.nota.trim()) throw err('Escribe el motivo.');
        const por = esperaInteresado ? 'interesado' : 'propietario';
        const base = { fecha: ahoraIso(), nota: o.nota.trim() };
        const cond = { monto: Number(o.monto), moneda: o.moneda || vig.moneda, garantia: o.garantia.trim(), plazo: o.plazo.trim(), condiciones: o.condiciones.trim() };
        const ronda =
          o.accion === 'acepta'
            ? { ...base, tipo: 'aceptada', por, monto: vig.monto, moneda: vig.moneda, garantia: vig.garantia, plazo: vig.plazo, condiciones: vig.condiciones }
            : o.accion === 'rechaza'
              ? { ...base, tipo: 'rechazada', por }
              : o.accion === 'contraoferta'
                ? { ...base, tipo: 'contraoferta', por: 'propietario', ...cond }
                : { ...base, tipo: 'oferta', por: 'interesado', ...cond };
        const r = (x: any) => ({
          fecha: x.fecha || ahoraIso(),
          tipo: ['oferta', 'contraoferta', 'aceptada', 'rechazada'].includes(x.tipo) ? x.tipo : 'oferta',
          por: x.por === 'interesado' ? 'interesado' : 'propietario',
          monto: x.monto === '' || x.monto == null ? null : Number(x.monto) || null,
          moneda: ['UF', 'CLP', 'USD'].includes(x.moneda) ? x.moneda : 'UF',
          garantia: String(x.garantia || '').slice(0, 120),
          plazo: String(x.plazo || '').slice(0, 80),
          condiciones: String(x.condiciones || '').slice(0, 800),
          nota: String(x.nota || '').slice(0, 400),
        });
        n.aceptacion = { rondas: [...rondas, ronda].slice(-40).map(r) };
        // aceptado: el negocio queda con las condiciones finales (de ahí parte el contrato)
        if (o.accion === 'acepta') {
          n.valor = normValor({ valor: vig.monto, moneda: vig.moneda });
          n.oferta = normOferta({ garantia: vig.garantia, plazo: vig.plazo, vigencia: n.oferta?.vigencia || '', condiciones: vig.condiciones }, n.oferta);
        }
        const que = { acepta: 'aceptada', rechaza: 'rechazada', contraoferta: 'contraoferta', oferta: 'oferta del interesado' }[o.accion];
        return { actividad: [`Negociación: ${que}${nueva ? ' · ' + montoTxt(o.monto, cond.moneda) : ''}${o.nota ? ' · ' + o.nota : ''}`] };
      },
      o.version,
    );
    return { negocio: n, avisos: [] };
  }

  // ================================================================================================ contrato
  /** el firmante (o todos) aprueba el texto de la última versión del contrato; al aprobar todos, el paso «Revisión del contrato» queda logrado */
  async contratoAprobar(u: UsuarioToken, id: string, o: z.infer<typeof contratoAprobarEsquema>): Promise<Resultado> {
    const n = await this.mutar(u, id, (n) => {
      const k = n.ciclo?.contrato;
      const v = (k?.versiones || []).slice(-1)[0];
      if (!v) throw err('Todavía no hay una versión del contrato para revisar.');
      const fs: any[] = v.firmantes || [];
      if (!fs.length) throw err('La versión del contrato no tiene firmantes registrados.');
      const quienes = o.todos ? fs : fs.filter((q) => q.personaId === o.personaId);
      if (!quienes.length) throw err(`Indica quién aprueba: ${fs.map((q) => `${q.nombre} (${q.personaId})`).join(' | ')}.`);
      const a = { ...(k.aprobado || {}) };
      for (const q of quienes) o.aprobado ? (a[q.personaId] = ahoraIso()) : delete a[q.personaId];
      k.aprobado = a;
      return { actividad: [o.aprobado ? `Contrato V${v.n}: aprobado por ${quienes.map((q) => q.nombre).join(', ')}` : `Contrato V${v.n}: se quitó la aprobación de ${quienes.map((q) => q.nombre).join(', ')}`] };
    });
    return { negocio: n, avisos: [] };
  }

  /**
   * La respuesta de una parte (la escribió por WhatsApp y el servidor la interpretó): aprueba la última versión del contrato o deja su
   * comentario (con la versión a la que se refiere). Sin sesión: actúa con el corredor a cargo, como `avanzarPorFirma`.
   */
  async respuestaContrato(
    corredoraId: string,
    negocioId: string,
    personaId: string,
    o: { tipo: 'aprueba' | 'comenta'; texto?: string; de?: string },
  ): Promise<{ version: number; nombre: string; aprobados: number; total: number; todos: boolean; corredorId: string | null } | null> {
    const fila = await this.db.negocio.findFirst({ where: { id: negocioId, corredoraId, eliminadoEn: null } });
    if (!fila || fila.estado !== 'abierto') return null;
    const u: UsuarioToken = { sub: fila.corredorId ?? fila.creadoPorId ?? '', corredoraId, rol: 'ADMIN', sid: '' };
    let salida: { version: number; nombre: string; aprobados: number; total: number } | null = null;
    await this.mutar(u, negocioId, (n) => {
      const ciclo = (n.ciclo ||= {});
      const k = (ciclo.contrato ||= {});
      const v = (k.versiones || []).slice(-1)[0];
      if (!v) throw err('Todavía no hay una versión del contrato para revisar.');
      const fs: any[] = v.firmantes || [];
      const q = fs.find((x) => x.personaId === personaId);
      const nombre = q?.nombre ?? 'Una de las partes';
      if (o.tipo === 'aprueba') {
        if (!q) throw err('Esa persona no es firmante de la última versión del contrato.');
        k.aprobado = { ...(k.aprobado || {}), [personaId]: ahoraIso() };
      } else {
        k.comentarios = [...(k.comentarios || []), { fecha: ahoraIso(), de: o.de || 'arrendatario', texto: String(o.texto || '').trim().slice(0, 1500), version: v.n }];
      }
      const ap = k.aprobado || {};
      salida = { version: v.n, nombre, aprobados: fs.filter((x) => ap[x.personaId]).length, total: fs.length };
      return { actividad: [o.tipo === 'aprueba' ? `Contrato V${v.n}: aprobado por ${nombre} (respondió por WhatsApp)` : `Contrato V${v.n}: comentario de ${nombre} por WhatsApp`] };
    });
    if (!salida) return null;
    const r = salida as { version: number; nombre: string; aprobados: number; total: number };
    return { ...r, todos: r.total > 0 && r.aprobados === r.total, corredorId: fila.corredorId ?? fila.creadoPorId ?? null };
  }

  // ================================================================================================ postarriendo
  /** reajuste de la renta, renovación o término del contrato y devolución de la garantía (lo registrado en n.ciclo.postarriendo) */
  async postarriendo(u: UsuarioToken, id: string, o: PostEntrada): Promise<Resultado> {
    const comprobante = o.tipo === 'devolucion' ? await this.comprobanteDe(u, id, o) : null;
    const n = await this.mutar(u, id, (n) => {
      if (n.tipo !== 'arriendo') throw err('El postarriendo es de los negocios de arriendo.');
      const pc = plazosContrato(n);
      if (!pc) throw err('Faltan las condiciones del contrato (inicio y plazo): se llenan en el paso «Contrato firmado».');
      const ciclo = JSON.parse(JSON.stringify(n.ciclo || {}));
      ciclo.postarriendo ||= {};
      const post = ciclo.postarriendo;
      let texto = '';
      if (o.tipo === 'reajuste') {
        if (!pc.periodo) throw err('Este contrato no se reajusta por IPC (renta en UF o sin reajuste): no hay reajustes que registrar.');
        if (pc.proximo >= pc.termino) throw err('No quedan reajustes dentro del plazo del contrato.');
        const nueva = o.rentaNueva ?? Math.round(pc.renta * (1 + o.ipc / 100));
        const desde = o.desde || pc.proximo;
        post.reajustes = [...(post.reajustes || []), { desde, ipc: o.ipc, rentaAntes: pc.renta, rentaNueva: nueva, registrado: ahoraIso() }];
        post.rentaActual = nueva;
        texto = `Reajuste registrado desde el ${fdmy(desde)}: IPC ${String(o.ipc).replace('.', ',')}% · renta ${montoTxt(pc.renta, pc.moneda)} → ${montoTxt(nueva, pc.moneda)}`;
      } else if (o.tipo === 'renovacion') {
        if (o.decision === 'renovar' && !(Number(o.meses) >= 1)) throw err('Indica por cuántos meses se renueva.');
        post.renovacion = { decision: o.decision, meses: o.decision === 'renovar' ? Number(o.meses) : 0, nota: o.nota.trim(), fecha: ahoraIso() };
        texto = o.decision === 'renovar' ? `Renovación registrada por ${o.meses} meses` : 'Término del contrato registrado: no se renueva';
      } else if (o.tipo === 'devolucion') {
        const garantia = ciclo.pagos?.garantia;
        if (!garantia) throw err('Primero registra la garantía recibida (paso «Garantía y primer mes recibidos»).');
        if (o.descuento > garantia.monto) throw err('El descuento no puede ser mayor que la garantía.');
        if (o.descuento > 0 && !o.motivo.trim()) throw err('Escribe el motivo del descuento.');
        const devuelto = Math.max(0, garantia.monto - o.descuento);
        post.devolucion = { fechaRecepcion: o.fechaRecepcion, conforme: o.conforme, descuento: o.descuento, motivo: o.motivo.trim(), devuelto, moneda: garantia.moneda, fechaDevolucion: o.fechaDevolucion, comprobante };
        texto = `Garantía devuelta: ${montoTxt(devuelto, garantia.moneda)} el ${fdmy(o.fechaDevolucion)}${o.descuento ? ` (descuento ${montoTxt(o.descuento, garantia.moneda)}: ${o.motivo})` : ''}`;
      } else if (o.tipo === 'quitar_renovacion') {
        if (!post.renovacion) throw err('No hay una decisión de renovación registrada.');
        delete post.renovacion;
        texto = 'Decisión de renovación quitada';
      } else {
        if (!post.devolucion) throw err('No hay una devolución registrada.');
        delete post.devolucion;
        texto = 'Registro de la devolución de la garantía eliminado';
      }
      n.ciclo = ciclo;
      return { actividad: [texto] };
    });
    return { negocio: n, avisos: [] };
  }
}

// ==================================================================================================== REST
@Controller('negocios')
export class NegocioAccionesController {
  constructor(private readonly s: NegocioAccionesService) {}

  /** POST /v1/negocios/acciones/crear */
  @Post('acciones/crear')
  @HttpCode(200)
  crear(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(crearEsquema)) b: CrearEntrada) {
    return this.s.crear(u, b);
  }

  @Get(':id/acciones/ver')
  ver(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string) {
    return this.s.ver(u, id);
  }

  @Post(':id/acciones/mover')
  @HttpCode(200)
  mover(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(moverEsquema)) b: z.infer<typeof moverEsquema>) {
    return this.s.mover(u, id, b);
  }

  @Post(':id/acciones/tarea')
  @HttpCode(200)
  tarea(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(tareaEsquema)) b: z.infer<typeof tareaEsquema>) {
    return this.s.tarea(u, id, b);
  }

  @Post(':id/acciones/paso')
  @HttpCode(200)
  paso(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(pasoEsquema)) b: z.infer<typeof pasoEsquema>) {
    return this.s.paso(u, id, b);
  }

  @Post(':id/acciones/proxima-accion')
  @HttpCode(200)
  proxima(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(proximaEsquema)) b: z.infer<typeof proximaEsquema>) {
    return this.s.proximaAccion(u, id, b);
  }

  @Post(':id/acciones/nota')
  @HttpCode(200)
  nota(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(notaEsquema)) b: z.infer<typeof notaEsquema>) {
    return this.s.nota(u, id, b.texto);
  }

  @Post(':id/acciones/condiciones')
  @HttpCode(200)
  condiciones(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(condicionesEsquema)) b: z.infer<typeof condicionesEsquema>) {
    return this.s.condiciones(u, id, b);
  }

  @Post(':id/acciones/cerrar')
  @HttpCode(200)
  cerrar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(cerrarEsquema)) b: z.infer<typeof cerrarEsquema>) {
    return this.s.cerrar(u, id, b);
  }

  @Post(':id/acciones/reabrir')
  @HttpCode(200)
  reabrir(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(vacioEsquema)) b: { version?: number }) {
    return this.s.reabrir(u, id, b);
  }

  @Post(':id/acciones/vincular-firma')
  @HttpCode(200)
  vincularFirma(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(firmaEsquema)) b: z.infer<typeof firmaEsquema>) {
    return this.s.vincularFirma(u, id, b);
  }

  @Post(':id/acciones/firma-fuera')
  @HttpCode(200)
  firmaFuera(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(firmaFueraEsquema)) b: z.infer<typeof firmaFueraEsquema>) {
    return this.s.firmaFuera(u, id, b);
  }

  @Post(':id/acciones/pago')
  @HttpCode(200)
  pago(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(pagoEsquema)) b: PagoEntrada) {
    return this.s.pago(u, id, b);
  }

  @Post(':id/acciones/pago/quitar')
  @HttpCode(200)
  quitarPago(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(quitarPagoEsquema)) b: z.infer<typeof quitarPagoEsquema>) {
    return this.s.quitarPago(u, id, b.tipo);
  }

  @Post(':id/acciones/factura')
  @HttpCode(200)
  factura(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(facturaEsquema)) b: z.infer<typeof facturaEsquema>) {
    return this.s.factura(u, id, b);
  }

  @Post(':id/acciones/factura/quitar')
  @HttpCode(200)
  quitarFactura(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string) {
    return this.s.quitarFactura(u, id);
  }

  @Post(':id/acciones/aceptacion')
  @HttpCode(200)
  aceptacion(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(aceptacionEsquema)) b: AceptacionEntrada) {
    return this.s.aceptacion(u, id, b);
  }

  @Post(':id/acciones/contrato/aprobar')
  @HttpCode(200)
  contratoAprobar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(contratoAprobarEsquema)) b: z.infer<typeof contratoAprobarEsquema>) {
    return this.s.contratoAprobar(u, id, b);
  }

  @Post(':id/acciones/postarriendo')
  @HttpCode(200)
  postarriendo(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(postEsquema)) b: PostEntrada) {
    return this.s.postarriendo(u, id, b);
  }
}

