// Reconocimiento de texto del editor:
//  · texto digital: pdf.js entrega fragmentos; se agrupan en líneas y luego en párrafos (con su fuente, tamaño y alineación);
//  · fotocopias y escaneos: OCR con Tesseract (español, sin internet) y reconocimiento de la fuente de cada línea;
//  · colores de la tinta y del fondo, para que lo editado se funda con la página.
/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js y Tesseract no tienen tipos en la app */
import { FAMILIAS, Tesseract, clamp, esc, normText, pdfjs } from './comun';
import { mapFont } from './fuentes';
import type { IBloque, IDocumento } from '../../store/interfaces/editor.interface';

export async function vp1(T: IDocumento, i: number) { if (!T.vp1[i]) { const p = await T.pdf.getPage(i + 1); T.vp1[i] = p.getViewport({ scale: 1 }); } return T.vp1[i]; }

// ---------- colores ----------
// Muestras de color del canvas dibujado (k: px de canvas por punto)
function canvasPixels(c: HTMLCanvasElement | null, k: number, x: number, y: number, wd: number, h: number) {
  if (!c || !c.width) return null;
  const X = clamp(Math.floor(x * k), 0, c.width - 1), Y = clamp(Math.floor(y * k), 0, c.height - 1);
  const W = clamp(Math.ceil(wd * k), 1, c.width - X), H = clamp(Math.ceil(h * k), 1, c.height - Y);
  try { return { data: c.getContext('2d', { willReadFrequently: true })!.getImageData(X, Y, W, H).data, W, H }; } catch { return null; }
}
// Fondo: mediana del contorno (justo afuera del bloque). Tinta: promedio de lo más oscuro de adentro.
export function sampleColors(c: HTMLCanvasElement | null, k: number, b: { x: number; y: number; w: number; h: number }) {
  const pad = 2;
  const ring: number[][] = [];
  const push = (p: { data: Uint8ClampedArray } | null) => { if (!p) return; for (let i = 0; i < p.data.length; i += 16) ring.push([p.data[i], p.data[i + 1], p.data[i + 2]]); };
  push(canvasPixels(c, k, b.x - pad, b.y - pad, b.w + pad * 2, pad)); push(canvasPixels(c, k, b.x - pad, b.y + b.h, b.w + pad * 2, pad));
  push(canvasPixels(c, k, b.x - pad, b.y, pad, b.h)); push(canvasPixels(c, k, b.x + b.w, b.y, pad, b.h));
  const med = (arr: number[][], i: number) => { const v = arr.map((p) => p[i]).sort((a, z) => a - z); return v.length ? v[Math.floor(v.length / 2)] : 255; };
  const bg = ring.length ? [med(ring, 0), med(ring, 1), med(ring, 2)].map((v) => v / 255) : [1, 1, 1];
  const inner = canvasPixels(c, k, b.x, b.y, b.w, b.h); let ink = [0.07, 0.07, 0.09];
  if (inner) {
    const px: number[][] = []; for (let i = 0; i < inner.data.length; i += 4) px.push([inner.data[i], inner.data[i + 1], inner.data[i + 2], inner.data[i] + inner.data[i + 1] + inner.data[i + 2]]);
    px.sort((a, z) => a[3] - z[3]); const n = Math.max(1, Math.floor(px.length * 0.025)); const dark = px.slice(0, n); // el 2,5 % más oscuro: en textos cortos el borde suavizado de las letras aclara el promedio
    const avg = [0, 1, 2].map((i) => dark.reduce((s, p) => s + p[i], 0) / n / 255);
    const lum = (q: number[]) => 0.3 * q[0] + 0.59 * q[1] + 0.11 * q[2];
    if (lum(bg) - lum(avg) > 0.15) ink = avg;
    // Colores casi negros se normalizan a negro para que no queden «grises» al reescribir
    if (Math.max(...ink) < 0.22 && Math.max(...ink) - Math.min(...ink) < 0.08) ink = [0.05, 0.05, 0.06];
  }
  return { bg, ink };
}

