/* global $, toast, closeModal, api, ir, IM, cargar */
'use strict';
// Agenda de PortalFirma Asset: visitas, reuniones, firmas, llamadas y tareas. Las visitas generan su orden de visita
// (plantilla de la Notaría virtual) con un clic, igual que pidiéndoselo al Agente.
// La lista de la agenda está en React: src/ui/components/functional/agenda/Agenda.tsx.
// Aquí quedan los formularios que también usan Publicaciones, el Agente y el Lienzo (nuevo evento y orden de visita).
const AG_TIPO = { visita: ['Visita', 'key'], reunion: ['Reunión', 'users'], firma: ['Firma', 'sign'], llamada: ['Llamada', 'phone'], tarea: ['Tarea', 'check'], otro: ['Evento', 'calendar'] };
const agISO = (d) => d.toISOString().slice(0, 10);

// Se vuelve a montar al abrirla, así los datos siempre están al día. Los filtros quedan en el store.
async function abrirAgenda() {
  ir('agenda');
  const el = $('#view-agenda'); window.ReactUI.desmontar(el); window.ReactUI.montar('Agenda', el);
  try { await cargar(); } catch {} // la cartera y las personas para el formulario «Nuevo evento»
}
function nuevoEvento(pre = {}, despues) {
  const props = IM.data.propiedades.filter((p) => !p.archivada); const pers = [...IM.data.personas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  window.Ventanas.abrir('negocios.agendaNuevo', {
    tipos: Object.entries(AG_TIPO).map(([k, [v]]) => [k, v]),
    propiedades: props.map((p) => [p.id, `${p.codigo} · ${p.titulo.slice(0, 40)}`]),
    personas: pers.map((c) => [c.id, `${c.nombre} · ${c.rut}`]),
    tipo: AG_TIPO[pre.tipo] ? pre.tipo : 'visita', fecha: pre.fecha || agISO(new Date(Date.now() + 864e5)), hora: pre.hora || '11:00',
    propId: props.some((p) => p.id === pre.propId) ? pre.propId : '', personaId: pers.some((c) => c.id === pre.personaId) ? pre.personaId : '',
    // si falla, la ventana muestra el error (antes, #evErr)
    alGuardar: async (v) => { await api('agendaCrear', { tipo: v.tipo, fecha: v.fecha, hora: v.hora, propId: v.propId || null, personaIds: v.personaId ? [v.personaId] : [], duracion: v.duracion, titulo: v.titulo, notas: v.notas }); closeModal(); toast('Evento agendado.'); despues ? despues() : abrirAgenda(); },
  }, { clave: 'modal-1', ancho: true });
}
// La misma herramienta que usa el Agente: revisa los datos, muestra qué se enviará y pide confirmar el cobro
async function ordenVisita(e, despues) {
  if (!e.prop) return toast('La visita no tiene propiedad.');
  if (!e.personas.length) return toast('Agrega al visitante: la orden la firma él.', 4000);
  const args = { propiedad: e.prop.id, visitante: e.personas[0].id, fecha: e.fecha, hora: e.hora || undefined };
  window.members(async () => {
    window.Ventanas.abrir('negocios.agendaPreparandoOrden', {}, { clave: 'modal-2' });
    let d; try { d = await api('assetPreparar', 'asset_orden_visita', args); } catch (er) { closeModal(); return toast(er.message, 6000); }
    window.Ventanas.abrir('negocios.agendaOrdenVisita', {
      titulo: d.titulo, detalle: d.detalle, aviso: d.aviso || '',
      alConfirmar: async () => { try { const r = await api('assetEjecutar', 'asset_orden_visita', args); closeModal(); toast(`Orden de visita enviada a firmar: operación ${r.operacion}.`, 5000); despues ? despues(r) : abrirAgenda(); } catch (er) { closeModal(); toast(er.message, 6000); } },
    }, { clave: 'modal-3' });
  }, 'Para generar la orden de visita, inicia sesión con tu cuenta de Portalfirma.');
}

// Navegación y refresco pedidos por el Agente
window.AssetNav = (pantalla, id) => ({
  inicio: () => window.Inmo.inicio(), cartera: () => window.Inmo.cartera(), propiedad: () => window.Inmo.abrirFicha(id), personas: () => window.Inmo.personas(), persona: () => window.Inmo.abrirPersona(id),
  negocios: () => window.Negocios.abrir(), publicaciones: () => window.Publicaciones.abrir(), publicar: () => window.Publicaciones.publicar(id), negocio: () => window.Negocios.abrirNegocio(id), agenda: () => abrirAgenda(), portales: () => window.Inmo.portales(), aprende: () => window.Aprende.abrir(), documental: () => window.studio.goHome(),
}[pantalla] || (() => {}))();
window.AssetRefrescar = () => {
  const vis = (v) => !$('#view-' + v)?.classList.contains('hidden'); const IMs = window.Inmo._IM; const NG = window.Negocios._NG;
  if (document.querySelector('#modal:not(.hidden)')) return; // no se interrumpe un formulario abierto
  if (vis('inicio')) return window.Inmo.inicio();
  if (vis('cartera')) return IMs.ficha ? window.Inmo.abrirFicha(IMs.ficha) : $('#coWa') ? window.Inmo.portales() : window.Inmo.cartera();
  if (vis('personas')) return IMs.persona ? window.Inmo.abrirPersona(IMs.persona) : window.Inmo.personas();
  if (vis('negocios')) return NG.actual ? window.Negocios.abrirNegocio(NG.actual) : window.Negocios.abrir();
  if (vis('agenda')) return abrirAgenda();
};
window.Agenda = { abrir: abrirAgenda, nuevo: nuevoEvento, ordenVisita };
