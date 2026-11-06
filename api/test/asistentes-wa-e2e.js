// Prueba de punta a punta de los asistentes de WhatsApp del servidor (src/whatsapp: lector, ejecutivo, Sofía y Tomás,
// postventa, observador, envíos de la app), contra la API corriendo (yarn dev) y asset_dev, con un wechatia FALSO y una
// IA FALSA (API de mensajes de Anthropic) que levanta esta misma prueba. La conexión de prueba guarda sus direcciones
// («base» y «iaBase»): fuera de producción el lector solo lee corredoras así, nunca las reales.
// Crea una corredora de prueba con su administrador y un corredor, y al final la borra con todo lo suyo.
// Uso: node test/asistentes-wa-e2e.js [url]     (tarda ~1,5 min)
const http = require('http');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

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
      if (p === '/contacts/search/duplicate') { const n = dig(u.searchParams.get('number')); const id = Object.keys(W.contactos).find((k) => dig(W.contactos[k]) === n); return out(200, { contact: id ? { id } : null }); }
      if (p === '/contacts/' && rq.method === 'POST') { const id = nuevoId('k'); W.contactos[id] = body.phone; return out(200, { contact: { id } }); }
      out(404, { message: 'ruta falsa: ' + p });
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

// ---------------------------------------------------------------- IA falsa (API de mensajes de Anthropic)
const IA = { llamadas: [] };
const texto = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
const herramienta = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu' + Date.now() + Math.random(), name, input }], stop_reason: 'tool_use' });
function respuestaIa(b) {
  const ult = b.messages.at(-1);
  const contenido = typeof ult.content === 'string' ? ult.content : ult.content.map((x) => x.text || '').join('\n');
  if (/EXTRAER_LEAD/.test(contenido))
    return texto(JSON.stringify({ resumen: 'Busca depto 2D en Ñuñoa', busqueda: { operacion: 'arriendo', tipo: 'departamento', comunas: ['Ñuñoa'], dormitorios: 2, presupuesto: { valor: 500000, moneda: 'CLP' } }, email: null, rut: null, telefono: null, perfil: 'Profesional joven', estadoSugerido: 'contactado', proximaAccion: { texto: 'Enviarle opciones en Ñuñoa', fecha: null } }));
  const tr = Array.isArray(ult.content) && ult.content.find((x) => x.type === 'tool_result');
  if (tr) {
    const r = JSON.parse(tr.content);
    if (r.horarios) return texto(r.horarios.length ? `Tengo el ${r.horarios[0].fecha} a las ${r.horarios[0].horas[0]}. ¿Te acomoda?` : 'Esta semana no tengo horarios.');
    if (r.agendada) return texto(`Listo, quedó tu visita a ${r.agendada.direccion} el ${r.agendada.fecha} a las ${r.agendada.hora}.${r.pedir ? ' ' + r.pedir : ''}`);
    if (r.instruccion) return texto('Perfecto, le paso tu disponibilidad a tu corredor y te confirma.');
    if (r.propiedades) { const p = r.propiedades[0]; return texto(p ? `La propiedad de ${p.direccion} tiene gastos comunes de $${Number(p.gastosComunes || 0).toLocaleString('es-CL')}.` : 'No tengo propiedades tuyas registradas.'); }
    if (r.guardado) return texto('Gracias, lo anoté.');
    return texto('Uy: ' + (r.error || 'listo'));
  }
  const sofia = (b.tools || []).some((t) => t.name.startsWith('lead_'));
  const ag = contenido.match(/(\d{4}-\d{2}-\d{2}) a las (\d{2}:\d{2})/);
  if (sofia && ag) return herramienta('lead_agendar_visita', { propiedad: (contenido.match(/PF-\d+/) || [''])[0], fecha: ag[1], hora: ag[2] });
  if (sofia && /visita|agendar/i.test(contenido)) return herramienta('lead_horarios', {});
  if (!sofia && /visita|agend/i.test(contenido)) return herramienta('cliente_recado', { tipo: 'agendar_visita', detalle: contenido.slice(-200), disponibilidad: 'el sábado en la mañana' });
  return herramienta('cliente_info', {});
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
  const srv = await wechatiaFalso(); const ia = await iaFalsa();
  const base = `http://127.0.0.1:${srv.address().port}`; const iaBase = `http://127.0.0.1:${ia.address().port}`;
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
    await db.conexion.update({ where: { id: cx.id }, data: { datos: { ...cx.datos, iaBase } } });
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
    escribe(cel, 'Pedro, ¿cómo va la cartera?');
    ok(await hasta(() => salidas(cel).some((t) => /Tu Asset está cerrado/.test(t))), 'con su Asset cerrado, el servidor le avisa una vez que lo verá al abrirlo');
    r = await req('GET', '/whatsapp/ejecutivo/entrantes', null, t1);
    ok(r.j.items.length === 1 && /cómo va la cartera/.test(r.j.items[0].body), 'su Asset, al abrirse, toma el mensaje de la cola');
    ok((await req('GET', '/whatsapp/ejecutivo/entrantes', null, t1)).j.items.length === 0, 'y no se entrega dos veces');
    r = await req('POST', '/whatsapp/ejecutivo/responder', { texto: '*Pedro* · Captación\nTienes 1 propiedad.' }, t1);
    ok(r.s === 200 && salidas(cel).some((t) => /Tienes 1 propiedad/.test(t)), 'la respuesta de su Asset sale a su celular');
    escribe(cel, 'gracias');
    await hasta(async () => (await req('GET', '/whatsapp/ejecutivo/entrantes', null, t1)).j.items.length, 15);
    ok(salidas(cel).filter((t) => /Tu Asset está cerrado/.test(t)).length === 1, 'con su Asset abierto no se repite el aviso de cerrado');

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
    const ev = await db.evento.findFirst({ where: { corredoraId: co.id, tipo: 'visita' } });
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
    ok((await req('PUT', '/whatsapp/asistentes', { clientesActivo: false }, t1)).s === 403, 'un corredor no apaga la atención de clientes');
    r = await req('PUT', '/whatsapp/asistentes', { clientesActivo: false }, tA);
    ok(r.s === 200 && r.j.clientesActivo === false, 'el administrador la apaga');
    antes = salidas(cc).length; escribe(cc, 'Hola?');
    await esperar(8000);
    ok(salidas(cc).length === antes, 'apagada, Tomás no responde a las personas del CRM');
    await req('PUT', '/whatsapp/asistentes', { clientesActivo: true }, tA);

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

    // ---- 8. el aviso de un programado sale del servidor
    await req('POST', '/whatsapp/programados', { id: `wp${SUF}`, telefono: '+56 9 8765 4321', nombre: 'Juan Pérez', texto: 'Juan, nos vemos mañana.', cuando: new Date(Date.now() - 1000).toISOString() }, t1);
    ok(await hasta(() => salidas(cel).some((t) => /Le envié a Juan Pérez el WhatsApp programado/.test(t)), 60), 'el resultado de un programado se le avisa al ejecutivo por su celular, desde el servidor');

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
    srv.close(); ia.close();
    if (co) {
      const w = { where: { corredoraId: co.id } };
      for (const m of ['waEntrante', 'waVinculo', 'waHilo', 'waEnviado', 'waConversacion', 'waAjustes', 'iaConsumo', 'waProgramado', 'aviso', 'conexion', 'registro', 'actividad', 'evento', 'leadMensaje', 'lead']) await db[m].deleteMany(w).catch((e) => console.warn(m, e.message));
      await db.propiedadPersona.deleteMany({ where: { propiedad: { corredoraId: co.id } } });
      await db.propiedad.deleteMany(w); await db.persona.deleteMany(w); await db.contador.deleteMany(w);
      await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
      await db.usuario.deleteMany({ where: { id: { in: usuarios } } });
      await db.corredora.delete({ where: { id: co.id } }).catch((e) => console.warn('no se borró la corredora de prueba:', e.message));
    }
    await db.$disconnect();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
