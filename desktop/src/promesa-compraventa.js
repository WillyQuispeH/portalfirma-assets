// Promesa de compraventa de un negocio de venta: Asset arma el PDF en el servidor (api/src/negocios/promesa-compraventa.ts, con la
// plantilla HTML src/documentos/plantillas/promesa-compraventa.html), lo sube a Portalfirma y lo envía a firmar al comprador y al
// vendedor. La app pide la vista previa (se ve y se puede DESCARGAR sin firmar: la firma no es obligatoria) y el envío. Sin cuenta de
// Asset no está disponible, salvo en el modo de prueba (PF_MOCK), donde se simula con un PDF mínimo y una operación inventada.
const asset = () => require('./asset');
const err = (m) => new Error(m);
const api = async (m, r, c, ms) => { try { return await asset().llamar(m, r, c, ms); } catch (e) { throw err(e.message); } };
const revisar = (r) => { if (r?.error) throw err(r.error); return r; };
// generar el PDF puede tardar (Chromium): se espera más que en una llamada común
const ESPERA = 90000;
const PDF_MINIMO = Buffer.from('%PDF-1.1 1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj trailer<</Root 1 0 R>> %%EOF').toString('base64');

function crear({ inmo, negocios }) {
  const simulada = () => !inmo.API && process.env.PF_MOCK === '1';
  return {
    async vistaPrevia({ negocioId }) {
      if (simulada()) { const n = negocios.ver(negocioId); return { ok: true, pdf: PDF_MINIMO, archivo: 'Promesa de compraventa (simulada).pdf', comprador: n.cliente?.nombre || '', propiedad: n.prop?.codigo || '' }; }
      return revisar(await api('POST', '/promesas-compraventa/vista-previa', { negocioId: String(negocioId) }, ESPERA));
    },
    async enviar({ negocioId }) {
      if (simulada()) {
        const n = negocios.ver(negocioId); const op = 930000 + Math.floor(Math.random() * 9999);
        negocios.vincularFirma(negocioId, 'promesa', op);
        inmo.agregarFirma({ operacion: op, plantilla: 'Promesa de compraventa nº 1', origen: 'asset', fecha: new Date().toISOString(), estado: 'en_firma', firmantes: [{ nombre: n.cliente?.nombre, rut: n.cliente?.rut, rol: 'Comprador', personaId: n.cliente?.id }], negocioId }, [n.prop?.id], `Promesa de compraventa enviada a firmar a ${n.cliente?.nombre} (operación ${op})`);
        return { ok: true, enviada: true, operacion: op, numero: 1, comprador: n.cliente?.nombre, indicacion: 'Promesa simulada (pruebas).', simulada: true };
      }
      const r = revisar(await api('POST', '/promesas-compraventa/enviar', { negocioId: String(negocioId) }, ESPERA));
      try { await inmo.sincronizar(); } catch { /* se trae en la próxima sincronización */ }   // trae la firma y el negocio que creó el servidor
      return r;
    },
  };
}
module.exports = { crear };
