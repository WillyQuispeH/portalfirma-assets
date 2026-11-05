// Reglas de las plantillas con campos (sin pantalla): formato de cada tipo de dato (RUT, fecha, monto en palabras…),
// adivinar el tipo al marcar un campo y marcar o reemplazar los campos dentro del HTML de un párrafo.
// La plantilla es un PDF normal con la definición incrustada como archivo adjunto (TPL_FILE).
/* eslint-disable @typescript-eslint/no-explicit-any -- documento de pdf.js */
import type { ICampo, IPlantillaArchivo, TTipoCampo } from '../../store/interfaces/editor.interface';

export const TPL_FILE = 'portalfirma-plantilla.json';
export const FIELD_TYPES: Record<TTipoCampo, string> = { texto: 'Texto', rut: 'RUT', fecha: 'Fecha', monto: 'Monto en pesos', numero: 'Número', email: 'Correo', telefono: 'Teléfono', opcion: 'Lista de opciones', parrafo: 'Texto largo' };
export const SIGNER_ATTRS: Record<string, string> = { fullName: 'Nombre', rut: 'RUT', email: 'Correo', phone: 'Teléfono' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MAX_SHRINK = 0.5; // puntos que se puede achicar la letra para que un dato quepa

// ---------- números en palabras (español de Chile) ----------
const UNI = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DEC = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CEN = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function menorMil(n: number) {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100), r = n % 100;
  let s = CEN[c];
  if (r) s += (s ? ' ' : '') + (r < 30 ? UNI[r] : DEC[Math.floor(r / 10)] + (r % 10 ? ' y ' + UNI[r % 10] : ''));
  return s;
}
// apócope: «uno» → «un» delante de mil, millón o de un sustantivo; «veintiuno» → «veintiún»
const apocope = (s: string) => s.replace(/veintiuno$/, 'veintiún').replace(/(^|\s)uno$/, '$1un');
export function numeroALetras(n: number | string, { apoc = false } = {}) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'cero';
  const parts: string[] = [];
  const millones = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000;
  if (millones) {
    if (millones >= 1000) { const milM = Math.floor(millones / 1000), m2 = millones % 1000; parts.push((milM === 1 ? 'mil' : apocope(menorMil(milM)) + ' mil') + (m2 ? ' ' + apocope(menorMil(m2)) : '') + ' millones'); }
    else parts.push(millones === 1 ? 'un millón' : apocope(menorMil(millones)) + ' millones');
  }
  if (miles) parts.push(miles === 1 ? 'mil' : apocope(menorMil(miles)) + ' mil');
  if (resto) parts.push(apoc ? apocope(menorMil(resto)) : menorMil(resto));
  return parts.join(' ');
}
export function montoEnPalabras(n: number | string) {
  n = Math.floor(Math.abs(Number(n) || 0));
  const w = numeroALetras(n, { apoc: true });
  const exactMillon = n >= 1e6 && n % 1e6 === 0;
  return `${w}${exactMillon ? ' de' : ''} ${n === 1 ? 'peso' : 'pesos'}`;
}
const miles = (n: number) => Math.floor(Math.abs(Number(n) || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ---------- RUT ----------
export function rutDv(body: string) { let s = 0, m = 2; for (let i = body.length - 1; i >= 0; i--) { s += Number(body[i]) * m; m = m === 7 ? 2 : m + 1; } const r = 11 - (s % 11); return r === 11 ? '0' : r === 10 ? 'K' : String(r); }
function fmtRutTpl(v: string) {
  const c = String(v || '').replace(/[^0-9kK]/g, '').toUpperCase(); if (c.length < 2) return { text: v, error: 'RUT incompleto' };
  const body = c.slice(0, -1), dv = c.slice(-1);
  const text = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
  return rutDv(body) === dv ? { text } : { text, error: 'RUT inválido (dígito verificador)' };
}

// ---------- formato de cada campo ----------
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y|E)\b/g, (w) => w.toLowerCase());
export interface IValorCampo { text: string; error?: string | null; empty?: boolean }
export function formatField(f: ICampo, raw: unknown): IValorCampo {
  const v = raw == null ? '' : String(raw).trim();
  if (!v) return { text: '', empty: true, error: f.required ? 'Obligatorio' : null };
  const o = f.format || {};
  switch (f.type) {
    case 'rut': return fmtRutTpl(v);
    case 'fecha': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (!m) return { text: v, error: 'Fecha inválida' };
      const [, y, mo, d] = m;
      if (o.date === 'corto') return { text: `${d}-${mo}-${y}` };
      if (o.date === 'barra') return { text: `${d}/${mo}/${y}` };
      return { text: `${Number(d)} de ${MESES[Number(mo) - 1]} de ${y}` };
    }
    case 'monto': {
      const n = Number(v.replace(/[^\d]/g, '')); if (!v.replace(/[^\d]/g, '')) return { text: v, error: 'Escribe solo números' };
      const cifra = (o.symbol === false ? '' : '$') + miles(n);
      return { text: o.words === 'solo' ? montoEnPalabras(n) : o.words ? `${cifra} (${montoEnPalabras(n)})` : cifra };
    }
    case 'numero': {
      const n = Number(v.replace(/[^\d]/g, '')); if (!/\d/.test(v)) return { text: v, error: 'Escribe un número' };
      return { text: o.words === 'solo' ? numeroALetras(n) : o.words ? `${numeroALetras(n)} (${miles(n)})` : miles(n) };
    }
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { text: v.toLowerCase() } : { text: v, error: 'Correo inválido' };
    case 'telefono': {
      let d = v.replace(/\D/g, ''); if (d.length === 9 && d[0] === '9') d = '56' + d;
      if (d.length < 8) return { text: v, error: 'Teléfono incompleto' };
      return { text: d.length === 11 && d.startsWith('569') ? `+56 9 ${d.slice(3, 7)} ${d.slice(7)}` : '+' + d };
    }
    default: {
      let t = v;
      if (o.case === 'upper') t = t.toUpperCase(); else if (o.case === 'title') t = titleCase(t);
      return { text: t };
    }
  }
}
// Al convertir una selección en campo se adivina el tipo
export function guessField(text: string): Pick<ICampo, 'type' | 'label' | 'format'> {
  const t = text.trim();
  if (/^\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]$/.test(t)) return { type: 'rut', label: 'RUT' };
  if (/^\d{1,2} de [a-záéíóú]+ de \d{4}$/i.test(t) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(t)) return { type: 'fecha', label: 'Fecha', format: { date: /de/.test(t) ? 'largo' : t.includes('/') ? 'barra' : 'corto' } };
  if (/^\$\s?[\d.]+/.test(t)) return { type: 'monto', label: 'Monto', format: { words: /\(/.test(t) } };
  if (/^[^\s@]+@[^\s@]+$/.test(t)) return { type: 'email', label: 'Correo' };
  if (/^\+?[\d\s]{8,}$/.test(t)) return { type: 'telefono', label: 'Teléfono' };
  if (/^\d+$/.test(t)) return { type: 'numero', label: 'Número' };
  const upper = t === t.toUpperCase() && /\p{L}/u.test(t);
  return { type: t.length > 80 ? 'parrafo' : 'texto', label: t.length <= 28 ? titleCase(t) : 'Texto', format: { case: upper ? 'upper' : 'normal' } };
}

