// Lo que el editor PDF hace fuera de un componente: pestañas (abrir, cambiar, cerrar), archivos (abrir, combinar,
// guardar, exportar, imprimir, enviar a firmar), operaciones sobre páginas (rotar, insertar, mover, dividir, aplanar,
// numerar, marca de agua, comprimir) y el plano arquitectónico.
// Se instala al cargar el bundle (index.tsx) como window.editor, con la API de siempre: la usan app.js, el inicio,
// el menú nativo, Expedientes, Flujos, el Agente, las Firmas presenciales y las pruebas (window.editor._state…).
/* eslint-disable @typescript-eslint/no-explicit-any -- pdf-lib no tiene tipos en la app */
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import Pestanas from './Pestanas';
import { Aplanar, CambiosSinGuardar, CrearPdf, Dividir, Exportar, MarcaDeAgua, MuyPesado, Numerar, Ocr, Plano, AbrirEnlace } from './Modales';
import { abrirModal } from '../../../../utils/modal';
import { ahora, editorArchivos, editorEstado, nuevoDocumento, tocar, tocarAhora } from '../../../../store/hooks/useEditor.hook';
import { CARTA, A4, OFICIO, FAMILIAS, abrirConPdfjs, pdfjs, PDFLib, cargarPdf, clamp, esGrande, fmtMB, guardarPdf, MAX_ENVIO, nombreBase, nombreDeRuta } from '../../../../utils/editor-pdf/comun';
import { fontBytes, mapFont } from '../../../../utils/editor-pdf/fuentes';
import { blocksFor, scannedPages, vp1 } from '../../../../utils/editor-pdf/bloques';
import { layoutRich } from '../../../../utils/editor-pdf/hornear';
import { comprimirImagenes } from '../../../../utils/editor-pdf/compresion';
import * as M from '../../../../utils/editor-pdf/motor';
import { comprobarPlantilla, focoCampo } from './plantillas';
import { irAGestionDocumental, mostrarVista, pedirInicioSesion, pedirSesion, toast, enviarArchivoAFirmar } from '../../../../utils/app';
import type { IDocumento, IObjeto, THerramienta } from '../../../../store/interfaces/editor.interface';

const { ed, step, busy, setBytes, bakeAll, snapshot, setDirty, renderPage, G } = M;
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const S = editorEstado;
const baseName = () => nombreBase(ed().name);
const vistaEditorOculta = () => !!$('#view-editor')?.classList.contains('hidden');

// ---------- la página del editor ----------
let montada = false;
// Monta la página en #edBody (una sola vez; después solo cambia el documento activo)
export function montarPagina() {
  if (montada) return;
  const host = $('#edBody'); const R = (window as any).ReactUI; if (!host || !R) return;
  montada = true;
  ahora(() => R.montar('GestionEditorPdf', host));
}
export const irAlEditor = () => (window as any).studio?.goEditor?.();

// ---------- pestañas ----------
export async function activate() {
  const T = ed();
  M.syncDocState();
  montarPagina(); tocarAhora();
  if (!T.bytes) { M.olvidarDibujado(); return; }
  await renderPage(); M.setTool(T.tool || 'select');
  T.findOpen = !!T.find; tocar();
}
export async function switchTab(t?: IDocumento) {
  if (!t) return false;
  if (G.busy && t !== ed()) { toast('Espera a que termine la operación en curso.'); return false; }
  if (t !== ed()) { if (ed().editing) M.stopEditing(); S().editorUsar(t); }
  if (vistaEditorOculta()) mostrarVista('editor');
  await activate();
  return true;
}
export function cycleTab(d: number) {
  const tabs = S().pestanas; if (tabs.length < 2) return;
  const k = tabs.indexOf(ed()); switchTab(tabs[(k + d + tabs.length) % tabs.length]);
}
// Agrega un documento como pestaña nueva (queda activa)
export function nuevaPestana(T: IDocumento) { S().editorAgregar(T); }
// Quita una pestaña que no llegó a abrirse y vuelve a la anterior
export async function descartarPestana(T: IDocumento, prev: IDocumento) {
  const tabs = S().pestanas;
  if (tabs.includes(T)) { S().editorQuitar(T); try { await T.pdf?.destroy(); } catch { /* ya cerrado */ } }
  const quedan = S().pestanas;
  S().editorUsar(quedan.includes(prev) ? prev : (quedan[quedan.length - 1] || nuevoDocumento()));
  await activate();
}
function confirmDiscard(): Promise<boolean> {
  return new Promise((res) => abrirModal(<CambiosSinGuardar nombre={ed().name} alResponder={async (r) => res(r === 'descartar' ? true : r === 'guardar' ? await save() : false)} />));
}
export async function closeTab(t: IDocumento = ed()) {
  if (!t?.bytes) return true;
  if (G.busy) { toast('Espera a que termine la operación en curso.'); return false; }
  if (t !== ed()) await switchTab(t);
  const T = ed();
  if (T.dirty && !(await confirmDiscard())) return false;
  try { await T.pdf?.destroy(); } catch { /* ya cerrado */ }
  const k = S().pestanas.indexOf(T); S().editorQuitar(T);
  const tabs = S().pestanas;
  if (tabs.length) { S().editorUsar(tabs[Math.min(k, tabs.length - 1)]); await activate(); }
  else { S().editorUsar(nuevoDocumento()); M.olvidarDibujado(); M.syncDocState(); irAGestionDocumental(); }
  return true;
}
async function saveAll() {
  for (const t of S().pestanas.slice()) {
    if (!t.dirty) continue;
    await switchTab(t);
    if (!(await save())) return false;
  }
  return true;
}

