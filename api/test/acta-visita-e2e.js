// Prueba de punta a punta del ACTA DE VISITA (src/whatsapp/acta-visita.ts), contra la API corriendo (yarn dev) y asset_dev:
// crear el acta, sumar una foto y un audio (de mentira: queda guardado con su error de transcripción), notas, cerrar con
// resumen, enlaces firmados y que otro corredor no la vea. Crea una corredora de prueba y al final la borra con todo.
// Uso: node test/acta-visita-e2e.js [url]
const fs = require('fs');
const path = require('path');
const argon2 = require('argon2');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
process.env.DATABASE_URL = env.DATABASE_URL;
const B = (process.argv[2] || 'http://localhost:3000') + '/v1';
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const req = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(B + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { s: r.status, j };
};
const ingresar = async (email, clave) => (await req('POST', '/auth/ingresar', { email, clave })).j.tokenAcceso;

(async () => {
  const db = new PrismaClient();
  const SUF = Date.now().toString(36);
  let co;
  try {
    const hash = await argon2.hash('Prueba-1234');
    co = await db.corredora.create({ data: { nombre: `E2E Acta ${SUF}` } });
    const nu = (n, rol) => db.usuario.create({ data: { corredoraId: co.id, email: `e2e-acta${n}-${SUF}@prueba.cl`, nombre: 'Corredor ' + n.toUpperCase(), hashClave: hash, ...(rol ? { rol } : {}) } });
    const c1 = await nu('a'); const c2 = await nu('b');
    const tA = await ingresar(c1.email, 'Prueba-1234'); const tB = await ingresar(c2.email, 'Prueba-1234');
    ok(!!tA && !!tB, 'dos corredores de prueba entran');
    const prop = await db.propiedad.create({ data: { corredoraId: co.id, codigo: 'PF-9301', titulo: 'Depto Providencia', tipo: 'departamento', venta: true, precioVenta: 5000, monedaVenta: 'UF', direccion: 'Av. Providencia 1000', comuna: 'Providencia' } });
    const per = await db.persona.create({ data: { corredoraId: co.id, nombre: 'Ana Interesada', telefono: '+56 9 7777 1111' } });
    const ng = await db.negocio.create({ data: { id: `ng${SUF}`, corredoraId: co.id, tipo: 'venta', etapa: 'visita', propiedadId: prop.id, clienteId: per.id, corredorId: c1.id, datos: {} } });

    let r = await req('GET', `/actas-visita/negocio/${ng.id}`, null, tA);
    ok(r.s === 200 && r.j.items.length === 0, 'sin actas al comienzo');
    r = await req('POST', `/actas-visita/negocio/${ng.id}`, {}, tA);
    ok(r.s === 200 && r.j.estado === 'abierta' && r.j.propiedadId === prop.id, 'se crea el acta, abierta y con la propiedad del negocio');
    const id = r.j.id;
    ok((await req('GET', `/actas-visita/${id}`, null, tB)).s === 403, 'otro corredor no ve el acta de un negocio ajeno');

    const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#4488cc' } }).png().toBuffer();
    r = await req('POST', `/actas-visita/${id}/foto`, { imagen: png.toString('base64'), mime: 'image/png' }, tA);
    ok(r.s === 200 && r.j.fotos.length === 1 && r.j.fotos[0].origen === 'app' && !r.j.fotos[0].clave, 'una foto se suma al acta (sin exponer la clave de R2)');
    r = await req('POST', `/actas-visita/${id}/foto`, { imagen: Buffer.alloc(900, 1).toString('base64'), mime: 'image/jpeg' }, tA);
    ok(r.s === 400, 'un archivo que no es imagen se rechaza');

    r = await req('POST', `/actas-visita/${id}/audio`, { audio: Buffer.alloc(3000, 7).toString('base64'), mime: 'audio/webm', origen: 'app' }, tA);
    ok(r.s === 200 && r.j.audios.length === 1 && r.j.audios[0].origen === 'app' && r.j.audios[0].tipo === 'audio/webm', 'un audio queda guardado en el acta');
    ok(r.j.audios[0].transcripcion !== undefined && !r.j.audios[0].clave, 'el audio trae su transcripción (o el error) y no expone la clave');

    r = await req('POST', `/actas-visita/${id}/notas`, { notas: 'Le gustó la luz; preguntó por gastos comunes.' }, tA);
    ok(r.s === 200 && /gastos comunes/.test(r.j.notas), 'las notas del corredor se guardan');

    let a = (await req('GET', `/actas-visita/${id}/archivo/foto/1`, null, tA));
    ok(a.s === 200 && /^https?:\/\//.test(a.j.url) && /^https?:\/\//.test(a.j.descarga) && a.j.url !== a.j.descarga, 'la foto trae un enlace para verla y otro para descargarla');
    a = await req('GET', `/actas-visita/${id}/archivo/audio/9`, null, tA);
    ok(a.s === 404, 'un archivo que no existe da 404');

    r = await req('POST', `/actas-visita/${id}/whatsapp`, {}, tA);
    ok(r.s === 400 && /vinculado/i.test(r.j.message), 'sin celular vinculado, «mandar por WhatsApp» lo dice claro');

    r = await req('POST', `/actas-visita/${id}/cerrar`, {}, tA);
    ok(r.s === 200 && r.j.estado === 'cerrada' && r.j.cerradaEn && r.j.resumen && typeof r.j.resumen.resumen === 'string' && r.j.resumen.resumen.length > 0, 'cerrar deja el acta cerrada con su resumen');
    ok(['alto', 'medio', 'bajo', 'sin_datos'].includes(r.j.resumen.interes) && Array.isArray(r.j.resumen.proximosPasos), 'el resumen trae interés y listas');
    r = await req('POST', `/actas-visita/${id}/foto`, { imagen: png.toString('base64'), mime: 'image/png' }, tA);
    ok(r.s === 400, 'a un acta cerrada ya no se le suma nada');
    const act = await db.actividad.findFirst({ where: { corredoraId: co.id, entidadId: ng.id, texto: { contains: 'Acta de visita' } } });
    ok(!!act, 'el cierre queda en la actividad del negocio');

    r = await req('POST', `/actas-visita/negocio/${ng.id}`, {}, tA);
    ok(r.s === 200 && r.j.id !== id, 'se puede abrir otra acta (otra visita) del mismo negocio');
    r = await req('GET', `/actas-visita/negocio/${ng.id}`, null, tA);
    ok(r.j.items.length === 2 && r.j.items[0].estado === 'abierta', 'se listan las dos, la más nueva primero');
    r = await req('POST', `/actas-visita/${r.j.items[0].id}/cerrar`, {}, tA);
    ok(r.s === 400 && /vac/i.test(r.j.message), 'un acta vacía no se puede cerrar');
    r = await req('GET', `/actas-visita/negocio/${ng.id}`, null, tA); const ids = r.j.items.map((x) => x.id);
    ok((await req('DELETE', `/actas-visita/${ids[0]}`, null, tB)).s === 403, 'otro corredor no puede eliminar el acta');
    ok((await req('DELETE', `/actas-visita/${id}`, null, tA)).s === 200, 'el corredor elimina un acta cerrada (con sus archivos)');
    ok((await req('GET', `/actas-visita/${id}`, null, tA)).s === 404, 'el acta eliminada ya no existe');
    r = await req('GET', `/actas-visita/negocio/${ng.id}`, null, tA);
    ok(r.j.items.length === 1 && r.j.items[0].id !== id, 'la lista ya no la incluye');
    console.log('OK acta de visita');
  } finally {
    if (co) {
      const w = { where: { corredoraId: co.id } };
      const usuarios = (await db.usuario.findMany({ ...w, select: { id: true } })).map((u) => u.id);
      for (const m of ['registro', 'actividad', 'iaConsumo', 'negocio']) await db[m].deleteMany(w).catch((e) => console.log('limpieza ' + m + ': ' + e.message));
      await db.propiedadPersona.deleteMany({ where: { propiedad: { corredoraId: co.id } } }).catch(() => null);
      await db.propiedad.deleteMany(w).catch(() => null); await db.persona.deleteMany(w).catch(() => null); await db.contador.deleteMany(w).catch(() => null);
      await db.sesion.deleteMany({ where: { usuarioId: { in: usuarios } } }).catch(() => null);
      await db.usuario.deleteMany({ where: { id: { in: usuarios } } }).catch(() => null);
      await db.corredora.delete({ where: { id: co.id } }).catch((e) => console.log('limpieza corredora: ' + e.message));
    }
    await db.$disconnect();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
