/* global $, ir */
'use strict';
// Pantalla «Actividad»: está en React (src/ui/components/functional/actividad/Actividad.tsx).
// Se vuelve a montar al abrirla, así los datos siempre están al día. La búsqueda y el filtro quedan en el store.
(() => {
function abrir() {
  ir('actividad');
  const el = $('#view-actividad'); window.ReactUI.desmontar(el); window.ReactUI.montar('Actividad', el);
}
window.Actividad = { abrir };
})();