// ---------- abrir ----------
// replace=true: abre en una pestaña nueva (si son varios, combinados). replace=false: los agrega al final del documento activo.
export async function addFiles(paths: string[], { replace = false } = {}) {
  if (!paths?.length) return false;
  if (G.busy) { toast('Espera a que termine la operación en curso.'); return false; }
  if (!ed().bytes) replace = true;
  if (replace && paths.length === 1) { const t = S().pestanas.find((x) => x.path && x.path === paths[0]); if (t) { await switchTab(t); return true; } }
  const prev = ed(); const T = replace ? nuevoDocumento() : ed();
  const ok = !!(await step('Preparando archivos…', async () => {
    const { PDFDocument } = PDFLib();
    const items: any[] = [];
    for (const p of paths) {
      busy('Abriendo ' + nombreDeRuta(p) + '…');
      const r = await editorArchivos.abrir(p); if (!r.ok) throw new Error(r.error); items.push({ ...r.data, path: p });
    }
    if (!replace) { await bakeAll(); snapshot(); }
    let bytes: Uint8Array;
    const single = items.length === 1 && items[0].kind === 'pdf' && replace;
    if (single) bytes = new Uint8Array(items[0].bytes); // se abre tal cual (no se reescribe)
    else {
      const doc = !replace ? await cargarPdf(ed().bytes!) : await PDFDocument.create();
      for (const it of items) {
        if (it.kind === 'pdf') { const src = await cargarPdf(new Uint8Array(it.bytes)); (await doc.copyPages(src, src.getPageIndices())).forEach((pg: any) => doc.addPage(pg)); }
        else {
          const img = await M.imageToEmbeddable(new Blob([it.bytes], { type: it.mime }));
          const emb = img.mime === 'image/jpeg' ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes);
          const [W, H] = img.ratio > 1 ? [A4[1], A4[0]] : A4; const m = 24; const s = Math.min((W - 2 * m) / img.width, (H - 2 * m) / img.height);
          doc.addPage([W, H]).drawImage(emb, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s });
        }
      }
      bytes = await guardarPdf(doc);
    }
    if (replace) {
      T.name = items[0].name.replace(/\.[^.]+$/, '') + (items.length > 1 ? '-combinado' : '') + '.pdf';
      T.path = single && !items[0].converted ? items[0].path : null; T.fromPdf = single;
      nuevaPestana(T); irAlEditor();
    }
    await setBytes(bytes, { keepPage: !replace, structural: true, T });
    setDirty(!(single && !items[0].converted));
    for (const it of items) if (it.kind === 'pdf' && !it.converted) editorArchivos.reciente(it.path);
    if (single && replace) comprobarPlantilla(T);
    const conv = items.filter((i) => i.converted).map((i) => i.converted);
    if (conv.length) toast(`Convertido a PDF desde ${[...new Set(conv)].join(' y ')}. Revisa el resultado.`, 4500);
    else if (items.length > 1) toast(`${items.length} archivos combinados en un PDF`);
    return true;
  }));
  if (!ok && replace && S().pestanas.includes(T)) await descartarPestana(T, prev);
  return ok;
}
// Abre cada archivo en su propia pestaña.
export async function openEach(paths: string[]) {
  let ok = false;
  for (const p of paths) ok = (await addFiles([p], { replace: true })) || ok;
  return ok;
}
export async function openDialog(multi = true) { const r = await editorArchivos.elegir(multi); if (r.ok && r.data?.length) { irAlEditor(); return openEach(r.data); } return false; }
export async function agregarArchivos() { const r = await editorArchivos.elegir(true); if (r.ok && r.data) addFiles(r.data); }

