// Motor del editor PDF: el documento activo dibujado en pantalla.
//  · Páginas en una columna con desplazamiento continuo (pdf.js; se dibujan solo las visibles), capa de texto
//    seleccionable, enlaces y resaltado de la búsqueda.
//  · Capa de objetos de la página activa: textos (nuevos o editados), imágenes y «tapar», con arrastre,
//    cambio de tamaño, selección de área y edición en el lugar (contenteditable).
//  · Edición del texto del PDF: detecta párrafos (o los reconoce con OCR), borra el original del archivo y lo vuelve
//    un objeto editable con una fuente equivalente.
// React dibuja todo lo demás (barra, miniaturas, panel) y deja vacío #edStage, que maneja este módulo. Cuando algo
// cambia, el motor avisa con tocar() y React vuelve a leer el documento (un objeto mutable, ver editor.store.ts).
/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js no tiene tipos en la app */
import { CSS2FAM, fontMetrics } from './fuentes';
import { blocksFor, buildIndex, ocrPage, sampleColors, textIndex, vp1 } from './bloques';
import { hayObjetos, hornear, richStyle } from './hornear';
import { removeTextInRects } from './pdftext';
import { FAMILIAS, abrirConPdfjs, cargarPdf, clamp, cssRgb, esGrande, guardarPdf, hex, icono, normText, pdfjs } from './comun';
import { ahora, editorArchivos, editorEstado, tocar, tocarAhora } from '../../store/hooks/useEditor.hook';
import { toast } from '../app';
import type { IBloque, IDocumento, IObjeto, THerramienta } from '../../store/interfaces/editor.interface';

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T | null;
// El documento activo y las pestañas (viven en el store)
export const ed = () => editorEstado().doc;
export const pestanas = () => editorEstado().pestanas;
export const G: { busy: boolean; busyMsg: string; lastPrint?: unknown } = { busy: false, busyMsg: '' }; // una operación a la vez
let uid = 0;
export const nuevoId = () => 'o' + (++uid);

// Lo que el motor le pide a la interfaz (lo conecta el controlador del editor): ventanas y el formulario de la plantilla
export const ganchos = {
  abrirEnlace: (_url: string) => {},
  focoCampo: (_id: string) => {},
  imprimir: () => {},
  leer: (_on?: boolean) => {},
};

// ---------- trabajando ----------
export function busy(msg: string | null, pct?: number | null) {
  G.busy = !!msg; G.busyMsg = msg || '';
  globalBusy();
  ahora(() => editorEstado().editorOcupado(msg, pct ?? null));
}
// Fuera del editor (Inicio, Plazos, etc.) el aviso de «trabajando» se muestra flotante, para que se vea que algo está pasando
export function globalBusy() {
  const g = document.getElementById('globalBusy'); if (!g) return;
  const out = document.getElementById('view-editor')?.classList.contains('hidden');
  g.classList.toggle('hidden', !(G.busy && out));
  const s = g.querySelector('span'); if (s) s.textContent = G.busyMsg || '';
}
let stepDepth = 0; // pasos anidados: el aviso de «trabajando» se mantiene hasta que termina el de afuera
export async function step<R>(msg: string, fn: () => Promise<R>): Promise<R | undefined> {
  stepDepth++; if (stepDepth === 1) busy(msg);
  try { return await fn(); } catch (e: any) { if (stepDepth > 1) throw e; if (!e.silent) { console.error(e); toast('Error: ' + e.message, 6000); } return undefined; } finally { stepDepth--; if (!stepDepth) busy(null); }
}

// ---------- estado del documento ----------
export function setDirty(v = true) { ed().dirty = v; syncDocState(); }
export function syncDocState() {
  const T = ed();
  editorArchivos.estado({ name: T.name, dirty: T.dirty, hasDoc: !!T.bytes, path: T.path, dirtyNames: pestanas().filter((t) => t.dirty).map((t) => t.name) });
  tocar();
}
function cloneOverlays(T: IDocumento) { return JSON.parse(JSON.stringify(T.overlays, (k, v) => (k === 'bytes' ? undefined : v))); }
export function snapshot() {
  const T = ed(); if (!T.bytes) return;
  const imgs: Record<string, Uint8Array> = {}; for (const l of Object.values(T.overlays)) for (const o of l) if (o.bytes) imgs[o.id] = o.bytes;
  T.undo.push({ bytes: T.bytes, overlays: cloneOverlays(T), imgs, ocr: JSON.parse(JSON.stringify(T.ocr)) });
  while (T.undo.length > (T.bytes.length > 40e6 ? 3 : 10)) T.undo.shift();
  setDirty(true);
}
export async function undo() {
  const T = ed(); const s = T.undo.pop(); if (!s) return;
  for (const l of Object.values(s.overlays) as IObjeto[][]) for (const o of l) if (s.imgs[o.id]) o.bytes = s.imgs[o.id];
  T.overlays = s.overlays; T.ocr = s.ocr || {}; T.sel = null; T.editing = null;
  if (s.bytes !== T.bytes) await setBytes(s.bytes); else { for (let i = 0; i < T.count; i++) renderOverlaysFor(i); if (T.tool === 'edittext') showTextBlocks(); }
  setDirty(true);
}

// ---------- carga y dibujo ----------
// Cambia los bytes del documento (y lo vuelve a dibujar si es el activo)
export async function setBytes(bytes: Uint8Array | ArrayBuffer, { keepPage = true, structural = false, keepBlocks = false, T = ed() } = {}) {
  T.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try { await T.pdf?.destroy(); } catch { /* ya cerrado */ }
  T.pdf = await abrirConPdfjs(T.bytes, { fontExtraProperties: true });
  T.count = T.pdf.numPages; T.vp1 = {}; if (!keepBlocks) T.blocks = {}; T.textIndex = {}; T.outline = undefined; T.rev++;
  // Tamaño de todas las páginas (para el desplazamiento continuo)
  for (let i = 0; i < T.count; i += 40) {
    await Promise.all(Array.from({ length: Math.min(40, T.count - i) }, async (_, k) => { const p = await T.pdf.getPage(i + k + 1); T.vp1[i + k] = p.getViewport({ scale: 1 }); }));
  }
  if (structural) T.ocr = {};
  if (!keepPage || T.current >= T.count) T.current = clamp(T.current, 0, T.count - 1);
  T.selected = new Set([...T.selected].filter((i) => i < T.count));
  if (ed() !== T) return;
  tocarAhora(); await renderPage();
  if (T.find?.q) runFind(T.find.q, { keepIdx: true });
}

function fitScale(T: IDocumento, v: any) {
  const area = $('#edCanvasWrap'); const availW = Math.max(300, (area?.clientWidth || 800) - 48);
  const availH = Math.max(300, (area?.clientHeight || 700) - 70);
  const fitAll = esGrande(v) || v.width > v.height;
  return (fitAll ? Math.min(availW / v.width, availH / v.height) : Math.min(availW / v.width, 1.6)) * T.zoom;
}
type TPapel = HTMLDivElement & { _ready?: Promise<void> | null; _task?: any; _divs?: HTMLElement[] | null; _strs?: string[] | null; _hl?: number[] | null; _k?: number };
export const paper = (i: number) => document.querySelector(`#edStage .ed-paper[data-i="${i}"]`) as TPapel | null;
let shownTab: IDocumento | null = null; // documento dibujado actualmente en pantalla
let pageObserver: IntersectionObserver | null = null;
export const documentoDibujado = () => shownTab;
export const olvidarDibujado = () => { shownTab = null; };

