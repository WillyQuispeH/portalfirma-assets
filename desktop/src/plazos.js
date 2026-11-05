// Plazos y vencimientos: documentos del usuario con sus fechas clave (término, aviso, reajuste).
// Los archivos se copian a una carpeta de la app; el análisis (hecho con IA en la ventana) se guarda aquí.
// Al abrir la app y una vez al día se avisa con una notificación si algo vence pronto.
// Con la cuenta de Asset, la lista vive en la base (colección «plazos», de cada usuario) y cada PDF en R2 (it.clave);
// en este equipo queda una copia (it.file) que se baja cuando falta. Lo de antes se sube una vez al iniciar sesión.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const { app, Notification } = require('electron');
const store = require('./store');

let toPdf = null; let onOpen = () => {};
const dir = () => { const d = path.join(app.getPath('userData'), 'plazos'); fs.mkdirSync(d, { recursive: true }); return d; };
let inmoMod = null; const inmo = () => (inmoMod ||= require('./inmo'));
const enApi = () => inmo().API;
const all = () => (enApi() ? inmo().registros('plazos') : store.get('plazos') || []);
// con la API la lista es la copia sincronizada: se cambia en el lugar y guardar() encola lo que cambió
const save = (l) => { if (!enApi()) return store.set('plazos', l); const r = inmo().registros('plazos'); if (l !== r) r.splice(0, r.length, ...l); inmo().guardar(); };
const copia = (it) => path.join(dir(), it.id + '.pdf');
// lo que este equipo tenía (store › plazos) se sube una vez: los PDF a R2 y la lista a la base
inmo().alCargar(async () => {
  if (!enApi() || store.get('plazosSubidos')) return null;
  const l = store.get('plazos') || []; if (!l.length) { store.set('plazosSubidos', new Date().toISOString()); return null; }
  const items = [];
  for (const it of l) {
    const x = { ...it };
    try { if (it.file && fs.existsSync(it.file)) x.clave = await inmo().subirArchivoRegistro('plazos', it.id, it.name || 'documento.pdf', fs.readFileSync(it.file), 'application/pdf'); } catch (e) { console.warn('[plazos] PDF sin subir:', it.name, e.message); }
    items.push(x);
  }
  for (let i = 0; i < items.length; i += 200) await require('./asset').llamar('POST', '/registros/plazos/importar', { items: items.slice(i, i + 200) });
  store.set('plazosSubidos', new Date().toISOString());
  return `Se ${l.length === 1 ? 'subió 1 documento' : `subieron ${l.length} documentos`} de Plazos que estaban solo en este computador.`;
});
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function init({ asPdf, open }) { toPdf = asPdf; onOpen = open; setTimeout(notify, 8000); setInterval(notify, 24 * 3600 * 1000); }

async function add(paths) {
  const list = all(); const known = new Set(list.map((x) => x.hash)); const added = []; const skipped = [];
  for (const p of paths) {
    try {
      if (!/\.(pdf|docx)$/i.test(p)) { skipped.push(`${path.basename(p)}: usa PDF o Word`); continue; }
      let file = p; if (/\.docx$/i.test(p)) file = (await toPdf(p)).path;
      const buf = fs.readFileSync(file); const hash = crypto.createHash('sha1').update(buf).digest('hex');
      if (known.has(hash)) { skipped.push(`${path.basename(p)}: ya está en la lista`); continue; }
      const id = uid(); const dst = path.join(dir(), id + '.pdf'); fs.writeFileSync(dst, buf);
      const it = { id, name: path.basename(p).replace(/\.docx$/i, '.pdf'), file: dst, hash, added: new Date().toISOString(), status: 'pending' };
      if (enApi()) it.clave = await inmo().subirArchivoRegistro('plazos', id, it.name, buf, 'application/pdf');
      list.push(it); known.add(hash); added.push(it);
    } catch (e) { skipped.push(`${path.basename(p)}: ${e.message}`); }
  }
  save(list); return { items: list, added: added.length, skipped };
}
function update(id, patch) {
  const list = all(); const it = list.find((x) => x.id === id); if (!it) return list;
  Object.assign(it, patch); save(list); return list;
}
function remove(id) {
  const list = all(); const it = list.find((x) => x.id === id);
  if (it) try { fs.unlinkSync(it.file || copia(it)); } catch {}
  if (it?.clave && enApi()) inmo().borrarArchivosRegistro('plazos', id, [it.clave]);
  save(list.filter((x) => x.id !== id)); return all();
}
// el PDF: la copia de este equipo o, si no está (lo agregó en otro equipo), se baja de R2
async function bytes(id) {
  const it = all().find((x) => x.id === id); if (!it) throw new Error('Documento no encontrado.');
  const f = it.file && fs.existsSync(it.file) ? it.file : copia(it);
  if (!fs.existsSync(f)) { if (!it.clave || !enApi()) throw new Error('El archivo ya no está en este computador.'); await inmo().bajarArchivoRegistro('plazos', id, it.clave, it.name, f); }
  return new Uint8Array(fs.readFileSync(f));
}

// Evento de calendario (.ics) para la fecha clave
function ics(id) {
  const it = all().find((x) => x.id === id); if (!it?.deadline) throw new Error('Este documento no tiene una fecha clave.');
  const d = it.deadline.replace(/-/g, ''); const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const esc = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const alarm = 'BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Recordatorio\r\nTRIGGER:-P7D\r\nEND:VALARM\r\n';
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Portalfirma//Studio//ES\r\nBEGIN:VEVENT\r\nUID:${it.id}@portalfirma-studio\r\nDTSTAMP:${stamp}\r\nDTSTART;VALUE=DATE:${d}\r\nSUMMARY:${esc(`${it.deadlineLabel || 'Vence'}: ${it.name.replace(/\.pdf$/i, '')}`)}\r\nDESCRIPTION:${esc(it.summary || '')}\r\n${alarm}END:VEVENT\r\nEND:VCALENDAR\r\n`;
}

function notify() {
  try {
    const now = Date.now(); const soon = all().filter((x) => x.deadline && !x.dismissed && (new Date(x.deadline) - now) / 86400000 <= 30);
    if (!soon.length || !Notification.isSupported()) return;
    const n = new Notification({ title: 'PortalFirma Asset · Plazos', body: soon.length === 1 ? `«${soon[0].name.replace(/\.pdf$/i, '')}»: ${soon[0].deadlineLabel || 'vence'} el ${new Date(soon[0].deadline + 'T12:00:00').toLocaleDateString('es-CL')}.` : `${soon.length} documentos tienen una fecha clave en los próximos 30 días.` });
    n.on('click', () => onOpen()); n.show();
  } catch {}
}

module.exports = { init, list: all, add, update, remove, bytes, ics };