export function createBlank() {
  abrirModal(<CrearPdf alCrear={async (tam, horizontal, n) => {
    if (G.busy) return toast('Espera a que termine la operación en curso.');
    const sz = ({ letter: CARTA, oficio: OFICIO, a4: A4 } as Record<string, [number, number]>)[tam]; n = clamp(n, 1, 200);
    const doc = await PDFLib().PDFDocument.create(); for (let k = 0; k < n; k++) doc.addPage(horizontal ? [sz[1], sz[0]] : sz);
    const tabs = S().pestanas;
    const T = nuevoDocumento(); T.name = `Documento nuevo${tabs.some((t) => /^Documento nuevo/.test(t.name)) ? ' ' + (tabs.length + 1) : ''}.pdf`;
    nuevaPestana(T); irAlEditor();
    await setBytes(await guardarPdf(doc), { keepPage: false, structural: true, T }); setDirty(true); M.setTool('text');
  }} />);
}

// ---------- guardar ----------
export async function save(): Promise<boolean> {
  const T = ed();
  if (!T.bytes) return false;
  if (T.tpl?.mode === 'fill') { toast('Estás llenando una plantilla: usa «Generar documento» en el panel derecho.', 4000); return false; }
  if (!T.path) return saveAs();
  return !!(await step('Guardando…', async () => {
    const b = await M.finalBytes(); const r = await editorArchivos.guardarEn(T.path!, b);
    if (!r.ok) throw new Error(r.error);
    setDirty(false); editorArchivos.reciente(T.path!); toast('Guardado'); return true;
  }));
}
export async function saveAs(): Promise<boolean> {
  const T = ed();
  if (!T.bytes) return false;
  return !!(await step('Guardando…', async () => {
    const b = await M.finalBytes(); const r = await editorArchivos.guardarComo(b, T.name);
    if (!r.ok) throw new Error(r.error); if (!r.data) return false;
    T.path = r.data; T.name = nombreDeRuta(r.data); setDirty(false); editorArchivos.reciente(T.path); toast('Guardado como ' + T.name); return true;
  }));
}

// --- Imprimir (⌘P): cada página se rasteriza a ~200 ppp y se abre el diálogo de impresión del sistema.
export async function printDoc() {
  const T = ed();
  if (!T.bytes || G.busy) return;
  await step('Preparando impresión…', async () => {
    const bytes = await M.bakeDoc(false);
    const doc = bytes === T.bytes ? T.pdf : await abrirConPdfjs(bytes);
    const pages: { bytes: Uint8Array; w: number; h: number }[] = [];
    try {
      for (let i = 0; i < doc.numPages; i++) {
        busy(`Preparando impresión · página ${i + 1} de ${doc.numPages}…`, i / doc.numPages);
        const page = await doc.getPage(i + 1); const v = page.getViewport({ scale: 1 });
        const sc = Math.min(200 / 72, Math.sqrt(36e6 / (v.width * v.height)));
        const vp = page.getViewport({ scale: sc });
        const c = Object.assign(document.createElement('canvas'), { width: Math.floor(vp.width), height: Math.floor(vp.height) });
        const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: g, viewport: vp, intent: 'print' }).promise;
        // Si la orientación es distinta a la de la primera página, se gira para aprovechar la hoja.
        let src = c; const land0 = pages.length ? pages[0].w > pages[0].h : v.width > v.height;
        if ((v.width > v.height) !== land0) { src = Object.assign(document.createElement('canvas'), { width: c.height, height: c.width }); const r2 = src.getContext('2d')!; r2.translate(src.width, 0); r2.rotate(Math.PI / 2); r2.drawImage(c, 0, 0); }
        const blob = await new Promise<Blob>((r) => src.toBlob((b) => r(b!), 'image/jpeg', 0.92));
        pages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: src === c ? v.width : v.height, h: src === c ? v.height : v.width });
        c.width = 0; c.height = 0; if (src !== c) { src.width = 0; src.height = 0; }
      }
    } finally { if (doc !== T.pdf) doc.destroy(); }
    busy('Abriendo el diálogo de impresión…');
    const r = await editorArchivos.imprimir(pages, T.name); if (!r.ok) throw new Error(r.error);
    G.lastPrint = r.data;
  });
}

