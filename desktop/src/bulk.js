// Carga masiva: cola de documentos que se suben y analizan de a pocos (Portalfirma procesa uno por uno).
// · Revisa cada archivo en el computador (formato, peso, duplicados) y convierte Word a PDF.
// · Sube y detecta firmantes con 2 documentos a la vez; si Portalfirma responde con errores, se frena sola.
// · Enviar a firmar es un paso aparte, con una sola confirmación, y de a uno (descuenta saldo).
// · La cola se guarda en disco: si se cierra la app, sigue donde quedó.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const store = require('./store');

const CONCURRENCY = 2;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_TRIES = 3;
let pf = null; let toPdf = null; let emit = () => {}; let onSent = () => {};
let items = []; let paused = false; let active = 0; let coolUntil = 0; let failStreak = 0; let sending = false; let cancelSend = false;

function init(client, { asPdf, onUpdate, sent }) {
  pf = client; toPdf = asPdf; emit = onUpdate; if (sent) onSent = sent;
  items = (store.get('bulkQueue') || []).map((it) => (['uploading', 'analyzing', 'converting'].includes(it.status) ? { ...it, status: 'queued' } : it.status === 'sending' ? { ...it, status: 'send_error', error: 'La app se cerró mientras se enviaba: revisa «Mis operaciones» antes de reintentar.' } : it));
  paused = !!store.get('bulkPaused');
  // lo omitido que quedó guardado de versiones anteriores también se puede reintentar
  for (const it of items) if (it.status === 'skipped' && it.forzable === undefined && (it.dupSent || /ya se envi|repetido|No se pudo leer/i.test(it.error || ''))) it.forzable = true;
}
let saveT = null;
const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => store.set('bulkQueue', items.map(({ b64, ...x }) => x)), 300); };
let emitT = null;
const changed = () => { persist(); clearTimeout(emitT); emitT = setTimeout(() => emit(state()), 80); };
// Avance para la barra de «segundo plano»: cuántos documentos lleva el análisis en curso y el envío en curso
let anTot = 0; let anHechos = 0; let envTot = 0; let envHechos = 0; let envErr = 0;
const hayCola = () => active > 0 || items.some((x) => x.status === 'queued');
const contarAnalisis = (n, estabaOcioso) => { if (estabaOcioso) { anTot = 0; anHechos = 0; } anTot += n; };   // un lote nuevo parte de cero
const state = () => ({ items, paused, running: active, sending, coolUntil, progreso: { analisis: anTot ? { total: anTot, hechos: anHechos, activo: hayCola() } : null, envio: sending ? { total: envTot, hechos: envHechos, errores: envErr } : null } });
const uid = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Huellas (sha1) de los archivos ya enviados a firmar desde la carga masiva: para no enviar dos veces el mismo. Con la
// cuenta de Asset son de toda la corredora (colección envios_masivos, id = huella), así otro equipo tampoco lo repite;
// las que este equipo tenía guardadas se suben una vez. En modo de prueba quedan en el equipo (store › bulkSentHashes).
const enviadas = () => { const inmo = require('./inmo'); const l = inmo.API ? inmo.registros('envios_masivos') : null; return new Set([...(store.get('bulkSentHashes') || []), ...(l || []).map((x) => x.id)]); };
function anotarEnviada(hash, datos) {
  const inmo = require('./inmo'); const l = inmo.API ? inmo.registros('envios_masivos') : null;
  if (l && inmo.usuario()) { if (!l.some((x) => x.id === hash)) { l.push({ id: hash, ...datos }); inmo.guardar(); } return; }
  store.set('bulkSentHashes', [...new Set([...(store.get('bulkSentHashes') || []), hash])].slice(-2000));
}
require('./inmo').alCargar?.(async () => {
  const h = store.get('bulkSentHashes'); if (!Array.isArray(h) || !h.length) return null;
  const items = h.filter((x) => /^[\w-]{6,64}$/.test(x)).map((id) => ({ id, legado: true }));
  for (let i = 0; i < items.length; i += 200) await require('./asset').llamar('POST', '/registros/envios_masivos/importar', { items: items.slice(i, i + 200) });
  store.set('bulkSentHashes', undefined); return null;
});
const sha = (file) => new Promise((res, rej) => { const h = crypto.createHash('sha1'); fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });

