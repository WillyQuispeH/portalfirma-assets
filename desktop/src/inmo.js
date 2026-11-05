// PortalFirma Asset: la cartera (propiedades, personas y sus vínculos) y su historial.
//
// Un repositorio con dos fuentes, con la MISMA interfaz:
//  · Normal: la base de Asset, vía la API (src/asset.js). Al iniciar sesión se carga en memoria una copia de las
//    propiedades y personas de la corredora (paginada por cursor) y se mantiene al día con la sincronización por
//    cambios (GET ?desde=<marca>, con la marca `servidorEn` de la respuesta): al volver a la ventana, cada minuto y
//    después de cada escritura. Las lecturas (todas, obtener, personaPorId, listar…) siguen siendo sincrónicas sobre
//    esa copia, así los módulos que las usan no cambian.
//    Escrituras: guardarPropiedad, guardarPersona, vincular, desvincular, archivar, borrarPersona, nota, asignar el
//    captador e importar son async (esperan la respuesta y lanzan su error). parchear(id, fn, texto) es sincrónico:
//    aplica el cambio a la copia y encola el PATCH con la diferencia contra lo último que mandó el servidor y su
//    `version`. Todo pasa por una cola serializada: sin conexión reintenta (cada vez más espaciado); un 409 (otra
//    persona la cambió) o un rechazo recarga esa propiedad y avisa. Lo que llega del servidor se combina campo a campo
//    con lo local que aún no se envía (no se pisa). El historial (actividad) de propiedades, personas, negocios y
//    agenda va a /v1/actividad; registrar() también es sincrónico y se encola.
//    Fotos y documentos van a R2 (ver «Archivos de la propiedad»). Lo que la API todavía no guarda de una propiedad
//    (firmas enviadas, y documentos o fotos de antes de R2 que aún no se suben) queda local, en datos.json › extrasProp
//    (por id de propiedad), y se suma a la copia.
//  · Modo de prueba (PF_MOCK=1): todo en el JSON local de siempre (userData/inmo/datos.json), sin servidor.
//    Negocios, eventos de la agenda, leads y firmas enviadas también van a la API (PUT del documento completo; ver «negocios y eventos»).
// En los dos modos siguen locales: la configuración y la última importación.
'use strict';
const fs = require('fs'); const path = require('path');
const { app, shell } = require('electron');
const FC = require('./ficha-campos');

const API = process.env.PF_MOCK !== '1';
let assetMod = null;
const asset = () => (assetMod ||= require('./asset'));

const dir = () => { const d = process.env.PF_INMO_DIR || path.join(app.getPath('userData'), 'inmo'); fs.mkdirSync(d, { recursive: true }); return d; };
const file = () => path.join(dir(), 'datos.json');
const now = () => new Date().toISOString();
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clonar = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let cache = null;
function db() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { cache = {}; }
  cache.version = 1; cache.propiedades ||= []; cache.personas ||= []; cache.actividad ||= [];
  return cache;
}
function save() { // escritura atómica: nunca queda un archivo a medias
  const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cache || db(), null, 1)); fs.renameSync(tmp, file());
}

// ---------- validaciones ----------
const cleanRut = (r) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
function validRut(r) {
  const c = cleanRut(r); if (c.length < 2) return false;
  const body = c.slice(0, -1), dv = c.slice(-1); let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += Number(body[i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const res = 11 - (sum % 11); return dv === (res === 11 ? '0' : res === 10 ? 'K' : String(res));
}
const fmtRut = (r) => { const c = cleanRut(r); return c.length < 2 ? r : c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1); };
const err = (m, code) => { const e = new Error(m); e.code = code; return e; };
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));

const TIPOS = ['casa', 'departamento', 'oficina', 'sitio', 'local_comercial', 'industrial', 'agricola', 'parcela', 'estacionamiento', 'terreno_construccion', 'bodega'];
const ESTADOS = ['disponible', 'reservada', 'vendida', 'arrendada', 'no_disponible'];
const ROLES = ['propietario', 'arrendatario', 'comprador', 'codeudor', 'interesado', 'proveedor'];
const MONEDAS = ['UF', 'CLP', 'USD'];

const CAMPOS_PROP = ['codigo', 'titulo', 'tipo', 'venta', 'arriendo', 'precioVenta', 'precioArriendo', 'estadoVenta', 'estadoArriendo', 'direccion', 'unidad', 'comuna', 'region',
  'rol', 'supTotal', 'supUtil', 'dormitorios', 'banos', 'estacionamientos', 'bodegas', 'amoblado', 'gastosComunes', 'descripcion', 'notasInternas', 'fotos', 'corredor', 'etiquetas', 'tituloPortal', 'portalBarrio', 'lat', 'lng', 'placeId', 'ficha'];
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const precio = (p) => (p && num(p.valor) != null ? { valor: num(p.valor), moneda: MONEDAS.includes(p.moneda) ? p.moneda : 'UF' } : null);
function limpiarProp(o) {
  const p = {};
  for (const k of CAMPOS_PROP) if (o[k] !== undefined) p[k] = o[k];
  if ('titulo' in p) p.titulo = String(p.titulo || '').trim().slice(0, 160);
  if ('tipo' in p && !TIPOS.includes(p.tipo)) p.tipo = 'casa';
  for (const k of ['venta', 'arriendo', 'amoblado']) if (k in p) p[k] = !!p[k];
  for (const k of ['precioVenta', 'precioArriendo']) if (k in p) p[k] = precio(p[k]);
  for (const k of ['estadoVenta', 'estadoArriendo']) if (k in p && p[k] != null && !ESTADOS.includes(p[k])) p[k] = 'disponible';
  for (const k of ['supTotal', 'supUtil', 'dormitorios', 'banos', 'estacionamientos', 'bodegas', 'gastosComunes']) if (k in p) p[k] = num(p[k]);
  for (const [k, m] of [['lat', 90], ['lng', 180]]) if (k in p) { p[k] = num(p[k]); if (p[k] != null && Math.abs(p[k]) > m) p[k] = null; }
  if ('placeId' in p) p.placeId = p.placeId ? String(p.placeId).slice(0, 300) : null;
  if ('fotos' in p) p.fotos = (p.fotos || []).filter((u) => typeof u === 'string' && /^(https:|file:|pffoto:)/.test(u)).slice(0, 60);
  if ('etiquetas' in p) p.etiquetas = [...new Set((p.etiquetas || []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 20);
  if ('ficha' in p) p.ficha = FC.limpiarFicha(p.ficha); // 0.16.14 · la ficha completa (ficha-campos.js)
  return p;
}

// ============================================================================ repositorio (copia en memoria)

// usuario: el de la sesión de Asset · base: lo último que mandó el servidor de cada propiedad ('p:id'), persona ('c:id'),
// negocio ('n:id'), evento ('e:id'), lead ('l:id') y firma ('f:id')
const R = { usuario: null, props: [], pers: [], negs: [], evs: [], leads: [], firmas: [], base: new Map(), marca: null, listo: false, cargando: null };
const P = () => (API ? R.props : db().propiedades);
const C = () => (API ? R.pers : db().personas);
// ganchos que pone main.js: avisar en pantalla, avisar que cambiaron datos y el nombre de un usuario del equipo
// leads (los pone leads.js): subir lo local de antes, enviar mensajes de la conversación y resolver un lead duplicado
const H = { avisar: () => {}, cambio: () => {}, nombreUsuario: () => null, leads: null };
const configurar = (o = {}) => { Object.assign(H, o); };

// campos de la propiedad que guarda la API (los demás, salvo los que maneja el servidor, quedan en extrasProp)
const CAMPOS_API = ['codigo', 'titulo', 'tipo', 'venta', 'arriendo', 'precioVenta', 'precioArriendo', 'estadoVenta', 'estadoArriendo', 'direccion', 'unidad', 'comuna', 'region', 'rol',
  'lat', 'lng', 'placeId', 'supTotal', 'supUtil', 'dormitorios', 'banos', 'estacionamientos', 'bodegas', 'amoblado', 'gastosComunes', 'descripcion', 'notasInternas', 'tituloPortal',
  'portalBarrio', 'etiquetas', 'ficha', 'portales', 'leads', 'fotos', 'corredor'];
const DEL_SERVIDOR = new Set(['id', 'documentos', 'firmas', 'vinculos', 'duenoVisible', 'archivada', 'origen', 'editados', 'idLegado', 'version', 'creado', 'actualizado', 'eliminado', 'captadorId', 'captador']);
const MAX = { titulo: 160, codigo: 40, direccion: 300, unidad: 40, comuna: 80, region: 80, rol: 40, placeId: 300, descripcion: 20000, notasInternas: 5000, tituloPortal: 160, portalBarrio: 120 };
const VACIO = { etiquetas: [], fotos: [], leads: [], portales: {}, venta: false, arriendo: false, amoblado: false };
const ENTEROS = ['dormitorios', 'banos', 'estacionamientos', 'bodegas'];
const CAMPOS_PER = ['nombre', 'rut', 'tipo', 'email', 'telefono', 'direccion', 'estadoCivil', 'profesion', 'nacionalidad', 'roles', 'notas'];
const EXTRA_PER = ['leadId', 'corredor']; // van en `extra` de la persona (la API los devuelve al mismo nivel)
const esWeb = (u) => /^https?:\/\//.test(String(u || ''));

// comparación tolerante: '' = null = [] = {} y sin importar el orden de las claves (JSONB las reordena)
const vacio = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && v && !Object.keys(v).length);
const estable = (v) => (Array.isArray(v) ? v.map(estable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, estable(v[k])])) : v);
const igual = (a, b) => (vacio(a) && vacio(b)) || JSON.stringify(estable(a)) === JSON.stringify(estable(b));

// valor de un campo de la propiedad como lo acepta la API (undefined: no se manda)
function valorApi(k, v) {
  if (vacio(v) && !(Array.isArray(v) || (v && typeof v === 'object'))) v = k in VACIO ? VACIO[k] : null;
  if (v == null && k in VACIO) v = VACIO[k];
  if ((k === 'codigo' || k === 'tipo') && !v) return undefined;
  if (k === 'titulo') v = String(v || '');
  if (typeof v === 'string' && MAX[k]) v = v.slice(0, MAX[k]);
  if (ENTEROS.includes(k) && typeof v === 'number') v = Math.max(0, Math.min(10000, Math.round(v)));
  if (k === 'fotos') v = (v || []).filter(esWeb).slice(0, 60);
  if (k === 'etiquetas') v = (v || []).map((t) => String(t).trim().slice(0, 60)).filter(Boolean).slice(0, 20);
  if (k === 'leads') v = (v || []).slice(0, 300);
  if (k === 'tipo' && !TIPOS.includes(v)) v = 'casa';
  if ((k === 'precioVenta' || k === 'precioArriendo') && v && num(v.valor) == null) v = null;
  return v;
}
function propApi(datos) { // propiedad nueva → cuerpo del POST
  const out = {};
  for (const k of CAMPOS_API) if (datos[k] !== undefined) { const v = k === 'ficha' ? FC.limpiarFicha(datos.ficha) : valorApi(k, datos[k]); if (v !== undefined) out[k] = v; }
  return out;
}
function perApi(c) { // persona → cuerpo (POST o PATCH completo)
  const s = (v, m) => String(v ?? '').trim().slice(0, m);
  const out = { nombre: s(c.nombre, 200) || 'Sin nombre', rut: s(c.rut, 20) || null, tipo: c.tipo === 'juridica' ? 'juridica' : 'natural', email: emailOk(c.email) ? s(c.email, 200) : '',
    telefono: s(c.telefono, 40) || null, direccion: s(c.direccion, 300) || null, estadoCivil: s(c.estadoCivil, 60) || null, profesion: s(c.profesion, 120) || null,
    nacionalidad: s(c.nacionalidad, 60) || null, roles: (c.roles || []).filter((r) => ROLES.includes(r)), notas: s(c.notas, 2000) || null };
  const extra = {}; for (const k of EXTRA_PER) if (c[k] !== undefined) extra[k] = c[k] ?? null;
  if (Object.keys(extra).length) out.extra = extra;
  return out;
}
function diferenciaProp(p, b) {
  const out = {};
  for (const k of CAMPOS_API) {
    if (k === 'ficha') {
      const f = p.ficha || {}; const g = b.ficha || {}; const df = {};
      for (const kk of new Set([...Object.keys(f), ...Object.keys(g)])) if (!igual(f[kk], g[kk])) df[kk] = vacio(f[kk]) ? null : f[kk];
      if (Object.keys(df).length) out.ficha = df; continue;
    }
    if (k === 'fotos') { if (!igual((p.fotos || []).filter(esWeb), b.fotos)) out.fotos = valorApi('fotos', p.fotos); continue; }
    if (!igual(p[k], b[k])) { const v = valorApi(k, p[k]); if (v !== undefined) out[k] = v; }
  }
  return out;
}
function diferenciaPer(c, b) {
  const todo = perApi(c); const out = {};
  for (const k of CAMPOS_PER) if (!igual(c[k], b[k])) out[k] = todo[k];
  const ex = {}; for (const k of EXTRA_PER) if (!igual(c[k], b[k])) ex[k] = c[k] ?? null;
  if (Object.keys(ex).length) out.extra = ex;
  return out;
}
// combina lo que llega del servidor con lo local que aún no se envía: campo que cambió aquí desde `vieja`, se conserva
function fusionar(local, vieja, nuevo, campos) {
  const out = { ...local, ...nuevo };
  for (const k of campos) {
    if (k === 'ficha') {
      const f = { ...(nuevo.ficha || {}) }; const lf = local.ficha || {}; const vf = vieja.ficha || {};
      for (const kk of new Set([...Object.keys(lf), ...Object.keys(vf)])) if (!igual(lf[kk], vf[kk])) { if (vacio(lf[kk])) delete f[kk]; else f[kk] = lf[kk]; }
      out.ficha = f; continue;
    }
    if (k === 'fotos') { if (!igual((local.fotos || []).filter(esWeb), vieja.fotos)) out.fotos = local.fotos; continue; }
    if (!igual(local[k], vieja[k])) out[k] = local[k];
  }
  return out;
}

