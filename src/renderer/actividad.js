/* global $, api, esc, icon, ir */
'use strict';
// Pantalla «Actividad»: todo lo que pasó en la cartera, agrupado por día, con búsqueda y filtros.
// (Antes crecía como una lista larga dentro del Inicio.)
(() => {
const A = { q: '', clase: '', desde: 0, items: [], total: 0 };
const CLASES = [['', 'Todo'], ['propiedad', 'Propiedades'], ['negocio', 'Negocios'], ['persona', 'Personas'], ['agenda', 'Agenda'], ['nota', 'Notas']];
const ICO = { propiedad: 'house', negocio: 'briefcase', persona: 'user', agenda: 'calendar', otro: 'clock' };
const dia = (iso) => { const d = new Date(iso); const h = new Date(); const dd = Math.floor((new Date(h.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (dd <= 0) return 'Hoy'; if (dd === 1) return 'Ayer'; const t = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }); return t[0].toUpperCase() + t.slice(1); };
const hora = (iso) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

async function cargarMas(reset) {
  if (reset) { A.desde = 0; A.items = []; }
  const r = await api('inmoActividadTodas', { q: A.q, clase: A.clase, desde: A.desde, limite: 60 });
  A.items = A.items.concat(r.items); A.total = r.total; A.desde = A.items.length; pintarLista();
}
function pintarLista() {
  const h = $('#acLista'); if (!h) return; let g0 = '';
  h.innerHTML = A.items.length ? A.items.map((a) => { const g = dia(a.fecha); const t = g !== g0 ? `<h4 class="ac-dia">${esc(g)}</h4>` : ''; g0 = g;
    return `${t}<button class="ac-it ${a.nota ? 'nota' : ''}" data-clase="${esc(a.clase)}" data-ir="${esc(a.ir || '')}"><span class="ac-ic ${esc(a.clase)}">${icon(a.nota ? 'edit' : ICO[a.clase] || 'clock', 14)}</span><span class="ac-tx"><b>${esc(a.texto)}</b>${a.nombre ? `<small>${esc(a.nombre)}</small>` : ''}</span><time>${esc(hora(a.fecha))}</time></button>`; }).join('')
    : `<p class="muted ac-vac">${A.q || A.clase ? 'Nada coincide con el filtro.' : 'Aún no hay actividad.'}</p>`;
  $('#acMas').classList.toggle('hidden', A.items.length >= A.total);
  $('#acCont').textContent = A.total ? `${A.total} ${A.total === 1 ? 'movimiento' : 'movimientos'}` : '';
}
async function abrir() {
  ir('actividad');
  $('#view-actividad').innerHTML = `<div class="im-wrap ac-wrap">
    <div class="ac-h"><button class="ghost" id="acVolver">${icon('chevL', 16)} Inicio</button><div><h1>Actividad</h1><small id="acCont"></small></div></div>
    <div class="ac-fil"><label class="ac-q">${icon('search', 15)}<input id="acQ" placeholder="Buscar por propiedad, cliente o acción" spellcheck="false" value="${esc(A.q)}" /></label>
      <div class="ga-chips" id="acCl">${CLASES.map(([k, t]) => `<button data-c="${k}" class="${A.clase === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
    <div class="im-box ac-box"><div id="acLista"></div><button class="secondary hidden" id="acMas">Ver más</button></div></div>`;
  $('#acVolver').onclick = () => window.Inmo.inicio();
  $('#acQ').oninput = (e) => { A.q = e.target.value; clearTimeout(A._t); A._t = setTimeout(() => cargarMas(true), 220); };
  $('#acCl').querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { A.clase = b.dataset.c; $('#acCl').querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); cargarMas(true); }));
  $('#acMas').onclick = () => cargarMas(false);
  $('#acLista').onclick = (e) => {
    const b = e.target.closest('[data-ir]'); if (!b || !b.dataset.ir) return; const id = b.dataset.ir; const c = b.dataset.clase;
    if (c === 'propiedad') return window.Inmo.abrirFicha(id); if (c === 'persona') return window.Inmo.abrirPersona(id);
    if (c === 'negocio') return window.Negocios.abrirNegocio(id); if (c === 'agenda') return window.Agenda.abrir();
  };
  await cargarMas(true);
}
window.Actividad = { abrir };
})();
