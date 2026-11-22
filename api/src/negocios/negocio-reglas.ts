/* eslint-disable @typescript-eslint/no-explicit-any -- el negocio es un documento JSON libre (datos + columnas), igual que en la app */
// Reglas PURAS de los negocios (venta y arriendo): etapas, tareas, pasos con su estado, documentos, estado que le toca a la propiedad y
// las cuentas del postarriendo. Es el port fiel de desktop/src/negocios.js y desktop/src/etapas.js: la lógica vive UNA sola vez, aquí,
// y la usan el servicio REST (negocio-acciones.ts) y las herramientas de WhatsApp. No toca la base ni la red: todo llega por parámetro.
//
// «Negocio» = el documento que devuelve negocioApp (negocios.ts): lo de `datos` más id, tipo, estado, etapa, propId, clienteId, corredorId.

import { avance, type PropFicha } from '../propiedades/ficha-campos';

export type Doc = Record<string, any>;
export type Tipo = 'venta' | 'arriendo';

// ---------------------------------------------------------------------------------------------------- etapas del embudo
export interface EtapaDef {
  id: string;
  t: string;
  d: string;
  tareas: string[];
  /** el documento que debe quedar firmado para completar la etapa */
  firma?: string;
  /** estado que toma la propiedad al llegar a esta etapa */
  estado?: 'reservada' | 'vendida';
  final?: boolean;
}

export const ETAPAS: Record<Tipo, EtapaDef[]> = {
  venta: [
    { id: 'interes', t: 'Interesado', d: 'Primer contacto: consulta, lead del portal o referido.', tareas: ['Registrar al cliente con su RUT', 'Enviar la ficha de la propiedad'] },
    { id: 'visita', t: 'Visita', d: 'El cliente conoce la propiedad.', tareas: ['Agendar la visita', 'Registrar cómo le fue'] },
    { id: 'reserva', t: 'Oferta y reserva', d: 'Se acuerda el precio y el cliente reserva.', tareas: ['Acordar precio y condiciones', 'Recibir el dinero de la reserva'], firma: 'Oferta u orden de reserva', estado: 'reservada' },
    { id: 'promesa', t: 'Promesa', d: 'Compraventa prometida, con plazo para escriturar.', tareas: ['Estudio de títulos', 'Aprobación del crédito (si aplica)'], firma: 'Promesa de compraventa' },
    { id: 'escritura', t: 'Escritura', d: 'Firma de la escritura de compraventa en notaría.', tareas: ['Coordinar la notaría', 'Revisar el borrador de escritura'], firma: 'Escritura de compraventa' },
    { id: 'inscripcion', t: 'Inscripción', d: 'Inscripción en el Conservador de Bienes Raíces.', tareas: ['Ingresar al Conservador', 'Recibir el dominio vigente'] },
    { id: 'entrega', t: 'Entrega', d: 'Entrega material y cobro de la comisión.', tareas: ['Entregar llaves', 'Cobrar la comisión'], firma: 'Acta de entrega', estado: 'vendida', final: true },
  ],
  arriendo: [
    { id: 'interes', t: 'Interesado', d: 'Primer contacto: consulta, lead del portal o referido.', tareas: ['Registrar al cliente con su RUT', 'Enviar la ficha de la propiedad'] },
    { id: 'visita', t: 'Visita', d: 'El cliente conoce la propiedad.', tareas: ['Agendar la visita', 'Registrar cómo le fue'] },
    { id: 'reserva', t: 'Reserva', d: 'El cliente reserva mientras se evalúa.', tareas: ['Recibir el dinero de la reserva'], firma: 'Reserva de arriendo', estado: 'reservada' },
    { id: 'evaluacion', t: 'Evaluación', d: 'Antecedentes del arrendatario y del codeudor.', tareas: ['Liquidaciones de sueldo o renta', 'Informe comercial', 'Codeudor o seguro de arriendo'] },
    { id: 'contrato', t: 'Contrato', d: 'Firma del contrato de arriendo.', tareas: ['Recibir garantía y primer mes'], firma: 'Contrato de arriendo' },
    // el acta de entrega es la firma «entrega_acta» (fuera del embudo): al firmarse la propiedad queda arrendada; el negocio lo cierra el cobro de la comisión
    { id: 'entrega', t: 'Entrega', d: 'Entrega con inventario y cobro de la comisión.', tareas: ['Entregar llaves', 'Cobrar la comisión'], final: true },
  ],
};

export const etapas = (tipo: string): EtapaDef[] => ETAPAS[tipo as Tipo] || ETAPAS.venta;
export const etapa = (tipo: string, id: string): EtapaDef | undefined => etapas(tipo).find((e) => e.id === id);
/** firmas que no son una etapa del embudo: firmarlas no mueve el negocio */
export const FIRMAS_FUERA: Record<string, { firma: string }> = {
  oferta: { firma: 'Carta oferta' },
  entrega_acta: { firma: 'Acta de entrega e inventario' },
};
export const ETAPAS_VALIDAS = ['interes', 'visita', 'reserva', 'promesa', 'escritura', 'inscripcion', 'evaluacion', 'contrato', 'entrega'];

