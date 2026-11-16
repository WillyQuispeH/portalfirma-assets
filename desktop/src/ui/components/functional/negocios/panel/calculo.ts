// Cálculo del Panel de brokers (pestaña «Panel» de Negocios), a partir de los negocios, la cartera y el perfil.
// Sin React: lo usa PanelBrokers.tsx y lo prueba test/negocios-panel-e2e.js.
//
// Reglas:
//  · Ganado del mes: comisión de los negocios ganados con cierre en ese mes.
//  · Cobrado del mes: comisión de los negocios cuya comisión se pagó en ese mes (venta: n.comisionPagada; arriendo: la
//    etapa «Comisión» de su ciclo).
//  · Por cerrar: negocios abiertos con «cierre estimado» dentro del mes. Proyección = ganado + por cerrar.
//  · Captaciones: propiedades con el mandato firmado en el mes (fecha de firma de la etapa «Mandato firmado»).
//  · Metas: las define el administrador en Configuración › Metas (por corredor); la de la empresa es la suma.
//  · Comisiones sin IVA; «con IVA» = ×1,19. UF a pesos con el valor del día; sin ese valor (o en dólares) no se suma y se avisa.
// Roles: el proceso principal ya entrega solo los negocios que el usuario puede ver (permisos.verNegocio); además el
// administrador ve a todo el equipo y el corredor solo se ve a sí mismo.
import type { IEtapa, INegocio, TNegocioTipo } from '../../../../store/interfaces/negocio.interface';
import type { IPerfil } from '../../../../store/interfaces/perfil.interface';
import type { IPropiedad, TCaptaciones } from '../../../../store/interfaces/propiedad.interface';

export const IVA = 1.19;
export const UMBRAL_AVANCE = 0.5; // avance desde el que a un negocio abierto se le pide la fecha de cierre estimada
/** cómo se llama al equipo en el panel (un solo lugar para cambiarlo) */
export const EQUIPO = { plural: 'Arrendadores', una: 'arrendador' };

export type TMetas = Record<string, { facturacion: number; captacion: number }>;
export const metaDe = (m: TMetas, id: string, k: 'facturacion' | 'captacion') => m[id]?.[k] || 0;
export const conIva = (n: number) => Math.round(n * IVA);
export const DIAS_URGENTE = 7; // días en la misma etapa para que un pendiente sea urgente

export type TTipoPanel = 'todos' | TNegocioTipo;
export type TOrden = 'proy' | 'meta' | 'nombre';
export type TCategoria = 'Documentos' | 'Marketing' | 'Seguimiento' | 'Cierre';
export const CATEGORIAS: TCategoria[] = ['Documentos', 'Marketing', 'Seguimiento', 'Cierre'];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export interface IMes {
  id: string; // 'YYYY-MM'
  corto: string; // 'Sep'
  largo: string; // 'Septiembre 2026'
  enCurso: boolean;
}

/** los últimos `n` meses hasta el actual, del más antiguo al más nuevo */
export function meses(n: number, hoy = new Date()): IMes[] {
  const r: IMes[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const nombre = MESES[d.getMonth()];
    r.push({
      id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      corto: nombre[0].toUpperCase() + nombre.slice(1, 3),
      largo: `${nombre[0].toUpperCase()}${nombre.slice(1)} ${d.getFullYear()}`,
      enCurso: i === 0,
    });
  }
  return r;
}

/** '$12.400.000' */
export const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');
/** '$12,4 M' */
export function millones(n: number) {
  const v = (n / 1e6).toFixed(1).replace('.', ',').replace(/,0$/, '');
  return `$${v} M`;
}
export const porcentaje = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** comisión del negocio en pesos; null si no se puede convertir (UF sin valor del día, o dólares) */
export function comisionPesos(n: INegocio, uf: number | null): number | null {
  if (!n.comisionMonto) return 0;
  const m = n.valor?.moneda || 'UF';
  if (m === 'CLP') return n.comisionMonto;
  if (m === 'UF') return uf ? n.comisionMonto * uf : null;
  return null;
}

/** avance del negocio de 0 a 100 según su etapa (ganado: 100) */
export function avance(n: INegocio): number {
  if (n.estado === 'ganado') return 100;
  const total = n.total || 0; const orden = n.orden ?? 0;
  return total > 1 ? Math.round((Math.max(0, orden) / (total - 1)) * 100) : 0;
}