// Desplazamiento continuo: todas las páginas en una columna; se dibujan solo las visibles.
export async function renderPage() {
  const T = ed(); if (!T.pdf) return;
  ++T.renderToken;
  const stage = $('#edStage'); if (!stage) return;
  shownTab = T;
  pageObserver?.disconnect();
  stage.innerHTML = '';
  T.scales = [];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < T.count; i++) {
    const v = T.vp1[i]; const sc = fitScale(T, v); T.scales[i] = sc;
    const pg = document.createElement('div'); pg.className = 'ed-paper'; pg.dataset.i = String(i);
    pg.style.width = Math.floor(v.width * sc) + 'px'; pg.style.height = Math.floor(v.height * sc) + 'px';
    pg.innerHTML = '<canvas></canvas><div class="textLayer"></div><div class="ed-links"></div><div class="ed-layer"></div>';
    frag.appendChild(pg);
  }
  stage.appendChild(frag);
  stage.className = 'ed-stage mode-' + T.tool;
  const view = $('#edCanvasWrap')!;
  pageObserver = new IntersectionObserver((ents) => {
    for (const en of ents) { if (en.isIntersecting) drawPage(en.target as TPapel); else releasePage(en.target as TPapel); }
  }, { root: view, rootMargin: '900px 0px' });
  stage.querySelectorAll('.ed-paper').forEach((el) => pageObserver!.observe(el));
  for (let i = 0; i < T.count; i++) renderOverlaysFor(i);
  setCurrent(T.current, { force: true });
  const el = paper(T.current);
  if (el) view.scrollTop = el.offsetTop - 52 + T.scrollFrac * el.offsetHeight;
  await drawPage(el);
}
export function drawPage(el: TPapel | null): Promise<void> {
  if (!el) return Promise.resolve();
  if (el._ready) return el._ready;
  const T = ed(); const i = Number(el.dataset.i);
  el._ready = (async () => {
    let page; try { page = await T.pdf.getPage(i + 1); } catch { return; }
    if (ed() !== T || !el.isConnected) return;
    const v1 = T.vp1[i] || page.getViewport({ scale: 1 }); const sc = T.scales[i];
    const vp = page.getViewport({ scale: sc });
    const canvas = el.querySelector('canvas')!;
    const k = Math.min(window.devicePixelRatio || 1, Math.sqrt(16e6 / (vp.width * vp.height)));
    canvas.width = Math.floor(vp.width * k); canvas.height = Math.floor(vp.height * k);
    el._k = canvas.width / v1.width; // px de canvas por punto
    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: sc * k }) });
    el._task = task;
    try { await task.promise; } catch (e: any) { if (e?.name !== 'RenderingCancelledException') console.warn(e); return; }
    el._task = null;
    if (ed() !== T || !el.isConnected) return;
    el.classList.add('drawn');
    await Promise.all([drawTextLayer(el, page, vp, T, i), drawLinks(el, page, vp, T)]);
  })();
  return el._ready;
}
function releasePage(el: TPapel) {
  const i = Number(el.dataset.i); if (i === ed().current || !el._ready) return;
  try { el._task?.cancel(); } catch { /* ya terminó */ }
  el._ready = null; el._task = null; el._divs = null; el._strs = null; el._hl = null;
  const c = el.querySelector('canvas')!; c.width = 0; c.height = 0;
  el.querySelector('.textLayer')!.innerHTML = ''; el.querySelector('.ed-links')!.innerHTML = '';
  el.classList.remove('drawn');
}
// Página activa: es la que recibe la edición (#edCanvas / #edLayer).
export function setCurrent(i: number, { force = false } = {}) {
  const T = ed(); i = clamp(i, 0, T.count - 1);
  if (!force && i === T.current && $('#edLayer')) return;
  if (T.editing) stopEditing();
  const prev = T.current;
  const old = $('#edLayer'); if (old) { old.removeAttribute('id'); old.querySelectorAll('.tb').forEach((n) => n.remove()); }
  $('#edCanvas')?.removeAttribute('id');
  document.querySelectorAll('#edStage .ed-paper.current').forEach((n) => n.classList.remove('current'));
  if (!force) T.sel = null;
  T.current = i;
  if (prev !== i) renderOverlaysFor(prev);
  const el = paper(i); if (!el) return;
  el.classList.add('current');
  el.querySelector('canvas')!.id = 'edCanvas'; el.querySelector('.ed-layer')!.id = 'edLayer';
  T.scale = T.scales[i] || T.scale;
  T.scanned = false;
  renderOverlays();
  tocar(); // número de página, miniatura actual y panel
  drawPage(el).then(() => { if (ed() !== T || T.current !== i) return; if (T.tool === 'edittext') showTextBlocks(); else checkScanned(); });
}
export function onViewScroll() {
  const T = ed(); const view = $('#edCanvasWrap'); if (!T.pdf || !view || shownTab !== T) return;
  const y = view.scrollTop + view.clientHeight * 0.35;
  const papers = document.querySelectorAll<HTMLElement>('#edStage .ed-paper'); if (!papers.length) return;
  let lo = 0, hi = papers.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (papers[m].offsetTop <= y) lo = m; else hi = m - 1; }
  if (lo !== T.current && !T.editing && !layerDragging) setCurrent(lo);
  const cur = paper(T.current); if (cur) T.scrollFrac = clamp((view.scrollTop + 52 - cur.offsetTop) / cur.offsetHeight, -0.5, 1);
}
// Ir a una página (yPt: posición dentro de la página, en puntos).
export function goto(i: number, yPt = 0) {
  const T = ed();
  if (!T.pdf || i < 0 || i >= T.count) return;
  if (T.editing) stopEditing();
  const el = paper(i); const view = $('#edCanvasWrap');
  if (el && view) view.scrollTop = el.offsetTop - 52 + yPt * (T.scales[i] || 1);
  T.scrollFrac = el ? (yPt * (T.scales[i] || 1)) / el.offsetHeight : 0;
  setCurrent(i);
}
export function zoom(k: number) { const T = ed(); if (!T.pdf) return; T.zoom = k === 0 ? 1 : clamp(T.zoom * (k > 0 ? 1.25 : 0.8), 0.25, 8); renderPage(); }

// --- Capa de texto seleccionable (copiar) y resaltado de búsqueda
async function drawTextLayer(el: TPapel, page: any, vp: any, T: IDocumento, i: number) {
  const tl = el.querySelector('.textLayer') as HTMLElement; tl.innerHTML = '';
  tl.style.setProperty('--scale-factor', String(vp.scale));
  let tc; try { tc = await page.getTextContent(); } catch { return; }
  if (!T.textIndex[i]) T.textIndex[i] = buildIndex(tc);
  const divs: HTMLElement[] = [], strs: string[] = [];
  try { await pdfjs().renderTextLayer({ textContentSource: tc, container: tl, viewport: vp, textDivs: divs, textContentItemsStr: strs }).promise; } catch { return; }
  if (ed() !== T || !el.isConnected) return;
  el._divs = divs; el._strs = strs;
  applyHighlights(el);
}
function applyHighlights(el: TPapel) {
  const divs = el._divs, strs = el._strs; if (!divs || !strs) return;
  for (const k of el._hl || []) divs[k].textContent = strs[k];
  el._hl = [];
  const T = ed(); const f = T.find; if (!f?.matches?.length) return;
  const i = Number(el.dataset.i); const idx = T.textIndex[i]; if (!idx) return;
  const per = new Map<number, [number, number, boolean][]>();
  f.matches.forEach((m, n) => {
    if (m.p !== i) return;
    for (let k = 0; k < idx.starts.length; k++) {
      const a = idx.starts[k], b = a + idx.lens[k];
      if (b <= m.s) continue; if (a >= m.e) break;
      if (!per.has(k)) per.set(k, []);
      per.get(k)!.push([Math.max(0, m.s - a), Math.min(idx.lens[k], m.e - a), n === f.idx]);
    }
  });
  for (const [k, ranges] of per) {
    const d = divs[k], str = strs[k]; if (!d) continue;
    ranges.sort((x, y) => x[0] - y[0]);
    d.textContent = ''; let pos = 0;
    for (const [a, b, cur] of ranges) {
      if (a < pos) continue;
      if (a > pos) d.append(str.slice(pos, a));
      const sp = document.createElement('span'); sp.className = 'hl' + (cur ? ' cur' : ''); sp.textContent = str.slice(a, b); d.append(sp); pos = b;
    }
    if (pos < str.length) d.append(str.slice(pos));
    el._hl.push(k);
  }
}
const refreshHighlights = () => document.querySelectorAll<TPapel>('#edStage .ed-paper').forEach((el) => applyHighlights(el));