// ---------- exportar ----------
export function exportDialog(kind?: string) {
  if (!ed().bytes) return toast('Abre un documento primero.');
  abrirModal(<Exportar tipo={kind} alExportar={async (k, dpi) => {
    if (k === 'png' || k === 'jpg') return exportImages(k, dpi);
    const scanned = await scannedPages(ed()); if (scanned.length) await M.recognize(scanned);
    return k === 'docx' ? exportDocx() : exportTxt();
  }} />);
}
function htmlRuns(html: string, base: any) {
  const div = document.createElement('div'); div.innerHTML = html; const runs: any[] = [];
  const css2 = (window as any).PF_FONTS ? Object.fromEntries(Object.entries(FAMILIAS()).map(([k, v]) => [v.css.toLowerCase(), k])) : {};
  const walk = (n: any, st: any) => {
    if (n.nodeType === 3) { if (n.data) runs.push({ text: n.data, ...st }); return; }
    if (n.nodeName === 'BR') { runs.push({ text: '\n', ...st }); return; }
    const s2 = { ...st };
    if (/^(B|STRONG)$/.test(n.nodeName) || /bold|[6-9]00/.test(n.style?.fontWeight || '')) s2.bold = true;
    if (/^(I|EM)$/.test(n.nodeName) || n.style?.fontStyle === 'italic') s2.italic = true;
    if (n.nodeName === 'U' || /underline/.test(n.style?.textDecoration || '')) s2.underline = true;
    if (n.style?.fontSize) s2.size = parseFloat(n.style.fontSize);
    if (n.style?.fontFamily) s2.family = css2[n.style.fontFamily.replace(/["']/g, '').split(',')[0].trim().toLowerCase()] || st.family;
    n.childNodes.forEach((c: any) => walk(c, s2));
  };
  div.childNodes.forEach((c) => walk(c, base));
  return runs;
}
async function docStructure(): Promise<{ paragraphs: { align: string; runs: any[] }[] }[]> {
  await bakeAll();
  const T = ed(); const pages = [];
  for (let i = 0; i < T.count; i++) {
    const blocks = await blocksFor(T, i);
    pages.push({ paragraphs: blocks.map((b) => ({ align: b.align, runs: htmlRuns(b.html, { family: b.family, size: b.size, bold: false, italic: false }) })) });
  }
  return pages;
}
async function exportDocx() {
  await step('Exportando a Word…', async () => {
    const pages = await docStructure();
    const fam = Object.fromEntries(Object.entries(FAMILIAS()).map(([k, v]) => [k, v.word || v.label]));
    const r = await editorArchivos.exportarWord(pages, fam, baseName() + '.docx');
    if (!r.ok) throw new Error(r.error); if (r.data) toast('Exportado: ' + nombreDeRuta(r.data));
  });
}
async function exportTxt() {
  await step('Exportando texto…', async () => {
    const pages = await docStructure();
    const txt = pages.map((p, i) => `--- Página ${i + 1} ---\n` + p.paragraphs.map((pa) => pa.runs.map((r: any) => r.text).join('')).join('\n\n')).join('\n\n');
    const r = await editorArchivos.guardarTexto(txt, baseName() + '.txt'); if (r.ok && r.data) toast('Exportado: ' + nombreDeRuta(r.data));
  });
}
async function exportImages(fmt: string, dpi: number) {
  const dir = await editorArchivos.elegirCarpeta(); if (!dir.ok || !dir.data) return;
  await step('Exportando imágenes…', async () => {
    await bakeAll(); const T = ed();
    for (let i = 0; i < T.count; i++) {
      busy(`Exportando página ${i + 1} de ${T.count}…`, i / T.count);
      const page = await T.pdf.getPage(i + 1); const v = page.getViewport({ scale: 1 });
      const s = Math.min(dpi / 72, Math.sqrt(6e7 / (v.width * v.height))); const vp = page.getViewport({ scale: s });
      const c = Object.assign(document.createElement('canvas'), { width: Math.floor(vp.width), height: Math.floor(vp.height) });
      const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); await page.render({ canvasContext: g, viewport: vp }).promise;
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), fmt === 'png' ? 'image/png' : 'image/jpeg', 0.9));
      await editorArchivos.escribirArchivo(dir.data!, `${baseName()}-${String(i + 1).padStart(2, '0')}.${fmt}`, new Uint8Array(await blob.arrayBuffer()));
    }
    toast(`${T.count} imagen(es) exportada(s)`, 4000);
  });
}

