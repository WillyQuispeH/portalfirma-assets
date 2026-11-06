// Portal Inmobiliario (Mercado Libre Chile, sitio MLC) para PortalFirma Asset.
// Documentación: developers.mercadolibre.cl → Guía para inmuebles (revisada el 12/10/2026).
//  · La conexión es de la CORREDORA y vive en el servidor de Asset (tabla conexiones, cifrada): la app de Asset en
//    Mercado Libre (client_id y secreto) está solo en el servidor y el administrador conecta la cuenta una vez
//    (POST /v1/conexiones/mercadolibre/iniciar → se abre en el navegador). Este equipo no guarda tokens de Mercado Libre:
//    cada llamada a la API de Mercado Libre pasa por el proxy POST /v1/mercadolibre/api, que pone el token y lo renueva.
//  · En modo de prueba (PF_MOCK / PF_ML_MOCK) se usa la API simulada (mercadolibre-mock.js) con una sesión local falsa.
//  · POST /items con el atributo CMG_SITE = "POI" publica a la vez en Mercado Libre y Portal Inmobiliario.
//  · seller_contact.country_code2 + phone2 (WhatsApp, solo dígitos) son obligatorios desde el 01/10/2026.
//  · PUT /items/{id} actualiza título, precio, fotos, contacto y estado (active, paused, closed).
//  · Leads: GET /vis/users/{id}/leads/buyers (WhatsApp, preguntas, llamadas, visitas, cotizaciones).
const { shell } = require('electron');
const store = require('../store');
const inmo = require('../inmo');

const API = 'https://api.mercadolibre.com';
const ROOT = 'MLC1459'; // Inmuebles (Chile)
const MOCK = process.env.PF_ML_MOCK === '1' || (process.env.PF_MOCK === '1' && process.env.PF_ML_MOCK !== '0'); // en modo demostración se usa la API simulada
const mock = MOCK ? require('./mercadolibre-mock') : null;
const PORTAL = 'Portal Inmobiliario';
const asset = () => require('../asset');
const err = (m, code, extra) => Object.assign(new Error(m), { code, ...extra });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// los tokens que la app guardaba antes en el equipo ya no se usan
if (!MOCK) { try { if (store.getSecret('mlTokens')) store.setSecret('mlTokens', undefined); } catch {} }

/** ¿se habla con el servidor de Asset? (fuera del modo de prueba y con la sesión de Asset iniciada) */
const enApi = () => { if (MOCK) return false; try { return require('../wa-servidor').enApi(); } catch { return false; } };
const sinCuentaAsset = () => err('Entra con tu cuenta de Asset para usar Portal Inmobiliario.', 'ML_LOGIN');
function mensaje(r) {
  const j = r.json || {};
  const causas = (j.cause || []).map((c) => (typeof c === 'string' ? c : c.message || c.code)).filter(Boolean);
  return [j.message || j.error || ('error ' + r.status), ...causas].join(' · ');
}

// ---------- la conexión de la corredora en el servidor (en caché: la app la consulta seguido) ----------
let remoto = null; let remotoEn = 0; // { configurada, conexion } de lo último que respondió el servidor
async function estadoRemoto() {
  try { const r = await asset().llamar('GET', '/conexiones/mercadolibre'); remoto = { configurada: true, conexion: r.conexion || null }; }
  catch (e) { if (e.status !== 404) throw e; remoto = { configurada: false, conexion: null }; } // 404: el servidor no tiene la app de Mercado Libre
  remotoEn = Date.now(); return remoto;
}
const activa = () => remoto?.conexion?.estado === 'activa';
/** error de la API de Asset → el de antes (ML_LOGIN pide conectar la cuenta) */
function traducir(e) {
  if (e?.datos?.codigo === 'NECESITA_CONEXION') { if (remoto?.conexion) remoto.conexion = { ...remoto.conexion, estado: 'vencida' }; return err(e.message || 'Conecta la cuenta de Portal Inmobiliario de la corredora.', 'ML_LOGIN'); }
  if (e?.status === 503 || e?.status === 404) return err('Portal Inmobiliario no está configurado en el servidor de Asset.', 'NO_APP');
  return e;
}

