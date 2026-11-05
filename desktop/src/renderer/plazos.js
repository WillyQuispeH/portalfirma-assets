/* global pf, $, show, liberar */
'use strict';
// «Plazos y vencimientos» está en React (pantalla y motor de lectura): src/ui/components/functional/gestion/plazos
// y src/ui/store/zustand/plazo.store.ts. Aquí queda abrirla (también desde el menú nativo) y avisarle a React
// cuando se agregan documentos desde otra parte (un expediente, Google Drive): evento «pf:plazos».
(() => {
const P = () => window.__plazos || { estado: () => ({ items: [] }) };
function open() {
  if (!window.isMember()) return window.members(open, 'Plazos y vencimientos es exclusivo para clientes de Portalfirma.');
  show('plazos'); const el = $('#view-plazos');
  liberar(el); window.ReactUI.montar('GestionPlazos', el);
}
pf.onOpenPlazos(() => open());
const afterAdd = (r) => window.dispatchEvent(new CustomEvent('pf:plazos', { detail: r }));
window.Plazos = { open, afterAdd, get _p() { return P().estado(); }, _keyDate: (a) => P().fechaClave(a), _keyFor: (a) => P().fechaClaveDoc(a) };
})();
