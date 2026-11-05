/* global $, api, esc, icon, toast, modal, closeModal, ir, pf, liberar */
'use strict';
// Leads (0.14): bandeja de clientes potenciales con su conversación de WhatsApp (como una ventana de WhatsApp,
// de solo lectura), su búsqueda leída por IA, su estado y la próxima acción. Entrada: chat exportado (.txt o .zip).
(() => {
const LD = { filtro: 'abiertos', sel: null, data: null, yo: null }; // los sincroniza la bandeja en React (mostrar)
const TIPOS = [['departamento', 'Departamento'], ['casa', 'Casa'], ['oficina', 'Oficina'], ['local_comercial', 'Local'], ['parcela', 'Parcela'], ['terreno_construccion', 'Terreno'], ['bodega', 'Bodega'], ['estacionamiento', 'Estacionamiento']];
const ini = (s) => /^[+\d\s().-]+$/.test(String(s || '').trim()) ? '#' : String(s || '?').replace(/[^\p{L}\d ]/gu, '').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '#';
const nombreDe = (l) => l.nombre || l.telefono || l.chatCon || 'Sin nombre';
const pesos = (p) => (!p ? '' : p.moneda === 'UF' ? `UF ${Number(p.valor).toLocaleString('es-CL')}` : `$${Number(p.valor).toLocaleString('es-CL')}`);
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const fechaCorta = (f) => { if (!f) return ''; const d = new Date(f); const hoy = new Date(); const ayer = new Date(Date.now() - 864e5);
  if (d.toDateString() === hoy.toDateString()) return f.slice(11, 16); if (d.toDateString() === ayer.toDateString()) return 'ayer';
  return `${f.slice(8, 10)}/${f.slice(5, 7)}${f.slice(0, 4) !== String(hoy.getFullYear()) ? '/' + f.slice(2, 4) : ''}`; };
const dia = (f) => { const d = new Date(f.slice(0, 10) + 'T12:00:00'); const t = `${DIAS[d.getDay()]} ${d.getDate()} de ${d.toLocaleString('es-CL', { month: 'long' })}${d.getFullYear() !== new Date().getFullYear() ? ' de ' + d.getFullYear() : ''}`; return t[0].toUpperCase() + t.slice(1); };
const linkify = (t) => esc(t).replace(/https?:\/\/[^\s<>()&]+(?:&amp;[^\s<>()&]+)*/g, (u) => `<a href="#" data-url="${u}">${u.length > 60 ? u.slice(0, 57) + '…' : u}</a>`).replace(/\n/g, '<br>');
const busquedaTxt = (b = {}) => [b.operacion && (b.operacion === 'arriendo' ? 'Arriendo' : 'Compra'), b.tipo && (TIPOS.find((t) => t[0] === b.tipo) || [0, b.tipo])[1].toLowerCase(),
  b.dormitorios != null && `${b.dormitorios}D`, b.banos != null && `${b.banos}B`, (b.comunas || []).length && b.comunas.join(', '), b.presupuesto && 'hasta ' + pesos(b.presupuesto)].filter(Boolean).join(' · ');

async function miNombre() { if (LD.yo != null) return LD.yo; try { const u = await pf.apiUser?.(); LD.yo = (u?.ok && (u.data?.namePerson || u.data?.name)) || ''; } catch { LD.yo = ''; } return LD.yo; }

// La bandeja (encabezado, KPIs, filtros y lista) está en React: src/ui/components/functional/leads/Leads.tsx.
// Aquí quedan la conversación y la ficha del lead (#ldChat y #ldFicha) y los asistentes de importación.
// React elige el lead y llama a mostrar(); cuando algo cambia aquí, lista() le pide a React recargar.
async function abrir(id) {
  if (id) LD.sel = id; ir('leads');
  const el = $('#view-leads'); liberar(el); window.ReactUI.montar('Leads', el, { sel: id || null, filtro: LD.filtro });
}
// React → aquí: el lead elegido y los datos de la lista (estados, corredores), y se dibuja su detalle
function mostrar(sel, data, filtro) { LD.sel = sel; LD.data = data; LD.filtro = filtro; detalle(); }
// aquí → React: recargar la lista (con el elegido y el filtro que se hayan fijado aquí, p. ej. al importar)
function lista() { window.dispatchEvent(new CustomEvent('pf:leads', { detail: { sel: LD.sel, filtro: LD.filtro } })); }
function comoExportar() {
  modal(`<h2>${icon('whatsapp', 18)} Cómo exportar un chat de WhatsApp</h2>
    <div class="ld-pasos"><div><b>iPhone</b><span>Abre el chat › toca el nombre del contacto arriba › baja hasta <i>Exportar chat</i> › elige <i>Incluir archivos</i> (fotos y audios) o <i>Sin archivos</i> (más liviano).</span></div>
    <div><b>Android</b><span>Abre el chat › ⋮ (arriba a la derecha) › <i>Más</i> › <i>Exportar chat</i> › <i>Incluir archivos</i> o <i>Sin archivos</i>.</span></div></div>
    <p><b>Luego, una de dos:</b></p><ul class="ld-ul"><li>Envíalo por WhatsApp al número de la empresa (tu Agente lo registra y te confirma), o</li><li>guárdalo en el computador y arrástralo a esta ventana.</li></ul>
    <p class="muted small">Si exportas el mismo chat otra vez más adelante, Asset agrega solo los mensajes nuevos.</p>
    <div class="actions"><button class="primary" id="mCancel">Entendido</button></div>`);
  $('#mCancel').onclick = closeModal;
}

// ---------- detalle: conversación + ficha ----------
async function detalle() {
  // la persona del lead se liga en segundo plano (pf:leads llega después): si la bandeja ya no está, no hay qué dibujar
  if (!$('#ldChat') || !$('#ldFicha')) return;
  if (!LD.sel) { $('#ldChat').innerHTML = '<p class="muted ld-nada">Elige un lead.</p>'; $('#ldFicha').innerHTML = ''; return; }
  const l = await api('leadsObtener', LD.sel).catch((e) => { toast(e.message); return null; }); if (!l) return;
  if (!$('#ldChat')?.isConnected || !$('#ldFicha')?.isConnected) return;
  chat(l); ficha(l);
}
function chat(l) {
  let html = ''; let diaAnt = '';
  for (const m of l.mensajesLista) {
    const d = m.fecha.slice(0, 10); if (d !== diaAnt) { diaAnt = d; html += `<div class="ld-dia"><span>${esc(dia(m.fecha))}</span></div>`; }
    let cuerpo = '';
    if (m.tipo === 'imagen') cuerpo = m.url ? `<img src="${esc(m.url)}" data-img="${esc(m.url)}" alt="" loading="lazy" />` : `<span class="ld-adj">${icon('image', 14)} Foto (no incluida en la exportación)</span>`;
    else if (m.tipo === 'audio') cuerpo = `${m.url ? `<audio controls preload="none" src="${esc(m.url)}"></audio>` : `<span class="ld-adj">${icon('mic', 14)} Audio (no incluido)</span>`}${m.transcripcion ? `<span class="ld-tx">«${esc(m.transcripcion)}»</span>` : ''}`;
    else if (m.tipo === 'video') cuerpo = `<span class="ld-adj">${icon('file', 14)} Video${m.archivo ? ' · ' + esc(m.archivo) : ''}</span>`;
    else if (m.tipo === 'documento' || m.tipo === 'contacto') cuerpo = `<span class="ld-adj">${icon('file', 14)} ${esc(m.archivo || 'Archivo')}</span>`;
    else if (m.tipo === 'omitido') cuerpo = `<span class="ld-adj">${icon('file', 14)} Archivo no incluido en la exportación</span>`;
    const quien = m.de === 'agente' ? `<em class="ld-ag">${icon('sparkle', 11)} ${esc(m.autor || 'Fernanda (asistente)')}</em>` : m.de !== 'cliente' && (m.wa || l.mensajesLista.some((x) => x.de !== 'cliente' && x.autor !== m.autor)) ? `<em>${esc(m.autor)}</em>` : '';
    const can = m.canal || (m.ig ? 'instagram' : ''); const canIc = can === 'instagram' ? `<em class="ld-can">${icon('instagram', 11)} Instagram</em>` : can === 'email' ? `<em class="ld-can">${icon('mail', 11)} Correo</em>` : can === 'facebook' ? '<em class="ld-can">Messenger</em>' : '';
    html += `<div class="ld-m ${m.de === 'cliente' ? 'in' : 'out'}${m.de === 'agente' ? ' ld-ia' : ''}${m.fallido ? ' ld-nok' : ''}">${canIc && (l.canales?.length > 1 || l.wa) ? canIc : ''}${quien}${cuerpo}${m.texto ? `<span class="ld-t">${linkify(m.texto)}</span>` : ''}${m.fallido ? `<span class="ld-fail" title="${esc(m.fallido)}">${icon('alert', 12)} No entregado</span>` : ''}<small>${esc(m.fecha.slice(11, 16))}</small></div>`;
  }
  $('#ldChat').innerHTML = `<div class="ld-ch-h"><span class="ld-av">${esc(ini(nombreDe(l)))}</span><div><b>${esc(nombreDe(l))}</b><small>${esc([l.telefono && l.nombre ? l.telefono : '', l.origenTxt, `${l.mensajes} mensajes`, l.broker && 'broker: ' + l.broker].filter(Boolean).join(' · '))}</small></div>
      <span class="spacer"></span>${l.wa ? (l.atiende === 'corredor'
        ? `<span class="ld-atn yo">${icon('user', 12)} La atiendes tú</span><button class="ghost small" id="ldDevolver" title="Fernanda vuelve a responderle sola">Devolver a Fernanda</button>`
        : l.pausaHasta ? `<span class="ld-atn pausa" title="Le escribiste tú desde WhatsApp: Fernanda no responde para no pisarte">${icon('clock', 12)} Fernanda en pausa hasta las ${esc(new Date(l.pausaHasta).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }))}</span><button class="primary small" id="ldReanudar" title="Fernanda vuelve a responder desde ya">Reanudar Fernanda</button>`
        : `<span class="ld-atn ia">${icon('sparkle', 12)} Atiende Fernanda</span><button class="primary small" id="ldTomar" title="Fernanda deja de responder y la conversación pasa a ti">Tomar conversación</button>`)
      : `<span class="ld-ro" title="Es el registro de la conversación: se responde desde WhatsApp">${icon('lock', 12)} Solo lectura</span>`}</div>
    <div class="ld-ch-b" id="ldChB">${html || '<p class="muted ld-nada">Sin mensajes.</p>'}</div>
    ${l.wa && l.atiende === 'corredor' ? `<div class="ld-resp"><textarea id="ldRespTx" rows="2" placeholder="Escríbele a ${esc(nombreDe(l))} por WhatsApp…"></textarea><button class="primary small" id="ldRespOk">${icon('whatsapp', 13)} Enviar</button></div>` : ''}
    <div class="ld-ch-f"><small class="muted">Última importación: ${l.importaciones?.length ? esc(fechaCorta(l.importaciones.at(-1).fecha)) + ' · ' + l.importaciones.at(-1).nuevos + ' mensajes nuevos' : '—'}</small><span class="spacer"></span>
      <button class="ghost small" id="ldAct">${icon('upload', 13)} Agregar mensajes nuevos</button></div>`;
  const b = $('#ldChB'); b.scrollTop = b.scrollHeight;
  b.querySelectorAll('[data-url]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); pf.openUrl?.(a.dataset.url); }));
  b.querySelectorAll('[data-img]').forEach((im) => (im.onclick = () => { modal(`<img src="${esc(im.dataset.img)}" class="ld-big" alt="" /><div class="actions"><button class="secondary" id="mCancel">Cerrar</button></div>`); $('#mCancel').onclick = closeModal; }));
  $('#ldAct').onclick = () => (l.ig ? comoInstagram() : $('#ldFile').click());
  // 0.16.9 · tomar / devolver la conversación de WhatsApp y responder desde aquí
  const recargar = async () => { await detalle(); lista(); };
  if ($('#ldTomar')) $('#ldTomar').onclick = async () => { try { await api('leadsAtencion', l.id, 'corredor'); toast('La conversación es tuya: Fernanda deja de responderle.'); recargar(); } catch (e) { toast(e.message); } };
  if ($('#ldReanudar')) $('#ldReanudar').onclick = async () => { try { await api('leadsReanudar', l.id); toast('Fernanda vuelve a responder en esta conversación.'); recargar(); } catch (e) { toast(e.message, 4000); } };
  if ($('#ldDevolver')) $('#ldDevolver').onclick = async () => { try { await api('leadsAtencion', l.id, 'agente'); toast('Fernanda vuelve a atender a este lead.'); recargar(); } catch (e) { toast(e.message); } };
  if ($('#ldRespOk')) {
    const tx = $('#ldRespTx'); const go = async () => { const t = tx.value.trim(); if (!t) return; $('#ldRespOk').disabled = true;
      try { await api('leadsResponder', l.id, t); tx.value = ''; recargar(); } catch (e) { toast(e.message); } finally { if ($('#ldRespOk')) $('#ldRespOk').disabled = false; } };
    $('#ldRespOk').onclick = go; tx.onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go(); };
  }
}
function ficha(l) {
  const b = l.busqueda || {}; const est = (LD.data?.estados || []).map(([k, t]) => `<option value="${k}" ${l.estado === k ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const inp = (k, lbl, val, t = 'text', ph = '') => `<label>${lbl}<input data-k="${k}" type="${t}" value="${esc(val ?? '')}" placeholder="${esc(ph)}" /></label>`;
  $('#ldFicha').innerHTML = `<div class="ld-f">
    <div class="ld-f-cor"><label>Corredor<select id="ldCor" ${window.PERFIL && !window.PERFIL.esAdmin ? 'disabled title="Reasignar leads lo hace el administrador"' : ''}><option value="">Sin corredor</option>${(LD.data?.corredores || []).map((c) => `<option value="${esc(c.id)}" ${l.corredorId === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>
      <button class="secondary small" id="ldDerivar" ${l.corredorId ? '' : 'disabled title="Primero asigna un corredor"'}>${icon('whatsapp', 13)} Avisar al corredor</button></div>
    <div class="ld-f-est"><label>Estado<select data-k="estado">${est}</select></label>${l.estado === 'perdido' ? inp('motivo', 'Motivo', l.motivoPerdida, 'text', 'Encontró otra, ya no busca…') : ''}</div>
    ${l.resumen ? `<p class="ld-res">${icon('sparkle', 13)} ${esc(l.resumen)}</p>` : ''}
    ${l.perfil ? `<p class="ld-perfil"><b>Perfil</b> ${esc(l.perfil)}</p>` : ''}
    ${l.ig ? `<p class="muted small ld-igc">${icon('instagram', 12)} Instagram${l.ig.usuario ? ' · @' + esc(l.ig.usuario) : ''}${l.ig.cuenta ? ' · cuenta ' + esc(l.ig.cuenta) : ''}</p>` : ''}
    <div class="ld-pa ${l.vencida ? 'venc' : ''}"><span>${icon('clock', 13)} Próxima acción</span><div class="ld-pa-f">${inp('pa_texto', '', l.proximaAccion?.texto, 'text', 'Ej.: enviarle 3 opciones')}${inp('pa_fecha', '', l.proximaAccion?.fecha, 'date')}</div></div>
    <h3>Qué busca</h3><div class="ld-bq">
      <label>Operación<select data-k="b_operacion"><option value="">—</option><option value="arriendo" ${b.operacion === 'arriendo' ? 'selected' : ''}>Arriendo</option><option value="venta" ${b.operacion === 'venta' ? 'selected' : ''}>Compra</option></select></label>
      <label>Tipo<select data-k="b_tipo"><option value="">—</option>${TIPOS.map(([k, t]) => `<option value="${k}" ${b.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${inp('b_comunas', 'Comunas', (b.comunas || []).join(', '), 'text', 'Ñuñoa, Providencia')}
      <label>Presupuesto<span class="ld-pr"><input data-k="b_valor" type="number" min="0" value="${esc(b.presupuesto?.valor ?? '')}" /><select data-k="b_moneda"><option value="CLP">$</option><option value="UF" ${b.presupuesto?.moneda === 'UF' ? 'selected' : ''}>UF</option></select></span></label>
      ${inp('b_dormitorios', 'Dormitorios', b.dormitorios, 'number')}${inp('b_banos', 'Baños', b.banos, 'number')}
      ${inp('b_plazo', 'Para cuándo', b.plazo, 'text', 'Ej.: noviembre')}
      <div class="ld-ck"><label class="im-ck"><input type="checkbox" data-k="b_estacionamiento" ${b.estacionamiento ? 'checked' : ''} /> Estacionamiento</label><label class="im-ck"><input type="checkbox" data-k="b_mascotas" ${b.mascotas ? 'checked' : ''} /> Mascotas</label></div>
      ${(b.otros || []).length ? `<p class="muted small s2">También: ${esc(b.otros.join(' · '))}</p>` : ''}</div>
    <h3>Contacto</h3><div class="ld-bq">${inp('nombre', 'Nombre', l.nombre)}${inp('telefono', 'Teléfono', l.telefono, 'tel', '+56 9 …')}${inp('email', 'Correo', l.email, 'email')}${inp('rut', 'RUT', l.rut)}</div>
    ${(l.propiedadesInfo || []).length ? `<h3>Propiedades de la conversación</h3><div class="ld-props">${l.propiedadesInfo.map((p) => `<button class="ld-prop" data-prop="${esc(p.id)}">${p.foto ? `<img src="${esc(p.foto)}" alt="" />` : `<span>${icon('house', 16)}</span>`}<b>${esc(p.codigo)}</b><small>${esc(p.titulo)}</small></button>`).join('')}</div>` : ''}
    ${(l.links || []).length ? `<h3>Links compartidos</h3><div class="ld-links">${l.links.slice(0, 8).map((u) => `<a href="#" data-url="${esc(u)}">${esc(u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48))}</a>`).join('')}</div>` : ''}
    ${(l.historial || []).length ? `<h3>Historial</h3><ul class="ld-hist">${[...l.historial].reverse().slice(0, 30).map((h) => `<li class="${esc(h.tipo || '')}"><span>${esc(h.texto)}</span><small>${esc(fechaCorta(h.fecha))}${h.fecha.slice(0, 4) !== String(new Date().getFullYear()) ? '' : ''} ${esc(new Date(h.fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }))}</small></li>`).join('')}</ul>` : ''}
    <label class="ld-notas">Notas<textarea data-k="notas" rows="2">${esc(l.notas || '')}</textarea></label>
    <p class="error" id="ldErr"></p>
    <div class="ld-acc"><button class="primary" id="ldGuardar">Guardar</button><button class="secondary" id="ldIA" title="Volver a leer la conversación con IA">${icon('sparkle', 14)} Reanalizar</button>
      ${l.personaId ? `<button class="secondary" id="ldPersona">${icon('user', 14)} Ver persona</button>` : `<button class="secondary" id="ldCliente">${icon('user', 14)} Pasar a cliente</button>`}
      <button class="ghost small ld-del" id="ldBorrar">${icon('trash', 13)} Eliminar</button></div></div>`;
  const f = $('#ldFicha'); const val = (k) => f.querySelector(`[data-k="${k}"]`);
  const recoger = () => { const n = (k) => (val(k).value === '' ? null : Number(val(k).value));
    return { estado: val('estado').value, motivo: val('motivo')?.value, nombre: val('nombre').value, telefono: val('telefono').value, email: val('email').value, rut: val('rut').value, notas: val('notas').value,
      proximaAccion: { texto: val('pa_texto').value.trim(), fecha: val('pa_fecha').value || null },
      busqueda: { operacion: val('b_operacion').value || null, tipo: val('b_tipo').value || null, comunas: val('b_comunas').value.split(',').map((x) => x.trim()).filter(Boolean),
        presupuesto: val('b_valor').value ? { valor: Number(val('b_valor').value), moneda: val('b_moneda').value } : null, dormitorios: n('b_dormitorios'), banos: n('b_banos'), plazo: val('b_plazo').value.trim() || null,
        estacionamiento: val('b_estacionamiento').checked || null, mascotas: val('b_mascotas').checked || null } }; };
  const guardar = async (silencioso) => { try { await api('leadsActualizar', l.id, recoger()); if (!silencioso) toast('Lead guardado.'); await lista(); return true; } catch (e) { $('#ldErr').textContent = e.message; return false; } };
  $('#ldGuardar').onclick = () => guardar();
  val('estado').onchange = () => guardar(true);
  $('#ldIA').onclick = async (e) => { const bt = e.currentTarget; bt.disabled = true; bt.innerHTML = '<span class="spinner sm"></span> Leyendo…'; try { await api('leadsReanalizar', l.id); toast('Conversación analizada de nuevo.'); await lista(); } catch (er) { toast(er.message, 6000); bt.disabled = false; bt.innerHTML = `${icon('sparkle', 14)} Reanalizar`; } };
  $('#ldCliente')?.addEventListener('click', async () => { if (!(await guardar(true))) return; const x = recoger();
    window.Inmo.formPersona(null, { rol: 'interesado', pre: { nombre: x.nombre || l.chatCon, telefono: x.telefono, email: x.email, rut: x.rut, notas: [l.resumen, busquedaTxt(x.busqueda) && 'Busca: ' + busquedaTxt(x.busqueda)].filter(Boolean).join('\n') },
      despues: async (p) => { await api('leadsActualizar', l.id, { personaId: p.id }); toast('Quedó como cliente en Personas.'); abrir(l.id); } }); });
  $('#ldPersona')?.addEventListener('click', () => window.Inmo.abrirPersona(l.personaId));
  $('#ldCor').onchange = async (e) => { try { await api('leadsAsignar', l.id, e.target.value || null); toast(e.target.value ? 'Lead asignado. Queda en su historial.' : 'El lead quedó sin corredor.'); await lista(); } catch (er) { toast(er.message, 5000); } };
  $('#ldDerivar').onclick = () => derivar(l);
  $('#ldBorrar').onclick = () => { modal(`<h2>¿Eliminar este lead?</h2><p>Se borra la conversación guardada de <b>${esc(nombreDe(l))}</b> (${l.mensajes} mensajes) y sus fotos y audios. No se puede deshacer.</p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="danger" id="mOk">Eliminar</button></div>`);
    $('#mCancel').onclick = closeModal; $('#mOk').onclick = async () => { await api('leadsBorrar', l.id); closeModal(); LD.sel = null; toast('Lead eliminado.'); lista(); }; };
  f.querySelectorAll('[data-prop]').forEach((bt) => (bt.onclick = () => window.Inmo.abrirFicha(bt.dataset.prop)));
  f.querySelectorAll('[data-url]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); pf.openUrl?.(a.dataset.url); }));
}

// ---------- 0.16.23 · derivar al corredor dueño por WhatsApp ----------
async function derivar(l) {
  const v = await api('leadsDerivarVer', l.id).catch((e) => { toast(e.message); return null; }); if (!v) return;
  if (!v.corredor) return toast('Primero asigna el lead a un corredor.');
  modal(`<div class="im-form"><h2>${icon('whatsapp', 18)} Avisar a ${esc(v.corredor.nombre)}</h2>
    ${v.corredor.celular ? `<p>Se le envía este WhatsApp a <b>${esc(v.corredor.celular)}</b> desde el número de la empresa:</p><pre class="ld-pre">${esc(v.texto)}</pre>
      <p class="muted small">Si ${esc(v.corredor.nombre.split(' ')[0])} no le ha escrito al número de la empresa en las últimas 24 horas, WhatsApp no deja enviarlo: en ese caso te dejo el enlace para mandárselo desde tu WhatsApp.</p>`
      : `<p class="error">Falta el teléfono de ${esc(v.corredor.nombre)}. Agrégalo en Usuarios.</p>`}
    <p class="error" id="ldDvErr"></p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button>${v.corredor.celular ? '<button class="primary" id="mOk">Enviar aviso</button>' : '<button class="primary" id="ldDvCor">Usuarios</button>'}</div></div>`);
  $('#mCancel').onclick = closeModal; if ($('#ldDvCor')) $('#ldDvCor').onclick = () => window.Usuarios?.abrir();
  if ($('#mOk')) $('#mOk').onclick = async (e) => { const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Enviando…';
    try { const r = await api('leadsDerivar', l.id);
      if (r.ok) { closeModal(); toast(`Listo: ${v.corredor.nombre} recibió el lead por WhatsApp.`, 5000); }
      else { $('#ldDvErr').textContent = 'No salió desde el número de la empresa: ' + r.motivo; b.disabled = false; b.textContent = 'Abrir mi WhatsApp'; b.onclick = () => { pf.openUrl?.(r.enlace); closeModal(); }; }
      detalle(); lista();
    } catch (er) { $('#ldDvErr').textContent = er.message; b.disabled = false; b.textContent = 'Enviar aviso'; } };
}
// ---------- importar un chat exportado ----------
async function importarRuta(ruta, canal) {
  let a;
  try { a = await api('leadsAnalizar', { ruta, canal, miNombre: await miNombre() }); } catch (e) { return /instagram|IG_|NO_IG/i.test(e.message + (e.code || '')) || canal === 'instagram' ? modalError(e.message, comoInstagram) : modalError(e.message); }
  if (a.tipo === 'instagram') return importarInstagram(a);
  const fmt = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');
  const med = Object.entries(a.medios || {}).sort((x, y) => ['imagen', 'audio', 'video', 'documento', 'contacto', 'omitido'].indexOf(x[0]) - ['imagen', 'audio', 'video', 'documento', 'contacto', 'omitido'].indexOf(y[0])).map(([k, n]) => `${n} ${{ imagen: n > 1 ? 'fotos' : 'foto', audio: n > 1 ? 'audios' : 'audio', video: n > 1 ? 'videos' : 'video', documento: n > 1 ? 'documentos' : 'documento', omitido: n > 1 ? 'archivos no incluidos' : 'archivo no incluido', contacto: 'contacto' }[k] || k}`).join(', ');
  const audios = a.conArchivos ? a.medios?.audio || 0 : 0;
  modal(`<div class="ld-imp"><h2>${icon('whatsapp', 18)} Importar conversación</h2>
    <p><b>${a.total} mensajes</b> del ${fmt(a.desde)} al ${fmt(a.hasta)}${med ? ` · ${esc(med)}` : ''}.</p>
    ${a.existente ? `<p class="ld-ex">${icon('check', 13)} Ya tienes este chat con <b>${esc(a.existente.nombre || a.cliente)}</b>: se agregan solo los <b>${a.existente.nuevos}</b> mensajes nuevos.</p>` : ''}
    <p class="ld-q">¿Quién es el cliente?</p><div class="ld-parts">${a.participantes.map((p) => `<label class="im-ck"><input type="radio" name="ldCli" value="${esc(p.nombre)}" ${p.nombre === a.cliente ? 'checked' : ''} /> ${esc(p.nombre)} <small class="muted">· ${p.n} mensajes</small></label>`).join('')}</div>
    <label class="ld-tel">Teléfono del cliente <small class="muted">(si lo tienes guardado como contacto, la exportación no lo trae)</small><input id="ldTel" type="tel" value="${esc(a.telefono || '')}" placeholder="+56 9 …" /></label>
    ${audios ? `<label class="im-ck"><input type="checkbox" id="ldTx" checked /> ${audios > 1 ? `Transcribir los ${audios} audios` : 'Transcribir el audio'} para leerlo${audios > 1 ? 's' : ''} y analizarlo${audios > 1 ? 's' : ''}</label>` : ''}
    ${!a.conArchivos && (a.medios?.imagen || a.medios?.audio || a.medios?.omitido) ? '<p class="muted small">Se exportó sin archivos: las fotos y audios aparecerán como «no incluidos». Si los necesitas, exporta con «Incluir archivos».</p>' : ''}
    <p class="muted small">Asset leerá la conversación con IA para anotar qué busca el cliente y la próxima acción (1 token).</p>
    <p class="error" id="ldErr2"></p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Importar</button></div></div>`);
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async (e) => {
    const bt = e.currentTarget; const cli = document.querySelector('input[name="ldCli"]:checked')?.value;
    if (!cli) { $('#ldErr2').textContent = 'Elige quién es el cliente.'; return; }
    bt.disabled = true; bt.innerHTML = '<span class="spinner sm"></span> Importando…';
    try {
      const r = await api('leadsImportar', { token: a.token, cliente: cli, telefono: $('#ldTel').value.trim(), brokerNombre: await miNombre(), transcribir: !!$('#ldTx')?.checked });
      closeModal(); LD.sel = r.lead.id; LD.filtro = 'todos';
      toast(r.nuevo ? `Lead creado: ${r.agregados} mensajes.` : r.agregados ? `Se agregaron ${r.agregados} mensajes nuevos.` : 'No había mensajes nuevos.');
      if (r.ia?.error) toast('La conversación quedó guardada, pero no se pudo analizar con IA: ' + r.ia.error, 7000);
      abrir(r.lead.id);
    } catch (er) { bt.disabled = false; bt.textContent = 'Importar'; $('#ldErr2').textContent = er.message; }
  };
}
function modalError(msg, como = comoExportar) { modal(`<h2>No se pudo importar</h2><p>${esc(msg)}</p><div class="actions"><button class="secondary" id="ldVer">${como === comoInstagram ? 'Cómo descargar el historial de Instagram' : 'Cómo exportar un chat'}</button><button class="primary" id="mCancel">Cerrar</button></div>`); $('#mCancel').onclick = closeModal; $('#ldVer').onclick = como; }

// ---------- 0.16.21 · cuentas e historial: Instagram (archivo de «Descargar tu información»), WhatsApp, correo ----------
async function cuentas() {
  const cons = await api('leadsConsentimientos').catch(() => []);
  modal(`<div class="ld-cuentas"><h2>${icon('link', 18)} Cuentas e historial</h2>
    <p class="muted">Trae a Leads las conversaciones que la corredora ya tuvo con clientes. Asset solo lee: no responde ni publica nada en esas cuentas.</p>
    <div class="ld-cta"><div class="ld-cta-i ig">${icon('instagram', 20)}</div><div><b>Instagram · historial de mensajes</b><small>El dueño de la cuenta descarga sus mensajes desde Instagram y sube aquí el archivo. Cada conversación queda como un lead con su perfil y su historial.</small></div><button class="primary small" id="ldCtaIg">Importar</button></div>
    <div class="ld-cta"><div class="ld-cta-i wa">${icon('whatsapp', 20)}</div><div><b>WhatsApp · chat exportado</b><small>Un chat a la vez, exportado desde el teléfono del corredor.</small></div><button class="secondary small" id="ldCtaWa">Importar</button></div>
    <div class="ld-cta" id="ldObs"><div class="ld-cta-i vivo">${icon('sparkle', 20)}</div><div><b>En vivo desde wechatia · Instagram, Facebook y correo</b><small>Cada 2 minutos Asset lee los mensajes nuevos de las cuentas conectadas en wechatia y los anota en Leads. Solo lee: nunca responde por esos canales.</small></div><span class="ld-pronto">…</span></div>
    <div id="ldObsCfg"></div>
    ${cons.length ? `<h4 class="fb-sub">Autorizaciones registradas</h4><ul class="ld-cons">${cons.slice(0, 8).map((c) => `<li>${c.canal === 'instagram' ? icon('instagram', 12) : icon('whatsapp', 12)} <b>${esc(c.cuenta || '—')}</b> · autorizó ${esc(c.autorizadoPor || '—')} · ${esc(fechaCorta(c.fecha))} ${esc(c.fecha.slice(0, 4))} · ${c.conversaciones} conversaciones</li>`).join('')}</ul>` : ''}
    <div class="actions"><button class="secondary" id="mCancel">Cerrar</button></div></div>`);
  $('#mCancel').onclick = closeModal; $('#ldCtaIg').onclick = comoInstagram; $('#ldCtaWa').onclick = comoExportar;
  pintarObs(await api('obsEstado').catch(() => null));
}
function pintarObs(o) {
  const box = $('#ldObsCfg'); if (!box || !o) return;
  const hace = (f) => { if (!f) return 'nunca'; const m = Math.round((Date.now() - new Date(f)) / 6e4); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : fechaCorta(f); };
  $('#ldObs .ld-pronto').textContent = o.activo ? 'Activo' : 'Apagado'; $('#ldObs .ld-pronto').classList.toggle('on', !!o.activo);
  box.innerHTML = `<div class="ld-obs">
    <div class="ld-obs-can">${Object.entries(o.canalesTxt).map(([k, t]) => `<label class="im-ck"><input type="checkbox" data-can="${k}" ${o.canales[k] ? 'checked' : ''} /> <span>${esc(t)}${o.porCanal?.[k] ? ` <small class="muted">· ${o.porCanal[k]}</small>` : ''}</span></label>`).join('')}
      <label class="im-ck"><input type="checkbox" id="ldObsIA" ${o.ia ? 'checked' : ''} /> <span>Leer con IA (perfil, qué busca, contacto)</span></label></div>
    ${o.activo ? `<p class="muted small">Última revisión: ${esc(hace(o.ultima))}${o.leads ? ` · ${o.leads} lead${o.leads === 1 ? '' : 's'} en seguimiento` : ''}${o.ultimo?.mensajes ? ` · ${o.ultimo.mensajes} mensajes nuevos en la última` : ''}.</p>` : `<p class="muted small">Al activarlo se traen las conversaciones de los últimos ${o.diasInicio} días y desde ahí, lo nuevo.</p>
      <label class="im-ck ld-igok"><input type="checkbox" id="ldObsAut" /> <span>La corredora es dueña de estas cuentas y autoriza que Asset lea y guarde sus conversaciones.</span></label>`}
    ${o.error ? `<p class="error">${esc(o.error)}</p>` : ''}<p class="error" id="ldObsErr"></p>
    <div class="row">${o.activo ? `<button class="secondary small" id="ldObsYa">Revisar ahora</button><button class="ghost small" id="ldObsOff">Apagar</button>` : `<button class="primary small" id="ldObsOn">Activar</button>`}</div></div>`;
  const canales = () => Object.fromEntries([...box.querySelectorAll('[data-can]')].map((x) => [x.dataset.can, x.checked]));
  const cfg = async (o2) => { try { pintarObs(await api('obsConfigurar', { canales: canales(), ia: $('#ldObsIA').checked, ...o2 })); } catch (e) { $('#ldObsErr').textContent = e.message; } };
  box.querySelectorAll('[data-can], #ldObsIA').forEach((x) => (x.onchange = () => { if (o.activo) cfg({}); }));
  if ($('#ldObsOn')) $('#ldObsOn').onclick = () => { if (!$('#ldObsAut').checked) { $('#ldObsErr').textContent = 'Confirma la autorización de la corredora.'; return; } cfg({ activo: true, autorizado: true }).then(() => toast('Leads en vivo activado: Asset revisa wechatia cada 2 minutos.', 5000)); };
  if ($('#ldObsOff')) $('#ldObsOff').onclick = () => cfg({ activo: false });
  if ($('#ldObsYa')) $('#ldObsYa').onclick = async (e) => { const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Revisando…';
    try { const r = await api('obsRevisar'); pintarObs(r.estado); toast(r.error ? r.error : r.mensajes ? `${r.mensajes} mensajes nuevos${r.nuevos ? ` · ${r.nuevos} lead${r.nuevos === 1 ? '' : 's'} nuevo${r.nuevos === 1 ? '' : 's'}` : ''}.` : 'No hay mensajes nuevos.', 5000); lista(); }
    catch (er) { $('#ldObsErr').textContent = er.message; b.disabled = false; b.textContent = 'Revisar ahora'; } };
}
function comoInstagram() {
  modal(`<div class="ld-cuentas"><h2>${icon('instagram', 18)} Importar el historial de Instagram</h2>
    <p>Lo hace <b>el dueño de la cuenta</b> (o alguien con su clave), desde la app o desde instagram.com. Instagram tarda desde unos minutos hasta un par de días en preparar el archivo y avisa por correo.</p>
    <ol class="ld-ol">
      <li>En Instagram: <i>tu perfil</i> › menú <i>☰</i> › <i>Centro de cuentas</i>.</li>
      <li><i>Tu información y permisos</i> › <i>Descargar tu información</i> › <i>Descargar o transferir información</i>.</li>
      <li>Elige la cuenta de Instagram de la corredora › <i>Parte de tu información</i> › marca solo <b>Mensajes</b>.</li>
      <li><i>Descargar en el dispositivo</i> › Intervalo de fechas (por ejemplo, <i>Último año</i>) › Formato <b>JSON</b> (no HTML) › Calidad de archivos multimedia <i>Baja</i> (más liviano).</li>
      <li><i>Crear archivos</i>. Cuando llegue el correo, vuelve a <i>Descargar tu información</i> y pulsa <i>Descargar</i>.</li>
      <li>Sube aquí el .zip tal como se descargó (no lo descomprimas). Si Instagram lo dividió en varias partes, sube la que dice <i>messages</i>.</li>
    </ol>
    <p class="muted small">Asset muestra las conversaciones que trae el archivo y tú eliges cuáles importar. Queda registrado quién autorizó y cuándo. Si más adelante subes una descarga nueva, se agregan solo los mensajes nuevos.</p>
    <div class="actions"><button class="secondary" id="mCancel">Cerrar</button><button class="primary" id="ldIgElegir">${icon('upload', 15)} Elegir el archivo .zip</button></div></div>`);
  $('#mCancel').onclick = closeModal; $('#ldIgElegir').onclick = () => { closeModal(); $('#ldFileIg').click(); };
}
function importarInstagram(a) {
  const fmt = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(2, 4)}` : '');
  const conv = a.conversaciones; const sugerido = (c) => c.delCliente > 0 && !c.grupo && (!c.existente || c.existente.nuevos > 0);
  const partes = [...new Set(conv.flatMap((c) => c.participantes))];
  modal(`<div class="ld-imp ld-igimp"><h2>${icon('instagram', 18)} Historial de Instagram</h2>
    <p><b>${conv.length} conversaciones</b> en el archivo.</p>
    <div class="ld-bq"><label>Cuenta de la corredora <small class="muted">(sus mensajes quedan como «Tú»)</small>${a.dueno ? `<input id="ldIgDueno" value="${esc(a.dueno)}" readonly />` : `<select id="ldIgDueno">${partes.map((p) => `<option>${esc(p)}</option>`).join('')}</select>`}</label>
      <label>Usuario de Instagram <small class="muted">(opcional)</small><input id="ldIgCuenta" placeholder="@thelivingprop" /></label></div>
    <div class="ld-igbar"><b>Conversaciones</b><span class="spacer"></span><button class="ghost small" id="ldIgTodas">Todas</button><button class="ghost small" id="ldIgNinguna">Ninguna</button></div>
    <div class="ld-iglist">${conv.map((c) => `<label class="ld-igc-it"><input type="checkbox" data-hilo="${esc(c.id)}" ${sugerido(c) ? 'checked' : ''} />
      <span class="ld-av">${esc(ini(c.cliente))}</span><span><b>${esc(c.cliente || c.usuario)}</b>${c.usuario ? ` <small class="muted">@${esc(c.usuario)}</small>` : ''}
      <small>${c.total} mensajes · ${fmt(c.desde)} a ${fmt(c.hasta)}${c.fotos ? ` · ${c.fotos} foto${c.fotos > 1 ? 's' : ''}` : ''}${c.solicitud ? ' · <i>solicitud de mensaje</i>' : ''}${c.grupo ? ' · <i>grupo</i>' : ''}${!c.delCliente ? ' · <i>sin respuesta del cliente</i>' : ''}${c.existente ? ` · <i>ya está en Leads: ${c.existente.nuevos} nuevos</i>` : ''}</small></span></label>`).join('')}</div>
    <label class="im-ck"><input type="checkbox" id="ldIgIA" checked /> <span>Leer cada conversación con IA para anotar perfil, qué busca y próxima acción (<span id="ldIgN">0</span> token<span id="ldIgS">s</span>)</span></label>
    <label class="im-ck ld-igok"><input type="checkbox" id="ldIgAut" /> <span>Soy el dueño de esta cuenta de Instagram o tengo su autorización para guardar estas conversaciones en Asset.</span></label>
    <p class="error" id="ldErr2"></p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Importar</button></div></div>`);
  $('#modalCard').classList.add('im-wide');
  const marcadas = () => [...document.querySelectorAll('[data-hilo]')].filter((x) => x.checked).map((x) => x.dataset.hilo);
  const contar = () => { const n = conv.filter((c) => marcadas().includes(c.id) && c.delCliente).length; $('#ldIgN').textContent = n; $('#ldIgS').textContent = n === 1 ? '' : 's'; $('#mOk').textContent = `Importar ${marcadas().length}`; };
  document.querySelectorAll('[data-hilo]').forEach((x) => (x.onchange = contar)); contar();
  $('#ldIgTodas').onclick = () => { document.querySelectorAll('[data-hilo]').forEach((x) => (x.checked = true)); contar(); };
  $('#ldIgNinguna').onclick = () => { document.querySelectorAll('[data-hilo]').forEach((x) => (x.checked = false)); contar(); };
  const cerrar = () => { $('#modalCard').classList.remove('im-wide'); closeModal(); };
  $('#mCancel').onclick = cerrar;
  $('#mOk').onclick = async (e) => {
    const bt = e.currentTarget; const hilos = marcadas();
    if (!hilos.length) { $('#ldErr2').textContent = 'Elige al menos una conversación.'; return; }
    if (!$('#ldIgAut').checked) { $('#ldErr2').textContent = 'Confirma que tienes la autorización del dueño de la cuenta.'; return; }
    bt.disabled = true; bt.innerHTML = '<span class="spinner sm"></span> Importando…';
    try {
      const r = await api('leadsImportarInstagram', { token: a.token, hilos, dueno: $('#ldIgDueno').value, cuenta: $('#ldIgCuenta').value.trim(), autorizado: true, autorizadoPor: await miNombre(), analizarIA: $('#ldIgIA').checked });
      cerrar(); LD.filtro = 'todos'; if (r.primero) LD.sel = r.primero;
      toast(`Instagram: ${r.nuevos} lead${r.nuevos === 1 ? '' : 's'} nuevo${r.nuevos === 1 ? '' : 's'}${r.actualizados ? `, ${r.actualizados} actualizado${r.actualizados === 1 ? '' : 's'}` : ''} · ${r.mensajes} mensajes${r.analizados ? ` · ${r.analizados} leído${r.analizados === 1 ? '' : 's'} con IA` : ''}.`, 6000);
      if (r.errores?.length) toast('Algunas conversaciones no se pudieron leer con IA: ' + r.errores[0], 7000);
      abrir(LD.sel);
    } catch (er) { bt.disabled = false; contar(); $('#ldErr2').textContent = er.message; }
  };
}
function dropFiles(paths) { const p = (paths || []).find((x) => /\.(txt|zip)$/i.test(x)); if (!p) return modalError('Arrastra el archivo .txt o .zip que genera WhatsApp al exportar un chat.'); importarRuta(p); }

pf.onAgentEvent?.((e) => { if (e?.type === 'datos' && e.que === 'leads' && !$('#view-leads').classList.contains('hidden')) { lista(); if (e.id && e.id === LD.sel && !$('#ldRespTx')?.value) detalle(); } });
window.Leads = { abrir, mostrar, dropFiles, importarRuta, cuentas, comoExportar, comoInstagram, _LD: LD };
})();