async function add(paths) {
  const ocioso = !hayCola(); const antes = items.length;
  const known = new Set(items.map((x) => x.hash));
  const sent = enviadas();
  for (const entry of paths) {
    // Cada entrada es una ruta, o {path, signers, flow} cuando viene de un flujo documental (firmantes ya definidos)
    const p = typeof entry === 'string' ? entry : entry.path;
    const name = path.basename(p); const it = { id: uid(), path: p, name, status: 'queued', tries: 0, added: Date.now() };
    if (typeof entry === 'object' && entry) { if (Array.isArray(entry.signers)) it.preset = entry.signers; if (entry.flow) it.flow = entry.flow; }
    try {
      const st = fs.statSync(p);
      it.size = st.size;
      if (!/\.(pdf|docx)$/i.test(p)) Object.assign(it, { status: 'skipped', error: 'Formato no admitido: usa PDF o Word (.docx).' });
      else if (st.size > MAX_BYTES && /\.pdf$/i.test(p)) Object.assign(it, { status: 'skipped', error: 'Pesa más de 20 MB: ábrelo en el editor y usa «Comprimir PDF».' });
      else {
        it.hash = await sha(p);
        if (sent.has(it.hash)) Object.assign(it, { status: 'skipped', error: 'Este mismo archivo ya se envió a firmar.', dupSent: true, forzable: true });
        else if (known.has(it.hash)) Object.assign(it, { status: 'skipped', error: 'Está repetido en la lista.', forzable: true });
        known.add(it.hash);
      }
    } catch { Object.assign(it, { status: 'skipped', error: 'No se pudo leer el archivo.', forzable: true }); }
    items.push(it);
  }
  contarAnalisis(items.slice(antes).filter((x) => x.status === 'queued').length, ocioso);
  changed(); pump();
  return state();
}

