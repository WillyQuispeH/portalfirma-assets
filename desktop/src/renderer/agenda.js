/* global $, esc, toast, modal, closeModal, api, ir, IM, cargar */
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
  modal(`<div class="im-form"><h2>Nuevo evento</h2><div class="im-fg2">
    <label>Tipo<select id="evT">${Object.entries(AG_TIPO).map(([k, [v]]) => `<option value="${k}" ${(pre.tipo || 'visita') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Fecha y hora<span class="ng-inl"><input id="evF" type="date" value="${esc(pre.fecha || agISO(new Date(Date.now() + 864e5)))}" /><input id="evH" type="time" value="${esc(pre.hora || '11:00')}" style="width:120px" /></span></label>
    <label>Propiedad<select id="evP"><option value="">—</option>${props.map((p) => `<option value="${esc(p.id)}" ${pre.propId === p.id ? 'selected' : ''}>${esc(p.codigo)} · ${esc(p.titulo.slice(0, 40))}</option>`).join('')}</select></label>
    <label>Persona<select id="evC"><option value="">—</option>${pers.map((c) => `<option value="${esc(c.id)}" ${pre.personaId === c.id ? 'selected' : ''}>${esc(c.nombre)} · ${esc(c.rut)}</option>`).join('')}</select></label>
    <label>Duración (min)<input id="evD" type="number" value="45" /></label><label>Título <span class="muted">(opcional)</span><input id="evTi" /></label>
    <label class="s2" style="grid-column:1/-1">Notas<input id="evN" /></label></div><p class="error" id="evErr"></p>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Agendar</button></div></div>`);
  $('#modalCard').classList.add('im-wide'); $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async () => { try { await api('agendaCrear', { tipo: $('#evT').value, fecha: $('#evF').value, hora: $('#evH').value, propId: $('#evP').value || null, personaIds: $('#evC').value ? [$('#evC').value] : [], duracion: $('#evD').value, titulo: $('#evTi').value, notas: $('#evN').value }); closeModal(); toast('Evento agendado.'); despues ? despues() : abrirAgenda(); } catch (e) { $('#evErr').textContent = e.message; } };
}
// La misma herramienta que usa el Agente: revisa los datos, muestra qué se enviará y pide confirmar el cobro
async function ordenVisita(e, despues) {
  if (!e.prop) return toast('La visita no tiene propiedad.');
  if (!e.personas.length) return toast('Agrega al visitante: la orden la firma él.', 4000);
  const args = { propiedad: e.prop.id, visitante: e.personas[0].id, fecha: e.fecha, hora: e.hora || undefined };
  window.members(async () => {
    modal('<div class="im-form" style="text-align:center"><div class="spinner"></div><p class="muted">Preparando la orden de visita…</p></div>');
    let d; try { d = await api('assetPreparar', 'asset_orden_visita', args); } catch (er) { closeModal(); return toast(er.message, 6000); }
    modal(`<div class="im-form"><h2>${esc(d.titulo)}</h2><dl class="im-pidl">${d.detalle.map((x) => { const [k, ...v] = x.split(': '); return `<dt>${esc(k)}</dt><dd>${esc(v.join(': '))}</dd>`; }).join('')}</dl><p class="muted small">${esc(d.aviso || '')}</p>
      <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Generar y enviar a firmar</button></div></div>`);
    $('#mCancel').onclick = closeModal;
    $('#mOk').onclick = async () => { $('#mOk').disabled = true; $('#mOk').textContent = 'Enviando…'; try { const r = await api('assetEjecutar', 'asset_orden_visita', args); closeModal(); toast(`Orden de visita enviada a firmar: operación ${r.operacion}.`, 5000); despues ? despues(r) : abrirAgenda(); } catch (er) { closeModal(); toast(er.message, 6000); } };
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
