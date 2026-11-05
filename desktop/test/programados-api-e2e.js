// Grupo 1 de lo que quedaba en cada equipo, contra la API real de Asset (SIN PF_MOCK), con el administrador de api/.env:
// WhatsApp programados (los envía el servidor), huellas de la carga masiva, notaría de las escrituras y el nombre de
// quien usa Asset. Si la corredora no tiene clave de wechatia, se le pone una que apunta a un wechatia FALSO que levanta
// la prueba (y se quita al final); si la tiene, no se toca. Nada sale por WhatsApp: lo programado es para mañana.
// Revisa: lo programado solo en este equipo se sube al iniciar sesión (con su plantilla) y sale del equipo; programar
// por el Agente lo deja en el servidor (no en el equipo); el resultado que da el servidor llega a la app, que lo toma
// una sola vez y lo anota en Leads; las huellas de la carga masiva y la notaría de las escrituras se suben y salen del
// equipo; el nombre para Leads viene de la cuenta. Al final deja todo como estaba.
// Requiere la API corriendo. Uso: node test/programados-api-e2e.js [url-de-la-api]   (tarda ~1 min)
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os'); const http = require('http');
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
const TOKEN = 'pit-prueba-' + 'x'.repeat(30);
// «AAAA-MM-DD HH:MM» de este equipo, en n horas
const enHoras = (n) => { const d = new Date(Date.now() + n * 36e5); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

(async () => {
  const salud = await fetch(API + '/salud').then((r) => r.json()).catch(() => null);
  if (!salud?.db) { console.error(`La API no responde en ${API}. Levántala con start-dev.ps1.`); process.exit(1); }
  const db = new PrismaClient();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-wp-'));
  // wechatia falso: acepta la clave de prueba (no se envía nada: los programados de la prueba son para mañana)
  const srv = http.createServer((q, s) => { s.writeHead(q.headers.authorization === 'Bearer ' + TOKEN ? 200 : 401, { 'content-type': 'application/json' }); s.end('{}'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}`;
  const HASH = 'e2e' + SUF.padEnd(37, '0'); const LOCAL = `wpLocal${SUF}`; const TEL = '+56 9 7' + String(Date.now()).slice(-7);
  let admin = null; let app = null; let cfgAntes = null; let claveNuestra = false; let co = null;
  try {
    admin = await db.usuario.findUnique({ where: { email: String(env.SEMBRAR_ADMIN_EMAIL).toLowerCase() } }); co = admin.corredoraId;
    cfgAntes = await db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId: co, coleccion: 'corredora_config', id: 'corredora' } } });
    if (cfgAntes?.datos?.escrNotaria) { const { escrNotaria, ...resto } = cfgAntes.datos; await db.registro.update({ where: { corredoraId_coleccion_id: { corredoraId: co, coleccion: 'corredora_config', id: 'corredora' } }, data: { datos: resto, version: { increment: 1 } } }); }
    const tok = (await req('POST', '/auth/ingresar', { email: env.SEMBRAR_ADMIN_EMAIL, clave: env.SEMBRAR_ADMIN_CLAVE })).j.tokenAcceso;
    if (!(await db.conexion.findFirst({ where: { corredoraId: co, proveedor: 'wechatia' } }))) {
      const r = await req('PUT', '/whatsapp/conexion', { token: TOKEN, locationId: 'loc-e2e', base }, tok); claveNuestra = r.s === 200;
    }

    // lo que este equipo tenía antes (store)
    const inmoDir = path.join(tmp, 'inmo'); fs.mkdirSync(inmoDir, { recursive: true });
    const ud = path.join(tmp, 'ud'); fs.mkdirSync(ud, { recursive: true });
    const storeF = path.join(ud, 'portalfirma.json');
    fs.writeFileSync(storeF, JSON.stringify({
      waProgramados: [
        { id: LOCAL, telefono: TEL, nombre: 'E2E Local', personaId: null, texto: 'Hola, te escribo por la visita', cuando: enHoras(30), estado: 'programado', creado: new Date().toISOString(), pl: { motivo: 'la visita', remitente: 'Ana E2E' } },
        { id: `wpViejo${SUF}`, telefono: TEL, texto: 'ya salió', cuando: enHoras(-30), estado: 'enviado' },
      ],
      bulkSentHashes: [HASH],
      escrNotaria: { notaria: `Notaría E2E ${SUF}`, ciudad: 'Santiago' },
      leadsBroker: 'Nombre Viejo',
    }));

    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${ud}`], cwd: path.join(__dirname, '..'),
      env: { ...process.env, PF_MOCK: '', PF_MOCK_LOGGED: '', PF_MOCK_ASSET_LOGIN: '', PF_ASSET_API: API, PF_INMO_DIR: inmoDir, PF_AI_MANAGED: 'none', PF_NO_TOURS: '1' } });
    const w = await app.firstWindow();
    const call = (fn, ...a) => w.evaluate(([f, x]) => window.pf[f](...x).then((r) => { if (!r.ok) throw new Error(r.error); return r.data; }), [fn, a]);
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    await w.fill('#acEmail', env.SEMBRAR_ADMIN_EMAIL); await w.fill('#acClave', env.SEMBRAR_ADMIN_CLAVE); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached', timeout: 30000 });
    const local = () => JSON.parse(fs.readFileSync(storeF, 'utf8'));
    const prog = (id) => db.waProgramado.findUnique({ where: { corredoraId_id: { corredoraId: co, id } } });

    // 1) lo local, arriba
    const p1 = await hasta(() => prog(LOCAL));
    ok(p1 && p1.estado === 'programado' && p1.usuarioId === admin.id && p1.texto === 'Hola, te escribo por la visita', 'el WhatsApp programado solo en este equipo se subió al servidor');
    ok(p1.plantilla?.id === 'primer_contacto' && p1.plantilla.campos.remitente === 'Ana E2E' && p1.plantilla.campos.motivo === 'la visita', 'con la plantilla que corresponde si no ha escrito en 24 h');
    ok(Math.abs(p1.cuando.getTime() - (Date.now() + 30 * 36e5)) < 2 * 6e4, 'a la hora que se programó');
    ok(!(await prog(`wpViejo${SUF}`)), 'lo que ya había salido no se sube');
    ok(await hasta(() => !(local().waProgramados || []).some((x) => x.estado === 'programado')), 'y en el equipo ya no queda nada por enviar');
    const h = await hasta(() => db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId: co, coleccion: 'envios_masivos', id: HASH } } }));
    ok(h && h.datos.legado === true, 'la huella de la carga masiva se subió (de toda la corredora)');
    ok(await hasta(() => local().bulkSentHashes === undefined), 'y salió del equipo');

    // 2) notaría y nombre
    ok((await call('escrCfg'))?.notaria === `Notaría E2E ${SUF}`, 'la notaría de las escrituras de este equipo se sigue viendo');
    ok(await hasta(async () => (await db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId: co, coleccion: 'corredora_config', id: 'corredora' } } }))?.datos?.escrNotaria?.notaria === `Notaría E2E ${SUF}`), 'y quedó en la configuración de la corredora');
    ok(await hasta(() => local().escrNotaria === undefined), 'el equipo ya no la guarda');
    await call('escrSetCfg', { notaria: `Notaría Dos ${SUF}` });
    ok(await hasta(async () => (await db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId: co, coleccion: 'corredora_config', id: 'corredora' } } }))?.datos?.escrNotaria?.notaria === `Notaría Dos ${SUF}`), 'cambiarla la cambia para toda la corredora');
    ok(await hasta(() => local().leadsBroker === undefined), 'el nombre para Leads ya no se guarda en el equipo (es el de la cuenta)');

    // 3) programar por el Agente: queda en el servidor (es para mañana y se borra al final: no sale nunca, aunque la
    //    corredora tenga su clave real)
    const r = await app.evaluate(async ({}, [tel, cuando]) => { const t = global.__assetTool('asset_enviar_whatsapp'); const a = { telefono: tel, nombre: 'E2E Agente', texto: 'Mañana te confirmo la visita', cuando }; await t.preparar(a); return t.run(a); }, [TEL, enHoras(26)]);
    ok(r.ok && r.programado && /servidor/.test(r.nota), 'el Agente programa un WhatsApp y dice que lo envía el servidor');
    const p2 = await hasta(() => db.waProgramado.findFirst({ where: { corredoraId: co, usuarioId: admin.id, texto: 'Mañana te confirmo la visita' } }));
    ok(p2 && p2.estado === 'programado' && p2.plantilla?.id === 'primer_contacto', 'quedó en el servidor, con su plantilla');
    ok(!(local().waProgramados || []).some((x) => x.texto === 'Mañana te confirmo la visita'), 'y no en el equipo');

    // 4) el servidor lo envió (simulado en la base): la app toma el resultado una vez y lo anota en Leads
    await db.waProgramado.update({ where: { corredoraId_id: { corredoraId: co, id: p2.id } }, data: { estado: 'enviado', enviadoEn: new Date(), resultado: { messageId: `msg${SUF}`, entrega: 'delivered' }, version: { increment: 1 } } });
    process.stdout.write('  … esperando que la app traiga el resultado (cada 30 s)\n');
    const p3 = await hasta(async () => { const x = await prog(p2.id); return x?.avisadoEn ? x : null; }, 45000);
    ok(p3, 'la app tomó el resultado (avisado en el servidor)');
    const l = await hasta(() => app.evaluate(({}, t) => global.__leads.porTelefono(t), TEL));
    ok(l && /E2E Agente/.test(l.nombre || l.chatCon || ''), 'el mensaje quedó en Leads (lead de esa persona)');
 ok(await hasta(() => (local().waPropiosIds || []).includes(`msg${SUF}`)), 'y el mensaje quedó marcado como propio (el asistente no lo toma como escrito a mano)');
  } finally {
    if (app) await app.close().catch(() => {});
    srv.close();
    if (co) {
      await db.waProgramado.deleteMany({ where: { corredoraId: co, OR: [{ id: LOCAL }, { telefono: TEL }] } });
      await db.registro.deleteMany({ where: { corredoraId: co, coleccion: 'envios_masivos', id: HASH } });
      const ls = await db.lead.findMany({ where: { corredoraId: co, telefonoNorm: TEL.replace(/\D/g, '').slice(-9) }, select: { id: true, personaId: true } });
      await db.leadMensaje.deleteMany({ where: { leadId: { in: ls.map((x) => x.id) } } });
      await db.lead.deleteMany({ where: { id: { in: ls.map((x) => x.id) } } });
      const per = ls.map((x) => x.personaId).filter(Boolean);
      if (per.length) { await db.actividad.deleteMany({ where: { corredoraId: co, entidadId: { in: per } } }); await db.persona.deleteMany({ where: { id: { in: per } } }).catch(() => null); }
      if (claveNuestra) await db.conexion.deleteMany({ where: { corredoraId: co, proveedor: 'wechatia' } });
      const k = { corredoraId_coleccion_id: { corredoraId: co, coleccion: 'corredora_config', id: 'corredora' } };
      if (cfgAntes) await db.registro.update({ where: k, data: { datos: cfgAntes.datos, version: { increment: 1 } } }).catch(() => null);
      else await db.registro.deleteMany({ where: { corredoraId: co, coleccion: 'corredora_config', id: 'corredora' } });
    }
    await db.$disconnect();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