// --- Buscar (⌘F)
export function find() {
  const T = ed(); if (!T.bytes) return;
  T.findOpen = true; tocarAhora();
  const inp = $<HTMLInputElement>('#edFindQ'); if (inp) { inp.focus(); inp.select(); }
}
export function closeFind() { const T = ed(); T.findOpen = false; T.find = null; refreshHighlights(); tocar(); }
export async function runFind(q: string, { keepIdx = false } = {}) {
  const T = ed();
  const prevIdx = keepIdx && T.find ? T.find.idx : -1;
  const nq = normText(String(q || '').trim()).replace(/\s+/g, ' ');
  T.find = { q, matches: [], idx: -1, searching: true };
  tocar();
  if (!nq) { T.find.searching = false; refreshHighlights(); tocar(); return; }
  for (let i = 0; i < T.count; i++) {
    const idx = await textIndex(T, i);
    if (ed() !== T || T.find?.q !== q) return;
    let from = 0;
    for (;;) { const j = idx.norm.indexOf(nq, from); if (j < 0) break; T.find.matches.push({ p: i, s: j, e: j + nq.length }); from = j + nq.length; }
    if (i % 25 === 24) tocar();
  }
  T.find.searching = false;
  const ms = T.find.matches;
  if (ms.length) T.find.idx = prevIdx >= 0 && prevIdx < ms.length ? prevIdx : Math.max(0, ms.findIndex((m) => m.p >= T.current));
  refreshHighlights(); tocar();
  if (ms.length && !keepIdx) revealMatch();
}
export function findStep(d: number) {
  const T = ed(); const f = T.find;
  if (!f || !f.matches.length) { if (!T.findOpen) find(); return; }
  f.idx = (f.idx + d + f.matches.length) % f.matches.length;
  refreshHighlights(); tocar(); revealMatch();
}
async function revealMatch() {
  const T = ed(); const m = T.find?.matches[T.find.idx]; if (!m) return;
  const el = paper(m.p); if (!el) return;
  const view = $('#edCanvasWrap')!;
  if (el.offsetTop > view.scrollTop + view.clientHeight || el.offsetTop + el.offsetHeight < view.scrollTop) view.scrollTop = el.offsetTop - 52;
  await drawPage(el); if (ed() !== T) return;
  applyHighlights(el);
  const h = el.querySelector('.hl.cur');
  if (h) h.scrollIntoView({ block: 'center', inline: 'nearest' });
  if (m.p !== T.current && !T.editing) setCurrent(m.p);
}

// --- Enlaces del PDF (a páginas y a sitios web)
async function drawLinks(el: TPapel, page: any, vp: any, T: IDocumento) {
  const host = el.querySelector('.ed-links')!; host.innerHTML = '';
  let ann: any[] = []; try { ann = await page.getAnnotations({ intent: 'display' }); } catch { /* sin anotaciones */ }
  if (ed() !== T || !el.isConnected) return;
  for (const a of ann) {
    if (a.subtype !== 'Link') continue;
    const url = a.url || a.unsafeUrl; const dest = a.dest; const action = a.action;
    if (!url && !dest && !action) continue;
    const [x1, y1, x2, y2] = vp.convertToViewportRectangle(a.rect);
    const d = document.createElement('a'); d.className = 'lnk'; d.href = '#';
    Object.assign(d.style, { left: Math.min(x1, x2) + 'px', top: Math.min(y1, y2) + 'px', width: Math.abs(x2 - x1) + 'px', height: Math.abs(y2 - y1) + 'px' });
    d.title = url ? url : 'Ir a otra parte del documento';
    d.onclick = (e) => {
      e.preventDefault();
      if (url) return openLink(url);
      if (dest) return gotoDest(dest);
      const E = ed(); const n = ({ NextPage: E.current + 1, PrevPage: E.current - 1, FirstPage: 0, LastPage: E.count - 1 } as Record<string, number>)[action];
      if (n != null) goto(n);
    };
    host.appendChild(d);
  }
}
export function openLink(url: string) {
  if (!/^(https?:|mailto:)/i.test(url)) return toast('Este enlace no se puede abrir por seguridad.');
  ganchos.abrirEnlace(url);
}
export async function gotoDest(dest: any) {
  const T = ed();
  try {
    const explicit = typeof dest === 'string' ? await T.pdf.getDestination(dest) : dest;
    if (!Array.isArray(explicit)) return;
    const ref = explicit[0];
    const pi = typeof ref === 'object' && ref ? await T.pdf.getPageIndex(ref) : Number(ref);
    let yPt = 0;
    if (explicit[1]?.name === 'XYZ' && explicit[3] != null) { const v = T.vp1[pi]; if (v) yPt = Math.max(0, v.convertToViewportPoint(explicit[2] || 0, explicit[3])[1] - 10); }
    if (explicit[1]?.name === 'FitH' && explicit[2] != null) { const v = T.vp1[pi]; if (v) yPt = Math.max(0, v.convertToViewportPoint(0, explicit[2])[1] - 10); }
    if (ed() === T) goto(pi, yPt);
  } catch (e) { console.warn(e); }
}

// ============================================================================
// Reconocimiento y edición del texto del PDF
// ============================================================================
const colores = (b: { x: number; y: number; w: number; h: number }) => sampleColors($<HTMLCanvasElement>('#edCanvas'), paper(ed().current)?._k || 1, b);

export async function recognize(pages: number[]) {
  if (!pages.length) return;
  await step('Reconociendo texto…', async () => {
    const T = ed();
    for (let n = 0; n < pages.length; n++) {
      const i = pages[n];
      busy(`Reconociendo texto · página ${i + 1} (${n + 1} de ${pages.length})…`, n / pages.length);
      const r = await ocrPage(T, i, (p) => busy(`Reconociendo texto · página ${i + 1} (${n + 1} de ${pages.length})…`, (n + p) / pages.length));
      T.ocr[i] = { blocks: r.blocks, words: r.words, baked: false };
      T.blocks[i] = r.blocks;
    }
    T.scanned = false; setDirty(true);
    toast(`Texto reconocido en ${pages.length} página(s). Ya puedes buscarlo y editarlo con "Editar texto".`, 5000);
    if (T.tool !== 'edittext') setTool('edittext'); else await showTextBlocks();
  });
}

// ¿La página es una imagen sin texto (fotocopia)? → aviso para reconocer texto.
export async function checkScanned() {
  const T = ed(); const i = T.current;
  if (T.ocr[i]) { if (T.scanned) { T.scanned = false; tocar(); } return; }
  let scanned = false;
  try {
    const page = await T.pdf.getPage(i + 1);
    const tc = await page.getTextContent();
    const chars = tc.items.reduce((s: number, it: any) => s + (it.str || '').trim().length, 0);
    if (chars < 15) { const ops = await page.getOperatorList(); const O = pdfjs().OPS; scanned = ops.fnArray.some((f: number) => f === O.paintImageXObject || f === O.paintJpegXObject); }
  } catch { /* página ilegible */ }
  if (i !== T.current || ed() !== T) return;
  if (T.scanned !== scanned) { T.scanned = scanned; tocar(); }
}

