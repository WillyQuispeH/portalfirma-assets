/* global $, api, esc, modal, closeModal, toast */
'use strict';
// 0.16.14 · «Ficha completa»: los ~130 datos de la propiedad en 5 bloques (lo esencial, portales, propietario y
// legal, equipamiento, visita y publicación). Cada pestaña muestra cuánto falta y marca lo CLAVE (sin eso no se
// avanza: por ejemplo el N° de departamento en un departamento). Lo marcado con ★ va a los portales.
// Los sí/no del equipamiento se marcan como fichas: lo que no se marca queda en «No».
(() => {
const TIPOS = { casa: 'Casa', departamento: 'Departamento', oficina: 'Oficina', sitio: 'Sitio', local_comercial: 'Local comercial', industrial: 'Industrial', agricola: 'Agrícola', parcela: 'Parcela', estacionamiento: 'Estacionamiento', terreno_construccion: 'Terreno', bodega: 'Bodega' };
const F = { prop: null, ficha: null, tab: 'esencial', cambios: {}, plano: {} };

function campo(c) {
  const id = 'fb_' + c.id; const v = F.cambios[c.id] !== undefined ? F.cambios[c.id] : c.valor;
  const marca = `${c.clave ? '<b class="fb-clave" title="Clave: sin este dato no se avanza">*</b>' : ''}${c.pi ? '<span class="fb-pi" title="Va a los portales">★</span>' : ''}`;
  const cls = `fb-c${c.clave && c.falta && F.cambios[c.id] === undefined ? ' fb-falta' : ''}`;
  if (c.reservado) return `<label class="${cls}"><span class="fb-l">${esc(c.t)}</span><input value="Reservado al captador" disabled title="Los datos del propietario solo los ve quien captó la propiedad" /></label>`;
  if (c.per && c.valor && !F.prop.ficha?.[c.id]) return `<label class="${cls}"><span class="fb-l">${esc(c.t)}${marca}</span><input value="${esc(c.valor)}" disabled title="Del propietario vinculado en el CRM" /></label>`;
  if (c.k === 'bool' && c.b === 'equip') return '';   // van como fichas
  if (c.k === 'bool') return `<label class="${cls}"><span class="fb-l">${esc(c.t)}${marca}</span><select id="${id}" data-c="${c.id}"><option value="">—</option><option value="si" ${v === true ? 'selected' : ''}>Sí</option><option value="no" ${v === false ? 'selected' : ''}>No</option></select></label>`;
  if (c.k === 'lista') return `<label class="${cls}"><span class="fb-l">${esc(c.t)}${marca}</span><input id="${id}" data-c="${c.id}" list="${id}_l" value="${esc(v ?? '')}" placeholder="Elige o escribe" /><datalist id="${id}_l">${(c.op || []).map((o) => `<option value="${esc(o)}">`).join('')}</datalist></label>`;
  if (c.k === 'precio') return `<label class="${cls}"><span class="fb-l">${esc(c.t)}${marca}</span><span class="fb-precio"><input id="${id}" data-c="${c.id}" type="number" step="any" value="${esc(v?.valor ?? '')}" /><select id="${id}_m">${['UF', 'CLP', 'USD'].map((m) => `<option ${(v?.moneda || 'UF') === m ? 'selected' : ''}>${m}</option>`).join('')}</select></span></label>`;
  const largo = ['formaVisitar', 'notasInternas', 'hipoteca', 'tipoSeguridad', 'horarioContacto'].includes(c.id);
  if (largo) return `<label class="${cls} fb-ancho"><span class="fb-l">${esc(c.t)}${marca}</span><textarea id="${id}" data-c="${c.id}" rows="2">${esc(v ?? '')}</textarea></label>`;
  return `<label class="${cls}"><span class="fb-l">${esc(c.t)}${marca}</span><input id="${id}" data-c="${c.id}" ${c.k === 'num' ? 'type="number" step="any"' : ''} value="${esc(v ?? '')}" /></label>`;
}
function esencialesPlano() {   // tipo, operación, precios, comuna, dirección: viven en la ficha de siempre
  const p = F.prop; const v = (k) => (F.plano[k] !== undefined ? F.plano[k] : p[k]);
  return `<label class="fb-c"><span class="fb-l">Tipo de propiedad<b class="fb-clave">*</b></span><select id="fbp_tipo">${Object.entries(TIPOS).map(([k, l]) => `<option value="${k}" ${v('tipo') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="fb-c fb-ops"><span class="fb-l">Operación<b class="fb-clave">*</b></span><span><label class="im-ck"><input type="checkbox" id="fbp_venta" ${v('venta') ? 'checked' : ''}/> Venta</label><label class="im-ck"><input type="checkbox" id="fbp_arriendo" ${v('arriendo') ? 'checked' : ''}/> Arriendo</label></span></div>`;
}
function pintar() {
  const fi = F.ficha; const b = fi.bloques.find((x) => x.id === F.tab);
  const cs = fi.campos.filter((c) => c.b === F.tab && c.aplica && !['tipo', 'operacion'].includes(c.id));
  const bools = cs.filter((c) => c.k === 'bool' && c.b === 'equip');
  $('#fbCuerpo').innerHTML = `<p class="muted small" style="margin:0 0 10px">${esc(b.d)}${b.id === 'equip' ? ' · Nada es obligatorio: marca lo que tiene' : b.faltanClave.length ? ` · <b style="color:#b42318">Falta lo clave: ${esc(b.faltanClave.join(', '))}</b>` : ' · <b style="color:#067647">Lo clave está completo</b>'}</p>
    <div class="fb-grid">${F.tab === 'esencial' ? esencialesPlano() : ''}${cs.map(campo).join('')}</div>
    ${bools.length ? `<h4 class="fb-sub">Lo que tiene la propiedad <small class="muted">(lo que no marques queda en «No»)</small></h4><div class="fb-chips">${bools.map((c) => { const v = F.cambios[c.id] !== undefined ? F.cambios[c.id] : c.valor; return `<button type="button" class="fb-chip${v ? ' on' : ''}" data-b="${c.id}" aria-pressed="${!!v}">${c.pi ? '★ ' : ''}${esc(c.t)}</button>`; }).join('')}</div>` : ''}`;
  document.querySelectorAll('.fb-tab').forEach((t) => t.classList.toggle('on', t.dataset.t === F.tab));
  $('#fbCuerpo').querySelectorAll('[data-b]').forEach((x) => (x.onclick = () => { const on = !x.classList.contains('on'); x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); F.cambios[x.dataset.b] = on; }));
  $('#fbCuerpo').querySelectorAll('[data-c]').forEach((x) => (x.oninput = x.onchange = () => leer(x)));
  $('#fbCuerpo').querySelectorAll('select[id$="_m"]').forEach((x) => (x.onchange = () => { const i = $('#' + x.id.slice(0, -2)); if (i) leer(i); }));
  for (const k of ['tipo', 'venta', 'arriendo']) { const x = $('#fbp_' + k); if (x) x.onchange = () => { F.plano[k] = x.type === 'checkbox' ? x.checked : x.value; }; }
}
function leer(x) {
  const c = F.ficha.campos.find((y) => y.id === x.dataset.c); let v = x.value;
  if (c.k === 'bool') v = v === 'si' ? true : v === 'no' ? false : null;
  else if (c.k === 'precio') v = v === '' ? null : { valor: Number(v), moneda: $('#' + x.id + '_m').value };
  else if (c.k === 'num') v = v === '' ? null : Number(v);
  else if (v === '') v = null;
  F.cambios[c.id] = v;
}
async function guardar(cerrar) {
  const o = { id: F.prop.id, ficha: {} };
  for (const [k, v] of Object.entries(F.cambios)) { const c = F.ficha.campos.find((y) => y.id === k); if (c.plano) o[k] = v; else o.ficha[k] = v; }
  Object.assign(o, F.plano);
  if (o.venta === false && o.arriendo === false) { $('#fbErr').textContent = 'Marca si va en venta, en arriendo o ambas.'; return false; }
  try {
    await api('inmoPropGuardar', o); F.cambios = {}; F.plano = {}; F.ficha = await api('inmoFicha', F.prop.id); F.prop = F.ficha.prop;
    $('#fbErr').textContent = ''; if (cerrar) { closeModal(); $('#modalCard').classList.remove('im-wide'); F.despues?.(); toast('Ficha guardada.'); } else { tabs(); pintar(); }
    return true;
  } catch (e) { $('#fbErr').textContent = e.message; return false; }
}
function tabs() {
  $('#fbTabs').innerHTML = F.ficha.bloques.map((b) => `<button class="fb-tab${b.id === F.tab ? ' on' : ''}" data-t="${b.id}"><span class="fb-n ${b.listo ? 'ok' : ''}">${b.listo ? '✓' : b.n}</span>${esc(b.t)}${b.faltanClave.length ? `<small>faltan ${b.faltanClave.length}</small>` : ''}</button>`).join('');
  $('#fbTabs').querySelectorAll('[data-t]').forEach((t) => (t.onclick = async () => { if (Object.keys(F.cambios).length || Object.keys(F.plano).length) { if (!(await guardar(false))) return; } F.tab = t.dataset.t; pintar(); }));
}
async function abrir(propId, { bloque = null, despues = null } = {}) {
  const fi = await api('inmoFicha', propId);
  F.prop = fi.prop; F.ficha = fi; F.cambios = {}; F.plano = {}; F.despues = despues;
  F.tab = bloque || fi.siguiente || 'esencial';
  modal(`<div class="im-form fb"><h2>Ficha de ${esc(F.prop.codigo || '')} <small class="muted">${esc(F.prop.titulo || '')}</small></h2>
    <div class="fb-tabs" id="fbTabs" role="tablist"></div>
    <div class="fb-dicta"><textarea id="fbDicta" rows="2" placeholder="Dicta o pega datos sueltos: «depto 504, piso 5, orientación norte, tiene piscina y quincho, no se permiten mascotas…»"></textarea><button class="secondary" id="fbDictaOk">Completar con esto</button></div>
    <div id="fbCuerpo"></div><p class="error" id="fbErr"></p>
    <div class="actions"><button class="secondary" id="fbCerrar">Cerrar</button><button class="secondary" id="fbGuardar">Guardar</button><button class="primary" id="fbOk">Guardar y cerrar</button></div></div>`);
  $('#modalCard').classList.add('im-wide');
  tabs(); pintar();
  $('#fbDictaOk').onclick = async () => {
    const t = $('#fbDicta').value.trim(); if (!t) return $('#fbDicta').focus();
    if (Object.keys(F.cambios).length || Object.keys(F.plano).length) { if (!(await guardar(false))) return; }
    $('#fbDictaOk').disabled = true;
    try { const r = await api('inmoCompletarFicha', F.prop.id, t); F.ficha = r.ficha; F.prop = r.ficha.prop; $('#fbDicta').value = ''; tabs(); pintar(); toast(r.guardado.length ? `Guardado: ${r.guardado.slice(0, 6).join(', ')}${r.guardado.length > 6 ? ` y ${r.guardado.length - 6} más` : ''}.` : 'No encontré datos de la ficha en ese texto.'); }
    catch (e) { $('#fbErr').textContent = e.message; } finally { $('#fbDictaOk').disabled = false; }
  };
  $('#fbCerrar').onclick = () => { $('#modalCard').classList.remove('im-wide'); closeModal(); F.despues?.(); };
  $('#fbGuardar').onclick = () => guardar(false).then((ok) => ok && toast('Guardado.'));
  $('#fbOk').onclick = () => guardar(true);
}
window.FichaBloques = { abrir };
})();
