// 0.16.21 · Historial de Instagram: lectura del archivo que entrega Instagram en «Descargar tu información».
// El dueño de la cuenta lo pide en Instagram (Centro de cuentas › Tu información y permisos › Descargar tu información),
// elige solo «Mensajes» en formato JSON y sube el .zip a Asset. No hay conexión con Instagram: Asset solo lee el archivo.
//  · Estructura: [your_instagram_activity/]messages/{inbox,message_requests}/<usuario_id>/message_N.json
//    { participants:[{name}], messages:[{sender_name, timestamp_ms, content, photos:[{uri}], audio_files, videos, share:{link}}], title }
//  · Instagram escribe el texto como UTF-8 leído como latin-1 («Ã±» en vez de «ñ»): se corrige al leer.
'use strict';
const path = require('path');

const err = (m, code) => Object.assign(new Error(m), code ? { code } : {});
// «Ã±» → «ñ», «ð\u009f\u0098\u0080» → 😀 (solo si el texto es mojibake: todos los caracteres caben en un byte)
function arreglar(s) {
  const t = String(s ?? ''); if (!t || /[^\u0000-ÿ]/.test(t) || !/[\u0080-ÿ]/.test(t)) return t;
  const u = Buffer.from(t, 'latin1').toString('utf8'); return u.includes('�') ? t : u;
}
const TZ = () => process.env.PF_TZ || 'America/Santiago';
function fechaLocal(ms) {
  const o = {}; for (const p of new Intl.DateTimeFormat('en-CA', { timeZone: TZ(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(Number(ms)))) o[p.type] = p.value;
  return `${o.year}-${o.month}-${o.day}T${o.hour === '24' ? '00' : o.hour}:${o.minute}:${o.second}`;
}
// texto automático de Instagram que no aporta (reacciones, «te envió un archivo adjunto», etc.)
const RE_AUTO = /^(reacted .+ to your message|reaccionó .+ a tu mensaje|liked a message|le gustó un mensaje|.+ sent an attachment\.?|.+ envió un archivo adjunto\.?|you sent an attachment\.?|enviaste un archivo adjunto\.?)$/i;
const RE_HILO = /(^|\/)messages\/(inbox|message_requests)\/([^/]+)\/message_\d+\.json$/i;

async function abrirZip({ ruta, bytes }) {
  if (ruta) bytes = require('fs').readFileSync(ruta);
  if (!bytes || !bytes.length) throw err('El archivo está vacío.');
  const buf = Buffer.from(bytes); if (!(buf[0] === 0x50 && buf[1] === 0x4b)) return null;
  const JSZip = require('jszip'); return JSZip.loadAsync(buf);
}
// ¿es una descarga de Instagram? (por su estructura, no por el nombre del archivo)
function esInstagram(z) {
  const n = Object.keys(z.files);
  if (n.some((f) => RE_HILO.test(f))) return 'json';
  if (n.some((f) => /(^|\/)messages\/(inbox|message_requests)\/[^/]+\/message_\d+\.html$/i.test(f))) return 'html';
  return null;
}

// lee todas las conversaciones del .zip
async function leer(z) {
  const hilos = new Map();
  for (const [nombre, f] of Object.entries(z.files)) {
    const m = RE_HILO.exec(nombre); if (!m || f.dir) continue;
    let j; try { j = JSON.parse(await f.async('string')); } catch { continue; }
    const id = m[3]; const h = hilos.get(id) || { id, carpeta: m[2], base: nombre.slice(0, nombre.lastIndexOf('/') + 1), raiz: nombre.slice(0, nombre.toLowerCase().indexOf('messages/')), titulo: '', participantes: [], crudos: [] };
    h.titulo ||= arreglar(j.title || ''); if (!h.participantes.length) h.participantes = (j.participants || []).map((p) => arreglar(p.name)).filter(Boolean);
    h.crudos.push(...(j.messages || [])); hilos.set(id, h);
  }
  if (!hilos.size) throw err('El archivo no trae mensajes de Instagram. Al pedir la descarga, marca «Mensajes» y el formato JSON.', 'NO_IG');
  // el dueño de la cuenta es quien aparece en (casi) todas las conversaciones
  const cuenta = new Map(); for (const h of hilos.values()) for (const p of new Set(h.participantes)) cuenta.set(p, (cuenta.get(p) || 0) + 1);
  const dueno = hilos.size > 1 ? [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
  const lista = [];
  for (const h of hilos.values()) {
    const mensajes = [];
    for (const x of h.crudos) {
      const autor = arreglar(x.sender_name || ''); if (!autor || !x.timestamp_ms) continue;
      const base = { fecha: fechaLocal(x.timestamp_ms), autor, texto: '', tipo: 'texto' };
      const txt = arreglar(x.content || '').trim(); const share = x.share?.link ? String(x.share.link) : '';
      const medios = [...(x.photos || []).map((p) => ['imagen', p.uri]), ...(x.audio_files || []).map((p) => ['audio', p.uri]), ...(x.videos || []).map((p) => ['video', p.uri]), ...(x.files || []).map((p) => ['documento', p.uri])];
      if (medios.length) medios.forEach(([tipo, uri], i) => mensajes.push({ ...base, tipo, uri: String(uri || ''), archivo: path.basename(String(uri || '')), texto: i === 0 && txt && !RE_AUTO.test(txt) ? txt : '' }));
      else if (txt || share) { if (RE_AUTO.test(txt) && !share) continue; mensajes.push({ ...base, texto: [txt && !RE_AUTO.test(txt) ? txt : '', share && !txt.includes(share) ? share : ''].filter(Boolean).join('\n') }); }
    }
    mensajes.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const otros = h.participantes.filter((p) => p !== dueno);
    const cliente = otros.length === 1 ? otros[0] : (h.titulo && h.titulo !== dueno ? h.titulo : otros[0] || h.titulo);
    const usuario = h.id.replace(/_\d{6,}$/, ''); // carpeta «juanperez_123456789» → usuario aproximado
    lista.push({ id: h.id, carpeta: h.carpeta, base: h.base, raiz: h.raiz, titulo: h.titulo, cliente, usuario, grupo: otros.length > 1, participantes: h.participantes, mensajes,
      delCliente: mensajes.filter((m) => m.autor !== dueno).length, desde: mensajes[0]?.fecha || null, hasta: mensajes.at(-1)?.fecha || null });
  }
  lista.sort((a, b) => String(b.hasta).localeCompare(String(a.hasta)));
  return { dueno, hilos: lista };
}
// el archivo de una foto o audio dentro del .zip (la ruta «uri» es relativa a la raíz de la descarga)
function archivoDe(z, h, uri) {
  if (!uri || /^https?:/i.test(uri)) return null;
  const u = uri.replace(/^\/+/, ''); return z.file(h.raiz + u) || z.file(u) || z.file(h.base + path.basename(u)) || Object.values(z.files).find((f) => !f.dir && f.name.endsWith('/' + path.basename(u))) || null;
}

module.exports = { arreglar, fechaLocal, abrirZip, esInstagram, leer, archivoDe };
