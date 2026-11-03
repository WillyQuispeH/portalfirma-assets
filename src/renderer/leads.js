/* global $, api, esc, icon, toast, modal, closeModal, ir, pf */
'use strict';
// Leads (0.14): bandeja de clientes potenciales con su conversación de WhatsApp (como una ventana de WhatsApp,
// de solo lectura), su búsqueda leída por IA, su estado y la próxima acción. Entrada: chat exportado (.txt o .zip).
(() => {
const LD = { filtro: 'abiertos', q: '', origen: '', broker: '', sel: null, data: null, yo: null };
const FILTROS = [['abiertos', 'Abiertos'], ['nuevo', 'Nuevos'], ['seguimiento', 'Por seguir'], ['visita', 'Con visita'], ['ganado', 'Ganados'], ['perdido', 'Perdidos'], ['todos', 'Todos']];
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

async function abrir(id) {
  if (id) LD.sel = id; ir('leads');
  const v = $('#view-leads');
  if (!v.querySelector('.ld-wrap')) {
    v.innerHTML = `<div class="im-wrap ld-wrap">
      <div class="pv-h"><div><h1>Leads</h1><p class="muted">Tus conversaciones con clientes por WhatsApp, Instagram y correo: qué buscan, en qué quedaron y qué sigue.</p></div><span class="spacer"></span>
        <button class="secondary" id="ldCorBtn">${icon('users', 15)} Corredores</button><button class="secondary" id="ldCuentas">${icon('link', 15)} Cuentas e historial</button><button class="secondary" id="ldComo">${icon('help', 15)} Cómo exportar un chat</button><button class="primary" id="ldImp">${icon('upload', 15)} Importar chat</button>
        <input type="file" id="ldFile" accept=".txt,.zip,text/plain,application/zip" class="hidden" /><input type="file" id="ldFileIg" accept=".zip,application/zip" class="hidden" /></div>
      <div class="pv-ks ld-ks" id="ldKs"></div>
      <div class="ld-cols"><div class="ld-lista"><div class="ld-fil"><label class="ac-q">${icon('search', 14)}<input id="ldQ" placeholder="Nombre, teléfono, comuna o mensaje" spellcheck="false" /></label>
          <div class="ga-chips ld-chips" id="ldChips"></div><div class="ld-sel"><select id="ldOrigen"></select><select id="ldBroker"></select></div></div><div id="ldItems" class="ld-items"></div></div>
        <div class="ld-chat" id="ldChat"></div><div class="ld-ficha" id="ldFicha"></div></div></div>`;
    $('#ldImp').onclick = () => $('#ldFile').click();
    $('#ldFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importarRuta(pf.pathForFile(f)); };
    $('#ldComo').onclick = comoExportar; $('#ldCuentas').onclick = cuentas; $('#ldCorBtn').onclick = () => gestorCorredores();
    $('#ldFileIg').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importarRuta(pf.pathForFile(f), 'instagram'); };
    let t; $('#ldQ').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { LD.q = e.target.value; lista(); }, 200); };
    $('#ldOrigen').onchange = (e) => { LD.origen = e.target.value; lista(); };
    $('#ldBroker').onchange = (e) => { LD.broker = e.target.value; lista(); };
  }
  await lista();
}

