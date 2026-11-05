// PDF de los trámites notariales, con pdf-lib y pdf.js (index.html los carga como PDFLib, fontkit y pdfjsLib):
//  · la escritura formateada al estilo notarial (hoja oficio, 30 líneas, márgenes de página par e impar),
//  · la carátula de protocolización, con los documentos agregados al final,
//  · una foto convertida a PDF, y las hojas como imagen para leerlas con IA.
// Lo que va entre [ ] lo completa la notaría: se marca en amarillo.
/* eslint-disable @typescript-eslint/no-explicit-any -- pdf-lib, pdf.js y el motor notarial no tienen tipos en la app */
import { motor } from './escrituras';

const w = () => window as any;
const pdfjs = () => w().pdfjsLib;
const abrirPdf = (bytes: Uint8Array) => pdfjs().getDocument({ data: bytes.slice(0), isEvalSupported: false, standardFontDataUrl: 'vendor/standard_fonts/', cMapUrl: 'vendor/cmaps/', cMapPacked: true }).promise;

async function fuentes(doc: any, familia: string) {
  const E = w().editor;
  const [r, b] = await Promise.all([E._fontBytes(familia, false, false), E._fontBytes(familia, true, false)]);
  return { r: await doc.embedFont(r.bytes), b: await doc.embedFont(b.bytes) };
}

function texto(page: any, s: string, x: number, y: number, font: any, size: number, track = 0, scale = 1, marca = false) {
  if (!s) return;
  const { rgb, setCharacterSpacing, PDFOperator, PDFNumber } = w().PDFLib;
  const Tz = (p: number) => PDFOperator.of('Tz', [PDFNumber.of(p)]);
  if (marca) page.drawRectangle({ x: x - 1, y: y - size * 0.25, width: font.widthOfTextAtSize(s, size) * scale + track * s.length + 1, height: size * 1.1, color: rgb(1, 0.95, 0.55) });
  page.pushOperators(setCharacterSpacing(track), Tz(scale * 100));
  page.drawText(s, { x, y, size, font, color: rgb(0, 0, 0) });
  page.pushOperators(setCharacterSpacing(0), Tz(100));
}
const esMarca = (s: string) => /\[|\]/.test(s);

export async function escrituraPdf(blocks: any[]): Promise<{ bytes: Uint8Array; pages: number }> {
  const { PDFDocument, rgb } = w().PDFLib; const N = motor().N;
  const doc = await PDFDocument.create(); doc.registerFontkit(w().fontkit);
  const F = await fuentes(doc, 'sans');
  const L = N.LAYOUT; const k = L.narrow;
  const medir = (t: string, bold: boolean, size: number) => (bold ? F.b : F.r).widthOfTextAtSize(t, size) * k;
  const { pages, W } = N.layoutEscritura(blocks, medir);
  const H = N.OFICIO.h; let abierta = false; // dentro de una marca [ … ] que ocupa varias palabras
  const tinta = rgb(0.1, 0.11, 0.14); const suave = rgb(0.55, 0.57, 0.62);
  pages.forEach((items: any[], pi: number) => {
    const M = pi % 2 === 0 ? L.odd : L.even;
    const page = doc.addPage([N.OFICIO.w, H]);
    const yDe = (slot: number) => H - (L.top + slot * L.pitch);
    for (const ln of items) {
      const y = yDe(ln.slot);
      if (ln.k === 'blank') continue;
      if (ln.k === 'sep') { const a = 70; page.drawLine({ start: { x: M.left + (W - a) / 2, y: y + 4 }, end: { x: M.left + (W + a) / 2, y: y + 4 }, thickness: 0.6, color: suave }); continue; }
      if (ln.k === 'sigrow') {
        const colW = W / ln.cols;
        ln.cells.forEach((c: any, ci: number) => {
          const cx = ln.cols === 1 || ln.cells.length === 1 ? M.left + W / 2 : M.left + colW * ci + colW / 2; // la última firma sola va centrada
          const lineaY = y - 1.9 * L.pitch; const mitad = Math.min(84, colW / 2 - 14);
          page.drawLine({ start: { x: cx - mitad, y: lineaY }, end: { x: cx + mitad, y: lineaY }, thickness: 0.5, color: tinta });
          let ny = lineaY - 14;
          c.name.forEach((nm: string) => { const a = F.b.widthOfTextAtSize(nm, L.sigSize) + 0.8 * nm.length; texto(page, nm, cx - a / 2, ny, F.b, L.sigSize, 0.8); ny -= 12; });
          (c.rol || []).forEach((r: string) => { const a = F.r.widthOfTextAtSize(r, L.sigSize - 1) + 0.2 * r.length; texto(page, r, cx - a / 2, ny, F.r, L.sigSize - 1, 0.2); ny -= 11; });
          if (c.ci) { const t = `C.I. N° ${c.ci}`; const a = F.r.widthOfTextAtSize(t, L.sigSize - 1) + 0.4 * t.length; texto(page, t, cx - a / 2, ny, F.r, L.sigSize - 1, 0.4); }
        });
        continue;
      }
      const font = ln.bold ? F.b : F.r; const size = ln.size; const tr = ln.track || 0;
      const ancho = (s: string) => font.widthOfTextAtSize(s, size) * k + tr * s.length;
      if (ln.text != null) {
        const a = ancho(ln.text); let x = ln.align === 'center' ? M.left + (W - a) / 2 : M.left;
        ln.text.split(/(\[[^\]]*\])/).filter(Boolean).forEach((seg: string) => { texto(page, seg, x, y, font, size, tr, k, seg.startsWith('[')); x += ancho(seg); });
        continue;
      }
      const anchos = ln.words.map(ancho); const suma = anchos.reduce((a: number, b: number) => a + b, 0);
      const espacio = font.widthOfTextAtSize(' ', size) * k + tr;
      let gap = espacio; let x = M.left;
      if (ln.align === 'justify' && ln.words.length > 1) gap = (W - suma) / (ln.words.length - 1);
      else if (ln.align === 'center') x = M.left + (W - (suma + espacio * (ln.words.length - 1))) / 2;
      ln.words.forEach((p: string, j: number) => { const m = abierta || p.includes('['); if (p.includes('[')) abierta = true; if (p.includes(']')) abierta = false; texto(page, p, x, y, font, size, tr, k, m); x += anchos[j] + gap; });
    }
    const pn = String(pi + 1); texto(page, pn, M.left + (W - F.r.widthOfTextAtSize(pn, 9)) / 2, H - L.pageNumY, F.r, 9);
  });
  return { bytes: await doc.save(), pages: pages.length };
}

