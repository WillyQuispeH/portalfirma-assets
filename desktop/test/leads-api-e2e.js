// Leads contra la API real de Asset (SIN PF_MOCK): la app entra con el administrador de api/.env (SEMBRAR_ADMIN_*).
// Revisa: los leads del índice local de antes se suben solos al iniciar sesión (con su conversación y la foto que vino
// en el chat, que va a R2); uno que ya existía en la base (mismo teléfono) se junta con ese; cambiar el estado desde la
// app llega a la base; los mensajes que recibió otro equipo aparecen al abrir el lead; y si otro equipo creó el mismo
// cliente justo antes, la app no lo duplica (DUPLICADO → se juntan). Al final borra lo que creó (base y R2).
// Requiere la API corriendo. Uso: node test/leads-api-e2e.js [url-de-la-api]
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os'); const crypto = require('crypto');
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
const tel = () => '+569' + String(10000000 + Math.floor(Math.random() * 89999999));
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const leadBase = (id, nombre, telefono) => ({ id, nombre, chatCon: nombre, telefono, email: '', rut: '', origen: 'chat', broker: '', estado: 'nuevo', busqueda: {}, resumen: '', propiedades: [], links: [], proximaAccion: null, personaId: null, notas: '', creado: '2026-10-10T12:00:00.000Z', actualizado: '2026-10-10T12:00:00.000Z', mensajes: 2, ultimo: { fecha: '2026-10-10T09:01:00', de: 'cliente', texto: '📷 Foto' }, noLeidos: 0, importaciones: [] });