// ---------- texto digital ----------
interface IItem { str: string; x: number; base: number; w: number; size: number; family: string; bold: boolean; italic: boolean; name: string; asc: number; desc: number }
export async function detectDigitalBlocks(T: IDocumento, i: number): Promise<IBloque[]> {
  const page = await T.pdf.getPage(i + 1); const v = await vp1(T, i);
  await page.getOperatorList(); // asegura que las fuentes estén cargadas en commonObjs
  const tc = await page.getTextContent({ disableNormalization: false });
  const items: IItem[] = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue; // los «espacios» que agrega pdf.js entre columnas unirían columnas distintas
    const t = pdfjs().Util.transform(v.transform, it.transform);
    const size = Math.hypot(t[2], t[3]); if (size < 2) continue;
    if (Math.abs(t[1]) > size * 0.05 || Math.abs(t[2]) > size * 0.05) continue; // texto girado: no editable aquí
    let fontObj = null; try { if (page.commonObjs.has(it.fontName)) fontObj = page.commonObjs.get(it.fontName); } catch { /* sin la fuente */ }
    const st = tc.styles[it.fontName];
    const f = mapFont(fontObj?.name || st?.fontFamily, fontObj, st);
    const wd = it.width * (v.scale || 1) || it.str.length * size * 0.5;
    items.push({ str: it.str, x: t[4], base: t[5], w: wd, size, ...f, asc: st?.ascent || 0.8, desc: Math.abs(st?.descent || 0.22) });
  }
  return groupBlocks(await splitColumns(items), 'pdf');
}
// Un mismo trozo de texto con muchos espacios seguidos suele ser dos columnas (por ejemplo, las firmas
// «JUAN PÉREZ        MARÍA GONZÁLEZ»): se separa para que cada columna sea su propio párrafo.
let medidor: CanvasRenderingContext2D | null = null;
async function splitColumns(items: IItem[]) {
  const out: IItem[] = [];
  medidor ||= document.createElement('canvas').getContext('2d');
  const mc = medidor!;
  for (const it of items) {
    if (!/\S\s{3,}\S/.test(it.str)) { out.push(it); continue; }
    const css = FAMILIAS()[it.family]?.css || 'PF Sans'; const font = `${it.italic ? 'italic ' : ''}${it.bold ? '700 ' : '400 '}${it.size}px '${css}'`;
    try { await document.fonts.load(font); } catch { /* se mide con la de reemplazo */ }
    mc.font = font;
    const k = it.w / (mc.measureText(it.str).width || 1);
    const re = /\S+(?:\s{1,2}\S+)*/g; let m;
    while ((m = re.exec(it.str))) out.push({ ...it, str: m[0], x: it.x + mc.measureText(it.str.slice(0, m.index)).width * k, w: mc.measureText(m[0]).width * k });
  }
  return out;
}