// ---------- campos dentro del HTML ----------
export const fieldsIn = (html?: string) => [...String(html || '').matchAll(/data-field="([^"]+)"/g)].map((m) => m[1]);
let fieldSeq = 0;
export const newFieldId = () => 'f' + Date.now().toString(36) + (++fieldSeq);

// Envuelve en un campo cada aparición de `text` en el html (fuera de otros campos). Devuelve el html y cuántas.
export function wrapText(html: string, text: string, fid: string) {
  const d = document.createElement('div'); d.innerHTML = html; let n = 0;
  const lower = text.toLowerCase();
  const walk = (node: Node) => {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === 1) { if (!(ch as HTMLElement).classList.contains('pf-field')) walk(ch); continue; }
      if (ch.nodeType !== 3) continue;
      let t = (ch as Text).data, k = t.toLowerCase().indexOf(lower);
      if (k < 0) continue;
      const frag = document.createDocumentFragment();
      while (k >= 0) {
        if (k) frag.append(t.slice(0, k));
        const sp = document.createElement('span'); sp.className = 'pf-field'; sp.dataset.field = fid; sp.contentEditable = 'false'; sp.textContent = t.slice(k, k + text.length); frag.append(sp); n++;
        t = t.slice(k + text.length); k = t.toLowerCase().indexOf(lower);
      }
      if (t) frag.append(t);
      (ch as ChildNode).replaceWith(frag);
    }
  };
  walk(d);
  return { html: n ? d.innerHTML : html, n };
}
// Quita un campo del html (queda el texto)
export function quitarCampo(html: string, id: string) {
  const d = document.createElement('div'); d.innerHTML = html;
  d.querySelectorAll(`.pf-field[data-field="${id}"]`).forEach((sp) => sp.replaceWith(document.createTextNode(sp.textContent || '')));
  return d.innerHTML;
}
// Reemplaza los campos por sus valores (final: sin marcas para el documento generado)
export function substitute(html: string, fields: ICampo[], values: Record<string, string>, status: Record<string, { overflow: boolean }>, final: boolean) {
  const d = document.createElement('div'); d.innerHTML = html;
  d.querySelectorAll<HTMLElement>('.pf-field').forEach((sp) => {
    const f = fields.find((x) => x.id === sp.dataset.field); if (!f) return;
    const r = formatField(f, values[f.id]);
    sp.textContent = r.text || (final ? '' : `[${f.label}]`);
    sp.classList.toggle('pf-empty', !r.text);
    if (['rut', 'telefono', 'email', 'numero'].includes(f.type)) sp.classList.add('pf-nowrap'); // un RUT no se corta entre líneas
    sp.classList.toggle('pf-bad', !final && !!status[f.id]?.overflow);
    if (final) sp.removeAttribute('contenteditable');
  });
  return d.innerHTML;
}
// El texto visible del html sin los campos ni los saltos
export const textoSinCampos = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('.pf-field').forEach((x) => x.remove()); return d.textContent || ''; };

// La definición incrustada en un PDF (si es una plantilla)
export async function readTemplate(pdfDoc: any): Promise<IPlantillaArchivo | null> {
  try {
    const at = await pdfDoc.getAttachments(); if (!at) return null;
    const a: any = Object.values(at).find((x: any) => x.filename === TPL_FILE) || at[TPL_FILE];
    if (!a) return null;
    const t = JSON.parse(new TextDecoder().decode(a.content));
    return t && Array.isArray(t.fields) && Array.isArray(t.blocks) ? t : null;
  } catch { return null; }
}

// Los firmantes que salen de los valores del formulario (al enviar a firmar)
export function firmantesDe(fields: ICampo[], values: Record<string, string>) {
  const by = new Map<string, Record<string, string>>();
  for (const f of fields) {
    if (!f.signer) continue; const r = formatField(f, values[f.id]); if (!r.text) continue;
    const s = by.get(f.signer.role) || { alias: f.signer.role, fullName: '', rut: '', email: '', phone: '' };
    s[f.signer.attr] = f.signer.attr === 'phone' ? r.text.replace(/\s/g, '') : r.text; by.set(f.signer.role, s);
  }
  return [...by.values()];
}
