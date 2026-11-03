/* global pf, $, esc, toast, modal, closeModal, icon, ir, api, cargar, IM */
'use strict';
// ============================================================================
// Agente Asset: una conversación al estilo Claude/Gemini, a pantalla completa (pestaña «Agente») o como panel
// lateral junto a cualquier pantalla (botón de la barra superior). Es el mismo chat en los dos lugares.
// Acciones rápidas para lo frecuente; «Gestionar una propiedad» abre un flujo guiado con tarjetas
// (propiedad → documento → firma → seguimiento) que convive con la conversación.
// Lo que cobra, envía o notifica se confirma aquí; la clave del certificado y el código SMS se escriben
// en un campo protegido y van directo a Portalfirma (nunca al modelo de IA).
// ============================================================================
(() => {
const A = { open: false, modo: 'panel', items: [], adjuntos: [], busy: false, tools: null, acoplar: false, n: 0, conv: null, ctx: { tipo: 'inicio' }, turno: [], convs: [], q: '' };
const SUGIERE = [
  ['calendar', 'Agenda una visita mañana a las 11:00 en CV-5514 con Ana Rojas'],
  ['file', 'Haz el contrato de corretaje de CV-5514 con su propietario'],
  ['coins', 'Baja el arriendo de CV-5514 a $900.000'],
  ['listCheck', '¿Quién falta por firmar en la operación 4424?'],
];
const RAPIDAS = [
  ['gestionar', 'house', 'Gestionar una propiedad', () => window.Gestion.iniciar()],
  ['documento', 'filePlus', 'Generar un documento', () => window.Gestion.iniciar({ destino: 'documento' })],
  ['visita', 'calendar', 'Agendar una visita', () => window.Gestion.agendar({ propId: datos().propId })],
  ['nueva', 'mic', 'Subir una propiedad', () => window.Dictado.abrir()],
  ['firmas', 'sign', 'Seguimiento de firmas', () => window.Gestion.firmas()],
  ['hoy', 'clock', '¿Qué tengo hoy?', () => enviar('¿Qué tengo hoy?')],
];
const NOMBRE = {
  asset_resumen: 'Resumen del día', asset_buscar_propiedades: 'Buscar propiedades', asset_ver_propiedad: 'Ficha de la propiedad', asset_buscar_personas: 'Buscar personas', asset_ver_persona: 'Ficha de la persona',
  asset_listar_negocios: 'Negocios', asset_ver_negocio: 'Detalle del negocio', asset_agenda: 'Agenda', asset_interesados: 'Interesados', asset_crear_propiedad: 'Crear propiedad', asset_actualizar_propiedad: 'Actualizar propiedad',
  asset_cambiar_estado: 'Cambiar estado', asset_crear_persona: 'Crear persona', asset_vincular_persona: 'Vincular persona', asset_nota: 'Nota', asset_crear_negocio: 'Crear negocio', asset_mover_negocio: 'Mover negocio',
  asset_tarea_negocio: 'Tarea del negocio', asset_proxima_accion: 'Próxima acción', asset_vincular_firma: 'Vincular firma', asset_cerrar_negocio: 'Cerrar negocio', asset_crear_evento: 'Agendar', asset_actualizar_evento: 'Actualizar evento',
  asset_orden_visita: 'Orden de visita', asset_publicar_portal: 'Publicar en Portal Inmobiliario', asset_aviso_portal: 'Aviso del portal', asset_sincronizar_portal: 'Sincronizar portal', asset_abrir: 'Abrir pantalla',
  asset_plantillas: 'Plantillas de documentos', asset_formulario_documento: 'Preparar documento', asset_generar_documento: 'Generar documento', asset_seguimiento_firma: 'Seguimiento de firma',
  get_partner_session: 'Sesión de la empresa', ingest_document_tools: 'Subir documento', search_document_content: 'Buscar en el documento', extract_signers_document_tools: 'Extraer firmantes',
  send_to_sign_document_tools: 'Enviar a firmar', process_detail_get_by_operation: 'Detalle de operación', operation_get_operation_by_rut: 'Operaciones por RUT', operation_get_operation_by_phone: 'Operaciones por teléfono',
  operation_manage_signing_tools: 'Gestionar firmantes', sign_documents_cds_massive_tools: 'Firma con certificado CDS', wallet_manage_balance_tools: 'Saldo', template_manage_tools: 'Plantillas', property_manage_tools: 'Propiedades',
};
const nombre = (n) => NOMBRE[n] || n.replace(/_/g, ' ');
const ICO_ACC = { estadoProp: 'house', confirmar: 'whatsapp', agendar: 'calendar', documento: 'filePlus', orden: 'sign', mover: 'arrowR', negocio: 'briefcase', negocioNuevo: 'briefcase', publicar: 'export', interesados: 'users' };
// Siguiente paso: después de cada acción, botones con lo que normalmente sigue (acciones fijas, sin pasar por el modelo)
const SIG = {
  agendar: ['calendar', 'Agendar una visita', (d) => window.Gestion.agendar({ propId: d.propId, personaId: d.personaId, negocioId: d.negocioId })],
  documento: ['filePlus', 'Generar un documento', (d) => (d.propId ? window.Gestion.documento(d.propId) : window.Gestion.iniciar({ destino: 'documento' }))],
  negocio: ['briefcase', 'Ver el negocio', (d) => d.negocioId && contexto({ tipo: 'negocio', id: d.negocioId }, { ver: true })],
  orden: ['sign', 'Generar la orden de visita', async (d) => { if (!d.eventoId) return toast('Primero agenda la visita.'); const e = await api('agendaObtener', d.eventoId); window.Agenda.ordenVisita(e, (r) => { decir(`Orden de visita enviada a firmar: operación ${r.operacion}.`); contexto({ tipo: 'operacion', op: r.operacion, propId: e.prop?.id || null }); festejo(); sugerir(['estado', 'ops']); }); }],
  otra: ['plus', 'Agendar otra', (d) => window.Gestion.agendar({ propId: d.propId })],
  estado: ['rotateR', 'Ver estado de la firma', (d) => d.op && contexto({ tipo: 'operacion', op: d.op, propId: d.propId }, { ver: true })],
  ops: ['listCheck', 'Seguir en Operaciones', (d) => window.Gestion.operaciones(d.op)],
  propietario: ['user', 'Agregar al propietario', (d) => prellenar(`El propietario de ${d.codigo || 'la propiedad'} es `)],
  publicar: ['export', 'Publicar en Portal Inmobiliario', (d) => enviar(`Publica ${d.codigo || 'la propiedad'} en Portal Inmobiliario`)],
  crearNegocio: ['briefcase', 'Crear un negocio', (d) => prellenar(`Crea un negocio ${d.codigo ? 'de ' + d.codigo + ' ' : ''}con `)],
  verProp: ['house', 'Ver la propiedad', (d) => d.propId && contexto({ tipo: 'propiedad', id: d.propId }, { ver: true })],
};
const SIG_TRAS = { asset_crear_negocio: ['agendar', 'documento', 'negocio'], asset_mover_negocio: ['documento', 'agendar', 'negocio'], asset_crear_evento: ['orden', 'otra'], asset_crear_propiedad: ['propietario', 'publicar', 'documento'],
  asset_crear_persona: ['crearNegocio', 'agendar'], asset_vincular_persona: ['crearNegocio', 'documento'], asset_orden_visita: ['estado', 'ops'], asset_generar_documento: ['estado', 'ops'], asset_actualizar_propiedad: ['publicar', 'documento', 'verProp'], asset_cambiar_estado: ['verProp'] };
// Lo que se sabe del trabajo en curso (lienzo + contexto), para que los botones no pregunten de nuevo
function datos(extra = {}) {
  const L = window.Lienzo?.actual() || {}; const c = A.ctx || {};
  return { propId: c.tipo === 'propiedad' ? c.id : c.propId || L.prop?.id || L.negocio?.propId || null, negocioId: c.tipo === 'negocio' ? c.id : L.negocio?.id || null, personaId: L.negocio?.clienteId || null,
    op: c.op || L.op || null, eventoId: c.eventoId || null, codigo: L.prop?.codigo || null, ...extra };
}
const SECRETO = { clave_certificado: ['Clave del certificado', 'password'], segundo_factor: ['Código recibido por SMS o WhatsApp', 'text'] };
const primerNombre = () => { const n = String(window.Usuario?._u?.user?.namePerson || '').trim().split(/\s+/)[0] || ''; return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : ''; };

// texto del agente: enlaces clicables, negritas, listas y saltos de línea
function md(t) {
  const fmt = (l) => l.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(«])\*([^*\n]+)\*(?=$|[\s.,;:)»!?])/g, '$1<b>$2</b>').replace(/(https?:\/\/[^\s<)]+)/g, (u) => `<a href="#" data-url="${u}">${/flow\.cl/.test(u) ? 'Pagar en Flow' : u.length > 48 ? u.slice(0, 46) + '…' : u}</a>`);
  let out = ''; let ul = false;
  for (const l0 of esc(t || '').split('\n')) {
    const l = fmt(l0);
    if (/^\s*[-•*]\s+/.test(l)) { if (!ul) { out += '<ul>'; ul = true; } out += '<li>' + l.replace(/^\s*[-•*]\s+/, '') + '</li>'; }
    else { if (ul) { out += '</ul>'; ul = false; } out += l + '<br>'; }
  }
  return (ul ? out + '</ul>' : out).replace(/(<br>)+$/, '');
}