interface ILinea { items: IItem[]; x0: number; x1: number; base: number; size: number; text?: string }
interface IParrafo { lines: ILinea[]; x0: number; x1: number; size: number; dy: number; closed?: boolean }
export function groupBlocks(items: IItem[], source: 'pdf' | 'ocr'): IBloque[] {
  if (!items.length) return [];
  // Líneas
  items.sort((a, b) => (Math.abs(a.base - b.base) < Math.min(a.size, b.size) * 0.35 ? a.x - b.x : a.base - b.base));
  const lines: ILinea[] = [];
  for (const it of items) {
    const ln = lines.length ? lines[lines.length - 1] : null;
    const sameRow = ln && Math.abs(ln.base - it.base) < Math.min(ln.size, it.size) * 0.35;
    const gap = ln ? it.x - ln.x1 : 0;
    if (ln && sameRow && gap < Math.max(ln.size, it.size) * 2.2 && gap > -ln.size) {
      ln.items.push(it); ln.x1 = Math.max(ln.x1, it.x + it.w); ln.size = Math.max(ln.size, it.size);
    } else lines.push({ items: [it], x0: it.x, x1: it.x + it.w, base: it.base, size: it.size });
  }
  for (const l of lines) { // tamaño dominante (el de más caracteres)
    const tally: Record<string, number> = {}; for (const it of l.items) tally[it.size.toFixed(1)] = (tally[it.size.toFixed(1)] || 0) + it.str.length;
    l.size = Number(Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0]);
    l.text = l.items.map((x, k) => { const p = l.items[k - 1]; return p && x.x - (p.x + p.w) > x.size * 0.12 && !/\s$/.test(p.str) && !/^\s/.test(x.str) ? ' ' + x.str : x.str; }).join('');
  }
  // Párrafos
  const blocks: IParrafo[] = [];
  for (const l of lines.sort((a, b) => a.base - b.base || a.x0 - b.x0)) {
    if (!l.text!.trim()) continue;
    let target: IParrafo | null = null;
    for (const b of blocks) {
      if (b.closed) continue;
      const last = b.lines[b.lines.length - 1];
      const dy = l.base - last.base; const sz = Math.max(l.size, last.size);
      if (dy < sz * 0.8 || dy > sz * 1.9) continue;
      if (Math.abs(l.size - b.size) > b.size * 0.18) continue;
      if (b.lines.length > 1 && Math.abs(dy - b.dy) > b.dy * 0.3) continue;
      const ov = Math.min(l.x1, b.x1) - Math.max(l.x0, b.x0);
      if (ov < Math.min(l.x1 - l.x0, b.x1 - b.x0) * 0.4) continue;
      target = b; break;
    }
    if (target) { target.dy = target.lines.length > 1 ? (target.dy * (target.lines.length - 1) + (l.base - target.lines[target.lines.length - 1].base)) / target.lines.length : l.base - target.lines[target.lines.length - 1].base; target.lines.push(l); target.x0 = Math.min(target.x0, l.x0); target.x1 = Math.max(target.x1, l.x1); }
    else blocks.push({ lines: [l], x0: l.x0, x1: l.x1, size: l.size, dy: l.size * 1.2 });
    // cierra párrafos que quedaron muy arriba
    for (const b of blocks) if (b !== target && l.base - b.lines[b.lines.length - 1].base > b.size * 2.2) b.closed = true;
  }
  return blocks.map((b, n) => finishBlock(b, n, source));
}

function finishBlock(b: IParrafo, n: number, source: 'pdf' | 'ocr'): IBloque {
  const F = FAMILIAS();
  const first = b.lines[0], last = b.lines[b.lines.length - 1];
  const asc = first.items[0].asc ?? 0.8, desc = last.items[0].desc ?? 0.22;
  const top = first.base - first.size * Math.min(0.95, Math.max(0.7, asc));
  const bottom = last.base + last.size * Math.min(0.3, Math.max(0.15, desc));
  const box = { x: b.x0 - 1, y: top - 1, w: b.x1 - b.x0 + 2, h: bottom - top + 2 };
  // Alineación
  const W = b.x1 - b.x0, tol = b.size * 0.6;
  const lefts = b.lines.map((l) => l.x0 - b.x0), rights = b.lines.map((l) => b.x1 - l.x1);
  const centers = b.lines.map((l) => Math.abs((l.x0 + l.x1) / 2 - (b.x0 + b.x1) / 2));
  let align = 'left';
  if (b.lines.length >= 2) {
    const body = b.lines.slice(0, -1);
    if (b.lines.length >= 3 && body.every((l) => l.x0 - b.x0 < tol && b.x1 - l.x1 < b.size * 0.3) && lefts.every((v) => v < tol)) align = 'justify';
    else if (lefts.some((v) => v > tol) && centers.every((v) => v < tol)) align = 'center';
    else if (rights.every((v) => v < tol) && lefts.some((v) => v > tol)) align = 'right';
  }
  const lh = b.lines.length > 1 ? clamp(b.dy / b.size, 1, 2.2) : 1.2;
  // Estilo base = el del texto mayoritario
  const tally: Record<string, number> = {}; for (const l of b.lines) for (const it of l.items) { const k = `${it.family}|${it.bold}|${it.italic}`; tally[k] = (tally[k] || 0) + it.str.length; }
  const [famK] = Object.entries(tally).sort((a, c) => c[1] - a[1])[0][0].split('|');
  const names: Record<string, number> = {}; for (const l of b.lines) for (const it of l.items) names[it.name] = (names[it.name] || 0) + it.str.length;
  const detected = Object.entries(names).sort((a, c) => c[1] - a[1])[0]?.[0] || '';
  // HTML con los estilos por fragmento (negritas y cursivas se conservan)
  let html = '';
  b.lines.forEach((l, li) => {
    let prev: IItem | null = null;
    for (const it of l.items) {
      if (prev) { const gap = it.x - (prev.x + prev.w); if (gap > it.size * 0.12 && !/\s$/.test(prev.str) && !/^\s/.test(it.str)) html += ' '; }
      const s = esc(it.str);
      const st: string[] = [];
      if (it.family !== famK) st.push(`font-family:'${F[it.family]?.css || 'PF Sans'}'`);
      if (Math.abs(it.size - b.size) > 0.6) st.push(`font-size:${it.size.toFixed(1)}px`);
      const inner = it.bold ? `<b>${s}</b>` : s;
      const inner2 = it.italic ? `<i>${inner}</i>` : inner;
      html += st.length ? `<span style="${st.join(';')}">${inner2}</span>` : inner2;
      prev = it;
    }
    if (li < b.lines.length - 1) {
      const full = align === 'justify' || (W - (l.x1 - l.x0)) < b.size * 3 || align === 'center';
      html += full && align !== 'center' ? ' ' : '<br>';
    }
  });
  html = html.replace(/<\/b><b>/g, '').replace(/<\/i><i>/g, '').replace(/ {2,}/g, ' ');
  return { id: 'b' + n, box, x0: b.x0, x1: b.x1, base0: first.base, align, lh, size: b.size, family: famK, html, text: b.lines.map((l) => l.text).join('\n'), detected, source };
}

