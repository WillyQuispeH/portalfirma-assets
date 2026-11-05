// Expedientes: una carpeta por caso (una propiedad, un cliente, un trámite) con todos sus documentos
// (contratos, cédulas, fotos, escrituras…) y el historial de lo que se hizo con ellos.
// Cada expediente vive en el computador (Documentos/Expedientes PortalFirma) o en Google Drive
// (carpeta «Expedientes PortalFirma» que crea la app). La app guarda solo la lista y el historial.
// Con la cuenta de Asset, la lista y el historial viven en la base (colección «expedientes», de cada usuario) y los
// expedientes nuevos «en este computador» se guardan en Asset (storage 'asset': archivos en R2, e.archivos con su
// clave; al abrirlos se baja una copia a .cache). Los de Google Drive siguen en Drive. Lo de antes se sube una vez:
// los archivos de cada carpeta local a R2 (la carpeta queda como estaba) y la lista a la base.
const fs = require('fs'); const path = require('path');
const { app, shell } = require('electron');
const store = require('./store');
const gdrive = require('./gdrive');

const ROOT_NAME = 'Expedientes PortalFirma';
const TYPES = ['propiedad', 'persona', 'empresa', 'tramite', 'otro'];
const uid = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const safe = (n) => String(n || 'Expediente').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Expediente';
let inmoMod = null; const inmo = () => (inmoMod ||= require('./inmo'));
const enApi = () => inmo().API;
const all = () => (enApi() ? inmo().registros('expedientes') : store.get('expedientes') || []);
// con la API la lista es la copia sincronizada: se cambia en el lugar y guardar() encola lo que cambió
const save = (l) => { if (!enApi()) return store.set('expedientes', l); const r = inmo().registros('expedientes'); if (l !== r) r.splice(0, r.length, ...l); inmo().guardar(); };
const enAsset = (e) => e.storage === 'asset';
const cacheDir = (e) => { const d = path.join(localRoot(), '.cache', e.id); fs.mkdirSync(d, { recursive: true }); return d; };
async function subirArchivo(e, name, buf) {
  const clave = await inmo().subirArchivoRegistro('expedientes', e.id, name, buf, mimeOf(name));
  (e.archivos ||= []).unshift({ id: clave, name, size: buf.length, modified: new Date().toISOString(), mime: mimeOf(name) });
}
// lo que este equipo tenía (store › expedientes) se sube una vez
inmo().alCargar(async () => {
  if (!enApi() || store.get('expedientesSubidos')) return null;
  const l = store.get('expedientes') || []; if (!l.length) { store.set('expedientesSubidos', new Date().toISOString()); return null; }
  let archivos = 0;
  for (const e of l) {
    if (e.storage !== 'local' || !e.path || !fs.existsSync(e.path)) continue;
    const x = { ...e, storage: 'asset', archivos: [], carpetaOriginal: e.path };
    for (const f of fs.readdirSync(e.path).filter((n) => !n.startsWith('.') && !n.startsWith('~$'))) {
      const fp = path.join(e.path, f); const st = fs.statSync(fp); if (!st.isFile() || st.size > 50 * 1024 * 1024) continue;
      try { await subirArchivo(x, f, fs.readFileSync(fp)); archivos++; } catch (err) { console.warn('[expedientes] archivo sin subir:', f, err.message); }
    }
    Object.assign(e, x); delete e.path;
  }
  for (let i = 0; i < l.length; i += 200) await require('./asset').llamar('POST', '/registros/expedientes/importar', { items: l.slice(i, i + 200) });
  store.set('expedientesSubidos', new Date().toISOString());
  return `Se ${l.length === 1 ? 'subió 1 expediente' : `subieron ${l.length} expedientes`}${archivos ? ` (${archivos} ${archivos === 1 ? 'archivo' : 'archivos'})` : ''} que estaban solo en este computador.`;
});
const get = (id) => { const e = all().find((x) => x.id === id); if (!e) throw new Error('El expediente ya no existe.'); return e; };
const localRoot = () => { const d = process.env.PF_EXP_DIR || path.join(app.getPath('documents'), ROOT_NAME); fs.mkdirSync(d, { recursive: true }); return d; };
const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp', txt: 'text/plain' };
const mimeOf = (n) => MIME[String(n).split('.').pop().toLowerCase()] || 'application/octet-stream';