// ---------- sesión simulada (solo PF_MOCK / PF_ML_MOCK) ----------
const tokens = () => (MOCK ? store.getSecret('mlTokens') : null);
function guardarTokens(j) {
  const t = { access_token: j.access_token, refresh_token: j.refresh_token, user_id: j.user_id, expires_at: Date.now() + (j.expires_in || 21600) * 1000 };
  const prev = tokens(); if (prev && prev.user_id === t.user_id) { t.nickname = prev.nickname; t.email = prev.email; }
  store.setSecret('mlTokens', t); return t;
}
async function tokenMock() {
  let t = tokens(); if (!t) throw err('Conecta la cuenta de Portal Inmobiliario de la corredora.', 'ML_LOGIN');
  if (Date.now() > t.expires_at - 5 * 60e3) t = await renovarMock(t);
  return t;
}
async function renovarMock(t) {
  const r = await mock('POST', API + '/oauth/token', { form: { grant_type: 'refresh_token', client_id: 'demo', client_secret: 'demo', refresh_token: t.refresh_token } });
  if (r.status !== 200) { store.setSecret('mlTokens', undefined); throw err('La conexión con Portal Inmobiliario venció. Vuelve a conectar la cuenta.', 'ML_LOGIN'); }
  return guardarTokens(r.json); // el refresh token anterior ya no sirve: se guarda el nuevo
}

// ---------- estado, conectar y desconectar ----------
async function estado() {
  const c = inmo.config();
  const resto = { contacto: c.contacto || {}, tipoAviso: c.ml?.tipoAviso || 'silver', ultimaSync: c.ml?.ultimaSync || null, ultimosLeads: c.ml?.ultimosLeads || null };
  if (MOCK) { const t = tokens(); return { configurada: true, conectada: !!t, cuenta: t ? { id: t.user_id, nickname: t.nickname || '', email: t.email || '' } : null, ...resto }; }
  let error = null;
  if (enApi()) { try { await estadoRemoto(); } catch (e) { error = e.message; } }
  const cx = enApi() ? remoto?.conexion : null; const ok = cx?.estado === 'activa';
  return { configurada: enApi() && !!remoto?.configurada, conectada: ok, vencida: cx?.estado === 'vencida', cuenta: ok ? { id: cx.cuentaId || null, nickname: cx.cuenta || '', email: '' } : null, ...(error ? { error } : {}), ...resto };
}
async function conectar() {
  if (MOCK) {
    const r = await mock('POST', API + '/oauth/token', { form: { grant_type: 'authorization_code', client_id: 'demo', client_secret: 'demo', code: 'mock-code' } });
    if (r.status !== 200) throw err('Mercado Libre rechazó la conexión: ' + mensaje(r));
    const t = guardarTokens(r.json);
    const me = await api('GET', '/users/me');
    t.nickname = me.nickname || ''; t.email = me.email || ''; store.setSecret('mlTokens', t);
    return estado();
  }
  if (!enApi()) throw sinCuentaAsset();
  let url;
  try { ({ url } = await asset().llamar('POST', '/conexiones/mercadolibre/iniciar')); }
  catch (e) { if (e.status === 403) throw err('Portal Inmobiliario se conecta una vez para toda la corredora: pídele al administrador que lo conecte desde su Asset.', 'SOLO_ADMIN'); throw traducir(e); }
  const desde = Date.now();
  await shell.openExternal(url);
  const fin = desde + 5 * 60_000;
  while (Date.now() < fin) {
    await dormir(2000);
    const r = await estadoRemoto().catch(() => null);
    if (r?.conexion?.estado === 'activa' && r.conexion.conectadoEn && new Date(r.conexion.conectadoEn).getTime() > desde - 60_000) return estado();
  }
  throw err('No se completó la conexión con Mercado Libre (se acabó el tiempo). Inténtalo de nuevo.', 'CANCELADO');
}
async function desconectar() {
  if (MOCK) { store.setSecret('mlTokens', undefined); return estado(); }
  if (!enApi()) throw sinCuentaAsset();
  try { await asset().llamar('DELETE', '/conexiones/mercadolibre'); }
  catch (e) { if (e.status === 403) throw err('Solo el administrador de la corredora puede desconectar Portal Inmobiliario.', 'SOLO_ADMIN'); throw traducir(e); }
  remoto = remoto ? { ...remoto, conexion: null } : null;
  return estado();
}
/** ¿la corredora tiene la cuenta conectada? (consulta al servidor) */
async function conectada() {
  if (MOCK) return !!tokens();
  if (!enApi()) return false;
  try { await estadoRemoto(); } catch {}
  return activa();
}
/** lo mismo, síncrono, con lo último que se supo (y se pide de nuevo si es viejo) */
function tokensOk() {
  if (MOCK) return !!tokens();
  if (!enApi()) return false;
  if (Date.now() - remotoEn > 60_000) { remotoEn = Date.now(); estadoRemoto().catch(() => {}); }
  return activa();
}
/** el id del usuario de Mercado Libre de la corredora */
async function uid() {
  if (MOCK) return (await tokenMock()).user_id;
  if (!enApi()) throw sinCuentaAsset();
  if (!activa() || !remoto.conexion.cuentaId) await estadoRemoto();
  if (!activa()) throw err('Conecta la cuenta de Portal Inmobiliario de la corredora.', 'ML_LOGIN');
  if (!remoto.conexion.cuentaId) throw err('No se sabe qué cuenta de Mercado Libre está conectada: vuelve a conectarla.', 'ML_LOGIN');
  return remoto.conexion.cuentaId;
}

