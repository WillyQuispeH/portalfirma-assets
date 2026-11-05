/* global $, esc, icon, toast, modal, closeModal, pf */
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
  modal(`<h3>Adjuntar al agente</h3><div class="ag-pick"><button class="secondary with-ic" id="agDoc">${icon('file', 15)}<span>Documento abierto: «${esc(doc)}»</span></button><button class="secondary with-ic" id="agFile">${icon('folderOpen', 15)}<span>Elegir PDF o Word…</span></button></div><div class="row-end"><button class="ghost" id="agNo">Cancelar</button></div>`);
  $('#agNo').onclick = closeModal; $('#agFile').onclick = () => { closeModal(); elegir(); };
  $('#agDoc').onclick = async () => {
    closeModal(); let bytes; try { bytes = await window.editor.finalBytes(); } catch (e) { return toast('No se pudo preparar el documento: ' + (e.message || e), 4000); } if (!bytes) return;
    const name = /\.pdf$/i.test(doc) ? doc : doc.replace(/\.[^.]+$/, '') + '.pdf';
    window.Agente.adjuntarBytes(name, bytes);
  };
}
async function verTools() {
  const r = await pf.agentTools(); if (!r.ok) return toast(r.code === 'NEEDS_LOGIN' ? 'Inicia sesión en Portalfirma.' : r.error);
  modal(`<h3>Herramientas del Agente</h3><p class="muted small">El agente usa ${r.data.length} herramientas: las de PortalFirma Asset y las que publica hoy el servidor de Portalfirma. Si Portalfirma agrega nuevas, aparecen solas.</p>
    <div class="ag-tl">${r.data.map((t) => `<div><b>${esc(nombre(t.name))}</b><code>${esc(t.name)}</code><small>${esc((t.description || '').slice(0, 220))}</small></div>`).join('')}</div><div class="row-end"><button class="primary" id="agOk">Cerrar</button></div>`);
  $('#agOk').onclick = closeModal;
}
async function verLog() {
  const r = await pf.agentLog(); const l = r.ok ? r.data : [];
  modal(`<h3>Actividad del agente</h3><p class="muted small">Acciones realizadas en este computador (sin claves ni documentos).</p>
    <div class="ag-tl">${l.length ? l.map((x) => `<div class="${x.ok ? '' : 'bad'}"><b>${esc(x.resumen || nombre(x.tool))}</b><code>${esc(nombre(x.tool))}${x.action ? ' · ' + esc(x.action) : ''}</code><small>${new Date(x.t).toLocaleString('es-CL')}</small></div>`).join('') : '<p class="muted small">Todavía no hay actividad.</p>'}</div><div class="row-end"><button class="primary" id="agOk">Cerrar</button></div>`);
  $('#agOk').onclick = closeModal;
}

function renombrar(c) {
  modal(`<div class="im-form"><h2>Cambiar nombre</h2><input id="cvN" value="${esc(c.titulo || '')}" maxlength="80" /><p class="error" id="cvE"></p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Guardar</button></div></div>`);
  const ok = async () => { const r = await pf.convRenombrar(c.id, $('#cvN').value); if (!r.ok) { $('#cvE').textContent = r.error; return; } closeModal(); window.Agente.alCambiarConv(c.id, { titulo: r.data.titulo }); };
  $('#mCancel').onclick = closeModal; $('#mOk').onclick = ok; $('#cvN').onkeydown = (e) => { if (e.key === 'Enter') ok(); }; setTimeout(() => $('#cvN').select(), 30);
}
function borrarConv(c) {
  modal(`<div class="im-form"><h2>¿Eliminar la conversación?</h2><p>«${esc(c.titulo || 'Conversación')}» se borra de este computador. Lo que se hizo en ella (propiedades, negocios, agenda, firmas) no cambia.</p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Eliminar</button></div></div>`);
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async () => { await pf.convBorrar(c.id); closeModal(); window.Agente.alCambiarConv(c.id, { borrada: true }); toast('Conversación eliminada.'); };
}
async function claveIA() {
  const r = await pf.aiStatus?.(); const st = r?.ok ? r.data : {};
  modal(`<div class="im-form"><h2>${icon('lock', 18)} Clave de IA</h2>
    <p class="muted">Asset usa OpenAI para el Agente, Fernanda y la lectura de documentos. ${st.propia ? `Ahora usa una clave propia (termina en …${esc(st.keyEnd)}).` : st.managed ? 'Ahora usa la clave incluida con la app.' : st.keyEnd ? `Clave guardada: termina en …${esc(st.keyEnd)}.` : 'No hay clave.'}</p>
    <p class="muted small">Si OpenAI rechaza la clave, crea una nueva en platform.openai.com › API keys (con límite de gasto) y pégala aquí. Queda cifrada en este computador y reemplaza a la incluida.</p>
    <label>Nueva clave<input id="iaK" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…" /></label>
    <p class="error" id="iaErr"></p>
    <div class="actions">${st.propia ? '<button class="ghost" id="iaQuitar">Volver a la clave incluida</button>' : ''}<button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Guardar</button></div></div>`);
  $('#mCancel').onclick = closeModal;
  $('#iaQuitar')?.addEventListener('click', async () => { const x = await pf.aiConfig({ key: '' }); if (!x.ok) { $('#iaErr').textContent = x.error; return; } closeModal(); toast('Vuelve a usar la clave incluida.'); });
  $('#mOk').onclick = async () => { const k = $('#iaK').value.trim(); if (!k) { $('#iaErr').textContent = 'Pega la clave.'; return; }
    const x = await pf.aiConfig({ key: k }); $('#iaK').value = ''; if (!x.ok) { $('#iaErr').textContent = x.error; return; } closeModal(); toast('Clave de IA guardada de forma cifrada en este computador.'); };
}

window.AgenteModales = { adjuntar: adjuntarMenu, herramientas: verTools, actividad: verLog, renombrar, borrar: borrarConv, claveIA };
})();
