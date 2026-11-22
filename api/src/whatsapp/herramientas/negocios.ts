// Herramientas de NEGOCIOS (ventas y arriendos) del equipo, en el servidor: el corredor administra sus negocios por WhatsApp con Asset cerrado.
// Son una capa delgada: todas las reglas viven en NegocioAccionesService (src/negocios/negocio-acciones.ts, con su REST), aquí solo se
// resuelve el negocio (por su código NG-XXX), se pregunta lo que falta y se pide el «sí» de lo que cobra, cierra o escribe a terceros.
//
// Lo que cierra o registra plata va en DOS pasos con `confirmado` (modelo: orden-visita.ts): sin él solo ARMA y devuelve el resumen; con él
// (solo ante un «sí» puro del corredor en un mensaje nuevo) ejecuta EXACTAMENTE lo que se mostró. Lo reversible y local se ejecuta directo.
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { UsuarioToken } from '../../auth/usuario-actual';
import { PrismaService } from '../../prisma/prisma.service';
import { NegocioAccionesService, type Resultado } from '../../negocios/negocio-acciones';
import { PASOS_POR_TIPO, TIPO_PAGO, MEDIO_PAGO, comisionMonto, etapas, faltantesPago, fdmy, montoTxt, vista, esDia, type Doc } from '../../negocios/negocio-reglas';
import { negocioApp } from '../../negocios/negocios';
import { LeerComprobanteService, type ComprobanteLeido } from '../../documentos/leer-comprobante';
// solo el tipo: importar el archivo cerraría un círculo de imports (evaluación → ejecutivo → equipo → estas herramientas); la clase se carga al usarla
import type { EvaluacionService } from '../evaluacion';
import { hoy, norm } from '../comun';
// el «sí» puro (compartido con la orden de visita y los documentos): «sí, pero…» no lo es
import { asiente } from '../orden-visita';
import { AyudasHerramientas, fechaIso } from './ayudas';
import { esquema, type CtxHerr, type Herramienta, type AdjuntoRecibido, type ProveedorHerramientas } from './tipos';

const VIGENCIA_MS = 15 * 60_000;
const ADJUNTO_MS = 30 * 60_000;
const UUID = /^[0-9a-f-]{36}$/i;

type A = Record<string, unknown>;
const txt = (a: A, k: string) => (typeof a[k] === 'string' || typeof a[k] === 'number' ? String(a[k]).trim() : '');
const num = (a: A, k: string) => {
  const v = a[k];
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null;
};
const MONEDAS = ['CLP', 'UF', 'USD'];
const ETAPAS_IA = ['interes', 'visita', 'reserva', 'promesa', 'escritura', 'inscripcion', 'evaluacion', 'contrato', 'entrega'];

const NEGOCIO = { type: 'string', description: 'Código del negocio (NG-014). Si no sabes cuál es, búscalo con la herramienta «negocios» y pregúntale al corredor.' };
const CONFIRMADO = { type: 'boolean', description: 'true SOLO después de que el corredor dijo que sí al resumen. Sin él, solo se arma el resumen.' };
const SUMA_DOS_PASOS = 'SIEMPRE en dos pasos: 1) llámala SIN confirmado: arma el resumen y no cambia nada; muéstraselo al corredor y pregúntale si lo hace. 2) Solo cuando responda que sí, llámala de nuevo con confirmado: true (se ejecuta lo que se mostró).';

/** el comprobante que mandó el corredor, a la espera de que conteste lo que falta o confirme (se recuerda 30 min; el «sí» llega en otro mensaje) */
interface AdjuntoPend {
  adj: AdjuntoRecibido;
  lectura: ComprobanteLeido | null;
  en: number;
}
/** lo armado en el paso 1 de una herramienta de dos pasos: lo que se ejecuta al confirmar */
interface Preparada {
  accion: string;
  args: A;
  en: number;
  /** el mensaje del corredor en que se armó: el «sí» tiene que llegar en uno nuevo */
  texto: string;
}

@Injectable()
export class HerramientasNegocios implements ProveedorHerramientas {
  private readonly log = new Logger('HerramientasNegocios');
  private readonly preparadas = new Map<string, Preparada>();
  private readonly adjuntos = new Map<string, AdjuntoPend>();
  readonly herramientas: Herramienta[];

  constructor(
    private readonly db: PrismaService,
    private readonly ayudas: AyudasHerramientas,
    private readonly acc: NegocioAccionesService,
    private readonly leerComprobante: LeerComprobanteService,
    // la evaluación depende (por el ejecutivo) del equipo, que ofrece estas herramientas: se resuelve al usarla para no cerrar el círculo
    private readonly modulos: ModuleRef,
  ) {
    this.herramientas = this.definir();
  }

  // ================================================================================================ ayudas
  private tok = (c: CtxHerr): UsuarioToken => ({ sub: c.usuarioId, corredoraId: c.corredoraId, rol: c.admin ? 'ADMIN' : 'CORREDOR', sid: '' });
  private async evaluacion(): Promise<EvaluacionService> {
    const { EvaluacionService: clase } = await import('../evaluacion.js');
    return this.modulos.get(clase, { strict: false });
  }

