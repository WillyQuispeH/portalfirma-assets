/* global $, api, esc, icon, toast, modal, closeModal, ir, pf */
'use strict';
// Postventa (MVP): reclamos de propietarios con su garantía legal, atención por WhatsApp (vía wechatia),
// unidades entregadas (carga desde Excel) y contratistas. Cada paso es guiado: «¿Qué sigue?» según el estado.
(() => {
const PV = { tab: 'reclamos', filtro: 'abiertos', q: '', sel: null, cfg: null };
const PASOS = [['triage', 'Por revisar'], ['visita', 'Diagnóstico'], ['orden', 'Contratista'], ['reparacion', 'Reparación'], ['validacion', 'Validación'], ['cerrado', 'Cerrado']];
const TIPOS = [['terminacion', 'Terminaciones (3 años)'], ['instalacion', 'Instalaciones (5 años)'], ['estructura', 'Estructura (10 años)'], ['otro', 'Otro (5 años)']];
const fmt = (f) => (f ? f.split('-').reverse().join('/') : '—');
const hoy = () => { const d = new Date(Date.now() + 864e5); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const gBadge = (g) => (g.vigente === true ? `<i class="pv-g ok">${icon('check', 11)} Garantía ${esc(g.txt)}</i>` : g.vigente === false ? `<i class="pv-g no">Garantía ${esc(g.txt)}</i>` : `<i class="pv-g">${esc(g.txt)}</i>`);
const hora = (f) => { if (!f) return ''; try { return new Date(f).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const burbujas = (ms) => `<div class="pv-chat real">${ms.map((m) => `<p class="${m.dir === 'out' ? 'out' : 'in'}">${esc(m.texto || '').replace(/\n/g, '<br>')}${(m.fotos || []).map((f) => `<a href="#" data-url="${esc(f)}"><img src="${esc(f)}" alt="" loading="lazy" /></a>`).join('')}<small>${esc(hora(m.fecha))}</small></p>`).join('')}</div>`;
const estBadge = (r) => `<i class="pv-e ${esc(r.estado)}">${esc(r.estadoTxt)}</i>`;

async function abrir(tab) {
  if (tab) PV.tab = tab; ir('postventa');
  const t = await api('pvTablero').catch(() => null); PV.cfg = await api('pvConfig').catch(() => ({}));
  const k = (n, l, s) => `<div class="pv-k"><b>${n ?? '—'}</b><span>${l}</span>${s ? `<small>${s}</small>` : ''}</div>`;
  $('#view-postventa').innerHTML = `<div class="im-wrap pv-wrap">
    <div class="pv-h"><div><h1>Postventa</h1><p class="muted">Reclamos de propietarios con su garantía legal, atendidos por WhatsApp.</p></div><span class="spacer"></span>
      <span class="pv-wa ${PV.cfg.auto && PV.cfg.conectado ? 'on' : ''}">${icon('whatsapp', 14)} ${PV.cfg.auto && PV.cfg.conectado ? 'WhatsApp atendiendo' : 'WhatsApp en pausa'}</span>
      <button class="primary" id="pvNuevo">${icon('plus', 15)} Nuevo reclamo</button></div>
    <div class="pv-ks">${k(t?.abiertos, 'abiertos', t?.urgentes ? `${t.urgentes} urgentes` : '')}${k(t?.whatsapp, 'por WhatsApp')}${k(t?.cierrePromedioDias, 'días promedio al cierre')}${k(t?.satisfaccion != null ? t.satisfaccion + '/5' : null, 'satisfacción')}${k(t?.unidades, 'unidades en garantía', t?.proyectos ? `${t.proyectos} proyectos` : '')}</div>
    <div class="pb-tabs" id="pvTabs">${[['reclamos', 'Reclamos'], ['unidades', 'Unidades'], ['whatsapp', 'WhatsApp'], ['asistente', 'Asistente'], ['contratistas', 'Contratistas']].map(([k2, l]) => `<button data-t="${k2}" class="${PV.tab === k2 ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="pvBody"></div></div>`;
  $('#pvTabs').querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { PV.tab = b.dataset.t; $('#pvTabs').querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); pintar(); }));
  $('#pvNuevo').onclick = nuevo;
  pintar();
}
const pintar = () => ({ reclamos, unidades, whatsapp, asistente, contratistas }[PV.tab] || reclamos)();

// ---------- reclamos ----------
async function reclamos() {
  const [l, chs] = await Promise.all([api('pvListar', { estado: PV.filtro === 'todos' ? undefined : PV.filtro, q: PV.q }), api('pvChats').catch(() => [])]);
  const enCurso = chs.filter((c) => c.enCurso);
  if (!PV.sel && l[0]) PV.sel = l[0].id; if (!PV.sel && enCurso[0]) PV.sel = 'chat:' + enCurso[0].id;
  $('#pvBody').innerHTML = `<div class="pv-cols"><div class="pv-lista">
    <div class="pv-fil"><label class="ac-q">${icon('search', 14)}<input id="pvQ" placeholder="Folio, unidad, propietario o falla" value="${esc(PV.q)}" spellcheck="false" /></label>
      <div class="ga-chips">${[['abiertos', 'Abiertos'], ['triage', 'Por revisar'], ['todos', 'Todos']].map(([k, t]) => `<button data-f="${k}" class="${PV.filtro === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
    ${enCurso.length ? `<h5 class="pv-curso">${icon('whatsapp', 12)} En conversación por WhatsApp (${enCurso.length})</h5>${enCurso.map((c) => `<button class="pv-row conv ${PV.sel === 'chat:' + c.id ? 'on' : ''}" data-chat="${esc(c.id)}"><span class="pv-rt"><b>${esc(c.nombre || c.telefono || 'Contacto')}</b><small>${esc(c.unidad || c.telefono || '')}</small>${(() => { const m = c.ultimoIn || c.ultimo; const t = m?.texto || (m?.fotos?.length ? 'Envió fotos' : ''); return t ? `<small>«${esc(String(t).slice(0, 70))}»</small>` : ''; })()}</span><span class="pv-rr"><i class="pv-e conv">${esc(c.pasoTxt)}</i><small>${esc(hora(c.actualizado))}</small></span></button>`).join('')}<h5 class="pv-curso">Reclamos</h5>` : ''}
    ${l.length ? l.map((r) => `<button class="pv-row ${r.id === PV.sel ? 'on' : ''}" data-r="${esc(r.id)}"><span class="pv-rt"><b>${esc(r.folio)}${r.urgente ? ' <i class="pv-urg">Urgente</i>' : ''}</b><small>${esc(r.unidad?.nombre || 'Sin unidad')} · ${esc(r.unidad?.propietario?.nombre || r.contacto?.nombre || '')}</small>
      <small>${esc(r.items[0]?.tipoTxt || '')}${r.items[0]?.recinto ? ' · ' + esc(r.items[0].recinto) : ''}: ${esc(String(r.items[0]?.descripcion || '').slice(0, 70))}</small></span>
      <span class="pv-rr">${estBadge(r)}<small>${r.canal === 'whatsapp' ? icon('whatsapp', 12) : ''} ${r.dias === 0 ? 'hoy' : r.dias + ' d'}</small></span></button>`).join('')
      : `<p class="muted pv-vac">${PV.q ? 'No hay reclamos con esta búsqueda.' : PV.filtro === 'triage' ? 'No hay reclamos por revisar.' : `Aún no hay reclamos${PV.filtro === 'abiertos' ? ' abiertos' : ''}. Llegan solos por WhatsApp o créalos con «Nuevo reclamo».`}</p>`}
  </div><div class="pv-det" id="pvDet"></div></div>`;
  $('#pvQ').oninput = (e) => { PV.q = e.target.value; clearTimeout(PV._t); PV._t = setTimeout(reclamos, 250); };
  $('#pvBody').querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { PV.filtro = b.dataset.f; PV.sel = null; reclamos(); }));
  $('#pvBody').querySelectorAll('[data-chat]').forEach((b) => (b.onclick = () => { PV.sel = 'chat:' + b.dataset.chat; $('#pvBody').querySelectorAll('.pv-row').forEach((x) => x.classList.toggle('on', x === b)); verChat(enCurso.find((c) => c.id === b.dataset.chat)); }));
  $('#pvBody').querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { PV.sel = b.dataset.r; $('#pvBody').querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b)); detalle(); }));
  if (PV.sel?.startsWith('chat:')) { const c = enCurso.find((x) => 'chat:' + x.id === PV.sel); if (c) verChat(c); else { PV.sel = l[0]?.id || null; if (PV.sel) detalle(); } } else if (PV.sel) detalle(); else $('#pvDet').innerHTML = '';
}

function verChat(c) {
  const h = $('#pvDet'); if (!h || !c) return;
  h.innerHTML = `<div class="pv-dh"><div><small>${icon('whatsapp', 12)} Conversación en curso · ${esc(hora(c.actualizado))}</small><h2>${esc(c.nombre || 'Contacto')}</h2><p>${icon('user', 13)} ${esc(c.telefono || '')}${c.unidad ? `<br>${icon('house', 13)} ${esc(c.unidad)}` : ''}</p></div><i class="pv-e conv">${esc(c.pasoTxt)}</i></div>
    <p class="muted small">El asistente está atendiendo. El reclamo se crea solo cuando el propietario termina (manda las fotos o escribe «sin fotos»).</p>${burbujas(c.mensajes)}`;
  h.querySelectorAll('[data-url]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); pf.openUrl(a.dataset.url); }));
}
async function detalle() {
  const h = $('#pvDet'); if (!h) return; let r; try { r = await api('pvObtener', PV.sel); } catch { h.innerHTML = ''; return; }
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
  if (!r.unidad) { const us = await api('pvUnidades').catch(() => []); $('#pvUni').insertAdjacentHTML('beforeend', us.map((u) => `<option value="${esc(u.id)}">${esc(u.nombre)} · ${esc(u.propietario?.nombre || '')}</option>`).join(''));
    $('#pvUniOk').onclick = async () => { const v = $('#pvUni').value; if (!v) return; await api('pvUnidad', r.id, v); detalle(); }; }
  guia(r);
}

// «¿Qué sigue?» según el estado: solo los botones que corresponden
async function guia(r) {
  const g = $('#pvGuia'); const N = (r.unidad?.propietario?.nombre || r.contacto?.nombre || 'el propietario').split(' ')[0];
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
async function recargar() { const t = PV.tab; await abrir(t); }

function formContratista() {
  return new Promise((res) => {
    modal(`<div class="im-form"><h2>Nuevo contratista</h2><label>Nombre o empresa<input id="ctN" /></label><label>Especialidad<input id="ctE" placeholder="Gasfitería, pintura, electricidad…" /></label><label>Celular (WhatsApp)<input id="ctT" placeholder="+56 9 1234 5678" /></label><p class="error" id="ctErr"></p>
      <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Guardar</button></div></div>`);
    $('#mCancel').onclick = () => { closeModal(); res(null); };
    $('#mOk').onclick = async () => { try { const c = await api('pvContratista', { nombre: $('#ctN').value, especialidad: $('#ctE').value, telefono: $('#ctT').value }); closeModal(); res(c); } catch (e) { $('#ctErr').textContent = e.message; } };
    setTimeout(() => $('#ctN').focus(), 30);
  });
}
async function nuevo() {
  const us = await api('pvUnidades').catch(() => []);
  modal(`<div class="im-form"><h2>Nuevo reclamo</h2><label>Unidad<select id="nrU"><option value="">— Sin unidad —</option>${us.map((u) => `<option value="${esc(u.id)}">${esc(u.nombre)} · ${esc(u.propietario?.nombre || '')}</option>`).join('')}</select></label>
    <label>¿Qué falla reporta?<textarea id="nrD" rows="3" placeholder="Ej.: filtración bajo el lavamanos del baño principal"></textarea></label><p class="error" id="nrErr"></p>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Crear</button></div></div>`);
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async () => { const d = $('#nrD').value.trim(); if (!d) { $('#nrErr').textContent = 'Describe la falla.'; return; }
    const r = await api('pvCrear', { unidadId: $('#nrU').value || null, items: [{ descripcion: d }] }).catch((e) => { $('#nrErr').textContent = e.message; });
    if (r) { closeModal(); PV.sel = r.id; PV.tab = 'reclamos'; PV.filtro = 'abiertos'; recargar(); } };
  setTimeout(() => $('#nrD').focus(), 30);
}

// ---------- unidades ----------
async function unidades() {
  const [ps, us] = await Promise.all([api('pvProyectos'), api('pvUnidades')]);
  $('#pvBody').innerHTML = `<div class="im-box"><div class="pv-uh"><div><h3>Unidades entregadas</h3><p class="muted small">Carga la planilla Excel (un dato por celda) con proyecto, torre, número, propietario, RUT, celular y las fechas de <b>recepción municipal</b> y de <b>inscripción en el CBR</b>: con ellas se calcula la garantía de cada reclamo.</p></div>
      <span class="ga-inl"><button class="ghost small" id="pvPlant">${icon('download', 14)} Plantilla Excel</button><button class="primary small" id="pvImp">${icon('upload', 14)} Importar planilla</button></span></div>
    ${ps.length ? ps.map((p) => { const l = us.filter((u) => u.proyectoId === p.id); return `<h4 class="pv-sub">${esc(p.nombre)} <i class="muted">(${l.length})</i></h4>
      <div class="pv-tbl"><table><thead><tr><th>Unidad</th><th>Propietario</th><th>Celular</th><th>Recepción DOM</th><th>Inscripción CBR</th></tr></thead><tbody>${l.map((u) => `<tr><td>${esc(u.torre ? u.torre + '-' : '')}${esc(u.numero)}</td><td>${esc(u.propietario?.nombre || '')}<small>${esc(u.propietario?.rut || '')}</small></td><td>${esc(u.propietario?.telefono || '—')}</td><td>${fmt(u.recepcionDOM)}</td><td>${fmt(u.inscripcionCBR)}</td></tr>`).join('')}</tbody></table></div>`; }).join('')
      : '<p class="muted pv-vac">Aún no hay unidades. Descarga la plantilla, complétala y súbela.</p>'}</div>`;
  $('#pvPlant').onclick = () => api('pvPlantilla').then((r) => r && toast('Plantilla guardada.')).catch((e) => toast(e.message, 4000));
  $('#pvImp').onclick = async () => { try { const r = await api('pvImportar'); if (!r) return; toast(`${r.nuevas} unidades nuevas, ${r.actualizadas} actualizadas.${r.omitidas ? ' Se omitió la fila de ejemplo.' : ''}${r.errores.length ? ' ' + r.errores.length + ' filas con errores: ' + r.errores.slice(0, 2).join(' ') : ''}`, 6000); recargar(); } catch (e) { toast(e.message, 9000); } };
}

// ---------- WhatsApp ----------
async function whatsapp() {
  const c = await api('pvConfig'); const chats = await api('pvChats').catch(() => []);
  const PASO = { nuevo: 'Recién escribe', rut: 'Pidiendo RUT', elegir: 'Eligiendo unidad', describir: 'Describiendo la falla', fotos: 'Enviando fotos', listo: 'Solicitud registrada' };
  $('#pvBody').innerHTML = `<div class="pv-cols wa"><div class="im-box"><h3>${icon('whatsapp', 16)} Atención por WhatsApp</h3>
      <p class="muted small">Los propietarios escriben al WhatsApp de wechatia (el mismo de las visitas). El asistente reconoce su celular (o pide el RUT), pide la falla, el recinto y fotos, y crea el reclamo con su garantía. Las conversaciones que no son de postventa quedan para tu equipo comercial.</p>
      <div class="pv-key"><b>Clave de WhatsApp</b> <small class="muted">(integración privada «PortalFirma Asset - Postventa»)</small>
        ${c.propia ? `<p class="pv-ok">${icon('check', 13)} Clave propia de postventa guardada (cifrada)</p>` : c.conectado ? `<p class="muted small">Ahora usa la clave del calendario. Es mejor una clave propia para postventa.</p>` : '<p class="muted small">Sin conectar.</p>'}
        <span class="ga-inl"><input id="pvKey" type="password" autocomplete="off" spellcheck="false" placeholder="${c.propia ? 'Pega una clave nueva para cambiarla' : 'Pega la clave (pit-…)'}" /><button class="primary small" id="pvKeyOk">Guardar</button>${c.propia ? '<button class="ghost small" id="pvKeyDel">Quitar</button>' : ''}</span>
        <label class="pv-loc"><span>Cuenta de wechatia (location)</span><input id="pvLoc" value="${esc(c.locationId || '')}" placeholder="Está en la dirección: …/location/XXXX/…" spellcheck="false" /></label>
        <p class="error" id="pvKeyErr"></p></div>
      <label class="pv-sw"><input type="checkbox" id="pvAuto" ${c.auto ? 'checked' : ''} ${c.conectado ? '' : 'disabled'} /><span><b>Respuesta automática</b><small>Revisa cada pocos segundos (cada 4 s mientras alguien conversa) y responde. Funciona mientras Asset esté abierto.</small></span></label>
      <p class="muted small">${c.ultimaRevision ? 'Última revisión: ' + new Date(c.ultimaRevision).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
      <button class="secondary small" id="pvRev" ${c.conectado ? '' : 'disabled'}>${icon('rotateR', 13)} Revisar ahora</button>
      <h4 class="pv-sub">Permisos de la integración</h4><p class="muted small"><b>Ver conversaciones</b>, <b>ver mensajes de conversaciones</b>, <b>editar mensajes de conversaciones</b> (permite enviar) y <b>ver contactos</b>. Se crea en wechatia › Configuración › Integraciones Privado.</p></div>
    <div class="im-box"><h4 class="pv-sub" style="margin-top:0">Conversaciones <i class="muted">(${chats.length})</i></h4>
      ${chats.length ? chats.slice(0, 20).map((ch) => `<button class="pv-ch" data-ch="${esc(ch.id)}"><b>${esc(ch.nombre || ch.telefono || 'Contacto')}</b><small>${esc(ch.telefono || '')} · ${esc(ch.pasoTxt)}${ch.reclamo ? ' · ' + esc(ch.reclamo.folio) : ''} · ${esc(hora(ch.actualizado))}</small></button>`).join('') : '<p class="muted small">Todavía no hay conversaciones de postventa.</p>'}
      <div id="pvChVer"></div></div></div>`;
  $('#pvBody').querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => { const ch = chats.find((x) => x.id === b.dataset.ch); $('#pvBody').querySelectorAll('[data-ch]').forEach((x) => x.classList.toggle('on', x === b)); $('#pvChVer').innerHTML = burbujas(ch.mensajes); $('#pvChVer').querySelectorAll('[data-url]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); pf.openUrl(a.dataset.url); })); }));
  $('#pvKeyOk').onclick = async (e) => { const k = $('#pvKey').value.trim(); if (!k) { $('#pvKeyErr').textContent = 'Pega la clave.'; return; } e.target.disabled = true;
    try { await api('pvClaveWa', { token: k, locationId: $('#pvLoc').value.trim() }); $('#pvKey').value = ''; toast('Clave de WhatsApp guardada y probada.'); recargar(); } catch (er) { e.target.disabled = false; $('#pvKeyErr').textContent = er.message; } };
  $('#pvKeyDel')?.addEventListener('click', async () => { await api('pvClaveWa', { token: '' }); toast('Clave de postventa quitada.'); recargar(); });
  $('#pvAuto')?.addEventListener('change', async (e) => { await api('pvConfigurar', { auto: e.target.checked }); toast(e.target.checked ? 'WhatsApp atendiendo la postventa.' : 'Respuesta automática en pausa.'); recargar(); });
  $('#pvRev')?.addEventListener('click', async (e) => { e.target.disabled = true; try { const r = await api('pvRevisar'); toast(`${r.procesados} mensajes nuevos, ${r.enviados} respuestas${r.nuevos?.length ? ', ' + r.nuevos.length + ' reclamos nuevos' : ''}.`, 5000); recargar(); } catch (er) { e.target.disabled = false; toast(er.message, 6000); } });
}

// ---------- asistente: cómo habla con los propietarios ----------
async function asistente() {
  const cfg = await api('pvConfig'); const p = { ...cfg.persona };
  const seg = (id, val, ops) => `<div class="pv-seg" data-k="${id}">${ops.map(([v, t]) => `<button type="button" data-v="${v}" class="${val === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  $('#pvBody').innerHTML = `<div class="pv-cols wa"><div class="im-box pv-as">
      <h3>${icon('user', 16)} Cómo habla el asistente</h3><p class="muted small">Así se presenta y trata a los propietarios por WhatsApp. Los cambios se ven al lado al instante.</p>
      <div class="pv-f2"><label><span>Nombre del asistente</span><input id="asNom" maxlength="40" placeholder="Ej.: Sofía (vacío = «el asistente»)" value="${esc(p.nombre)}" /></label>
        <label><span>Empresa</span><input id="asEmp" maxlength="60" placeholder="Ej.: Inmobiliaria Los Aromos" value="${esc(p.empresa)}" /></label></div>
      <div class="pv-fl"><span>Trato</span>${seg('trato', p.trato, [['tu', 'Tú'], ['usted', 'Usted']])}</div>
      <div class="pv-fl"><span>Tono</span>${seg('tono', p.tono, [['cercano', 'Cercano'], ['neutro', 'Neutro'], ['formal', 'Formal']])}</div>
      <div class="pv-fl"><span>Respuestas</span>${seg('largo', p.largo, [['breve', 'Breves'], ['normal', 'Completas']])}</div>
      <label class="pv-sw"><input type="checkbox" id="asEmo" ${p.emojis ? 'checked' : ''} /><span><b>Usar emojis</b><small>Uno por mensaje, en los momentos clave (fotos, solicitud registrada, visita).</small></span></label>
      <label class="pv-fx"><span>Horario de atención <small class="muted">(va al final de la solicitud registrada)</small></span><input id="asHor" maxlength="100" placeholder="Ej.: lunes a viernes de 9:00 a 18:00" value="${esc(p.horario)}" /></label>
      <label class="pv-fx"><span>Firma <small class="muted">(al final de la solicitud registrada y de los avisos)</small></span><input id="asFir" maxlength="100" placeholder="Ej.: Equipo de Postventa · Inmobiliaria Los Aromos" value="${esc(p.firma)}" /></label>
      <label class="pv-fx"><span>Instrucciones propias <small class="muted">(opcional)</small></span><textarea id="asIns" rows="4" maxlength="1500" placeholder="Ej.: Sé muy amable y empático, el propietario puede estar molesto. No uses la palabra «reclamo», di «solicitud». Nunca prometas fechas.">${esc(p.instrucciones)}</textarea>
        <small class="muted">Con instrucciones, la IA ajusta cada mensaje a tu estilo sin cambiar folios, fechas ni palabras clave (si los cambia, se envía el mensaje normal). Suma 1 a 2 segundos por respuesta.</small></label>
      <p class="error" id="asErr"></p>
      <div class="ga-inl"><button class="primary" id="asOk">Guardar</button><button class="secondary" id="asIA" ${p.instrucciones ? '' : 'disabled'}>${icon('sparkle', 13)} Probar mis instrucciones</button><span class="muted small" id="asEst"></span></div></div>
    <div class="im-box"><h3>Vista previa</h3><p class="muted small">Una conversación de ejemplo con esta configuración.</p><div id="asPrev"></div><div id="asPrevIA"></div></div></div>`;
  const leer = () => ({ nombre: $('#asNom').value, empresa: $('#asEmp').value, trato: p.trato, tono: p.tono, largo: p.largo, emojis: $('#asEmo').checked, horario: $('#asHor').value, firma: $('#asFir').value, instrucciones: $('#asIns').value });
  const prev = async () => { const m = await api('pvMuestra', leer()); $('#asPrev').innerHTML = burbujas(m.mensajes.map((x) => ({ ...x, fotos: x.fotos ? [] : [], texto: x.fotos ? '📷 [foto]' : x.texto, fecha: null }))).replace(/<small><\/small>/g, ''); $('#asEst').textContent = 'Sin guardar'; };
  $('#pvBody').querySelectorAll('.pv-seg').forEach((g) => g.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { p[g.dataset.k] = b.dataset.v; g.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === b)); prev(); })));
  let tm; $('#pvBody').querySelectorAll('.pv-as input, .pv-as textarea').forEach((i) => i.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(prev, 150); $('#asIA').disabled = !$('#asIns').value.trim(); $('#asPrevIA').innerHTML = ''; }));
  $('#asEmo').addEventListener('change', prev);
  $('#asOk').onclick = async (e) => { e.target.disabled = true; try { await api('pvConfigurar', { persona: leer() }); $('#asEst').textContent = ''; toast('Listo: el asistente ya habla así con los propietarios.'); } catch (er) { $('#asErr').textContent = er.message; } e.target.disabled = false; };
  $('#asIA').onclick = async (e) => { e.target.disabled = true; $('#asPrevIA').innerHTML = '<p class="muted small">Aplicando tus instrucciones…</p>';
    try { const r = await api('pvProbarEstilo', leer()); $('#asPrevIA').innerHTML = `<h4 class="pv-sub">Con tus instrucciones</h4>${burbujas([{ dir: 'out', texto: r.texto }]).replace(/<small><\/small>/g, '')}<p class="muted small">${r.ia ? 'Así saldría la solicitud registrada.' : 'Se enviaría el mensaje normal' + (r.descartado ? ' (' + esc(r.descartado) + ')' : '') + '.'}</p>`; }
    catch (er) { $('#asPrevIA').innerHTML = `<p class="error">${esc(er.message)}</p>`; } e.target.disabled = false; };
  await prev(); $('#asEst').textContent = '';
}

// ---------- contratistas ----------
async function contratistas() {
  const cs = await api('pvContratistas');
  $('#pvBody').innerHTML = `<div class="im-box"><div class="pv-uh"><h3>Contratistas</h3><button class="primary small" id="pvCtN">${icon('plus', 14)} Nuevo</button></div>
    ${cs.length ? `<div class="pv-tbl"><table><thead><tr><th>Nombre</th><th>Especialidad</th><th>Celular</th></tr></thead><tbody>${cs.map((c) => `<tr><td>${esc(c.nombre)}</td><td>${esc(c.especialidad || '')}</td><td>${esc(c.telefono || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted pv-vac">Agrega a los maestros y empresas que hacen las reparaciones.</p>'}</div>`;
  $('#pvCtN').onclick = async () => { if (await formContratista()) contratistas(); };
}

// llegaron mensajes o reclamos nuevos por WhatsApp: se actualiza si la pantalla está a la vista y no se está escribiendo
function refrescar() { const v = $('#view-postventa'); if (!v || v.classList.contains('hidden') || v.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; recargar(); }
window.Postventa = { abrir, refrescar };
})();