// lo local de una propiedad (lo que la API no guarda): firmas, documentos y fotos de este computador
function extrasDe(id) { return (db().extrasProp ||= {})[id] || null; }
function conExtras(p) {
  conFirmas(p);
  const ex = extrasDe(p.id); if (!ex) return p;
  for (const [k, v] of Object.entries(ex)) {
    if (k === 'firmas' && API) continue; // de antes: se sube con subirFirmasLocales
    if (k === 'fotos') p.fotos = [...v, ...(p.fotos || []).filter((u) => !v.includes(u))].slice(0, 60);
    else if (k === 'documentos') p.documentos = [...clonar(v), ...(p.documentos || []).filter((d) => !v.some((x) => x.id === d.id))];
    else p[k] = clonar(v); // copia: lo guardado solo cambia con guardarExtras (así se detecta qué cambió)
  }
  return p;
}
function guardarExtras(p) {
  const ex = {};
  for (const [k, v] of Object.entries(p)) if (!CAMPOS_API.includes(k) && !DEL_SERVIDOR.has(k) && !vacio(v)) ex[k] = v;
  const docsLocales = (p.documentos || []).filter((d) => d.path); if (docsLocales.length) ex.documentos = docsLocales;
  if (!db().firmasSubidas && db().extrasProp?.[p.id]?.firmas) ex.firmas = db().extrasProp[p.id].firmas; // de antes, hasta que se suban
  if ((p.fotos || []).some((u) => !esWeb(u))) ex.fotos = p.fotos;
  const d = db(); d.extrasProp ||= {};
  const antes = JSON.stringify(d.extrasProp[p.id] || null); const nuevo = Object.keys(ex).length ? ex : null;
  if (JSON.stringify(nuevo) === antes) return; // sin cambios locales: no se reescribe datos.json
  if (nuevo) d.extrasProp[p.id] = clonar(nuevo); else delete d.extrasProp[p.id];
  save();
}

// reemplaza en el lugar (otros módulos guardan la referencia al objeto)
function reemplazar(lista, i, nuevo) { const o = lista[i]; for (const k of Object.keys(o)) if (!(k in nuevo)) delete o[k]; Object.assign(o, nuevo); return o; }
function recibirProp(x, vieja = null) {
  const i = R.props.findIndex((p) => p.id === x.id);
  if (x.eliminado) { if (i >= 0) R.props.splice(i, 1); R.base.delete('p:' + x.id); return null; }
  const antes = vieja || R.base.get('p:' + x.id);
  R.base.set('p:' + x.id, clonar(x));
  const nuevo = conExtras(i >= 0 && antes ? fusionar(R.props[i], antes, clonar(x), CAMPOS_API) : clonar(x));
  if (i >= 0) return reemplazar(R.props, i, nuevo);
  R.props.unshift(nuevo); return nuevo;
}
function recibirPer(x, vieja = null) {
  const i = R.pers.findIndex((c) => c.id === x.id);
  if (x.eliminado) { if (i >= 0) R.pers.splice(i, 1); R.base.delete('c:' + x.id); return null; }
  const antes = vieja || R.base.get('c:' + x.id);
  R.base.set('c:' + x.id, clonar(x));
  const nuevo = i >= 0 && antes && !x.reservado ? fusionar(R.pers[i], antes, clonar(x), [...CAMPOS_PER, ...EXTRA_PER]) : clonar(x);
  if (i >= 0) return reemplazar(R.pers, i, nuevo);
  R.pers.unshift(nuevo); return nuevo;
}

// ---------- negocios y eventos de la agenda (documentos completos) ----------
// negocios.js y agenda.js trabajan igual que siempre sobre las listas negocios() y eventos() y llaman a guardar().
// Con la API, guardar() compara cada negocio y evento con lo último que mandó el servidor y encola un PUT con el
// documento completo (o un DELETE si se quitó de la lista). El servidor aplica quién ve qué (el corredor, lo suyo).
const DOCS = {
  neg: { lista: () => R.negs, pref: 'n:', ruta: '/negocios', que: 'negocios', nombre: 'un negocio' },
  ev: { lista: () => R.evs, pref: 'e:', ruta: '/eventos', que: 'agenda', nombre: 'un evento de la agenda' },
  lead: { lista: () => R.leads, pref: 'l:', ruta: '/leads', que: 'leads', nombre: 'un lead' },
  firma: { lista: () => R.firmas, pref: 'f:', ruta: '/firmas', que: 'propiedades', nombre: 'el registro de un documento en firma' },
};
// mensajes de la conversación de un lead: { tipo: 'msgs', lead, ks } (los envía leads.js, que tiene la conversación)
function encolarMensajes(lead, ks) {
  if (!API || !ks.length) return;
  const ya = cola.find((x) => x.tipo === 'msgs' && x.lead === lead && !x.enviando);
  if (ya) { ya.ks = [...new Set([...ya.ks, ...ks])]; persistirCola(); return; }
  cola.push({ tipo: 'msgs', lead, ks: [...new Set(ks)] }); persistirCola(); procesar();
}
async function enviarMensajes(op) {
  if (!H.leads?.enviarMensajes) return;
  // el lead nuevo va antes que su conversación
  if (!R.base.has('l:' + op.lead) && R.leads.some((l) => l.id === op.lead)) await enviarDoc('lead', op.lead);
  await H.leads.enviarMensajes(op.lead, op.ks);
}
const SERV_DOC = new Set(['version', 'creado', 'actualizado', 'creadoPorId']);
function docIgual(a, b) {
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) if (!SERV_DOC.has(k) && !igual(a?.[k], b?.[k])) return false;
  return true;
}
const docCuerpo = (x, b) => { const o = {}; for (const [k, v] of Object.entries(x)) if (!SERV_DOC.has(k) && v !== undefined) o[k] = v; if (b?.version) o.version = b.version; return o; };
function recibirDoc(tipo, x, enviado = null) {
  const D = DOCS[tipo]; const l = D.lista(); const i = l.findIndex((y) => y.id === x.id);
  if (x.eliminado) { if (i >= 0) l.splice(i, 1); R.base.delete(D.pref + x.id); return null; }
  R.base.set(D.pref + x.id, clonar(x));
  if (i < 0) { if (enviado) { encolar({ tipo, id: x.id }); return null; } l.unshift(clonar(x)); return l[0]; } // se quitó aquí mientras se enviaba: se borra
  if (enviado && !docIgual(l[i], enviado)) { encolar({ tipo, id: x.id }); return l[i]; } // cambió otra vez: va de nuevo
  return reemplazar(l, i, clonar(x));
}
// qué negocios y eventos cambiaron (o se quitaron) desde lo último del servidor → a la cola
function detectarDocs() {
  if (!API || !R.listo || !R.usuario) return;
  for (const [tipo, D] of Object.entries(DOCS)) {
    const ids = new Set();
    for (const x of D.lista()) { ids.add(x.id); const b = R.base.get(D.pref + x.id); if (!b || !docIgual(x, b)) encolar({ tipo, id: x.id }); }
    for (const k of R.base.keys()) if (k.startsWith(D.pref) && !ids.has(k.slice(2))) encolar({ tipo, id: k.slice(2) });
  }
}
async function enviarDoc(tipo, id) {
  const D = DOCS[tipo]; const x = D.lista().find((y) => y.id === id); const b = R.base.get(D.pref + id);
  if (!x) { // se quitó de la lista
    if (!b) return null;
    try { await asset().llamar('DELETE', `${D.ruta}/${encodeURIComponent(id)}`); } catch (e) { if (e.status !== 404) throw e; }
    R.base.delete(D.pref + id); return null;
  }
  if (b && docIgual(x, b)) return x;
  const enviado = clonar(x);
  return recibirDoc(tipo, await asset().llamar('PUT', `${D.ruta}/${encodeURIComponent(id)}`, docCuerpo(x, b)), enviado);
}
async function recargarDoc(tipo, id) {
  const D = DOCS[tipo]; R.base.delete(D.pref + id);
  try { recibirDoc(tipo, await asset().llamar('GET', `${D.ruta}/${encodeURIComponent(id)}`)); }
  catch (e) { if (e.status === 404 || e.status === 403) recibirDoc(tipo, { id, eliminado: true }); else throw e; }
}
// lo que estaba en el JSON local de este equipo (antes de la API) se sube una vez; queda un respaldo en datos.json
async function subirNegociosEventos() {
  const d = db(); const hay = (d.negocios || []).length || (d.eventos || []).length;
  if (!hay) return;
  const res = { negocios: 0, eventos: 0, rechazados: [] };
  for (const [clave, ruta] of [['negocios', '/negocios/importar'], ['eventos', '/eventos/importar']]) {
    const l = d[clave] || [];
    for (let i = 0; i < l.length; i += 200) {
      const r = await asset().llamar('POST', ruta, { items: l.slice(i, i + 200) });
      res[clave] += r.nuevos; res.rechazados.push(...(r.rechazados || []));
    }
  }
  d.respaldoLocal = { fecha: now(), negocios: d.negocios || [], eventos: d.eventos || [], rechazados: res.rechazados };
  delete d.negocios; delete d.eventos; save();
  if (res.negocios || res.eventos) H.avisar(`Se subieron al servidor ${[res.negocios && `${res.negocios} ${res.negocios === 1 ? 'negocio' : 'negocios'}`, res.eventos && `${res.eventos} ${res.eventos === 1 ? 'evento de la agenda' : 'eventos de la agenda'}`].filter(Boolean).join(' y ')} que estaban solo en este computador.${res.rechazados.length ? ` ${res.rechazados.length} no se pudieron subir (quedaron respaldados en este equipo).` : ''}`);
}

