// Prueba de punta a punta de las herramientas de PROPIEDADES, PERSONAS, LEADS, AGENDA y PORTALES del equipo en el servidor
// (src/whatsapp/herramientas/propiedades.ts y los servicios de dominio que usa), contra la API corriendo (yarn dev) y asset_dev,
// con un wechatia FALSO y una IA FALSA (API de mensajes de Anthropic): la IA falsa llama a la herramienta que pide cada mensaje
// («H nombre {json}») y responde con el resultado, que la prueba lee del WhatsApp que recibe el corredor.
// Crea una corredora de prueba (administrador y dos corredores con su celular vinculado) y al final la borra con todo lo suyo.
// Uso: node test/propiedades-herramientas-e2e.js [url]     (tarda ~3 min)
// Revisa: dictar y crear una propiedad (dos pasos), ficha por bloques, completar ficha, actualizar y estado, datos del propietario
// (solo el captador o el admin), personas (RUT opcional, válido y único), notas, leads (sin RUT, sin duplicar, estados), chat exportado
// de WhatsApp (.txt y .zip), agenda (cruce de visitas, día de la semana, reprogramar y cancelar), portales (sin cuenta conectada).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const http = require('http');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1')]));
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
async function hasta(fn, seg = 40) { for (let i = 0; i < seg; i++) { const r = await fn(); if (r) return r; await esperar(1000); } return null; }