// ---------- llamadas a la API de Mercado Libre ----------
/** una llamada → { status, json }. Con la cuenta de Asset va por el proxy del servidor (pone y renueva el token). */
async function llamada(method, p, body, publica = false) {
  if (!MOCK) {
    if (!enApi()) throw sinCuentaAsset();
    let r;
    try { r = await asset().llamar('POST', '/mercadolibre/api', { metodo: method, ruta: p, ...(body !== undefined ? { cuerpo: body } : {}) }, 65_000); } // publicar puede tardar más que los 20 s de siempre
    catch (e) { throw traducir(e); }
    return { status: r.status, json: r.cuerpo };
  }
  if (publica) return mock(method, API + p);
  const t = await tokenMock();
  const r = await mock(method, API + p, { token: t.access_token, body });
  if (r.status !== 401) return r;
  return mock(method, API + p, { token: (await renovarMock(t)).access_token, body });
}
async function api(method, p, body) {
  const r = await llamada(method, p, body);
  if (r.status >= 400) throw err('Portal Inmobiliario: ' + mensaje(r), 'ML_' + r.status, { ml: r.json });
  return r.json;
}
// Datos públicos (categorías, ubicaciones): caché de 7 días.
const cache = new Map();
async function pub(p) {
  const all = store.get('mlCache') || {}; const hit = cache.get(p) || all[p];
  if (hit && Date.now() - hit.t < 7 * 864e5) return hit.v;
  const r = await llamada('GET', p, undefined, true);
  if (r.status !== 200) throw err('No se pudo consultar Mercado Libre (' + p + '): ' + mensaje(r));
  const e = { t: Date.now(), v: r.json }; cache.set(p, e);
  if (/^\/(categories|classified_locations)/.test(p)) { all[p] = e; store.set('mlCache', all); }
  return r.json;
}

// ---------- categoría, ubicación y atributos ----------
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const TIPO_ML = { casa: 'Casas', departamento: 'Departamentos', oficina: 'Oficinas', sitio: 'Sitios', local_comercial: 'Locales', industrial: 'Industriales', agricola: 'Agrícolas', parcela: 'Parcelas', estacionamiento: 'Estacionamientos', terreno_construccion: 'Terrenos', bodega: 'Bodegas' };
async function categoria(tipo, op) {
  const raiz = await pub('/categories/' + ROOT);
  const t = raiz.children_categories.find((c) => norm(c.name) === norm(TIPO_ML[tipo]));
  if (!t) throw err(`Portal Inmobiliario no tiene la categoría «${TIPO_ML[tipo] || tipo}».`);
  let cat = await pub('/categories/' + t.id); const ruta = [t.name];
  const o = cat.children_categories.find((c) => norm(c.name) === (op === 'venta' ? 'venta' : 'arriendo'));
  if (!o) throw err(`«${t.name}» no admite ${op} en Portal Inmobiliario.`);
  cat = await pub('/categories/' + o.id); ruta.push(o.name);
  while (cat.children_categories?.length) { // subtipo: propiedades usadas (los proyectos nuevos van por otra vía)
    const s = cat.children_categories.find((c) => /usad/i.test(c.name)) || cat.children_categories[0];
    cat = await pub('/categories/' + s.id); ruta.push(s.name);
  }
  return { id: cat.id, ruta, maxTitulo: cat.settings?.max_title_length || 60 };
}
const EXTRANJEROS = /china|inglaterra|usa|argentina|peru|bolivia/i;
async function ubicacion(comuna, region) {
  if (!comuna) throw err('Falta la comuna de la propiedad.');
  const pais = await pub('/classified_locations/countries/CL');
  const nr = norm(region); const states = pais.states.filter((s) => !EXTRANJEROS.test(s.name));
  const orden = [...states.filter((s) => nr && (nr.includes(norm(s.name).replace('rm', '')) || norm(s.name).includes(nr.slice(0, 8)) || (nr.includes('metropolitana') && /metropolitana/i.test(s.name)) || (nr.includes('higgins') && /higgins/i.test(s.name)))), ...states];
  const vistos = new Set();
  for (const s of orden) {
    if (vistos.has(s.id)) continue; vistos.add(s.id);
    const st = await pub('/classified_locations/states/' + s.id);
    const c = (st.cities || []).find((x) => norm(x.name) === norm(comuna));
    if (c) { const city = await pub('/classified_locations/cities/' + c.id); return { state: { id: s.id, name: s.name }, city: { id: c.id, name: c.name }, barrios: (city.neighborhoods || []).map((n) => ({ id: n.id, name: n.name })) }; }
  }
  throw err(`Portal Inmobiliario no reconoce la comuna «${comuna}». Revísala en la ficha.`);
}
const MIN_FOTOS = { casa: 12, departamento: 12, oficina: 12, parcela: 12, estacionamiento: 4 };
const MONEDA = { UF: 'CLF', CLP: 'CLP', USD: 'USD' };
const NOMBRE_ATR = { TOTAL_AREA: 'superficie total', COVERED_AREA: 'superficie útil', BEDROOMS: 'dormitorios', FULL_BATHROOMS: 'baños', PARKING_LOTS: 'estacionamientos', WAREHOUSES: 'bodegas' };
function tituloAviso(p, max) {
  const t = String(p.tituloPortal || p.titulo || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max + 1).replace(/\s+\S*$/, '').slice(0, max);
}
function whatsapp(n) {
  let d = String(n || '').replace(/\D/g, ''); if (!d) return null;
  if (d.length === 9 && d.startsWith('9')) d = '56' + d;
  if (!d.startsWith('56') || d.length < 10) return null;
  return { country_code2: '56', phone2: d.slice(2) };
}

