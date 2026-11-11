// Prueba del puente corredor ↔ interesado (src/whatsapp/puente.ts) contra la API corriendo (yarn dev) y asset_dev, con un
// wechatia FALSO. Crea una corredora de prueba y al final la borra con todo lo suyo.
// Uso: node test/puente-e2e.js [url]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1')]));
// cifrado igual al de la API (src/conexiones/cifrado.ts)
function cifrar(texto) {
  const llave = Buffer.from(env.CONEXIONES_CLAVE, 'base64'); const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', llave, iv); const d = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), d.toString('base64url')].join('.');
}
const B = (process.argv[2] || 'http://localhost:3000') + '/v1';
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(B + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
const ingresar = async (email, clave) => (await req('POST', '/auth/ingresar', { email, clave })).j.tokenAcceso;
const SUF = Date.now().toString(36);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const dig = (x) => String(x || '').replace(/\D/g, '').slice(-9);
/** espera hasta que fn() devuelva algo (cada 1 s, hasta `seg`) */
async function hasta(fn, seg = 30) { for (let i = 0; i < seg; i++) { const r = await fn(); if (r) return r; await esperar(1000); } return null; }

// ---------------------------------------------------------------- wechatia falso
const W = { convs: [], contactos: {}, enviados: [], n: 0 };
const TOKEN = 'pit-asist-' + 'x'.repeat(30);
const nuevoId = (p) => p + (++W.n);
function conv({ telefono, nombre, tipo = 'TYPE_WHATSAPP', usuario = '', asignado = null }) {
  const contactId = nuevoId('k'); W.contactos[contactId] = telefono || null;
  const c = { id: nuevoId('cv'), contactId, phone: telefono || null, fullName: nombre, type: tipo, lastMessageType: tipo, instagramUsername: usuario, assignedTo: asignado, lastMessageDate: Date.now(), mensajes: [] };
  W.convs.push(c); return c;
}
/** el cliente escribe (entrante) */
function escribe(c, texto, extra = {}) { const m = { id: nuevoId('m'), direction: 'inbound', body: texto, attachments: [], dateAdded: new Date().toISOString(), messageType: c.type, ...extra }; c.mensajes.push(m); c.lastMessageDate = Date.now() + W.n; return m; }
/** el corredor le escribe a mano desde wechatia */
function aMano(c, texto) { const m = { id: nuevoId('m'), direction: 'outbound', body: texto, dateAdded: new Date().toISOString(), userId: 'wu-1', source: 'app', messageType: c.type }; c.mensajes.push(m); c.lastMessageDate = Date.now() + W.n; }
const salidas = (c) => W.enviados.filter((e) => e.contactId === c.contactId).map((e) => e.message);
function wechatiaFalso() {
  const s = http.createServer((rq, rs) => {
    let b = ''; rq.on('data', (x) => (b += x)); rq.on('end', () => {
      const u = new URL(rq.url, 'http://x'); const p = u.pathname; const body = b ? JSON.parse(b) : null;
      const out = (code, j) => { rs.writeHead(code, { 'content-type': 'application/json' }); rs.end(JSON.stringify(j)); };
            if (rq.headers.authorization !== 'Bearer ' + TOKEN) return out(401, { message: 'no' });
      if (p === '/conversations/search') {
        const cid = u.searchParams.get('contactId');
        const l = (cid ? W.convs.filter((c) => c.contactId === cid) : [...W.convs].sort((a, b) => b.lastMessageDate - a.lastMessageDate)).map(({ mensajes, ...c }) => c);
        return out(200, { conversations: l.slice(0, Number(u.searchParams.get('limit') || 50)) });
      }
      const mc = p.match(/^\/conversations\/([^/]+)\/messages$/);
      if (mc) { const c = W.convs.find((x) => x.id === mc[1]); return out(200, { messages: { messages: c ? [...c.mensajes].reverse() : [] } }); }
      if (p === '/conversations/messages' && rq.method === 'POST') {
        const id = nuevoId('m'); W.enviados.push({ ...body, id, t: Date.now() });
        let c = W.convs.find((x) => x.contactId === body.contactId);
        if (!c) { c = { id: nuevoId('cv'), contactId: body.contactId, phone: W.contactos[body.contactId], fullName: '', type: 'TYPE_WHATSAPP', lastMessageType: 'TYPE_WHATSAPP', lastMessageDate: Date.now(), mensajes: [] }; W.convs.push(c); }
        c.mensajes.push({ id, direction: 'outbound', body: body.message, dateAdded: new Date().toISOString(), source: 'api', messageType: 'TYPE_WHATSAPP' }); c.lastMessageDate = Date.now() + W.n;
        return out(200, { messageId: id });
      }
      if (/^\/conversations\/messages\/m\d+$/.test(p)) return out(200, { message: { status: 'delivered' } });
      if (/^\/locations\/[^/]+\/customFields$/.test(p)) return out(200, { customFields: [] });
      const mct = p.match(/^\/contacts\/([^/]+)(\/tags)?$/);
      if (mct && mct[1] !== 'search' && rq.method === 'PUT') { (W.plantillas ||= []).push({ contactId: mct[1], campos: Object.fromEntries((body.customFields || []).map((f) => [f.key || f.id, f.field_value])) }); return out(200, { contact: { id: mct[1] } }); }
      if (mct && mct[2] && rq.method === 'POST') { const x = (W.plantillas ||= []).findLast((q) => q.contactId === mct[1] && !q.etiqueta); if (x) x.etiqueta = body.tags[0]; return out(200, { tags: body.tags }); }
      if (mct && mct[2] && rq.method === 'DELETE') return out(200, { tags: [] });
      if (p === '/contacts/search/duplicate') { const n = dig(u.searchParams.get('number')); const id = Object.keys(W.contactos).find((k) => dig(W.contactos[k]) === n); return out(200, { contact: id ? { id } : null }); }
      if (p === '/contacts/' && rq.method === 'POST') { const id = nuevoId('k'); W.contactos[id] = body.phone; return out(200, { contact: { id } }); }
      out(404, { message: 'ruta falsa: ' + p });
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

(async () => {
  const db = new PrismaClient();
  const srv = await wechatiaFalso();
  const base = `http://127.0.0.1:${srv.address().port}`;
  let co = null; const usuarios = [];
  try {
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    co = await db.corredora.create({ data: { nombre: `E2E Puente ${SUF}` } });
    const nu = async (n, rol) => { const x = await db.usuario.create({ data: { corredoraId: co.id, email: `e2e-pu${n}-${SUF}@prueba.cl`, nombre: 'Corredor ' + n.toUpperCase(), hashClave: hash, ...(rol ? { rol } : {}) } }); usuarios.push(x.id); return x; };
    const adm = await nu('a', 'ADMIN'); const c1 = await nu('b', null);
    const tA = await ingresar(adm.email, 'clave-e2e-123'); const t1 = await ingresar(c1.email, 'clave-e2e-123');
    ok(tA && t1, 'ingresan el administrador y un corredor');
    const mkLead = (id, nombre, tel, corredorId) => db.lead.create({ data: { id: id + SUF, corredoraId: co.id, corredorId, telefonoNorm: dig(tel), origen: 'portal', datos: { nombre, telefono: tel, chatCon: nombre } } });
    const lJuan = await mkLead('ldj', 'Juan Pérez', '+56 9 8765 4321', c1.id);

    let r = await req('PUT', '/whatsapp/conexion', { token: TOKEN, locationId: 'loc-1', base }, tA);
    ok(r.s === 200 && r.j.conectado, 'el administrador conecta el WhatsApp de la empresa (wechatia de prueba)');

    // ---- el corredor vincula su celular
    r = await req('POST', '/whatsapp/ejecutivo/vincular', { nombre: 'Corredor B' }, t1);
    const cel = conv({ telefono: '+56 9 9111 1111', nombre: 'Corredor B' });
    escribe(cel, `Hola! ${r.j.codigo}`);
    ok(await hasta(() => salidas(cel).some((t) => /quedó conectado/.test(t))), 'el corredor vincula su celular');

    // ---- 1. interesado → corredor
    const cj = conv({ telefono: '+56 9 8765 4321', nombre: 'Juan Pérez' });
    escribe(cj, 'Hola, ¿sigue disponible el depto de Ñuñoa?');
    const aviso = await hasta(() => salidas(cel).find((t) => /💬 \*Juan Pérez\*/.test(t)));
    ok(aviso && /sigue disponible el depto/.test(aviso) && /Para Juan/.test(aviso), 'lo que escribe el interesado le llega al celular de su corredor, con cómo responderle');
    ok(await hasta(() => salidas(cj).some((t) => /gracias por escribir.*Ya le pasé tu mensaje a Corredor B/i.test(t))), 'el interesado recibe un único primer aviso (no conversa con él ningún asistente)');
    await esperar(6000);
    ok(salidas(cj).length === 1, 'y nada más: ningún asistente le responde');
    let ms = await db.leadMensaje.findMany({ where: { leadId: lJuan.id }, orderBy: { id: 'asc' } });
    ok(ms.some((m) => m.de === 'cliente' && /sigue disponible/.test(m.texto)), 'la conversación queda en el lead');
    const fwd = W.enviados.find((e) => e.contactId === cel.contactId && /💬 \*Juan Pérez\*/.test(e.message));
    ok(fwd && (await db.waPuente.count({ where: { corredoraId: co.id, leadId: lJuan.id, messageId: fwd.id } })) === 1, 'el reenvío queda ligado al lead (para responder citándolo)');

    // ---- 2. corredor → interesado, con prefijo
    escribe(cel, 'Para Juan Pérez: ¿le acomoda el sábado a las 11?');
    ok(await hasta(() => salidas(cj).some((t) => /^\*Corredor B\* \(corredor\):\n¿le acomoda el sábado a las 11\?$/.test(t))), '«Para Juan Pérez: …» sale al interesado, firmado por el corredor');
    ok(await hasta(() => salidas(cel).some((t) => /✅ Enviado a Juan Pérez/.test(t))), 'y el corredor recibe la confirmación');
    ms = await db.leadMensaje.findMany({ where: { leadId: lJuan.id }, orderBy: { id: 'asc' } });
    ok(ms.some((m) => m.de === 'broker' && m.autor === 'Corredor B' && /sábado a las 11/.test(m.texto)), 'queda en el lead como mensaje del corredor');
    ok((await db.lead.findUnique({ where: { id: lJuan.id } })).estado === 'contactado', 'el lead pasa a «contactado»');
    r = await req('GET', '/whatsapp/ejecutivo/entrantes', null, t1);
    ok(!r.j.items.some((x) => /sábado/.test(x.body)), 'ese mensaje no pasa a la cola del Agente');

    // ---- 3. corredor → interesado, citando el mensaje reenviado
    escribe(cj, 'Sí, perfecto');
    await hasta(() => salidas(cel).filter((t) => /💬 \*Juan Pérez\*/.test(t)).length >= 2);
    const f2 = W.enviados.filter((e) => e.contactId === cel.contactId && /💬 \*Juan Pérez\*/.test(e.message)).at(-1);
    escribe(cel, 'Entonces te espero el sábado', { replyToMessageId: f2.id });
    ok(await hasta(() => salidas(cj).some((t) => /Entonces te espero el sábado/.test(t))), 'responder citando el mensaje reenviado lo envía a ese interesado');

    // ---- 4. dos interesados con el mismo nombre
    await mkLead('ldk', 'Juan Soto', '+56 9 1234 0000', c1.id);
    const cs = conv({ telefono: '+56 9 1234 0000', nombre: 'Juan Soto' });
    escribe(cs, 'Hola, soy Soto');
    await hasta(() => salidas(cs).length > 0);
    const antes = W.enviados.length;
    escribe(cel, 'Para Juan: hola');
    ok(await hasta(() => salidas(cel).some((t) => /Hay 2 interesados que calzan con «Juan»/.test(t))), 'si hay dos que calzan, le pide al corredor que aclare');
    ok(!W.enviados.slice(antes).some((e) => e.contactId === cj.contactId && /hola/.test(e.message)), 'y no le manda nada a ninguno');
    escribe(cel, 'Para 0000: hola Soto');
    ok(await hasta(() => salidas(cs).some((t) => /hola Soto/.test(t))), 'con los últimos dígitos del celular sí sale al correcto');

    // ---- 5. lo que no es para un interesado sigue al Agente
    escribe(cel, 'Para mañana: revisa mi agenda');
    ok(await hasta(async () => (await req('GET', '/whatsapp/ejecutivo/entrantes', null, t1)).j.items.some((x) => /revisa mi agenda/.test(x.body)), 15), '«Para mañana: …» no es de ningún lead: sigue al Agente como siempre');

    // ---- 6. un número nuevo: lead, primer aviso; el corredor a cargo es el administrador (sin celular vinculado): sus avisos de la app
    const cn = conv({ telefono: '+56 9 4444 5555', nombre: 'María Nueva' });
    escribe(cn, 'Hola, vi un aviso de arriendo');
    ok(await hasta(() => salidas(cn).some((t) => /gracias por escribir/i.test(t))), 'a un número nuevo le llega el aviso fijo');
    const ln = await hasta(() => db.lead.findFirst({ where: { corredoraId: co.id, telefonoNorm: '944445555' } }));
    ok(ln && ln.corredorId === adm.id, 'se crea su lead, a cargo del administrador');
    ok(await hasta(() => db.aviso.findFirst({ where: { usuarioId: adm.id, tipo: 'whatsapp', texto: { contains: 'María Nueva' } } })), 'y como nadie tiene celular vinculado para recibirlo, queda en los avisos de la app del administrador');
    await esperar(5000);
    ok(salidas(cn).length === 1, 'ningún asistente conversa con ella');

    // ---- 7. el administrador vinculado recibe lo de los leads
    const rA = await req('POST', '/whatsapp/ejecutivo/vincular', { nombre: 'Admin' }, tA);
    const celA = conv({ telefono: '+56 9 2222 3333', nombre: 'Admin' });
    escribe(celA, `Hola ${rA.j.codigo}`);
    await hasta(() => salidas(celA).some((t) => /quedó conectado/.test(t)));
    escribe(cn, 'Sigo esperando respuesta');
    ok(await hasta(() => salidas(celA).some((t) => /💬 \*María Nueva\*[\s\S]*Sigo esperando/.test(t))), 'con el celular del administrador vinculado, se lo reenvía a él');

    // ---- 8. un corredor no le escribe a leads de otro
    escribe(cel, 'Para María: hola');
    await esperar(5000);
    ok(!W.enviados.some((e) => e.contactId === cn.contactId && /Corredor B/.test(e.message)), 'un corredor no puede escribirle a un lead que no es suyo');

    const aj = await db.waAjustes.findUnique({ where: { corredoraId: co.id } });
    ok(aj.lectorEn && !aj.lectorError, 'el lector terminó sus rondas sin error');
  } finally {
    srv.close();
    if (co) {
      const w = { where: { corredoraId: co.id } };
      for (const m of ['waPuente', 'waEntrante', 'waVinculo', 'waHilo', 'waEnviado', 'waConversacion', 'waAjustes', 'aviso', 'conexion', 'registro', 'actividad', 'leadMensaje', 'lead']) await db[m].deleteMany(w).catch((e) => console.warn(m, e.message));
      await db.persona.deleteMany(w).catch(() => null);
      await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
      await db.usuario.deleteMany({ where: { id: { in: usuarios } } });
      await db.corredora.delete({ where: { id: co.id } }).catch((e) => console.warn('no se borró la corredora de prueba:', e.message));
    }
    await db.$disconnect();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