// Muestra los párrafos editables de la página actual.
export async function showTextBlocks() {
  const layer = $('#edLayer'); const T = ed(); if (!layer || !T.pdf) return;
  layer.querySelectorAll('.tb').forEach((n) => n.remove());
  const i = T.current; const blocks = await blocksFor(T, i); if (i !== T.current || T.tool !== 'edittext' || ed() !== T) return;
  const used = new Set((T.overlays[i] || []).filter((o) => o.blockId).map((o) => o.blockId));
  for (const b of blocks) {
    if (used.has(b.id)) continue;
    const d = document.createElement('div'); d.className = 'tb'; d.dataset.block = b.id;
    Object.assign(d.style, { left: b.box.x * T.scale + 'px', top: b.box.y * T.scale + 'px', width: b.box.w * T.scale + 'px', height: b.box.h * T.scale + 'px' });
    d.title = `Fuente detectada: ${b.detected} · ${b.size.toFixed(1)} pt`;
    layer.prepend(d);
  }
  if (!blocks.length) checkScanned();
}

// Borra de verdad el texto original dentro de las zonas (sin parches). Devuelve true si no quedó nada.
export async function removeOriginal(i: number, rects: { x: number; y: number; w: number; h: number }[]) {
  const T = ed();
  const doc = await cargarPdf(T.bytes!); const v = await vp1(T, i);
  const r = await removeTextInRects(doc, i, rects, (x, y) => v.convertToViewportPoint(x, y));
  if (!r.removed) return false;
  await setBytes(await guardarPdf(doc), { keepPage: true, keepBlocks: true, T });
  // Verificación: ¿queda texto dentro de la zona? (por ejemplo, dentro de un elemento que no se pudo leer)
  try {
    const page = await T.pdf.getPage(i + 1); const tc = await page.getTextContent(); const vv = page.getViewport({ scale: 1 });
    const left = tc.items.filter((it: any) => it.str.trim()).some((it: any) => { const [x, y] = vv.convertToViewportPoint(it.transform[4] + (it.width || 0) / 2, it.transform[5] + (it.height || 0) * 0.3); return rects.some((q) => x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.h); });
    return !left;
  } catch { return false; }
}

// Convierte un párrafo detectado en un objeto de texto editable con la misma fuente y posición.
async function blockOverlay(b: IBloque, { bg, ink }: { bg: number[]; ink: number[] }, transparent: boolean): Promise<IObjeto> {
  // Ubica el texto para que la primera línea base coincida con la original (modelo de «half-leading» del navegador).
  const m = await fontMetrics(b.family, false, false);
  const lh = Number(b.lh.toFixed(2)), size = Number(b.size.toFixed(1));
  const top = b.base0 - ((lh - (m.asc + m.desc)) / 2 + m.asc) * size;
  return { type: 'rich', id: nuevoId(), blockId: b.id, x: b.x0, y: top, w: b.x1 - b.x0 + size * 0.4, h: b.box.h,
    cover: { ...b.box }, bg, color: hex(ink), html: b.html, family: b.family, size, align: b.align, lh, detected: b.detected, source: b.source, transparent };
}
// Abre varios párrafos de una página de una vez (un solo borrado del original).
export async function openBlocks(page: number, blocks: IBloque[]) {
  const T = ed();
  if (T.current !== page) setCurrent(page);
  await drawPage(paper(page));
  const cols = blocks.map((b) => colores(b.box));
  const digital = blocks.filter((b) => b.source === 'pdf');
  let transparent = false;
  if (digital.length) { try { transparent = await removeOriginal(page, digital.map((b) => b.box)); } catch (e) { console.warn(e); } }
  const out: IObjeto[] = [];
  for (let k = 0; k < blocks.length; k++) {
    const o = await blockOverlay(blocks[k], cols[k], blocks[k].source === 'pdf' && transparent);
    (T.overlays[page] ||= []).push(o); out.push(o);
  }
  return out;
}
export async function editBlock(b: IBloque, clickEvt?: { clientX: number; clientY: number }) {
  snapshot();
  const T = ed(); const page = T.current;
  // PDF digital: el texto original se borra del archivo y el nuevo queda sin fondo («texto transparente»).
  busy('Preparando el párrafo…');
  let o: IObjeto; try { [o] = await openBlocks(page, [b]); } finally { busy(null); }
  if (T.current !== page) setCurrent(page);
  T.sel = o.id; T.editing = o.id;
  renderOverlays(); showTextBlocks(); tocar();
  placeCaret(o, clickEvt);
}
function placeCaret(o: IObjeto, evt?: { clientX: number; clientY: number }) {
  const el = document.querySelector(`.ov[data-id="${o.id}"] .rt`) as HTMLElement | null; if (!el) return;
  el.focus();
  if (evt && document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(evt.clientX, evt.clientY); if (r && el.contains(r.startContainer)) { const s = getSelection()!; s.removeAllRanges(); s.addRange(r); } }
}

// ============================================================================
// Capa de objetos: texto enriquecido (nuevo o editado), imagen, tapar
// ============================================================================
export function renderOverlays() { renderOverlaysFor(ed().current); }
// Dibuja los objetos de una página. Solo la página activa es interactiva.
export function renderOverlaysFor(i: number) {
  const T = ed();
  const pg = paper(i); const layer = pg?.querySelector('.ed-layer'); if (!layer) return;
  layer.querySelectorAll('.ov, .ov-cover').forEach((n) => n.remove());
  const s = T.scales[i] || T.scale; const active = i === T.current;
  for (const o of T.overlays[i] || []) {
    if (o.type === 'rich' && o.cover && !o.transparent) {
      const c = document.createElement('div'); c.className = 'ov-cover';
      Object.assign(c.style, { left: o.cover.x * s + 'px', top: o.cover.y * s + 'px', width: o.cover.w * s + 'px', height: o.cover.h * s + 'px', background: hex(o.bg!) });
      layer.appendChild(c);
    }
    const d = document.createElement('div');
    d.className = `ov ov-${o.type}` + (active && (T.sel === o.id || T.multi.includes(o.id)) ? ' selected' : '') + (o.ph ? ' ph' : '') + (o.lift ? ' lift' : '') + (active && T.editing === o.id ? ' editing' : '');
    d.dataset.id = o.id;
    Object.assign(d.style, { left: o.x * s + 'px', top: o.y * s + 'px', width: o.w * s + 'px' });
    if (o.type !== 'rich') d.style.height = o.h * s + 'px';
    if (o.type === 'rich') {
      if (o.cover && !o.transparent) d.style.background = hex(o.bg!);
      d.innerHTML = `<div class="rt" contenteditable="${active && T.editing === o.id}" spellcheck="false" style="${richStyle(o, s)}">${o.html}</div>`;
    } else if (o.type === 'image') d.innerHTML = `<img src="${o.src}" draggable="false" />`;
    if (o.locked) d.classList.add('locked');
    else if (active && T.sel === o.id && T.editing !== o.id) d.insertAdjacentHTML('beforeend', `<i class="ov-handle"></i><b class="ov-del" title="Quitar">${icono('x', 11)}</b>`);
    else if (active && T.editing === o.id) d.insertAdjacentHTML('beforeend', '<i class="ov-handle"></i>');
    layer.appendChild(d);
    if (o.type === 'rich') syncRichHeight(o, d, s);
  }
}
export function syncRichHeight(o: IObjeto, d: Element, s = ed().scale) {
  const rt = d.querySelector('.rt') as HTMLElement | null; if (!rt) return;
  const h = Math.max(rt.offsetHeight, o.size! * o.lh!); o.h = h;
  (d as HTMLElement).style.height = h * s + 'px';
}
export function findOv(id: string | null) { const T = ed(); return (T.overlays[T.current] || []).find((o) => o.id === id); }
export function addOv(o: Omit<IObjeto, 'id'> & { id?: string }) {
  const T = ed(); snapshot(); o.id = nuevoId(); (T.overlays[T.current] ||= []).push(o as IObjeto); T.sel = o.id; renderOverlays(); tocar(); return o as IObjeto;
}
export function removeOv(id: string | string[]) {
  const T = ed(); snapshot();
  const ids = Array.isArray(id) ? id : [id];
  T.overlays[T.current] = (T.overlays[T.current] || []).filter((o) => !ids.includes(o.id)); T.multi = [];
  if (T.editing && ids.includes(T.editing)) T.editing = null; T.sel = null;
  renderOverlays(); if (T.tool === 'edittext') showTextBlocks(); tocar();
}
export function stopEditing() {
  const T = ed(); if (!T.editing) return;
  const o = findOv(T.editing); const el = document.querySelector(`.ov[data-id="${T.editing}"] .rt`);
  if (o && el) o.html = el.innerHTML;
  T.editing = null; renderOverlays(); tocar();
}
// Deja de seleccionar (Esc o clic en un espacio vacío)
export function deseleccionar() { const T = ed(); if (T.sel || T.multi.length) { T.sel = null; T.multi = []; renderOverlays(); tocar(); } }

