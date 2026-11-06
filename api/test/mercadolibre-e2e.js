// Prueba de punta a punta de Mercado Libre (Portal Inmobiliario) en el servidor: la conexión OAuth de la corredora
// (src/conexiones/mercadolibre.oauth.ts) y el proxy /v1/mercadolibre/api (src/conexiones/mercadolibre.ts).
// Levanta un Mercado Libre FALSO (autorización con PKCE, tokens con renovación de un solo uso, /users/me y la API) y
// una API de Asset PROPIA apuntando a él (ML_API_URL y ML_AUTH_URL solo valen fuera de producción), con la base de
// desarrollo (asset_dev, por el túnel) y sin los procesos de fondo. La API de `yarn dev` no se toca.
// Crea su propia corredora (un administrador y un corredor) y al final la borra entera.
// Uso: node test/mercadolibre-e2e.js     (tarda ~30 s: la API propia arranca con ts-node)
// Revisa: el proveedor es de la corredora (solo el administrador conecta y desconecta); iniciar (PKCE S256, state,
// client_id, vuelta al callback); callback (canje con verificador y secreto, cuenta de /users/me, tokens cifrados);
// sin conexión → 409 NECESITA_CONEXION (salvo consultas públicas); el proxy pone el token de la corredora; rutas no
// permitidas; errores de Mercado Libre tal cual; renovación al vencer y ante un 401 (el refresh rota y el viejo ya no
// sirve; dos pedidos a la vez renuevan una sola vez); renovación rechazada → «vencida»; desconectar.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

const RAIZ_API = path.join(__dirname, '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ_API, '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);
const PUERTO = Number(process.env.ML_E2E_PUERTO || 3917);
const B = `http://127.0.0.1:${PUERTO}/v1`;
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(B + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, redirect: 'manual' });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { s: r.status, j, t };
};
const ml = (token, metodo, ruta, cuerpo) => req('POST', '/mercadolibre/api', { metodo, ruta, ...(cuerpo !== undefined ? { cuerpo } : {}) }, token);
const ingresar = async (email, clave) => (await req('POST', '/auth/ingresar', { email, clave })).j?.tokenAcceso;
const SUF = Date.now().toString(36);
const CLIENTE = 'e2e-cliente-' + SUF; const SECRETO = 'e2e-secreto-' + SUF;

