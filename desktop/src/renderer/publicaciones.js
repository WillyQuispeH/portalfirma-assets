/* global $, api, toast, closeModal, IM, cargar, precio, ir, liberar */
'use strict';
// ============================================================================
// Publicaciones: la parte comercial, separada del resto de la gestión.
// Una propiedad → botón «Publicar» → 1. Calidad del aviso (con redacción por IA) → 2. Portales → 3. Publicar.
// Después: Avisos (rendimiento y recomendaciones de precio), Interesados (bandeja única) y Portales (conexiones).
// ============================================================================
(() => {
const host = () => $('#view-publicaciones');

// Las pestañas (Avisos, Interesados, Portales) y el flujo «Publicar» están en React: src/ui/components/functional/publicaciones.
// Aquí quedan sus formularios. Las dos pantallas usan el mismo contenedor: antes de montar una se desmonta la otra
// (liberar, en inmo.js). Se vuelven a montar al abrirlas, así los datos siempre están al día.
async function abrir(tab, filtro) {
  ir('publicaciones');
  liberar(host()); window.ReactUI.montar('Publicaciones', host(), { tab, filtro });
  try { await cargar(); } catch {} // IM.data para los formularios (ajustar precio, agregar interesado, visita)
}
// «Agendar visita» con un interesado: con la persona del CRM si ya existe (por id o por RUT)
function agendarVisita(l, despues) {
  window.Agenda.nuevo({ tipo: 'visita', propId: l.propId, personaId: l.personaId || (IM.data.personas.find((c) => c.rut && l.rut && c.rut === l.rut)?.id) || '' }, async () => { await despues(); abrir('interesados'); });
}

function ajustarPrecio(id, op) {
  const p = IM.data.propiedades.find((x) => x.id === id); const pr = op === 'venta' ? p.precioVenta : p.precioArriendo;
  window.Ventanas.abrir('leads.pubAjustarPrecio', { op, codigo: p.codigo, titulo: p.titulo, precioTxt: precio(pr), valor: pr.valor, moneda: pr.moneda,
    alGuardar: async (v) => { await api('inmoPropGuardar', { id, [op === 'venta' ? 'precioVenta' : 'precioArriendo']: { valor: v, moneda: pr.moneda } }); closeModal(); toast('Precio actualizado.'); abrir(); } }, { clave: 'modal-55' });
}

// ---------- interesados ----------
function agregarInteresado() {
  const props = IM.data.propiedades.filter((p) => !p.archivada);
  window.Ventanas.abrir('leads.pubAgregarInteresado', { propiedades: props.map((p) => ({ id: p.id, codigo: p.codigo, titulo: p.titulo })),
    alGuardar: async (propId, datos) => { await api('pubAgregarInteresado', propId, datos); closeModal(); toast('Interesado agregado.'); abrir('interesados', 'nuevo'); } }, { clave: 'modal-56', ancho: true });
}

// ---------- portales ----------
// «despues»: el flujo «Publicar» vuelve a calcular la calidad del aviso; sin él, se vuelve a la pestaña Portales
function contacto(c, despues) {
  window.Ventanas.abrir('leads.pubContacto', { contacto: c,
    alGuardar: async (x) => { await api('mlContacto', { ...x, web: c.web || '' }); closeModal(); toast('Contacto guardado.'); if (despues) despues(); else abrir('portales'); } }, { clave: 'modal-57', ancho: true });
}

// ---------- el flujo «Publicar» ----------
async function elegirPropiedad() {
  await cargar(); const props = IM.data.propiedades.filter((p) => !p.archivada);
  window.Ventanas.abrir('leads.pubElegirPropiedad', { propiedades: props.map((p) => ({ id: p.id, codigo: p.codigo, titulo: p.titulo, direccion: p.direccion, comuna: p.comuna, foto: (p.fotos || [])[0] || null })),
    alElegir: (id) => { closeModal(); publicar(id); } }, { clave: 'modal-58', ancho: true });
  setTimeout(() => $('#epQ')?.focus(), 30);
}
// El flujo está en React: src/ui/components/functional/publicaciones/publicar (calidad, portales y publicar).
// Aquí se valida que se pueda publicar y se monta en el mismo contenedor de las pestañas. paso 2: «Más portales».
async function publicar(propId, op, paso = 1) {
  await cargar(); const p = IM.data.propiedades.find((x) => x.id === propId); if (!p) return toast('La propiedad ya no está.');
  const ops = ['venta', 'arriendo'].filter((o) => p[o]); if (!ops.length) return toast('Marca la propiedad en venta o arriendo antes de publicar.', 5000);
  ir('publicaciones');
  liberar(host()); window.ReactUI.montar('PublicarAviso', host(), { propId, op: op && ops.includes(op) ? op : ops[0], ops, paso: paso === 2 ? 2 : 1 });
}

window.Publicaciones = { abrir, publicar, elegir: elegirPropiedad, ajustarPrecio, agregarInteresado, contacto, agendarVisita };
})();
