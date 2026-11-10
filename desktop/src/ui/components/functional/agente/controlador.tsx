// El Agente: la lógica de la conversación y la API window.Agente que usan las demás pantallas
// (Gestion, Etapas, Dictado, Lienzo, Agenda, Publicaciones…). Se instala al cargar el bundle (index.tsx).
//
// El chat se dibuja en React (Agente.tsx) dentro de #agDrawer, que se monta una sola vez y se mueve entre el
// panel lateral (body) y la pestaña «Agente» (#view-agente). Los cambios se aplican al tiro (flushSync), porque
// varias pantallas buscan #agQ, #agBody o la tarjeta recién puesta justo después de llamar a la API.
// El Agente conversa con todas las pantallas de src/renderer: los accesos a window van por W (ver abajo).
/* eslint-disable @typescript-eslint/no-explicit-any -- puente con src/renderer, que no tiene tipos */
import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { agenteService } from '../../../store/services/agente.service';
import { useAgenteStore } from '../../../store/zustand/agente.store';
import { toast } from '../../../utils/app';
import Agente from './Agente';
import { nombreHerramienta } from './Mensaje';
import { instalarGestion } from './tarjetas/gestion';
import { instalarDictado } from './dictado/controlador';
import { actual as actualLienzo, instalarLienzo, mostrar as mostrarLienzo, refrescar as refrescarLienzo } from './lienzo/controlador';
import { instalarAgenteModales } from './modales';
import type { IAgenteItem, TContexto } from '../../../store/interfaces/agente.interface';

const W = window as unknown as Record<string, any>;
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const st = () => useAgenteStore.getState();
// aplica un cambio de estado y lo deja dibujado antes de seguir
const ahora = (p: Parameters<ReturnType<typeof st>['fijar']>[0]) => flushSync(() => st().fijar(p));
const items = (f: (l: IAgenteItem[]) => IAgenteItem[]) => flushSync(() => st().cambiarItems(f));
let n = 0; // id de las tarjetas
let turno: string[] = []; // herramientas usadas en el turno (para el «siguiente paso»)
let sugeridas: any[] | null = null; // sugerencias que llegaron durante el turno
let acoplarPendiente = false;
let tRefresco: ReturnType<typeof setTimeout> | undefined;
let tGuardar: ReturnType<typeof setTimeout> | undefined;

// ---------- siguiente paso: acciones fijas, sin pasar por el modelo ----------
export const SIG: Record<string, [string, string, (d: any) => unknown]> = {
  agendar: ['calendar', 'Agendar una visita', (d) => W.Gestion.agendar({ propId: d.propId, personaId: d.personaId, negocioId: d.negocioId })],
  documento: ['filePlus', 'Generar un documento', (d) => (d.propId ? W.Gestion.documento(d.propId) : W.Gestion.iniciar({ destino: 'documento' }))],
  negocio: ['briefcase', 'Ver el negocio', (d) => d.negocioId && contexto({ tipo: 'negocio', id: d.negocioId }, { ver: true })],
  orden: ['sign', 'Generar la orden de visita', async (d) => {
    if (!d.eventoId) return toast('Primero agenda la visita.');
    const e = await W.api('agendaObtener', d.eventoId);
    W.Agenda.ordenVisita(e, (r: any) => { decir(`Orden de visita enviada a firmar: operación ${r.operacion}.`); contexto({ tipo: 'operacion', op: r.operacion, propId: e.prop?.id || null }); festejo(); sugerir(['estado', 'ops'], { op: r.operacion, propId: e.prop?.id || null }); });
  }],
  otra: ['plus', 'Agendar otra', (d) => W.Gestion.agendar({ propId: d.propId })],
  estado: ['rotateR', 'Ver estado de la firma', (d) => d.op && contexto({ tipo: 'operacion', op: d.op, propId: d.propId }, { ver: true })],
  ops: ['listCheck', 'Seguir en Operaciones', (d) => W.Gestion.operaciones(d.op)],
  propietario: ['user', 'Agregar al propietario', (d) => prellenar(`El propietario de ${d.codigo || 'la propiedad'} es `)],
  publicar: ['export', 'Publicar en Portal Inmobiliario', (d) => enviar(`Publica ${d.codigo || 'la propiedad'} en Portal Inmobiliario`)],
  crearNegocio: ['briefcase', 'Crear un negocio', (d) => prellenar(`Crea un negocio ${d.codigo ? 'de ' + d.codigo + ' ' : ''}con `)],
  verProp: ['house', 'Ver la propiedad', (d) => d.propId && contexto({ tipo: 'propiedad', id: d.propId }, { ver: true })],
};
const SIG_TRAS: Record<string, string[]> = {
  asset_crear_negocio: ['agendar', 'documento', 'negocio'], asset_mover_negocio: ['documento', 'agendar', 'negocio'], asset_crear_evento: ['orden', 'otra'],
  asset_crear_propiedad: ['propietario', 'publicar', 'documento'], asset_crear_persona: ['crearNegocio', 'agendar'], asset_vincular_persona: ['crearNegocio', 'documento'],
  asset_orden_visita: ['estado', 'ops'], asset_generar_documento: ['estado', 'ops'], asset_actualizar_propiedad: ['publicar', 'documento', 'verProp'], asset_cambiar_estado: ['verProp'],
};
export const RAPIDAS: [string, string, string, () => unknown][] = [
  ['gestionar', 'house', 'Gestionar una propiedad', () => W.Gestion.iniciar()],
  ['documento', 'filePlus', 'Generar un documento', () => W.Gestion.iniciar({ destino: 'documento' })],
  ['visita', 'calendar', 'Agendar una visita', () => W.Gestion.agendar({ propId: datos().propId })],
  ['nueva', 'mic', 'Subir una propiedad', () => W.Dictado.abrir()],
  ['firmas', 'sign', 'Seguimiento de firmas', () => W.Gestion.firmas()],
  ['hoy', 'clock', '¿Qué tengo hoy?', () => enviar('¿Qué tengo hoy?')],
];

