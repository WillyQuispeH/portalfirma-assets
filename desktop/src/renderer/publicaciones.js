/* global pf, $, api, esc, icon, toast, closeModal, IM, cargar, precio, ir, liberar */
'use strict';
// ============================================================================
// Publicaciones: la parte comercial, separada del resto de la gestión.
// Una propiedad → botón «Publicar» → 1. Calidad del aviso (con redacción por IA) → 2. Portales → 3. Publicar.
// Después: Avisos (rendimiento y recomendaciones de precio), Interesados (bandeja única) y Portales (conexiones).
// ============================================================================
(() => {
const PB = { tok: 0, wiz: null }; // el flujo «Publicar»; la pestaña y los filtros están en el store de React
const ST = { active: ['Activo', 'ok'], publicada: ['Publicado', 'ok'], en_feed: ['En el feed', 'wait'], pendiente: ['En espera', 'res'], paused: ['Pausado', 'res'], under_review: ['En revisión', 'wait'], closed: ['Finalizado', ''], retirada: ['Retirado', ''], vencida: ['Vencido', 'bad'] };
const VIA = { api: 'API', feed: 'Feed diario', acuerdo: 'Acuerdo comercial' };
const host = () => $('#view-publicaciones');
const anillo = (n, big) => { const c = n >= 85 ? '#16a34a' : n >= 65 ? '#4f6ef0' : n >= 40 ? '#d97706' : '#dc2626'; return `<span class="pb-ring ${big ? 'big' : ''}" style="--p:${n};--c:${c}"><b>${n}</b>${big ? '<small>de 100</small>' : ''}</span>`; };
const foto = (u) => (u ? `<img src="${esc(u)}" class="im-img" alt="" loading="lazy" />` : `<span class="ga-noph">${icon('house', 20)}</span>`);

// Las pestañas (Avisos, Interesados, Portales) están en React: src/ui/components/functional/publicaciones.
// Aquí quedan el flujo «Publicar» y sus formularios. El flujo se dibuja en el mismo contenedor: antes desmonta
// React (liberar, en inmo.js). Se vuelve a montar al abrirla, así los datos siempre están al día.
async function abrir(tab, filtro) {
  PB.wiz = null; ir('publicaciones');
  liberar(host()); window.ReactUI.montar('Publicaciones', host(), { tab, filtro });
  try { await cargar(); } catch {} // IM.data para los formularios (ajustar precio, agregar interesado, visita)
}
// «Agendar visita» con un interesado: con la persona del CRM si ya existe (por id o por RUT)
function agendarVisita(l, despues) {
  window.Agenda.nuevo({ tipo: 'visita', propId: l.propId, personaId: l.personaId || (IM.data.personas.find((c) => c.rut && l.rut && c.rut === l.rut)?.id) || '' }, async () => { await despues(); abrir('interesados'); });
}

function ajustarPrecio(id, op) {
  const p = IM.data.propiedades.find((x) => x.id === id); const pr = op === 'venta' ? p.precioVenta : p.precioArriendo;
  window.Ventanas.abrir('leads.pubAjustarPrecio', { op, codigo: p.codigo, titulo: p.titulo, precioTxt: precio(pr), valor: pr.valor, moneda: pr.moneda,
    alGuardar: async (v) => { await api('inmoPropGuardar', { id, [op === 'venta' ? 'precioVenta' : 'precioArriendo']: { valor: v, moneda: pr.moneda } }); closeModal(); toast('Precio actualizado.'); abrir(); } }, { clave: 'modal-55' });
}

// ---------- interesados ----------
function agregarInteresado() {
  const props = IM.data.propiedades.filter((p) => !p.archivada);
  window.Ventanas.abrir('leads.pubAgregarInteresado', { propiedades: props.map((p) => ({ id: p.id, codigo: p.codigo, titulo: p.titulo })),
    alGuardar: async (propId, datos) => { await api('pubAgregarInteresado', propId, datos); closeModal(); toast('Interesado agregado.'); abrir('interesados', 'nuevo'); } }, { clave: 'modal-56', ancho: true });
}

// ---------- portales ----------
function contacto(c) {
  window.Ventanas.abrir('leads.pubContacto', { contacto: c,
    alGuardar: async (x) => { await api('mlContacto', { ...x, web: c.web || '' }); closeModal(); toast('Contacto guardado.'); if (PB.wiz) pasoCalidad(); else abrir('portales'); } }, { clave: 'modal-57', ancho: true });
}

// ---------- el flujo «Publicar» ----------
async function elegirPropiedad() {
  await cargar(); const props = IM.data.propiedades.filter((p) => !p.archivada);
  window.Ventanas.abrir('leads.pubElegirPropiedad', { propiedades: props.map((p) => ({ id: p.id, codigo: p.codigo, titulo: p.titulo, direccion: p.direccion, comuna: p.comuna, foto: (p.fotos || [])[0] || null })),
    alElegir: (id) => { closeModal(); publicar(id); } }, { clave: 'modal-58', ancho: true });
  setTimeout(() => $('#epQ')?.focus(), 30);
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
  liberar(host()).innerHTML = `<div class="im-wrap pb-wrap pb-wiz"><div class="im-fh"><button class="ghost" id="pwBack">${icon('chevL', 16)} Publicaciones</button><span class="spacer"></span></div>
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

window.Publicaciones = { abrir, publicar, elegir: elegirPropiedad, ajustarPrecio, agregarInteresado, contacto, agendarVisita, _pb: PB };
})();
