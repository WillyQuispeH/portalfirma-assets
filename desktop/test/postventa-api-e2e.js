// Postventa contra la API real de Asset (SIN PF_MOCK): la app entra con el administrador de api/.env.
// Revisa: lo que este equipo tenía en postventa.json (proyecto, unidad, reclamo, contratista, conversación y
// configuración) se sube solo al iniciar sesión y queda un respaldo; el folio de un reclamo nuevo lo da el servidor
// y sigue después del último de este equipo; mover un reclamo llega a la base; un cambio de otro equipo llega al
// volver a la ventana; la respuesta automática por WhatsApp queda a cargo de un solo equipo. Al final borra lo creado.
// Requiere la API corriendo. Uso: node test/postventa-api-e2e.js [url-de-la-api]
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pv-'));
  let admin = null; let app = null; let folioAntes = null; const ids = [];
  try {
    admin = await db.usuario.findUnique({ where: { email: String(env.SEMBRAR_ADMIN_EMAIL).toLowerCase() } });
    const c0 = await db.contador.findUnique({ where: { corredoraId_serie: { corredoraId: admin.corredoraId, serie: 'PV' } } }); folioAntes = c0 ? c0.valor : null;
    const base = (c0?.valor || 0) + 500; // el último folio de este equipo, por encima del de la base
    const pj = `pje2e${SUF}`; const un = `ue2e${SUF}`; const rc = `re2e${SUF}`; const ct = `cte2e${SUF}`; const ch = `che2e${SUF}`;
    ids.push(pj, un, rc, ct, ch, 'config');
    const inmoDir = path.join(tmp, 'inmo'); fs.mkdirSync(inmoDir, { recursive: true });
    fs.writeFileSync(path.join(inmoDir, 'postventa.json'), JSON.stringify({
      proyectos: [{ id: pj, nombre: `E2E Edificio ${SUF}`, creado: '2026-10-01T10:00:00.000Z' }],
      unidades: [{ id: un, proyectoId: pj, torre: 'A', numero: '502', propietario: { nombre: 'E2E Ana Rojas', rut: '12.345.678-5', telefono: '+56955551111' }, recepcionDOM: '2025-03-10', inscripcionCBR: '2025-06-02' }],
      reclamos: [{ id: rc, folio: `PV-${String(base).padStart(4, '0')}`, unidadId: un, canal: 'manual', contacto: null, chatId: null, estado: 'triage', urgente: false,
        items: [{ id: 'i1e2e', descripcion: 'Gotea el lavamanos del baño', recinto: 'Baño', tipo: 'instalacion', fotos: [], auto: true }], visitas: [], contratista: null, historial: [{ fecha: '2026-10-02T10:00:00.000Z', texto: 'Reclamo recibido por Asset', quien: 'Asset' }], creado: '2026-10-02T10:00:00.000Z', actualizado: '2026-10-02T10:00:00.000Z' }],
      contratistas: [{ id: ct, nombre: 'E2E Gasfitería Pérez', especialidad: 'gasfitería', telefono: '+56911110000' }],
      chats: { [ch]: { id: ch, contactId: 'c1', telefono: '+56955551111', nombre: 'E2E Ana', paso: 'listo', pv: true, mensajes: [{ dir: 'in', texto: 'Hola, gotea el baño', fecha: '2026-10-02T09:00:00.000Z' }] } },
      config: { auto: false, persona: { nombre: 'Sofía' } }, folio: base,
    }));

    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'),
      env: { ...process.env, PF_MOCK: '', PF_MOCK_LOGGED: '', PF_MOCK_ASSET_LOGIN: '', PF_ASSET_API: API, PF_INMO_DIR: inmoDir, PF_AI_MANAGED: 'none', PF_NO_TOURS: '1' } });
    const w = await app.firstWindow(); const errs = [];
    w.on('pageerror', (e) => errs.push(e.message));
    const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    await w.fill('#acEmail', env.SEMBRAR_ADMIN_EMAIL); await w.fill('#acClave', env.SEMBRAR_ADMIN_CLAVE); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached', timeout: 30000 });
    const reg = (c, id) => db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId: admin.corredoraId, coleccion: c, id } } });

    // 1) lo local se subió
    const r1 = await hasta(() => reg('pv_reclamos', rc));
    ok(r1 && r1.datos.folio === `PV-${String(base).padStart(4, '0')}` && r1.datos.items[0].tipo === 'instalacion', 'el reclamo de postventa que estaba solo en este equipo se subió a la base');
    ok((await reg('pv_proyectos', pj)) && (await reg('pv_unidades', un))?.datos.propietario.rut === '12.345.678-5' && (await reg('pv_contratistas', ct)) && (await reg('pv_chats', ch))?.datos.mensajes.length === 1,
      'junto con el proyecto, la unidad, el contratista y la conversación');
    ok(!fs.existsSync(path.join(inmoDir, 'postventa.json')) && fs.existsSync(path.join(inmoDir, 'postventa.respaldo.json')), 'postventa.json pasó a respaldo');
    const L = await call('pvListar', {});
    ok(L.some((x) => x.id === rc && x.unidad?.nombre?.includes('502') && x.items[0].garantia?.vence), 'la pantalla de postventa lo muestra (con su unidad y la garantía calculada)');

    // 2) un reclamo nuevo: el folio lo da el servidor y sigue después del de este equipo
    const nuevo = await call('pvCrear', { unidadId: un, items: [{ descripcion: 'Se desprende la cerámica del piso de la cocina' }] });
    ids.push(nuevo.id);
    ok(nuevo.folio === `PV-${String(base + 1).padStart(4, '0')}`, `el reclamo nuevo recibe el folio siguiente del servidor (${nuevo.folio})`);
    ok(await hasta(async () => (await reg('pv_reclamos', nuevo.id))?.datos.items[0].tipo === 'terminacion'), 'y llega a la base, ya clasificado');
    await call('pvMover', nuevo.id, 'visita', { visita: { fecha: '2026-11-20', hora: '10:30' } });
    ok(await hasta(async () => (await reg('pv_reclamos', nuevo.id))?.datos.estado === 'visita'), 'moverlo a «Visita de diagnóstico» llega a la base');

    // 3) otro equipo cierra el reclamo antiguo: llega al volver a la ventana
    const tok = (await req('POST', '/auth/ingresar', { email: env.SEMBRAR_ADMIN_EMAIL, clave: env.SEMBRAR_ADMIN_CLAVE })).j.tokenAcceso;
    const remoto = (await req('GET', `/registros/pv_reclamos/${rc}`, null, tok)).j;
    ok((await req('PUT', `/registros/pv_reclamos/${rc}`, { ...remoto, estado: 'cerrado' }, tok)).s === 200, 'otro equipo cierra el reclamo antiguo');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('focus'));
    ok(await hasta(async () => (await call('pvObtener', rc)).estado === 'cerrado'), 'al volver a la ventana, la app lo ve cerrado');

    // 4) la respuesta automática queda a cargo de este equipo
    const cfg = await call('pvConfigurar', { auto: true });
    ok(cfg.auto && cfg.enEsteEquipo, 'al activar la respuesta automática, queda a cargo de este equipo');
    ok(await hasta(async () => { const x = await reg('pv_config', 'config'); return x?.datos.auto && x.datos.revisaUsuarioId === admin.id && x.datos.revisaEquipo; }), 'en la base queda quién la hace (usuario y equipo)');
    ok(!errs.length, 'sin errores en la pantalla' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('\nOK postventa-api');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await dormir(1500);
    await app?.close().catch(() => {});
    try {
      if (admin) {
        await db.registro.deleteMany({ where: { corredoraId: admin.corredoraId, coleccion: { startsWith: 'pv_' }, id: { in: ids } } });
        if (folioAntes == null) await db.contador.deleteMany({ where: { corredoraId: admin.corredoraId, serie: 'PV' } });
        else await db.contador.update({ where: { corredoraId_serie: { corredoraId: admin.corredoraId, serie: 'PV' } }, data: { valor: folioAntes } });
        await db.sesion.deleteMany({ where: { usuarioId: admin.id, creadoEn: { gte: inicio } } });
      }
    } catch (e) { console.error('No se pudo deshacer todo:', e.message); process.exitCode = 1; }
    await db.$disconnect();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
