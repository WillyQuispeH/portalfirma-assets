/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
// Lectura del chat EXPORTADO desde WhatsApp («Exportar chat», .txt o .zip con fotos y audios): port de desktop/src/leads.js
// (parsear, nombreDelChat, leerExportacion). Se reconoce por su formato (fecha, hora, nombre: mensaje), no por lo que diga el texto.
//   iOS:     [16/10/26, 12:24:05] Nombre: texto          (adjuntos: \u200e<adjunto: 00000012-PHOTO-….jpg>)
//   Android: 16/10/26, 12:24 - Nombre: texto             (adjuntos: IMG-20261016-WA0003.jpg (archivo adjunto))
// También en inglés, con a. m./p. m. o AM/PM, y años de 2 o 4 cifras. Sin librerías: el .zip se lee con zlib.
import { inflateRawSync } from 'zlib';
import { createHash } from 'crypto';

const HORA = String.raw`(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?|AM|PM)?`;
const RE_IOS = new RegExp(String.raw`^\[${HORA}\]\s+(.*)$`, 'i');
const RE_AND = new RegExp(String.raw`^${HORA}\s+[-–]\s+(.*)$`, 'i');
const RE_ADJ_IOS = /<(?:adjunto|attached|archivo adjunto|anexo):\s*([^>]+)>/i;
const RE_ADJ_AND = /^(.+?\.[a-z0-9]{2,5})\s+\((?:archivo adjunto|file attached|arquivo anexado)\)/i;
const RE_OMITIDO = /^<?(multimedia omitido|media omitted|imagen omitida|image omitted|audio omitido|audio omitted|video omitido|video omitted|sticker omitido|sticker omitted|documento omitido|document omitted|gif omitido|gif omitted)>?$/i;
const RE_SISTEMA = /cifrados de extremo a extremo|end-to-end encrypted|creó el grupo|created group|te añadió|added you|cambió el asunto|changed the subject|cambió su número|changed their phone|mensajes temporales|disappearing messages|security code changed|código de seguridad/i;
const tipoArchivo = (f: string) =>
  /\.(jpe?g|png|webp|heic|gif)$/i.test(f) ? 'imagen' : /\.(opus|ogg|m4a|mp3|aac|amr|wav)$/i.test(f) ? 'audio' : /\.(mp4|mov|3gp)$/i.test(f) ? 'video' : /\.vcf$/i.test(f) ? 'contacto' : 'documento';

export interface MensajeChat {
  fecha: string;
  autor: string | null;
  texto: string;
  tipo: string;
  archivo?: string;
  omitido?: string;
  /** de quién: lo pone importar (cliente | broker) */
  de?: string;
  k?: string;
}
export interface ChatLeido {
  estilo: 'ios' | 'android' | null;
  mensajes: MensajeChat[];
  participantes: { nombre: string; n: number }[];
  chatCon: string | null;
}

