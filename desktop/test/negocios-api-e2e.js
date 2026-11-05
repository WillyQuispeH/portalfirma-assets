// Negocios y agenda contra la API real de Asset (SIN PF_MOCK): la app entra con el administrador de api/.env
// (SEMBRAR_ADMIN_*, que no se imprimen). Revisa: lo que había en el JSON local de este equipo (negocios y eventos de
// antes) se sube solo al iniciar sesión y queda un respaldo; crear un negocio, moverlo de etapa, marcar una tarea y
// agendar una visita desde la app llegan a la base (PUT del documento completo, en segundo plano); un cambio hecho
// en otro equipo llega al volver a la ventana; un choque de versiones recarga y avisa; borrar llega como baja.
// Al final borra todo lo que creó, con @prisma/client desde api/.
// Requiere la API corriendo (start-dev.ps1 o `yarn dev` en api/). Uso: node test/negocios-api-e2e.js [url-de-la-api]
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

const API_DIR = path.join(__dirname, '..', '..', 'api');
const env = Object.fromEntries(fs.readFileSync(path.join(API_DIR, '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1')]));
const API = (process.argv[2] || 'http://localhost:3000') + '/v1';
process.env.DATABASE_URL ||= env.DATABASE_URL;
const { PrismaClient } = require(path.join(API_DIR, 'node_modules', '@prisma/client'));
const SUF = Date.now().toString(36);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(API + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {} return { s: r.status, j };
};
async function hasta(fn, ms = 12000) { const fin = Date.now() + ms; let v; while (Date.now() < fin) { v = await fn(); if (v) return v; await dormir(300); } return v; }

