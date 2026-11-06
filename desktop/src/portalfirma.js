// Cliente de Portalfirma. Habla con las MISMAS herramientas que usa el conector de Portalfirma en Claude (protocolo
// MCP), pero A TRAVÉS DE LA API DE ASSET: la sesión de Portalfirma es de la corredora y vive solo en el servidor
// (tabla conexiones, cifrada; la conecta el administrador). La app nunca recibe ni guarda un token de Portalfirma.
//  · login(): el administrador conecta Portalfirma (la API da la página de autorización, se abre en el navegador y se
//    espera a que la sesión quede activa). Un corredor no puede: se le dice que lo haga el administrador.
//  · cada herramienta → POST /v1/portalfirma/herramientas/:nombre; si la corredora no tiene sesión o venció, la API
//    responde NECESITA_CONEXION y aquí se lanza NEEDS_LOGIN (la interfaz pide conectar, como antes).
//  · logout(): no desconecta a la corredora (la sesión es de todos); solo olvida el estado en este equipo.
// Los tokens que la app guardaba antes en el equipo (oauthTokens, oauthClient, pkceVerifier) se borran al cargar.
const fs = require('fs'); const path = require('path');
const { shell } = require('electron');
const store = require('./store');

const DEFAULT_SERVER = 'https://mcp.portalfirma.cl/api/mcp';
const asset = () => require('./asset');
const err = (m, code) => Object.assign(new Error(m), code ? { code } : {});
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// la sesión local de antes ya no se usa
for (const k of ['oauthTokens', 'oauthClient', 'pkceVerifier']) { try { if (store.getSecret(k)) store.setSecret(k, undefined); } catch {} }

function serverUrl() { return DEFAULT_SERVER; }

/** error de la API → el de antes: sin sesión de Portalfirma (o sin sesión de Asset) es NEEDS_LOGIN */
function traducir(e) {
  if (e?.datos?.codigo === 'NECESITA_CONEXION' || e?.code === 'NEEDS_ASSET_LOGIN') return Object.assign(err('NEEDS_LOGIN', 'NEEDS_LOGIN'), { detalle: e.message });
  return e;
}
const api = (metodo, ruta, cuerpo) => asset().llamar(metodo, ruta, cuerpo).catch((e) => { throw traducir(e); });

// ---- Conectar (la sesión es de la corredora) ----
const estadoConexion = () => api('GET', '/conexiones/portalfirma');
let conectado = null; // último estado conocido (para no consultar Portalfirma si se sabe que no hay sesión)
async function login() {
  const e = await estadoConexion();
  if (e.conexion?.estado === 'activa') { try { return await session(); } catch (x) { if (x.code !== 'NEEDS_LOGIN') throw x; } }
  let url;
  try { ({ url } = await asset().llamar('POST', '/conexiones/portalfirma/iniciar')); }
  catch (x) { if (x.status === 403) throw err('Portalfirma se conecta una vez para toda la corredora: pídele al administrador que lo conecte desde su Asset.', 'SOLO_ADMIN'); throw traducir(x); }
  await shell.openExternal(url);
  const fin = Date.now() + 5 * 60_000;
  while (Date.now() < fin) {
    await dormir(2000);
    const s = await estadoConexion().catch(() => null);
    if (s?.conexion?.estado === 'activa' && s.conexion.conectadoEn && new Date(s.conexion.conectadoEn) > new Date(Date.now() - 6 * 60_000)) return session();
  }
  throw err('No se completó la conexión con Portalfirma (se acabó el tiempo). Inténtalo de nuevo.', 'NEEDS_LOGIN');
}
async function tryRestore() {
  try { const e = await estadoConexion(); if (e.conexion?.estado !== 'activa') { conectado = false; return null; } return await session(); }
  catch { return null; }
}
async function logout() { conectado = null; }
const isConnected = () => conectado;

// ---- Llamada a herramientas ----
async function tool(name, args) {
  try { const r = await api('POST', `/portalfirma/herramientas/${encodeURIComponent(name)}`, { argumentos: args || {} }); conectado = true; return r; }
  catch (e) { if (e.code === 'NEEDS_LOGIN') conectado = false; throw e; }
}
async function call(name, args = {}) {
  const res = await tool(name, args);
  const text = (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text }; }
  if (res.isError) { const e = new Error(data?.message || data?.error || text || 'Error de Portalfirma'); e.data = data; throw e; }
  return data;
}
// Llama una herramienta y devuelve el texto tal cual (sin lanzar error si la herramienta falla).
async function callRaw(name, args = {}) {
  let res;
  try { res = await tool(name, args); }
  catch (e) { if (e.code === 'NEEDS_LOGIN') throw e; return { text: 'Error: ' + (e.message || String(e)), isError: true }; }
  let text = (res.content || []).map((p) => (p.type === 'text' ? p.text : `[${p.type}]`)).join('\n');
  if (!text.trim() && res.structuredContent) text = JSON.stringify(res.structuredContent); // algunas respuestas vienen solo como datos estructurados
  // hay errores que llegan como texto («Error template_get_forms: …») sin la marca isError
  return { text, isError: !!res.isError || /^\s*Error\b/.test(text) };
}
// Lista TODAS las herramientas que publica el servidor (incluye las que Portalfirma agregue en el futuro).
const listTools = () => api('GET', '/portalfirma/herramientas');
/** identifica la cuenta de Portalfirma (para separar cachés): la sesión es de la corredora */
const accessToken = () => { try { return 'corredora:' + (require('./inmo').usuario()?.corredoraId || ''); } catch { return ''; } };