function list() { return all().map(summary); }
const summary = (e) => ({ ...e, history: undefined, last: e.history?.[0] || null, count: e.count ?? null });

function log(id, entry) {
  const l = all(); const e = l.find((x) => x.id === id); if (!e) return null;
  e.history = [{ at: new Date().toISOString(), ...entry }, ...(e.history || [])].slice(0, 500); e.updated = new Date().toISOString();
  save(l); return e;
}

async function create({ name, type = 'otro', storage = 'local', notes = '' }) {
  name = safe(name); if (!TYPES.includes(type)) type = 'otro';
  const e = { id: uid(), name, type, storage: storage === 'drive' ? 'drive' : enApi() ? 'asset' : 'local', notes: String(notes || '').slice(0, 500), created: new Date().toISOString(), updated: new Date().toISOString(), history: [] };
  if (enAsset(e)) e.archivos = [];
  else if (e.storage === 'local') {
    let dir = path.join(localRoot(), name); let n = 2; while (fs.existsSync(dir)) dir = path.join(localRoot(), `${name} (${n++})`);
    fs.mkdirSync(dir, { recursive: true }); e.path = dir;
  } else {
    let root = store.get('expDriveRoot');
    if (!root) { root = (await gdrive.createFolder(ROOT_NAME)).id; store.set('expDriveRoot', root); }
    let f; try { f = await gdrive.createFolder(name, root); } catch (err) {
      if (!/not ?found|404/i.test(err.message)) throw err; // la carpeta raíz se borró en Drive: se crea otra
      root = (await gdrive.createFolder(ROOT_NAME)).id; store.set('expDriveRoot', root); f = await gdrive.createFolder(name, root);
    }
    e.driveId = f.id;
  }
  e.history.push({ at: e.created, kind: 'created', text: `Expediente creado ${e.storage === 'drive' ? 'en Google Drive' : enAsset(e) ? 'en Asset' : 'en este computador'}` });
  const l = all(); l.unshift(e); save(l); return summary(e);
}
function update(id, patch) {
  const l = all(); const e = l.find((x) => x.id === id); if (!e) throw new Error('El expediente ya no existe.');
  if (patch.type && TYPES.includes(patch.type)) e.type = patch.type;
  if (patch.notes !== undefined) e.notes = String(patch.notes).slice(0, 500);
  if (patch.name) e.name = safe(patch.name); // el nombre de la carpeta no se cambia (podría estar abierta)
  e.updated = new Date().toISOString(); save(l); return summary(e);
}
// Quitar de la lista no borra la carpeta ni sus archivos
function remove(id) { const e = all().find((x) => x.id === id); if (e && enAsset(e) && e.archivos?.length) inmo().borrarArchivosRegistro('expedientes', id, e.archivos.map((f) => f.id)); save(all().filter((x) => x.id !== id)); return list(); }
const history = (id) => get(id).history || [];