function shell() {
  if ($('#agDrawer')) return;
  const d = document.createElement('aside'); d.id = 'agDrawer'; d.className = 'ag hidden';
  d.innerHTML = `<div class="ag-side" id="agSide"><button class="ag-newc" id="agNewC">${icon('plus', 15)}<span>Nueva conversación</span></button>
      <label class="ag-cq">${icon('search', 14)}<input id="agConvQ" placeholder="Buscar conversaciones" spellcheck="false" /></label><div class="ag-cl" id="agConvs"></div></div>
    <div class="ag-main"><div class="ag-head"><span class="ag-logo">${icon('sparkle', 16)}</span><div class="ag-t"><b>Agente Asset</b><small id="agSub">Propiedades, negocios, agenda y firmas</small></div>
      <button class="ibtn ag-wab" id="agWa" title="Agente por WhatsApp">${icon('whatsapp', 15)}</button><span class="ag-mmw"><button class="ibtn" id="agMore" title="Más opciones" aria-haspopup="true" aria-expanded="false">···</button><span class="ag-mm hidden" id="agMm"><button id="agReset">${icon('plus', 14)} Nueva conversación</button><button id="agTools">${icon('grid', 14)} Lo que puede hacer el Agente</button><button id="agLog">${icon('listCheck', 14)} Actividad</button><button id="agIA">${icon('lock', 14)} Clave de IA</button></span></span>
      <button class="ibtn ag-only-panel" id="agFull" title="Abrir en pantalla completa">${icon('maximize', 15)}</button><button class="ibtn ag-only-panel" id="agClose" title="Cerrar">${icon('x', 15)}</button></div>
    <div class="ag-body" id="agBody"></div>
    <div class="ag-foot">
      <div class="ag-quick hidden" id="agQuick" role="menu">${RAPIDAS.map(([id, ic, t]) => `<button data-rapida="${id}" role="menuitem">${icon(ic, 14)}<span>${esc(t)}</span></button>`).join('')}</div>
      <div class="ag-box">
        <div class="ag-att" id="agAtt"></div>
        <textarea id="agQ" rows="1" placeholder="Pídele algo al Agente…"></textarea>
        <div class="ag-boxb"><button class="ag-ib" id="agClip" title="Adjuntar PDF o Word">${icon('plus', 17)}</button><button class="ag-ib ag-ibt" id="agMas" title="Acciones" aria-haspopup="true" aria-expanded="false">${icon('flow', 15)}<span>Acciones</span></button>
          <span class="spacer"></span><small class="ag-hint">Enter envía · Mayús+Enter salto</small><span id="agMic"></span><button class="ag-send" id="agSend" title="Enviar">${icon('arrowR', 17)}</button></div>
      </div>
      <small class="ag-note">${icon('lock', 11)} Lo que cobra o envía te pide confirmación. Las claves van directo a Portalfirma.</small></div></div>
    <aside class="ag-canvas" id="agCanvas"></aside>`;
  document.body.appendChild(d);
  $('#agClose').onclick = close; $('#agReset').onclick = nueva; $('#agNewC').onclick = nueva;
  $('#agConvQ').oninput = (e) => { A.q = e.target.value; clearTimeout(A._q); A._q = setTimeout(listarConvs, 200); }; $('#agTools').onclick = verTools; $('#agWa').onclick = () => window.WhatsAppAgente.abrir(); $('#agLog').onclick = verLog; $('#agIA').onclick = claveIA; $('#agFull').onclick = () => vista();
  window.Dictado?.microfono($('#agMic'), { alTexto: (t) => { const q = $('#agQ'); q.value = [q.value.trim(), t].filter(Boolean).join(' '); q.oninput?.(); enviar(); } });
  $('#agClip').onclick = adjuntarMenu; $('#agSend').onclick = () => enviar(); const menu = (btn, el) => { const abrir = el.classList.contains('hidden'); document.querySelectorAll('#agQuick, #agMm').forEach((x) => x.classList.add('hidden')); document.querySelectorAll('#agMas, #agMore').forEach((x) => x.setAttribute('aria-expanded', 'false')); if (abrir) { el.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); if (el.id === 'agQuick') { const f = el.parentElement.getBoundingClientRect(); const r = btn.getBoundingClientRect(); el.style.left = Math.max(0, r.left - f.left) + 'px'; el.style.bottom = (f.bottom - r.top + 8) + 'px'; } } };
  $('#agMas').onclick = (e) => { e.stopPropagation(); menu($('#agMas'), $('#agQuick')); }; $('#agMore').onclick = (e) => { e.stopPropagation(); menu($('#agMore'), $('#agMm')); };
  document.addEventListener('click', (e) => { if (!e.target.closest('#agQuick, #agMas, #agMm, #agMore')) { $('#agQuick')?.classList.add('hidden'); $('#agMm')?.classList.add('hidden'); } });
  $('#agMm').addEventListener('click', () => $('#agMm').classList.add('hidden'));
  d.querySelectorAll('[data-rapida]').forEach((b) => (b.onclick = () => { $('#agQuick').classList.add('hidden'); if (A.busy) return toast('Espera a que el agente termine.'); RAPIDAS.find((x) => x[0] === b.dataset.rapida)[3](); }));
    const q = $('#agQ');
  q.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } };
  q.oninput = () => { q.style.height = 'auto'; q.style.height = Math.min(q.scrollHeight, 180) + 'px'; };
  d.addEventListener('click', (e) => { const a = e.target.closest('[data-url]'); if (a) { e.preventDefault(); pf.openUrl(a.dataset.url); } });
}

