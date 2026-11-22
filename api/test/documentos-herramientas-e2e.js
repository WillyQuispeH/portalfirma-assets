// Prueba de las HERRAMIENTAS DE DOCUMENTOS Y FIRMAS del equipo en el servidor (src/whatsapp/herramientas/documentos*.ts): el corredor arma, revisa y
// envía a firmar mandatos, carta oferta, contrato (con revisión y aprobación), promesa, acta de entrega, plantillas de la Notaría virtual, mira el
// seguimiento de firmas y reenvía enlaces, todo por WhatsApp con la app cerrada. Contra la API corriendo (yarn dev) y asset_dev, con wechatia,
// IA (API de mensajes de Anthropic) y Portalfirma (API de integración y MCP) FALSOS que levanta esta misma prueba. La IA falsa llama la herramienta
// que cada paso de la prueba le indica (PLAN) y guarda el resultado que recibe (RES): así se prueba lo del servidor, no lo que decida un modelo.
// Crea una corredora de prueba con su administrador y dos corredores, y al final la borra con todo lo suyo.
// Requiere Chromium en la API (PDF_CHROMIUM) y R2. Uso: node test/documentos-herramientas-e2e.js [url]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const argon2 = require('argon2');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
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
      // las fotos que mandan por WhatsApp quedan en una URL pública (sin clave)
      if (p.startsWith('/audio/')) { rs.writeHead(200, { 'content-type': 'audio/ogg' }); return rs.end(Buffer.alloc(3000, 7)); }
      if (p.startsWith('/media/')) { rs.writeHead(200, { 'content-type': 'image/webp' }); return rs.end(IMG); } // WhatsApp manda WebP
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
        c.mensajes.push({ id, altId: 'wamid.' + id, direction: 'outbound', body: body.message, dateAdded: new Date().toISOString(), source: 'api', messageType: 'TYPE_WHATSAPP' }); c.lastMessageDate = Date.now() + W.n;
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

let IMG = null;

