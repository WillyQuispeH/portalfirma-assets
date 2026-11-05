/* global pf, $, esc, toast, modal, closeModal, show, state, liberar, pdfjsLib */
'use strict';
// «Flujos documentales» está en React: src/ui/components/functional/gestion/flujos y src/ui/store/zustand/flujo.store.ts.
// Aquí quedan: abrirla, el archivo soltado en la ventana (evento «pf:flujos-nomina»), la «Muestra» de un documento
// (dibuja el PDF con pdf.js en el modal) y la confirmación del envío (saldo y pagador). La cola en vivo llega a
// React por el evento «pf:bulk» (src/renderer/masiva.js).
(() => {
const F = () => window.__estadoFlujos?.() || { vista: 'home', w: null, cola: { items: [] } };
function open() {
  if (!window.isMember()) return window.members(open, 'Los flujos documentales envían documentos a firmar: son exclusivos para clientes de Portalfirma.');
  show('flujos'); const el = $('#view-flujos');
  liberar(el); window.ReactUI.montar('GestionFlujos', el);
}
// Archivo soltado en la ventana mientras se ve Flujos: React decide (solo sirve como nómina en el paso 2)
const dropFiles = (paths) => window.dispatchEvent(new CustomEvent('pf:flujos-nomina', { detail: paths[0] }));

async function muestra(spec, n) {
  modal('<h2>Muestra</h2><p class="muted"><i class="bk-spin"></i> Generando…</p>');
  const r = await pf.flujosSample({ ...spec, n }); if (!r.ok) { closeModal(); return toast(r.error, 5000); }
  const sig = r.data.signers.map((s) => `<li><b>${esc(s.alias)}</b>: ${esc(s.fullName || '—')} · ${esc(s.rut || 'sin RUT')} · ${esc(s.email || 'sin correo')}</li>`).join('');
  $('#modalCard').innerHTML = `<h2>Muestra · fila ${n + 2}</h2><div class="fl-pdf" id="flPdf"></div><h4>Firmantes</h4><ul class="fl-sig">${sig}</ul>
    <div class="actions"><button class="secondary" id="flOpenEd">Abrir en el editor</button><button class="primary" id="mCancel">Cerrar</button></div>`;
  $('#mCancel').onclick = closeModal;
  $('#flOpenEd').onclick = () => { closeModal(); window.editor.openPaths([r.data.file], true); };
  try {
    const doc = await pdfjsLib.getDocument({ data: r.data.bytes, isEvalSupported: false, standardFontDataUrl: 'vendor/standard_fonts/', cMapUrl: 'vendor/cmaps/', cMapPacked: true }).promise;
    for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
      const p = await doc.getPage(i); const vp = p.getViewport({ scale: 1.1 }); const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height; $('#flPdf')?.appendChild(c); await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
    doc.destroy();
  } catch {}
}

async function confirmarEnvio(ids, opts) {
  const prefs = (await pf.prefs()).data || {};
  let bal = state.session?.balance; try { const b = await pf.balance(); if (b.ok) bal = b.data; } catch {}
  modal(`<h2>Enviar ${ids.length} documento(s) a firmar</h2>
    <p>Se crearán <strong>${ids.length} operaciones</strong> en Portalfirma, una por documento. <strong>Cada envío descuenta saldo</strong> según el tipo de firma y el trámite.</p>
    <dl><dt>Saldo actual</dt><dd>${bal != null ? '$' + Number(bal).toLocaleString('es-CL') : '—'}</dd><dt>Trámite</dt><dd>${{ none: 'Solo firma electrónica', legalization: 'Legalizar', protocolization: 'Protocolizar' }[opts.protocolization || 'none']}</dd></dl>
    <label>Correo del pagador<input id="flPay" value="${esc(prefs.payerEmail || '')}" placeholder="pagos@empresa.cl" /></label>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Enviar ${ids.length}</button></div>`);
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async () => {
    const email = $('#flPay').value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('#flPay').classList.add('invalid'); return; }
    closeModal(); pf.setPrefs({ payerEmail: email });
    const r = await pf.bulkSend(ids, { email, protocolization: opts.protocolization || 'none', typeSign: opts.typeSign || 'simple' });
    if (!r.ok) return toast(r.error, 5000);
    window.dispatchEvent(new CustomEvent('pf:bulk', { detail: r.data }));
    const sent = ids.filter((id) => r.data.items.find((x) => x.id === id)?.status === 'sent').length;
    toast(`${sent} de ${ids.length} documento(s) enviados a firmar.`, 5000);
  };
}

window.Flujos = {
  open, dropFiles, muestra, confirmarEnvio,
  // lecturas y atajos para las pruebas (test/flujos-e2e.js), con los nombres de antes
  get _fl() { const s = F(); return { view: s.vista, bulk: s.cola, w: s.w && { step: s.w.paso, run: s.w.ejecucion, check: s.w.revision, mapping: s.w.reglas, nomina: s.w.nomina } }; },
  startWizard: (receta, paso) => F().asistenteIniciar?.(receta, paso),
  _setNomina: (n) => F().asistenteNomina?.(n),
  _go: (s) => F().asistenteIr?.(s),
};
})();