// lo que se sabe del trabajo en curso (lienzo + contexto), para que los botones no pregunten de nuevo
export function datos(extra: Record<string, unknown> = {}) {
  const L = actualLienzo() || {}; const c: any = st().ctx || {};
  return {
    propId: c.tipo === 'propiedad' ? c.id : c.propId || L.prop?.id || L.negocio?.propId || null, negocioId: c.tipo === 'negocio' ? c.id : L.negocio?.id || null,
    personaId: L.negocio?.clienteId || null, op: c.op || L.op || null, eventoId: c.eventoId || null, codigo: L.prop?.codigo || null, ...extra,
  };
}
export const ocupado = () => { if (st().busy) { toast('Espera a que el agente termine.'); return true; } return false; };

// ---------- el contenedor: se crea una vez y React dibuja adentro ----------
function shell() {
  if ($('#agDrawer')) return;
  const d = document.createElement('aside'); d.id = 'agDrawer'; d.className = 'ag hidden';
  document.body.appendChild(d);
  const raiz = createRoot(d);
  flushSync(() => raiz.render(<StrictMode><Agente /></StrictMode>));
  // enlaces de los mensajes y de las tarjetas: se abren en el navegador
  d.addEventListener('click', (e) => { const a = (e.target as HTMLElement).closest('[data-url]') as HTMLElement | null; if (a) { e.preventDefault(); W.pf.openUrl(a.dataset.url); } });
  ahora({ nombre: primerNombre() });
}
const primerNombre = () => { const x = String(W.Usuario?._u?.user?.namePerson || '').trim().split(/\s+/)[0] || ''; return x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : ''; };
// lo que se dictó con el micrófono del cuadro: se suma a lo escrito y se envía
export function alDictar(t: string) { const q = $('#agQ') as HTMLTextAreaElement; q.value = [q.value.trim(), t].filter(Boolean).join(' '); ajustarCaja(); enviar(); }
export function ajustarCaja() { const q = $('#agQ') as HTMLTextAreaElement | null; if (q) { q.style.height = 'auto'; q.style.height = Math.min(q.scrollHeight, 180) + 'px'; } }
export function bajar() { const b = $('#agBody'); if (b) b.scrollTop = b.scrollHeight; }