// --- Enviar a firmar (Portalfirma)
export async function sendToSign() {
  const T = ed();
  if (!T.bytes) return toast('Abre un documento primero.');
  const b = await step('Preparando documento…', M.finalBytes); if (!b) return;
  if (b.length > MAX_ENVIO) { abrirModal(<MuyPesado tam={fmtMB(b.length)} alComprimir={compress} />); return; }
  const r = await editorArchivos.temporal(b, T.name);
  if (!r.ok) return toast(r.error || '', 5000);
  const pre = T.signers?.length ? T.signers.map((x) => ({ ...x })) : null;
  pedirInicioSesion(() => enviarArchivoAFirmar(r.data!, pre), 'Para enviar a firmar, inicia sesión en Portalfirma.');
}

// ============================================================================
// Páginas
// ============================================================================
async function structural<R>(msg: string, fn: (doc: any) => R | Promise<R>) {
  return step(msg, async () => { await bakeAll(); snapshot(); const doc = await cargarPdf(ed().bytes!); const r = await fn(doc); await setBytes(await guardarPdf(doc), { structural: true }); return r; });
}
const targets = () => { const T = ed(); return T.selected.size ? [...T.selected].sort((a, b) => a - b) : [T.current]; };
export async function rotate(delta: number) {
  const { degrees } = PDFLib();
  await structural('Rotando…', (doc) => { for (const i of targets()) { const p = doc.getPage(i); p.setRotation(degrees((p.getRotation().angle + delta + 360) % 360)); } });
}
export async function deletePages() {
  const t = targets(); const T = ed();
  if (t.length >= T.count) return toast('No puedes eliminar todas las páginas.');
  await structural('Eliminando páginas…', (doc) => { for (const i of t.slice().reverse()) doc.removePage(i); });
  T.selected.clear(); T.current = Math.min(T.current, T.count - 1); tocar(); renderPage();
}
export async function insertBlank() {
  const T = ed(); const at = T.current + 1;
  await structural('Insertando página…', (doc) => { const p = doc.getPage(T.current); const { width, height } = p.getSize(); const np = doc.insertPage(at, [width, height]); np.setRotation(p.getRotation()); });
  T.current = at; renderPage(); tocar();
}
export async function movePage(from: number, to: number) {
  if (from === to || from + 1 === to) return;
  const T = ed();
  await structural('Reordenando…', (doc) => { const p = doc.getPage(from); doc.removePage(from); doc.insertPage(to > from ? to - 1 : to, p); });
  T.current = to > from ? to - 1 : to; T.selected.clear(); tocar(); renderPage();
}
async function extractPages(list: number[] = targets()) {
  await bakeAll();
  const src = await cargarPdf(ed().bytes!); const out = await PDFLib().PDFDocument.create();
  (await out.copyPages(src, list)).forEach((p: any) => out.addPage(p));
  return guardarPdf(out);
}
export async function extractToFile() {
  await step('Extrayendo…', async () => {
    const b = await extractPages(); const r = await editorArchivos.guardarComo(b, baseName() + '-paginas.pdf');
    if (r.ok && r.data) toast('Guardado: ' + nombreDeRuta(r.data));
  });
}
export function splitDialog() {
  abrirModal(<Dividir total={ed().count} alDividir={async (groups) => {
    const dir = await editorArchivos.elegirCarpeta(); if (!dir.ok || !dir.data) return;
    await step('Dividiendo…', async () => {
      for (let g = 0; g < groups.length; g++) {
        busy(`Dividiendo · archivo ${g + 1} de ${groups.length}…`, g / groups.length);
        const b = await extractPages(groups[g]); const nm = `${baseName()}-${groups[g].length === 1 ? 'p' + (groups[g][0] + 1) : (groups[g][0] + 1) + '-' + (groups[g][groups[g].length - 1] + 1)}.pdf`;
        await editorArchivos.escribirArchivo(dir.data!, nm, b);
      }
      toast(`${groups.length} archivo(s) guardado(s) en ${nombreDeRuta(dir.data!)}`, 5000);
    });
  }} />);
}
// Aplanar: convierte la página en imagen (elimina por completo el texto original que quedó tapado).
export function flattenPages() {
  const t = targets();
  abrirModal(<Aplanar n={t.length} alAplanar={async () => {
    await step('Aplanando…', async () => {
      await bakeAll(); snapshot(); const T = ed();
      const doc = await cargarPdf(T.bytes!);
      for (const i of t) {
        const page = await T.pdf.getPage(i + 1); const v = page.getViewport({ scale: 1 });
        const s = clamp(Math.sqrt(2.4e7 / (v.width * v.height)), 1, 200 / 72);
        const vp = page.getViewport({ scale: s }); const c = Object.assign(document.createElement('canvas'), { width: Math.floor(vp.width), height: Math.floor(vp.height) });
        const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); await page.render({ canvasContext: g, viewport: vp }).promise;
        const jpg = new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.88))).arrayBuffer());
        const img = await doc.embedJpg(jpg);
        doc.removePage(i); const np = doc.insertPage(i, [v.width, v.height]); np.drawImage(img, { x: 0, y: 0, width: v.width, height: v.height });
      }
      await setBytes(await guardarPdf(doc), { structural: true });
      toast('Página(s) aplanada(s).');
    });
  }} />);
}
export function numberPages() {
  const T0 = ed(); const big = T0.vp1[0] ? esGrande(T0.vp1[0]) : false;
  abrirModal(<Numerar grande={big} alNumerar={async (fmt, pos, start) => {
    const { StandardFonts, rgb, degrees } = PDFLib();
    await structural('Numerando…', async (doc) => {
      const T = ed(); const font = await doc.embedFont(StandardFonts.Helvetica); const total = T.count + start - 1;
      for (let i = 0; i < T.count; i++) {
        const v = await vp1(T, i), page = doc.getPage(i), rot = page.getRotation().angle;
        const k = Math.max(1, Math.sqrt(v.width * v.height / (A4[0] * A4[1]))); const size = 9 * k, m = 24 * k;
        const t = fmt.replace('{n}', String(i + start)).replace('{t}', String(total)); const tw = font.widthOfTextAtSize(t, size);
        const x = pos === 'bc' ? (v.width - tw) / 2 : v.width - m - tw; const y = pos === 'tr' ? m + size : v.height - m;
        const [px, py] = v.convertToPdfPoint(x, y);
        page.drawText(t, { x: px, y: py, size, font, color: rgb(0.2, 0.2, 0.2), rotate: degrees(rot) });
      }
    });
  }} />);
}
export function watermark() {
  abrirModal(<MarcaDeAgua alAplicar={async (text, op) => {
    const { StandardFonts, rgb, degrees } = PDFLib();
    await structural('Aplicando marca de agua…', async (doc) => {
      const T = ed(); const font = await doc.embedFont(StandardFonts.HelveticaBold);
      for (let i = 0; i < T.count; i++) {
        const v = await vp1(T, i), page = doc.getPage(i), rot = page.getRotation().angle;
        const diag = Math.hypot(v.width, v.height); let size = diag * 0.7 / Math.max(1, font.widthOfTextAtSize(text, 1)); size = Math.min(size, diag / 6);
        const tw = font.widthOfTextAtSize(text, size), a = Math.PI / 4, cx = v.width / 2, cy = v.height / 2;
        const sx = cx - Math.cos(a) * tw / 2 + Math.sin(a) * size * 0.35, sy = cy + Math.sin(a) * tw / 2 + Math.cos(a) * size * 0.35;
        const [px, py] = v.convertToPdfPoint(sx, sy);
        page.drawText(text, { x: px, y: py, size, font, color: rgb(0.5, 0.5, 0.55), opacity: op, rotate: degrees(rot + 45) });
      }
    });
  }} />);
}
async function compressCore() {
  const r = await comprimirImagenes(ed().bytes!);
  await setBytes(r.bytes);
  return r.changed;
}
export async function compress() {
  const T = ed(); if (!T.bytes) return;
  const before = T.bytes.length;
  await step('Comprimiendo imágenes…', async () => {
    await bakeAll(); snapshot();
    const changed = await compressCore();
    const after = ed().bytes!.length;
    toast(changed ? `Comprimido: ${fmtMB(before)} → ${fmtMB(after)} (${changed} imagen(es))` : `Sin imágenes que comprimir. Tamaño: ${fmtMB(after)}. Si es un plano vectorial, su peso viene del dibujo y no de imágenes.`, 6000);
  });
}
export async function ocrDialog() {
  const T = ed(); if (!T.bytes) return;
  const sc = await scannedPages(T);
  abrirModal(<Ocr escaneadas={sc.length} actual={T.current} total={T.count} alReconocer={(w) => M.recognize(w === 'scanned' ? sc : w === 'current' ? [ed().current] : [...Array(ed().count).keys()])} />);
}

