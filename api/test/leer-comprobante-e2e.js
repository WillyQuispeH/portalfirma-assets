// Leer un comprobante de pago (src/documentos/leer-comprobante.ts), contra la API corriendo (yarn dev) y asset_dev, con una IA FALSA
// que levanta esta prueba (la conexión de wechatia de la corredora de prueba guarda su dirección en datos.iaBase, solo fuera de producción).
// Crea una corredora de prueba y al final la borra con todo lo suyo.   Uso: node test/leer-comprobante-e2e.js [url]
// Revisa: manda a la IA el PDF (bloque document) o la foto (bloque image); normaliza monto, moneda, fecha y medio; lo que no se ve queda en null;
// rechaza lo que no es PDF ni imagen; sin IA responde claro; y la lectura queda anotada en ia_consumo.
const argon2 = require('argon2');
const http = require('http');
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
const PDF = Buffer.from('%PDF-1.4\n' + 'x'.repeat(300)).toString('base64');

// ---------------------------------------------------------------- IA falsa
const llamadas = []; let respuesta;
function iaFalsa() {
  const s = http.createServer((rq, rs) => {
    let b = ''; rq.on('data', (x) => (b += x)); rq.on('end', () => {
      const body = JSON.parse(b || '{}'); llamadas.push(body);
      rs.writeHead(200, { 'content-type': 'application/json' });
      rs.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: '```json\n' + JSON.stringify(respuesta) + '\n```' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 200 } }));
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

(async () => {
  const db = new PrismaClient(); const srv = await iaFalsa(); const iaBase = `http://127.0.0.1:${srv.address().port}`;
  const cos = [];
  try {
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    const co = await db.corredora.create({ data: { nombre: `E2E Firmantes ${SUF}` } }); cos.push(co.id);
    const sin = await db.corredora.create({ data: { nombre: `E2E SinIA ${SUF}` } }); cos.push(sin.id);
    const u1 = await db.usuario.create({ data: { corredoraId: co.id, email: `e2e-fx1-${SUF}@prueba.cl`, nombre: 'E2E FX', hashClave: hash } });
    const u2 = await db.usuario.create({ data: { corredoraId: sin.id, email: `e2e-fx2-${SUF}@prueba.cl`, nombre: 'E2E FX2', hashClave: hash } });
    await db.conexion.create({ data: { corredoraId: co.id, usuarioId: null, dueno: 'corredora', proveedor: 'wechatia', tipo: 'clave', estado: 'activa', accesoCif: 'v1.x.x.x', datos: { locationId: 'loc', iaBase } } });
    const t1 = await ingresar(u1.email, 'clave-e2e-123'); const t2 = await ingresar(u2.email, 'clave-e2e-123');
    ok(t1 && t2, 'ingresan un corredor con IA de prueba y otro sin IA');

    // un comprobante de transferencia (PDF) con todo
    respuesta = { esComprobante: true, monto: '450.000', moneda: 'clp', fecha: '2026-11-12', medio: 'Transferencia', banco: 'BancoEstado', referencia: '98765432', emisor: 'Juan Pérez', destinatario: 'Inmobiliaria Ejemplo SpA', concepto: 'reserva DM-1003', avisos: [] };
    let r = await req('POST', '/documentos/comprobante', { archivo: PDF, mime: 'application/pdf' }, t1);
    ok(r.s === 200 && r.j.esComprobante === true && r.j.monto === 450000 && r.j.moneda === 'CLP' && r.j.fecha === '2026-11-12' && r.j.medio === 'transferencia' && r.j.referencia === '98765432', 'lee el comprobante: monto (sin puntos), moneda, fecha, medio y referencia');
    const m = llamadas.at(-1).messages[0].content;
    ok(m[0].type === 'document' && m[0].source.media_type === 'application/pdf' && /no inventes ning/i.test(llamadas.at(-1).system), 'manda el PDF a la IA (bloque document) con la regla de no inventar');
    const uso = await db.iaConsumo.findFirst({ where: { corredoraId: co.id, uso: 'comprobante:lectura' } });
    ok(!!uso, 'la lectura queda anotada en ia_consumo (se cobra a la corredora)');

    // una foto (JPG): la IA la recibe como imagen
    respuesta = { esComprobante: true, monto: 12.5, moneda: 'UF', fecha: '2026-11-01', medio: 'efectivo', banco: '', referencia: '', emisor: '', destinatario: '', concepto: '', avisos: [] };
    const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(200).fill(7)]).toString('base64');
    r = await req('POST', '/documentos/comprobante', { archivo: JPG, mime: 'image/jpeg' }, t1);
    ok(r.s === 200 && r.j.monto === 12.5 && r.j.moneda === 'UF' && r.j.medio === 'efectivo' && llamadas.at(-1).messages[0].content[0].type === 'image', 'una foto del comprobante se lee como imagen (con monto decimal y moneda UF)');

    // lo que no se ve queda vacío (no se inventa), y datos raros se descartan
    respuesta = { esComprobante: true, monto: null, moneda: 'EUR', fecha: '31/02/2026', medio: 'bitcoin', banco: 'X', referencia: '', emisor: '', destinatario: '', concepto: '', avisos: ['No se alcanza a leer la fecha'] };
    r = await req('POST', '/documentos/comprobante', { archivo: PDF, mime: 'application/pdf' }, t1);
    ok(r.j.monto === null && r.j.moneda === null && r.j.fecha === null && r.j.medio === null && r.j.avisos[0] === 'No se alcanza a leer la fecha', 'lo que no se ve (o no es válido) queda en null: nada inventado');
    respuesta = { esComprobante: false, monto: null, moneda: null, fecha: null, medio: null, avisos: [] };
    r = await req('POST', '/documentos/comprobante', { archivo: PDF, mime: 'application/pdf' }, t1);
    ok(r.j.esComprobante === false, 'si no es un comprobante, lo dice');

    // entradas inválidas
    r = await req('POST', '/documentos/comprobante', { archivo: Buffer.from('no soy nada '.repeat(20)).toString('base64'), mime: 'text/plain' }, t1);
    ok(r.s === 400 && /PDF o una imagen/.test(r.j.message), 'rechaza un archivo que no es PDF ni imagen');
    r = await req('POST', '/documentos/comprobante', { archivo: PDF, mime: 'application/pdf' }, t2);
    ok(r.s === 400 && /IA/.test(r.j.message), 'una corredora sin IA recibe un mensaje claro');
    console.log('OK leer comprobante');
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally {
    srv.closeAllConnections(); srv.close();
    for (const id of cos) {
      for (const m of ['iaConsumo', 'conexion', 'registro']) await db[m].deleteMany({ where: { corredoraId: id } }).catch(() => null);
      await db.sesion.deleteMany({ where: { usuario: { corredoraId: id } } }).catch(() => null);
      await db.usuario.deleteMany({ where: { corredoraId: id } }).catch(() => null); await db.corredora.delete({ where: { id } }).catch(() => null);
    }
    await db.$disconnect();
  }
})();