// ---------- fotocopias y escaneos: OCR ----------
let ocrWorker: any = null;
async function getOcr(progress: (p: number) => void) {
  if (!ocrWorker) {
    ocrWorker = await Tesseract().createWorker('spa', 1, {
      workerPath: 'vendor/tesseract/worker.min.js', corePath: 'vendor/tesseract/core', langPath: 'vendor/tesseract/lang',
      gzip: true, workerBlobURL: false, cacheMethod: 'none',
      logger: (m: any) => { if (m.status === 'recognizing text' && ocrWorker?._progress) ocrWorker._progress(m.progress); },
    });
    await ocrWorker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '3' });
  }
  ocrWorker._progress = progress;
  return ocrWorker;
}

// Compara cada línea escaneada con el mismo texto dibujado en cada fuente candidata
// (ajustando el tamaño para que el ancho coincida) y elige la de mayor correlación.
const CANDIDATAS: [string, boolean][] = [['sans', false], ['sans', true], ['serif', false], ['serif', true], ['calibri', false], ['calibri', true], ['cambria', false], ['mono', false]];
interface IAjuste { family: string; bold: boolean; sizePx: number; score: number }
async function fitFonts(g: CanvasRenderingContext2D, lines: { ln: any; lw: any[] }[]) {
  const F = FAMILIAS();
  await Promise.all(CANDIDATAS.map(([f, b]) => document.fonts.load(`${b ? 700 : 400} 40px '${F[f].css}'`).catch(() => {})));
  const work = document.createElement('canvas'); const wg = work.getContext('2d', { willReadFrequently: true })!;
  const meas = document.createElement('canvas').getContext('2d')!;
  const out: (IAjuste | null)[] = [];
  for (const { ln, lw } of lines) {
    const text = lw.map((x) => x.text).join(' ');
    const x0 = Math.min(...lw.map((x) => x.bbox.x0)), x1 = Math.max(...lw.map((x) => x.bbox.x1));
    const y0 = ln.bbox.y0, y1 = ln.bbox.y1, W = x1 - x0, H = y1 - y0;
    if (text.length < 4 || W < 20 || H < 6) { out.push(null); continue; }
    const base = ln.baseline?.y0 > 0 ? (ln.baseline.y0 + ln.baseline.y1) / 2 : y1 - H * 0.2;
    const pad = Math.round(H * 0.3); const bw = Math.round(W + pad * 2), bh = Math.round(H + pad * 2);
    const k = Math.min(1, 400 / bw); const sw = Math.max(8, Math.round(bw * k)), sh = Math.max(4, Math.round(bh * k));
    const src = g.getImageData(Math.max(0, x0 - pad), Math.max(0, y0 - pad), bw, bh);
    // muestra escaneada reducida y normalizada (1 = tinta)
    work.width = bw; work.height = bh; wg.putImageData(src, 0, 0);
    const small = document.createElement('canvas'); small.width = sw; small.height = sh; const sg = small.getContext('2d', { willReadFrequently: true })!; sg.drawImage(work, 0, 0, sw, sh);
    const A = toInk(sg.getImageData(0, 0, sw, sh).data);
    let best: IAjuste | null = null;
    for (const [fam, bold] of CANDIDATAS) {
      const font = (px: number) => `${bold ? 700 : 400} ${px}px '${F[fam].css}'`;
      meas.font = font(100); const w100 = meas.measureText(text).width; if (!w100) continue;
      const px = 100 * W / w100;
      if (px < H * 0.45 || px > H * 2.2) continue; // tamaño incoherente con la altura de la línea
      sg.fillStyle = '#fff'; sg.fillRect(0, 0, sw, sh); sg.fillStyle = '#000'; sg.font = font(px * k); sg.textBaseline = 'alphabetic';
      sg.fillText(text, (x0 - Math.max(0, x0 - pad)) * k, (base - Math.max(0, y0 - pad)) * k);
      const B = toInk(sg.getImageData(0, 0, sw, sh).data);
      const score = corr(A, B);
      if (!best || score > best.score) best = { family: fam, bold, sizePx: px * 0.97, score };
    }
    out.push(best && best.score > 0.25 ? best : null);
  }
  // Una sola familia por documento escaneado suele ser lo correcto: se usa la mayoritaria si gana claramente.
  const votes: Record<string, number> = {}; out.forEach((f) => { if (f) votes[f.family] = (votes[f.family] || 0) + f.score; });
  const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  if (top) out.forEach((f) => { if (f && f.family !== top[0] && f.score < 0.75) f.family = top[0]; });
  return out;
}
function toInk(d: Uint8ClampedArray) { const a = new Float32Array(d.length / 4); for (let i = 0, j = 0; i < d.length; i += 4, j++) a[j] = 1 - (d[i] + d[i + 1] + d[i + 2]) / 765; return a; }
function corr(a: Float32Array, b: Float32Array) {
  let ma = 0, mb = 0; for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; } ma /= a.length; mb /= b.length;
  let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; n += x * y; da += x * x; db += y * y; }
  return da && db ? n / Math.sqrt(da * db) : 0;
}

