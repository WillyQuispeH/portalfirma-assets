// Reglas notariales de la plataforma contra la API real de Asset (SIN PF_MOCK): la app entra con el administrador de
// api/.env, que debe estar en PLATAFORMA_REVISORES. Revisa: los casos que estaban solo en este equipo se suben al
// iniciar sesión y el archivo se deja de usar; las reglas aprobadas que tenía este equipo (es revisor) pasan a la
// plataforma; un caso nuevo va a la base (tachado); probar una regla usa los casos de la base; activar y desactivar
// cambia la regla de la plataforma. Al final borra lo que creó y deja las reglas como estaban.
// Requiere la API corriendo. Uso: node test/reglas-api-e2e.js [url-de-la-api]
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

const API_DIR = path.join(__dirname, '..', '..', 'api');
const env = Object.fromEntries(fs.readFileSync(path.join(API_DIR, '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1')]));
const API = (process.argv[2] || 'http://localhost:3000') + '/v1';
process.env.DATABASE_URL ||= env.DATABASE_URL;
const { PrismaClient } = require(path.join(API_DIR, 'node_modules', '@prisma/client'));
const SUF = Date.now().toString(36);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 15000) { const fin = Date.now() + ms; let v; while (Date.now() < fin) { v = await fn(); if (v) return v; await dormir(300); } return v; }

(async () => {
  const salud = await fetch(API + '/salud').then((r) => r.json()).catch(() => null);
  if (!salud?.db) { console.error(`La API no responde en ${API}. Levántala con start-dev.ps1.`); process.exit(1); }
  const db = new PrismaClient();
  const inicio = new Date();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-rg-'));
  let admin = null; let app = null; let docAntes = null;
  const REGLA = `r${SUF}`;
  try {
    admin = await db.usuario.findUnique({ where: { email: String(env.SEMBRAR_ADMIN_EMAIL).toLowerCase() } });
    docAntes = await db.plataformaDocumento.findUnique({ where: { clave: 'reglas_notariales' } });
    const ud = path.join(tmp, 'ud'); fs.mkdirSync(path.join(ud, 'reglas'), { recursive: true });
    const inmoDir = path.join(tmp, 'inmo'); fs.mkdirSync(inmoDir, { recursive: true });
    fs.writeFileSync(path.join(ud, 'reglas', 'casos.json'), JSON.stringify([{ id: `c${SUF}a`, clave: `e2e-${SUF}-1`, creado: '2026-10-01T10:00:00.000Z', tramite: 'escritura', titulo: 'Compraventa y mutuo hipotecario', materiaAuto: 'compraventa', materiaFinal: 'mutuo', descartados: [], agregados: [{ codigo: null, nombre: 'Hipoteca', frase: 'constituye hipoteca' }], texto: 'el deudor constituye hipoteca a favor del banco' }]));
    fs.writeFileSync(path.join(ud, 'portalfirma.json'), JSON.stringify({ reglasNotariales: { version: '2026-10-01-local', actos: [{ id: REGLA, activo: true, nombre: 'Hipoteca', codigo: null, patron: 'constituye\\s+hipoteca', explicacion: 'E2E' }], materias: [], excepciones: [], propuestas: [] } }));

    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${ud}`], cwd: path.join(__dirname, '..'),
      env: { ...process.env, PF_MOCK: '', PF_MOCK_LOGGED: '', PF_MOCK_ASSET_LOGIN: '', PF_ASSET_API: API, PF_INMO_DIR: inmoDir, PF_AI_MANAGED: 'none', PF_NO_TOURS: '1' } });
    const w = await app.firstWindow(); const errs = [];
    w.on('pageerror', (e) => errs.push(e.message));
    const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    await w.fill('#acEmail', env.SEMBRAR_ADMIN_EMAIL); await w.fill('#acClave', env.SEMBRAR_ADMIN_CLAVE); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached', timeout: 30000 });

    // 1) lo local se subió
    const c1 = await hasta(() => db.reglaCaso.findFirst({ where: { corredoraId: admin.corredoraId, clave: `e2e-${SUF}-1` } }));
    ok(c1 && c1.datos.materiaFinal === 'mutuo', 'el caso que estaba solo en este equipo se subió a la plataforma');
    ok(await hasta(() => !fs.existsSync(path.join(ud, 'reglas', 'casos.json'))), 'y el archivo local se dejó de usar');
    ok(await hasta(async () => (await db.plataformaDocumento.findUnique({ where: { clave: 'reglas_notariales' } }))?.datos?.actos?.some((x) => x.id === REGLA)), 'la regla aprobada en este equipo pasó a la plataforma (quien entra es revisor)');
    ok((await call('reglasPermisos')).revisor === true, 'la app sabe que es revisor');

    // 2) caso nuevo, tachado
    await call('reglasCaso', { clave: `e2e-${SUF}-2`, tramite: 'escritura', titulo: 'Poder de 12.345.678-5', materiaAuto: 'poder', materiaFinal: 'mandato', descartados: [], agregados: [], texto: 'comparece don Juan, RUT 12.345.678-5, correo juan@correo.cl' });
    const c2 = await hasta(() => db.reglaCaso.findFirst({ where: { corredoraId: admin.corredoraId, clave: `e2e-${SUF}-2` } }));
    ok(c2 && !JSON.stringify(c2.datos).includes('12.345.678') && !JSON.stringify(c2.datos).includes('juan@correo.cl') && c2.datos.texto.includes('[RUT]'), 'un caso nuevo llega a la base con los datos personales tachados');
    const lista = await call('reglasCasos');
    ok(lista.some((x) => x.clave === `e2e-${SUF}-1`) && lista.some((x) => x.clave === `e2e-${SUF}-2`), 'la pantalla lista los casos desde la base');

    // 3) probar, desactivar y leer
    const pr = await call('reglasProbar', { tipo: 'acto', nombre: 'Hipoteca', patron: 'constituye\\s+hipoteca' });
    ok(pr.positivos >= 1 && pr.aciertos.length >= 1, 'probar una regla la compara con los casos de la base');
    await call('reglasActivar', { id: REGLA, activo: false });
    ok(await hasta(async () => (await db.plataformaDocumento.findUnique({ where: { clave: 'reglas_notariales' } }))?.datos?.actos?.find((x) => x.id === REGLA)?.activo === false), 'desactivarla la cambia en la plataforma');
    ok((await call('reglasGet')).actos.some((x) => x.id === REGLA && x.activo === false), 'y la app la lee así');
    ok(!errs.length, 'sin errores en la pantalla' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('\nOK reglas-api');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await dormir(1500);
    await app?.close().catch(() => {});
    try {
      await db.reglaCaso.deleteMany({ where: { clave: { startsWith: `e2e-${SUF}` } } });
      if (docAntes) await db.plataformaDocumento.update({ where: { clave: 'reglas_notariales' }, data: { datos: docAntes.datos, version: { increment: 1 } } });
      else await db.plataformaDocumento.deleteMany({ where: { clave: 'reglas_notariales' } });
      if (admin) await db.sesion.deleteMany({ where: { usuarioId: admin.id, creadoEn: { gte: inicio } } });
    } catch (e) { console.error('No se pudo deshacer todo:', e.message); process.exitCode = 1; }
    await db.$disconnect();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
