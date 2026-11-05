// Plazos, expedientes, configuración y autorizaciones contra la API real de Asset (SIN PF_MOCK).
// Revisa: lo que este equipo tenía (plazos con su PDF, un expediente en una carpeta local, la configuración y las
// autorizaciones de importación) se sube solo al iniciar sesión; los plazos y expedientes son de cada usuario y sus
// archivos van a R2 (y se bajan cuando la copia local no está); la configuración de la corredora es compartida y el
// corredor de los documentos sale de la cuenta (más lo que el usuario complete, como el RUT). Al final borra lo creado.
// Requiere la API corriendo. Uso: node test/registros-api-e2e.js [url-de-la-api]
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
const PDF = Buffer.from('%PDF-1.4\n% E2E plazos\n%%EOF\n');

(async () => {
  const salud = await fetch(API + '/salud').then((r) => r.json()).catch(() => null);
  if (!salud?.db) { console.error(`La API no responde en ${API}. Levántala con start-dev.ps1.`); process.exit(1); }
  const db = new PrismaClient();
  const inicio = new Date();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-reg-'));
  let admin = null; let app = null; let cfgAntes = null; const creados = []; let perfilAntes = null;
  try {
    admin = await db.usuario.findUnique({ where: { email: String(env.SEMBRAR_ADMIN_EMAIL).toLowerCase() } });
    const C = admin.corredoraId;
    const reg = (c, id) => db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId: C, coleccion: c, id } } });
    cfgAntes = await reg('corredora_config', 'corredora'); perfilAntes = await reg('perfil', 'perfil-' + admin.id);

    // lo que este equipo tenía: un plazo con su PDF, un expediente en una carpeta local, configuración y autorizaciones
    const ud = path.join(tmp, 'ud'); const inmoDir = path.join(tmp, 'inmo'); const expDir = path.join(tmp, 'exp');
    fs.mkdirSync(path.join(ud, 'plazos'), { recursive: true }); fs.mkdirSync(path.join(inmoDir, 'leads'), { recursive: true });
    const pz = `pe2e${SUF}`; const ex = `ee2e${SUF}`; creados.push(['plazos', pz], ['expedientes', ex]);
    fs.writeFileSync(path.join(ud, 'plazos', pz + '.pdf'), PDF);
    const carpeta = path.join(expDir, `E2E Caso ${SUF}`); fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, 'Cédula.pdf'), PDF); fs.writeFileSync(path.join(carpeta, 'nota.txt'), 'hola');
    fs.writeFileSync(path.join(ud, 'portalfirma.json'), JSON.stringify({
      plazos: [{ id: pz, name: 'Contrato E2E.pdf', file: path.join(ud, 'plazos', pz + '.pdf'), hash: 'h1', added: '2026-10-01T10:00:00.000Z', status: 'done', deadline: '2026-12-31', deadlineLabel: 'Término' }],
      expedientes: [{ id: ex, name: `E2E Caso ${SUF}`, type: 'tramite', storage: 'local', path: carpeta, created: '2026-10-01T10:00:00.000Z', updated: '2026-10-01T10:00:00.000Z', history: [{ at: '2026-10-01T10:00:00.000Z', kind: 'created', text: 'Expediente creado en este computador' }] }],
    }));
    fs.writeFileSync(path.join(inmoDir, 'datos.json'), JSON.stringify({ config: { corredor: { nombre: 'Perfil antiguo' }, estiloDescripcion: `e2e-${SUF}` } }));
    fs.writeFileSync(path.join(inmoDir, 'leads', 'indice.json'), JSON.stringify({ consentimientos: [{ fecha: '2026-10-05T10:00:00.000Z', canal: 'instagram', cuenta: `e2e_${SUF}`, autorizadoPor: 'E2E', conversaciones: 3 }] }));

    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${ud}`], cwd: path.join(__dirname, '..'),
      env: { ...process.env, PF_MOCK: '', PF_MOCK_LOGGED: '', PF_MOCK_ASSET_LOGIN: '', PF_ASSET_API: API, PF_INMO_DIR: inmoDir, PF_EXP_DIR: expDir, PF_AI_MANAGED: 'none', PF_NO_TOURS: '1' } });
    const w = await app.firstWindow(); const errs = [];
    w.on('pageerror', (e) => errs.push(e.message));
    const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
    const inmo = (fn, ...a) => app.evaluate((_e, [f, x]) => global.__inmo[f](...x), [fn, a]);
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    await w.fill('#acEmail', env.SEMBRAR_ADMIN_EMAIL); await w.fill('#acClave', env.SEMBRAR_ADMIN_CLAVE); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached', timeout: 30000 });

    // 1) plazos: subido con su PDF en R2
    const p1 = await hasta(() => reg('plazos', pz));
    ok(p1 && p1.usuarioId === admin.id && p1.datos.deadline === '2026-12-31' && p1.datos.clave?.includes('/r/plazos/'), 'el plazo que estaba solo en este equipo se subió (del usuario, con su PDF en R2)');
    fs.rmSync(path.join(ud, 'plazos', pz + '.pdf'), { force: true }); // como si se abriera en otro equipo
    const bytes = Buffer.from(await w.evaluate((id) => window.pf.plazosBytes(id).then((r) => { if (!r.ok) throw new Error(r.error); return Array.from(r.data); }), pz));
    ok(bytes.equals(PDF), 'si la copia local no está, el PDF se baja de R2');

    // 2) expedientes: la carpeta local pasó a Asset (archivos en R2)
    const e1 = await hasta(() => reg('expedientes', ex));
    ok(e1 && e1.datos.storage === 'asset' && e1.datos.archivos.length === 2 && e1.datos.carpetaOriginal === carpeta, 'el expediente de la carpeta local se subió a Asset (con sus 2 archivos en R2)');
    ok(fs.existsSync(path.join(carpeta, 'Cédula.pdf')), 'y la carpeta original quedó como estaba');
    const f = (await call('expFiles', ex)).find((x) => x.name === 'Cédula.pdf');
    const local = await call('expLocalPath', ex, f.id);
    ok(fs.readFileSync(local).equals(PDF) && local !== path.join(carpeta, 'Cédula.pdf'), 'abrir un archivo lo baja de R2 a una copia');
    const nuevo = await call('expCreate', { name: `E2E Nuevo ${SUF}`, type: 'persona', storage: 'local' }); creados.push(['expedientes', nuevo.id]);
    ok(nuevo.storage === 'asset', 'un expediente nuevo «en este computador» queda en Asset');
    await call('expAddBytes', nuevo.id, 'Poder.pdf', [...PDF], {});
    ok(await hasta(async () => (await reg('expedientes', nuevo.id))?.datos.archivos?.[0]?.name === 'Poder.pdf'), 'agregarle un archivo lo sube a R2 y queda en la base');

    // 3) configuración: la de la corredora a la base; el corredor sale de la cuenta (+ el RUT que complete el usuario)
    ok(await hasta(async () => (await reg('corredora_config', 'corredora'))?.datos.estiloDescripcion === `e2e-${SUF}` || !!cfgAntes), 'la configuración de la corredora se subió (sin el corredor antiguo)');
    let cfg = await inmo('config');
    ok(cfg.corredor.nombre === admin.nombre && cfg.corredor.email === admin.email, 'el corredor de los documentos sale de la cuenta (nombre y correo)');
    await inmo('guardarConfig', { corredor: { ...cfg.corredor, rut: '12.345.678-5' } });
    ok(await hasta(async () => { const x = await reg('perfil', 'perfil-' + admin.id); return x?.datos.corredor?.rut === '12.345.678-5' && !x.datos.corredor.nombre && x.usuarioId === admin.id; }), 'el RUT que completa queda en su perfil (solo lo que no viene de la cuenta)');
    cfg = await inmo('config');
    ok(cfg.corredor.rut === '12.345.678-5' && cfg.corredor.nombre === admin.nombre, 'y los documentos usan cuenta + perfil');

    // 4) autorizaciones de importación
    ok(await hasta(async () => (await db.registro.findMany({ where: { corredoraId: C, coleccion: 'consentimientos' } })).some((x) => x.datos.cuenta === `e2e_${SUF}`)), 'la autorización de importar mensajes que estaba en el equipo se subió');
    ok((await call('leadsConsentimientos')).some((x) => x.cuenta === `e2e_${SUF}`), 'y la pantalla la muestra desde la base');
    ok(!errs.length, 'sin errores en la pantalla' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('\nOK registros-api');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await dormir(1500);
    await app?.close().catch(() => {});
    try {
      if (admin) {
        const C = admin.corredoraId;
        for (const [c, id] of creados) await db.registro.deleteMany({ where: { corredoraId: C, coleccion: c, id } });
        await db.registro.deleteMany({ where: { corredoraId: C, coleccion: 'consentimientos', datos: { path: ['cuenta'], equals: `e2e_${SUF}` } } });
        if (cfgAntes) await db.registro.update({ where: { corredoraId_coleccion_id: { corredoraId: C, coleccion: 'corredora_config', id: 'corredora' } }, data: { datos: cfgAntes.datos } });
        else await db.registro.deleteMany({ where: { corredoraId: C, coleccion: 'corredora_config', id: 'corredora' } });
        if (perfilAntes) await db.registro.update({ where: { corredoraId_coleccion_id: { corredoraId: C, coleccion: 'perfil', id: 'perfil-' + admin.id } }, data: { datos: perfilAntes.datos } });
        else await db.registro.deleteMany({ where: { corredoraId: C, coleccion: 'perfil', id: 'perfil-' + admin.id } });
        await db.sesion.deleteMany({ where: { usuarioId: admin.id, creadoEn: { gte: inicio } } });
        // los archivos de prueba en R2
        const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require(path.join(API_DIR, 'node_modules', '@aws-sdk/client-s3'));
        const s3 = new S3Client({ region: 'auto', endpoint: env.R2_ENDPOINT, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
        for (const [c, id] of creados) {
          const l = await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: `c/${C}/r/${c}/${admin.id}/${id}/` }));
          if (l.Contents?.length) await s3.send(new DeleteObjectsCommand({ Bucket: env.R2_BUCKET, Delete: { Objects: l.Contents.map((x) => ({ Key: x.Key })), Quiet: true } }));
        }
      }
    } catch (e) { console.error('No se pudo deshacer todo:', e.message); process.exitCode = 1; }
    await db.$disconnect();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