// Reconoce una página escaneada: los párrafos (editables) y las palabras (capa de texto invisible al guardar)
export async function ocrPage(T: IDocumento, i: number, onProgress: (p: number) => void) {
  const F = FAMILIAS();
  const page = await T.pdf.getPage(i + 1); const v = await vp1(T, i);
  const dpi = clamp(Math.sqrt(9e6 / (v.width * v.height)) * 72, 110, 300); const s = dpi / 72;
  const vp = page.getViewport({ scale: s });
  const c = Object.assign(document.createElement('canvas'), { width: Math.floor(vp.width), height: Math.floor(vp.height) });
  const g = c.getContext('2d', { willReadFrequently: true })!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  const wk = await getOcr(onProgress);
  const { data } = await wk.recognize(c, {}, { blocks: true, text: false });
  const img = g.getImageData(0, 0, c.width, c.height).data;
  const darkness = (bb: any) => { // proporción de tinta, para detectar negritas
    let dark = 0, tot = 0;
    for (let y = bb.y0; y < bb.y1; y += 2) for (let x = bb.x0; x < bb.x1; x += 2) { const p = (y * c.width + x) * 4; tot++; if (img[p] + img[p + 1] + img[p + 2] < 300) dark++; }
    return tot ? dark / tot : 0;
  };
  const words: any[] = []; const items: IItem[] = [];
  const lines: { ln: any; lw: any[] }[] = [];
  for (const bl of data.blocks || []) for (const par of bl.paragraphs || []) for (const ln of par.lines || []) {
    const lw = (ln.words || []).filter((wd: any) => wd.text.trim() && wd.confidence > 25);
    if (lw.length) lines.push({ ln, lw });
  }
  // Reconocimiento de fuente: se dibuja cada línea con las fuentes candidatas y se elige la más parecida al escaneo.
  const fits = await fitFonts(g, lines);
  for (let n = 0; n < lines.length; n++) {
    const { ln, lw } = lines[n]; const fit = fits[n];
    const rowH = ln.rowAttributes?.row_height || (ln.bbox.y1 - ln.bbox.y0);
    const size = clamp((fit?.sizePx || rowH * 0.92) / s, 4, 120);
    const base = (ln.baseline?.y0 != null && ln.baseline.y0 > 0 ? (ln.baseline.y0 + ln.baseline.y1) / 2 : ln.bbox.y1 - (ln.rowAttributes?.descenders || rowH * 0.2)) / s;
    const ink = lw.map((wd) => darkness(wd.bbox)); const medInk = ink.slice().sort((x, y) => x - y)[Math.floor(ink.length / 2)] || 0;
    lw.forEach((wd, k) => {
      const x = wd.bbox.x0 / s, wW = (wd.bbox.x1 - wd.bbox.x0) / s;
      const wordBold = lw.length >= 4 && wd.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 3 && ink[k] > Math.max(0.2, medInk * 1.55);
      items.push({ str: wd.text + ' ', x, base, w: wW, size, family: fit?.family || 'sans', bold: fit?.bold || wordBold, italic: false, name: fit ? `OCR · ${F[fit.family].label}${fit.bold ? ' negrita' : ''}` : 'OCR', asc: 0.8, desc: 0.2 });
      words.push({ text: wd.text, x, y: wd.bbox.y0 / s, w: wW, h: (wd.bbox.y1 - wd.bbox.y0) / s, base, size });
    });
  }
  const blocks = groupBlocks(items, 'ocr');
  return { blocks, words, conf: data.confidence ?? null };
}