// ---------------------------------------------------------------- wechatia falso (lo mínimo para que el corredor escriba y reciba)
const W = { convs: [], contactos: {}, enviados: [], n: 0, archivos: {} };
const TOKEN = 'pit-prop-' + 'x'.repeat(30);
const nuevoId = (p) => p + (++W.n);
function conv({ telefono, nombre }) {
  const contactId = nuevoId('k'); W.contactos[contactId] = telefono;
  const c = { id: nuevoId('cv'), contactId, phone: telefono, fullName: nombre, type: 'TYPE_WHATSAPP', lastMessageType: 'TYPE_WHATSAPP', instagramUsername: '', assignedTo: null, lastMessageDate: Date.now(), mensajes: [] };
  W.convs.push(c); return c;
}
function escribe(c, texto, adjuntos = []) { const m = { id: nuevoId('m'), direction: 'inbound', body: texto, attachments: adjuntos, dateAdded: new Date().toISOString(), messageType: c.type }; c.mensajes.push(m); c.lastMessageDate = Date.now() + W.n; return m; }
const salidas = (c) => W.enviados.filter((e) => e.contactId === c.contactId).map((e) => e.message);
function wechatiaFalso() {
  const s = http.createServer((rq, rs) => {
    let b = ''; rq.on('data', (x) => (b += x)); rq.on('end', () => {
      const u = new URL(rq.url, 'http://x'); const p = u.pathname; const body = b ? JSON.parse(b) : null;
      const out = (code, j) => { rs.writeHead(code, { 'content-type': 'application/json' }); rs.end(JSON.stringify(j)); };
      // los archivos que manda el corredor (un chat exportado) quedan en una URL pública, sin clave
      if (p.startsWith('/archivos/')) { const a = W.archivos[decodeURIComponent(p.slice(10))]; if (!a) return out(404, {}); rs.writeHead(200, { 'content-type': a.mime }); return rs.end(a.bytes); }
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
      if (p === '/contacts/search/duplicate') { const n = dig(u.searchParams.get('number')); const id = Object.keys(W.contactos).find((k) => dig(W.contactos[k]) === n); return out(200, { contact: id ? { id } : null }); }
      if (p === '/contacts/' && rq.method === 'POST') { const id = nuevoId('k'); W.contactos[id] = body.phone; return out(200, { contact: { id } }); }
      out(404, { message: 'ruta falsa: ' + p });
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

// ---------------------------------------------------------------- IA falsa
// «H <herramienta> <json>»: llama a esa herramienta; con su resultado responde «R <json>». Lo demás (dictado, ficha, lead) sale de las colas.
const IA = { llamadas: [], dictados: [], fichas: [], leads: [] };
const texto = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
const herramienta = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu' + Date.now() + Math.random(), name, input }], stop_reason: 'tool_use' });
function respuestaIa(b) {
  const ult = b.messages.at(-1);
  const contenido = typeof ult.content === 'string' ? ult.content : ult.content.map((x) => x.text || '').join('\n');
  const tr = Array.isArray(ult.content) && ult.content.find((x) => x.type === 'tool_result');
  if (tr) return texto('R ' + tr.content);
  if (/DICTAR_PROPIEDAD/.test(contenido)) return texto(JSON.stringify(IA.dictados.shift() || {}));
  if (/COMPLETAR_FICHA/.test(contenido)) return texto(JSON.stringify(IA.fichas.shift() || { plano: {}, ficha: {} }));
  if (/EXTRAER_LEAD/.test(contenido)) return texto(JSON.stringify(IA.leads.shift() || { resumen: 'Busca depto 2D en Ñuñoa', busqueda: { operacion: 'arriendo', tipo: 'departamento', comunas: ['Ñuñoa'], dormitorios: 2, presupuesto: { valor: 500000, moneda: 'CLP' } }, perfil: 'Profesional joven', estadoSugerido: 'contactado', proximaAccion: { texto: 'Enviarle opciones en Ñuñoa', fecha: null } }));
  const m = /^H (\w+) (\{.*\})$/m.exec(contenido);
  if (m && (b.tools || []).some((t) => t.name === m[1])) return herramienta(m[1], JSON.parse(m[2]));
  if (m) return texto('R ' + JSON.stringify({ error: `la herramienta ${m[1]} no está ofrecida`, ofrecidas: (b.tools || []).map((t) => t.name).join(',').slice(0, 900) }));
  return texto('ok');
}
function iaFalsa() {
  const s = http.createServer((rq, rs) => {
    let b = ''; rq.on('data', (x) => (b += x)); rq.on('end', () => {
      const body = JSON.parse(b || '{}'); IA.llamadas.push(body);
      rs.writeHead(200, { 'content-type': 'application/json' });
      rs.end(JSON.stringify({ id: 'msg_' + IA.llamadas.length, type: 'message', role: 'assistant', model: body.model, ...respuestaIa(body), stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20 } }));
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

// un .zip mínimo (sin compresión) con un chat exportado y una "foto" que no se sube (el chat de prueba no la menciona)
function zip(entradas) {
  const partes = []; const central = []; let off = 0;
  for (const [nombre, datos] of entradas) {
    const n = Buffer.from(nombre); const crc = zlib.crc32(datos);
    const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(datos.length, 18); loc.writeUInt32LE(datos.length, 22); loc.writeUInt16LE(n.length, 26);
    partes.push(loc, n, datos);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(datos.length, 20); c.writeUInt32LE(datos.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, n); off += 30 + n.length + datos.length;
  }
  const cd = Buffer.concat(central); const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10); fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([...partes, cd, fin]);
}

(async () => {
  const db = new PrismaClient();
  const srv = await wechatiaFalso(); const ia = await iaFalsa();
  const base = `http://127.0.0.1:${srv.address().port}`; const iaBase = `http://127.0.0.1:${ia.address().port}`;
  let co = null; const usuarios = [];
  try {
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    co = await db.corredora.create({ data: { nombre: `E2E Propiedades ${SUF}` } });
    const nu = async (n, rol, extra = {}) => { const x = await db.usuario.create({ data: { corredoraId: co.id, email: `e2e-pr${n}-${SUF}@prueba.cl`, nombre: 'Corredor ' + n.toUpperCase(), hashClave: hash, ...(rol ? { rol } : {}), ...extra } }); usuarios.push(x.id); return x; };
    const adm = await nu('a', 'ADMIN'); const c1 = await nu('b', null, { wechatiaId: 'wu-1' }); const c2 = await nu('c', null, { wechatiaId: 'wu-2' });
    const tA = await ingresar(adm.email, 'clave-e2e-123'); const t1 = await ingresar(c1.email, 'clave-e2e-123'); const t2 = await ingresar(c2.email, 'clave-e2e-123');
    ok(tA && t1 && t2, 'ingresan el administrador y dos corredores');
    let r = await req('PUT', '/whatsapp/conexion', { token: TOKEN, locationId: 'loc-1', base }, tA);
    ok(r.s === 200 && r.j.conectado, 'el administrador conecta el WhatsApp de la empresa (wechatia de prueba)');
    const cx = await db.conexion.findFirst({ where: { corredoraId: co.id, proveedor: 'wechatia' } });
    await db.conexion.update({ where: { id: cx.id }, data: { datos: { ...cx.datos, iaBase } } });

    // cada corredor vincula su celular (así el equipo lo atiende desde el servidor)
    const cel = {};
    for (const [k, t, tel] of [['b', t1, '+56 9 9111 1111'], ['c', t2, '+56 9 9222 2222']]) {
      r = await req('POST', '/whatsapp/ejecutivo/vincular', { nombre: 'Corredor ' + k.toUpperCase() }, t);
      cel[k] = conv({ telefono: tel, nombre: 'Corredor ' + k.toUpperCase() });
      escribe(cel[k], `Hola! ${r.j.codigo}`);
      ok(await hasta(() => salidas(cel[k]).some((x) => /quedó conectado/.test(x))), `el corredor ${k.toUpperCase()} vincula su celular`);
    }
    /** una herramienta como el corredor `k` (por su WhatsApp) → su resultado */
    const herr = async (k, nombre, input = {}, adjuntos = []) => {
      const antes = salidas(cel[k]).length;
      escribe(cel[k], `H ${nombre} ${JSON.stringify(input)}`, adjuntos);
      const m = await hasta(() => salidas(cel[k]).slice(antes).map((x) => /\nR (\{[\s\S]*\})$/.exec(x)).find(Boolean));
      if (!m) throw new Error(`sin respuesta de ${nombre}: ` + JSON.stringify(salidas(cel[k]).slice(antes)));
      if (process.env.DEPURAR) console.log('    · ' + nombre, m[1].slice(0, 600));
      return JSON.parse(m[1]);
    };
    const FUT = '2037-12-01'; // martes, lejos en el futuro (no choca con nada)
    // SOLO_NOMBRES=1: revisa solo que ninguna herramienta repita su nombre (rápido) y termina
    if (process.env.SOLO_NOMBRES) {
      await herr('b', 'resumen', {});
      const ts = (IA.llamadas.find((b) => (b.tools || []).length) || { tools: [] }).tools.map((t) => t.name);
      const rep = ts.filter((n, i) => ts.indexOf(n) !== i);
      console.log(`  herramientas ofrecidas: ${ts.length}; repetidas: ${JSON.stringify(rep)}`);
      return;
    }

    // ================================================================== PROPIEDADES
    // dictar → resumen, qué falta y dudas (no guarda nada)
    IA.dictados.push({ tipo: 'departamento', venta: true, precioVenta: { valor: 4500, moneda: 'UF' }, direccion: 'Irarrázaval 2450', comuna: 'Ñuñoa', dormitorios: 3, banos: 2, estacionamientos: 1, bodegas: 1, supUtil: 85, supTotal: 90, gastosComunes: 95000, caracteristicas: ['piscina', 'piso flotante'], titulo: 'Departamento 3D2B en Ñuñoa', descripcion: 'Departamento luminoso en Ñuñoa, con tres dormitorios y dos baños. Cuenta con piscina y piso flotante.', propietario: { nombre: 'Sara Dueña', rut: '12.345.678-5', email: 'sara@prueba.cl', telefono: '+56 9 5555 0001' }, dudas: ['Dijo 85 y 90 metros: ¿cuál es el útil?'], ficha: { piscina: true, pisoLiving: 'flotante' } });
    let x = await herr('b', 'dictar_propiedad', { texto: 'Depto en Irarrázaval 2450 Ñuñoa, tres dormitorios dos baños, 85 metros útiles, 4500 UF, la dueña es Sara Dueña 12.345.678-5' });
    ok(x.resumen && x.resumen.tipo === 'departamento' && x.resumen.precioVenta === 'UF 4.500' && x.resumen.dormitorios === 3, 'dictar_propiedad devuelve el resumen de campos (tipo, precio en UF, dormitorios…)');
    ok(x.faltan.some((t) => /N° de departamento/.test(t)) && x.dudas.length === 1 && /No la crees sin su sí/.test(x.indicacion), 'dice qué falta (el N° de depto es clave en un departamento) y las dudas, y que no se crea sin su sí');
    ok(!(await db.propiedad.count({ where: { corredoraId: co.id } })), 'dictar no crea nada');

    // crear: sin confirmado solo arma el resumen
    x = await herr('b', 'crear_propiedad', { titulo: 'Casa que nadie confirmó', tipo: 'casa', venta: true, confirmado: true });
    ok(/Primero hay que mostrarle el resumen/.test(x.error || '') && !(await db.propiedad.count({ where: { corredoraId: co.id } })), 'con confirmado pero sin haber mostrado el resumen, el servidor lo rechaza y no crea nada');
    x = await herr('b', 'crear_propiedad', { desde_dictado: true });
    ok(x.necesitaConfirmacion && x.resumen.titulo === 'Departamento 3D2B en Ñuñoa' && /Sara Dueña/.test(x.resumen.propietario), 'crear_propiedad SIN confirmado devuelve el resumen para confirmar (con el propietario dictado)');
    ok(!(await db.propiedad.count({ where: { corredoraId: co.id } })), 'y todavía no creó nada');
    x = await herr('b', 'crear_propiedad', { desde_dictado: true, precio_venta: 4600, confirmado: true });
    ok(/cambiaron desde el resumen/.test(x.error || ''), 'si cambian los datos entre el resumen y el sí, se rechaza hasta mostrar el nuevo resumen');
    x = await herr('b', 'crear_propiedad', { desde_dictado: true, precio_venta: 4600 });
    ok(x.necesitaConfirmacion && x.resumen.precioVenta === 'UF 4.600', 'el nuevo resumen trae la corrección del corredor (4.600 UF)');
    x = await herr('b', 'crear_propiedad', { desde_dictado: true, precio_venta: 4600, confirmado: true });
    ok(x.ok && /^PF-\d+$/.test(x.propiedad.codigo) && x.propietario.ok && x.propietario.nombre === 'Sara Dueña', 'con el sí del corredor crea la propiedad y al propietario ' + (x.propiedad && x.propiedad.codigo));
    const codigo = x.propiedad.codigo;
    ok(x.siguiente && x.siguiente.pedir.some((t) => /N° de departamento/.test(t)), 'y dice qué pedir ahora para completar la ficha');
    const p1 = await db.propiedad.findFirst({ where: { corredoraId: co.id, codigo }, include: { vinculos: { include: { persona: true } } } });
    ok(p1.captadorId === c1.id && p1.venta && !p1.arriendo && Number(p1.precioVenta) === 4600 && p1.monedaVenta === 'UF' && p1.estadoVenta === 'disponible' && p1.dormitorios === 3 && Number(p1.supUtil) === 85 && p1.etiquetas.includes('piscina') && p1.ficha.piscina === true, 'queda captada por el corredor, en venta, disponible y con lo dictado (precio, metros, equipamiento)');
    const sara = p1.vinculos.find((v) => v.rol === 'propietario')?.persona;
    ok(sara && sara.rut === '123456785' && sara.email === 'sara@prueba.cl' && sara.roles.includes('propietario'), 'el propietario dictado quedó en el CRM (RUT válido) y vinculado como propietario');
    ok(!!(await db.actividad.findFirst({ where: { corredoraId: co.id, entidadId: p1.id, texto: 'Propiedad creada' } })), 'la creación queda en el historial');
    ok(!!(await db.propiedad.findFirst({ where: { id: p1.id, version: 2 } })) || p1.version >= 1, 'la propiedad lleva su versión');

    // ficha por bloques
    x = await herr('b', 'ficha_pendiente', { propiedad: codigo });
    ok(x.bloques.length === 5 && x.bloques[0].faltaClave.some((t) => /N° de departamento/.test(t)) && x.pedirAhora.some((t) => /N° de departamento/.test(t)) && /Pídele SOLO lo de/.test(x.indicacion), 'ficha_pendiente: 5 bloques, lo clave que falta (N° de depto) y qué pedir ahora');
    const vAntes = (await db.propiedad.findUnique({ where: { id: p1.id } })).version;
    IA.fichas.push({ plano: { unidad: '504' }, ficha: { pisoUnidad: 5, orientacion: 'norte', ascensores: 2, mascotas: true, gimnasio: true }, dudas: [] });
    x = await herr('b', 'completar_ficha', { propiedad: codigo, texto: 'es el 504, quinto piso, orientación norte, dos ascensores, aceptan mascotas, hay gimnasio' });
    ok(x.ok && x.guardado.includes('N° de departamento, oficina o local') && x.guardado.includes('Orientación'), 'completar_ficha guarda cualquier dato dictado (N° de depto, piso, orientación, equipamiento…)');
    const p2 = await db.propiedad.findUnique({ where: { id: p1.id } });
    ok(p2.unidad === '504' && p2.ficha.pisoUnidad === 5 && p2.ficha.orientacion === 'Norte' && p2.ficha.mascotas === true && p2.ficha.gimnasio === true && p2.ficha.piscina === true, 'la ficha se SUMA a lo que había (la piscina sigue) y la orientación toma la opción de la lista («Norte»)');
    ok(p2.version > vAntes && (await db.actividad.count({ where: { corredoraId: co.id, entidadId: p1.id, texto: { startsWith: 'Ficha actualizada' } } })) >= 1, 'cada cambio sube la versión y queda en el historial');
    x = await herr('b', 'ficha_pendiente', { propiedad: codigo });
    ok(!x.bloques[0].faltaClave.some((t) => /N° de departamento/.test(t)), 'ya no falta el N° de departamento');
    // actualizar y estado
    x = await herr('b', 'actualizar_propiedad', { propiedad: codigo, precio_venta: 4400, gastos_comunes: 100000, descripcion: 'Departamento remodelado.' });
    ok(x.ok && x.propiedad.venta.precio === 'UF 4.400', 'actualizar_propiedad: el precio nuevo conserva la moneda (UF)');
    x = await herr('b', 'actualizar_propiedad', { propiedad: codigo });
    ok(/No indicaste qué cambiar/.test(x.error), 'sin datos no hace nada');
    x = await herr('b', 'cambiar_estado_propiedad', { propiedad: codigo, operacion: 'arriendo', estado: 'reservada' });
    ok(/no está en arriendo/.test(x.error || ''), 'no cambia el estado de una operación que la propiedad no tiene');
    x = await herr('b', 'cambiar_estado_propiedad', { propiedad: codigo, operacion: 'venta', estado: 'reservada' });
    ok(x.ok && x.propiedad.venta.estado === 'reservada' && Array.isArray(x.portal) && !x.portal.length, 'cambiar_estado_propiedad: la venta queda reservada (sin aviso en el portal, no toca nada afuera)');
    ok((await db.actividad.findFirst({ where: { corredoraId: co.id, entidadId: p1.id, texto: 'Estado: venta reservada' } })) != null, 'el cambio de estado queda en el historial');
    x = await herr('b', 'actualizar_propiedad', { propiedad: 'irarrazaval' });
    ok(/No indicaste/.test(x.error || ''), 'la propiedad también se encuentra por un texto (dirección)');
    // REST del mismo dominio
    r = await req('GET', `/propiedades/${p1.id}/ficha-pendiente`, null, tA);
    ok(r.s === 200 && r.j.bloques.length === 5 && r.j.bloques[2].faltaClave.length >= 1, 'REST ficha-pendiente: el administrador ve también lo legal que falta (Rol, exclusividad…)');

    // permisos: el corredor C no captó esta propiedad
    IA.fichas.push({ plano: {}, ficha: { propietarioCelular: '+56 9 1234 5678', formaVisitar: 'Pedir la llave al conserje' } });
    x = await herr('c', 'completar_ficha', { propiedad: codigo, texto: 'el celular del dueño es 9 1234 5678 y se visita pidiendo la llave al conserje' });
    ok(x.ok && x.guardado.includes('Forma de visitar') && !x.guardado.includes('Celular del propietario') && /solo los edita quien captó/.test((x.avisos || []).join(' ')), 'un corredor que no captó la propiedad no guarda datos del propietario (se avisa), pero sí lo demás');
    const p3 = await db.propiedad.findUnique({ where: { id: p1.id } });
    ok(!p3.ficha.propietarioCelular && p3.ficha.formaVisitar === 'Pedir la llave al conserje', 'en la base: el celular del dueño no quedó y la forma de visitar sí');
    x = await herr('c', 'ficha_pendiente', { propiedad: codigo });
    ok(x.bloques.every((b) => ![...b.faltaClave, ...b.faltaOpcional].some((q) => /propietario/i.test(q))) && !x.pedirAhora.some((q) => /propietario/i.test(q)), 'y su ficha pendiente no pide nada del propietario');
    const otra = await db.persona.create({ data: { corredoraId: co.id, nombre: 'Otro Dueño', roles: [] } });
    x = await herr('c', 'vincular_persona', { propiedad: codigo, persona: otra.id, rol: 'propietario' });
    ok(/lo vincula quien captó la propiedad o el administrador/.test(x.error || ''), 'tampoco puede vincular un propietario');
    x = await herr('c', 'ver_persona', { persona: 'Sara Dueña' });
    ok(/No tienes acceso a los datos/.test(x.error || ''), 'ni ver los datos del propietario de una propiedad ajena (reservado)');
    x = await herr('b', 'ver_persona', { persona: 'Sara Dueña' });
    ok(x.nombre === 'Sara Dueña' && x.propiedades.some((q) => q.codigo === codigo && q.rol === 'propietario'), 'el captador sí la ve, con sus propiedades y su rol');

    // crear directo (sin dictado), con un RUT de propietario inválido: crea la propiedad y avisa
    x = await herr('b', 'crear_propiedad', { titulo: 'Casa en La Reina', tipo: 'casa', arriendo: true, precio_arriendo: 1200000, comuna: 'La Reina', direccion: 'Larraín 6200', dormitorios: 4, banos: 3, propietario: { nombre: 'Pablo Dueño', rut: '11.111.111-2', telefono: '+56 9 5555 0002' } });
    ok(x.necesitaConfirmacion && x.resumen.precioArriendo === '$1.200.000' && x.faltan.length >= 1, 'crear directo: el resumen trae el arriendo en pesos y lo que falta');
    x = await herr('b', 'crear_propiedad', { titulo: 'Casa en La Reina', tipo: 'casa', arriendo: true, precio_arriendo: 1200000, comuna: 'La Reina', direccion: 'Larraín 6200', dormitorios: 4, banos: 3, propietario: { nombre: 'Pablo Dueño', rut: '11.111.111-2', telefono: '+56 9 5555 0002' }, confirmado: true });
    ok(x.ok && x.propietario.ok === false && /RUT/.test(x.propietario.motivo), 'con un RUT de propietario inválido la propiedad se crea igual y se avisa del propietario');
    const p4 = await db.propiedad.findFirst({ where: { corredoraId: co.id, titulo: 'Casa en La Reina' } });
    ok(p4 && p4.arriendo && !p4.venta && p4.estadoArriendo === 'disponible' && p4.monedaArriendo === 'CLP', 'queda en arriendo, disponible y en pesos');

    // configurar corredor
    x = await herr('b', 'configurar_corredor', { corredor_nombre: 'Beatriz Corredora', corredor_telefono: '+56 9 8888 7777' });
    ok(x.ok && x.usuario.nombre === 'Beatriz Corredora' && (await db.usuario.findUnique({ where: { id: c1.id } })).telefono === '+56 9 8888 7777', 'configurar_corredor guarda nombre y teléfono en la cuenta (de ahí salen los documentos)');
    x = await herr('b', 'configurar_corredor', { corredor_email: 'nuevo-' + SUF + '@prueba.cl' });
    ok(x.ok === false && /¿Lo cambio\?/.test(x.confirmar) && (await db.usuario.findUnique({ where: { id: c1.id } })).email === c1.email, 'cambiar el correo (que es también el de entrar) pide confirmación y no lo cambia');
    x = await herr('b', 'configurar_corredor', { corredor_email: 'nuevo-' + SUF + '@prueba.cl', confirmado: true });
    ok(x.ok && x.usuario.email === `nuevo-${SUF}@prueba.cl`, 'con la confirmación, lo cambia');
    await db.usuario.update({ where: { id: c1.id }, data: { email: c1.email } });

    // ================================================================== PERSONAS
    x = await herr('b', 'crear_persona', { nombre: 'Interesado Sin Rut', telefono: '+56 9 7000 0001', roles: ['interesado'] });
    ok(x.ok && x.persona.rut === null, 'crear_persona: el RUT es opcional');
    x = await herr('b', 'crear_persona', { nombre: 'Rut Malo', rut: '12.345.678-9' });
    ok(/no es válido/.test(x.error || '') && !(await db.persona.count({ where: { corredoraId: co.id, nombre: 'Rut Malo' } })), 'un RUT inválido se rechaza y no crea nada');
    x = await herr('b', 'crear_persona', { nombre: 'Comprador Uno', rut: '9.999.999-3', email: 'c1@prueba.cl', propiedad: codigo, rol_en_propiedad: 'comprador' });
    ok(x.ok && x.persona.rut === '9.999.999-3' && x.vinculadaA === codigo && x.como === 'comprador', 'con RUT válido la crea y la vincula a la propiedad con su rol');
    x = await herr('b', 'crear_persona', { nombre: 'Otro Con El Mismo', rut: '9999999-3' });
    ok(/Ya existe Comprador Uno con ese RUT/.test(x.error || ''), 'el RUT es único: dice quién ya lo tiene');
    x = await herr('b', 'crear_persona', { nombre: 'Correo Malo', email: 'no-es-correo' });
    ok(/correo .* no es válido/.test(x.error || ''), 'un correo inválido se rechaza');
    x = await herr('b', 'vincular_persona', { propiedad: codigo, persona: 'Interesado Sin Rut', rol: 'interesado' });
    ok(x.ok && /vinculado a/.test(x.texto) && !!(await db.propiedadPersona.findFirst({ where: { propiedadId: p1.id, rol: 'interesado' } })), 'vincular_persona: queda vinculada como interesado');
    x = await herr('b', 'nota', { persona: 'Comprador Uno', texto: 'Quiere financiar con crédito' });
    ok(x.ok && !!(await db.actividad.findFirst({ where: { corredoraId: co.id, entidadTipo: 'persona', texto: 'Quiere financiar con crédito', tipo: 'nota' } })), 'nota en una persona queda en su historial');
    x = await herr('b', 'nota', { propiedad: codigo, texto: 'Llaves en la oficina' });
    ok(x.ok && !!(await db.actividad.findFirst({ where: { corredoraId: co.id, entidadId: p1.id, texto: 'Llaves en la oficina', tipo: 'nota' } })), 'nota en una propiedad también');
    x = await herr('b', 'nota', { texto: 'sin destino' });
    ok(/Indica dónde va la nota/.test(x.error || ''), 'sin propiedad, persona ni negocio no anota');

    // ================================================================== LEADS
    x = await herr('b', 'crear_lead', { nombre: 'Lucía Lead', telefono: '+56 9 7111 2222', canal: 'instagram', operacion: 'arriendo', tipo: 'departamento', comunas: ['Ñuñoa'], presupuesto: 600000, dormitorios: 2, proxima_accion: 'Llamarla', fecha_proxima_accion: FUT });
    ok(x.ok && !x.yaExistia && x.lead.estado === 'nuevo' && x.lead.proximaAccion.texto === 'Llamarla' && /Quedó en Leads y también en Personas/.test(x.indicacion), 'crear_lead: sin pedir RUT, queda en Leads y en Personas');
    const lead1 = await db.lead.findFirst({ where: { corredoraId: co.id, telefonoNorm: '971112222' } });
    ok(lead1 && lead1.corredorId === c1.id && lead1.origen === 'instagram' && lead1.datos.busqueda.presupuesto.valor === 600000 && lead1.personaId, 'el lead queda a cargo del corredor, con lo que busca y ligado a su persona');
    const pl = await db.persona.findUnique({ where: { id: lead1.personaId } });
    ok(pl.nombre === 'Lucía Lead' && pl.roles.includes('interesado') && !pl.rut, 'la persona del lead: rol interesado, sin RUT');
    x = await herr('b', 'crear_lead', { nombre: 'Lucía L.', telefono: '9 7111 2222' });
    ok(x.ok && x.yaExistia && (await db.lead.count({ where: { corredoraId: co.id, telefonoNorm: '971112222' } })) === 1, 'el mismo celular no duplica el lead');
    x = await herr('b', 'crear_lead', { notas: 'sin datos' });
    ok(/al menos el nombre, el celular o el correo/.test(x.error || ''), 'sin nombre, celular ni correo no se crea');
    x = await herr('b', 'actualizar_lead', { lead: 'Lucía', estado: 'visita', proxima_accion: 'Mostrarle el depto', fecha_proxima_accion: FUT });
    ok(x.ok && x.lead.estado === 'visita' && x.lead.proximaAccion.texto === 'Mostrarle el depto' && (await db.lead.findUnique({ where: { id: lead1.id } })).version > lead1.version, 'actualizar_lead: estado y próxima acción, subiendo la versión');
    x = await herr('b', 'actualizar_lead', { lead: 'Lucía', estado: 'perdido' });
    ok(/necesito el motivo/.test(x.error || ''), 'perdido pide el motivo');
    x = await herr('b', 'actualizar_lead', { lead: 'Lucía', estado: 'perdido', motivo: 'Arrendó otro' });
    ok(x.ok && x.lead.estado === 'perdido' && x.lead.motivoPerdida === 'Arrendó otro', 'con el motivo queda perdido');
    x = await herr('c', 'actualizar_lead', { lead: 'Lucía', estado: 'ganado' });
    ok(/No encontré un lead/.test(x.error || ''), 'otro corredor no ve ni cambia ese lead');
    x = await herr('b', 'registrar_lead_desde_chat', {});
    ok(/No veo el archivo del chat/.test(x.error || ''), 'registrar_lead_desde_chat sin archivo explica cómo exportar el chat');
    x = await herr('b', 'registrar_lead_desde_chat', { confirmado: true });
    ok(/No tengo un chat analizado/.test(x.error || ''), 'y no guarda nada si no hay un análisis pendiente');
    // chat exportado mandado por WhatsApp (el equipo baja el archivo y se lo pasa a la herramienta)
    const chatZ = '[17/11/26, 09:00:00] Zoe Zeta: Hola, busco una casa en La Reina para arrendar\n[17/11/26, 09:01:00] Corredor B: Hola Zoe, ¿cuántos dormitorios?\n[17/11/26, 09:02:00] Zoe Zeta: Cuatro, y que acepten mascotas\n';
    W.archivos['Chat de WhatsApp con Zoe Zeta.txt'] = { mime: 'text/plain', bytes: Buffer.from(chatZ) };
    IA.leads.push({ resumen: 'Busca casa de 4D en La Reina para arrendar', busqueda: { operacion: 'arriendo', tipo: 'casa', comunas: ['La Reina'], dormitorios: 4, mascotas: true }, perfil: null, estadoSugerido: 'nuevo', proximaAccion: { texto: 'Mostrarle la casa de Larraín', fecha: null } });
    x = await herr('b', 'registrar_lead_desde_chat', {}, [`${base}/archivos/Chat%20de%20WhatsApp%20con%20Zoe%20Zeta.txt`]);
    ok(x.necesitaConfirmacion && x.cliente === 'Zoe Zeta' && x.mensajes === 3 && /4D en La Reina/.test(x.analisis.resumen) && !x.existente, 'registrar_lead_desde_chat (por WhatsApp, con el .txt adjunto): lo lee, lo analiza y devuelve el resumen para confirmar');
    ok(!(await db.lead.count({ where: { corredoraId: co.id, datos: { path: ['chatCon'], equals: 'Zoe Zeta' } } })), 'y todavía no guardó nada');
    x = await herr('c', 'registrar_lead_desde_chat', { confirmado: true });
    ok(/No tengo un chat analizado/.test(x.error || ''), 'otro corredor no puede confirmar el chat de este');
    x = await herr('b', 'registrar_lead_desde_chat', { confirmado: true });
    ok(x.ok && x.nuevo && x.agregados === 3 && x.lead.nombre === 'Zoe Zeta' && x.lead.busqueda.dormitorios === 4 && x.lead.proximaAccion.texto === 'Mostrarle la casa de Larraín', 'con el sí (sin volver a mandar el archivo) guarda el lead con sus 3 mensajes, lo que busca y la próxima acción');
    const leadZ = await db.lead.findFirst({ where: { corredoraId: co.id, datos: { path: ['chatCon'], equals: 'Zoe Zeta' } } });
    ok(leadZ && leadZ.corredorId === c1.id && leadZ.origen === 'chat' && leadZ.personaId && (await db.leadMensaje.count({ where: { leadId: leadZ.id } })) === 3, 'queda a cargo del corredor, como «Chat exportado», con su persona y su conversación');
    x = await herr('b', 'registrar_lead_desde_chat', { confirmado: true });
    ok(/No tengo un chat analizado/.test(x.error || ''), 'el análisis se usa una sola vez');
    // chat exportado (REST): .txt de iOS con dos participantes
    const chat = '[16/11/26, 12:24:05] Carlos Cliente: Hola, vi el depto de Irarrázaval, ¿sigue disponible?\n[16/11/26, 12:25:10] Corredor B: Hola Carlos, sí, está disponible\n[16/11/26, 12:26:00] Carlos Cliente: Busco 2D en Ñuñoa, mi presupuesto es 500 lucas\n[16/11/26, 12:27:00] Corredor B: Perfecto, ¿te va bien una visita el jueves?\n';
    r = await req('POST', '/leads-acciones/chat/analizar', { archivo: Buffer.from(chat).toString('base64'), nombre: 'Chat de WhatsApp con Carlos Cliente.txt' }, t1);
    ok(r.s === 201 && r.j.cliente === 'Carlos Cliente' && r.j.total === 4 && r.j.token && !r.j.existente && r.j.analisis && /2D en Ñuñoa/.test(r.j.analisis.resumen), 'chat .txt: analiza sin guardar (cliente, 4 mensajes, resumen de la IA) ' + JSON.stringify(r.j).slice(0, 120));
    ok(!(await db.lead.count({ where: { corredoraId: co.id, datos: { path: ['chatCon'], equals: 'Carlos Cliente' } } })), 'analizar no guarda nada');
    const tok = r.j.token;
    r = await req('POST', '/leads-acciones/chat/importar', { token: tok }, t2);
    ok(r.s === 400 && /expiró/.test(JSON.stringify(r.j)), 'otro usuario no puede confirmar el análisis de este corredor');
    r = await req('POST', '/leads-acciones/chat/importar', { token: tok }, t1);
    ok(r.s === 201 && r.j.nuevo && r.j.agregados === 4 && r.j.lead.estado === 'contactado' && r.j.lead.busqueda.dormitorios === 2 && r.j.lead.personaId, 'importar guarda el lead con sus 4 mensajes, lo que busca y su persona');
    const leadC = r.j.lead.id;
    ok((await db.leadMensaje.count({ where: { leadId: leadC } })) === 4 && (await db.leadMensaje.count({ where: { leadId: leadC, de: 'cliente' } })) === 2, 'los mensajes quedan en la conversación (2 del cliente, 2 del corredor)');
    r = await req('POST', '/leads-acciones/chat/analizar', { archivo: Buffer.from(chat + '[16/11/26, 12:30:00] Carlos Cliente: El jueves a las 6 me acomoda\n').toString('base64'), nombre: 'Chat de WhatsApp con Carlos Cliente.txt' }, t1);
    ok(r.j.existente && r.j.existente.id === leadC && r.j.existente.nuevos === 1, 'volver a mandar el chat reconoce al lead existente y cuenta solo lo nuevo (1 mensaje)');
    r = await req('POST', '/leads-acciones/chat/importar', { token: r.j.token }, t1);
    ok(r.j.agregados === 1 && !r.j.nuevo && (await db.leadMensaje.count({ where: { leadId: leadC } })) === 5 && (await db.lead.count({ where: { corredoraId: co.id, personaId: r.j.lead.personaId } })) === 1, 'importar agrega solo lo nuevo (5 en total) y no duplica el lead');
    // .zip y un chat de tres participantes (hay que preguntar quién es el cliente)
    const chat3 = '16/11/26, 10:00 - Ana: hola a todos\n16/11/26, 10:01 - Beto: hola\n16/11/26, 10:02 - Corredor B: buenas\n16/11/26, 10:03 - Ana: busco casa en Colina\n';
    r = await req('POST', '/leads-acciones/chat/analizar', { archivo: zip([['_chat.txt', Buffer.from(chat3)], ['IMG-1.jpg', Buffer.from('x')]]).toString('base64'), nombre: 'Chat de WhatsApp con grupo.zip' }, t1);
    ok(r.s === 201 && r.j.preguntar === 'cliente' && r.j.participantes.length === 3 && !r.j.token, '.zip con 3 participantes: lee el .txt del .zip y pregunta quién es el cliente');
    r = await req('POST', '/leads-acciones/chat/analizar', { archivo: zip([['_chat.txt', Buffer.from(chat3)], ['IMG-1.jpg', Buffer.from('x')]]).toString('base64'), nombre: 'Chat de WhatsApp con grupo.zip', cliente: 'Ana' }, t1);
    ok(r.j.cliente === 'Ana' && r.j.total === 4 && r.j.token, 'con el cliente indicado, lo analiza (formato Android)');
    r = await req('POST', '/leads-acciones/chat/analizar', { archivo: Buffer.from('esto no es un chat').toString('base64'), nombre: 'nota.txt' }, t1);
    ok(r.s === 400 && /no parece un chat exportado/.test(JSON.stringify(r.j)), 'un archivo que no es un chat se rechaza con un mensaje claro');

    // ================================================================== AGENDA
    x = await herr('b', 'crear_evento', { tipo: 'visita', fecha: FUT, hora: '10:00' });
    ok(/necesita la propiedad/.test(x.error || ''), 'una visita sin propiedad se rechaza');
    x = await herr('b', 'crear_evento', { tipo: 'visita', fecha: FUT, dia_semana: 'jueves', hora: '10:00', propiedad: codigo });
    ok(/es martes, no jueves/.test(x.error || '') && /NO agendes todavía/.test(x.error), 'si el día de la semana no coincide con la fecha, no agenda y pide aclarar');
    x = await herr('b', 'crear_evento', { tipo: 'visita', fecha: FUT, dia_semana: 'martes', hora: '10:00', propiedad: codigo, personas: ['Comprador Uno'], notas: 'Llevar llaves' });
    ok(x.ok && x.evento.hora === '10:00' && x.evento.duracion === 45 && /Visita · PF-\d+/.test(x.evento.titulo) && x.evento.propiedad === codigo, 'crear_evento: visita de 45 min con título y lugar por defecto');
    const ev1 = x.evento.id;
    const e1 = await db.evento.findUnique({ where: { id: ev1 } });
    ok(e1.corredorId === c1.id && e1.propiedadId === p1.id && e1.personaIds.length === 1 && /Irarrázaval 2450/.test(e1.datos.lugar), 'queda a cargo del corredor, ligada a la propiedad y la persona, con la dirección como lugar');
    ok((await db.actividad.count({ where: { corredoraId: co.id, ref2: ev1 } })) >= 2, 'la visita queda en el historial del evento, la propiedad y la persona');
    x = await herr('b', 'crear_evento', { tipo: 'visita', fecha: FUT, hora: '10:30', propiedad: codigo });
    ok(x.error && x.conflicto && /se cruza con otra visita de esta propiedad \(10:00–10:45\)/.test(x.error), 'una visita que se cruza con otra de la propiedad devuelve el conflicto claro (10:00–10:45)');
    x = await herr('b', 'crear_evento', { tipo: 'visita', fecha: FUT, hora: '10:30', propiedad: 'Larraín' });
    ok(x.error && x.conflicto && /Ya tienes otra visita en ese horario/.test(x.error), 'ni el corredor puede estar en dos visitas a la vez (otra propiedad, mismo horario)');
    x = await herr('b', 'crear_evento', { tipo: 'reunion', fecha: FUT, hora: '10:15', titulo: 'Reunión con el banco' });
    ok(x.ok, 'una reunión no ocupa horario de visitas: se agenda aunque coincida');
    const evR = x.evento.id;
    x = await herr('b', 'crear_evento', { tipo: 'visita', fecha: FUT, hora: '11:00', propiedad: 'Larraín', duracion: 30 });
    ok(x.ok && x.evento.duracion === 30, 'y una visita justo después (11:00) sí');
    const ev2 = x.evento.id;
    x = await herr('b', 'buscar_eventos', { desde: FUT, hasta: FUT });
    ok(x.total === 3 && x.eventos.every((e) => e.id) && x.eventos[0].hora === '10:00', 'buscar_eventos devuelve los eventos con su id, en orden');
    x = await herr('c', 'buscar_eventos', { desde: FUT, hasta: FUT });
    ok(x.total === 0, 'el otro corredor no ve los eventos ajenos');
    x = await herr('b', 'actualizar_evento', { evento: ev2, hora: '10:30' });
    ok(x.error && x.conflicto, 'reprogramar una visita a un horario que se cruza también se rechaza');
    x = await herr('b', 'actualizar_evento', { evento: ev2, fecha: '2037-12-02', hora: '09:00', notas: 'Reprogramada por el cliente' });
    ok(x.ok && x.evento.fecha === '2037-12-02' && x.evento.hora === '09:00', 'actualizar_evento reprograma (nueva fecha y hora)');
    ok((await db.evento.findUnique({ where: { id: ev2 } })).version > 1 && !!(await db.actividad.findFirst({ where: { corredoraId: co.id, entidadId: ev2, texto: 'Visita reprogramada para 2037-12-02 09:00' } })), 'subió su versión y quedó en el historial');
    x = await herr('b', 'actualizar_evento', { evento: ev1, estado: 'cancelado' });
    ok(x.ok && x.evento.estado === 'cancelado', 'cancelar una visita');
    x = await herr('b', 'crear_evento', { tipo: 'visita', fecha: FUT, hora: '10:00', propiedad: codigo });
    ok(x.ok, 'una visita cancelada libera el horario');
    x = await herr('b', 'actualizar_evento', { evento: evR, estado: 'hecho' });
    ok(x.ok && x.evento.estado === 'hecho', 'marcar una reunión como hecha');
    x = await herr('b', 'actualizar_evento', { evento: 'Reunión con el banco', estado: 'programado' });
    ok(x.ok || /No encontré/.test(x.error), 'un evento también se encuentra por un texto (las futuras sin cancelar)');
    x = await herr('c', 'actualizar_evento', { evento: ev1, estado: 'hecho' });
    ok(x.error, 'otro corredor no puede cambiar un evento ajeno');
    x = await herr('b', 'actualizar_evento', { evento: ev2 });
    ok(/No indicaste qué cambiar/.test(x.error || ''), 'sin cambios no hace nada');

    // ================================================================== PORTALES (la API de desarrollo no tiene Mercado Libre configurado)
    x = await herr('b', 'publicar_portal', { propiedad: codigo, operacion: 'arriendo' });
    ok(/no está marcada en arriendo/.test(x.error || ''), 'publicar_portal: la operación debe estar en la ficha');
    x = await herr('b', 'publicar_portal', { propiedad: codigo, operacion: 'venta' });
    ok(/No se puede publicar todavía/.test(x.error || '') && Array.isArray(x.faltan) && x.faltan.length >= 1, 'publicar_portal revisa la ficha y dice qué falta (sin cuenta conectada, también eso): ' + (x.faltan || []).slice(0, 2).join(' | '));
    x = await herr('b', 'publicar_portal', { propiedad: codigo, operacion: 'venta', confirmado: true });
    ok(x.error, 'publicar con confirmado sin haber revisado antes se rechaza');
    x = await herr('b', 'aviso_portal', { propiedad: codigo, operacion: 'venta', accion: 'pausar' });
    ok(/no tiene aviso de venta en Portal Inmobiliario/.test(x.error || ''), 'aviso_portal: sin aviso publicado no hay qué pausar');
    x = await herr('b', 'sincronizar_portal', {});
    ok(x.error, 'sincronizar_portal sin la cuenta conectada lo dice: ' + String(x.error).slice(0, 80));
    // un aviso y un interesado del portal sembrados en la propiedad (como los deja la sincronización)
    await db.propiedad.update({ where: { id: p1.id }, data: { portales: { pi: { venta: { itemId: 'MLC999', status: 'active', permalink: 'https://portal.test/MLC999', publicado: new Date(Date.now() - 30 * 864e5).toISOString(), stats: { visitas: 120, contactos: 0 } } } }, leadsPortal: [{ id: 'l1', portal: 'Portal Inmobiliario', canalTxt: 'WhatsApp', nombre: 'Interesada Portal', telefono: '+56 9 7222 3333', itemId: 'MLC999', fecha: new Date().toISOString(), visto: false }] } });
    x = await herr('b', 'rendimiento_avisos', { propiedad: codigo });
    ok(x.avisos.length === 1 && x.avisos[0].visitas === 120 && x.avisos[0].dias >= 29 && x.avisos[0].recomendaciones.some((t) => /sin contactos/.test(t)), 'rendimiento_avisos: visitas, días publicada y la recomendación de precio (30 días sin contactos)');
    x = await herr('b', 'bandeja_interesados', { estado: 'nuevo' });
    ok(x.total === 1 && x.interesados[0].nombre === 'Interesada Portal' && x.interesados[0].propiedad === codigo, 'bandeja_interesados: el interesado nuevo del portal');
    x = await herr('b', 'bandeja_interesados', { estado: 'visita' });
    ok(x.total === 0, 'filtra por estado');
    x = await herr('b', 'aviso_portal', { propiedad: codigo, operacion: 'venta', accion: 'finalizar' });
    ok(x.necesitaConfirmacion && /no se puede deshacer|no se puede reactivar/i.test(x.aviso), 'aviso_portal: finalizar pide confirmación y avisa que no se puede deshacer');
    x = await herr('b', 'aviso_portal', { propiedad: codigo, operacion: 'venta', accion: 'pausar', confirmado: true });
    ok(/Primero hay que mostrarle el resumen/.test(x.error || ''), 'y con confirmado de otra acción (no la que se mostró) se rechaza');

    // ================================================================== el modelo de IA recibió las herramientas
    const nombres = new Set((IA.llamadas.find((b) => (b.tools || []).some((t) => t.name === 'crear_propiedad')) || { tools: [] }).tools.map((t) => t.name));
    for (const n of ['dictar_propiedad', 'crear_propiedad', 'actualizar_propiedad', 'ficha_pendiente', 'completar_ficha', 'cambiar_estado_propiedad', 'configurar_corredor', 'crear_persona', 'vincular_persona', 'nota', 'crear_lead', 'actualizar_lead', 'registrar_lead_desde_chat', 'crear_evento', 'actualizar_evento', 'publicar_portal', 'aviso_portal', 'sincronizar_portal', 'rendimiento_avisos', 'bandeja_interesados'])
      ok(nombres.has(n), `la IA ve la herramienta ${n}`);
    const todas = (IA.llamadas.find((b) => (b.tools || []).length) || { tools: [] }).tools.map((t) => t.name);
    const repetidas = todas.filter((n, k) => todas.indexOf(n) !== k);
    const mias = ['dictar_propiedad', 'crear_propiedad', 'actualizar_propiedad', 'ficha_pendiente', 'completar_ficha', 'cambiar_estado_propiedad', 'configurar_corredor', 'ver_persona', 'crear_persona', 'vincular_persona', 'nota', 'crear_lead', 'actualizar_lead', 'registrar_lead_desde_chat', 'buscar_eventos', 'crear_evento', 'actualizar_evento', 'publicar_portal', 'aviso_portal', 'sincronizar_portal', 'rendimiento_avisos', 'bandeja_interesados'];
    ok(!repetidas.some((n) => mias.includes(n)), 'ninguna de estas herramientas repite su nombre con las de equipo.ts ni con las de otros módulos');
    if (repetidas.length) console.log('  ⚠ nombres repetidos en el registro (de otros módulos; Anthropic rechaza nombres repetidos): ' + JSON.stringify([...new Set(repetidas)]));
  } finally {
    srv.close(); ia.close();
    console.log('  · limpiando los datos de prueba…');
    if (co) {
      const w = { where: { corredoraId: co.id } };
      for (const m of ['waEntrante', 'waVinculo', 'waHilo', 'waEnviado', 'waConversacion', 'waAjustes', 'iaConsumo', 'waProgramado', 'aviso', 'conexion', 'registro', 'actividad', 'evento', 'firma', 'leadMensaje', 'lead', 'negocio']) await db[m].deleteMany(w).catch(() => {});
      await db.propiedadPersona.deleteMany({ where: { propiedad: { corredoraId: co.id } } });
      await db.propiedadFoto.deleteMany({ where: { propiedad: { corredoraId: co.id } } });
      await db.propiedad.deleteMany(w); await db.persona.deleteMany(w); await db.contador.deleteMany(w);
      await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
      await db.usuario.deleteMany({ where: { id: { in: usuarios } } });
      await db.corredora.delete({ where: { id: co.id } }).catch((e) => console.warn('no se borró la corredora de prueba:', e.message));
    }
    await db.$disconnect();
  }
})().then(() => { console.log('OK propiedades-herramientas'); process.exit(process.exitCode ?? 0); }, (e) => { console.error(e.message); process.exit(1); });
