// Prueba de punta a punta de negocios y agenda contra la API corriendo (yarn dev) y asset_dev. Crea sus propios datos
// (prefijo E2E) y al final los borra de verdad. Uso: node test/negocios-agenda-e2e.js [url]
// Revisa: crear y reemplazar el documento (PUT), versión, quién ve qué (corredor / administrador), reasignar, la
// sincronización por cambios (lo ajeno llega como baja), borrar, referencias inválidas e importar lo local.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
const nid = (p) => `${p}${SUF}${crypto.randomBytes(3).toString('hex')}`;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = new PrismaClient();
  const creados = { props: [], personas: [], usuarios: [], negocios: [], eventos: [] };
  try {
    const adm = await ingresar(env.SEMBRAR_ADMIN_EMAIL, env.SEMBRAR_ADMIN_CLAVE);
    ok(adm, 'ingresa el administrador');
    let r = await req('POST', '/usuarios', { email: `e2e-ne-${SUF}@prueba.cl`, nombre: 'E2E Corredor NE', clave: 'clave-e2e-123', telefono: '+56911112222' }, adm);
    ok(r.s === 201, 'el admin crea un corredor de prueba');
    const corId = r.j.id; creados.usuarios.push(corId);
    const cor = await ingresar(`e2e-ne-${SUF}@prueba.cl`, 'clave-e2e-123');
    r = await req('POST', '/propiedades', { titulo: `E2E Negocios ${SUF}`, tipo: 'departamento', venta: true, arriendo: true }, adm);
    const prop = r.j; creados.props.push(prop.id);
    r = await req('POST', '/personas', { nombre: `E2E Cliente ${SUF}`, email: `cli-${SUF}@prueba.cl` }, adm);
    const cli = r.j; creados.personas.push(cli.id);

    // ---- negocios
    const n1 = nid('n'); creados.negocios.push(n1);
    const marca0 = new Date().toISOString(); await esperar(30);
    r = await req('PUT', `/negocios/${n1}`, { tipo: 'venta', etapa: 'interes', propId: prop.id, clienteId: cli.id, tareas: { interes: [true] }, firmas: {}, valor: { valor: 5200, moneda: 'UF' }, proximaAccion: { texto: 'Llamar', fecha: '2026-11-20' }, creado: '2026-10-01T12:00:00.000Z' }, cor);
    ok(r.s === 200 && r.j.id === n1 && r.j.corredorId === corId && r.j.version === 1, 'el corredor crea un negocio con su id y queda a su cargo');
    ok(r.j.tareas.interes[0] === true && r.j.valor.valor === 5200 && r.j.proximaAccion.fecha === '2026-11-20' && r.j.creado.startsWith('2026-10-01'), 'guarda la estructura completa (tareas, valor, próxima acción) y la fecha de creación');
    const enDb = await db.negocio.findUnique({ where: { id: n1 } });
    ok(enDb.propiedadId === prop.id && enDb.proximaFecha.toISOString().startsWith('2026-11-20') && !('tipo' in enDb.datos) && !('version' in enDb.datos), 'en la base: columnas para filtrar y el resto en datos');
    r = await req('PUT', `/negocios/${n1}`, { ...r.j, etapa: 'visita' }, cor);
    ok(r.s === 200 && r.j.version === 2 && r.j.etapa === 'visita', 'reemplazar el negocio sube la versión');
    const v2 = r.j;
    r = await req('PUT', `/negocios/${n1}`, { ...v2 }, cor);
    ok(r.s === 200 && r.j.version === 2, 'el mismo contenido no sube la versión');
    r = await req('PUT', `/negocios/${n1}`, { ...v2, version: 1, etapa: 'reserva' }, cor);
    ok(r.s === 409 && r.j.code === 'VERSION', 'con una versión vieja: 409 (no pisa cambios ajenos)');
    ok((await req('PUT', `/negocios/${nid('n')}`, { tipo: 'venta', etapa: 'interes', propId: crypto.randomUUID() }, cor)).s === 400, 'una propiedad que no existe: 400');
    ok((await req('PUT', '/negocios/x', { tipo: 'venta', etapa: 'interes' }, cor)).s === 400, 'un id no válido: 400');
    r = await req('PUT', `/negocios/${n1}`, { ...v2, corredorId: null }, cor);
    ok(r.s === 200 && r.j.corredorId === corId, 'el corredor no puede reasignar su negocio');

    const n2 = nid('n'); creados.negocios.push(n2);
    r = await req('PUT', `/negocios/${n2}`, { tipo: 'arriendo', etapa: 'interes', propId: prop.id }, adm);
    ok(r.s === 200 && r.j.corredorId === null, 'el administrador crea uno sin corredor');
    let lc = (await req('GET', '/negocios', null, cor)).j.items.map((x) => x.id);
    ok(lc.includes(n1) && !lc.includes(n2), 'el corredor ve solo los suyos');
    let la = (await req('GET', '/negocios', null, adm)).j.items.map((x) => x.id);
    ok(la.includes(n1) && la.includes(n2), 'el administrador ve todos');
    ok((await req('GET', `/negocios/${n2}`, null, cor)).s === 403, 'el corredor no abre uno ajeno');
    ok((await req('PUT', `/negocios/${n2}`, { tipo: 'arriendo', etapa: 'visita' }, cor)).s === 403, 'ni lo cambia');
    r = await req('GET', `/negocios?desde=${encodeURIComponent(marca0)}`, null, cor);
    ok(r.j.items.some((x) => x.id === n1 && x.tipo) && r.j.items.some((x) => x.id === n2 && x.eliminado && !x.tipo), 'en la sincronización, lo ajeno llega solo como baja (sin datos)');

    let marca = new Date().toISOString(); await esperar(30);
    r = await req('PUT', `/negocios/${n2}`, { ...(await req('GET', `/negocios/${n2}`, null, adm)).j, corredorId: corId }, adm);
    ok(r.s === 200 && r.j.corredorId === corId, 'el administrador lo reasigna al corredor');
    r = await req('GET', `/negocios?desde=${encodeURIComponent(marca)}`, null, cor);
    ok(r.j.items.some((x) => x.id === n2 && x.tipo === 'arriendo'), 'y al corredor le llega en la sincronización');
    marca = new Date().toISOString(); await esperar(30);
    r = await req('PUT', `/negocios/${n2}`, { ...r.j.items.find((x) => x.id === n2), corredorId: null }, adm);
    r = await req('GET', `/negocios?desde=${encodeURIComponent(marca)}`, null, cor);
    ok(r.j.items.some((x) => x.id === n2 && x.eliminado), 'si se lo quitan, le llega como baja');

    ok((await req('DELETE', `/negocios/${n1}`, null, cor)).s === 403, 'el corredor no elimina negocios');
    marca = new Date().toISOString(); await esperar(30);
    ok((await req('DELETE', `/negocios/${n1}`, null, adm)).s === 200, 'el administrador sí');
    ok((await req('GET', `/negocios?desde=${encodeURIComponent(marca)}`, null, cor)).j.items.some((x) => x.id === n1 && x.eliminado), 'la sincronización informa el eliminado');
    ok((await req('GET', `/negocios/${n1}`, null, adm)).s === 404, 'y ya no se abre');
    r = await req('PUT', `/negocios/${n1}`, { ...v2, version: undefined }, adm);
    ok(r.s === 404 && r.j.code === 'ELIMINADO', 'ni se puede volver a guardar');

    // ---- eventos
    const n3 = nid('n'); creados.negocios.push(n3);
    await req('PUT', `/negocios/${n3}`, { tipo: 'venta', etapa: 'visita', propId: prop.id, clienteId: cli.id }, cor);
    const e1 = nid('v'); creados.eventos.push(e1);
    r = await req('PUT', `/eventos/${e1}`, { tipo: 'visita', titulo: 'Visita E2E', fecha: '2026-11-21', hora: '15:30', duracion: 45, propId: prop.id, personaIds: [cli.id, crypto.randomUUID(), 'c-legado'], negocioId: n3, lugar: 'Av. Prueba 123', notas: '', estado: 'programado', orden: null, ext: null }, adm);
    ok(r.s === 200 && r.j.corredorId === corId, 'un evento del administrador ligado al negocio de un corredor queda a cargo de ese corredor');
    ok(r.j.fecha === '2026-11-21' && r.j.hora === '15:30' && r.j.titulo === 'Visita E2E' && r.j.duracion === 45, 'guarda fecha, hora y el resto');
    ok(r.j.personaIds.length === 1 && r.j.personaIds[0] === cli.id, 'solo quedan las personas que existen en la corredora');
    ok((await req('PUT', `/eventos/${nid('v')}`, { tipo: 'visita', fecha: '21-11-2026' }, adm)).s === 400, 'una fecha mal escrita: 400');
    ok((await req('PUT', `/eventos/${nid('v')}`, { tipo: 'visita', fecha: '2026-11-21', hora: '25:00' }, adm)).s === 400, 'una hora no válida: 400');
    const e2 = nid('v'); creados.eventos.push(e2);
    r = await req('PUT', `/eventos/${e2}`, { tipo: 'tarea', titulo: 'Tarea del admin', fecha: '2026-11-22' }, adm);
    ok(r.s === 200 && r.j.corredorId !== corId, 'un evento suelto del administrador queda a su cargo');
    const ev = (await req('GET', '/eventos', null, cor)).j.items.map((x) => x.id);
    ok(ev.includes(e1) && !ev.includes(e2), 'el corredor ve solo su agenda');
    r = await req('PUT', `/eventos/${e1}`, { ...(await req('GET', `/eventos/${e1}`, null, cor)).j, estado: 'hecho' }, cor);
    ok(r.s === 200 && r.j.estado === 'hecho' && r.j.version === 2, 'el corredor marca su visita como hecha');
    ok((await req('DELETE', `/eventos/${e2}`, null, cor)).s === 403, 'no borra un evento ajeno');
    ok((await req('DELETE', `/eventos/${e1}`, null, cor)).s === 200, 'pero sí uno suyo');

    // ---- importar lo que estaba en el JSON local de un equipo
    const viejos = [
      { id: nid('nimp'), tipo: 'venta', estado: 'abierto', etapa: 'promesa', propId: prop.id, clienteId: 'c-legado-1', corredorId: 'k-perfil-antiguo', tareas: { promesa: [true, false] }, creado: '2026-09-01T10:00:00.000Z' },
      { id: nid('nimp'), tipo: 'arriendo', estado: 'perdido', etapa: 'visita', propId: 'p-legado', motivoPerdida: 'Encontró otra' },
      { id: 'mal', tipo: 'venta', etapa: 'interes' },
    ];
    creados.negocios.push(viejos[0].id, viejos[1].id);
    r = await req('POST', '/negocios/importar', { items: viejos }, cor);
    ok(r.s === 201 && r.j.nuevos === 2 && r.j.rechazados.length === 1 && r.j.rechazados[0].id === 'mal', 'importa los negocios locales válidos y explica los rechazados');
    const imp = await db.negocio.findUnique({ where: { id: viejos[0].id } });
    ok(imp.propiedadId === prop.id && imp.clienteId === null && imp.corredorId === corId && imp.datos.tareas.promesa[1] === false && imp.creadoEn.toISOString().startsWith('2026-09-01'), 'conserva lo que existe, suelta las referencias que ya no están y queda a cargo de quien importa');
    r = await req('POST', '/negocios/importar', { items: viejos.slice(0, 2) }, cor);
    ok(r.j.nuevos === 0 && r.j.existentes === 2, 'importar de nuevo no duplica ni pisa');
    const evViejo = { id: nid('vimp'), tipo: 'visita', fecha: '2026-08-15', hora: '', propId: prop.id, personaIds: ['c-legado'], negocioId: viejos[0].id, estado: 'hecho', titulo: 'Visita antigua' };
    creados.eventos.push(evViejo.id);
    r = await req('POST', '/eventos/importar', { items: [evViejo] }, adm);
    const ei = await db.evento.findUnique({ where: { id: evViejo.id } });
    ok(r.j.nuevos === 1 && ei.corredorId === corId && ei.hora === null && ei.datos.titulo === 'Visita antigua', 'importa eventos: el del negocio de un corredor queda a su cargo');

    console.log('OK negocios y agenda');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await db.evento.deleteMany({ where: { id: { in: creados.eventos } } });
    await db.negocio.deleteMany({ where: { id: { in: creados.negocios } } });
    await db.actividad.deleteMany({ where: { entidadId: { in: [...creados.props, ...creados.personas] } } });
    await db.propiedad.deleteMany({ where: { id: { in: creados.props } } });
    await db.persona.deleteMany({ where: { id: { in: creados.personas } } });
    await db.sesion.deleteMany({ where: { usuarioId: { in: creados.usuarios } } });
    await db.usuario.deleteMany({ where: { id: { in: creados.usuarios } } });
    await db.$disconnect();
  }
})();
