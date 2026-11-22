// Sincronización de «Mis operaciones» con Portalfirma, SOLO por la API de integración (credenciales de la corredora en Integraciones):
// todas las operaciones de la empresa con getAll o, mientras no esté habilitado, las del teléfono del usuario (getOperationsByPhone);
// el detalle (firmantes y versiones) se pide al abrir cada una. Guarda una copia local para abrir rápido. No usa el MCP ni la sesión
// personal de Portalfirma; sin credenciales de la API no lista nada (error NEEDS_PF_API).
const fs = require('fs'); const path = require('path'); const { app } = require('electron');
const store = require('./store');
// lo enviado desde Asset: con la cuenta de Asset sale de la base (firmas); en modo de prueba, del historial local
const historial = () => { const inmo = require('./inmo'); return inmo.API ? inmo.historialEnvios() : store.get('history') || []; };

const YEARS_BACK = 3;            // historia que se trae la primera vez
const PAGE = 100;                // máximo del conector por consulta
const DETAIL_TTL = 2 * 60 * 1000; // detalle de una operación en curso: se refresca a los 2 minutos
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

let running = null;
// (se conservan los parámetros por compatibilidad con main.js: ya no se usa ni el MCP ni la sesión personal de Portalfirma)
function init() {}

// la copia guardada solo vale si vino de la API de integración: lo que dejó otra fuente (MCP, sesión personal) no se muestra
const vacia = () => ({ items: {}, details: {}, lastSync: null, phone: '', mode: 'integracion' });
const cache = () => { const c = store.get('opsCache'); return c && c.mode === 'integracion' ? c : vacia(); };
const save = (c) => store.set('opsCache', c);

// Teléfono con el que se buscan las operaciones: el que el usuario escribió aquí o, si no, el de su cuenta de Asset
const telefonoCuenta = () => { try { return String(require('./inmo').usuario()?.telefono || '').replace(/\D/g, ''); } catch { return ''; } };
const telefono = () => store.get('syncPhone') || (telefonoCuenta().length >= 8 ? telefonoCuenta() : '');
// Con las credenciales de la API de integración de Portalfirma de la corredora (Integraciones), las operaciones se listan y se
// detallan por esa API (a través del servidor de Asset). null si no hay cuenta de Asset o credenciales.
async function porApi(metodo, ruta, cuerpo) {
  try {
    if (!require('./inmo').API) return process.env.PF_MOCK === '1' ? await require('./mock').integracion(metodo, ruta, cuerpo) : null;   // la demostración responde sola
    return await require('./asset').llamar(metodo, ruta, cuerpo);
  }
  catch (e) { if (e.code === 'NECESITA_CONEXION' || e.status === 409) return null; throw e; }
}
const SIN_API = 'Conecta la API de Portalfirma en Integraciones: el administrador ingresa la clave id, el customer_id, el correo y la contraseña de la empresa.';
async function requiereApi(metodo, ruta, cuerpo) {
  const r = await porApi(metodo, ruta, cuerpo);
  if (r == null) throw Object.assign(new Error(SIN_API), { code: 'NEEDS_PF_API' });
  return r;
}
// el detalle de la API de integración con la forma que usa «Mis operaciones»: `files` pasa de un objeto (original, firmado, legalizado…) a una lista
function detalleDeApi(d) {
  const f = d?.files; if (Array.isArray(f) || !f || typeof f !== 'object') return d;
  const nombre = { original: 'original ', legalized: 'legalizado ' };
  return { ...d, files: Object.entries(f).filter(([, v]) => v && v.name).map(([k, v]) => ({ fileName: (nombre[k] || '') + v.name, kind: k === 'protocolized' ? 'legalized' : k, id: v.id })), source: 'integracion' };
}
async function status() {
  const c = cache();
  let integracion = false; try { integracion = !!(await porApi('GET', '/portalfirma-api/conexion'))?.conectado; } catch { /* sin servidor: no conectada */ }
  // `corredora` se conserva con el mismo significado que antes (conectada por la corredora); `api` (sesión personal) ya no existe
  return { phone: telefono(), integracion, apiAvailable: true, api: false, corredora: integracion, account: '', lastSync: c.lastSync, count: Object.keys(c.items).length };
}
function setPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 8) throw new Error('Escribe el teléfono con el que te registraste en Portalfirma (ej. 9 8727 6858).');
  if (store.get('syncPhone') !== d) { store.set('syncPhone', d); save(vacia()); }
  return status();
}

