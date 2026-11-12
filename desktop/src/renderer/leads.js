/* global $, api, toast, closeModal, ir, pf, liberar */
'use strict';
// Leads (0.14): bandeja de clientes potenciales con su conversación de WhatsApp (como una ventana de WhatsApp,
// de solo lectura), su búsqueda leída por IA, su estado y la próxima acción. Entrada: chat exportado (.txt o .zip).
(() => {
const LD = { filtro: 'abiertos', sel: null, data: null, yo: null }; // los sincroniza la bandeja en React (mostrar)
const fechaCorta = (f) => { if (!f) return ''; const d = new Date(f); const hoy = new Date(); const ayer = new Date(Date.now() - 864e5);
  if (d.toDateString() === hoy.toDateString()) return f.slice(11, 16); if (d.toDateString() === ayer.toDateString()) return 'ayer';
  return `${f.slice(8, 10)}/${f.slice(5, 7)}${f.slice(0, 4) !== String(hoy.getFullYear()) ? '/' + f.slice(2, 4) : ''}`; };

async function miNombre() { if (LD.yo != null) return LD.yo; try { const u = await pf.apiUser?.(); LD.yo = (u?.ok && (u.data?.namePerson || u.data?.name)) || ''; } catch { LD.yo = ''; } return LD.yo; }

// La bandeja, la conversación y la ficha están en React: src/ui/components/functional/leads/ (Leads, LeadDetalle, FichaLead).
// Aquí quedan los asistentes de importación y las ventanas de derivar y eliminar.
// React elige el lead y llama a mostrar(); cuando algo cambia aquí, lista() le pide a React recargar.
async function abrir(id) {
  if (id) LD.sel = id; ir('leads');
  const el = $('#view-leads'); liberar(el); window.ReactUI.montar('Leads', el, { sel: id || null, filtro: LD.filtro });
}
// React → aquí: el lead elegido y los datos de la lista (los usan importar y eliminar)
function mostrar(sel, data, filtro) { LD.sel = sel; LD.data = data; LD.filtro = filtro; }
// aquí → React: recargar la lista (con el elegido y el filtro que se hayan fijado aquí, p. ej. al importar)
function lista() { window.dispatchEvent(new CustomEvent('pf:leads', { detail: { sel: LD.sel, filtro: LD.filtro } })); }
function comoExportar() { window.Ventanas.abrir('leads.comoExportar', {}, { clave: 'modal-33' }); }

// ---------- el detalle (conversación + ficha) es React: LeadDetalle.tsx y FichaLead.tsx ----------
// Desde allá se llaman eliminar(), agregarMensajes() y derivar() (las ventanas de siempre).
function eliminar(id, nombre, mensajes) {
  window.Ventanas.abrir('leads.eliminar', { nombre, mensajes,
    alEliminar: async () => { await api('leadsBorrar', id); closeModal(); LD.sel = null; toast('Lead eliminado.'); lista(); } }, { clave: 'modal-35' });
}
function agregarMensajes(ig) { if (ig) comoInstagram(); else $('#ldFile').click(); }

// ---------- 0.16.23 · derivar al corredor dueño por WhatsApp ----------
async function derivar(id) {
  const v = await api('leadsDerivarVer', id).catch((e) => { toast(e.message); return null; }); if (!v) return;
  if (!v.corredor) return toast('Primero asigna el lead a un corredor.');
  window.Ventanas.abrir('leads.derivar', { corredor: v.corredor, texto: v.texto, alUsuarios: () => window.Usuarios?.abrir(), alAbrirEnlace: (url) => pf.openUrl?.(url),
    // si no sale por el número de la empresa, la ventana ofrece abrir tu WhatsApp con r.enlace
    alEnviar: async () => { const r = await api('leadsDerivar', id);
      if (r.ok) { closeModal(); toast(`Listo: ${v.corredor.nombre} recibió el lead por WhatsApp.`, 5000); }
      lista(); return r; } }, { clave: 'modal-36' });
}
// ---------- importar un chat exportado ----------
async function importarRuta(ruta, canal) {
  let a;
  try { a = await api('leadsAnalizar', { ruta, canal, miNombre: await miNombre() }); } catch (e) { return /instagram|IG_|NO_IG/i.test(e.message + (e.code || '')) || canal === 'instagram' ? modalError(e.message, comoInstagram) : modalError(e.message); }
  if (a.tipo === 'instagram') return importarInstagram(a);
  const fmt = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');
  const med = Object.entries(a.medios || {}).sort((x, y) => ['imagen', 'audio', 'video', 'documento', 'contacto', 'omitido'].indexOf(x[0]) - ['imagen', 'audio', 'video', 'documento', 'contacto', 'omitido'].indexOf(y[0])).map(([k, n]) => `${n} ${{ imagen: n > 1 ? 'fotos' : 'foto', audio: n > 1 ? 'audios' : 'audio', video: n > 1 ? 'videos' : 'video', documento: n > 1 ? 'documentos' : 'documento', omitido: n > 1 ? 'archivos no incluidos' : 'archivo no incluido', contacto: 'contacto' }[k] || k}`).join(', ');
  const audios = a.conArchivos ? a.medios?.audio || 0 : 0;
  window.Ventanas.abrir('leads.importar', { total: a.total, rango: `del ${fmt(a.desde)} al ${fmt(a.hasta)}`, medios: med, existente: a.existente, cliente: a.cliente,
    participantes: a.participantes, telefono: a.telefono || '', audios, sinArchivos: !a.conArchivos && !!(a.medios?.imagen || a.medios?.audio || a.medios?.omitido),
    alImportar: async ({ cliente: cli, telefono, transcribir }) => {
      const r = await api('leadsImportar', { token: a.token, cliente: cli, telefono, brokerNombre: await miNombre(), transcribir });
      closeModal(); LD.sel = r.lead.id; LD.filtro = 'todos';
      toast(r.nuevo ? `Lead creado: ${r.agregados} mensajes.` : r.agregados ? `Se agregaron ${r.agregados} mensajes nuevos.` : 'No había mensajes nuevos.');
      if (r.ia?.error) toast('La conversación quedó guardada, pero no se pudo analizar con IA: ' + r.ia.error, 7000);
      abrir(r.lead.id);
    } }, { clave: 'modal-37' });
}
function modalError(msg, como = comoExportar) { window.Ventanas.abrir('leads.errorImportar', { mensaje: msg, instagram: como === comoInstagram, alVerComo: como }, { clave: 'modal-38' }); }

// ---------- 0.16.21 · cuentas e historial: Instagram (archivo de «Descargar tu información»), WhatsApp, correo ----------
async function cuentas() {
  const cons = await api('leadsConsentimientos').catch(() => []);
  // el panel «En vivo desde wechatia» (Instagram, Facebook y correo) se dibuja en la ventana con el estado de obsEstado
  window.Ventanas.abrir('leads.cuentas', { consentimientos: cons, fechaCorta, alInstagram: comoInstagram, alWhatsApp: comoExportar,
    alCargarObs: () => api('obsEstado').catch(() => null),
    alConfigurar: (cfg) => api('obsConfigurar', cfg),
    alRevisar: async () => { const r = await api('obsRevisar');
      toast(r.error ? r.error : r.mensajes ? `${r.mensajes} mensajes nuevos${r.nuevos ? ` · ${r.nuevos} lead${r.nuevos === 1 ? '' : 's'} nuevo${r.nuevos === 1 ? '' : 's'}` : ''}.` : 'No hay mensajes nuevos.', 5000); lista();
      return r.estado; } }, { clave: 'modal-39' });
}
function comoInstagram() { window.Ventanas.abrir('leads.comoInstagram', { alElegir: () => { closeModal(); $('#ldFileIg').click(); } }, { clave: 'modal-40' }); }
function importarInstagram(a) {
  const partes = [...new Set(a.conversaciones.flatMap((c) => c.participantes))];
  window.Ventanas.abrir('leads.importarInstagram', { conversaciones: a.conversaciones, dueno: a.dueno || null, participantes: partes,
    alImportar: async ({ hilos, dueno, cuenta, analizarIA }) => {
      const r = await api('leadsImportarInstagram', { token: a.token, hilos, dueno, cuenta, autorizado: true, autorizadoPor: await miNombre(), analizarIA });
      closeModal(); LD.filtro = 'todos'; if (r.primero) LD.sel = r.primero;
      toast(`Instagram: ${r.nuevos} lead${r.nuevos === 1 ? '' : 's'} nuevo${r.nuevos === 1 ? '' : 's'}${r.actualizados ? `, ${r.actualizados} actualizado${r.actualizados === 1 ? '' : 's'}` : ''} · ${r.mensajes} mensajes${r.analizados ? ` · ${r.analizados} leído${r.analizados === 1 ? '' : 's'} con IA` : ''}.`, 6000);
      if (r.errores?.length) toast('Algunas conversaciones no se pudieron leer con IA: ' + r.errores[0], 7000);
      abrir(LD.sel);
    } }, { clave: 'modal-41', ancho: true });
}
function dropFiles(paths) { const p = (paths || []).find((x) => /\.(txt|zip)$/i.test(x)); if (!p) return modalError('Arrastra el archivo .txt o .zip que genera WhatsApp al exportar un chat.'); importarRuta(p); }

pf.onAgentEvent?.((e) => { if (e?.type === 'datos' && e.que === 'leads' && !$('#view-leads').classList.contains('hidden')) lista(); });
window.Leads = { abrir, mostrar, dropFiles, importarRuta, cuentas, comoExportar, comoInstagram, derivar, eliminar, agregarMensajes, _LD: LD };
})();
