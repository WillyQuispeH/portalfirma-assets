// Fuentes del editor: los archivos TrueType del catálogo (para incrustar), sus métricas y el reconocimiento de la
// fuente de un PDF (la lleva a una de nuestras familias).
/* eslint-disable @typescript-eslint/no-explicit-any -- objetos de fuente de pdf.js */
import { FAMILIAS, fontkit, type IFamilia } from './comun';

// Para reconocer la fuente de un PDF: primero los nombres más específicos («Roboto Mono» antes que «Roboto»)
let matchers: IFamilia[] | null = null;
const MATCHERS = () => (matchers ||= Object.values(FAMILIAS()).filter((f) => f.match).sort((a, b) => b.match!.source.length - a.match!.source.length));
let css2fam: Record<string, string> | null = null;
// nombre CSS de la familia («pf sans») → clave del catálogo («sans»)
export const CSS2FAM = () => (css2fam ||= Object.fromEntries(Object.entries(FAMILIAS()).map(([k, v]) => [v.css.toLowerCase(), k])));
export const cssDe = (fam: string | undefined) => FAMILIAS()[fam || '']?.css || 'PF Sans';

// Fuentes TrueType embebibles (cacheadas por archivo)
const cacheBytes: Record<string, Promise<Uint8Array>> = {};
export async function fontBytes(fam: string, bold: boolean, italic: boolean) {
  const st = bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular';
  const F = FAMILIAS();
  const f = (F[fam] || F.sans).files[st].replace(/\.ttf$/, '');
  if (!cacheBytes[f]) cacheBytes[f] = fetch(`vendor/fonts/${f}.ttf`).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b));
  return { key: f, bytes: await cacheBytes[f] };
}
const cacheMetricas: Record<string, { asc: number; desc: number }> = {};
// ascent/descent relativos (hhea) para ubicar la línea base
export async function fontMetrics(fam: string, bold: boolean, italic: boolean) {
  const { key, bytes } = await fontBytes(fam, bold, italic);
  if (!cacheMetricas[key]) { const f = fontkit().create(bytes); cacheMetricas[key] = { asc: f.ascent / f.unitsPerEm, desc: -f.descent / f.unitsPerEm }; }
  return cacheMetricas[key];
}

// Reconoce la fuente de un PDF y la lleva a una de nuestras familias.
export function mapFont(rawName: string, fontObj?: any, style?: any) {
  const n = String(rawName || '').replace(/^[A-Z]{6}\+/, '');
  const l = n.toLowerCase();
  let family = 'sans';
  const compact = l.replace(/[\s_]/g, '');
  const hit = MATCHERS().find((f) => f.match!.test(l) || f.match!.test(compact));
  if (hit) family = hit.key;
  else if (/calibri|carlito/.test(l)) family = 'calibri';
  else if (/cambria|caladea/.test(l)) family = 'cambria';
  else if (/courier|mono|consol|lucidaconsole/.test(l)) family = 'mono';
  else if (/times|georgia|garamond|antiqua|palatino|bookman|century|serif(?!.*sans)|roman|minion|cmr\d|liberationserif/.test(l)) family = 'serif';
  else if (/arial|helvetica|verdana|tahoma|segoe|roboto|open ?sans|sans|liberationsans|calibri|gothic/.test(l)) family = 'sans';
  else if (fontObj?.isMonospace) family = 'mono';
  else if (fontObj?.isSerifFont || style?.fontFamily === 'serif') family = 'serif';
  const bold = /bold|black|heavy|semibold|demi|,b\b|-b\b/.test(l) || !!fontObj?.bold || !!fontObj?.black;
  const italic = /italic|oblique|,i\b|-it\b/.test(l) || !!fontObj?.italic;
  return { family, bold, italic, name: n || (style?.fontFamily || 'desconocida') };
}
