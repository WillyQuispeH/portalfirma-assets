// Evaluación del arrendatario y de sus avales (etapa 2 de un negocio de arriendo). Todo lo hace el servidor de Asset:
// manda la plantilla de WhatsApp, recibe y lee los documentos y calcula el puntaje (api/src/whatsapp/evaluacion.ts).
// La app solo pide, muestra y deja que el corredor decida. Sin cuenta de Asset no está disponible.
const asset = () => require('./asset');
const err = (m) => new Error(m);
const base = (id) => `/evaluaciones/${encodeURIComponent(String(id || ''))}`;
const api = async (m, r, c) => { try { return await asset().llamar(m, r, c); } catch (e) { throw err(e.message); } };
module.exports = {
  ver: (negocioId) => api('GET', base(negocioId)),
  solicitar: ({ negocioId, avales = [], titular = true }) => api('POST', base(negocioId) + '/solicitar', { avales, titular }),
  recalcular: (negocioId) => api('POST', base(negocioId) + '/recalcular', {}),
  decidir: ({ negocioId, decision, nota = '' }) => api('POST', base(negocioId) + '/decidir', { decision, nota }),
  archivo: ({ negocioId, personaId, n }) => api('GET', `${base(negocioId)}/archivo/${encodeURIComponent(personaId)}/${Number(n) || 0}`),
};
