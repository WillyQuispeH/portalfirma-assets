// Instagram en vivo, de punta a punta (Chromium de Electron + Playwright, API real, wechatia e IA FALSOS):
// una corredora de prueba conecta wechatia y Leads queda activo solo (sin tarjeta que activar); un interesado escribe
// por Instagram («vi el depa en su historia…») y aparece como lead con su historial, perfil de la IA y corredor a cargo;
// el interesado vuelve a escribir y se agrega solo el mensaje nuevo; Asset nunca le responde por Instagram.
// Crea su propia corredora (con administrador y un corredor) y al final la borra con todo lo suyo: no toca datos reales.
// Requiere la API corriendo (yarn dev / start-dev.ps1). Uso: node test/instagram-vivo-e2e.js [url-de-la-api]  (~1 min)
const { _electron: electron } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os'); const http = require('http');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const API_DIR = path.join(__dirname, '..', '..', 'api');
const env = Object.fromEntries(fs.readFileSync(path.join(API_DIR, '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1')]));
const API = (process.argv[2] || 'http://localhost:3000') + '/v1';
process.env.DATABASE_URL ||= env.DATABASE_URL;
const { PrismaClient } = require(path.join(API_DIR, 'node_modules', '@prisma/client'));
const argon2 = require(path.join(API_DIR, 'node_modules', 'argon2'));
const SUF = Date.now().toString(36); const CLAVE = 'clave-e2e-123';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 40000) { const fin = Date.now() + ms; let v; while (Date.now() < fin) { v = await fn(); if (v) return v; await dormir(500); } return v; }
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(API + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {} return { s: r.status, j };
};
const TOKEN = 'pit-ig-' + 'x'.repeat(30);

