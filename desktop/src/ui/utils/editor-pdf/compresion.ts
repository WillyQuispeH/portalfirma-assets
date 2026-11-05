// Comprimir: recodifica las imágenes grandes del PDF como JPEG (no toca texto ni vectores).
/* eslint-disable @typescript-eslint/no-explicit-any -- estructuras internas de pdf-lib */
import { PDFLib, cargarPdf, guardarPdf } from './comun';

// Devuelve los bytes nuevos y cuántas imágenes cambiaron
export async function comprimirImagenes(bytes: Uint8Array): Promise<{ bytes: Uint8Array; changed: number }> {
  const { PDFRawStream, PDFName } = PDFLib();
  const doc = await cargarPdf(bytes); let changed = 0;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = (obj as any).dict; if (d.get(PDFName.of('Subtype'))?.toString() !== '/Image') continue;
    if (d.get(PDFName.of('ImageMask'))?.toString() === 'true' || Number(d.get(PDFName.of('BitsPerComponent'))?.toString()) !== 8) continue;
    const cs = d.get(PDFName.of('ColorSpace'))?.toString() || '';
    const W = Number(d.get(PDFName.of('Width'))?.toString()), H = Number(d.get(PDFName.of('Height'))?.toString());
    const contents: Uint8Array = (obj as any).contents;
    if (!W || !H || contents.length < 150000) continue;
    let bmp: ImageBitmap | null = null;
    const filters = filterList(d.get(PDFName.of('Filter'))); const parms = d.get(PDFName.of('DecodeParms'));
    try {
      const last = filters[filters.length - 1];
      if (last === 'DCTDecode') {
        if (/CMYK/.test(cs)) continue;
        const data = await decodeChain(contents, filters.slice(0, -1), null);
        bmp = await createImageBitmap(new Blob([data as BlobPart], { type: 'image/jpeg' }));
      } else if ((cs === '/DeviceRGB' || cs === '/DeviceGray') && filters.every((f) => ['FlateDecode', 'ASCII85Decode', 'ASCIIHexDecode'].includes(f))) {
        const comps = cs === '/DeviceRGB' ? 3 : 1;
        const raw = await decodeChain(contents, filters, parms, { comps, width: W });
        if (raw.length < W * H * comps) continue;
        const id = new ImageData(W, H);
        for (let p = 0, q = 0; p < W * H; p++, q += comps) { const r = raw[q]; id.data[p * 4] = r; id.data[p * 4 + 1] = comps === 3 ? raw[q + 1] : r; id.data[p * 4 + 2] = comps === 3 ? raw[q + 2] : r; id.data[p * 4 + 3] = 255; }
        bmp = await createImageBitmap(id);
      }
    } catch (e) { console.warn('compress skip', e); bmp = null; }
    if (!bmp) continue;
    const s = Math.min(1, 2200 / Math.max(W, H)); const wd = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
    const c = Object.assign(document.createElement('canvas'), { width: wd, height: h }); const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, wd, h); g.drawImage(bmp, 0, 0, wd, h);
    const jpg = new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.72))).arrayBuffer());
    if (jpg.length >= contents.length * 0.9) continue;
    // El canvas siempre exporta JPEG en RGB.
    const nd = doc.context.obj({ Type: 'XObject', Subtype: 'Image', Width: wd, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode', Length: jpg.length });
    const sm = d.get(PDFName.of('SMask')); if (sm) nd.set(PDFName.of('SMask'), sm);
    doc.context.assign(ref, PDFRawStream.of(nd, jpg)); changed++;
  }
  return { bytes: await guardarPdf(doc), changed };
}

// Decodificación de streams PDF para recomprimir imágenes.
function filterList(f: any): string[] {
  if (!f) return [];
  if (f instanceof PDFLib().PDFArray) return f.asArray().map((x: any) => x.toString().replace('/', ''));
  return [f.toString().replace('/', '')];
}
async function inflate(bytes: Uint8Array) { return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()); }
function ascii85(bytes: Uint8Array) {
  const out: number[] = []; let tuple = 0, n = 0;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0x7e) break; // ~>
    if (c <= 32) continue;
    if (c === 0x7a && n === 0) { out.push(0, 0, 0, 0); continue; } // z
    tuple = tuple * 85 + (c - 33); n++;
    if (n === 5) { out.push((tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255); tuple = 0; n = 0; }
  }
  if (n) { for (let k = n; k < 5; k++) tuple = tuple * 85 + 84; for (let k = 0; k < n - 1; k++) out.push((tuple >>> (24 - 8 * k)) & 255); }
  return new Uint8Array(out);
}
function asciiHex(bytes: Uint8Array) { const t = new TextDecoder().decode(bytes).replace(/[^0-9a-f]/gi, ''); const o = new Uint8Array(Math.ceil(t.length / 2)); for (let i = 0; i < o.length; i++) o[i] = parseInt((t.substr(i * 2, 2) + '0').slice(0, 2), 16); return o; }
function paeth(a: number, b: number, c: number) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
async function decodeChain(bytes: Uint8Array, filters: string[], parms: any, img?: { comps: number; width: number }) {
  const { PDFArray, PDFName } = PDFLib();
  let data = bytes;
  const pl = parms instanceof PDFArray ? parms.asArray() : filters.map(() => parms);
  for (let k = 0; k < filters.length; k++) {
    const f = filters[k];
    if (f === 'ASCII85Decode') data = ascii85(data);
    else if (f === 'ASCIIHexDecode') data = asciiHex(data);
    else if (f === 'FlateDecode') {
      data = await inflate(data);
      const pr = pl[k]; const pred = pr?.get?.(PDFName.of('Predictor')); const predictor = pred ? Number(pred.toString()) : 1;
      if (predictor >= 10) {
        const colors = Number(pr.get(PDFName.of('Colors'))?.toString() || img?.comps || 1), columns = Number(pr.get(PDFName.of('Columns'))?.toString() || img?.width || 1);
        data = unPredictPaeth(data, colors, columns);
      } else if (predictor === 2) throw new Error('predictor TIFF no soportado');
    } else throw new Error('filtro no soportado: ' + f);
  }
  return data;
}
function unPredictPaeth(data: Uint8Array, bpp: number, columns: number) {
  const row = bpp * columns, rows = Math.floor(data.length / (row + 1)), out = new Uint8Array(rows * row);
  let prevOff = -1;
  for (let r = 0, i = 0; r < rows; r++) {
    const type = data[i++], o = r * row;
    for (let x = 0; x < row; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0, b = prevOff >= 0 ? out[prevOff + x] : 0, c = x >= bpp && prevOff >= 0 ? out[prevOff + x - bpp] : 0, v = data[i++];
      out[o + x] = (type === 1 ? v + a : type === 2 ? v + b : type === 3 ? v + ((a + b) >> 1) : type === 4 ? v + paeth(a, b, c) : v) & 255;
    }
    prevOff = o;
  }
  return out;
}