// Los párrafos de una página: los ya detectados, los del OCR o los del texto digital
export async function blocksFor(T: IDocumento, i: number): Promise<IBloque[]> {
  if (T.blocks[i]) return T.blocks[i];
  if (T.ocr[i] && !T.ocr[i].baked && T.ocr[i].blocks) return (T.blocks[i] = T.ocr[i].blocks);
  return (T.blocks[i] = await detectDigitalBlocks(T, i));
}

// ---------- índice de texto (buscar) ----------
export function buildIndex(tc: any) {
  let str = ''; const starts: number[] = [], lens: number[] = [];
  for (const it of tc.items) {
    if (it.str === undefined) continue;
    starts.push(str.length); lens.push(it.str.length); str += it.str;
    if (it.hasEOL) str += ' ';
  }
  return { str, norm: normText(str).replace(/\s/g, ' '), starts, lens };
}
export async function textIndex(T: IDocumento, i: number) {
  if (T.textIndex[i]) return T.textIndex[i];
  try { const tc = await (await T.pdf.getPage(i + 1)).getTextContent(); T.textIndex[i] = buildIndex(tc); } catch { T.textIndex[i] = { str: '', norm: '', starts: [], lens: [] }; }
  return T.textIndex[i];
}
// Páginas sin texto (fotocopias): menos de 15 letras
export async function scannedPages(T: IDocumento) {
  const out: number[] = [];
  for (let i = 0; i < T.count; i++) {
    if (T.ocr[i]) continue;
    try { const tc = await (await T.pdf.getPage(i + 1)).getTextContent(); if (tc.items.reduce((s: number, it: any) => s + (it.str || '').trim().length, 0) < 15) out.push(i); } catch { /* página ilegible */ }
  }
  return out;
}
