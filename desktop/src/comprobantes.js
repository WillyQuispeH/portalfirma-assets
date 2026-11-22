// Leer un comprobante de pago (PDF o foto) con la IA de Asset: monto, moneda, fecha, medio y referencia (api/src/documentos/leer-comprobante.ts).
// Sin cuenta de Asset no está disponible. En pruebas (PF_MOCK) se usa global.__comprobanteLeido.
const asset = () => require('./asset');
async function leer({ bytes, mime }) {
  if (process.env.PF_MOCK === '1' && global.__comprobanteLeido) return global.__comprobanteLeido;
  const r = await asset().llamar('POST', '/documentos/comprobante', { archivo: Buffer.from(bytes).toString('base64'), mime: mime || 'application/pdf' }, 120000);
  return r;
}
module.exports = { leer };