export async function caratulaPdf(d: any, adjuntos: { bytes: Uint8Array }[] = []): Promise<Uint8Array> {
  const { PDFDocument } = w().PDFLib; const N = motor().N;
  const doc = await PDFDocument.create(); doc.registerFontkit(w().fontkit);
  const F = await fuentes(doc, 'verdana'); const H = N.OFICIO.h; const page = doc.addPage([N.OFICIO.w, H]);
  const left = 110, W = N.OFICIO.w - 70 - left; let y = H - 150;
  const centro = (s: string, f: any, sz: number, gap = 18) => { texto(page, s, left + (W - f.widthOfTextAtSize(s, sz)) / 2, y, f, sz, 0, 1, esMarca(s)); y -= gap; };
  const envolver = (s: string, f: any, sz: number) => { let cur = ''; const out: string[] = []; s.split(/\s+/).forEach((p) => { const t = cur ? cur + ' ' + p : p; if (f.widthOfTextAtSize(t, sz) > W - 20 && cur) { out.push(cur); cur = p; } else cur = t; }); if (cur) out.push(cur); out.forEach((l) => centro(l, f, sz, 17)); };
  texto(page, 'REPERTORIO Nº ', left, y, F.b, 11); texto(page, '[_______]', left + F.b.widthOfTextAtSize('REPERTORIO Nº ', 11), y, F.b, 11, 0, 1, true); y -= 17;
  texto(page, 'PROTOCOLIZADO Nº ', left, y, F.b, 11); texto(page, '[_______]', left + F.b.widthOfTextAtSize('PROTOCOLIZADO Nº ', 11), y, F.b, 11, 0, 1, true); y -= 40;
  centro('PROTOCOLIZACIÓN DE DOCUMENTOS', F.b, 11, 17); centro('*'.repeat(40), F.r, 11, 20);
  envolver((d.titulo || '').toUpperCase(), F.b, 11); y -= 6;
  if (d.partes?.[0]) { envolver(d.partes[0].toUpperCase(), F.b, 11); if (d.partes[1]) { centro('A', F.b, 11, 17); envolver(`“${d.partes[1].toUpperCase()}”`, F.b, 11); } }
  centro('*'.repeat(40), F.r, 11, 30);
  // texto con **negritas**: palabras formadas por partes normales y en negrita
  const palabras: { parts: { w: string; b: boolean }[]; sp: boolean }[] = [];
  String(d.texto || '').split(/(\*\*[^*]+\*\*)/).filter(Boolean).forEach((p) => {
    const b = p.startsWith('**');
    (b ? p.slice(2, -2) : p).split(/(\s+)/).forEach((t) => {
      if (!t) return;
      const ult = palabras[palabras.length - 1];
      if (/^\s+$/.test(t)) { if (ult) ult.sp = true; } else if (ult && !ult.sp) ult.parts.push({ w: t, b }); else palabras.push({ parts: [{ w: t, b }], sp: false });
    });
  });
  const size = 11; const sw = F.r.widthOfTextAtSize(' ', size);
  const anchoP = (p: typeof palabras[number]) => p.parts.reduce((a, x) => a + (x.b ? F.b : F.r).widthOfTextAtSize(x.w, size), 0);
  const lineas: typeof palabras[] = []; let cur: typeof palabras = []; let cw = 0; let abierta = false;
  palabras.forEach((p) => { const x = anchoP(p); if (cur.length && cw + sw + x > W) { lineas.push(cur); cur = [p]; cw = x; } else { cw += (cur.length ? sw : 0) + x; cur.push(p); } });
  if (cur.length) lineas.push(cur);
  lineas.forEach((ln, i) => {
    const suma = ln.reduce((a, p) => a + anchoP(p), 0); const gap = i < lineas.length - 1 && ln.length > 1 ? (W - suma) / (ln.length - 1) : sw;
    let x = left;
    ln.forEach((p) => { p.parts.forEach((q) => { const f = q.b ? F.b : F.r; const m = abierta || q.w.includes('['); if (q.w.includes('[')) abierta = true; if (q.w.includes(']')) abierta = false; texto(page, q.w, x, y, f, size, 0, 1, m); x += f.widthOfTextAtSize(q.w, size); }); x += gap; });
    y -= 21;
  });
  for (const a of adjuntos) { const src = await PDFDocument.load(a.bytes, { ignoreEncryption: true }); (await doc.copyPages(src, src.getPageIndices())).forEach((p: any) => doc.addPage(p)); }
  return doc.save();
}

