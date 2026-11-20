// Portal Inmobiliario y TOCTOC a través de KONVER (docs/KONVER - API de portales - documentacion tecnica.pdf, v1.0 nov-2026).
// Reemplaza a mercadolibre.js fuera del modo de prueba, con la MISMA interfaz (estado, conectar, revisar, publicar, actualizar,
// cambiarEstado, eliminar, reaccionar, sincronizar…) y agrega TOCTOC (toctocPublicar, toctocRetirar, toctocConectar…).
//  · La llave de KONVER es de la corredora y vive en el servidor de Asset: cada llamada pasa por POST /v1/konver/api.
//  · Portal Inmobiliario se conecta como Google: «Conectar» abre el enlace de KONVER en el navegador, la persona autoriza con
//    la cuenta de Mercado Libre de la corredora y Asset espera a que la cuenta figure conectada.
//  · TOCTOC se conecta con las 3 llaves que entrega TOCTOC (key_cliente, key_integrador, corredor_id).
//  · Una propiedad publicada lleva la referencia «<código>-V» o «<código>-A» (venta o arriendo): vuelve en cada lead.
//  · Repetir POST /v1/propiedades crea OTRO aviso en Portal Inmobiliario (se modifica con PATCH y su id); en TOCTOC actualiza.
const { shell } = require('electron');
const inmo = require('../inmo');

