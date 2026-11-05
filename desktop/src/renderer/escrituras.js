/* global $, show */
'use strict';
// «Firmas presenciales» (trámites notariales) está en React: src/ui/components/functional/gestion/firmas-presenciales
// y src/ui/store/zustand/escritura.store.ts (trámite en preparación, revisión, notaría, pago y trámites enviados).
// El motor notarial sigue en notarial.js y materias.js (también corren en Node para las pruebas), y el panel de
// reglas en reglas-panel.js. Aquí queda la API de siempre, que usan el inicio, app.js (archivos soltados) y las pruebas.
(() => {
const R = () => window.__escrituras; // lo instala el bundle de React al cargar
async function open(tramite) {
  show('escrituras');
  window.ReactUI.montar('GestionFirmasPresenciales', $('#view-escrituras')); // el estado vive en el store: al volver sigue donde quedó
  await R().abrir(tramite);
}
window.Escrituras = {
  open,
  dropFiles: (paths) => R().soltar(paths),
  _escrituraPdf: (blocks) => R().escrituraPdf(blocks),
  _caratulaPdf: (d, adjuntos) => R().caratulaPdf(d, adjuntos),
};
Object.defineProperty(window.Escrituras, '_s', { get: () => R().estado() }); // el estado del store (pruebas)
})();
