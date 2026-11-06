/* global $, api, esc, icon, toast, closeModal, ir, pf, liberar */
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
function comoExportar() { window.Ventanas.abrir('leads.comoExportar', {}, { clave: 'modal-33' }); }

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
    const quien = m.de === 'agente' ? `<em class="ld-ag">${icon('sparkle', 11)} ${esc(m.autor || 'Sofía (asistente)')}</em>` : m.de !== 'cliente' && (m.wa || l.mensajesLista.some((x) => x.de !== 'cliente' && x.autor !== m.autor)) ? `<em>${esc(m.autor)}</em>` : '';
    const can = m.canal || (m.ig ? 'instagram' : ''); const canIc = can === 'instagram' ? `<em class="ld-can">${icon('instagram', 11)} Instagram</em>` : can === 'email' ? `<em class="ld-can">${icon('mail', 11)} Correo</em>` : can === 'facebook' ? '<em class="ld-can">Messenger</em>' : '';
    html += `<div class="ld-m ${m.de === 'cliente' ? 'in' : 'out'}${m.de === 'agente' ? ' ld-ia' : ''}${m.fallido ? ' ld-nok' : ''}">${canIc && (l.canales?.length > 1 || l.wa) ? canIc : ''}${quien}${cuerpo}${m.texto ? `<span class="ld-t">${linkify(m.texto)}</span>` : ''}${m.fallido ? `<span class="ld-fail" title="${esc(m.fallido)}">${icon('alert', 12)} No entregado</span>` : ''}<small>${esc(m.fecha.slice(11, 16))}</small></div>`;
  }
  $('#ldChat').innerHTML = `<div class="ld-ch-h"><span class="ld-av">${esc(ini(nombreDe(l)))}</span><div><b>${esc(nombreDe(l))}</b><small>${esc([l.telefono && l.nombre ? l.telefono : '', l.origenTxt, `${l.mensajes} mensajes`, l.broker && 'broker: ' + l.broker].filter(Boolean).join(' · '))}</small></div>
      <span class="spacer"></span>${l.wa ? (l.atiende === 'corredor'
        ? `<span class="ld-atn yo">${icon('user', 12)} La atiendes tú</span><button class="ghost small" id="ldDevolver" title="Sofía vuelve a responderle sola">Devolver a Sofía</button>`
        : l.pausaHasta ? `<span class="ld-atn pausa" title="Le escribiste tú desde WhatsApp: Sofía no responde para no pisarte">${icon('clock', 12)} Sofía en pausa hasta las ${esc(new Date(l.pausaHasta).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }))}</span><button class="primary small" id="ldReanudar" title="Sofía vuelve a responder desde ya">Reanudar Sofía</button>`
        : `<span class="ld-atn ia">${icon('sparkle', 12)} Atiende Sofía</span><button class="primary small" id="ldTomar" title="Sofía deja de responder y la conversación pasa a ti">Tomar conversación</button>`)
      : `<span class="ld-ro" title="Es el registro de la conversación: se responde desde WhatsApp">${icon('lock', 12)} Solo lectura</span>`}</div>
    <div class="ld-ch-b" id="ldChB">${html || '<p class="muted ld-nada">Sin mensajes.</p>'}</div>
    ${l.wa && l.atiende === 'corredor' ? `<div class="ld-resp"><textarea id="ldRespTx" rows="2" placeholder="Escríbele a ${esc(nombreDe(l))} por WhatsApp…"></textarea><button class="primary small" id="ldRespOk">${icon('whatsapp', 13)} Enviar</button></div>` : ''}
    <div class="ld-ch-f"><small class="muted">Última importación: ${l.importaciones?.length ? esc(fechaCorta(l.importaciones.at(-1).fecha)) + ' · ' + l.importaciones.at(-1).nuevos + ' mensajes nuevos' : '—'}</small><span class="spacer"></span>
      <button class="ghost small" id="ldAct">${icon('upload', 13)} Agregar mensajes nuevos</button></div>`;
  const b = $('#ldChB'); b.scrollTop = b.scrollHeight;
  b.querySelectorAll('[data-url]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); pf.openUrl?.(a.dataset.url); }));
  b.querySelectorAll('[data-img]').forEach((im) => (im.onclick = () => window.Ventanas.abrir('leads.verImagen', { src: im.dataset.img }, { clave: 'modal-34' })));
  $('#ldAct').onclick = () => (l.ig ? comoInstagram() : $('#ldFile').click());
  // 0.16.9 · tomar / devolver la conversación de WhatsApp y responder desde aquí
  const recargar = async () => { await detalle(); lista(); };
  if ($('#ldTomar')) $('#ldTomar').onclick = async () => { try { await api('leadsAtencion', l.id, 'corredor'); toast('La conversación es tuya: Sofía deja de responderle.'); recargar(); } catch (e) { toast(e.message); } };
  if ($('#ldReanudar')) $('#ldReanudar').onclick = async () => { try { await api('leadsReanudar', l.id); toast('Sofía vuelve a responder en esta conversación.'); recargar(); } catch (e) { toast(e.message, 4000); } };
  if ($('#ldDevolver')) $('#ldDevolver').onclick = async () => { try { await api('leadsAtencion', l.id, 'agente'); toast('Sofía vuelve a atender a este lead.'); recargar(); } catch (e) { toast(e.message); } };
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
  $('#ldBorrar').onclick = () => window.Ventanas.abrir('leads.eliminar', { nombre: nombreDe(l), mensajes: l.mensajes,
    alEliminar: async () => { await api('leadsBorrar', l.id); closeModal(); LD.sel = null; toast('Lead eliminado.'); lista(); } }, { clave: 'modal-35' });
  f.querySelectorAll('[data-prop]').forEach((bt) => (bt.onclick = () => window.Inmo.abrirFicha(bt.dataset.prop)));
  f.querySelectorAll('[data-url]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); pf.openUrl?.(a.dataset.url); }));
}

// ---------- 0.16.23 · derivar al corredor dueño por WhatsApp ----------
async function derivar(l) {
  const v = await api('leadsDerivarVer', l.id).catch((e) => { toast(e.message); return null; }); if (!v) return;
  if (!v.corredor) return toast('Primero asigna el lead a un corredor.');
  window.Ventanas.abrir('leads.derivar', { corredor: v.corredor, texto: v.texto, alUsuarios: () => window.Usuarios?.abrir(), alAbrirEnlace: (url) => pf.openUrl?.(url),
    // si no sale por el número de la empresa, la ventana ofrece abrir tu WhatsApp con r.enlace
    alEnviar: async () => { const r = await api('leadsDerivar', l.id);
      if (r.ok) { closeModal(); toast(`Listo: ${v.corredor.nombre} recibió el lead por WhatsApp.`, 5000); }
      detalle(); lista(); return r; } }, { clave: 'modal-36' });
}
// ---------- importar un chat exportado ----------
async function importarRuta(ruta, canal) {
  let a;
  try { a = await api('leadsAnalizar', { ruta, canal, miNombre: await miNombre() }); } catch (e) { return /instagram|IG_|NO_IG/i.test(e.message + (e.code || '')) || canal === 'instagram' ? modalError(e.message, comoInstagram) : modalError(e.message); }
  if (a.tipo === 'instagram') return importarInstagram(a);
  const fmt = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');
  const med = Object.entries(a.medios || {}).sort((x, y) => ['imagen', 'audio', 'video', 'documento', 'contacto', 'omitido'].indexOf(x[0]) - ['imagen', 'audio', 'video', 'documento', 'contacto', 'omitido'].indexOf(y[0])).map(([k, n]) => `${n} ${{ imagen: n > 1 ? 'fotos' : 'foto', audio: n > 1 ? 'audios' : 'audio', video: n > 1 ? 'videos' : 'video', documento: n > 1 ? 'documentos' : 'documento', omitido: n > 1 ? 'archivos no incluidos' : 'archivo no incluido', contacto: 'contacto' }[k] || k}`).join(', ');
  const audios = a.conArchivos ? a.medios?.audio || 0 : 0;
  window.Ventanas.abrir('leads.importar', { total: a.total, rango: `del ${fmt(a.desde)} al ${fmt(a.hasta)}`, medios: med, existente: a.existente, cliente: a.cliente,
    participantes: a.participantes, telefono: a.telefono || '', audios, sinArchivos: !a.conArchivos && !!(a.medios?.imagen || a.medios?.audio || a.medios?.omitido),
    alImportar: async ({ cliente: cli, telefono, transcribir }) => {
      const r = await api('leadsImportar', { token: a.token, cliente: cli, telefono, brokerNombre: await miNombre(), transcribir });
      closeModal(); LD.sel = r.lead.id; LD.filtro = 'todos';
      toast(r.nuevo ? `Lead creado: ${r.agregados} mensajes.` : r.agregados ? `Se agregaron ${r.agregados} mensajes nuevos.` : 'No había mensajes nuevos.');
      if (r.ia?.error) toast('La conversación quedó guardada, pero no se pudo analizar con IA: ' + r.ia.error, 7000);
      abrir(r.lead.id);
    } }, { clave: 'modal-37' });
}
function modalError(msg, como = comoExportar) { window.Ventanas.abrir('leads.errorImportar', { mensaje: msg, instagram: como === comoInstagram, alVerComo: como }, { clave: 'modal-38' }); }

// ---------- 0.16.21 · cuentas e historial: Instagram (archivo de «Descargar tu información»), WhatsApp, correo ----------
async function cuentas() {
  const cons = await api('leadsConsentimientos').catch(() => []);
  // el panel «En vivo desde wechatia» (Instagram, Facebook y correo) se dibuja en la ventana con el estado de obsEstado
  window.Ventanas.abrir('leads.cuentas', { consentimientos: cons, fechaCorta, alInstagram: comoInstagram, alWhatsApp: comoExportar,
    alCargarObs: () => api('obsEstado').catch(() => null),
    alConfigurar: (cfg) => api('obsConfigurar', cfg),
    alRevisar: async () => { const r = await api('obsRevisar');
      toast(r.error ? r.error : r.mensajes ? `${r.mensajes} mensajes nuevos${r.nuevos ? ` · ${r.nuevos} lead${r.nuevos === 1 ? '' : 's'} nuevo${r.nuevos === 1 ? '' : 's'}` : ''}.` : 'No hay mensajes nuevos.', 5000); lista();
      return r.estado; } }, { clave: 'modal-39' });
}
function comoInstagram() { window.Ventanas.abrir('leads.comoInstagram', { alElegir: () => { closeModal(); $('#ldFileIg').click(); } }, { clave: 'modal-40' }); }
function importarInstagram(a) {
  const partes = [...new Set(a.conversaciones.flatMap((c) => c.participantes))];
  window.Ventanas.abrir('leads.importarInstagram', { conversaciones: a.conversaciones, dueno: a.dueno || null, participantes: partes,
    alImportar: async ({ hilos, dueno, cuenta, analizarIA }) => {
      const r = await api('leadsImportarInstagram', { token: a.token, hilos, dueno, cuenta, autorizado: true, autorizadoPor: await miNombre(), analizarIA });
      closeModal(); LD.filtro = 'todos'; if (r.primero) LD.sel = r.primero;
      toast(`Instagram: ${r.nuevos} lead${r.nuevos === 1 ? '' : 's'} nuevo${r.nuevos === 1 ? '' : 's'}${r.actualizados ? `, ${r.actualizados} actualizado${r.actualizados === 1 ? '' : 's'}` : ''} · ${r.mensajes} mensajes${r.analizados ? ` · ${r.analizados} leído${r.analizados === 1 ? '' : 's'} con IA` : ''}.`, 6000);
      if (r.errores?.length) toast('Algunas conversaciones no se pudieron leer con IA: ' + r.errores[0], 7000);
      abrir(LD.sel);
    } }, { clave: 'modal-41', ancho: true });
}
function dropFiles(paths) { const p = (paths || []).find((x) => /\.(txt|zip)$/i.test(x)); if (!p) return modalError('Arrastra el archivo .txt o .zip que genera WhatsApp al exportar un chat.'); importarRuta(p); }

pf.onAgentEvent?.((e) => { if (e?.type === 'datos' && e.que === 'leads' && !$('#view-leads').classList.contains('hidden')) { lista(); if (e.id && e.id === LD.sel && !$('#ldRespTx')?.value) detalle(); } });
window.Leads = { abrir, mostrar, dropFiles, importarRuta, cuentas, comoExportar, comoInstagram, _LD: LD };
})();