// ---------------------------------------------------------------- IA falsa: llama la herramienta que dice el PLAN y guarda lo que recibe (RES)
const IA = { llamadas: [] };
const PLAN = []; const RES = [];
const texto = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
const herramienta = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu' + Date.now() + Math.random(), name, input }], stop_reason: 'tool_use' });
function respuestaIa(b) {
  const ult = b.messages.at(-1);
  const tr = Array.isArray(ult.content) && ult.content.find((x) => x.type === 'tool_result');
  if (tr) { let r; try { r = JSON.parse(tr.content); } catch { r = { error: 'JSON truncado: ' + String(tr.content).slice(0, 100) }; } RES.push(r); return texto('ok'); }
  // solo el equipo del ejecutivo (el que tiene las herramientas de documentos) consume el plan; lo demás (Sofía, Tomás…) responde sin más
  if ((b.tools || []).some((t) => t.name === 'preparar_mandato')) { const p = PLAN.shift(); if (p) return herramienta(p.name, p.input); }
  return texto('ok');
}
function iaFalsa() {
  const s = http.createServer((rq, rs) => {
    let b = ''; rq.on('data', (x) => (b += x)); rq.on('end', () => {
      const body = JSON.parse(b || '{}'); IA.llamadas.push(body);
      const r = respuestaIa(body);
      rs.writeHead(200, { 'content-type': 'application/json' });
      rs.end(JSON.stringify({ id: 'msg_' + IA.llamadas.length, type: 'message', role: 'assistant', model: body.model, ...r, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20 } }));
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

// ---------------------------------------------------------------- Portalfirma falso: API de integración (enviar, detalle, reenviar) y MCP (plantillas, saldo)
const PFTOKEN = 'tok-pf-' + SUF; const PF_ID = 'id-api-' + SUF; const PF_CUSTOMER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OPBASE = 700000000 + Math.floor(Math.random() * 90000000);
const ENVIOS = []; const OPS = {}; const FIRMADOS = new Set(); const REENVIOS = []; const MCP = [];
let NOPS = 0;
const rutLimpio = (r) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
function detalle(op) {
  const o = OPS[op]; if (!o) return null;
  const sig = o.firmantes.map((f, i) => ({ id: `sig-${op}-${i}`, name: f.nombre.split(' ')[0], paternalLastName: f.nombre.split(' ').slice(1).join(' '), maternalLastName: '', rut: f.rut, email: f.email, phone: f.phone || '', signed: FIRMADOS.has(op + '|' + rutLimpio(f.rut)), alias: f.alias }));
  return { processId: o.pid, operation: op, status: sig.length && sig.every((s) => s.signed) ? 'finalized' : 'process', signatories: sig, files: { original: { id: 'f-' + op, name: 'doc.pdf' } }, updatedDateAt: new Date().toISOString() };
}
async function apiPortalfirma(rq, rs, b) {
  const json = (st, o) => { rs.writeHead(st, { 'content-type': 'application/json' }).end(JSON.stringify(o)); };
  if (rq.headers.id !== PF_ID) return json(401, { success: false, data: null, error: 'Acceso denegado' });
  if (rq.method === 'POST' && rq.url === '/api/auth/generateToken') { const c = JSON.parse(b || '{}'); return c.customer_id === PF_CUSTOMER && c.password === 'clave-pf' ? json(200, { success: true, data: { token: PFTOKEN }, error: null }) : json(401, { success: false, data: null, error: 'Unauthorized' }); }
  if (rq.headers.authorization !== 'Bearer ' + PFTOKEN) return json(401, { success: false, data: null, error: 'Unauthorized' });
  if (rq.method === 'POST' && rq.url === '/api/document/sendToSign') {
    const c = JSON.parse(b || '{}'); const n = ++NOPS; const op = OPBASE + n;
    const firmantes = (c.signatories || []).map((x) => ({ rut: x.signatory.rut, email: x.signatory.email, phone: x.signatory.phone, nombre: [x.signatory.name, x.signatory.paternalLastName, x.signatory.maternalLastName].filter((p) => p && p !== '-').join(' '), alias: x.signature.alias, tipo: x.signature.type }));
    OPS[op] = { pid: 'pid-' + n, firmantes };
    ENVIOS.push({ op, pdf: Buffer.from(c.document || '', 'base64'), paginaFirmas: c.addSignaturePage, firmantes });
    return json(201, { success: true, data: { processId: 'pid-' + n, createdDateAt: new Date().toISOString() }, error: null });
  }
  let m;
  if (rq.method === 'GET' && (m = /^\/api\/document\/getByProcessId\/pid-(\d+)$/.exec(rq.url || ''))) { const d = detalle(OPBASE + Number(m[1])); return d ? json(200, { success: true, data: d, error: null }) : json(404, { success: false, data: null, error: 'Not Found' }); }
  if (rq.method === 'GET' && (m = /^\/api\/document\/getByOperation\/(\d+)$/.exec(rq.url || ''))) { const d = detalle(Number(m[1])); return d ? json(200, { success: true, data: d, error: null }) : json(404, { success: false, data: null, error: 'Not Found' }); }
  if (rq.method === 'POST' && rq.url === '/api/document/resendSignatoryToSign') { REENVIOS.push(JSON.parse(b)); return json(200, { success: true, data: {}, error: null }); }
  return json(404, { success: false, data: null, error: 'Not Found' });
}
const FORM = { name: 'Contrato de arriendo - prueba', groups: [
  { group: 'arrendatario', type: 'signer', variables: [{ id: 'a-nom', name: 'nombre-arrendatario', label: 'Nombre', required: true }, { id: 'a-rut', name: 'rut-arrendatario', label: 'RUT', required: true }, { id: 'a-mail', name: 'correo-arrendatario', label: 'Correo', required: true }] },
  { group: 'inmueble', type: 'nosigner', variables: [{ id: 'i-dir', name: 'direccion', label: 'Dirección', required: true }, { id: 'i-canon', name: 'canon', label: 'Canon mensual', required: true }, { id: 'i-clau', name: 'clausula-especial', label: 'Cláusula especial', required: true }] },
] };
function portalfirmaFalso() {
  const s = http.createServer(async (rq, rs) => {
    let b = ''; for await (const c of rq) b += c;
    if ((rq.url || '').startsWith('/api/')) return apiPortalfirma(rq, rs, b);
    if (rq.headers.authorization !== 'Bearer ' + PFTOKEN) { rs.writeHead(401).end(); return; }
    const srv = new McpServer({ name: 'pf-falso', version: '1.0.0' });
    const t = (x) => ({ content: [{ type: 'text', text: typeof x === 'string' ? x : JSON.stringify(x) }] });
    srv.tool('template_manage_tools', { action: z.string(), query: z.string().optional(), top_k: z.number().optional(), template_version_id: z.string().optional(), property_id: z.string().optional(), values: z.record(z.string(), z.string()).optional() }, async (a) => {
      MCP.push(a);
      if (a.action === 'search') return t([{ template_version_id: 'tv-contrato', name: 'Contrato de arriendo - prueba', description: 'Arriendo de vivienda' }]);
      if (a.action === 'get_forms') return t(FORM);
      if (a.action === 'send_sign') { const n = ++NOPS; const op = OPBASE + n; OPS[op] = { pid: 'pid-' + n, firmantes: [{ rut: a.values['a-rut'], email: a.values['a-mail'], nombre: a.values['a-nom'], alias: 'arrendatario' }] }; ENVIOS.push({ op, values: a.values, plantilla: a.template_version_id }); return t({ operation: op, message: 'Enviado a firmar' }); }
      return { content: [{ type: 'text', text: 'Error: acción desconocida' }], isError: true };
    });
    srv.tool('wallet_manage_balance_tools', { action: z.string(), amount: z.number().optional(), email: z.string().optional() }, async (a) => (a.action === 'get_balance' ? t({ amount: 125000 }) : { content: [{ type: 'text', text: 'Error' }], isError: true }));
    const tr = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    rs.on('close', () => { tr.close(); srv.close(); });
    await srv.connect(tr);
    await tr.handleRequest(rq, rs, b ? JSON.parse(b) : undefined);
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

// DOCS_SECCIONES=entrega,visita,firmas,plantillas,buscar,saldo corre solo esas (la prueba completa tarda ~25 min con la API recargándose sola)
const SEC = (n) => !process.env.DOCS_SECCIONES || process.env.DOCS_SECCIONES.split(',').includes(n);
let DEPURAR = () => ''; // se llena al armar el escenario: qué vio el servidor cuando algo falla
const dv = (n) => { let s = 0; let m = 2; for (const d of String(n).split('').reverse()) { s += Number(d) * m; m = m === 7 ? 2 : m + 1; } const r = 11 - (s % 11); return r === 11 ? '0' : r === 10 ? 'K' : String(r); };
const rutF = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv(n)}`;

(async () => {
  const db = new PrismaClient();
  const srv = await wechatiaFalso(); const ia = await iaFalsa(); const pfs = await portalfirmaFalso();
  const base = `http://127.0.0.1:${srv.address().port}`; const iaBase = `http://127.0.0.1:${ia.address().port}`;
  let co = null; const usuarios = [];
  try {
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    co = await db.corredora.create({ data: { nombre: `E2E Documentos ${SUF}` } });
    const nu = async (n, rol, extra = {}) => { const x = await db.usuario.create({ data: { corredoraId: co.id, email: `e2e-dh${n}-${SUF}@prueba.cl`, nombre: 'Corredor ' + n.toUpperCase(), hashClave: hash, ...(rol ? { rol } : {}), ...extra } }); usuarios.push(x.id); return x; };
    const adm = await nu('a', 'ADMIN'); const c1 = await nu('b', null, { wechatiaId: 'wu-1' }); const c2 = await nu('c', null, { wechatiaId: 'wu-2' });
    const tA = await ingresar(adm.email, 'clave-e2e-123'); const t1 = await ingresar(c1.email, 'clave-e2e-123');
    ok(tA && t1, 'ingresan el administrador y los corredores');

    // ---- conexiones de prueba: wechatia, IA, Portalfirma (API y MCP)
    let r = await req('PUT', '/whatsapp/conexion', { token: TOKEN, locationId: 'loc-1', base }, tA);
    ok(r.s === 200 && r.j.conectado, 'el administrador conecta el WhatsApp de la empresa (wechatia de prueba)');
    const cx = await db.conexion.findFirst({ where: { corredoraId: co.id, proveedor: 'wechatia' } });
    await db.conexion.update({ where: { id: cx.id }, data: { datos: { ...cx.datos, iaBase } } });
    await db.conexion.create({ data: { corredoraId: co.id, usuarioId: null, dueno: 'corredora', proveedor: 'portalfirma', tipo: 'oauth', estado: 'activa', accesoCif: cifrar(PFTOKEN), datos: { mcpUrl: `http://127.0.0.1:${pfs.address().port}/mcp` } } });
    await db.conexion.create({ data: { corredoraId: co.id, usuarioId: null, dueno: 'corredora', proveedor: 'portalfirma_api', tipo: 'clave', estado: 'activa', accesoCif: cifrar(JSON.stringify({ id: PF_ID, password: 'clave-pf' })), datos: { customerId: PF_CUSTOMER, email: 'int@x.cl', apiUrl: `http://127.0.0.1:${pfs.address().port}/api` } } });

    // ---- datos del CRM
    const persona = (nombre, n, extra = {}) => db.persona.create({ data: { corredoraId: co.id, nombre, ...(n ? { rut: String(n) + dv(n), rutFormato: rutF(n) } : {}), ...extra } });
    const rosa = await persona('Rosa Propietaria', null, { telefono: '+56 9 5555 1111' }); // sin RUT ni correo
    const luis = await persona('Luis Dueño', 12345678, { email: 'luis@prueba.cl', telefono: '+56 9 7777 3333' });
    const pedro = await persona('Pedro Vendedor', 15432876, { email: 'pedro@prueba.cl', telefono: '+56 9 8888 4444' });
    const ana = await persona('Ana Arrendataria', 7654321, { email: 'ana@prueba.cl', telefono: '+56 9 6666 2222' });
    const beto = await persona('Beto Comprador', 9876543, { email: 'beto@prueba.cl', telefono: '+56 9 6666 5555' });
    const sofia = await persona('Sofía Aval', 8765432, { email: 'sofia@prueba.cl', telefono: '+56 9 6666 7777' });
    const prop = (codigo, extra, dueno) => db.propiedad.create({ data: { corredoraId: co.id, codigo, titulo: 'Propiedad ' + codigo, tipo: 'departamento', direccion: 'Irarrázaval 2450', comuna: 'Ñuñoa', captadorId: c1.id, ...extra, ...(dueno ? { vinculos: { create: [{ personaId: dueno.id, rol: 'propietario' }] } } : {}) } });
    const p1 = await prop('PF-9101', { arriendo: true, precioArriendo: 650000, monedaArriendo: 'CLP', unidad: '504' }, rosa);
    const p2 = await prop('PF-9102', { arriendo: true, venta: true, precioArriendo: 700000, monedaArriendo: 'CLP', precioVenta: 5000, monedaVenta: 'UF' }, luis);
    const p3 = await prop('PF-9103', { venta: true, precioVenta: 9500, monedaVenta: 'UF', tipo: 'casa', direccion: 'Larraín 6200', comuna: 'La Reina' }, pedro);
    const p4 = await prop('PF-9104', { arriendo: true, precioArriendo: 500000, monedaArriendo: 'CLP', captadorId: c2.id }, luis);
    const p5 = await prop('PF-9105', { arriendo: true, precioArriendo: 800000, monedaArriendo: 'CLP', unidad: '12' }, luis);
    const neg = (id, codigo, tipo, p, cliente, corredor, datos = {}) => db.negocio.create({ data: { id, corredoraId: co.id, tipo, etapa: tipo === 'venta' ? 'reserva' : 'interes', propiedadId: p.id, clienteId: cliente.id, corredorId: corredor.id, datos: { codigo, ...datos } } });
    const nA = await neg('na' + SUF, 'NG-901', 'arriendo', p5, ana, c1); // carta oferta
    const nB = await neg('nb' + SUF, 'NG-902', 'venta', p3, beto, c1, { valor: { valor: 9300, moneda: 'UF' } }); // promesa y escritura
    const nC = await neg('nc' + SUF, 'NG-903', 'arriendo', p5, ana, c1, { valor: { valor: 800000, moneda: 'CLP' } }); // contrato
    const nD = await neg('nd' + SUF, 'NG-904', 'arriendo', p5, ana, c1, { valor: { valor: 800000, moneda: 'CLP' } }); // acta de entrega
    const nE = await neg('ne' + SUF, 'NG-905', 'arriendo', p4, ana, c2); // de otro corredor
    await db.registro.create({ data: { corredoraId: co.id, coleccion: 'evaluaciones', id: nC.id, datos: { personas: [{ personaId: ana.id, rol: 'arrendatario' }, { personaId: sofia.id, rol: 'aval' }] } } });
    // un acta de visita ya cerrada del negocio de venta (para compartir su PDF)
    const hoyISO = new Date().toISOString().slice(0, 10);
    await db.registro.create({ data: { corredoraId: co.id, coleccion: 'actas_visita', id: 'av' + SUF, datos: { id: 'av' + SUF, negocioId: nB.id, propiedadId: p3.id, fecha: hoyISO, estado: 'cerrada', creadaEn: new Date().toISOString(), creadaPor: c1.nombre, usuarioId: c1.id, notas: '', audios: [], fotos: [], resumen: { hechoEn: new Date().toISOString(), resumen: 'Visita tranquila; le gustó la casa.', interesado: ['Preguntó por los gastos'], corredor: ['Mostró el patio'], interes: 'alto', objeciones: [], acuerdos: [], proximosPasos: ['Enviar oferta'] }, cerradaEn: new Date().toISOString() } } });
    // un documento guardado en la propiedad (para buscar_documento)
    await db.propiedadDocumento.create({ data: { propiedadId: p1.id, nombre: 'Mandato antiguo firmado.pdf', tipo: 'mandato', claveAlmacenamiento: `c/${co.id}/p/${p1.id}/docs/prueba.pdf` } });

    // ---- el celular del corredor (vínculo con su WhatsApp)
    r = await req('POST', '/whatsapp/ejecutivo/vincular', { nombre: 'Corredor B' }, t1);
    const cel = conv({ telefono: '+56 9 9111 1111', nombre: 'Corredor B' });
    escribe(cel, `Hola! ${r.j.codigo}`);
    ok(await hasta(() => salidas(cel).some((t) => /quedó conectado a PortalFirma Asset/.test(t))), 'el corredor vincula su celular');
    // las partes del contrato escribieron hace poco al número de la empresa (así WhatsApp deja mandarles el PDF)
    for (const p of [luis, ana, sofia, beto]) { const cp = conv({ telefono: p.telefono, nombre: p.nombre }); escribe(cp, 'Hola'); }

    /** el corredor escribe y la IA llama la herramienta; devuelve lo que la herramienta respondió */
    let ultimaPrep = null; // lo último que quedó esperando el sí del corredor
    const herr = async (dice, name, input, espera = 45) => {
      // la API de desarrollo se recarga sola cuando alguien guarda un archivo: se espera a que esté arriba y, si se perdió el mensaje, se repite una vez
      for (let intento = 1; intento <= 2; intento++) {
        await hasta(async () => (await fetch(B + '/health').catch(() => null))?.status === 404, 120);
        const antes = RES.length;
        if (name) PLAN.push({ name, input });
        escribe(cel, dice + (intento > 1 ? ' ' : ''));
        if (await hasta(() => RES.length > antes, espera)) { const r = RES[RES.length - 1]; if (r && r.necesitaConfirmacion === true) ultimaPrep = [dice, name, input]; return r; }
        const i = PLAN.findIndex((p) => p.name === name && p.input === input); if (i >= 0) PLAN.splice(i, 1);
      }
      throw new Error(`la herramienta ${name} no respondió (${dice})`);
    };
    /** el «sí» del corredor; si la API se recargó entre medio (la preparación vive en memoria), se vuelve a preparar y se confirma otra vez */
    const herrSi = async (name, input) => {
      for (let i = 0; i < 3; i++) {
        const r = await herr('sí', name, input);
        if (!(r && r.error && /Primero hay que preparar/.test(r.error) && ultimaPrep)) return r;
        console.log('    (la API se recargó: se vuelve a preparar)');
        await herr(...ultimaPrep);
      }
      throw new Error('no se pudo confirmar ' + name);
    };
    DEPURAR = () => JSON.stringify({ respuestasAlCorredor: salidas(cel).slice(-4).map((t) => String(t).slice(0, 120)), planPendiente: PLAN.length, iaLlamadas: IA.llamadas.length });
    const sinEnviar = (antes) => ENVIOS.length === antes;

    let e0 = 0; let x = null; let opFirma = null;
    if (SEC('mandato')) {
    // =============================================================== 1. mandato de arriendo
    console.log('· mandato');
    e0 = ENVIOS.length;
    x = await herr('Juanita, prepárame el mandato de la PF-9101', 'preparar_mandato', { propiedad: 'PF-9101' });
    ok(x.ok && x.listo === false && x.faltan.some((f) => /RUT de Rosa Propietaria/.test(f)) && x.faltan.some((f) => /correo de Rosa Propietaria/.test(f)), 'sin RUT ni correo del propietario: dice qué falta de él (' + (x.faltan || x.error) + ')');
    ok(sinEnviar(e0) && !(await db.firma.count({ where: { corredoraId: co.id } })), 'preparar no envía ni cobra ni registra firmas');
    x = await herr('Juanita, el RUT de Rosa es 11.111.111-1 y su correo rosa@prueba.cl', 'preparar_mandato', { propiedad: 'PF-9101', personas: [{ persona: 'Rosa', rut: '11.111.111-2', email: 'rosa@prueba.cl' }] });
    ok(x.error && /RUT/.test(x.error) && /no es válido/.test(x.error), 'un RUT con dígito verificador malo se rechaza: ' + x.error);
    x = await herr('Juanita, el RUT de Rosa es ' + rutF(11111111) + ', con exclusividad y garantía de un mes', 'preparar_mandato', { propiedad: 'PF-9101', personas: [{ persona: 'propietario', rut: rutF(11111111), email: 'rosa@prueba.cl' }], exclusividad: true, meses_garantia: 1, condiciones: 'Solo no fumadores', unidad: '504' });
    ok(x.ok && x.listo === true && x.necesitaConfirmacion === true && x.enviada === false, 'con todo completo queda listo y pide la confirmación (' + JSON.stringify(x.faltan || x.error || '') + ')');
    ok(x.firmantes.length === 1 && x.firmantes[0].nombre === 'Rosa Propietaria' && x.firmantes[0].rol === 'Mandante' && x.datos.some((d) => /Exclusividad: sí/.test(d)) && x.datos.some((d) => /Meses de garantía: 1/.test(d)) && x.datos.some((d) => /Solo no fumadores/.test(d)), 'el resumen trae los firmantes y los datos del mandato');
    ok(/^https?:\/\//.test(x.enlaceVistaPrevia || ''), 'trae un enlace para revisar el PDF');
    const pdfVista = await fetch(x.enlaceVistaPrevia).then(async (q) => ({ s: q.status, b: Buffer.from(await q.arrayBuffer()) })).catch(() => ({ s: 0, b: Buffer.alloc(0) }));
    ok(pdfVista.s === 200 && pdfVista.b.slice(0, 4).toString() === '%PDF', 'el enlace descarga el PDF de vista previa');
    const rosa2 = await db.persona.findUnique({ where: { id: rosa.id } });
    const p1b = await db.propiedad.findUnique({ where: { id: p1.id } });
    ok(rosa2.rutFormato === rutF(11111111) && rosa2.email === 'rosa@prueba.cl' && p1b.ficha.exclusividad === true && p1b.ficha.mesesGarantia === 1 && p1b.ficha.condicionesMandato === 'Solo no fumadores', 'lo que dio el corredor quedó guardado en su lugar (ficha del propietario y de la propiedad)');
    ok(!!(await db.actividad.findFirst({ where: { corredoraId: co.id, entidadId: p1.id, texto: { contains: 'por WhatsApp' } } })), 'y queda en el historial de la propiedad');
    ok(sinEnviar(e0), 'aún no se envió nada');
    x = await herr('espera, cámbialo', 'enviar_mandato', { propiedad: 'PF-9101', confirmado: true });
    ok(x.error && /todavía no confirmó/.test(x.error) && sinEnviar(e0), 'si el modelo confirma por su cuenta, el servidor lo rechaza');
    x = await herr('sí, pero a las 12', 'enviar_mandato', { propiedad: 'PF-9101', confirmado: true });
    ok(x.error && /todavía no confirmó/.test(x.error) && sinEnviar(e0), 'un «sí, pero…» no es una confirmación');
    x = await herrSi('enviar_mandato', { propiedad: 'PF-9101', confirmado: true });
    ok(x.ok && x.enviada === true && x.operacion > OPBASE && ENVIOS.length === e0 + 1, 'con el «sí» se envía a firmar (operación ' + x.operacion + ')');
    const env1 = ENVIOS.at(-1);
    ok(env1.pdf.slice(0, 4).toString() === '%PDF' && env1.firmantes.length === 1 && env1.firmantes[0].rut === rutF(11111111) && env1.firmantes[0].email === 'rosa@prueba.cl' && env1.firmantes[0].alias === 'mandante', 'sale el PDF a la API de Portalfirma, a la propietaria con su RUT y correo');
    const f1 = await db.firma.findFirst({ where: { corredoraId: co.id, operacion: x.operacion } });
    ok(f1 && /^Mandato de arriendo/.test(f1.documento) && f1.propiedadIds.includes(p1.id) && f1.enviadoPorId === c1.id && f1.estado === 'en_firma', 'la firma queda registrada, ligada a la propiedad y a quien la envió');
    x = await herr('sí', 'enviar_mandato', { propiedad: 'PF-9101', confirmado: true });
    ok(x.error && /Primero hay que preparar/.test(x.error) && ENVIOS.length === e0 + 1, 'un segundo «sí» no lo envía otra vez');
    x = await herr('Juanita, el mandato de la PF-9102', 'preparar_mandato', { propiedad: 'PF-9102' });
    ok(x.error && /venta y en arriendo/.test(x.error), 'si la propiedad va en venta y arriendo, pregunta cuál mandato');
    x = await herr('Juanita, el mandato de la PF-9104', 'preparar_mandato', { propiedad: 'PF-9104' });
    ok(x.error && /la captó otro corredor/.test(x.error), 'un corredor no arma el mandato de una propiedad que captó otro');
    x = await herr('Juanita, el mandato de venta de la PF-9103', 'preparar_mandato', { propiedad: 'PF-9103', comision_pct: 3, publicar_portales: false });
    ok(x.ok && x.listo === true && x.datos.some((d) => /Comisión: 3 % \+ IVA/.test(d)) && x.datos.some((d) => /Publicar en portales: no/.test(d)), 'mandato de venta: usa los datos del CRM, guarda la comisión y no pide lo que ya está');
    }
    if (SEC('carta')) {
    // =============================================================== 2. carta oferta (arriendo)
    console.log('· carta oferta');
    e0 = ENVIOS.length;
    x = await herr('Juanita, prepara la carta oferta del NG-901', 'preparar_carta_oferta', { negocio: 'NG-901' });
    ok(x.ok && x.listo === false && x.faltan.some((f) => /monto de la oferta/.test(f)) && x.firmantes[0].nombre === 'Ana Arrendataria' && x.firmantes[0].rol === 'Arrendatario', 'sin monto: dice que falta y el oferente sale del negocio');
    x = await herr('Juanita, ofrece 650 mil, garantía de un mes, vigencia 5 días', 'preparar_carta_oferta', { negocio: 'NG-901', monto: 650000, moneda: 'CLP', garantia: '1 mes de renta', plazo: '12 meses', vigencia_dias: 5, condiciones: 'Entrega con pintura reciente' });
    ok(x.ok && x.listo && x.necesitaConfirmacion && x.datos.some((d) => /Canon ofrecido: \$650\.000/.test(d)) && x.datos.some((d) => /Vigencia: 5 días/.test(d)) && /^https?:/.test(x.enlaceVistaPrevia || ''), 'listo: resumen con el canon, la vigencia y el enlace al PDF (' + JSON.stringify(x.faltan || x.error || '') + ')');
    const nA2 = await db.negocio.findUnique({ where: { id: nA.id } });
    ok(nA2.datos.valor.valor === 650000 && nA2.datos.oferta.garantia === '1 mes de renta' && nA2.datos.oferta.vigencia === 5 && nA2.version > nA.version, 'las condiciones quedaron en el negocio (y su versión subió para que la app lo traiga)');
    x = await herrSi('enviar_carta_oferta', { negocio: 'NG-901', confirmado: true });
    ok(x.ok && x.enviada && ENVIOS.length === e0 + 1 && ENVIOS.at(-1).firmantes[0].rut === rutF(7654321), 'con el sí se envía a firmar al oferente');
    const nA3 = await db.negocio.findUnique({ where: { id: nA.id } });
    const fA = await db.firma.findFirst({ where: { corredoraId: co.id, operacion: x.operacion } });
    ok(fA && fA.negocioId === nA.id && /^Carta oferta/.test(fA.documento) && nA3.datos.firmas.oferta.operacion === x.operacion, 'la firma queda ligada al negocio (la revisión de firmas lo avanzará sola)');
    // otro corredor: no ve el negocio
    x = await herr('Juanita, la carta del NG-905', 'preparar_carta_oferta', { negocio: 'NG-905' });
    ok(x.error && /No encontré el negocio/.test(x.error), 'un corredor no arma documentos de un negocio ajeno');
    x = await herr('Juanita, la carta oferta', 'preparar_carta_oferta', {});
    ok(x.error && /Falta indicar el negocio/.test(x.error), 'sin negocio, pregunta cuál');
    }
    if (SEC('promesa')) {
    // =============================================================== 3. promesa y escritura (venta)
    console.log('· promesa y escritura');
    e0 = ENVIOS.length;
    x = await herr('Juanita, prepara la promesa del NG-902', 'preparar_promesa', { negocio: 'NG-902' });
    ok(x.ok && x.listo === false && x.faltan.length === 1 && /inscripción de dominio/.test(x.faltan[0]) && x.firmantes.map((f) => f.rol).join() === 'Comprador,Vendedor', 'solo falta la inscripción de dominio (todo lo demás sale del negocio y del CRM)');
    x = await herr('Juanita, fojas 1234, número 567, año 2019, CBR de Santiago; escritura en 60 días, notaría Pérez', 'preparar_promesa', { negocio: 'NG-902', fojas: '1234', numero_inscripcion: '567', anio_inscripcion: '2019', conservador: 'Santiago', escritura_dias: 60, notaria: 'Notaría Pérez', pie_pct: 15 });
    ok(x.ok && x.listo && x.datos.some((d) => /Pie: 15 %/.test(d)) && x.datos.some((d) => /Escritura en: 60 días/.test(d)) && x.datos.some((d) => /Notaría: Notaría Pérez/.test(d)), 'listo: pie, plazo de escritura y notaría en el resumen (' + JSON.stringify(x.faltan || x.error || '') + ')');
    x = await herrSi('enviar_promesa', { negocio: 'NG-902', confirmado: true });
    ok(x.ok && x.enviada && ENVIOS.at(-1).firmantes.map((f) => f.alias).join() === 'comprador,vendedor', 'se envía al comprador y al vendedor');
    const nB2 = await db.negocio.findUnique({ where: { id: nB.id } });
    ok(nB2.datos.firmas.promesa.operacion === x.operacion && nB2.datos.ciclo.promesa.escrituraDias === 60, 'ligada a la etapa «promesa» del negocio (al firmarse avanza solo)');
    x = await herr('Juanita, el borrador de la escritura del NG-902', 'preparar_escritura', { negocio: 'NG-902', notaria: 'Notaría Pérez', modo_pago: 'credito', banco: 'Banco de Chile' });
    ok(x.ok && x.listo && x.datos.some((d) => /crédito \(Banco de Chile\)/.test(d)) && /^https?:/.test(x.enlaceVistaPrevia || '') && Array.isArray(x.sinCompletarOpcional), 'borrador de escritura: se puede llevar a la notaría (PDF) y avisa lo opcional que queda en blanco: ' + JSON.stringify(x.sinCompletarOpcional));
    x = await herr('Juanita, la escritura del NG-901', 'preparar_escritura', { negocio: 'NG-901' });
    ok(x.error && /solo para negocios de venta/.test(x.error), 'la escritura de un arriendo se rechaza');
    }
    if (SEC('contrato')) {
    // =============================================================== 4. contrato de arriendo con su revisión
    console.log('· contrato');
    e0 = ENVIOS.length;
    x = await herr('Juanita, prepara el contrato del NG-903', 'preparar_contrato_arriendo', { negocio: 'NG-903' });
    ok(x.ok && x.listo === false && x.faltan.some((f) => /fecha de inicio/.test(f)) && x.faltan.some((f) => /plazo/.test(f)) && x.faltan.some((f) => /guardar_version_contrato/.test(f)), 'dice qué falta: inicio, plazo y guardar la versión');
    ok(x.firmantes.map((f) => f.rol).join() === 'Arrendador,Arrendatario,Codeudor' && x.firmantes[2].nombre === 'Sofía Aval', 'los firmantes: propietario, arrendatario y el aval de la evaluación');
    x = await herr('Juanita, desde el 1 de diciembre, 12 meses, IPC anual', 'preparar_contrato_arriendo', { negocio: 'NG-903', inicio: '2037-12-01', plazo_meses: 12, reajuste: 'ipc_anual', garantia_meses: 1, dia_pago: 5 });
    ok(x.ok && x.listo === false && x.faltan.length === 1 && /guardar_version_contrato/.test(x.faltan[0]) && /^https?:/.test(x.enlaceVistaPrevia || ''), 'con las condiciones solo falta guardar la versión (y ya hay PDF para revisar)');
    x = await herr('Juanita, desde mañana', 'preparar_contrato_arriendo', { negocio: 'NG-903', inicio: '01/12/2037' });
    ok(x.error && /AAAA-MM-DD/.test(x.error), 'una fecha mal escrita se rechaza');
    x = await herr('Juanita, guarda la versión', 'guardar_version_contrato', { negocio: 'NG-903', nota: 'primera versión' });
    ok(x.ok && x.version === 1 && x.firmantes.length === 3 && /^https?:/.test(x.enlaceVersion || ''), 'guarda la versión 1 con su PDF');
    const nC2 = await db.negocio.findUnique({ where: { id: nC.id } });
    const v1 = nC2.datos.ciclo.contrato.versiones[0];
    ok(v1.n === 1 && v1.archivo.clave.startsWith(`c/${co.id}/r/archivos_negocio/todos/${nC.id}/`) && v1.firmantes.length === 3 && v1.condiciones.plazoMeses === 12 && Object.keys(nC2.datos.ciclo.contrato.aprobado).length === 0, 'la versión queda en el negocio como en la app (PDF en los archivos del negocio, firmantes, condiciones)');
    x = await herr('Juanita, cambia el plazo a 24 meses', 'preparar_contrato_arriendo', { negocio: 'NG-903', plazo_meses: 24 });
    ok(x.faltan.some((f) => /cambiaron después de la versión 1/.test(f)), 'si cambian las condiciones después de la versión, exige guardar una nueva');
    x = await herr('Juanita, guarda la nueva versión', 'guardar_version_contrato', { negocio: 'NG-903' });
    ok(x.ok && x.version === 2, 'versión 2');
    // revisión: a quiénes se les manda
    const revisiones = () => W.enviados.filter((e) => /versión 2/.test(e.message || '') && dig(W.contactos[e.contactId]) !== dig('+56 9 9111 1111')).length;
    x = await herr('Juanita, mándales el contrato a revisión', 'enviar_contrato_a_revision', { negocio: 'NG-903' });
    ok(x.ok && x.necesitaConfirmacion && x.mensajes.length === 3 && x.mensajes.every((m) => /versión 2/.test(m.mensaje)) && x.mensajes[2].mensaje.includes('codeudor'), 'primero muestra a quién y el mensaje (3 partes; al aval se le dice que es codeudor)');
    ok(revisiones() === 0, 'todavía no escribió a nadie');
    x = await herrSi('enviar_contrato_a_revision', { negocio: 'NG-903', confirmado: true });
    ok(x.ok && x.enviadoA.length === 3, 'con el sí les escribe a las tres partes: ' + JSON.stringify(x));
    const aLuis = W.enviados.filter((e) => /versión 2/.test(e.message || '') && W.contactos[e.contactId] && dig(W.contactos[e.contactId]) === dig(luis.telefono));
    ok(aLuis.length === 1 && /Luis/.test(aLuis[0].message) && (aLuis[0].attachments || []).length === 1, 'al propietario le llega su mensaje con el PDF adjunto');
    const nC3 = await db.negocio.findUnique({ where: { id: nC.id } });
    ok(nC3.datos.ciclo.contrato.envios.length === 3, 'los envíos quedan anotados en el negocio');
    // aprobaciones
    x = await herr('Juanita, ¿lo mando a firmar?', 'enviar_contrato_arriendo', { negocio: 'NG-903' });
    ok(x.ok && x.listo === false && x.faltan.some((f) => /Falta la aprobación de .*Luis Dueño.*Ana Arrendataria.*Sofía Aval/.test(f)), 'sin aprobaciones no se puede enviar a firmar: dice quiénes faltan');
    const aprobados = async () => Object.keys((await db.negocio.findUnique({ where: { id: nC.id } })).datos.ciclo.contrato.aprobado || {});
    x = await herr('Juanita, el propietario aprobó', 'aprobar_contrato', { negocio: 'NG-903', firmante: 'Luis' }); // herramienta de negocios (misma forma: ciclo.contrato.aprobado)
    ok(x.ok && (await aprobados()).join() === luis.id, 'registra la aprobación del propietario (herramienta de negocios)');
    x = await herr('Juanita, Ana aprobó', 'aprobar_contrato', { negocio: 'NG-903', firmante: 'Ana' });
    ok(x.ok && (await aprobados()).length === 2, 'por nombre también');
    x = await herr('Juanita, Pepe aprobó', 'aprobar_contrato', { negocio: 'NG-903', firmante: 'Pepe' });
    ok(x.error && /Indica el firmante/.test(x.error), 'alguien que no firma no puede aprobar');
    x = await herr('Juanita, aprobaron todos', 'aprobar_contrato', { negocio: 'NG-903', firmante: 'todos' });
    ok(x.ok && (await aprobados()).length === 3, 'aprobaron todos');
    x = await herr('Juanita, mándalo a firmar', 'enviar_contrato_arriendo', { negocio: 'NG-903' });
    ok(x.ok && x.listo && x.necesitaConfirmacion && x.datos.some((d) => /Versión del contrato: 2/.test(d)) && x.datos.some((d) => /Aprobaron: 3 de 3/.test(d)), 'aprobado por todos: muestra el resumen y pide el sí');
    ok(sinEnviar(e0), 'todavía no envió nada');
    x = await herrSi('enviar_contrato_arriendo', { negocio: 'NG-903', confirmado: true });
    ok(x.ok && x.enviada && ENVIOS.length === e0 + 1 && ENVIOS.at(-1).firmantes.map((f) => f.alias).join() === 'arrendador,arrendatario,codeudor', 'con el sí se envía a firmar a las tres partes');
    const nC4 = await db.negocio.findUnique({ where: { id: nC.id } });
    const fC = await db.firma.findFirst({ where: { corredoraId: co.id, operacion: x.operacion } });
    ok(fC && fC.negocioId === nC.id && fC.datos.versionClave === nC4.datos.ciclo.contrato.versiones[1].archivo.clave && nC4.datos.firmas.contrato.operacion === x.operacion, 'ligada a la etapa «contrato» del negocio (usó el PDF de la versión 2)');
    }
    if (SEC('entrega')) {
    // =============================================================== 5. acta de entrega
    console.log('· acta de entrega');
    e0 = ENVIOS.length;
    x = await herr('Juanita, el inventario del NG-904: el living está bueno, hay un sofá regular', 'preparar_acta_entrega', { negocio: 'NG-904', inventario: [{ espacio: 'Living', estado: 'bueno', items: [{ nombre: 'Sofá', cantidad: 1, estado: 'regular', nota: 'mancha en el brazo' }] }], accesos: [{ nombre: 'Llave puerta principal', cantidad: 2 }], medidores: { luz: { numero: '123456', lectura: '8800' } } });
    ok(x.ok && x.listo === false && x.faltan.length === 1 && /fecha de entrega/.test(x.faltan[0]) && x.datos.some((d) => /Inventario: 1 espacios \(Living: bueno\), 1 ítems/.test(d)), 'carga el inventario dictado; solo falta la fecha de entrega: ' + JSON.stringify(x.faltan || x.error));
    x = await herr('Juanita, la cocina está regular, entrega hoy', 'preparar_acta_entrega', { negocio: 'NG-904', fecha: hoyISO, inventario: [{ espacio: 'Cocina', estado: 'regular', items: [{ nombre: 'Horno', estado: 'bueno' }, { nombre: 'Campana', estado: 'malo', nota: 'no enciende' }] }], accesos: [{ nombre: 'Control portón', cantidad: 1 }], aspectos: ['Grifería completa funcionando'] });
    ok(x.ok && x.listo && x.datos.some((d) => /Inventario: 2 espacios \(Living: bueno; Cocina: regular\), 3 ítems/.test(d)) && x.datos.some((d) => /Accesos: 2 Llave puerta principal, 1 Control portón/.test(d)), 'cada llamada suma al inventario ya cargado (' + JSON.stringify(x.faltan || x.error || '') + ')');
    const nD2 = await db.negocio.findUnique({ where: { id: nD.id } });
    ok(nD2.datos.ciclo.entrega.inventario.length === 2 && nD2.datos.ciclo.entrega.medidores.luz.lectura === '8800' && nD2.datos.ciclo.entrega.aspectos.length === 1, 'lo dictado queda en el negocio (ciclo.entrega), igual que lo guarda la app');
    x = await herr('Juanita, el baño: grifería mala', 'preparar_acta_entrega', { negocio: 'NG-904', inventario: [{ espacio: 'Baño', estado: 'estado raro' }] });
    ok(x.error && /el estado debe ser bueno, regular, malo o no aplica/.test(x.error), 'un estado inválido se rechaza');
    x = await herr('sí', 'enviar_acta_entrega', { negocio: 'NG-904', confirmado: true });
    ok(x.error && /Primero hay que preparar/.test(x.error), 'tras un error al preparar, no queda nada que confirmar');
    x = await herr('Juanita, envía el acta de entrega del NG-904', 'enviar_acta_entrega', { negocio: 'NG-904' });
    ok(x.ok && x.necesitaConfirmacion, 'enviar sin confirmado muestra el resumen y pide el sí');
    x = await herrSi('enviar_acta_entrega', { negocio: 'NG-904', confirmado: true });
    ok(x.ok && x.enviada && ENVIOS.at(-1).firmantes.map((f) => f.alias).join() === 'arrendador,arrendatario', 'se envía a firmar al arrendador y al arrendatario');
    opFirma = x.operacion;
    const nD3 = await db.negocio.findUnique({ where: { id: nD.id } });
    ok(nD3.datos.firmas.entrega_acta?.operacion === x.operacion, 'ligada a «entrega_acta» del negocio');
    }
    if (SEC('visita')) {
    // =============================================================== 6. PDF del acta de visita
    console.log('· acta de visita');
    x = await herr('Juanita, pásame el PDF del acta del NG-902', 'compartir_acta_visita', { negocio: 'NG-902' });
    ok(x.ok && /^https?:/.test(x.enlace || '') && x.visitante === 'Beto Comprador' && x.vigencia === '7 días', 'arma el PDF del acta y entrega el enlace al corredor');
    const alVisitante = () => W.enviados.filter((e) => /acta de la visita/.test(e.message || '') && dig(W.contactos[e.contactId]) === dig(beto.telefono)).length;
    x = await herr('Juanita, mándaselo a Beto', 'compartir_acta_visita', { negocio: 'NG-902', a_visitante: true });
    ok(x.ok && x.necesitaConfirmacion && /Hola Beto/.test(x.mensaje) && alVisitante() === 0, 'al visitante: primero muestra el mensaje y no escribe todavía');
    x = await herrSi('compartir_acta_visita', { negocio: 'NG-902', a_visitante: true, confirmado: true });
    ok(x.ok && x.enviada === true && W.enviados.some((e) => /acta de la visita/.test(e.message || '') && dig(W.contactos[e.contactId]) === dig(beto.telefono)), 'con el sí se lo manda por WhatsApp (escribió hace poco)');
    x = await herr('Juanita, el acta de otro', 'compartir_acta_visita', { negocio: 'NG-905' });
    ok(x.error && /No encontré el negocio/.test(x.error), 'un negocio ajeno no se comparte');
    }
    if (SEC('firmas')) {
    // =============================================================== 7. firmas: seguimiento y reenvío
    console.log('· firmas');
    x = await herr('Juanita, ¿qué falta por firmar?', 'firmas_pendientes_detalle', {});
    ok(x.ok && x.total >= 1 && x.firmas.every((f) => f.faltan.length > 0) && x.firmas.some((f) => /^Acta de entrega/.test(f.documento) && f.faltan.length === 2), 'lista lo que sigue en firma y quién falta (' + x.total + ' documentos)');
    x = await herr('Juanita, ¿cómo va el contrato?', 'firmas_pendientes_detalle', { negocio: 'NG-904' });
    ok(x.ok && x.total === 1 && x.filtro === 'del negocio NG-904', 'se puede acotar a un negocio');
    FIRMADOS.add(opFirma + '|' + rutLimpio(rutF(12345678)));
    x = await herr('Juanita, seguimiento del acta', 'seguimiento_firma', { operacion: opFirma });
    const o1 = x.operaciones?.[0] || {};
    ok(x.ok && o1.firmaron === '1 de 2' && o1.faltan.length === 1 && o1.firmantes.find((f) => /Ana/.test(f.nombre)).correo === 'ana@prueba.cl', 'seguimiento en vivo: firmó el propietario, falta el arrendatario (con su correo)');
    const nFirmado = await hasta(async () => (await db.firma.findFirst({ where: { corredoraId: co.id, operacion: opFirma } })).firmados === 1, 40);
    ok(nFirmado, 'al notar el cambio, apura la revisión de firmas y la base se actualiza');
    x = await herr('Juanita, reenvíale el enlace a la arrendataria', 'reenviar_firma', { operacion: opFirma, firmante: 'arrendatario' });
    ok(x.ok && x.necesitaConfirmacion && x.firmante === 'Ana Arrendataria' && x.correo === 'ana@prueba.cl' && REENVIOS.length === 0, 'primero dice a quién se lo reenviaría');
    x = await herrSi('reenviar_firma', { operacion: opFirma, firmante: 'arrendatario', confirmado: true });
    ok(x.ok && x.enviada && REENVIOS.length === 1 && REENVIOS[0].processId === OPS[opFirma].pid && REENVIOS[0].signatoryId === `sig-${opFirma}-1`, 'con el sí, Portalfirma reenvía el enlace a ese firmante');
    x = await herr('Juanita, reenvíale al propietario', 'reenviar_firma', { operacion: opFirma, firmante: 'Luis' });
    ok(x.error && /No encuentro a «Luis»/.test(x.error), 'a quien ya firmó no se le reenvía');
    }
    if (SEC('plantillas')) {
    // =============================================================== 8. plantillas de la Notaría virtual
    console.log('· plantillas');
    x = await herr('Juanita, ¿qué plantillas hay de contrato?', 'plantillas_notaria', { texto: 'contrato' });
    ok(x.ok && x.plantillas[0].id === 'tv-contrato' && /Contrato de arriendo/.test(x.plantillas[0].nombre), 'lista las plantillas de la cuenta');
    x = await herr('Juanita, llena esa plantilla para el NG-901', 'formulario_plantilla', { plantilla: 'tv-contrato', negocio: 'NG-901' });
    ok(x.ok && x.listo === false && x.faltan.length === 1 && /Cláusula especial/.test(x.faltan[0]) && x.grupos[0].persona === 'Ana Arrendataria' && x.grupos[1].completos.some((c) => /Canon mensual: \$800\.000/.test(c)), 'prellena con el negocio, la propiedad y la persona; solo falta la cláusula especial (' + JSON.stringify(x.faltan) + ')');
    e0 = ENVIOS.length;
    x = await herr('Juanita, genéralo con la cláusula', 'generar_documento_plantilla', { plantilla: 'tv-contrato', negocio: 'NG-901', valores: { 'i-clau': 'No se permiten mascotas' } });
    ok(x.ok && x.listo && x.necesitaConfirmacion && x.firmantes[0].includes('Ana Arrendataria') && sinEnviar(e0), 'resumen del documento; no genera todavía');
    x = await herrSi('generar_documento_plantilla', { plantilla: 'tv-contrato', negocio: 'NG-901', confirmado: true });
    ok(x.ok && x.enviada && x.operacion > OPBASE && ENVIOS.at(-1).values['i-clau'] === 'No se permiten mascotas' && ENVIOS.at(-1).values['a-rut'] === rutF(7654321) && ENVIOS.at(-1).values['i-canon'] === '$800.000', 'con el sí se genera y envía a firmar con los valores prellenados y el dato nuevo');
    const fP = await db.firma.findFirst({ where: { corredoraId: co.id, operacion: x.operacion } });
    ok(fP && fP.origen === 'plantilla' && fP.negocioId === nA.id && fP.propiedadIds.includes(p5.id), 'queda registrada como firma de plantilla, ligada al negocio y la propiedad');
    }
    if (SEC('buscar')) {
    // =============================================================== 9. buscar documento y saldo
    console.log('· buscar y saldo');
    x = await herr('Juanita, ¿tenemos el mandato de la PF-9101?', 'buscar_documento', { documento: 'mandato', propiedad: 'PF-9101' });
    ok(x.ok && x.archivos.length === 1 && x.archivos[0].nombre === 'Mandato antiguo firmado.pdf' && (!SEC('mandato') || x.enviadosAFirmar.some((f) => /^Mandato de arriendo/.test(f.documento) && f.estado === 'en_firma')), 'encuentra el archivo guardado y el mandato que se envió a firmar');
    x = await herr('Juanita, ¿y el comprobante de la PF-9101?', 'buscar_documento', { documento: 'comprobante', propiedad: 'PF-9101' });
    ok(x.ok && x.archivos.length === 0 && x.enviadosAFirmar.length === 0 && /No hay un documento/.test(x.indicacion), 'si no hay, lo dice y ofrece armarlo');
    x = await herr('Juanita, ¿cuánto saldo queda?', 'saldo', {});
    ok(x.ok && x.saldo === 125000 && /125\.000/.test(x.mensaje), 'el saldo de Portalfirma');
    }
    // =============================================================== 10. todo quedó en el historial y nada se duplicó
    ok((await db.actividad.count({ where: { corredoraId: co.id, texto: { contains: 'por WhatsApp' } } })) >= (process.env.DOCS_SECCIONES ? 1 : 10), 'lo que se guardó por WhatsApp quedó en el historial');
    const vistos = new Set(); let repetido = null;
    for (const e of W.enviados) { const k = `${e.contactId}|${e.message}`; if (vistos.has(k) && !/^(\*\w+\* · )/.test(e.message || '')) repetido = e.message; vistos.add(k); }
    ok(!repetido, 'ningún mensaje a las partes salió dos veces' + (repetido ? ': ' + String(repetido).slice(0, 80) : ''));
    const aj = await db.waAjustes.findUnique({ where: { corredoraId: co.id } });
    ok(aj.lectorEn && !aj.lectorError, 'el lector terminó sus rondas sin error');
  } finally {
    srv.close(); ia.close(); pfs.close();
    console.log('  · limpiando los datos de prueba…');
    if (co) {
      const w = { where: { corredoraId: co.id } };
      for (const m of ['waEntrante', 'waVinculo', 'waHilo', 'waEnviado', 'waConversacion', 'waAjustes', 'iaConsumo', 'waProgramado', 'aviso', 'conexion', 'registro', 'actividad', 'evento', 'firma', 'leadMensaje', 'lead', 'negocio']) await db[m].deleteMany(w).catch((e) => console.warn(m, e.message));
      await db.propiedadDocumento.deleteMany({ where: { propiedad: { corredoraId: co.id } } }).catch(() => null);
      await db.propiedadPersona.deleteMany({ where: { propiedad: { corredoraId: co.id } } });
      await db.propiedad.deleteMany(w); await db.persona.deleteMany(w); await db.contador.deleteMany(w);
      await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
      await db.usuario.deleteMany({ where: { id: { in: usuarios } } });
      await db.corredora.delete({ where: { id: co.id } }).catch((e) => console.warn('no se borró la corredora de prueba:', e.message));
    }
    await db.$disconnect();
  }
})().then(() => { console.log('OK documentos-herramientas'); process.exit(process.exitCode ?? 0); }, async (e) => { console.error(e.message); console.error('  estado:', await Promise.resolve(DEPURAR()).catch(() => ''));
  console.error('  último resultado de herramienta:', JSON.stringify(RES.at(-1) ?? null).slice(0, 1500)); process.exit(1); }); // los servidores falsos dejan conexiones abiertas
