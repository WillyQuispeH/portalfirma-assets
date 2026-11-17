// Carta oferta de un negocio: Asset arma el PDF en el servidor (api/src/negocios/carta-oferta.ts, con la plantilla HTML
// src/documentos/plantillas/carta-oferta.html), lo sube a Portalfirma y lo envía a firmar al oferente. La app pide la vista
// previa (el corredor ve el PDF antes de enviarlo) y el envío. Sin cuenta de Asset no está disponible, salvo en el modo de
// prueba (PF_MOCK), donde se simula con un PDF mínimo y una operación inventada.
const asset = () => require('./asset');
const err = (m) => new Error(m);
const api = async (m, r, c, ms) => { try { return await asset().llamar(m, r, c, ms); } catch (e) { throw err(e.message); } };
const revisar = (r) => { if (r?.error) throw err(r.error); return r; };
// generar el PDF puede tardar (Chromium): se espera más que en una llamada común
const ESPERA = 90000;
const PDF_MINIMO = Buffer.from('%PDF-1.1 1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj trailer<</Root 1 0 R>> %%EOF').toString('base64');

function crear({ inmo, negocios }) {
  const simulada = () => !inmo.API && process.env.PF_MOCK === '1';
  const id = (n) => encodeURIComponent(String(n || ''));
  return {
    async vistaPrevia({ negocioId }) {
      if (simulada()) { const n = negocios.ver(negocioId); return { ok: true, pdf: PDF_MINIMO, archivo: 'Carta oferta (simulada).pdf', oferente: n.cliente?.nombre || '', propiedad: n.prop?.codigo || '' }; }
      return revisar(await api('POST', '/cartas-oferta/vista-previa', { negocioId: String(negocioId) }, ESPERA));
    },
    async enviar({ negocioId, conPropietario }) {
      if (simulada()) {
        const n = negocios.ver(negocioId); const op = 910000 + Math.floor(Math.random() * 9999);
        negocios.vincularFirma(negocioId, n.tipo === 'venta' ? 'reserva' : 'oferta', op);
        inmo.agregarFirma({ operacion: op, plantilla: 'Carta oferta nº 1', origen: 'asset', fecha: new Date().toISOString(), estado: 'en_firma', firmantes: [{ nombre: n.cliente?.nombre, rut: n.cliente?.rut, rol: n.tipo === 'venta' ? 'Comprador' : 'Arrendatario', personaId: n.cliente?.id }], negocioId }, [n.prop?.id], `Carta oferta enviada a firmar a ${n.cliente?.nombre} (operación ${op})`);
        return { ok: true, enviada: true, operacion: op, numero: 1, oferente: n.cliente?.nombre, indicacion: 'Carta simulada (pruebas).', simulada: true };
      }
      const r = revisar(await api('POST', '/cartas-oferta/enviar', { negocioId: String(negocioId), conPropietario: conPropietario === true }, ESPERA));
      try { await inmo.sincronizar(); } catch { /* se trae en la próxima sincronización */ }   // trae la firma y el negocio que creó el servidor
      return r;
    },
    _id: id,
  };
}
module.exports = { crear };