// ---------- pantalla completa ↔ panel lateral ----------
function aPanel() { const d = $('#agDrawer'); if (!d) return; d.classList.remove('ag-full'); document.body.appendChild(d); ahora({ modo: 'panel' }); }
function openPanel() {
  shell(); if (st().modo === 'full' && $('#view-agente')!.classList.contains('hidden')) aPanel();
  ahora({ abierto: true, nombre: primerNombre() }); $('#agDrawer')!.classList.remove('hidden'); document.body.classList.toggle('ag-on', st().modo === 'panel'); $('#agBtn')?.classList.add('on');
  bajar(); setTimeout(() => $('#agQ')?.focus(), 60);
}
function open() { return W.members(openPanel, 'El Agente Portalfirma trabaja con tu cuenta. Inicia sesión para usarlo.'); }
function close() { ahora({ abierto: false }); $('#agDrawer')?.classList.add('hidden'); document.body.classList.remove('ag-on'); $('#agBtn')?.classList.remove('on'); }
function toggle() { if (st().modo === 'full' && st().abierto) return $('#agQ')?.focus(); return st().abierto ? close() : open(); }
export function vista() {
  return W.members(() => {
    shell(); W.ir('agente'); const d = $('#agDrawer')!; $('#view-agente')!.appendChild(d); d.classList.add('ag-full'); d.classList.remove('hidden');
    ahora({ modo: 'full', abierto: true, nombre: primerNombre() }); document.body.classList.remove('ag-on'); $('#agBtn')?.classList.remove('on');
    bajar(); listarConvs(); lienzoOn(); mostrarLienzo(st().ctx); setTimeout(() => $('#agQ')?.focus(), 60);
  }, 'El Agente Portalfirma trabaja con tu cuenta. Inicia sesión para usarlo.');
}
// cada vez que cambia la pantalla: si el chat estaba a pantalla completa, pasa a panel (abierto si se pidió acoplar)
function alMostrar(view: string) {
  if (view === 'agente' || st().modo !== 'full') return;
  aPanel(); if (acoplarPendiente) { acoplarPendiente = false; openPanel(); } else close();
}
function acoplar() { acoplarPendiente = st().modo === 'full'; }

// ---------- lienzo (lo que se muestra al lado del chat a pantalla completa) ----------
const lienzoOn = () => { const c = st().ctx; const on = !!(c && c.tipo && c.tipo !== 'inicio'); $('#agDrawer')?.classList.toggle('lz-off', !on); return on; };
const lienzoVisible = () => { const cv = $('#agCanvas'); return st().modo === 'full' && st().abierto && !!cv && lienzoOn() && getComputedStyle(cv).display !== 'none'; };
export function contexto(c: TContexto & { type?: string }, { ver }: { ver?: boolean } = {}) {
  const { type: _t, ...x } = c; ahora({ ctx: x as TContexto });
  if (lienzoVisible()) mostrarLienzo(x); else if (ver) vista();
  guardar();
}
function festejo() {
  const d0 = $('#agDrawer'); const d = d0 && !d0.classList.contains('hidden') ? d0 : document.body;
  const f = document.createElement('div'); f.className = 'ag-festejo'; f.innerHTML = Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
  d.appendChild(f); setTimeout(() => f.remove(), 1400);
}

// ---------- la conversación ----------
const quitarEspera = () => { if (!st().busy) items((l) => l.filter((x) => x.k !== 'pensando')); };
const marcarUsados = () => items((l) => l.map((x) => (x.k === 'sig' || x.k === 'sug2' ? { ...x, usado: true } : x)));
function esperar() { if (st().items.some((x) => x.k === 'pensando')) return; items((l) => [...l, { k: 'pensando' }]); }
export function decir(text: string, k: 'bot' | 'nota' | 'error' = 'bot') { shell(); if (!st().abierto) openPanel(); quitarEspera(); items((l) => [...l, { k, text }]); bajar(); guardar(); }
export function sugerir(opciones: string[], d?: Record<string, unknown>) { items((l) => [...l, { k: 'sig', opciones, datos: d || null }]); bajar(); guardar(); }
function sugerencias(lista: any[]) { if (!lista?.length) return; items((l) => [...l.map((x) => (x.k === 'sug2' ? { ...x, usado: true } : x)), { k: 'sug2', lista }]); bajar(); guardar(); }
export function usar(i: number) { items((l) => l.map((x, j) => (j === i && (x.k === 'sig' || x.k === 'sug2') ? { ...x, usado: true } : x))); guardar(); }

