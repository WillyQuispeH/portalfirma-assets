// Prueba de punta a punta de la cartera contra la API corriendo (yarn dev) y asset_dev. Crea sus propios datos
// (marcados con el prefijo E2E) y al final los borra de verdad. Uso: node test/cartera-e2e.js [url]
// Revisa: crear/editar/archivar/eliminar propiedades, versión (no pisar cambios ajenos), personas con RUT único,
// vínculos, privacidad del dueño para un CORREDOR que no captó, búsqueda, sincronización por cambios e importación.
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
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
// RUT válido a partir de un número
const dv = (n) => { let s = 0, m = 2; for (const d of String(n).split('').reverse()) { s += Number(d) * m; m = m === 7 ? 2 : m + 1; } const r = 11 - (s % 11); return r === 11 ? '0' : r === 10 ? 'K' : String(r); };
const rut = (n) => `${n}-${dv(n)}`;

(async () => {
  const db = new PrismaClient();
  const creados = { props: [], personas: [], usuarios: [] };
  try {
    const adm = await ingresar(env.SEMBRAR_ADMIN_EMAIL, env.SEMBRAR_ADMIN_CLAVE);
    ok(adm, 'ingresa el administrador');

    // un corredor de prueba
    let r = await req('POST', '/usuarios', { email: `e2e-${SUF}@prueba.cl`, nombre: 'E2E Corredor', clave: 'clave-e2e-123', telefono: '+56911112222' }, adm);
    ok(r.s === 201 && r.j.rol === 'CORREDOR', 'el admin crea un corredor');
    const corId = r.j.id; creados.usuarios.push(corId);
    const cor = await ingresar(`e2e-${SUF}@prueba.cl`, 'clave-e2e-123');
    r = await req('GET', '/usuarios/equipo', null, cor);
    ok(r.s === 200 && r.j.some((u) => u.id === corId), 'el corredor ve al equipo (para nombres de captadores)');
    ok((await req('GET', '/usuarios', null, cor)).s === 403, 'pero no administra usuarios');

    // propiedad del admin, con dueño
    r = await req('POST', '/propiedades', { titulo: `E2E Depto ${SUF}`, tipo: 'departamento', venta: true, precioVenta: { valor: '5200', moneda: 'UF' }, direccion: 'Av. Providencia 1234', unidad: '502', comuna: 'Providencia', dormitorios: '3', banos: 2, fotos: ['https://ejemplo.cl/a.jpg', 'https://ejemplo.cl/b.jpg'], ficha: { orientacion: 'Norte', propietarioEmail: 'dueno@x.cl' } }, adm);
    ok(r.s === 201 && /^PF-\d+$/.test(r.j.codigo) && r.j.precioVenta.valor === 5200 && r.j.dormitorios === 3 && r.j.estadoVenta === 'disponible', `crea la propiedad ${r.j?.codigo} (código automático, números y estado)`);
    ok(r.j.fotos.length === 2 && r.j.fotos[0] === 'https://ejemplo.cl/a.jpg', 'guarda las fotos en orden');
    const p1 = r.j; creados.props.push(p1.id);

    r = await req('POST', '/personas', { nombre: `E2E Dueño ${SUF}`, rut: rut(17000000 + (Date.now() % 900000)), email: 'Dueno@X.cl', telefono: '+56933334444' }, adm);
    ok(r.s === 201 && /^\d{1,2}\.\d{3}\.\d{3}-[\dK]$/.test(r.j.rut) && r.j.email === 'dueno@x.cl', 'crea la persona (RUT con formato, correo en minúsculas)');
    const dueno = r.j; creados.personas.push(dueno.id);
    ok((await req('POST', '/personas', { nombre: 'Otro', rut: dueno.rut }, adm)).s === 409, 'RUT repetido en la corredora: 409');
    ok((await req('POST', '/personas', { nombre: 'Malo', rut: '12.345.678-0' }, adm)).s === 400, 'RUT inválido: 400');

    r = await req('POST', `/propiedades/${p1.id}/vinculos`, { personaId: dueno.id, rol: 'propietario' }, adm);
    ok(r.s === 201 && r.j.vinculos.some((v) => v.personaId === dueno.id && v.rol === 'propietario'), 'vincula al propietario');

    // privacidad: el corredor no captó p1
    r = await req('GET', `/propiedades/${p1.id}`, null, cor);
    ok(r.s === 200 && !r.j.duenoVisible && !('propietarioEmail' in r.j.ficha) && r.j.ficha.orientacion === 'Norte', 'el corredor ve la propiedad ajena, sin los datos del dueño en la ficha');
    r = await req('GET', `/personas/${dueno.id}`, null, cor);
    ok(r.j.reservado && r.j.nombre === 'Propietario (reservado)' && !r.j.rut, 'y la persona dueña le aparece reservada');
    r = await req('PATCH', `/propiedades/${p1.id}`, { ficha: { propietarioEmail: 'pirata@x.cl' }, captadorId: corId }, cor);
    const real = await db.propiedad.findUnique({ where: { id: p1.id } });
    ok(real.ficha.propietarioEmail === 'dueno@x.cl' && real.captadorId === null, 'lo que el corredor manda del dueño o del captador se ignora');

    // asignar captador → ahora sí ve al dueño
    r = await req('PUT', `/propiedades/${p1.id}/captador`, { captadorId: corId }, adm);
    ok(r.s === 200 && r.j.captadorId === corId, 'el admin asigna el captador');
    r = await req('GET', `/personas/${dueno.id}`, null, cor);
    ok(!r.j.reservado && r.j.email === 'dueno@x.cl', 'como captador, el corredor ve al dueño');
    ok((await req('PUT', `/propiedades/${p1.id}/captador`, { captadorId: null }, cor)).s === 403, 'el corredor no puede asignar captadores');

    // edición con versión
    const v = (await req('GET', `/propiedades/${p1.id}`, null, adm)).j.version;
    r = await req('PATCH', `/propiedades/${p1.id}`, { estadoVenta: 'reservada', version: v }, adm);
    ok(r.s === 200 && r.j.estadoVenta === 'reservada' && r.j.version === v + 1, 'edita con la versión correcta (sube la versión)');
    ok((await req('PATCH', `/propiedades/${p1.id}`, { titulo: 'pisado', version: v }, cor)).s === 409, 'con una versión vieja: 409 (no pisa cambios ajenos)');
    r = await req('PATCH', `/propiedades/${p1.id}`, { ficha: { orientacion: null, piso: 5 } }, adm);
    ok(!('orientacion' in r.j.ficha) && r.j.ficha.piso === 5 && r.j.ficha.propietarioEmail === 'dueno@x.cl', 'la ficha se combina (null borra, lo demás se conserva)');

    // propiedad creada por el corredor: queda como captación suya
    r = await req('POST', '/propiedades', { titulo: `E2E Casa ${SUF}`, arriendo: true, precioArriendo: { valor: 900000, moneda: 'CLP' }, comuna: 'Ñuñoa' }, cor);
    ok(r.s === 201 && r.j.captadorId === corId && r.j.estadoArriendo === 'disponible', 'la que crea el corredor queda captada por él');
    creados.props.push(r.j.id);

    // búsqueda y filtros
    r = await req('GET', `/propiedades?q=${encodeURIComponent('nunoa ' + SUF.slice(0, 4))}`, null, adm);
    ok(r.j.items.some((x) => x.titulo === `E2E Casa ${SUF}`), 'busca sin tildes ni mayúsculas («nunoa» encuentra Ñuñoa)');
    r = await req('GET', '/propiedades?captador=yo&operacion=arriendo', null, cor);
    ok(r.j.items.length >= 1 && r.j.items.every((x) => x.captadorId === corId && x.arriendo), 'filtra por «mis captaciones» y operación');

    // sincronización por cambios
    const marca = new Date().toISOString();
    await new Promise((res) => setTimeout(res, 50));
    await req('PATCH', `/propiedades/${p1.id}`, { gastosComunes: 180000 }, adm);
    r = await req('GET', `/propiedades?desde=${encodeURIComponent(marca)}`, null, adm);
    ok(r.j.items.length >= 1 && r.j.items.every((x) => new Date(x.actualizado) > new Date(marca)) && r.j.items.some((x) => x.id === p1.id), 'sincroniza solo lo que cambió desde una fecha');

    // historial
    r = await req('GET', `/actividad/${p1.id}`, null, adm);
    ok(r.j.length >= 4 && r.j.some((a) => /Captada por E2E Corredor/.test(a.texto)) && r.j.every((a) => a.usuarioId), 'el historial registra cada cambio y quién lo hizo');
    r = await req('POST', '/actividad/notas', { entidadTipo: 'propiedad', entidadId: p1.id, texto: 'Llamé al dueño' }, cor);
    ok(r.s === 201 && r.j[0].tipo === 'nota', 'agrega una nota al historial');

    // importación
    const imp = { sistema: 'e2e', items: [
      { origenId: `A-${SUF}`, datos: { codigo: `CV-E2E-${SUF}`, titulo: `E2E Importada ${SUF}`, tipo: 'casa', venta: true, precioVenta: { valor: 8000, moneda: 'UF' }, comuna: 'Las Condes', fotos: ['https://ejemplo.cl/i.jpg'] }, propietario: { nombre: `E2E Dueña Imp ${SUF}`, rut: rut(18000000 + (Date.now() % 900000)) } },
    ] };
    ok((await req('POST', '/propiedades/importar', imp, cor)).s === 403, 'importar es solo del administrador');
    r = await req('POST', '/propiedades/importar', imp, adm);
    ok(r.s === 201 && r.j.nuevas === 1 && r.j.personas === 1, 'importa una propiedad nueva con su propietaria');
    const impId = (await db.propiedad.findFirst({ where: { origenSistema: 'e2e', origenId: `A-${SUF}` } })).id; creados.props.push(impId);
    const impDueno = (await db.propiedadPersona.findFirst({ where: { propiedadId: impId } })).personaId; creados.personas.push(impDueno);
    await req('PATCH', `/propiedades/${impId}`, { titulo: 'Editado en Asset' }, adm);
    imp.items[0].datos.titulo = 'Título nuevo del origen'; imp.items[0].datos.precioVenta = { valor: 7500, moneda: 'UF' };
    r = await req('POST', '/propiedades/importar', imp, adm);
    const re = (await req('GET', `/propiedades/${impId}`, null, adm)).j;
    ok(r.j.actualizadas === 1 && r.j.nuevas === 0 && re.titulo === 'Editado en Asset' && re.precioVenta.valor === 7500, 'reimportar no duplica, actualiza y respeta lo editado en Asset');

    // archivar y eliminar
    ok((await req('PUT', `/propiedades/${p1.id}/archivada`, { archivada: true }, cor)).s === 403, 'archivar es solo del administrador');
    r = await req('PUT', `/propiedades/${p1.id}/archivada`, { archivada: true }, adm);
    ok(r.j.archivada && !(await req('GET', '/propiedades?q=' + SUF, null, adm)).j.items.some((x) => x.id === p1.id), 'archivada: sale de la lista normal');
    ok((await req('DELETE', `/personas/${dueno.id}`, null, adm)).s === 409, 'no se elimina una persona vinculada');
    const marca2 = new Date().toISOString(); await new Promise((res) => setTimeout(res, 50));
    ok((await req('DELETE', `/propiedades/${p1.id}`, null, adm)).s === 200, 'el admin elimina la propiedad');
    r = await req('GET', `/propiedades?desde=${encodeURIComponent(marca2)}`, null, adm);
    ok(r.j.items.some((x) => x.id === p1.id && x.eliminado), 'la sincronización informa la eliminada (para quitarla de la app)');
    ok((await req('GET', `/propiedades/${p1.id}`, null, adm)).s === 404, 'y ya no se puede abrir');

    r = await req('GET', '/propiedades/resumen', null, adm);
    ok(r.s === 200 && typeof r.j.propiedades === 'number' && r.j.venta, 'resumen de la cartera');
    console.log('OK cartera');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    // limpieza real de lo creado por la prueba
    await db.actividad.deleteMany({ where: { OR: [{ entidadId: { in: [...creados.props, ...creados.personas] } }, { ref2: { in: creados.personas } }] } });
    await db.propiedadPersona.deleteMany({ where: { propiedadId: { in: creados.props } } });
    await db.propiedad.deleteMany({ where: { id: { in: creados.props } } });
    await db.persona.deleteMany({ where: { id: { in: creados.personas } } });
    await db.sesion.deleteMany({ where: { usuarioId: { in: creados.usuarios } } });
    await db.usuario.deleteMany({ where: { id: { in: creados.usuarios } } });
    await db.$disconnect();
  }
})();
