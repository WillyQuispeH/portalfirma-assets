// Prueba de punta a punta de las firmas enviadas contra la API corriendo (yarn dev) y asset_dev. Crea sus propios
// datos (prefijo E2E) y al final los borra de verdad. Uso: node test/firmas-e2e.js [url]
// Revisa: registrar una firma (id op<número>), actualizarla (versión), que toda la corredora la vea, que los datos del
// dueño se reserven a un corredor que no captó la propiedad (y que su PUT no los pise), sincronización e importar.
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
const ingresar = async (email, clave) => (await req('POST', '/auth/ingresar', { email, clave })).j.tokenAcceso;
const SUF = Date.now().toString(36);
const OP = 900000000 + Math.floor(Math.random() * 90000000);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = new PrismaClient();
  const creados = { props: [], personas: [], usuarios: [], firmas: [] };
  try {
    const adm = await ingresar(env.SEMBRAR_ADMIN_EMAIL, env.SEMBRAR_ADMIN_CLAVE);
    let r = await req('POST', '/usuarios', { email: `e2e-fi-${SUF}@prueba.cl`, nombre: 'E2E Corredor Firmas', clave: 'clave-e2e-123', telefono: '+56911112222' }, adm);
    const corId = r.j.id; creados.usuarios.push(corId);
    const cor = await ingresar(`e2e-fi-${SUF}@prueba.cl`, 'clave-e2e-123');
    ok(adm && cor, 'ingresan el administrador y un corredor de prueba');
    const dueno = (await req('POST', '/personas', { nombre: `E2E Dueña ${SUF}`, rut: '11.111.111-1', email: `duena-${SUF}@prueba.cl`, telefono: '+56987654321' }, adm)).j; creados.personas.push(dueno.id);
    const arr = (await req('POST', '/personas', { nombre: `E2E Arrendatario ${SUF}`, email: `arr-${SUF}@prueba.cl` }, adm)).j; creados.personas.push(arr.id);
    const prop = (await req('POST', '/propiedades', { titulo: `E2E Firmas ${SUF}`, tipo: 'departamento', arriendo: true }, adm)).j; creados.props.push(prop.id);
    await req('POST', `/propiedades/${prop.id}/vinculos`, { personaId: dueno.id, rol: 'propietario' }, adm);

    // ---- registrar el envío
    const id = `op${OP}`; creados.firmas.push(id);
    const firmantes = [
      { nombre: dueno.nombre, rut: '11.111.111-1', rol: 'Arrendador', personaId: dueno.id, email: dueno.email, telefono: '+56987654321', firmo: false },
      { nombre: arr.nombre, rut: '', rol: 'Arrendatario', personaId: arr.id, email: arr.email, telefono: '', firmo: false },
    ];
    r = await req('PUT', `/firmas/${id}`, { operacion: OP, plantilla: 'Contrato de arriendo', plantillaId: 'tpl-1', origen: 'plantilla', estado: 'en_firma', propIds: [prop.id, 'p-legado'], negocioId: null, fecha: '2026-11-05T12:00:00.000Z', firmantes }, adm);
    ok(r.s === 200 && r.j.id === id && r.j.operacion === OP && r.j.plantilla === 'Contrato de arriendo' && r.j.plantillaId === 'tpl-1', 'el administrador registra el contrato enviado a firmar');
    ok(r.j.propIds.length === 1 && r.j.propIds[0] === prop.id && r.j.enviadoPorId && r.j.fecha.startsWith('2026-11-05'), 'con su propiedad (las que no existen se sueltan), quién la envió y cuándo');
    const fila = await db.firma.findUnique({ where: { id } });
    ok(fila.firmados === 0 && fila.total === 2 && fila.estado === 'en_firma', 'en la base: estado y cuántos firmaron');
    ok((await req('PUT', `/firmas/op${OP + 1}`, { operacion: OP }, adm)).s === 400, 'el id debe calzar con la operación');

    // ---- toda la corredora la ve, con los datos del dueño reservados al corredor que no captó
    r = await req('GET', '/firmas', null, cor);
    const vista = r.j.items.find((x) => x.id === id);
    ok(vista, 'el corredor ve la firma (toda la corredora ve qué está en firma)');
    const [d0, a0] = vista.firmantes;
    ok(d0.reservado && d0.nombre === 'Propietario (reservado)' && !d0.rut && !d0.email && !d0.telefono && d0.rol === 'Arrendador', 'pero el firmante dueño le llega reservado (sin nombre, RUT ni contacto)');
    ok(!a0.reservado && a0.nombre === arr.nombre && a0.email === arr.email, 'y el arrendatario se ve completo');
    ok(!(await req('GET', `/firmas/${id}`, null, adm)).j.firmantes[0].reservado, 'el administrador ve todo');
    await req('PUT', `/propiedades/${prop.id}/captador`, { captadorId: corId }, adm);
    ok(!(await req('GET', `/firmas/${id}`, null, cor)).j.firmantes[0].reservado, 'si el corredor pasa a ser el captador, ve al dueño');
    await req('PUT', `/propiedades/${prop.id}/captador`, { captadorId: null }, adm);

    // ---- el corredor actualiza el estado sin pisar los datos reservados
    const marca = new Date().toISOString(); await esperar(30);
    const v1 = (await req('GET', `/firmas/${id}`, null, cor)).j;
    r = await req('PUT', `/firmas/${id}`, { ...v1, firmantes: v1.firmantes.map((s) => ({ ...s, firmo: true })), estado: 'firmado', revisado: new Date().toISOString() }, cor);
    ok(r.s === 200 && r.j.estado === 'firmado' && r.j.version === 2, 'el corredor registra que se firmó (sube la versión)');
    const f2 = await db.firma.findUnique({ where: { id } });
    ok(f2.firmantes[0].nombre === dueno.nombre && f2.firmantes[0].email === dueno.email && f2.firmantes[0].firmo === true && !f2.firmantes[0].reservado, 'en la base, el dueño conserva sus datos reales (y quedó firmado)');
    ok(f2.firmados === 2 && f2.firmadoEn, 'firmados 2 de 2 y la fecha de firma');
    ok((await req('PUT', `/firmas/${id}`, { ...v1, estado: 'anulado' }, adm)).j?.code === 'VERSION', 'con una versión vieja: 409');
    ok((await req('GET', `/firmas?desde=${encodeURIComponent(marca)}`, null, adm)).j.items.some((x) => x.id === id && x.estado === 'firmado'), 'la sincronización trae el cambio');

    // ---- importar lo que estaba en un equipo
    const viejas = [
      { id: `op${OP + 2}`, operacion: OP + 2, plantilla: 'Orden de visita', estado: 'en_firma', propIds: [prop.id], firmantes: [{ nombre: 'Visitante E2E', rol: 'Visitante' }], fecha: '2026-10-01T10:00:00.000Z' },
      { id: `op${OP}`, operacion: OP, plantilla: 'Contrato de arriendo' }, // ya estaba
      { id: 'mal', operacion: 'x' },
    ];
    creados.firmas.push(`op${OP + 2}`);
    r = await req('POST', '/firmas/importar', { items: viejas }, cor);
    ok(r.s === 201 && r.j.nuevos === 1 && r.j.existentes === 1 && r.j.rechazados.length === 1, 'importa las firmas locales, sin duplicar la que ya estaba');

    // ---- quitar
    ok((await req('DELETE', `/firmas/${id}`, null, cor)).s === 403, 'el corredor no quita una firma que envió otro');
    ok((await req('DELETE', `/firmas/op${OP + 2}`, null, cor)).s === 200, 'pero sí una que subió él');
    ok((await req('GET', `/firmas/op${OP + 2}`, null, adm)).s === 404, 'y ya no está');
    console.log('OK firmas');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await db.firma.deleteMany({ where: { id: { in: creados.firmas } } });
    await db.actividad.deleteMany({ where: { OR: [{ entidadId: { in: [...creados.props, ...creados.personas] } }, { ref2: { in: creados.personas } }] } });
    await db.propiedadPersona.deleteMany({ where: { propiedadId: { in: creados.props } } });
    await db.propiedad.deleteMany({ where: { id: { in: creados.props } } });
    await db.persona.deleteMany({ where: { id: { in: creados.personas } } });
    await db.sesion.deleteMany({ where: { usuarioId: { in: creados.usuarios } } });
    await db.usuario.deleteMany({ where: { id: { in: creados.usuarios } } });
    await db.$disconnect();
  }
})();