(async () => {
  const salud = await fetch(API + '/salud').then((r) => r.json()).catch(() => null);
  if (!salud?.db) { console.error(`La API no responde en ${API}. Levántala con start-dev.ps1.`); process.exit(1); }
  const db = new PrismaClient();
  const inicio = new Date();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-lead-'));
  const creados = { leads: [] }; let admin = null; let app = null;
  try {
    admin = await db.usuario.findUnique({ where: { email: String(env.SEMBRAR_ADMIN_EMAIL).toLowerCase() } });
    const tok = (await req('POST', '/auth/ingresar', { email: env.SEMBRAR_ADMIN_EMAIL, clave: env.SEMBRAR_ADMIN_CLAVE })).j.tokenAcceso;

    // en la base ya está el lead de un cliente (lo recibió otro equipo)
    const telB = tel(); const enBase = `ldbase${SUF}`; creados.leads.push(enBase);
    ok((await req('PUT', `/leads/${enBase}`, { ...leadBase(enBase, 'E2E Bruno', telB), mensajes: 0, ultimo: null }, tok)).s === 200, 'otro equipo ya tiene en la base el lead de Bruno');

    // el índice local de este equipo, de antes de la API: Ana (con una foto) y Bruno (otro id, mismo teléfono)
    const ldDir = path.join(tmp, 'inmo', 'leads'); fs.mkdirSync(path.join(ldDir, `ldana${SUF}`), { recursive: true });
    const ana = leadBase(`ldana${SUF}`, 'E2E Ana', tel()); const bruno = leadBase(`ldbru${SUF}`, 'E2E Bruno', telB);
    creados.leads.push(ana.id, bruno.id);
    fs.writeFileSync(path.join(ldDir, 'indice.json'), JSON.stringify({ leads: [ana, bruno] }));
    fs.writeFileSync(path.join(ldDir, `${ana.id}`, 'IMG-1.jpg'), JPG);
    fs.writeFileSync(path.join(ldDir, `${ana.id}.json`), JSON.stringify({ mensajes: [
      { fecha: '2026-10-10T09:00:00', autor: 'E2E Ana', texto: 'Hola, ¿sigue disponible?', tipo: 'texto', de: 'cliente', k: 'a1' },
      { fecha: '2026-10-10T09:01:00', autor: 'E2E Ana', texto: '', tipo: 'imagen', archivo: 'IMG-1.jpg', media: 'IMG-1.jpg', de: 'cliente', k: 'a2' }] }));
    fs.writeFileSync(path.join(ldDir, `${bruno.id}.json`), JSON.stringify({ mensajes: [{ fecha: '2026-10-11T10:00:00', autor: 'E2E Bruno', texto: 'Busco casa en La Reina', tipo: 'texto', de: 'cliente', k: 'b1' }] }));

    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'),
      env: { ...process.env, PF_MOCK: '', PF_MOCK_LOGGED: '', PF_MOCK_ASSET_LOGIN: '', PF_ASSET_API: API, PF_INMO_DIR: path.join(tmp, 'inmo'), PF_AI_MANAGED: 'none', PF_NO_TOURS: '1' } });
    const w = await app.firstWindow(); const errs = [];
    w.on('pageerror', (e) => errs.push(e.message));
    const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    await w.fill('#acEmail', env.SEMBRAR_ADMIN_EMAIL); await w.fill('#acClave', env.SEMBRAR_ADMIN_CLAVE); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached', timeout: 30000 });

    // 1) lo local se subió
    const la = await hasta(() => db.lead.findUnique({ where: { id: ana.id }, include: { mensajes: true } }).then((x) => (x?.mensajes.length === 2 && x.mensajes.find((m) => m.k === 'a2')?.mediaUrl ? x : null)));
    ok(la && la.telefonoNorm === ana.telefono.slice(-9), 'el lead de Ana que estaba solo en este equipo se subió a la base');
    const foto = la.mensajes.find((m) => m.k === 'a2');
    ok(foto.mediaUrl.includes(`/l/${ana.id}/`) && (await fetch(foto.mediaUrl)).ok, 'con su conversación, y la foto del chat quedó en R2');
    ok(!(await db.lead.findUnique({ where: { id: bruno.id } })), 'Bruno no se duplicó (ya tenía lead en la base)');
    const mb = await hasta(() => db.leadMensaje.findFirst({ where: { leadId: enBase, k: 'b1' } }));
    ok(mb && mb.texto === 'Busco casa en La Reina', 'y su conversación se juntó con el lead que ya existía');
    const idx = JSON.parse(fs.readFileSync(path.join(ldDir, 'indice.json'), 'utf8'));
    ok(!idx.leads && fs.existsSync(path.join(ldDir, 'indice.respaldo.json')), 'el índice local ya no guarda leads (queda un respaldo)');
    let L = await call('leadsListar', {});
    ok(L.leads.some((x) => x.id === ana.id) && L.leads.some((x) => x.id === enBase) && !L.leads.some((x) => x.id === bruno.id), 'la lista de leads viene de la base');

    // 2) cambiar el estado desde la app
    await call('leadsActualizar', ana.id, { estado: 'contactado', notas: 'Llamar el lunes' });
    ok(await hasta(async () => { const x = await db.lead.findUnique({ where: { id: ana.id } }); return x.estado === 'contactado' && x.datos.notas === 'Llamar el lunes'; }), 'cambiar el estado y las notas llega a la base');

    // 3) un mensaje que recibió otro equipo aparece al abrir el lead
    await req('POST', `/leads/${ana.id}/mensajes`, { items: [{ k: 'a3', fecha: '2026-10-12T08:00:00', de: 'cliente', autor: 'E2E Ana', texto: '¿Puedo visitarla el sábado?', tipo: 'texto' }] }, tok);
    const o = await call('leadsObtener', ana.id);
    ok(o.mensajesLista.some((m) => m.k === 'a3' && /sábado/.test(m.texto)), 'al abrir el lead aparece el mensaje que llegó a otro equipo');
    ok(o.mensajesLista.find((m) => m.k === 'a2')?.url?.startsWith('pffoto://'), 'la foto se muestra desde la copia local (está en este equipo)');

    // 4) un mensaje nuevo en este equipo (WhatsApp) llega a la base
    await app.evaluate((_e, id) => global.__leads.registrarWa(id, { de: 'corredor', texto: 'Claro, el sábado a las 11' }), ana.id);
    ok(await hasta(() => db.leadMensaje.findFirst({ where: { leadId: ana.id, texto: 'Claro, el sábado a las 11' } })), 'un mensaje nuevo de esta app llega a la base');

    // 5) otro equipo creó a Carla justo antes: la app crea su propio lead, la API dice DUPLICADO y se juntan
    const telC = tel(); const enOtro = `ldcarla${SUF}`; creados.leads.push(enOtro);
    await req('PUT', `/leads/${enOtro}`, { ...leadBase(enOtro, 'E2E Carla', telC), mensajes: 0, ultimo: null }, tok);
    const local = await app.evaluate((_e, t) => { const l = global.__leads.crearDesdeWa({ nombre: 'E2E Carla', telefono: t }); global.__leads.registrarWa(l.id, { de: 'cliente', texto: 'Hola, soy Carla' }); return l.id; }, telC);
    creados.leads.push(local);
    ok(local !== enOtro, 'esta app aún no la conocía y le creó un lead propio');
    ok(await hasta(async () => !(await call('leadsListar', {})).leads.some((x) => x.id === local) && (await call('leadsListar', {})).leads.some((x) => x.id === enOtro)), 'la API lo rechazó como duplicado y la app se quedó con el que ya existía');
    ok(await hasta(() => db.leadMensaje.findFirst({ where: { leadId: enOtro, texto: 'Hola, soy Carla' } })), 'con el mensaje de Carla adentro');
    ok(!(await db.lead.findUnique({ where: { id: local } })), 'y en la base no quedó un segundo lead');
    ok(!errs.length, 'sin errores en la pantalla' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('\nOK leads-api');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await dormir(1500);
    await app?.close().catch(() => {});
    try {
      await db.lead.deleteMany({ where: { id: { in: creados.leads } } });
      await db.persona.deleteMany({ where: { corredoraId: admin?.corredoraId, nombre: { startsWith: 'E2E ' }, creadoEn: { gte: inicio } } });
      await db.actividad.deleteMany({ where: { fecha: { gte: inicio }, OR: [{ entidadId: { in: creados.leads } }, { ref2: { in: creados.leads } }] } });
      if (admin) await db.sesion.deleteMany({ where: { usuarioId: admin.id, creadoEn: { gte: inicio } } });
      const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require(path.join(API_DIR, 'node_modules', '@aws-sdk/client-s3'));
      const s3 = new S3Client({ region: 'auto', endpoint: env.R2_ENDPOINT, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
      for (const id of creados.leads) {
        const l = await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: `c/${admin.corredoraId}/l/${id}/` }));
        if (l.Contents?.length) await s3.send(new DeleteObjectsCommand({ Bucket: env.R2_BUCKET, Delete: { Objects: l.Contents.map((x) => ({ Key: x.Key })), Quiet: true } }));
      }
    } catch (e) { console.error('No se pudo deshacer todo:', e.message); process.exitCode = 1; }
    await db.$disconnect();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
