/* global pf, $, esc, icon, toast, modal, closeModal, show, state, liberar */
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

function editSigners(it) {
  let rows = (it.signers || []).map((s) => ({ ...s })); if (!rows.length) rows = [{ fullName: '', rut: '', email: '', phone: '', alias: '' }];
  const req = it.required || {};
  const draw = () => {
    $('#bkSig').innerHTML = rows.map((s, i) => `<div class="bk-sigrow" data-i="${i}"><b>${i + 1}</b>
      <input data-k="fullName" placeholder="Nombre completo${req.name ? ' *' : ''}" value="${esc(s.fullName)}" />
      <input data-k="rut" placeholder="RUT *" value="${esc(s.rut)}" />
      <input data-k="alias" placeholder="Rol * (arrendador…)" value="${esc(s.alias)}" />
      <input data-k="email" placeholder="Correo${req.email ? ' *' : ''}" value="${esc(s.email)}" />
      <input data-k="phone" placeholder="Teléfono${req.phone ? ' *' : ''}" value="${esc(s.phone)}" />
      <button class="ibtn danger" data-rm="${i}" title="Quitar">${icon('trash', 14)}</button></div>`).join('');
  };
  modal(`<h2>Firmantes de «${esc(it.name)}»</h2>${it.typeDocument ? `<p class="muted small">${esc(it.typeDocument)}</p>` : ''}
    <div id="bkSig" class="bk-sigs"></div><button class="ghost small" id="bkAdd">${icon('plus', 13)} Agregar firmante</button>
    <p class="muted small">El orden es el orden de firma.</p>
    <div class="actions"><button class="secondary" id="bkAll" title="Copiar estos firmantes a todos los documentos listos">Usar en todos</button><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Guardar</button></div>`);
  draw();
  $('#bkSig').oninput = (e) => { const r = e.target.closest('[data-i]'); if (r && e.target.dataset.k) rows[r.dataset.i][e.target.dataset.k] = e.target.value; };
  $('#bkSig').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { rows.splice(Number(b.dataset.rm), 1); draw(); } };
  $('#bkAdd').onclick = () => { rows.push({ fullName: '', rut: '', email: '', phone: '', alias: '' }); draw(); };
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async () => { closeModal(); await pf.bulkUpdate(it.id, { signers: rows }); };
  $('#bkAll').onclick = async () => { closeModal(); await pf.bulkApplySigners(rows); toast('Firmantes aplicados a todos los documentos listos.'); };
}
async function confirmarEnvio(ids, opts) {
  const ready = estado().cola.items.filter((x) => ids.includes(x.id));
  const prefs = (await pf.prefs()).data || {};
  let bal = state.session?.balance; try { const b = await pf.balance(); if (b.ok) bal = b.data; } catch {}
  modal(`<h2>Enviar ${ready.length} documento(s) a firmar</h2>
    <p>Se crearán <strong>${ready.length} operaciones</strong> en Portalfirma, una por documento, de a una. <strong>Cada envío descuenta saldo</strong> según el tipo de firma y el trámite.</p>
    <dl><dt>Saldo actual</dt><dd>${bal != null ? '$' + Number(bal).toLocaleString('es-CL') : '—'}</dd><dt>Trámite</dt><dd>${{ none: 'Solo firma electrónica', legalization: 'Legalizar', protocolization: 'Protocolizar' }[opts.protocolization]}</dd></dl>
    <label>Correo del pagador<input id="bkPay" value="${esc(prefs.payerEmail || '')}" placeholder="pagos@empresa.cl" /></label>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Enviar ${ready.length}</button></div>`);
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async () => {
    const email = $('#bkPay').value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('#bkPay').classList.add('invalid'); return; }
    closeModal(); pf.setPrefs({ payerEmail: email });
    const r = await pf.bulkSend(ready.map((x) => x.id), { email, ...opts });
    if (!r.ok) return toast(r.error, 5000);
    const sent = r.data.items.filter((x) => ready.some((y) => y.id === x.id) && x.status === 'sent').length;
    toast(`${sent} de ${ready.length} documento(s) enviados a firmar.`, 5000);
  };
}

window.Masiva = { open, editarFirmantes: editSigners, confirmarEnvio, get _bk() { return { st: estado().cola }; }, get _cds() { return estado().cds; } };
})();
