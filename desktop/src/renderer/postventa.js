/* global $, api, esc, icon, toast, closeModal, ir, pf, liberar */
'use strict';
// Postventa (MVP): reclamos de propietarios con su garantía legal, atención por WhatsApp (vía wechatia),
// unidades entregadas (carga desde Excel) y contratistas. Cada paso es guiado: «¿Qué sigue?» según el estado.
(() => {
const PV = { sel: null }; // el reclamo que se muestra en #pvDet; la pestaña y los filtros están en el store de React
const PASOS = [['triage', 'Por revisar'], ['visita', 'Diagnóstico'], ['orden', 'Contratista'], ['reparacion', 'Reparación'], ['validacion', 'Validación'], ['cerrado', 'Cerrado']];
const TIPOS = [['terminacion', 'Terminaciones (3 años)'], ['instalacion', 'Instalaciones (5 años)'], ['estructura', 'Estructura (10 años)'], ['otro', 'Otro (5 años)']];
const fmt = (f) => (f ? f.split('-').reverse().join('/') : '—');
const hoy = () => { const d = new Date(Date.now() + 864e5); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const gBadge = (g) => (g.vigente === true ? `<i class="pv-g ok">${icon('check', 11)} Garantía ${esc(g.txt)}</i>` : g.vigente === false ? `<i class="pv-g no">Garantía ${esc(g.txt)}</i>` : `<i class="pv-g">${esc(g.txt)}</i>`);
const hora = (f) => { if (!f) return ''; try { return new Date(f).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const burbujas = (ms) => `<div class="pv-chat real">${ms.map((m) => `<p class="${m.dir === 'out' ? 'out' : 'in'}">${esc(m.texto || '').replace(/\n/g, '<br>')}${(m.fotos || []).map((f) => `<a href="#" data-url="${esc(f)}"><img src="${esc(f)}" alt="" loading="lazy" /></a>`).join('')}<small>${esc(hora(m.fecha))}</small></p>`).join('')}</div>`;
const estBadge = (r) => `<i class="pv-e ${esc(r.estado)}">${esc(r.estadoTxt)}</i>`;

// La pantalla (encabezado, pestañas, lista de reclamos, unidades, WhatsApp, asistente, contratistas) está en React:
// src/ui/components/functional/postventa. Aquí queda el detalle del reclamo con su «¿Qué sigue?» (en #pvDet, que
// React deja vacío) y los formularios «Nuevo reclamo» y «Nuevo contratista».
function abrir(tab) {
  ir('postventa'); const el = $('#view-postventa');
  liberar(el); window.ReactUI.montar('Postventa', el, { tab });
}
// React → aquí: el reclamo elegido (o ninguno)
function mostrar(sel) { PV.sel = sel; if (sel) detalle(); else if ($('#pvDet')) $('#pvDet').innerHTML = ''; }
// aquí → React: recargar (con la pestaña, el elegido o el filtro que se fijen aquí, p. ej. al crear un reclamo)
function recargar(o = {}) { window.dispatchEvent(new CustomEvent('pf:postventa', { detail: o })); }

function verChat(c) {
  const h = $('#pvDet'); if (!h || !c) return;
  h.innerHTML = `<div class="pv-dh"><div><small>${icon('whatsapp', 12)} Conversación en curso · ${esc(hora(c.actualizado))}</small><h2>${esc(c.nombre || 'Contacto')}</h2><p>${icon('user', 13)} ${esc(c.telefono || '')}${c.unidad ? `<br>${icon('house', 13)} ${esc(c.unidad)}` : ''}</p></div><i class="pv-e conv">${esc(c.pasoTxt)}</i></div>
    <p class="muted small">El asistente está atendiendo. El reclamo se crea solo cuando el propietario termina (manda las fotos o escribe «sin fotos»).</p>${burbujas(c.mensajes)}`;
  h.querySelectorAll('[data-url]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); pf.openUrl(a.dataset.url); }));
}
async function detalle() {
  const h = $('#pvDet'); if (!h) return; const pedido = PV.sel; let r; try { r = await api('pvObtener', pedido); } catch { h.innerHTML = ''; return; }
  if (!h.isConnected || PV.sel !== pedido) return; // se cambió de pestaña o de reclamo mientras llegaba
  const i0 = PASOS.findIndex(([k]) => k === r.estado); const p = r.unidad?.propietario || r.contacto || {};
  h.innerHTML = `<div class="pv-dh"><div><small>${r.canal === 'whatsapp' ? `${icon('whatsapp', 12)} Llegó por WhatsApp` : 'Creado en Asset'} · ${new Date(r.creado).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</small><h2>${esc(r.folio)} ${r.urgente ? '<i class="pv-urg">Urgente</i>' : ''}</h2>
      <p>${icon('house', 13)} ${esc(r.unidad?.nombre || 'Sin unidad asignada')}<br>${icon('user', 13)} ${esc(p.nombre || '—')}${p.telefono ? ' · ' + esc(p.telefono) : ''}</p></div>${estBadge(r)}</div>
    ${!r.unidad ? `<div class="pv-box warn"><b>Asigna la unidad</b> para calcular la garantía.<span class="ga-inl"><select id="pvUni"><option value="">Elegir unidad…</option></select><button class="secondary small" id="pvUniOk">Asignar</button></span></div>` : ''}
    ${r.estado !== 'no_procede' ? `<ol class="pv-steps">${PASOS.map(([k, t], i) => `<li class="${i < i0 ? 'h' : i === i0 ? 'a' : ''}"><span>${i < i0 ? icon('check', 11) : i + 1}</span>${t}</li>`).join('')}</ol>` : `<div class="pv-box">${icon('x', 13)} <b>No procede:</b> ${esc(r.motivo || '')}</div>`}
    <div class="pv-guia" id="pvGuia"></div>
    <h4 class="pv-sub">Fallas reportadas</h4>
    ${r.items.map((it) => `<div class="pv-item" data-it="${esc(it.id)}"><p>${esc(it.descripcion)}</p>
      ${it.fotos?.length ? `<div class="pv-fotos">${it.fotos.map((f) => `<a href="#" data-url="${esc(f)}"><img src="${esc(f)}" alt="" loading="lazy" /></a>`).join('')}</div>` : '<small class="muted">Sin fotos</small>'}
      <div class="pv-cls"><select data-tipo>${TIPOS.map(([k, t]) => `<option value="${k}" ${it.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select><input data-rec value="${esc(it.recinto || '')}" placeholder="Recinto" />
        ${it.auto ? `<button class="secondary small" data-conf>${icon('check', 13)} Confirmar clasificación</button><small class="muted">Propuesta automática</small>` : `<small class="pv-okc">${icon('check', 12)} Confirmada</small>`}</div>
      ${gBadge(it.garantia)}</div>`).join('')}
    ${r.encuesta?.nota ? `<p class="pv-enc">${icon('check', 13)} Satisfacción del propietario: <b>${r.encuesta.nota}/5</b></p>` : ''}
    ${r.conversacion?.length ? `<details class="lz-det pv-hist"><summary><h4>${icon('whatsapp', 13)} Conversación por WhatsApp <i class="muted">(${r.conversacion.length})</i></h4><span class="lz-dl">${esc(String(r.conversacion.at(-1)?.texto || '').slice(0, 80))}</span>${icon('chevD', 14)}</summary>${burbujas(r.conversacion)}</details>` : ''}
    <details class="lz-det pv-hist"><summary><h4>${icon('clock', 13)} Historial <i class="muted">(${r.historial.length})</i></h4><span class="lz-dl">${esc(r.historial[0]?.texto || '')}</span>${icon('chevD', 14)}</summary>
      <ul class="lz-hist">${r.historial.map((x) => `<li><small>${new Date(x.fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</small><span>${esc(x.texto)}</span></li>`).join('')}</ul></details>`;
  h.querySelectorAll('[data-url]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); pf.openUrl(a.dataset.url); }));
  h.querySelectorAll('[data-it]').forEach((row) => { const b = row.querySelector('[data-conf]'); const guardar = async () => { try { await api('pvItem', r.id, row.dataset.it, { tipo: row.querySelector('[data-tipo]').value, recinto: row.querySelector('[data-rec]').value.trim() || null }); detalle(); } catch (e) { toast(e.message, 4000); } };
    if (b) b.onclick = guardar; row.querySelector('[data-tipo]').onchange = guardar; });
  if (!r.unidad) { const us = await api('pvUnidades').catch(() => []); if (!$('#pvUni')) return; $('#pvUni').insertAdjacentHTML('beforeend', us.map((u) => `<option value="${esc(u.id)}">${esc(u.nombre)} · ${esc(u.propietario?.nombre || '')}</option>`).join(''));
    $('#pvUniOk').onclick = async () => { const v = $('#pvUni').value; if (!v) return; await api('pvUnidad', r.id, v); detalle(); }; }
  guia(r);
}

// «¿Qué sigue?» según el estado: solo los botones que corresponden
async function guia(r) {
  const g = $('#pvGuia'); if (!g) return; const N = (r.unidad?.propietario?.nombre || r.contacto?.nombre || 'el propietario').split(' ')[0];
  const mover = async (estado, o, msg) => { try { await api('pvMover', r.id, estado, o); toast(msg || 'Listo.'); await recargar(); } catch (e) { toast(e.message, 5000); } };
  const fh = (id) => `<span class="ga-inl"><input type="date" id="${id}F" value="${hoy()}" /><input type="time" id="${id}H" value="10:00" /></span>`;
  const conf = r.items.every((i) => !i.auto); const gar = r.items.some((i) => i.garantia.vigente === false);
  let html = '';
  if (r.estado === 'triage') html = `<p>${conf ? 'Clasificación confirmada.' : 'Revisa la clasificación de las fallas (abajo) y confírmala.'}${gar ? ' <b>Ojo:</b> hay una falla con la garantía vencida.' : ''} ¿Procede la garantía?</p>
    <div class="pv-acc"><div><b>Procede: agendar visita de diagnóstico</b>${fh('pvV')}<button class="primary small" id="pvVisita">${icon('calendar', 13)} Agendar y avisar a ${esc(N)}</button></div>
      <div><b>No procede</b><input id="pvMot" placeholder="Motivo (ej.: daño por uso, fuera de plazo)" /><button class="secondary small" id="pvNo">Enviar respuesta</button></div></div>`;
  else if (r.estado === 'visita') { const cs = await api('pvContratistas').catch(() => []);
    html = `<p>Visita de diagnóstico ${r.visitas.at(-1) ? `el <b>${fmt(r.visitas.at(-1).fecha)}${r.visitas.at(-1).hora ? ' ' + r.visitas.at(-1).hora : ''}</b>` : ''}. Después del diagnóstico, asigna quién repara.</p>
    <div class="pv-acc"><div><b>Asignar contratista</b><span class="ga-inl"><select id="pvCt">${cs.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}${c.especialidad ? ' · ' + esc(c.especialidad) : ''}</option>`).join('')}<option value="__nuevo">+ Nuevo contratista…</option></select><button class="primary small" id="pvOrden">Asignar</button></span></div>
      <div><b>No procede tras la visita</b><input id="pvMot" placeholder="Motivo" /><button class="secondary small" id="pvNo">Enviar respuesta</button></div></div>`; }
  else if (r.estado === 'orden') html = `<p>Contratista: <b>${esc(r.contratista?.nombre || '')}</b>. Envíale la orden y agenda el trabajo con ${esc(N)}.</p>
    <div class="pv-acc"><div><b>Orden de trabajo</b><button class="secondary small" id="pvEnvOrden">${icon('whatsapp', 13)} Enviar orden por WhatsApp</button></div>
      <div><b>Trabajo agendado</b>${fh('pvT')}<button class="primary small" id="pvTrabajo">Agendar y avisar a ${esc(N)}</button></div></div>`;
  else if (r.estado === 'reparacion') html = `<p>En reparación con <b>${esc(r.contratista?.nombre || '')}</b>${r.visitas.at(-1) ? ` · ${fmt(r.visitas.at(-1).fecha)}` : ''}. Cuando termine, pasa a validación.</p>
    <div class="pv-acc"><div><button class="primary small" id="pvTermino">${icon('check', 13)} Trabajo terminado: validar</button></div></div>`;
  else if (r.estado === 'validacion') html = `<p>¿Quedó bien? Revisa las fotos del trabajo o confirma con ${esc(N)}.</p>
    <div class="pv-acc"><div><button class="primary small" id="pvCerrar">${icon('check', 13)} Conforme: cerrar y pedir nota a ${esc(N)}</button></div><div><input id="pvObs" placeholder="Observaciones" /><button class="secondary small" id="pvObsB">Con observaciones: vuelve al contratista</button></div></div>`;
  else if (r.estado === 'cerrado') html = `<p>${icon('check', 13)} Cerrado el ${new Date(r.cierre).toLocaleDateString('es-CL')}. ${r.encuesta?.nota ? `Nota ${r.encuesta.nota}/5.` : 'Esperando la nota del propietario.'}</p>`;
  else if (r.estado === 'no_procede') html = '<p>Se respondió al propietario con el motivo.</p>';
  g.innerHTML = `<h5>${icon('compass', 13)} ¿Qué sigue?</h5>${html}`;
  const v = (id) => $('#' + id)?.value;
  $('#pvVisita')?.addEventListener('click', () => mover('visita', { visita: { fecha: v('pvVF'), hora: v('pvVH') } }, r.contacto?.contactId ? `Visita agendada. Se avisó a ${N} por WhatsApp.` : 'Visita agendada.'));
  $('#pvNo')?.addEventListener('click', () => mover('no_procede', { motivo: v('pvMot') }));
  $('#pvOrden')?.addEventListener('click', async () => {
    let id = v('pvCt'); const cs = await api('pvContratistas');
    if (id === '__nuevo' || !id) { const c = await formContratista(); if (!c) return; id = c.id; cs.push(c); }
    const c = cs.find((x) => x.id === id); mover('orden', { contratista: { id: c.id, nombre: c.nombre, telefono: c.telefono } });
  });
  $('#pvEnvOrden')?.addEventListener('click', async () => { try { const o = await api('pvOrden', r.id); if (!o.whatsapp) return toast('El contratista no tiene celular.', 4000); pf.openUrl(o.whatsapp); } catch (e) { toast(e.message, 4000); } });
  $('#pvTrabajo')?.addEventListener('click', () => mover('reparacion', { visita: { fecha: v('pvTF'), hora: v('pvTH') } }));
  $('#pvTermino')?.addEventListener('click', () => mover('validacion'));
  $('#pvCerrar')?.addEventListener('click', () => mover('cerrado', {}, 'Cerrado. Se pidió la nota por WhatsApp.'));
  $('#pvObsB')?.addEventListener('click', () => mover('reparacion', { nota: v('pvObs') || 'Con observaciones' }));
}

function formContratista() {
  return new Promise((res) => {
    window.Ventanas.abrir('negocios.postventaContratista', {
      alCancelar: () => { closeModal(); res(null); },
      // si falla, la ventana muestra el error (antes, #ctErr)
      alGuardar: async (v) => { const c = await api('pvContratista', { nombre: v.nombre, especialidad: v.especialidad, telefono: v.telefono }); closeModal(); res(c); },
    }, { clave: 'modal-53' });
  });
}
async function nuevo() {
  const us = await api('pvUnidades').catch(() => []);
  window.Ventanas.abrir('negocios.postventaReclamo', {
    unidades: us.map((u) => [u.id, `${u.nombre} · ${u.propietario?.nombre || ''}`]),
    // si falla, la ventana muestra el error (antes, #nrErr)
    alGuardar: async ({ unidadId, descripcion }) => { const d = descripcion.trim(); if (!d) throw new Error('Describe la falla.');
      const r = await api('pvCrear', { unidadId: unidadId || null, items: [{ descripcion: d }] });
      closeModal(); recargar({ tab: 'reclamos', sel: r.id, filtro: 'abiertos' }); },
  }, { clave: 'modal-54' });
}

// llegaron mensajes o reclamos nuevos por WhatsApp: se actualiza si la pantalla está a la vista y no se está escribiendo
function refrescar() { const v = $('#view-postventa'); if (!v || v.classList.contains('hidden') || v.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; recargar(); }
window.Postventa = { abrir, refrescar, mostrar, verChat, nuevo, formContratista };
})();
