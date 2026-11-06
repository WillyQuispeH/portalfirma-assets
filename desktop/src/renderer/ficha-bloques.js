/* global api, closeModal, toast */
'use strict';
// 0.16.14 · «Ficha completa»: los ~130 datos de la propiedad en 5 bloques (lo esencial, portales, propietario y
// legal, equipamiento, visita y publicación). Cada pestaña muestra cuánto falta y marca lo CLAVE (sin eso no se
// avanza: por ejemplo el N° de departamento en un departamento). Lo marcado con ★ va a los portales.
// Los sí/no del equipamiento se marcan como fichas: lo que no se marca queda en «No».
// La ventana está en React (ui/components/functional/ventanas/inmo/FichaCompleta.tsx); aquí quedan abrirla y las
// llamadas para guardar y completar con texto dictado.
(() => {
const TIPOS = { casa: 'Casa', departamento: 'Departamento', oficina: 'Oficina', sitio: 'Sitio', local_comercial: 'Local comercial', industrial: 'Industrial', agricola: 'Agrícola', parcela: 'Parcela', estacionamiento: 'Estacionamiento', terreno_construccion: 'Terreno', bodega: 'Bodega' };

async function abrir(propId, { bloque = null, despues = null } = {}) {
  const fi = await api('inmoFicha', propId);
  window.Ventanas.abrir('inmo.fichaCompleta', {
    ficha: fi, tab: bloque || fi.siguiente || 'esencial', tipos: TIPOS,
    // guarda y devuelve la ficha recargada (si falla, la ventana muestra el error en #fbErr)
    alGuardar: async (o) => { await api('inmoPropGuardar', o); return api('inmoFicha', propId); },
    alListo: () => { closeModal(); despues?.(); toast('Ficha guardada.'); },
    alCompletar: async (t) => {
      const r = await api('inmoCompletarFicha', propId, t);
      toast(r.guardado.length ? `Guardado: ${r.guardado.slice(0, 6).join(', ')}${r.guardado.length > 6 ? ` y ${r.guardado.length - 6} más` : ''}.` : 'No encontré datos de la ficha en ese texto.');
      return r.ficha;
    },
    alCerrar: () => { closeModal(); despues?.(); },
  }, { clave: 'modal-20', ancho: true });
}
window.FichaBloques = { abrir };
})();