// Revisa la ficha y arma el aviso. Errores = no se puede publicar; avisos = baja la calidad del aviso.
async function revisar(propId, op, opts = {}) {
  const p = inmo.obtener(propId); const errores = []; const avisos = [];
  if (!(op === 'venta' ? p.venta : p.arriendo)) throw err(`La propiedad no está marcada en ${op}.`);
  const precio = op === 'venta' ? p.precioVenta : p.precioArriendo;
  if (!precio?.valor) errores.push(`Falta el precio de ${op}.`);
  let cat = null; try { cat = await categoria(p.tipo, op); } catch (e) { errores.push(e.message); }
  let ub = null; try { ub = await ubicacion(p.comuna, p.region); } catch (e) { errores.push(e.message); }
  if (!String(p.direccion || '').trim()) errores.push('Falta la dirección.');
  const fotos = (p.fotos || []).filter((u) => /^https:\/\//.test(u)).slice(0, 30);
  if (!fotos.length) errores.push('El aviso necesita al menos una foto.');
  const minF = MIN_FOTOS[p.tipo] || 6;
  if (fotos.length && fotos.length < minF) avisos.push(`Tiene ${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}; Portal Inmobiliario pide ${minF} o más para la mejor calidad de aviso.`);
  if (!String(p.descripcion || '').trim()) avisos.push('Sin descripción: agrega una para mejorar la calidad del aviso.');
  const c = inmo.config().contacto || {}; const wa = whatsapp(c.whatsapp);
  if (!wa) errores.push('Configura el WhatsApp de contacto de la corredora en «Portales» (obligatorio desde el 01/10/2026).');
  const titulo = cat ? tituloAviso(p, cat.maxTitulo) : p.titulo;
  if (cat && String(p.tituloPortal || p.titulo).trim().length > cat.maxTitulo) avisos.push(`El título se acorta a ${cat.maxTitulo} caracteres: «${titulo}». Puedes escribir uno especial para el portal.`);
  // atributos
  const attrs = []; let catAttrs = [];
  if (cat) { try { catAttrs = await pub(`/categories/${cat.id}/attributes`); } catch (e) { avisos.push('No se pudieron leer los atributos de la categoría; se envían los básicos.'); } }
  const existe = (id) => !catAttrs.length || catAttrs.some((a) => a.id === id);
  const add = (id, v, fmt = (x) => String(x)) => { if (v != null && v !== '' && existe(id)) attrs.push({ id, value_name: fmt(v) }); };
  const m2 = (x) => `${Math.round(Number(x) * 100) / 100} m²`;
  add('TOTAL_AREA', p.supTotal ?? p.supUtil, m2); add('COVERED_AREA', p.supUtil ?? p.supTotal, m2);
  add('BEDROOMS', p.dormitorios); add('FULL_BATHROOMS', p.banos);
  add('PARKING_LOTS', p.estacionamientos ?? (['casa', 'departamento', 'oficina'].includes(p.tipo) ? 0 : null));
  add('WAREHOUSES', p.bodegas);
  if (existe('FURNISHED')) attrs.push({ id: 'FURNISHED', value_name: p.amoblado ? 'Sí' : 'No' });
  add('MAINTENANCE_FEE', p.gastosComunes, (x) => `${Math.round(x)} CLP`);
  add('PROPERTY_CODE', p.codigo);
  // 0.16.14 · el resto de la ficha (★ en Prop360): se cruza por nombre con los atributos que pide la categoría
  if (catAttrs.length) {
    const FC = require('../ficha-campos'); const nn = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const SIN = { 'superficie terraza': 'supTerraza', 'cantidad de pisos': 'pisos', 'numero de piso de la unidad': 'pisoUnidad', 'piso de la unidad': 'pisoUnidad', 'ascensores': 'ascensores', 'antiguedad': 'anio', 'ano de construccion': 'anio', 'admite mascotas': 'mascotas', 'permite mascotas': 'mascotas', 'suites': 'suites', 'cantidad de suites': 'suites', 'ambientes': 'ambientes', 'tipo de calefaccion': 'calefaccion', 'calefaccion': 'calefaccion', 'orientacion': 'orientacion', 'tipo de casa': 'tipoCasa', 'tipo de departamento': 'subtipo', 'tipo de seguridad': 'tipoSeguridad', 'horario de contacto': 'horarioContacto', 'con piscina': 'piscina', 'piscina': 'piscina', 'gimnasio': 'gimnasio', 'con gimnasio': 'gimnasio' };
    const porNombre = Object.fromEntries(FC.CAMPOS.filter((c) => c.pi && !c.plano && !c.virtual).map((c) => [nn(c.t), c]));
    for (const a of catAttrs) {
      if (attrs.some((y) => y.id === a.id)) continue;
      const key = nn(a.name); const c = FC.POR_ID[SIN[key]] || porNombre[key] || porNombre[key.replace(/^con /, '')] || porNombre[key.replace(/^tiene /, '')]; if (!c) continue;
      let v = p.ficha?.[c.id]; if (v == null) continue;
      if (c.id === 'anio' && /antiguedad/.test(key)) v = new Date().getFullYear() - Number(v);
      if (a.value_type === 'boolean' || c.k === 'bool') { attrs.push({ id: a.id, value_name: v ? 'Sí' : 'No' }); continue; }
      if (Array.isArray(a.values) && a.values.length && a.value_type === 'list') { const m = a.values.find((x) => nn(x.name) === nn(v)) || a.values.find((x) => nn(x.name).includes(nn(v)) || nn(v).includes(nn(x.name)));
        if (m) attrs.push({ id: a.id, value_id: m.id, value_name: m.name }); else avisos.push(`«${c.t}: ${v}» no calza con las opciones de Portal Inmobiliario; no se envía.`); continue; }
      if (a.value_type === 'number_unit') { attrs.push({ id: a.id, value_name: c.id === 'supTerraza' ? m2(v) : String(v) }); continue; }
      attrs.push({ id: a.id, value_name: String(v) });
    }
  }
  attrs.push({ id: 'CMG_SITE', value_name: 'POI' }); // visible también en Portal Inmobiliario
  for (const a of catAttrs.filter((x) => x.tags?.required)) if (!attrs.some((y) => y.id === a.id)) errores.push(`Falta ${NOMBRE_ATR[a.id] || '«' + a.name + '»'}.`);
  { // lo esencial que falte (ej. el N° de depto) impide publicar; lo clave para portales que falte baja la calidad del aviso
    const FCx = require('../ficha-campos'); const av = FCx.avance(p);
    for (const t of av[0].faltanClave.filter((x) => !/propietario/i.test(x))) if (!errores.some((e) => e.includes(t))) errores.push(`Falta ${t} (dato clave de la ficha).`);
    for (const t of av[1].faltanClave) (/^Piso en que/.test(t) ? errores : avisos).push(`Falta ${t} en la ficha.`);
  }
  if (p.supUtil == null && p.supTotal != null && existe('COVERED_AREA')) avisos.push('Sin superficie útil: se informa la total también como útil.');
  if (p.estacionamientos == null && attrs.some((a) => a.id === 'PARKING_LOTS' && a.value_name === '0')) avisos.push('Sin estacionamientos registrados: se publica con 0.');
  const barrio = opts.barrio !== undefined ? opts.barrio : p.portalBarrio || null;
  const location = ub ? { address_line: [p.direccion, p.unidad ? 'depto. ' + p.unidad : ''].filter(Boolean).join(', '), city: { id: ub.city.id }, state: { id: ub.state.id }, ...(barrio?.id ? { neighborhood: { id: barrio.id } } : {}) } : null;
  const tipoAviso = opts.tipoAviso || inmo.config().ml?.tipoAviso || 'silver';
  const desc = [String(p.descripcion || '').trim(), `Código: ${p.codigo}`].filter(Boolean).join('\n\n');
  const payload = {
    title: titulo, category_id: cat?.id, price: precio?.valor, currency_id: MONEDA[precio?.moneda] || 'CLF', available_quantity: 1, buying_mode: 'classified',
    listing_type_id: tipoAviso, condition: 'used', channels: ['marketplace'], description: { plain_text: desc }, pictures: fotos.map((source) => ({ source })),
    location, seller_contact: { contact: c.nombre || '', email: c.email || '', phone: String(c.telefono || '').replace(/\D/g, ''), country_code: '56', webpage: c.web || '', ...(wa || {}) },
    attributes: attrs, seller_custom_field: p.codigo,
  };
  // paquete disponible
  let paquete = null;
  if (await conectada()) {
    try {
      const r = await api('GET', `/users/${await uid()}/classifieds_promotion_packs/${tipoAviso}`);
      const lista = Array.isArray(r) ? r : r ? [r] : []; paquete = lista.reduce((s, x) => s + (Number(x.remaining_listings) || 0), 0);
      if (!p.portales?.pi?.[op]?.itemId && paquete <= 0) errores.push(`No quedan publicaciones disponibles en el paquete «${tipoAviso}». La corredora debe contratar uno en Mercado Libre.`);
    } catch (e) { if (e.code === 'ML_LOGIN') errores.push(e.message); else avisos.push('No se pudo consultar el paquete de publicaciones.'); }
  } else errores.push('Conecta la cuenta de Portal Inmobiliario de la corredora en «Portales».');
  return { errores, avisos, payload, categoria: cat, ubicacion: ub, barrio, fotos: fotos.length, minFotos: minF, tipoAviso, paquete, titulo, aviso: p.portales?.pi?.[op] || null };
}

const OP_TXT = { venta: 'venta', arriendo: 'arriendo' };
const ESTADO_TXT = { active: 'activo', paused: 'pausado', closed: 'finalizado', under_review: 'en revisión', inactive: 'inactivo' };
function guardarAviso(propId, op, datos, texto) {
  return inmo.parchear(propId, (p) => { p.portales ||= {}; p.portales.pi ||= {}; p.portales.pi[op] = { ...(p.portales.pi[op] || {}), ...datos, actualizado: new Date().toISOString() }; }, texto);
}
async function publicar(propId, op, opts = {}) {
  if (opts.tituloPortal !== undefined || opts.barrio !== undefined) inmo.parchear(propId, (p) => { if (opts.tituloPortal !== undefined) p.tituloPortal = String(opts.tituloPortal).trim(); if (opts.barrio !== undefined) p.portalBarrio = opts.barrio; });
  const r = await revisar(propId, op, opts);
  if (r.errores.length) throw err(r.errores.join(' '), 'ML_REVISAR', { errores: r.errores });
  const p0 = inmo.obtener(propId);
  if (p0.portales?.pi?.[op]?.itemId && p0.portales.pi[op].status !== 'closed') return actualizar(propId, op);
  const item = await api('POST', '/items', r.payload);
  return guardarAviso(propId, op, { itemId: item.id, permalink: item.permalink, status: item.status, tipoAviso: r.tipoAviso, publicado: new Date().toISOString(), error: null }, `Publicada en ${PORTAL} (${OP_TXT[op]}): ${item.id}`);
}
async function actualizar(propId, op) {
  const a = inmo.obtener(propId).portales?.pi?.[op]; if (!a?.itemId) throw err('Esta propiedad no tiene aviso en Portal Inmobiliario.');
  const r = await revisar(propId, op);
  const graves = r.errores.filter((e) => !/paquete/.test(e)); if (graves.length) throw err(graves.join(' '), 'ML_REVISAR', { errores: graves });
  const { title, price, pictures, seller_contact } = r.payload;
  const item = await api('PUT', `/items/${a.itemId}`, { title, price, pictures, seller_contact });
  await api('PUT', `/items/${a.itemId}/description`, { plain_text: r.payload.description.plain_text }).catch(() => {});
  return guardarAviso(propId, op, { status: item.status || a.status, permalink: item.permalink || a.permalink, error: null }, `Aviso de ${PORTAL} actualizado (${OP_TXT[op]})`);
}
async function cambiarEstado(propId, op, status, motivo) {
  const a = inmo.obtener(propId).portales?.pi?.[op]; if (!a?.itemId) throw err('Esta propiedad no tiene aviso en Portal Inmobiliario.');
  if (!['active', 'paused', 'closed'].includes(status)) throw err('Estado no válido.');
  const item = await api('PUT', `/items/${a.itemId}`, { status });
  return guardarAviso(propId, op, { status: item.status || status, pausadoPorEstado: status === 'paused' && !!motivo }, `Aviso de ${PORTAL} ${ESTADO_TXT[status]} (${OP_TXT[op]})${motivo ? ': ' + motivo : ''}`);
}

// La ficha cambió: el aviso se mantiene al día solo (precio, fotos, título, estado comercial).
const CAMPOS_AVISO = ['titulo', 'tituloPortal', 'precioVenta', 'precioArriendo', 'fotos', 'descripcion', 'direccion', 'unidad'];
async function reaccionar(antes, p) {
  if (!p.portales?.pi || !tokensOk()) return [];
  const out = [];
  for (const op of ['venta', 'arriendo']) {
    const a = p.portales.pi[op]; if (!a?.itemId || a.status === 'closed') continue;
    const k = op === 'venta' ? 'estadoVenta' : 'estadoArriendo'; const e0 = antes[k], e1 = p[k];
    try {
      if (e0 !== e1 && ['vendida', 'arrendada', 'no_disponible', 'reservada'].includes(e1) && a.status === 'active') { await cambiarEstado(p.id, op, 'paused', `la propiedad quedó ${String(e1).replace('_', ' ')}`); out.push(`Aviso de ${op} pausado en Portal Inmobiliario.`); continue; }
      if (e0 !== e1 && e1 === 'disponible' && a.status === 'paused' && a.pausadoPorEstado) { await cambiarEstado(p.id, op, 'active'); out.push(`Aviso de ${op} reactivado en Portal Inmobiliario.`); continue; }
      if (a.status === 'active' && CAMPOS_AVISO.some((c) => JSON.stringify(antes[c]) !== JSON.stringify(p[c]))) { await actualizar(p.id, op); out.push(`Aviso de ${op} actualizado en Portal Inmobiliario.`); }
    } catch (e) { guardarAviso(p.id, op, { error: e.message }); out.push(`No se pudo actualizar el aviso de ${op}: ${e.message}`); }
  }
  return out;
}

// ---------- sincronización: estados de los avisos e interesados ----------
async function sincronizar() {
  const lista = []; for (const p of inmo.todas()) for (const op of ['venta', 'arriendo']) { const a = p.portales?.pi?.[op]; if (a?.itemId) lista.push({ p, op, a }); }
  for (let i = 0; i < lista.length; i += 20) {
    const parte = lista.slice(i, i + 20); const r = await api('GET', '/items?ids=' + parte.map((x) => x.a.itemId).join(','));
    for (const it of r || []) {
      if (it.code !== 200 || !it.body) continue; const x = parte.find((y) => y.a.itemId === it.body.id); if (!x) continue;
      if (x.a.status !== it.body.status) guardarAviso(x.p.id, x.op, { status: it.body.status, permalink: it.body.permalink || x.a.permalink }, `Portal Inmobiliario informa aviso ${ESTADO_TXT[it.body.status] || it.body.status} (${x.op})`);
    }
  }
  const leads = await traerLeads();
  inmo.guardarConfig({ ml: { ...(inmo.config().ml || {}), ultimaSync: new Date().toISOString() } });
  return { avisos: lista.length, leads };
}
const CANAL = { whatsapp: 'WhatsApp', question: 'pregunta', call: 'llamada', schedule: 'solicitud de visita', quotation: 'cotización' };
async function traerLeads() {
  const id = await uid(); const cfg = inmo.config().ml || {};
  const hoy = new Date(); const desde = cfg.leadsDesde ? new Date(cfg.leadsDesde) : new Date(Date.now() - 30 * 864e5);
  const f = (d) => d.toISOString().slice(0, 10);
  const porItem = new Map(); for (const p of inmo.todas()) for (const op of ['venta', 'arriendo']) { const a = p.portales?.pi?.[op]; if (a?.itemId) porItem.set(a.itemId, p.id); }
  let nuevos = 0, offset = 0;
  for (let vuelta = 0; vuelta < 40; vuelta++) {
    const r = await api('GET', `/vis/users/${id}/leads/buyers?date_from=${f(desde)}&date_to=${f(hoy)}&limit=50&offset=${offset}`);
    const res = r?.results || []; if (!res.length) break;
    for (const b of res) for (const l of b.leads || []) {
      const propId = porItem.get(l.item_id || b.item_id); if (!propId) continue;
      if (inmo.registrarLead(propId, { id: l.id || l.uuid, portal: PORTAL, canal: l.channel || l.contact_type, canalTxt: CANAL[l.channel || l.contact_type] || l.channel, nombre: b.name, email: b.email, telefono: b.phone, rut: b.identification_type === 'RUT' ? b.identification_number : null, fecha: l.created_at, itemId: l.item_id || b.item_id, visto: false })) nuevos++;
    }
    offset += res.length; if (res.length < 50) break;
  }
  inmo.guardarConfig({ ml: { ...(inmo.config().ml || {}), leadsDesde: f(new Date(Date.now() - 2 * 864e5)), ultimosLeads: new Date().toISOString() } });
  inmo.guardar();
  return nuevos;
}

// ---------- migración: avisos que la corredora ya tiene (p. ej. publicados por Convecta) ----------
async function avisosExistentes() {
  const id = await uid(); const ids = []; let offset = 0;
  for (let v = 0; v < 50; v++) {
    const r = await api('GET', `/users/${id}/items/search?status=active&limit=100&offset=${offset}`);
    ids.push(...(r.results || [])); offset += (r.results || []).length; if (!(r.results || []).length || offset >= (r.paging?.total || 0)) break;
  }
  const items = []; for (let i = 0; i < ids.length; i += 20) { const r = await api('GET', '/items?ids=' + ids.slice(i, i + 20).join(',')); for (const it of r || []) if (it.code === 200) items.push(it.body); }
  const ya = new Set(); for (const p of inmo.todas()) for (const op of ['venta', 'arriendo']) if (p.portales?.pi?.[op]?.itemId) ya.add(p.portales.pi[op].itemId);
  const props = inmo.todas();
  return items.filter((it) => !ya.has(it.id)).map((it) => {
    const attr = (id) => (it.attributes || []).find((a) => a.id === id)?.value_name;
    const cod = attr('PROPERTY_CODE') || it.seller_custom_field || '';
    const op = /arriendo|alquiler/i.test(attr('OPERATION') || '') ? 'arriendo' : /venta/i.test(attr('OPERATION') || '') ? 'venta' : null;
    const p = cod && props.find((q) => norm(q.codigo) === norm(cod) || (q.origen?.externo != null && norm(q.origen.externo) === norm(cod)));
    return { itemId: it.id, titulo: it.title, permalink: it.permalink, precio: it.price, moneda: it.currency_id, codigo: cod, op: op || (p ? (p.venta && !p.arriendo ? 'venta' : p.arriendo && !p.venta ? 'arriendo' : 'venta') : null), propId: p?.id || null, propTitulo: p?.titulo || null };
  });
}
function vincularAvisos(lista) {
  let n = 0; for (const x of lista) { if (!x.propId || !x.op || !x.itemId) continue; guardarAviso(x.propId, x.op, { itemId: x.itemId, permalink: x.permalink, status: 'active', vinculado: true, publicado: null }, `Aviso existente de ${PORTAL} vinculado (${x.op}): ${x.itemId}`); n++; }
  return n;
}
async function barrios(comuna, region) { return (await ubicacion(comuna, region)).barrios; }
function guardarContacto(c, tipoAviso) {
  const contacto = { nombre: String(c.nombre || '').trim(), email: String(c.email || '').trim(), telefono: String(c.telefono || '').trim(), whatsapp: String(c.whatsapp || '').trim(), web: String(c.web || '').trim() };
  if (contacto.whatsapp && !whatsapp(contacto.whatsapp)) throw err('El WhatsApp debe ser un celular chileno, por ejemplo +56 9 1234 5678.');
  inmo.guardarConfig({ contacto, ml: { ...(inmo.config().ml || {}), tipoAviso: ['silver', 'gold', 'gold_premium'].includes(tipoAviso) ? tipoAviso : 'silver' } });
  return estado();
}
async function paquetes() {
  const id = await uid(); const out = {};
  for (const t of ['silver', 'gold', 'gold_premium']) { try { const r = await api('GET', `/users/${id}/classifieds_promotion_packs/${t}`); const l = Array.isArray(r) ? r : r ? [r] : []; out[t] = l.reduce((s, x) => s + (Number(x.remaining_listings) || 0), 0); } catch { out[t] = null; } }
  return out;
}

// Métricas del aviso (visitas y vistas del teléfono de los últimos días)
async function metricas(itemId, dias = 30) {
  const [v, t] = await Promise.all([api('GET', `/items/${itemId}/visits/time_window?last=${dias}&unit=day`).catch(() => null), api('GET', `/items/${itemId}/contacts/phone_views/time_window?last=${dias}&unit=day`).catch(() => null)]);
  return { visitas: v?.total_visits ?? null, telefonos: t?.total ?? t?.total_phone_views ?? null, serie: (v?.results || []).map((x) => ({ fecha: String(x.date).slice(0, 10), n: x.total })) };
}
module.exports = { metricas, tokensOk, conectada, estado, conectar, desconectar, revisar, publicar, actualizar, cambiarEstado, reaccionar, sincronizar, traerLeads, avisosExistentes, vincularAvisos, barrios, guardarContacto, paquetes, _norm: norm, _whatsapp: whatsapp };