// ---------- firmas enviadas (documentos en firma) ----------
// Con la API, cada envío a firmar es un documento de la tabla firmas (id «op<número>»), visible para toda la corredora.
// p.firmas sigue existiendo para quien la lee (la ficha, Hoy, el Agente, etapas…), pero se calcula: las firmas cuyas
// propIds incluyen la propiedad. Para agregar o cambiar una firma: agregarFirma(doc, propIds, texto) y
// actualizarFirma(operacion, fn, texto). En PF_MOCK, todo sigue en p.firmas y en el historial local («Mis operaciones»).
const firmaIdDe = (doc) => (Number(doc.operacion) ? 'op' + Number(doc.operacion) : doc.id || uid('fi'));
const porFecha = (a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''));
function firmasDe(propId) {
  if (!API) { const p = P().find((x) => x.id === propId); return p?.firmas || []; }
  return R.firmas.filter((f) => (f.propIds || []).includes(propId)).sort(porFecha);
}
/** Todas las firmas, con sus propiedades: [{ f, propIds }] (en PF_MOCK, armadas desde cada propiedad). */
function todasLasFirmas() {
  if (API) return R.firmas.slice().sort(porFecha);
  const m = new Map();
  for (const p of P()) for (const f of p.firmas || []) { const k = f.operacion ? 'op' + f.operacion : p.id + (f.fecha || ''); const x = m.get(k); if (x) x.propIds.push(p.id); else m.set(k, { ...f, propIds: [p.id] }); }
  return [...m.values()].sort(porFecha);
}
function agregarFirma(doc, propIds = [], texto = null) {
  propIds = [...new Set(propIds.filter(Boolean))];
  if (!API) {
    for (const id of propIds) parchear(id, (pp) => { pp.firmas ||= []; pp.firmas.unshift(clonar(doc)); pp.firmas.length = Math.min(pp.firmas.length, 100); }, texto);
    return doc;
  }
  const id = firmaIdDe(doc); const i = R.firmas.findIndex((x) => x.id === id); const antes = i >= 0 ? R.firmas[i] : null;
  const f = { ...(antes || {}), ...clonar(doc), id, propIds: [...new Set([...(antes?.propIds || []), ...propIds])] };
  if (!f.fecha) f.fecha = now();
  // los firmantes de un segundo registro de la misma operación se juntan con los que ya había (por RUT o nombre)
  if (antes?.firmantes?.length && doc.firmantes?.length) f.firmantes = doc.firmantes.map((s) => ({ ...(antes.firmantes.find((y) => (y.rut && y.rut === s.rut) || (y.nombre && y.nombre === s.nombre)) || {}), ...s }));
  if (antes) R.firmas[i] = f; else R.firmas.unshift(f);
  if (texto) for (const pid of propIds) log(pid, texto);
  guardarTodo(); H.cambio('propiedades');
  return f;
}
function actualizarFirma(operacion, fn, texto = null) {
  const op = Number(operacion); if (!op) return null;
  if (!API) {
    let hecho = null;
    for (const p of P()) { const f = (p.firmas || []).find((y) => Number(y.operacion) === op); if (f) { parchear(p.id, () => fn(f), texto); hecho ||= f; } }
    return hecho;
  }
  const f = R.firmas.find((x) => Number(x.operacion) === op); if (!f) return null;
  fn(f); if (texto) for (const pid of f.propIds || []) log(pid, texto);
  guardarTodo(); H.cambio('propiedades');
  return f;
}
const firmaDeOperacion = (op) => (API ? R.firmas.find((x) => Number(x.operacion) === Number(op)) : todasLasFirmas().find((x) => Number(x.operacion) === Number(op))) || null;
// p.firmas calculado (con la API): se define en cada propiedad que entra a la copia
function conFirmas(p) {
  if (API && !Object.getOwnPropertyDescriptor(p, 'firmas')?.get) Object.defineProperty(p, 'firmas', { get() { return firmasDe(this.id); }, set() {}, enumerable: true, configurable: true });
  return p;
}
// las firmas de las propiedades (extrasProp) y el historial de «Mis operaciones» de este equipo se suben una vez
async function subirFirmasLocales(historial = []) {
  const d = db(); if (d.firmasSubidas) return;
  const m = new Map();
  const agregar = (x, pid) => {
    const op = Number(x.operacion ?? x.operation);
    const id = op ? 'op' + op : 'fx' + require('crypto').createHash('sha1').update(`${pid}|${x.fecha || x.date}|${x.plantilla || x.name}`).digest('hex').slice(0, 14);
    const a = m.get(id) || { id, propIds: [] };
    // los firmantes de la misma operación (propiedad e historial) se juntan por RUT o nombre
    const fs0 = a.firmantes || []; const fs1 = (x.firmantes || []).map((f) => ({ ...f, rol: f.rol || f.calidad || null }));
    const firmantes = fs0.length && fs1.length ? fs0.map((f) => ({ ...(fs1.find((y) => (y.rut && y.rut === f.rut) || (y.nombre && y.nombre === f.nombre)) || {}), ...f })) : fs0.length ? fs0 : fs1;
    m.set(id, { ...a, ...x, firmantes, id, operacion: op || null, plantilla: x.plantilla || x.name || a.plantilla || 'Documento', fecha: x.fecha || x.date || a.fecha, propIds: [...new Set([...a.propIds, ...(pid ? [pid] : []), ...(x.propId ? [x.propId] : [])])] });
  };
  for (const [pid, ex] of Object.entries(d.extrasProp || {})) for (const f of ex.firmas || []) agregar(f, pid);
  for (const h of historial) if (Number(h.operation)) agregar({ operacion: h.operation, plantilla: h.name, fecha: h.date, origen: h.origen || (h.bulk ? 'masiva' : 'editor'), negocioId: h.negocioId || null, tipoFirma: h.tipoFirma || null, tramite: h.tramite || null, firmantes: h.firmantes || [] }, null);
  const items = [...m.values()].map(({ operation, name, date, propId, ...x }) => x);
  for (let i = 0; i < items.length; i += 200) await asset().llamar('POST', '/firmas/importar', { items: items.slice(i, i + 200) });
  for (const ex of Object.values(d.extrasProp || {})) delete ex.firmas;
  for (const [pid, ex] of Object.entries(d.extrasProp || {})) if (!Object.keys(ex).length) delete d.extrasProp[pid];
  d.firmasSubidas = now(); save();
}
// «Mis operaciones»: lo enviado desde Asset, como lo usan sync.js y la pantalla de operaciones
// ({ operation, name, date, propId, negocioId, origen, firmantes, tipoFirma, tramite }). Con la API sale de las firmas.
function historialEnvios() {
  if (!API) return require('./store').get('history') || [];
  return todasLasFirmas().filter((f) => f.operacion).map((f) => ({ operation: f.operacion, name: f.plantilla, date: f.fecha, propId: (f.propIds || [])[0] || null, negocioId: f.negocioId || null,
    origen: f.origen || null, firmantes: (f.firmantes || []).map((s) => ({ ...s, calidad: s.calidad || s.rol || null })), tipoFirma: f.tipoFirma || null, tramite: f.tramite || null, ...(f.origen === 'masiva' ? { bulk: true } : {}) }));
}
/** Registra un envío (con o sin propiedad). h: { operation, name, propId?, negocioId?, origen?, firmantes?, tipoFirma?, tramite?, bulk? } */
function registrarEnvio(h) {
  const op = Number(String(h.operation ?? '').replace(/\D/g, ''));
  if (!API) { const st = require('./store'); const l = st.get('history') || []; const i = op ? l.findIndex((x) => Number(x.operation) === op) : -1; const e = { ...h, date: h.date || now() };
    if (i >= 0) l[i] = { ...l[i], ...e }; else l.unshift(e); st.set('history', l.slice(0, 500)); return e; }
  if (!op) return null;
  return agregarFirma({ operacion: op, plantilla: h.name || 'Documento', fecha: h.date || now(), origen: h.origen || (h.bulk ? 'masiva' : 'editor'), negocioId: h.negocioId || null,
    tipoFirma: h.tipoFirma || null, tramite: h.tramite || null, ...(h.firmantes?.length ? { firmantes: h.firmantes.map((s) => ({ ...s, rol: s.rol || s.calidad || null })) } : {}) }, h.propId ? [h.propId] : []);
}