let layerDragging = false;
let spaceDown = false;
let drag: any = null;
let scrollRaf = 0;
const layerEl = () => $('#edLayer')!;
const pt = (e: MouseEvent) => { const r = layerEl().getBoundingClientRect(); const T = ed(); return { x: (e.clientX - r.left) / T.scale, y: (e.clientY - r.top) / T.scale }; };

// Eventos del escenario (todas las páginas). Un clic en otra página la vuelve la página activa.
const conEventos = new WeakSet<Element>();
export function montarEscenario(stage: HTMLElement | null) {
  if (!stage || conEventos.has(stage)) return;
  conEventos.add(stage);
  stage.className = 'ed-stage mode-' + ed().tool;
  stage.addEventListener('mousedown', async (e) => {
    const T = ed(); if (!T.pdf) return;
    const tg = e.target as HTMLElement;
    const pg = tg.closest('.ed-paper') as HTMLElement | null; if (!pg) return;
    if (tg.closest('.lnk') && T.tool === 'select') return;
    const i = Number(pg.dataset.i);
    if (i !== T.current) setCurrent(i);
    const layer = $('#edLayer'); if (!layer) return;
    const ovEl = tg.closest('.ov') as HTMLElement | null;
    if (tg.closest('.ov-del') && ovEl) { removeOv(T.multi.length > 1 && T.multi.includes(ovEl.dataset.id!) ? T.multi : ovEl.dataset.id!); return; }
    // Mano (o barra espaciadora): mueve objetos o desplaza la vista, nunca edita ni selecciona texto
    if (T.tool === 'hand' || spaceDown) {
      e.preventDefault();
      const o = ovEl && findOv(ovEl.dataset.id!);
      if (T.editing) stopEditing();
      if (o && !o.locked) {
        const group = T.multi.length > 1 && T.multi.includes(o.id) ? T.multi.map(findOv).filter(Boolean) as IObjeto[] : [o];
        if (group.length === 1 && T.sel !== o.id) { T.sel = o.id; T.multi = []; renderOverlays(); tocar(); }
        snapshot(); drag = { mode: 'group', start: pt(e), items: group.map((x) => ({ o: x, x: x.x, y: x.y })) }; layerDragging = true; return;
      }
      const v = $('#edCanvasWrap')!; drag = { mode: 'pan', cx: e.clientX, cy: e.clientY, sl: v.scrollLeft, st: v.scrollTop }; stage.classList.add('panning'); return;
    }
    if (ovEl) {
      const o = findOv(ovEl.dataset.id!); if (!o) return;
      if (o.locked) { const fe = tg.closest('.pf-field') as HTMLElement | null; if (fe) ganchos.focoCampo(fe.dataset.field!); e.preventDefault(); return; }
      if (T.editing === o.id && tg.closest('.rt')) return; // escribiendo
      if (T.editing && T.editing !== o.id) stopEditing();
      const p = pt(e);
      if (T.multi.length > 1 && T.multi.includes(o.id) && !tg.classList.contains('ov-handle')) { // varios seleccionados: se mueven juntos
        snapshot(); drag = { mode: 'group', start: p, items: (T.multi.map(findOv).filter(Boolean) as IObjeto[]).map((x) => ({ o: x, x: x.x, y: x.y })) }; layerDragging = true; e.preventDefault(); return;
      }
      if (T.sel !== o.id || T.multi.length) { T.sel = o.id; T.multi = []; renderOverlays(); tocar(); }
      snapshot();
      drag = { mode: tg.classList.contains('ov-handle') ? 'resize' : 'move', o, start: p, orig: { ...o, cover: o.cover && { ...o.cover } } };
      layerDragging = true;
      e.preventDefault(); return;
    }
    if (T.editing) stopEditing();
    const p = pt(e);
    if (T.tool === 'select') {
      deseleccionar();
      if (tg.closest('.textLayer span, .textLayer br') || e.detail > 1) return; // sobre el texto del PDF: selección de texto normal (copiar)
      drag = { mode: 'marquee', start: p, ghost: Object.assign(document.createElement('div'), { className: 'ov ov-marquee' }) };
      layer.appendChild(drag.ghost); layerDragging = true; e.preventDefault(); return;
    }
    if (T.tool === 'edittext') {
      e.preventDefault();
      const tb = tg.closest('.tb') as HTMLElement | null;
      const blocks = await blocksFor(T, T.current);
      const b = tb ? blocks.find((x) => x.id === tb.dataset.block) : blocks.find((x) => p.x >= x.box.x && p.x <= x.box.x + x.box.w && p.y >= x.box.y && p.y <= x.box.y + x.box.h && !(T.overlays[T.current] || []).some((o) => o.blockId === x.id));
      if (b) { await drawPage(paper(T.current)); editBlock(b, { clientX: e.clientX, clientY: e.clientY }); }
      else if (T.sel) { T.sel = null; renderOverlays(); tocar(); }
      return;
    }
    if (T.tool === 'text') { // se dibuja el recuadro; al soltar se escribe dentro
      drag = { mode: 'textbox', start: p, ghost: Object.assign(document.createElement('div'), { className: 'ov ov-ghost ov-textghost' }) };
      layer.appendChild(drag.ghost); layerDragging = true; e.preventDefault(); return;
    }
    if (T.tool === 'image') { pickImage(p); setTool('select'); return; }
    if (T.tool === 'whiteout') {
      drag = { mode: 'create', start: p, ghost: Object.assign(document.createElement('div'), { className: 'ov ov-ghost' }) };
      layer.appendChild(drag.ghost); layerDragging = true; e.preventDefault(); return;
    }
  });
  stage.addEventListener('input', (e) => {
    const rt = (e.target as HTMLElement).closest('.rt'); if (!rt) return;
    const d = rt.closest('.ov') as HTMLElement; const o = findOv(d.dataset.id!); if (!o) return;
    o.html = rt.innerHTML; if (o.ph) { o.ph = false; d.classList.remove('ph'); } syncRichHeight(o, d); if (!ed().dirty) setDirty(true);
  });
  stage.addEventListener('dblclick', (e) => {
    const d = (e.target as HTMLElement).closest('#edLayer .ov-rich') as HTMLElement | null; if (!d) return;
    const T = ed(); const o = findOv(d.dataset.id!); if (!o || o.locked) return;
    T.sel = o.id; T.multi = []; T.editing = o.id; renderOverlays(); tocar(); if (o.ph) selectAllIn(o); else placeCaret(o, e);
  });
}
// Desplazamiento de la vista (React lo llama desde #edCanvasWrap)
export function alDesplazar() { if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; onViewScroll(); }); }

