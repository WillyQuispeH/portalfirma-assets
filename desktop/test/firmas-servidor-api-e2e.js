// La app con Portalfirma A TRAVÉS DE LA API (sin sesión de Portalfirma en el equipo) y la revisión de firmas en el
// servidor, contra la API real de Asset (SIN PF_MOCK), con el administrador de api/.env.
// Revisa: la conexión con Portalfirma es la de la corredora
// en el servidor (si la corredora la tiene, «restaurar» trae la cuenta pasando por la API); «revisar ahora» se lo pide
// al servidor; un aviso de firmas del servidor llega a la app y se toma una sola vez; el de la firma de la etapa actual
// de un negocio lo hace avanzar a la siguiente etapa (en la base). Al final borra lo que creó.
// Requiere la API corriendo. Uso: node test/firmas-servidor-api-e2e.js [url-de-la-api]
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };

const API_DIR = path.join(__dirname, '..', '..', 'api');
const env = Object.fromEntries(fs.readFileSync(path.join(API_DIR, '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1')]));
const API = (process.argv[2] || 'http://localhost:3000') + '/v1';
process.env.DATABASE_URL ||= env.DATABASE_URL;
const { PrismaClient } = require(path.join(API_DIR, 'node_modules', '@prisma/client'));
const SUF = Date.now().toString(36);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 15000) { const fin = Date.now() + ms; let v; while (Date.now() < fin) { v = await fn(); if (v) return v; await dormir(400); } return v; }
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(API + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {} return { s: r.status, j };
};

(async () => {
  const salud = await fetch(API + '/salud').then((r) => r.json()).catch(() => null);
  if (!salud?.db) { console.error(`La API no responde en ${API}. Levántala con start-dev.ps1.`); process.exit(1); }
  const db = new PrismaClient();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-fs-'));
  const NEG = `n${SUF}fs`; let admin = null; let app = null;
  try {
    admin = await db.usuario.findUnique({ where: { email: String(env.SEMBRAR_ADMIN_EMAIL).toLowerCase() } }); const co = admin.corredoraId;
    const tok = (await req('POST', '/auth/ingresar', { email: env.SEMBRAR_ADMIN_EMAIL, clave: env.SEMBRAR_ADMIN_CLAVE })).j.tokenAcceso;
    const pfCorredora = await db.conexion.findFirst({ where: { corredoraId: co, proveedor: 'portalfirma', dueno: 'corredora', estado: 'activa' } });
    // un negocio en «promesa» cuya firma el servidor ya vio firmada (con «avanzar»)
    let r = await req('PUT', `/negocios/${NEG}`, { tipo: 'venta', etapa: 'promesa', estado: 'abierto', corredorId: admin.id, firmas: { promesa: { operacion: 912345678, estado: 'firmado', firmado: new Date().toISOString(), avanzar: true } } }, tok);
    if (r.s !== 200) throw new Error('no se creó el negocio: ' + JSON.stringify(r.j));

    const inmoDir = path.join(tmp, 'inmo'); fs.mkdirSync(inmoDir, { recursive: true });
    const ud = path.join(tmp, 'ud'); fs.mkdirSync(ud, { recursive: true });
    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${ud}`], cwd: path.join(__dirname, '..'),
      env: { ...process.env, PF_MOCK: '', PF_MOCK_LOGGED: '', PF_MOCK_ASSET_LOGIN: '', PF_ASSET_API: API, PF_INMO_DIR: inmoDir, PF_AI_MANAGED: 'none', PF_NO_TOURS: '1' } });
    const w = await app.firstWindow();
    const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => r), [fn, a]);
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    await w.fill('#acEmail', env.SEMBRAR_ADMIN_EMAIL); await w.fill('#acClave', env.SEMBRAR_ADMIN_CLAVE); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached', timeout: 30000 });

    // 1) Portalfirma por la API
    const rs = await call('restore');
    if (pfCorredora) ok(rs.ok && rs.data?.partner, 'la corredora tiene Portalfirma en el servidor: «restaurar» trae la cuenta pasando por la API');
    else ok(rs.ok && rs.data == null, 'la corredora no tiene Portalfirma en el servidor: la app queda sin conexión (la pide al usar la firma)');
    const ronda = await call('firRonda');
    ok(ronda.ok && Array.isArray(ronda.data) || (!pfCorredora && /NEEDS_LOGIN|Portalfirma/.test(ronda.error || '')), '«revisar ahora» se lo pide al servidor');

    // 2) avisos del servidor
    const av = await db.aviso.create({ data: { corredoraId: co, usuarioId: admin.id, tipo: 'firma_negocio', texto: `E2E ${SUF}: se firmó el documento de la etapa «promesa».`, datos: { negocioId: NEG, etapa: 'promesa', operacion: 912345678, avanzar: true } } });
    const av2 = await db.aviso.create({ data: { corredoraId: co, usuarioId: admin.id, tipo: 'firmas', texto: `Ana firmó «Doc E2E ${SUF}» (operación 912345679)` } });
    ok(await hasta(async () => (await db.aviso.findUnique({ where: { id: av.id } })).tomadoEn && (await db.aviso.findUnique({ where: { id: av2.id } })).tomadoEn, 40000), 'la app toma los avisos del servidor (a lo más en 30 s)');
    const n = await hasta(async () => { const x = await db.negocio.findUnique({ where: { id: NEG } }); return x.etapa === 'escritura' ? x : null; }, 20000);
    ok(n && !n.datos.firmas.promesa.avanzar && n.datos.firmas.promesa.estado === 'firmado', 'el negocio avanzó solo a «escritura» y la marca «avanzar» se quitó');
  } finally {
    if (app) await app.close().catch(() => {});
    if (admin) {
      await db.aviso.deleteMany({ where: { usuarioId: admin.id, texto: { contains: SUF } } });
      await db.actividad.deleteMany({ where: { corredoraId: admin.corredoraId, OR: [{ entidadId: NEG }, { ref2: NEG }] } });
      await db.negocio.deleteMany({ where: { id: NEG } });
    }
    await db.$disconnect();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
