// La foto de cada usuario (src/usuarios/foto.ts), contra la API corriendo (yarn dev) y asset_dev. Crea una corredora de prueba con dos
// usuarios y al final la borra con todo lo suyo.   Uso: node test/perfil-foto-e2e.js [url]
// Revisa: sin foto al partir; guardar una (data URL png/jpg/webp), que cada usuario ve la suya y el equipo ve las fotos de todos, que
// solo se aceptan imágenes (y pequeñas), que cambiarla la reemplaza, quitarla, y que otra corredora no ve estas fotos.
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');
const B = (process.argv[2] || 'http://localhost:3000') + '/v1';
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(B + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
const ingresar = async (email, clave) => (await req('POST', '/auth/ingresar', { email, clave })).j.tokenAcceso;
const SUF = Date.now().toString(36);
const PNG = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const JPG = 'data:image/jpeg;base64,' + Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex').toString('base64');
(async () => {
  const db = new PrismaClient(); const cos = [];
  try {
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    const co = await db.corredora.create({ data: { nombre: `E2E Foto ${SUF}` } }); const otra = await db.corredora.create({ data: { nombre: `E2E Foto otra ${SUF}` } }); cos.push(co.id, otra.id);
    const nu = (cid, n) => db.usuario.create({ data: { corredoraId: cid, email: `e2e-ft${n}-${SUF}@prueba.cl`, nombre: 'E2E FT ' + n, hashClave: hash } });
    const u1 = await nu(co.id, '1'); const u2 = await nu(co.id, '2'); const u3 = await nu(otra.id, '3');
    const t1 = await ingresar(u1.email, 'clave-e2e-123'); const t2 = await ingresar(u2.email, 'clave-e2e-123'); const t3 = await ingresar(u3.email, 'clave-e2e-123');
    ok(t1 && t2 && t3, 'ingresan tres usuarios (dos de una corredora y uno de otra)');
    let r = await req('GET', '/perfil/foto', null, t1);
    ok(r.s === 200 && r.j.foto === null, 'al partir nadie tiene foto');
    r = await req('PUT', '/perfil/foto', { foto: PNG }, t1);
    ok(r.s === 200 && r.j.foto === PNG, 'guarda su foto (png en data URL)');
    r = await req('GET', '/perfil/foto', null, t1);
    ok(r.j.foto === PNG, 'y la ve al volver a entrar');
    ok((await req('GET', '/perfil/foto', null, t2)).j.foto === null, 'cada usuario ve solo la suya');
    await req('PUT', '/perfil/foto', { foto: JPG }, t2);
    r = await req('GET', '/perfil/fotos', null, t2);
    ok(r.s === 200 && r.j[u1.id] === PNG && r.j[u2.id] === JPG, 'el equipo ve las fotos de todos los de su corredora');
    ok(!(await req('GET', '/perfil/fotos', null, t3)).j[u1.id], 'otra corredora no ve estas fotos');
    for (const mala of ['data:text/html;base64,PGI+', 'https://x.cl/foto.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,@@@']) {
      r = await req('PUT', '/perfil/foto', { foto: mala }, t1);
      ok(r.s === 400, `se rechaza lo que no es una imagen png, jpg o webp (${mala.slice(0, 22)}…)`);
    }
    r = await req('PUT', '/perfil/foto', { foto: 'data:image/png;base64,' + 'A'.repeat(95000) }, t1);
    ok(r.s === 400, 'y una imagen demasiado pesada');
    ok((await req('GET', '/perfil/foto', null, t1)).j.foto === PNG, 'lo rechazado no cambia la foto');
    await req('PUT', '/perfil/foto', { foto: JPG }, t1);
    ok((await req('GET', '/perfil/foto', null, t1)).j.foto === JPG, 'cambiarla la reemplaza');
    r = await req('DELETE', '/perfil/foto', null, t1);
    ok(r.s === 200 && r.j.foto === null && (await req('GET', '/perfil/foto', null, t1)).j.foto === null, 'quitarla la borra');
    ok(!(await req('GET', '/perfil/fotos', null, t2)).j[u1.id] && (await req('GET', '/perfil/fotos', null, t2)).j[u2.id] === JPG, 'y el resto del equipo conserva la suya');
    console.log('OK perfil foto');
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally {
    for (const id of cos) {
      await db.registro.deleteMany({ where: { corredoraId: id } }).catch(() => null); await db.sesion.deleteMany({ where: { usuario: { corredoraId: id } } }).catch(() => null);
      await db.usuario.deleteMany({ where: { corredoraId: id } }).catch(() => null); await db.corredora.delete({ where: { id } }).catch(() => null);
    }
    await db.$disconnect();
  }
})();
