// Acta de visita (etapa 1 · Comercialización de un negocio): audios de la visita (grabados aquí, subidos o por WhatsApp),
// fotos y el resumen que arma la IA. Todo lo hace el servidor de Asset (api/src/whatsapp/acta-visita.ts): guarda los
// archivos, transcribe y resume. La app graba, sube y muestra. Sin cuenta de Asset no está disponible.
const asset = () => require('./asset');
const err = (m) => new Error(m);
const api = async (m, r, c, ms) => { try { return await asset().llamar(m, r, c, ms); } catch (e) { throw err(e.message); } };
const id = (x) => encodeURIComponent(String(x || ''));
const b64 = (bytes) => Buffer.from(bytes instanceof Uint8Array ? bytes : Buffer.from(bytes || [])).toString('base64');
module.exports = {
  listar: (negocioId) => api('GET', `/actas-visita/negocio/${id(negocioId)}`),
  crear: ({ negocioId, fecha }) => api('POST', `/actas-visita/negocio/${id(negocioId)}`, fecha ? { fecha } : {}),
  ver: (actaId) => api('GET', `/actas-visita/${id(actaId)}`),
  // el audio se transcribe en el servidor: puede tardar (audios largos)
  audio: ({ actaId, bytes, mime, origen }) => api('POST', `/actas-visita/${id(actaId)}/audio`, { audio: b64(bytes), mime: mime || 'audio/webm', origen: origen === 'archivo' ? 'archivo' : 'app' }, 300000),
  foto: ({ actaId, bytes, mime }) => api('POST', `/actas-visita/${id(actaId)}/foto`, { imagen: b64(bytes), mime: mime || 'image/jpeg' }, 120000),
  notas: ({ actaId, notas }) => api('POST', `/actas-visita/${id(actaId)}/notas`, { notas: String(notas || '') }),
  resumir: (actaId) => api('POST', `/actas-visita/${id(actaId)}/resumir`, {}, 120000),
  cerrar: (actaId) => api('POST', `/actas-visita/${id(actaId)}/cerrar`, {}, 120000),
  whatsapp: (actaId) => api('POST', `/actas-visita/${id(actaId)}/whatsapp`, {}),
  eliminar: (actaId) => api('DELETE', `/actas-visita/${id(actaId)}`),
  archivo: ({ actaId, tipo, n }) => api('GET', `/actas-visita/${id(actaId)}/archivo/${id(tipo)}/${Number(n) || 0}`),
};