// Lista un rango de fechas; si el rango tiene más de 100 operaciones, se parte en dos.
async function listRange(phone, start, end, depth = 0) {
  const r = await requiereApi('POST', '/portalfirma-api/operaciones', { phone, desde: iso(start), hasta: iso(end), limit: PAGE });
  const ops = r?.operations || [];
  if ((r?.totalInRange || 0) > ops.length && end - start > DAY && depth < 8) {
    const mid = start + Math.floor((end - start) / 2 / DAY) * DAY;
    return [...await listRange(phone, start, mid, depth + 1), ...await listRange(phone, mid + DAY, end, depth + 1)];
  }
  return ops;
}

// Con la API de integración de Portalfirma (getAll): TODAS las operaciones de la empresa, sin teléfono. getAll solo trae el proceso,
// la fecha y cuántos firman: el nombre, la etapa y quién firmó salen del detalle (getByOperation), que se pide de a pocos y queda en
// caché. Devuelve null si getAll todavía está en mantenimiento: ahí sigue el listado por teléfono (también por la API).
const GENERICO = /^(Operación \d+|Documento)$/;
async function integracionSync(full) {
  let c = cache();
  const now = Date.now(); const from = !full && c.lastSync ? new Date(c.lastSync).getTime() - 45 * DAY : now - YEARS_BACK * 365 * DAY;
  const vistas = new Set(); let completo = true;
  for (let end = now; end > from; end -= 366 * DAY) {
    const ini = Math.max(from, end - 365 * DAY);
    const r = await requiereApi('GET', `/portalfirma-api/operaciones?desde=${iso(ini)}&hasta=${iso(end)}`);
    if (!r.listo) return null;
    for (const o of r.filas || []) {
      const n = Number(o.operation); if (!n) continue; vistas.add(n);
      const prev = c.items[n];
      c.items[n] = { stage: 'process', name: `Operación ${n}`, ...prev, operation: n, contractId: o.contractId || prev?.contractId || '', created: o.creado || prev?.created || '', signersCount: o.firmantes };
    }
  }
  if (full) for (const n of Object.keys(c.items)) if (!vistas.has(Number(n)) && !c.items[n].local) { delete c.items[n]; delete c.details[n]; }
  // lo enviado desde esta app también aparece (aunque Portalfirma todavía no lo liste)
  for (const h of historial()) { const n = Number(String(h.operation ?? '').replace(/\D/g, '')); if (!n || c.items[n]) continue; c.items[n] = { operation: n, name: h.name || 'Documento', stage: 'process', created: h.date, updated: h.date, local: true }; }
  c.lastSync = new Date().toISOString(); save(c);
  // el detalle de las más recientes (y de las que siguen en curso): da nombre, etapa y firmas; el resto se pide al abrirlas
  const pend = Object.values(c.items).filter((it) => !it.local && (GENERICO.test(it.name || '') || !c.details[it.operation] || (c.details[it.operation].d.status !== 'finalized' && Date.now() - c.details[it.operation].t > DETAIL_TTL)))
    .sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 40);
  for (let i = 0; i < pend.length; i += 4) await Promise.all(pend.slice(i, i + 4).map((it) => detail(it.operation, { refresh: true }).catch(() => null)));
  return { ...list(), found: vistas.size };
}

