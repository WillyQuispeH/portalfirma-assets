// Prueba de punta a punta de los registros (colecciones de la app) y los contadores contra la API corriendo (yarn dev)
// y asset_dev. Crea sus propios datos (prefijo e2e) y al final los borra. Uso: node test/registros-e2e.js [url]
const fs = require('fs');
const path = require('path');
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
const SUF = Date.now().toString(36);
const SERIE = 'E2E' + SUF.toUpperCase().slice(-6);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = new PrismaClient();
  const ids = []; const usuarios = []; const claves = [];
  let corredoraId = null;
  try {
    const adm = (await req('POST', '/auth/ingresar', { email: env.SEMBRAR_ADMIN_EMAIL, clave: env.SEMBRAR_ADMIN_CLAVE })).j.tokenAcceso;
    ok(adm, 'ingresa el administrador');
    corredoraId = (await db.usuario.findUnique({ where: { email: String(env.SEMBRAR_ADMIN_EMAIL).toLowerCase() } })).corredoraId;

    const id = `e2e-rec-${SUF}`; ids.push(id);
    let r = await req('PUT', `/registros/pv_reclamos/${id}`, { folio: 'PV-0001', estado: 'triage', items: [{ descripcion: 'Gotea el lavamanos', tipo: 'instalacion' }], historial: [] }, adm);
    ok(r.s === 200 && r.j.id === id && r.j.version === 1 && r.j.items[0].tipo === 'instalacion', 'guarda un reclamo de postventa como registro');
    r = await req('PUT', `/registros/pv_reclamos/${id}`, { ...r.j, estado: 'visita' }, adm);
    ok(r.j.version === 2 && r.j.estado === 'visita', 'reemplazarlo sube la versión');
    ok((await req('PUT', `/registros/pv_reclamos/${id}`, { ...r.j, version: 1, estado: 'cerrado' }, adm)).j?.code === 'VERSION', 'con una versión vieja: 409');
    ok((await req('PUT', `/registros/pv_reclamos/${id}`, { ...r.j }, adm)).j.version === 2, 'el mismo contenido no sube la versión');
    ok((await req('PUT', `/registros/otra_cosa/${id}`, { a: 1 }, adm)).s === 400, 'no acepta colecciones desconocidas');
    ok((await req('PUT', `/registros/pv_contratistas/e2e-grande-${SUF}`, { texto: 'x'.repeat(40000) }, adm)).s === 400, 'ni documentos más grandes que lo permitido');

    const marca = new Date().toISOString(); await esperar(30);
    const id2 = `e2e-uni-${SUF}`; ids.push(id2);
    await req('PUT', `/registros/pv_unidades/${id2}`, { proyectoId: 'pj1', numero: '502', propietario: { nombre: 'Ana' } }, adm);
    r = await req('GET', `/registros/pv_unidades?desde=${encodeURIComponent(marca)}`, null, adm);
    ok(r.j.items.some((x) => x.id === id2 && x.numero === '502') && !r.j.items.some((x) => x.id === id), 'la sincronización trae solo lo que cambió en esa colección');
    ok((await req('DELETE', `/registros/pv_unidades/${id2}`, null, adm)).s === 200, 'elimina un registro');
    r = await req('GET', `/registros/pv_unidades?desde=${encodeURIComponent(marca)}`, null, adm);
    ok(r.j.items.some((x) => x.id === id2 && x.eliminado), 'y la sincronización lo informa como baja');

    const id3 = `e2e-imp-${SUF}`; ids.push(id3);
    r = await req('POST', '/registros/plazos/importar', { items: [{ id: id3, titulo: 'Vence la promesa', fecha: '2026-12-01' }, { id: id, titulo: 'otro' }, { id: 'x' }] }, adm);
    ok(r.s === 201 && r.j.nuevos === 2 && r.j.rechazados.length === 1, 'importa lo local (lo que no existe en esa colección)');
    ok((await req('POST', '/registros/plazos/importar', { items: [{ id: id3, titulo: 'cambiado' }] }, adm)).j.existentes === 1 && (await req('GET', `/registros/plazos/${id3}`, null, adm)).j.titulo === 'Vence la promesa', 'importar de nuevo no pisa lo que ya estaba');

    // contadores (folios)
    const a = (await req('POST', `/contadores/${SERIE}`, {}, adm)).j.valor;
    const b = (await req('POST', `/contadores/${SERIE}`, {}, adm)).j.valor;
    ok(a === 1 && b === 2, 'el contador entrega números correlativos');
    const varios = await Promise.all(Array.from({ length: 8 }, () => req('POST', `/contadores/${SERIE}`, {}, adm)));
    const nums = varios.map((x) => x.j.valor).sort((x, y) => x - y);
    ok(new Set(nums).size === 8 && nums[0] === 3 && nums[7] === 10, 'ocho pedidos a la vez reciben ocho números distintos (sin repetir)');
    ok((await req('POST', `/contadores/${SERIE}`, { minimo: 40 }, adm)).j.valor === 41, 'con un mínimo, la serie sigue desde ahí (para no repetir folios que ya existían)');
    ok((await req('POST', '/contadores/minusculas', {}, adm)).s === 400, 'la serie va en mayúsculas');
    // colecciones de cada usuario (plazos) y sus archivos en R2
    let rr = await req('POST', '/usuarios', { email: `e2e-reg-${SUF}@prueba.cl`, nombre: 'E2E Corredor Registros', clave: 'clave-e2e-123', telefono: '+56911112222' }, adm);
    usuarios.push(rr.j.id);
    const cor = (await req('POST', '/auth/ingresar', { email: `e2e-reg-${SUF}@prueba.cl`, clave: 'clave-e2e-123' })).j.tokenAcceso;
    const pz = `e2e-pz-${SUF}`; ids.push(pz);
    const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
    rr = await req('POST', `/registros/plazos/${pz}/archivos/subidas`, { archivos: [{ nombre: 'Contrato.pdf', tipo: 'application/pdf', tamano: PDF.length }] }, adm);
    ok(rr.s === 201 && rr.j.subidas[0].clave.includes(`/r/plazos/`) && rr.j.subidas[0].clave.endsWith('.pdf'), 'entrega la subida firmada del archivo de un plazo');
    const { clave, subida } = rr.j.subidas[0]; claves.push(clave);
    ok((await fetch(subida, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: PDF })).ok, 'el PDF sube directo a R2');
    rr = await req('PUT', `/registros/plazos/${pz}`, { name: 'Contrato.pdf', clave, deadline: '2026-12-31', status: 'done' }, adm);
    ok(rr.s === 200, 'el administrador guarda su plazo');
    ok(!(await req('GET', '/registros/plazos', null, cor)).j.items.some((x) => x.id === pz), 'el corredor no ve los plazos del administrador (son de cada usuario)');
    ok((await req('GET', `/registros/plazos/${pz}`, null, cor)).s === 404, 'ni puede abrirlo');
    ok((await req('PUT', `/registros/plazos/${pz}`, { name: 'otro' }, cor)).s === 409, 'ni usar su id');
    ok((await req('GET', `/registros/plazos/${pz}/archivos/descarga?clave=${encodeURIComponent(clave)}`, null, cor)).s === 404, 'ni bajar su archivo');
    rr = await req('GET', `/registros/plazos/${pz}/archivos/descarga?clave=${encodeURIComponent(clave)}&nombre=Contrato.pdf`, null, adm);
    const baj = rr.s === 200 ? await fetch(rr.j.url) : null;
    ok(baj?.ok && Buffer.from(await baj.arrayBuffer()).equals(PDF), 'el dueño baja su archivo con un link firmado');
    ok((await req('GET', `/registros/plazos/${pz}/archivos/descarga?clave=${encodeURIComponent('c/otra/cosa.pdf')}`, null, adm)).s === 400, 'no entrega archivos fuera de la carpeta del registro');
    ok((await req('POST', `/registros/pv_reclamos/${id}/archivos/subidas`, { archivos: [{ nombre: 'a.pdf', tamano: 10 }] }, adm)).s === 400, 'las colecciones sin archivos no aceptan subidas');
    ok((await req('POST', `/registros/plazos/${pz}/archivos/borrar`, { claves: [clave] }, adm)).s === 201, 'el dueño borra el archivo');
    console.log('OK registros');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    if (corredoraId) {
      await db.registro.deleteMany({ where: { corredoraId, id: { in: [...ids, `e2e-grande-${SUF}`] } } });
      await db.contador.deleteMany({ where: { corredoraId, serie: SERIE } });
    }
    await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await db.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await db.$disconnect();
  }
})();