async function files(id) {
  const e = get(id); let out;
  if (enAsset(e)) out = (e.archivos || []).map((f) => ({ ...f }));
  else if (e.storage === 'local') {
    if (!fs.existsSync(e.path)) throw new Error('No encuentro la carpeta del expediente en este computador (¿se movió o se borró?).');
    out = fs.readdirSync(e.path).filter((f) => !f.startsWith('.') && !f.startsWith('~$')).map((f) => { const p = path.join(e.path, f); const st = fs.statSync(p); return st.isFile() ? { id: f, name: f, size: st.size, modified: st.mtime.toISOString(), path: p } : null; }).filter(Boolean);
  } else {
    out = (await gdrive.children(e.driveId)).map((f) => ({ id: f.id, name: f.name, size: Number(f.size) || 0, modified: f.modifiedTime, mime: f.mimeType }));
  }
  out.sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
  const l = all(); const x = l.find((y) => y.id === id); if (x && x.count !== out.length) { x.count = out.length; save(l); }
  return out;
}
const uniqueName = (taken, name) => { const ext = path.extname(name); const base = name.slice(0, name.length - ext.length); let n = name; let i = 2; while (taken.has(n.toLowerCase())) n = `${base} (${i++})${ext}`; taken.add(n.toLowerCase()); return n; };
async function addFiles(id, paths, { note } = {}) {
  const e = get(id); const taken = new Set((await files(id)).map((f) => f.name.toLowerCase())); const added = []; const skipped = [];
  for (const p of paths) {
    try {
      const st = fs.statSync(p); if (!st.isFile()) { skipped.push(`${path.basename(p)}: no es un archivo`); continue; }
      if (st.size > 50 * 1024 * 1024) { skipped.push(`${path.basename(p)}: pesa más de 50 MB`); continue; }
      const name = uniqueName(taken, path.basename(p));
      if (enAsset(e)) await subirArchivo(e, name, fs.readFileSync(p));
      else if (e.storage === 'local') fs.copyFileSync(p, path.join(e.path, name));
      else await gdrive.upload(e.driveId, name, fs.readFileSync(p), mimeOf(name));
      added.push(name);
    } catch (err) { skipped.push(`${path.basename(p)}: ${err.message}`); }
  }
  if (added.length) log(id, { kind: 'added', text: note || (added.length === 1 ? `Se agregó «${added[0]}»` : `Se agregaron ${added.length} archivos`), files: added });
  return { added, skipped };
}
async function addBytes(id, name, bytes, { note } = {}) {
  const e = get(id); const taken = new Set((await files(id)).map((f) => f.name.toLowerCase())); const n = uniqueName(taken, safe(name));
  if (enAsset(e)) await subirArchivo(e, n, Buffer.from(bytes));
  else if (e.storage === 'local') fs.writeFileSync(path.join(e.path, n), Buffer.from(bytes));
  else await gdrive.upload(e.driveId, n, Buffer.from(bytes), mimeOf(n));
  log(id, { kind: 'added', text: note || `Se guardó «${n}»`, files: [n] });
  return n;
}
// Ruta local para usar el archivo en la app (de Drive se descarga una copia temporal)
async function localPath(id, fileId) {
  const e = get(id);
  if (enAsset(e)) {
    const f = (e.archivos || []).find((x) => x.id === fileId); if (!f) throw new Error('El archivo ya no está en el expediente.');
    const p = path.join(cacheDir(e), path.basename(f.name)); try { if (fs.statSync(p).size === f.size) return p; } catch {}
    return inmo().bajarArchivoRegistro('expedientes', e.id, f.id, f.name, p);
  }
  if (e.storage === 'local') { const p = path.join(e.path, path.basename(fileId)); if (!fs.existsSync(p)) throw new Error('El archivo ya no está en la carpeta.'); return p; }
  const f = (await gdrive.children(e.driveId)).find((x) => x.id === fileId);
  return gdrive.downloadAny(fileId, f?.name);
}
async function removeFile(id, fileId) {
  const e = get(id);
  let name = path.basename(fileId);
  if (enAsset(e)) {
    const f = (e.archivos || []).find((x) => x.id === fileId); name = f?.name || 'archivo';
    e.archivos = (e.archivos || []).filter((x) => x.id !== fileId); inmo().borrarArchivosRegistro('expedientes', e.id, [fileId]);
    try { fs.rmSync(path.join(cacheDir(e), path.basename(name)), { force: true }); } catch {}
  } else if (e.storage === 'local') { const p = path.join(e.path, name); await shell.trashItem(p).catch(() => fs.unlinkSync(p)); }
  else { name = (await gdrive.children(e.driveId)).find((x) => x.id === fileId)?.name || 'archivo'; await gdrive.trash(fileId); }
  log(id, { kind: 'removed', text: `Se envió a la papelera «${name}»` });
  return true;
}
async function reveal(id) {
  const e = get(id);
  // en Asset: se baja una copia de todo para verlo en el explorador
  if (enAsset(e)) { for (const f of e.archivos || []) await localPath(id, f.id); const r = await shell.openPath(cacheDir(e)); if (r) throw new Error(r); return true; }
  if (e.storage === 'local') { const r = await shell.openPath(e.path); if (r) throw new Error(r); return true; }
  const u = gdrive.folderUrl(e.driveId); if (/^https:/.test(u)) await shell.openExternal(u); else await shell.openPath(u);
  return true;
}

module.exports = { list, create, update, remove, history, files, addFiles, addBytes, localPath, removeFile, reveal, log, TYPES };