// --- Firmar plano arquitectónico: láminas + compresión + hoja de firmas tamaño carta
const PAPER: [string, number, number][] = [['A0', 841, 1189], ['A1', 594, 841], ['A2', 420, 594], ['A3', 297, 420], ['A4', 210, 297], ['Carta', 216, 279], ['Oficio', 216, 330]];
function paperName(wPt: number, hPt: number) {
  const a = Math.round(Math.min(wPt, hPt) / 72 * 25.4), b = Math.round(Math.max(wPt, hPt) / 72 * 25.4);
  const f = PAPER.find(([, x, y]) => Math.abs(x - a) < 8 && Math.abs(y - b) < 8);
  return `${f ? f[0] + ' · ' : ''}${a} × ${b} mm`;
}
export function planWizard() {
  const T0 = ed();
  abrirModal(<Plano abierto={T0.bytes ? T0.name : null} alSeguir={async (meta, useOpen) => {
    irAlEditor();
    if (!useOpen) { const r = await editorArchivos.elegir(true); if (!r.ok || !r.data?.length) return; if (!(await addFiles(r.data, { replace: true }))) return; }
    await step('Preparando plano…', async () => {
      const { rgb } = PDFLib();
      await bakeAll(); const T = ed();
      if (T.bytes!.length > 14 * 1048576) { busy('Comprimiendo láminas…'); await compressCore(); }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', T.bytes! as BufferSource))).map((x) => x.toString(16).padStart(2, '0')).join('');
      const sheets: string[] = []; for (let i = 0; i < T.count; i++) { const v = await vp1(T, i); sheets.push(paperName(v.width, v.height)); }
      snapshot();
      const doc = await cargarPdf(T.bytes!);
      const [W, H] = CARTA; const pg = doc.addPage([W, H]);
      const reg = await doc.embedFont((await fontBytes('sans', false, false)).bytes, { subset: true });
      const bold = await doc.embedFont((await fontBytes('sans', true, false)).bytes, { subset: true });
      const ink = rgb(0.1, 0.12, 0.2), mut = rgb(0.4, 0.42, 0.5); let y = H - 64; const L = 56;
      const text = (t: string, x: number, yy: number, size: number, f = reg, c = ink) => pg.drawText(t, { x, y: yy, size, font: f, color: c });
      const wrap = (t: string, size: number, f: any, maxW: number) => { const out: string[] = []; let line = ''; for (const wd of t.split(/\s+/)) { const tt = line ? line + ' ' + wd : wd; if (f.widthOfTextAtSize(tt, size) > maxW && line) { out.push(line); line = wd; } else line = tt; } if (line) out.push(line); return out; };
      text('HOJA DE FIRMAS', L, y, 18, bold); y -= 20; text('Planos de arquitectura', L, y, 11, reg, mut); y -= 30;
      const rows: [string, string][] = [['Proyecto', meta.name || baseName()], ...(meta.addr ? [['Dirección / Rol', meta.addr] as [string, string]] : []), ...(meta.pro ? [['Profesional responsable', meta.pro] as [string, string]] : []), ['Archivo', T.name], ['Fecha', new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })], ['Láminas', String(T.count)]];
      for (const [k, val] of rows) { text(k, L, y, 9.5, bold, mut); const ls = wrap(val, 10.5, reg, W - L - 200); ls.forEach((l2, n) => text(l2, L + 150, y - n * 13, 10.5)); y -= 13 * ls.length + 6; }
      y -= 10; text('Detalle de láminas', L, y, 11, bold); y -= 16;
      pg.drawLine({ start: { x: L, y: y + 10 }, end: { x: W - L, y: y + 10 }, thickness: 0.6, color: mut });
      const maxRows = Math.floor((y - 250) / 14);
      sheets.slice(0, maxRows).forEach((s, n) => { text(`Lámina ${n + 1}`, L, y, 9.5, bold); text(`Página ${n + 1} · ${s}`, L + 150, y, 9.5); y -= 14; });
      if (sheets.length > maxRows) { text(`… y ${sheets.length - maxRows} lámina(s) más (páginas ${maxRows + 1} a ${sheets.length})`, L, y, 9.5, reg, mut); y -= 14; }
      y -= 12; text('Huella digital (SHA-256) de las láminas:', L, y, 8.5, bold, mut); y -= 12;
      text(hash.slice(0, 32), L, y, 8, reg, mut); text(hash.slice(32), L, y - 10, 8, reg, mut); y -= 30;
      for (const l2 of wrap('Las firmas electrónicas estampadas en este documento se aplican a la totalidad de las láminas individualizadas en esta hoja, que forman parte integrante del mismo.', 9.5, reg, W - 2 * L)) { text(l2, L, y, 9.5, reg, mut); y -= 13; }
      text('Firmas', L, 205, 11, bold); pg.drawRectangle({ x: L, y: 56, width: W - 2 * L, height: 136, borderColor: rgb(0.75, 0.77, 0.83), borderWidth: 0.8, borderDashArray: [4, 3] });
      await setBytes(await guardarPdf(doc), { keepPage: false, structural: true });
      T.name = (meta.name ? meta.name.replace(/[\\/:*?"<>|]+/g, '-') : baseName()) + ' - para firma.pdf'; T.path = null;
      T.current = T.count - 1; await renderPage(); setDirty(true);
      T.notice = `Plano listo: ${T.count - 1} lámina(s) + hoja de firmas · ${fmtMB(T.bytes!.length)}. Revisa y presiona «Enviar a firmar».`;
      tocar();
    });
  }} />);
}

// Base64 del documento final (Expedientes lo guarda en la carpeta del caso)
async function exportBase64() { const b = await M.finalBytes(); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 0x8000))); return btoa(s); }