// Lo que se escucha en toda la ventana: arrastres, atajos de teclado, selección de texto (una sola vez)
export function instalarEventosGlobales() {
  window.addEventListener('mousemove', (e) => {
    if (!drag || !$('#edLayer')) return;
    const T = ed();
    if (drag.mode === 'pan') { const v = $('#edCanvasWrap')!; v.scrollLeft = drag.sl - (e.clientX - drag.cx); v.scrollTop = drag.st - (e.clientY - drag.cy); return; }
    const p = pt(e), dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (drag.mode === 'group') {
      for (const it of drag.items) { it.o.x = it.x + dx; it.o.y = it.y + dy; const el = document.querySelector(`#edLayer .ov[data-id="${it.o.id}"]`) as HTMLElement | null; if (el) Object.assign(el.style, { left: it.o.x * T.scale + 'px', top: it.o.y * T.scale + 'px' }); }
      drag.moved = true; return;
    }
    if (drag.mode === 'create' || drag.mode === 'marquee' || drag.mode === 'textbox') {
      Object.assign(drag.ghost.style, { left: Math.min(p.x, drag.start.x) * T.scale + 'px', top: Math.min(p.y, drag.start.y) * T.scale + 'px', width: Math.abs(dx) * T.scale + 'px', height: Math.abs(dy) * T.scale + 'px' });
      return;
    }
    const o = drag.o as IObjeto, el = document.querySelector(`#edLayer .ov[data-id="${o.id}"]`) as HTMLElement | null;
    if (drag.mode === 'move') { o.x = drag.orig.x + dx; o.y = drag.orig.y + dy; }
    else {
      o.w = Math.max(10, drag.orig.w + dx);
      if (o.type === 'image' && o.ratio && !e.shiftKey) o.h = o.w / o.ratio; else if (o.type !== 'rich') o.h = Math.max(6, drag.orig.h + dy);
    }
    if (el) {
      Object.assign(el.style, { left: o.x * T.scale + 'px', top: o.y * T.scale + 'px', width: o.w * T.scale + 'px' });
      if (o.type === 'rich') { (el.querySelector('.rt') as HTMLElement).style.width = o.w + 'px'; syncRichHeight(o, el); } else el.style.height = o.h * T.scale + 'px';
    }
  });
  window.addEventListener('mouseup', (e) => {
    layerDragging = false;
    if (!drag) return;
    const d = drag; drag = null; const T = ed();
    if (d.mode === 'pan') { $('#edStage')?.classList.remove('panning'); return; }
    if (d.mode === 'group') { if (d.moved) { setDirty(true); renderOverlays(); } else T.undo.pop(); return; }
    if (!['create', 'marquee', 'textbox'].includes(d.mode) || !$('#edLayer')) return;
    d.ghost.remove();
    const p = pt(e);
    const x = Math.min(p.x, d.start.x), y = Math.min(p.y, d.start.y), wd = Math.abs(p.x - d.start.x), h = Math.abs(p.y - d.start.y);
    if (d.mode === 'textbox') { newTextBox(wd < 12 ? { x: d.start.x, y: d.start.y - T.fmt.size * 0.2, w: 220 } : { x, y, w: Math.max(wd, 30) }); return; }
    if (d.mode === 'marquee') { if (wd >= 4 && h >= 4) selectArea({ x, y, w: wd, h }); return; }
    if (wd < 4 || h < 3) return;
    const { bg } = colores({ x, y, w: wd, h });
    addOv({ type: 'whiteout', x, y, w: wd, h, bg });
  });
  document.addEventListener('selectionchange', () => {
    const s = getSelection(); if (s && s.rangeCount && s.anchorNode?.parentElement?.closest('.rt')) savedRange = s.getRangeAt(0).cloneRange();
    if (ed().editing) tocar(); // el panel muestra el formato del texto bajo el cursor
  });
  document.addEventListener('keydown', (e) => {
    const T = ed();
    if ($('#view-editor')?.classList.contains('hidden') || !T.bytes) return;
    const ae = document.activeElement as HTMLElement | null;
    const typing = ae?.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(ae?.tagName || '');
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      if (document.body.classList.contains('reading')) { ganchos.leer(false); return; }
      if (T.editing) { stopEditing(); return; }
      if (T.sel || T.multi.length) { deseleccionar(); return; } // Esc: deja de seleccionar
      if (T.findOpen) { closeFind(); return; }
    }
    if (mod && e.key.toLowerCase() === 'f' && !e.shiftKey && !e.altKey) { e.preventDefault(); find(); return; }
    if (mod && e.key.toLowerCase() === 'p' && !e.shiftKey) { e.preventDefault(); ganchos.imprimir(); return; }
    if (typing) return;
    if (e.code === 'Space' && !mod) { e.preventDefault(); if (!spaceDown) { spaceDown = true; $('#edStage')?.classList.add('mode-hand'); } return; }
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (!mod && !e.altKey && e.key.toLowerCase() === 'h') { e.preventDefault(); setTool('hand'); return; }
    if (!mod && !e.altKey && e.key.toLowerCase() === 'v') { e.preventDefault(); setTool('select'); return; }
    if (T.multi.length > 1 && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeOv(T.multi.filter((id) => !findOv(id)?.locked)); return; }
    if (T.sel && !findOv(T.sel)?.locked && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeOv(T.sel); }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !T.sel && !mod) { e.preventDefault(); goto(T.current + (e.key === 'ArrowRight' ? 1 : -1)); }
    if (e.key === 'Home' && !mod) { e.preventDefault(); goto(0); }
    if (e.key === 'End' && !mod) { e.preventDefault(); goto(T.count - 1); }
  });
  document.addEventListener('keyup', (e) => { if (e.code === 'Space' && spaceDown) { spaceDown = false; const st = $('#edStage'); if (st && ed().tool !== 'hand') st.classList.remove('mode-hand'); } });
  window.addEventListener('blur', () => { if (spaceDown) { spaceDown = false; if (ed().tool !== 'hand') $('#edStage')?.classList.remove('mode-hand'); } });
  let rz = 0;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = window.setTimeout(() => { if (!$('#view-editor')?.classList.contains('hidden') && ed().pdf) renderPage(); }, 150); });
}

// ---------- herramientas ----------
function toolUI(t: THerramienta) { // cambia la herramienta sin cerrar el texto que se está escribiendo
  ed().tool = t;
  const stage = $('#edStage'); if (stage) stage.className = 'ed-stage mode-' + t;
  tocar();
}
export function setTool(t: THerramienta) {
  const T = ed();
  if (T.editing) stopEditing();
  T.tool = t;
  if (!['select', 'edittext', 'hand'].includes(t) && (T.sel || T.multi.length)) { T.sel = null; T.multi = []; renderOverlays(); }
  const stage = $('#edStage'); if (stage) stage.className = 'ed-stage mode-' + t;
  const layer = $('#edLayer');
  tocar();
  if (!layer) return;
  layer.querySelectorAll('.tb').forEach((n) => n.remove());
  if (t === 'edittext') showTextBlocks();
}