/** abierto con fecha de cierre estimada */
export const porCerrar = (n: INegocio) => n.estado === 'abierto' && !!n.cierreEstimado;
/** día en que se pagó la comisión (venta: la registra el corredor en las condiciones; arriendo: su etapa «Comisión») */
export const cobradaEn = (n: INegocio): string | null => (n.tipo === 'arriendo' ? n.ciclo?.comision?.pago?.fecha : n.comisionPagada?.fecha) || null;
const delMes = (iso: string | undefined | null, mes: string) => !!iso && iso.slice(0, 7) === mes;
const dias = (iso?: string | null, hoy = new Date()) => (iso ? Math.max(0, Math.floor((hoy.getTime() - new Date(iso).getTime()) / 864e5)) : 0);
export const hace = (n: number) => (n <= 0 ? 'Hoy' : n === 1 ? 'Hace 1 día' : `Hace ${n} días`);

// ---------- Pendientes («Requiere atención») ----------

export interface IPendiente {
  negocioId: string;
  tarea: string;
  detalle: string;
  cat: TCategoria;
  urgente: boolean;
  dias: number;
}

function categoria(texto: string, n: INegocio): TCategoria {
  if (/public|foto|video|aviso|portal|campa|difus/i.test(texto)) return 'Marketing';
  if (/firm|document|contrato|certificad|antecedent|mandato|orden|escritur|inventario|acta/i.test(texto)) return 'Documentos';
  if (n.etapaInfo?.final || avance(n) >= UMBRAL_AVANCE * 100) return 'Cierre';
  return 'Seguimiento';
}

/** lo que falta en cada negocio abierto: acción vencida, firma pendiente o la siguiente tarea de su etapa */
export function pendientesDe(n: INegocio, hoy = new Date()): IPendiente[] {
  if (n.estado !== 'abierto') return [];
  const r: IPendiente[] = [];
  const en = n.diasEnEtapa ?? 0;
  const etapa = n.etapaInfo?.t || 'su etapa';
  if (n.vencida && n.proximaAccion?.texto) {
    const d = dias(n.proximaAccion.fecha, hoy);
    r.push({ negocioId: n.id, tarea: n.proximaAccion.texto, detalle: `Próxima acción vencida ${d === 1 ? 'hace 1 día' : `hace ${d} días`}`, cat: 'Seguimiento', urgente: true, dias: d });
  }
  const sig = n.siguiente || '';
  if (sig && !/^Listo/.test(sig)) {
    r.push({ negocioId: n.id, tarea: sig, detalle: `${en === 1 ? '1 día' : `${en} días`} en ${etapa}`, cat: categoria(sig, n), urgente: en >= DIAS_URGENTE, dias: en });
  } else if (/^Listo/.test(sig) && en >= 3) {
    r.push({ negocioId: n.id, tarea: sig, detalle: `Todo listo hace ${en} días: falta moverlo`, cat: 'Seguimiento', urgente: en >= DIAS_URGENTE, dias: en });
  }
  if (!n.cierreEstimado && n.comision && avance(n) >= UMBRAL_AVANCE * 100)
    r.push({ negocioId: n.id, tarea: 'Falta la fecha de cierre estimada', detalle: `Va en ${etapa}: sin esa fecha no entra en la proyección`, cat: 'Cierre', urgente: false, dias: en });
  return r;
}

/** urgentes primero; dentro de cada grupo, los más atrasados primero */
export const ordenarPendientes = (l: IPendiente[]) =>
  l.slice().sort((a, b) => (a.urgente === b.urgente ? b.dias - a.dias : a.urgente ? -1 : 1));

// ---------- Brokers ----------

export interface IBroker {
  id: string; // id del usuario, o 'sin' (negocios sin corredor asignado)
  nombre: string;
  negocios: INegocio[]; // todos los suyos (cualquier tipo y estado)
}

const claveCorredor = (n: INegocio) => n.corredorId || 'sin';

/** los brokers que ve el usuario: el administrador, todos (y «Sin asignar» si hay); el corredor, solo él */
export function brokers(negocios: INegocio[], perfil: IPerfil | null): IBroker[] {
  const por = new Map<string, INegocio[]>();
  for (const n of negocios) {
    const k = claveCorredor(n);
    por.set(k, [...(por.get(k) || []), n]);
  }
  if (perfil && !perfil.esAdmin) {
    // el corredor: todo lo que le llega es suyo (el proceso principal ya filtró)
    return [{ id: perfil.corredorId || perfil.usuarioId || 'yo', nombre: perfil.nombre || 'Yo', negocios }];
  }
  const lista: IBroker[] = (perfil?.corredores || []).map((c) => ({ id: c.id, nombre: c.nombre, negocios: por.get(c.id) || [] }));
  const conocidos = new Set(lista.map((b) => b.id));
  // corredores que ya no están en el equipo pero tienen negocios, y los negocios sin asignar
  for (const [k, ns] of por) {
    if (conocidos.has(k)) continue;
    lista.push({ id: k, nombre: k === 'sin' ? 'Sin asignar' : ns[0].corredor || 'Corredor anterior', negocios: ns });
  }
  return lista;
}

