/* global toast, closeModal, pf */
'use strict';
// El Agente (chat, conversaciones, eventos, window.Agente) está en React: src/ui/components/functional/agente.
// Aquí quedan sus formularios en ventana: adjuntar el documento abierto, lo que puede hacer, la actividad,
// renombrar o borrar una conversación y la clave de IA. Se llaman desde React como window.AgenteModales.
(() => {
const nombre = (n) => window.Agente?.nombreHerramienta?.(n) || n.replace(/_/g, ' ');
const elegir = () => window.Agente.elegirArchivo();

async function adjuntarMenu() {
  const doc = window.editor?.docName?.();
  if (!doc) return elegir();
  window.Ventanas.abrir('agente.adjuntar', {
    doc,
    alArchivo: () => { closeModal(); elegir(); },
    alDocumento: async () => {
      closeModal(); let bytes; try { bytes = await window.editor.finalBytes(); } catch (e) { return toast('No se pudo preparar el documento: ' + (e.message || e), 4000); } if (!bytes) return;
      const name = /\.pdf$/i.test(doc) ? doc : doc.replace(/\.[^.]+$/, '') + '.pdf';
      window.Agente.adjuntarBytes(name, bytes);
    },
  }, { clave: 'modal-4' });
}
async function verTools() {
  const r = await pf.agentTools(); if (!r.ok) return toast(r.code === 'NEEDS_LOGIN' ? 'Inicia sesión en Portalfirma.' : r.error);
  window.Ventanas.abrir('agente.herramientas', { herramientas: r.data.map((t) => ({ nombre: nombre(t.name), id: t.name, descripcion: (t.description || '').slice(0, 220) })) }, { clave: 'modal-5' });
}
async function verLog() {
  const r = await pf.agentLog(); const l = r.ok ? r.data : [];
  window.Ventanas.abrir('agente.actividad', { acciones: l.map((x) => ({ ok: !!x.ok, titulo: x.resumen || nombre(x.tool), detalle: nombre(x.tool) + (x.action ? ' · ' + x.action : ''), fecha: new Date(x.t).toLocaleString('es-CL') })) }, { clave: 'modal-6' });
}

function renombrar(c) {
  window.Ventanas.abrir('agente.renombrar', {
    titulo: c.titulo || '',
    alGuardar: async (valor) => { const r = await pf.convRenombrar(c.id, valor); if (!r.ok) return r.error; closeModal(); window.Agente.alCambiarConv(c.id, { titulo: r.data.titulo }); },
  }, { clave: 'modal-7' });
}
function borrarConv(c) {
  window.Ventanas.abrir('agente.borrarConversacion', {
    titulo: c.titulo || 'Conversación',
    alConfirmar: async () => { await pf.convBorrar(c.id); closeModal(); window.Agente.alCambiarConv(c.id, { borrada: true }); toast('Conversación eliminada.'); },
  }, { clave: 'modal-8' });
}
async function claveIA() {
  const r = await pf.aiStatus?.(); const st = r?.ok ? r.data : {};
  window.Ventanas.abrir('agente.claveIA', {
    propia: !!st.propia, incluida: !!st.managed, termina: st.keyEnd || '',
    alQuitar: async () => { const x = await pf.aiConfig({ key: '' }); if (!x.ok) return x.error; closeModal(); toast('Vuelve a usar la clave incluida.'); },
    alGuardar: async (k) => { const x = await pf.aiConfig({ key: k }); if (!x.ok) return x.error; closeModal(); toast('Clave de IA guardada de forma cifrada en este computador.'); },
  }, { clave: 'modal-9' });
}

window.AgenteModales = { adjuntar: adjuntarMenu, herramientas: verTools, actividad: verLog, renombrar, borrar: borrarConv, claveIA };
})();
