// Extraer firmantes de un documento (src/documentos/extraer-firmantes.ts), contra la API corriendo (yarn dev) y asset_dev, con una IA FALSA
// que levanta esta prueba (la conexión de wechatia de la corredora de prueba guarda su dirección en datos.iaBase, solo fuera de producción).
// Crea una corredora de prueba y al final la borra con todo lo suyo.   Uso: node test/extraer-firmantes-e2e.js [url]
// Revisa: manda a la IA el PDF completo (bloque document, sirve para PDF con texto y para escaneado) con las reglas; ordena y limpia lo
// que devuelve (RUT con formato y dígito verificador, correo y teléfono válidos, sin repetidos, rol en minúscula, página); avisa lo que
// falta o está mal; rechaza lo que no es PDF; sin IA responde claro; y la lectura queda anotada en ia_consumo.
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

    respuesta = { legible: true, escaneado: false, tipoDocumento: 'Contrato de arriendo', avisos: ['El documento no trae el correo del arrendatario'], firmantes: [
      { nombre: 'María  López Silva', rut: '12345678-5', rol: 'Arrendadora', email: 'MARIA@X.CL', telefono: '+56 9 1111 2222', pagina: 4 },
      { nombre: 'Pedro Soto Rojas', rut: '9.999.999-9', rol: 'arrendatario', email: 'no-es-correo', telefono: '123', pagina: 4 },
      { nombre: 'María López Silva', rut: '12.345.678-5', rol: 'arrendadora', email: '', telefono: '', pagina: 4 },
      { nombre: 'Ana Fiadora', rut: '', rol: '', email: '', telefono: '', pagina: 0 },
    ] };
    let r = await req('POST', '/firmas-envio/firmantes', { pdf: PDF }, t1);
    ok(r.s === 200 && r.j.legible === true && r.j.escaneado === false && r.j.tipoDocumento === 'Contrato de arriendo', 'lee el documento: es legible, qué documento es y si es escaneado');
    const f = r.j.firmantes;
    ok(f.length === 3 && f[0].nombre === 'María López Silva' && f[0].rut === '12.345.678-5' && f[0].rutValido === true && f[0].rol === 'arrendadora', 'limpia la lista: sin repetidos (mismo RUT), nombre sin espacios dobles, RUT con formato y rol en minúscula');
    ok(f[0].email === 'maria@x.cl' && f[0].telefono === '+56911112222' && f[0].pagina === 4, 'correo en minúscula, teléfono normalizado y la página de su firma');
    ok(f[1].rutValido === false && f[1].email === '' && f[1].telefono === '', 'un RUT con dígito verificador malo se marca, y un correo o teléfono que no lo es se descarta');
    ok(f[2].nombre === 'Ana Fiadora' && f[2].rut === '' && f[2].pagina === 0, 'lo que el documento no trae queda vacío (nada inventado)');
    ok(r.j.avisos.includes('El documento no trae el correo del arrendatario') && r.j.avisos.some((a) => /RUT de Pedro Soto Rojas .* no es válido/.test(a)) && r.j.avisos.includes('Falta el RUT de Ana Fiadora.') && r.j.avisos.includes('Falta el rol de Ana Fiadora en el documento.'), 'avisa lo de la IA y lo que impide enviar (RUT inválido, falta RUT o rol)');

    // lo que se le manda a la IA: el PDF como bloque «document» (la IA lee también las páginas escaneadas) y las reglas
    const m = llamadas.at(-1).messages[0].content;
    ok(m[0].type === 'document' && m[0].source.media_type === 'application/pdf' && m[0].source.data === PDF, 'manda el PDF completo a la IA (sirve para PDF con texto y para escaneado)');
    ok(/EMPRESA, el firmante es la persona que firma por ella/.test(llamadas.at(-1).system) && /No inventes datos/.test(llamadas.at(-1).system), 'con las reglas: si la parte es una empresa firma su representante, y no se inventa nada');
    const uso = await db.iaConsumo.findFirst({ where: { corredoraId: co.id, uso: 'firmantes:lectura' } });
    ok(uso && uso.entrada === 1200, 'la lectura queda anotada en ia_consumo (se cobra a la corredora)');

    // un escaneado ilegible
    respuesta = { legible: false, escaneado: true, tipoDocumento: '', firmantes: [], avisos: ['La foto está borrosa'] };
    r = await req('POST', '/firmas-envio/firmantes', { pdf: PDF }, t1);
    ok(r.s === 200 && r.j.legible === false && r.j.escaneado === true && r.j.firmantes.length === 0 && r.j.avisos[0] === 'La foto está borrosa', 'un escaneado ilegible: lo dice y no inventa firmantes');

    // máximo 20 firmantes
    respuesta = { legible: true, escaneado: false, tipoDocumento: 'Acta', avisos: [], firmantes: Array.from({ length: 30 }, (_, i) => ({ nombre: 'Persona ' + i, rut: '', rol: 'socio', email: '', telefono: '', pagina: 1 })) };
    r = await req('POST', '/firmas-envio/firmantes', { pdf: PDF }, t1);
    ok(r.j.firmantes.length === 20, 'como mucho 20 firmantes');

    // entradas inválidas
    r = await req('POST', '/firmas-envio/firmantes', { pdf: Buffer.from('no soy un pdf '.repeat(20)).toString('base64') }, t1);
    ok(r.s === 400 && /no es un PDF/.test(r.j.message), 'rechaza un archivo que no es PDF');
    ok((await req('POST', '/firmas-envio/firmantes', { pdf: 'abc' }, t1)).s === 400, 'y un cuerpo sin PDF');
    r = await req('POST', '/firmas-envio/firmantes', { pdf: PDF }, t2);
    ok(r.s === 400 && /IA/.test(r.j.message), 'una corredora sin IA recibe un mensaje claro');
    console.log('OK extraer firmantes');
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