// ---------------------------------------------------------------------------------------------------- formatos
export const fdm = (f: string | null | undefined) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '');
export const fdmy = (f: string | null | undefined) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');
export const montoTxt = (v: unknown, m?: string | null) => `${m === 'UF' ? 'UF ' : m === 'USD' ? 'US$ ' : '$'}${Number(v).toLocaleString('es-CL')}`;
export const esDia = (v: unknown): v is string => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
const dia = (v: unknown) => (esDia(v) ? String(v) : null);
const rutLimpio = (s: unknown) => String(s ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
/** suma meses y días a una fecha AAAA-MM-DD */
export const mas = (f: string, meses: number, dias = 0) => {
  const x = new Date(f + 'T12:00:00Z');
  x.setUTCMonth(x.getUTCMonth() + meses);
  x.setUTCDate(x.getUTCDate() + dias);
  return x.toISOString().slice(0, 10);
};

export const TIPO_PAGO: Record<string, string> = { reserva: 'Reserva', garantia: 'Garantía', primer_mes: 'Primer mes de arriendo', comision: 'Comisión', otro: 'Otro pago' };
export const MEDIO_PAGO: Record<string, string> = { transferencia: 'Transferencia', deposito: 'Depósito', efectivo: 'Efectivo', cheque: 'Cheque', tarjeta: 'Tarjeta', otro: 'Otro medio' };

// ---------------------------------------------------------------------------------------------------- vista derivada de un negocio
export const comisionMonto = (n: Doc): number | null =>
  n.comision?.valor == null ? null : n.comision.tipo === '%' ? ((n.valor?.valor || 0) * n.comision.valor) / 100 : n.comision.valor;

/** lo que la interfaz muestra además de lo guardado: la etapa, lo que falta y si la próxima acción venció */
export function vista(n: Doc, hoyStr: string, ahoraMs = Date.now()) {
  const et = etapa(n.tipo, n.etapa);
  const ord = etapas(n.tipo).findIndex((e) => e.id === n.etapa);
  const pend = (et?.tareas || []).filter((_, i) => !n.tareas?.[n.etapa]?.[i]);
  const f = n.firmas?.[n.etapa];
  let siguiente: string | null = null;
  if (n.estado === 'abierto') {
    if (et?.firma && (!f || f.estado !== 'firmado')) siguiente = f?.operacion ? `Esperando firmas: ${et.firma.toLowerCase()}` : `Falta firmar: ${et.firma.toLowerCase()}`;
    else if (pend.length) siguiente = pend[0];
    else if (!et?.final) siguiente = `Listo para pasar a ${etapas(n.tipo)[ord + 1]?.t}`;
  }
  return {
    etapaInfo: et ?? null,
    orden: ord,
    total: etapas(n.tipo).length,
    siguiente,
    pendientes: pend.length,
    tareasPendientes: pend,
    diasEnEtapa: Math.floor((ahoraMs - new Date(n.etapaDesde || n.creado).getTime()) / 864e5),
    comisionMonto: comisionMonto(n),
    vencida: !!(n.estado === 'abierto' && n.proximaAccion?.fecha && n.proximaAccion.fecha < hoyStr),
  };
}

// ---------------------------------------------------------------------------------------------------- lo que hay que saber de afuera
export interface VisitaCtx {
  fecha: string;
  hora: string | null;
  estado: string;
  negocioId: string | null;
  personaIds: string[];
  confirmacion?: { estado?: string; nombre?: string; respuesta?: string } | null;
}
export interface FirmaCtx {
  plantilla: string;
  estado: string;
  operacion: number | null;
  fecha: string;
  firmado: string | null;
  negocioId: string | null;
  firmantes: { personaId?: string; rut?: string }[];
}
export interface PropCtx {
  id: string;
  codigo: string;
  titulo: string;
  comuna: string | null;
  venta: boolean;
  arriendo: boolean;
  estadoVenta: string | null;
  estadoArriendo: string | null;
  fotos: number;
  publicada: boolean;
  /** la propiedad como la mira la ficha (precios como {valor, moneda}, ficha, propietario vinculado): de ahí salen los bloques de la captación */
  ficha?: PropFicha | null;
  creado?: string | null;
}
/** lo que se necesita de la propiedad, sus firmas y su agenda para deducir el estado de cada paso */
export interface CtxPasos {
  prop: PropCtx | null;
  firmasProp: FirmaCtx[];
  visitas: VisitaCtx[];
  clienteNombre: string | null;
  clienteRut: string | null;
  hoy: string;
  ahora: string;
}

// ---------------------------------------------------------------------------------------------------- documentos del negocio
/** Todos los documentos del negocio, en el orden del proceso, con su estado (los que aún no se arman salen «pendiente»). */
export function documentos(n: Doc, ctx: CtxPasos) {
  const fdmD = (f: unknown) => (f ? String(f).slice(0, 10) : null);
  const rutC = rutLimpio(ctx.clienteRut);
  const deVisita = (re: RegExp): FirmaCtx | null => {
    // la firma de la propiedad que es de ESTE negocio (o suelta, pero del mismo cliente)
    const suyas = ctx.firmasProp.filter(
      (x) =>
        re.test(x.plantilla || '') &&
        (x.negocioId === n.id ||
          (!x.negocioId && x.firmantes.some((q) => (n.clienteId && q.personaId === n.clienteId) || (rutC && q.rut && rutLimpio(q.rut) === rutC)))),
    );
    return suyas.find((x) => x.estado === 'firmado') || suyas[0] || null;
  };
  const doc = (id: string, titulo: string, et: string | null, f: any, detalle?: string | null) => ({
    id,
    titulo,
    etapa: et || null,
    estado: f?.estado === 'firmado' ? 'firmado' : f?.operacion || f?.estado === 'en_firma' ? 'en_firma' : 'pendiente',
    operacion: f?.operacion || null,
    firmados: f?.firmados ?? null,
    total: f?.total ?? null,
    fecha: fdmD(f?.firmado || f?.fecha),
    fuera: !!f?.fuera,
    detalle: detalle || null,
  });
  const out: any[] = [];
  const usadas = new Set<string>();
  const firma = (k: string, et?: string) => {
    usadas.add(k);
    out.push(doc(k, (etapa(n.tipo, k) || FIRMAS_FUERA[k] || { firma: 'Documento' }).firma!, et || etapa(n.tipo, k)?.t || null, n.firmas?.[k]));
  };
  out.push(doc('orden', 'Orden de visita', 'Visita', deVisita(/orden de visita/i)));
  out.push(doc('acta', 'Acta de visita', 'Visita', deVisita(/^acta de visita/i)));
  if (n.tipo === 'arriendo') {
    firma('oferta', 'Reserva');
    firma('reserva');
    const k = n.ciclo?.contrato;
    const v = (k?.versiones || []).slice(-1)[0];
    if (v) {
      const fs = v.firmantes || [];
      const ap = k.aprobado || {};
      const faltan = fs.filter((q: any) => !ap[q.personaId]);
      out.push({
        id: 'contrato_texto',
        titulo: 'Contrato de arriendo (texto)',
        etapa: 'Contrato',
        estado: fs.length && !faltan.length ? 'aprobado' : 'revision',
        operacion: null,
        firmados: fs.length - faltan.length,
        total: fs.length,
        fecha: null,
        fuera: false,
        detalle: `Versión ${v.n}${fs.length ? (faltan.length ? ` · falta que aprueben ${faltan.map((q: any) => q.nombre).join(', ')}` : ' · aprobado por todos los firmantes') : ' · sin firmantes registrados'}`,
      });
    }
    firma('contrato');
    firma('entrega_acta', 'Entrega');
  } else for (const e of etapas(n.tipo)) if (e.firma) firma(e.id);
  // cualquier otra firma ligada al negocio
  for (const [k, f] of Object.entries<any>(n.firmas || {}))
    if (!usadas.has(k)) out.push(doc(k, (etapa(n.tipo, k) || FIRMAS_FUERA[k] || { firma: 'Documento' }).firma!, etapa(n.tipo, k)?.t || null, f));
  return out;
}

// ---------------------------------------------------------------------------------------------------- estado de la propiedad según sus negocios
export const rangoEstado = (e: string) => ({ disponible: 0, reservada: 1, arrendada: 2, vendida: 2 } as Record<string, number>)[e] ?? 0;

/**
 * El estado comercial que le toca a la propiedad según la etapa más avanzada de sus negocios abiertos o ganados de ese tipo (`hermanos`),
 * o null si no hay que cambiarlo. `actual` es el estado que tiene hoy en ese campo (estadoVenta o estadoArriendo).
 */
export function estadoObjetivo(tipo: string, hermanos: Doc[], actual: string | null): string | null {
  let objetivo: string | null = null;
  for (const x of hermanos.filter((h) => h.tipo === tipo && (h.estado === 'abierto' || h.estado === 'ganado'))) {
    const idx = etapas(x.tipo).findIndex((e) => e.id === x.etapa);
    const marcas = etapas(x.tipo)
      .slice(0, idx + 1)
      .filter((e) => e.estado)
      .map((e) => e.estado as string);
    if (x.estado === 'ganado' && x.tipo === 'venta') marcas.push('vendida');
    if ((x.estado === 'ganado' && x.tipo === 'arriendo') || (x.tipo === 'arriendo' && x.firmas?.entrega_acta?.estado === 'firmado')) marcas.push('arrendada');
    const ult = marcas.pop();
    if (ult && (!objetivo || rangoEstado(ult) > rangoEstado(objetivo))) objetivo = ult;
  }
  if (!objetivo && actual === 'reservada') objetivo = 'disponible'; // se cayó el negocio: vuelve a estar disponible
  if (objetivo && actual !== objetivo && !(actual === 'no_disponible' && objetivo === 'disponible')) return objetivo;
  return null;
}

// ---------------------------------------------------------------------------------------------------- pasos (3 etapas) y su estado
export interface PasoDef {
  id: string;
  t: string;
  a: string;
  tipo: string;
  etapa?: string;
  tarea?: [string, number];
  tareas?: [string, number[]];
  /** captación: el bloque de la ficha (ficha-campos.ts) que representa el paso */
  bloque?: string;
}
// Captación (de la propiedad): los 5 bloques de la ficha, el mandato, las fotos y la publicación; mismo orden y textos que desktop/src/etapas.js
export const CAPT: PasoDef[] = [
  { id: 'datos', t: 'Lo esencial', a: 'Completar lo esencial', tipo: 'ficha', bloque: 'esencial' },
  { id: 'portal', t: 'Datos para los portales', a: 'Completar datos para portales', tipo: 'ficha', bloque: 'portal' },
  { id: 'legal', t: 'Propietario y datos legales', a: 'Completar propietario y datos legales', tipo: 'ficha', bloque: 'legal' },
  { id: 'mandato', t: 'Mandato firmado', a: 'Enviar mandato a firmar', tipo: 'agente' },
  { id: 'equip', t: 'Equipamiento y terminaciones', a: 'Completar equipamiento', tipo: 'ficha', bloque: 'equip' },
  { id: 'fotos', t: 'Fotos', a: 'Cargar fotos', tipo: 'fotos' },
  { id: 'comovisitar', t: 'Visita y publicación', a: 'Completar cómo se visita', tipo: 'ficha', bloque: 'visita' },
  { id: 'publicada', t: 'Publicada en portales', a: 'Publicar en portales', tipo: 'ficha' },
];
const COM: PasoDef[] = [
  { id: 'interesado', t: 'Interesado registrado', a: 'Crear el negocio', tipo: 'negocio' },
  { id: 'visita', t: 'Visita y orden de visita', a: 'Agendar visita', tipo: 'agente' },
  { id: 'acta', t: 'Acta de visita', a: 'Hacer el acta de visita', tipo: 'acta' },
  { id: 'negociacion', t: 'Negociación', a: 'Marcar como logrado', tipo: 'ok' },
  { id: 'carta', t: 'Carta oferta', a: 'Enviar carta oferta a firmar', tipo: 'firma', etapa: 'reserva' },
];
const POST_VENTA: PasoDef[] = [
  { id: 'reserva_pago', t: 'Reserva pagada', a: 'Marcar como logrado', tipo: 'ok', tarea: ['reserva', 1] },
  { id: 'financiamiento', t: 'Financiamiento aprobado', a: 'Marcar como logrado', tipo: 'ok', tarea: ['promesa', 1] },
  { id: 'titulos', t: 'Estudio de títulos', a: 'Marcar como logrado', tipo: 'ok', tarea: ['promesa', 0] },
  { id: 'promesa', t: 'Promesa firmada', a: 'Enviar promesa a firmar', tipo: 'firma', etapa: 'promesa' },
  { id: 'escritura', t: 'Escritura firmada', a: 'Preparar borrador de escritura', tipo: 'firma', etapa: 'escritura' },
  { id: 'inscripcion', t: 'Inscripción en el Conservador', a: 'Marcar como logrado', tipo: 'ok', tareas: ['inscripcion', [0, 1]] },
  { id: 'entrega', t: 'Entrega con acta', a: 'Enviar acta a firmar', tipo: 'firma', etapa: 'entrega' },
  { id: 'comision', t: 'Comisión cobrada', a: 'Marcar como logrado', tipo: 'ok', tarea: ['entrega', 1] },
  { id: 'cierre', t: 'Cierre de la operación', a: 'Cerrar con éxito', tipo: 'cerrar' },
];
// ARRIENDO · 3 etapas: 1 Comercialización, 2 Cierre del arriendo y 3 Postarriendo (sus pasos los avisa Asset cuando corresponden)
const COM_ARR: PasoDef[] = [
  { id: 'interesado', t: 'Interesado registrado', a: 'Crear el negocio', tipo: 'negocio' },
  { id: 'visita', t: 'Visita y orden de visita', a: 'Agendar visita', tipo: 'agente' },
  { id: 'acta', t: 'Acta de visita', a: 'Hacer el acta de visita', tipo: 'acta' },
  { id: 'carta', t: 'Carta oferta', a: 'Enviar carta oferta a firmar', tipo: 'firma', etapa: 'oferta' }, // 'oferta' no es una etapa del embudo: firmarla no mueve el negocio
  { id: 'aceptacion', t: 'Aceptación del propietario', a: 'Registrar la respuesta', tipo: 'aceptacion' },
];
const CIERRE_ARR: PasoDef[] = [
  { id: 'reserva_pago', t: 'Reserva pagada', a: 'Registrar el pago', tipo: 'pago', tarea: ['reserva', 0] },
  { id: 'evaluacion', t: 'Evaluación del arrendatario', a: 'Solicitar documentación', tipo: 'evaluar', tareas: ['evaluacion', [0, 1, 2]] },
  { id: 'revision', t: 'Revisión del contrato', a: 'Armar y revisar el contrato', tipo: 'revision' },
  { id: 'contrato', t: 'Contrato firmado', a: 'Enviar contrato a firmar', tipo: 'firma', etapa: 'contrato' },
  { id: 'garantia_mes', t: 'Garantía y primer mes recibidos', a: 'Registrar los pagos', tipo: 'pago', tarea: ['contrato', 0] },
  { id: 'entrega', t: 'Entrega con acta e inventario', a: 'Hacer el acta de entrega', tipo: 'firma', etapa: 'entrega_acta' }, // fuera del embudo: al firmarse la propiedad queda «Arrendada»
  { id: 'comision', t: 'Comisión facturada y cobrada', a: 'Facturar y registrar el pago', tipo: 'pago', tarea: ['entrega', 1] },
];
const POSTARR: PasoDef[] = [
  { id: 'reajustes', t: 'Reajustes', a: 'Registrar el reajuste', tipo: 'post' },
  { id: 'renovacion', t: 'Renovación o término', a: 'Decidir la renovación', tipo: 'post' },
  { id: 'devolucion', t: 'Devolución de la garantía', a: 'Registrar la devolución', tipo: 'post' },
];
const NOMBRES = ['Captación', 'Comercialización', 'Postventa'];
const NOMBRES_ARR = ['Captación', 'Comercialización', 'Cierre del arriendo', 'Postarriendo'];
const IDS_ETAPA = ['captacion', 'comercializacion', 'postventa'];
const IDS_ETAPA_ARR = ['captacion', 'comercializacion', 'cierre', 'postarriendo'];
const ORDEN_ETAPA: Record<string, string[]> = {
  venta: ['interes', 'visita', 'reserva', 'promesa', 'escritura', 'inscripcion', 'entrega'],
  arriendo: ['interes', 'visita', 'reserva', 'evaluacion', 'contrato', 'entrega'],
};
/** los pasos de un negocio que se pueden marcar a mano, según su tipo (algunos ids se repiten en venta y arriendo con otra tarea) */
export const PASOS_POR_TIPO: Record<Tipo, PasoDef[]> = { venta: [...COM, ...POST_VENTA], arriendo: [...COM_ARR, ...CIERRE_ARR, ...POSTARR] };
export const PASOS_CAPTACION = ['datos', 'portal', 'legal', 'equip', 'comovisitar', 'mandato', 'fotos', 'publicada'];

export interface ResultadoAuto {
  e: 'ok' | 'pend' | 'fail' | 'todo';
  f?: string | null;
  d?: string;
  q?: 'tu' | 'otro';
  quien?: string;
  vence?: string | null;
}

/** Las cuentas del contrato del arriendo para el postarriendo: término, límite de aviso, reajustes (null si faltan inicio y plazo) */
export function plazosContrato(n: Doc) {
  const k = n.ciclo?.contrato?.datos;
  const post = n.ciclo?.postarriendo || {};
  if (!k?.inicio || !k.plazoMeses) return null;
  const reno = post.renovacion;
  const extra = reno?.decision === 'renovar' ? Number(reno.meses) || 0 : 0;
  const termino = mas(k.inicio, Number(k.plazoMeses) + extra);
  const limite = mas(termino, 0, -(Number(k.avisoDias) || 0));
  const periodo = ({ ipc_semestral: 6, ipc_anual: 12 } as Record<string, number>)[k.reajuste] || 0;
  const reajustes: any[] = post.reajustes || [];
  const ultimoRef = reajustes.length ? reajustes[reajustes.length - 1].desde : k.inicio;
  const proximo = periodo ? mas(ultimoRef, periodo) : '';
  return { k, post, termino, limite, periodo, reajustes, proximo, reno, dev: post.devolucion, renta: Number(post.rentaActual || n.valor?.valor || 0), moneda: n.valor?.moneda || 'CLP' };
}

const mf = (x: any) => montoTxt(x.monto, x.moneda);

/** estado automático de un paso según lo que ya hay registrado → null (sin evidencia) */
function auto(def: PasoDef, n: Doc | null, ctx: CtxPasos): ResultadoAuto | null {
  const p = ctx.prop;
  const tarea = (et: string, i: number) => !!n?.tareas?.[et]?.[i];
  const ord = n ? ORDEN_ETAPA[n.tipo]?.indexOf(n.etapa) ?? -1 : -1;
  const pasado = (et: string) => !!n && (n.estado === 'ganado' || ((ORDEN_ETAPA[n.tipo] || []).indexOf(et) >= 0 && ord > (ORDEN_ETAPA[n.tipo] || []).indexOf(et)));
  const firmaProp = (re: RegExp) => {
    const fs = ctx.firmasProp.filter((f) => re.test(f.plantilla || ''));
    return fs.find((f) => f.estado === 'firmado') || fs[0] || null;
  };
  // la firma de ESTE negocio (ligada a él, o suelta pero del mismo cliente), la firmada primero
  const firmaNeg = (re: RegExp) => {
    const rutC = rutLimpio(ctx.clienteRut);
    const suyas = ctx.firmasProp.filter(
      (x) =>
        re.test(x.plantilla || '') &&
        ((n?.id && x.negocioId === n.id) ||
          (!x.negocioId && x.firmantes.some((s) => (n?.clienteId && s.personaId === n.clienteId) || (rutC && s.rut && rutLimpio(s.rut) === rutC)))),
    );
    return suyas.find((x) => x.estado === 'firmado') || suyas[0] || null;
  };
  const visitas = () =>
    p && n ? ctx.visitas.filter((e) => (n.id && e.negocioId === n.id) || (!e.negocioId && n.clienteId && (e.personaIds || []).includes(n.clienteId))) : [];
  const op = (o: { operacion: number | null } | null) => (o?.operacion ? ` · operación ${o.operacion}` : '');

  switch (def.id) {
    case 'datos':
    case 'portal':
    case 'legal':
    case 'equip':
    case 'comovisitar': {
      // bloques de la ficha: logrado si no falta ningún dato clave (el equipamiento no tiene claves: basta con haberlo recorrido)
      if (!p?.ficha) return null;
      const b = avance(p.ficha).find((x) => x.id === def.bloque);
      if (!b) return null;
      if (def.bloque === 'equip') return b.completos > 0 ? { e: 'ok', d: `${b.completos} de ${b.total} datos` } : null;
      if (b.listo) return { e: 'ok', f: def.id === 'datos' ? (p.creado ?? null) : null };
      return { e: 'pend', q: 'tu', d: `Falta: ${b.faltanClave.slice(0, 5).join(', ')}${b.faltanClave.length > 5 ? ` y ${b.faltanClave.length - 5} más` : ''}.` };
    }
    case 'mandato': {
      // mandato de arriendo o de venta que armó Asset: si ya se envió o se firmó, el paso lo sigue (firmado gana sobre enviado)
      const reA = p?.venta && p?.arriendo ? /mandato de (arriendo|venta) n/i : p?.venta ? /mandato de venta n/i : /mandato de arriendo n/i;
      const fa = p ? firmaProp(reA) : null;
      if (fa)
        return fa.estado === 'firmado'
          ? { e: 'ok', f: fa.firmado || fa.fecha }
          : { e: 'pend', q: 'otro', quien: 'la firma del propietario', d: `${/venta/i.test(fa.plantilla || '') ? 'Mandato de venta' : 'Mandato de arriendo'} enviado a firmar el ${fdm(fa.fecha)}${op(fa)}.` };
      const f = firmaProp(/mandato|corretaje/i);
      return !f ? null : f.estado === 'firmado' ? { e: 'ok', f: f.firmado || f.fecha } : { e: 'pend', q: 'otro', quien: 'la firma del propietario', d: `Enviado a firmar el ${fdm(f.fecha)}${op(f)}.` };
    }
    case 'fotos':
      return p?.fotos ? { e: 'ok', f: null, d: `${p.fotos} fotos` } : null;
    case 'publicada':
      return p?.publicada ? { e: 'ok' } : null;
    case 'interesado':
      return n?.clienteId ? { e: 'ok', f: n.creado } : null;
    case 'visita': {
      // visita y orden de visita (un solo paso): se agenda y, ya en la puerta, se genera la orden y se envía a firmar
      // orden firmada → logrado; enviada → esperando la firma del visitante; sin orden: el estado de la visita en la agenda
      const fo = firmaNeg(/orden de visita/i);
      if (fo?.estado === 'firmado') return { e: 'ok', f: fo.firmado || fo.fecha, d: `Orden de visita firmada${op(fo)}` };
      if (fo) return { e: 'pend', q: 'otro', quien: 'la firma del visitante', d: `Orden de visita enviada el ${fdm(fo.fecha)}${op(fo)}.` };
      const vs = visitas();
      const h = ctx.hoy;
      const cuando = (e: VisitaCtx) => `${fdm(e.fecha)}${e.hora ? ' a las ' + e.hora : ''}`;
      const hecha = vs.filter((e) => e.estado === 'hecho').pop();
      if (hecha || tarea('visita', 1) || pasado('visita')) return { e: 'ok', f: hecha ? hecha.fecha : null, d: hecha ? `Visita realizada el ${cuando(hecha)}${pasado('visita') ? '' : ' · sin orden de visita'}` : '' };
      const prog = vs.filter((e) => e.estado === 'programado');
      const futura = prog.find((e) => e.fecha > h || (e.fecha === h && (e.hora || '23:59') >= ctx.ahora));
      if (futura) {
        const c = futura.confirmacion; // 'enviada' | 'confirmada' | 'cambio'
        if (c?.estado === 'cambio') return { e: 'fail', d: `${c.nombre || 'El cliente'} pidió cambiar la visita del ${cuando(futura)}${c.respuesta ? ': «' + c.respuesta + '»' : ''}. Reprográmala.` };
        const conf = c?.estado === 'confirmada' ? ` · confirmada por ${c.nombre || 'el cliente'}` : c?.estado === 'enviada' ? ' · confirmación enviada por WhatsApp' : ' · sin confirmar';
        // el día de la visita te toca: en la puerta se genera la orden y se envía a firmar
        if (futura.fecha === h) return { e: 'pend', q: 'tu', vence: futura.fecha, d: `Visita hoy${futura.hora ? ' a las ' + futura.hora : ''}${conf} · en la puerta, genera la orden de visita y envíala a firmar.` };
        if (c?.estado === 'confirmada') return { e: 'pend', q: 'otro', quien: 'el día de la visita', vence: futura.fecha, d: `Visita del ${cuando(futura)}${conf}` };
        return { e: 'pend', q: 'otro', quien: c?.estado === 'enviada' ? `la respuesta de ${c.nombre || 'el cliente'}` : 'la confirmación', vence: futura.fecha, d: `Visita agendada el ${cuando(futura)}${conf}` };
      }
      if (prog.length) return { e: 'fail', d: `La visita del ${cuando(prog[prog.length - 1])} ya pasó: márcala como realizada o reprográmala.` };
      if (vs.length) return { e: 'fail', d: `La visita del ${cuando(vs[vs.length - 1])} se canceló.` };
      return null;
    }
    case 'acta': {
      // el acta de visita ya no se firma: el paso se logra al cerrarla (lo marca el servidor); esto solo respeta lo firmado antes
      const f = firmaNeg(/^acta de visita/i);
      if (!f) return null;
      return f.estado === 'firmado' ? { e: 'ok', f: f.firmado || f.fecha, d: `Firmada${op(f)}` } : { e: 'pend', q: 'otro', quien: 'la firma del visitante', d: `Enviada el ${fdm(f.fecha)}${op(f)}.` };
    }
    case 'negociacion':
      return (tarea('reserva', 0) && n?.tipo === 'venta') || (pasado('visita') && n?.firmas?.reserva) ? { e: 'ok' } : null;
    case 'aceptacion': {
      // la última ronda de la negociación: aceptada → logrado; rechazada → no logrado; contraoferta → falta la respuesta del interesado
      const rs = n?.aceptacion?.rondas || [];
      const u = rs[rs.length - 1];
      if (!u) return null;
      if (u.tipo === 'aceptada') return { e: 'ok', f: u.fecha, d: 'Aceptada con las condiciones finales.' };
      if (u.tipo === 'rechazada') return { e: 'fail', d: `${u.por === 'interesado' ? 'El interesado desistió' : 'El propietario rechazó la oferta'}${u.nota ? ': ' + u.nota : ''}.` };
      if (u.tipo === 'contraoferta') return { e: 'pend', q: 'tu', d: 'El propietario hizo una contraoferta: falta la respuesta del interesado.' };
      return { e: 'pend', q: 'otro', quien: 'la respuesta del propietario', d: 'Oferta presentada al propietario.' };
    }
    case 'reserva_pago':
    case 'garantia_mes':
    case 'comision': {
      // arriendo: pagos que se registran con monto, fecha y comprobante (n.ciclo; ojo: n.cierre es el registro del cierre ganado/perdido)
      if (n?.tipo !== 'arriendo') break;
      const c = n.ciclo || {};
      const pg = c.pagos || {};
      if (def.id === 'reserva_pago') return pg.reserva ? { e: 'ok', f: pg.reserva.fecha, d: `Pagada el ${fdm(pg.reserva.fecha)} · ${mf(pg.reserva)}` } : null;
      if (def.id === 'garantia_mes') {
        if (pg.garantia && pg.primerMes) return { e: 'ok', f: [pg.garantia.fecha, pg.primerMes.fecha].sort().pop(), d: 'Garantía y primer mes recibidos' };
        if (pg.garantia || pg.primerMes) return { e: 'pend', q: 'tu', d: `Falta registrar ${pg.garantia ? 'el primer mes' : 'la garantía'}.` };
        return null;
      }
      const co = c.comision || {};
      if (co.pago) return { e: 'ok', f: co.pago.fecha, d: `Cobrada el ${fdm(co.pago.fecha)} · ${mf(co.pago)}` };
      if (co.factura) return { e: 'pend', q: 'otro', quien: 'el pago de la comisión', d: `Factura ${co.factura.numero ? 'nº ' + co.factura.numero + ' ' : ''}emitida el ${fdm(co.factura.fecha)}.` };
      return co.facturaFecha ? { e: 'pend', q: 'tu', vence: co.facturaFecha, d: `Facturar la comisión el ${fdm(co.facturaFecha)}.` } : null;
    }
    case 'reajustes':
    case 'renovacion':
    case 'devolucion': {
      // postarriendo: avisos que salen de las condiciones del contrato (n.ciclo.contrato.datos) y de lo registrado en n.ciclo.postarriendo
      if (n?.tipo !== 'arriendo') break;
      const pc = plazosContrato(n);
      if (!pc) return null;
      const { k, post: po, termino, limite } = pc;
      const h = ctx.hoy;
      const en30 = mas(h, 0, 30);
      const estado = (vence: string, d: string): ResultadoAuto => (vence < h ? { e: 'fail', q: 'tu', vence, d: d + ' · vencido' } : vence <= en30 ? { e: 'pend', q: 'tu', vence, d } : { e: 'todo', vence, d });
      if (def.id === 'reajustes') {
        if (!pc.periodo) return { e: 'ok', d: 'El contrato no se reajusta por IPC.' };
        const rs = pc.reajustes;
        const prox = pc.proximo;
        if (prox >= termino)
          return rs.length
            ? { e: 'ok', f: rs[rs.length - 1].registrado, d: `${rs.length} reajuste${rs.length === 1 ? '' : 's'} aplicado${rs.length === 1 ? '' : 's'}; no quedan en el plazo.` }
            : { e: 'ok', d: 'No hay reajustes dentro del plazo.' };
        return estado(prox, `Reajuste por IPC el ${fdm(prox)}${rs.length ? ' · ' + rs.length + ' aplicado' + (rs.length === 1 ? '' : 's') : ''}.`);
      }
      if (def.id === 'renovacion') {
        if (po.renovacion) return { e: 'ok', f: po.renovacion.fecha, d: po.renovacion.decision === 'renovar' ? `Renovado por ${po.renovacion.meses} meses (hasta el ${fdm(termino)}).` : 'Término del contrato acordado.' };
        return estado(limite, `El contrato termina el ${fdm(termino)}: avisar hasta el ${fdm(limite)}.`);
      }
      if (po.devolucion) return { e: 'ok', f: po.devolucion.fechaDevolucion, d: `Garantía devuelta el ${fdm(po.devolucion.fechaDevolucion)}.` };
      if (po.renovacion?.decision === 'termino' || h >= termino) return estado(mas(termino, 0, 30), `Devolver la garantía (el contrato termina el ${fdm(termino)}).`);
      void k;
      return { e: 'todo', d: `Al término del contrato (${fdm(termino)}).` };
    }
    case 'revision': {
      // arriendo: el texto del contrato lo aprueba CADA firmante (propietarios, arrendatario y codeudores): n.ciclo.contrato
      const k = n?.ciclo?.contrato;
      const v = (k?.versiones || []).slice(-1)[0];
      if (!v) return null;
      const fs = v.firmantes || [];
      const ap = k.aprobado || {};
      const faltan = fs.filter((q: any) => !ap[q.personaId]);
      if (fs.length && !faltan.length) return { e: 'ok', f: fs.map((q: any) => ap[q.personaId]).sort().pop(), d: `Texto final aprobado (V${v.n}) por todos los firmantes.` };
      return { e: 'pend', q: 'tu', d: fs.length ? `V${v.n}: falta que aprueben ${faltan.map((q: any) => q.nombre).join(', ')}.` : `V${v.n}: sin firmantes registrados.` };
    }
    case 'cierre':
      return n?.estado === 'ganado' ? { e: 'ok', f: n.cierre?.fecha || n.cierre || n.actualizado } : null;
    default:
      break;
  }
  if (def.tipo === 'firma' && n) {
    const f = n.firmas?.[def.etapa!];
    if (f?.estado === 'firmado') return { e: 'ok', f: f.firmado };
    if (f?.operacion) return { e: 'pend', q: 'otro', quien: 'las firmas', d: `Operación ${f.operacion}${f.total ? ` · ${f.firmados} de ${f.total} firmas` : ''}.` };
    if (pasado(def.etapa!)) return { e: 'ok' };
    return null;
  }
  if (def.tarea && n) return tarea(...def.tarea) ? { e: 'ok' } : null;
  if (def.tareas && n) return def.tareas[1].every((i) => tarea(def.tareas![0], i)) ? { e: 'ok' } : null;
  return null;
}

export interface PasoVista {
  id: string;
  t: string;
  e: 'ok' | 'pend' | 'fail' | 'todo';
  f: string | null;
  d: string;
  q: 'tu' | 'otro';
  quien: string;
  vence: string | null;
  accion: string;
  tipo: string;
  manual: boolean;
  implicito?: boolean;
  vencido?: boolean;
}
export interface EtapaVista {
  id: string;
  nombre: string;
  aviso: boolean;
  pasos: PasoVista[];
  ok: number;
  total: number;
  fail: boolean;
  completa: boolean;
  actual: boolean;
}

/**
 * Los pasos de un negocio (ámbito «negocio»: comercialización y postventa, o en arriendo comercialización, cierre y postarriendo) o los de la
 * captación de su propiedad (ámbito «captacion»: los 5 bloques de la ficha, mandato, fotos y publicada), con su estado y el «actual» (el primero no logrado).
 */
export function pasos(n: Doc | null, ctx: CtxPasos, ambito: 'negocio' | 'captacion' = 'negocio') {
  const tipo: Tipo = n?.tipo || (ctx.prop?.venta ? 'venta' : 'arriendo');
  const manual: Record<string, any> = { ...(n?.pasos || {}) };
  let actual: any = null;
  const defs: [PasoDef[], number, boolean?][] =
    ambito === 'captacion' ? [[CAPT, 0]] : tipo === 'arriendo' ? [[COM_ARR, 1], [CIERRE_ARR, 2], [POSTARR, 3, true]] : [[COM, 1], [POST_VENTA, 2]];
  const vistas: EtapaVista[] = defs.map(([lista, k, aviso]) => ({
    id: (tipo === 'arriendo' ? IDS_ETAPA_ARR : IDS_ETAPA)[k],
    nombre: (tipo === 'arriendo' ? NOMBRES_ARR : NOMBRES)[k],
    aviso: !!aviso,
    ok: 0,
    total: 0,
    fail: false,
    completa: false,
    actual: false,
    pasos: lista.map((def) => {
      const a = auto(def, n, ctx);
      const m = manual[def.id];
      const x: PasoVista = { id: def.id, t: def.t, e: 'todo', f: null, d: '', q: 'tu', quien: '', vence: null, accion: def.a, tipo: def.tipo, manual: !!m };
      if (a?.e === 'ok') Object.assign(x, a, { e: 'ok' });
      else if (m?.e) Object.assign(x, { e: m.e, f: m.f || null, d: m.d || '', q: m.quien ? 'otro' : 'tu', quien: m.quien || '', vence: m.vence || null });
      else if (a) Object.assign(x, a);
      if (x.e === 'ok' && !a && m?.f) x.f = m.f;
      return x;
    }),
  }));
  // el actual: el primer paso no logrado; los anteriores sin evidencia quedan como «saltados» (logrados si hay pasos posteriores logrados)
  const plano = vistas.flatMap((e, ei) => (e.aviso ? [] : e.pasos.map((x, pi) => ({ x, ei, pi }))));
  let ultimoOk = -1;
  plano.forEach((y, i) => {
    if (y.x.e === 'ok') ultimoOk = i;
  });
  // en la captación cada paso es independiente (puede haber fotos sin mandato): no se da nada por cumplido
  if (ambito !== 'captacion')
    plano.forEach((y, i) => {
      if (i < ultimoOk && y.x.e === 'todo') {
        y.x.e = 'ok';
        y.x.d = y.x.d || 'Sin registro (se dio por cumplido)';
        y.x.implicito = true;
      }
    });
  const sig = plano.find((y) => y.x.e !== 'ok');
  if (sig) {
    actual = { ...sig.x, ei: sig.ei, pi: sig.pi, etapa: vistas[sig.ei].nombre };
    if (sig.x.e === 'todo') {
      sig.x.e = 'pend';
      actual.e = 'pend';
    }
    if (n && actual.e === 'pend' && actual.q === 'tu' && !actual.vence && n.proximaAccion?.fecha) {
      sig.x.vence = actual.vence = n.proximaAccion.fecha;
      if (n.proximaAccion.texto && !sig.x.d) sig.x.d = actual.d = n.proximaAccion.texto;
    }
    if (actual.e === 'pend' && actual.q === 'tu' && actual.vence && actual.vence < ctx.hoy) {
      sig.x.e = actual.e = 'fail';
      sig.x.d = actual.d = `${actual.d ? actual.d + ' · ' : ''}Venció el ${fdm(actual.vence)}.`;
      actual.vencido = sig.x.vencido = true;
    }
    if (n?.estado === 'perdido') {
      sig.x.e = actual.e = 'fail';
      sig.x.d = actual.d = 'Negocio perdido' + (n.motivoPerdida ? ': ' + n.motivoPerdida : '') + '.';
      actual.perdido = true;
    }
    if (actual.e === 'fail' && !actual.perdido) sig.x.accion = actual.accion = actual.vencido || actual.id === 'visita' ? 'Reprogramar' : 'Reintentar';
  }
  for (const e of vistas) {
    e.ok = e.pasos.filter((x) => x.e === 'ok').length;
    e.total = e.pasos.length;
    e.fail = e.pasos.some((x) => x.e === 'fail');
    e.completa = e.ok === e.total;
    e.actual = !!actual && vistas.indexOf(e) === actual.ei;
  }
  return { tipo, ambito, etapas: vistas, actual, cerrado: !actual };
}

// ---------------------------------------------------------------------------------------------------- normalizar lo que se guarda
const txt = (v: unknown, max: number) => String(v || '').trim().slice(0, max);
const MONEDAS = ['UF', 'CLP', 'USD'];

/** precio o renta del negocio: { valor, moneda } o null */
export const normValor = (v: any) => (v && v.valor !== '' && v.valor != null ? { valor: Number(v.valor), moneda: MONEDAS.includes(v.moneda) ? v.moneda : 'UF' } : null);
/** comisión: porcentaje o monto fijo */
export const normComision = (c: any) => (c && c.valor !== '' && c.valor != null ? { tipo: c.tipo === 'monto' ? 'monto' : '%', valor: Number(c.valor) } : null);
/** las condiciones de la oferta (la carta oferta lee estos datos); lo que ya tenía y no se manda se conserva */
export const normOferta = (q: any, previa: any = null) => ({
  ...(previa || {}),
  garantia: txt(q.garantia, 120),
  plazo: txt(q.plazo, 80),
  vigencia: String(q.vigencia || '').replace(/\D/g, '').slice(0, 3),
  condiciones: txt(q.condiciones, 800),
  ...Object.fromEntries(
    ['piePct', 'promesaDias', 'escrituraDias', 'seriedadUF', 'comisionPct']
      .filter((c) => String(q[c] ?? '').trim() !== '')
      .map((c) => [c, String(q[c]).replace(',', '.').replace(/[^\d.]/g, '').slice(0, 8)]),
  ),
});
export const normProximaAccion = (p: any) => (p?.texto ? { texto: txt(p.texto, 160), fecha: dia(p.fecha) } : null);
export { dia };

/** la oferta vigente de la negociación: la última ronda con monto que no sea un rechazo, o la carta oferta del negocio */
export function ofertaVigente(n: Doc) {
  const rondas: any[] = n.aceptacion?.rondas || [];
  const c = [...rondas].reverse().find((r) => r.tipo !== 'rechazada' && r.monto);
  return c
    ? { monto: c.monto as number | null, moneda: c.moneda || 'UF', garantia: c.garantia || '', plazo: c.plazo || '', condiciones: c.condiciones || '' }
    : { monto: (n.valor?.valor || null) as number | null, moneda: n.valor?.moneda || 'UF', garantia: n.oferta?.garantia || '', plazo: n.oferta?.plazo || '', condiciones: n.oferta?.condiciones || '' };
}
/** en qué punto está la negociación con el propietario */
export function estadoNegociacion(n: Doc) {
  const rondas: any[] = n.aceptacion?.rondas || [];
  const ultima = rondas[rondas.length - 1];
  return {
    rondas,
    ultima,
    final: ultima?.tipo === 'aceptada' || ultima?.tipo === 'rechazada',
    /** la contraoferta del propietario espera la respuesta del interesado */
    esperaInteresado: ultima?.tipo === 'contraoferta',
  };
}

// ---------------------------------------------------------------------------------------------------- comprobantes
export type TipoPago = 'reserva' | 'garantia' | 'primer_mes' | 'comision' | 'otro';

/** lo que falta para registrar un pago (para preguntarle SOLO eso al corredor) */
export function faltantesPago(tipoNegocio: string, a: { tipo_pago?: unknown; monto?: unknown; moneda?: unknown; fecha?: unknown; medio?: unknown }) {
  const f: string[] = [];
  if (!(Number(a.monto) > 0)) f.push('monto');
  if (!MONEDAS.includes(String(a.moneda))) f.push('moneda');
  if (!esDia(a.fecha)) f.push('fecha');
  if (!Object.keys(MEDIO_PAGO).includes(String(a.medio))) f.push('medio');
  if (tipoNegocio === 'arriendo' && !['reserva', 'garantia', 'primer_mes', 'comision', 'otro'].includes(String(a.tipo_pago))) f.push('a qué corresponde (reserva, garantía, primer mes, comisión u otro)');
  return f;
}