// Sincroniza: la primera vez trae los últimos años; después, solo desde la última sincronización (con margen).
async function sync({ full = false } = {}) {
  if (running) return running;
  running = (async () => {
    const viaIntegracion = await integracionSync(full); if (viaIntegracion) return viaIntegracion;
    const phone = telefono(); if (!phone) { const e = new Error('Falta el teléfono de la cuenta.'); e.code = 'NO_PHONE'; throw e; }
    let c = cache(); if (c.phone && c.phone !== phone) c = vacia(); c.phone = phone; const now = Date.now();
    const from = !full && c.lastSync ? new Date(c.lastSync).getTime() - 45 * DAY : now - YEARS_BACK * 365 * DAY;
    const ranges = []; for (let end = now; end > from; end -= 366 * DAY) ranges.push([Math.max(from, end - 365 * DAY), end]);
    let found = 0;
    for (const [s, e] of ranges) {
      for (const o of await listRange(phone, s, e)) {
        if (o?.operation == null) continue; found++;
        const prev = c.items[o.operation];
        const item = { operation: Number(o.operation), contractId: o.contract_id || prev?.contractId || '', stage: o.stage || prev?.stage || '', name: o.document_name || prev?.name || 'Documento',
          created: o.createdAt || o.created_at || o.createdDateAt || prev?.created || '', updated: o.updatedAt || o.updated_at || o.updatedDateAt || prev?.updated || '' };
        if (prev && (prev.updated !== item.updated || prev.stage !== item.stage)) delete c.details[o.operation]; // cambió: el detalle se vuelve a pedir
        c.items[o.operation] = { ...prev, ...item };
      }
    }
    // los envíos hechos desde esta app también aparecen (aunque se hayan creado con otro teléfono)
    for (const h of historial()) {
      const n = Number(String(h.operation ?? '').replace(/\D/g, '')); if (!n || c.items[n]) continue;
      c.items[n] = { operation: n, name: h.name || 'Documento', stage: 'process', created: h.date, updated: h.date, local: true };
    }
    c.lastSync = new Date().toISOString(); save(c);
    return { ...list(), found };
  })();
  try { return await running; } finally { running = null; }
}

const apiSummary = (it) => (it.sig ? { status: it.stage === 'finalized' ? 'finalized' : it.stage, proc: it.legalized ? 'legalization' : undefined, signed: it.sig.filter((x) => x.signed).length, signers: it.sig.length } : {});

function list() {
  const c = cache();
  const hist = Object.fromEntries(historial().filter((h) => h && h.operation).map((h) => [Number(h.operation), h]));
  const base = { ...c.items }; for (const [n, h] of Object.entries(hist)) if (!base[n]) base[n] = { operation: Number(n), name: h.name || 'Documento', stage: 'process', created: h.date, updated: h.date, local: true };   // recién enviado desde Asset
  const items = Object.values(base).map((it) => { const h = hist[it.operation]; return { ...it, ...apiSummary(it), ...summary(c.details[it.operation]?.d), ...(h?.propId || h?.origen ? { asset: { propId: h.propId || null, negocioId: h.negocioId || null, origen: h.origen || null, firmantes: h.firmantes || [], tipoFirma: h.tipoFirma || null, tramite: h.tramite || null } } : {}) }; })
    .sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
  return { items, lastSync: c.lastSync, phone: telefono() };
}
// Resumen que se agrega a la lista cuando ya se conoce el detalle
function summary(d) {
  if (!d) return {};
  const sig = d.signatories || [];
  return { status: d.status, proc: d.protocolizationNumber || 'none', signed: sig.filter((s) => s.signed).length, signers: sig.length, closedUnsigned: d.status === 'finalized' && sig.length > 0 && !sig.every((s) => s.signed) };
}

// Etapas del documento (solo estado: el PDF se obtiene siempre del servicio oficial getById)
function versions(d) {
  const fin = d.status === 'finalized'; const proc = d.protocolizationNumber || 'none';
  const sig = d.signatories || []; const allSigned = fin && (!sig.length || sig.every((s) => s.signed));
  const has = (re) => (d.files || []).some((f) => re.test(f.fileName || ''));
  const steps = [{ key: 'original', label: 'Enviado', done: true }, { key: 'firmado', label: 'Firmado', done: allSigned }];
  if (proc === 'legalization') steps.push({ key: 'legalizado', label: 'Legalizado', done: allSigned && (has(/legaliz/i) || !!d.repertoireNumber) });
  if (proc === 'protocolization') steps.push({ key: 'protocolizado', label: 'Protocolizado', done: allSigned && (has(/protocol/i) || !!d.repertoireNumber) });
  return steps;
}