// ---------------------------------------------------------------- wechatia falso (una conversación de Instagram)
const W = { convs: [], enviados: [], n: 0 };
const iso = (min) => new Date(Date.now() - min * 60000).toISOString();
function dm(c, direction, body, min = 0, extra = {}) { const m = { id: 'm' + (++W.n), direction, body, attachments: [], dateAdded: iso(min), messageType: 'TYPE_INSTAGRAM', ...extra }; c.mensajes.push(m); c.lastMessageDate = Date.now() + W.n; return m; }
function wechatiaFalso() {
  const s = http.createServer((rq, rs) => {
    let b = ''; rq.on('data', (x) => (b += x)); rq.on('end', () => {
      const u = new URL(rq.url, 'http://x'); const p = u.pathname; const out = (code, j) => { rs.writeHead(code, { 'content-type': 'application/json' }); rs.end(JSON.stringify(j)); };
      if (rq.headers.authorization !== 'Bearer ' + TOKEN) return out(401, { message: 'no' });
      if (rq.method !== 'GET' && !/^\/(contacts|locations)/.test(p)) W.enviados.push({ p, b }); // cualquier envío queda anotado
      if (p === '/conversations/search') return out(200, { conversations: [...W.convs].sort((a, c) => c.lastMessageDate - a.lastMessageDate).map(({ mensajes, ...c }) => c).slice(0, Number(u.searchParams.get('limit') || 50)) });
      const mc = p.match(/^\/conversations\/([^/]+)\/messages$/);
      if (mc) { const c = W.convs.find((x) => x.id === mc[1]); return out(200, { messages: { messages: c ? [...c.mensajes].reverse() : [] } }); }
      if (/^\/locations\/[^/]+\/customFields$/.test(p)) return out(200, { customFields: [] });
      out(404, { message: 'ruta falsa: ' + p });
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}
// ---------------------------------------------------------------- IA falsa (API de mensajes de Anthropic)
function iaFalsa() {
  const s = http.createServer((rq, rs) => {
    let b = ''; rq.on('data', (x) => (b += x)); rq.on('end', () => {
      const body = JSON.parse(b || '{}'); const ult = body.messages?.at(-1); const t = typeof ult?.content === 'string' ? ult.content : (ult?.content || []).map((x) => x.text || '').join('\n');
      const texto = /EXTRAER_LEAD/.test(t)
        ? JSON.stringify({ resumen: 'Busca arrendar un depto de 2 dormitorios en Providencia', busqueda: { operacion: 'arriendo', tipo: 'departamento', comunas: ['Providencia'], presupuesto: { valor: 800000, moneda: 'CLP' }, dormitorios: 2 }, email: null, rut: null, telefono: '+56965432100', perfil: 'Busca para su familia; urgente, lo necesita este mes.', estadoSugerido: 'contactado', proximaAccion: { texto: 'Enviarle opciones en Providencia', fecha: null } })
        : JSON.stringify({ resumen: 'Resumen de prueba' });
      rs.writeHead(200, { 'content-type': 'application/json' });
      rs.end(JSON.stringify({ id: 'msg_ig', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: texto }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20 } }));
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

(async () => {
  const salud = await fetch(API + '/salud').then((r) => r.json()).catch(() => null);
  if (!salud?.db) { console.error(`La API no responde en ${API}. Levántala con start-dev.ps1.`); process.exit(1); }
  const db = new PrismaClient(); const srv = await wechatiaFalso(); const ia = await iaFalsa();
  const base = `http://127.0.0.1:${srv.address().port}`; const iaBase = `http://127.0.0.1:${ia.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-ig-')); const usuarios = []; let co = null; let app = null;
  const shot = (w, n) => w.screenshot({ path: path.resolve(__dirname, n) });
  try {
    // ---- la corredora de prueba, su administrador y un corredor (el «propietario» del contacto en wechatia)
    const hash = await argon2.hash(CLAVE, { type: argon2.argon2id });
    co = await db.corredora.create({ data: { nombre: `E2E Instagram ${SUF}` } });
    const nu = async (n, rol, extra = {}) => { const x = await db.usuario.create({ data: { corredoraId: co.id, email: `e2e-ig${n}-${SUF}@prueba.cl`, nombre: n === 'a' ? 'Admin Instagram' : 'Corredor Instagram', hashClave: hash, ...(rol ? { rol } : {}), ...extra } }); usuarios.push(x.id); return x; };
    const adm = await nu('a', 'ADMIN'); const cor = await nu('b', null, { wechatiaId: 'wu-ig' });
    const tA = (await req('POST', '/auth/ingresar', { email: adm.email, clave: CLAVE })).j?.tokenAcceso;
    ok(tA, 'ingresa el administrador de la corredora de prueba');

    // ---- 1) un interesado ya escribió por Instagram ANTES de conectar wechatia
    const cv = { id: 'cv-ig-1', contactId: 'k-ig-1', phone: null, fullName: 'Valentina Paz', type: 'TYPE_INSTAGRAM', lastMessageType: 'TYPE_INSTAGRAM', instagramUsername: 'vale.paz', assignedTo: 'wu-ig', lastMessageDate: Date.now(), mensajes: [] };
    W.convs.push(cv);
    dm(cv, 'inbound', 'Hola! vi el depa de Providencia en su historia, busco arrendar para mi familia, 2 dormitorios, hasta 800 lucas', 50);
    dm(cv, 'outbound', 'Hola Valentina! Sí está disponible. ¿Me dejas tu celular?', 45, { userId: 'wu-ig', source: 'app' });
    dm(cv, 'inbound', 'Claro, +56 9 6543 2100', 40);

    // ---- 2) conectar wechatia: Leads en vivo queda activo SOLO (sin tarjeta, sin autorización aparte)
    let r = await req('PUT', '/whatsapp/conexion', { token: TOKEN, locationId: 'loc-ig', base }, tA);
    ok(r.s === 200 && r.j.conectado, 'el administrador conecta wechatia (de prueba)');
    const cx = await db.conexion.findFirst({ where: { corredoraId: co.id, proveedor: 'wechatia' } });
    await db.conexion.update({ where: { id: cx.id }, data: { datos: { ...cx.datos, iaBase } } });
    r = await req('GET', '/whatsapp/observador', null, tA);
    ok(r.j.activo === true && r.j.canales.instagram === true && r.j.diasInicio === 365, 'al conectar, Leads en vivo queda activo con Instagram y todo el historial');
    ok(await db.registro.findFirst({ where: { corredoraId: co.id, coleccion: 'consentimientos' } }), 'y la autorización de la corredora quedó registrada');
    const lead = await hasta(() => db.lead.findFirst({ where: { corredoraId: co.id, origen: 'instagram' }, include: { mensajes: true } }), 90000);
    ok(lead && lead.datos.ig?.usuario === 'vale.paz' && lead.convIds.includes(cv.id), 'sin tocar nada, el chat de Instagram ya es un lead (@vale.paz)');
    const lead2 = await hasta(async () => { const x = await db.lead.findUnique({ where: { id: lead.id }, include: { mensajes: true } }); return x.datos.resumen && x.corredorId && x.mensajes.length >= 3 ? x : null; });
    ok(lead2 && lead2.corredorId === cor.id, 'el corredor a cargo es el «propietario» del contacto en wechatia');
    ok(lead2 && /Providencia/.test(lead2.datos.resumen) && lead2.mensajes.length === 3, 'la IA dejó qué busca y el historial trae los 3 mensajes');

    // ---- 3) la app (Chromium) con la sesión de la administradora
    const inmoDir = path.join(tmp, 'inmo'); fs.mkdirSync(inmoDir, { recursive: true });
    app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`], cwd: path.join(__dirname, '..'),
      env: { ...process.env, PF_MOCK: '', PF_MOCK_LOGGED: '', PF_MOCK_ASSET_LOGIN: '', PF_ASSET_API: API, PF_INMO_DIR: inmoDir, PF_AI_MANAGED: 'none', PF_NO_TOURS: '1' } });
    const w = await app.firstWindow(); const errs = []; w.on('pageerror', (e) => errs.push(e.message));
    const txt = (s) => w.textContent(s).then((t) => (t || '').replace(/\s+/g, ' '));
    await w.setViewportSize({ width: 1500, height: 960 });
    await w.waitForSelector('#assetAcceso #acEmail', { timeout: 20000 });
    await w.fill('#acEmail', adm.email); await w.fill('#acClave', CLAVE); await w.click('#acEntrar');
    await w.waitForSelector('#assetAcceso', { state: 'detached', timeout: 30000 });
    await w.click('#nav [data-view="leads"]'); await w.waitForSelector('#ldItems .ld-it:has-text("Valentina Paz")', { timeout: 30000 });
    ok(true, 'en Leads aparece «Valentina Paz» (llegó por Instagram)');
    await w.click('#ldItems .ld-it:has-text("Valentina Paz")'); await w.waitForSelector('#ldChB .ld-m', { timeout: 15000 });
    ok(/Providencia/.test(await txt('#ldChB')) && (await w.$$('#ldChB .ld-m.in')).length === 2 && (await w.$$('#ldChB .ld-m.out')).length === 1, 'su conversación se ve completa: 2 mensajes de ella y 1 del corredor');
    ok(/Instagram/.test(await txt('.ld-ch-h')) && /Solo lectura/.test(await txt('.ld-ch-h')), 'marcada como Instagram y de solo lectura');
    ok(/6543/.test(await w.inputValue('#ldFicha [data-k="telefono"]')) && await w.inputValue('#ldFicha [data-k="b_operacion"]') === 'arriendo', 'la ficha trae el celular que dio y que busca arriendo');
    await shot(w, 'igv1-lead.png');
    await w.click('#ldCuentas'); await w.waitForSelector('#ldObs', { timeout: 10000 });
    const tObs = await txt('#ldObs').catch(() => ''); ok(/llegan solos/.test(tObs) && !(await w.$('#ldObsOn')), 'en «Cuentas e historial» no hay nada que activar: dice que Instagram llega solo · «' + tObs.slice(0, 120) + '»');
    await shot(w, 'igv2-cuentas.png'); await w.click('#mCancel');

    // ---- 4) ella vuelve a escribir: entra solo el mensaje nuevo
    dm(cv, 'inbound', '¿Puedo verlo el sábado a las 11?', 0);
    r = await req('POST', '/whatsapp/observador/revisar', {}, tA);
    ok(r.s < 300 && r.j.mensajes === 1 && r.j.nuevos === 0, 'en la siguiente revisión se agrega solo el mensaje nuevo, sin duplicar el lead');
    ok(await hasta(() => db.leadMensaje.count({ where: { leadId: lead.id } }).then((n) => n === 4)), 'el lead ya tiene 4 mensajes');
    await w.click('#nav [data-view="inicio"]').catch(() => {}); await w.click('#nav [data-view="leads"]');
    await w.click('#ldItems .ld-it:has-text("Valentina Paz")');
    ok(await hasta(async () => /sábado a las 11/.test(await txt('#ldChB')), 20000), 'y el mensaje nuevo aparece en la pantalla');
    await shot(w, 'igv3-nuevo-mensaje.png');

    // ---- 5) solo lectura
    ok(!W.enviados.length, 'Asset no le escribió nada a Instagram (ningún envío a wechatia)');
    ok(!errs.length, 'sin errores en la pantalla ' + errs.join(' | '));
    console.log('\nOK instagram-vivo-e2e');
  } catch (e) { console.error(e.message); process.exitCode = 1; if (app) { const w = await app.firstWindow().catch(() => null); if (w) await shot(w, 'igv-error.png').catch(() => {}); } }
  finally {
    if (app) await app.close().catch(() => {});
    srv.close(); ia.close();
    if (co) {
      const w = { where: { corredoraId: co.id } };
      for (const m of ['waEntrante', 'waVinculo', 'waHilo', 'waEnviado', 'waConversacion', 'waAjustes', 'iaConsumo', 'waProgramado', 'aviso', 'conexion', 'registro', 'actividad', 'evento', 'leadMensaje', 'lead', 'negocio', 'firma']) await db[m].deleteMany(w).catch((e) => console.warn(m, e.message));
      await db.propiedadPersona.deleteMany({ where: { propiedad: { corredoraId: co.id } } }).catch(() => {});
      for (const m of ['propiedad', 'persona', 'contador']) await db[m].deleteMany(w).catch((e) => console.warn(m, e.message));
      await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } }).catch(() => {});
      await db.usuario.deleteMany({ where: { id: { in: usuarios } } }).catch(() => {});
      await db.corredora.delete({ where: { id: co.id } }).catch((e) => console.warn('no se borró la corredora de prueba:', e.message));
    }
    await db.$disconnect(); fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
