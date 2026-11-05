/* global pf, $, esc, icon, toast, modal, closeModal, show, liberar */
'use strict';
// «Mis operaciones» está en React: src/ui/components/functional/gestion/operaciones. Aquí quedan los formularios
// (teléfono de la cuenta, código de acceso a los documentos, error del archivo), el inicio de sesión y el aviso
// del seguimiento automático, que se le pasa a React como evento «pf:operaciones».
(() => {
const estado = () => window.__estadoOperaciones?.() || { items: [], prefetching: false };
function openOps(sel) {
  show('ops'); const el = $('#view-ops');
  liberar(el); window.ReactUI.montar('GestionOperaciones', el, { sel: sel || null });
  return Promise.resolve();
}
const select = (n) => openOps(n);
function iniciarSesion() { window.ApiDiag.login(() => openOps(), 'Para traer las operaciones de tu cuenta, inicia sesión con el correo y la contraseña de Portalfirma.'); }
async function telefono(cambiar) { askPhone(cambiar ? (await pf.opsStatus()).data?.phone || '' : ''); }

function askPhone(prefill = '') {
  modal(`<h2>${icon('listCheck', 18)} Tus operaciones de Portalfirma</h2>
    <p>Para traer las operaciones de tu cuenta, escribe el <strong>teléfono con el que te registraste en Portalfirma</strong>. Se guarda en este computador.</p>
    <label>Teléfono<input id="opPhone" value="${esc(prefill)}" placeholder="9 1234 5678" inputmode="tel" /></label>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Traer mis operaciones</button></div>`);
  $('#mCancel').onclick = () => { closeModal(); if (!estado().items.length) window.studio.goHome(); };
  const go = async () => { const r = await pf.opsSetPhone($('#opPhone').value); if (!r.ok) return toast(r.error, 4000); closeModal(); openOps(); };
  $('#mOk').onclick = go; $('#opPhone').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  setTimeout(() => $('#opPhone')?.focus(), 30);
}
function fileErr(r, retry) {
  if (r.code === 'NO_FILE_KEY') return askKey(retry);
  modal(`<h2>No se pudo obtener el documento</h2><p>${esc(r.error)}</p>
    <div class="actions"><button class="secondary" id="mCancel">Cerrar</button><button class="primary" id="mOk">Ir a mis contratos en Portalfirma</button></div>`);
  $('#mCancel').onclick = closeModal; $('#mOk').onclick = () => { closeModal(); pf.openUrl('https://cliente.portalfirma.cl/'); };
}
// Código de acceso al servicio de archivos de Portalfirma (lo entrega Portalfirma; queda cifrado en este equipo)
function askKey(after) {
  modal(`<h2>Acceso a los documentos</h2><p>Para mostrar los PDF, la app usa el servicio oficial de archivos de Portalfirma. Ingresa el código de acceso que te entregó Portalfirma.</p>
    <label>Código de acceso<input id="fkVal" type="password" autocomplete="off" spellcheck="false"></label><p class="error small" id="fkErr"></p>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Guardar</button></div>`);
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async () => { const r = await pf.opsSetFileKey($('#fkVal').value); if (!r.ok) { $('#fkErr').textContent = r.error; return; } closeModal(); toast('Acceso guardado'); after?.(); };
}
window.Operaciones = { open: () => openOps(), select, askKey, get _ops() { return estado(); } };
window.OperacionesModales = { telefono, acceso: askKey, errorArchivo: (r) => fileErr(r), iniciarSesion };
// 0.16.25 · cuando el seguimiento automático detecta firmas, la lista se actualiza sola
pf.onAgentEvent?.((e) => { if (e?.type === 'datos' && e.que === 'operaciones' && !$('#view-ops')?.classList.contains('hidden')) window.dispatchEvent(new CustomEvent('pf:operaciones', { detail: { op: e.op } })); });
})();
