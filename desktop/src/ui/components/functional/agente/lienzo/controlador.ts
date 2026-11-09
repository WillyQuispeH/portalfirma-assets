// Lienzo en vivo: la columna derecha del Agente a pantalla completa. Muestra lo que se está trabajando (tu día, una
// propiedad, un negocio con sus etapas, la agenda de un día o una firma) y se actualiza solo cada vez que el agente o
// un botón cambia algo. Sus botones hacen acciones fijas (nunca dependen del modelo). Las demás pantallas lo usan como
// window.Lienzo { mostrar, refrescar, actual }.
/* eslint-disable @typescript-eslint/no-explicit-any -- datos del proceso principal sin tipos */
import { create } from 'zustand';
import { W, api, cartera, hoyISO } from '../tarjetas/comun';
import type { TContexto } from '../../../../store/interfaces/agente.interface';

export type TVista =
  | { tipo: 'inicio'; hoy: string; ev: any[]; abiertos: any[]; urgentes: any[]; firmas: any[]; activas: number; meta: number }
  | { tipo: 'propiedad'; p: any; s: any; negs: any[]; n: any | null; etapas: Record<string, any[]> }
  | { tipo: 'negocio'; n: any; et: any[] }
  | { tipo: 'agenda'; fecha: string; ev: any[] }
  | { tipo: 'operacion'; r: any; propId: string | null }
  | { tipo: 'error'; mensaje: string };

interface ILienzo {
  ctx: TContexto;
  vista: TVista | null;
  cargando: boolean;
  anim: number; // cambia al mostrar algo nuevo (no al refrescar): anima la entrada
  histAbierto: boolean;
}
export const useLienzo = create<ILienzo>(() => ({ ctx: { tipo: 'inicio' }, vista: null, cargando: false, anim: 0, histAbierto: false }));
const ultNeg: Record<string, string> = {}; // el último negocio visto de cada propiedad
let tok = 0;

async function vInicio(): Promise<TVista> {
  const { propiedades } = await cartera(); const hoy = hoyISO();
  const [ev, ng] = await Promise.all([api<any[]>('agendaListar', { desde: hoy, hasta: hoy }).catch(() => []), api('negListar').catch(() => ({ negocios: [] }))]);
  const abiertos = ng.negocios.filter((n: any) => n.estado === 'abierto');
  return {
    tipo: 'inicio', hoy, ev, abiertos,
    urgentes: abiertos.filter((n: any) => n.vencida || /Falta firmar|Esperando firmas/.test(n.siguiente || '')).slice(0, 5),
    firmas: propiedades.flatMap((p) => (p.firmas || []).filter((f: any) => f.estado !== 'firmado').map((f: any) => ({ ...f, p }))).slice(0, 5),
    activas: propiedades.filter((p) => !p.archivada).length,
    meta: abiertos.length ? Math.round(abiertos.reduce((s: number, n: any) => s + (n.orden + 1) / n.total, 0) / abiertos.length * 100) : 0,
  };
}
async function vPropiedad(ctx: any): Promise<TVista> {
  const p = (await cartera()).propiedades.find((x) => x.id === ctx.id); if (!p) throw new Error('La propiedad ya no está en la cartera.');
  const [s, ng] = await Promise.all([api('estEstado', p.id), api('negListar').catch(() => ({ negocios: [], etapas: {} }))]);
  const negs = ng.negocios.filter((n: any) => n.propId === p.id && n.estado === 'abierto');
  if (ctx.negocio) ultNeg[p.id] = ctx.negocio;
  const n = negs.find((x: any) => x.id === (ctx.negocio || ultNeg[p.id])) || negs[0] || null; if (n) ultNeg[p.id] = n.id;
  return { tipo: 'propiedad', p, s, negs, n, etapas: ng.etapas };
}
async function vNegocio(ctx: any): Promise<TVista> {
  const [n, ng] = await Promise.all([api('negObtener', ctx.id), api('negListar')]);
  return { tipo: 'negocio', n, et: ng.etapas[n.tipo] };
}
async function vAgenda(ctx: any): Promise<TVista> {
  const fecha = ctx.fecha || hoyISO(); return { tipo: 'agenda', fecha, ev: await api('agendaListar', { desde: fecha, hasta: fecha }) };
}
async function vOperacion(ctx: any): Promise<TVista> { return { tipo: 'operacion', r: await api('docSeguimiento', ctx.op), propId: ctx.propId || null }; }
const VISTAS: Record<string, (ctx: any) => Promise<TVista>> = { inicio: vInicio, propiedad: vPropiedad, negocio: vNegocio, agenda: vAgenda, operacion: vOperacion };

export async function mostrar(ctx?: TContexto | null, { silencioso }: { silencioso?: boolean } = {}) {
  if (ctx) useLienzo.setState({ ctx });
  const c = useLienzo.getState().ctx; const my = ++tok;
  if (!silencioso) useLienzo.setState({ cargando: true });
  try {
    const vista = await (VISTAS[c.tipo] || vInicio)(c);
    if (my !== tok) return;
    useLienzo.setState((s) => ({ vista, cargando: false, anim: silencioso ? s.anim : s.anim + 1 }));
  } catch (e) {
    if (my !== tok) return;
    useLienzo.setState((s) => ({ vista: { tipo: 'error', mensaje: (e as Error).message }, cargando: false, ctx: { tipo: 'inicio' }, anim: s.anim + 1 }));
  }
}
export const refrescar = () => mostrar(null, { silencioso: true });

/** lo que se está mirando, para los botones del Agente (propiedad, negocio, operación…) */
export function actual() {
  const { ctx, vista: v } = useLienzo.getState();
  const dato = !v ? {} : v.tipo === 'propiedad' ? { prop: v.p, negocio: v.n, sig: v.n ? v.etapas[v.n.tipo][v.n.orden + 1] : null, etapas: v.n ? v.etapas[v.n.tipo] : null, sugerencias: v.s.sugerencias }
    : v.tipo === 'negocio' ? { negocio: v.n, sig: v.et[v.n.orden + 1], prop: v.n.prop ? { id: v.n.prop.id, codigo: v.n.prop.codigo } : null }
      : v.tipo === 'agenda' ? { eventos: v.ev } : v.tipo === 'operacion' ? { op: ctx.op, propId: v.propId } : {};
  return { ctx, ...dato };
}

export function instalarLienzo() { W.Lienzo = { mostrar, refrescar, actual }; }
