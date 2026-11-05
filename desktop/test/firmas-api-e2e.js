// Firmas enviadas contra la API real de Asset (SIN PF_MOCK): la app entra con el administrador de api/.env.
// Revisa: lo que este equipo tenía (las firmas de una propiedad y el historial de «Mis operaciones») se sube solo al
// iniciar sesión, sin duplicar la misma operación; la ficha sigue viendo sus firmas (p.firmas, ahora desde la base);
// registrar un envío nuevo y su cambio de estado llegan a la base; un cambio hecho en otro equipo llega al volver a la
// ventana; «Mis operaciones» y los pendientes salen de la base. Al final borra lo que creó.
// Requiere la API corriendo. Uso: node test/firmas-api-e2e.js [url-de-la-api]
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

const API_DIR = path.join(__dirname, '..', '..', 'api');
const env = Object.fromEntries(fs.readFileSync(path.join(API_DIR, '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1')]));
const API = (process.argv[2] || 'http://localhost:3000') + '/v1';
process.env.DATABASE_URL ||= env.DATABASE_URL;
const { PrismaClient } = require(path.join(API_DIR, 'node_modules', '@prisma/client'));
const SUF = Date.now().toString(36);
const OP = 800000000 + Math.floor(Math.random() * 90000000);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(API + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {} return { s: r.status, j };
};
async function hasta(fn, ms = 15000) { const fin = Date.now() + ms; let v; while (Date.now() < fin) { v = await fn(); if (v) return v; await dormir(300); } return v; }