// ---------------------------------------------------------------- Mercado Libre falso
const M = { desafios: new Map(), codigos: new Map(), acceso: null, renovar: null, n: 0, renovaciones: 0, pedidos: [], rechazarRenovar: false, lentoRenovar: 0 };
const UID = 777001;
function nuevosTokens() { M.n++; M.acceso = `APP_USR-e2e-${SUF}-${M.n}`; M.renovar = `TG-e2e-${SUF}-${M.n}`; return { access_token: M.acceso, refresh_token: M.renovar, expires_in: 21600, user_id: UID, token_type: 'Bearer', scope: 'offline_access read write' }; }
function mlFalso() {
  const s = http.createServer(async (rq, rs) => {
    const u = new URL(rq.url, 'http://x');
    let crudo = ''; for await (const c of rq) crudo += c;
    const json = (status, j) => { rs.writeHead(status, { 'content-type': 'application/json' }); rs.end(JSON.stringify(j)); };
    // la página de autorización: «aprueba» y vuelve al redirect_uri con un código
    if (u.pathname === '/authorization') {
      const q = u.searchParams; const codigo = 'TG-code-' + crypto.randomBytes(6).toString('hex');
      M.codigos.set(codigo, { desafio: q.get('code_challenge'), metodo: q.get('code_challenge_method'), redirect: q.get('redirect_uri'), cliente: q.get('client_id') });
      rs.writeHead(302, { location: `${q.get('redirect_uri')}?code=${codigo}&state=${encodeURIComponent(q.get('state'))}` }); return rs.end();
    }
    if (u.pathname === '/oauth/token' && rq.method === 'POST') {
      const f = Object.fromEntries(new URLSearchParams(crudo));
      if (f.client_id !== CLIENTE || f.client_secret !== SECRETO) return json(401, { error: 'invalid_client', message: 'invalid client' });
      if (f.grant_type === 'authorization_code') {
        const c = M.codigos.get(f.code); M.codigos.delete(f.code);
        if (!c) return json(400, { error: 'invalid_grant', message: 'código inválido' });
        const h = crypto.createHash('sha256').update(f.code_verifier || '').digest('base64url');
        if (c.metodo !== 'S256' || h !== c.desafio) return json(400, { error: 'invalid_grant', message: 'code_verifier no coincide' });
        if (f.redirect_uri !== c.redirect) return json(400, { error: 'invalid_grant', message: 'redirect_uri distinto' });
        return json(200, nuevosTokens());
      }
      if (f.grant_type === 'refresh_token') {
        M.renovaciones++;
        if (M.lentoRenovar) await esperar(M.lentoRenovar);
        if (M.rechazarRenovar || f.refresh_token !== M.renovar) return json(400, { error: 'invalid_grant', message: 'invalid refresh token' });
        return json(200, nuevosTokens()); // el de renovación rota: el anterior ya no sirve
      }
      return json(400, { error: 'unsupported_grant_type' });
    }
    const auth = rq.headers.authorization || null;
    M.pedidos.push({ metodo: rq.method, ruta: u.pathname + u.search, auth, cuerpo: crudo ? JSON.parse(crudo) : null });
    if (u.pathname.startsWith('/categories/')) return json(200, { id: u.pathname.split('/')[2], name: 'Inmuebles', children_categories: [] });
    if (auth !== 'Bearer ' + M.acceso) return json(401, { message: 'invalid access token', error: 'unauthorized', status: 401 });
    if (u.pathname === '/users/me') return json(200, { id: UID, nickname: 'CORREDORA_E2E', email: 'e2e@ml.cl' });
    if (u.pathname === `/users/${UID}/classifieds_promotion_packs/silver`) return json(200, [{ listing_type_id: 'silver', remaining_listings: 7 }]);
    if (u.pathname === '/items' && rq.method === 'POST') return json(201, { id: 'MLC900', status: 'active', permalink: 'https://x/MLC900', recibido: JSON.parse(crudo) });
    if (u.pathname === '/items/MLC404') return json(404, { message: 'Item not found', error: 'not_found', status: 404, cause: [] });
    return json(200, { ok: true, ruta: u.pathname });
  });
  return new Promise((listo) => s.listen(0, '127.0.0.1', () => listo(s)));
}

