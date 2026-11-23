// Prueba de punta a punta de la API de Portalfirma en el servidor (src/conexiones/portalfirma-api.ts y src/documentos/envio-firma.ts),
// contra la API corriendo (yarn dev) y asset_dev, con un Portalfirma FALSO (la API de integración) que levanta esta prueba.
// Crea una corredora de prueba y al final la borra con todo lo suyo.   Uso: node test/portalfirma-api-e2e.js [url]
// Revisa: solo el administrador ingresa las credenciales (clave id, customer_id, correo y contraseña) y se prueban con Portalfirma
// antes de guardarlas; la contraseña nunca vuelve; enviar a firmar (POST /v1/firmas-envio/pdf): con página de firmas por defecto,
// con las firmas ubicadas (página y coordenadas), nombres partidos en nombre y apellidos, tipo de firma y trámite; el número de
// operación sale del detalle del proceso; el token se pide una vez y se reutiliza; un token vencido se renueva solo; el detalle de
// una operación y el reenvío del enlace; el PDF firmado; sin credenciales, 409; las posiciones de firma pendientes se validan.
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

// ---------------------------------------------------------------- Portalfirma falso (la API de integración)
const ID_API = 'id-api-' + SUF; const CUSTOMER = '11111111-2222-3333-4444-555555555555'; const OP = 700000000 + Math.floor(Math.random() * 90000000);
let tokenDirecto = false; const consultasTel = []; const getAllPedidos = []; let getAllListo = true; let getAllNuevo = false; const getAllNuevoPedidos = []; let tokenVigente = 'tok-1'; let pedidosToken = 0; const envios = []; const reenvios = []; const cabeceras = [];
function portalfirmaFalso() {
  const s = http.createServer(async (rq, rs) => {
    const json = (st, o) => { rs.writeHead(st, { 'content-type': 'application/json' }).end(JSON.stringify(o)); };
    let b = ''; for await (const c of rq) b += c;
    cabeceras.push({ id: rq.headers.id, auth: rq.headers.authorization });
    if (rq.headers.id !== ID_API) return json(401, { success: false, data: null, error: 'Acceso denegado' });
    if (rq.method === 'POST' && rq.url === '/api/auth/generateToken') {
      const c = JSON.parse(b || '{}');
      if (c.customer_id !== CUSTOMER || c.email !== 'int@x.cl' || c.password !== 'clave-pf') return json(401, { success: false, data: null, error: 'Unauthorized' });
      pedidosToken++; return json(200, tokenDirecto ? { token: tokenVigente } : { success: true, data: { token: tokenVigente }, error: null });
    }
    if (rq.headers.authorization !== 'Bearer ' + tokenVigente) return json(401, { success: false, data: null, error: 'Unauthorized' });
    if (rq.method === 'POST' && rq.url === '/api/document/sendToSign') { const c = JSON.parse(b); envios.push(c); return json(201, { success: true, data: { processId: 'a0000000-0000-4000-8000-000000000001', createdDateAt: new Date().toISOString() }, error: null }); }
    if (rq.method === 'GET' && rq.url === '/api/document/getByProcessId/a0000000-0000-4000-8000-000000000001')
      return json(200, { success: true, data: { processId: 'a0000000-0000-4000-8000-000000000001', operation: OP, status: 'process', signatories: [{ id: 'b0000000-0000-4000-8000-000000000001', name: 'Ana', signed: false }], files: { original: { id: 'f0000000-0000-4000-8000-000000000001', name: 'Orden.pdf' }, signed: null }, updatedDateAt: '2026-11-20T10:00:00Z' }, error: null });
    if (rq.method === 'GET' && rq.url === `/api/document/getByOperation/${OP}`) return json(200, { success: true, data: { processId: 'a0000000-0000-4000-8000-000000000001', operation: OP, status: 'process', signatories: [{ id: 'b0000000-0000-4000-8000-000000000001', name: 'Ana', signed: false }] }, error: null });
    if (rq.method === 'GET' && rq.url === '/api/file/f0000000-0000-4000-8000-000000000001') return json(200, { success: true, data: Buffer.from('%PDF-1.4 original').toString('base64'), error: null });
    if (rq.method === 'POST' && rq.url === '/api/document/getAll') { // la forma nueva: paginada por etapa, con nombre y firmantes en cada fila
      if (!getAllNuevo) return json(404, { success: false, data: null, error: 'Not Found' });
      const c = JSON.parse(b); getAllNuevoPedidos.push(c);
      const f = (op, f2, nombre, firm, st) => ({ status: st, contract: { id: 'c000000' + op, operation: op, updateDate: f2, createdDate: f2, document_name: nombre }, signers: firm });
      const porEtapa = {
        process: [[f(OP + 5, '2026-11-18T10:00:00', 'Contrato A', [{ signed: true, isSignatory: true, fullName: 'Ana' }, { signed: false, isSignatory: true, fullName: 'Beto' }], 'process')], [f(OP + 4, '2026-11-10T10:00:00', 'Promesa B', [{ signed: false, isSignatory: true, fullName: 'Cami' }], 'process')]],
        finalized: [[f(OP + 3, '2026-09-01T10:00:00', 'Mandato C', [{ signed: true, isSignatory: true, fullName: 'Dani' }], 'finalized'), f(OP - 100, '2024-01-01T10:00:00', 'Muy antiguo', [], 'finalized')]],
        starting: [[]], inactive: [[f(OP + 2, '2026-08-01T10:00:00', 'Sin pagar D', [], 'unPayed')]],
      };
      const pags = porEtapa[c.stage] || [[]]; const i = Math.max(1, c.page) - 1;
      return json(200, { success: true, data: { data: pags[i] || [], pagination: { limit: c.pageSize, totalPages: pags.length, currentPage: c.page, totalRecords: pags.flat().length } }, error: null });
    }
    if (rq.method === 'GET' && /^\/api\/document\/getAll\/\d{8}\/\d{8}$/.test(rq.url || '')) {
      getAllPedidos.push(rq.url);
      if (!getAllListo) return json(200, { success: true, data: 'Petición en mantenimiento', error: null });
      const fila = (op, id, f, n) => ({ contract: { id, operation: op, createdDate: f }, signersCount: n });
      const todas = [fila(OP, 'a0000000-0000-4000-8000-000000000001', '2026-11-19T10:00:00Z', 2), fila(OP + 1, 'a0000000-0000-4000-8000-000000000002', '2026-10-01T10:00:00Z', 1)];
      // como responde Portalfirma de verdad: los cubos de conteo (total, active, signed…) vienen con `data` vacío; las filas están en processSent / processNotSent
      return json(200, { success: true, data: { total: { total: 4, data: [] }, inactive: { total: 1, data: [9999] }, active: { total: 3, data: [] }, processSent: { total: 2, data: todas }, processNotSent: { total: 1, data: [fila(OP + 2, 'a0000000-0000-4000-8000-000000000003', '2026-09-01T10:00:00Z', 0)] }, signed: { total: 1, data: [] }, totalSigns: { total: 1, data: [] }, processSigned: { total: 0, data: [] } }, error: null });
    }
    if (rq.method === 'POST' && rq.url === '/api/document/getOperationsByPhone') {
      const c = JSON.parse(b); consultasTel.push(c);
      return json(200, { success: true, data: { phone: String(c.phone).replace(/\D/g, ''), startDate: c.startDate, endDate: c.endDate, limit: c.limit, totalInRange: 1, operations: [{ contract_id: 'a0000000-0000-4000-8000-000000000001', operation: OP, stage: 'process', document_name: 'Orden de visita', createdDateAt: '2026-11-19T10:00:00Z', updatedDateAt: '2026-11-20T10:00:00Z' }] }, error: null });
    }
    if (rq.method === 'POST' && rq.url === '/api/document/resendSignatoryToSign') { reenvios.push(JSON.parse(b)); return json(200, { success: true, data: {}, error: null }); }
    return json(404, { success: false, data: null, error: 'Not Found' });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}
const PDF = Buffer.from('%PDF-1.4\n' + 'x'.repeat(200)).toString('base64');
const firmantes = [
  { rut: '11.111.111-1', nombre: 'Ana María Visitante Rojas', email: 'ana@x.cl', telefono: '+56911112222', alias: 'visitante', tipoFirma: 'simple' },
  { rut: '22.222.222-2', nombre: 'Bruno Soto', email: 'bruno@x.cl', alias: 'corredor', tipoFirma: 'avanzada' },
];

(async () => {
  const db = new PrismaClient();
  const srv = await portalfirmaFalso(); const apiUrl = `http://127.0.0.1:${srv.address().port}/api`;
  let co = null;
  try {
    const hash = await argon2.hash('clave-e2e-123', { type: argon2.argon2id });
    co = await db.corredora.create({ data: { nombre: `E2E PfApi ${SUF}` } });
    const nu = (n, rol) => db.usuario.create({ data: { corredoraId: co.id, email: `e2e-pa${n}-${SUF}@prueba.cl`, nombre: 'E2E PA ' + n, hashClave: hash, ...(rol ? { rol } : {}) } });
    const adm = await nu('a', 'ADMIN'); const cor = await nu('c');
    const tA = await ingresar(adm.email, 'clave-e2e-123'); const tC = await ingresar(cor.email, 'clave-e2e-123');
    ok(tA && tC, 'ingresan el administrador y un corredor');

    // ---- credenciales
    const cred = { id: ID_API, customerId: CUSTOMER, email: 'int@x.cl', password: 'clave-pf', apiUrl };
    let r = await req('GET', '/portalfirma-api/conexion', null, tC);
    ok(r.s === 200 && r.j.conectado === false && r.j.admin === false, 'sin credenciales: no conectado (y el corredor no es administrador)');
    r = await req('PUT', '/portalfirma-api/conexion', cred, tC);
    ok(r.s === 403, 'un corredor no puede ingresar las credenciales');
    r = await req('PUT', '/portalfirma-api/conexion', { ...cred, password: 'mala' }, tA);
    ok(r.s === 400 && /no aceptó las credenciales/.test(r.j.message), 'credenciales malas: Portalfirma no las acepta y no se guarda nada');
    ok(!(await db.conexion.findFirst({ where: { corredoraId: co.id, proveedor: 'portalfirma_api' } })), 'y no queda ninguna conexión');
    r = await req('PUT', '/portalfirma-api/conexion', { ...cred, customerId: 'x' }, tA);
    ok(r.s === 400, 'un customer_id que no tiene forma de id se rechaza');
    r = await req('PUT', '/portalfirma-api/conexion', cred, tA);
    ok(r.s === 200 && r.j.conectado && r.j.customerId === CUSTOMER && r.j.email === 'int@x.cl' && !JSON.stringify(r.j).includes('clave-pf') && !JSON.stringify(r.j).includes(ID_API), 'el administrador conecta: se ve quién, nunca la contraseña ni la clave id');
    const fila = await db.conexion.findFirst({ where: { corredoraId: co.id, proveedor: 'portalfirma_api' } });
    ok(fila.estado === 'activa' && fila.accesoCif && !fila.accesoCif.includes('clave-pf') && !JSON.stringify(fila.datos).includes('clave-pf'), 'en la base queda cifrado');

    // ---- enviar a firmar (por defecto: página de firmas)
    const antesTokens = pedidosToken;
    r = await req('POST', '/firmas-envio/pdf', { pdf: PDF, nombre: 'Orden de visita.pdf', firmantes, tramite: 'none' }, tC);
    ok(r.s === 201 && r.j.operacion === OP && r.j.processId && r.j.paginaFirmas === true, 'envía a firmar y devuelve el número de operación (sale del detalle del proceso) y que usó la página de firmas');
    const e1 = envios.at(-1);
    ok(e1.addSignaturePage === true && e1.withProtocolization === false && Buffer.from(e1.document, 'base64').toString().startsWith('%PDF'), 'Portalfirma recibe el PDF en base64, con página de firmas y sin legalización');
    const f1 = e1.signatories[0]; const f2 = e1.signatories[1];
    ok(f1.signatory.name === 'Ana María' && f1.signatory.paternalLastName === 'Visitante' && f1.signatory.maternalLastName === 'Rojas' && f1.signatory.rut === '11.111.111-1' && f1.signatory.phone === '+56911112222', 'el nombre completo se parte en nombre y apellidos');
    ok(f2.signatory.name === 'Bruno' && f2.signatory.paternalLastName === 'Soto' && f2.signatory.maternalLastName === '-' && !('phone' in f2.signatory), 'con un solo apellido, el materno va «-» y sin celular no se manda');
    ok(f1.signature.type === 4 && f2.signature.type === 1 && f1.signature.alias === 'visitante', 'tipo de firma: simple = 4, avanzada = 1; con el rol de cada uno');
    ok(cabeceras.slice(-3).every((c) => c.id === ID_API) && cabeceras.some((c) => c.auth === 'Bearer tok-1'), 'cada llamada lleva la cabecera id y el token');

    // ---- con las firmas ubicadas y legalización
    r = await req('POST', '/firmas-envio/pdf', { pdf: PDF, nombre: 'Mandato.pdf', firmantes, tramite: 'legalization', posiciones: [{ pagina: 3, x: 60.4, y: 120.6 }, { pagina: 3, x: 310, y: 120 }] }, tC);
    const e2 = envios.at(-1);
    ok(r.s === 201 && r.j.paginaFirmas === false && e2.addSignaturePage === false && e2.withProtocolization === true, 'con las firmas ubicadas no se agrega página de firmas, y se pide la legalización');
    ok(e2.signatories[0].signature.pageNumber === 3 && e2.signatories[0].signature.xCoordinate === 60 && e2.signatories[0].signature.yCoordinate === 121 && e2.signatories[1].signature.xCoordinate === 310, 'cada firma va en su página y coordenadas (redondeadas)');
    // ---- firmas ubicadas y además una página de firmas extra (la agrega Portalfirma)
    r = await req('POST', '/firmas-envio/pdf', { pdf: PDF, nombre: 'Mandato.pdf', firmantes, paginaExtra: true, posiciones: [{ pagina: 2, x: 50, y: 60 }, { pagina: 2, x: 300, y: 60 }] }, tC);
    const e2b = envios.at(-1);
    ok(r.s === 201 && e2b.addSignaturePage === true && e2b.signatories[0].signature.pageNumber === 2 && e2b.signatories[0].signature.xCoordinate === 50 && e2b.signatories[1].signature.xCoordinate === 300, 'con «página de firma extra» se piden las dos cosas: las firmas ubicadas y la página al final');
    ok(pedidosToken === antesTokens, 'los dos envíos reutilizaron el token que se pidió al guardar las credenciales (no se pidió otro)');

    // ---- un token vencido se renueva solo
    tokenVigente = 'tok-2';
    r = await req('GET', `/portalfirma-api/operacion/${OP}`, null, tC);
    ok(r.s === 200 && r.j.operation === OP && r.j.signatories[0].signed === false && pedidosToken === antesTokens + 1, 'con el token vencido, Portalfirma responde 401: pide otro y reintenta sin que se note');
    r = await req('GET', '/portalfirma-api/operacion/abc', null, tC);
    ok(r.s === 400, 'un número de operación que no es número se rechaza');

    // ---- «Mis operaciones»: todas las de la empresa con getAll (fechas YYYYMMDD en la ruta)
    r = await req('GET', '/portalfirma-api/operaciones?desde=2026-01-01&hasta=2026-11-20', null, tC);
    ok(r.s === 200 && r.j.listo === true && r.j.filas.length === 3 && r.j.filas[0].operation === OP + 2 && r.j.filas[0].sinEnviar === true && r.j.filas[1].operation === OP + 1 && r.j.filas[1].creado.startsWith('2026-10-01') && r.j.filas[2].operation === OP && r.j.filas[2].contractId === 'a0000000-0000-4000-8000-000000000001' && r.j.filas[2].firmantes === 2 && r.j.filas[2].sinEnviar === false, 'lista todas las operaciones de la empresa (getAll): las filas salen de processSent y processNotSent (total viene vacío), con operación, proceso, fecha y firmantes');
    ok(getAllPedidos.at(-1) === '/api/document/getAll/20260101/20261120', 'las fechas van a Portalfirma como AAAAMMDD, sin guiones');
    getAllListo = false;
    r = await req('GET', '/portalfirma-api/operaciones?desde=2026-01-01&hasta=2026-11-20', null, tC);
    ok(r.s === 200 && r.j.listo === false && /mantenimiento/.test(r.j.motivo) && r.j.filas.length === 0, 'mientras getAll siga en mantenimiento: listo = false (la app usa el listado por teléfono)');
    getAllListo = true;
    // la forma nueva de getAll (POST, por etapa, paginada): trae el nombre y los firmantes de cada operación; filtra por fecha de creación
    getAllNuevo = true;
    r = await req('GET', '/portalfirma-api/operaciones?desde=2026-01-01&hasta=2026-11-20', null, tC);
    const ops = (r.j.filas || []).map((x) => x.operation).sort((x, y) => y - x);
    ok(r.s === 200 && r.j.listo === true && ops.join() === [OP + 5, OP + 4, OP + 3, OP + 2].join(), 'getAll nuevo: junta las etapas y las páginas, y deja fuera lo anterior al rango (' + ops.join(',') + ')');
    const fA = r.j.filas.find((x) => x.operation === OP + 5);
    ok(fA && fA.nombre === 'Contrato A' && fA.firmantes === 2 && fA.firmaron === 1 && fA.estado === 'process' && fA.actualizado.startsWith('2026-11-18'), 'cada fila trae el nombre del documento, los firmantes y cuántos firmaron (sin pedir el detalle)');
    ok(getAllNuevoPedidos.some((x) => x.stage === 'process' && x.page === 2 && x.pageSize === 100) && getAllNuevoPedidos.every((x) => x.pageSize <= 100), 'pide de a 100 y recorre todas las páginas de cada etapa');
    getAllNuevo = false;
    ok((await req('GET', '/portalfirma-api/operaciones?desde=01-01-2026&hasta=2026-11-20', null, tC)).s === 400, 'una fecha que no es AAAA-MM-DD se rechaza');
    // ---- «Mis operaciones» por teléfono (respaldo)
    r = await req('POST', '/portalfirma-api/operaciones', { phone: '+56 9 8727 6858', desde: '2026-01-01', hasta: '2026-11-20', limit: 100 }, tC);
    ok(r.s === 201 && r.j.totalInRange === 1 && r.j.operations[0].operation === OP && r.j.operations[0].contract_id && r.j.operations[0].document_name === 'Orden de visita', 'lista las operaciones de un teléfono en un rango de fechas');
    ok(consultasTel.at(-1).phone === '+56 9 8727 6858' && consultasTel.at(-1).startDate === '2026-01-01' && consultasTel.at(-1).endDate === '2026-11-20' && consultasTel.at(-1).limit === 100, 'con el cuerpo que pide Portalfirma (phone, startDate, endDate, limit)');
    ok((await req('POST', '/portalfirma-api/operaciones', { phone: '98727', desde: '2026-01-01', hasta: '2026-11-20' }, tC)).s === 400, 'un teléfono muy corto se rechaza');
    ok((await req('POST', '/portalfirma-api/operaciones', { phone: '987276858', desde: '01-01-2026', hasta: '2026-11-20' }, tC)).s === 400, 'y una fecha que no es AAAA-MM-DD');
    ok((await req('POST', '/portalfirma-api/operaciones', { phone: '987276858', desde: '2026-01-01', hasta: '2026-11-20', limit: 500 }, tC)).s === 400, 'y más de 100 por consulta');

    // ---- reenvío y PDF
    r = await req('POST', '/portalfirma-api/reenviar', { processId: 'a0000000-0000-4000-8000-000000000001', signatoryId: 'b0000000-0000-4000-8000-000000000001' }, tC);
    ok(r.s === 201 && r.j.ok && reenvios.at(-1).signatoryId === 'b0000000-0000-4000-8000-000000000001', 'reenvía el enlace de firma a un firmante');
    r = await req('GET', '/portalfirma/archivos/a0000000-0000-4000-8000-000000000001', null, tC);
    ok(r.s === 200 && Buffer.from(r.j.base64, 'base64').toString() === '%PDF-1.4 original' && r.j.nombre === 'Orden.pdf', 'baja el PDF de la operación (el original mientras no esté firmado)');

    // ---- posiciones pendientes
    r = await req('PUT', '/firmas-posiciones/carta-oferta', { posiciones: [{ pagina: 1, x: 50, y: 60 }] }, tC);
    ok(r.s === 200 && r.j.ok && r.j.posiciones === 1, 'guarda las firmas que se ubicaron en la ventana de un documento');
    // las firmas ubicadas se usan en el siguiente envío de ESA plantilla, de quien las ubicó, y solo una vez
    r = await req('PUT', '/firmas-posiciones/carta-oferta', { posiciones: [{ pagina: 2, x: 70, y: 80 }, { pagina: 2, x: 300, y: 80 }] }, tC);
    await req('POST', '/firmas-envio/pdf', { pdf: PDF, nombre: 'Otra.pdf', firmantes, plantilla: 'mandato-venta' }, tC);
    ok(envios.at(-1).addSignaturePage === true, 'las firmas ubicadas para otra plantilla no se usan en este envío');
    await req('POST', '/firmas-envio/pdf', { pdf: PDF, nombre: 'Otra.pdf', firmantes, plantilla: 'carta-oferta' }, tA);
    ok(envios.at(-1).addSignaturePage === true, 'ni las usa otro usuario');
    r = await req('POST', '/firmas-envio/pdf', { pdf: PDF, nombre: 'Carta.pdf', firmantes, plantilla: 'carta-oferta' }, tC);
    const e3 = envios.at(-1);
    ok(r.s === 201 && r.j.paginaFirmas === false && e3.addSignaturePage === false && e3.signatories[0].signature.pageNumber === 2 && e3.signatories[0].signature.xCoordinate === 70 && e3.signatories[1].signature.xCoordinate === 300, 'el envío de esa plantilla, de quien ubicó las firmas, las usa (en el orden de los firmantes)');
    r = await req('POST', '/firmas-envio/pdf', { pdf: PDF, nombre: 'Carta.pdf', firmantes, plantilla: 'carta-oferta' }, tC);
    ok(envios.at(-1).addSignaturePage === true, 'y se usan una sola vez: el siguiente envío vuelve a la página de firmas');
    r = await req('PUT', '/firmas-posiciones/carta-oferta', { posiciones: [{ pagina: 1, x: 10, y: 10 }] }, tC);
    r = await req('POST', '/firmas-envio/pdf', { pdf: PDF, nombre: 'Carta.pdf', firmantes, plantilla: 'carta-oferta' }, tC);
    ok(envios.at(-1).addSignaturePage === true, 'si las firmas ubicadas no alcanzan para todos los firmantes (1 de 2), se usa la página de firmas');
    r = await req('PUT', '/firmas-posiciones/carta-oferta', { posiciones: [{ pagina: 0, x: 50, y: 60 }] }, tC);
    ok(r.s === 400, 'una página que no existe (0) se rechaza');
    r = await req('PUT', '/firmas-posiciones/carta-oferta', { posiciones: [] }, tC);
    ok(r.s === 400, 'y también una lista vacía');
    r = await req('DELETE', '/firmas-posiciones/carta-oferta', null, tC);
    ok(r.s === 200 && r.j.ok, 'las posiciones se borran al volver a «Página de firmas»');

    // ---- el servidor local entrega el token directo ({ token }) y no dentro de data
    tokenDirecto = true; tokenVigente = 'tok-directo';
    r = await req('PUT', '/portalfirma-api/conexion', cred, tA);
    ok(r.s === 200 && r.j.conectado, 'acepta que el token venga como { token } (servidor local) y no solo como { data: { token } }');
    r = await req('POST', '/firmas-envio/pdf', { pdf: PDF, nombre: 'Directo.pdf', firmantes, tramite: 'none' }, tC);
    ok(r.s === 201 && cabeceras.at(-1).auth === 'Bearer tok-directo', 'y lo usa en las llamadas siguientes');
    tokenDirecto = false;
    // ---- desconectar
    r = await req('DELETE', '/portalfirma-api/conexion', null, tC);
    ok(r.s === 403, 'un corredor no puede quitar las credenciales');
    r = await req('DELETE', '/portalfirma-api/conexion', null, tA);
    ok(r.s === 200 && r.j.conectado === false, 'el administrador las quita');
    r = await req('POST', '/firmas-envio/pdf', { pdf: PDF, nombre: 'X.pdf', firmantes, tramite: 'none' }, tC);
    ok(r.s === 409 && r.j.codigo === 'NECESITA_CONEXION', 'sin credenciales, enviar responde 409 NECESITA_CONEXION (la app sigue por el camino anterior)');
    r = await req('GET', `/portalfirma-api/operacion/${OP}`, null, tC);
    ok(r.s === 409 && r.j.codigo === 'NECESITA_CONEXION', 'y consultar una operación también');
    r = await req('POST', '/portalfirma-api/operaciones', { phone: '987276858', desde: '2026-01-01', hasta: '2026-11-20' }, tC);
    ok(r.s === 409 && r.j.codigo === 'NECESITA_CONEXION', 'y listar las operaciones (la app sigue por el MCP)');
    console.log('OK portalfirma api');
  } catch (e) {
    console.error(e.message); process.exitCode = 1;
  } finally {
    srv.closeAllConnections(); srv.close();
    if (co) {
      const w = { where: { corredoraId: co.id } };
      for (const m of ['conexion', 'registro', 'actividad', 'sesion']) await db[m].deleteMany(m === 'sesion' ? { where: { usuario: { corredoraId: co.id } } } : w).catch(() => null);
      await db.usuario.deleteMany(w).catch(() => null); await db.corredora.delete({ where: { id: co.id } }).catch(() => null);
    }
    await db.$disconnect();
  }
})();
