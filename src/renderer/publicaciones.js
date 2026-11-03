/* global pf, $, api, esc, icon, toast, modal, closeModal, IM, cargar, precio, ir */
'use strict';
// ============================================================================
// Publicaciones: la parte comercial, separada del resto de la gestión.
// Una propiedad → botón «Publicar» → 1. Calidad del aviso (con redacción por IA) → 2. Portales → 3. Publicar.
// Después: Avisos (rendimiento y recomendaciones de precio), Interesados (bandeja única) y Portales (conexiones).
// ============================================================================
(() => {
const PB = { tab: 'avisos', fl: 'nuevo', q: '', tok: 0 };
const ST = { active: ['Activo', 'ok'], publicada: ['Publicado', 'ok'], en_feed: ['En el feed', 'wait'], pendiente: ['En espera', 'res'], paused: ['Pausado', 'res'], under_review: ['En revisión', 'wait'], closed: ['Finalizado', ''], retirada: ['Retirado', ''], vencida: ['Vencido', 'bad'] };
const LST = { nuevo: ['Nuevos', 'bad'], contactado: ['Contactados', 'wait'], visita: ['Con visita', 'ok'], descartado: ['Descartados', ''] };
const VIA = { api: 'API', feed: 'Feed diario', acuerdo: 'Acuerdo comercial' };
const host = () => $('#view-publicaciones');
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-CL'));
const hace = (iso) => { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso)) / 6e4); return m < 60 ? `hace ${Math.max(m, 1)} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
const anillo = (n, big) => { const c = n >= 85 ? '#16a34a' : n >= 65 ? '#4f6ef0' : n >= 40 ? '#d97706' : '#dc2626'; return `<span class="pb-ring ${big ? 'big' : ''}" style="--p:${n};--c:${c}"><b>${n}</b>${big ? '<small>de 100</small>' : ''}</span>`; };
const chip = (s) => { const [t, c] = ST[s] || [s || '—', '']; return `<i class="im-st ${c}">${t}</i>`; };
const foto = (u) => (u ? `<img src="${esc(u)}" class="im-img" alt="" loading="lazy" />` : `<span class="ga-noph">${icon('house', 20)}</span>`);

function cabeza() {
  return `<div class="im-head fx-portales"><div><h1>Publicaciones</h1><p class="muted">Sube la propiedad, pulsa «Publicar» y Asset la lleva a los portales. Aquí ves cómo rinde cada aviso y a quién responder.</p></div>
    <span class="pb-hb"><button class="secondary" id="pbSync">${icon('rotateR', 15)} Actualizar</button><button class="primary" id="pbNew">${icon('export', 15)} Publicar una propiedad</button></span></div>
    <div class="im-seg pb-tabs" id="pbTabs">${[['avisos', 'Avisos'], ['interesados', 'Interesados'], ['portales', 'Portales']].map(([k, t]) => `<button data-t="${k}" class="${PB.tab === k ? 'on' : ''}">${t}<i data-n="${k}"></i></button>`).join('')}</div><div id="pbBody">${'<div class="ga-load"><span class="spinner sm"></span>Cargando…</div>'}</div>`;
}
async function abrir(tab) {
  if (tab) PB.tab = tab; const tok = ir('publicaciones'); PB.tok = tok;
  host().innerHTML = `<div class="im-wrap pb-wrap">${cabeza()}</div>`;
  $('#pbTabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) abrir(b.dataset.t); };
  $('#pbNew').onclick = elegirPropiedad;
  $('#pbSync').onclick = async () => { const b = $('#pbSync'); b.disabled = true; b.classList.add('spin'); try { const r = await api('pubSincronizar'); toast(['Portales actualizados.', ...(r.chilepropiedades?.leads ? [`${r.chilepropiedades.leads} interesados nuevos de Chilepropiedades.`] : []), ...(r.pi?.leads ? [`${r.pi.leads} interesados nuevos de Portal Inmobiliario.`] : []), ...r.errores].join(' '), 5000); abrir(); } catch (er) { toast(er.message, 5000); b.disabled = false; } };
  await cargar(); if (tok !== IM.tok) return;
  const [pn, li] = await Promise.all([api('pubPanel'), api('pubInteresados', {})]); if (tok !== IM.tok) return;
  host().querySelector('[data-n="avisos"]').textContent = pn.totales.avisos || ''; host().querySelector('[data-n="interesados"]').textContent = li.cuenta.nuevo || '';
  host().querySelector('[data-n="interesados"]').classList.toggle('hot', !!li.cuenta.nuevo);
  if (PB.tab === 'avisos') return vAvisos(pn);
  if (PB.tab === 'interesados') return vInteresados();
  return vPortales();
}

// ---------- avisos y rendimiento ----------
function vAvisos(d) {
  const t = d.totales;
  $('#pbBody').innerHTML = `<div class="pb-kpis">${[['Avisos', t.avisos, 'export'], ['Visitas', fmt(t.visitas), 'search'], ['Contactos', fmt(t.contactos), 'phone'], ['Interesados nuevos', t.nuevos, 'users'], ['Alertas', t.alertas, 'alert']].map(([k, v, ic]) => `<div class="pb-kpi ${k === 'Alertas' && v ? 'bad' : ''}">${icon(ic, 16)}<b>${v}</b><small>${k}</small></div>`).join('')}</div>
    ${d.sync ? `<p class="muted small pb-sync">Datos de los portales ${hace(d.sync)}. Portal Inmobiliario: últimos 30 días. Chilepropiedades: acumulado.</p>` : '<p class="muted small pb-sync">Pulsa «Actualizar» para traer visitas, contactos e interesados desde los portales.</p>'}
    ${d.avisos.length ? `<div class="pb-list">${d.avisos.map((f) => `<article class="pb-av" data-prop="${esc(f.propId)}" data-op="${f.op}">
      <span class="ga-ph">${foto(f.foto)}</span>
      <div class="pb-avt"><small>${esc(f.codigo)} · ${f.op === 'venta' ? 'Venta' : 'Arriendo'} · ${esc(f.comuna || '')}</small><b>${esc(f.titulo)}</b><em>${precio(f.precio) || '—'}</em>
        <span class="pb-pts">${f.portales.map((x) => `<span class="pb-pt">${esc(x.nombre)} ${chip(x.status)}${x.url ? `<a href="#" data-url="${esc(x.url)}" title="Ver aviso">${icon('link', 12)}</a>` : ''}</span>`).join('')}</span></div>
      <div class="pb-met"><span><b>${fmt(f.visitas)}</b><small>visitas</small></span><span><b>${fmt(f.contactos)}</b><small>contactos</small></span><span class="${f.nuevos ? 'hot' : ''}"><b>${f.interesados}</b><small>${f.nuevos ? f.nuevos + ' nuevos' : 'interesados'}</small></span>${anillo(f.calidad)}</div>
      ${f.recomendaciones.length ? `<div class="pb-recs">${f.recomendaciones.slice(0, 2).map((r) => `<p class="pb-rec ${r.grave ? 'bad' : ''}">${icon(r.tipo === 'precio' ? 'coins' : r.tipo === 'calidad' ? 'sparkle' : 'chart', 14)}<span><b>${esc(r.t)}</b> ${esc(r.accion)}</span>${r.tipo === 'precio' ? '<button class="secondary small" data-precio>Ajustar precio</button>' : '<button class="secondary small" data-mejorar>Mejorar aviso</button>'}</p>`).join('')}</div>` : `<div class="pb-recs"><p class="pb-rec ok">${icon('check', 14)}<span>Sin alertas. ${f.comparables?.dif != null ? `Precio por m² ${f.comparables.dif >= 0 ? f.comparables.dif + '% sobre' : Math.abs(f.comparables.dif) + '% bajo'} la mediana de tu cartera en la comuna.` : ''}</span></p></div>`}
      <div class="pb-acts"><button class="ghost small" data-mas>${icon('export', 14)} Más portales</button><button class="ghost small" data-ficha>${icon('file', 14)} Ficha</button></div></article>`).join('')}</div>`
    : `<div class="pb-empty">${icon('export', 30)}<b>Todavía no hay avisos publicados</b><p>Elige una propiedad y pulsa «Publicar»: Asset revisa el aviso, te ayuda a mejorarlo y lo lleva a los portales.</p><button class="primary" id="pbNew2">Publicar una propiedad</button></div>`}
    ${d.sinPublicar.length ? `<section class="pb-sec"><h3>Disponibles sin publicar <i>${d.sinPublicar.length}</i></h3><div class="pb-sp">${d.sinPublicar.slice(0, 12).map((x) => `<button data-pub="${esc(x.propId)}">${anillo(x.calidad)}<span><b>${esc(x.codigo)}</b><small>${esc(x.titulo)}</small></span>${icon('chevR', 14)}</button>`).join('')}</div></section>` : ''}`;
  const b = $('#pbBody');
  $('#pbNew2')?.addEventListener('click', elegirPropiedad);
  b.querySelectorAll('[data-pub]').forEach((x) => (x.onclick = () => publicar(x.dataset.pub)));
  b.querySelectorAll('[data-url]').forEach((x) => (x.onclick = (e) => { e.preventDefault(); pf.openUrl(x.dataset.url); }));
  b.querySelectorAll('.pb-av').forEach((row) => { const id = row.dataset.prop; const op = row.dataset.op;
    row.querySelector('[data-mas]').onclick = () => publicar(id, op, 2);
    row.querySelector('[data-ficha]').onclick = () => window.Inmo.abrirFicha(id);
    row.querySelectorAll('[data-mejorar]').forEach((x) => (x.onclick = () => publicar(id, op, 1)));
    row.querySelectorAll('[data-precio]').forEach((x) => (x.onclick = () => ajustarPrecio(id, op))); });
}
function ajustarPrecio(id, op) {
  const p = IM.data.propiedades.find((x) => x.id === id); const pr = op === 'venta' ? p.precioVenta : p.precioArriendo;
  modal(`<div class="im-form"><h2>Ajustar precio de ${op}</h2><p class="muted">${esc(p.codigo)} · ${esc(p.titulo)}. Precio actual: <b>${precio(pr)}</b>. Los avisos publicados por API se actualizan solos; los de feed, en la próxima lectura del portal.</p>
    <div class="pb-pq">${[3, 5, 8].map((x) => `<button class="secondary small" data-b="${x}">−${x}%</button>`).join('')}</div>
    <label>Nuevo precio (${esc(pr.moneda)})<input id="apV" type="number" step="any" value="${esc(pr.valor)}" /></label><p class="error" id="apE"></p>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Guardar precio</button></div></div>`);
  $('#modalCard').querySelectorAll('[data-b]').forEach((b) => (b.onclick = () => { const v = pr.valor * (1 - Number(b.dataset.b) / 100); $('#apV').value = pr.moneda === 'CLP' ? Math.round(v / 1000) * 1000 : Math.round(v * 100) / 100; }));
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async () => { const v = Number($('#apV').value); if (!(v > 0)) { $('#apE').textContent = 'Indica un precio válido.'; return; } try { await api('inmoPropGuardar', { id, [op === 'venta' ? 'precioVenta' : 'precioArriendo']: { valor: v, moneda: pr.moneda } }); closeModal(); toast('Precio actualizado.'); abrir(); } catch (e) { $('#apE').textContent = e.message; } };
}

// ---------- interesados ----------
async function vInteresados() {
  const r = await api('pubInteresados', { estado: PB.fl || undefined, q: PB.q || undefined });
  $('#pbBody').innerHTML = `<div class="pb-lbar"><div class="im-seg" id="pbFl">${Object.entries(LST).map(([k, [t]]) => `<button data-f="${k}" class="${PB.fl === k ? 'on' : ''}">${t} <i>${r.cuenta[k] || 0}</i></button>`).join('')}<button data-f="" class="${!PB.fl ? 'on' : ''}">Todos</button></div>
      <label class="im-search">${icon('search', 15)}<input id="pbQ" placeholder="Buscar por nombre, teléfono o propiedad" value="${esc(PB.q)}" /></label><button class="secondary" id="pbAdd">${icon('plus', 14)} Agregar interesado</button></div>
    ${r.interesados.length ? `<div class="pb-leads">${r.interesados.map((l) => `<article class="pb-ld ${l.estado}" data-prop="${esc(l.propId)}" data-lead="${esc(l.id)}">
      <span class="ga-av">${esc((l.nombre || '?').trim()[0] || '?')}</span>
      <div class="pb-ldt"><b>${esc(l.nombre || 'Sin nombre')}</b><small>${esc(l.portal || '')} · ${esc(l.canalTxt || l.canal || '')} · ${hace(l.fecha || l.recibido)}</small>
        <span class="pb-ldp">${icon('house', 12)} ${esc(l.codigo)} · ${esc(l.titulo)}</span>${l.mensaje ? `<p>«${esc(String(l.mensaje).slice(0, 220))}»</p>` : ''}<small>${esc([l.telefono, l.email].filter(Boolean).join(' · '))}</small></div>
      <div class="pb-lda"><select data-est>${Object.keys(LST).map((k) => `<option value="${k}" ${l.estado === k ? 'selected' : ''}>${LST[k][0].replace(/s$/, '').replace('Con visita', 'Visita')}</option>`).join('')}</select>
        ${l.telefono ? `<button class="primary small" data-wa>${icon('whatsapp', 14)} Responder</button>` : l.email ? `<button class="primary small" data-mail>${icon('mail', 14)} Responder</button>` : ''}
        <button class="secondary small" data-visita>${icon('calendar', 14)} Agendar visita</button></div></article>`).join('')}</div>`
    : `<div class="pb-empty">${icon('users', 30)}<b>${PB.fl === 'nuevo' ? 'No hay interesados nuevos' : 'Sin interesados en esta vista'}</b><p>Los interesados de Portal Inmobiliario y Chilepropiedades llegan solos al pulsar «Actualizar». Los de TOCTOC o Yapo puedes agregarlos con «Agregar interesado».</p></div>`}`;
  $('#pbFl').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { PB.fl = b.dataset.f; vInteresados(); } };
  let h; $('#pbQ').oninput = (e) => { clearTimeout(h); h = setTimeout(() => { PB.q = e.target.value.trim(); vInteresados().then(() => { const i = $('#pbQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 300); };
  $('#pbAdd').onclick = agregarInteresado;
  $('#pbBody').querySelectorAll('.pb-ld').forEach((row) => { const pid = row.dataset.prop; const lid = row.dataset.lead; const l = r.interesados.find((x) => x.id === lid);
    row.querySelector('[data-est]').onchange = async (e) => { await api('pubInteresado', pid, lid, { estado: e.target.value }); toast('Estado actualizado.'); abrir(); };
    const responder = async (canal) => { const x = await api('pubRespuesta', pid, lid); if (canal === 'wa' && x.whatsapp) pf.openUrl(x.whatsapp); else if (x.email) pf.openUrl(`mailto:${x.email}?subject=${encodeURIComponent('Consulta por ' + l.codigo)}&body=${encodeURIComponent(x.texto)}`); await api('pubInteresado', pid, lid, { contactado: true }); toast('Se abrió la respuesta lista para enviar.'); abrir(); };
    row.querySelector('[data-wa]')?.addEventListener('click', () => responder('wa'));
    row.querySelector('[data-mail]')?.addEventListener('click', () => responder('mail'));
    row.querySelector('[data-visita]').onclick = () => window.Agenda.nuevo({ tipo: 'visita', propId: pid, personaId: l.personaId || (IM.data.personas.find((c) => c.rut && l.rut && c.rut === l.rut)?.id) || '' }, async () => { await api('pubInteresado', pid, lid, { estado: 'visita' }); abrir(); }); });
}
function agregarInteresado() {
  const props = IM.data.propiedades.filter((p) => !p.archivada);
  modal(`<div class="im-form"><h2>Agregar interesado</h2><p class="muted small">Para consultas que llegan por correo desde TOCTOC, Yapo u otro canal.</p><div class="im-fg2">
    <label>Propiedad<select id="aiP">${props.map((p) => `<option value="${esc(p.id)}">${esc(p.codigo)} · ${esc(p.titulo.slice(0, 40))}</option>`).join('')}</select></label>
    <label>Portal<select id="aiPo"><option value="toctoc">TOCTOC</option><option value="yapo">Yapo</option><option value="chilepropiedades">Chilepropiedades</option><option value="pi">Portal Inmobiliario</option><option value="Otro">Otro</option></select></label>
    <label>Nombre<input id="aiN" /></label><label>Teléfono<input id="aiT" placeholder="+56 9…" /></label><label>Correo<input id="aiE" /></label>
    <label style="grid-column:1/-1">Mensaje <span class="muted">(opcional)</span><input id="aiM" /></label></div><p class="error" id="aiErr"></p>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Agregar</button></div></div>`);
  $('#modalCard').classList.add('im-wide'); $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async () => { try { await api('pubAgregarInteresado', $('#aiP').value, { portal: $('#aiPo').value, nombre: $('#aiN').value, telefono: $('#aiT').value, email: $('#aiE').value, mensaje: $('#aiM').value }); closeModal(); toast('Interesado agregado.'); PB.fl = 'nuevo'; abrir('interesados'); } catch (e) { $('#aiErr').textContent = e.message; } };
}

// ---------- portales ----------
async function vPortales() {
  const [cat, est] = await Promise.all([api('pubCatalogo'), api('mlEstado').catch(() => null)]);
  const c = est?.contacto || {};
  const feeds = {}; for (const x of cat.filter((y) => y.via !== 'api')) feeds[x.id] = (await api('pubFeed', x.id)).avisos;
  $('#pbBody').innerHTML = `<div class="pb-ct">${icon('phone', 16)}<span><b>Contacto de los avisos:</b> ${esc([c.nombre, c.email, c.whatsapp ? 'WhatsApp ' + c.whatsapp : 'sin WhatsApp'].filter(Boolean).join(' · ') || 'sin configurar')}</span><button class="secondary small" id="pbCt">Editar</button></div>
    <div class="pb-portales">${cat.map((x) => `<article class="pb-po ${x.listo ? 'on' : ''}" data-po="${x.id}"><header><b>${esc(x.nombre)}</b><i class="pb-via">${VIA[x.via]}</i></header>
      <p class="pb-poe ${x.listo ? 'ok' : ''}">${icon(x.listo ? 'check' : 'alert', 13)} ${esc(x.estado)}</p><p class="muted small">${esc(x.detalle)}</p>
      ${x.id === 'pi' ? `<div class="pb-poa"><button class="${x.listo ? 'secondary' : 'primary'} small" data-pi>${x.listo ? 'Configurar' : 'Conectar la cuenta'}</button></div>`
        : `<p class="small">${feeds[x.id]} ${feeds[x.id] === 1 ? 'aviso' : 'avisos'} en el feed.</p>
        <label class="pb-tg"><input type="checkbox" data-act ${x.listo ? 'checked' : ''} /> ${x.via === 'feed' ? 'Integración activada por el portal' : 'Acuerdo comercial activo'}</label>
        ${x.id === 'chilepropiedades' ? `<label class="small">TOKEN de seguimiento <span class="muted">(lo entrega el portal; trae estado, visitas e interesados)</span><input data-token type="password" placeholder="${x.token ? '••••••• (guardado)' : 'Pega aquí el TOKEN'}" autocomplete="off" /></label>` : ''}
        <label class="small">Dirección pública del feed <span class="muted">(la publica Portalfirma)</span><input data-url value="${esc(x.feedUrl || '')}" placeholder="https://…/feed.xml" /></label>
        <div class="pb-poa"><button class="secondary small" data-exp>${icon('download', 13)} Exportar feed</button><button class="secondary small" data-sol>${icon('mail', 13)} Solicitar integración</button><button class="primary small" data-save>Guardar</button></div>`}</article>`).join('')}</div>
    <p class="muted small">Chilepropiedades lee el feed una vez al día y su integración es gratis si la aprueban. TOCTOC y Yapo publican con acuerdo comercial; Asset les entrega el mismo feed.</p>`;
  $('#pbCt').onclick = () => contacto(c);
  $('#pbBody').querySelectorAll('[data-po]').forEach((card) => { const id = card.dataset.po; const x = cat.find((y) => y.id === id);
    card.querySelector('[data-pi]')?.addEventListener('click', () => window.Inmo.portales());
    card.querySelector('[data-exp]')?.addEventListener('click', async () => { const r = await api('pubExportarFeed', id); if (r) toast(`Feed guardado (${r.avisos} avisos): ${r.ruta}`, 5000); });
    card.querySelector('[data-sol]')?.addEventListener('click', () => solicitar(x, c));
    card.querySelector('[data-save]')?.addEventListener('click', async () => { const t = card.querySelector('[data-token]'); const o = { activo: card.querySelector('[data-act]').checked, feedUrl: card.querySelector('[data-url]').value }; if (t && t.value.trim()) o.token = t.value.trim(); await api('pubConfigurar', id, o); toast(`${x.nombre}: guardado.`); vPortales(); }); });
}
function solicitar(x, c) {
  const url = x.feedUrl || '(dirección del feed que publica Portalfirma)';
  const cuerpo = `Hola, equipo de ${x.nombre}:\n\nSomos ${c.nombre || '[corredora]'} y administramos nuestra cartera con PortalFirma Asset. Queremos sincronizar nuestras propiedades con ${x.nombre}.\n\nFeed (XML, formato de Chilepropiedades, por HTTPS): ${url}\nContacto: ${[c.email, c.telefono || c.whatsapp].filter(Boolean).join(' · ')}\n\n${x.id === 'chilepropiedades' ? 'Además, les pedimos el TOKEN de la API de feedback de integraciones (mensajes, estadísticas y estado de publicaciones).\n\n' : ''}Quedamos atentos. Saludos.`;
  if (x.correo) pf.openUrl(`mailto:${x.correo}?subject=${encodeURIComponent('Integración de cartera con PortalFirma Asset')}&body=${encodeURIComponent(cuerpo)}`);
  else { navigator.clipboard.writeText(cuerpo).catch(() => {}); pf.openUrl(x.id === 'toctoc' ? 'https://www.toctoc.com/empresas' : 'https://www.yapo.cl'); toast(`Copié el mensaje para ${x.nombre}; pégalo en su formulario de contacto comercial.`, 6000); }
}
function contacto(c) {
  modal(`<div class="im-form"><h2>Contacto de los avisos</h2><p class="muted small">Aparece en todos los portales. Portal Inmobiliario exige WhatsApp.</p><div class="im-fg2">
    <label>Corredora o nombre<input id="ctN" value="${esc(c.nombre || '')}" /></label><label>Correo<input id="ctE" value="${esc(c.email || '')}" /></label>
    <label>Teléfono<input id="ctT" value="${esc(c.telefono || '')}" /></label><label>WhatsApp<input id="ctW" value="${esc(c.whatsapp || '')}" placeholder="+56 9 1234 5678" /></label></div><p class="error" id="ctErr"></p>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Guardar</button></div></div>`);
  $('#modalCard').classList.add('im-wide'); $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async () => { try { await api('mlContacto', { nombre: $('#ctN').value, email: $('#ctE').value, telefono: $('#ctT').value, whatsapp: $('#ctW').value, web: c.web || '' }); closeModal(); toast('Contacto guardado.'); if (PB.wiz) pasoCalidad(); else vPortales(); } catch (e) { $('#ctErr').textContent = e.message; } };
}

// ---------- el flujo «Publicar» ----------
async function elegirPropiedad() {
  await cargar(); const props = IM.data.propiedades.filter((p) => !p.archivada);
  modal(`<div class="im-form"><h2>¿Qué propiedad publicamos?</h2><div class="ga-search">${icon('search', 15)}<input id="epQ" placeholder="Código, dirección o comuna" /></div><div class="pb-ep" id="epL"></div>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button></div></div>`);
  $('#modalCard').classList.add('im-wide'); $('#mCancel').onclick = closeModal;
  const pintar = (q) => { const t = String(q || '').toLowerCase(); $('#epL').innerHTML = props.filter((p) => !t || [p.codigo, p.titulo, p.direccion, p.comuna].join(' ').toLowerCase().includes(t)).slice(0, 12).map((p) => `<button class="ga-pc" data-p="${esc(p.id)}"><span class="ga-ph">${foto((p.fotos || [])[0])}</span><span class="ga-pt"><small>${esc(p.codigo)}</small><b>${esc(p.titulo)}</b><small>${esc(p.comuna || '')}</small></span></button>`).join('');
    $('#epL').querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { closeModal(); publicar(b.dataset.p); })); };
  $('#epQ').oninput = (e) => pintar(e.target.value); pintar(''); setTimeout(() => $('#epQ')?.focus(), 30);
}
async function publicar(propId, op, paso = 1) {
  await cargar(); const p = IM.data.propiedades.find((x) => x.id === propId); if (!p) return toast('La propiedad ya no está.');
  const ops = ['venta', 'arriendo'].filter((o) => p[o]); if (!ops.length) return toast('Marca la propiedad en venta o arriendo antes de publicar.', 5000);
  PB.wiz = { propId, op: op && ops.includes(op) ? op : ops[0], ops, sel: null, tipoAviso: null, destacado: {} };
  ir('publicaciones'); PB.tok = IM.tok;
  return paso === 2 ? pasoPortales() : pasoCalidad();
}
function marco(n, cuerpo) {
  const w = PB.wiz; const p = IM.data.propiedades.find((x) => x.id === w.propId);
  host().innerHTML = `<div class="im-wrap pb-wrap pb-wiz"><div class="im-fh"><button class="ghost" id="pwBack">${icon('chevL', 16)} Publicaciones</button><span class="spacer"></span></div>
    <div class="pb-wh"><span class="ga-ph lg">${foto((p.fotos || [])[0])}</span><div><small>${esc(p.codigo)} · ${esc(p.comuna || '')}</small><h1>Publicar ${esc(p.titulo)}</h1>
      ${w.ops.length > 1 ? `<div class="im-seg" id="pwOp">${w.ops.map((o) => `<button data-o="${o}" class="${w.op === o ? 'on' : ''}">${o === 'venta' ? 'Venta' : 'Arriendo'}</button>`).join('')}</div>` : `<i class="im-st">${w.op === 'venta' ? 'Venta' : 'Arriendo'}</i>`}</div></div>
    <ol class="pb-steps">${['Calidad del aviso', 'Portales', 'Publicar'].map((t, i) => `<li class="${i + 1 < n ? 'hecho' : i + 1 === n ? 'ahora' : ''}"><span>${i + 1 < n ? icon('check', 12) : i + 1}</span>${t}</li>`).join('')}</ol>
    <div class="pb-wb">${cuerpo}</div></div>`;
  $('#pwBack').onclick = () => { PB.wiz = null; abrir('avisos'); };
  $('#pwOp')?.addEventListener('click', (e) => { const b = e.target.closest('[data-o]'); if (b) { w.op = b.dataset.o; ({ 1: pasoCalidad, 2: pasoPortales, 3: pasoPortales }[n])(); } });
  return p;
}
async function pasoCalidad() {
  const w = PB.wiz; const q = await api('pubCalidad', w.propId, w.op);
  const p = marco(1, '');
  host().querySelector('.pb-wb').innerHTML = `<div class="pb-q"><div class="pb-qs">${anillo(q.puntaje, true)}<b>${esc(q.nivel)}</b><small>${q.puntaje >= 85 ? 'Listo para destacar en los portales.' : 'Mejóralo antes de publicar: los avisos completos reciben más visitas y contactos.'}</small></div>
      <ul class="pb-ql">${q.items.map((x) => `<li class="${x.ok ? 'ok' : x.parcial ? 'med' : 'bad'}"><span>${icon(x.ok ? 'check' : 'alert', 13)}</span><div><b>${esc(x.t)}</b>${x.ok ? '' : `<small>${esc(x.falta)}</small>`}</div>${x.ok ? '' : `<button class="ghost small" data-fix="${x.arreglo}">${{ ficha: 'Completar', fotos: 'Fotos', ia: 'Redactar', contacto: 'Configurar' }[x.arreglo]}</button>`}</li>`).join('')}</ul></div>
    <section class="pb-tx"><header><h3>Texto del aviso</h3><button class="secondary" id="pwIA">${icon('sparkle', 15)} Redactar con IA</button></header>
      <label>Título para los portales <small id="pwTc"></small><input id="pwT" value="${esc(p.tituloPortal || p.titulo || '')}" maxlength="60" /></label>
      <label>Descripción <small id="pwDc"></small><textarea id="pwD" rows="9">${esc(p.descripcion || '')}</textarea></label>
      <div id="pwDest"></div><div class="pb-txa"><span class="muted small">La IA usa solo los datos de la ficha; revisa antes de guardar.</span><button class="secondary" id="pwSave">Guardar texto</button></div></section>
    <div class="pb-nav">${q.bloquea.length ? `<p class="error">${esc(q.bloquea.join(' '))}</p>` : '<span></span>'}<button class="primary" id="pwNext" ${q.bloquea.length ? 'disabled' : ''}>Continuar ${icon('arrowR', 15)}</button></div>`;
  const cont = () => { const t = $('#pwT').value.trim().length; const d = $('#pwD').value.trim().length; $('#pwTc').textContent = `${t}/60`; $('#pwTc').className = t >= 25 && t <= 60 ? 'ok' : 'bad'; $('#pwDc').textContent = `${d} caracteres${d < 300 ? ' (ideal: 300 o más)' : ''}`; $('#pwDc').className = d >= 300 ? 'ok' : 'bad'; };
  $('#pwT').oninput = cont; $('#pwD').oninput = cont; cont();
  const guardar = async (silencio) => { const r = await api('pubTextos', w.propId, { tituloPortal: $('#pwT').value, descripcion: $('#pwD').value }); if (!silencio) toast(['Texto guardado.', ...(r.avisos || [])].join(' '), 4000); await cargar(); };
  $('#pwSave').onclick = async () => { await guardar(); pasoCalidad(); };
  $('#pwIA').onclick = () => window.members(async () => { const b = $('#pwIA'); b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Redactando…';
    try { const r = await api('pubRedactar', w.propId, w.op); $('#pwT').value = r.titulo; $('#pwD').value = r.descripcion; cont(); $('#pwDest').innerHTML = r.destacados.length ? `<p class="pb-dest">${icon('sparkle', 13)} ${r.destacados.map(esc).join(' · ')}</p>` : ''; toast('Listo: revisa el texto y guárdalo.'); }
    catch (e) { toast(e.message, 5000); } finally { b.disabled = false; b.innerHTML = `${icon('sparkle', 15)} Redactar con IA`; } }, 'Para redactar con IA, inicia sesión con tu cuenta de Portalfirma.');
  host().querySelectorAll('[data-fix]').forEach((b) => (b.onclick = async () => {
    const k = b.dataset.fix; await cargar(); const pp = IM.data.propiedades.find((x) => x.id === w.propId);
    if (k === 'ia') return $('#pwIA').click();
    if (k === 'contacto') return contacto((await api('mlEstado').catch(() => ({})))?.contacto || {});
    if (k === 'fotos') return toast('Las fotos se cargan desde Portalfirma al importar la cartera. Agrega más fotos a la propiedad en Portalfirma y vuelve a importar.', 7000);
    window.Inmo.formProp(pp, { despues: () => pasoCalidad() });
  }));
  $('#pwNext').onclick = async () => { const t = $('#pwT').value.trim(); const d = $('#pwD').value.trim(); if (t !== (p.tituloPortal || p.titulo || '') || d !== (p.descripcion || '')) await guardar(true); pasoPortales(); };
}
async function pasoPortales() {
  const w = PB.wiz; const [cat, paq] = await Promise.all([api('pubCatalogo'), api('mlPaquetes').catch(() => null)]);
  await cargar(); const p = IM.data.propiedades.find((x) => x.id === w.propId);
  const ya = (id) => { const a = p.portales?.[id]?.[w.op]; return a && (id !== 'pi' || a.itemId) && !['retirada', 'closed'].includes(a.status) ? a : null; };
  if (!w.sel) w.sel = new Set(cat.filter((x) => (x.listo || x.via === 'feed') && !ya(x.id)).map((x) => x.id));
  w.tipoAviso ||= 'silver';
  marco(2, '');
  host().querySelector('.pb-wb').innerHTML = `<h3 class="pb-h3">¿Dónde lo publicamos?</h3><div class="pb-psel">${cat.map((x) => { const a = ya(x.id); const puede = x.listo || x.via === 'feed';
      return `<label class="pb-pc ${w.sel.has(x.id) ? 'on' : ''} ${puede ? '' : 'off'}" data-pc="${x.id}"><input type="checkbox" ${w.sel.has(x.id) ? 'checked' : ''} ${puede ? '' : 'disabled'} />
        <div><b>${esc(x.nombre)}</b><small>${VIA[x.via]} · ${esc(x.estado)}</small>${a ? `<small class="ok">Ya publicado ${ST[a.status] ? '(' + ST[a.status][0].toLowerCase() + ')' : ''}: se actualiza</small>` : ''}
        ${x.id === 'pi' && x.listo ? `<span class="pb-pq">${['silver', 'gold', 'gold_premium'].map((t) => `<button type="button" data-ta="${t}" class="${w.tipoAviso === t ? 'on' : ''}">${{ silver: 'Plata', gold: 'Oro', gold_premium: 'Oro Premium' }[t]}${paq?.[t] != null ? ` · ${paq[t]}` : ''}</button>`).join('')}</span>` : ''}
        ${x.id === 'chilepropiedades' ? `<span class="pb-tg sm"><input type="checkbox" data-dest ${w.destacado.chilepropiedades ? 'checked' : ''} /> Destacado</span>` : ''}
        ${!puede ? `<small>${x.via === 'acuerdo' ? 'Cuando el acuerdo esté activo, se suma con un clic.' : 'Conecta la cuenta en la pestaña Portales.'}</small>` : x.via === 'feed' && !x.listo ? '<small>Queda en espera y sale apenas el portal active la integración.</small>' : ''}</div></label>`; }).join('')}</div>
    <div class="pb-nav"><button class="secondary" id="pwPrev">${icon('chevL', 15)} Volver</button><button class="primary" id="pwNext" ${w.sel.size ? '' : 'disabled'}>Revisar y publicar ${icon('arrowR', 15)}</button></div>`;
  host().querySelectorAll('[data-pc]').forEach((l) => { const id = l.dataset.pc; const cb = l.querySelector('input[type=checkbox]');
    cb.onchange = () => { cb.checked ? w.sel.add(id) : w.sel.delete(id); l.classList.toggle('on', cb.checked); $('#pwNext').disabled = !w.sel.size; };
    l.querySelectorAll('[data-ta]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); w.tipoAviso = b.dataset.ta; l.querySelectorAll('[data-ta]').forEach((x) => x.classList.toggle('on', x === b)); }));
    l.querySelector('[data-dest]')?.addEventListener('change', (e) => { w.destacado[id] = e.target.checked; }); });
  $('#pwPrev').onclick = pasoCalidad; $('#pwNext').onclick = pasoPublicar;
}
async function pasoPublicar() {
  const w = PB.wiz; const cat = await api('pubCatalogo'); const q = await api('pubCalidad', w.propId, w.op);
  const p = marco(3, ''); const sel = cat.filter((x) => w.sel.has(x.id));
  host().querySelector('.pb-wb').innerHTML = `<div class="pb-res"><div class="pb-sum"><div class="pb-sumh">${anillo(q.puntaje)}<div><b>${esc(p.tituloPortal || p.titulo)}</b><small>${esc(w.op === 'venta' ? 'Venta' : 'Arriendo')} · ${precio(w.op === 'venta' ? p.precioVenta : p.precioArriendo)} · ${q.fotos} fotos</small></div></div>
      <ul>${sel.map((x) => `<li data-r="${x.id}"><b>${esc(x.nombre)}</b><span>${x.id === 'pi' ? `Por API · aviso ${{ silver: 'Plata', gold: 'Oro', gold_premium: 'Oro Premium' }[w.tipoAviso]}` : x.listo ? 'Por feed: sale en la próxima lectura del portal' : 'Queda en espera de la integración'}</span><em></em></li>`).join('')}</ul>
      ${w.sel.has('pi') ? '<p class="ga-cobro">Portal Inmobiliario usa una publicación del paquete de la cuenta.</p>' : ''}</div></div>
    <div class="pb-nav"><button class="secondary" id="pwPrev">${icon('chevL', 15)} Volver</button><button class="primary" id="pwGo">${icon('export', 15)} Publicar ahora</button></div>`;
  $('#pwPrev').onclick = pasoPortales;
  $('#pwGo').onclick = async () => {
    const b = $('#pwGo'); b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Publicando…'; $('#pwPrev').disabled = true;
    let r; try { r = await api('pubPublicar', w.propId, w.op, [...w.sel], { tipoAviso: w.tipoAviso, destacado: w.destacado }); } catch (e) { b.disabled = false; b.innerHTML = `${icon('export', 15)} Publicar ahora`; $('#pwPrev').disabled = false; return toast(e.message, 6000); }
    for (const x of r.resultados) { const li = host().querySelector(`[data-r="${x.portal}"]`); if (!li) continue; li.classList.add(x.ok ? (x.espera ? 'wait' : 'ok') : 'bad'); li.querySelector('em').innerHTML = x.ok ? `${icon(x.espera ? 'clock' : 'check', 13)} ${esc(x.estado)}${x.url ? ` · <a href="#" data-url="${esc(x.url)}">ver aviso</a>` : ''}` : `${icon('alert', 13)} ${esc(x.error)}`; }
    host().querySelectorAll('[data-url]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); pf.openUrl(a.dataset.url); }));
    const okN = r.resultados.filter((x) => x.ok).length;
    host().querySelector('.pb-nav').innerHTML = `<span class="pb-done">${okN ? `${icon('check', 16)} Publicación enviada a ${okN} ${okN === 1 ? 'portal' : 'portales'}.` : 'No se pudo publicar.'}</span><button class="primary" id="pwFin">Ver mis avisos ${icon('arrowR', 15)}</button>`;
    if (okN) window.Agente?.festejo?.();
    $('#pwFin').onclick = () => { PB.wiz = null; abrir('avisos'); };
  };
}

window.Publicaciones = { abrir, publicar, elegir: elegirPropiedad, _pb: PB };
})();