// ---------------------------------------------------------------- una API de Asset propia, apuntando al falso
function levantarApi(mlUrl) {
  const hijo = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', 'src/main.ts'], {
    cwd: RAIZ_API,
    env: {
      ...process.env, NODE_ENV: 'development', PORT: String(PUERTO), TS_NODE_PROJECT: 'tsconfig.json',
      ML_CLIENT_ID: CLIENTE, ML_CLIENT_SECRET: SECRETO, ML_API_URL: mlUrl, ML_AUTH_URL: mlUrl + '/authorization',
      PROGRAMADOS_CADA_SEG: '0', FIRMAS_CADA_SEG: '0', LECTOR_CADA_SEG: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; hijo.stdout.on('data', (d) => (log += d)); hijo.stderr.on('data', (d) => (log += d));
  hijo.log = () => log;
  return hijo;
}

(async () => {
  const db = new PrismaClient();
  const falso = await mlFalso(); const mlUrl = `http://127.0.0.1:${falso.address().port}`;
  const api = levantarApi(mlUrl);
  let corredoraId = null;
  try {
    let lista = false;
    for (let i = 0; i < 120 && !lista && api.exitCode === null; i++) { await esperar(1000); lista = await fetch(B + '/salud').then((r) => r.ok).catch(() => false); }
    if (!lista) throw new Error('La API de prueba no arrancó:\n' + api.log().slice(-3000));
    ok(true, `API de prueba en el puerto ${PUERTO}, con Mercado Libre falso en ${mlUrl}`);

    // ---- una corredora de prueba con su administrador y un corredor (2 inicios de sesión de los 5 por minuto)
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    const co = await db.corredora.create({ data: { nombre: `E2E Mercado Libre ${SUF}` } }); corredoraId = co.id;
    await db.usuario.create({ data: { corredoraId, email: `e2e-ml-adm-${SUF}@prueba.cl`, nombre: 'E2E Admin', hashClave: hash, rol: 'ADMIN' } });
    await db.usuario.create({ data: { corredoraId, email: `e2e-ml-cor-${SUF}@prueba.cl`, nombre: 'E2E Corredor', hashClave: hash, rol: 'CORREDOR' } });
    const adm = await ingresar(`e2e-ml-adm-${SUF}@prueba.cl`, 'clave-e2e-123');
    const cor = await ingresar(`e2e-ml-cor-${SUF}@prueba.cl`, 'clave-e2e-123');
    ok(adm && cor, 'ingresan el administrador y un corredor de una corredora de prueba');

    // ---- el proveedor y los permisos
    let r = await req('GET', '/conexiones', null, cor);
    let p = r.j.proveedores.find((x) => x.id === 'mercadolibre');
    ok(p && p.dueno === 'corredora' && p.conexion === null && p.puedeConectar === false, 'Mercado Libre aparece como sesión de la corredora, sin conectar; el corredor no puede conectarla');
    ok((await req('POST', '/conexiones/mercadolibre/iniciar', null, cor)).s === 403, 'un corredor no puede iniciar la conexión');
    r = await req('GET', '/conexiones/mercadolibre', null, cor);
    ok(r.s === 200 && r.j.conexion === null, 'el estado de la conexión: sin conectar');

    // ---- sin conexión
    r = await ml(cor, 'GET', `/users/${UID}/classifieds_promotion_packs/silver`);
    ok(r.s === 409 && r.j.codigo === 'NECESITA_CONEXION' && r.j.proveedor === 'mercadolibre', 'sin la cuenta conectada → 409 NECESITA_CONEXION');
    r = await ml(cor, 'GET', '/categories/MLC1459');
    const pubPedido = M.pedidos.at(-1);
    ok(r.s === 200 && r.j.status === 200 && r.j.cuerpo.id === 'MLC1459' && pubPedido.auth === null, 'las consultas públicas (categorías) funcionan sin conexión y sin token');

    // ---- rutas no permitidas
    for (const [ruta, s] of [['/oauth/token', 403], ['/applications/123', 403], ['https://evil.example/items', 400], ['//evil.example/items', 400], ['/items/../oauth/token', 400], ['items/MLC1', 400], ['/items/MLC1\\x', 400], ['/users/me@evil.example', 400]])
      ok((await ml(adm, 'GET', ruta)).s === s, `ruta no permitida «${ruta}» → ${s}`);
    ok((await req('POST', '/mercadolibre/api', { metodo: 'PATCH', ruta: '/items/MLC1' }, adm)).s === 400, 'un método no permitido → 400');
    ok((await req('POST', '/mercadolibre/api', { metodo: 'GET', ruta: '/items/MLC1' })).s === 401, 'sin sesión de Asset no se usa el proxy');

    // ---- conectar: iniciar → autorización → callback
    r = await req('POST', '/conexiones/mercadolibre/iniciar', null, adm);
    ok(r.s === 201 && r.j.url.startsWith(mlUrl + '/authorization?'), 'iniciar entrega la página de autorización de Mercado Libre');
    const u = new URL(r.j.url); const state = u.searchParams.get('state');
    ok(u.searchParams.get('client_id') === CLIENTE && u.searchParams.get('response_type') === 'code' && !r.j.url.includes(SECRETO), 'con el client_id del servidor (el secreto nunca sale)');
    ok(u.searchParams.get('code_challenge_method') === 'S256' && u.searchParams.get('code_challenge') && state, 'con PKCE (S256) y state');
    ok(u.searchParams.get('redirect_uri') === `${env.API_URL_PUBLICA}/v1/conexiones/callback/mercadolibre`, 'vuelve al callback de la API');
    const pend = await db.oauthPendiente.findUnique({ where: { state } });
    ok(pend && pend.deCorredora && pend.corredoraId === corredoraId && /^v1\./.test(pend.verificadorCif), 'queda pendiente para la corredora, con el verificador cifrado');
    const aut = await fetch(r.j.url, { redirect: 'manual' });
    const vuelta = new URL(aut.headers.get('location'));
    r = await req('GET', `/conexiones/callback/mercadolibre${vuelta.search}`);
    ok(r.s === 200 && /Mercado Libre conectado/.test(r.t) && /CORREDORA_E2E/.test(r.t), 'el callback canjea el código (con el verificador y el secreto) y muestra la cuenta');
    ok(/No se pudo conectar/.test((await req('GET', `/conexiones/callback/mercadolibre${vuelta.search}`)).t), 'el mismo state no sirve dos veces');
    let fila = await db.conexion.findFirst({ where: { corredoraId, proveedor: 'mercadolibre' } });
    ok(fila && fila.dueno === 'corredora' && fila.cuentaId === String(UID) && fila.cuentaNombre === 'CORREDORA_E2E', 'la sesión queda de la corredora, con la cuenta de /users/me (id y nickname)');
    ok(!fila.accesoCif.includes(M.acceso) && !fila.renovarCif.includes(M.renovar) && /^v1\./.test(fila.accesoCif), 'los tokens quedan cifrados en la base');
    r = await req('GET', '/conexiones/mercadolibre', null, cor);
    ok(r.j.conexion?.estado === 'activa' && r.j.conexion.cuenta === 'CORREDORA_E2E' && r.j.conexion.cuentaId === String(UID) && !r.t.includes(M.acceso), 'el corredor ve la conexión (estado, cuenta e id), nunca el token');

    // ---- el proxy con el token de la corredora
    r = await ml(cor, 'GET', `/users/${UID}/classifieds_promotion_packs/silver`);
    ok(r.s === 200 && r.j.status === 200 && r.j.cuerpo[0].remaining_listings === 7 && M.pedidos.at(-1).auth === 'Bearer ' + M.acceso, 'el corredor consulta el paquete: el proxy pone el token de la corredora');
    const aviso = { title: 'Depto E2E', price: 5000, seller_contact: { phone2: '912345678' } };
    r = await ml(cor, 'POST', '/items', aviso);
    ok(r.j.status === 201 && r.j.cuerpo.id === 'MLC900' && JSON.stringify(M.pedidos.at(-1).cuerpo) === JSON.stringify(aviso), 'publicar: el cuerpo llega tal cual a Mercado Libre');
    r = await ml(cor, 'GET', `/vis/users/${UID}/leads/buyers?date_from=2026-10-01&date_to=2026-11-06&limit=50&offset=0`);
    ok(r.j.status === 200 && M.pedidos.at(-1).ruta.includes('date_from=2026-10-01'), 'los interesados (con su consulta) pasan por el proxy');
    r = await ml(cor, 'PUT', '/items/MLC900', { status: 'paused' });
    ok(r.j.status === 200 && M.pedidos.at(-1).metodo === 'PUT', 'actualizar un aviso (PUT)');
    r = await ml(cor, 'GET', '/items/MLC404');
    ok(r.s === 200 && r.j.status === 404 && r.j.cuerpo.message === 'Item not found', 'un error de Mercado Libre vuelve tal cual (status y motivo)');

    // ---- renovación: al vencer, y el de renovación rota
    const renovar1 = M.renovar; const n0 = M.renovaciones;
    await db.conexion.update({ where: { id: fila.id }, data: { expiraEn: new Date(Date.now() + 30_000) } });
    r = await ml(cor, 'GET', '/users/me');
    ok(r.j.status === 200 && M.renovaciones === n0 + 1 && M.renovar !== renovar1 && M.pedidos.at(-1).auth === 'Bearer ' + M.acceso, 'por vencer: se renueva antes de llamar y se usa el token nuevo');
    fila = await db.conexion.findFirst({ where: { corredoraId, proveedor: 'mercadolibre' } });
    ok(fila.renovadoEn && fila.expiraEn > new Date(Date.now() + 5 * 3600e3), 'queda la fecha de renovación y el nuevo vencimiento (6 horas)');
    // ---- ante un 401 (Mercado Libre revocó el token): renueva y reintenta
    const n1 = M.renovaciones; M.acceso = 'revocado-' + SUF;
    r = await ml(cor, 'GET', '/users/me');
    ok(r.j.status === 200 && M.renovaciones === n1 + 1, 'si Mercado Libre rechaza el token (401), se renueva una vez y se reintenta');
    // ---- dos pedidos a la vez con el token vencido: una sola renovación (FOR UPDATE)
    const n2 = M.renovaciones; M.lentoRenovar = 800;
    await db.conexion.update({ where: { id: fila.id }, data: { expiraEn: new Date(Date.now() - 1000) } });
    const dos = await Promise.all([ml(cor, 'GET', '/users/me'), ml(adm, 'GET', '/users/me')]);
    M.lentoRenovar = 0;
    ok(dos.every((x) => x.j?.status === 200) && M.renovaciones === n2 + 1, 'dos pedidos a la vez con el token vencido renuevan una sola vez');

    // ---- renovación rechazada → vencida → reconectar
    M.rechazarRenovar = true;
    await db.conexion.update({ where: { id: fila.id }, data: { expiraEn: new Date(Date.now() - 1000) } });
    r = await ml(cor, 'GET', '/users/me');
    fila = await db.conexion.findFirst({ where: { corredoraId, proveedor: 'mercadolibre' } });
    ok(r.s === 409 && r.j.codigo === 'NECESITA_CONEXION' && fila.estado === 'vencida' && fila.ultimoError, 'si Mercado Libre rechaza la renovación: 409 NECESITA_CONEXION y la sesión queda «vencida»');
    const n3 = M.renovaciones;
    ok((await ml(adm, 'GET', '/users/me')).s === 409 && M.renovaciones === n3, 'vencida: ya no se intenta renovar');
    ok((await ml(adm, 'GET', '/categories/MLC1459')).j?.status === 200, 'las consultas públicas siguen funcionando');
    M.rechazarRenovar = false;

    // ---- desconectar
    ok((await req('DELETE', '/conexiones/mercadolibre', null, cor)).s === 403, 'un corredor no puede desconectarla');
    r = await req('DELETE', '/conexiones/mercadolibre', null, adm);
    ok(r.s === 200 && !(await db.conexion.findFirst({ where: { corredoraId, proveedor: 'mercadolibre' } })), 'el administrador la desconecta');
    ok((await ml(cor, 'GET', '/users/me')).s === 409, 'desconectada: el proxy pide conectar');

    console.log('\nTodo bien.');
  } catch (e) {
    console.error('\n' + e.message);
    process.exitCode = 1;
  } finally {
    if (corredoraId) {
      await db.conexion.deleteMany({ where: { corredoraId } });
      await db.oauthPendiente.deleteMany({ where: { corredoraId } });
      await db.sesion.deleteMany({ where: { usuario: { corredoraId } } });
      await db.usuario.deleteMany({ where: { corredoraId } });
      await db.corredora.delete({ where: { id: corredoraId } }).catch(() => null);
    }
    await db.$disconnect();
    api.kill();
    falso.close();
  }
})();
