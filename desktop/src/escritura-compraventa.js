// Borrador de escritura de compraventa de un negocio de VENTA: Asset arma el PDF en el servidor (api/src/negocios/escritura-compraventa.ts,
// con la plantilla HTML src/documentos/plantillas/escritura-compraventa.html). La escritura pública la otorga siempre una notaría: esto es
// una minuta para llevar a la notaría. La app pide la vista previa (se ve y se puede DESCARGAR sin firmar: la firma no es obligatoria) y,
// si se quiere, el envío a firmar al comprador y a los vendedores como aceptación del borrador; al firmarse, el paso «Escritura firmada»
// avanza solo (gemelo de carta-oferta.js). Sin cuenta de Asset no está disponible, salvo en el modo de prueba (PF_MOCK), donde se
// simula con un PDF mínimo y una operación inventada.
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
      if (simulada()) { const n = negocios.ver(negocioId); return { ok: true, pdf: PDF_MINIMO, archivo: 'Borrador de escritura de compraventa (simulado).pdf', propiedad: n.prop?.codigo || '', comprador: n.cliente?.nombre || '', firmantes: [], faltan: [] }; }
      return revisar(await api('POST', '/escrituras-compraventa/vista-previa', { negocioId: String(negocioId) }, ESPERA));
    },
    async enviar({ negocioId }) {
      if (simulada()) {
        const n = negocios.ver(negocioId); const op = 930000 + Math.floor(Math.random() * 9999);
        negocios.vincularFirma(negocioId, 'escritura', op);
        inmo.agregarFirma({ operacion: op, plantilla: 'Borrador de escritura de compraventa nº 1', origen: 'asset', fecha: new Date().toISOString(), estado: 'en_firma', firmantes: [{ nombre: n.cliente?.nombre, rut: n.cliente?.rut, rol: 'Comprador', personaId: n.cliente?.id }], negocioId }, [n.prop?.id], `Borrador de escritura enviado a firmar a ${n.cliente?.nombre} (operación ${op})`);
        return { ok: true, enviada: true, operacion: op, numero: 1, indicacion: 'Borrador simulado (pruebas).', simulada: true };
      }
      const r = revisar(await api('POST', '/escrituras-compraventa/enviar', { negocioId: String(negocioId) }, ESPERA));
      try { await inmo.sincronizar(); } catch { /* se trae en la próxima sincronización */ }   // trae la firma y el negocio que creó el servidor
      return r;
    },
  };
}
module.exports = { crear };
