// «Gestionar una propiedad»: flujo guiado dentro del chat del Agente, con tarjetas.
//   1. Elegir la propiedad (por código, dirección o comuna)
//   2. Cómo está y qué hacer: documento, orden de visita, agendar, negocio, ficha, portal…
//   3. Qué documento: las plantillas de la cuenta (Notaría virtual), ordenadas para esa propiedad
//   4. Formulario prellenado con la ficha, las personas vinculadas y los datos del corredor
//   5. Revisar → enviar a firmar → seguimiento aquí, con el agente o en el panel de Operaciones
// Usa la misma lógica que el agente (documentos.js en el proceso principal). Lo usan las demás pantallas como
// window.Gestion (lo instala instalarGestion, desde el controlador del Agente).
/* eslint-disable @typescript-eslint/no-explicit-any -- datos del proceso principal sin tipos */
import { toast } from '../../../../utils/app';
import { Ag, W, api, cartera, montar, primer } from './comun';
import { ElegirPropiedad, EstadoPropiedad, Anotar } from './Propiedad';
import { Plantillas, Formulario, Resultado, Firmas } from './Documentos';
import { Agendar, ConfirmarWhatsApp, type IPreAgendar } from './Agendar';
import { DocNuevo, type IDocNuevo } from './DocNuevo';

const buscarProp = async (id: string) => (await cartera()).propiedades.find((x) => x.id === id || x.codigo === id);

// ---------- 1. propiedad ----------
export async function iniciar({ destino, propId }: { destino?: string; propId?: string } = {}) {
  await cartera();
  if (propId) {
    const p = await buscarProp(propId);
    if (p) {
      Ag().contexto({ tipo: 'propiedad', id: p.id });
      Ag().decir(destino === 'documento' ? `Generar un documento para ${p.codigo}` : `Gestionar ${p.codigo}`, 'user');
      return destino === 'documento' ? plantillas(p) : estado(p.id);
    }
  }
  montar('ga-prop', <ElegirPropiedad destino={destino} />, { usuario: destino === 'documento' ? 'Generar un documento' : 'Gestionar una propiedad' });
}

// ---------- 2. cómo está la propiedad ----------
function reciente(P: any) {
  try { const k = 'pf.recientes'; const l = JSON.parse(localStorage.getItem(k) || '[]').filter((x: any) => x.id !== P.id); l.unshift({ id: P.id, codigo: P.codigo, titulo: P.titulo }); localStorage.setItem(k, JSON.stringify(l.slice(0, 5))); } catch { /* sin almacenamiento */ }
}
export async function estado(propId: string, { usuario }: { usuario?: string } = {}) {
  const p = await buscarProp(propId); if (!p) return toast('La propiedad ya no está en la cartera.', 4000);
  let s: any; try { s = await api('estEstado', p.id); } catch (e) { return toast((e as Error).message, 5000); }
  reciente(s.prop); Ag().contexto({ tipo: 'propiedad', id: p.id });
  const resumen = `${s.prop.codigo} · ${s.prop.titulo}${s.negocios.length ? ' · ' + s.negocios.map((n: any) => `${primer(n.cliente) || 'negocio'} en ${n.etapaTxt}`).join(', ') : ''}`;
  return montar('ga-est', <EstadoPropiedad p={p} s={s} />, { usuario, resumen, prop: p.id });
}

// ---------- anotar lo que pasó (fuera de Asset) ----------
export function anotar(p: any, s: any) { montar('ga-anot', <Anotar p={p} s={s} />, { usuario: `Anotar · ${p.codigo}` }); }