const PORTAL = 'Portal Inmobiliario';
const TOCTOC = 'TOCTOC';
const asset = () => require('../asset');
const err = (m, code, extra) => Object.assign(new Error(m), { code, ...extra });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
/** los enlaces de Mercado Libre llegan a veces con http: siempre https */
const https = (u) => (u ? String(u).replace(/^http:\/\//i, 'https://') : null);
const hoy = () => new Date().toISOString();
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const enApi = () => { try { return require('../wa-servidor').enApi(); } catch { return false; } };
const sinCuentaAsset = () => err('Entra con tu cuenta de Asset para publicar en los portales.', 'ML_LOGIN');

// ---------- llamadas ----------
/** el motivo legible de un error de KONVER: { detail: { error, mensaje, detalle } } o la lista de FastAPI */
const TIPO_TXT = { free: 'Gratuita', silver: 'Plata', gold: 'Oro', gold_premium: 'Oro Premium' };
function motivo(c, status) {
  const d = c?.detail ?? c;
  // Mercado Libre: el aviso está bien, pero la cuenta no tiene cupo pagado de ese tipo (cuenta «normal» sin paquete)
  const det = d && typeof d === 'object' && !Array.isArray(d) ? d.detalle : null;
  if (det?.status === 'payment_required' || d?.http === 402) return `el aviso está correcto, pero Mercado Libre pide pagarlo: la cuenta no tiene un paquete de avisos ${TIPO_TXT[det?.listing_type_id] || ''}. Contrata un plan de corredora en Portal Inmobiliario o elige otro tipo de aviso.`.replace('  ', ' ');
  const sinTipo = (det?.cause || []).find((x) => x.code === 'item.listing_type_id.unavailable');
  if (sinTipo) return `la cuenta ya no tiene avisos de ese tipo disponibles${/free/.test(sinTipo.message || '') ? ' (se usó la publicación gratuita)' : ''}. Elige Plata, Oro u Oro Premium.`;
  if (Array.isArray(d)) return d.map((x) => `${(x.loc || []).filter((k) => k !== 'body').join('.')}: ${x.msg}`).join(' · ');
  if (d && typeof d === 'object') {
    const det = d.detalle && typeof d.detalle === 'object' ? (d.detalle.message || d.detalle.mensaje || (d.detalle.cause || []).map((x) => x.message || x).join(' · ') || '') : d.detalle || '';
    const campos = Array.isArray(d.campos) ? d.campos.join(', ') : '';
    return [d.mensaje || d.message || d.error, campos, det].filter(Boolean).join(' · ') || `error ${status}`;
  }
  return typeof d === 'string' && d ? d : `error ${status}`;
}
function traducir(e) {
  if (e?.datos?.codigo === 'KONVER_SIN_LLAVE') return err(e.message, 'NO_APP');
  if (e?.status === 403) return err(e.message, 'SOLO_ADMIN');
  return e;
}
/** una llamada a KONVER → { status, json } (los 4xx vuelven tal cual) */
async function llamada(metodo, ruta, cuerpo) {
  if (!enApi()) throw sinCuentaAsset();
  try {
    const r = await asset().llamar('POST', '/konver/api', { metodo, ruta, ...(cuerpo !== undefined ? { cuerpo } : {}) }, 95_000);
    return { status: r.status, json: r.cuerpo };
  } catch (e) { throw traducir(e); }
}
const CODIGOS = { mercadolibre_no_conectado: 'ML_LOGIN', toctoc_no_conectado: 'TT_LOGIN', cuenta_suspendida: 'KV_SUSPENDIDA' };
async function api(metodo, ruta, cuerpo, quien = 'KONVER') {
  const r = await llamada(metodo, ruta, cuerpo);
  if (r.status >= 400) {
    const cod = r.json?.detail?.error;
    if (r.status === 401) throw err('KONVER rechazó la llave de la corredora: revísala en Integraciones.', 'NO_APP');
    if (r.status === 429) throw err('Demasiadas consultas a los portales: espera un minuto y vuelve a intentar.', 'KV_429');
    throw err(`${quien}: ${motivo(r.json, r.status)}`, CODIGOS[cod] || 'KV_' + r.status, { kv: r.json });
  }
  return r.json;
}

// ---------- la cuenta (en caché: la app la consulta seguido) ----------
let remoto = null; let remotoEn = 0; // lo último de GET /v1/konver/conexion: { conectado, cuenta, error, admin }
async function estadoRemoto() {
  remoto = await asset().llamar('GET', '/konver/conexion'); remotoEn = Date.now(); return remoto;
}
const piConectado = () => !!remoto?.cuenta?.portal_inmobiliario?.conectado;
const ttConectado = () => !!remoto?.cuenta?.toctoc?.conectado;
function refrescarSiViejo() { if (enApi() && Date.now() - remotoEn > 60_000) { remotoEn = Date.now(); estadoRemoto().catch(() => {}); } }

async function estado() {
  const c = inmo.config();
  const resto = { contacto: c.contacto || {}, whatsappEmpresa: (() => { try { return telefono(require('../wa-servidor').numeroServidor()); } catch { return null; } })(), tipoAviso: c.ml?.tipoAviso || 'silver', ultimaSync: c.ml?.ultimaSync || null, ultimosLeads: c.ml?.ultimosLeads || null, via: 'konver' };
  let error = null;
  if (enApi()) { try { await estadoRemoto(); } catch (e) { error = e.message; } }
  const pi = remoto?.cuenta?.portal_inmobiliario || {}; const tt = remoto?.cuenta?.toctoc || {};
  return {
    configurada: enApi() && !!remoto?.conectado, conectada: !!pi.conectado, vencida: false,
    cuenta: pi.conectado ? { id: pi.usuario_ml || null, nickname: pi.nickname || '', email: '' } : null,
    tiposPublicacion: pi.tipos_publicacion || [],
    konver: { conectado: !!remoto?.conectado, propia: !!remoto?.propia, cliente: remoto?.cuenta?.cliente || null, admin: !!remoto?.admin, error: remoto?.error || null },
    toctoc: { conectado: !!tt.conectado, planActivo: tt.plan_activo !== false, corredorId: tt.llaves?.corredor_id || null, ambiente: tt.llaves?.ambiente || null },
    ...(error || remoto?.error ? { error: error || remoto.error } : {}), ...resto,
  };
}
/** «Conectar» como Google: abre el enlace de KONVER y espera a que la cuenta de Mercado Libre figure conectada (5 min) */
async function conectar() {
  if (!enApi()) throw sinCuentaAsset();
  const { enlace } = await api('GET', '/v1/cuenta/conectar-mercadolibre');
  if (!enlace) throw err('KONVER no entregó el enlace para conectar Mercado Libre.');
  await shell.openExternal(enlace);
  const fin = Date.now() + 5 * 60_000;
  while (Date.now() < fin) {
    await dormir(3000);
    const r = await estadoRemoto().catch(() => null);
    if (r?.cuenta?.portal_inmobiliario?.conectado) return estado();
  }
  throw err('No se completó la conexión con Mercado Libre (se acabó el tiempo). Inténtalo de nuevo.', 'CANCELADO');
}
async function desconectar() {
  throw err('La cuenta de Mercado Libre queda conectada en KONVER. Para cortar todo, el administrador quita la llave de KONVER en Integraciones.', 'SOLO_ADMIN');
}
async function conectada() { if (!enApi()) return false; try { await estadoRemoto(); } catch {} return piConectado(); }
function tokensOk() { if (!enApi()) return false; refrescarSiViejo(); return piConectado(); }
function toctocOk() { if (!enApi()) return false; refrescarSiViejo(); return ttConectado(); }

// la llave de KONVER y las de TOCTOC (administrador)
async function guardarLlave(llave) { await asset().llamar('PUT', '/konver/conexion', { llave: String(llave || '').trim() }); return estado(); }
async function quitarLlave() { await asset().llamar('DELETE', '/konver/conexion'); remoto = null; return estado(); }
async function toctocConectar({ keyCliente, keyIntegrador, corredorId }) {
  const cuerpo = { key_cliente: String(keyCliente || '').trim(), key_integrador: String(keyIntegrador || '').trim(), corredor_id: String(corredorId || '').trim() };
  if (!cuerpo.key_cliente || !cuerpo.key_integrador || !cuerpo.corredor_id) throw err('Faltan datos: TOCTOC entrega la llave del cliente, la del integrador y el id del corredor.');
  const r = await llamada('PUT', '/v1/cuenta/toctoc', cuerpo);
  if (r.status === 422) throw err('TOCTOC no reconoce esas llaves; no se guardó nada.');
  if (r.status === 502) throw err('TOCTOC no respondió; no se guardó nada. Intenta de nuevo en un momento.');
  if (r.status >= 400) throw err('TOCTOC: ' + motivo(r.json, r.status));
  const e = await estado();
  return { ...e, mensaje: r.json?.plan_activo === false ? 'Llaves guardadas, pero la cuenta de TOCTOC no tiene plan activo o se acabó el cupo.' : 'TOCTOC conectado.' };
}
async function toctocDesconectar() { await api('DELETE', '/v1/cuenta/toctoc', undefined, TOCTOC); return estado(); }

// ---------- la propiedad en el formato de KONVER ----------
const TIPO = { casa: 'casa', departamento: 'departamento', oficina: 'oficina', local_comercial: 'local', bodega: 'bodega', estacionamiento: 'estacionamiento', terreno_construccion: 'terreno', sitio: 'sitio', parcela: 'parcela', industrial: 'industrial', agricola: 'agricola' };
const TERRENO = ['sitio', 'parcela', 'terreno_construccion', 'agricola', 'industrial'];
const MONEDAS = ['CLP', 'UF', 'USD'];
const referencia = (p, op) => `${String(p.codigo || p.id).replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 56)}-${op === 'venta' ? 'V' : 'A'}`;
function tituloAviso(p, max = 60) {
  const t = String(p.tituloPortal || p.titulo || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max + 1).replace(/\s+\S*$/, '').slice(0, max);
}
/** el número de WhatsApp de la corredora (el que tiene conectado en wechatia, guardado en el servidor) */
async function waCorredora() {
  try { const w = require('../wa-servidor'); if (!w.numeroServidor()) await w.refrescarConexion(); return telefono(w.numeroServidor()); } catch { return null; }
}
function telefono(n) {
  let d = String(n || '').replace(/\D/g, ''); if (!d) return null;
  if (d.length === 9 && d.startsWith('9')) d = '56' + d;
  if (!d.startsWith('56') || d.length < 10) return null;
  return '+' + d;
}
/** «Av. Apoquindo 4500, Las Condes» → { calle: 'Av. Apoquindo', numero: '4500' } */
function calleNumero(dir) {
  const s = String(dir || '').split(',')[0].replace(/\s+/g, ' ').trim();
  const m = s.match(/^(.+?)\s+(?:n[°ºo.]*\s*|#\s*)?(\d+[A-Za-z]?)(?:\s.*)?$/i);
  return m ? { calle: m[1].replace(/[\s,#]+$/, ''), numero: m[2] } : { calle: s, numero: '' };
}
// las regiones con el nombre que usa KONVER (se lee una vez)
let regiones = null;
async function region(nombre, comuna) {
  try { regiones ||= (await api('GET', '/v1/ubicaciones/regiones')).map((r) => r.nombre); } catch { return nombre || null; }
  const n = norm(String(nombre || '').replace(/regi[oó]n( de| del)?/i, ''));
  if (n) { const r = regiones.find((x) => norm(x) === n) || regiones.find((x) => n.includes(norm(x)) || norm(x).includes(n)) || (/metropolitana|santiago|rm$/.test(n) && regiones.find((x) => /metropolitana/i.test(x))); if (r) return r; }
  if (!nombre && comuna) return null; // sin región: la validación lo dice
  return nombre;
}
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const ent = (v) => (num(v) == null ? null : Math.round(num(v)));
const pos = (v) => (num(v) != null && num(v) > 0 ? num(v) : null);

/** el cuerpo para KONVER + lo que falta antes de llamar (errores bloquean; avisos solo bajan la calidad) */
async function armar(p, op, destinos, opts = {}) {
  const errores = []; const avisos = [];
  if (!(op === 'venta' ? p.venta : p.arriendo)) errores.push(`La propiedad no está marcada en ${op}.`);
  const precio = op === 'venta' ? p.precioVenta : p.precioArriendo;
  if (!precio?.valor) errores.push(`Falta el precio de ${op}.`);
  const moneda = MONEDAS.includes(precio?.moneda) ? precio.moneda : 'UF';
  // el WhatsApp de los avisos es el de la corredora en wechatia (Integraciones); el del contacto de Portales queda de respaldo
  const c = inmo.config().contacto || {}; const tel = (await waCorredora()) || telefono(c.whatsapp) || telefono(c.telefono);
  if (!tel) errores.push('Falta el WhatsApp de contacto: pon el número de la corredora en Integraciones › wechatia, o escríbelo aquí.');
  const { calle, numero } = calleNumero(p.direccion);
  if (!calle) errores.push('Falta la dirección.'); else if (!numero) errores.push('Falta el número en la dirección (p. ej. «Av. Apoquindo 4500»).');
  if (!String(p.comuna || '').trim()) errores.push('Falta la comuna.');
  const reg = await region(p.region, p.comuna); if (!reg) errores.push('Falta la región de la propiedad.');
  const fotos = (p.fotos || []).filter((u) => /^https:\/\//.test(u)).slice(0, 30);
  if (!fotos.length) errores.push('El aviso necesita al menos una foto.');
  const titulo = tituloAviso(p, 60);
  if (titulo.length < 5) errores.push('Falta el título del aviso (5 caracteres o más).');
  if (String(p.tituloPortal || p.titulo || '').trim().length > 60) avisos.push(`El título se acorta a 60 caracteres: «${titulo}».`);
  const desc = [String(p.descripcion || '').trim(), `Código: ${p.codigo}`].filter(Boolean).join('\n\n');
  if (!String(p.descripcion || '').trim()) avisos.push('Sin descripción: agrega una para mejorar la calidad del aviso.');
  if (destinos.includes('toctoc')) {
    if (p.lat == null || p.lng == null) errores.push('TOCTOC exige la ubicación en el mapa (latitud y longitud): ubica la dirección en la ficha.');
    if (desc.length < 50) errores.push('TOCTOC exige una descripción de 50 caracteres o más.');
    const fotosTT = fotos.filter((u) => /\.(jpe?g|png)(\?|$)/i.test(u) && !/[()[\]{}%&+<>|'"]/.test(u.split('?')[0]));
    if (fotosTT.length < 3) errores.push(`TOCTOC exige al menos 3 fotos .jpg o .png (hay ${fotosTT.length}).`);
    if (moneda === 'USD') errores.push('TOCTOC solo acepta precios en pesos o UF.');
  }
  const f = p.ficha || {};
  const tipoAviso = opts.tipoAviso || inmo.config().ml?.tipoAviso || 'silver';
  const barrio = opts.barrio !== undefined ? opts.barrio : p.portalBarrio || null;
  const pisoUnidad = ent(f.pisoUnidad);
  const cuerpo = {
    referencia: referencia(p, op), operacion: op, tipo: TIPO[p.tipo] || 'otro', condicion: 'usado',
    titulo: titulo.length >= 5 ? titulo : String(titulo).padEnd(5, '.'), descripcion: desc,
    precio: { monto: num(precio?.valor) || 0, moneda },
    ubicacion: {
      region: reg || '', comuna: String(p.comuna || '').trim(), ...(barrio?.name || barrio?.nombre ? { barrio: barrio.name || barrio.nombre } : {}),
      calle: calle || '', numero: numero || '', ...(p.unidad ? { depto: String(p.unidad) } : {}), ...(pisoUnidad != null ? { piso: pisoUnidad } : {}),
      ...(p.lat != null && p.lng != null ? { latitud: Number(p.lat), longitud: Number(p.lng) } : {}),
    },
    superficie_total: pos(p.supTotal ?? p.supUtil), superficie_util: pos(p.supUtil ?? p.supTotal),
    superficie_terreno: TERRENO.includes(p.tipo) ? pos(p.supTotal) : pos(f.supTerreno), superficie_terraza: num(f.supTerraza),
    dormitorios: ent(p.dormitorios), banos: ent(p.banos), estacionamientos: ent(p.estacionamientos ?? (['casa', 'departamento', 'oficina'].includes(p.tipo) ? 0 : null)),
    bodegas: ent(p.bodegas), pisos: ent(f.pisos),
    ...(p.gastosComunes != null ? { gastos_comunes: { monto: Math.round(Number(p.gastosComunes)), moneda: 'CLP' } } : {}),
    ...(f.mascotas != null ? { admite_mascotas: !!f.mascotas } : {}), amoblado: !!p.amoblado,
    ...(f.parrilla != null || f.barbecue != null ? { parrilla: !!(f.parrilla || f.barbecue) } : {}),
    ...(f.piscina != null ? { piscina: !!f.piscina } : {}), ...(f.ascensores != null ? { ascensor: Number(f.ascensores) > 0 } : {}),
    ...(p.rol ? { rol: String(p.rol) } : {}),
    fotos, contacto: { nombre: c.nombre || null, telefono: tel || '', ...(telefono(c.telefono) && telefono(c.telefono) !== tel ? { telefono2: telefono(c.telefono) } : {}), email: c.email || null },
    tipo_publicacion_ml: tipoAviso, destinos,
  };
  for (const k of Object.keys(cuerpo)) if (cuerpo[k] === null) delete cuerpo[k];
  return { cuerpo, errores, avisos, tipoAviso, barrio, titulo, fotos: fotos.length };
}

// ---------- revisar (sin publicar) ----------
const DEST = { pi: 'portal_inmobiliario', toctoc: 'toctoc' };
function paqueteDe(tipo) { const t = (remoto?.cuenta?.portal_inmobiliario?.tipos_publicacion || []).find((x) => x.id === tipo); return t && t.restantes != null ? Number(t.restantes) : null; } // null = KONVER no sabe cuántos quedan
async function revisar(propId, op, opts = {}, destinos = ['portal_inmobiliario']) {
  const p = inmo.obtener(propId);
  const a = await armar(p, op, destinos, opts);
  if (destinos.includes('portal_inmobiliario') && !(await conectada())) a.errores.push('Conecta la cuenta de Portal Inmobiliario de la corredora en Integraciones.');
  if (destinos.includes('toctoc') && !ttConectado()) a.errores.push('Conecta TOCTOC en Integraciones.');
  if (!a.errores.length) { // el validador oficial de cada portal (no publica nada)
    const r = await llamada('POST', '/v1/propiedades/validar', a.cuerpo);
    if (r.status === 422 && Array.isArray(r.json?.detail)) a.errores.push(motivo(r.json, r.status));
    else if (r.status >= 400 && r.status !== 422) a.errores.push('No se pudo validar el aviso: ' + motivo(r.json, r.status));
    for (const [d, v] of Object.entries(r.json?.destinos || {})) if (v && v.valido === false) a.errores.push(`${d === 'toctoc' ? TOCTOC : PORTAL}: ${motivo(v, 422)}`);
  }
  const paquete = destinos.includes('portal_inmobiliario') ? paqueteDe(a.tipoAviso) : null;
  if (paquete === 0 && !p.portales?.pi?.[op]?.itemId) a.errores.push(`No quedan publicaciones disponibles del tipo «${a.tipoAviso}» en la cuenta de Mercado Libre.`);
  return { errores: a.errores, avisos: a.avisos, payload: a.cuerpo, categoria: null, ubicacion: null, barrio: a.barrio, fotos: a.fotos, minFotos: 1, tipoAviso: a.tipoAviso, paquete, titulo: a.titulo, aviso: p.portales?.pi?.[op] || null };
}

// ---------- Portal Inmobiliario: publicar, actualizar y estados ----------
const OP_TXT = { venta: 'venta', arriendo: 'arriendo' };
const ESTADO_TXT = { active: 'activo', paused: 'pausado', closed: 'finalizado', under_review: 'en revisión', inactive: 'inactivo' };
function guardarAviso(propId, portal, op, datos, texto) {
  return inmo.parchear(propId, (p) => { p.portales ||= {}; p.portales[portal] ||= {}; p.portales[portal][op] = { ...(p.portales[portal][op] || {}), ...datos, actualizado: hoy() }; }, texto);
}
/** si el aviso se ve también en Portal Inmobiliario o solo en Mercado Libre (los gratuitos no salen en Portal Inmobiliario) */
function enPI(d) { return typeof d?.en_portal_inmobiliario === 'boolean' ? { enPI: d.en_portal_inmobiliario } : {}; }
function quitarAviso(propId, portal, op, texto) {
  return inmo.parchear(propId, (p) => { if (p.portales?.[portal]) { delete p.portales[portal][op]; if (!Object.keys(p.portales[portal]).length) delete p.portales[portal]; } }, texto);
}
/** POST /v1/propiedades a un destino: el resultado de ese destino (o error con el motivo del portal) */
async function enviar(cuerpo, destino) {
  const r = await llamada('POST', '/v1/propiedades', { ...cuerpo, destinos: [destino] });
  const d = r.json?.destinos?.[destino];
  const quien = destino === 'toctoc' ? TOCTOC : PORTAL;
  if (d?.publicado) return d;
  if (d) throw err(`${quien}: ${d.error ? motivo({ detail: { error: d.error, campos: d.campos, detalle: d.detalle, http: d.http } }, r.status) : motivo({ detail: { detalle: d.detalle, http: d.http } }, r.status)}`, CODIGOS[d.error] || 'KV_RECHAZO', { kv: d });
  if (r.status >= 400) throw err(`${quien}: ${motivo(r.json, r.status)}`, 'KV_' + r.status, { kv: r.json });
  throw err(`${quien} no confirmó la publicación.`);
}
async function publicar(propId, op, opts = {}) {
  if (opts.tituloPortal !== undefined || opts.barrio !== undefined) inmo.parchear(propId, (p) => { if (opts.tituloPortal !== undefined) p.tituloPortal = String(opts.tituloPortal).trim(); if (opts.barrio !== undefined) p.portalBarrio = opts.barrio; });
  const p0 = inmo.obtener(propId);
  if (p0.portales?.pi?.[op]?.itemId && p0.portales.pi[op].status !== 'closed') return actualizar(propId, op); // repetir el POST crearía otro aviso
  const r = await revisar(propId, op, opts);
  if (r.errores.length) throw err(r.errores.join(' '), 'ML_REVISAR', { errores: r.errores });
  const d = await enviar(r.payload, 'portal_inmobiliario');
  remotoEn = 0; // el paquete cambió
  return guardarAviso(propId, 'pi', op, { itemId: d.id, permalink: https(d.url), status: d.estado || 'active', tipoAviso: d.tipo_publicacion || r.tipoAviso, referencia: r.payload.referencia, publicado: hoy(), error: null, via: 'konver', ...enPI(d) }, `Publicada en ${PORTAL} (${OP_TXT[op]}): ${d.id}`);
}
async function actualizar(propId, op) {
  const p = inmo.obtener(propId); const a = p.portales?.pi?.[op]; if (!a?.itemId) throw err('Esta propiedad no tiene aviso en Portal Inmobiliario.');
  const x = await armar(p, op, ['portal_inmobiliario']);
  const graves = x.errores.filter((e) => !/región|número en la dirección|comuna/.test(e)); // la ubicación no se cambia con PATCH
  if (graves.length) throw err(graves.join(' '), 'ML_REVISAR', { errores: graves });
  const { titulo, descripcion, precio, fotos, contacto } = x.cuerpo;
  const it = await api('PATCH', `/v1/portal-inmobiliario/propiedades/${a.itemId}`, { titulo, descripcion, precio, fotos, contacto }, PORTAL);
  return guardarAviso(propId, 'pi', op, { status: it?.estado || a.status, permalink: https(it?.url) || a.permalink, error: null, ...enPI(it) }, `Aviso de ${PORTAL} actualizado (${OP_TXT[op]})`);
}
const ACCION_ESTADO = { active: 'activar', paused: 'pausar', closed: 'finalizar' };
async function cambiarEstado(propId, op, status, motivoTxt) {
  const a = inmo.obtener(propId).portales?.pi?.[op]; if (!a?.itemId) throw err('Esta propiedad no tiene aviso en Portal Inmobiliario.');
  if (!ACCION_ESTADO[status]) throw err('Estado no válido.');
  const it = await api('POST', `/v1/portal-inmobiliario/propiedades/${a.itemId}/${ACCION_ESTADO[status]}`, undefined, PORTAL);
  return guardarAviso(propId, 'pi', op, { status: it?.estado || status, pausadoPorEstado: status === 'paused' && !!motivoTxt }, `Aviso de ${PORTAL} ${ESTADO_TXT[status]} (${OP_TXT[op]})${motivoTxt ? ': ' + motivoTxt : ''}`);
}
/** KONVER no borra avisos: se finaliza (definitivo) y se quita de Asset */
async function eliminar(propId, op) {
  const a = inmo.obtener(propId).portales?.pi?.[op]; if (!a) throw err('Esta propiedad no tiene aviso en Portal Inmobiliario.');
  if (a.itemId && a.status !== 'closed') await api('POST', `/v1/portal-inmobiliario/propiedades/${a.itemId}/finalizar`, undefined, PORTAL);
  inmo.parchear(propId, (p) => { if (p.portales?.pi) { delete p.portales.pi[op]; if (!Object.keys(p.portales.pi).length) delete p.portales.pi; } }, `Aviso de ${PORTAL} finalizado y quitado de Asset (${OP_TXT[op]})`);
  return { borrado: false };
}

// ---------- TOCTOC: publicar (la referencia es su llave: repetir actualiza) y despublicar ----------
const EN_TT = ['active', 'publicada', 'en_feed'];
async function toctocPublicar(propId, op) {
  const r = await revisar(propId, op, {}, ['toctoc']);
  if (r.errores.length) throw err(r.errores.join(' '), 'ML_REVISAR', { errores: r.errores });
  const p0 = inmo.obtener(propId); const ya = EN_TT.includes(p0.portales?.toctoc?.[op]?.status);
  const d = await enviar(r.payload, 'toctoc');
  return guardarAviso(propId, 'toctoc', op, { status: 'active', referencia: r.payload.referencia, url: https(d.url) || p0.portales?.toctoc?.[op]?.url || null, ...(ya ? {} : { publicado: hoy() }), error: null, via: 'konver' }, `${ya ? 'Aviso de TOCTOC actualizado' : 'Publicada en TOCTOC'} (${OP_TXT[op]})`);
}
async function toctocRetirar(propId, op, status = 'retirada', texto) {
  const p = inmo.obtener(propId); const a = p.portales?.toctoc?.[op];
  const ref = a?.referencia || referencia(p, op);
  const r = await llamada('DELETE', `/v1/toctoc/propiedades/${encodeURIComponent(ref)}`);
  if (r.status >= 400 && r.status !== 404) throw err(`${TOCTOC}: ${motivo(r.json, r.status)}`, 'KV_' + r.status);
  return guardarAviso(propId, 'toctoc', op, { status, [status === 'pausada' ? 'pausada' : 'retirada']: hoy() }, texto || `Aviso de TOCTOC ${status === 'pausada' ? 'pausado' : 'retirado'} (${OP_TXT[op]})`);
}

// La ficha cambió: los avisos se mantienen al día solos (precio, fotos, título, estado comercial).
const CAMPOS_AVISO = ['titulo', 'tituloPortal', 'precioVenta', 'precioArriendo', 'fotos', 'descripcion', 'direccion', 'unidad'];
const FUERA = ['vendida', 'arrendada', 'no_disponible', 'reservada'];
async function reaccionar(antes, p) {
  const out = [];
  if (p.portales?.pi && tokensOk()) for (const op of ['venta', 'arriendo']) {
    const a = p.portales.pi[op]; if (!a?.itemId || a.status === 'closed') continue;
    const k = op === 'venta' ? 'estadoVenta' : 'estadoArriendo'; const e0 = antes[k], e1 = p[k];
    try {
      if (e0 !== e1 && FUERA.includes(e1) && a.status === 'active') { await cambiarEstado(p.id, op, 'paused', `la propiedad quedó ${String(e1).replace('_', ' ')}`); out.push(`Aviso de ${op} pausado en Portal Inmobiliario.`); continue; }
      if (e0 !== e1 && e1 === 'disponible' && a.status === 'paused' && a.pausadoPorEstado) { await cambiarEstado(p.id, op, 'active'); out.push(`Aviso de ${op} reactivado en Portal Inmobiliario.`); continue; }
      if (a.status === 'active' && CAMPOS_AVISO.some((c) => JSON.stringify(antes[c]) !== JSON.stringify(p[c]))) { await actualizar(p.id, op); out.push(`Aviso de ${op} actualizado en Portal Inmobiliario.`); }
    } catch (e) { guardarAviso(p.id, 'pi', op, { error: e.message }); out.push(`No se pudo actualizar el aviso de ${op}: ${e.message}`); }
  }
  if (p.portales?.toctoc && toctocOk()) for (const op of ['venta', 'arriendo']) {
    const a = p.portales.toctoc[op]; if (!a || a.via !== 'konver') continue;
    const k = op === 'venta' ? 'estadoVenta' : 'estadoArriendo'; const e0 = antes[k], e1 = p[k];
    try {
      if (e0 !== e1 && FUERA.includes(e1) && EN_TT.includes(a.status)) { await toctocRetirar(p.id, op, 'pausada', `Aviso de TOCTOC pausado (${op}): la propiedad quedó ${String(e1).replace('_', ' ')}`); guardarAviso(p.id, 'toctoc', op, { pausadoPorEstado: true }); out.push(`Aviso de ${op} pausado en TOCTOC.`); continue; }
      if (e0 !== e1 && e1 === 'disponible' && a.status === 'pausada' && a.pausadoPorEstado) { await toctocPublicar(p.id, op); guardarAviso(p.id, 'toctoc', op, { pausadoPorEstado: false }); out.push(`Aviso de ${op} reactivado en TOCTOC.`); continue; }
      if (EN_TT.includes(a.status) && CAMPOS_AVISO.some((c) => JSON.stringify(antes[c]) !== JSON.stringify(p[c]))) { await toctocPublicar(p.id, op); out.push(`Aviso de ${op} actualizado en TOCTOC.`); }
    } catch (e) { guardarAviso(p.id, 'toctoc', op, { error: e.message }); out.push(`No se pudo actualizar el aviso de ${op} en TOCTOC: ${e.message}`); }
  }
  return out;
}

// ---------- sincronización: estados de Portal Inmobiliario e interesados de los dos portales ----------
async function listaPI(estadoPI, max = 2000) {
  const out = [];
  for (let offset = 0; offset < max; offset += 50) {
    const r = await api('GET', `/v1/portal-inmobiliario/propiedades?estado=${estadoPI}&offset=${offset}&limit=50`, undefined, PORTAL);
    const l = Array.isArray(r) ? r : r?.propiedades || r?.resultados || r?.items || [];
    out.push(...l); if (l.length < 50) break;
  }
  return out;
}
async function sincronizar() {
  const lista = []; for (const p of inmo.todas()) for (const op of ['venta', 'arriendo']) { const a = p.portales?.pi?.[op]; if (a?.itemId) lista.push({ p, op, a }); }
  let quitados = 0; let vinculados = 0;
  if (piConectado()) {
    const vistos = new Map();
    for (const e of ['active', 'paused']) for (const it of await listaPI(e)) vistos.set(it.id, it);
    for (const x of lista) {
      let it = vistos.get(x.a.itemId);
      if (!it && x.a.status !== 'closed') {
        const r = await llamada('GET', `/v1/portal-inmobiliario/propiedades/${x.a.itemId}`).catch(() => null);
        // el portal no lo conoce (aviso de otra cuenta, de prueba o borrado): se quita de la propiedad
        if (r?.status === 404 || r?.json?.detail?.detalle?.status === 404) { quitarAviso(x.p.id, 'pi', x.op, `Aviso ${x.a.itemId} quitado: no existe en ${PORTAL} (${x.op})`); quitados++; continue; }
        it = r && r.status < 400 ? r.json : null;
      }
      if (it?.estado && it.estado !== x.a.status) guardarAviso(x.p.id, 'pi', x.op, { status: it.estado, permalink: https(it.url) || x.a.permalink, ...enPI(it) }, `Portal Inmobiliario informa aviso ${ESTADO_TXT[it.estado] || it.estado} (${x.op})`);
      else if (it && typeof it.en_portal_inmobiliario === 'boolean' && it.en_portal_inmobiliario !== x.a.enPI) guardarAviso(x.p.id, 'pi', x.op, enPI(it));
    }
    // avisos de la cuenta que la app aún no tenía (publicados fuera de Asset o en otro equipo): se vinculan por código
    vinculados = vincularAvisos(existentesDe([...vistos.values()]));
  }
  const leads = await traerLeads();
  inmo.guardarConfig({ ml: { ...(inmo.config().ml || {}), ultimaSync: hoy() } });
  return { avisos: lista.length - quitados + vinculados, quitados, vinculados, leads };
}
const CANAL = { whatsapp: 'WhatsApp', question: 'pregunta', call: 'llamada', contact_request: 'solicitud de contacto', visit_request: 'solicitud de visita', schedule: 'solicitud de visita', quotation: 'cotización' };
/** GET /v1/leads?despues_de=<último id>: los nuevos de los dos portales, una vez cada uno */
async function traerLeads() {
  const cfg = inmo.config().konver || {};
  const porItem = new Map(); const porRef = new Map();
  for (const p of inmo.todas()) for (const op of ['venta', 'arriendo']) {
    const a = p.portales?.pi?.[op]; if (a?.itemId) porItem.set(a.itemId, { id: p.id, op });
    porRef.set(referencia(p, op), { id: p.id, op });
  }
  let cursor = cfg.leadsCursor || 0; let nuevos = 0;
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const r = await api('GET', `/v1/leads?limit=500${cursor ? '&despues_de=' + cursor : ''}`);
    for (const l of r?.leads || []) {
      cursor = Math.max(cursor, Number(l.id) || 0);
      const tt = l.portal === 'toctoc';
      const x = (l.referencia && porRef.get(l.referencia)) || (!tt && porItem.get(l.propiedad_id)) || (tt && porRef.get(l.propiedad_id)) || null;
      if (!x) continue;
      if (inmo.registrarLead(x.id, { id: 'kv-' + l.id, portal: tt ? TOCTOC : PORTAL, canal: l.tipo, canalTxt: CANAL[l.tipo] || l.tipo, nombre: l.nombre, email: l.email, telefono: l.telefono, mensaje: l.mensaje || '', fecha: l.fecha || l.recibido, ...(tt ? {} : { itemId: l.propiedad_id }), op: x.op, visto: false })) nuevos++;
    }
    if (r?.siguiente) cursor = Math.max(cursor, Number(r.siguiente) || 0);
    if (!r?.hay_mas) break;
  }
  inmo.guardarConfig({ konver: { ...(inmo.config().konver || {}), leadsCursor: cursor }, ml: { ...(inmo.config().ml || {}), ultimosLeads: hoy() } });
  inmo.guardar();
  return nuevos;
}

// ---------- avisos que la corredora ya tiene en Portal Inmobiliario ----------
async function avisosExistentes() { return existentesDe(await listaPI('active')); }
function existentesDe(items) {
  const ya = new Set(); for (const p of inmo.todas()) for (const op of ['venta', 'arriendo']) if (p.portales?.pi?.[op]?.itemId) ya.add(p.portales.pi[op].itemId);
  const props = inmo.todas();
  return items.filter((it) => !ya.has(it.id)).map((it) => {
    const ref = String(it.referencia || ''); const m = ref.match(/^(.*)-(V|A)$/); const cod = m ? m[1] : ref;
    const p = cod && props.find((q) => norm(q.codigo) === norm(cod) || (q.origen?.externo != null && norm(q.origen.externo) === norm(cod)));
    const op = m ? (m[2] === 'V' ? 'venta' : 'arriendo') : p ? (p.venta && !p.arriendo ? 'venta' : p.arriendo && !p.venta ? 'arriendo' : 'venta') : null;
    return { itemId: it.id, estado: it.estado, enPI: it.en_portal_inmobiliario, creado: it.creado || null, titulo: it.titulo, permalink: https(it.url), precio: it.precio, moneda: it.moneda, codigo: cod, op, propId: p?.id || null, propTitulo: p?.titulo || null };
  });
}
function vincularAvisos(lista) {
  let n = 0; for (const x of lista) { if (!x.propId || !x.op || !x.itemId) continue; guardarAviso(x.propId, 'pi', x.op, { itemId: x.itemId, permalink: x.permalink, status: x.estado || 'active', ...(typeof x.enPI === 'boolean' ? { enPI: x.enPI } : {}), vinculado: true, publicado: x.creado || null, via: 'konver' }, `Aviso existente de ${PORTAL} vinculado (${x.op}): ${x.itemId}`); n++; }
  return n;
}
async function barrios(comuna, reg) {
  const r = await region(reg, comuna); if (!r || !comuna) return [];
  const l = await api('GET', `/v1/ubicaciones/barrios?region=${encodeURIComponent(r)}&comuna=${encodeURIComponent(comuna)}`).catch(() => []);
  return (Array.isArray(l) ? l : l?.barrios || []).map((b) => ({ id: b.id, name: b.nombre || b.name }));
}
function guardarContacto(c, tipoAviso) {
  const contacto = { nombre: String(c.nombre || '').trim(), email: String(c.email || '').trim(), telefono: String(c.telefono || '').trim(), whatsapp: String(c.whatsapp || '').trim(), web: String(c.web || '').trim() };
  if (contacto.whatsapp && !telefono(contacto.whatsapp)) throw err('El WhatsApp debe ser un celular chileno, por ejemplo +56 9 1234 5678.');
  inmo.guardarConfig({ contacto, ml: { ...(inmo.config().ml || {}), tipoAviso: ['free', 'silver', 'gold', 'gold_premium'].includes(tipoAviso) ? tipoAviso : 'silver' } });
  return estado();
}
async function paquetes() {
  await estadoRemoto().catch(() => {});
  const out = {}; for (const t of ['free', 'silver', 'gold', 'gold_premium']) out[t] = paqueteDe(t);
  return out;
}
/** KONVER no entrega visitas por aviso */
async function metricas() { return null; }

module.exports = {
  metricas, tokensOk, toctocOk, conectada, estado, conectar, desconectar, revisar, publicar, actualizar, cambiarEstado, eliminar, reaccionar, sincronizar, traerLeads,
  avisosExistentes, vincularAvisos, barrios, guardarContacto, paquetes, guardarLlave, quitarLlave, toctocConectar, toctocDesconectar, toctocPublicar, toctocRetirar,
  _armar: armar, _calleNumero: calleNumero, _referencia: referencia, _motivo: motivo, _norm: norm, _whatsapp: (n) => { const t = telefono(n); return t ? { country_code2: '56', phone2: t.slice(3) } : null; },
};
