// PortalFirma Asset: base local de la gestión inmobiliaria (cartera, personas y su actividad).
// Etapa 1: todo vive en el computador (userData/inmo/datos.json, escritura atómica). Las propiedades
// reales se importan desde la tool `property_manage_tools` del MCP de Portalfirma; cuando el backend
// exponga escritura (ver API-inmobiliaria.md) este módulo sincroniza en ambos sentidos.
const fs = require('fs'); const path = require('path');
const { app, shell } = require('electron');
const FC = require('./ficha-campos');

const dir = () => { const d = process.env.PF_INMO_DIR || path.join(app.getPath('userData'), 'inmo'); fs.mkdirSync(d, { recursive: true }); return d; };
const file = () => path.join(dir(), 'datos.json');
const now = () => new Date().toISOString();
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let cache = null;
function db() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { cache = {}; }
  cache.version = 1; cache.propiedades ||= []; cache.personas ||= []; cache.actividad ||= [];
  return cache;
}
function save() { // escritura atómica: nunca queda un archivo a medias
  const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cache, null, 1)); fs.renameSync(tmp, file());
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

// ---------- actividad (historial de cada propiedad y persona) ----------
function log(ref, texto, extra = {}) {
  const d = db(); d.actividad.unshift({ id: uid('a'), fecha: now(), ref, texto: String(texto).slice(0, 600), ...extra });
  d.actividad.length = Math.min(d.actividad.length, 5000);
}
const actividadDe = (id) => db().actividad.filter((a) => a.ref === id || a.ref2 === id).slice(0, 200);

// ---------- propiedades ----------
const prop = (id) => { const p = db().propiedades.find((x) => x.id === id); if (!p) throw err('La propiedad ya no existe.'); return p; };
function siguienteCodigo() {
  const n = db().propiedades.map((p) => Number(String(p.codigo || '').match(/^PF-(\d+)$/)?.[1] || 0));
  return 'PF-' + String(Math.max(1000, ...n) + 1);
}
function guardarPropiedad(o) {
  const d = db(); const datos = limpiarProp(o);
  if (o.id) {
    const p = prop(o.id); if (o.ficha !== undefined) datos.ficha = FC.limpiarFicha(o.ficha, p.ficha); // los datos nuevos se suman a los que ya había
    const nz = (v) => (v === '' || v === undefined ? null : v);
    const cambios = Object.keys(datos).filter((k) => JSON.stringify(nz(p[k])) !== JSON.stringify(nz(datos[k])));
    if (!cambios.length) return p;
    Object.assign(p, datos, { actualizado: now() });
    if (p.origen) p.editados = [...new Set([...(p.editados || []), ...cambios])]; // la próxima importación respeta lo editado aquí
    const est = cambios.filter((k) => /^estado/.test(k));
    log(p.id, est.length ? `Estado: ${est.map((k) => (k === 'estadoVenta' ? 'venta ' : 'arriendo ') + (p[k] || '—').replace('_', ' ')).join(', ')}` : `Ficha actualizada (${cambios.length} ${cambios.length === 1 ? 'dato' : 'datos'})`);
    save(); return p;
  }
  if (!datos.titulo) throw err('Indica un título para la propiedad.');
  if (!datos.venta && !datos.arriendo) throw err('Marca si la propiedad está en venta, en arriendo o ambas.');
  const p = { id: uid('p'), codigo: datos.codigo || siguienteCodigo(), tipo: 'casa', estadoVenta: datos.venta ? 'disponible' : null, estadoArriendo: datos.arriendo ? 'disponible' : null,
    vinculos: [], documentos: [], fotos: [], creado: now(), actualizado: now(), ...datos };
  d.propiedades.unshift(p); log(p.id, 'Propiedad creada'); save(); return p;
}
function archivarPropiedad(id, archivar = true) {
  const p = prop(id); p.archivada = !!archivar; p.actualizado = now(); log(id, archivar ? 'Propiedad archivada' : 'Propiedad restaurada'); save(); return p;
}