export async function paginasDePdf(bytes: Uint8Array): Promise<number> { const pdf = await abrirPdf(bytes); const n = pdf.numPages; pdf.destroy?.(); return n; }

// Una foto o escaneo como PDF de una hoja
export async function imagenAPdf(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  const { PDFDocument } = w().PDFLib;
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d')!.drawImage(bmp, 0, 0);
  const jpg = new Uint8Array(await (await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.9))).arrayBuffer());
  const doc = await PDFDocument.create(); const img = await doc.embedJpg(jpg);
  const ancho = 612; const alto = Math.round((612 * bmp.height) / bmp.width); const page = doc.addPage([ancho, alto]); page.drawImage(img, { x: 0, y: 0, width: ancho, height: alto });
  return doc.save();
}

// Las hojas de un PDF como JPEG en base64 (para leerlas con IA), de a `lote` hojas
export async function hojasComoImagen(bytes: Uint8Array, desde: number, hasta: number) {
  const pdf = await abrirPdf(bytes); const out: { mime: string; data: string }[] = [];
  for (let i = desde; i <= Math.min(hasta, pdf.numPages); i++) {
    const page = await pdf.getPage(i);
    const vp0 = page.getViewport({ scale: 1 }); const scale = Math.min(2, 1600 / Math.max(vp0.width, vp0.height));
    const vp = page.getViewport({ scale }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const b = await new Promise<Blob>((res) => c.toBlob((x) => res(x!), 'image/jpeg', 0.8)); const u8 = new Uint8Array(await b.arrayBuffer());
    let bin = ''; for (let j = 0; j < u8.length; j += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(j, j + 0x8000) as unknown as number[]);
    out.push({ mime: 'image/jpeg', data: btoa(bin) });
  }
  pdf.destroy?.();
  return out;
}

// Una hoja dibujada: papel blanco con sombra. La clase es-page la usan las pruebas.
const HOJA = 'es-page tw:bg-white tw:rounded-[3px] tw:[box-shadow:0_1px_2px_rgba(16,24,64,.06),0_16px_36px_-14px_rgba(16,24,64,.28)] tw:max-w-full tw:h-auto';

// Dibuja las hojas de un PDF como <canvas class="es-page"> al final de `host` (hasta `max` hojas).
// `vivo()` se consulta entre hoja y hoja: si el visor cambió, se deja de dibujar.
export async function dibujarHojas(host: HTMLElement, bytes: Uint8Array, { max = 40, escala = 1, vivo = () => true }: { max?: number; escala?: number; vivo?: () => boolean } = {}) {
  const pdf = await abrirPdf(bytes);
  const dpr = window.devicePixelRatio || 1;
  try {
    for (let i = 1; i <= Math.min(pdf.numPages, max); i++) {
      if (!vivo()) return;
      const p = await pdf.getPage(i); const base = p.getViewport({ scale: 1 }); const fit = Math.min(1.1, (host.clientWidth - 40) / base.width || 1.1) * escala;
      const vp = p.getViewport({ scale: Math.max(0.4, fit) * dpr });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.className = HOJA; c.style.width = (vp.width / dpr) + 'px';
      if (!vivo()) return;
      host.appendChild(c); await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
  } finally { pdf.destroy?.(); }
}