const transient = (e) => /timeout|tard|ECONN|ENOTFOUND|fetch failed|socket|429|50\d|status code 5|rate|demasiad/i.test(String(e?.message || e));
function pump() {
  if (paused) return;
  const wait = coolUntil - Date.now();
  if (wait > 0) { setTimeout(pump, wait + 50); return; }
  while (active < CONCURRENCY) {
    const it = items.find((x) => x.status === 'queued' && (!x.retryAt || x.retryAt <= Date.now()));
    if (!it) { const next = items.filter((x) => x.status === 'queued' && x.retryAt).map((x) => x.retryAt).sort()[0]; if (next) setTimeout(pump, Math.max(200, next - Date.now())); break; }
    active++; work(it).finally(() => { active--; if (it.status !== 'queued') anHechos++; changed(); pump(); });
  }
}
let convertLock = Promise.resolve(); // las conversiones de Word van de a una (son pesadas)
async function work(it) {
  try {
    let file = it.path;
    if (/\.docx$/i.test(file)) {
      it.status = 'converting'; changed();
      const run = convertLock.then(() => toPdf(file)); convertLock = run.catch(() => {});
      file = (await run).path; it.pdfPath = file;
      if (fs.statSync(file).size > MAX_BYTES) throw Object.assign(new Error('Convertido a PDF pesa más de 20 MB.'), { final: true });
    }
    // el documento se lee aquí y por la IA de Asset (PDF normal o escaneado): no se sube a Portalfirma hasta enviarlo
    it.status = 'uploading'; changed();
    const bytes = await fs.promises.readFile(file); it.pdfPath = file;
    try { it.pages = (await require('pdf-lib').PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount(); } catch { it.pages = 0; }   // para ubicar las firmas si no lleva página aparte
    it.status = 'analyzing'; changed();
    const ext = await require('./envio-api').extraerFirmantes(bytes);
    it.typeDocument = ext?.tipoDocumento || ''; it.avisos = ext?.avisos || [];
    it.required = { name: true, email: true };   // la API de Portalfirma pide nombre y correo de cada firmante
    it.signers = (ext?.firmantes || []).map((s) => ({ fullName: s.nombre || '', rut: s.rut || '', email: s.email || '', phone: s.telefono || '', alias: s.rol || '', pagina: s.pagina || 0 }));
    it.analizado = true;
    if (it.preset?.length) it.signers = it.preset.map((s) => ({ ...s })); // el flujo ya sabe quién firma
    it.status = 'ready'; it.error = ''; failStreak = 0;
    validate(it);
  } catch (e) {
    it.tries++;
    if (e.code === 'NEEDS_PF_API') e.final = true;   // sin credenciales de la API no sirve reintentar
    if (!e.final && transient(e) && it.tries < MAX_TRIES) {
      it.status = 'queued'; it.retryAt = Date.now() + [2000, 6000, 15000][it.tries - 1]; it.error = 'Reintentando…';
      failStreak++; if (failStreak >= 3) { coolUntil = Date.now() + 30000; failStreak = 0; } // Portalfirma con problemas: pausa breve
    } else { it.status = 'error'; it.error = e.message || String(e); }
  }
}
// Datos que faltan para enviar. Portalfirma rechaza al enviar un rol genérico («cliente», «firmante»…): se pide el rol real antes.
const ROL_GENERICO = /^(cliente|firmante\s*\d*|firma|parte|persona|signer|signatario|usuario)$/i;
function validate(it) {
  const req = it.required || {}; const miss = [];
  if (!it.signers?.length) miss.push('sin firmantes');
  (it.signers || []).forEach((s, i) => {
    const f = []; if (!s.rut) f.push('RUT'); if (!s.alias) f.push('rol'); else if (ROL_GENERICO.test(s.alias.trim())) f.push('rol real (Portalfirma rechaza «' + s.alias.trim() + '»)');
    if (req.name && !s.fullName) f.push('nombre'); if (req.email && !s.email) f.push('correo'); if (req.phone && !s.phone) f.push('teléfono');
    if (f.length) miss.push(`firmante ${i + 1}: ${f.join(', ')}`);
  });
  it.missing = miss;
  if (it.status === 'ready' || it.status === 'needs_data') it.status = miss.length ? 'needs_data' : 'ready';
  return it;
}
const TIPOS = ['simple', 'avanzada', 'visada', 'enrolada'];
const limpiarFirmante = (s) => ({
  fullName: String(s.fullName || '').trim(), rut: String(s.rut || '').trim(), email: String(s.email || '').trim(), phone: String(s.phone || '').trim(), alias: String(s.alias || '').trim(),
  ...(TIPOS.includes(s.typeSign) ? { typeSign: s.typeSign } : {}), ...(s.pagina ? { pagina: Number(s.pagina) || 0 } : {}),
});
// dónde va la firma de cada firmante: donde se ubicó, o si no, en la hoja donde está su línea (o la última), de a dos por fila
function posicionesDe(it) {
  const ult = it.pages || 1;
  if (Array.isArray(it.posiciones) && it.posiciones.length === it.signers.length) return it.posiciones.map((p) => ({ ...p }));
  return it.signers.map((s, i) => ({ pagina: Math.min(Math.max(1, s.pagina || ult), ult), x: 60 + (i % 2) * 250, y: 70 + Math.floor(i / 2) * 110 }));
}
function update(id, patch) {
  const it = items.find((x) => x.id === id); if (!it) return state();
  if (patch.signers) { const antes = it.signers?.length; it.signers = patch.signers.map(limpiarFirmante); if (antes !== it.signers.length) it.posiciones = null; }   // otra cantidad de firmantes: las firmas ubicadas ya no sirven
  if (patch.posiciones !== undefined) it.posiciones = Array.isArray(patch.posiciones) ? patch.posiciones.filter((p) => p && p.pagina >= 1 && Number.isFinite(+p.x) && Number.isFinite(+p.y)).map((p) => ({ pagina: Math.round(p.pagina), x: Math.round(p.x), y: Math.round(p.y) })) : null;
  if (patch.selected !== undefined) it.selected = !!patch.selected;
  if (patch.tramite !== undefined) it.tramite = ['none', 'legalization', 'protocolization'].includes(patch.tramite) ? patch.tramite : 'none';
  if (patch.paginaExtra !== undefined) it.paginaExtra = !!patch.paginaExtra;
  validate(it); changed(); return state();
}
function applySigners(signers) {
  for (const it of items) if (['ready', 'needs_data'].includes(it.status)) { it.signers = signers.map((s) => ({ ...s })); validate(it); }
  changed(); return state();
}
// «Sincronizar PDF»: la configuración de un documento (firmantes, tipo de firma, página de firmas y trámite) pasa a todos los demás que aún no se envían
function sync(fromId) {
  const src = items.find((x) => x.id === fromId); if (!src?.signers?.length) throw new Error('Ese documento todavía no tiene firmantes.');
  let n = 0;
  for (const it of items) {
    if (it === src || !['ready', 'needs_data'].includes(it.status)) continue;
    it.signers = src.signers.map((s) => ({ ...s })); it.tramite = src.tramite; it.paginaExtra = src.paginaExtra;
    // las firmas van en la misma hoja y lugar que en el documento de origen (si no se habían movido, donde las ve el usuario ahí)
    it.posiciones = posicionesDe(src).map((p) => ({ ...p, pagina: Math.min(p.pagina, it.pages || p.pagina) }));
    it.syncRev = (it.syncRev || 0) + 1;   // la pantalla vuelve a armar su PDF con estas firmas
    validate(it); n++;
  }
  changed(); return { ...state(), sincronizados: n };
}
// «Analizar» de un documento: se lee de nuevo (se pierden los firmantes que se habían editado)
function reanalyze(id) { const it = items.find((x) => x.id === id); if (it && ['ready', 'needs_data', 'error'].includes(it.status)) { contarAnalisis(1, !hayCola()); it.status = 'queued'; it.tries = 0; it.retryAt = 0; it.error = ''; it.signers = []; it.missing = []; it.posiciones = null; } changed(); pump(); return state(); }
// «Reintentar» un documento omitido: si era por repetido, por ya enviado o porque no se pudo leer, se carga de todos modos
async function force(id) {
  const it = items.find((x) => x.id === id);
  if (it && it.status === 'skipped' && it.forzable) {
    try { it.size = fs.statSync(it.path).size; if (!it.hash) it.hash = await sha(it.path); }   // si no se pudo leer, se vuelve a intentar
    catch { it.error = 'No se pudo leer el archivo.'; changed(); return state(); }
    contarAnalisis(1, !hayCola()); Object.assign(it, { status: 'queued', error: '', dupSent: false, forzable: false, tries: 0, retryAt: 0 });
  }
  changed(); pump(); return state();
}
function retry(id) { const ocioso = !hayCola(); for (const it of items) if ((id ? it.id === id : true) && it.status === 'error') { contarAnalisis(1, ocioso && anTot === anHechos); it.status = 'queued'; it.tries = 0; it.retryAt = 0; it.error = ''; } changed(); pump(); return state(); }
function remove(id) { items = items.filter((x) => x.id !== id || ['uploading', 'analyzing', 'converting', 'sending'].includes(x.status)); changed(); return state(); }
function clear(which) {
  const keep = (x) => ['uploading', 'analyzing', 'converting', 'sending'].includes(x.status);
  items = items.filter((x) => keep(x) || (which === 'done' ? x.status !== 'sent' && x.status !== 'skipped' : false)); changed(); return state();
}
function pause(v) { paused = !!v; store.set('bulkPaused', paused); changed(); if (!paused) pump(); return state(); }

// Envío: de a uno, nunca se reintenta solo (para no duplicar operaciones ni cobros)
async function send(ids, { protocolization = 'none', typeSign = 'simple' } = {}) {
  if (sending) throw new Error('Ya hay un envío en curso.');
  const list = items.filter((x) => ids.includes(x.id) && x.status === 'ready');
  if (!list.length) throw new Error('No hay documentos listos para enviar.');
  sending = true; cancelSend = false; envTot = list.length; envHechos = 0; envErr = 0; changed();
  const history = store.get('history') || [];
  try {
    for (const it of list) {
      if (cancelSend) break;
      it.status = 'sending'; changed();
      try {
        const bytes = await fs.promises.readFile(it.pdfPath || it.path);
        // las firmas van donde se ubicaron; si no se ubicaron, en la hoja donde está la línea de cada una (o la última), de a dos por fila.
        // Con «página para las firmas» no llevan lugar: la agrega Portalfirma
        const paginaExtra = it.paginaExtra === true;
        const posiciones = paginaExtra ? null : posicionesDe(it);
        const r = await require('./envio-api').enviarPdf({ bytes, nombre: it.name, tramite: it.tramite || protocolization, posiciones, paginaExtra: false, firmantes: it.signers.map((s) => ({ rut: s.rut, nombre: s.fullName, email: s.email, telefono: s.phone, alias: s.alias, tipoFirma: s.typeSign || typeSign })) });
        const op = r.operation ?? null;
        if (op == null) throw new Error('Portalfirma no devolvió el número de operación. Revisa «Mis operaciones» antes de reintentar, para no duplicarla.');
        it.status = 'sent'; it.operation = op; it.error = '';
        if (it.hash) anotarEnviada(it.hash, { operacion: op, nombre: it.name, fecha: new Date().toISOString() });
        // «Mis operaciones»: con la cuenta de Asset va a la base (firmas); en modo de prueba, al historial local
        { const inmo = require('./inmo'); if (inmo.API) inmo.registrarEnvio({ operation: op, name: it.name, origen: 'masiva', bulk: true }); else history.unshift({ operation: op, name: it.name, date: new Date().toISOString(), bulk: true }); }
        try { onSent(it); } catch {}
      } catch (e) { it.status = 'send_error'; it.error = e.message || String(e); envErr++; }
      envHechos++;
      if (!require('./inmo').API) store.set('history', history.slice(0, 500));
      changed();
    }
  } finally { sending = false; changed(); }
  return state();
}
function stopSend() { cancelSend = true; return state(); }
// Un envío con error queda para revisar; se puede volver a «listo» a mano (después de revisar Mis operaciones)
function rearm(id) { const it = items.find((x) => x.id === id); if (it && it.status === 'send_error') { it.status = 'ready'; validate(it); } changed(); return state(); }

module.exports = { init, state, add, update, applySigners, sync, reanalyze, force, retry, remove, clear, pause, send, stopSend, rearm };
