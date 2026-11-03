/* global pf, $, esc, toast, modal, closeModal, api, icon, ir, IM, cargar, fecha */
'use strict';
// Agenda de PortalFirma Asset: visitas, reuniones, firmas, llamadas y tareas. Las visitas generan su orden de visita
// (plantilla de la Notaría virtual) con un clic, igual que pidiéndoselo al Agente.
const AG = { rango: '14', tipo: '' };
const AG_TIPO = { visita: ['Visita', 'key'], reunion: ['Reunión', 'users'], firma: ['Firma', 'sign'], llamada: ['Llamada', 'phone'], tarea: ['Tarea', 'check'], otro: ['Evento', 'calendar'] };
const agISO = (d) => d.toISOString().slice(0, 10);
const agDia = (f) => { const d = new Date(f + 'T12:00:00'); const h = agISO(new Date()); const m = agISO(new Date(Date.now() + 864e5)); const t = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }); return (f === h ? 'Hoy · ' : f === m ? 'Mañana · ' : '') + t; };

async function abrirAgenda() {
  const tok = ir('agenda'); await cargar();
  // reservas del calendario de wechatia (si está conectado): llegan solas; al abrir la agenda se piden de nuevo
  if (!AG._sinc || Date.now() - AG._sinc > 60e3) { AG._sinc = Date.now(); pf.resEstado().then((r) => r.ok && r.data.conectado && pf.resSincronizar(null)).catch(() => {}); }
  const hoy = agISO(new Date()); const hasta = AG.rango === 'todo' ? undefined : agISO(new Date(Date.now() + Number(AG.rango) * 864e5));
  const l = (await api('agendaListar', { desde: AG.rango === 'todo' ? undefined : hoy, hasta, tipo: AG.tipo || undefined })).filter((e) => AG.rango === 'todo' || e.estado !== 'cancelado');
  if (tok !== IM.tok) return;
  const dias = [...new Set(l.map((e) => e.fecha))];
  const card = (e) => { const [t, ic] = AG_TIPO[e.tipo] || AG_TIPO.otro;
    return `<div class="ag-ev ${e.estado}" data-ev="${esc(e.id)}"><span class="ag-hr">${esc(e.hora || '—')}</span><span class="ag-ic t-${e.tipo}">${icon(ic, 16)}</span>
      <span class="ag-tx"><b>${esc(e.titulo)}</b><small>${[e.prop ? esc(e.prop.codigo) : '', esc(e.lugar || ''), e.personas.map((c) => esc(c.nombre)).join(', ')].filter(Boolean).join(' · ')}</small>
      ${e.tipo === 'visita' ? (e.orden?.operacion ? `<i class="ag-ord ok">${icon('check', 12)} Orden de visita · operación ${e.orden.operacion}</i>` : e.estado === 'programado' ? `<button class="ag-ord" data-orden="${esc(e.id)}">${icon('sign', 12)} Generar orden de visita</button>` : '') : ''}</span>
      <span class="ag-st">${e.estado === 'programado' ? `<button class="ghost small" data-hecho="${esc(e.id)}" title="Marcar como hecho">${icon('check', 15)}</button><button class="ghost small" data-repro="${esc(e.id)}" title="Reprogramar">${icon('clock', 15)}</button><button class="ghost small" data-canc="${esc(e.id)}" title="Cancelar">${icon('x', 15)}</button>` : `<span class="im-st ${e.estado === 'hecho' ? 'ok' : 'off'}">${e.estado === 'hecho' ? 'Hecho' : 'Cancelado'}</span>`}</span></div>`; };
  $('#view-agenda').innerHTML = `<div class="im-wrap">
    <div class="im-head fx-agenda"><div><h1>Agenda</h1><p class="muted">Visitas, reuniones, firmas y llamadas. También puedes pedírselo al Agente: «agenda una visita mañana a las 11 en CV-5514 con Ana».</p></div>
      <div class="row"><button class="secondary" id="agAsk">${icon('sparkle', 15)} Pedírselo al Agente</button><button class="primary" id="agNew">${icon('plus', 15)} Nuevo evento</button></div></div>
    <div class="im-bar"><div class="im-seg" id="agRango">${[['14', 'Próximos 14 días'], ['31', 'Próximo mes'], ['todo', 'Todo']].map(([k, v]) => `<button data-r="${k}" class="${AG.rango === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="im-seg" id="agTipo"><button data-t="" class="${!AG.tipo ? 'on' : ''}">Todo</button>${Object.entries(AG_TIPO).map(([k, [v]]) => `<button data-t="${k}" class="${AG.tipo === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
    ${dias.length ? dias.map((d) => `<section class="ag-day ${d === hoy ? 'hoy' : ''}"><h3>${esc(agDia(d))}</h3>${l.filter((e) => e.fecha === d).map(card).join('')}</section>`).join('')
      : `<div class="im-empty sm"><span class="im-eic">${icon('calendar', 30)}</span><p>No hay eventos en este rango. Crea uno o pídeselo al Agente.</p></div>`}</div>`;
  const host = $('#view-agenda');
  $('#agNew').onclick = () => nuevoEvento();
  $('#agAsk').onclick = () => window.members(() => { window.Agente.open(); const q = $('#agQ'); if (q) { q.value = 'Agenda una visita '; q.focus(); } }, 'El Agente trabaja con tu cuenta de Portalfirma. Inicia sesión para usarlo.');
  $('#agRango').onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) { AG.rango = b.dataset.r; abrirAgenda(); } };
  $('#agTipo').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { AG.tipo = b.dataset.t; abrirAgenda(); } };
  host.onclick = async (e) => {
    const b = e.target.closest('[data-hecho],[data-canc],[data-repro],[data-orden]'); if (!b) return;
    try {
      if (b.dataset.hecho) { await api('agendaActualizar', b.dataset.hecho, { estado: 'hecho' }); toast('Marcado como hecho.'); }
      else if (b.dataset.canc) { await api('agendaActualizar', b.dataset.canc, { estado: 'cancelado' }); toast('Evento cancelado.'); }
      else if (b.dataset.repro) return reprogramar(l.find((x) => x.id === b.dataset.repro));
      else if (b.dataset.orden) return ordenVisita(l.find((x) => x.id === b.dataset.orden));
      abrirAgenda();
    } catch (er) { toast(er.message, 5000); }
  };
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
function reprogramar(e) {
  modal(`<div class="im-form"><h2>Reprogramar</h2><p class="muted">${esc(e.titulo)}</p><span class="ng-inl"><input id="rpF" type="date" value="${esc(e.fecha)}" /><input id="rpH" type="time" value="${esc(e.hora || '')}" style="width:120px" /></span><p class="error" id="rpErr"></p>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Guardar</button></div></div>`);
  $('#mCancel').onclick = closeModal; $('#mOk').onclick = async () => { try { await api('agendaActualizar', e.id, { fecha: $('#rpF').value, hora: $('#rpH').value }); closeModal(); toast('Evento reprogramado.'); abrirAgenda(); } catch (er) { $('#rpErr').textContent = er.message; } };
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