// tarjetas del flujo guiado: viven dentro de la conversación con su propio estado (el nodo se reutiliza)
function tarjeta(node: HTMLElement, { usuario }: { usuario?: string } = {}) {
  shell(); if (!st().abierto) openPanel(); const id = ++n;
  if (node.dataset.kit === undefined && !node.querySelector(':scope > .ga-x')) { const x = document.createElement('button'); x.className = 'ga-x'; x.title = 'Cerrar'; x.innerHTML = W.icon('x', 14); x.onclick = () => quitar(node); node.prepend(x); }
  items((l) => [...l.filter((x) => st().busy || x.k !== 'pensando'), ...(usuario ? [{ k: 'user' as const, text: usuario, deCard: id }] : []), { k: 'card' as const, id, node }]);
  bajar(); guardar(); irA(node); return id;
}
// llevar la vista a la tarjeta nueva (arriba de la tarjeta, junto a su mensaje), aunque carguen imágenes después
function irA(node: HTMLElement) {
  const b = $('#agBody'); if (!b) return;
  const ir = () => {
    const slot = node.parentElement; const prev = slot?.previousElementSibling; const ancla = (prev?.classList.contains('user') ? prev : node) as HTMLElement;
    const top = ancla.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - 10; b.scrollTo({ top: Math.max(0, top) });
  };
  requestAnimationFrame(() => requestAnimationFrame(ir));
  node.querySelectorAll('img').forEach((im) => { if (!im.complete) im.addEventListener('load', ir, { once: true }); });
  node.classList.remove('ga-nueva'); void node.offsetWidth; node.classList.add('ga-nueva');
}
// cerrar una tarjeta sin hacer nada (se tocó por error): desaparece junto con su mensaje
function quitar(node: HTMLElement) {
  const it = st().items.find((x) => x.k === 'card' && x.node === node) as Extract<IAgenteItem, { k: 'card' }> | undefined; if (!it) return;
  items((l) => l.filter((x) => x !== it && !(x.k === 'user' && x.deCard === it.id))); guardar(); $('#agQ')?.focus();
}

export async function enviar(texto?: string) {
  shell();
  const q = $('#agQ') as HTMLTextAreaElement; const t = (texto ?? q.value).trim(); if (!t || st().busy) return;
  // solo un código («CV-5549»): muestra cómo está la propiedad sin pasar por la IA
  if (/^[a-z]{1,5}-?\d{2,6}$/i.test(t)) {
    await W.cargar(); const c = t.toUpperCase().replace(/^([A-Z]+)-?/, '$1-'); const p = W.Inmo._IM.data.propiedades.find((x: any) => String(x.codigo).toUpperCase() === c);
    if (p) { q.value = ''; q.style.height = 'auto'; marcarUsados(); return W.Gestion.estado(p.id, { usuario: t }); }
  }
  if (!(await W.Asistente.ensureConsent())) return;
  if (!st().abierto) openPanel();
  q.value = ''; q.style.height = 'auto'; turno = []; sugeridas = null;
  marcarUsados(); ahora({ busy: true }); items((l) => [...l, { k: 'user', text: t }, { k: 'pensando' }]); bajar();
  const r = await agenteService.enviar(t);
  ahora({ busy: false }); items((l) => l.filter((x) => x.k !== 'pensando'));
  if (r.ok && r.data) {
    const d = r.data; if (d.text) items((l) => [...l, { k: 'bot', text: d.text! }]); W.Usuario?.refresh?.();
    const ult = [...(d.herramientas?.length ? d.herramientas : turno)].reverse().find((x) => SIG_TRAS[x]); const sg = d.sugerencias || sugeridas;
    if (sg?.length) items((l) => [...l, { k: 'sug2', lista: sg as any }]); else if (ult) items((l) => [...l, { k: 'sig', opciones: SIG_TRAS[ult] }]);
    sugeridas = null;
  } else if (r.code === 'NEEDS_LOGIN') items((l) => [...l, { k: 'error', text: 'Tu sesión de Portalfirma expiró. Inicia sesión de nuevo.' }]);
  else items((l) => [...l, { k: 'error', text: r.error || 'No se pudo completar.' }]);
  bajar(); ($('#agQ') as HTMLTextAreaElement | null)?.focus(); guardar();
}
export function prellenar(t: string) { shell(); if (!st().abierto) openPanel(); const q = $('#agQ') as HTMLTextAreaElement; q.value = t; q.focus(); q.setSelectionRange(t.length, t.length); ajustarCaja(); }