(async () => {
  const salud = await fetch(API + '/salud').then((r) => r.json()).catch(() => null);
  if (!salud?.db) { console.error(`La API no responde en ${API} (o no llega a la base). Levántala con start-dev.ps1.`); process.exit(1); }
  const db = new PrismaClient();
  const inicio = new Date();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-neg-'));
  const creados = { props: [], personas: [], negocios: [], eventos: [] }; let admin = null; let app = null;
  try {
    admin = await db.usuario.findUnique({ where: { email: String(env.SEMBRAR_ADMIN_EMAIL).toLowerCase() } });
    const tok = (await req('POST', '/auth/ingresar', { email: env.SEMBRAR_ADMIN_EMAIL, clave: env.SEMBRAR_ADMIN_CLAVE })).j.tokenAcceso;
    const prop = (await req('POST', '/propiedades', { titulo: `E2E Neg ${SUF}`, tipo: 'departamento', venta: true, arriendo: true, direccion: 'Av. Prueba 456', comuna: 'Ñuñoa' }, tok)).j; creados.props.push(prop.id);
    const cli = (await req('POST', '/personas', { nombre: `E2E Compradora ${SUF}`, email: `comp-${SUF}@prueba.cl`, roles: ['comprador'] }, tok)).j; creados.personas.push(cli.id);

    // lo que había en el JSON local de este equipo, de antes de la API
    const negViejo = { id: `nviejo${SUF}`, tipo: 'arriendo', estado: 'abierto', etapa: 'evaluacion', etapaDesde: '2026-10-20T10:00:00.000Z', propId: prop.id, clienteId: cli.id, tareas: { interes: [true], evaluacion: [true, false, false] }, firmas: {}, creado: '2026-10-01T10:00:00.000Z', actualizado: '2026-10-20T10:00:00.000Z' };
    const evViejo = { id: `vviejo${SUF}`, tipo: 'visita', titulo: 'Visita antigua', fecha: '2026-10-25', hora: '11:00', duracion: 45, propId: prop.id, personaIds: [cli.id], negocioId: negViejo.id, lugar: 'Av. Prueba 456', notas: '', estado: 'hecho', orden: null, ext: null, creado: '2026-10-20T10:00:00.000Z', actualizado: '2026-10-25T12:00:00.000Z' };
    creados.negocios.push(negViejo.id); creados.eventos.push(evViejo.id);
    const inmoDir = path.join(tmp, 'inmo'); fs.mkdirSync(inmoDir, { recursive: true });
    fs.writeFileSync(path.join(inmoDir, 'datos.json'), JSON.stringify({ negocios: [negViejo], eventos: [evViejo] }));

    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'),
      env: { ...process.env, PF_MOCK: '', PF_MOCK_LOGGED: '', PF_MOCK_ASSET_LOGIN: '', PF_ASSET_API: API, PF_INMO_DIR: inmoDir, PF_AI_MANAGED: 'none', PF_NO_TOURS: '1' } });
    const w = await app.firstWindow(); const errs = [];
    w.on('pageerror', (e) => errs.push(e.message));
    const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    await w.fill('#acEmail', env.SEMBRAR_ADMIN_EMAIL); await w.fill('#acClave', env.SEMBRAR_ADMIN_CLAVE); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached', timeout: 30000 });
    ok(true, 'entra con el administrador de Asset');

    // 1) lo local se subió
    const nv = await hasta(() => db.negocio.findUnique({ where: { id: negViejo.id } }));
    ok(nv && nv.etapa === 'evaluacion' && nv.datos.tareas.evaluacion[0] === true && nv.creadoEn.toISOString().startsWith('2026-10-01'), 'el negocio que estaba solo en este equipo se subió a la base (con su id, tareas y fecha)');
    const evb = await db.evento.findUnique({ where: { id: evViejo.id } });
    ok(evb && evb.estado === 'hecho' && evb.negocioId === negViejo.id && evb.personaIds[0] === cli.id, 'y su visita, ligada al negocio');
    const datosLoc = JSON.parse(fs.readFileSync(path.join(inmoDir, 'datos.json'), 'utf8'));
    ok(!datosLoc.negocios && !datosLoc.eventos && datosLoc.respaldoLocal?.negocios?.length === 1, 'datos.json ya no los usa (quedan en un respaldo)');
    let L = await call('negListar');
    ok(L.negocios.some((n) => n.id === negViejo.id && n.prop?.id === prop.id && n.cliente?.id === cli.id), 'la lista de negocios los muestra desde la base');
    ok((await call('agendaListar', {})).some((e) => e.id === evViejo.id), 'y la agenda también');

    // 2) crear un negocio y avanzarlo desde la app
    const n = await call('negGuardar', { tipo: 'venta', propId: prop.id, clienteId: cli.id, valor: { valor: 6100, moneda: 'UF' }, comision: { tipo: '%', valor: 2 } });
    creados.negocios.push(n.id);
    let fila = await hasta(() => db.negocio.findUnique({ where: { id: n.id } }));
    ok(fila && fila.tipo === 'venta' && fila.etapa === 'interes' && fila.datos.valor.valor === 6100 && fila.datos.comision.valor === 2, 'el negocio nuevo llegó a la base');
    await call('negTarea', n.id, 'visita', 0, true);
    const mv = await call('negMover', n.id, 'reserva');
    fila = await hasta(async () => { const f = await db.negocio.findUnique({ where: { id: n.id } }); return f?.etapa === 'reserva' && f.datos.tareas?.visita?.[0] === true ? f : null; });
    ok(fila && fila.version > 1, 'moverlo de etapa y marcar una tarea también (sube la versión)');
    ok(mv.mensajes.some((m) => /reservada/.test(m)), 'y la propiedad queda reservada');
    ok(await hasta(async () => (await db.propiedad.findUnique({ where: { id: prop.id } })).estadoVenta === 'reservada'), 'en la base');

    // 3) agendar, reprogramar y borrar una visita
    const ev = await call('agendaCrear', { tipo: 'visita', fecha: '2026-11-28', hora: '16:00', propId: prop.id, personaIds: [cli.id], negocioId: n.id });
    creados.eventos.push(ev.id);
    let ef = await hasta(() => db.evento.findUnique({ where: { id: ev.id } }));
    ok(ef && ef.hora === '16:00' && ef.fecha.toISOString().startsWith('2026-11-28') && ef.negocioId === n.id && ef.corredorId === admin.id, 'la visita agendada llegó a la base, a cargo de quien la agendó');
    await call('agendaActualizar', ev.id, { fecha: '2026-11-29', hora: '10:30' });
    ef = await hasta(async () => { const f = await db.evento.findUnique({ where: { id: ev.id } }); return f?.hora === '10:30' ? f : null; });
    ok(ef && ef.fecha.toISOString().startsWith('2026-11-29'), 'reprogramarla también');

    // 4) un cambio hecho en otro equipo llega al volver a la ventana
    const remoto = (await req('GET', `/negocios/${n.id}`, null, tok)).j;
    const r4 = await req('PUT', `/negocios/${n.id}`, { ...remoto, proximaAccion: { texto: 'Pedir la reserva firmada', fecha: '2026-11-30' } }, tok);
    ok(r4.s === 200, 'otro equipo cambia el negocio en la API');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('focus'));
    ok(await hasta(async () => (await call('negObtener', n.id)).proximaAccion?.texto === 'Pedir la reserva firmada'), 'al volver a la ventana, la app trae el cambio');

    // 5) choque: otro equipo lo cambia justo antes de que esta app envíe lo suyo
    const actual = (await req('GET', `/negocios/${n.id}`, null, tok)).j;
    await req('PUT', `/negocios/${n.id}`, { ...actual, etapa: 'promesa' }, tok); // la app aún cree que está en «reserva»
    await call('negTarea', n.id, 'reserva', 0, true); // cambio local con la versión vieja → 409 → recarga
    ok(await hasta(async () => (await call('negObtener', n.id)).etapa === 'promesa'), 'si otro lo cambió antes, la app recarga sus datos (no pisa)');

    // 6) borrar
    await call('agendaBorrar', ev.id);
    ok(await hasta(async () => !!(await db.evento.findUnique({ where: { id: ev.id } }))?.eliminadoEn), 'borrar la visita queda en la base (borrado lógico)');
    await call('negBorrar', n.id);
    ok(await hasta(async () => !!(await db.negocio.findUnique({ where: { id: n.id } }))?.eliminadoEn), 'el administrador elimina el negocio');
    L = await call('negListar');
    ok(!L.negocios.some((x) => x.id === n.id), 'y sale de la lista');
    ok(!fs.existsSync(path.join(inmoDir, 'cola-api.json')) || !JSON.parse(fs.readFileSync(path.join(inmoDir, 'cola-api.json'), 'utf8')).ops?.length, 'no queda nada pendiente en la cola');
    ok(!errs.length, 'sin errores en la pantalla' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('\nOK negocios-api');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await dormir(1500);
    await app?.close().catch(() => {});
    try {
      await db.evento.deleteMany({ where: { OR: [{ id: { in: creados.eventos } }, { propiedadId: { in: creados.props } }] } });
      await db.negocio.deleteMany({ where: { OR: [{ id: { in: creados.negocios } }, { propiedadId: { in: creados.props } }] } });
      await db.actividad.deleteMany({ where: { OR: [{ entidadId: { in: [...creados.props, ...creados.personas, ...creados.negocios, ...creados.eventos] } }, { ref2: { in: [...creados.props, ...creados.personas] } }] } });
      await db.propiedadPersona.deleteMany({ where: { propiedadId: { in: creados.props } } });
      await db.propiedad.deleteMany({ where: { id: { in: creados.props } } });
      await db.persona.deleteMany({ where: { id: { in: creados.personas } } });
      if (admin) await db.sesion.deleteMany({ where: { usuarioId: admin.id, creadoEn: { gte: inicio } } });
    } catch (e) { console.error('No se pudo deshacer todo:', e.message); process.exitCode = 1; }
    await db.$disconnect();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