// ---------- personas (RUT único) ----------
const persona = (id) => { const p = db().personas.find((x) => x.id === id); if (!p) throw err('La persona ya no existe.'); return p; };
const porRut = (rut) => db().personas.find((p) => cleanRut(p.rut) === cleanRut(rut));
// 0.16.16 · ¿es empresa? (RUT de 50 millones o más, o razón social con SpA, Ltda., S.A., EIRL…)
const RS = /\b(spa|s\.?p\.?a\.?|ltda\.?|limitada|s\.\s?a\.?|sociedad an[oó]nima|eirl|e\.i\.r\.l\.?|sociedad|inversiones|inmobiliaria|constructora|comercial|servicios)\b/i;
function esEmpresa(o) { if (!o) return false; if (o.tipo === 'juridica') return true; if (o.tipo === 'natural' && o.tipoFijo) return false;
  const n = Number(String(o.rut || '').replace(/[^0-9kK]/g, '').slice(0, -1)); return n >= 50000000 || RS.test(String(o.nombre || '')); }
function guardarPersona(o) {
  const d = db();
  const nombre = String(o.nombre || '').trim().replace(/\s+/g, ' ');
  if (!nombre) throw err('Indica el nombre o la razón social.');
  // 0.16.23 · el RUT puede faltar (un interesado que aún no lo da); si viene, debe ser válido
  if (String(o.rut || '').trim() && !validRut(o.rut)) throw err('El RUT no es válido.', 'RUT');
  const email = String(o.email || '').trim(); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err('El correo no es válido.');
  const dup = String(o.rut || '').trim() ? porRut(o.rut) : null;
  if (dup && dup.id !== o.id) throw err(`Ya existe ${dup.nombre} con ese RUT.`, 'DUP_RUT');
  const datos = { nombre, rut: String(o.rut || '').trim() ? fmtRut(o.rut) : '', tipo: o.tipo === 'juridica' || o.tipo === 'natural' ? o.tipo : esEmpresa({ nombre, rut: o.rut }) ? 'juridica' : 'natural', email, telefono: String(o.telefono || '').trim(), direccion: String(o.direccion || '').trim(),
    estadoCivil: String(o.estadoCivil || '').trim(), profesion: String(o.profesion || '').trim(), nacionalidad: String(o.nacionalidad || '').trim() || 'chilena',
    roles: [...new Set((o.roles || []).filter((r) => ROLES.includes(r)))], notas: String(o.notas || '').slice(0, 2000) };
  if (o.id) { const p = persona(o.id); Object.assign(p, datos, { actualizado: now() }); log(p.id, 'Datos actualizados'); save(); return p; }
  const p = { id: uid('c'), ...datos, creado: now(), actualizado: now() };
  d.personas.unshift(p); log(p.id, 'Persona creada'); save(); return p;
}
// 0.16.23 · gestor de leads: cada interesado queda como persona aunque falten datos; lo que llega después se agrega
// (nunca se pisa lo que ya estaba) y cada novedad queda en su historial.
const digT = (t) => String(t || '').replace(/\D/g, '').slice(-9);
function personaDesdeLead(l, { evento = null, esLead = true } = {}) {
  const d = db(); const t = digT(l.telefono); const em = String(l.email || '').toLowerCase().trim();
  let p = (l.personaId && d.personas.find((x) => x.id === l.personaId))
    || (l.rut && validRut(l.rut) && porRut(l.rut))
    || (t.length >= 8 && d.personas.find((x) => digT(x.telefono) === t))
    || (em && d.personas.find((x) => String(x.email || '').toLowerCase() === em)) || null;
  const nombre = String(l.nombre || '').trim() || String(l.chatCon || '').trim();
  if (!p) {
    if (!nombre && !t && !em) return null;
    p = { id: uid('c'), nombre: nombre || l.telefono || l.email || 'Interesado', rut: '', tipo: 'natural', email: em, telefono: String(l.telefono || '').trim(), direccion: '', estadoCivil: '', profesion: '', nacionalidad: 'chilena',
      roles: ['interesado'], notas: '', ...(esLead ? { leadId: l.id } : {}), creado: now(), actualizado: now() };
    d.personas.unshift(p); log(p.id, `Llegó como interesado por ${l.origenTxt || l.origen || 'un canal'}${l.ig?.usuario ? ' (@' + l.ig.usuario + ')' : ''}`, { tipo: 'lead', ...(esLead ? { ref2: l.id } : {}) });
  }
  const agregado = [];
  const poner = (k, v, txt) => { v = String(v || '').trim(); if (v && !String(p[k] || '').trim()) { p[k] = v; agregado.push(txt); } };
  if (p.nombre === 'Interesado' || /^[+\d\s().-]+$/.test(p.nombre) || /@/.test(p.nombre)) { if (nombre && !/^[+\d\s().-]+$/.test(nombre)) { p.nombre = nombre; agregado.push('nombre'); } }
  poner('telefono', l.telefono, 'teléfono'); poner('email', em, 'correo');
  if (l.rut && validRut(l.rut) && !p.rut && !(porRut(l.rut) && porRut(l.rut) !== p)) { p.rut = fmtRut(l.rut); agregado.push('RUT'); }
  if (!p.roles.includes('interesado') && !p.roles.length) p.roles.push('interesado');
  if (esLead) p.leadId ||= l.id;
  if (l.corredor !== undefined && (p.corredor?.id || null) !== (l.corredor?.id || null)) p.corredor = l.corredor || null;
  if (agregado.length && p.creado !== p.actualizado) log(p.id, `Se agregó su ${agregado.join(', ')} (desde Leads)`, { tipo: 'lead', ref2: l.id });
  if (evento) log(p.id, evento, { tipo: 'lead', ref2: l.id });
  p.actualizado = now(); save(); return p;
}
function borrarPersona(id) {
  const p = persona(id); const d = db();
  const uso = d.propiedades.filter((x) => (x.vinculos || []).some((v) => v.personaId === id));
  if (uso.length) throw err(`No se puede eliminar: está vinculada a ${uso.length === 1 ? 'la propiedad ' + uso[0].codigo : uso.length + ' propiedades'}. Quita primero el vínculo.`, 'EN_USO');
  d.personas = d.personas.filter((x) => x !== p); save(); return true;
}

