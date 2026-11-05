// Prueba de punta a punta de los WhatsApp programados (/v1/whatsapp/programados) y de la clave de wechatia de la
// corredora (/v1/whatsapp/conexion), contra la API corriendo (yarn dev) y asset_dev, con un wechatia FALSO que levanta
// esta misma prueba (la conexión de prueba guarda su dirección en «base», que solo se acepta fuera de producción).
// Crea una corredora de prueba con su administrador y dos corredores, y al final la borra con todo lo suyo.
// Uso: node test/programados-e2e.js [url]      (tarda ~1,5 min: espera dos rondas del servidor, que van cada 30 s)
// Revisa: conectar la clave (se prueba antes de guardar; la primera la sube cualquiera, después solo el administrador);
// crear (idempotente), importar, cancelar; la ronda envía lo que toca una sola vez, con texto libre si escribió en 24 h
// (según wechatia o según los mensajes de sus leads en Asset), con la plantilla activa si no, y falla con el motivo si
// la plantilla no está activa; anota en el historial de la persona; un rechazo posterior de Meta queda «no_entregado»
// y se vuelve a avisar; un envío atascado queda fallido sin reenviarse; el aviso se toma una sola vez; nadie ve los
// de otro; sin clave, falla con el motivo.
const fs = require('fs');
const path = require('path');
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