// una confirmación (cobro, envío): con los datos protegidos, que van directo a Portalfirma
export function confirmar(id: string, ok: boolean, secretos: Record<string, string>) {
  if (ok && Object.values(secretos).some((v) => !v.trim())) { toast('Completa el dato protegido para continuar.'); return false; }
  items((l) => l.map((x) => (x.k === 'confirm' && x.id === id ? { ...x, hecho: ok ? 'si' : 'no' } : x.k === 'tool' && x.id === id ? { ...x, estado: ok ? 'corriendo' : 'cancelado' } : x)));
  agenteService.confirmar(id, { ok, secretos: ok ? secretos : {} });
  return true;
}

// sugerencias (siguiente paso, opcional): acciones fijas, sin pasar por el modelo
export async function accion(a: any = {}) {
  if (!st().busy) esperar();
  setTimeout(() => { if (!st().busy && st().items.some((x) => x.k === 'pensando')) quitarEspera(); }, 8000);
  try {
    const t = a.tipo; const ref = () => { W.AssetRefrescar?.(); if (lienzoVisible()) refrescarLienzo(); };
    if (t === 'agendar') return W.Gestion.agendar({ tipo: 'visita', propId: a.propId || null, personaId: a.personaId || null, negocioId: a.negocioId || null, fecha: a.fecha || undefined, hora: a.hora || undefined });
    if (t === 'documento') return a.propId ? W.Gestion.documento(a.propId) : W.Gestion.iniciar({ destino: 'documento' });
    if (t === 'orden') { const e = await W.api('agendaObtener', a.eventoId); return W.Agenda.ordenVisita(e, (r: any) => { decir(`Orden de visita enviada a firmar: operación ${r.operacion}.`); contexto({ tipo: 'operacion', op: r.operacion, propId: e.prop?.id || null }); festejo(); sugerir(['estado', 'ops'], { op: r.operacion, propId: e.prop?.id || null }); }); }
    if (t === 'mover') { const r = await W.api('assetEjecutar', 'asset_mover_negocio', { negocio: a.negocioId, etapa: a.etapa }); decir(`Listo: negocio en «${r.negocio.etapa}».${(r.avisos || []).length ? ' ' + r.avisos.join(' ') : ''}`); festejo(); ref(); return; }
    if (t === 'negocio') { const x = await W.api('negObtener', a.negocioId); return contexto(x.propId ? { tipo: 'propiedad', id: x.propId, negocio: x.id } : { tipo: 'negocio', id: x.id }, { ver: true }); }
    if (t === 'negocioNuevo') { await W.cargar(); const p = W.Inmo._IM.data.propiedades.find((x: any) => x.id === a.propId); return prellenar(`Crea un negocio de ${p?.arriendo ? 'arriendo' : 'venta'} de ${p?.codigo || ''} con `); }
    if (t === 'estadoProp') return W.Gestion.estado(a.propId, { usuario: 'Ver estado de la propiedad' });
    if (t === 'confirmar') return W.Gestion.confirmar(a.eventoId, a.personaId || null);
    if (t === 'fotosDrive') return W.Fotos.drive(a.propId);
    if (t === 'fotosArchivos') return W.Fotos.archivos(a.propId);
    if (t === 'ficha') { acoplar(); return W.Inmo.abrirFicha(a.propId); }
    if (t === 'docNuevo') return W.Gestion.docNuevo({ propId: a.propId || null, titulo: a.titulo || '', tipoDoc: a.tipoDoc || null, personaId: a.personaId || null });
    if (t === 'plantilla') return a.propId ? W.Gestion.usarPlantilla(a.propId, a.plantillaId, a.nombre) : W.Gestion.iniciar({ destino: 'documento' });
    if (t === 'pdf') return W.api('dgAbrir', a.archivo);
    if (t === 'publicar') { acoplar(); return W.Publicaciones.publicar(a.propId); }
    if (t === 'interesados') { acoplar(); return W.Publicaciones.abrir('interesados'); }
  } catch (e) { toast((e as Error).message, 5000); } finally { if (!st().busy && st().items.some((x) => x.k === 'pensando')) quitarEspera(); }
}