async function lista() {
  const d = await api('leadsListar', { estado: LD.filtro === 'todos' ? undefined : LD.filtro, q: LD.q, origen: LD.origen || undefined, broker: LD.broker || undefined }); LD.data = d;
  const k = (n, l, s, f) => `<button class="pv-k ld-k ${LD.filtro === f ? 'on' : ''}" data-f="${f}"><b>${n ?? 0}</b><span>${l}</span>${s ? `<small>${s}</small>` : ''}</button>`;
  $('#ldKs').innerHTML = k(d.kpis.abiertos, 'abiertos', '', 'abiertos') + k(d.kpis.nuevos, 'nuevos', 'sin trabajar', 'nuevo') + k(d.kpis.seguimiento, 'por seguir', 'sin respuesta o acción vencida', 'seguimiento') + k(d.kpis.visitas, 'con visita', 'agendada', 'visita');
  $('#ldKs').querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { LD.filtro = b.dataset.f; lista(); }));
  $('#ldChips').innerHTML = FILTROS.map(([f, t]) => `<button data-f="${f}" class="${LD.filtro === f ? 'on' : ''}">${t}</button>`).join('');
  $('#ldChips').querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { LD.filtro = b.dataset.f; lista(); }));
  $('#ldOrigen').innerHTML = `<option value="">Todos los orígenes</option>${Object.entries(d.origenes).map(([k2, t]) => `<option value="${k2}" ${LD.origen === k2 ? 'selected' : ''}>${esc(t)}</option>`).join('')}`;
  $('#ldBroker').innerHTML = d.corredores.length ? `<option value="">Todos los corredores</option><option value="_sin" ${LD.broker === '_sin' ? 'selected' : ''}>Sin corredor${d.sinCorredor ? ` (${d.sinCorredor})` : ''}</option>${d.corredores.map((c) => `<option value="${esc(c.id)}" ${LD.broker === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}`
    : `<option value="">Todos los brokers</option>${d.brokers.map((b) => `<option ${LD.broker === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}`;
  $('#ldBroker').classList.toggle('hidden', !d.corredores.length && d.brokers.length < 2);
  const total = Object.values(d.cuenta).reduce((a, b) => a + b, 0);
  if (!total) { $('#ldItems').innerHTML = ''; return vacio(); }
  $('#ldItems').innerHTML = d.leads.length ? d.leads.map((l) => `<button class="ld-it ${LD.sel === l.id ? 'on' : ''}" data-id="${esc(l.id)}">
      <span class="ld-av${l.ig ? ' ig' : ''}">${esc(ini(nombreDe(l)))}</span><span class="ld-it-b"><span class="ld-it-r1"><b>${esc(nombreDe(l))}</b><small>${esc(fechaCorta(l.ultimo?.fecha))}</small></span>
      <span class="ld-it-r2"><span class="ld-prev">${l.ultimo?.de === 'broker' ? '<i>Tú:</i> ' : ''}${esc(l.ultimo?.texto || '')}</span>${l.noLeidos && l.id !== LD.sel ? `<i class="ld-nl">${l.noLeidos > 99 ? '99+' : l.noLeidos}</i>` : ''}</span>
      <span class="ld-it-r3"><i class="ld-e ${esc(l.estado)}">${esc(l.estadoTxt)}</i>${LD.data?.corredores?.length ? `<i class="ld-co${l.corredor ? '' : ' sin'}">${esc(l.corredor?.nombre || 'Sin corredor')}</i>` : ''}${l.sinRespuesta ? '<i class="ld-al">Sin respuesta</i>' : l.vencida ? '<i class="ld-al">Acción vencida</i>' : ''}${busquedaTxt(l.busqueda) ? `<small>${esc(busquedaTxt(l.busqueda))}</small>` : ''}</span></span></button>`).join('')
    : '<p class="muted small ld-nada">No hay leads con este filtro.</p>';
  $('#ldItems').querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => { LD.sel = b.dataset.id; $('#ldItems').querySelectorAll('.ld-it').forEach((x) => x.classList.toggle('on', x === b)); b.querySelector('.ld-nl')?.remove(); detalle(); }));
  if (!LD.sel || !d.leads.some((l) => l.id === LD.sel)) LD.sel = d.leads[0]?.id || null;
  $('#ldItems').querySelector(`[data-id="${CSS.escape(LD.sel || '')}"]`)?.classList.add('on');
  detalle();
}
function vacio() {
  $('#ldChat').innerHTML = `<div class="ld-vacio">${icon('whatsapp', 36)}<h2>Guarda aquí tus conversaciones con clientes</h2>
    <p class="muted">Exporta un chat de WhatsApp o el historial de Instagram y arrástralo a esta ventana. Asset lo ordena, entiende qué busca el cliente y te dice qué sigue.</p>
    <div class="ld-pasos"><div><b>iPhone</b><span>Abre el chat › toca el nombre arriba › <i>Exportar chat</i> › <i>Sin archivos</i> o <i>Incluir archivos</i>.</span></div>
    <div><b>Android</b><span>Abre el chat › ⋮ › <i>Más</i> › <i>Exportar chat</i> › <i>Sin archivos</i> o <i>Incluir archivos</i>.</span></div></div>
    <div class="row" style="justify-content:center"><button class="primary" id="ldImp2">${icon('upload', 15)} Importar chat</button><button class="secondary" id="ldIg2">${icon('instagram', 15)} Historial de Instagram</button></div></div>`;
  $('#ldFicha').innerHTML = ''; $('#ldImp2').onclick = () => $('#ldFile').click(); $('#ldIg2').onclick = comoInstagram;
}
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
  if (!LD.sel) { $('#ldChat').innerHTML = '<p class="muted ld-nada">Elige un lead.</p>'; $('#ldFicha').innerHTML = ''; return; }
  const l = await api('leadsObtener', LD.sel).catch((e) => { toast(e.message); return null; }); if (!l) return;
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
      : `<p class="error">Falta el celular de ${esc(v.corredor.nombre)}. Agrégalo en Corredores.</p>`}
    <p class="error" id="ldDvErr"></p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button>${v.corredor.celular ? '<button class="primary" id="mOk">Enviar aviso</button>' : '<button class="primary" id="ldDvCor">Corredores</button>'}</div></div>`);
  $('#mCancel').onclick = closeModal; if ($('#ldDvCor')) $('#ldDvCor').onclick = () => gestorCorredores();
  if ($('#mOk')) $('#mOk').onclick = async (e) => { const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Enviando…';
    try { const r = await api('leadsDerivar', l.id);
      if (r.ok) { closeModal(); toast(`Listo: ${v.corredor.nombre} recibió el lead por WhatsApp.`, 5000); }
      else { $('#ldDvErr').textContent = 'No salió desde el número de la empresa: ' + r.motivo; b.disabled = false; b.textContent = 'Abrir mi WhatsApp'; b.onclick = () => { pf.openUrl?.(r.enlace); closeModal(); }; }
      detalle(); lista();
    } catch (er) { $('#ldDvErr').textContent = er.message; b.disabled = false; b.textContent = 'Enviar aviso'; } };
}
// ---------- 0.16.23 · corredores (a quién pertenece cada lead) ----------
async function gestorCorredores(editar = null) {
  const cs = await api('corListar'); const u = LD.usuariosWc || null; const acc = await api('accEstado').catch(() => ({ esAdmin: true, nombre: 'Administrador' }));
  if (!acc.esAdmin) editar = null;
  const c = editar && editar.id ? cs.find((x) => x.id === editar.id) || {} : editar || null;
  modal(`<div class="ld-cuentas"><h2>${icon('users', 18)} Corredores</h2>
    <p class="muted">A quién pertenece cada lead. Si el corredor está vinculado con su usuario de wechatia, Asset toma el «Propietario» que allá tenga cada contacto.</p>
    <p class="ld-eq">${icon('user', 13)} Este equipo lo usa: <b>${esc(acc.nombre)}</b> · <a href="#" id="coEq">cambiar</a></p>
    <ul class="ld-cors">${cs.map((x) => `<li><span class="ld-av">${esc(ini(x.nombre))}</span><span><b>${esc(x.nombre)}</b><small>${esc([x.celular, x.email].filter(Boolean).join(' · ') || 'Sin datos de contacto')} · ${x.wechatiaId ? `wechatia: ${esc(x.wechatiaNombre || x.wechatiaId)}` : '<i>sin vincular a wechatia</i>'}</small></span>${acc.esAdmin ? `<button class="ghost small" data-ed="${esc(x.id)}">Editar</button><button class="ghost small" data-del="${esc(x.id)}">Quitar</button>` : ''}</li>`).join('') || '<li class="muted small">Aún no hay corredores.</li>'}</ul>
    ${c ? `<div class="ld-bq ld-corf"><label>Nombre<input id="coN" value="${esc(c.nombre || '')}" /></label><label>Celular<input id="coC" value="${esc(c.celular || '')}" placeholder="+56 9 …" /></label><label>Correo<input id="coE" type="email" value="${esc(c.email || '')}" /></label>
      <label>Usuario en wechatia${u?.usuarios?.length ? `<select id="coW"><option value="">— sin vincular —</option>${u.usuarios.map((w) => `<option value="${esc(w.id)}" data-n="${esc(w.nombre)}" ${c.wechatiaId === w.id ? 'selected' : ''}>${esc(w.nombre)}${w.email ? ' · ' + esc(w.email) : ''}</option>`).join('')}</select>` : `<input id="coW" value="${esc(c.wechatiaId || '')}" placeholder="ID de usuario (opcional)" />`}</label></div>
      ${u?.error ? `<p class="muted small">${esc(u.error)}</p>` : ''}<div class="row"><button class="primary small" id="coOk">${c.id ? 'Guardar' : 'Agregar'}</button>${!u ? '<button class="ghost small" id="coWc">Traer usuarios de wechatia</button>' : ''}</div>` : acc.esAdmin ? '<div class="row"><button class="primary small" id="coNuevo">Agregar corredor</button></div>' : '<p class="muted small">Agregar o editar corredores lo hace el administrador.</p>'}
    <p class="error" id="coErr"></p><div class="actions"><button class="secondary" id="mCancel">Cerrar</button></div></div>`);
  $('#mCancel').onclick = () => { closeModal(); if (!$('#view-leads').classList.contains('hidden')) lista(); };
  if ($('#coNuevo')) $('#coNuevo').onclick = () => gestorCorredores({});
  $('#coEq').onclick = (e) => { e.preventDefault(); window.Inmo.equipo(() => gestorCorredores()); };
  document.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => gestorCorredores({ id: b.dataset.ed })));
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { await api('corBorrar', b.dataset.del); gestorCorredores(); }));
  if ($('#coWc')) $('#coWc').onclick = async () => { LD.usuariosWc = await api('corUsuarios'); gestorCorredores({ ...c, nombre: $('#coN').value, celular: $('#coC').value, email: $('#coE').value }); };
  if ($('#coOk')) $('#coOk').onclick = async () => { const w = $('#coW'); const wn = w.tagName === 'SELECT' ? w.selectedOptions[0]?.dataset.n || '' : '';
    try { await api('corGuardar', { id: c.id, nombre: $('#coN').value, celular: $('#coC').value, email: $('#coE').value, wechatiaId: w.value, wechatiaNombre: wn }); toast('Corredor guardado.'); gestorCorredores(); } catch (e) { $('#coErr').textContent = e.message; } };
  if ($('#coN')) $('#coN').focus();
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
window.Leads = { abrir, dropFiles, importarRuta, gestorCorredores, _LD: LD };
})();