// ---------------------------------------------------------------- wechatia falso
// Teléfonos: …1111 escribió hace poco (wechatia lo confirma); …2222 no escribió; …3333 wechatia no sabe, pero en Asset
// hay un mensaje suyo de hace 2 h; …4444 escribió, pero Meta lo rechaza 20 s después de enviarlo.
const W = { enviados: [], tags: [], campos: [], contactos: {}, msgs: {} };
const TOKEN = 'pit-prueba-' + 'x'.repeat(30);
function wechatiaFalso() {
  const s = http.createServer((rq, rs) => {
    let b = ''; rq.on('data', (c) => (b += c)); rq.on('end', () => {
      const u = new URL(rq.url, 'http://x'); const p = u.pathname; const body = b ? JSON.parse(b) : null;
      const out = (code, j) => { rs.writeHead(code, { 'content-type': 'application/json' }); rs.end(JSON.stringify(j)); };
      if (rq.headers.authorization !== 'Bearer ' + TOKEN) return out(401, { message: 'no' });
      const dig = (x) => String(x || '').replace(/\D/g, '').slice(-4);
      if (p === '/conversations/search') {
        const cid = u.searchParams.get('contactId'); if (!cid) return out(200, { conversations: [] });
        if (dig(W.contactos[cid]) === '3333') return out(500, { message: 'caído' }); // no se puede saber
        return out(200, { conversations: [{ id: 'cv-' + cid, contactId: cid }] });
      }
      const mc = p.match(/^\/conversations\/cv-([^/]+)\/messages$/);
      if (mc) { const t = dig(W.contactos[mc[1]]); return out(200, { messages: { messages: ['1111', '4444'].includes(t) ? [{ direction: 'inbound', dateAdded: new Date(Date.now() - 36e5).toISOString() }] : [] } }); }
      if (p === '/contacts/search/duplicate') { const n = u.searchParams.get('number'); const id = Object.keys(W.contactos).find((k) => W.contactos[k] === n); return out(200, { contact: id ? { id } : null }); }
      if (p === '/contacts/' && rq.method === 'POST') { const id = 'k' + Object.keys(W.contactos).length; W.contactos[id] = body.phone; return out(200, { contact: { id } }); }
      if (p === '/conversations/messages' && rq.method === 'POST') { const id = 'm' + W.enviados.length; W.enviados.push({ ...body, id, t: Date.now() }); return out(200, { messageId: id }); }
      const mm = p.match(/^\/conversations\/messages\/(m\d+)$/);
      if (mm) { const e = W.enviados.find((x) => x.id === mm[1]); const rech = e && dig(W.contactos[e.contactId]) === '4444';
        return out(200, { message: { id: mm[1], status: rech ? (Date.now() - e.t > 20000 ? 'failed' : 'sent') : 'delivered', meta: rech ? { error: 'more than 24 hours' } : {} } }); }
      if (/\/customFields$/.test(p)) return out(200, { customFields: [{ id: 'cf1', fieldKey: 'contact.asset_remitente' }] });
      const pc = p.match(/^\/contacts\/([^/]+)$/); if (pc && rq.method === 'PUT') { W.campos.push({ contactId: pc[1], ...body }); return out(200, {}); }
      const pt = p.match(/^\/contacts\/([^/]+)\/tags$/); if (pt) { if (rq.method === 'POST') W.tags.push({ contactId: pt[1], tags: body.tags }); return out(200, {}); }
      out(404, { message: 'ruta falsa: ' + p });
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

(async () => {
  const db = new PrismaClient();
  const srv = await wechatiaFalso(); const base = `http://127.0.0.1:${srv.address().port}`;
  let co = null; let otraCo = null; const usuarios = [];
  try {
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    co = await db.corredora.create({ data: { nombre: `E2E Programados ${SUF}` } });
    otraCo = await db.corredora.create({ data: { nombre: `E2E Otra ${SUF}` } });
    const nu = async (cid, n, rol) => { const x = await db.usuario.create({ data: { corredoraId: cid, email: `e2e-wp${n}-${SUF}@prueba.cl`, nombre: 'E2E WP ' + n, hashClave: hash, ...(rol ? { rol } : {}) } }); usuarios.push(x.id); return x; };
    const adm = await nu(co.id, 'a', 'ADMIN'); const c1 = await nu(co.id, '1'); const c2 = await nu(co.id, '2'); const o1 = await nu(otraCo.id, 'o', 'ADMIN');
    const tA = await ingresar(adm.email, 'clave-e2e-123'); const t1 = await ingresar(c1.email, 'clave-e2e-123'); const t2 = await ingresar(c2.email, 'clave-e2e-123'); const tO = await ingresar(o1.email, 'clave-e2e-123');
    ok(tA && t1 && t2 && tO, 'ingresan el administrador, dos corredores y el de otra corredora');

    // ---- la clave de wechatia
    let r = await req('GET', '/whatsapp/conexion', null, t1);
    ok(r.j.conectado === false && r.j.puedeConectar === true, 'sin clave: no conectado, y el corredor puede subir la primera');
    r = await req('PUT', '/whatsapp/conexion', { token: 'pit-mala-' + 'y'.repeat(30), locationId: 'loc-1', base }, t1);
    ok(r.s === 400 && /no aceptó/.test(r.j.message), 'una clave que wechatia rechaza no se guarda');
    r = await req('PUT', '/whatsapp/conexion', { token: TOKEN, locationId: 'loc-1', base }, t1);
    ok(r.s === 200 && r.j.conectado && r.j.locationId === 'loc-1' && !JSON.stringify(r.j).includes(TOKEN), 'el corredor sube la primera (probada) y la respuesta no trae la clave');
    const cx = await db.conexion.findFirst({ where: { corredoraId: co.id, proveedor: 'wechatia' } });
    ok(cx.tipo === 'clave' && cx.dueno === 'corredora' && cx.accesoCif.startsWith('v1.') && !cx.accesoCif.includes(TOKEN), 'en la base: de la corredora, tipo clave y cifrada');
    r = await req('PUT', '/whatsapp/conexion', { token: TOKEN, locationId: 'loc-2', base }, t2);
    ok(r.s === 403, 'ya conectada: otro corredor no la cambia');
    ok((await req('DELETE', '/whatsapp/conexion', null, t1)).s === 403, 'ni la desconecta');
    r = await req('PUT', '/whatsapp/conexion', { token: TOKEN, locationId: 'loc-1', base }, tA);
    ok(r.s === 200 && r.j.puedeConectar, 'el administrador sí la cambia');
    ok((await req('GET', '/whatsapp/conexion', null, tO)).j.conectado === false, 'otra corredora no la ve como suya');

    // ---- crear, importar, cancelar
    const ya = new Date(Date.now() - 60_000).toISOString(); const luego = new Date(Date.now() + 864e5).toISOString();
    const P = (n, tel, extra = {}) => ({ id: `wp${SUF}${n}`, telefono: tel, nombre: 'Cliente ' + n, texto: `Hola ${n}, te recuerdo la visita`, cuando: ya, ...extra });
    const plantilla = (id) => ({ id, nombre: 'asset_' + id, etiqueta: 'asset-' + id, campos: { remitente: 'Ana Corredora', motivo: 'la visita' } });
    r = await req('POST', '/whatsapp/programados', P('a', '+56 9 1111 1111', { personaId: `per${SUF}` }), t1);
    ok(r.s === 201 && r.j.estado === 'programado' && r.j.cuando === ya, 'el corredor programa uno (ya toca)');
    r = await req('POST', '/whatsapp/programados', P('a', '+56 9 1111 1111', { texto: 'OTRO' }), t1);
    ok(r.j.texto.startsWith('Hola a'), 'crearlo de nuevo con el mismo id no lo duplica ni lo cambia');
    ok((await req('POST', '/whatsapp/programados', P('a', '+56 9 1111 1111'), t2)).s === 404, 'otro corredor no puede usar ese id');
    await req('POST', '/whatsapp/programados', P('b', '+56 9 2222 2222', { plantilla: plantilla('primer_contacto') }), t1); // fuera de 24 h, plantilla inactiva
    await req('POST', '/whatsapp/programados', P('c', '+56 9 2222 2222', { plantilla: plantilla('seguimiento_lead') }), t1); // fuera de 24 h, plantilla activa
    await req('POST', '/whatsapp/programados', P('e', '+56 9 4444 4444'), t1); // Meta lo rechaza después
    r = await req('POST', '/whatsapp/programados/importar', { items: [P('f', '+56 9 3333 3333'), P('a', '+56 9 1111 1111'), { id: 'x', texto: '' }, P('g', '+56 9 1111 1111', { cuando: luego })] }, t1);
    ok(r.j.nuevos === 2 && r.j.existentes === 1 && r.j.rechazados.length === 1, 'importar sube los nuevos, no pisa y rechaza los malos');
    await req('POST', '/whatsapp/programados', P('h', '+56 9 1111 1111', { cuando: luego }), t1);
    ok((await req('DELETE', `/whatsapp/programados/wp${SUF}h`, null, t2)).s === 404, 'otro corredor no cancela uno ajeno');
    r = await req('DELETE', `/whatsapp/programados/wp${SUF}h`, null, t1);
    ok(r.j.ok && r.j.estado === 'cancelado', 'el dueño cancela uno que aún no sale');
    // la plantilla «seguimiento_lead» activa en la configuración de la corredora
    await db.registro.create({ data: { corredoraId: co.id, coleccion: 'corredora_config', id: 'corredora', datos: { waPlantillas: { seguimiento_lead: true } } } });
    // …3333: Asset tiene un mensaje suyo de hace 2 h (wechatia no lo puede confirmar)
    const hc = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'medium' }).format(d).replace(' ', 'T');
    await db.lead.create({ data: { id: `ld${SUF}`, corredoraId: co.id, telefonoNorm: '933333333', datos: {} } });
    await db.leadMensaje.create({ data: { leadId: `ld${SUF}`, corredoraId: co.id, k: 'k1', fecha: hc(new Date(Date.now() - 2 * 36e5)), de: 'cliente', texto: 'hola' } });
    // un envío atascado (la API se cayó a mitad)
    await req('POST', '/whatsapp/programados', P('z', '+56 9 1111 1111', { cuando: luego }), t1);
    await db.$executeRaw`UPDATE wa_programados SET estado = 'enviando', actualizado_en = now() - interval '11 minutes' WHERE id = ${`wp${SUF}z`}`;
    // una corredora sin clave
    await req('POST', '/whatsapp/programados', { ...P('o', '+56 9 1111 1111'), id: `wp${SUF}o` }, tO);
    const marca = new Date().toISOString();

    // ---- la ronda
    const lista = async (t, desde) => (await req('GET', '/whatsapp/programados' + (desde ? `?desde=${encodeURIComponent(desde)}` : ''), null, t)).j.items;
    const de = (l, n) => l.find((x) => x.id === `wp${SUF}${n}`);
    process.stdout.write('  … esperando la ronda del servidor\n');
    let l; for (let i = 0; i < 40; i++) { await esperar(2500); l = await lista(t1); if (['a', 'b', 'c', 'e', 'f', 'z'].every((n) => de(l, n).estado !== 'programado' && de(l, n).estado !== 'enviando')) break; }
    const a = de(l, 'a');
    ok(a.estado === 'enviado' && a.resultado.messageId && a.resultado.entrega === 'delivered' && a.enviadoEn, 'escribió en 24 h: sale con texto libre y queda entregado');
    ok(W.enviados.filter((x) => x.message === 'Hola a, te recuerdo la visita').length === 1, 'salió una sola vez');
    ok(de(l, 'b').estado === 'fallido' && de(l, 'b').resultado.codigo === 'FUERA_24H' && /no está activa/.test(de(l, 'b').resultado.error), 'no escribió y la plantilla no está activa: fallido con el motivo');
    ok(de(l, 'c').estado === 'enviado' && de(l, 'c').resultado.plantilla === 'asset_seguimiento_lead' && W.tags.some((x) => x.tags[0] === 'asset-seguimiento_lead'), 'no escribió y la plantilla está activa: sale la plantilla (etiqueta en wechatia)');
    ok(W.campos.some((x) => x.customFields.some((f) => f.id === 'cf1' && f.field_value === 'Ana Corredora')), 'con los campos de la plantilla llenos');
    ok(de(l, 'f').estado === 'enviado', 'wechatia no sabe si escribió, pero Asset tiene su mensaje: sale con texto libre');
    ok(de(l, 'g').estado === 'programado' && de(l, 'h').estado === 'cancelado', 'el de mañana sigue programado y el cancelado no sale');
    ok(de(l, 'z').estado === 'fallido' && /interrumpió/.test(de(l, 'z').resultado.error) && !W.enviados.some((x) => x.message === 'Hola z, te recuerdo la visita'), 'el atascado queda fallido sin reenviarse');
    let o; for (let i = 0; i < 20; i++) { o = de(await lista(tO), 'o'); if (!['programado', 'enviando'].includes(o.estado)) break; await esperar(2500); }
    ok(o.estado === 'fallido' && /no está conectado/.test(o.resultado.error), 'sin clave en su corredora: fallido con el motivo');
    const act = await db.actividad.findFirst({ where: { corredoraId: co.id, entidadId: `per${SUF}` } });
    ok(act && /WhatsApp programado enviado/.test(act.texto) && act.usuarioId === c1.id, 'queda en el historial de la persona, a nombre de quien lo programó');
    ok((await lista(t1, marca)).some((x) => x.id === `wp${SUF}a`), '?desde= trae los que cambiaron');
    ok(!(await lista(t2)).length, 'otro corredor no ve los ajenos');

    // ---- el aviso
    ok((await req('POST', `/whatsapp/programados/wp${SUF}a/avisado`, null, t2)).j.tomado === false, 'otro corredor no toma el aviso');
    ok((await req('POST', `/whatsapp/programados/wp${SUF}a/avisado`, null, t1)).j.tomado === true, 'el dueño toma el aviso');
    ok((await req('POST', `/whatsapp/programados/wp${SUF}a/avisado`, null, t1)).j.tomado === false, 'y una segunda vez ya no (dos equipos abiertos no avisan dos veces)');
    ok((await req('POST', `/whatsapp/programados/wp${SUF}g/avisado`, null, t1)).j.tomado === false, 'uno que no ha salido no tiene aviso');
    await req('POST', `/whatsapp/programados/wp${SUF}e/avisado`, null, t1);

    // ---- rechazo posterior de Meta
    process.stdout.write('  … esperando la revisión de la entrega\n');
    let e; for (let i = 0; i < 40; i++) { await esperar(2500); e = de(await lista(t1), 'e'); if (e.estado !== 'enviado') break; }
    ok(e.estado === 'no_entregado' && /24 h/.test(e.resultado.error) && e.resultado.messageId, 'Meta lo rechaza después: queda no_entregado con el motivo');
    ok(e.avisado === false && (await req('POST', `/whatsapp/programados/wp${SUF}e/avisado`, null, t1)).j.tomado === true, 'y se vuelve a avisar');
    ok(W.enviados.length === 3, 'en total salieron 3 textos libres (a, e, f) y ninguno repetido');

    // ---- desconectar
    ok((await req('DELETE', '/whatsapp/conexion', null, tA)).s === 200 && !(await req('GET', '/whatsapp/conexion', null, t1)).j.conectado, 'el administrador la desconecta');
  } finally {
    srv.close();
    const cos = [co?.id, otraCo?.id].filter(Boolean);
    await db.waProgramado.deleteMany({ where: { corredoraId: { in: cos } } });
    await db.conexion.deleteMany({ where: { corredoraId: { in: cos } } });
    await db.registro.deleteMany({ where: { corredoraId: { in: cos } } });
    await db.actividad.deleteMany({ where: { corredoraId: { in: cos } } });
    await db.leadMensaje.deleteMany({ where: { corredoraId: { in: cos } } });
    await db.lead.deleteMany({ where: { corredoraId: { in: cos } } });
    await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await db.usuario.deleteMany({ where: { id: { in: usuarios } } });
    for (const c of cos) await db.corredora.delete({ where: { id: c } }).catch((e) => console.warn('no se borró la corredora de prueba:', e.message));
    await db.$disconnect();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
