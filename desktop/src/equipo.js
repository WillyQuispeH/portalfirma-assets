// El equipo de la corredora: los usuarios de Asset (api: /v1/usuarios). Reemplaza la lista local de «corredores» que
// cada equipo guardaba: el captador de una propiedad, el dueño de un lead o de un negocio es un usuario.
//  · lista(): copia en memoria de GET /usuarios/equipo (todos los roles la pueden leer), para las lecturas sincrónicas
//    (nombre del captador, a quién pertenece un lead…). Se carga al iniciar sesión y se refresca tras cada cambio.
//  · El administrador crea usuarios (con clave inicial), los edita (nombre, rol, teléfono, activo), les asigna clave
//    nueva y los vincula con su usuario de wechatia (para tomar el «Propietario» de cada contacto allá).
// En modo de prueba (PF_MOCK) las mismas rutas las responde el simulado de src/asset.js.
'use strict';
const err = (m, code) => Object.assign(new Error(m), code ? { code } : {});

function crear({ asset, res = null, alCambiar = () => {} }) {
  let cache = [];
  // forma que usan leads, negocios y la interfaz (celular = teléfono, como los corredores de antes)
  const forma = (u) => ({ id: u.id, nombre: u.nombre, email: u.email || '', rol: u.rol, celular: u.telefono || '', telefono: u.telefono || '', activo: u.activo !== false, wechatiaId: u.wechatiaId || null, wechatiaNombre: u.wechatiaNombre || null });
  async function cargar() {
    try { cache = (await asset.llamar('GET', '/usuarios/equipo')).map((u) => ({ ...forma(u), wechatiaNombre: cache.find((c) => c.id === u.id)?.wechatiaNombre || null })); }
    catch (e) { if (e.code !== 'NEEDS_ASSET_LOGIN') console.warn('[equipo]', e.message); }
    return cache;
  }
  const vaciar = () => { cache = []; };
  const lista = () => cache;
  const activos = () => cache.filter((u) => u.activo);
  const porId = (id) => (id ? cache.find((u) => u.id === id) || null : null);
  const nombre = (id) => porId(id)?.nombre || null;
  const porWechatia = (uid) => (uid ? cache.find((c) => c.wechatiaId === uid) || null : null);

  // ---------- administración (solo el administrador; la API también lo revisa) ----------
  const despues = async (r) => { await cargar(); alCambiar(); return r; };
  async function listar() { const l = (await asset.llamar('GET', '/usuarios')).map((u) => ({ ...u, telefono: u.telefono || '' })); for (const u of l) { const c = porId(u.id); if (c) c.wechatiaNombre = u.wechatiaNombre || null; } return l; }
  function crearUsuario(o = {}) {
    const email = String(o.email || '').trim().toLowerCase(); const nombre = String(o.nombre || '').trim().replace(/\s+/g, ' ');
    if (nombre.length < 2) throw err('Indica el nombre (al menos 2 letras).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err('El correo no es válido.');
    if (String(o.clave || '').length < 8) throw err('La clave inicial debe tener al menos 8 caracteres.');
    return asset.llamar('POST', '/usuarios', { email, nombre, clave: String(o.clave), rol: o.rol === 'ADMIN' ? 'ADMIN' : 'CORREDOR', telefono: String(o.telefono || '').trim() || null }).then(despues);
  }
  function editar(id, o = {}) {
    if (!id) throw err('Falta el usuario.');
    const b = {};
    if (o.nombre !== undefined) { b.nombre = String(o.nombre || '').trim().replace(/\s+/g, ' '); if (b.nombre.length < 2) throw err('Indica el nombre (al menos 2 letras).'); }
    if (o.rol !== undefined) b.rol = o.rol === 'ADMIN' ? 'ADMIN' : 'CORREDOR';
    if (o.activo !== undefined) b.activo = !!o.activo;
    if (o.telefono !== undefined) { const t = String(o.telefono || '').trim(); const d = t.replace(/\D/g, ''); if (t && (d.length < 8 || d.length > 15)) throw err('El teléfono no es válido.'); b.telefono = t || null; }
    if (o.wechatiaId !== undefined) { b.wechatiaId = String(o.wechatiaId || '').trim() || null; b.wechatiaNombre = String(o.wechatiaNombre || '').trim() || null; }
    return asset.llamar('PATCH', `/usuarios/${id}`, b).then(despues);
  }
  function clave(id, nueva) {
    if (String(nueva || '').length < 8) throw err('La clave debe tener al menos 8 caracteres.');
    return asset.llamar('PUT', `/usuarios/${id}/clave`, { clave: String(nueva) }).then(() => true);
  }
  return { cargar, vaciar, lista, activos, porId, nombre, porWechatia, listar, crear: crearUsuario, editar, clave };
}
module.exports = { crear };
