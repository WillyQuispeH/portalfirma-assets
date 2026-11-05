// Prueba de punta a punta de las conexiones (sesiones OAuth en el servidor) y de Portalfirma a través de la API, contra
// la API corriendo (yarn dev) y asset_dev. Habla de verdad con el servidor OAuth de Portalfirma (registro del cliente
// y página de autorización), pero no inicia sesión: eso necesita a una persona en el navegador.
// Crea su propia corredora (con un administrador y un corredor) para no tocar la conexión real de la corredora de
// desarrollo, y al final la borra entera. Uso: node test/conexiones-e2e.js [url]
// Revisa: Portalfirma es de la corredora (solo el administrador conecta y desconecta; todos lo usan); iniciar (URL con
// PKCE, state y pendiente cifrado); callback con state malo, repetido, rechazado y con código falso; sin conexión →
// 409 NECESITA_CONEXION; con una sesión cuyo token Portalfirma rechaza, se intenta renovar y queda «vencida»; secretos
// cifrados en la base; otra corredora no ve la sesión; desconectar.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);
const RAIZ = process.argv[2] || 'http://localhost:3000';
const B = RAIZ + '/v1';
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(B + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, redirect: 'manual' });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { s: r.status, j, t };
};
const ingresar = async (email, clave) => (await req('POST', '/auth/ingresar', { email, clave })).j.tokenAcceso;
const SUF = Date.now().toString(36);
// mismo formato que src/conexiones/cifrado.ts
const llave = Buffer.from(env.CONEXIONES_CLAVE, 'base64');
const cifrar = (t) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', llave, iv); const d = Buffer.concat([c.update(t, 'utf8'), c.final()]); return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), d.toString('base64url')].join('.'); };

