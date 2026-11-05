// Prueba de punta a punta de leads contra la API corriendo (yarn dev), asset_dev y R2. Crea sus propios datos
// (prefijo E2E) y al final los borra de verdad (también los archivos). Uso: node test/leads-e2e.js [url]
// Revisa: el lead como documento (PUT, versión, quién lo ve), que no se duplique el cliente (misma conversación o
// teléfono), la conversación (upsert por k, sin duplicar, cambios y sincronización), las fotos/audios a R2 e importar.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);
const B = (process.argv[2] || 'http://localhost:3000') + '/v1';
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(B + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
const ingresar = async (email, clave) => (await req('POST', '/auth/ingresar', { email, clave })).j.tokenAcceso;
const SUF = Date.now().toString(36);
const nid = () => `ld${SUF}${crypto.randomBytes(3).toString('hex')}`;
const tel = () => '+569' + String(10000000 + Math.floor(Math.random() * 89999999));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = new PrismaClient();
  const creados = { leads: [], usuarios: [], personas: [] };
  try {
    const adm = await ingresar(env.SEMBRAR_ADMIN_EMAIL, env.SEMBRAR_ADMIN_CLAVE);
    let r = await req('POST', '/usuarios', { email: `e2e-ld-${SUF}@prueba.cl`, nombre: 'E2E Corredor Leads', clave: 'clave-e2e-123', telefono: '+56911112222' }, adm);
    const corId = r.j.id; creados.usuarios.push(corId);
    const cor = await ingresar(`e2e-ld-${SUF}@prueba.cl`, 'clave-e2e-123');
    ok(adm && cor, 'ingresan el administrador y un corredor de prueba');
    r = await req('POST', '/personas', { nombre: `E2E Lead Persona ${SUF}` }, adm); const per = r.j; creados.personas.push(per.id);

    // ---- el lead
    const l1 = nid(); const t1 = tel(); creados.leads.push(l1);
    const base = { nombre: 'E2E Cliente', chatCon: 'E2E Cliente', telefono: t1, email: 'Cliente@Prueba.cl', origen: 'instagram', estado: 'nuevo', busqueda: { operacion: 'arriendo', comunas: ['Ñuñoa'] }, resumen: '', propiedades: [], links: [], proximaAccion: null, personaId: per.id, notas: '', mensajes: 2, ultimo: { fecha: '2026-11-04T10:15:00', de: 'cliente', texto: 'Hola' }, noLeidos: 1, importaciones: [], historial: [{ fecha: '2026-11-04T13:15:00.000Z', texto: 'Llegó por Instagram', tipo: 'canal' }], canales: [{ canal: 'instagram', conv: `conv-${SUF}`, contactId: 'c1', usuario: 'e2e' }], creado: '2026-11-04T13:15:00.000Z' };
    r = await req('PUT', `/leads/${l1}`, base, cor);
    ok(r.s === 200 && r.j.corredorId === corId && r.j.personaId === per.id && r.j.busqueda.comunas[0] === 'Ñuñoa' && r.j.historial.length === 1, 'el corredor crea un lead (queda a su cargo, con todo su contenido)');
    const fila = await db.lead.findUnique({ where: { id: l1 } });
    ok(fila.telefonoNorm === t1.slice(-9) && fila.email === 'cliente@prueba.cl' && fila.convIds[0] === `conv-${SUF}` && fila.ultimoEn === '2026-11-04T10:15:00', 'en la base: teléfono normalizado, correo, conversación y último mensaje para buscar');
    const v1 = r.j;
    r = await req('PUT', `/leads/${l1}`, { ...v1, estado: 'contactado', noLeidos: 0 }, cor);
    ok(r.s === 200 && r.j.version === 2 && r.j.estado === 'contactado', 'cambiar el estado sube la versión');
    ok((await req('PUT', `/leads/${l1}`, { ...v1, estado: 'visita' }, cor)).j?.code === 'VERSION', 'con una versión vieja: 409');
    r = await req('PUT', `/leads/${nid()}`, { ...base, canales: [{ canal: 'instagram', conv: `otra-${SUF}` }] }, adm);
    ok(r.s === 409 && r.j.code === 'DUPLICADO' && r.j.id === l1, 'otro lead nuevo con el mismo teléfono: 409 DUPLICADO con el id del que ya existe');
    r = await req('PUT', `/leads/${nid()}`, { ...base, telefono: '', canales: [{ conv: `conv-${SUF}` }] }, adm);
    ok(r.s === 409 && r.j.code === 'DUPLICADO' && r.j.visible === true, 'y con la misma conversación de wechatia (el admin sí lo ve)');
    const l2 = nid(); creados.leads.push(l2);
    r = await req('PUT', `/leads/${l2}`, { ...base, telefono: tel(), canales: [], personaId: 'c-legado' }, adm);
    ok(r.s === 200 && r.j.corredorId === null && r.j.personaId === null, 'un lead del administrador sin corredor (y una persona inexistente queda sin ligar)');
    let lc = (await req('GET', '/leads', null, cor)).j.items.map((x) => x.id);
    ok(lc.includes(l1) && !lc.includes(l2), 'el corredor ve solo sus leads');
    r = await req('PUT', `/leads/${nid()}`, { ...base, telefono: '', canales: [{ conv: `conv-${SUF}` }] }, cor);
    ok(r.s === 409 && r.j.code === 'DUPLICADO', 'el corredor también recibe el aviso de duplicado');
    ok((await req('DELETE', `/leads/${l1}`, null, cor)).s === 403, 'el corredor no elimina leads');

    // ---- la conversación
    const msgs = [
      { k: 'k1', fecha: '2026-11-04T10:14:00', de: 'broker', autor: 'Corredora', texto: '¿En qué te ayudo?', tipo: 'texto' },
      { k: 'k2', fecha: '2026-11-04T10:15:00', de: 'cliente', autor: 'E2E Cliente', texto: 'Hola, busco 2D en Ñuñoa', tipo: 'texto', canal: 'instagram' },
    ];
    r = await req('POST', `/leads/${l1}/mensajes`, { items: msgs }, cor);
    ok(r.s === 201 && r.j.nuevos === 2, 'guarda los mensajes');
    r = await req('POST', `/leads/${l1}/mensajes`, { items: msgs }, cor);
    ok(r.j.nuevos === 0 && r.j.actualizados === 0, 'mandarlos de nuevo no los duplica ni los toca');
    const marca = new Date().toISOString(); await esperar(30);
    r = await req('POST', `/leads/${l1}/mensajes`, { items: [{ ...msgs[0], fallido: 'Fuera de las 24 h' }, { k: 'k3', fecha: '2026-11-04T10:20:00', de: 'cliente', texto: '', tipo: 'audio', archivo: 'PTT-1.opus', transcripcion: 'te mando un audio' }] }, cor);
    ok(r.j.nuevos === 1 && r.j.actualizados === 1, 'un mensaje que cambió (no entregado) se actualiza y uno nuevo se agrega');
    r = await req('GET', `/leads/${l1}/mensajes`, null, cor);
    ok(r.s === 200 && r.j.items.length === 3 && r.j.items.find((m) => m.k === 'k2').canal === 'instagram' && r.j.items.find((m) => m.k === 'k3').transcripcion === 'te mando un audio', 'la conversación vuelve completa, con lo que no tiene columna (canal, transcripción)');
    r = await req('GET', `/leads/${l1}/mensajes?desde=${encodeURIComponent(marca)}`, null, cor);
    ok(r.j.items.length === 2 && r.j.items.some((m) => m.k === 'k1' && m.fallido), 'con ?desde= solo trae lo que cambió');
    ok((await req('GET', `/leads/${l2}/mensajes`, null, cor)).s === 403, 'el corredor no lee la conversación de un lead ajeno');
    ok((await req('POST', `/leads/${l2}/mensajes`, { items: msgs }, cor)).s === 403, 'ni le agrega mensajes');

    // ---- fotos y audios a R2
    const OGG = Buffer.from('OggS' + 'x'.repeat(60));
    r = await req('POST', `/leads/${l1}/archivos/subidas`, { archivos: [{ tipo: 'audio/ogg', tamano: OGG.length }] }, cor);
    ok(r.s === 201 && r.j.subidas[0].url.includes(`/l/${l1}/`) && r.j.subidas[0].url.endsWith('.ogg'), 'entrega la subida firmada del audio');
    const sub = r.j.subidas[0];
    ok((await fetch(sub.subida, { method: 'PUT', headers: { 'content-type': 'audio/ogg' }, body: OGG })).ok, 'el audio sube directo a R2');
    await req('POST', `/leads/${l1}/mensajes`, { items: [{ k: 'k3', fecha: '2026-11-04T10:20:00', de: 'cliente', texto: '', tipo: 'audio', archivo: 'PTT-1.opus', transcripcion: 'te mando un audio', mediaUrl: sub.url }] }, cor);
    r = await req('GET', `/leads/${l1}/mensajes`, null, adm);
    ok(r.j.items.find((m) => m.k === 'k3').mediaUrl === sub.url, 'el mensaje queda con la URL del audio');
    let vivo = false; for (let i = 0; i < 30 && !vivo; i++) { vivo = (await fetch(sub.url)).ok; if (!vivo) await esperar(500); }
    ok(vivo, 'y se puede escuchar desde la URL pública');
    ok((await req('POST', `/leads/${l1}/archivos/subidas`, { archivos: [{ tipo: 'application/x-msdownload', tamano: 10 }] }, cor)).s === 400, 'no acepta tipos de archivo raros');

    // ---- importar los leads del índice local de un equipo
    const viejo = { ...base, id: nid(), telefono: tel(), canales: [], personaId: 'c-legado', corredorId: 'k-perfil', estado: 'negociando' };
    const repetido = { ...base, id: nid(), canales: [{ conv: `conv-${SUF}` }] }; // el mismo cliente que l1, con otro id
    creados.leads.push(viejo.id, repetido.id);
    r = await req('POST', '/leads/importar', { items: [viejo, repetido, { id: 'x' }] }, adm);
    ok(r.s === 201 && r.j.nuevos === 1 && r.j.mapeo[repetido.id] === l1 && r.j.rechazados.length === 1, 'importa los leads locales; el que ya existía (mismo cliente) se mapea al de la base');
    ok((await db.lead.findUnique({ where: { id: viejo.id } })).corredorId === null, 'un corredor que ya no existe queda sin asignar (lo ve el administrador)');
    ok((await req('POST', '/leads/importar', { items: [viejo] }, adm)).j.existentes === 1, 'importar de nuevo no duplica');

    const marca2 = new Date().toISOString(); await esperar(30);
    ok((await req('DELETE', `/leads/${l1}`, null, adm)).s === 200, 'el administrador elimina un lead');
    ok((await req('GET', `/leads?desde=${encodeURIComponent(marca2)}`, null, cor)).j.items.some((x) => x.id === l1 && x.eliminado), 'y le llega como baja al corredor');
    console.log('OK leads');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    await db.lead.deleteMany({ where: { id: { in: creados.leads } } }); // los mensajes se borran en cascada
    await db.persona.deleteMany({ where: { id: { in: creados.personas } } });
    await db.sesion.deleteMany({ where: { usuarioId: { in: creados.usuarios } } });
    await db.usuario.deleteMany({ where: { id: { in: creados.usuarios } } });
    await db.$disconnect();
    try {
      const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
      const s3 = new S3Client({ region: 'auto', endpoint: env.R2_ENDPOINT, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
      const l = await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: 'c/' }));
      const mias = (l.Contents || []).filter((o) => creados.leads.some((id) => o.Key.includes(`/l/${id}/`)));
      if (mias.length) await s3.send(new DeleteObjectsCommand({ Bucket: env.R2_BUCKET, Delete: { Objects: mias.map((o) => ({ Key: o.Key })), Quiet: true } }));
    } catch (e) { console.warn('limpieza R2:', e.message); }
  }
})();
