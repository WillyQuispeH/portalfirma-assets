/* global pf, $, toast, closeModal, show, state, liberar, pdfjsLib */
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
  // ventana en React: src/ui/components/functional/gestion/flujos/VentanasAntiguas.tsx (las páginas se dibujan aquí, en #flPdf)
  window.Ventanas.abrir('gestion.flujosMuestra', {}, { clave: 'modal-21' });
  const r = await pf.flujosSample({ ...spec, n }); if (!r.ok) { closeModal(); return toast(r.error, 5000); }
  window.Ventanas.abrir('gestion.flujosMuestra', { fila: n + 2, firmantes: r.data.signers, alAbrirEditor: () => { closeModal(); window.editor.openPaths([r.data.file], true); } }, { clave: 'modal-21' });
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
  // ventana en React: src/ui/components/functional/gestion/carga-masiva/Ventanas.tsx (ConfirmarEnvioLote)
  window.Ventanas.abrir('gestion.envioLote', {
    n: ids.length, saldo: bal, tramite: opts.protocolization || 'none', correo: prefs.payerEmail || '', idCorreo: 'flPay',
    alEnviar: async (email) => {
      pf.setPrefs({ payerEmail: email });
      const r = await pf.bulkSend(ids, { email, protocolization: opts.protocolization || 'none', typeSign: opts.typeSign || 'simple' });
      if (!r.ok) return toast(r.error, 5000);
      window.dispatchEvent(new CustomEvent('pf:bulk', { detail: r.data }));
      const sent = ids.filter((id) => r.data.items.find((x) => x.id === id)?.status === 'sent').length;
      toast(`${sent} de ${ids.length} documento(s) enviados a firmar.`, 5000);
    },
  }, { clave: 'modal-22' });
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
