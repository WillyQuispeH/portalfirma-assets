// WhatsApp de la empresa a través del servidor de Asset (con la cuenta de Asset). El servidor tiene la clave de wechatia
// de la corredora, lee las conversaciones y corre los asistentes (Sofía, Tomás, postventa, el observador); la app ya
// no lee wechatia ni responde por su cuenta (antes dos equipos abiertos podían responderle dos veces al mismo cliente).
// Este módulo es lo que la app le pide al servidor:
//  · enviar (texto libre, plantilla, a un contacto) y revisar la entrega de un mensaje;
//  · el celular del ejecutivo (Agente por WhatsApp): vincular, estado, traer lo que escribe y responderle;
//  · la atención de clientes (encender/apagar, pausar o reanudar con una persona) y el observador.
// En modo de prueba (PF_MOCK) o sin sesión, `enApi()` es false y la app sigue como antes (wechatia desde el equipo).
let inmoMod = null; const inmo = () => (inmoMod ||= require('./inmo'));
const asset = () => require('./asset');
const err = (m, code) => Object.assign(new Error(m), code ? { code } : {});

const enApi = () => { try { return !!(inmo().API && inmo().usuario()?.id); } catch { return false; } };
const api = async (metodo, ruta, cuerpo) => {
  try { return await asset().llamar(metodo, ruta, cuerpo); }
  catch (e) { throw err(e.message, e.code || (e.data && e.data.code) || undefined); }
};

// ---------------------------------------------------------------- la conexión (en caché: la app la consulta seguido)
let conexion = null; let conexionEn = 0;
async function refrescarConexion() {
  if (!enApi()) return null;
  try { conexion = await api('GET', '/whatsapp/conexion'); conexionEn = Date.now(); } catch {}
  return conexion;
}
/** ¿el servidor tiene el WhatsApp de la empresa conectado? (síncrono, con lo último que se supo) */
function conectado() {
  if (Date.now() - conexionEn > 60_000) refrescarConexion();
  return !!conexion?.conectado;
}

// ---------------------------------------------------------------- envíos
async function enviar({ telefono, nombre = '', texto, revisar24 = true }) {
  const r = await api('POST', '/whatsapp/enviar', { telefono, nombre: nombre || '', texto, revisar24 });
  return { contactId: r.contactId, messageId: r.messageId || null, estado: r.estado || 'enviado', duplicado: !!r.duplicado };
}
const plantilla = ({ telefono, nombre = '', etiqueta, campos }) => api('POST', '/whatsapp/enviar/plantilla', { telefono, nombre: nombre || '', etiqueta, campos });
const contacto = ({ contactId, texto, telefono }) => api('POST', '/whatsapp/enviar/contacto', { contactId, texto, ...(telefono ? { telefono } : {}) });
const estadoMensaje = (id) => api('GET', '/whatsapp/enviar/estado/' + encodeURIComponent(id)).catch(() => null);

// ---------------------------------------------------------------- el celular del ejecutivo
let ejecutivo = null;
const guardarEj = (e) => { if (e && typeof e === 'object') ejecutivo = e; return ejecutivo; };
const ej = {
  estado: () => ejecutivo || { activo: false, telefono: null, codigo: null, numeroEmpresa: '+56 9 4497 5958' },
  refrescar: async () => guardarEj(await api('GET', '/whatsapp/ejecutivo')),
  vincular: async (o = {}) => { const r = await api('POST', '/whatsapp/ejecutivo/vincular', o); await ej.refrescar().catch(() => {}); return r; },
  desvincular: async () => { await api('POST', '/whatsapp/ejecutivo/desvincular'); await ej.refrescar().catch(() => {}); return true; },
  configurar: async (o = {}) => guardarEj(await api('PUT', '/whatsapp/ejecutivo', o)),
  /** lo nuevo de su celular (y la señal de que su Asset está abierto) */
  entrantes: async () => { const r = await api('GET', '/whatsapp/ejecutivo/entrantes'); guardarEj(r.estado); return r.items || []; },
  responder: (texto) => api('POST', '/whatsapp/ejecutivo/responder', { texto: String(texto).slice(0, 3500) }),
};

// ---------------------------------------------------------------- atención de clientes y observador
let asistentes = null;
const at = {
  estado: () => asistentes || { activo: true, clientesActivo: true },
  refrescar: async () => { const r = await api('GET', '/whatsapp/asistentes'); asistentes = { ...r, activo: r.clientesActivo }; return asistentes; },
  configurar: async (activo) => { const r = await api('PUT', '/whatsapp/asistentes', { clientesActivo: !!activo }); asistentes = { ...r, activo: r.clientesActivo }; return asistentes; },
  pausa: async (telefono) => (await api('GET', '/whatsapp/asistentes/pausa?telefono=' + encodeURIComponent(telefono))).pausaHasta || null,
  pausar: async (telefono, horas) => (await api('POST', '/whatsapp/asistentes/pausar', { telefono, ...(horas ? { horas } : {}) })).pausaHasta,
  reanudar: (telefono) => api('POST', '/whatsapp/asistentes/reanudar', { telefono }),
};
const obs = {
  estado: () => api('GET', '/whatsapp/observador'),
  configurar: (o = {}) => api('PUT', '/whatsapp/observador', o),
  revisar: () => api('POST', '/whatsapp/observador/revisar'),
};

module.exports = { enApi, refrescarConexion, conectado, enviar, plantilla, contacto, estadoMensaje, ejecutivo: ej, asistentes: at, observador: obs };
