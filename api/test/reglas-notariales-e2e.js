// Prueba de punta a punta de /v1/reglas-notariales (reglas y casos de la plataforma) contra la API corriendo (yarn dev)
// y asset_dev. El administrador de .env debe estar en PLATAFORMA_REVISORES. Crea otra corredora de prueba y al final
// borra lo que creó (y deja las reglas como estaban). Uso: node test/reglas-notariales-e2e.js [url]
// Revisa: permisos (revisor o no); cada corredora manda casos y ve solo los suyos, sin saber de quién son los demás;
// el mismo documento reemplaza su caso; el revisor ve todos (sin corredora ni usuario) y los borra; solo el revisor
// cambia las reglas (con versión); los demás ven solo las aprobadas, sin pruebas ni propuestas.
const fs = require('fs');
const path = require('path');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);
const B = (process.argv[2] || 'http://localhost:3000') + '/v1';
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(B + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
const ingresar = async (email, clave) => (await req('POST', '/auth/ingresar', { email, clave })).j.tokenAcceso;
const SUF = Date.now().toString(36);

(async () => {
  const db = new PrismaClient();
  let otraCo = null; let docAntes = null; const usuarios = [];
  try {
    docAntes = await db.plataformaDocumento.findUnique({ where: { clave: 'reglas_notariales' } });
    const admin = await db.usuario.findUnique({ where: { email: env.SEMBRAR_ADMIN_EMAIL.toLowerCase() } });
    const rev = await ingresar(env.SEMBRAR_ADMIN_EMAIL, env.SEMBRAR_ADMIN_CLAVE);
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    otraCo = await db.corredora.create({ data: { nombre: `E2E Reglas ${SUF}` } });
    const u2 = await db.usuario.create({ data: { corredoraId: otraCo.id, email: `e2e-rg-${SUF}@prueba.cl`, nombre: 'E2E Reglas', hashClave: hash, rol: 'ADMIN' } }); usuarios.push(u2.id);
    const otro = await ingresar(u2.email, 'clave-e2e-123');

    ok((await req('GET', '/reglas-notariales/permisos', null, rev)).j.revisor === true, 'el correo en PLATAFORMA_REVISORES es revisor');
    ok((await req('GET', '/reglas-notariales/permisos', null, otro)).j.revisor === false, 'el administrador de otra corredora no');

    // ---- casos
    const caso = (id, clave, titulo) => ({ id, clave, tramite: 'escritura', titulo, materiaAuto: 'compraventa', materiaFinal: 'mutuo', descartados: [], agregados: [{ nombre: 'Hipoteca', frase: 'constituye hipoteca' }], texto: 'Texto tachado [RUT]' });
    let r = await req('POST', '/reglas-notariales/casos', { items: [caso(`c${SUF}a`, `doc-${SUF}-1`, 'Compraventa con mutuo')] }, otro);
    ok(r.s === 201 && r.j.guardados === 1, 'una corredora manda un caso corregido');
    r = await req('POST', '/reglas-notariales/casos', { items: [caso(`c${SUF}b`, `doc-${SUF}-1`, 'Compraventa con mutuo (corregido de nuevo)')] }, otro);
    let mios = (await req('GET', '/reglas-notariales/casos', null, otro)).j;
    ok(mios.length === 1 && mios[0].titulo.includes('de nuevo') && mios[0].propio, 'el mismo documento reemplaza su caso; la corredora ve el suyo');
    await req('POST', '/reglas-notariales/casos', { items: [caso(`c${SUF}c`, `doc-${SUF}-2`, 'Caso de la otra corredora')] }, rev);
    mios = (await req('GET', '/reglas-notariales/casos', null, otro)).j;
    ok(mios.length === 1 && !mios.some((x) => x.titulo === 'Caso de la otra corredora'), 'no ve los casos de otra corredora');
    const todos = (await req('GET', '/reglas-notariales/casos', null, rev)).j;
    const ajeno = todos.find((x) => x.clave === `doc-${SUF}-1`);
    ok(ajeno && todos.some((x) => x.clave === `doc-${SUF}-2`), 'el revisor ve los casos de todas las corredoras');
    ok(!('corredoraId' in ajeno) && !('usuarioId' in ajeno) && ajeno.propio === false && !JSON.stringify(todos).includes(otraCo.id), 'sin saber de qué corredora ni usuario vienen');
    ok((await req('DELETE', `/reglas-notariales/casos/${todos.find((x) => x.clave === `doc-${SUF}-2`).id}`, null, otro)).s === 404, 'una corredora no puede borrar casos ajenos');
    ok((await req('DELETE', `/reglas-notariales/casos/${ajeno.id}`, null, rev)).s === 200, 'el revisor sí');
    ok((await req('POST', '/reglas-notariales/casos', { items: [{ id: `c${SUF}d`, texto: 'x'.repeat(40000) }] }, otro)).j.guardados === 0, 'un caso demasiado grande no se guarda');

    // ---- reglas
    const base = await req('GET', '/reglas-notariales', null, rev);
    ok(base.s === 200 && Array.isArray(base.j.actos), 'el revisor lee las reglas');
    const nuevo = { ...base.j, actos: [...base.j.actos, { id: `r${SUF}`, activo: true, nombre: 'Hipoteca', patron: 'constituy[eo]n?\\s+hipoteca', prueba: { aciertos: [1] } }], propuestas: [{ id: `p${SUF}`, tipo: 'materia', patron: 'mutuo' }] };
    delete nuevo.docVersion;
    ok((await req('PUT', '/reglas-notariales', { version: base.j.docVersion, reglas: nuevo }, otro)).s === 403, 'solo el revisor cambia las reglas');
    r = await req('PUT', '/reglas-notariales', { version: base.j.docVersion, reglas: nuevo }, rev);
    ok(r.s === 200 && r.j.docVersion === base.j.docVersion + 1, 'el revisor aprueba una regla (sube la versión)');
    ok((await req('PUT', '/reglas-notariales', { version: base.j.docVersion, reglas: nuevo }, rev)).s === 409, 'con una versión vieja no se pisa');
    const pub = (await req('GET', '/reglas-notariales', null, otro)).j;
    const a = pub.actos.find((x) => x.id === `r${SUF}`);
    ok(a && a.patron && !('prueba' in a) && pub.propuestas.length === 0, 'las demás corredoras ven la regla aprobada, sin pruebas ni propuestas');
    ok((await req('GET', '/reglas-notariales', null, rev)).j.propuestas.some((x) => x.id === `p${SUF}`), 'el revisor ve las propuestas');

    console.log('\nTodo bien.');
  } catch (e) {
    console.error('\n' + e.message);
    process.exitCode = 1;
  } finally {
    await db.reglaCaso.deleteMany({ where: { clave: { startsWith: `doc-${SUF}` } } });
    if (docAntes) await db.plataformaDocumento.update({ where: { clave: 'reglas_notariales' }, data: { datos: docAntes.datos, version: { increment: 1 } } });
    else await db.plataformaDocumento.deleteMany({ where: { clave: 'reglas_notariales' } });
    await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await db.usuario.deleteMany({ where: { id: { in: usuarios } } });
    if (otraCo) await db.corredora.delete({ where: { id: otraCo.id } }).catch(() => null);
    await db.$disconnect();
  }
})();
