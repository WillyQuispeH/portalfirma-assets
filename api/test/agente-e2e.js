// Prueba de punta a punta de /v1/agente (conversaciones del Agente y registro de acciones) contra la API corriendo
// (yarn dev) y asset_dev. Crea un corredor de prueba y al final lo borra (con lo suyo).
// Uso: node test/agente-e2e.js [url]
// Revisa: guardar y leer una conversación propia; sincronización por cambios (?desde=) con borrados; importar sin pisar;
// el administrador lee las de un corredor (lista sin contenido y una completa) pero no las escribe; un corredor no
// lee las de otro; otra corredora no las ve; tamaño máximo; registro de acciones (agregar y ver, propio y del admin).
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
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = new PrismaClient();
  const usuarios = []; let otraCo = null;
  try {
    const adm = await ingresar(env.SEMBRAR_ADMIN_EMAIL, env.SEMBRAR_ADMIN_CLAVE);
    const admin = await db.usuario.findUnique({ where: { email: env.SEMBRAR_ADMIN_EMAIL.toLowerCase() } });
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    const c1 = await db.usuario.create({ data: { corredoraId: admin.corredoraId, email: `e2e-ag1-${SUF}@prueba.cl`, nombre: 'E2E Agente 1', hashClave: hash } }); usuarios.push(c1.id);
    const c2 = await db.usuario.create({ data: { corredoraId: admin.corredoraId, email: `e2e-ag2-${SUF}@prueba.cl`, nombre: 'E2E Agente 2', hashClave: hash } }); usuarios.push(c2.id);
    otraCo = await db.corredora.create({ data: { nombre: `E2E Otra ${SUF}` } });
    const c3 = await db.usuario.create({ data: { corredoraId: otraCo.id, email: `e2e-ag3-${SUF}@prueba.cl`, nombre: 'E2E Otra', hashClave: hash, rol: 'ADMIN' } }); usuarios.push(c3.id);
    const t1 = await ingresar(c1.email, 'clave-e2e-123'); const t2 = await ingresar(c2.email, 'clave-e2e-123');
    ok(adm && t1 && t2, 'ingresan el administrador y dos corredores');

    // ---- guardar y leer
    const id = `k${SUF}a`;
    const conv = { titulo: 'Captar depto en Ñuñoa', fijada: true, resumen: 'Listo, quedó creada', ctx: { tipo: 'propiedad', id: 'p1' }, items: [{ k: 'user', text: 'capta un depto' }, { k: 'bot', text: 'Listo' }], messages: [{ role: 'user', content: 'capta un depto' }], creado: '2026-11-01T10:00:00.000Z' };
    let r = await req('PUT', `/agente/conversaciones/${id}`, conv, t1);
    ok(r.s === 200 && r.j.titulo === conv.titulo && r.j.fijada && r.j.n === 1 && r.j.creado.startsWith('2026-11-01'), 'el corredor guarda una conversación (título, fijada, cuántos pedidos)');
    r = await req('GET', `/agente/conversaciones/${id}`, null, t1);
    ok(r.j.items.length === 2 && r.j.messages.length === 1 && r.j.ctx.id === 'p1' && r.j.resumen === 'Listo, quedó creada', 'y la lee completa');
    const fila = await db.agenteConversacion.findUnique({ where: { usuarioId_id: { usuarioId: c1.id, id } } });
    ok(fila.corredoraId === admin.corredoraId && !('titulo' in fila.datos) && fila.datos.items.length === 2, 'en la base: de su usuario y corredora; título y fijada en columnas');
    r = await req('PUT', `/agente/conversaciones/${id}`, { ...conv, items: [...conv.items, { k: 'user', text: 'y la foto' }] }, t1);
    ok(r.j.version === 2 && r.j.n === 2, 'guardarla de nuevo la reemplaza (versión 2)');

    // ---- sincronización
    r = await req('GET', '/agente/conversaciones', null, t1);
    ok(r.j.items.length === 1 && r.j.items[0].items.length === 3 && r.j.servidorEn, 'la lista propia viene completa (para sincronizar)');
    const marca = r.j.servidorEn; await esperar(50);
    const id2 = `k${SUF}b`;
    await req('PUT', `/agente/conversaciones/${id2}`, { titulo: 'Otra', items: [] }, t1);
    ok((await req('DELETE', `/agente/conversaciones/${id}`, null, t1)).s === 200, 'borra una');
    r = await req('GET', `/agente/conversaciones?desde=${encodeURIComponent(marca)}`, null, t1);
    ok(r.j.items.some((x) => x.id === id2 && x.titulo === 'Otra') && r.j.items.some((x) => x.id === id && x.eliminado), '?desde= trae la nueva y la borrada (como eliminada)');
    ok((await req('GET', `/agente/conversaciones/${id}`, null, t1)).s === 404, 'la borrada ya no se abre');
    ok((await db.agenteConversacion.findUnique({ where: { usuarioId_id: { usuarioId: c1.id, id } } })).datos.items === undefined, 'y su contenido se vació en la base');

    // ---- importar
    r = await req('POST', '/agente/conversaciones/importar', { items: [{ id: id2, titulo: 'NO PISAR', items: [] }, { id: `k${SUF}c`, titulo: 'Local vieja', items: [{ k: 'user', text: 'hola' }], creado: '2026-01-01T00:00:00.000Z' }, { id: 'x', titulo: 'id malo' }] }, t1);
    ok(r.j.nuevos === 1 && r.j.existentes === 1 && r.j.rechazados.length === 1, 'importar sube las nuevas, no pisa las existentes y rechaza ids malos');
    ok((await req('GET', `/agente/conversaciones/${id2}`, null, t1)).j.titulo === 'Otra', 'la existente quedó igual');

    // ---- quién ve qué
    r = await req('GET', `/agente/conversaciones?usuarioId=${c1.id}`, null, adm);
    ok(r.s === 200 && r.j.items.length === 2 && r.j.items.every((x) => x.titulo && x.items === undefined), 'el administrador ve la lista de un corredor, sin el contenido');
    r = await req('GET', `/agente/conversaciones/${id2}?usuarioId=${c1.id}`, null, adm);
    ok(r.s === 200 && r.j.titulo === 'Otra' && Array.isArray(r.j.items), 'y abre una completa');
    ok((await req('GET', `/agente/conversaciones?usuarioId=${c1.id}`, null, t2)).s === 403, 'un corredor no ve las de otro');
    ok((await req('GET', `/agente/conversaciones/${id2}?usuarioId=${c1.id}`, null, t2)).s === 403, 'ni puede abrirlas');
    const t3 = await ingresar(c3.email, 'clave-e2e-123');
    ok((await req('GET', `/agente/conversaciones?usuarioId=${c1.id}`, null, t3)).s === 404, 'el administrador de otra corredora no las ve');
    ok((await req('GET', '/agente/conversaciones', null, t2)).j.items.length === 0, 'cada uno sincroniza solo las suyas');
    ok((await req('PUT', `/agente/conversaciones/${id2}`, { titulo: 'Cambio de otro' }, t2)).s === 200 && (await req('GET', `/agente/conversaciones/${id2}`, null, t1)).j.titulo === 'Otra', 'escribir con el mismo id crea una propia: no toca la del otro');

    // ---- tamaño
    const grande = 'x'.repeat(3.2 * 1024 * 1024);
    r = await req('PUT', `/agente/conversaciones/k${SUF}g`, { titulo: 'grande', items: [{ k: 'user', text: grande }] }, t1);
    ok(r.s === 400, 'una conversación de más de 3 MB se rechaza');

    // ---- registro de acciones
    r = await req('POST', '/agente/registro', { items: [{ t: '2026-11-05T10:00:00.000Z', tool: 'asset_crear_propiedad', ok: true, resumen: 'Creó una propiedad' }, { canal: 'whatsapp', tool: 'send_to_sign_document_tools', action: null, ok: false, resumen: 'Cancelado por el usuario' }] }, t1);
    ok(r.s === 201 && r.j.agregados === 2, 'el Agente registra lo que hizo');
    r = await req('GET', '/agente/registro', null, t1);
    ok(r.j.length === 2 && r.j[0].canal === 'whatsapp' && r.j[0].ok === false && r.j[1].tool === 'asset_crear_propiedad', 'el corredor ve su registro (lo más nuevo primero)');
    ok((await req('GET', `/agente/registro?usuarioId=${c1.id}`, null, adm)).j.length === 2, 'el administrador ve el de un corredor');
    ok((await req('GET', `/agente/registro?usuarioId=${c1.id}`, null, t2)).s === 403, 'otro corredor no');
    ok((await req('POST', '/agente/registro', { items: [{ tool: '' }] }, t1)).s === 400, 'una acción sin herramienta se rechaza');

    console.log('\nTodo bien.');
  } catch (e) {
    console.error('\n' + e.message);
    process.exitCode = 1;
  } finally {
    await db.agenteRegistro.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await db.agenteConversacion.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await db.usuario.deleteMany({ where: { id: { in: usuarios } } });
    if (otraCo) await db.corredora.delete({ where: { id: otraCo.id } }).catch(() => null);
    await db.$disconnect();
  }
})();