// El editor se muestra (desde el inicio, las pestañas, el menú): dibuja el documento activo si hace falta
function abrir() {
  montarPagina();
  const T = ed();
  if (!T.bytes) { tocarAhora(); return; }
  if (M.documentoDibujado() !== T || !$('#edStage')) activate(); else tocar();
}

// La barra de pestañas de documentos (#docTabs, en el encabezado) tiene su propia raíz
function montarPestanas() {
  const host = document.getElementById('docTabs'); if (!host) return;
  createRoot(host).render(<StrictMode><Pestanas /></StrictMode>);
}

export function instalarEditor() {
  M.ganchos.abrirEnlace = (url) => abrirModal(<AbrirEnlace url={url} alAbrir={() => editorArchivos.abrirEnlace(url)} />);
  M.ganchos.focoCampo = focoCampo;
  M.ganchos.imprimir = () => { printDoc(); };
  M.ganchos.leer = (on) => M.reading(on);
  M.instalarEventosGlobales();
  const E: any = {
    refreshBusy: () => M.globalBusy(),
    docName: () => (ed().bytes ? ed().name : null),
    finalBytes: () => M.finalBytes(),
    open: abrir,
    openPaths(paths: string[], replace?: boolean) { irAlEditor(); return addFiles(paths, { replace: replace ?? !ed().bytes }); },
    openEach, openDialog, createBlank, save, saveAs, saveAll, exportDialog, sendToSign, planWizard, closeDoc: () => closeTab(ed()), compress, ocrDialog, splitDialog,
    recognizeAll: async () => M.recognize([...Array(ed().count).keys()]),
    tool: (t: THerramienta) => M.setTool(t), undo: M.undo, number: numberPages, watermark,
    rotate, move: movePage, del: deletePages,
    print: printDoc, find: M.find, findStep: M.findStep, runFind: M.runFind, reading: M.reading, cycleTab, goto: M.goto,
    switchTab: (k: number) => switchTab(S().pestanas[k]), tabCount: () => S().pestanas.length, refreshTabs: () => tocar(),
    hasDoc: () => !!ed().bytes, isDirty: () => ed().dirty, anyDirty: () => S().pestanas.some((t) => t.dirty),
    zoom: M.zoom, exportBase64,
    _G: G, _mapFont: mapFont, _blocksFor: (i: number) => blocksFor(ed(), i), _editBlock: M.editBlock, _layout: (o: IObjeto) => layoutRich(o), _fontBytes: fontBytes,
    _currentFmt: () => M.currentFmt(),
  };
  Object.defineProperty(E, '_state', { get: () => ed() }); // el documento activo (pruebas, Expedientes)
  (window as any).editor = E;
  window.pf?.onFullScreen?.(((on: boolean) => { if (!on && document.body.classList.contains('reading')) { document.body.classList.remove('reading'); setTimeout(() => { if (ed().pdf) renderPage(); }, 300); } }) as any);
  // pdf.js lo usan también Flujos, Plazos y Firmas presenciales: su «worker» se configura apenas carga (antes lo hacía editor.js)
  const alCargar = () => { pdfjs(); montarPestanas(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alCargar); else alCargar();
}

// Pedir sesión antes de usar algo exclusivo de clientes (botones del editor)
export const exclusivo = (fn: () => void, motivo?: string) => pedirSesion(fn, motivo as string); // sin motivo: el de siempre de app.js
