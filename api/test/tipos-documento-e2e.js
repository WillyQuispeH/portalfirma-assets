// Tipos de documento (src/documentos/tipos-documento.ts) contra la API corriendo (yarn dev) y asset_dev, con una IA FALSA que levanta esta
// prueba (la conexión de wechatia de la corredora de prueba guarda su dirección en datos.iaBase, solo fuera de producción).
// Crea corredoras de prueba y al final las borra con todo lo suyo.   Uso: node test/tipos-documento-e2e.js [url]
// Revisa: la primera lectura siembra los tipos por defecto; agregar / editar / borrar (solo el administrador edita; cualquiera agrega uno
// nuevo); la firma de «Carta oferta» es la de su plantilla (un solo lugar); cada corredora tiene el suyo; la lectura de firmantes manda la
// lista a la IA y devuelve el tipo reconocido con su firma y trámite; y las rutas de soporte exigen ser de soporte.
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

const llamadas = []; let respuesta;
function iaFalsa() {
  const s = http.createServer((rq, rs) => {
    let b = ''; rq.on('data', (x) => (b += x)); rq.on('end', () => {
      const body = JSON.parse(b || '{}'); llamadas.push(body);
      rs.writeHead(200, { 'content-type': 'application/json' });
      rs.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: '```json\n' + JSON.stringify(respuesta) + '\n```' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }));
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

(async () => {
  const db = new PrismaClient(); const srv = await iaFalsa(); const iaBase = `http://127.0.0.1:${srv.address().port}`;
  const cos = [];
  try {
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    const co = await db.corredora.create({ data: { nombre: `E2E Tipos ${SUF}` } }); cos.push(co.id);
    const otra = await db.corredora.create({ data: { nombre: `E2E TiposOtra ${SUF}` } }); cos.push(otra.id);
    const adm = await db.usuario.create({ data: { corredoraId: co.id, email: `e2e-td-a-${SUF}@prueba.cl`, nombre: 'E2E Admin', hashClave: hash, rol: 'ADMIN' } });
    const cor = await db.usuario.create({ data: { corredoraId: co.id, email: `e2e-td-c-${SUF}@prueba.cl`, nombre: 'E2E Corredor', hashClave: hash, rol: 'CORREDOR' } });
    const adm2 = await db.usuario.create({ data: { corredoraId: otra.id, email: `e2e-td-o-${SUF}@prueba.cl`, nombre: 'E2E Otra', hashClave: hash, rol: 'ADMIN' } });
    await db.conexion.create({ data: { corredoraId: co.id, usuarioId: null, dueno: 'corredora', proveedor: 'wechatia', tipo: 'clave', estado: 'activa', accesoCif: 'v1.x.x.x', datos: { locationId: 'loc', iaBase } } });
    const tA = await ingresar(adm.email, 'clave-e2e-123'); const tC = await ingresar(cor.email, 'clave-e2e-123'); const tO = await ingresar(adm2.email, 'clave-e2e-123');
    ok(tA && tC && tO, 'ingresan un administrador, un corredor y el administrador de otra corredora');

    // ---- siembra y lista
    let r = await req('GET', '/tipos-documento', null, tC);
    ok(r.s === 200 && r.j.items.length === 12 && r.j.puedeEditar === false && r.j.items[0].id === 'orden-visita', 'la primera lectura siembra los 12 tipos por defecto (el corredor solo mira)');
    ok(r.j.items.find((t) => t.id === 'carta-oferta').nombre === 'Carta oferta' && r.j.items.every((t) => t.tipoFirma === 'simple' && t.tramite === 'none'), 'con «Carta oferta» y firma simple, sin trámite');
    r = await req('GET', '/tipos-documento', null, tA);
    ok(r.j.items.length === 12 && r.j.puedeEditar === true, 'volver a pedirla no duplica y el administrador puede editar');
    ok((await db.registro.count({ where: { corredoraId: co.id, coleccion: 'tipos_documento' } })) === 13, 'en la base: 12 tipos y una marca de siembra');

    // ---- permisos
    r = await req('PUT', '/tipos-documento/poder', { tipoFirma: 'avanzada' }, tC);
    ok(r.s === 403, 'un corredor no puede editar');
    r = await req('DELETE', '/tipos-documento/poder', null, tC);
    ok(r.s === 403, 'ni borrar');
    r = await req('POST', '/tipos-documento', { nombre: 'Finiquito de arriendo', tipoFirma: 'avanzada', tramite: 'none', palabras: ['finiquito'] }, tC);
    ok(r.s === 200 && r.j.id === 'finiquito-de-arriendo' && r.j.tipoFirma === 'avanzada', 'pero sí puede agregar un tipo nuevo (al guardar la configuración de un documento)');
    r = await req('POST', '/tipos-documento', { nombre: 'FINIQUITO de arriendo', tipoFirma: 'simple', tramite: 'none' }, tC);
    ok(r.s === 200 && r.j.id === 'finiquito-de-arriendo' && r.j.tipoFirma === 'avanzada', 'uno que ya existe se devuelve tal cual, sin pisarlo');
    r = await req('POST', '/tipos-documento', { nombre: 'x', tipoFirma: 'avanzada', tramite: 'none' }, tA);
    ok(r.s === 400, 'un nombre muy corto se rechaza');
    r = await req('POST', '/tipos-documento', { nombre: 'Algo', tipoFirma: 'cualquiera', tramite: 'none' }, tA);
    ok(r.s === 400, 'y un tipo de firma que no existe');

    // ---- editar: el administrador
    r = await req('PUT', '/tipos-documento/poder', { tipoFirma: 'avanzada', tramite: 'legalization' }, tA);
    ok(r.s === 200 && r.j.tipoFirma === 'avanzada' && r.j.tramite === 'legalization', 'el administrador define firma avanzada con legalización para «Poder»');
    r = await req('PUT', '/tipos-documento/carta-oferta', { tipoFirma: 'visada' }, tA);
    ok(r.s === 200 && r.j.tipoFirma === 'visada' && r.j.plantilla === 'carta-oferta', '«Carta oferta» cambia su firma…');
    r = await req('GET', '/plantillas/carta-oferta', null, tA);
    ok(r.j.firma.tipoFirma === 'visada', '…que es la de su plantilla (un solo lugar donde se define)');
    r = await req('PUT', '/tipos-documento/poder', { nombre: 'Carta oferta' }, tA);
    ok(r.s === 400 && /Ya existe/.test(r.j.message), 'no se repite un nombre');
    r = await req('PUT', '/tipos-documento/no-existe', { tipoFirma: 'simple' }, tA);
    ok(r.s === 404, 'editar uno que no existe es 404');
    r = await req('GET', '/tipos-documento', null, tO);
    ok(r.j.items.find((t) => t.id === 'poder').tipoFirma === 'simple' && !r.j.items.some((t) => t.id === 'finiquito-de-arriendo'), 'la otra corredora sigue con lo suyo');

    // ---- la lectura de firmantes con el catálogo
    respuesta = { legible: true, escaneado: false, tipoDocumento: 'Carta de oferta de compra', tipoCatalogo: 'Carta oferta', avisos: [], firmantes: [{ nombre: 'Ana Rojas', rut: '12.345.678-5', rol: 'oferente', email: 'ana@x.cl', telefono: '', pagina: 2 }] };
    r = await req('POST', '/firmas-envio/firmantes', { pdf: PDF }, tA);
    const sistema = String(llamadas.at(-1)?.system?.[0]?.text ?? llamadas.at(-1)?.system ?? '');
    ok(r.s === 200 && /TIPOS CONOCIDOS/.test(sistema) && sistema.includes('«Carta oferta»') && sistema.includes('«Finiquito de arriendo»'), 'a la IA se le pasa la lista de tipos de la corredora');
    ok(r.j.tipoConocido?.nombre === 'Carta oferta' && r.j.tipoConocido.tipoFirma === 'visada' && r.j.tipoConocido.tramite === 'none', 'devuelve el tipo reconocido con su firma y trámite');
    ok(r.j.tipoDocumento === 'Carta de oferta de compra' && r.j.firmantes.length === 1, 'y sigue devolviendo lo de antes (tipo leído y firmantes)');
    respuesta = { ...respuesta, tipoDocumento: 'Poder simple para gestionar la venta', tipoCatalogo: '' };
    r = await req('POST', '/firmas-envio/firmantes', { pdf: PDF }, tA);
    ok(r.j.tipoConocido?.id === 'poder' && r.j.tipoConocido.tramite === 'legalization', 'si la IA no elige, se reconoce por lo que describió («poder simple»)');
    respuesta = { ...respuesta, tipoDocumento: 'Contrato de prestación de servicios', tipoCatalogo: '' };
    r = await req('POST', '/firmas-envio/firmantes', { pdf: PDF }, tA);
    ok(r.s === 200 && r.j.tipoConocido === null, 'un documento de un tipo que no existe queda sin tipo conocido');

    // ---- borrar
    r = await req('DELETE', '/tipos-documento/finiquito-de-arriendo', null, tA);
    ok(r.s === 200, 'el administrador borra un tipo');
    r = await req('GET', '/tipos-documento', null, tA);
    ok(!r.j.items.some((t) => t.id === 'finiquito-de-arriendo') && r.j.items.length === 12 && !r.j.items.some((t) => t.id === '_sembrado'), 'ya no está, y la marca interna nunca se muestra');
    await req('DELETE', '/tipos-documento/poder', null, tA);
    r = await req('GET', '/tipos-documento', null, tA);
    ok(r.j.items.length === 11, 'un tipo por defecto que se borra no vuelve a aparecer');

    // ---- soporte
    r = await req('GET', `/soporte/tipos-documento?corredoraId=${co.id}`, null, tA);
    ok(r.s === 403, 'las rutas de soporte exigen ser de soporte (un administrador de corredora no entra)');
    r = await req('POST', '/soporte/tipos-documento', { corredoraId: co.id, nombre: 'Algo', tipoFirma: 'simple', tramite: 'none' }, tC);
    ok(r.s === 403, 'ni crear');

    console.log('OK');
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
