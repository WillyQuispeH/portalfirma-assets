// «Hornear»: pasar los objetos del editor (textos, imágenes, tapar, la capa del OCR) al PDF con pdf-lib.
// El texto se escribe exactamente donde el navegador lo dibujó (WYSIWYG): se mide cada palabra en un elemento oculto.
// Coordenadas «visuales» (x→derecha, y→abajo, en puntos de la página tal como se ve) se convierten al espacio PDF
// con el viewport de pdf.js (considera la rotación).
/* eslint-disable @typescript-eslint/no-explicit-any -- pdf-lib y pdf.js no tienen tipos en la app */
import { PDFLib, cargarPdf, clamp, cssRgb, guardarPdf } from './comun';
import { CSS2FAM, cssDe, fontBytes, fontMetrics } from './fuentes';
import { removeTextInRects } from './pdftext';
import { vp1 } from './bloques';
import type { IDocumento, IObjeto } from '../../store/interfaces/editor.interface';

// Estilo del texto enriquecido (el mismo en pantalla y al medir)
export function richStyle(o: IObjeto, s: number) {
  return `font-synthesis:none;font-kerning:none;font-variant-ligatures:none;font-feature-settings:'kern' 0,'liga' 0;width:${o.w}px;font-family:'${cssDe(o.family)}';font-size:${o.size}px;line-height:${o.lh};text-align:${o.align};color:${o.color};transform:scale(${s})`;
}

// Elemento oculto donde se mide el texto
let medida: HTMLDivElement | null = null;
function hostMedida() {
  if (!medida || !medida.isConnected) {
    medida = document.createElement('div'); medida.id = 'edMeasure';
    medida.setAttribute('style', 'position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none');
    document.body.appendChild(medida);
  }
  return medida;
}

interface IPalabra { text: string; x: number; top: number; h: number; w: number; family: string; bold: boolean; italic: boolean; size: number; color: number[]; underline: boolean; va: string; rt?: number }
// Descompone un texto enriquecido en palabras con su posición exacta (layout del navegador).
export async function layoutRich(o: IObjeto) {
  const host = hostMedida();
  host.innerHTML = `<div class="rt" style="${richStyle(o, 1).replace(/transform:[^;]+/, 'transform:none')}">${o.html}</div>`;
  const root = host.firstElementChild as HTMLElement;
  await document.fonts.ready;
  const fams = new Set<string>(); root.querySelectorAll('*').forEach((n) => fams.add(getComputedStyle(n).fontFamily)); fams.add(getComputedStyle(root).fontFamily);
  await Promise.all([...fams].map((f) => Promise.all(['400', '700'].flatMap((wt) => ['normal', 'italic'].map((st) => document.fonts.load(`${st} ${wt} 12px ${f}`).catch(() => {}))))));
  const base = root.getBoundingClientRect();
  const words: IPalabra[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const el = node.parentElement!; const cs = getComputedStyle(el);
    let underline = false; for (let a: HTMLElement | null = el; a && a !== host; a = a.parentElement) if (/underline/.test(getComputedStyle(a).textDecorationLine)) underline = true;
    const famCss = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    const style = { family: CSS2FAM()[famCss] || 'sans', bold: Number(cs.fontWeight) >= 600, italic: cs.fontStyle === 'italic', size: parseFloat(cs.fontSize), color: cssRgb(cs.color), underline, va: cs.verticalAlign };
    const re = /\S+/g; let m;
    while ((m = re.exec(node.data))) {
      const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      if (rects.length <= 1) { const r = rects[0] || range.getBoundingClientRect(); words.push({ text: m[0], x: r.left - base.left, top: r.top - base.top, h: r.height, w: r.width, ...style }); }
      else { // palabra cortada entre líneas: carácter por carácter
        let cur: IPalabra | null = null;
        for (let k = 0; k < m[0].length; k++) {
          const rr = document.createRange(); rr.setStart(node, m.index + k); rr.setEnd(node, m.index + k + 1); const r = rr.getBoundingClientRect();
          if (cur && Math.abs(r.top - cur.rt!) < 1) { cur.text += m[0][k]; cur.w = r.right - base.left - cur.x; }
          else { if (cur) words.push(cur); cur = { text: m[0][k], x: r.left - base.left, top: r.top - base.top, rt: r.top, h: r.height, w: r.width, ...style }; }
        }
        if (cur) words.push(cur);
      }
    }
  }
  const height = root.offsetHeight; host.innerHTML = '';
  return { words, height };
}