(async () => {
  const salud = await fetch(API + '/salud').then((r) => r.json()).catch(() => null);
  if (!salud?.db) { console.error(`La API no responde en ${API}. Levántala con start-dev.ps1.`); process.exit(1); }
  const db = new PrismaClient();
  const inicio = new Date();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-fir-'));
  const creados = { props: [], firmas: [`op${OP}`, `op${OP + 1}`, `op${OP + 2}`, `op${OP + 3}`] }; let admin = null; let app = null;
  try {
    admin = await db.usuario.findUnique({ where: { email: String(env.SEMBRAR_ADMIN_EMAIL).toLowerCase() } });
    const tok = (await req('POST', '/auth/ingresar', { email: env.SEMBRAR_ADMIN_EMAIL, clave: env.SEMBRAR_ADMIN_CLAVE })).j.tokenAcceso;
    const prop = (await req('POST', '/propiedades', { titulo: `E2E Firmas app ${SUF}`, tipo: 'departamento', arriendo: true }, tok)).j; creados.props.push(prop.id);

    // lo que este equipo tenía antes de la API: la firma en la propiedad (extrasProp) y el historial local
    const inmoDir = path.join(tmp, 'inmo'); fs.mkdirSync(inmoDir, { recursive: true });
    const firmantes = [{ nombre: 'E2E Arrendataria', rut: '12.345.678-5', rol: 'Arrendatario', firmo: false }];
    fs.writeFileSync(path.join(inmoDir, 'datos.json'), JSON.stringify({ extrasProp: { [prop.id]: { firmas: [{ operacion: OP, plantilla: 'Contrato de arriendo', plantillaId: 'tpl-9', fecha: '2026-11-01T10:00:00.000Z', estado: 'en_firma', firmantes, negocioId: null }] } } }));
    const ud = path.join(tmp, 'ud'); fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, 'portalfirma.json'), JSON.stringify({ history: [
      { operation: OP, name: 'Contrato de arriendo', date: '2026-11-01T10:00:00.000Z', propId: prop.id, origen: 'plantilla', firmantes: [{ nombre: 'E2E Arrendataria', rut: '12.345.678-5', calidad: 'arrendatario', email: 'arr@prueba.cl', telefono: '+56911112222' }] },
      { operation: OP + 1, name: 'Escaneado.pdf', date: '2026-10-20T09:00:00.000Z' },
    ] }));

    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${ud}`], cwd: path.join(__dirname, '..'),
      env: { ...process.env, PF_MOCK: '', PF_MOCK_LOGGED: '', PF_MOCK_ASSET_LOGIN: '', PF_ASSET_API: API, PF_INMO_DIR: inmoDir, PF_AI_MANAGED: 'none', PF_NO_TOURS: '1' } });
    const w = await app.firstWindow(); const errs = [];
    w.on('pageerror', (e) => errs.push(e.message));
    const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    await w.fill('#acEmail', env.SEMBRAR_ADMIN_EMAIL); await w.fill('#acClave', env.SEMBRAR_ADMIN_CLAVE); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached', timeout: 30000 });

    // 1) lo local se subió
    const f1 = await hasta(() => db.firma.findUnique({ where: { id: `op${OP}` } }));
    ok(f1 && f1.propiedadIds.includes(prop.id) && f1.documento === 'Contrato de arriendo' && f1.datos.plantillaId === 'tpl-9', 'la firma que la propiedad tenía solo en este equipo se subió a la base');
    ok(f1.firmantes[0].email === 'arr@prueba.cl' && f1.firmantes[0].rol === 'Arrendatario', 'junto con lo del historial de la misma operación (sin duplicarla)');
    const f2 = await db.firma.findUnique({ where: { id: `op${OP + 1}` } });
    ok(f2 && !f2.propiedadIds.length && f2.origen === 'editor', 'y el envío del historial sin propiedad (editor) también');
    const loc = JSON.parse(fs.readFileSync(path.join(inmoDir, 'datos.json'), 'utf8'));
    ok(loc.firmasSubidas && !loc.extrasProp?.[prop.id]?.firmas, 'datos.json ya no guarda firmas de la propiedad');

    // 2) la ficha sigue viendo sus firmas (p.firmas sale de la base)
    let pv = (await call('inmoListar')).propiedades.find((x) => x.id === prop.id);
    ok(pv.firmas?.length === 1 && pv.firmas[0].operacion === OP && pv.firmas[0].estado === 'en_firma', 'la propiedad muestra su documento en firma');
    ok((await call('firPendientes', { propId: prop.id })).some((x) => x.operacion === OP && x.faltan.length === 1), 'y los pendientes (Agente, Hoy) lo listan con quién falta');
    ok((await call('history')).some((h) => h.operation === OP + 1 && h.name === 'Escaneado.pdf'), '«Mis operaciones» sale de la base');

    // 3) un envío nuevo desde esta app, y su cambio de estado
    await app.evaluate((_e, [op, pid]) => global.__inmo.agregarFirma({ operacion: op, plantilla: 'Orden de visita', origen: 'formato', estado: 'en_firma', fecha: new Date().toISOString(), firmantes: [{ nombre: 'E2E Visitante', rol: 'Visitante', firmo: false }] }, [pid], `Orden de visita enviada a firmar (operación ${op})`), [OP + 2, prop.id]);
    const f3 = await hasta(() => db.firma.findUnique({ where: { id: `op${OP + 2}` } }));
    ok(f3 && f3.propiedadIds[0] === prop.id && f3.enviadoPorId === admin.id && f3.total === 1, 'un documento nuevo enviado a firmar llega a la base (con quién lo envió)');
    ok(await hasta(() => db.actividad.findFirst({ where: { entidadId: prop.id, texto: { contains: `operación ${OP + 2}` } } })), 'y queda en el historial de la propiedad');
    await app.evaluate((_e, op) => global.__inmo.actualizarFirma(op, (f) => { f.estado = 'firmado'; f.firmantes = f.firmantes.map((s) => ({ ...s, firmo: true })); }, null), OP + 2);
    ok(await hasta(async () => { const x = await db.firma.findUnique({ where: { id: `op${OP + 2}` } }); return x.estado === 'firmado' && x.firmados === 1 && x.firmadoEn; }), 'cuando se firma, la base lo registra (firmados y fecha)');
    await app.evaluate((_e, op) => global.__inmo.registrarEnvio({ operation: op, name: 'Poder simple.pdf', origen: 'editor' }), OP + 3);
    ok(await hasta(() => db.firma.findUnique({ where: { id: `op${OP + 3}` } })), 'lo enviado desde el editor (sin propiedad) también va a la base');

    // 4) otro equipo marca firmado el contrato: llega al volver a la ventana
    const remoto = (await req('GET', `/firmas/op${OP}`, null, tok)).j;
    ok((await req('PUT', `/firmas/op${OP}`, { ...remoto, estado: 'firmado', firmantes: remoto.firmantes.map((s) => ({ ...s, firmo: true })) }, tok)).s === 200, 'otro equipo registra que el contrato se firmó');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('focus'));
    ok(await hasta(async () => (await call('inmoListar')).propiedades.find((x) => x.id === prop.id).firmas.find((f) => f.operacion === OP)?.estado === 'firmado'), 'al volver a la ventana, la ficha lo muestra firmado');
    ok(!(await call('firPendientes', { propId: prop.id })).some((x) => x.operacion === OP), 'y ya no figura en los pendientes');
    ok(!errs.length, 'sin errores en la pantalla' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('\nOK firmas-api');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await dormir(1500);
    await app?.close().catch(() => {});
    try {
      await db.firma.deleteMany({ where: { id: { in: creados.firmas } } });
      await db.actividad.deleteMany({ where: { entidadId: { in: creados.props } } });
      await db.propiedad.deleteMany({ where: { id: { in: creados.props } } });
      if (admin) await db.sesion.deleteMany({ where: { usuarioId: admin.id, creadoEn: { gte: inicio } } });
    } catch (e) { console.error('No se pudo deshacer todo:', e.message); process.exitCode = 1; }
    await db.$disconnect();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