// el nombre del documento: el del archivo original que subió quien lo envió (sin «original », ni «.pdf»)
const nombreDe = (d) => String((d.files || []).find((f) => f.kind === 'original')?.fileName || '').replace(/^original /, '').replace(/\.pdf$/i, '') || '';
async function detail(op, { refresh = false } = {}) {
  const n = Number(op); const c = cache(); const hit = c.details[n];
  const fresh = hit && (hit.d.status === 'finalized' || Date.now() - hit.t < DETAIL_TTL);
  if (hit && fresh && !refresh) return { ...hit.d, versions: versions(hit.d), cached: true };
  const d = detalleDeApi(await requiereApi('GET', '/portalfirma-api/operacion/' + n));
  c.details[n] = { t: Date.now(), d };
  if (c.items[n]) Object.assign(c.items[n], { stage: d.status === 'finalized' || (d.source === 'integracion' && d.status) ? d.status : c.items[n].stage, updated: d.updatedDateAt || c.items[n].updated, ...(GENERICO.test(c.items[n].name || '') && nombreDe(d) ? { name: nombreDe(d) } : {}) });
  else c.items[n] = { operation: n, name: (d.files || []).find((f) => !/^(original|legaliz|protocol)/i.test(f.fileName))?.fileName || `Operación ${n}`, stage: d.status, created: d.createdDateAt, updated: d.updatedDateAt };
  save(c);
  return { ...d, versions: versions(d) };
}

// 0.16.25 · el seguimiento automático de firmas (Asset) trae el detalle de Portalfirma: se guarda aquí también, así
// «Mis operaciones» muestra al tiro quién firmó, sin esperar a que se abra la operación
function guardarDetalle(op, d) {
  const n = Number(op); if (!n || !d) return; const c = cache();
  c.details[n] = { t: Date.now(), d };
  if (c.items[n]) Object.assign(c.items[n], { stage: d.status === 'finalized' ? 'finalized' : c.items[n].stage, updated: d.updatedDateAt || c.items[n].updated,
    ...(c.items[n].sig && Array.isArray(d.signatories) && d.signatories.length ? { sig: d.signatories.map((x) => ({ fullName: [x.name, x.paternalLastName, x.maternalLastName].filter(Boolean).join(' ') || x.fullName || '', signed: !!x.signed })) } : {}) });
  save(c);
}

// Archivos descargados: quedan en una carpeta de la app para ver, compartir o guardar sin volver a bajarlos
const filesDir = () => { const d = path.join(app.getPath('userData'), 'operaciones'); fs.mkdirSync(d, { recursive: true }); return d; };
const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100);
// Copia local del documento; se vuelve a pedir cuando la operación cambia (nuevas firmas, cierre…)
const metaFile = () => path.join(filesDir(), 'documentos.json');
const metaRead = () => { try { return JSON.parse(fs.readFileSync(metaFile(), 'utf8')); } catch { return {}; } };
// `version`: original, signed o legalized (sin ella, la más avanzada que haya)
async function file(op, version) {
  const n = Number(op); const d = await detail(n); const ver = ['original', 'signed', 'legalized'].includes(version) ? version : '';
  const stamp = [d.processId, d.status, d.updatedDateAt || '', (d.signatories || []).filter((s) => s.signed).length].join('|');
  const meta = metaRead(); const clave = ver ? `${n}:${ver}` : n; const m = meta[clave];
  if (m && m.stamp === stamp && fs.existsSync(m.path)) return m.path;
  const a = await requiereApi('GET', '/portalfirma/archivos/' + encodeURIComponent(d.processId) + (ver ? '?version=' + ver : ''));
  const r = { name: a.nombre || null, bytes: Buffer.from(a.base64, 'base64') };
  if (r.bytes.slice(0, 5).toString() !== '%PDF-') throw Object.assign(new Error('El archivo que entregó Portalfirma no es un PDF válido.'), { code: 'FILE_UNAVAILABLE' });
  const base = safe(String(r.name || cache().items[n]?.name || 'Documento').replace(/\.pdf$/i, '')) || 'Documento';
  const out = path.join(filesDir(), `${n} - ${base}${ver ? ' (' + { original: 'original', signed: 'firmado', legalized: 'legalizado' }[ver] + ')' : ''}.pdf`);
  fs.writeFileSync(out, r.bytes); meta[clave] = { stamp, path: out }; fs.writeFileSync(metaFile(), JSON.stringify(meta));
  return out;
}

module.exports = { init, status, setPhone, sync, list, detail, file, versions, guardarDetalle };
