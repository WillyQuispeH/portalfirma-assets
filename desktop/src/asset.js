// Cuenta de PortalFirma Asset: el login propio contra la API de Asset (api/ en este repositorio).
//  · Se entra con email y clave; se guardan, cifrados con safeStorage, el token de acceso (corto) y el de renovación
//    (largo, se rota en cada uso). Nunca se guarda la clave.
//  · Cada llamada lleva «Authorization: Bearer <tokenAcceso>»; si responde 401, se renueva una vez y se reintenta.
//  · Portalfirma ya no es el login de la app: queda como conexión aparte, solo para firma y plantillas.
// URL de la API: PF_ASSET_API, o la de desarrollo (localhost) mientras la app no esté empaquetada.
const os = require('os');
const { app } = require('electron');
const store = require('./store');

const DESARROLLO = 'http://localhost:3000/v1';
const PRODUCCION = 'https://asset.matchoncard.cl/v1'; // temporal, hasta habilitar asset.portalfirma.cl
const CLAVE = 'assetSesion';

const err = (m, code, status) => Object.assign(new Error(m), { code, status });
const base = () => {
  const u = process.env.PF_ASSET_API || (app.isPackaged ? PRODUCCION : DESARROLLO);
  if (!u) throw err('Falta configurar la dirección del servidor de Asset.', 'SIN_API');
  return u.replace(/\/+$/, '');
};
const sesion = () => store.getSecret(CLAVE) || null;
const guardar = (s) => store.setSecret(CLAVE, s || undefined);