// --- Texto nuevo: recuadro dibujado por el usuario; al soltar se escribe dentro
export function newTextBox(box: { x: number; y: number; w: number }, preset?: Partial<IObjeto> & { bold?: boolean; italic?: boolean; underline?: boolean }) {
  const T = ed();
  const f = { ...T.fmt, ...(preset || {}) } as any;
  snapshot();
  const o: IObjeto = { type: 'rich', id: nuevoId(), x: box.x, y: box.y, w: box.w, h: f.size * f.lh, html: preset?.html || '', family: f.family, size: f.size, align: f.align, lh: f.lh, color: f.color, ph: !!preset?.html };
  (T.overlays[T.current] ||= []).push(o);
  T.sel = o.id; T.multi = []; T.editing = o.id; toolUI('select'); renderOverlays(); setDirty(true);
  const el = document.querySelector(`#edLayer .ov[data-id="${o.id}"] .rt`) as HTMLElement | null; el?.focus();
  if (o.ph) selectAllIn(o);
  else { if (f.bold) document.execCommand('bold'); if (f.italic) document.execCommand('italic'); if (f.underline) document.execCommand('underline'); }
  return o;
}
export function selectAllIn(o: IObjeto) {
  const el = document.querySelector(`.ov[data-id="${o.id}"] .rt`) as HTMLElement | null; if (!el) return;
  el.focus(); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection()!; s.removeAllRanges(); s.addRange(r);
}
// Modelos de texto: título, párrafo, nota… con texto de ejemplo que se reemplaza al escribir
export const TEXT_PRESETS = [
  { key: 'titlePar', label: 'Título y párrafo', demo: '<b style="font-size:15px">Título</b><br><span style="font-size:10px">Párrafo de texto…</span>', parts: [{ size: 20, family: 'serif', bold: true, html: '<b>Agrega un título aquí</b>', gap: 10 }, { size: 11, html: 'Escribe aquí el texto. Puedes cambiar la fuente y el tamaño en este panel.' }] },
  { key: 'title', label: 'Título', demo: '<b style="font-size:17px">Título</b>', parts: [{ size: 22, family: 'serif', bold: true, html: '<b>Agrega un título aquí</b>' }] },
  { key: 'subtitle', label: 'Subtítulo', demo: '<b style="font-size:13px">Subtítulo</b>', parts: [{ size: 14, bold: true, html: '<b>Agrega un subtítulo</b>' }] },
  { key: 'par', label: 'Párrafo', demo: '<span style="font-size:11px">Escribe aquí…</span>', parts: [{ size: 11, html: 'Escribe aquí…' }] },
  { key: 'clause', label: 'Cláusula', demo: '<span style="font-size:11px"><b>PRIMERO:</b> texto…</span>', parts: [{ size: 11, align: 'justify', html: '<b>PRIMERO:</b> Escribe aquí el contenido de la cláusula.' }] },
  { key: 'note', label: 'Nota pequeña', demo: '<i style="font-size:9px;color:#666">Nota aclaratoria</i>', parts: [{ size: 8.5, color: '#555555', html: '<i>Nota: escribe aquí una aclaración.</i>' }] },
] as { key: string; label: string; demo: string; parts: { size: number; family?: string; bold?: boolean; html: string; gap?: number; align?: string; color?: string }[] }[];
export function insertPreset(key: string) {
  const T = ed();
  const pr = TEXT_PRESETS.find((x) => x.key === key); if (!pr || !T.pdf) return;
  if (T.editing) stopEditing();
  const v = T.vp1[T.current] || { width: 595, height: 842 }; const pg = paper(T.current); const view = $('#edCanvasWrap');
  const visTop = pg && view ? (view.scrollTop - pg.offsetTop) / (T.scales[T.current] || T.scale) : 0;
  let y = clamp(visTop + 70, 40, v.height - 120); const x = Math.round(v.width * 0.12); const wd = Math.round(v.width * 0.76);
  let first: IObjeto | null = null;
  for (const part of pr.parts) {
    const fam = part.family && FAMILIAS()[part.family] ? part.family : T.fmt.family;
    const o = newTextBox({ x, y, w: wd }, { family: fam, size: part.size, color: part.color || T.fmt.color, align: part.align || 'left', lh: 1.25, html: part.html });
    first = first || o; y += o.h + (part.gap || 6);
  }
  if (first && pr.parts.length > 1) { stopEditing(); T.sel = first.id; T.editing = first.id; renderOverlays(); tocar(); selectAllIn(first); }
}

// --- Seleccionar un área: objetos completos dentro del recuadro (y las imágenes del PDF, que se vuelven movibles)
async function pdfImages(i: number) {
  const T = ed(); if (T.pdfImgs?.bytes !== T.bytes) T.pdfImgs = { bytes: T.bytes, pages: {} };
  if (T.pdfImgs!.pages[i]) return T.pdfImgs!.pages[i];
  const out: { x: number; y: number; w: number; h: number }[] = [];
  try {
    const page = await T.pdf.getPage(i + 1); const ops = await page.getOperatorList(); const v = await vp1(T, i); const O = pdfjs().OPS;
    const mul = (a: number[], b: number[]) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    let ctm = [1, 0, 0, 1, 0, 0]; const stack: number[][] = [];
    for (let k = 0; k < ops.fnArray.length; k++) {
      const fn = ops.fnArray[k], args = ops.argsArray[k];
      if (fn === O.save) stack.push(ctm); else if (fn === O.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === O.transform) ctm = mul(ctm, args);
      else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); if (args?.[0]) ctm = mul(ctm, args[0]); }
      else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() || ctm;
      else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintImageXObjectRepeat) {
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => v.convertToViewportPoint(ctm[0] * a + ctm[2] * b + ctm[4], ctm[1] * a + ctm[3] * b + ctm[5]));
        const xs = pts.map((q: number[]) => q[0]), ys = pts.map((q: number[]) => q[1]);
        const r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        if (r.w > 6 && r.h > 6 && r.w < v.width * 0.98) out.push(r); // se ignoran fondos de página completa
      }
    }
  } catch (e) { console.warn('imágenes del PDF', e); }
  T.pdfImgs!.pages[i] = out; return out;
}
const inside = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, tol = 1) => a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol;
async function selectArea(r: { x: number; y: number; w: number; h: number }) {
  const T = ed(); const i = T.current;
  const ids = (T.overlays[i] || []).filter((o) => !o.locked && !o.lift && inside(o, r)).map((o) => o.id);
  const lifted = (T.lifted[i] ||= []);
  const imgs = (await pdfImages(i)).filter((q) => inside(q, r) && !lifted.some((l) => Math.abs(l.x - q.x) < 1 && Math.abs(l.y - q.y) < 1));
  if (ed() !== T) return;
  if (imgs.length) {
    busy('Preparando las imágenes para moverlas…');
    try { await drawPage(paper(i)); for (const q of imgs) { const o = await liftImage(i, q); if (o) { ids.push(o.id); lifted.push(q); } } } finally { busy(null); }
  }
  T.sel = ids.length === 1 ? ids[0] : null; T.multi = ids.length > 1 ? ids : [];
  renderOverlays(); tocar();
  if (!ids.length) toast('No hay objetos completos dentro del recuadro. Encierra todo el texto, campo o imagen que quieras mover.', 4000);
  else if (ids.length > 1) toast(`${ids.length} objetos seleccionados: arrástralos para moverlos juntos o presiona Supr para quitarlos.`, 3500);
}
// Una imagen del PDF pasa a ser un objeto movible: se copia tal como se ve y su lugar original se cubre con el color del fondo
async function liftImage(i: number, q: { x: number; y: number; w: number; h: number }) {
  const T = ed();
  const c = $<HTMLCanvasElement>('#edCanvas'); const k = paper(i)?._k || 1; if (!c) return null;
  const sx = Math.max(0, Math.floor(q.x * k)), sy = Math.max(0, Math.floor(q.y * k)), sw = Math.min(c.width - sx, Math.ceil(q.w * k)), sh = Math.min(c.height - sy, Math.ceil(q.h * k));
  if (sw < 2 || sh < 2) return null;
  const cut = Object.assign(document.createElement('canvas'), { width: sw, height: sh }); cut.getContext('2d')!.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
  const img = await imageToEmbeddable(await new Promise<Blob>((res) => cut.toBlob((b) => res(b!), 'image/png')));
  const { bg } = colores(q);
  snapshot();
  const list = (T.overlays[i] ||= []);
  list.push({ type: 'whiteout', id: nuevoId(), x: q.x, y: q.y, w: q.w, h: q.h, bg, lift: true });
  const o: IObjeto = { type: 'image', id: nuevoId(), x: q.x, y: q.y, w: q.w, h: q.h, ratio: q.w / q.h, src: img.dataUrl, mime: img.mime, bytes: img.bytes };
  list.push(o); setDirty(true); return o;
}