export function nombreDelChat(nombreArchivo: string): string | null {
  const b = String(nombreArchivo || '')
    .split(/[\\/]/)
    .pop()!
    .replace(/\.(zip|txt)$/i, '')
    .replace(/\s*\(\d+\)$/, '');
  const m = b.match(/^(?:Chat de WhatsApp con|Chat de WhatsApp -|WhatsApp Chat with|WhatsApp Chat -|Conversa do WhatsApp com)\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** el texto de un chat exportado → mensajes y participantes; null si no es un chat exportado de WhatsApp */
export function parsear(texto: string, nombreArchivo = ''): ChatLeido | null {
  const lineas = String(texto || '').replace(/^\ufeff/, '').replace(/[  ]/g, ' ').replace(/\r\n?/g, '\n').split('\n');
  const crudos: { p: string[]; resto: string }[] = [];
  let estilo: 'ios' | 'android' | null = null;
  for (const l0 of lineas) {
    const l = l0.replace(/^[\u200e\u200f]+/, '');
    const m = RE_IOS.exec(l) || RE_AND.exec(l);
    if (m) {
      estilo ||= RE_IOS.test(l) ? 'ios' : 'android';
      crudos.push({ p: m.slice(1, 8), resto: m[8] });
    } else if (crudos.length) crudos[crudos.length - 1].resto += '\n' + l0;
  }
  if (crudos.length < 2) return null; // no es un chat exportado de WhatsApp
  // ¿día/mes o mes/día? si algún «segundo número» pasa de 12, el orden es mes/día
  const mesDia = crudos.some((c) => Number(c.p[1]) > 12) && !crudos.some((c) => Number(c.p[0]) > 12);
  const mensajes: MensajeChat[] = [];
  const cuenta = new Map<string, number>();
  for (const c of crudos) {
    const [a, b, y0, h0, mi, s, ap] = c.p;
    const d = mesDia ? b : a;
    const mo = mesDia ? a : b;
    const y = Number(y0) < 100 ? 2000 + Number(y0) : Number(y0);
    let h = Number(h0);
    if (ap) {
      const pm = /^p/i.test(ap);
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    const fecha = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${mi}:${String(s || '00').padStart(2, '0')}`;
    const i = c.resto.indexOf(': ');
    if (i <= 0 || i > 60) {
      mensajes.push({ fecha, autor: null, texto: c.resto.trim(), tipo: 'sistema' });
      continue;
    }
    const autor = c.resto.slice(0, i).replace(/^[\u200e\u200f~\s]+/, '').trim();
    let tx = c.resto.slice(i + 2).replace(/^[\u200e\u200f]+/, '');
    if (RE_SISTEMA.test(tx) && mensajes.length < 3) {
      mensajes.push({ fecha, autor: null, texto: tx.trim(), tipo: 'sistema' });
      continue;
    }
    const m: MensajeChat = { fecha, autor, texto: '', tipo: 'texto' };
    const adj = RE_ADJ_IOS.exec(tx) || RE_ADJ_AND.exec(tx.trim());
    if (adj) {
      m.archivo = adj[1].trim();
      m.tipo = tipoArchivo(m.archivo);
      tx = tx.replace(adj[0], '').replace(/^[\u200e\s]+/, '');
    } else if (RE_OMITIDO.test(tx.trim())) {
      m.tipo = 'omitido';
      m.omitido = tx.trim().replace(/[<>]/g, '');
      tx = '';
    }
    m.texto = tx.replace(/[\u200e\u200f]/g, '').trim();
    mensajes.push(m);
    cuenta.set(autor, (cuenta.get(autor) || 0) + 1);
  }
  const participantes = [...cuenta.entries()].map(([nombre, n]) => ({ nombre, n })).sort((x, y) => y.n - x.n);
  return { estilo, mensajes, participantes, chatCon: nombreDelChat(nombreArchivo) };
}

/** la clave de un mensaje: así volver a importar el mismo chat agrega solo lo nuevo */
export const claveMensaje = (m: Pick<MensajeChat, 'fecha' | 'autor' | 'texto' | 'archivo'>) =>
  createHash('sha1').update(`${m.fecha}|${m.autor}|${m.texto.slice(0, 200)}|${m.archivo || ''}`).digest('hex').slice(0, 16);

// ---------------------------------------------------------------------------------------------- .zip mínimo
export interface EntradaZip {
  nombre: string;
  bytes: () => Buffer;
}
/** las entradas de un .zip (sin zip64 ni cifrado: así los entrega WhatsApp). Lanza si el archivo está dañado. */
export function leerZip(buf: Buffer): EntradaZip[] {
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  if (fin < 0) throw new Error('El .zip está dañado.');
  const total = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const out: EntradaZip[] = [];
  for (let k = 0; k < total; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('El .zip está dañado.');
    const metodo = buf.readUInt16LE(p + 10);
    const comp = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28);
    const el = buf.readUInt16LE(p + 30);
    const cl = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString('utf8', p + 46, p + 46 + nl);
    p += 46 + nl + el + cl;
    if (nombre.endsWith('/')) continue;
    out.push({
      nombre,
      bytes: () => {
        const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const datos = buf.subarray(ini, ini + comp);
        if (metodo === 0) return Buffer.from(datos);
        if (metodo === 8) return inflateRawSync(datos);
        throw new Error('El .zip usa una compresión no admitida.');
      },
    });
  }
  return out;
}

export interface Exportacion {
  texto: string;
  nombre: string;
  /** fotos, audios… que vinieron en el .zip, por su nombre de archivo */
  medios: Map<string, () => Buffer>;
}
/** un archivo (txt o zip) → su texto, nombre y medios */
export function leerExportacion(bytes: Buffer, nombre: string): Exportacion {
  if (!bytes?.length) throw new Error('El archivo está vacío.');
  const esZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!esZip) return { texto: bytes.toString('utf8'), nombre: nombre || 'chat.txt', medios: new Map() };
  const archivos = leerZip(bytes).filter((f) => !/(^|\/)(__MACOSX|\.)/.test(f.nombre));
  const txt = archivos.find((f) => /(^|\/)_chat\.txt$/i.test(f.nombre)) || archivos.find((f) => /\.txt$/i.test(f.nombre));
  if (!txt) throw new Error('El .zip no trae una conversación de WhatsApp (falta el archivo .txt).');
  const medios = new Map<string, () => Buffer>();
  for (const f of archivos) if (f !== txt && f.nombre.split('/').pop()!.length < 120) medios.set(f.nombre.split('/').pop()!, f.bytes);
  const nombreTxt = txt.nombre.split('/').pop()!;
  return { texto: txt.bytes().toString('utf8'), nombre: nombreDelChat(nombreTxt) ? nombreTxt : nombre || nombreTxt, medios };
}

/** ¿este adjunto parece un chat exportado? (por su nombre; el contenido se confirma al leerlo) */
export const pareceChat = (nombre: string, mime: string) => /\.(txt|zip)$/i.test(nombre) || /^(text\/plain|application\/zip|application\/x-zip)/i.test(mime);