(async () => {
  const db = new PrismaClient();
  let corredoraId = null;
  try {
    // ---- una corredora de prueba con su administrador y un corredor
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    const co = await db.corredora.create({ data: { nombre: `E2E Conexiones ${SUF}` } }); corredoraId = co.id;
    await db.usuario.create({ data: { corredoraId, email: `e2e-cx-adm-${SUF}@prueba.cl`, nombre: 'E2E Admin', hashClave: hash, rol: 'ADMIN' } });
    await db.usuario.create({ data: { corredoraId, email: `e2e-cx-cor-${SUF}@prueba.cl`, nombre: 'E2E Corredor', hashClave: hash, rol: 'CORREDOR' } });
    const adm = await ingresar(`e2e-cx-adm-${SUF}@prueba.cl`, 'clave-e2e-123');
    const cor = await ingresar(`e2e-cx-cor-${SUF}@prueba.cl`, 'clave-e2e-123');
    ok(adm && cor, 'ingresan el administrador y un corredor de una corredora de prueba');

    // ---- lista y permisos
    let r = await req('GET', '/conexiones', null, cor);
    let pf = r.j.proveedores.find((p) => p.id === 'portalfirma');
    ok(r.s === 200 && pf && pf.dueno === 'corredora' && pf.conexion === null, 'Portalfirma aparece como sesión de la corredora, sin conectar');
    ok(pf.puedeConectar === false && (await req('POST', '/conexiones/portalfirma/iniciar', null, cor)).s === 403, 'un corredor no puede conectar la cuenta de la corredora');
    pf = (await req('GET', '/conexiones', null, adm)).j.proveedores.find((p) => p.id === 'portalfirma');
    ok(pf.puedeConectar === true, 'el administrador sí');
    ok((await req('GET', '/conexiones', null)).s === 401, 'sin sesión de Asset no se ven las conexiones');
    ok((await req('POST', '/conexiones/inventado/iniciar', null, adm)).s === 404, 'un proveedor que no existe → 404');

    // ---- iniciar
    r = await req('POST', '/conexiones/portalfirma/iniciar', null, adm);
    ok(r.s === 201 && /^https:\/\/integracion\.portalfirma\.cl\/oauth\/authorize\?/.test(r.j.url), 'iniciar entrega la página de autorización de Portalfirma');
    const u = new URL(r.j.url);
    const state = u.searchParams.get('state');
    ok(u.searchParams.get('code_challenge_method') === 'S256' && u.searchParams.get('code_challenge') && state && u.searchParams.get('client_id'), 'con PKCE (S256), state y el client_id de Asset');
    ok(u.searchParams.get('redirect_uri') === `${env.API_URL_PUBLICA}/v1/conexiones/callback/portalfirma`, 'vuelve al callback de la API');
    const pend = await db.oauthPendiente.findUnique({ where: { state } });
    ok(pend && pend.deCorredora && pend.corredoraId === corredoraId && /^v1\./.test(pend.verificadorCif) && pend.expiraEn > new Date(), 'queda pendiente para la corredora, con el verificador cifrado y vencimiento');
    const cli = await db.oauthCliente.findFirst({ where: { proveedor: 'portalfirma', redirectUri: u.searchParams.get('redirect_uri') } });
    ok(cli && /^v1\./.test(cli.clienteCif) && !cli.clienteCif.includes(u.searchParams.get('client_id')), 'el registro de Asset en Portalfirma quedó guardado y cifrado');
    const r2 = await req('POST', '/conexiones/portalfirma/iniciar', null, adm);
    ok(new URL(r2.j.url).searchParams.get('client_id') === u.searchParams.get('client_id'), 'el segundo inicio reutiliza el mismo registro');

    // ---- callback
    r = await req('GET', `/conexiones/callback/portalfirma?state=inventado&code=x`);
    ok(r.s === 200 && /No se pudo conectar/.test(r.t), 'callback con un state desconocido: página de error');
    r = await req('GET', `/conexiones/callback/portalfirma?state=${state}&error=access_denied`);
    ok(/No se dio el permiso/.test(r.t), 'si no se da el permiso, se dice');
    r = await req('GET', `/conexiones/callback/portalfirma?state=${state}&code=x`);
    ok(/No se pudo conectar/.test(r.t) && !(await db.oauthPendiente.findUnique({ where: { state } })), 'el state se usa una sola vez');
    const state2 = new URL(r2.j.url).searchParams.get('state');
    r = await req('GET', `/conexiones/callback/portalfirma?state=${state2}&code=codigo-falso`);
    ok(/no aceptó la autorización/.test(r.t), 'un código falso: Portalfirma no lo acepta');
    ok(!(await db.conexion.findFirst({ where: { corredoraId } })), 'y no se guardó nada');
    ok(/<script/i.test((await req('GET', `/conexiones/callback/portalfirma?state=x&error=<script>`)).t) === false, 'el callback escapa lo que manda el proveedor');

    // ---- sin conexión
    r = await req('POST', '/portalfirma/herramientas/get_partner_session', { argumentos: {} }, cor);
    ok(r.s === 409 && r.j.codigo === 'NECESITA_CONEXION', 'sin Portalfirma conectado → 409 NECESITA_CONEXION');
    ok((await req('GET', '/portalfirma/archivos/123', null, cor)).s === 409, 'el PDF de una operación también pide la conexión');
    ok((await req('POST', '/portalfirma/herramientas/Mal-Nombre', { argumentos: {} }, cor)).s === 404, 'nombre de herramienta inválido → 404');

    // ---- una sesión de la corredora cuyo token Portalfirma rechaza: se intenta renovar y queda vencida
    const token = 'token-falso-' + SUF; const renovar = 'renovar-falso-' + SUF;
    await db.conexion.create({ data: { corredoraId, usuarioId: null, dueno: 'corredora', proveedor: 'portalfirma', accesoCif: cifrar(token), renovarCif: cifrar(renovar), expiraEn: new Date(Date.now() + 3600e3), cuentaNombre: 'Prueba' } });
    r = await req('GET', '/conexiones/portalfirma', null, cor);
    ok(r.j.conexion?.estado === 'activa' && r.j.conexion.cuenta === 'Prueba' && !JSON.stringify(r.j).includes(token), 'el corredor ve la conexión de la corredora (estado y cuenta), nunca el token');
    r = await req('POST', '/portalfirma/herramientas/get_partner_session', { argumentos: {} }, cor);
    const fila = await db.conexion.findFirst({ where: { corredoraId } });
    ok(r.s === 409 && r.j.codigo === 'NECESITA_CONEXION', 'el corredor la usa; Portalfirma rechaza el token y la renovación → 409 para reconectar');
    ok(fila.estado === 'vencida' && fila.ultimoError, 'la sesión queda «vencida» con el motivo');
    ok(!fila.accesoCif.includes(token) && !fila.renovarCif.includes(renovar), 'los tokens están cifrados en la base');
    ok((await req('POST', '/portalfirma/herramientas/get_partner_session', { argumentos: {} }, adm)).s === 409, 'vencida: ya no se intenta llamar a Portalfirma');

    // ---- aislamiento y desconectar
    const otra = await ingresar(env.SEMBRAR_ADMIN_EMAIL, env.SEMBRAR_ADMIN_CLAVE);
    r = await req('GET', '/conexiones/portalfirma', null, otra);
    ok(r.j.conexion?.cuenta !== 'Prueba' && r.j.conexion?.estado !== 'vencida', 'otra corredora no ve esta sesión');
    ok((await req('DELETE', '/conexiones/portalfirma', null, cor)).s === 403, 'un corredor no puede desconectarla');
    r = await req('DELETE', '/conexiones/portalfirma', null, adm);
    ok(r.s === 200 && !(await db.conexion.findFirst({ where: { corredoraId } })), 'el administrador la desconecta');

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
  }
})();
