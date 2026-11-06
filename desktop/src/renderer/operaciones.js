/* global pf, $, toast, closeModal, show, liberar */
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

// ventanas en React: src/ui/components/functional/gestion/operaciones/Ventanas.tsx
function askPhone(prefill = '') {
  window.Ventanas.abrir('gestion.opsTelefono', {
    inicial: prefill,
    alCancelar: () => { closeModal(); if (!estado().items.length) window.studio.goHome(); },
    alEnviar: async (tel) => { const r = await pf.opsSetPhone(tel); if (!r.ok) return toast(r.error, 4000); closeModal(); openOps(); },
  }, { clave: 'modal-50' });
}
function fileErr(r, retry) {
  if (r.code === 'NO_FILE_KEY') return askKey(retry);
  window.Ventanas.abrir('gestion.opsErrorArchivo', { error: r.error, alIr: () => { closeModal(); pf.openUrl('https://cliente.portalfirma.cl/'); } }, { clave: 'modal-51' });
}
// Código de acceso al servicio de archivos de Portalfirma (lo entrega Portalfirma; queda cifrado en este equipo)
function askKey(after) {
  window.Ventanas.abrir('gestion.opsAcceso', {
    alGuardar: async (codigo) => { const r = await pf.opsSetFileKey(codigo); if (!r.ok) return r.error; closeModal(); toast('Acceso guardado'); after?.(); },
  }, { clave: 'modal-52' });
}
window.Operaciones = { open: () => openOps(), select, askKey, get _ops() { return estado(); } };
window.OperacionesModales = { telefono, acceso: askKey, errorArchivo: (r) => fileErr(r), iniciarSesion };
// 0.16.25 · cuando el seguimiento automático detecta firmas, la lista se actualiza sola
pf.onAgentEvent?.((e) => { if (e?.type === 'datos' && e.que === 'operaciones' && !$('#view-ops')?.classList.contains('hidden')) window.dispatchEvent(new CustomEvent('pf:operaciones', { detail: { op: e.op } })); });
})();