function pintar() {
  const b = $('#agBody'); if (!b) return;
  const vacio = !A.items.length; $('#agDrawer').classList.toggle('vacio', vacio);
  const n = primerNombre();
  b.innerHTML = vacio ? `<div class="ag-empty"><span class="ag-big">${icon('sparkle', 26)}</span><h1 class="ag-hola">${n ? `Hola, ${esc(n)}` : 'Hola'}</h1><p>Pídemelo en tus palabras o con un audio.</p></div>` : A.items.map(item).join('');
  // las tarjetas del flujo guiado conservan su estado: se reinsertan sus nodos
  b.querySelectorAll('[data-slot]').forEach((s) => { const it = A.items.find((x) => x.k === 'card' && String(x.id) === s.dataset.slot); if (it) s.replaceWith(it.node); });
  b.querySelectorAll('[data-rec],[data-verp]').forEach((x) => (x.onclick = () => { if (A.busy) return toast('Espera a que el agente termine.'); window.Gestion.estado(x.dataset.rec || x.dataset.verp, { usuario: x.dataset.rec ? `Retomar ${x.dataset.cod}` : null }); }));
  b.querySelectorAll('[data-sug2]').forEach((row) => { const m = A.items[Number(row.dataset.sug2)];
    row.querySelectorAll('[data-si2]').forEach((x) => (x.onclick = () => { if (A.busy) return toast('Espera a que el agente termine.'); m.usado = true; pintar(); guardar(); accion(m.lista[Number(x.dataset.si2)].accion); }));
    row.querySelector('[data-no2]').onclick = () => { m.usado = true; pintar(); guardar(); }; });
  b.querySelectorAll('[data-sig]').forEach((row) => row.querySelectorAll('[data-sk]').forEach((x) => (x.onclick = () => { const m = A.items[Number(row.dataset.sig)]; if (A.busy) return toast('Espera a que el agente termine.'); m.usado = true; pintar(); SIG[x.dataset.sk][2](datos(m.datos)); })));
  b.querySelectorAll('[data-conf]').forEach((card) => {
    const id = card.dataset.conf;
    card.querySelector('[data-no]').onclick = () => confirmar(id, false, card);
    card.querySelector('[data-si]').onclick = () => confirmar(id, true, card);
    card.querySelectorAll('input[data-sec]').forEach((i) => (i.onkeydown = (e) => { if (e.key === 'Enter') confirmar(id, true, card); }));
  });
  b.scrollTop = b.scrollHeight;
  $('#agAtt').innerHTML = A.adjuntos.map((a) => `<span class="ag-chip">${icon('file', 12)} ${esc(a.name)}${a.subido ? ' <i>subido</i>' : ''}<button data-rm="${esc(a.name)}" title="Quitar">${icon('x', 11)}</button></span>`).join('');
  $('#agAtt').querySelectorAll('[data-rm]').forEach((x) => (x.onclick = async () => { const r = await pf.agentUnattach(x.dataset.rm); if (r.ok) { A.adjuntos = r.data; pintar(); } }));
  $('#agSend').disabled = A.busy; $('#agQ').disabled = A.busy;
}
function item(m) {
  if (m.k === 'user') return `<div class="ag-msg user">${esc(m.text).replace(/\n/g, '<br>')}</div>`;
  if (m.k === 'bot') return `<div class="ag-msg bot">${md(m.text)}</div>`;
  if (m.k === 'nota') return `<div class="ag-msg bot soft">${md(m.text)}</div>`;
  if (m.k === 'card') return `<div data-slot="${m.id}"></div>`;
  if (m.k === 'hecho') return `<div class="ga hecha"><span class="ga-ok">${icon('check', 13)}</span><span>${esc(m.text)}</span>${m.propId ? `<button class="ghost small" data-verp="${esc(m.propId)}">Ver estado</button>` : ''}</div>`;
  if (m.k === 'sug2') return m.usado ? '' : `<div class="ag-sig sug2" data-sug2="${A.items.indexOf(m)}"><small>Siguiente paso · opcional</small>${m.lista.map((x, i) => `<button data-si2="${i}">${icon(ICO_ACC[x.accion?.tipo] || 'arrowR', 14)}<span>${esc(x.label)}</span></button>`).join('')}<button class="ag-sig-no" data-no2>Ahora no</button></div>`;
  if (m.k === 'sig') return m.usado ? '' : `<div class="ag-sig" data-sig="${A.items.indexOf(m)}"><small>Siguiente paso</small>${m.opciones.filter((k) => SIG[k]).map((k) => `<button data-sk="${k}">${icon(SIG[k][0], 14)}<span>${SIG[k][1]}</span></button>`).join('')}</div>`;
  if (m.k === 'error') return `<div class="ag-msg err">${icon('alert', 13)} ${esc(m.text)}</div>`;
  if (m.k === 'pensando') return '<div class="ag-think"><span></span><span></span><span></span></div>';
  if (m.k === 'tool') return `<div class="ag-tool ${m.estado}" title="${esc(m.name)}"><span class="ag-dot"></span>${esc(nombre(m.name))}${m.args?.action ? ` · ${esc(m.args.action.replace(/_/g, ' '))}` : ''}<em>${{ corriendo: 'trabajando…', ok: 'listo', error: 'error', cancelado: 'cancelado', esperando: 'esperando tu confirmación' }[m.estado] || ''}</em>${m.resumen ? `<small>${esc(m.resumen)}</small>` : ''}${m.url ? `<a href="#" data-url="${esc(m.url)}">${/flow\.cl/.test(m.url) ? 'Pagar en Flow' : 'Abrir enlace'}</a>` : ''}</div>`;
  if (m.k === 'confirm') {
    if (m.hecho) return `<div class="ag-conf done ${m.hecho}"><b>${esc(m.titulo)}</b><small>${m.hecho === 'si' ? 'Confirmado' : 'Cancelado'}</small></div>`;
    return `<div class="ag-conf" data-conf="${esc(m.id)}"><div class="ag-conf-h">${icon('alert', 14)}<b>${esc(m.titulo)}</b></div>
      ${(m.detalle || []).length ? `<ul>${m.detalle.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}${m.aviso ? `<p>${esc(m.aviso)}</p>` : ''}
      ${(m.secretos || []).map((k) => `<label class="ag-sec">${icon('lock', 12)} ${SECRETO[k][0]}<input data-sec="${k}" type="${SECRETO[k][1]}" autocomplete="off" spellcheck="false" /></label>`).join('')}
      ${(m.secretos || []).length ? '<small class="muted">Se entrega directo a Portalfirma. No se guarda ni pasa por la IA.</small>' : ''}
      <div class="ag-conf-b"><button class="ghost small" data-no>Cancelar</button><button class="primary small" data-si>Confirmar</button></div></div>`;
  }
  return '';
}

function confirmar(id, ok, card) {
  const secretos = {}; let falta = false;
  card.querySelectorAll('input[data-sec]').forEach((i) => { secretos[i.dataset.sec] = i.value; if (ok && !i.value.trim()) falta = true; i.value = ''; });
  if (falta) return toast('Completa el dato protegido para continuar.');
  const m = A.items.find((x) => x.k === 'confirm' && x.id === id); if (m) m.hecho = ok ? 'si' : 'no';
  const t = A.items.find((x) => x.k === 'tool' && x.id === id); if (t) t.estado = ok ? 'corriendo' : 'cancelado';
  pf.agentConfirm(id, { ok, secretos: ok ? secretos : {} });
  pintar();
}

pf.onAgentEvent((e) => {
  if (e.type === 'tool') {
    let t = A.items.find((x) => x.k === 'tool' && x.id === e.id);
    if (!t) { t = { k: 'tool', id: e.id }; const p = A.items.findIndex((x) => x.k === 'pensando'); if (p >= 0) A.items.splice(p, 0, t); else A.items.push(t); }
    Object.assign(t, { name: e.name, estado: e.estado, ...(e.args ? { args: e.args } : {}), resumen: e.resumen || '', url: e.url || null });
    if (e.estado === 'ok') A.turno.push(e.name);
    if (e.name === 'ingest_document_tools' && e.estado === 'ok') A.adjuntos.forEach((a) => { if (e.resumen?.includes(a.name)) a.subido = true; });
  } else if (e.type === 'confirm') {
    const t = A.items.find((x) => x.k === 'tool' && x.id === e.id); if (t) t.estado = 'esperando';
    const p = A.items.findIndex((x) => x.k === 'pensando'); const c = { k: 'confirm', ...e }; if (p >= 0) A.items.splice(p, 0, c); else A.items.push(c);
    if (!A.open) openPanel();
  } else if (e.type === 'navegar') {
    if (e.pantalla === 'operaciones') { window.Gestion?.operaciones(e.id); return; }
    if (A.modo === 'full' && !e.explicito) return; // a pantalla completa, el lienzo muestra el resultado sin salir del chat
    if (A.modo === 'full') { A.acoplar = true; } // «abre…»: la pantalla se abre y el chat sigue al lado
    window.AssetNav?.(e.pantalla, e.id); return;
  } else if (e.type === 'whatsapp') { listarConvs(); if (A.conv?.id === 'whatsapp' && !A.busy && e.que === 'conversacion') abrirConv('whatsapp'); window.WhatsAppAgente?.refrescar?.(); return;
  } else if (e.type === 'aviso') { toast(e.texto, 10000); return;
  } else if (e.type === 'tarjeta' && e.tipo === 'dictado') { window.Dictado?.mostrar(e.r, e.texto); return;
  } else if (e.type === 'datos' && e.que === 'postventa') { window.Postventa?.refrescar?.(); return;
  } else if (e.type === 'datos') { clearTimeout(A._ref); A._ref = setTimeout(() => { window.AssetRefrescar?.(); if (lienzoVisible()) window.Lienzo.refrescar(); }, 250); return;
  } else if (e.type === 'contexto') { contexto(e); return;
  } else if (e.type === 'sugerencias') { A._sug = e.lista; return;
  } else if (e.type === 'nota') { const p = A.items.findIndex((x) => x.k === 'pensando'); A.items.splice(p >= 0 ? p : A.items.length, 0, { k: 'nota', text: e.text }); }
  pintar();
  if (e.type === 'confirm') setTimeout(() => $(`[data-conf="${e.id}"] input`)?.focus(), 50);
});

async function enviar(texto) {
  shell();
  const q = $('#agQ'); const t = (texto ?? q.value).trim(); if (!t || A.busy) return;
  // solo un código («CV-5549»): muestra cómo está la propiedad sin pasar por la IA
  if (/^[a-z]{1,5}-?\d{2,6}$/i.test(t)) { await cargar(); const c = t.toUpperCase().replace(/^([A-Z]+)-?/, '$1-'); const p = IM.data.propiedades.find((x) => String(x.codigo).toUpperCase() === c);
    if (p) { q.value = ''; q.style.height = 'auto'; A.items.forEach((x) => { if (x.k === 'sig' || x.k === 'sug2') x.usado = true; }); return window.Gestion.estado(p.id, { usuario: t }); } }
  if (!(await window.Asistente.ensureConsent())) return;
  if (!A.open) openPanel();
  q.value = ''; q.style.height = 'auto'; A.busy = true; A.turno = []; A._sug = null; A.items.forEach((x) => { if (x.k === 'sig' || x.k === 'sug2') x.usado = true; }); A.items.push({ k: 'user', text: t }, { k: 'pensando' }); pintar();
  const r = await pf.agentSend(t);
  A.items = A.items.filter((x) => x.k !== 'pensando'); A.busy = false;
  if (r.ok) { if (r.data.text) A.items.push({ k: 'bot', text: r.data.text }); window.Usuario?.refresh?.();
    const ult = [...(r.data.herramientas?.length ? r.data.herramientas : A.turno)].reverse().find((n) => SIG_TRAS[n]); const sg = r.data.sugerencias || A._sug; if (sg?.length) A.items.push({ k: 'sug2', lista: sg }); else if (ult) A.items.push({ k: 'sig', opciones: SIG_TRAS[ult] }); A._sug = null; }
  else if (r.code === 'NEEDS_LOGIN') { A.items.push({ k: 'error', text: 'Tu sesión de Portalfirma expiró. Inicia sesión de nuevo.' }); }
  else A.items.push({ k: 'error', text: r.error || 'No se pudo completar.' });
  pintar(); $('#agQ').focus(); guardar();
}
function prellenar(t) { shell(); if (!A.open) openPanel(); const q = $('#agQ'); q.value = t; q.focus(); q.setSelectionRange(t.length, t.length); q.oninput(); }

// API para el flujo guiado (tarjetas que viven dentro de la conversación)
function tarjeta(node, { usuario } = {}) {
  shell(); if (!A.open) openPanel(); const id = ++A.n; if (usuario) A.items.push({ k: 'user', text: usuario, deCard: id }); A.items.push({ k: 'card', id, node });
  if (!node.querySelector(':scope > .ga-x')) { const x = document.createElement('button'); x.className = 'ga-x'; x.title = 'Cerrar'; x.innerHTML = icon('x', 14); x.onclick = () => quitar(node); node.prepend(x); }
  quitarEspera(); pintar(); guardar(); irA(node); return id;
}
// llevar la vista a la tarjeta nueva (arriba de la tarjeta, junto a su mensaje), aunque carguen imágenes después
function irA(node) {
  const b = $('#agBody'); if (!b) return;
  const ir = () => { const prev = node.previousElementSibling; const ancla = prev?.classList.contains('user') ? prev : node; const top = ancla.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - 10; b.scrollTo({ top: Math.max(0, top), behavior: 'smooth' }); };
  requestAnimationFrame(() => requestAnimationFrame(ir));
  node.querySelectorAll('img').forEach((im) => { if (!im.complete) im.addEventListener('load', ir, { once: true }); });
  node.classList.remove('ga-nueva'); void node.offsetWidth; node.classList.add('ga-nueva');
}
// mientras una acción prepara su tarjeta, se ve que el agente está trabajando
function esperar() { if (A.items.some((x) => x.k === 'pensando')) return; A.items.push({ k: 'pensando' }); pintar(); }
function quitarEspera() { if (!A.busy) A.items = A.items.filter((x) => x.k !== 'pensando'); }
// cerrar una tarjeta sin hacer nada (se tocó por error): desaparece junto con su mensaje
function quitar(node) {
  const it = A.items.find((x) => x.k === 'card' && x.node === node); if (!it) return;
  A.items = A.items.filter((x) => x !== it && x.deCard !== it.id); pintar(); guardar(); $('#agQ')?.focus();
}
function decir(text, k = 'bot') { shell(); if (!A.open) openPanel(); quitarEspera(); A.items.push({ k, text }); pintar(); guardar(); }
function sugerir(opciones, d) { A.items.push({ k: 'sig', opciones, datos: d || null }); pintar(); guardar(); }
const lienzoOn = () => { const on = !!(A.ctx && A.ctx.tipo && A.ctx.tipo !== 'inicio'); $('#agDrawer')?.classList.toggle('lz-off', !on); return on; };
const lienzoVisible = () => A.modo === 'full' && A.open && !!$('#agCanvas') && lienzoOn() && getComputedStyle($('#agCanvas')).display !== 'none';
function contexto(c, { ver } = {}) { const { type, ...x } = c; A.ctx = x; if (lienzoVisible()) window.Lienzo.mostrar(x); else if (ver) { vista(); } guardar(); }
function festejo() { const d0 = $('#agDrawer'); const d = d0 && !d0.classList.contains('hidden') ? d0 : document.body; const f = document.createElement('div'); f.className = 'ag-festejo'; f.innerHTML = Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join(''); d.appendChild(f); setTimeout(() => f.remove(), 1400); }
// ---------- sugerencias (siguiente paso, opcional): acciones fijas, sin pasar por el modelo ----------
function sugerencias(lista) { if (!lista?.length) return; A.items.forEach((x) => { if (x.k === 'sug2') x.usado = true; }); A.items.push({ k: 'sug2', lista }); pintar(); guardar(); }
async function accion(a = {}) {
  if (!A.busy) esperar(); setTimeout(() => { if (!A.busy && A.items.some((x) => x.k === 'pensando')) { quitarEspera(); pintar(); } }, 8000);
  try {
    const t = a.tipo; const ref = () => { window.AssetRefrescar?.(); if (lienzoVisible()) window.Lienzo.refrescar(); };
    if (t === 'agendar') return window.Gestion.agendar({ tipo: 'visita', propId: a.propId || null, personaId: a.personaId || null, negocioId: a.negocioId || null, fecha: a.fecha || undefined, hora: a.hora || undefined });
    if (t === 'documento') return a.propId ? window.Gestion.documento(a.propId) : window.Gestion.iniciar({ destino: 'documento' });
    if (t === 'orden') { const e = await api('agendaObtener', a.eventoId); return window.Agenda.ordenVisita(e, (r) => { decir(`Orden de visita enviada a firmar: operación ${r.operacion}.`); contexto({ tipo: 'operacion', op: r.operacion, propId: e.prop?.id || null }); festejo(); sugerir(['estado', 'ops'], { op: r.operacion, propId: e.prop?.id || null }); }); }
    if (t === 'mover') { const r = await api('assetEjecutar', 'asset_mover_negocio', { negocio: a.negocioId, etapa: a.etapa }); decir(`Listo: negocio en «${r.negocio.etapa}».${(r.avisos || []).length ? ' ' + r.avisos.join(' ') : ''}`); festejo(); ref(); return; }
    if (t === 'negocio') { const n = await api('negObtener', a.negocioId); return contexto(n.propId ? { tipo: 'propiedad', id: n.propId, negocio: n.id } : { tipo: 'negocio', id: n.id }, { ver: true }); }
    if (t === 'negocioNuevo') { await cargar(); const p = IM.data.propiedades.find((x) => x.id === a.propId); return prellenar(`Crea un negocio de ${p?.arriendo ? 'arriendo' : 'venta'} de ${p?.codigo || ''} con `); }
    if (t === 'estadoProp') return window.Gestion.estado(a.propId, { usuario: 'Ver estado de la propiedad' });
    if (t === 'confirmar') return window.Gestion.confirmar(a.eventoId, a.personaId || null);
    if (t === 'fotosDrive') return window.Fotos.drive(a.propId);
    if (t === 'ficha') { acoplar(); return window.Inmo.abrirFicha(a.propId); }
    if (t === 'docNuevo') return window.Gestion.docNuevo({ propId: a.propId || null, titulo: a.titulo || '', tipoDoc: a.tipoDoc || null, personaId: a.personaId || null });
    if (t === 'plantilla') return a.propId ? window.Gestion.usarPlantilla(a.propId, a.plantillaId, a.nombre) : window.Gestion.iniciar({ destino: 'documento' });
    if (t === 'pdf') return api('dgAbrir', a.archivo);
    if (t === 'publicar') { acoplar(); return window.Publicaciones.publicar(a.propId); }
    if (t === 'interesados') { acoplar(); return window.Publicaciones.abrir('interesados'); }
  } catch (e) { toast(e.message, 5000); } finally { if (!A.busy && A.items.some((x) => x.k === 'pensando')) { quitarEspera(); pintar(); } }
}
function recientesHtml() {
  let l = []; try { l = JSON.parse(localStorage.getItem('pf.recientes') || '[]'); } catch { l = []; }
  return l.length ? `<div class="ag-rec"><small>Retomar</small>${l.slice(0, 4).map((x) => `<button data-rec="${esc(x.id)}" data-cod="${esc(x.codigo)}">${icon('house', 14)}<span><b>${esc(x.codigo)}</b> ${esc(String(x.titulo || '').slice(0, 34))}</span></button>`).join('')}</div>` : '';
}
// ---------- conversaciones guardadas ----------
function serial() {
  return A.items.filter((x) => x.k !== 'pensando' && !(x.k === 'sig' && x.usado)).map((x) => (x.k === 'card' ? { k: 'hecho', text: x.node.dataset.resumen || x.node.innerText.replace(/\s+/g, ' ').trim().slice(0, 160), ...(x.node.dataset.prop ? { propId: x.node.dataset.prop } : {}) }
    : x.k === 'confirm' && !x.hecho ? { ...x, hecho: 'no' } : x.k === 'tool' && x.estado === 'corriendo' ? { ...x, estado: 'cancelado' } : x));
}
function guardar() {
  if (!A.items.some((x) => x.k === 'user' || x.k === 'card')) return;
  if (!A.conv) A.conv = { id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
  clearTimeout(A._g); A._g = setTimeout(async () => { const r = await pf.convGuardar(A.conv.id, { items: serial(), ctx: A.ctx }); if (r.ok) { A.conv.titulo = r.data.titulo; listarConvs(); } }, 300);
}
const cuando = (iso) => { const d = new Date(iso); const h = new Date(); const dd = Math.floor((new Date(h.toDateString()) - new Date(d.toDateString())) / 864e5); return dd <= 0 ? d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : dd === 1 ? 'Ayer' : dd < 7 ? `Hace ${dd} días` : d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }); };
async function listarConvs() {
  const h = $('#agConvs'); if (!h) return; const r = await pf.convListar(A.q); A.convs = r.ok ? r.data : [];
  const grupo = (c) => (c.fijada ? 'Fijadas' : (Date.now() - new Date(c.actualizado)) < 864e5 && new Date(c.actualizado).toDateString() === new Date().toDateString() ? 'Hoy' : (Date.now() - new Date(c.actualizado)) < 7 * 864e5 ? 'Esta semana' : 'Anteriores');
  let g0 = ''; h.innerHTML = A.convs.length ? A.convs.map((c) => { const g = grupo(c); const t = g !== g0 ? `<h5>${g}</h5>` : ''; g0 = g;
    return `${t}<div class="ag-ci ${A.conv?.id === c.id ? 'on' : ''}" data-c="${esc(c.id)}"><button class="ag-cit" data-abrir><b>${esc(c.titulo || 'Conversación')}</b><small>${esc(cuando(c.actualizado))}${c.resumen ? ' · ' + esc(c.resumen) : ''}</small></button>
      <span class="ag-cia"><button data-fijar title="${c.fijada ? 'Quitar de fijadas' : 'Fijar arriba'}" class="${c.fijada ? 'on' : ''}">${icon('bookmark', 13)}</button><button data-ren title="Cambiar nombre">${icon('edit', 13)}</button><button data-del title="Eliminar">${icon('trash', 13)}</button></span></div>`; }).join('')
    : `<p class="ag-cvac">${A.q ? 'Sin resultados.' : 'Aquí quedan tus conversaciones para retomarlas cuando quieras.'}</p>`;
  h.querySelectorAll('[data-c]').forEach((row) => { const id = row.dataset.c; const c = A.convs.find((x) => x.id === id);
    row.querySelector('[data-abrir]').onclick = () => abrirConv(id);
    row.querySelector('[data-fijar]').onclick = async () => { await pf.convFijar(id, !c.fijada); listarConvs(); };
    row.querySelector('[data-ren]').onclick = () => renombrar(c);
    row.querySelector('[data-del]').onclick = () => borrarConv(c); });
}
async function abrirConv(id) {
  if (A.busy) return toast('Espera a que el agente termine.');
  const r = await pf.convAbrir(id); if (!r.ok) return toast(r.error, 4000);
  A.conv = { id, titulo: r.data.titulo }; A.items = r.data.items || []; A.adjuntos = []; A.ctx = r.data.ctx || { tipo: 'inicio' };
  pintar(); listarConvs(); if (lienzoVisible()) window.Lienzo.mostrar(A.ctx);
  if (A.ctx.tipo === 'propiedad' && A.ctx.id) window.Gestion.estado(A.ctx.id); // continuidad: cómo está hoy la propiedad de esa conversación
}
function renombrar(c) {
  modal(`<div class="im-form"><h2>Cambiar nombre</h2><input id="cvN" value="${esc(c.titulo || '')}" maxlength="80" /><p class="error" id="cvE"></p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Guardar</button></div></div>`);
  const ok = async () => { const r = await pf.convRenombrar(c.id, $('#cvN').value); if (!r.ok) { $('#cvE').textContent = r.error; return; } closeModal(); if (A.conv?.id === c.id) A.conv.titulo = r.data.titulo; listarConvs(); };
  $('#mCancel').onclick = closeModal; $('#mOk').onclick = ok; $('#cvN').onkeydown = (e) => { if (e.key === 'Enter') ok(); }; setTimeout(() => $('#cvN').select(), 30);
}
function borrarConv(c) {
  modal(`<div class="im-form"><h2>¿Eliminar la conversación?</h2><p>«${esc(c.titulo || 'Conversación')}» se borra de este computador. Lo que se hizo en ella (propiedades, negocios, agenda, firmas) no cambia.</p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Eliminar</button></div></div>`);
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async () => { await pf.convBorrar(c.id); closeModal(); if (A.conv?.id === c.id) await nueva(); listarConvs(); toast('Conversación eliminada.'); };
}
function bajar() { const b = $('#agBody'); if (b) b.scrollTop = b.scrollHeight; }

async function adjuntarMenu() {
  const doc = window.editor?.docName?.();
  if (!doc) return elegir();
  modal(`<h3>Adjuntar al agente</h3><div class="ag-pick"><button class="secondary with-ic" id="agDoc">${icon('file', 15)}<span>Documento abierto: «${esc(doc)}»</span></button><button class="secondary with-ic" id="agFile">${icon('folderOpen', 15)}<span>Elegir PDF o Word…</span></button></div><div class="row-end"><button class="ghost" id="agNo">Cancelar</button></div>`);
  $('#agNo').onclick = closeModal; $('#agFile').onclick = () => { closeModal(); elegir(); };
  $('#agDoc').onclick = async () => {
    closeModal(); let bytes; try { bytes = await window.editor.finalBytes(); } catch (e) { return toast('No se pudo preparar el documento: ' + (e.message || e), 4000); } if (!bytes) return;
    const name = /\.pdf$/i.test(doc) ? doc : doc.replace(/\.[^.]+$/, '') + '.pdf';
    const r = await pf.agentAttach(name, bytes); if (!r.ok) return toast(r.error, 4000); A.adjuntos = r.data; pintar(); $('#agQ').focus();
  };
}
async function elegir() { const r = await pf.agentPick(); if (!r.ok) return toast(r.error, 4000); if (r.data) { A.adjuntos = r.data; pintar(); } }

async function nueva() {
  if (A.busy) return toast('Espera a que el agente termine.');
  await pf.convNueva(); A.conv = null; A.items = []; A.adjuntos = []; A.ctx = { tipo: 'inicio' }; pintar(); listarConvs(); if (lienzoVisible()) window.Lienzo.mostrar(A.ctx); setTimeout(() => $('#agQ')?.focus(), 30);
}
async function verTools() {
  const r = await pf.agentTools(); if (!r.ok) return toast(r.code === 'NEEDS_LOGIN' ? 'Inicia sesión en Portalfirma.' : r.error);
  modal(`<h3>Herramientas del Agente</h3><p class="muted small">El agente usa ${r.data.length} herramientas: las de PortalFirma Asset y las que publica hoy el servidor de Portalfirma. Si Portalfirma agrega nuevas, aparecen solas.</p>
    <div class="ag-tl">${r.data.map((t) => `<div><b>${esc(nombre(t.name))}</b><code>${esc(t.name)}</code><small>${esc((t.description || '').slice(0, 220))}</small></div>`).join('')}</div><div class="row-end"><button class="primary" id="agOk">Cerrar</button></div>`);
  $('#agOk').onclick = closeModal;
}
async function verLog() {
  const r = await pf.agentLog(); const l = r.ok ? r.data : [];
  modal(`<h3>Actividad del agente</h3><p class="muted small">Acciones realizadas en este computador (sin claves ni documentos).</p>
    <div class="ag-tl">${l.length ? l.map((x) => `<div class="${x.ok ? '' : 'bad'}"><b>${esc(x.resumen || nombre(x.tool))}</b><code>${esc(nombre(x.tool))}${x.action ? ' · ' + esc(x.action) : ''}</code><small>${new Date(x.t).toLocaleString('es-CL')}</small></div>`).join('') : '<p class="muted small">Todavía no hay actividad.</p>'}</div><div class="row-end"><button class="primary" id="agOk">Cerrar</button></div>`);
  $('#agOk').onclick = closeModal;
}

// ---------- pantalla completa ↔ panel lateral ----------
function aPanel() { const d = $('#agDrawer'); if (!d) return; d.classList.remove('ag-full'); document.body.appendChild(d); A.modo = 'panel'; }
function openPanel() {
  shell(); if (A.modo === 'full' && $('#view-agente').classList.contains('hidden')) aPanel();
  A.open = true; $('#agDrawer').classList.remove('hidden'); document.body.classList.toggle('ag-on', A.modo === 'panel'); $('#agBtn')?.classList.add('on'); pintar(); setTimeout(() => $('#agQ')?.focus(), 60);
}
function open() { return window.members(openPanel, 'El Agente Portalfirma trabaja con tu cuenta. Inicia sesión para usarlo.'); }
function close() { A.open = false; $('#agDrawer')?.classList.add('hidden'); document.body.classList.remove('ag-on'); $('#agBtn')?.classList.remove('on'); }
function toggle() { if (A.modo === 'full' && A.open) return $('#agQ')?.focus(); return A.open ? close() : open(); }
function vista() {
  return window.members(() => {
    shell(); ir('agente'); const d = $('#agDrawer'); $('#view-agente').appendChild(d); d.classList.add('ag-full'); d.classList.remove('hidden');
    A.modo = 'full'; A.open = true; document.body.classList.remove('ag-on'); $('#agBtn')?.classList.remove('on'); pintar(); listarConvs(); lienzoOn(); window.Lienzo.mostrar(A.ctx); setTimeout(() => $('#agQ')?.focus(), 60);
  }, 'El Agente Portalfirma trabaja con tu cuenta. Inicia sesión para usarlo.');
}
// cada vez que cambia la pantalla: si el chat estaba a pantalla completa, pasa a panel (abierto si se pidió acoplar)
function alMostrar(view) {
  if (view === 'agente' || A.modo !== 'full') return;
  aPanel(); if (A.acoplar) { A.acoplar = false; openPanel(); } else close();
}
function acoplar() { A.acoplar = A.modo === 'full'; }

// botón en la barra superior
const b = document.createElement('button'); b.id = 'agBtn'; b.className = 'ag-btn'; b.title = 'Agente Portalfirma';
b.innerHTML = `${icon('sparkle', 15)}<span>Agente</span>`; b.onclick = toggle;
const acc = $('#account'); acc?.parentNode.insertBefore(b, acc);

window.Agente = { open, close, toggle, enviar, vista, alMostrar, acoplar, tarjeta, decir, bajar, prellenar, sugerir, sugerencias, accion, quitar, contexto, festejo, guardar, nueva, _a: A };
// 0.16.28 · clave de IA (OpenAI): el administrador pega una nueva si la incluida deja de funcionar
async function claveIA() {
  const r = await pf.aiStatus?.(); const st = r?.ok ? r.data : {};
  modal(`<div class="im-form"><h2>${icon('lock', 18)} Clave de IA</h2>
    <p class="muted">Asset usa OpenAI para el Agente, Fernanda y la lectura de documentos. ${st.propia ? `Ahora usa una clave propia (termina en …${esc(st.keyEnd)}).` : st.managed ? 'Ahora usa la clave incluida con la app.' : st.keyEnd ? `Clave guardada: termina en …${esc(st.keyEnd)}.` : 'No hay clave.'}</p>
    <p class="muted small">Si OpenAI rechaza la clave, crea una nueva en platform.openai.com › API keys (con límite de gasto) y pégala aquí. Queda cifrada en este computador y reemplaza a la incluida.</p>
    <label>Nueva clave<input id="iaK" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…" /></label>
    <p class="error" id="iaErr"></p>
    <div class="actions">${st.propia ? '<button class="ghost" id="iaQuitar">Volver a la clave incluida</button>' : ''}<button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Guardar</button></div></div>`);
  $('#mCancel').onclick = closeModal;
  $('#iaQuitar')?.addEventListener('click', async () => { const x = await pf.aiConfig({ key: '' }); if (!x.ok) { $('#iaErr').textContent = x.error; return; } closeModal(); toast('Vuelve a usar la clave incluida.'); });
  $('#mOk').onclick = async () => { const k = $('#iaK').value.trim(); if (!k) { $('#iaErr').textContent = 'Pega la clave.'; return; }
    const x = await pf.aiConfig({ key: k }); $('#iaK').value = ''; if (!x.ok) { $('#iaErr').textContent = x.error; return; } closeModal(); toast('Clave de IA guardada de forma cifrada en este computador.'); };
}
})();
