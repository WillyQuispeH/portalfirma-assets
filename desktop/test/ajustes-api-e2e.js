// Ajustes y datos de la corredora que antes vivían en cada equipo, contra la API real de Asset (SIN PF_MOCK): recetas de
// flujos documentales, enlaces de firma enviados a cada persona, correo pagador de las recargas y plantillas de
// WhatsApp activas. La app entra con el administrador de api/.env.
// Revisa: lo que el equipo tenía se sube solo al iniciar sesión y se borra del equipo; guardar y borrar una receta va a
// la base; un enlace de firma nuevo va a la base; el correo pagador y las plantillas quedan en la configuración de la
// corredora; una receta creada en otro equipo llega al volver a la ventana. Al final deja todo como estaba.
// Requiere la API corriendo. Uso: node test/ajustes-api-e2e.js [url-de-la-api]
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-aj-'));
  const REC = `r-e2e-${SUF}`; const REC2 = `r-e2e2-${SUF}`; const REC3 = `r-e2e3-${SUF}`; const PER = `per-e2e-${SUF}`; const PER2 = `per-e2e2-${SUF}`;
  let admin = null; let app = null; let cfgAntes = null;
  try {
    admin = await db.usuario.findUnique({ where: { email: String(env.SEMBRAR_ADMIN_EMAIL).toLowerCase() } });
    const co = admin.corredoraId;
    cfgAntes = await db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId: co, coleccion: 'corredora_config', id: 'corredora' } } });
    // sin correo pagador ni plantillas en la base, para ver que se suben los de este equipo
    if (cfgAntes) { const { payerEmail, waPlantillas, ...resto } = cfgAntes.datos || {}; await db.registro.update({ where: { corredoraId_coleccion_id: { corredoraId: co, coleccion: 'corredora_config', id: 'corredora' } }, data: { datos: resto, version: { increment: 1 } } }); }
    const tok = (await req('POST', '/auth/ingresar', { email: env.SEMBRAR_ADMIN_EMAIL, clave: env.SEMBRAR_ADMIN_CLAVE })).j.tokenAcceso;

    // lo que este equipo tenía antes de la API (store)
    const inmoDir = path.join(tmp, 'inmo'); fs.mkdirSync(inmoDir, { recursive: true });
    const ud = path.join(tmp, 'ud'); fs.mkdirSync(ud, { recursive: true });
    const storeF = path.join(ud, 'portalfirma.json');
    fs.writeFileSync(storeF, JSON.stringify({
      flujos: [{ id: REC, name: 'E2E Contratos de trabajo', modelId: 'tpl-x', mapping: { nombre: 'A' }, opts: {}, created: '2026-10-01T10:00:00.000Z', updated: '2026-10-01T10:00:00.000Z' }],
      enlacesFirma: { [PER]: { documento: 'Contrato E2E', enlace: 'https://firma.example/abc', fecha: '2026-11-01T10:00:00.000Z' } },
      payerEmail: `pagos-${SUF}@prueba.cl`,
      waPlantillas: { seguimiento_lead: true },
    }));

    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${ud}`], cwd: path.join(__dirname, '..'),
      env: { ...process.env, PF_MOCK: '', PF_MOCK_LOGGED: '', PF_MOCK_ASSET_LOGIN: '', PF_ASSET_API: API, PF_INMO_DIR: inmoDir, PF_AI_MANAGED: 'none', PF_NO_TOURS: '1' } });
    const w = await app.firstWindow(); const errs = [];
    w.on('pageerror', (e) => errs.push(e.message));
    const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    await w.fill('#acEmail', env.SEMBRAR_ADMIN_EMAIL); await w.fill('#acClave', env.SEMBRAR_ADMIN_CLAVE); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached', timeout: 30000 });
    const reg = (c, id) => db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId: co, coleccion: c, id } } });
    const local = () => JSON.parse(fs.readFileSync(storeF, 'utf8'));

    // 1) lo local se subió y salió del equipo
    const r1 = await hasta(() => reg('flujos', REC));
    ok(r1 && r1.datos.name === 'E2E Contratos de trabajo' && r1.datos.mapping.nombre === 'A', 'la receta que estaba solo en este equipo se subió a la base');
    const e1 = await hasta(() => reg('enlaces_firma', PER));
    ok(e1 && e1.datos.enlace === 'https://firma.example/abc', 'el enlace de firma enviado a una persona también');
    ok(await hasta(() => !local().flujos && !local().enlacesFirma), 'y ya no quedan en el equipo');
    ok((await call('flujosRecipes')).some((x) => x.id === REC && x.name === 'E2E Contratos de trabajo'), 'la pantalla de Flujos ve la receta desde la base');

    // 2) correo pagador y plantillas: a la configuración de la corredora
    ok((await call('prefs')).payerEmail === `pagos-${SUF}@prueba.cl`, 'el correo pagador de este equipo se sigue viendo');
    ok(await hasta(async () => (await reg('corredora_config', 'corredora'))?.datos?.payerEmail === `pagos-${SUF}@prueba.cl`), 'y quedó en la configuración de la corredora');
    await call('setPrefs', { payerEmail: `pagos2-${SUF}@prueba.cl` });
    ok(await hasta(async () => (await reg('corredora_config', 'corredora'))?.datos?.payerEmail === `pagos2-${SUF}@prueba.cl`), 'cambiarlo lo cambia para toda la corredora');
    ok(await hasta(() => local().payerEmail === undefined), 'el equipo ya no lo guarda');
    const pl = await app.evaluate(() => global.__inmo.ajusteCorredora('waPlantillas'));
    ok(pl?.seguimiento_lead === true && await hasta(async () => (await reg('corredora_config', 'corredora'))?.datos?.waPlantillas?.seguimiento_lead === true), 'las plantillas de WhatsApp activas también');

    // 3) guardar y borrar recetas; un enlace nuevo
    await call('flujosSaveRecipe', { id: REC2, name: 'E2E Anexo', modelId: 'tpl-y', mapping: {} });
    ok(await hasta(async () => (await reg('flujos', REC2))?.datos?.name === 'E2E Anexo'), 'una receta nueva va a la base');
    await call('flujosDeleteRecipe', REC2);
    ok(await hasta(async () => !!(await reg('flujos', REC2))?.eliminadoEn), 'borrarla la borra en la base');
    await app.evaluate((_e, id) => global.__inmo.guardarEnlaceFirma(id, { documento: 'Promesa E2E', enlace: 'https://firma.example/xyz', fecha: new Date().toISOString() }), PER2);
    ok(await hasta(async () => (await reg('enlaces_firma', PER2))?.datos?.enlace === 'https://firma.example/xyz'), 'un enlace de firma nuevo va a la base');
    ok((await app.evaluate((_e, id) => global.__inmo.enlaceFirma(id), PER2))?.documento === 'Promesa E2E', 'y el asistente lo lee de ahí');

    // 4) otro equipo crea una receta: llega al volver a la ventana
    ok((await req('PUT', `/registros/flujos/${REC3}`, { name: 'E2E Desde otro equipo', modelId: 'tpl-z', mapping: {}, opts: {}, updated: new Date().toISOString() }, tok)).s === 200, 'otro equipo crea una receta');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('focus'));
    ok(await hasta(async () => (await call('flujosRecipes')).some((x) => x.id === REC3)), 'al volver a la ventana, aparece en Flujos');
    ok(!errs.length, 'sin errores en la pantalla' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('\nOK ajustes-api');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await dormir(1500);
    await app?.close().catch(() => {});
    try {
      if (admin) {
        const co = admin.corredoraId;
        await db.registro.deleteMany({ where: { corredoraId: co, OR: [{ coleccion: 'flujos', id: { in: [REC, REC2, REC3] } }, { coleccion: 'enlaces_firma', id: { in: [PER, PER2] } }] } });
        const k = { corredoraId_coleccion_id: { corredoraId: co, coleccion: 'corredora_config', id: 'corredora' } };
        if (cfgAntes) await db.registro.update({ where: k, data: { datos: cfgAntes.datos, version: { increment: 1 } } });
        else await db.registro.deleteMany({ where: { corredoraId: co, coleccion: 'corredora_config', id: 'corredora' } });
        await db.sesion.deleteMany({ where: { usuarioId: admin.id, creadoEn: { gte: inicio } } });
      }
    } catch (e) { console.error('No se pudo deshacer todo:', e.message); process.exitCode = 1; }
    await db.$disconnect();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