// ---------- cola de escrituras (serializada) ----------
// op: { tipo: 'prop' | 'per', id } diferencia en segundo plano · { tipo: 'neg' | 'ev', id } documento completo · { tipo: 'act', a } historial ·
//     { tipo: 'raw', metodo, ruta, cuerpo } diferencia guardada de una sesión anterior · { tipo: 'fn', fn } escritura que alguien espera
const cola = []; let trabajando = false; let esperas = [];
// lo pendiente queda en su propio archivo (cola-api.json), para no reescribir datos.json en cada entrada del historial
const fCola = () => path.join(dir(), 'cola-api.json');
function escribirCola(x) { try { if (!x) { fs.rmSync(fCola(), { force: true }); return; } const t = fCola() + '.tmp'; fs.writeFileSync(t, JSON.stringify(x)); fs.renameSync(t, fCola()); } catch (e) { console.warn('[inmo] cola:', e.message); } }
function leerCola() { try { return JSON.parse(fs.readFileSync(fCola(), 'utf8')); } catch { return null; } }
const reintentable = (e) => e.code === 'SIN_CONEXION' || e.status >= 500 || e.status === 429;
function persistirCola() {
  if (!API) return;
  const ops = [];
  for (const op of cola) {
    if (op.tipo === 'msgs') ops.push({ tipo: 'msgs', lead: op.lead, ks: op.ks });
    else if (op.tipo === 'act' || op.tipo === 'raw') ops.push(op.tipo === 'act' ? { tipo: 'act', a: op.a } : { tipo: 'raw', metodo: op.metodo, ruta: op.ruta, cuerpo: op.cuerpo, que: op.que });
    else if (op.tipo === 'prop' || op.tipo === 'per') { // lo pendiente, como PATCH listo para mandar
      const x = (op.tipo === 'prop' ? R.props : R.pers).find((y) => y.id === op.id); const b = R.base.get((op.tipo === 'prop' ? 'p:' : 'c:') + op.id);
      if (!x || !b) continue; const dif = op.tipo === 'prop' ? diferenciaProp(x, b) : diferenciaPer(x, b);
      if (Object.keys(dif).length) ops.push({ tipo: 'raw', metodo: 'PATCH', ruta: `/${op.tipo === 'prop' ? 'propiedades' : 'personas'}/${op.id}`, cuerpo: { ...dif, version: b.version }, que: x.codigo || x.nombre || '' });
    } else if (DOCS[op.tipo]) {
      const D = DOCS[op.tipo]; const x = D.lista().find((y) => y.id === op.id); const b = R.base.get(D.pref + op.id); const ruta = `${D.ruta}/${encodeURIComponent(op.id)}`;
      if (x && !(b && docIgual(x, b))) ops.push({ tipo: 'raw', metodo: 'PUT', ruta, cuerpo: docCuerpo(x, b) });
      else if (!x && b) ops.push({ tipo: 'raw', metodo: 'DELETE', ruta });
    }
  }
  escribirCola(ops.length ? { usuarioId: R.usuario?.id || null, ops } : null);
}
function encolar(op) {
  if (!API) return;
  if ((op.tipo === 'prop' || op.tipo === 'per' || DOCS[op.tipo]) && cola.some((x) => x.tipo === op.tipo && x.id === op.id && !x.enviando)) { persistirCola(); return; }
  cola.push(op); persistirCola(); procesar();
}
// una escritura que se espera: va en orden con lo encolado y su error llega a quien la pidió
function enCola(fn) {
  if (!R.usuario) return Promise.reject(err('Inicia sesión en PortalFirma Asset.', 'NEEDS_ASSET_LOGIN'));
  return new Promise((resolver, rechazar) => { cola.push({ tipo: 'fn', fn, resolver, rechazar }); procesar(); });
}
const llamarEnCola = (metodo, ruta, cuerpo) => enCola(() => asset().llamar(metodo, ruta, cuerpo));
function esperarCola(ms = 8000) {
  if (!cola.length || !R.usuario) return Promise.resolve();
  return new Promise((r) => { const t = setTimeout(r, ms); esperas.push(() => { clearTimeout(t); r(); }); });
}
async function procesar() {
  if (trabajando || !R.usuario) return;
  trabajando = true; let espera = 0;
  try {
    while (cola.length && R.usuario) {
      const op = cola[0];
      if (op.tipo === 'fn') { cola.shift(); try { op.resolver(await op.fn()); } catch (e) { op.rechazar(e); } continue; }
      op.enviando = true;
      try {
        if (op.tipo === 'act') {
          let n = 0; while (n < cola.length && n < 100 && cola[n].tipo === 'act') cola[n++].enviando = true;
          await asset().llamar('POST', '/actividad', cola.slice(0, n).map((x) => x.a));
          cola.splice(0, n);
        } else if (op.tipo === 'raw') { recibirRespuesta(op.ruta, await asset().llamar(op.metodo, op.ruta, op.cuerpo)); cola.shift(); }
        else if (DOCS[op.tipo]) { await enviarDoc(op.tipo, op.id); cola.shift(); }
        else if (op.tipo === 'msgs') { await enviarMensajes(op); cola.shift(); }
        else { await enviarDiferencia(op.tipo, op.id); cola.shift(); }
        persistirCola(); espera = 0;
      } catch (e) {
        for (const x of cola) x.enviando = false;
        if (e.code === 'NEEDS_ASSET_LOGIN') { persistirCola(); break; } // sin sesión: se retoma al volver a entrar
        if (reintentable(e)) { espera = Math.min(60000, espera ? espera * 2 : 2000); await dormir(espera); continue; }
        cola.shift(); persistirCola(); await fallo(op, e);
      }
    }
  } finally {
    trabajando = false;
    if (!cola.length) { const w = esperas; esperas = []; w.forEach((f) => f()); }
  }
}
function recibirRespuesta(ruta, x) {
  if (!x || typeof x !== 'object' || !x.id) return;
  if (/^\/propiedades\//.test(ruta)) recibirProp(x); else if (/^\/personas\//.test(ruta)) recibirPer(x);
  else if (/^\/negocios\//.test(ruta)) recibirDoc('neg', x); else if (/^\/eventos\//.test(ruta)) recibirDoc('ev', x);
  else if (/^\/leads\/[^/]+$/.test(ruta)) recibirDoc('lead', x); else if (/^\/firmas\//.test(ruta)) recibirDoc('firma', x);
}
// manda lo que cambió de una propiedad o persona (contra lo último que mandó el servidor) con su versión
async function enviarDiferencia(tipo, id) {
  const esProp = tipo === 'prop'; const x = (esProp ? R.props : R.pers).find((y) => y.id === id); const b = R.base.get((esProp ? 'p:' : 'c:') + id);
  if (!x || !b || x.reservado) return x || null;
  const dif = esProp ? diferenciaProp(x, b) : diferenciaPer(x, b);
  if (!Object.keys(dif).length) return x;
  const enviado = clonar(x);
  const r = await asset().llamar('PATCH', `/${esProp ? 'propiedades' : 'personas'}/${id}`, { ...dif, version: b.version });
  return esProp ? recibirProp(r, enviado) : recibirPer(r, enviado);
}
async function fallo(op, e) {
  const conflicto = e.status === 409;
  if (op.tipo === 'act') { console.warn('[inmo] historial no registrado:', e.message); return; }
  if (op.tipo === 'msgs') { if (e.status !== 404 && e.status !== 403) console.warn('[inmo] mensajes de un lead sin enviar:', e.message); return; }
  // un lead nuevo de un cliente que ya tiene lead (lo recibió otro equipo): leads.js lo une al que existe
  if ((op.tipo === 'lead' || /^\/leads\//.test(op.ruta || '')) && e.code === 'DUPLICADO' && H.leads?.alDuplicado) {
    const id = op.id || decodeURIComponent(String(op.ruta).split('/')[2]);
    try { if (e.datos?.visible) await recargarDoc('lead', e.datos.id); await H.leads.alDuplicado(id, e.datos || {}); } catch (e2) { console.warn('[inmo] lead duplicado:', e2.message); }
    H.cambio('leads'); return;
  }
  const tipoDoc = DOCS[op.tipo] ? op.tipo : /^\/negocios\//.test(op.ruta || '') ? 'neg' : /^\/eventos\//.test(op.ruta || '') ? 'ev' : /^\/leads\//.test(op.ruta || '') ? 'lead' : /^\/firmas\//.test(op.ruta || '') ? 'firma' : null;
  if (tipoDoc) {
    const D = DOCS[tipoDoc]; const id = op.id || decodeURIComponent(String(op.ruta).split('/')[2]);
    if (op.metodo === 'DELETE' && e.status === 404) { R.base.delete(D.pref + id); return; }
    H.avisar(conflicto ? `Otra persona cambió ${D.nombre} recién: se recargó con sus datos. Revisa y vuelve a aplicar tu cambio.` : e.status === 403 || e.status === 404 ? `${D.nombre[0].toUpperCase() + D.nombre.slice(1)} ya no está a tu cargo o se eliminó: se quitó de tu lista.` : `No se pudo guardar ${D.nombre}: ${e.message}`);
    try { await recargarDoc(tipoDoc, id); } catch {}
    H.cambio(D.que); return;
  }
  const esProp = op.tipo === 'prop' || /^\/propiedades\//.test(op.ruta || '');
  const id = op.id || String(op.ruta || '').split('/')[2];
  const x = (esProp ? R.props : R.pers).find((y) => y.id === id);
  const que = esProp ? `la propiedad ${x?.codigo || op.que || ''}`.trim() : `los datos de ${x?.nombre || op.que || 'una persona'}`;
  H.avisar(conflicto ? `Otra persona cambió ${que} recién: se recargó con sus datos. Revisa y vuelve a aplicar tu cambio.` : `No se pudo guardar un cambio en ${que}: ${e.message}`);
  try { if (esProp) await recargarProp(id); else await recargarPer(id); } catch {}
  H.cambio(esProp ? 'propiedades' : 'personas');
}
async function recargarProp(id) {
  R.base.delete('p:' + id);
  try { recibirProp(await asset().llamar('GET', '/propiedades/' + id)); } catch (e) { if (e.status === 404) recibirProp({ id, eliminado: true }); else throw e; }
}
async function recargarPer(id) {
  R.base.delete('c:' + id);
  try { recibirPer(await asset().llamar('GET', '/personas/' + id)); } catch (e) { if (e.status === 404) recibirPer({ id, eliminado: true }); else throw e; }
}

// ---------- carga y sincronización ----------
const marcaDe = (iso) => new Date(new Date(iso || Date.now()).getTime() - 5000).toISOString(); // 5 s de margen: repetir es inocuo
async function traer(ruta, extra = '') {
  const items = []; let cursor = null; let marca = null;
  do {
    const r = await asset().llamar('GET', `${ruta}?limite=500${extra}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    marca ||= r.servidorEn; items.push(...(r.items || [])); cursor = r.siguiente;
  } while (cursor);
  return { items, marca };
}
async function cargarTodo() {
  const [a, b] = await Promise.all([traer('/propiedades', '&archivadas=todas'), traer('/personas')]);
  R.base.clear();
  R.props.length = 0; for (const x of a.items) { R.base.set('p:' + x.id, clonar(x)); R.props.push(conExtras(clonar(x))); }
  R.pers.length = 0; for (const x of b.items) { R.base.set('c:' + x.id, clonar(x)); R.pers.push(clonar(x)); }
  remapearLegado();
  try { await subirNegociosEventos(); } catch (e) { console.warn('[inmo] negocios y eventos locales sin subir:', e.message); }
  try { const t = await H.leads?.subirLocales?.(); if (t) H.avisar(t); } catch (e) { console.warn('[inmo] leads locales sin subir:', e.message); }
  try { await subirFirmasLocales(H.historialLocal ? H.historialLocal() : []); } catch (e) { console.warn('[inmo] firmas locales sin subir:', e.message); }
  const [n, e, ld, fi] = await Promise.all([traer('/negocios'), traer('/eventos'), traer('/leads'), traer('/firmas')]);
  R.negs.length = 0; for (const x of n.items) if (!x.eliminado) { R.base.set('n:' + x.id, clonar(x)); R.negs.push(clonar(x)); }
  R.evs.length = 0; for (const x of e.items) if (!x.eliminado) { R.base.set('e:' + x.id, clonar(x)); R.evs.push(clonar(x)); }
  R.leads.length = 0; for (const x of ld.items) if (!x.eliminado) { R.base.set('l:' + x.id, clonar(x)); R.leads.push(clonar(x)); }
  R.firmas.length = 0; for (const x of fi.items) if (!x.eliminado) { R.base.set('f:' + x.id, clonar(x)); R.firmas.push(clonar(x)); }
  R.negs.sort((x, y) => String(y.creado).localeCompare(String(x.creado)));
  R.leads.sort((x, y) => String(y.creado).localeCompare(String(x.creado)));
  R.marca = { p: marcaDe(a.marca), c: marcaDe(b.marca), n: marcaDe(n.marca), e: marcaDe(e.marca), l: marcaDe(ld.marca), f: marcaDe(fi.marca) }; R.listo = true;
}
let sincronizando = null;
function sincronizar() {
  if (!API || !R.listo || !R.usuario) return Promise.resolve(0);
  return (sincronizando ||= (async () => {
    let n = 0;
    const pendiente = (tipo, id) => cola.some((op) => op.tipo === tipo && op.id === id);
    const a = await traer('/propiedades', `&desde=${encodeURIComponent(R.marca.p)}`);
    const reabrir = [];
    for (const x of a.items) {
      const antes = R.props.find((p) => p.id === x.id); const veia = antes?.duenoVisible;
      if (antes && !x.eliminado && x.version === R.base.get('p:' + x.id)?.version) continue;
      if (pendiente('prop', x.id) && antes) { const b = R.base.get('p:' + x.id); recibirProp(x, b); } else recibirProp(x);
      n++; if (veia === false && x.duenoVisible) reabrir.push(...(x.vinculos || []).filter((v) => v.rol === 'propietario').map((v) => v.personaId));
    }
    const b = await traer('/personas', `&desde=${encodeURIComponent(R.marca.c)}`);
    for (const x of b.items) { const antes = R.pers.find((c) => c.id === x.id); if (antes && !x.eliminado && x.version === R.base.get('c:' + x.id)?.version) continue; recibirPer(x); n++; }
    // pasó a ser captador: el servidor ahora le muestra al dueño (la persona no cambió, así que no vino en la lista)
    for (const id of new Set(reabrir)) await recargarPer(id).catch(() => {});
    if (n) H.cambio('propiedades');
    const marcas = {};
    for (const [tipo, D] of Object.entries(DOCS)) {
      const k = D.pref[0]; const r = await traer(D.ruta, `&desde=${encodeURIComponent(R.marca[k])}`); let m = 0;
      for (const x of r.items) {
        if (pendiente(tipo, x.id)) continue; // lo que se está enviando: si chocó, lo resuelve la cola (409 → recarga)
        const b = R.base.get(D.pref + x.id);
        if (x.eliminado ? !b && !D.lista().some((y) => y.id === x.id) : b && x.version === b.version) continue;
        recibirDoc(tipo, x); m++;
      }
      marcas[k] = marcaDe(r.marca); if (m) { n += m; H.cambio(D.que); }
    }
    R.marca = { ...R.marca, p: marcaDe(a.marca), c: marcaDe(b.marca), ...marcas };
    return n;
  })().catch((e) => { if (e.code !== 'NEEDS_ASSET_LOGIN' && e.code !== 'SIN_CONEXION') console.warn('[inmo] sincronizar:', e.message); return 0; }).finally(() => { sincronizando = null; }));
}
// Negocios y eventos (siguen locales) pueden apuntar a ids del JSON antiguo: se pasan a los de la base (id_legado,
// origen de la importación, código de la propiedad o RUT de la persona).
function remapearLegado() {
  const d = db(); const P0 = new Map(d.propiedades.map((p) => [p.id, p])); const C0 = new Map(d.personas.map((c) => [c.id, c]));
  if (!P0.size && !C0.size) return;
  const mapa = (d.remapeo ||= {}); const props = new Set(R.props.map((p) => p.id)); const pers = new Set(R.pers.map((c) => c.id));
  const propNueva = (id) => {
    if (!id || props.has(id)) return id; if (mapa[id] && props.has(mapa[id])) return mapa[id];
    const v = P0.get(id); if (!v) return id;
    const x = R.props.find((p) => p.idLegado === id) || (v.origen?.id != null && R.props.find((p) => p.origen?.sistema === (v.origen.sistema || 'portalfirma') && String(p.origen?.id) === String(v.origen.id))) || R.props.find((p) => p.codigo && p.codigo === v.codigo);
    if (x) mapa[id] = x.id; return x ? x.id : id;
  };
  const perNueva = (id) => {
    if (!id || pers.has(id)) return id; if (mapa[id] && pers.has(mapa[id])) return mapa[id];
    const v = C0.get(id); if (!v) return id;
    const x = R.pers.find((c) => c.idLegado === id) || (cleanRut(v.rut).length > 1 && R.pers.find((c) => cleanRut(c.rut) === cleanRut(v.rut)));
    if (x) mapa[id] = x.id; return x ? x.id : id;
  };
  let n = 0; const fijar = (o, k, f) => { const nv = f(o[k]); if (nv !== o[k]) { o[k] = nv; n++; } };
  for (const ng of d.negocios || []) { fijar(ng, 'propId', propNueva); fijar(ng, 'clienteId', perNueva); }
  for (const e of d.eventos || []) { fijar(e, 'propId', propNueva); if (Array.isArray(e.personaIds)) { const l = e.personaIds.map(perNueva); if (l.join() !== e.personaIds.join()) { e.personaIds = l; n++; } } }
  if (n) save();
}

let reloj = null;
// al iniciar sesión de Asset: carga la copia de la corredora (y retoma lo que quedó sin enviar de esta persona)
async function iniciar(u) {
  const antes = R.usuario;
  R.usuario = u ? { id: u.id, rol: u.rol, nombre: u.nombre, corredoraId: u.corredoraId } : null;
  if (!API || !u) return;
  if (antes && (antes.corredoraId !== u.corredoraId || antes.id !== u.id)) { R.listo = false; R.base.clear(); R.props.length = 0; R.pers.length = 0; R.negs.length = 0; R.evs.length = 0; R.leads.length = 0; R.firmas.length = 0; }
  const g = leerCola();
  if (g?.ops?.length && !cola.length) { if (g.usuarioId === u.id) cola.push(...g.ops); else escribirCola(null); }
  if (!R.listo) { try { await (R.cargando ||= cargarTodo().finally(() => { R.cargando = null; })); } catch (e) { H.avisar(`No se pudo cargar la cartera desde el servidor: ${e.message}`); } }
  else await sincronizar();
  if (!reloj) { reloj = setInterval(() => { sincronizar(); procesar(); if (!R.listo && R.usuario) iniciar(R.usuario).catch(() => {}); }, 60 * 1000); reloj.unref?.(); }
  procesar();
  if (R.listo) subirLocales();
}
// al cerrar la sesión: manda lo pendiente (unos segundos) y vacía la copia
async function cerrar() {
  if (API) {
    await esperarCola(4000); persistirCola();
    for (const op of cola) if (op.tipo === 'fn') op.rechazar(err('Se cerró la sesión de PortalFirma Asset.', 'NEEDS_ASSET_LOGIN'));
    cola.length = 0; if (reloj) { clearInterval(reloj); reloj = null; } R.listo = false; R.base.clear(); R.props.length = 0; R.pers.length = 0; R.negs.length = 0; R.evs.length = 0; R.leads.length = 0; R.firmas.length = 0; }
  R.usuario = null;
}
const usuario = () => R.usuario;
const listo = () => !API || R.listo;

// ============================================================================ actividad (historial)

function tipoEntidad(id) {
  if (P().some((p) => p.id === id)) return 'propiedad';
  if (C().some((c) => c.id === id)) return 'persona';
  if ((db().negocios || []).some((n) => n.id === id)) return 'negocio';
  if ((db().eventos || []).some((e) => e.id === id)) return 'evento';
  return 'otro';
}
function log(ref, texto, extra = {}) {
  if (!ref || !String(texto ?? '').trim()) return;
  if (API) {
    encolar({ tipo: 'act', a: { entidadTipo: tipoEntidad(ref), entidadId: String(ref).slice(0, 80), texto: String(texto).trim().slice(0, 600), ref2: extra.ref2 ? String(extra.ref2).slice(0, 80) : null, tipo: ['nota', 'lead'].includes(extra.tipo) ? extra.tipo : null } });
    return;
  }
  const d = db(); d.actividad.unshift({ id: uid('a'), fecha: now(), ref, texto: String(texto).slice(0, 600), ...(R.usuario ? { usuarioId: R.usuario.id } : {}), ...extra });
  d.actividad.length = Math.min(d.actividad.length, 5000);
}
const deServidor = (a) => ({ id: a.id, fecha: a.fecha, ref: a.ref, ref2: a.ref2, ...(a.tipo ? { tipo: a.tipo } : {}), texto: a.texto, usuarioId: a.usuarioId, quien: H.nombreUsuario(a.usuarioId) || undefined });
async function actividadDe(id) {
  if (!API) return db().actividad.filter((a) => a.ref === id || a.ref2 === id).slice(0, 200);
  await esperarCola();
  return (await asset().llamar('GET', '/actividad/' + encodeURIComponent(id))).map(deServidor);
}

// ============================================================================ propiedades

const prop = (id) => { const p = P().find((x) => x.id === id); if (!p) throw err('La propiedad ya no existe.'); return p; };
function siguienteCodigo() {
  const n = P().map((p) => Number(String(p.codigo || '').match(/^PF-(\d+)$/)?.[1] || 0));
  return 'PF-' + String(Math.max(1000, ...n) + 1);
}
async function guardarPropiedad(o) {
  const datos = limpiarProp(o);
  if (o.id) {
    const p = prop(o.id); if (o.ficha !== undefined) datos.ficha = FC.limpiarFicha(o.ficha, p.ficha); // los datos nuevos se suman a los que ya había
    const nz = (v) => (v === '' || v === undefined ? null : v);
    const cambios = Object.keys(datos).filter((k) => JSON.stringify(nz(p[k])) !== JSON.stringify(nz(datos[k])));
    if (!cambios.length) return p;
    if (API) {
      Object.assign(p, datos, { actualizado: now() }); guardarExtras(p);
      try { await enCola(() => enviarDiferencia('prop', p.id)); } catch (e) { await recargarProp(p.id).catch(() => {}); throw e; }
      return prop(p.id);
    }
    Object.assign(p, datos, { actualizado: now() });
    if (p.origen) p.editados = [...new Set([...(p.editados || []), ...cambios])]; // la próxima importación respeta lo editado aquí
    const est = cambios.filter((k) => /^estado/.test(k));
    log(p.id, est.length ? `Estado: ${est.map((k) => (k === 'estadoVenta' ? 'venta ' : 'arriendo ') + (p[k] || '—').replace('_', ' ')).join(', ')}` : `Ficha actualizada (${cambios.length} ${cambios.length === 1 ? 'dato' : 'datos'})`);
    save(); return p;
  }
  if (!datos.titulo) throw err('Indica un título para la propiedad.');
  if (!datos.venta && !datos.arriendo) throw err('Marca si la propiedad está en venta, en arriendo o ambas.');
  if (API) {
    const x = await llamarEnCola('POST', '/propiedades', propApi(datos));
    const p = recibirProp(x);
    if ((datos.fotos || []).some((u) => !esWeb(u))) { p.fotos = datos.fotos; guardarExtras(p); }
    return p;
  }
  const p = { id: uid('p'), codigo: datos.codigo || siguienteCodigo(), tipo: 'casa', estadoVenta: datos.venta ? 'disponible' : null, estadoArriendo: datos.arriendo ? 'disponible' : null,
    vinculos: [], documentos: [], fotos: [], creado: now(), actualizado: now(), ...datos };
  P().unshift(p); log(p.id, 'Propiedad creada');
  if (R.usuario?.rol === 'CORREDOR') { p.captadorId = R.usuario.id; log(p.id, `Captada por ${R.usuario.nombre || 'el corredor'}`); } // la que crea un corredor es captación suya
  save(); return p;
}
async function archivarPropiedad(id, archivar = true) {
  if (API) { prop(id); return recibirProp(await llamarEnCola('PUT', `/propiedades/${id}/archivada`, { archivada: !!archivar })); }
  const p = prop(id); p.archivada = !!archivar; p.actualizado = now(); log(id, archivar ? 'Propiedad archivada' : 'Propiedad restaurada'); save(); return p;
}
// captador: un usuario de la corredora (lo asigna el administrador; main.js revisa el permiso)
async function asignarCaptador(propId, captadorId) {
  const p = prop(propId); captadorId = captadorId || null;
  if ((p.captadorId || null) === captadorId) return p;
  if (API) return recibirProp(await llamarEnCola('PUT', `/propiedades/${propId}/captador`, { captadorId }));
  const nombre = (id) => H.nombreUsuario(id);
  if (captadorId && !nombre(captadorId)) throw err('Ese usuario no es de tu corredora.');
  const antes = p.captadorId ? nombre(p.captadorId) || 'otro corredor' : null; const nuevo = captadorId ? nombre(captadorId) : null;
  return parchear(propId, (pp) => { pp.captadorId = captadorId; }, nuevo ? (antes ? `Captador: pasó de ${antes} a ${nuevo}` : `Captada por ${nuevo}`) : `Quedó sin captador${antes ? ` (era ${antes})` : ''}`);
}
async function asignarVarios(ids = [], captadorId) {
  if (!Array.isArray(ids) || !ids.length) throw err('Elige al menos una propiedad.');
  if (API) { const r = await llamarEnCola('POST', '/propiedades/captador', { ids, captadorId: captadorId || null }); await sincronizar(); return r; }
  let n = 0; for (const id of ids) { const p = prop(id); if ((p.captadorId || null) !== (captadorId || null)) { await asignarCaptador(id, captadorId); n++; } }
  return { cambiadas: n, total: ids.length };
}

// ============================================================================ personas (RUT único)

const persona = (id) => { const p = C().find((x) => x.id === id); if (!p) throw err('La persona ya no existe.'); return p; };
const porRut = (rut) => C().find((p) => cleanRut(p.rut) === cleanRut(rut));
// 0.16.16 · ¿es empresa? (RUT de 50 millones o más, o razón social con SpA, Ltda., S.A., EIRL…)
const RS = /\b(spa|s\.?p\.?a\.?|ltda\.?|limitada|s\.\s?a\.?|sociedad an[oó]nima|eirl|e\.i\.r\.l\.?|sociedad|inversiones|inmobiliaria|constructora|comercial|servicios)\b/i;
function esEmpresa(o) { if (!o) return false; if (o.tipo === 'juridica') return true; if (o.tipo === 'natural' && o.tipoFijo) return false;
  const n = Number(String(o.rut || '').replace(/[^0-9kK]/g, '').slice(0, -1)); return n >= 50000000 || RS.test(String(o.nombre || '')); }
const errDup = (e) => (e.status === 409 && e.code === 'DUP_RUT' ? err('Ya existe una persona con ese RUT.', 'DUP_RUT') : e.status === 409 && e.code === 'EN_USO' ? err(e.message, 'EN_USO') : e);
async function guardarPersona(o) {
  const nombre = String(o.nombre || '').trim().replace(/\s+/g, ' ');
  if (!nombre) throw err('Indica el nombre o la razón social.');
  // 0.16.23 · el RUT puede faltar (un interesado que aún no lo da); si viene, debe ser válido
  if (String(o.rut || '').trim() && !validRut(o.rut)) throw err('El RUT no es válido.', 'RUT');
  const email = String(o.email || '').trim(); if (email && !emailOk(email)) throw err('El correo no es válido.');
  const dup = String(o.rut || '').trim() ? porRut(o.rut) : null;
  if (dup && dup.id !== o.id) throw err(`Ya existe ${dup.nombre} con ese RUT.`, 'DUP_RUT');
  const datos = { nombre, rut: String(o.rut || '').trim() ? fmtRut(o.rut) : '', tipo: o.tipo === 'juridica' || o.tipo === 'natural' ? o.tipo : esEmpresa({ nombre, rut: o.rut }) ? 'juridica' : 'natural', email, telefono: String(o.telefono || '').trim(), direccion: String(o.direccion || '').trim(),
    estadoCivil: String(o.estadoCivil || '').trim(), profesion: String(o.profesion || '').trim(), nacionalidad: String(o.nacionalidad || '').trim() || 'chilena',
    roles: [...new Set((o.roles || []).filter((r) => ROLES.includes(r)))], notas: String(o.notas || '').slice(0, 2000) };
  if (o.id) {
    const p = persona(o.id);
    if (API) {
      if (p.reservado) throw err('Los datos de este propietario solo los edita el corredor que captó su propiedad o el administrador.', 'PERMISO');
      Object.assign(p, datos);
      try { await enCola(() => enviarDiferencia('per', p.id)); } catch (e) { await recargarPer(p.id).catch(() => {}); throw errDup(e); }
      return persona(p.id);
    }
    Object.assign(p, datos, { actualizado: now() }); log(p.id, 'Datos actualizados'); save(); return p;
  }
  if (API) { try { return recibirPer(await llamarEnCola('POST', '/personas', perApi(datos))); } catch (e) { throw errDup(e); } }
  const p = { id: uid('c'), ...datos, creado: now(), actualizado: now() };
  C().unshift(p); log(p.id, 'Persona creada'); save(); return p;
}
// 0.16.23 · gestor de leads: cada interesado queda como persona aunque falten datos; lo que llega después se agrega
// (nunca se pisa lo que ya estaba) y cada novedad queda en su historial. Async y de a uno (no se duplica la persona).
const digT = (t) => String(t || '').replace(/\D/g, '').slice(-9);
let colaLeads = Promise.resolve();
function personaDesdeLead(l, opts = {}) { const r = colaLeads.then(() => personaDesdeLead0(l, opts)); colaLeads = r.catch(() => null); return r; }
function deLead(l) { // la persona que ya corresponde a un lead: por su id, RUT, celular o correo
  const t = digT(l.telefono); const em = String(l.email || '').toLowerCase().trim();
  return (l.personaId && C().find((x) => x.id === l.personaId)) || (l.rut && validRut(l.rut) && porRut(l.rut))
    || (t.length >= 8 && C().find((x) => digT(x.telefono) === t)) || (em && C().find((x) => String(x.email || '').toLowerCase() === em)) || null;
}
function nuevaDeLead(l, esLead) {
  const t = digT(l.telefono); const em = String(l.email || '').toLowerCase().trim(); const nombre = String(l.nombre || '').trim() || String(l.chatCon || '').trim();
  if (!nombre && !t && !em) return null;
  return { nombre: nombre || l.telefono || l.email || 'Interesado', rut: '', tipo: 'natural', email: em, telefono: String(l.telefono || '').trim(), direccion: '', estadoCivil: '', profesion: '', nacionalidad: 'chilena',
    roles: ['interesado'], notas: '', ...(esLead ? { leadId: l.id } : {}), ...(l.corredor !== undefined ? { corredor: l.corredor || null } : {}) };
}
const llegoLog = (p, l, esLead) => log(p.id, `Llegó como interesado por ${l.origenTxt || l.origen || 'un canal'}${l.ig?.usuario ? ' (@' + l.ig.usuario + ')' : ''}`, { tipo: 'lead', ...(esLead ? { ref2: l.id } : {}) });
// lo que llega después se agrega (sin pisar lo que ya estaba) y queda en el historial
function completarDeLead(p, l, { evento = null, esLead = true, nueva = false } = {}) {
  if (p.reservado) return p;
  const em = String(l.email || '').toLowerCase().trim(); const nombre = String(l.nombre || '').trim() || String(l.chatCon || '').trim();
  const agregado = [];
  const poner = (k, v, txt) => { v = String(v || '').trim(); if (v && !String(p[k] || '').trim()) { p[k] = v; agregado.push(txt); } };
  if (p.nombre === 'Interesado' || /^[+\d\s().-]+$/.test(p.nombre) || /@/.test(p.nombre)) { if (nombre && !/^[+\d\s().-]+$/.test(nombre)) { p.nombre = nombre; agregado.push('nombre'); } }
  poner('telefono', l.telefono, 'teléfono'); if (!API || emailOk(em)) poner('email', em, 'correo');
  if (l.rut && validRut(l.rut) && !p.rut && !(porRut(l.rut) && porRut(l.rut) !== p)) { p.rut = fmtRut(l.rut); agregado.push('RUT'); }
  p.roles ||= []; if (!p.roles.includes('interesado') && !p.roles.length) p.roles.push('interesado');
  if (esLead) p.leadId ||= l.id;
  if (l.corredor !== undefined && (p.corredor?.id || null) !== (l.corredor?.id || null)) p.corredor = l.corredor || null;
  if (agregado.length && !nueva) log(p.id, `Se agregó su ${agregado.join(', ')} (desde Leads)`, { tipo: 'lead', ref2: l.id });
  if (evento) log(p.id, evento, { tipo: 'lead', ref2: l.id });
  p.actualizado = now();
  if (API) encolar({ tipo: 'per', id: p.id }); else save();
  return p;
}
// en el JSON local todo es inmediato (lo usa también registrarLead)
function personaDesdeLeadLocal(l, { evento = null, esLead = true } = {}) {
  let p = deLead(l); let nueva = false;
  if (!p) { const datos = nuevaDeLead(l, esLead); if (!datos) return null; p = { id: uid('c'), ...datos, creado: now(), actualizado: now() }; C().unshift(p); nueva = true; llegoLog(p, l, esLead); }
  return completarDeLead(p, l, { evento, esLead, nueva });
}
async function personaDesdeLead0(l, { evento = null, esLead = true } = {}) {
  if (!API) return personaDesdeLeadLocal(l, { evento, esLead });
  if (!R.listo) return null; // sin la copia cargada no se sabe si ya existe
  let p = deLead(l); let nueva = false;
  if (!p) { const datos = nuevaDeLead(l, esLead); if (!datos) return null; p = recibirPer(await llamarEnCola('POST', '/personas', perApi(datos))); nueva = true; llegoLog(p, l, esLead); }
  return completarDeLead(p, l, { evento, esLead, nueva });
}
async function borrarPersona(id) {
  const p = persona(id);
  const uso = P().filter((x) => (x.vinculos || []).some((v) => v.personaId === id));
  if (uso.length) throw err(`No se puede eliminar: está vinculada a ${uso.length === 1 ? 'la propiedad ' + uso[0].codigo : uso.length + ' propiedades'}. Quita primero el vínculo.`, 'EN_USO');
  if (API) { try { await llamarEnCola('DELETE', `/personas/${id}`); } catch (e) { throw errDup(e); } recibirPer({ id, eliminado: true }); return true; }
  const d = db(); d.personas = d.personas.filter((x) => x !== p); save(); return true;
}

// ---------- vínculos persona ↔ propiedad ----------
async function vincular(propId, personaId, rol) {
  const p = prop(propId); const c = persona(personaId); if (!ROLES.includes(rol)) throw err('Rol no válido.');
  p.vinculos ||= [];
  if (p.vinculos.some((v) => v.personaId === personaId && v.rol === rol)) return p;
  if (API) {
    const x = recibirProp(await llamarEnCola('POST', `/propiedades/${propId}/vinculos`, { personaId, rol }));
    if (!(c.roles ||= []).includes(rol)) { c.roles.push(rol); const b = R.base.get('c:' + c.id); if (b && !(b.roles || []).includes(rol)) b.roles = [...(b.roles || []), rol]; }
    return x;
  }
  p.vinculos.push({ personaId, rol, desde: now() });
  if (!c.roles.includes(rol)) c.roles.push(rol);
  p.actualizado = now(); log(p.id, `${c.nombre} vinculado como ${rol}`, { ref2: c.id }); save(); return p;
}
async function desvincular(propId, personaId, rol) {
  const p = prop(propId); const c = C().find((x) => x.id === personaId);
  if (API) return recibirProp(await llamarEnCola('DELETE', `/propiedades/${propId}/vinculos`, { personaId, rol }));
  p.vinculos = (p.vinculos || []).filter((v) => !(v.personaId === personaId && v.rol === rol));
  p.actualizado = now(); log(p.id, `${c?.nombre || 'Persona'} ya no figura como ${rol}`, { ref2: personaId }); save(); return p;
}

// ---------- notas y documentos ----------
async function nota(ref, texto) {
  if (!String(texto || '').trim()) throw err('Escribe la nota.');
  if (API) return (await llamarEnCola('POST', '/actividad/notas', { entidadTipo: tipoEntidad(ref), entidadId: String(ref), texto: String(texto).trim().slice(0, 600) })).map(deServidor);
  log(ref, String(texto).trim(), { tipo: 'nota' }); save(); return actividadDe(ref);
}
// Archivos de la propiedad. Con la API: fotos y documentos van a R2 (la API entrega una URL firmada, el archivo se sube
// directo y la API lo confirma); los documentos que se abren quedan en una copia local (documentos/<propiedad>/<doc>/).
// En PF_MOCK: en este computador, como siempre.
const docsDir = (id) => { const d = path.join(dir(), 'documentos', id.replace(/[^a-z0-9-]/gi, '')); fs.mkdirSync(d, { recursive: true }); return d; };
const MIME = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', txt: 'text/plain' };
const mimeDe = (nombre) => MIME[path.extname(nombre).slice(1).toLowerCase()] || 'application/octet-stream';
const DOC_MAX = 50 * 1024 * 1024; const FOTO_MAX = 15 * 1024 * 1024;
async function subirR2(url, buf, tipo) {
  let r;
  try { r = await fetch(url, { method: 'PUT', headers: { 'content-type': tipo }, body: buf, signal: AbortSignal.timeout(Math.max(60000, buf.length / 50)) }); } // ≥ 50 KB/s
  catch { throw err('No se pudo subir el archivo. Revisa tu conexión a internet.', 'SIN_CONEXION'); }
  if (!r.ok) throw err(`No se pudo subir el archivo (el almacenamiento respondió ${r.status}).`);
}
/** Sube fotos ({ buf, tipo, ref? }: JPG, PNG o WebP; ref queda al inicio del nombre) de una propiedad y devuelve sus URLs públicas (aún no quedan en la propiedad). */
async function subirFotos(propId, fotos) {
  if (!API) throw err('Las fotos se suben solo con la cuenta de Asset.');
  const out = [];
  for (let i = 0; i < fotos.length; i += 40) {
    const tanda = fotos.slice(i, i + 40);
    for (const f of tanda) if (f.buf.length > FOTO_MAX) throw err('Una foto pesa más de 15 MB.');
    const { subidas } = await asset().llamar('POST', `/propiedades/${propId}/fotos/subidas`, { archivos: tanda.map((f) => ({ tipo: f.tipo || 'image/jpeg', tamano: f.buf.length, ...(f.ref ? { ref: f.ref } : {}) })) });
    for (let j = 0; j < tanda.length; j += 4) await Promise.all(tanda.slice(j, j + 4).map((f, k) => subirR2(subidas[j + k].subida, f.buf, f.tipo || 'image/jpeg'))); // de a 4
    out.push(...subidas.map((x) => x.url));
  }
  return out;
}
async function subirDocumento(propId, src, tipo = 'otro', nombre = path.basename(src)) {
  const buf = fs.readFileSync(src);
  if (!buf.length) throw err(`«${nombre}» está vacío.`);
  if (buf.length > DOC_MAX) throw err(`«${nombre}» pesa más de 50 MB.`);
  const tipoArchivo = mimeDe(nombre);
  const { clave, subida } = await asset().llamar('POST', `/propiedades/${propId}/documentos/subida`, { nombre, tipoArchivo, tamano: buf.length });
  await subirR2(subida, buf, tipoArchivo);
  return recibirProp(await asset().llamar('POST', `/propiedades/${propId}/documentos`, { clave, nombre, tipo, tamano: buf.length }));
}
async function agregarDocumentos(propId, paths, tipo = 'otro') {
  const p = prop(propId);
  if (API) {
    let ult = p; const fallas = [];
    for (const src of paths) {
      try { if (!fs.statSync(src).isFile()) continue; ult = (await subirDocumento(propId, src, tipo)) || ult; }
      catch (e) { fallas.push(`${path.basename(src)}: ${e.message}`); }
    }
    if (fallas.length) { if (fallas.length === paths.length) throw err(fallas.join(' · ')); H.avisar(`No se pudieron agregar: ${fallas.join(' · ')}`); }
    return ult;
  }
  const out = docsDir(propId); p.documentos ||= [];
  for (const src of paths) {
    const st = fs.statSync(src); if (!st.isFile()) continue;
    let name = path.basename(src); let dest = path.join(out, name); let n = 2;
    while (fs.existsSync(dest)) { const e = path.extname(name); dest = path.join(out, `${path.basename(name, e)} (${n++})${e}`); }
    fs.copyFileSync(src, dest);
    p.documentos.unshift({ id: uid('d'), nombre: path.basename(dest), path: dest, tipo, size: st.size, fecha: now() });
    log(p.id, `Documento agregado: ${path.basename(dest)}`);
  }
  p.actualizado = now(); save(); return p;
}
async function quitarDocumento(propId, docId) {
  const p = prop(propId); const doc = (p.documentos || []).find((x) => x.id === docId); if (!doc) return p;
  if (API && !doc.path) {
    const x = recibirProp(await asset().llamar('DELETE', `/propiedades/${propId}/documentos/${docId}`));
    fs.rmSync(path.join(docsDir(propId), docId), { recursive: true, force: true });
    return x;
  }
  p.documentos = p.documentos.filter((x) => x !== doc); try { fs.unlinkSync(doc.path); } catch {}
  log(p.id, `Documento quitado: ${doc.nombre}`); if (API) guardarExtras(p); else save(); return p;
}
/** Ruta local del documento para abrirlo: con la API lo baja (la primera vez, o si cambió de tamaño). */
async function docPath(propId, docId) {
  const doc = (prop(propId).documentos || []).find((x) => x.id === docId);
  if (doc?.path) { if (!fs.existsSync(doc.path)) throw err('El archivo ya no está.'); return doc.path; }
  if (!doc || !API) throw err('El archivo ya no está.');
  const carpeta = path.join(docsDir(propId), docId); const destino = path.join(carpeta, doc.nombre.replace(/[\\/:*?"<>|]/g, '_'));
  try { if (fs.statSync(destino).size === doc.size) return destino; } catch {}
  const { url } = await asset().llamar('GET', `/propiedades/${propId}/documentos/${docId}/descarga`);
  let r;
  try { r = await fetch(url, { signal: AbortSignal.timeout(120000) }); } catch { throw err('No se pudo bajar el documento. Revisa tu conexión a internet.', 'SIN_CONEXION'); }
  if (!r.ok) throw err('No se pudo bajar el documento.');
  fs.mkdirSync(carpeta, { recursive: true }); const tmp = destino + '.parcial';
  fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer())); fs.renameSync(tmp, destino);
  return destino;
}
const mostrarCarpeta = (propId) => shell.openPath(docsDir(propId));

// Lo que quedó guardado solo en este computador antes de R2 (documentos en extrasProp y fotos pffoto://) se sube una
// vez, en segundo plano, al iniciar sesión. Lo que no se pueda subir queda local y se reintenta en el próximo inicio.
let migrando = null;
function subirLocales() {
  migrando ||= (async () => {
    const ex = db().extrasProp || {}; let docs = 0; let fotos = 0;
    for (const id of Object.keys(ex)) {
      if (!R.usuario) break;
      const p = P().find((x) => x.id === id); if (!p) continue;
      for (const d of (ex[id]?.documentos || []).filter((x) => x.path)) {
        if (!fs.existsSync(d.path)) { quitarLocal(id, d.id); continue; }
        try { await subirDocumento(id, d.path, d.tipo || 'otro', d.nombre); quitarLocal(id, d.id); try { fs.unlinkSync(d.path); } catch {} docs++; }
        catch (e) { console.warn('[inmo] documento local sin subir:', d.nombre, e.message); }
      }
      const locales = (p.fotos || []).filter((u) => /^pffoto:\/\/f\//.test(u));
      if (!locales.length) continue;
      try {
        const base = path.resolve(dir(), 'fotos');
        const archivos = locales.map((u) => path.resolve(base, decodeURIComponent(u.replace(/^pffoto:\/\/f\//, ''))));
        const hay = archivos.map((f) => f.startsWith(base + path.sep) && fs.existsSync(f));
        const urls = await subirFotos(id, archivos.filter((_, i) => hay[i]).map((f) => ({ buf: fs.readFileSync(f), tipo: 'image/jpeg' })));
        const mapa = new Map(); let k = 0; locales.forEach((u, i) => mapa.set(u, hay[i] ? urls[k++] : null));
        parchear(id, (pp) => { pp.fotos = (pp.fotos || []).map((u) => (mapa.has(u) ? mapa.get(u) : u)).filter(Boolean); });
        fotos += urls.length;
      } catch (e) { console.warn('[inmo] fotos locales sin subir:', id, e.message); }
    }
    if (docs || fotos) H.avisar(`Se subieron al servidor ${[docs && `${docs} ${docs === 1 ? 'documento' : 'documentos'}`, fotos && `${fotos} ${fotos === 1 ? 'foto' : 'fotos'}`].filter(Boolean).join(' y ')} que estaban solo en este computador.`);
  })().catch((e) => console.warn('[inmo] subir locales:', e.message)).finally(() => { migrando = null; });
  return migrando;
}
function quitarLocal(propId, docId) {
  const e = db().extrasProp?.[propId]; if (!e?.documentos) return;
  e.documentos = e.documentos.filter((x) => x.id !== docId); if (!e.documentos.length) delete e.documentos;
  if (!Object.keys(e).length) delete db().extrasProp[propId];
  save();
  const p = P().find((x) => x.id === propId); if (p) p.documentos = (p.documentos || []).filter((x) => x.id !== docId);
}

// ============================================================================ importación desde Portalfirma (MCP: property_manage_tools)

const html2txt = (s) => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
function desdePF(x) {
  const fotos = (x.photoItems?.length ? [...x.photoItems].sort((a, b) => (b.is_featured - a.is_featured) || a.sort_order - b.sort_order).map((f) => f.url) : x.photos) || [];
  return limpiarProp({
    codigo: x.code, titulo: x.title, tipo: x.tipo, venta: x.sale, arriendo: x.rent,
    precioVenta: x.sale && x.price_sale != null ? { valor: x.price_sale, moneda: x.currency_sale } : null,
    precioArriendo: x.rent && x.price_rent != null ? { valor: x.price_rent, moneda: x.currency_rent } : null,
    estadoVenta: x.sale ? (x.estado_sale || 'disponible') : null, estadoArriendo: x.rent ? (x.estado_rent || 'disponible') : null,
    direccion: String(x.address || '').replace(/\s+/g, ' ').trim(), unidad: x.unit != null ? String(x.unit) + (x.letter || '') : '', comuna: x.districtName || '', region: x.region || '',
    rol: x.role || '', supTotal: x.total_surface, supUtil: x.built_surface, dormitorios: x.bedrooms, banos: x.bathrooms, estacionamientos: x.parkings, bodegas: x.warehouses,
    amoblado: x.amoblado, descripcion: html2txt(x.observations), fotos,
    corredor: x.broker_name ? { nombre: x.broker_name, email: x.broker_email || '', telefono: x.broker_phone || '' } : null,
  });
}
const inactivaPF = (x) => !!(x.convecta_status?.state?.name && !/^\s*activa\s*$/i.test(x.convecta_status.state.name));
// pf.callRaw(name, args) → { text, isError }. Lee todas las páginas y el detalle de cada propiedad.
async function leerPF(pf, progreso) {
  const call = async (args) => { const r = await pf.callRaw('property_manage_tools', args); if (r.isError) throw err('Portalfirma: ' + r.text); return JSON.parse(r.text); };
  const ids = []; let page = 1, pages = 1;
  do { const r = await call({ action: 'search', page, page_size: 50 }); ids.push(...(r.items || []).map((i) => i.id)); pages = r.total_pages || 1; page++; } while (page <= pages && page <= 40);
  const out = []; let errores = 0;
  for (let i = 0; i < ids.length; i++) {
    progreso({ i: i + 1, total: ids.length });
    let x; for (let k = 0; ; k++) { try { x = await call({ action: 'get', id_property: ids[i] }); break; } catch (e) { if (k >= 2 || e.code === 'NEEDS_LOGIN' || /NEEDS_LOGIN/.test(e.message)) { if (/NEEDS_LOGIN/.test(e.message) || e.code === 'NEEDS_LOGIN') throw e; errores++; x = null; break; } await dormir(800 * (k + 1)); } }
    if (x) out.push(x);
  }
  return { items: out, total: ids.length, errores };
}
async function importarPF(pf, progreso = () => {}) {
  const leido = await leerPF(pf, progreso);
  const res = { nuevas: 0, actualizadas: 0, sinCambios: 0, personas: 0, total: leido.total, ...(leido.errores ? { errores: leido.errores } : {}) };
  if (API) {
    // a la base, por tandas de 100: crea o actualiza por (sistema, id en Portalfirma) y respeta lo editado en Asset
    const ya = new Set(R.props.filter((p) => p.origen?.sistema === 'portalfirma').map((p) => String(p.origen.id)));
    const items = leido.items.map((x) => ({
      origenId: String(x.id), origenDatos: { fuente: x.source || '', externo: x.external_id ?? null, sincronizado: x.synced_at || null, importado: now() },
      datos: propApi(desdePF(x)),
      propietario: x.owner_rut && validRut(x.owner_rut) ? { nombre: String(x.owner_name || 'Propietario').trim().slice(0, 200), rut: fmtRut(x.owner_rut), email: x.owner_email || null, telefono: x.owner_phone ? String(x.owner_phone).slice(0, 40) : null } : null,
    }));
    for (let i = 0; i < items.length; i += 100) {
      const r = await llamarEnCola('POST', '/propiedades/importar', { sistema: 'portalfirma', items: items.slice(i, i + 100) });
      for (const k of ['nuevas', 'actualizadas', 'sinCambios', 'personas']) res[k] += r[k] || 0;
    }
    await sincronizar();
    for (const x of leido.items) if (inactivaPF(x) && !ya.has(String(x.id))) { // las inactivas en Portalfirma llegan archivadas
      const p = R.props.find((q) => q.origen?.sistema === 'portalfirma' && String(q.origen.id) === String(x.id));
      if (p && !p.archivada) await archivarPropiedad(p.id, true).catch(() => {});
    }
    const d = db(); d.ultimaImportacion = { fecha: now(), ...res }; save(); H.cambio('propiedades'); return res;
  }
  const d = db();
  for (const x of leido.items) {
    const datos = desdePF(x); const inactiva = inactivaPF(x);
    let p = d.propiedades.find((q) => q.origen?.id === x.id);
    if (!p) {
      p = { id: uid('p'), vinculos: [], documentos: [], creado: now(), ...datos, actualizado: now(), origen: { sistema: 'portalfirma', id: x.id, fuente: x.source || '', externo: x.external_id ?? null, sincronizado: x.synced_at || null, importado: now() }, ...(inactiva ? { archivada: true } : {}) };
      d.propiedades.push(p); res.nuevas++; log(p.id, `Importada desde Portalfirma${x.source ? ' (origen ' + x.source + ')' : ''}`);
    } else {
      const libres = Object.keys(datos).filter((k) => !(p.editados || []).includes(k) && JSON.stringify(p[k]) !== JSON.stringify(datos[k]));
      for (const k of libres) p[k] = datos[k];
      p.origen = { ...p.origen, sincronizado: x.synced_at || p.origen.sincronizado, importado: now() };
      if (libres.length) { p.actualizado = now(); res.actualizadas++; log(p.id, `Actualizada desde Portalfirma (${libres.length} ${libres.length === 1 ? 'dato' : 'datos'})`); } else res.sinCambios++;
    }
    if (x.owner_rut && validRut(x.owner_rut)) { // el propietario pasa al CRM con su RUT
      let c = porRut(x.owner_rut);
      if (!c) { c = { id: uid('c'), nombre: String(x.owner_name || 'Propietario').trim(), rut: fmtRut(x.owner_rut), tipo: 'natural', email: x.owner_email || '', telefono: x.owner_phone || '', direccion: '', roles: ['propietario'], notas: '', nacionalidad: 'chilena', creado: now(), actualizado: now() }; d.personas.push(c); res.personas++; log(c.id, 'Creada al importar propiedades de Portalfirma'); }
      if (!(p.vinculos || []).some((v) => v.personaId === c.id && v.rol === 'propietario')) { p.vinculos.push({ personaId: c.id, rol: 'propietario', desde: now() }); if (!c.roles.includes('propietario')) c.roles.push('propietario'); }
    }
  }
  d.ultimaImportacion = { fecha: now(), ...res }; save(); return res;
}

// ============================================================================ acceso para otros módulos

const obtener = (id) => prop(id);
// cambio puntual hecho por otro módulo (portales, firmas, fotos, interesados…): se aplica ya y se envía en segundo plano
function parchear(id, fn, texto) {
  const p = prop(id); fn(p); p.actualizado = now(); if (texto) log(id, texto);
  if (API) { guardarExtras(p); encolar({ tipo: 'prop', id }); } else save();
  return p;
}
const todas = () => P();
const negocios = () => (API ? R.negs : (db().negocios ||= []));
const eventos = () => (API ? R.evs : (db().eventos ||= []));
// guardar(): lo que negocios.js, agenda.js y otros cambiaron. Con la API, además, encola lo que cambió de negocios y eventos
function guardarTodo() { save(); detectarDocs(); }
const personaPorId = (id) => C().find((x) => x.id === id) || null;
FC.propietario.buscar = personaPorId;
const registrar = (ref, texto, extra) => log(ref, texto, extra);
function config() { return db().config || {}; }
function guardarConfig(parcial) { const d = db(); d.config = { ...(d.config || {}), ...parcial }; save(); return d.config; }
// Interesado que llega desde un portal: queda en la ficha; si trae RUT válido entra al CRM como «interesado».
function registrarLead(propId, l) {
  const p = prop(propId); p.leads ||= [];
  if (p.leads.some((x) => x.id === l.id)) return false;
  p.leads.unshift({ ...l, recibido: now() }); p.leads.length = Math.min(p.leads.length, 300);
  if (API) { // la ficha se envía ya; la persona y su vínculo, en segundo plano
    log(p.id, `Nuevo interesado desde ${l.portal}: ${l.nombre || 'sin nombre'} (${l.canalTxt || l.canal})`, { tipo: 'lead' });
    encolar({ tipo: 'prop', id: p.id });
    (async () => {
      let c = null;
      if (l.rut && validRut(l.rut)) {
        c = porRut(l.rut);
        if (!c) { try { c = await guardarPersona({ nombre: String(l.nombre || 'Interesado').trim(), rut: l.rut, email: emailOk(l.email) ? l.email : '', telefono: l.telefono || '', roles: ['interesado'] }); log(c.id, `Llegó como interesado desde ${l.portal}`); } catch { c = porRut(l.rut) || null; } }
      } else if (l.telefono || l.email) c = await personaDesdeLead({ id: l.id, nombre: l.nombre, telefono: l.telefono, email: l.email, origenTxt: l.portal }, { esLead: false });
      if (c && !(prop(propId).vinculos || []).some((v) => v.personaId === c.id && v.rol === 'interesado')) await vincular(propId, c.id, 'interesado');
      H.cambio('propiedades');
    })().catch((e) => console.warn('[inmo] interesado del portal:', e.message));
    return true;
  }
  let c = null;
  if (l.rut && validRut(l.rut)) {
    c = porRut(l.rut);
    if (!c) { c = { id: uid('c'), nombre: String(l.nombre || 'Interesado').trim(), rut: fmtRut(l.rut), tipo: 'natural', email: l.email || '', telefono: l.telefono || '', direccion: '', roles: ['interesado'], notas: '', nacionalidad: 'chilena', creado: now(), actualizado: now() }; db().personas.push(c); log(c.id, `Llegó como interesado desde ${l.portal}`); }
  } else if (l.telefono || l.email) { // sin RUT: igual queda como persona (0.16.23)
    c = personaDesdeLeadLocal({ id: l.id, nombre: l.nombre, telefono: l.telefono, email: l.email, origenTxt: l.portal }, { esLead: false });
  }
  if (c) { p.vinculos ||= []; if (!p.vinculos.some((v) => v.personaId === c.id && v.rol === 'interesado')) { p.vinculos.push({ personaId: c.id, rol: 'interesado', desde: now() }); if (!c.roles.includes('interesado')) c.roles.push('interesado'); } }
  log(p.id, `Nuevo interesado desde ${l.portal}: ${l.nombre || 'sin nombre'} (${l.canalTxt || l.canal})`, { tipo: 'lead', ref2: c?.id });
  return true;
}

// ============================================================================ lectura para la interfaz

function listar() { return { propiedades: P(), personas: C(), ultimaImportacion: db().ultimaImportacion || null, sincronizada: listo() }; }
const nombreDeRef = (id) => P().find((p) => p.id === id)?.titulo || C().find((p) => p.id === id)?.nombre || '';
async function resumen() {
  const act = P().filter((p) => !p.archivada);
  const c = (f) => act.filter(f).length;
  let recientes;
  if (API) { await esperarCola(); try { recientes = ((await asset().llamar('GET', '/actividad?limite=12')).items || []).map(deServidor); } catch { recientes = []; } }
  else recientes = db().actividad.slice(0, 12);
  return {
    propiedades: act.length, personas: C().length,
    venta: { disponible: c((p) => p.venta && p.estadoVenta === 'disponible'), reservada: c((p) => p.venta && p.estadoVenta === 'reservada'), vendida: c((p) => p.venta && p.estadoVenta === 'vendida') },
    arriendo: { disponible: c((p) => p.arriendo && p.estadoArriendo === 'disponible'), reservada: c((p) => p.arriendo && p.estadoArriendo === 'reservada'), arrendada: c((p) => p.arriendo && p.estadoArriendo === 'arrendada') },
    sinPropietario: c((p) => !(p.vinculos || []).some((v) => v.rol === 'propietario')),
    sinFotos: c((p) => !(p.fotos || []).length),
    conLeads: c((p) => (p.leads || []).some((l) => !l.visto)),
    enPortal: c((p) => ['venta', 'arriendo'].some((op) => p.portales?.pi?.[op]?.status === 'active')),
    actividad: recientes.map((a) => ({ ...a, nombre: nombreDeRef(a.ref) })),
    ultimaImportacion: db().ultimaImportacion || null,
  };
}
// Toda la actividad (pantalla «Actividad»): con el nombre de lo que tocó, filtros y páginas
async function actividadTodas({ q = '', clase = '', desde = 0, limite = 60 } = {}) {
  const d = db(); const Pm = new Map(P().map((p) => [p.id, p])); const Cm = new Map(C().map((p) => [p.id, p]));
  const N = new Map((d.negocios || []).map((n) => [n.id, n])); const E = new Map((d.eventos || []).map((e) => [e.id, e]));
  const nombreDe = (id, cl) => {
    if (Pm.has(id)) { const p = Pm.get(id); return { clase: 'propiedad', nombre: `${p.codigo} · ${p.titulo}`, ir: id }; }
    if (Cm.has(id)) return { clase: 'persona', nombre: Cm.get(id).nombre, ir: id };
    if (N.has(id)) { const n = N.get(id); const p = Pm.get(n.propId); const c = Cm.get(n.clienteId); return { clase: 'negocio', nombre: `Negocio de ${n.tipo}${c ? ' · ' + c.nombre : ''}${p ? ' · ' + p.codigo : ''}`, ir: id }; }
    if (E.has(id)) { const e = E.get(id); return { clase: 'agenda', nombre: e.titulo || 'Evento', ir: e.fecha }; }
    return { clase: cl === 'evento' ? 'agenda' : cl || 'otro', nombre: '', ir: null };
  };
  const t = String(q || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const min = (f) => String(f || '').slice(0, 16); const out = []; let total = 0; let prev = null; let hayMas = false;
  const revisar = (a) => {
    const repetida = prev && min(prev.fecha) === min(a.fecha) && (prev.texto === a.texto || String(prev.texto).startsWith(a.texto) || String(a.texto).startsWith(prev.texto)); // la misma acción en la propiedad y en su negocio
    prev = a; if (repetida) return;
    const x = { id: a.id, fecha: a.fecha, texto: a.texto, nota: a.tipo === 'nota', ...(a.quien ? { quien: a.quien } : {}), ...nombreDe(a.ref, a.clase) };
    if (clase && (clase === 'nota' ? !x.nota : x.clase !== clase)) return;
    if (t && !`${x.nombre} ${x.texto}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(t)) return;
    if (total >= desde && out.length < limite) out.push(x); total++;
  };
  if (!API) { for (const a of d.actividad) revisar(a); return { items: out, total }; }
  // en la base: por páginas (de la más reciente), hasta llenar la página pedida y saber si hay más
  await esperarCola(); let antes = null;
  for (let i = 0; i < 25; i++) {
    const r = await asset().llamar('GET', `/actividad?limite=200${antes ? '&antesDe=' + antes : ''}`);
    for (const a of r.items || []) revisar({ ...deServidor(a), clase: a.clase });
    if (!r.siguiente) break; antes = r.siguiente;
    if (out.length >= limite && total > desde + limite) { hayMas = true; break; }
  }
  return { items: out, total: hayMas ? total + 1 : total };
}
function exportarDatos() { return { ...clonar(db()), propiedades: clonar(P()), personas: clonar(C()) }; }
const _reset = () => { cache = null; };

module.exports = { personaDesdeLead, esEmpresa, eventos, negocios, personaPorId, registrar, obtener, parchear, todas, config, guardarConfig, registrarLead, guardar: guardarTodo, TIPOS, ESTADOS, ROLES, validRut, fmtRut, listar, resumen, guardarPropiedad, archivarPropiedad, guardarPersona, borrarPersona, vincular, desvincular,
  nota, actividadDe, actividadTodas, agregarDocumentos, quitarDocumento, docPath, mostrarCarpeta, subirFotos, importarPF, desdePF, exportarDatos, _reset,
  // repositorio (sesión de Asset y sincronización)
  API, configurar, iniciar, cerrar, sincronizar, firmasDe, todasLasFirmas, agregarFirma, actualizarFirma, firmaDeOperacion, historialEnvios, registrarEnvio, leadsLista: () => R.leads, encolarMensajes, subirR2, recargarLead: (id) => recargarDoc('lead', id), esperarCola, usuario, listo, asignarCaptador, asignarVarios };