async function pedir(metodo, ruta, cuerpo, token) {
  let r;
  try {
    r = await fetch(base() + ruta, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    if (e.code === 'SIN_API') throw e;
    throw err('No se pudo conectar con el servidor de Asset. Revisa tu conexión a internet.', 'SIN_CONEXION');
  }
  let d = null;
  try { d = r.status === 204 ? null : await r.json(); } catch {}
  if (!r.ok) {
    const m = Array.isArray(d?.message) ? d.message.join('. ') : d?.message;
    // el código de la API (DUP_RUT, EN_USO, VERSION…) pasa tal cual para que quien llama lo distinga
    // el código de la API y sus datos (p. ej. el id del lead que ya existe en un DUPLICADO) van en el error
    throw Object.assign(err(r.status === 429 ? 'Demasiados intentos. Espera un minuto y vuelve a intentar.' : m || `El servidor respondió ${r.status}.`, r.status === 401 ? 'NEEDS_ASSET_LOGIN' : d?.code || 'API', r.status), { datos: d });
  }
  return d;
}

let renovando = null;
function renovar() {
  // una sola renovación a la vez: el token de renovación se rota y no se puede usar dos veces
  renovando ??= (async () => {
    const s = sesion();
    if (!s?.tokenRenovar) throw err('Inicia sesión.', 'NEEDS_ASSET_LOGIN', 401);
    try {
      const d = await pedir('POST', '/auth/renovar', { tokenRenovar: s.tokenRenovar });
      guardar({ ...s, ...d });
      return d;
    } catch (e) {
      if (e.status === 401) guardar(null);
      throw e;
    }
  })().finally(() => { renovando = null; });
  return renovando;
}

/** Llamada con sesión a la API de Asset (la usarán los módulos que pasen sus datos a la base). */
async function llamar(metodo, ruta, cuerpo) {
  let s = sesion();
  if (!s) throw err('Inicia sesión.', 'NEEDS_ASSET_LOGIN', 401);
  try {
    return await pedir(metodo, ruta, cuerpo, s.tokenAcceso);
  } catch (e) {
    if (e.status !== 401) throw e;
    s = await renovar();
    return pedir(metodo, ruta, cuerpo, s.tokenAcceso);
  }
}

async function ingresar(email, clave) {
  const d = await pedir('POST', '/auth/ingresar', { email: String(email || '').trim(), clave: String(clave || ''), dispositivo: os.hostname().slice(0, 120) });
  guardar(d);
  return yo();
}

/** Al abrir la app: la cuenta guardada, ya verificada con el servidor; null si hay que iniciar sesión. */
async function restaurar() {
  if (!sesion()) return null;
  try {
    return await yo();
  } catch (e) {
    if (e.code === 'NEEDS_ASSET_LOGIN') return null;
    throw e; // sin conexión: la pantalla de ingreso lo dice (la sesión guardada se conserva)
  }
}

const yo = () => llamar('GET', '/auth/yo');

async function salir() {
  try { if (sesion()) await llamar('POST', '/auth/salir'); } catch {} // aunque el servidor no responda, se borra aquí
  guardar(null);
}

// Modo de prueba (PF_MOCK): sin servidor. Entra solo, salvo con PF_MOCK_ASSET_LOGIN=1 (para probar el ingreso),
// donde acepta cualquier email con la clave «demo1234». El rol del usuario simulado es ADMIN, o CORREDOR con
// PF_MOCK_ROL=corredor (para probar permisos). También simula los usuarios de la corredora (/usuarios…): los que crea
// el administrador pueden ingresar con su email y clave, así una prueba cambia de usuario sin servidor.
function simulado() {
  const CORREDORA = { id: '00000000-0000-4000-8000-000000000002', nombre: 'Corredora Demo' };
  const rolInicial = /^corredor$/i.test(process.env.PF_MOCK_ROL || '') ? 'CORREDOR' : 'ADMIN';
  const yoDe = (u) => ({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, corredoraId: CORREDORA.id, corredora: CORREDORA });
  const semilla = () => [
    { id: '00000000-0000-4000-8000-000000000001', email: 'corredor@demo.cl', nombre: 'Corredor Demo', rol: rolInicial, clave: 'demo1234', activo: true, telefono: '', wechatiaId: null, wechatiaNombre: null },
    ...(rolInicial === 'CORREDOR' ? [{ id: '00000000-0000-4000-8000-000000000003', email: 'admin@demo.cl', nombre: 'Administración Demo', rol: 'ADMIN', clave: 'demo1234', activo: true, telefono: '', wechatiaId: null, wechatiaNombre: null }] : []),
  ];
  const usuarios = () => { let l = store.get('mockUsuarios'); if (!Array.isArray(l) || !l.length) { l = semilla(); store.set('mockUsuarios', l); } return l; };
  const guardarUs = (l) => store.set('mockUsuarios', l);
  let actual = process.env.PF_MOCK_ASSET_LOGIN === '1' ? null : yoDe(usuarios()[0]);
  const no = (m, status = 400, code = 'API') => err(m, status === 401 ? 'NEEDS_ASSET_LOGIN' : code, status);
  const detalle = (u) => ({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, corredoraId: CORREDORA.id, activo: u.activo, telefono: u.telefono || '', wechatiaId: u.wechatiaId || null, wechatiaNombre: u.wechatiaNombre || null, ultimoIngreso: u.ultimoIngreso || null });
  const soloAdmin = () => { if (!actual) throw no('Inicia sesión.', 401); if (actual.rol !== 'ADMIN') throw no('No tienes permiso para esto.', 403); };
  // las rutas de /usuarios que usa la app (mismas reglas que api/src/usuarios/usuarios.controller.ts)
  async function llamar(metodo, ruta, cuerpo = {}) {
    if (!actual) throw no('Inicia sesión.', 401);
    const l = usuarios(); const [, , id, sub] = ruta.split('?')[0].split('/');
    if (metodo === 'GET' && ruta === '/usuarios/equipo') return l.map((u) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, telefono: u.telefono || '', activo: u.activo, wechatiaId: u.wechatiaId || null }));
    if (metodo === 'PUT' && ruta === '/usuarios/yo/clave') { const u = l.find((x) => x.id === actual.id); if (u.clave !== cuerpo.actual) throw no('La clave actual no es correcta.'); u.clave = cuerpo.nueva; guardarUs(l); return null; }
    if (ruta.startsWith('/usuarios')) {
      soloAdmin();
      if (metodo === 'GET' && !id) return l.map(detalle);
      if (metodo === 'POST' && !id) {
        const email = String(cuerpo.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw no('email: email inválido');
        if (String(cuerpo.nombre || '').trim().length < 2) throw no('nombre: el nombre es muy corto');
        if (String(cuerpo.clave || '').length < 8) throw no('clave: la clave debe tener al menos 8 caracteres');
        if (l.some((u) => u.email === email)) throw no('Ya existe un usuario con ese email', 409);
        const u = { id: require('crypto').randomUUID(), email, nombre: String(cuerpo.nombre).trim(), rol: cuerpo.rol === 'ADMIN' ? 'ADMIN' : 'CORREDOR', clave: cuerpo.clave, activo: true, telefono: cuerpo.telefono || '', wechatiaId: null, wechatiaNombre: null };
        l.push(u); guardarUs(l); return detalle(u);
      }
      const u = l.find((x) => x.id === id); if (!u) throw no('Ese usuario no existe.', 404);
      if (metodo === 'PATCH') {
        if (id === actual.id && (cuerpo.activo === false || cuerpo.rol === 'CORREDOR')) throw no('No puedes desactivarte ni quitarte el rol de administrador.');
        for (const k of ['nombre', 'rol', 'activo', 'telefono', 'wechatiaId', 'wechatiaNombre']) if (cuerpo[k] !== undefined) u[k] = cuerpo[k] === '' && /^wechatia/.test(k) ? null : cuerpo[k];
        guardarUs(l); return detalle(u);
      }
      if (metodo === 'PUT' && sub === 'clave') { if (String(cuerpo.clave || '').length < 8) throw no('clave: la clave debe tener al menos 8 caracteres'); u.clave = cuerpo.clave; guardarUs(l); return null; }
    }
    throw no('Sin servidor en modo de prueba.');
  }
  return {
    async ingresar(email, clave) {
      await new Promise((r) => setTimeout(r, 200));
      const e = String(email).trim().toLowerCase(); const u = usuarios().find((x) => x.email === e);
      if (u) { if (u.clave !== clave || !u.activo) throw no('Email o clave incorrectos', 401); actual = yoDe(u); return actual; }
      if (clave !== 'demo1234') throw no('Email o clave incorrectos', 401);
      actual = { ...yoDe(usuarios()[0]), email: e };
      return actual;
    },
    async restaurar() { return actual; },
    async yo() { if (!actual) throw no('Inicia sesión.', 401); return actual; },
    async salir() { actual = null; },
    llamar,
    actual: () => actual,
  };
}

module.exports = process.env.PF_MOCK === '1' ? simulado() : { ingresar, restaurar, yo, salir, llamar, actual: () => null };
