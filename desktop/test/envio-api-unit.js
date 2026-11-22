// Prueba de src/envio-api.js (enviar un PDF a firmar por la API de Portalfirma del servidor) sin Electron ni servidor: se simulan
// inmo y asset.   node test/envio-api-unit.js
const assert = require('assert');
const Module = require('module');
const path = require('path');
const src = path.join(__dirname, '..', 'src');
let llamadas = []; let respuesta; let conApi = true;
const falso = {
  [path.join(src, 'inmo.js')]: { get API() { return conApi; }, fmtRut: (r) => String(r).replace(/\./g, '') },
  [path.join(src, 'asset.js')]: { llamar: async (m, ruta, cuerpo) => { llamadas.push({ m, ruta, cuerpo }); if (respuesta instanceof Error) throw respuesta; return respuesta; } },
};
const orig = Module._load;
Module._load = function (req, parent, ...r) {
  const abs = req.startsWith('.') ? path.resolve(path.dirname(parent.filename), req) : req;
  for (const k of Object.keys(falso)) if (abs === k || abs + '.js' === k) return falso[k];
  return orig.call(this, req, parent, ...r);
};
const { enviarPdf } = require(path.join(src, 'envio-api.js'));
const base = { bytes: Buffer.from('%PDF-1.4 prueba'), nombre: 'Orden.pdf', firmantes: [{ rut: '11.111.111-1', nombre: 'Ana Visitante', email: 'ana@x.cl', telefono: '+56911112222', alias: 'visitante', tipoFirma: 'simple' }] };
(async () => {
  respuesta = { operacion: 777, processId: 'p-1', paginaFirmas: true };
  let r = await enviarPdf({ ...base, tramite: 'legalization', propId: 'prop1', negocioId: 'n1' });
  assert.deepStrictEqual(r, { operation: 777, processId: 'p-1', paginaFirmas: true });
  const l = llamadas[0];
  assert.strictEqual(l.m, 'POST'); assert.strictEqual(l.ruta, '/firmas-envio/pdf');
  assert.strictEqual(l.cuerpo.tramite, 'legalization'); assert.strictEqual(l.cuerpo.propiedadId, 'prop1'); assert.strictEqual(l.cuerpo.negocioId, 'n1');
  assert.strictEqual(Buffer.from(l.cuerpo.pdf, 'base64').toString(), '%PDF-1.4 prueba');
  assert.deepStrictEqual(l.cuerpo.firmantes[0], { rut: '11111111-1', nombre: 'Ana Visitante', email: 'ana@x.cl', telefono: '+56911112222', alias: 'visitante', tipoFirma: 'simple' });
  // sin credenciales de la API de Portalfirma (409): error claro, sin camino alternativo
  respuesta = Object.assign(new Error('sin conexión'), { code: 'NECESITA_CONEXION', status: 409 });
  await assert.rejects(() => enviarPdf(base), (e) => e.code === 'NEEDS_PF_API' && /Integraciones/.test(e.message));
  // otro error: se propaga
  respuesta = Object.assign(new Error('Portalfirma: rechazó'), { code: 'X', status: 502 });
  await assert.rejects(() => enviarPdf(base), /rechazó/);
  // sin cuenta de Asset: no intenta y avisa lo mismo
  conApi = false; llamadas = [];
  await assert.rejects(() => enviarPdf(base), (e) => e.code === 'NEEDS_PF_API'); assert.strictEqual(llamadas.length, 0);
  // extraer firmantes va por el servidor y pasa el PDF completo
  conApi = true; respuesta = { legible: true, escaneado: true, tipoDocumento: 'Contrato', firmantes: [{ nombre: 'Ana', rut: '1-9', rutValido: false, rol: 'arrendadora', email: '', telefono: '', pagina: 2 }], avisos: [] };
  const ex = await require(path.join(src, 'envio-api.js')).extraerFirmantes(Buffer.from('%PDF-1.4 x'));
  assert.strictEqual(ex.firmantes[0].pagina, 2); assert.strictEqual(llamadas.at(-1).ruta, '/firmas-envio/firmantes'); assert.strictEqual(Buffer.from(llamadas.at(-1).cuerpo.pdf, 'base64').toString(), '%PDF-1.4 x');
  console.log('envio-api-unit OK');
})().catch((e) => { console.error(e); process.exit(1); });