export interface ICifras {
  ganado: number; // comisión de los negocios ganados en el mes
  cobrado: number; // comisión pagada en el mes
  porCerrar: number; // comisión de los abiertos con cierre estimado en el mes
  proyeccion: number; // ganado + por cerrar
  meta: number;
  activos: number;
  cerradosMes: number;
  sinConvertir: number; // negocios con comisión que no se pudo pasar a pesos
}

/** cifras de un conjunto de negocios en un mes */
export function cifras(ns: INegocio[], mes: IMes, uf: number | null, meta: number): ICifras {
  let ganado = 0; let cobrado = 0; let cerrar = 0; let sinConvertir = 0; let cerradosMes = 0; let activos = 0;
  for (const n of ns) {
    const ganadoMes = n.estado === 'ganado' && delMes(n.cierre, mes.id);
    const cobradoMes = delMes(cobradaEn(n), mes.id);
    const cierraMes = n.estado === 'abierto' && delMes(n.cierreEstimado, mes.id);
    if (n.estado === 'abierto') activos++;
    if (ganadoMes) cerradosMes++;
    if (!ganadoMes && !cobradoMes && !cierraMes) continue;
    const c = comisionPesos(n, uf);
    if (c == null) { sinConvertir++; continue; }
    if (ganadoMes) ganado += c; else if (cierraMes) cerrar += c;
    if (cobradoMes) cobrado += c;
  }
  return { ganado, cobrado, porCerrar: cerrar, proyeccion: ganado + cerrar, meta, activos, cerradosMes, sinConvertir };
}

/** cifras de cada mes (para el gráfico) */
export function historial(ns: INegocio[], lista: IMes[], uf: number | null) {
  return lista.map((m) => ({ mes: m, ...cifras(ns, m, uf, 0) }));
}

/** propiedades captadas en el mes: las que tienen su mandato firmado ese mes (por captador; 'sin' = sin captador) */
export function captaciones(props: IPropiedad[], caps: TCaptaciones, mes: IMes, captadorId?: string) {
  return props.filter((p) => !p.archivada && delMes(caps[p.id]?.mandato, mes.id)
    && (captadorId === undefined || (captadorId === 'sin' ? !p.captadorId : p.captadorId === captadorId))).length;
}

/** «Venta y arriendo · Ñuñoa, Providencia» con lo que trabaja cada broker */
export function foco(ns: INegocio[]): string {
  const tipos = [...new Set(ns.map((n) => n.tipo))].map((t) => (t === 'venta' ? 'Venta' : 'Arriendo'));
  const cuenta = new Map<string, number>();
  for (const n of ns) if (n.prop?.comuna) cuenta.set(n.prop.comuna, (cuenta.get(n.prop.comuna) || 0) + 1);
  const comunas = [...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
  const t = tipos.length === 2 ? 'Venta y arriendo' : tipos[0] || 'Sin negocios';
  return comunas.length ? `${t} · ${comunas.join(', ')}` : t;
}

export type TEstadoNegocio = 'Cobrado' | 'Ganado' | 'Por cerrar' | 'En curso' | 'Perdido';
export function estadoNegocio(n: INegocio): TEstadoNegocio {
  if (n.estado === 'ganado') return cobradaEn(n) ? 'Cobrado' : 'Ganado';
  if (n.estado === 'perdido') return 'Perdido';
  return porCerrar(n) ? 'Por cerrar' : 'En curso';
}

/** negocios de un broker que se muestran al desplegarlo: los abiertos y los ganados en el mes elegido */
export function vigentes(ns: INegocio[], mes: IMes, tipo: TTipoPanel) {
  return ns
    .filter((n) => (tipo === 'todos' || n.tipo === tipo) && (n.estado === 'abierto' || (n.estado === 'ganado' && (delMes(n.cierre, mes.id) || delMes(cobradaEn(n), mes.id)))))
    .sort((a, b) => avance(b) - avance(a));
}

export const etapasDe = (n: INegocio, etapas: Record<TNegocioTipo, IEtapa[]>) => etapas[n.tipo] || [];
export { dias };
