'use strict';
// Enviar a firmar y extraer firmantes SOLO por Asset: el servidor de Asset envía el PDF con la API de integración de Portalfirma (credenciales
// de la corredora, Integraciones › API de Portalfirma) y lee quién firma con su propia IA (PDF normal o escaneado). Nada de esto pasa por el
// MCP de Portalfirma. Sin cuenta de Asset o sin credenciales de la API lanza NEEDS_PF_API (el modo demostración, PF_MOCK, responde con mock.js).
const inmo = require('./inmo');

const SIN_API = 'Conecta la API de Portalfirma en Integraciones: el administrador ingresa la clave id, el customer_id, el correo y la contraseña de la empresa.';
const sinApi = () => Object.assign(new Error(SIN_API), { code: 'NEEDS_PF_API' });

async function llamar(metodo, ruta, cuerpo, ms) {
  if (!inmo.API) { if (process.env.PF_MOCK === '1') return require('./mock').integracion(metodo, ruta, cuerpo); throw sinApi(); }
  try { return await require('./asset').llamar(metodo, ruta, cuerpo, ms); }
  catch (e) { if (e.code === 'NECESITA_CONEXION' || e.status === 409) throw sinApi(); throw e; }
}

/** envía un PDF a firmar → { operation, processId, paginaFirmas } */
async function enviarPdf({ bytes, nombre, firmantes, tramite = 'none', propId = null, negocioId = null, posiciones = null, paginaExtra = false }) {
  const r = await llamar('POST', '/firmas-envio/pdf', {
    pdf: Buffer.from(bytes).toString('base64'), nombre, tramite: tramite === 'legalization' || tramite === 'protocolization' ? 'legalization' : 'none',
    firmantes: firmantes.map((f) => ({ rut: inmo.fmtRut(f.rut), nombre: f.nombre, email: f.email, ...(f.telefono ? { telefono: String(f.telefono) } : {}), alias: String(f.alias || 'firmante').trim(), tipoFirma: ['simple', 'avanzada', 'visada', 'enrolada'].includes(f.tipoFirma) ? f.tipoFirma : 'simple' })),
    ...(propId ? { propiedadId: propId } : {}), ...(negocioId ? { negocioId } : {}), ...(paginaExtra ? { paginaExtra: true } : {}),
    // las firmas ubicadas en el PDF (una por firmante, en su orden); sin ellas, Portalfirma agrega una página de firmas
    ...(Array.isArray(posiciones) && posiciones.length === firmantes.length ? { posiciones: posiciones.map((p) => ({ pagina: Number(p.pagina), x: Number(p.x), y: Number(p.y) })) } : {}),
  }, 120000);
  return { operation: r.operacion, processId: r.processId || null, paginaFirmas: !!r.paginaFirmas };
}

/** quién firma un PDF (normal o escaneado), leído por la IA de Asset → { legible, escaneado, tipoDocumento, firmantes: [{ nombre, rut, rutValido, rol, email, telefono, pagina }], avisos } */
function extraerFirmantes(bytes) {
  return llamar('POST', '/firmas-envio/firmantes', { pdf: Buffer.from(bytes).toString('base64') }, 180000);
}

/** el detalle de una operación (firmantes, quién firmó, estado, archivos) por la API de integración */
const detalleOperacion = (n) => llamar('GET', '/portalfirma-api/operacion/' + Number(n));

/** vuelve a mandar el enlace de firma a un firmante (Portalfirma lo envía por el canal que tenga: correo o WhatsApp) */
const reenviarFirmante = (processId, signatoryId) => llamar('POST', '/portalfirma-api/reenviar', { processId, signatoryId });

/** vuelve a mandar el enlace de firma a todos los que aún no firman */
const reenviarTodos = (processId) => llamar('POST', '/portalfirma-api/reenviar', { processId });

module.exports = { enviarPdf, extraerFirmantes, detalleOperacion, reenviarFirmante, reenviarTodos, SIN_API };