// ---------- conversaciones guardadas ----------
function serial(): IAgenteItem[] {
  return st().items.filter((x) => x.k !== 'pensando' && !(x.k === 'sig' && x.usado)).map((x) => (
    x.k === 'card' ? { k: 'hecho', text: x.node.dataset.resumen || x.node.innerText.replace(/\s+/g, ' ').trim().slice(0, 160), ...(x.node.dataset.prop ? { propId: x.node.dataset.prop } : {}) }
      : x.k === 'confirm' && !x.hecho ? { ...x, hecho: 'no' } : x.k === 'tool' && x.estado === 'corriendo' ? { ...x, estado: 'cancelado' } : x));
}
export function guardar() {
  if (!st().items.some((x) => x.k === 'user' || x.k === 'card')) return;
  if (!st().conv) ahora({ conv: { id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) } });
  clearTimeout(tGuardar);
  tGuardar = setTimeout(async () => {
    const c = st().conv!; const r = await agenteService.guardar(c.id, { items: serial(), ctx: st().ctx });
    if (r.ok && st().conv?.id === c.id) { ahora({ conv: { ...c, titulo: r.data?.titulo } }); listarConvs(); }
  }, 300);
}
export function buscarConvs(q: string) { ahora({ q }); listarConvs(); }
export async function listarConvs() { const r = await agenteService.conversaciones(st().q); ahora({ convs: r.ok ? r.data || [] : [] }); }
export async function abrirConv(id: string) {
  if (ocupado()) return;
  const r = await agenteService.abrir(id); if (!r.ok) return toast(r.error || 'No se pudo abrir.', 4000);
  ahora({ conv: { id, titulo: r.data?.titulo }, items: r.data?.items || [], adjuntos: [], ctx: r.data?.ctx || { tipo: 'inicio' } });
  bajar(); listarConvs(); if (lienzoVisible()) mostrarLienzo(st().ctx);
  const c: any = st().ctx; if (c.tipo === 'propiedad' && c.id) W.Gestion.estado(c.id); // continuidad: cómo está hoy la propiedad de esa conversación
}
export async function fijarConv(id: string, fijada: boolean) { await agenteService.fijar(id, fijada); listarConvs(); }
export async function nueva() {
  if (ocupado()) return;
  await agenteService.nueva(); ahora({ conv: null, items: [], adjuntos: [], ctx: { tipo: 'inicio' } });
  listarConvs(); if (lienzoVisible()) mostrarLienzo(st().ctx); setTimeout(() => $('#agQ')?.focus(), 30);
}
// el nombre cambió o se borró en el formulario (modales.ts): se refleja aquí
export function alCambiarConv(id: string, cambio: { titulo?: string; borrada?: boolean }) {
  if (st().conv?.id === id) { if (cambio.borrada) nueva(); else ahora({ conv: { id, titulo: cambio.titulo } }); }
  listarConvs();
}

// ---------- adjuntos ----------
export async function elegirArchivo() { const r = await agenteService.elegirArchivo(); if (!r.ok) return toast(r.error || '', 4000); if (r.data) ahora({ adjuntos: r.data }); }
export async function quitarAdjunto(nombre: string) { const r = await agenteService.quitarAdjunto(nombre); if (r.ok) ahora({ adjuntos: r.data || [] }); }
// adjuntar el documento abierto en el editor (desde el formulario de modales.ts)
export async function adjuntarBytes(nombre: string, bytes: unknown) { const r = await agenteService.adjuntar(nombre, bytes); if (!r.ok) return toast(r.error || '', 4000); ahora({ adjuntos: r.data || [] }); $('#agQ')?.focus(); }