// ---- Operaciones de alto nivel (mismo flujo que el conector en Claude) ----
const session = async () => {
  const [partner, wallet] = await Promise.all([
    call('get_partner_session'),
    call('wallet_manage_balance_tools', { action: 'get_balance' }).catch(() => null),
  ]);
  return { partner, balance: wallet?.amount ?? null };
};
const balance = async () => (await call('wallet_manage_balance_tools', { action: 'get_balance' })).amount;
const ingest = (base64, filename) => call('ingest_document_tools', { source: 'base64', base64, filename });
const extractSigners = (document_id, document_config_id) =>
  call('extract_signers_document_tools', document_config_id ? { document_id, document_config_id } : { document_id });
const sendToSign = (payload) => call('send_to_sign_document_tools', payload);
const processDetail = (operation) => call('process_detail_get_by_operation', { operation });
const manage = (args) => call('operation_manage_signing_tools', args);
const byRut = (rut, startDate, endDate, limit = 50) =>
  call('operation_get_operation_by_rut', { rut, startDate, endDate, limit });
const byPhone = (phone, startDate, endDate, limit = 100) =>
  call('operation_get_operation_by_phone', { phone, startDate, endDate, limit });
const cds = (args) => call('sign_documents_cds_massive_tools', args);
const topUp = (amount, email) => call('wallet_manage_balance_tools', { action: 'add_amount_flow', amount, email });

// ---- Documento de una operación ----
// Por norma se usa SOLO el servicio oficial de archivos de Portalfirma. Lo pide la API (con la credencial del servicio
// del servidor); si el servidor no la tiene configurada, se usa la de este equipo, si hay.
const FILE_API = 'https://api.portalfirma.cl/api/file/getById';
let archivosServidor = true; // se apaga si el servidor dice que no tiene la credencial del servicio
// Credencial local del servicio (cabecera «id»): variable PF_FILE_ID, archivo de configuración
// (resources/portalfirma/api.json → { "file_id": "…" }) o la que el usuario guardó en la app.
function fileKey() {
  if (process.env.PF_FILE_ID) return String(process.env.PF_FILE_ID).trim();
  const cands = process.env.PF_API_CONFIG ? [process.env.PF_API_CONFIG] : [process.resourcesPath && path.join(process.resourcesPath, 'portalfirma', 'api.json'), path.join(__dirname, '..', 'build', 'portalfirma', 'api.json')].filter(Boolean);
  for (const c of cands) { try { const v = (() => { const j = JSON.parse(fs.readFileSync(c, 'utf8')); return String(j.id || j.file_id || ''); })().trim(); if (v) return v; } catch {} }
  return String(store.getSecret('pfFileId') || '').trim() || (archivosServidor ? 'servidor' : '');
}
const setFileKey = (v) => { v = String(v || '').trim(); if (!/^[A-Za-z0-9._-]{4,200}$/.test(v)) throw new Error('El código de acceso no es válido.'); store.setSecret('pfFileId', v); return true; };
const pdf = (buf) => { if (buf.slice(0, 5).toString() !== '%PDF-') throw err('El archivo que entregó Portalfirma no es un PDF válido.', 'FILE_UNAVAILABLE'); return buf; };
async function fileById(contractId) {
  if (!contractId) throw new Error('La operación no trae su identificador de contrato.');
  if (archivosServidor) {
    try {
      const r = await api('GET', `/portalfirma/archivos/${encodeURIComponent(contractId)}`);
      return { name: r.nombre || null, bytes: pdf(Buffer.from(r.base64, 'base64')), updated: r.actualizado || null };
    } catch (e) {
      if (e.code === 'NEEDS_LOGIN') throw e;
      if (e.status !== 503) throw Object.assign(e, { code: e.code === 'API' ? 'FILE_UNAVAILABLE' : e.code });
      archivosServidor = false; // sin credencial en el servidor: la de este equipo
    }
  }
  const key = fileKey();
  if (!key || key === 'servidor') throw err('Falta configurar el acceso al servicio de archivos de Portalfirma.', 'NO_FILE_KEY');
  let r;
  try {
    r = await fetch(FILE_API, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', id: key }, body: JSON.stringify({ contract_id: String(contractId) }) });
  } catch (x) { throw err('No pude conectarme con Portalfirma para traer el documento (' + x.message + ').', 'FILE_UNAVAILABLE'); }
  let j = null; try { j = await r.json(); } catch {}
  if (r.status === 401 || r.status === 403) throw err('Portalfirma rechazó el acceso al servicio de archivos (revisa el código de acceso).', 'NO_FILE_KEY');
  if (!r.ok || !j?.success || !j.data?.base64) {
    const why = (j && (typeof j.error === 'string' ? j.error : j.error?.message)) || (r.ok ? 'respuesta sin archivo' : 'error ' + r.status);
    throw err('Portalfirma no entregó el documento: ' + why + '.', 'FILE_UNAVAILABLE');
  }
  return { name: j.data.name || null, bytes: pdf(Buffer.from(String(j.data.base64).replace(/^data:[^,]*,/, ''), 'base64')), updated: j.data.updated || null };
}

// ---- Notaría virtual (plantillas notariales del conector) ----
const templateSearch = (query, top_k = 20) => call('template_manage_tools', { action: 'search', query, top_k });
const templateForms = (template_version_id) => call('template_manage_tools', { action: 'get_forms', template_version_id });
const templateSend = (template_version_id, values) => call('template_manage_tools', { action: 'send_sign', template_version_id, values });

module.exports = {
  DEFAULT_SERVER, serverUrl,
  login, logout, tryRestore, session, balance, isConnected,
  ingest, extractSigners, sendToSign, processDetail, manage, byRut, byPhone, cds, fileById, fileKey, setFileKey, topUp,
  listTools, callRaw, accessToken,
  templateSearch, templateForms, templateSend,
};