// ---------- vínculos persona ↔ propiedad ----------
function vincular(propId, personaId, rol) {
  const p = prop(propId); const c = persona(personaId); if (!ROLES.includes(rol)) throw err('Rol no válido.');
  p.vinculos ||= [];
  if (p.vinculos.some((v) => v.personaId === personaId && v.rol === rol)) return p;
  p.vinculos.push({ personaId, rol, desde: now() });
  if (!c.roles.includes(rol)) c.roles.push(rol);
  p.actualizado = now(); log(p.id, `${c.nombre} vinculado como ${rol}`, { ref2: c.id }); save(); return p;
}
function desvincular(propId, personaId, rol) {
  const p = prop(propId); const c = db().personas.find((x) => x.id === personaId);
  p.vinculos = (p.vinculos || []).filter((v) => !(v.personaId === personaId && v.rol === rol));
  p.actualizado = now(); log(p.id, `${c?.nombre || 'Persona'} ya no figura como ${rol}`, { ref2: personaId }); save(); return p;
}

// ---------- notas y documentos ----------
function nota(ref, texto) { if (!String(texto || '').trim()) throw err('Escribe la nota.'); log(ref, String(texto).trim(), { tipo: 'nota' }); save(); return actividadDe(ref); }
const docsDir = (id) => { const d = path.join(dir(), 'documentos', id.replace(/[^a-z0-9]/gi, '')); fs.mkdirSync(d, { recursive: true }); return d; };
function agregarDocumentos(propId, paths, tipo = 'otro') {
  const p = prop(propId); const out = docsDir(propId); p.documentos ||= [];
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
function quitarDocumento(propId, docId) {
  const p = prop(propId); const doc = (p.documentos || []).find((x) => x.id === docId); if (!doc) return p;
  p.documentos = p.documentos.filter((x) => x !== doc); try { fs.unlinkSync(doc.path); } catch {}
  log(p.id, `Documento quitado: ${doc.nombre}`); save(); return p;
}
const docPath = (propId, docId) => { const doc = (prop(propId).documentos || []).find((x) => x.id === docId); if (!doc || !fs.existsSync(doc.path)) throw err('El archivo ya no está.'); return doc.path; };
const mostrarCarpeta = (propId) => shell.openPath(docsDir(propId));

// ---------- importación desde Portalfirma (MCP: property_manage_tools) ----------
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
// pf.callRaw(name, args) → { text, isError }. Lee todas las páginas y el detalle de cada propiedad.
async function importarPF(pf, progreso = () => {}) {
  const call = async (args) => { const r = await pf.callRaw('property_manage_tools', args); if (r.isError) throw err('Portalfirma: ' + r.text); return JSON.parse(r.text); };
  const ids = []; let page = 1, pages = 1;
  do { const r = await call({ action: 'search', page, page_size: 50 }); ids.push(...(r.items || []).map((i) => i.id)); pages = r.total_pages || 1; page++; } while (page <= pages && page <= 40);
  const d = db(); const res = { nuevas: 0, actualizadas: 0, sinCambios: 0, personas: 0, total: ids.length };
  for (let i = 0; i < ids.length; i++) {
    progreso({ i: i + 1, total: ids.length });
    let x; for (let k = 0; ; k++) { try { x = await call({ action: 'get', id_property: ids[i] }); break; } catch (e) { if (k >= 2 || e.code === 'NEEDS_LOGIN' || /NEEDS_LOGIN/.test(e.message)) { if (/NEEDS_LOGIN/.test(e.message) || e.code === 'NEEDS_LOGIN') throw e; res.errores = (res.errores || 0) + 1; x = null; break; } await new Promise((r) => setTimeout(r, 800 * (k + 1))); } }
    if (!x) continue;
    const datos = desdePF(x); const inactiva = x.convecta_status?.state?.name && !/^\s*activa\s*$/i.test(x.convecta_status.state.name);
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

// ---------- acceso para otros módulos (portales) ----------
const obtener = (id) => prop(id);
function parchear(id, fn, texto) { const p = prop(id); fn(p); p.actualizado = now(); if (texto) log(id, texto); save(); return p; }
const todas = () => db().propiedades;
const negocios = () => (db().negocios ||= []);
const eventos = () => (db().eventos ||= []);
const personaPorId = (id) => db().personas.find((x) => x.id === id) || null;
FC.propietario.buscar = personaPorId;
const registrar = (ref, texto, extra) => log(ref, texto, extra);
function config() { return db().config || {}; }
function guardarConfig(parcial) { const d = db(); d.config = { ...(d.config || {}), ...parcial }; save(); return d.config; }
// Interesado que llega desde un portal: queda en la ficha; si trae RUT válido entra al CRM como «interesado».
function registrarLead(propId, l) {
  const p = prop(propId); p.leads ||= [];
  if (p.leads.some((x) => x.id === l.id)) return false;
  p.leads.unshift({ ...l, recibido: now() }); p.leads.length = Math.min(p.leads.length, 300);
  let c = null;
  if (l.rut && validRut(l.rut)) {
    c = porRut(l.rut);
    if (!c) { c = { id: uid('c'), nombre: String(l.nombre || 'Interesado').trim(), rut: fmtRut(l.rut), tipo: 'natural', email: l.email || '', telefono: l.telefono || '', direccion: '', roles: ['interesado'], notas: '', nacionalidad: 'chilena', creado: now(), actualizado: now() }; db().personas.push(c); log(c.id, `Llegó como interesado desde ${l.portal}`); }
  } else if (l.telefono || l.email) { // sin RUT: igual queda como persona (0.16.23)
    c = personaDesdeLead({ id: l.id, nombre: l.nombre, telefono: l.telefono, email: l.email, origenTxt: l.portal }, { esLead: false });
  }
  if (c) { p.vinculos ||= []; if (!p.vinculos.some((v) => v.personaId === c.id && v.rol === 'interesado')) { p.vinculos.push({ personaId: c.id, rol: 'interesado', desde: now() }); if (!c.roles.includes('interesado')) c.roles.push('interesado'); } }
  log(p.id, `Nuevo interesado desde ${l.portal}: ${l.nombre || 'sin nombre'} (${l.canalTxt || l.canal})`, { tipo: 'lead', ref2: c?.id });
  return true;
}

// ---------- lectura para la interfaz ----------
function listar() { const d = db(); return { propiedades: d.propiedades, personas: d.personas, ultimaImportacion: d.ultimaImportacion || null }; }
function resumen() {
  const d = db(); const act = d.propiedades.filter((p) => !p.archivada);
  const c = (f) => act.filter(f).length;
  return {
    propiedades: act.length, personas: d.personas.length,
    venta: { disponible: c((p) => p.venta && p.estadoVenta === 'disponible'), reservada: c((p) => p.venta && p.estadoVenta === 'reservada'), vendida: c((p) => p.venta && p.estadoVenta === 'vendida') },
    arriendo: { disponible: c((p) => p.arriendo && p.estadoArriendo === 'disponible'), reservada: c((p) => p.arriendo && p.estadoArriendo === 'reservada'), arrendada: c((p) => p.arriendo && p.estadoArriendo === 'arrendada') },
    sinPropietario: c((p) => !(p.vinculos || []).some((v) => v.rol === 'propietario')),
    sinFotos: c((p) => !(p.fotos || []).length),
    conLeads: c((p) => (p.leads || []).some((l) => !l.visto)),
    enPortal: c((p) => ['venta', 'arriendo'].some((op) => p.portales?.pi?.[op]?.status === 'active')),
    actividad: d.actividad.slice(0, 12).map((a) => ({ ...a, nombre: d.propiedades.find((p) => p.id === a.ref)?.titulo || d.personas.find((p) => p.id === a.ref)?.nombre || '' })),
    ultimaImportacion: d.ultimaImportacion || null,
  };
}
// Toda la actividad (pantalla «Actividad»): con el nombre de lo que tocó, filtros y páginas
function actividadTodas({ q = '', clase = '', desde = 0, limite = 60 } = {}) {
  const d = db(); const P = new Map(d.propiedades.map((p) => [p.id, p])); const C = new Map(d.personas.map((p) => [p.id, p]));
  const N = new Map((d.negocios || []).map((n) => [n.id, n])); const E = new Map((d.eventos || []).map((e) => [e.id, e]));
  const nombreDe = (id) => {
    if (P.has(id)) { const p = P.get(id); return { clase: 'propiedad', nombre: `${p.codigo} · ${p.titulo}`, ir: id }; }
    if (C.has(id)) return { clase: 'persona', nombre: C.get(id).nombre, ir: id };
    if (N.has(id)) { const n = N.get(id); const p = P.get(n.propId); const c = C.get(n.clienteId); return { clase: 'negocio', nombre: `Negocio de ${n.tipo}${c ? ' · ' + c.nombre : ''}${p ? ' · ' + p.codigo : ''}`, ir: id }; }
    if (E.has(id)) { const e = E.get(id); return { clase: 'agenda', nombre: e.titulo || 'Evento', ir: e.fecha }; }
    return { clase: 'otro', nombre: '', ir: null };
  };
  const t = String(q || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const min = (f) => String(f || '').slice(0, 16); const out = []; let total = 0;
  for (let i = 0; i < d.actividad.length; i++) {
    const a = d.actividad[i]; const prev = d.actividad[i - 1];
    if (prev && min(prev.fecha) === min(a.fecha) && (prev.texto === a.texto || String(prev.texto).startsWith(a.texto) || String(a.texto).startsWith(prev.texto))) continue; // la misma acción en la propiedad y en su negocio
    const x = { id: a.id, fecha: a.fecha, texto: a.texto, nota: a.tipo === 'nota', ...nombreDe(a.ref) };
    if (clase && (clase === 'nota' ? !x.nota : x.clase !== clase)) continue;
    if (t && !`${x.nombre} ${x.texto}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(t)) continue;
    if (total >= desde && out.length < limite) out.push(x); total++;
  }
  return { items: out, total };
}
function exportarDatos() { return JSON.parse(JSON.stringify(db())); }
const _reset = () => { cache = null; };

module.exports = { personaDesdeLead, esEmpresa, eventos, negocios, personaPorId, registrar, obtener, parchear, todas, config, guardarConfig, registrarLead, guardar: save, TIPOS, ESTADOS, ROLES, validRut, fmtRut, listar, resumen, guardarPropiedad, archivarPropiedad, guardarPersona, borrarPersona, vincular, desvincular,
  nota, actividadDe, actividadTodas, agregarDocumentos, quitarDocumento, docPath, mostrarCarpeta, importarPF, desdePF, exportarDatos, _reset };
