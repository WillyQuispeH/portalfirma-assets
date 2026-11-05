// Piezas comunes del editor PDF: las bibliotecas que index.html carga como scripts (pdf.js, pdf-lib, fontkit,
// Tesseract, el catálogo de fuentes) y utilidades de color, tamaño y texto.
// El bundle de React se carga antes que esos scripts: por eso se leen de window recién al usarlas.
/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js, pdf-lib, fontkit y Tesseract no tienen tipos en la app */

const w = () => window as any;
let workerListo = false;
export function pdfjs(): any {
  const p = w().pdfjsLib;
  if (p && !workerListo) { p.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; workerListo = true; }
  return p;
}
export const PDFLib = (): any => w().PDFLib;
export const fontkit = (): any => w().fontkit;
export const Tesseract = (): any => w().Tesseract;
// Catálogo de fuentes (fonts.js): equivalentes de Office, sin serifa, con serifa, monoespaciadas y manuscritas.
export interface IFamilia { key: string; label: string; cat: string; css: string; word?: string; match: RegExp | null; files: Record<string, string>; real: string[] }
export const FAMILIAS = (): Record<string, IFamilia> => w().PF_FONTS || {};
export const CATEGORIAS = (): Record<string, string> => w().PF_FONT_CATS || {};
export const icono = (nombre: string, tam = 16): string => (typeof w().icon === 'function' ? w().icon(nombre, tam) : '');

// Abre un PDF con pdf.js (con las fuentes estándar y los mapas de caracteres locales)
export const abrirConPdfjs = (bytes: Uint8Array, extra: object = {}) =>
  pdfjs().getDocument({ data: bytes.slice(), isEvalSupported: false, standardFontDataUrl: 'vendor/standard_fonts/', cMapUrl: 'vendor/cmaps/', cMapPacked: true, ...extra }).promise;
// pdf-lib (con fontkit para las fuentes TrueType)
export async function cargarPdf(bytes: Uint8Array): Promise<any> { const d = await PDFLib().PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); d.registerFontkit(fontkit()); return d; }
export async function guardarPdf(doc: any): Promise<Uint8Array> { return doc.save({ useObjectStreams: true, updateFieldAppearances: false }); }

export const MAX_ENVIO = 20 * 1024 * 1024; // Portalfirma acepta hasta 20 MB
export const A4: [number, number] = [595.28, 841.89];
export const CARTA: [number, number] = [612, 792];
export const OFICIO: [number, number] = [612, 936];

export const fmtMB = (n: number) => (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB';
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const hex = (c: number[]) => '#' + c.map((x) => clamp(Math.round(x * 255), 0, 255).toString(16).padStart(2, '0')).join('');
export const cssRgb = (s: string): number[] => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(s || ''); return m ? [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255, m[4] == null ? 1 : Number(m[4])] : [0, 0, 0, 1]; };
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
// Texto sin tildes y en minúsculas, con el mismo largo (para buscar y comparar)
export const normText = (s: string) => { let o = ''; for (let j = 0; j < s.length; j++) { const c = s[j]; const n = (c.normalize('NFD')[0] || c).toLowerCase(); o += n.length === 1 ? n : c; } return o; };
// Un página es «grande» (planos): se ajusta entera a la vista
export const esGrande = (v: { width: number; height: number }) => v.width * v.height > A4[0] * A4[1] * 3;
export const nombreBase = (nombre: string) => nombre.replace(/\.[^.]+$/, '');
export const nombreDeRuta = (ruta: string) => ruta.split(/[\\/]/).pop() || ruta;