// ---------- 3-4. documento ----------
export function plantillas(p: any) { montar('ga-tpl', <Plantillas p={p} />); }
export function formulario(p: any, t: any) { montar('ga-form', <Formulario p={p} t={t} />); }
export function resultado(r: any, p: any) {
  const op = r.operacion;
  montar('ga-res', <Resultado r={r} p={p} />, { resumen: `${r.plantilla} · ${p.codigo} enviado a firmar${op ? ' (operación ' + op + ')' : ''}` });
  if (op) Ag().contexto({ tipo: 'operacion', op, propId: p.id });
  Ag().festejo?.();
}
export async function usarPlantilla(propId: string, plantillaId: string, nombre: string) {
  const p = await buscarProp(propId); if (!p) return iniciar({ destino: 'documento' });
  Ag().contexto({ tipo: 'propiedad', id: p.id });
  return formulario(p, { id: plantillaId, nombre });
}
export function docNuevo(o: IDocNuevo = {}) {
  montar('ga-dn', <DocNuevo o={o} />, { usuario: o.titulo ? `Crear «${o.titulo}»` : 'Crear un documento' });
}

// ---------- 6. seguimiento ----------
/** Panel de Operaciones (de Studio) con el chat acoplado al lado */
export async function operaciones(op?: number | null) {
  Ag().acoplar(); W.show('ops'); await W.Operaciones.open();
  if (op) W.Operaciones.select(Number(op));
}
/** documentos enviados a firmar desde las propiedades (todos o los de una) */
export async function firmas(propId?: string) {
  const { propiedades } = await cartera();
  const l = propiedades.filter((p) => !propId || p.id === propId).flatMap((p) => (p.firmas || []).map((f: any) => ({ ...f, p })))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 15);
  montar('ga-fl', <Firmas lista={l} codigo={propId ? l[0]?.p.codigo || '' : undefined} />, { usuario: 'Seguimiento de firmas' });
}

// ---------- agendar (acción fija: solo agenda, nunca genera documentos) ----------
export async function agendar(pre: IPreAgendar = {}) {
  await cartera();
  const res = await api('resEstado').catch(() => null);
  montar('ga-agd', <Agendar pre={pre} res0={res} />, { usuario: (pre.tipo || 'visita') === 'visita' ? 'Agendar una visita' : 'Agendar' });
}
/** después de agendar (en Asset o en el calendario de reservas): hito del negocio y vuelta al estado de la propiedad */
export async function trasAgendar(e: any, h: any, propId?: string) {
  W.AssetRefrescar?.();
  if (h?.movido) { Ag().decir(`Hito registrado: el negocio de ${primer(h.cliente) || 'tu cliente'} pasó a «Visita».`); Ag().festejo?.(); }
  if (propId) {
    await estado(propId);
    const sg = [];
    if (/visita/i.test(e.tipo) && (e.personas || []).length) sg.push({ label: `Confirmar por WhatsApp a ${primer(e.personas[0]?.nombre || e.personas[0]) || 'el cliente'}`, accion: { tipo: 'confirmar', eventoId: e.id } });
    if (h?.movido) sg.push({ label: 'Dejarlo en «Interesado»', accion: { tipo: 'mover', negocioId: h.negocioId, etapa: 'interes' } });
    if (sg.length) Ag().sugerencias(sg);
  } else { Ag().contexto({ tipo: 'agenda', fecha: e.fecha }); Ag().sugerir(['otra'], { eventoId: e.id }); }
}
/** confirmar la visita por WhatsApp: mensaje listo (editable) con día, hora y dirección */
export async function confirmar(eventoId: string, personaId?: string | null) {
  let r: any; try { r = await api('estConfirmacion', eventoId, personaId || null); } catch (e) { return toast((e as Error).message, 5000); }
  const ev = await api('agendaObtener', eventoId).catch(() => null);
  montar('ga-wa', <ConfirmarWhatsApp eventoId={eventoId} r0={r} ev={ev} />, { usuario: 'Confirmar visita por WhatsApp' });
}

export function instalarGestion() {
  W.Gestion = {
    docNuevo, usarPlantilla, agendar, confirmar, iniciar, firmas, operaciones, estado,
    anotar: async (propId: string) => { const p = await buscarProp(propId); if (p) anotar(p, await api('estEstado', p.id).catch(() => null)); },
    documento: (propId: string) => iniciar({ destino: 'documento', propId }),
  };
}