export const hayObjetos = (T: IDocumento) => Object.values(T.overlays).some((l) => l.length) || Object.values(T.ocr).some((o) => o && !o.baked);

// Devuelve los bytes del PDF con los objetos aplicados. commit: marca el OCR como ya horneado.
export async function hornear(T: IDocumento, commit: boolean): Promise<Uint8Array> {
  const { StandardFonts, rgb, degrees } = PDFLib();
  const doc = await cargarPdf(T.bytes!);
  const fontCache: Record<string, Promise<any>> = {};
  const font = async (fam: string, b: boolean, i: boolean) => { const { key, bytes } = await fontBytes(fam, b, i); if (!fontCache[key]) fontCache[key] = doc.embedFont(bytes, { subset: true }); return fontCache[key]; };
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < T.count; i++) {
    const list = T.overlays[i] || []; const ocr = T.ocr[i];
    if (!list.length && !(ocr && !ocr.baked)) continue;
    const page = doc.getPage(i), v = await vp1(T, i);
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    const P = (x: number, y: number) => v.convertToPdfPoint(x, y);
    const rect = (x: number, y: number, wd: number, h: number, color: number[]) => { const [bx, by] = P(x, y + h); page.drawRectangle({ x: bx, y: by, width: wd, height: h, color: rgb(color[0], color[1], color[2]), rotate: degrees(rot) }); };
    // 0) Lo que se tapa con «Tapar» también se borra del archivo (no queda texto oculto debajo). Va antes de dibujar nada.
    const wo = list.filter((o) => o.type === 'whiteout').map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
    if (wo.length) { try { await removeTextInRects(doc, i, wo, (x, y) => v.convertToViewportPoint(x, y), { pad: 0 }); } catch (e) { console.warn(e); } }
    // 1) Capa de texto invisible del OCR (hace la página buscable y seleccionable)
    if (ocr && !ocr.baked) {
      const covered = [...list.filter((o) => o.cover).map((o) => o.cover!), ...wo];
      for (const wd of ocr.words) {
        const cx = wd.x + wd.w / 2, cy = wd.y + wd.h / 2;
        if (covered.some((c) => cx > c.x && cx < c.x + c.w && cy > c.y && cy < c.y + c.h)) continue;
        let t = ''; for (const ch of wd.text) { try { helv.encodeText(ch); t += ch; } catch { t += '?'; } }
        const w1 = helv.widthOfTextAtSize(t, 1); if (!w1) continue;
        const size = clamp(wd.w / w1, 2, wd.h * 2.5);
        const [tx, ty] = P(wd.x, wd.base);
        page.drawText(t, { x: tx, y: ty, size, font: helv, opacity: 0, rotate: degrees(rot) });
      }
      if (commit) ocr.baked = true;
    }
    // 2) Objetos
    for (const o of list) {
      if (o.type === 'whiteout') rect(o.x, o.y, o.w, o.h, o.bg || [1, 1, 1]);
      if (o.type === 'image') {
        const img = o.mime === 'image/jpeg' ? await doc.embedJpg(o.bytes) : await doc.embedPng(o.bytes);
        const [bx, by] = P(o.x, o.y + o.h); page.drawImage(img, { x: bx, y: by, width: o.w, height: o.h, rotate: degrees(rot) });
      }
      if (o.type === 'rich') {
        const lay = await layoutRich(o);
        if (o.cover && !o.transparent) { rect(o.cover.x - 0.5, o.cover.y - 0.5, o.cover.w + 1, o.cover.h + 1, o.bg!); rect(o.x - 0.5, o.y - 0.5, o.w + 1, Math.max(lay.height, 1) + 1, o.bg!); }
        for (const wd of lay.words) {
          const f = await font(wd.family, wd.bold, wd.italic); const m = await fontMetrics(wd.family, wd.bold, wd.italic);
          const baseline = wd.top + wd.h * (m.asc / (m.asc + m.desc));
          const [tx, ty] = P(o.x + wd.x, o.y + baseline);
          const [r, g, b, a] = wd.color;
          page.drawText(wd.text, { x: tx, y: ty, size: wd.size, font: f, color: rgb(r, g, b), opacity: a, rotate: degrees(rot) });
          if (wd.underline) {
            const uy = o.y + baseline + wd.size * 0.12, th = Math.max(0.4, wd.size * 0.06);
            const [ux, uy2] = P(o.x + wd.x, uy + th); page.drawRectangle({ x: ux, y: uy2, width: wd.w, height: th, color: rgb(r, g, b), rotate: degrees(rot) });
          }
        }
      }
    }
  }
  return guardarPdf(doc);
}