// ---------- eventos del proceso principal ----------
function alEvento(e: any) {
  if (e.type === 'tool') {
    items((l) => {
      const i = l.findIndex((x) => x.k === 'tool' && x.id === e.id);
      const t = { ...(i >= 0 ? l[i] : { k: 'tool', id: e.id }), name: e.name, estado: e.estado, ...(e.args ? { args: e.args } : {}), resumen: e.resumen || '', url: e.url || null } as IAgenteItem;
      if (i >= 0) return l.map((x, j) => (j === i ? t : x));
      const p = l.findIndex((x) => x.k === 'pensando'); return p >= 0 ? [...l.slice(0, p), t, ...l.slice(p)] : [...l, t];
    });
    if (e.estado === 'ok') turno.push(e.name);
    if (e.name === 'ingest_document_tools' && e.estado === 'ok') ahora({ adjuntos: st().adjuntos.map((a) => (e.resumen?.includes(a.name) ? { ...a, subido: true } : a)) });
  } else if (e.type === 'confirm') {
    const { type: _t, ...c } = e;
    items((l) => { const m = l.map((x) => (x.k === 'tool' && x.id === e.id ? { ...x, estado: 'esperando' as const } : x)); const p = m.findIndex((x) => x.k === 'pensando'); const it = { k: 'confirm', ...c } as IAgenteItem; return p >= 0 ? [...m.slice(0, p), it, ...m.slice(p)] : [...m, it]; });
    if (!st().abierto) openPanel();
    setTimeout(() => ($(`[data-conf="${e.id}"] input`) as HTMLInputElement | null)?.focus(), 50);
  } else if (e.type === 'navegar') {
    if (e.pantalla === 'operaciones') { W.Gestion?.operaciones(e.id); return; }
    if (st().modo === 'full' && !e.explicito) return; // a pantalla completa, el lienzo muestra el resultado sin salir del chat
    if (st().modo === 'full') acoplarPendiente = true; // «abre…»: la pantalla se abre y el chat sigue al lado
    W.AssetNav?.(e.pantalla, e.id); return;
  } else if (e.type === 'whatsapp') { listarConvs(); if (st().conv?.id === 'whatsapp' && !st().busy && e.que === 'conversacion') abrirConv('whatsapp'); W.WhatsAppAgente?.refrescar?.(); return;
  } else if (e.type === 'aviso') { toast(e.texto, 10000); return;
  } else if (e.type === 'tarjeta' && e.tipo === 'dictado') { W.Dictado?.mostrar(e.r, e.texto); return;
  } else if (e.type === 'datos' && e.que === 'postventa') { W.Postventa?.refrescar?.(); return;
  } else if (e.type === 'datos') { clearTimeout(tRefresco); tRefresco = setTimeout(() => { W.AssetRefrescar?.(); if (lienzoVisible()) refrescarLienzo(); }, 250); return;
  } else if (e.type === 'contexto') { contexto(e); return;
  } else if (e.type === 'sugerencias') { sugeridas = e.lista; return;
  } else if (e.type === 'nota') { items((l) => { const p = l.findIndex((x) => x.k === 'pensando'); const it: IAgenteItem = { k: 'nota', text: e.text }; return p >= 0 ? [...l.slice(0, p), it, ...l.slice(p)] : [...l, it]; }); }
  bajar();
}

// ---------- instalación: API pública, eventos y botón de la barra superior ----------
export function instalarAgente() {
  W.pf?.onAgentEvent?.(alEvento);
  instalarGestion(); instalarDictado(); instalarLienzo(); instalarAgenteModales();
  W.Agente = {
    open, close, toggle, enviar, vista, alMostrar, acoplar, tarjeta, decir, bajar, prellenar, sugerir, sugerencias, accion, quitar, contexto, festejo, guardar, nueva,
    alCambiarConv, adjuntarBytes, elegirArchivo, nombreHerramienta,
    get _a() { const s = st(); return { ...s, open: s.abierto, ctx: s.ctx }; }, // lectura (pruebas y depuración)
  };
  const ponerBoton = () => {
    const acc = $('#account'); if (!acc || $('#agBtn')) return;
    const b = document.createElement('button'); b.id = 'agBtn'; b.className = 'ag-btn'; b.title = 'Agente Portalfirma';
    b.innerHTML = `${W.icon('sparkle', 15)}<span>Agente</span>`; b.onclick = toggle; acc.parentNode!.insertBefore(b, acc);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ponerBoton); else ponerBoton();
}
