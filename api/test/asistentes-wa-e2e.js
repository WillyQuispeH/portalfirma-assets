// Prueba de punta a punta de los asistentes de WhatsApp del servidor (src/whatsapp: lector, ejecutivo, Sofía y Tomás,
// postventa, observador, envíos de la app), contra la API corriendo (yarn dev) y asset_dev, con un wechatia FALSO y una
// IA FALSA (API de mensajes de Anthropic) que levanta esta misma prueba. La conexión de prueba guarda sus direcciones
// («base» y «iaBase»): fuera de producción el lector solo lee corredoras así, nunca las reales.
// Crea una corredora de prueba con su administrador y un corredor, y al final la borra con todo lo suyo.
// Uso: node test/asistentes-wa-e2e.js [url]     (tarda ~1,5 min)
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

// ---------------------------------------------------------------- IA falsa (API de mensajes de Anthropic)
const IA = { llamadas: [], docs: [] };
const texto = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
const herramienta = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu' + Date.now() + Math.random(), name, input }], stop_reason: 'tool_use' });
function respuestaIa(b) {
  const sis = typeof b.system === 'string' ? b.system : '';
  if (/analista que revisa los documentos/.test(sis)) return texto(JSON.stringify(IA.docs.shift() || { clase: 'otro', legible: false, resumen: '', alertas: [] }));
  if (/analista de una corredora de propiedades/.test(sis)) return texto(JSON.stringify({ resumen: 'Resumen de prueba para el corredor.' }));
  const ult = b.messages.at(-1);
  const contenido = typeof ult.content === 'string' ? ult.content : ult.content.map((x) => x.text || '').join('\n');
  if (/EXTRAER_LEAD/.test(contenido))
    return texto(JSON.stringify({ resumen: 'Busca depto 2D en Ñuñoa', busqueda: { operacion: 'arriendo', tipo: 'departamento', comunas: ['Ñuñoa'], dormitorios: 2, presupuesto: { valor: 500000, moneda: 'CLP' } }, email: null, rut: null, telefono: null, perfil: 'Profesional joven', estadoSugerido: 'contactado', proximaAccion: { texto: 'Enviarle opciones en Ñuñoa', fecha: null } }));
  const tr = Array.isArray(ult.content) && ult.content.find((x) => x.type === 'tool_result');
  if (tr) {
    const r = JSON.parse(tr.content);
    if (typeof r.propiedades === 'number') return texto(`Tienes ${r.propiedades} propiedad${r.propiedades === 1 ? '' : 'es'} en la cartera.`);
    if (r.nota && r.ok) return texto('Listo: lo dejo para cuando abras Asset.');
    if (r.horarios) return texto(r.horarios.length ? `Tengo el ${r.horarios[0].fecha} a las ${r.horarios[0].horas[0]}. ¿Te acomoda?` : 'Esta semana no tengo horarios.');
    if (r.agendada) return texto(`Listo, quedó tu visita a ${r.agendada.direccion} el ${r.agendada.fecha} a las ${r.agendada.hora}.${r.pedir ? ' ' + r.pedir : ''}`);
    if (r.instruccion) return texto('Perfecto, le paso tu disponibilidad a tu corredor y te confirma.');
    if (r.propiedades) { const p = r.propiedades[0]; return texto(p ? `La propiedad de ${p.direccion} tiene gastos comunes de $${Number(p.gastosComunes || 0).toLocaleString('es-CL')}.` : 'No tengo propiedades tuyas registradas.'); }
    if (r.necesitaConfirmacion) return texto(`Datos de la orden: ${r.visitante}, ${r.rut}, ${r.correo}, ${r.fecha}. ¿La envío?`);
    if (r.enviada === true) return texto(`Orden enviada, operación ${r.operacion}.`);
    if (r.guardado) return texto('Gracias, lo anoté.');
    return texto('Uy: ' + (r.error || 'listo'));
  }
  // el equipo del ejecutivo en el servidor (Asset cerrado): consulta el resumen; un contrato lo deja para Asset
  const ORDEN = { codigo_propiedad: 'PF-9002', visitante: 'Ana Visitante', rut: '11.111.111-1', email: 'ana.visitante@prueba.cl', fecha: '2037-12-01', hora: '11:00' };
  if ((b.tools || []).some((t) => t.name === 'orden_visita')) {
    if (/prepárame la orden de visita/i.test(contenido)) return herramienta('orden_visita', ORDEN);
    if (/envía ya la orden/i.test(contenido)) return herramienta('orden_visita', { ...ORDEN, visitante: 'Beto Visitante', rut: '22.222.222-2', email: 'beto@prueba.cl', confirmado: true });
    if (/espera, cámbiala/i.test(contenido)) return herramienta('orden_visita', { ...ORDEN, confirmado: true }); // el modelo se equivoca y confirma solo
    if (/^sí, pero/i.test(contenido)) return herramienta('orden_visita', { codigo_propiedad: 'PF-9002', visitante: 'Ana Visitante', confirmado: true }); // un «sí» con un cambio no es un sí
    if (/^s[ií]$/i.test(contenido.trim())) return herramienta('orden_visita', { codigo_propiedad: 'PF-9002', visitante: 'Ana Visitante', confirmado: true }); // el modelo ya no recuerda los demás argumentos
  }
  if ((b.tools || []).some((t) => t.name === 'resumen'))
    return /contrato/i.test(contenido) ? herramienta('dejar_para_asset', { pedido: contenido.slice(-200) }) : herramienta('resumen', {});
  const sofia = (b.tools || []).some((t) => t.name.startsWith('lead_'));
  const ag = contenido.match(/(\d{4}-\d{2}-\d{2}) a las (\d{2}:\d{2})/);
  if (sofia && ag) return herramienta('lead_agendar_visita', { propiedad: (contenido.match(/PF-\d+/) || [''])[0], fecha: ag[1], hora: ag[2] });
  if (sofia && /visita|agendar/i.test(contenido)) return herramienta('lead_horarios', {});
  if (!sofia && /oferta/i.test(contenido)) return texto('Le pasé tu oferta a Corredor B, él te contacta.'); // lo dice sin llamar a cliente_recado
  if (!sofia && /visita|agend/i.test(contenido)) return herramienta('cliente_recado', { tipo: 'agendar_visita', detalle: contenido.slice(-200), disponibilidad: 'el sábado en la mañana' });
  return herramienta('cliente_info', {});
}
// la transcripción falsa (API de audio de OpenAI): responde según el escenario; con «con letras» en el prompt es la segunda pasada
let IMG = null; // la foto que sirve el wechatia falso (una imagen real: el servidor la decodifica y la pasa a JPG)
const T = { actual: { primera: '' }, llamadas: [] };
function transcripcionFalsa() {
  const s = http.createServer((rq, rs) => {
    const ch = []; rq.on('data', (x) => ch.push(x)); rq.on('end', () => {
      const letras = /con letras/.test(Buffer.concat(ch).toString('latin1')); T.llamadas.push({ letras });
      rs.writeHead(200, { 'content-type': 'application/json' }); rs.end(JSON.stringify({ text: letras && T.actual.segunda != null ? T.actual.segunda : T.actual.primera }));
    });
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}
// Portalfirma falso: la plantilla «Orden de visita» de la Notaría virtual. Registra lo que se manda a firmar.
const PFTOKEN = 'tok-pf-' + SUF; const ENVIOS = []; const FIRMANTE = []; // lo que se hace con el firmante después de enviar
const ENVIOS_PLANTILLA = ENVIOS; const OPERACION = 800000000 + Math.floor(Math.random() * 90000000);
const FORMULARIO = { groups: [
  { type: 'signer', variables: [{ id: 'v-nom', name: 'nombre_visitante_signer', label: 'Nombre del visitante', required: true }, { id: 'v-rut', name: 'rut_visitante_signer', label: 'RUT del visitante', required: true }, { id: 'v-mail', name: 'correo_visitante_signer', label: 'Correo del visitante', required: true }] },
  { type: 'nosigner', variables: [{ id: 'v-fecha', name: 'fecha_visita', label: 'Fecha de la visita', required: true }, { id: 'v-dir', name: 'direccion', label: 'Dirección de la propiedad', required: true }, { id: 'v-foto', name: 'foto', label: 'Foto de la propiedad', kind: 'image', required: true }, { id: 'v-cor', name: 'corredor_nombre', label: 'Nombre del corredor', required: true }] },
] };
function portalfirmaFalso() {
  const s = http.createServer(async (rq, rs) => {
    if (rq.headers.authorization !== 'Bearer ' + PFTOKEN) { rs.writeHead(401).end(); return; }
    let b = ''; for await (const c of rq) b += c;
    const srv = new McpServer({ name: 'pf-falso', version: '1.0.0' });
    srv.tool('template_manage_tools', { action: z.string(), query: z.string().optional(), top_k: z.number().optional(), template_version_id: z.string().optional(), property_id: z.string().optional(), values: z.record(z.string(), z.string()).optional() }, async (a) => {
      const t = (x) => ({ content: [{ type: 'text', text: typeof x === 'string' ? x : JSON.stringify(x) }] });
      if (a.action === 'search') return t([{ template_version_id: 'tv-orden', name: 'Orden de visita - prueba' }]);
      if (a.action === 'get_forms') return t(FORMULARIO);
      if (a.action === 'send_sign') { ENVIOS.push({ values: a.values, plantilla: a.template_version_id }); return t({ operation: OPERACION, message: 'Enviado a firmar' }); }
      return { content: [{ type: 'text', text: 'Error: acción desconocida' }], isError: true };
    });
    srv.tool('process_detail_get_by_operation', { operation: z.number() }, async ({ operation }) => ({ content: [{ type: 'text', text: JSON.stringify({ processId: 'pid-1', operation, status: 'starting', signatories: [{ personId: 'per-1', contractSignatoryId: 'cs-1', rut: '11.111.111-1', name: 'ANA', paternalLastName: 'VISITANTE', maternalLastName: '', email: '', phone: '', url: ' https://cliente.portalfirma.cl/v?c=cs-1&h=portalfirma', signed: false }] }) }] }));
    srv.tool('operation_manage_signing_tools', { action: z.string(), person_id: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), operation: z.union([z.number(), z.string()]).optional(), link: z.string().optional(), name: z.string().optional() }, async (a) => { FIRMANTE.push(a); return { content: [{ type: 'text', text: JSON.stringify(a.action === 'send_signature_link_by_email' ? { sent: true } : { person_id: a.person_id, email: a.email, phone: a.phone }) }] }; });
    const tr = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    rs.on('close', () => { tr.close(); srv.close(); });
    await srv.connect(tr);
    await tr.handleRequest(rq, rs, b ? JSON.parse(b) : undefined);
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
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

(async () => {
  const db = new PrismaClient();
  IMG = await require('sharp')({ create: { width: 3000, height: 2000, channels: 3, background: '#6a8caf' } }).webp().toBuffer();
  const srv = await wechatiaFalso(); const ia = await iaFalsa(); const trf = await transcripcionFalsa(); const pfs = await portalfirmaFalso();
  const base = `http://127.0.0.1:${srv.address().port}`; const iaBase = `http://127.0.0.1:${ia.address().port}`; const transcribirBase = `http://127.0.0.1:${trf.address().port}`;
  let co = null; const usuarios = [];
  try {
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    co = await db.corredora.create({ data: { nombre: `E2E Asistentes ${SUF}` } });
    const nu = async (n, rol, extra = {}) => { const x = await db.usuario.create({ data: { corredoraId: co.id, email: `e2e-as${n}-${SUF}@prueba.cl`, nombre: 'Corredor ' + n.toUpperCase(), hashClave: hash, ...(rol ? { rol } : {}), ...extra } }); usuarios.push(x.id); return x; };
    const adm = await nu('a', 'ADMIN'); const c1 = await nu('b', null, { wechatiaId: 'wu-1' });
    const tA = await ingresar(adm.email, 'clave-e2e-123'); const t1 = await ingresar(c1.email, 'clave-e2e-123');
    ok(tA && t1, 'ingresan el administrador y un corredor');

    // ---- datos: una propiedad, una persona dueña, un lead, una unidad de postventa
    const prop = await db.propiedad.create({ data: { corredoraId: co.id, codigo: 'PF-9001', titulo: 'Depto Irarrázaval', tipo: 'departamento', arriendo: true, precioArriendo: 650000, monedaArriendo: 'CLP', direccion: 'Irarrázaval 2450', comuna: 'Ñuñoa', dormitorios: 2, banos: 1, gastosComunes: 95000, captadorId: c1.id } });
    const carla = await db.persona.create({ data: { corredoraId: co.id, nombre: 'Carla Ruiz', telefono: '+56 9 5555 1111' } });
    await db.propiedadPersona.create({ data: { propiedadId: prop.id, personaId: carla.id, rol: 'propietario' } });
    const lead = await db.lead.create({ data: { id: `ld${SUF}`, corredoraId: co.id, corredorId: c1.id, telefonoNorm: '987654321', origen: 'whatsapp', datos: { nombre: 'Juan Pérez', telefono: '+56 9 8765 4321', propiedades: [prop.id], atiende: 'agente', wa: true } } });
    const reg = (c, id, datos) => db.registro.create({ data: { corredoraId: co.id, coleccion: c, id, datos } });
    await reg('pv_config', 'config', { auto: true });
    await reg('pv_proyectos', 'pj1', { nombre: 'Edificio Prueba' });
    await reg('pv_unidades', 'u1', { proyectoId: 'pj1', numero: '502', propietario: { nombre: 'Ana Rojas', rut: '12.345.678-5', telefono: '+56 9 7777 7777' }, recepcionDOM: '2025-03-10', inscripcionCBR: '2025-06-02' });

    // ---- conexión (wechatia y IA de prueba)
    let r = await req('PUT', '/whatsapp/conexion', { token: TOKEN, locationId: 'loc-1', base }, tA);
    ok(r.s === 200 && r.j.conectado, 'el administrador conecta el WhatsApp de la empresa (wechatia de prueba)');
    const cx = await db.conexion.findFirst({ where: { corredoraId: co.id, proveedor: 'wechatia' } });
    await db.conexion.update({ where: { id: cx.id }, data: { datos: { ...cx.datos, iaBase, transcribirBase } } });
    await db.conexion.create({ data: { corredoraId: co.id, usuarioId: null, dueno: 'corredora', proveedor: 'portalfirma', tipo: 'oauth', estado: 'activa', accesoCif: cifrar(PFTOKEN), datos: { mcpUrl: `http://127.0.0.1:${pfs.address().port}/mcp` } } });
    const prop2 = await db.propiedad.create({ data: { corredoraId: co.id, codigo: 'PF-9002', titulo: 'Casa La Reina', tipo: 'casa', venta: true, precioVenta: 9500, monedaVenta: 'UF', direccion: 'Larraín 6200', comuna: 'La Reina', dormitorios: 4, banos: 3, captadorId: c1.id, fotos: { create: [{ url: `${base}/media/casa.jpg`, orden: 0, destacada: true }] } } });
    r = await req('GET', '/whatsapp/asistentes', null, t1);
    ok(r.j.conectado && r.j.ia && r.j.clientesActivo && r.j.enServidor, 'estado: conectado, con IA y la atención de clientes encendida');

    // ---- 1. el celular del ejecutivo
    r = await req('POST', '/whatsapp/ejecutivo/vincular', { nombre: 'Corredor B' }, t1);
    ok(/^ASSET \d{4}$/.test(r.j.codigo), `el corredor pide su código (${r.j.codigo})`);
    const cel = conv({ telefono: '+56 9 9111 1111', nombre: 'Corredor B' });
    escribe(cel, `Hola! ${r.j.codigo}`);
    ok(await hasta(() => salidas(cel).some((t) => /quedó conectado a PortalFirma Asset de Corredor B/.test(t))), 'al mandar el código desde su celular, queda vinculado y se le confirma por WhatsApp');
    r = await req('GET', '/whatsapp/ejecutivo', null, t1);
    ok(r.j.activo && r.j.telefono === '+56 9 9111 1111' && !r.j.codigo, 'su vínculo queda activo con ese celular');
    // Usuarios de la corredora: quién tiene su celular vinculado; el celular queda como su teléfono; pedirle a otro
    r = await req('GET', '/whatsapp/ejecutivo/equipo', null, tA);
    ok(r.s === 200 && r.j.items.some((x) => x.usuarioId === c1.id && x.telefono === '+56 9 9111 1111') && /4497 5958/.test(r.j.numeroEmpresa), 'el equipo de la corredora muestra quién tiene su celular vinculado');
    ok((await db.usuario.findUnique({ where: { id: c1.id } })).telefono === '+56 9 9111 1111', 'el celular vinculado queda como teléfono del usuario (no tenía)');
    ok((await req('POST', '/whatsapp/ejecutivo/pedir', { usuarioId: adm.id }, t1)).s === 400, 'un corredor no le pide a otro que vincule');
    r = await req('POST', '/whatsapp/ejecutivo/pedir', { usuarioId: c1.id }, tA);
    ok(r.s === 200 && (await db.aviso.findFirst({ where: { usuarioId: c1.id, tipo: 'wa_pedir_vinculo' } })), 'el administrador le pide que vincule: le llega un aviso con los pasos');
    escribe(cel, 'Pedro, ¿cómo va la cartera?');
    ok(await hasta(() => salidas(cel).some((t) => /^\*Pedro\* · Captación\nTienes \d+ propiedad/.test(t))), 'con su Asset cerrado, Pedro le responde desde el servidor (con los datos de la base)');
    // la ORDEN DE VISITA con su Asset cerrado: la prepara y la envía el servidor, solo con la confirmación del corredor
    let antesOv = salidas(cel).length; const enviosAntes = ENVIOS.length;
    escribe(cel, 'Juanita, envía ya la orden de visita de Beto a la PF-9002');
    ok(await hasta(() => salidas(cel).slice(antesOv).some((t) => /^\*Juanita\* · Documentos\nUy: Primero hay que preparar la orden/.test(t))) && ENVIOS.length === enviosAntes, 'si el modelo intenta enviarla sin prepararla antes, el servidor lo rechaza y no se envía nada');
    antesOv = salidas(cel).length;
    escribe(cel, 'Juanita, prepárame la orden de visita de Ana Visitante para la PF-9002');
    ok(await hasta(() => salidas(cel).slice(antesOv).some((t) => /Datos de la orden: Ana Visitante, 11\.111\.111-1, ana\.visitante@prueba\.cl, 2037-12-01\. ¿La envío\?/.test(t))), 'prepararla muestra los datos del documento (visitante, RUT, correo, fecha) y pregunta si la envía');
    ok(ENVIOS.length === enviosAntes && !(await db.firma.count({ where: { corredoraId: co.id } })) && !(await db.persona.count({ where: { corredoraId: co.id, rut: '111111111' } })), 'preparar no envía, no cobra, no registra la firma ni crea a la persona');
    antesOv = salidas(cel).length;
    escribe(cel, 'espera, cámbiala para el jueves');
    ok(await hasta(() => salidas(cel).slice(antesOv).some((t) => /Uy: El corredor todavía no confirmó/.test(t))) && ENVIOS.length === enviosAntes, 'si el modelo confirma por su cuenta (sin que el corredor diga que sí), el servidor lo rechaza y no se envía');
    antesOv = salidas(cel).length;
    escribe(cel, 'sí, pero a las 12');
    ok(await hasta(() => salidas(cel).slice(antesOv).some((t) => /Uy: El corredor todavía no confirmó/.test(t))) && ENVIOS.length === enviosAntes, 'un «sí, pero a las 12» pide un cambio: no cuenta como confirmación y no se envía');
    antesOv = salidas(cel).length;
    escribe(cel, 'sí');
    ok(await hasta(() => salidas(cel).slice(antesOv).some((t) => new RegExp(`Orden enviada, operación ${OPERACION}\\.`).test(t))), 'con el sí del corredor, la envía a firmar (operación ' + OPERACION + ')');
    ok(ENVIOS.length === enviosAntes + 1 && ENVIOS.at(-1).values['v-rut'] === '11.111.111-1' && ENVIOS.at(-1).values['v-mail'] === 'ana.visitante@prueba.cl' && ENVIOS.at(-1).values['v-fecha'] === '2037-12-01' && /Larraín 6200/.test(ENVIOS.at(-1).values['v-dir']) && /^data:image\/jpeg;base64,/.test(ENVIOS.at(-1).values['v-foto']) && /Corredor B/.test(ENVIOS.at(-1).values['v-cor']), 'el documento salió con los datos de la ficha (dirección), del visitante y del corredor, y la foto como imagen en base64 (Portalfirma no acepta un enlace)');
    ok(FIRMANTE.length === 2 && FIRMANTE[0].action === 'update_signatory_data' && FIRMANTE[0].person_id === 'per-1' && FIRMANTE[0].email === 'ana.visitante@prueba.cl', 'completa los datos del firmante (correo) porque la plantilla no los pide');
    ok(FIRMANTE[1].action === 'send_signature_link_by_email' && FIRMANTE[1].email === 'ana.visitante@prueba.cl' && FIRMANTE[1].link === 'https://cliente.portalfirma.cl/v?c=cs-1&h=portalfirma' && Number(FIRMANTE[1].operation) === OPERACION, 'y le manda el enlace de firma por correo');
    const fOv = await db.firma.findFirst({ where: { corredoraId: co.id, operacion: OPERACION } });
    ok(fOv && fOv.documento === 'Orden de visita' && fOv.estado === 'en_firma' && fOv.enviadoPorId === c1.id && fOv.propiedadIds.includes(prop2.id) && fOv.firmantes[0].rut === '11.111.111-1', 'la firma queda registrada (en firma, de quien la envió, ligada a la propiedad)');
    const pAna = await db.persona.findFirst({ where: { corredoraId: co.id, rut: '111111111' }, include: { vinculos: true } });
    ok(pAna && pAna.nombre === 'Ana Visitante' && pAna.email === 'ana.visitante@prueba.cl' && pAna.vinculos.some((x) => x.propiedadId === prop2.id && x.rol === 'interesado'), 'el visitante quedó en el CRM y vinculado como interesado');
    const evOv = await db.evento.findFirst({ where: { corredoraId: co.id, propiedadId: prop2.id, tipo: 'visita' } });
    ok(evOv && evOv.hora === '11:00' && evOv.fecha.toISOString().startsWith('2037-12-01') && evOv.datos.orden.operacion === OPERACION, 'la visita quedó en la agenda con su orden');
    antesOv = salidas(cel).length;
    escribe(cel, 'sí');
    await esperar(6000);
    ok(ENVIOS.length === enviosAntes + 1, 'un segundo «sí» no la envía otra vez');
    // audios (notas de voz) con su Asset cerrado: el servidor los transcribe, dice qué entendió y responde el equipo
    T.actual = { primera: 'Pedro, ¿cómo va la cartera PF1001?' };
    let antesAu = salidas(cel).length;
    escribe(cel, '', { attachments: [`${base}/audio/a1.ogg`] });
    ok(await hasta(() => salidas(cel).slice(antesAu).some((t) => t === '🎙️ Entendí: «Pedro, ¿cómo va la cartera PF-1001?»')), 'un audio se transcribe (con el código normalizado) y se le dice qué se entendió: ' + (salidas(cel).slice(antesAu)[0] || ''));
    ok(await hasta(() => salidas(cel).slice(antesAu).some((t) => /^\*Pedro\* · Captación\nTienes \d+ propiedad/.test(t))), 'y Pedro responde al audio aunque su Asset esté cerrado');
    ok(T.llamadas.length === 1 && !T.llamadas[0].letras, 'sin avisos, una sola llamada a la transcripción');
    T.actual = { primera: 'Pedro, el RUT del dueño es 15.432.876-5', segunda: 'Pedro, el RUT del dueño es quince millones cuatrocientos treinta y dos mil ochocientos setenta y seis guion nueve' };
    antesAu = salidas(cel).length; T.llamadas.length = 0;
    escribe(cel, '', { attachments: [`${base}/audio/a2.ogg`] });
    ok(await hasta(() => salidas(cel).slice(antesAu).some((t) => /^🎙️ Entendí: «Pedro, el RUT del dueño es 15\.432\.876-9»$/.test(t))), 'si un RUT no cuadra, repite con los números en letras y lo corrige (15.432.876-9, sin avisos)');
    ok(T.llamadas.length === 2 && T.llamadas[1].letras, 'la segunda pasada pide los números con letras');
    T.actual = { primera: 'Pedro, su teléfono es 9654322187', segunda: 'Pedro, su teléfono es 9654322187' };
    antesAu = salidas(cel).length; const iaAntes = IA.llamadas.length;
    escribe(cel, '', { attachments: [`${base}/audio/a3.ogg`] });
    ok(await hasta(() => salidas(cel).slice(antesAu).some((t) => /^🎙️ Entendí: «Pedro, su teléfono es 9654322187»\n⚠️ El teléfono «9654322187» no tiene el largo de un celular chileno/.test(t))), 'si el dato sigue sin cuadrar, lo dice con ⚠️ para confirmarlo');
    ok(await hasta(() => IA.llamadas.slice(iaAntes).some((b) => /Aviso de la transcripción del audio/.test(JSON.stringify(b.messages)) && /No guardes ese dato/.test(JSON.stringify(b.messages)))), 'y el asistente recibe el aviso para pedir la confirmación');
    T.actual = { primera: 'La PF1001 y la pf 1002' };
    r = await req('POST', '/ia/transcribir', { audio: Buffer.alloc(3000, 3).toString('base64'), mime: 'audio/ogg' }, t1);
    ok(r.s === 201 && r.j.texto === 'La PF-1001 y la PF-1002' && Array.isArray(r.j.avisos) && !r.j.avisos.length, 'el dictado de la app usa la misma transcripción: códigos normalizados (PF-1001)');
    let antesEq = salidas(cel).length;
    escribe(cel, 'mis documentos Juanita');
    ok(await hasta(() => salidas(cel).slice(antesEq).some((t) => /^\*Juanita\* · Documentos\n/.test(t))), 'el nombre del personaje al final del mensaje («mis documentos Juanita») también lo elige');
    antesEq = salidas(cel).length;
    escribe(cel, '¿qué hay de nuevo, pedro?');
    ok(await hasta(() => salidas(cel).slice(antesEq).some((t) => /^\*Pedro\* · Captación\n/.test(t))), 'y al nombrar a otro, cambia de personaje');
    escribe(cel, 'Juanita, prepárame el contrato de arriendo de la PF-1');
    ok(await hasta(() => salidas(cel).some((t) => /^\*Juanita\* · Documentos\nListo: lo dejo para cuando abras Asset/.test(t))), 'lo que necesita el computador (un contrato) Juanita lo deja para cuando abra Asset');
    r = await req('GET', '/whatsapp/ejecutivo/entrantes', null, t1);
    ok(r.j.items.length === 1 && /contrato/.test(r.j.items[0].body) && !r.j.items.some((x) => /cómo va la cartera/.test(x.body)), 'su Asset, al abrirse, toma solo lo pendiente (lo ya respondido no)');
    ok((await req('GET', '/whatsapp/ejecutivo/entrantes', null, t1)).j.items.length === 0, 'y no se entrega dos veces');
    // fotos de una propiedad por WhatsApp: las atiende el servidor (con su Asset abierto o cerrado)
    const fotosDe = () => db.propiedadFoto.count({ where: { propiedadId: prop.id } });
    escribe(cel, 'Fotos de la PF-9001', { attachments: [`${base}/media/f1.jpg`] });
    ok(await hasta(() => salidas(cel).some((t) => /^\*Pedro\* · Captación\nListo: agregué la foto a la \*PF-9001\*/.test(t))) && (await fotosDe()) === 1, 'una foto con el código en el texto queda en la galería de esa propiedad');
    const f1 = await db.propiedadFoto.findFirst({ where: { propiedadId: prop.id } });
    const meta = await require('sharp')(Buffer.from(await (await fetch(f1.url)).arrayBuffer())).metadata();
    ok(/\.jpg$/.test(f1.url) && meta.format === 'jpeg' && meta.width === 2048, `la foto de WhatsApp (WebP de 3000 px) se guarda como JPG de hasta 2048 px (${meta.format} ${meta.width}x${meta.height})`);
    escribe(cel, '', { attachments: [`${base}/media/f2.jpg`] }); escribe(cel, '', { attachments: [`${base}/media/f3.jpg`] });
    ok(await hasta(() => salidas(cel).some((t) => /Recibí 2 fotos\. ¿A qué propiedad las agrego\?[\s\S]*\*PF-9001\*/.test(t))), 'fotos sin código: pregunta a qué propiedad y sugiere la última que tocó');
    escribe(cel, 'sí');
    ok(await hasta(async () => (await fotosDe()) === 3) && salidas(cel).some((t) => /agregué 2 fotos a la \*PF-9001\* · .* \(ahora tiene 3\)/.test(t)), 'al responder «sí» las agrega a la sugerida');
    escribe(cel, '', { attachments: [`${base}/media/f4.jpg`] });
    await hasta(() => salidas(cel).some((t) => /Recibí una foto/.test(t)));
    escribe(cel, 'no');
    ok(await hasta(() => salidas(cel).some((t) => /Ok, no agrego la foto/.test(t))) && (await fotosDe()) === 3, 'con «no» la descarta');
    ok((await req('GET', '/whatsapp/ejecutivo/entrantes', null, t1)).j.items.length === 0, 'las fotos y sus respuestas no pasan a la cola de su Asset');
    ok((await db.propiedad.findUnique({ where: { id: prop.id } })).version > 1, 'la propiedad sube de versión (la app trae las fotos al sincronizar)');
    escribe(cel, 'Pedro, ¿y los leads?');
    ok(await hasta(async () => (await req('GET', '/whatsapp/ejecutivo/entrantes', null, t1)).j.items.some((x) => /y los leads/.test(x.body)), 15), 'con su Asset abierto, lo atiende su Asset (no el servidor)');
    r = await req('POST', '/whatsapp/ejecutivo/responder', { texto: '*Pedro* · Captación\nTienes 1 propiedad.' }, t1);
    ok(r.s === 200 && salidas(cel).some((t) => /Tienes 1 propiedad/.test(t)), 'la respuesta de su Asset sale a su celular');
    ok(!salidas(cel).some((t) => /Tu Asset está cerrado/.test(t)), 'ya no hace falta el aviso de «Asset cerrado»: el equipo responde igual');

    // SOLO_PUENTE=1 salta las secciones 2-8 (Sofía y otros asistentes que ya no conversan con leads tras el puente)
    if (!process.env.SOLO_PUENTE) {
    // ---- 2. Sofía con un lead
    const cj = conv({ telefono: '+56 9 8765 4321', nombre: 'Juan Pérez' });
    escribe(cj, 'Hola, quiero agendar una visita al depto');
    const h1 = await hasta(() => salidas(cj).find((t) => /Tengo el \d{4}-\d{2}-\d{2} a las \d{2}:00/.test(t)));
    ok(h1, `Sofía le ofrece horarios libres de la agenda del corredor: «${h1}»`);
    const [, f, hh] = h1.match(/(\d{4}-\d{2}-\d{2}) a las (\d{2}:\d{2})/);
    ok(await hasta(() => salidas(cel).some((t) => /^\*Sofía\* · Atención de leads\n💬 Juan Pérez escribió/.test(t))), 'y le avisa al corredor a cargo por su celular vinculado, firmado por Sofía');
    let ms = await db.leadMensaje.findMany({ where: { leadId: lead.id }, orderBy: { id: 'asc' } });
    ok(ms.some((m) => m.de === 'cliente' && /agendar una visita/.test(m.texto)) && ms.some((m) => m.de === 'agente' && /Tengo el/.test(m.texto) && m.autor === 'Sofía (asistente)'), 'la conversación queda en el lead (lo del cliente y lo de Sofía)');
    escribe(cj, `Me sirve el ${f} a las ${hh} en ${prop.codigo}`);
    const h2 = await hasta(() => salidas(cj).find((t) => /quedó tu visita/.test(t)));
    ok(h2 && /Irarrázaval 2450/.test(h2) && /RUT/.test(h2), 'Sofía agenda la visita, la confirma con la dirección y le pide RUT y correo');
    const ev = await db.evento.findFirst({ where: { corredoraId: co.id, tipo: 'visita', propiedadId: prop.id } });
    ok(ev && ev.hora === hh && ev.fecha.toISOString().slice(0, 10) === f && ev.corredorId === c1.id && ev.propiedadId === prop.id && ev.datos.ext.id === lead.id, 'la visita queda en la agenda del corredor a cargo, ligada al lead');
    const l2 = await db.lead.findUnique({ where: { id: lead.id } });
    ok(l2.estado === 'visita' && l2.version > lead.version && /Visita/.test(l2.datos.proximaAccion.texto), 'el lead pasa a «visita» con su próxima acción (con versión nueva para que la app lo traiga)');
    ok(await hasta(() => salidas(cel).some((t) => /Visita agendada por Sofía/.test(t))), 'al corredor le llega el aviso de la visita agendada');

    // ---- 3. el corredor escribe a mano: Sofía se calla
    aMano(cj, 'Juan, te llamo en un rato');
    let antes = salidas(cj).length;
    escribe(cj, 'Ok, quedo atento');
    const enPausa = await hasta(() => salidas(cel).some((t) => /Sofía está en pausa en esta conversación/.test(t)), 20); if (!enPausa) console.log('LEAD:', salidas(cj).slice(-3), 'CEL:', salidas(cel).slice(-3));
    ok(enPausa, 'si el corredor le escribió a mano, Sofía no responde y le avisa que está en pausa');
    ok(salidas(cj).length === antes, 'al lead no le llegó nada');
    r = await req('GET', '/whatsapp/asistentes/pausa?telefono=' + encodeURIComponent('+56 9 8765 4321'), null, t1);
    ok(r.j.pausaHasta, 'la app ve la pausa');
    ms = await db.leadMensaje.findMany({ where: { leadId: lead.id } });
    ok(ms.some((m) => m.de === 'broker' && /te llamo en un rato/.test(m.texto)), 'lo que escribió el corredor a mano también queda en el lead');
    await req('POST', '/whatsapp/asistentes/reanudar', { telefono: '+56 9 8765 4321' }, t1);
    escribe(cj, 'Hola de nuevo, ¿puedo agendar otra visita?');
    ok(await hasta(() => salidas(cj).length > antes), 'con «Reanudar», Sofía vuelve a responder');

    // ---- 4. un envío de la app no es «a mano»
    antes = salidas(cj).length;
    r = await req('POST', '/whatsapp/enviar', { telefono: '+56 9 8765 4321', nombre: 'Juan Pérez', texto: 'Juan, te recuerdo la visita de mañana.' }, t1);
    ok(r.s === 200 && r.j.messageId, 'la app envía un WhatsApp a través del servidor (escribió en 24 h)');
    ok((await req('POST', '/whatsapp/enviar', { telefono: '+56 9 8765 4321', nombre: 'Juan Pérez', texto: 'Juan, te recuerdo la visita de mañana.' }, t1)).j.duplicado, 'el mismo texto al mismo número no se manda dos veces');
    escribe(cj, '¿Y si mejor agendo una visita el sábado?');
    ok(await hasta(() => salidas(cj).length > antes + 1), 'después de un envío de la app, Sofía sigue respondiendo (no lo toma como escrito a mano)');

    // ---- 5. Tomás con una persona del CRM
    const cc = conv({ telefono: '+56 9 5555 1111', nombre: 'Carla Ruiz' });
    escribe(cc, '¿Cuánto son los gastos comunes?');
    const t5 = await hasta(() => salidas(cc).find((t) => /gastos comunes/.test(t)));
    ok(t5 && /95\.000/.test(t5) && /Irarrázaval 2450/.test(t5), `Tomás le responde con los datos de su propiedad: «${t5}»`);
    ok(await hasta(() => salidas(cel).some((t) => /^\*Tomás\* · Atención de clientes\n💬 Carla Ruiz escribió/.test(t))), 'y avisa al captador de su propiedad, firmado por Tomás');
    escribe(cc, 'Quiero agendar una visita');
    ok(await hasta(() => salidas(cel).some((t) => /📩 \*Recado de Carla Ruiz\*/.test(t))), 'para una visita, Tomás toma el recado y se lo pasa al corredor');
    // el asistente dice «le pasé tu oferta al corredor» sin llamar a cliente_recado: el servidor deja el recado de verdad
    const antesRec = salidas(cel).length;
    escribe(cc, 'Mi oferta por el departamento es 90.000 mensuales');
    ok(await hasta(() => salidas(cc).some((t) => /Le pasé tu oferta a Corredor B/.test(t))), 'Tomás responde que le pasó la oferta al corredor');
    ok(await hasta(() => salidas(cel).slice(antesRec).some((t) => /📩 \*Recado de Carla Ruiz\*[\s\S]*El cliente escribió: «Mi oferta por el departamento es 90\.000 mensuales»/.test(t))), 'y como no llamó a la herramienta, el servidor deja el recado con lo que escribió la cliente (lo dicho es cierto)');
    // la misma oferta otra vez: el recado no se repite al corredor (antes llegaban ~18 avisos casi iguales)
    const antesRep = salidas(cel).length;
    escribe(cc, 'Mi oferta por el departamento es 90.000 mensuales, ¿la consideran?');
    ok(await hasta(() => salidas(cc).filter((t) => /Le pasé tu oferta a Corredor B/.test(t)).length >= 2), 'la cliente repite su oferta y el asistente responde');
    await esperar(5000);
    ok(!salidas(cel).slice(antesRep).some((t) => /Recado de Carla Ruiz/.test(t)), 'pero el mismo recado no se le manda otra vez al corredor');
    // la nota de voz de una cliente se transcribe (antes: «Recibí tu archivo»)
    T.actual = { primera: 'Hola, ¿me pueden confirmar la visita para el sábado?' };
    const antesAud = salidas(cc).length; const recAntes = salidas(cel).length;
    escribe(cc, '', { attachments: [`${base}/audio/cliente.ogg`] });
    ok(await hasta(() => salidas(cel).slice(recAntes).some((t) => /📩 \*Recado de Carla Ruiz\*[\s\S]*sábado/.test(t))), 'la nota de voz de una cliente se transcribe y el asistente la atiende como si la hubiera escrito');
    ok(!salidas(cc).slice(antesAud).some((t) => /Recibí tu archivo/.test(t)), 'ya no responde «Recibí tu archivo» a un audio');
    ok((await req('PUT', '/whatsapp/asistentes', { clientesActivo: false }, t1)).s === 403, 'un corredor no apaga la atención de clientes');
    r = await req('PUT', '/whatsapp/asistentes', { clientesActivo: false }, tA);
    ok(r.s === 200 && r.j.clientesActivo === false, 'el administrador la apaga');
    // la respuesta de Tomás a «Quiero agendar una visita» puede salir después del recado al corredor: se espera a que
    // termine antes de contar, o esa respuesta (legítima, de antes de apagarla) se contaría como una nueva
    for (let previo = -1; previo !== salidas(cc).length;) { previo = salidas(cc).length; await esperar(3000); }
    antes = salidas(cc).length; escribe(cc, 'Hola?');
    await esperar(8000);
    ok(salidas(cc).length === antes, 'apagada, Tomás no responde a las personas del CRM');
    await req('PUT', '/whatsapp/asistentes', { clientesActivo: true }, tA);

    // ---- 5b. un número que nadie conoce: se crea su lead y Sofía lo atiende; con Sofía apagada, solo queda en Leads
    const cn = conv({ telefono: '+56 9 6666 2222', nombre: 'Pedro Nuevo' });
    escribe(cn, 'Hola, vi un depto en Ñuñoa, ¿sigue disponible?');
    ok(await hasta(() => salidas(cn).length > 0), 'a un número que nadie conoce le responde Sofía');
    const ln = await db.lead.findFirst({ where: { corredoraId: co.id, telefonoNorm: '966662222' } });
    ok(ln && ln.datos.chatCon === 'Pedro Nuevo' && /WhatsApp/.test(ln.datos.historial[0].texto), 'y queda como lead nuevo, con origen WhatsApp');
    // reglas de los leads: a cargo del administrador, con su persona en el CRM, y «Contactado» cuando el corredor responde
    ok(ln.corredorId === adm.id && ln.estado === 'nuevo', 'el lead nuevo queda a cargo del administrador y en «Nuevo»');
    const pn = await db.persona.findUnique({ where: { id: ln.personaId } });
    ok(pn && pn.nombre === 'Pedro Nuevo' && pn.roles.includes('interesado') && /966662222$/.test(String(pn.telefono).replace(/\D/g, '')), 'y se crea su persona en el CRM (interesado, con su celular)');
    aMano(cn, 'Hola Pedro, soy el corredor: te llamo hoy');
    escribe(cn, 'Perfecto, gracias');
    ok(await hasta(async () => (await db.lead.findUnique({ where: { id: ln.id } })).estado === 'contactado', 25), 'cuando el corredor le escribe a mano, el lead pasa a «Contactado»');
    ok((await req('PUT', '/whatsapp/asistentes', { leadsActivo: false }, t1)).s === 403, 'un corredor no apaga a Sofía');
    r = await req('PUT', '/whatsapp/asistentes', { leadsActivo: false }, tA);
    ok(r.s === 200 && r.j.leadsActivo === false && r.j.clientesActivo === true, 'el administrador apaga a Sofía (Tomás sigue encendido)');
    const cn2 = conv({ telefono: '+56 9 6666 3333', nombre: 'Rosa Nueva' });
    escribe(cn2, 'Hola, busco arriendo en Providencia');
    const ln2 = await hasta(() => db.lead.findFirst({ where: { corredoraId: co.id, telefonoNorm: '966663333' } }), 20);
    await esperar(6000);
    ok(ln2 && !salidas(cn2).length, 'con Sofía apagada, el número nuevo queda como lead pero nadie le responde');
    antes = salidas(cj).length; escribe(cj, '¿Me confirmas la visita?'); await esperar(8000);
    ok(salidas(cj).length === antes, 'y a los leads que ya existían tampoco');
    await req('PUT', '/whatsapp/asistentes', { leadsActivo: true }, tA);

    // ---- 6. postventa
    const cp = conv({ telefono: '+56 9 7777 7777', nombre: 'Ana Rojas' });
    escribe(cp, 'Hola, se está filtrando el baño, gotea bajo el lavamanos hace días');
    ok(await hasta(() => salidas(cp).some((t) => /asistente de postventa/.test(t) && /Edificio Prueba · 502/.test(t))), 'el asistente de postventa reconoce a la propietaria por su celular y pide fotos');
    escribe(cp, 'sin fotos');
    const t6 = await hasta(() => salidas(cp).find((t) => /PV-\d{4}/.test(t)));
    ok(t6 && /Instalaciones · Baño/.test(t6) && /garantía vigente/.test(t6), `registra el reclamo con folio, tipo y garantía: «${t6.split('\n')[0]}»`);
    const rec = await db.registro.findFirst({ where: { corredoraId: co.id, coleccion: 'pv_reclamos' } });
    ok(rec && rec.datos.unidadId === 'u1' && rec.datos.canal === 'whatsapp' && rec.datos.items[0].recinto === 'Baño', 'el reclamo queda en la base (pv_reclamos), con su unidad');
    const ch = await db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId: co.id, coleccion: 'pv_chats', id: cp.id } } });
    ok(ch && ch.datos.paso === 'listo' && ch.datos.mensajes.length >= 4, 'y la conversación de postventa también (pv_chats)');

    // ---- 7. observador
    ok((await req('PUT', '/whatsapp/observador', { activo: true }, t1)).s === 403, 'un corredor no activa el observador');
    ok((await req('GET', '/whatsapp/observador', null, tA)).j.activo === true, 'al conectar wechatia el observador queda activo solo');
    await req('PUT', '/whatsapp/observador', { activo: false }, tA); // el administrador lo apaga: volver a activarlo sí pide autorización
    ok((await req('PUT', '/whatsapp/observador', { activo: true }, tA)).j.code === 'AUT', 'activarlo pide la autorización de la corredora');
    const ci = conv({ nombre: 'Lucía IG', tipo: 'TYPE_INSTAGRAM', usuario: 'lucia.ig', asignado: 'wu-1' });
    escribe(ci, 'Hola, busco depto 2D en Ñuñoa hasta 500 lucas');
    r = await req('PUT', '/whatsapp/observador', { activo: true, autorizado: true }, tA);
    ok(r.s === 200 && r.j.activo, 'el administrador lo activa con la autorización (queda en consentimientos)');
    const li = await hasta(() => db.lead.findFirst({ where: { corredoraId: co.id, origen: 'instagram' } }));
    ok(li && li.datos.ig.usuario === 'lucia.ig' && li.convIds.includes(ci.id), 'la conversación de Instagram queda como lead (solo lectura)');
    const li2 = await hasta(async () => { const x = await db.lead.findUnique({ where: { id: li.id } }); return x.datos.resumen && x.corredorId ? x : null; });
    ok(li2 && /Ñuñoa/.test(li2.datos.resumen) && li2.corredorId === c1.id && li2.estado === 'contactado', 'la IA deja qué busca y el corredor a cargo es el «propietario» del contacto en wechatia');
    ok(!salidas(ci).length, 'el observador nunca responde');
    ok(await db.registro.findFirst({ where: { corredoraId: co.id, coleccion: 'consentimientos' } }), 'la autorización quedó registrada');
    r = await req('GET', '/whatsapp/canales', null, t1);
    const canal = (id) => r.j.canales?.find((x) => x.id === id);
    ok(r.s === 200 && r.j.conectado && canal('whatsapp')?.enUso && canal('instagram')?.enUso && canal('instagram').ultimo && !canal('facebook')?.enUso,
      'la pantalla de integraciones sabe qué canales se usan (WhatsApp e Instagram sí, Facebook no)');
    ok(/\/v2\/location\/.+\/settings\/integrations$/.test(canal('instagram')?.conectar || ''), 'y a qué página del panel de wechatia ir para conectar otro');

    // ---- 8. el aviso de un programado sale del servidor
    await req('POST', '/whatsapp/programados', { id: `wp${SUF}`, telefono: '+56 9 8765 4321', nombre: 'Juan Pérez', texto: 'Juan, nos vemos mañana.', cuando: new Date(Date.now() - 1000).toISOString() }, t1);
    ok(await hasta(() => salidas(cel).some((t) => /Le envié a Juan Pérez el WhatsApp programado/.test(t)), 60), 'el resultado de un programado se le avisa al ejecutivo por su celular, desde el servidor');

    }
    // ---- 8a. aviso al corredor cuando le asignan un lead (texto si escribió hace poco; plantilla si no; botón «Mensaje»)
    const c2 = await nu('c', null, { wechatiaId: 'wu-2' });
    W.contactos['k-c2'] = '+56 9 3333 4444';
    await db.waVinculo.create({ data: { usuarioId: c2.id, corredoraId: co.id, telefono: '+56 9 3333 4444', telefonoNorm: '933334444', contactId: 'k-c2', activo: true, vinculadoEn: new Date() } });
    const leadId = `ld${SUF}`;
    const asignar = async (corredorId) => { const g = await req('GET', `/leads/${leadId}`, null, tA); return req('PUT', `/leads/${leadId}`, { ...g.j, corredorId }, tA); };
    const antesPl = (W.plantillas || []).length;
    r = await asignar(c2.id);
    ok(r.s === 200 && r.j.corredorId === c2.id, 'el administrador le asigna el lead a otro corredor');
    const pl = await hasta(() => (W.plantillas || []).length > antesPl && W.plantillas.at(-1).etiqueta === 'nuevo_lead_asignado' && W.plantillas.at(-1), 30);
    ok(pl, 'como ese corredor no le ha escrito a la empresa en 24 h, el aviso sale por la plantilla «nuevo_lead_asignado»');
    ok(pl.campos.asset_lead_nombre === 'Juan Pérez' && /8765 4321/.test(pl.campos.asset_lead_celular) && /PF-9001/.test(pl.campos.asset_propiedad) && pl.campos.asset_nombre === 'Corredor' && pl.campos.asset_lead_canal && pl.campos.asset_lead_enlace.startsWith(leadId + '.'), 'con los datos del interesado, la propiedad y el enlace del botón ' + JSON.stringify(pl.campos));
    ok(await hasta(() => db.aviso.findFirst({ where: { corredoraId: co.id, usuarioId: c2.id, tipo: 'lead' } })), 'y también queda en sus avisos de la app');
    ok(await hasta(async () => (await db.lead.findUnique({ where: { id: leadId } })).datos.avisoAsignado?.corredorId === c2.id), 'el lead recuerda a quién se avisó');
    const n1 = (W.plantillas || []).length; await asignar(c2.id); await esperar(3000);
    ok((W.plantillas || []).length === n1, 'si se vuelve a guardar con el mismo corredor, no se repite el aviso');
    const rd = await fetch(`${B}/whatsapp/lead/${pl.campos.asset_lead_enlace}`, { redirect: 'manual' });
    const html = await rd.text();
    ok(rd.status === 200 && !rd.headers.get('location') && /Para Juan:/.test(html) && !/wa\.me|8765/.test(html), 'el botón «Mensaje» ya no abre el WhatsApp personal: explica cómo responder por el número de la empresa');
    ok((await fetch(`${B}/whatsapp/lead/${pl.campos.asset_lead_enlace.slice(0, -2)}xx`, { redirect: 'manual' })).status === 404, 'un enlace alterado no sirve');
    const antesTx = salidas(cel).length;
    await asignar(c1.id);
    ok(await hasta(() => salidas(cel).slice(antesTx).some((t) => /Nuevo lead asignado/.test(t) && /Juan Pérez/.test(t) && /Para Juan:/.test(t) && !/wa\.me/.test(t))), 'a un corredor que le escribió hace poco le llega como texto, con cómo responderle por el número de la empresa');
    // aislamiento: el lead es del corredor 1; el corredor 2 no puede escribirle por ninguna vía
    const t2 = await ingresar(c2.email, 'clave-e2e-123');
    const env0 = W.enviados.length;
    for (const [ruta, cuerpo] of [
      ['/whatsapp/enviar', { telefono: '+56 9 8765 4321', texto: 'Hola desde el corredor 2' }],
      ['/whatsapp/enviar', { telefono: '+56 9 8765 4321', texto: 'Hola otra vez', revisar24: false }],
      ['/whatsapp/enviar/contacto', { contactId: 'k-x', telefono: '+56 9 8765 4321', texto: 'Hola por contacto' }],
      ['/whatsapp/enviar/plantilla', { telefono: '+56 9 8765 4321', etiqueta: 'solicitar_documentacion_', campos: {} }],
    ]) {
      r = await req('POST', ruta, cuerpo, t2);
      ok(r.s === 403 && r.j?.code === 'OTRO_CORREDOR', `el corredor 2 no puede escribirle a un interesado del corredor 1 (${ruta})`);
    }
    ok(W.enviados.length === env0, 'y no salió ningún mensaje por wechatia');
    r = await req('POST', '/whatsapp/enviar', { telefono: '+56 9 8765 4321', nombre: 'Juan Pérez', texto: 'Juan, el administrador le escribe.', revisar24: false }, tA);
    ok(r.s === 200, 'el administrador sí puede escribirle a cualquiera ' + r.s + JSON.stringify(r.j).slice(0, 120));
    r = await req('POST', '/whatsapp/enviar', { telefono: '+56 9 5555 0000', nombre: 'Sin lead', texto: 'Hola, un número que no es de ningún lead.', revisar24: false }, t2);
    ok(r.s === 200, 'un número que no es de ningún lead no se bloquea (clientes, reservas, programados)');
    // reasignar: el corredor 2 pasa a ser el dueño y el 1 deja de poder escribirle
    await asignar(c2.id);
    r = await req('POST', '/whatsapp/enviar', { telefono: '+56 9 8765 4321', nombre: 'Juan Pérez', texto: 'Juan, ahora soy tu corredor.', revisar24: false }, t2);
    ok(r.s === 200, 'al cambiar de dueño, el corredor nuevo ya puede escribirle');
    r = await req('POST', '/whatsapp/enviar', { telefono: '+56 9 8765 4321', texto: 'Soy el corredor anterior' }, t1);
    ok(r.s === 403 && r.j?.code === 'OTRO_CORREDOR', 'y el corredor anterior ya no');
    await asignar(c1.id);

    // ---- 8a2. Instagram → corredor por WhatsApp → respuesta por Instagram (el interesado no tiene celular)
    r = await req('PUT', '/whatsapp/observador', { activo: true, autorizado: true }, tA);
    ok(r.s === 200 && r.j.activo, 'el observador queda activo');
    const cig = conv({ nombre: 'Lucía Insta', tipo: 'TYPE_INSTAGRAM', usuario: 'lucia.insta', asignado: 'wu-1' });
    escribe(cig, 'Hola, busco depto 2D en Ñuñoa hasta 500 lucas');
    ok(
      await hasta(() => salidas(cel).some((t) => /Lucía Insta/.test(t) && /Instagram @lucia\.insta/.test(t) && /busco depto 2D/.test(t) && /Para @lucia\.insta:/.test(t)), 180),
      'lo que escribe el interesado por Instagram le llega al celular de su corredor, con cómo responderle',
    );
    const leadIg = await db.lead.findFirst({ where: { corredoraId: co.id, origen: 'instagram', convIds: { has: cig.id } } });
    ok(leadIg && leadIg.corredorId === c1.id, 'el lead de Instagram quedó a cargo del corredor 1');
    // otro lead con el mismo primer nombre y con celular: «Para Lucía» ya no adivina, pregunta
    await db.lead.create({ data: { id: `ldl${SUF}`, corredoraId: co.id, corredorId: c1.id, telefonoNorm: '955500001', origen: 'whatsapp', datos: { nombre: 'Lucía', telefono: '+56 9 5550 0001' } } });
    const envAntes = W.enviados.length;
    escribe(cel, 'Para Lucía: hola, ¿cómo estás?');
    ok(await hasta(() => salidas(cel).some((t) => /Hay 2 interesados que calzan con «Lucía»/.test(t) && /@lucia\.insta/.test(t))), 'con una sola palabra que calza con varios, pregunta a cuál en vez de adivinar');
    ok(W.enviados.slice(envAntes).every((e) => !/cómo estás/.test(e.message)), 'y no le escribió a ninguno');
    escribe(cel, 'Para @lucia.insta: claro, te muestro el depto el sábado a las 11');
    ok(
      await hasta(() => W.enviados.some((e) => e.type === 'IG' && e.contactId === cig.contactId && /te muestro el depto el sábado/.test(e.message))),
      'la respuesta del corredor sale al interesado por Instagram (tipo IG), no por WhatsApp',
    );
    ok(await hasta(() => salidas(cel).some((t) => /Enviado a Lucía Insta por Instagram/.test(t))), 'y se le confirma al corredor');
    ok(!W.enviados.some((e) => e.type === 'WhatsApp' && e.contactId === cig.contactId), 'nada salió por WhatsApp a ese interesado');
    ok(await hasta(async () => (await db.leadMensaje.count({ where: { leadId: leadIg.id, de: 'broker' } })) >= 1), 'la respuesta queda en la conversación del lead');
    r = await req('GET', `/leads/${leadId}`, null, tA);
    ok(r.s === 200, 'el lead sigue entero');
    await db.usuario.update({ where: { id: c2.id }, data: { activo: false } });

    // ---- 8b. evaluación del arrendatario y sus avales: plantilla por WhatsApp, documentos leídos y puntaje
    const arr = await db.persona.create({ data: { corredoraId: co.id, nombre: 'María Postulante', telefono: '+56 9 6111 1111', rut: '12345678K' } });
    const av1 = await db.persona.create({ data: { corredoraId: co.id, nombre: 'Pedro Aval', telefono: '+56 9 6222 2222' } });
    const sinTel = await db.persona.create({ data: { corredoraId: co.id, nombre: 'Sin Celular' } });
    const ng = await db.negocio.create({ data: { id: `ng${SUF}`, corredoraId: co.id, tipo: 'arriendo', etapa: 'evaluacion', propiedadId: prop.id, clienteId: arr.id, corredorId: c1.id, datos: {} } });
    r = await req('POST', `/evaluaciones/${ng.id}/solicitar`, { avales: [sinTel.id] }, tA);
    ok(r.s === 400 && /no tiene celular/.test(r.j.message || ''), 'no se puede pedir documentación a un aval sin celular');
    r = await req('POST', `/evaluaciones/${ng.id}/solicitar`, { avales: [av1.id] }, tA);
    ok(r.s === 200 && r.j.personas.length === 2 && r.j.personas[0].rol === 'arrendatario' && r.j.personas[1].rol === 'aval' && r.j.estado === 'solicitada', 'solicitar: queda el arrendatario y su aval esperando documentos');
    const plEv = (W.plantillas || []).filter((x) => x.etiqueta === 'asset_solicitar_documentos'); // (la del aviso de lead asignado es otra)
    ok(plEv.length === 2, 'a cada uno le sale la plantilla (con su etiqueta) ' + JSON.stringify(W.plantillas));
    ok(plEv[0].campos.asset_nombre === 'María' && /Irarrázaval/.test(plEv[0].campos.asset_propiedad) && /^Corredor A/.test(plEv[0].campos.asset_remitente) && /aval de María Postulante/.test(plEv[1].campos.asset_propiedad), 'con su nombre, quien escribe y la propiedad (al aval se le dice de quién es aval)');
    r = await req('POST', `/evaluaciones/${ng.id}/solicitar`, { avales: [av1.id] }, tA);
    ok(r.s === 400 && /Ya se les pidió/.test(r.j.message || ''), 'no se les vuelve a escribir a quienes ya se les pidió');
    const docs = (n, rut, extra = {}) => [
      { clase: 'contrato_trabajo', legible: true, resumen: 'Contrato indefinido en ACME', persona: { nombre: n, rut }, datos: { empleador: 'ACME', tipoContrato: 'indefinido', fechaInicio: '2023-03-01' }, alertas: [] },
      { clase: 'cedula_frente', legible: true, resumen: 'Cédula frente', persona: { nombre: n, rut }, datos: { vigencia: '2033-01-01' }, alertas: [] },
      { clase: 'cedula_reverso', legible: true, resumen: 'Cédula reverso', persona: { nombre: n, rut }, datos: {}, alertas: [] },
      ...['2026-08', '2026-09', '2026-10'].map((pe) => ({ clase: 'liquidacion', legible: true, resumen: `Liquidación ${pe}`, persona: { nombre: n, rut }, datos: { periodo: pe, liquido: extra.liquido || 2100000, empleador: 'ACME' }, alertas: [] })),
      { clase: 'afp', legible: true, resumen: 'AFP al día', persona: { nombre: n, rut }, datos: { mesesCotizados: 6, alDia: true }, alertas: [] },
      { clase: 'dicom', legible: true, resumen: extra.deudas ? 'Registra 2 morosidades' : 'Sin morosidades', persona: { nombre: n, rut }, datos: extra.deudas ? { sinDeudas: false, cantidadDeudas: 2, montoMoroso: 900000 } : { sinDeudas: true }, alertas: [] },
    ];
    const cMaria = conv({ telefono: '+56 9 6111 1111', nombre: 'María Postulante' });
    IA.docs = [{ clase: 'otro', legible: false, resumen: '', alertas: [] }, { clase: 'otro', legible: true, resumen: 'Una selfie', alertas: [] }, docs('María Postulante', '12.345.678-K')[0]];
    escribe(cMaria, '', { attachments: [`${base}/media/e1.jpg`, `${base}/media/e2.jpg`, `${base}/media/e3.jpg`] });
    ok(await hasta(() => salidas(cMaria).some((t) => /Tomás/.test(t) && /Recibí tu documento: contrato de trabajo/.test(t) && /no se lee bien/.test(t) && /No logré reconocer un archivo/.test(t) && /Me falta: Cédula/.test(t))), 'el arrendatario manda 3 archivos: Tomás confirma el que entendió, pide de nuevo el borroso y avisa lo que no reconoce y lo que falta');
    escribe(cMaria, 'Hola, ¿cuándo me responden?');
    ok(await hasta(() => salidas(cMaria).length >= 2), 'un mensaje de solo texto no se pierde: lo atiende Tomás');
    IA.docs = docs('María Postulante', '12.345.678-K').slice(1);
    escribe(cMaria, '', { attachments: IA.docs.map((_, i) => `${base}/media/f${i}.jpg`) });
    ok(await hasta(() => salidas(cMaria).some((t) => /ya tengo toda tu documentación/.test(t))), 'al completar, le avisa que ya tiene toda su documentación');
    r = (await hasta(async () => { const q = await req('GET', `/evaluaciones/${ng.id}`, null, tA); return q.j.analisis && q.j.personas[0].completa && q.j.personas[0].analisis && q.j.personas[0].analisis.faltan.length === 0 ? q : null; })) || (await req('GET', `/evaluaciones/${ng.id}`, null, tA));
    ok(r.j.personas[0].completa && !r.j.personas[1].completa && r.j.estado === 'solicitada' && r.j.personas[0].faltan.length === 0 && r.j.personas[1].faltan.length === 5, 'el arrendatario quedó completo; el aval, con los 5 documentos por entregar ' + JSON.stringify({ e: r.j.estado, p: r.j.personas.map((x) => ({ c: x.completa, f: x.faltan, a: x.archivos.map((y) => y.clase + (y.legible ? '' : '!')) })) }));
    ok(r.j.personas[0].documentos.every((d) => d.ok) && r.j.personas[0].analisis.porcentaje === 100, 'con renta de 3,2 veces el arriendo (2.100.000 frente a 650.000) y todo en regla suma 100 %');
    const cPedro = conv({ telefono: '+56 9 6222 2222', nombre: 'Pedro Aval' });
    IA.docs = docs('Pedro Aval', '9.999.999-9', { liquido: 900000, deudas: true });
    escribe(cPedro, '', { attachments: IA.docs.map((_, i) => `${base}/media/g${i}.jpg`) });
    ok(await hasta(() => salidas(cPedro).some((t) => /ya tengo toda tu documentación/.test(t))), 'el aval manda lo suyo y también queda completo');
    r = (await hasta(async () => { const q = await req('GET', `/evaluaciones/${ng.id}`, null, tA); return q.j.estado === 'completa' && q.j.analisis ? q : null; })) || (await req('GET', `/evaluaciones/${ng.id}`, null, tA));
    const ap = r.j.personas[1].analisis;
    ok(r.j.estado === 'completa' && ap.porcentaje < 60 && ap.criterios.find((x) => x.id === 'dicom').puntos === 0, `con todos completos pasa a «completa»; el aval con Dicom en rojo y poca renta saca ${ap.porcentaje} %`);
    ok(r.j.analisis.porcentaje === Math.round(r.j.personas[0].analisis.porcentaje * 0.6 + ap.porcentaje * 0.4) && r.j.analisis.resumen === 'Resumen de prueba para el corredor.', `el global considera al aval: 60 % de ${r.j.personas[0].analisis.porcentaje} + 40 % de ${ap.porcentaje} = ${r.j.analisis.porcentaje} %`);
    ok(await hasta(() => salidas(cel).some((t) => /Llegó toda la documentación del arriendo/.test(t) && /María Postulante/.test(t) && /Pedro Aval · aval/.test(t))), 'al llegar todo, se le avisa al corredor por WhatsApp (y le recuerda que decide él)');
    r = await req('GET', `/evaluaciones/${ng.id}/archivo/${arr.id}/1`, null, tA);
    ok(r.s === 200 && /^https?:\/\//.test(r.j.url || ''), 'se puede abrir cada archivo recibido con un enlace firmado');
    r = await req('POST', `/evaluaciones/${ng.id}/decidir`, { decision: 'aprobada', nota: 'Buen aval' }, t1);
    ok(r.s === 200 && r.j.estado === 'revisada' && r.j.decision.estado === 'aprobada' && r.j.decision.por === 'Corredor B' && r.j.decision.nota === 'Buen aval', 'el corredor decide: aprobada, con su nombre y su nota');
    ok((await db.actividad.count({ where: { corredoraId: co.id, entidadId: ng.id, texto: { contains: 'Evaluación del arrendatario aprobada' } } })) === 1, 'la decisión queda en la actividad del negocio');
    escribe(cMaria, '', { attachments: [`${base}/media/h1.jpg`] });
    await esperar(4000);
    ok(!(await db.registro.findFirst({ where: { corredoraId: co.id, coleccion: 'evaluaciones', id: ng.id } })).datos.personas[0].archivos.some((a) => a.n > 10), 'cerrada la evaluación, un archivo nuevo ya no se agrega');

    // ---- 9. consumo de IA y un solo lector
    const n = await db.iaConsumo.count({ where: { corredoraId: co.id } });
    ok(n >= 6 && IA.llamadas.every((x) => x.model && x.fallbacks === 'default'), `cada llamada a la IA queda anotada (${n}) y pide respaldo ante rechazos`);
    const aj = await db.waAjustes.findUnique({ where: { corredoraId: co.id } });
    ok(aj.lectorEn && !aj.lectorError, 'el lector terminó sus rondas sin error');
    const dup = W.enviados.filter((e) => e.contactId === cj.contactId && /quedó tu visita/.test(e.message));
    ok(dup.length === 1, 'ninguna respuesta salió dos veces');

    // ---- desvincular
    ok((await req('POST', '/whatsapp/ejecutivo/desvincular', null, t1)).j.ok && !(await req('GET', '/whatsapp/ejecutivo', null, t1)).j.activo, 'el corredor desvincula su celular');
  } finally {
    srv.close(); ia.close(); trf.close(); pfs.close();
    if (co) {
      const w = { where: { corredoraId: co.id } };
      for (const m of ['waEntrante', 'waVinculo', 'waHilo', 'waEnviado', 'waConversacion', 'waAjustes', 'iaConsumo', 'waProgramado', 'aviso', 'conexion', 'registro', 'actividad', 'evento', 'firma', 'leadMensaje', 'lead', 'negocio']) await db[m].deleteMany(w).catch((e) => console.warn(m, e.message));
      await db.propiedadPersona.deleteMany({ where: { propiedad: { corredoraId: co.id } } });
      await db.propiedad.deleteMany(w); await db.persona.deleteMany(w); await db.contador.deleteMany(w);
      await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
      await db.usuario.deleteMany({ where: { id: { in: usuarios } } });
      await db.corredora.delete({ where: { id: co.id } }).catch((e) => console.warn('no se borró la corredora de prueba:', e.message));
    }
    await db.$disconnect();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
