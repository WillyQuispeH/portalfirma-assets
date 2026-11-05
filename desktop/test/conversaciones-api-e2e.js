// Conversaciones y registro del Agente contra la API real de Asset (SIN PF_MOCK): la app entra con el administrador de
// api/.env. Revisa: las conversaciones que estaban solo en este equipo (conversaciones.json) y el registro de acciones
// se suben solos al iniciar sesión; guardar, renombrar, fijar y borrar llegan a la base; una conversación guardada en
// otro equipo aparece aquí; una acción nueva del Agente queda en la base; el administrador lee la lista y una
// conversación de un usuario. Al final borra lo que creó. Requiere la API corriendo.
// Uso: node test/conversaciones-api-e2e.js [url-de-la-api]
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
async function hasta(fn, ms = 15000) { const fin = Date.now() + ms; let v; while (Date.now() < fin) { v = await fn(); if (v) return v; await dormir(300); } return v; }

(async () => {
  const salud = await fetch(API + '/salud').then((r) => r.json()).catch(() => null);
  if (!salud?.db) { console.error(`La API no responde en ${API}. Levántala con start-dev.ps1.`); process.exit(1); }
  const db = new PrismaClient();
  const inicio = new Date();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-conv-'));
  const L1 = `k${SUF}l1`; const L2 = `k${SUF}l2`; const N1 = `k${SUF}n1`; const R1 = `k${SUF}r1`;
  const ids = [L1, L2, N1, R1];
  let admin = null; let app = null;
  try {
    admin = await db.usuario.findUnique({ where: { email: String(env.SEMBRAR_ADMIN_EMAIL).toLowerCase() } });
    const tok = (await req('POST', '/auth/ingresar', { email: env.SEMBRAR_ADMIN_EMAIL, clave: env.SEMBRAR_ADMIN_CLAVE })).j.tokenAcceso;

    // lo que este equipo tenía antes de la cuenta de Asset
    const inmoDir = path.join(tmp, 'inmo'); fs.mkdirSync(inmoDir, { recursive: true });
    fs.writeFileSync(path.join(inmoDir, 'conversaciones.json'), JSON.stringify({ lista: [
      { id: L1, titulo: `E2E Captar depto ${SUF}`, creado: '2026-10-01T10:00:00.000Z', actualizado: '2026-10-01T10:05:00.000Z', fijada: true, resumen: 'Quedó creada', items: [{ k: 'user', text: 'capta un depto' }, { k: 'bot', text: 'Quedó creada' }], messages: [{ role: 'user', content: 'capta un depto' }] },
      { id: L2, titulo: `E2E Agenda ${SUF}`, creado: '2026-10-02T10:00:00.000Z', actualizado: '2026-10-02T10:00:00.000Z', items: [{ k: 'user', text: 'qué tengo hoy' }], messages: [] },
    ] }));
    const ud = path.join(tmp, 'ud'); fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(path.join(ud, 'portalfirma.json'), JSON.stringify({ agentLog: [{ t: '2026-10-01T10:05:00.000Z', tool: 'asset_crear_propiedad', ok: true, resumen: `E2E vieja ${SUF}` }] }));

    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${ud}`], cwd: path.join(__dirname, '..'),
      env: { ...process.env, PF_MOCK: '', PF_MOCK_LOGGED: '', PF_MOCK_ASSET_LOGIN: '', PF_ASSET_API: API, PF_INMO_DIR: inmoDir, PF_AI_MANAGED: 'none', PF_NO_TOURS: '1' } });
    const w = await app.firstWindow(); const errs = [];
    w.on('pageerror', (e) => errs.push(e.message));
    const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    await w.fill('#acEmail', env.SEMBRAR_ADMIN_EMAIL); await w.fill('#acClave', env.SEMBRAR_ADMIN_CLAVE); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached', timeout: 30000 });
    const fila = (id) => db.agenteConversacion.findUnique({ where: { usuarioId_id: { usuarioId: admin.id, id } } });

    // 1) lo local se subió
    const c1 = await hasta(() => fila(L1));
    ok(c1 && c1.titulo === `E2E Captar depto ${SUF}` && c1.fijada && c1.datos.items.length === 2 && c1.datos.messages.length === 1 && c1.creadoEn.toISOString().startsWith('2026-10-01'), 'las conversaciones que estaban solo en este equipo se subieron (con su fecha)');
    ok(await fila(L2), 'las dos');
    ok(await hasta(() => !fs.existsSync(path.join(inmoDir, 'conversaciones.json')) && fs.existsSync(path.join(inmoDir, `conversaciones-${admin.id}.json`))), 'el archivo de antes se dejó de usar; queda una copia por usuario');
    ok(await hasta(() => db.agenteRegistro.findFirst({ where: { usuarioId: admin.id, resumen: `E2E vieja ${SUF}` } })), 'el registro de acciones de este equipo también se subió');
    let lista = await call('convListar', '');
    ok(lista.some((c) => c.id === L1 && c.fijada) && lista.some((c) => c.id === L2), 'el Agente sigue viendo sus conversaciones');

    // 2) guardar, renombrar, fijar y borrar
    await call('convGuardar', N1, { items: [{ k: 'user', text: `E2E nueva ${SUF}` }, { k: 'bot', text: 'Hecho' }] });
    ok(await hasta(async () => (await fila(N1))?.titulo === `E2E nueva ${SUF}`), 'una conversación nueva llega a la base (con su título del primer pedido)');
    await call('convRenombrar', N1, `E2E Renombrada ${SUF}`); await call('convFijar', N1, true);
    ok(await hasta(async () => { const x = await fila(N1); return x?.titulo === `E2E Renombrada ${SUF}` && x.fijada && x.datos.tituloManual; }), 'renombrarla y fijarla también');
    await call('convBorrar', L2);
    ok(await hasta(async () => !!(await fila(L2))?.eliminadoEn), 'borrarla la borra en la base');

    // 3) otro equipo guarda una conversación: llega aquí
    ok((await req('PUT', `/agente/conversaciones/${R1}`, { titulo: `E2E Otro equipo ${SUF}`, items: [{ k: 'user', text: 'desde el notebook' }], messages: [] }, tok)).s === 200, 'el mismo usuario guarda una conversación en otro equipo');
    await app.evaluate(() => global.__convs.traer());
    lista = await call('convListar', '');
    ok(lista.some((c) => c.id === R1 && c.titulo === `E2E Otro equipo ${SUF}`), 'aparece en la lista de este equipo');
    const ab = await call('convAbrir', R1);
    ok(ab.items[0].text === 'desde el notebook', 'y se abre con su contenido');
    ok(!lista.some((c) => c.id === L2), 'la borrada no vuelve');

    // 4) una acción nueva del Agente queda en la base
    await app.evaluate((_e, s) => global.__agenteRegistro.registrar({ tool: 'asset_agendar', ok: true, resumen: `E2E nueva acción ${s}` }), SUF);
    ok(await hasta(() => db.agenteRegistro.findFirst({ where: { usuarioId: admin.id, resumen: `E2E nueva acción ${SUF}` } }), 20000), 'una acción nueva del Agente llega a la base');
    ok((await call('agentLog')).some((x) => x.resumen === `E2E nueva acción ${SUF}`), 'y se ve en la actividad del Agente');

    // 5) el administrador lee las de un usuario
    const deU = await call('convDeUsuario', admin.id);
    ok(deU.some((c) => c.id === L1 && c.titulo === `E2E Captar depto ${SUF}`) && !deU.some((c) => c.id === L2), 'el administrador ve la lista de conversaciones de un usuario (la de otro, sin el contenido: lo revisa api/test/agente-e2e.js)');
    ok((await call('convAbrirDe', admin.id, L1)).items.length === 2, 'y abre una');
    ok((await call('agentLogDe', admin.id)).some((x) => x.resumen === `E2E nueva acción ${SUF}`), 'y su registro de acciones');
    // 6) la pantalla: Usuarios › Conversaciones (solo lectura)
    await w.evaluate(() => window.Usuarios.abrir());
    await w.waitForSelector(`[data-usr-conv="${admin.id}"]`, { timeout: 15000 });
    await w.click(`[data-usr-conv="${admin.id}"]`);
    await w.waitForSelector(`#cvuPanel [data-cvu="${L1}"]`, { timeout: 15000 });
    ok(await w.isVisible(`#cvuPanel [data-cvu="${R1}"]`) && !(await w.isVisible(`#cvuPanel [data-cvu="${L2}"]`)), 'en Usuarios › Conversaciones aparece la lista (sin las borradas)');
    await w.click(`#cvuPanel [data-cvu="${L1}"]`);
    await w.waitForSelector('#cvuChat [data-cvu-de="usuario"]', { timeout: 15000 });
    ok((await w.textContent('#cvuChat')).includes('capta un depto') && await w.isVisible('#cvuChat [data-cvu-de="agente"]'), 'al elegir una se ve lo que pidió el usuario y lo que respondió el Agente');
    await w.click('#cvuVista button:has-text("Acciones del Agente")');
    await w.waitForSelector('#cvuAcciones', { timeout: 15000 });
    ok(await hasta(async () => (await w.textContent('#cvuAcciones')).includes(`E2E nueva acción ${SUF}`)), 'y en «Acciones del Agente», lo que hizo');
    ok(!errs.length, 'sin errores en la pantalla' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('\nOK conversaciones-api');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await dormir(1500);
    await app?.close().catch(() => {});
    try {
      if (admin) {
        await db.agenteConversacion.deleteMany({ where: { usuarioId: admin.id, id: { in: ids } } });
        await db.agenteRegistro.deleteMany({ where: { usuarioId: admin.id, resumen: { contains: SUF } } });
        await db.sesion.deleteMany({ where: { usuarioId: admin.id, creadoEn: { gte: inicio } } });
      }
    } catch (e) { console.error('No se pudo deshacer todo:', e.message); process.exitCode = 1; }
    await db.$disconnect();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