function pickImage(p: { x: number; y: number }) {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/bmp' });
  inp.onchange = async () => {
    const f = inp.files?.[0]; if (!f) return;
    const img = await imageToEmbeddable(f);
    const T = ed(); const v = T.vp1[T.current]; const wd = Math.min(v.width * 0.35, img.width * 0.75);
    addOv({ type: 'image', x: p.x, y: p.y, w: wd, h: wd / img.ratio, ratio: img.ratio, src: img.dataUrl, mime: img.mime, bytes: img.bytes });
  };
  inp.click();
}
export async function imageToEmbeddable(blob: Blob) {
  const bmp = await createImageBitmap(blob);
  const isJpg = /jpe?g/.test(blob.type); let bytes: Uint8Array; const mime = isJpg ? 'image/jpeg' : 'image/png';
  if (isJpg || blob.type === 'image/png') bytes = new Uint8Array(await blob.arrayBuffer());
  else {
    const c = Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    bytes = new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))).arrayBuffer());
  }
  return { bytes, mime, width: bmp.width, height: bmp.height, ratio: bmp.width / bmp.height, dataUrl: URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime })) };
}

// ============================================================================
// Formato del texto seleccionado (panel derecho)
// ============================================================================
let savedRange: Range | null = null;
export function restoreRange() {
  const T = ed(); if (!savedRange || !T.editing) return;
  const el = document.querySelector(`.ov[data-id="${T.editing}"] .rt`) as HTMLElement | null; if (!el || !el.contains(savedRange.startContainer)) return;
  el.focus(); const s = getSelection()!; s.removeAllRanges(); s.addRange(savedRange);
}
// El formato que muestra el panel: el del texto bajo el cursor, el del objeto elegido o el del próximo texto
export function currentFmt() {
  const T = ed();
  const o = T.sel ? findOv(T.sel) : undefined;
  if (!o || o.type !== 'rich') return { ...T.fmt, target: null as IObjeto | null };
  const f = { family: o.family!, size: o.size!, color: o.color!, align: o.align!, lh: o.lh!, bold: /^<b>/.test(o.html!), italic: /^<i>/.test(o.html!), underline: /^<u>/.test(o.html!), target: o as IObjeto | null };
  if (T.editing === o.id) {
    const s = getSelection()!; const n = s.anchorNode && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode as HTMLElement);
    if (n && (n as HTMLElement).closest?.('.rt')) {
      const cs = getComputedStyle(n as HTMLElement);
      f.family = CSS2FAM()[cs.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase()] || o.family!;
      f.size = Math.round(parseFloat(cs.fontSize) * 10) / 10; const c = cssRgb(cs.color); f.color = hex(c.slice(0, 3));
      f.bold = document.queryCommandState('bold'); f.italic = document.queryCommandState('italic'); f.underline = document.queryCommandState('underline');
    }
  }
  return f;
}
export function applyFmt(cmd: string, value?: any) {
  const T = ed();
  const o = T.sel ? findOv(T.sel) : undefined;
  const editing = !!(T.editing && o && o.id === T.editing);
  const el = editing ? document.querySelector(`.ov[data-id="${o!.id}"] .rt`) as HTMLElement | null : null;
  const sel = getSelection()!; const hasRange = !!(el && sel.rangeCount && !sel.isCollapsed && el.contains(sel.anchorNode));
  if (!o || o.type !== 'rich') { // sin texto seleccionado: valores por defecto para el próximo texto
    const F = T.fmt as any;
    if (cmd === 'family') F.family = value; if (cmd === 'size') F.size = value; if (cmd === 'color') F.color = value;
    if (cmd === 'align') F.align = value; if (cmd === 'lh') F.lh = value;
    if (['bold', 'italic', 'underline'].includes(cmd)) F[cmd] = !F[cmd];
    tocar(); return;
  }
  const sizeShown = cmd === 'size' ? currentFmt().size : null;
  if (!editing) snapshot();
  if (editing && el && !hasRange && !el.textContent && ['bold', 'italic', 'underline'].includes(cmd)) { // texto vacío: el formato se aplica a lo que se escriba
    el.focus(); document.execCommand(cmd); o.html = el.innerHTML; setDirty(true); return;
  }
  if (hasRange && el && ['bold', 'italic', 'underline', 'color', 'family', 'size', 'superscript', 'subscript'].includes(cmd)) {
    document.execCommand('styleWithCSS', false, 'true');
    if (cmd === 'color') document.execCommand('foreColor', false, value);
    else if (cmd === 'family') document.execCommand('fontName', false, FAMILIAS()[value].css);
    else if (cmd === 'size') wrapSelection(`font-size:${value}px`);
    else document.execCommand(cmd);
    o.html = el.innerHTML;
  } else {
    if (cmd === 'family') o.family = value;
    else if (cmd === 'size') { // todo el párrafo: también los trozos que tenían otro tamaño (frecuente en textos reconocidos por OCR)
      // el tamaño que se ve en el panel es el del texto bajo el cursor: todo el párrafo cambia en esa misma proporción
      const shown = sizeShown || o.size!; const k = value / shown;
      o.html = o.html!.replace(/font-size:\s*([\d.]+)px/g, (_, n) => `font-size:${(Number(n) * k).toFixed(2)}px`);
      if (editing) { const rt = document.querySelector(`.ov[data-id="${o.id}"] .rt`); if (rt) rt.innerHTML = o.html; }
      o.size = Math.round(o.size! * k * 100) / 100;
    } else if (cmd === 'color') o.color = value;
    else if (cmd === 'align') o.align = value; else if (cmd === 'lh') o.lh = value;
    else if (['bold', 'italic', 'underline'].includes(cmd)) {
      const tag = ({ bold: 'b', italic: 'i', underline: 'u' } as Record<string, string>)[cmd];
      const re = new RegExp(`^<${tag}>([\\s\\S]*)</${tag}>$`);
      o.html = re.test(o.html!) ? o.html!.replace(re, '$1') : `<${tag}>${o.html}</${tag}>`;
    }
    if (editing) { const keep = o.id; renderOverlays(); (document.querySelector(`.ov[data-id="${keep}"] .rt`) as HTMLElement | null)?.focus(); } else renderOverlays();
  }
  setDirty(true);
}
function wrapSelection(css: string) {
  const sel = getSelection()!; const r = sel.getRangeAt(0);
  const span = document.createElement('span'); span.setAttribute('style', css);
  span.appendChild(r.extractContents()); r.insertNode(span);
  span.querySelectorAll<HTMLElement>('[style*="font-size"]').forEach((n) => { n.style.fontSize = ''; });
  sel.removeAllRanges(); const nr = document.createRange(); nr.selectNodeContents(span); sel.addRange(nr);
}

// ============================================================================
// Hornear: los objetos pasan al PDF
// ============================================================================
// commit=false: devuelve una copia con los cambios aplicados sin tocar el documento (para imprimir o guardar plantillas).
export async function bakeDoc(commit: boolean) {
  const T = ed();
  if (!hayObjetos(T)) return T.bytes!;
  if (T.editing) stopEditing();
  const out = await hornear(T, commit);
  if (!commit) return out;
  T.overlays = {}; T.sel = null; T.editing = null;
  await setBytes(out, { T });
  return T.bytes!;
}
export const bakeAll = () => bakeDoc(true);
export async function finalBytes() { await bakeAll(); return ed().bytes!; }

// --- Pantalla completa / modo lectura
export function reading(on?: boolean) {
  const want = on === undefined ? !document.body.classList.contains('reading') : !!on;
  document.body.classList.toggle('reading', want);
  editorArchivos.pantallaCompleta(want);
  setTimeout(() => { if (ed().pdf) renderPage(); }, 350);
}
