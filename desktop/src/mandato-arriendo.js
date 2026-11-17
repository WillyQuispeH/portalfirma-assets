// Mandato de gestión de arriendo de una propiedad: Asset arma el PDF en el servidor (api/src/negocios/mandato-arriendo.ts, con la
// plantilla HTML src/documentos/plantillas/mandato-arriendo.html). La app pide la vista previa (se ve y se puede DESCARGAR sin firmar:
// la firma no es obligatoria) y, si se quiere, el envío a firmar al propietario. Sin cuenta de Asset no está disponible, salvo en el
// modo de prueba (PF_MOCK), donde se simula con un PDF mínimo y una operación inventada.
const asset = () => require('./asset');
const err = (m) => new Error(m);
const api = async (m, r, c, ms) => { try { return await asset().llamar(m, r, c, ms); } catch (e) { throw err(e.message); } };
const revisar = (r) => { if (r?.error) throw err(r.error); return r; };
// generar el PDF puede tardar (Chromium): se espera más que en una llamada común
const ESPERA = 90000;
const PDF_MINIMO = Buffer.from('%PDF-1.1 1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj trailer<</Root 1 0 R>> %%EOF').toString('base64');

function crear({ inmo }) {
  const simulada = () => !inmo.API && process.env.PF_MOCK === '1';
  return {
    async vistaPrevia({ propiedadId }) {
      if (simulada()) return { ok: true, pdf: PDF_MINIMO, archivo: 'Mandato de arriendo (simulado).pdf', propiedad: '', propietarios: [] };
      return revisar(await api('POST', '/mandatos-arriendo/vista-previa', { propiedadId: String(propiedadId) }, ESPERA));
    },
    async enviar({ propiedadId }) {
      if (simulada()) return { ok: true, enviada: true, operacion: 920000 + Math.floor(Math.random() * 9999), numero: 1, indicacion: 'Mandato simulado (pruebas).', simulada: true };
      const r = revisar(await api('POST', '/mandatos-arriendo/enviar', { propiedadId: String(propiedadId) }, ESPERA));
      try { await inmo.sincronizar(); } catch { /* se trae en la próxima sincronización */ }   // trae la firma que creó el servidor
      return r;
    },
  };
}
module.exports = { crear };
