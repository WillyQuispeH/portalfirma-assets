/* global pf, $, toast, closeModal, show, state, liberar */
'use strict';
// La carga masiva está en React: src/ui/components/functional/gestion/carga-masiva. Aquí quedan editar los
// firmantes de un documento, la confirmación del envío (saldo y correo del pagador) y la cola en vivo
// (pf.onBulk), que se le pasa a React como evento «pf:bulk».
(() => {
const estado = () => window.__estadoMasiva?.() || { cola: { items: [] }, cds: {} };
function open(tab) {
  if (!window.isMember()) return window.members(() => open(tab), 'La carga masiva es exclusiva para clientes de Portalfirma. Inicia sesión con tu cuenta.');
  show('bulk'); const el = $('#view-bulk');
  liberar(el); window.ReactUI.montar('GestionCargaMasiva', el, { tab });
}
pf.onBulk((st) => window.dispatchEvent(new CustomEvent('pf:bulk', { detail: st })));

// ventanas en React: src/ui/components/functional/gestion/carga-masiva/Ventanas.tsx
function editSigners(it) {
  window.Ventanas.abrir('gestion.masivaFirmantes', {
    nombre: it.name, tipo: it.typeDocument || '', firmantes: it.signers || [], requeridos: it.required || {},
    alGuardar: async (rows) => { closeModal(); await pf.bulkUpdate(it.id, { signers: rows }); },
    alUsarEnTodos: async (rows) => { closeModal(); await pf.bulkApplySigners(rows); toast('Firmantes aplicados a todos los documentos listos.'); },
  }, { clave: 'modal-42' });
}
async function confirmarEnvio(ids, opts) {
  const ready = estado().cola.items.filter((x) => ids.includes(x.id));
  const prefs = (await pf.prefs()).data || {};
  let bal = state.session?.balance; try { const b = await pf.balance(); if (b.ok) bal = b.data; } catch {}
  window.Ventanas.abrir('gestion.envioLote', {
    n: ready.length, saldo: bal, tramite: opts.protocolization, correo: prefs.payerEmail || '', idCorreo: 'bkPay', deAUna: true,
    alEnviar: async (email) => {
      pf.setPrefs({ payerEmail: email });
      const r = await pf.bulkSend(ready.map((x) => x.id), { email, ...opts });
      if (!r.ok) return toast(r.error, 5000);
      const sent = r.data.items.filter((x) => ready.some((y) => y.id === x.id) && x.status === 'sent').length;
      toast(`${sent} de ${ready.length} documento(s) enviados a firmar.`, 5000);
    },
  }, { clave: 'modal-43' });
}

window.Masiva = { open, editarFirmantes: editSigners, confirmarEnvio, get _bk() { return { st: estado().cola }; }, get _cds() { return estado().cds; } };
})();