  /** ejecuta y devuelve `{ error }` (en vez de lanzar) con el texto claro de lo que no se pudo */
  private async seguro(fn: () => Promise<unknown>): Promise<unknown> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof HttpException) {
        const r = e.getResponse() as string | { message?: string | string[]; code?: string };
        if (typeof r !== 'string' && r?.code === 'VERSION') return { error: 'Otra persona cambió el negocio al mismo tiempo: vuelve a intentarlo.' };
        const m = typeof r === 'string' ? r : Array.isArray(r.message) ? r.message.join('; ') : r.message;
        return { error: m || e.message };
      }
      this.log.warn(`herramienta de negocios: ${(e as Error).message}`);
      return { error: 'No pude hacerlo ahora. Inténtalo de nuevo o hazlo desde Asset.' };
    }
  }

  /** el negocio que dice el corredor (código NG-XXX, id o texto); los cerrados también si se pide */
  private async buscar(c: CtxHerr, a: A, cerrados = true) {
    return this.ayudas.negocio(c, a.negocio, !cerrados);
  }

  /** una línea con el negocio, para las respuestas cortas */
  private resumen(n: Doc, extra: Record<string, unknown> = {}) {
    const v = vista(n, hoy());
    return { codigo: n.codigo ?? n.id, tipo: n.tipo, estado: n.estado, etapa: v.etapaInfo?.t ?? n.etapa, falta: v.siguiente, proximaAccion: n.proximaAccion ?? null, ...extra };
  }
  private respuesta(r: Resultado, mensaje: string, extra: Record<string, unknown> = {}) {
    return { ok: true, mensaje, negocio: this.resumen(r.negocio), ...(r.avisos.length ? { avisos: r.avisos } : {}), ...extra };
  }

  /** los negocios abiertos del corredor (o todos, el administrador) con su código: para preguntarle a cuál se refiere */
  private async opciones(c: CtxHerr, filtro = '') {
    const l = await this.db.negocio.findMany({ where: { corredoraId: c.corredoraId, eliminadoEn: null, estado: 'abierto', ...this.ayudas.mio(c) }, orderBy: { actualizadoEn: 'desc' }, take: 60 });
    const props = await this.db.propiedad.findMany({ where: { id: { in: l.map((n) => n.propiedadId).filter((x): x is string => !!x) } }, select: { id: true, codigo: true, titulo: true } });
    const pers = await this.db.persona.findMany({ where: { id: { in: l.map((n) => n.clienteId).filter((x): x is string => !!x) } }, select: { id: true, nombre: true } });
    const q = norm(filtro).split(/\s+/).filter((t) => t.length > 1);
    const todas = l.map((n) => {
      const p = props.find((x) => x.id === n.propiedadId);
      const cli = pers.find((x) => x.id === n.clienteId);
      const codigo = (n.datos as { codigo?: string })?.codigo ?? n.id;
      return { codigo, tipo: n.tipo, etapa: etapas(n.tipo).find((e) => e.id === n.etapa)?.t ?? n.etapa, propiedad: p ? `${p.codigo} ${p.titulo}` : null, cliente: cli?.nombre ?? null, _h: norm(`${codigo} ${p?.codigo ?? ''} ${p?.titulo ?? ''} ${cli?.nombre ?? ''} ${n.tipo}`) };
    });
    const hit = q.length ? todas.filter((x) => q.every((t) => x._h.includes(t))) : [];
    return (hit.length ? hit : todas).slice(0, 12).map(({ _h, ...x }) => x);
  }

  /**
   * Las herramientas de dos pasos. Sin `confirmado`: valida, arma y devuelve el resumen (queda guardado lo que se ejecutará). Con él: exige que
   * haya algo armado hace menos de 15 min y un «sí» puro en este mensaje, y ejecuta lo armado (no lo que el modelo repita).
   */
  private async dosPasos(
    c: CtxHerr,
    accion: string,
    a: A,
    preparar: (a: A) => Promise<{ error: string } | { args: A; resumen: Record<string, unknown> }>,
    ejecutar: (args: A) => Promise<unknown>,
  ): Promise<unknown> {
    let args: A = { ...a };
    if (a.confirmado === true) {
      const pend = this.preparadas.get(c.usuarioId);
      if (!pend || pend.accion !== accion || Date.now() - pend.en > VIGENCIA_MS)
        return { error: 'Primero hay que armar el resumen y mostrárselo al corredor (llama la herramienta sin confirmado). No hay nada preparado o venció (15 minutos).' };
      if (!asiente(c.texto)) return { error: 'El corredor todavía no confirmó: pregúntale si lo hago y espera su sí. Si pidió un cambio, arma el resumen de nuevo con el cambio.' };
      args = pend.args;
      this.preparadas.delete(c.usuarioId);
      return ejecutar(args);
    }
    const p = await preparar(args);
    if ('error' in p) return p;
    this.preparadas.set(c.usuarioId, { accion, args: p.args, en: Date.now(), texto: c.texto });
    return {
      ok: true,
      ejecutado: false,
      necesitaConfirmacion: true,
      ...p.resumen,
      indicacion: 'NO se ha hecho nada todavía. Muéstrale este resumen al corredor y pregúntale si lo hago. Cuando conteste que sí, llama la herramienta de nuevo con confirmado: true (sin cambiar nada); si pide un cambio, arma el resumen otra vez.',
    };
  }

  // ================================================================================================ las herramientas
  private definir(): Herramienta[] {
    const h = (name: string, description: string, input_schema: Herramienta['input_schema'], ejecutar: (c: CtxHerr, a: A) => Promise<unknown>): Herramienta => ({
      name,
      description,
      input_schema,
      ejecutar: (c, a) => this.seguro(() => ejecutar(c, a)),
    });
    return [
      // ------------------------------------------------------------------ crear y ver
      h(
        'crear_negocio',
        'Crea un negocio de venta o arriendo (le asigna su código NG-XXX). REGLA: todo negocio necesita SIEMPRE una propiedad y un interesado (comprador o arrendatario) que ya existan; si la persona no está en el CRM, pídele nombre (y RUT) o créala antes con la herramienta de personas. La propiedad debe estar en venta (o arriendo) según el tipo. Comisión por defecto: 2 % en venta y 50 % en arriendo; el precio por defecto es el de la ficha. Si ya existe uno abierto igual, lo avisa.',
        esquema(
          {
            tipo: { type: 'string', enum: ['venta', 'arriendo'] },
            propiedad: { type: 'string', description: 'Código de la propiedad (PF-1001)' },
            cliente: { type: 'string', description: 'RUT, nombre, correo o id del comprador/arrendatario (debe existir en el CRM)' },
            precio: { type: 'number', description: 'Precio o renta acordada (por defecto, el de la ficha)' },
            moneda: { type: 'string', enum: ['UF', 'CLP', 'USD'] },
            comision: { type: 'number', description: 'Comisión (por defecto 2 en venta, 50 en arriendo)' },
            comision_tipo: { type: 'string', enum: ['%', 'monto'] },
            etapa: { type: 'string', enum: ETAPAS_IA, description: 'Etapa inicial (por defecto «interes»)' },
            proxima_accion: { type: 'string' },
            fecha_accion: { type: 'string', description: 'AAAA-MM-DD' },
          },
          ['tipo', 'propiedad', 'cliente'],
        ),
        async (c, a) => {
          const tipo = txt(a, 'tipo');
          if (tipo !== 'venta' && tipo !== 'arriendo') return { error: 'Falta el tipo: venta o arriendo.' };
          const p = await this.ayudas.propiedad(c, a.propiedad);
          if (!p) return { error: 'No encontré esa propiedad. Indica su código (por ejemplo PF-1001).' };
          const cli = await this.ayudas.persona(c, a.cliente);
          if (!cli.ok) return { error: cli.error };
          const precio = num(a, 'precio');
          const fecha = txt(a, 'fecha_accion');
          const r = await this.acc.crear(this.tok(c), {
            tipo,
            propiedadId: p.id,
            clienteId: cli.v.id,
            ...(precio != null ? { valor: { valor: precio, moneda: MONEDAS.includes(txt(a, 'moneda')) ? (txt(a, 'moneda') as 'UF') : undefined } } : {}),
            ...(num(a, 'comision') != null ? { comision: { tipo: txt(a, 'comision_tipo') === 'monto' ? ('monto' as const) : ('%' as const), valor: num(a, 'comision')! } } : {}),
            ...(ETAPAS_IA.includes(txt(a, 'etapa')) ? { etapa: txt(a, 'etapa') } : {}),
            ...(txt(a, 'proxima_accion') ? { proximaAccion: { texto: txt(a, 'proxima_accion'), fecha: esDia(fecha) ? fecha : null } } : {}),
          });
          return this.respuesta(r, `Listo: creé el negocio ${r.negocio.codigo} de ${tipo} (${p.codigo} · ${cli.v.nombre}).`);
        },
      ),
      h(
        'ver_negocio',
        'Detalle de UN negocio: su código NG-XXX, etapa, lo que falta, las tareas de la etapa, los pasos de cada etapa con su estado (logrado, pendiente, no logrado), qué documentos hay y su firma, pagos y comisión, la negociación con el propietario, la revisión del contrato, el postarriendo, la evaluación del arrendatario y el historial. Úsala antes de decir qué falta o en qué va un negocio; no inventes.',
        esquema({ negocio: NEGOCIO }, ['negocio']),
        async (c, a) => {
          const r = await this.buscar(c, a);
          if (!r.ok) return { error: r.error };
          const v = await this.acc.ver(this.tok(c), r.v.id);
          let evaluacion: unknown = undefined;
          if (v.tipo === 'arriendo') evaluacion = await this.resumenEvaluacion(c, r.v.id).catch(() => undefined);
          return { ok: true, ...v, ...(evaluacion ? { evaluacion } : {}) };
        },
      ),
      // ------------------------------------------------------------------ etapas, tareas, pasos
      h(
        'mover_negocio',
        'Mueve un negocio a otra etapa (la propiedad cambia sola: reserva → reservada; entrega de una venta → vendida). Las etapas de una venta: interes, visita, reserva, promesa, escritura, inscripcion, entrega; de un arriendo: interes, visita, reserva, evaluacion, contrato, entrega. Un negocio cerrado no se mueve (reábrelo antes). No la uses para cerrar ni para marcar pasos.',
        esquema({ negocio: NEGOCIO, etapa: { type: 'string', enum: ETAPAS_IA }, motivo: { type: 'string', description: 'Opcional, para el historial' } }, ['negocio', 'etapa']),
        async (c, a) => {
          const r = await this.buscar(c, a);
          if (!r.ok) return { error: r.error };
          const x = await this.acc.mover(this.tok(c), r.v.id, { etapa: txt(a, 'etapa'), motivo: txt(a, 'motivo') || undefined });
          return this.respuesta(x, `Listo: ${x.negocio.codigo} está en «${this.resumen(x.negocio).etapa}».`);
        },
      ),
      h(
        'marcar_tarea',
        'Marca o desmarca una tarea de una etapa del negocio (por defecto la etapa actual), por su texto o su número desde 1. Si no encuentras la tarea, te devuelve la lista de la etapa. Lo reversible: se ejecuta directo.',
        esquema(
          { negocio: NEGOCIO, tarea: { type: 'string', description: 'Texto o número de la tarea (desde 1)' }, hecha: { type: 'boolean', description: 'true = hecha (por defecto); false = desmarcar' }, etapa: { type: 'string', enum: ETAPAS_IA, description: 'Otra etapa distinta de la actual (opcional)' } },
          ['negocio', 'tarea'],
        ),
        async (c, a) => {
          const r = await this.buscar(c, a);
          if (!r.ok) return { error: r.error };
          const etId = txt(a, 'etapa') || r.v.etapa;
          const ts = etapas(r.v.tipo).find((e) => e.id === etId)?.tareas;
          if (!ts) return { error: `La etapa «${etId}» no existe en un negocio de ${r.v.tipo}.` };
          const ref = txt(a, 'tarea');
          let i = /^\d+$/.test(ref) ? Number(ref) - 1 : ts.findIndex((t) => norm(t).includes(norm(ref)) || norm(ref).includes(norm(t)));
          if (!(i >= 0 && i < ts.length)) return { error: `La etapa «${etId}» tiene estas tareas: ${ts.map((t, k) => `${k + 1}. ${t}`).join(' | ')}.` };
          const x = await this.acc.tarea(this.tok(c), r.v.id, { etapa: etId, indice: i, hecha: a.hecha !== false });
          return this.respuesta(x, `Listo: «${ts[i]}» ${a.hecha === false ? 'quedó pendiente' : 'quedó hecha'} en ${x.negocio.codigo}.`);
        },
      ),
      h(
        'marcar_paso',
        'Marca a mano un PASO del negocio (los que muestra ver_negocio, por ejemplo «negociacion», «reserva_pago», «financiamiento», «titulos», «inscripcion», «comision», «evaluacion»): logrado, no logrado, pendiente (con a quién se espera y plazo) o automatico (vuelve a lo que Asset deduce solo). Los pasos de firmas, pagos y documentos se logran solos al registrar la firma o el pago; úsala solo cuando el corredor lo pide.',
        esquema(
          {
            negocio: NEGOCIO,
            paso: { type: 'string', description: 'El id del paso (de ver_negocio) o su nombre' },
            estado: { type: 'string', enum: ['logrado', 'no_logrado', 'pendiente', 'automatico'] },
            detalle: { type: 'string', description: 'Motivo o detalle (opcional)' },
            esperando_a: { type: 'string', description: 'Si queda pendiente, a quién se espera (opcional)' },
            plazo: { type: 'string', description: 'AAAA-MM-DD (opcional)' },
          },
          ['negocio', 'paso', 'estado'],
        ),
        async (c, a) => {
          const r = await this.buscar(c, a);
          if (!r.ok) return { error: r.error };
          const lista = PASOS_POR_TIPO[r.v.tipo as 'venta'] ?? [];
          const ref = norm(txt(a, 'paso'));
          const def = lista.find((d) => d.id === ref || d.id === txt(a, 'paso')) ?? lista.find((d) => norm(d.t) === ref) ?? lista.find((d) => norm(d.t).includes(ref) && ref.length > 3);
          if (!def) return { error: `No conozco ese paso. Los de un negocio de ${r.v.tipo} son: ${lista.map((d) => `${d.id} (${d.t})`).join(' | ')}.` };
          const estado = ({ logrado: 'ok', no_logrado: 'fail', pendiente: 'pend', automatico: 'auto' } as Record<string, 'ok' | 'fail' | 'pend' | 'auto'>)[txt(a, 'estado')];
          if (!estado) return { error: 'El estado es logrado, no_logrado, pendiente o automatico.' };
          const plazo = txt(a, 'plazo');
          const x = await this.acc.paso(this.tok(c), r.v.id, { paso: def.id, estado, detalle: txt(a, 'detalle'), quien: txt(a, 'esperando_a'), vence: esDia(plazo) ? plazo : null });
          return this.respuesta(x, `Listo: «${def.t}» en ${x.negocio.codigo}: ${txt(a, 'estado').replace('_', ' ')}.`);
        },
      ),
      h(
        'proxima_accion',
        'Define la próxima acción de un negocio con su fecha (por ejemplo «llamar al propietario», 2026-11-25). Texto vacío la quita. Si pasa la fecha, el negocio sale como vencido.',
        esquema({ negocio: NEGOCIO, texto: { type: 'string', description: 'Qué hay que hacer (vacío = quitarla)' }, fecha: { type: 'string', description: 'AAAA-MM-DD' } }, ['negocio', 'texto']),
        async (c, a) => {
          const r = await this.buscar(c, a);
          if (!r.ok) return { error: r.error };
          const f = txt(a, 'fecha');
          if (f && !esDia(f)) return { error: 'La fecha va como AAAA-MM-DD.' };
          const x = await this.acc.proximaAccion(this.tok(c), r.v.id, { texto: txt(a, 'texto'), fecha: f || null });
          return this.respuesta(x, txt(a, 'texto') ? `Listo: próxima acción de ${x.negocio.codigo}: ${txt(a, 'texto')}${f ? ' (' + fdmy(f) + ')' : ''}.` : `Listo: quité la próxima acción de ${x.negocio.codigo}.`);
        },
      ),
      h(
        'nota_negocio',
        'Agrega una nota al historial de un negocio (lo que pasó, un acuerdo, un recuerdo). No cambia el negocio.',
        esquema({ negocio: NEGOCIO, texto: { type: 'string', description: 'La nota' } }, ['negocio', 'texto']),
        async (c, a) => {
          const r = await this.buscar(c, a);
          if (!r.ok) return { error: r.error };
          await this.acc.nota(this.tok(c), r.v.id, txt(a, 'texto'));
          return { ok: true, mensaje: `Listo: anoté la nota en ${(r.v.datos as { codigo?: string })?.codigo ?? r.v.id}.` };
        },
      ),
      h(
        'condiciones_negocio',
        'Cambia las condiciones de un negocio: precio o renta acordada, comisión, día estimado de cierre y las condiciones de la oferta (garantía, plazo, vigencia en días, otras condiciones). Solo lo que el corredor diga; lo demás queda igual.',
        esquema(
          {
            negocio: NEGOCIO,
            precio: { type: 'number' },
            moneda: { type: 'string', enum: ['UF', 'CLP', 'USD'] },
            comision: { type: 'number' },
            comision_tipo: { type: 'string', enum: ['%', 'monto'] },
            cierre_estimado: { type: 'string', description: 'AAAA-MM-DD' },
            garantia: { type: 'string' },
            plazo: { type: 'string' },
            vigencia_dias: { type: 'number' },
            condiciones: { type: 'string' },
          },
          ['negocio'],
        ),
        async (c, a) => {
          const r = await this.buscar(c, a);
          if (!r.ok) return { error: r.error };
          const n = negocioApp(r.v) as Doc;
          const o: Record<string, unknown> = {};
          if (num(a, 'precio') != null) o.valor = { valor: num(a, 'precio'), moneda: MONEDAS.includes(txt(a, 'moneda')) ? txt(a, 'moneda') : (n.valor?.moneda ?? 'UF') };
          else if (MONEDAS.includes(txt(a, 'moneda')) && n.valor) o.valor = { valor: n.valor.valor, moneda: txt(a, 'moneda') };
          if (num(a, 'comision') != null) o.comision = { tipo: txt(a, 'comision_tipo') === 'monto' ? 'monto' : (txt(a, 'comision_tipo') === '%' ? '%' : (n.comision?.tipo ?? '%')), valor: num(a, 'comision') };
          if (esDia(txt(a, 'cierre_estimado'))) o.cierreEstimado = txt(a, 'cierre_estimado');
          const of: Record<string, unknown> = {};
          for (const [k, v] of [['garantia', 'garantia'], ['plazo', 'plazo'], ['condiciones', 'condiciones']] as const) of[k] = a[v] !== undefined ? txt(a, v) : (n.oferta?.[k] ?? '');
          of.vigencia = a.vigencia_dias !== undefined ? String(a.vigencia_dias) : (n.oferta?.vigencia ?? '');
          if (['garantia', 'plazo', 'condiciones', 'vigencia_dias'].some((k) => a[k] !== undefined)) o.oferta = of;
          if (!Object.keys(o).length) return { error: 'Dime qué cambiar: precio, comisión, cierre estimado o condiciones de la oferta.' };
          const x = await this.acc.condiciones(this.tok(c), r.v.id, o as never);
          return this.respuesta(x, `Listo: actualicé las condiciones de ${x.negocio.codigo}.`, { valor: x.negocio.valor ?? null, comision: x.negocio.comision ?? null, comisionEstimada: comisionMonto(x.negocio) });
        },
      ),
      // ------------------------------------------------------------------ cerrar y reabrir
      h(
        'cerrar_negocio',
        `Cierra un negocio como ganado o perdido (si se perdió, pide el motivo). Cambia el estado de la propiedad (vendida/arrendada, o vuelve a disponible). ${SUMA_DOS_PASOS}`,
        esquema({ negocio: NEGOCIO, resultado: { type: 'string', enum: ['ganado', 'perdido'] }, motivo: { type: 'string', description: 'Por qué se perdió (obligatorio si perdido)' }, confirmado: CONFIRMADO }, ['negocio', 'resultado']),
        (c, a) =>
          this.dosPasos(
            c,
            'cerrar_negocio',
            a,
            async (a) => {
              const r = await this.buscar(c, a);
              if (!r.ok) return { error: r.error };
              const resultado = txt(a, 'resultado');
              if (resultado !== 'ganado' && resultado !== 'perdido') return { error: 'El resultado es ganado o perdido.' };
              if (r.v.estado !== 'abierto') return { error: `El negocio ya está cerrado (${r.v.estado}). Si hay que cambiarlo, reábrelo primero.` };
              if (resultado === 'perdido' && !txt(a, 'motivo')) return { error: 'Pregúntale al corredor por qué se perdió el negocio.' };
              const n = negocioApp(r.v) as Doc;
              return {
                args: { negocioId: r.v.id, resultado, motivo: txt(a, 'motivo') },
                resumen: { accion: resultado === 'ganado' ? 'Cerrar el negocio con éxito' : 'Marcar el negocio como perdido', negocio: this.resumen(n), ...(resultado === 'perdido' ? { motivo: txt(a, 'motivo') } : {}), efecto: resultado === 'ganado' ? `La propiedad queda ${n.tipo === 'venta' ? 'vendida' : 'arrendada'}.` : 'Si la propiedad estaba reservada por este negocio, vuelve a quedar disponible.' },
              };
            },
            async (args) => {
              const x = await this.acc.cerrar(this.tok(c), String(args.negocioId), { resultado: args.resultado as 'ganado', motivo: String(args.motivo || '') || undefined });
              return this.respuesta(x, x.negocio.estado === 'ganado' ? `Listo: cerré ${x.negocio.codigo} como ganado.` : `Listo: marqué ${x.negocio.codigo} como perdido.`);
            },
          ),
      ),
      h(
        'reabrir_negocio',
        'Reabre un negocio cerrado (ganado o perdido) para seguir trabajándolo. La propiedad vuelve a su estado según sus negocios abiertos.',
        esquema({ negocio: NEGOCIO }, ['negocio']),
        async (c, a) => {
          const r = await this.buscar(c, a);
          if (!r.ok) return { error: r.error };
          const x = await this.acc.reabrir(this.tok(c), r.v.id);
          return this.respuesta(x, `Listo: reabrí ${x.negocio.codigo}.`);
        },
      ),
      // ------------------------------------------------------------------ firmas
      h(
        'vincular_firma',
        'Liga la operación de firma de Portalfirma (su número) a la etapa del negocio, para que se siga su firma y el negocio avance al firmarse. Por defecto la etapa actual; para otros documentos indica la etapa: en un arriendo «oferta» (carta oferta), «reserva», «contrato» o «entrega_acta»; en una venta «reserva», «promesa», «escritura» o «entrega».',
        esquema({ negocio: NEGOCIO, operacion: { type: 'number', description: 'Número de operación de Portalfirma' }, etapa: { type: 'string', description: 'Etapa o documento (opcional; por defecto la etapa actual)' } }, ['negocio', 'operacion']),
        async (c, a) => {
          const r = await this.buscar(c, a);
          if (!r.ok) return { error: r.error };
          const op = num(a, 'operacion');
          if (!op) return { error: 'Falta el número de operación.' };
          const x = await this.acc.vincularFirma(this.tok(c), r.v.id, { operacion: op, etapa: txt(a, 'etapa') || undefined });
          return this.respuesta(x, `Listo: la operación ${op} quedó ligada a ${x.negocio.codigo}. Su firma se revisa cada pocos minutos.`);
        },
      ),
      // ------------------------------------------------------------------ pagos y comprobantes
      h(
        'registrar_pago',
        `Registra un pago de un negocio SIN archivo: en un arriendo la reserva, la garantía, el primer mes o la comisión (y, con tipo_pago «factura_comision», la factura de la comisión con su número); en una venta, «otro». Efectos: registrar la reserva mueve el negocio a «Reserva» (la propiedad queda reservada); registrar el pago de la comisión cierra el negocio como ganado y parte el postarriendo. Si el corredor mandó el comprobante (PDF o foto), usa subir_comprobante en vez de esta. Pregunta SOLO lo que falte (monto, moneda, fecha, medio, y a qué corresponde). ${SUMA_DOS_PASOS}`,
        esquema(
          {
            negocio: NEGOCIO,
            tipo_pago: { type: 'string', enum: ['reserva', 'garantia', 'primer_mes', 'comision', 'factura_comision', 'otro'], description: 'A qué corresponde (en una venta, «otro»)' },
            monto: { type: 'number', description: 'Monto, sin puntos' },
            moneda: { type: 'string', enum: ['CLP', 'UF', 'USD'] },
            fecha: { type: 'string', description: 'Fecha del pago (o de emisión de la factura), AAAA-MM-DD' },
            medio: { type: 'string', enum: ['transferencia', 'deposito', 'efectivo', 'cheque', 'tarjeta', 'otro'] },
            numero_factura: { type: 'string', description: 'Solo para factura_comision' },
            referencia: { type: 'string', description: 'N° de operación o folio (opcional)' },
            nota: { type: 'string' },
            confirmado: CONFIRMADO,
          },
          ['negocio', 'tipo_pago'],
        ),
        (c, a) =>
          this.dosPasos(
            c,
            'registrar_pago',
            a,
            async (a) => {
              const r = await this.buscar(c, a);
              if (!r.ok) return { error: r.error };
              const n = negocioApp(r.v) as Doc;
              const tipo = n.tipo === 'venta' ? 'otro' : txt(a, 'tipo_pago');
              const datos = { tipo_pago: tipo, monto: num(a, 'monto'), moneda: txt(a, 'moneda').toUpperCase(), fecha: txt(a, 'fecha'), medio: tipo === 'factura_comision' ? 'otro' : txt(a, 'medio') };
              const faltan = faltantesPago(n.tipo, { ...datos, tipo_pago: tipo === 'factura_comision' ? 'otro' : tipo }).filter((f) => !(tipo === 'factura_comision' && f === 'medio'));
              if (tipo === 'factura_comision' && n.tipo !== 'arriendo') return { error: 'La factura de la comisión es de los negocios de arriendo.' };
              if (faltan.length) return { error: `Pregúntale al corredor SOLO esto: ${faltan.join(', ')}.` };
              if (n.estado !== 'abierto' && tipo !== 'factura_comision' && tipo !== 'otro') return { error: `El negocio está ${n.estado}: reábrelo para registrar este pago.` };
              const ya = n.tipo === 'arriendo' ? ({ reserva: n.ciclo?.pagos?.reserva, garantia: n.ciclo?.pagos?.garantia, primer_mes: n.ciclo?.pagos?.primerMes, comision: n.ciclo?.comision?.pago, factura_comision: n.ciclo?.comision?.factura } as Record<string, unknown>)[tipo] : null;
              const aviso = ({ reserva: 'Al registrar la reserva, el negocio pasa a «Reserva» y la propiedad queda reservada.', comision: 'Al registrar el pago de la comisión, el negocio se cierra como ganado y parte el postarriendo.' } as Record<string, string>)[tipo];
              return {
                args: { negocioId: r.v.id, ...datos, referencia: txt(a, 'referencia'), nota: txt(a, 'nota'), numero: txt(a, 'numero_factura') },
                resumen: { accion: tipo === 'factura_comision' ? 'Registrar la factura de la comisión' : 'Registrar el pago', negocio: this.resumen(n), corresponde: tipo === 'factura_comision' ? 'Factura de la comisión' : TIPO_PAGO[tipo], monto: montoTxt(datos.monto, datos.moneda), fecha: fdmy(datos.fecha), ...(tipo === 'factura_comision' ? { factura: txt(a, 'numero_factura') || 's/n' } : { medio: MEDIO_PAGO[datos.medio] }), ...(ya ? { advertencia: 'Ya hay un registro de este tipo: se reemplaza.' } : {}), ...(aviso ? { efecto: aviso } : {}) },
              };
            },
            async (args) => {
              const id = String(args.negocioId);
              if (args.tipo_pago === 'factura_comision') {
                const x = await this.acc.factura(this.tok(c), id, { numero: String(args.numero || ''), fecha: String(args.fecha), monto: Number(args.monto), moneda: String(args.moneda) as 'CLP' });
                return this.respuesta(x, `Listo: registré la factura de la comisión de ${x.negocio.codigo} (${montoTxt(args.monto, String(args.moneda))}).`);
              }
              const x = await this.acc.pago(this.tok(c), id, { tipo: args.tipo_pago as 'reserva', monto: Number(args.monto), moneda: String(args.moneda) as 'CLP', fecha: String(args.fecha), medio: String(args.medio) as 'otro', nota: String(args.nota || ''), referencia: String(args.referencia || '') });
              return this.respuesta(x, `Listo: registré el pago (${TIPO_PAGO[String(args.tipo_pago)]}, ${montoTxt(args.monto, String(args.moneda))}) en ${x.negocio.codigo}.`);
            },
          ),
      ),
      h(
        'subir_comprobante',
        `Sube a un negocio el COMPROBANTE DE PAGO (PDF o foto) que el corredor acaba de mandar por WhatsApp y registra el pago con su monto, moneda, fecha y medio. El archivo ya está en este chat: NO pidas que lo reenvíe. REGLAS: (1) SIEMPRE pregunta a qué negocio va, aunque la propiedad tenga uno solo: muestra las opciones con su código NG-XXX (tipo, propiedad, cliente, etapa) y solo llama con el código cuando el corredor lo escribió o lo eligió; si ya escribió el código NG-XXX, no preguntes. (2) La herramienta lee el comprobante (monto, moneda, fecha, medio, referencia): lo que traiga NO se pregunta; pregunta SOLO lo que la herramienta diga que falta, todo junto en un mensaje. (3) Si el negocio es de arriendo, pregunta a qué corresponde: reserva, garantía, primer mes, comisión u otro (si el texto del corredor ya lo dice, no preguntes); en una venta es «otro». (4) Antes de registrar, muestra el resumen y pide su sí. ${SUMA_DOS_PASOS}`,
        esquema(
          {
            negocio: { type: 'string', description: 'Código del negocio (NG-014). Déjalo vacío si el corredor aún no dijo a cuál va: la herramienta te devuelve las opciones para preguntar.' },
            tipo_pago: { type: 'string', enum: ['reserva', 'garantia', 'primer_mes', 'comision', 'otro'], description: 'A qué corresponde (en una venta, «otro»)' },
            monto: { type: 'number', description: 'Solo si el comprobante no lo trae o el corredor lo corrigió' },
            moneda: { type: 'string', enum: ['CLP', 'UF', 'USD'] },
            fecha: { type: 'string', description: 'AAAA-MM-DD; solo si el comprobante no la trae o el corredor la corrigió' },
            medio: { type: 'string', enum: ['transferencia', 'deposito', 'efectivo', 'cheque', 'tarjeta', 'otro'] },
            referencia: { type: 'string' },
            nota: { type: 'string' },
            confirmado: CONFIRMADO,
          },
          [],
        ),
        (c, a) => this.comprobante(c, a),
      ),
      // ------------------------------------------------------------------ aceptación, evaluación, contrato, postarriendo
      h(
        'aceptacion_propietario',
        'Negociación con el propietario (paso «Aceptación del propietario»): registra su respuesta a la oferta (acepta, contraoferta, rechaza) y, tras una contraoferta, la del interesado (acepta, hace otra oferta o desiste). «ver» muestra la oferta vigente y las rondas. Al aceptarse, el precio y las condiciones del negocio quedan con lo acordado. Pregunta SOLO lo que falte (el monto de una contraoferta, el motivo de un rechazo).',
        esquema(
          {
            negocio: NEGOCIO,
            accion: { type: 'string', enum: ['ver', 'acepta', 'contraoferta', 'rechaza', 'oferta'], description: 'acepta/rechaza: responde quien toque (propietario, o interesado si hubo contraoferta); oferta: nueva oferta del interesado' },
            monto: { type: 'number', description: 'Para contraoferta u oferta' },
            moneda: { type: 'string', enum: ['UF', 'CLP', 'USD'] },
            garantia: { type: 'string' },
            plazo: { type: 'string' },
            condiciones: { type: 'string' },
            nota: { type: 'string', description: 'Motivo (obligatorio al rechazar)' },
          },
          ['negocio'],
        ),
        async (c, a) => {
          const r = await this.buscar(c, a);
          if (!r.ok) return { error: r.error };
          const accion = txt(a, 'accion') || 'ver';
          if (accion === 'ver') {
            const v = await this.acc.ver(this.tok(c), r.v.id);
            return { ok: true, negocio: (v.codigo ?? v.id), negociacion: v.negociacion };
          }
          if (!['acepta', 'contraoferta', 'rechaza', 'oferta'].includes(accion)) return { error: 'La acción es ver, acepta, contraoferta, rechaza u oferta.' };
          const x = await this.acc.aceptacion(this.tok(c), r.v.id, { accion: accion as 'acepta', monto: num(a, 'monto') ?? undefined, moneda: MONEDAS.includes(txt(a, 'moneda')) ? (txt(a, 'moneda') as 'UF') : undefined, garantia: txt(a, 'garantia'), plazo: txt(a, 'plazo'), condiciones: txt(a, 'condiciones'), nota: txt(a, 'nota') });
          const ult = (x.negocio.aceptacion?.rondas || []).slice(-1)[0];
          return this.respuesta(x, `Listo: registré «${ult?.tipo}» en la negociación de ${x.negocio.codigo}.`, { ultimaRonda: ult });
        },
      ),
      h(
        'evaluacion_arrendatario',
        'Evaluación de documentos del arrendatario (y avales) de un arriendo. «ver»: estado de lo recibido, lo que falta y el puntaje. «solicitar»: le manda por WhatsApp al arrendatario (y a cada aval indicado) la solicitud de documentos con una plantilla aprobada: eso escribe a TERCEROS, por eso va en dos pasos (primero sin confirmado, muestra a quién, y solo con el sí del corredor con confirmado: true). «decidir»: registra la decisión DEL CORREDOR (aprobada, rechazada o pendiente) del arrendatario o de un aval; el puntaje es solo una ayuda: nunca decidas tú.',
        esquema(
          {
            negocio: NEGOCIO,
            accion: { type: 'string', enum: ['ver', 'solicitar', 'decidir'] },
            avales: { type: 'array', items: { type: 'string' }, description: 'solicitar: RUT, nombre o correo de cada aval (deben estar en el CRM con celular)' },
            persona: { type: 'string', description: 'decidir: la persona (arrendatario o aval); sin ella, la decisión es de toda la evaluación' },
            decision: { type: 'string', enum: ['aprobada', 'rechazada', 'pendiente'] },
            nota: { type: 'string' },
            confirmado: CONFIRMADO,
          },
          ['negocio'],
        ),
        async (c, a) => {
          const accion = txt(a, 'accion') || 'ver';
          if (accion === 'solicitar')
            return this.dosPasos(
              c,
              'evaluacion_solicitar',
              a,
              async (a) => {
                const r = await this.buscar(c, a);
                if (!r.ok) return { error: r.error };
                if (r.v.tipo !== 'arriendo') return { error: 'La evaluación de documentos es de los negocios de arriendo.' };
                if (!r.v.clienteId) return { error: 'El negocio no tiene arrendatario.' };
                const avales: { id: string; nombre: string }[] = [];
                for (const ref of Array.isArray(a.avales) ? a.avales : []) {
                  const p = await this.ayudas.persona(c, ref);
                  if (!p.ok) return { error: p.error };
                  avales.push({ id: p.v.id, nombre: p.v.nombre });
                }
                const cli = await this.db.persona.findUnique({ where: { id: r.v.clienteId }, select: { nombre: true, telefono: true } });
                return {
                  args: { negocioId: r.v.id, avales: avales.map((x) => x.id) },
                  resumen: { accion: 'Pedir la documentación por WhatsApp', negocio: (r.v.datos as { codigo?: string })?.codigo ?? r.v.id, aQuien: [`${cli?.nombre} (arrendatario)`, ...avales.map((x) => `${x.nombre} (aval)`)], aviso: 'Les escribo por WhatsApp con una plantilla aprobada: es un mensaje a terceros.' },
                };
              },
              async (args) => {
                const ev = await (await this.evaluacion()).solicitar(this.tok(c), String(args.negocioId), (args.avales as string[]) ?? [], true);
                return { ok: true, mensaje: 'Listo: les pedí la documentación por WhatsApp. Te aviso cuando la manden.', personas: ev.personas.map((p) => ({ nombre: p.nombre, rol: p.rol })) };
              },
            );
          const r = await this.buscar(c, a);
          if (!r.ok) return { error: r.error };
          if (accion === 'decidir') {
            const dec = txt(a, 'decision');
            if (!['aprobada', 'rechazada', 'pendiente'].includes(dec)) return { error: 'La decisión es aprobada, rechazada o pendiente.' };
            let personaId: string | undefined;
            if (txt(a, 'persona')) {
              const ev = (await (await this.evaluacion()).ver(this.tok(c), r.v.id)) as { personas?: { personaId: string; nombre: string }[] };
              const q = norm(txt(a, 'persona'));
              const hit = (ev.personas || []).filter((p) => p.personaId === txt(a, 'persona') || norm(p.nombre).includes(q));
              if (hit.length !== 1) return { error: `Indica la persona exacta: ${(ev.personas || []).map((p) => p.nombre).join(' | ') || 'no hay evaluación abierta'}.` };
              personaId = hit[0].personaId;
            }
            const ev = await (await this.evaluacion()).decidir(this.tok(c), r.v.id, { decision: dec as 'aprobada', nota: txt(a, 'nota'), ...(personaId ? { personaId } : {}) });
            return { ok: true, mensaje: `Listo: decisión «${dec}» registrada.`, evaluacion: this.compactarEvaluacion(ev) };
          }
          return { ok: true, negocio: (r.v.datos as { codigo?: string })?.codigo ?? r.v.id, evaluacion: (await this.resumenEvaluacion(c, r.v.id)) ?? { vacia: true, nota: 'Todavía no se pidió la documentación.' } };
        },
      ),
      h(
        'aprobar_contrato',
        'Revisión del texto del contrato de arriendo: registra que un firmante (o todos) aprobó la última versión del texto, o quita esa aprobación. Cuando todos aprueban, el paso «Revisión del contrato» queda logrado. Si no sabes quién, usa ver_negocio (campo contrato) y pregunta.',
        esquema({ negocio: NEGOCIO, firmante: { type: 'string', description: 'Nombre del firmante que aprobó (o «todos»)' }, aprobado: { type: 'boolean', description: 'false = quitar la aprobación' } }, ['negocio', 'firmante']),
        async (c, a) => {
          const r = await this.buscar(c, a);
          if (!r.ok) return { error: r.error };
          const v = await this.acc.ver(this.tok(c), r.v.id);
          const fs = v.contrato?.firmantes ?? [];
          if (!fs.length) return { error: 'Todavía no hay una versión del contrato con firmantes para revisar.' };
          const ref = norm(txt(a, 'firmante'));
          const todos = /^(todos|todas)$/.test(ref);
          const hit = fs.filter((q: { nombre: string }) => norm(q.nombre).includes(ref));
          if (!todos && hit.length !== 1) return { error: `Indica el firmante: ${fs.map((q: { nombre: string }) => q.nombre).join(' | ')}.` };
          const x = await this.acc.contratoAprobar(this.tok(c), r.v.id, { ...(todos ? { todos: true } : { personaId: hit[0].personaId }), aprobado: a.aprobado !== false });
          return this.respuesta(x, `Listo: ${a.aprobado === false ? 'quité la aprobación de' : 'registré la aprobación de'} ${todos ? 'todos los firmantes' : hit[0].nombre}.`);
        },
      ),
      h(
        'registrar_postarriendo',
        'Postarriendo de un arriendo ya entregado (necesita inicio y plazo del contrato): «reajuste» (IPC aplicado; la renta nueva se calcula sola si no se indica), «renovacion» (renovar por N meses, o término del contrato), «devolucion» (devolución de la garantía: recepción, descuento y su motivo, fecha; si el corredor mandó el comprobante, indica adjuntar_archivo) o quitar una renovación o devolución mal registrada. Pregunta SOLO lo que falte.',
        esquema(
          {
            negocio: NEGOCIO,
            tipo: { type: 'string', enum: ['reajuste', 'renovacion', 'devolucion', 'quitar_renovacion', 'quitar_devolucion'] },
            ipc: { type: 'number', description: 'reajuste: % de IPC aplicado' },
            renta_nueva: { type: 'number', description: 'reajuste: renta nueva (opcional)' },
            desde: { type: 'string', description: 'reajuste: desde cuándo rige, AAAA-MM-DD (por defecto la fecha que toca)' },
            decision: { type: 'string', enum: ['renovar', 'termino'], description: 'renovacion' },
            meses: { type: 'number', description: 'renovacion: por cuántos meses' },
            nota: { type: 'string' },
            fecha_recepcion: { type: 'string', description: 'devolucion: cuándo se recibió la propiedad, AAAA-MM-DD' },
            conforme: { type: 'boolean', description: 'devolucion: conforme con el inventario' },
            descuento: { type: 'number', description: 'devolucion: monto descontado de la garantía (0 si ninguno)' },
            motivo_descuento: { type: 'string' },
            fecha_devolucion: { type: 'string', description: 'devolucion: cuándo se devolvió la garantía, AAAA-MM-DD' },
            adjuntar_archivo: { type: 'boolean', description: 'devolucion: usar el archivo que el corredor mandó como comprobante' },
          },
          ['negocio', 'tipo'],
        ),
        async (c, a) => {
          const r = await this.buscar(c, a);
          if (!r.ok) return { error: r.error };
          const tipo = txt(a, 'tipo');
          let o: Parameters<NegocioAccionesService['postarriendo']>[2];
          if (tipo === 'reajuste') {
            if (num(a, 'ipc') == null) return { error: 'Pregúntale al corredor SOLO esto: el IPC aplicado (%).' };
            o = { tipo, ipc: num(a, 'ipc')!, ...(num(a, 'renta_nueva') != null ? { rentaNueva: num(a, 'renta_nueva')! } : {}), ...(esDia(txt(a, 'desde')) ? { desde: txt(a, 'desde') } : {}) };
          } else if (tipo === 'renovacion') {
            if (!['renovar', 'termino'].includes(txt(a, 'decision'))) return { error: 'Pregúntale si se renueva o termina el contrato (y, si renueva, por cuántos meses).' };
            o = { tipo, decision: txt(a, 'decision') as 'renovar', ...(num(a, 'meses') != null ? { meses: num(a, 'meses')! } : {}), nota: txt(a, 'nota') };
          } else if (tipo === 'devolucion') {
            const f1 = txt(a, 'fecha_recepcion') || hoy();
            const f2 = txt(a, 'fecha_devolucion') || hoy();
            if (!esDia(f1) || !esDia(f2)) return { error: 'Las fechas van como AAAA-MM-DD.' };
            const adj = a.adjuntar_archivo === true ? c.adjuntos[0] : null;
            if (a.adjuntar_archivo === true && !adj) return { error: 'No recibí el archivo en este mensaje: que lo mande de nuevo.' };
            const comprobante = adj ? await this.acc.subirComprobante(this.tok(c), r.v.id, { nombre: adj.nombre, mime: adj.mime, bytes: adj.bytes }) : null;
            o = { tipo, fechaRecepcion: f1, fechaDevolucion: f2, conforme: a.conforme !== false, descuento: num(a, 'descuento') ?? 0, motivo: txt(a, 'motivo_descuento'), ...(comprobante ? { comprobante } : {}) };
          } else if (tipo === 'quitar_renovacion' || tipo === 'quitar_devolucion') o = { tipo };
          else return { error: 'El tipo es reajuste, renovacion, devolucion, quitar_renovacion o quitar_devolucion.' };
          const x = await this.acc.postarriendo(this.tok(c), r.v.id, o);
          return this.respuesta(x, `Listo: registré ${tipo.replace('_', ' ')} en ${x.negocio.codigo}.`, { postarriendo: x.negocio.ciclo?.postarriendo ?? null });
        },
      ),
    ];
  }

  // ================================================================================================ evaluación
  private compactarEvaluacion(ev: any) {
    if (!ev || ev.vacia) return null;
    return {
      estado: ev.estado,
      decision: ev.decision ? ev.decision.estado : null,
      puntaje: ev.analisis ? { porcentaje: ev.analisis.porcentaje, nivel: ev.analisis.nivel, resumen: ev.analisis.resumen } : null,
      personas: (ev.personas || []).map((p: any) => ({ nombre: p.nombre, rol: p.rol, solicitada: fechaIso(new Date(p.solicitadaEn)), archivos: (p.archivos || []).length, completa: !!p.completa, faltan: p.faltan ?? [], decision: p.decision?.estado ?? null, puntaje: p.analisis?.porcentaje ?? null })),
    };
  }
  private async resumenEvaluacion(c: CtxHerr, negocioId: string) {
    return this.compactarEvaluacion(await (await this.evaluacion()).ver(this.tok(c), negocioId));
  }

  // ================================================================================================ comprobante
  /** el flujo de subir_comprobante: negocio → leer el archivo → preguntar solo lo que falte → resumen → «sí» → subir y registrar */
  private async comprobante(c: CtxHerr, a: A): Promise<unknown> {
    const tok = this.tok(c);
    const confirma = a.confirmado === true;
    // el archivo: el que llegó en este mensaje, o el recordado (el «sí» y las respuestas llegan en otros mensajes)
    const nuevo = c.adjuntos[0];
    let pend = this.adjuntos.get(c.usuarioId);
    if (pend && Date.now() - pend.en > ADJUNTO_MS) pend = undefined;
    if (nuevo && pend?.adj !== nuevo && !(pend && pend.adj.bytes.equals(nuevo.bytes))) pend = { adj: nuevo, lectura: null, en: Date.now() };
    if (!pend) return { error: 'No tengo el comprobante: que el corredor lo mande de nuevo por WhatsApp (PDF o foto).' };
    this.adjuntos.set(c.usuarioId, pend);

    // ---- paso 2: se registra lo que se armó (y solo ante un «sí» puro de este mensaje)
    if (confirma) {
      const prep = this.preparadas.get(c.usuarioId);
      if (!prep || prep.accion !== 'subir_comprobante' || Date.now() - prep.en > VIGENCIA_MS)
        return { error: 'Primero hay que armar el resumen y mostrárselo al corredor (llama la herramienta sin confirmado). No hay nada preparado o venció (15 minutos).' };
      if (!asiente(c.texto)) return { error: 'El corredor todavía no confirmó: pregúntale si lo registro y espera su sí. Si corrigió algo, arma el resumen de nuevo.' };
      this.preparadas.delete(c.usuarioId);
      const g = prep.args;
      const meta = await this.acc.subirComprobante(tok, String(g.negocioId), { nombre: pend.adj.nombre, mime: pend.adj.mime, bytes: pend.adj.bytes });
      const x = await this.acc.pago(tok, String(g.negocioId), { tipo: g.tipo_pago as 'reserva', monto: Number(g.monto), moneda: String(g.moneda) as 'CLP', fecha: String(g.fecha), medio: String(g.medio) as 'otro', nota: String(g.nota || ''), referencia: String(g.referencia || ''), comprobante: meta });
      this.adjuntos.delete(c.usuarioId);
      return this.respuesta(x, `Listo: subí el comprobante (${TIPO_PAGO[String(g.tipo_pago)]}, ${montoTxt(g.monto, String(g.moneda))}) al negocio ${x.negocio.codigo}.`);
    }

    // ---- ¿a qué negocio va? Siempre se pregunta, salvo que el corredor haya dado el código NG-XXX
    const ref = txt(a, 'negocio');
    if (!this.ayudas.codigosNegocio(ref).length && !UUID.test(ref)) {
      const opciones = await this.opciones(c, ref);
      return { preguntar: 'negocio', mensaje: 'Pregúntale al corredor a qué negocio va este comprobante (por su código NG-XXX). No elijas tú.', opciones, ...(opciones.length ? {} : { nota: 'No hay negocios abiertos: primero hay que crearlo.' }) };
    }
    const r = await this.ayudas.negocio(c, ref, false);
    if (!r.ok) return { error: r.error };
    const n = negocioApp(r.v) as Doc;

    // ---- leer el comprobante (una vez) y mezclar con lo que dijo el corredor
    if (!pend.lectura) {
      try {
        pend.lectura = await this.leerComprobante.leer(tok, pend.adj.bytes.toString('base64'), pend.adj.mime);
      } catch (e) {
        pend.lectura = { esComprobante: true, monto: null, moneda: null, fecha: null, medio: null, banco: '', referencia: '', emisor: '', destinatario: '', concepto: '', avisos: [`No pude leer el archivo (${(e as Error).message.slice(0, 120)}): hay que preguntar todos los datos.`] };
      }
    }
    const l = pend.lectura;
    const dicho = { monto: num(a, 'monto'), moneda: txt(a, 'moneda').toUpperCase(), fecha: txt(a, 'fecha'), medio: txt(a, 'medio') };
    const datos = {
      tipo_pago: n.tipo === 'venta' ? 'otro' : txt(a, 'tipo_pago'),
      monto: dicho.monto ?? l.monto,
      moneda: MONEDAS.includes(dicho.moneda) ? dicho.moneda : l.moneda,
      fecha: esDia(dicho.fecha) ? dicho.fecha : l.fecha,
      medio: dicho.medio || l.medio,
    };
    const leido = { monto: l.monto, moneda: l.moneda, fecha: l.fecha, medio: l.medio, banco: l.banco || null, referencia: l.referencia || null, concepto: l.concepto || null, destinatario: l.destinatario || null, avisos: l.avisos };
    if (!l.esComprobante && dicho.monto == null) return { error: 'Ese archivo no parece un comprobante de pago. Pídele al corredor que lo revise o que mande el correcto.', leido };
    const faltan = faltantesPago(n.tipo, datos);
    if (faltan.length) return { preguntar: 'datos', faltan, mensaje: `Pregúntale al corredor SOLO esto (todo junto, en un mensaje): ${faltan.join(', ')}. Lo demás ya lo leí del comprobante: no lo preguntes.`, leido, negocio: this.resumen(n) };
    if (n.estado !== 'abierto' && n.tipo === 'arriendo' && datos.tipo_pago !== 'otro') return { error: `El negocio está ${n.estado}: reábrelo para registrar este pago.` };
    const ya = n.tipo === 'arriendo' ? ({ reserva: n.ciclo?.pagos?.reserva, garantia: n.ciclo?.pagos?.garantia, primer_mes: n.ciclo?.pagos?.primerMes, comision: n.ciclo?.comision?.pago } as Record<string, unknown>)[datos.tipo_pago] : null;
    const aviso = ({ reserva: 'Al registrar la reserva, el negocio pasa a «Reserva» y la propiedad queda reservada.', comision: 'Al registrar el pago de la comisión, el negocio se cierra como ganado y parte el postarriendo.' } as Record<string, string>)[datos.tipo_pago];
    const referencia = txt(a, 'referencia') || l.referencia || '';
    const args: A = { negocioId: r.v.id, ...datos, referencia, nota: txt(a, 'nota') };
    this.preparadas.set(c.usuarioId, { accion: 'subir_comprobante', args, en: Date.now(), texto: c.texto });
    return {
      ok: true,
      ejecutado: false,
      necesitaConfirmacion: true,
      accion: 'Subir el comprobante y registrar el pago',
      negocio: this.resumen(n),
      corresponde: TIPO_PAGO[datos.tipo_pago],
      monto: montoTxt(datos.monto, datos.moneda!),
      fecha: fdmy(datos.fecha),
      medio: MEDIO_PAGO[datos.medio!] ?? datos.medio,
      ...(referencia ? { referencia } : {}),
      archivo: pend.adj.nombre,
      ...(ya ? { advertencia: 'Ya hay un pago de este tipo registrado: se reemplaza.' } : {}),
      ...(aviso ? { efecto: aviso } : {}),
      indicacion: 'NO se ha subido ni registrado nada todavía. Muéstrale este resumen al corredor y pregúntale si lo registro. Cuando conteste que sí, llama subir_comprobante de nuevo con confirmado: true (sin cambiar nada); si corrige algo, llámala otra vez sin confirmado con el cambio.',
    };
  }
}
