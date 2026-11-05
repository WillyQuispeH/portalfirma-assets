/* global pf, $, esc, show, toast, modal, closeModal, api, icon, members, formatRut, validRut */
'use strict';
// PortalFirma Asset: Inicio inmobiliario, Cartera (propiedades) y Personas (CRM con RUT único).
// Los datos viven en la base local (src/inmo.js); las propiedades reales se importan desde Portalfirma.

const IM = { data: { propiedades: [], personas: [] }, ficha: null, persona: null };
const TIPO = { casa: 'Casa', departamento: 'Departamento', oficina: 'Oficina', sitio: 'Sitio', local_comercial: 'Local comercial', industrial: 'Industrial', agricola: 'Agrícola', parcela: 'Parcela', estacionamiento: 'Estacionamiento', terreno_construccion: 'Terreno', bodega: 'Bodega' };
const ESTADO = { disponible: ['Disponible', 'ok'], reservada: ['Reservada', 'res'], vendida: ['Vendida', 'end'], arrendada: ['Arrendada', 'end'], no_disponible: ['No disponible', 'off'] };
const ROL = { propietario: 'Propietario', arrendatario: 'Arrendatario', comprador: 'Comprador', codeudor: 'Codeudor', interesado: 'Interesado', proveedor: 'Proveedor' };

const fmtN = (n) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 });
const precio = (p) => (!p || p.valor == null ? '' : p.moneda === 'CLP' ? '$' + fmtN(p.valor) : p.moneda === 'USD' ? 'US$ ' + fmtN(p.valor) : 'UF ' + fmtN(p.valor));
const fecha = (iso, hora) => { try { const d = new Date(iso); return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) + (hora ? ' · ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''); } catch { return ''; } };
const pill = (e, op) => { if (!e) return ''; const [l, c] = ESTADO[e] || [e, '']; return `<span class="im-st ${c}">${op ? `<i>${op}</i>` : ''}${l}</span>`; };
const per = (id) => IM.data.personas.find((x) => x.id === id);
const prop = (id) => IM.data.propiedades.find((x) => x.id === id);
const dirTxt = (p) => [(p.direccion || '') + (p.direccion && p.unidad ? ', depto. ' + p.unidad : ''), p.comuna].filter((x) => x && x.trim()).join(' · ');
const foto = (p) => (p.fotos?.length ? `<img class="im-img" src="${esc(p.fotos[0])}" alt="" loading="lazy" />` : `<span class="im-noph">${icon('house', 34)}</span>`);
// Foto que no carga (sin conexión o URL vencida): se reemplaza por el ícono (sin manejadores en línea, por la CSP)
document.addEventListener('error', (e) => { const t = e.target; if (t.tagName === 'IMG' && t.classList.contains('im-th')) { t.style.display = 'none'; return; }
  if (t.tagName === 'IMG' && t.classList.contains('im-img')) { const s = document.createElement('span'); s.className = 'im-noph'; s.innerHTML = icon('house', 34); t.replaceWith(s); } }, true);
const specs = (p) => [p.dormitorios != null && `${icon('bed', 14)}${p.dormitorios}`, p.banos != null && `${icon('bath', 14)}${p.banos}`, p.estacionamientos && `${icon('car', 14)}${p.estacionamientos}`, (p.supUtil || p.supTotal) && `${icon('ruler', 14)}${fmtN(p.supUtil || p.supTotal)} m²`].filter(Boolean).map((x) => `<span>${x}</span>`).join('');

async function cargar() { IM.data = await api('inmoListar'); IM.capt = await api('etCaptaciones').catch(() => ({})); IM.acc = await api('accEstado').catch(() => null); if (IM.acc) { document.body.classList.toggle('perfil-corredor', !IM.acc.esAdmin); window.PERFIL = IM.acc; } }

// ---------- vistas y navegación ----------
const INMO_VIEWS = ['inicio', 'cartera', 'personas'];
function ir(v) { IM.tok = (IM.tok || 0) + 1; show(v); document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === (v === 'actividad' ? 'inicio' : v)));  return IM.tok; }

// ---------- Inicio ----------
async function inicio() {
  if (window.Oficina && window.Oficina.pref.get() !== 'clasica') return window.Oficina.abrir(); // 0.16: «La oficina» con el equipo
  if (window.Hoy) return window.Hoy.abrir(); // 0.15: «Hoy» (etapas, logrados / pendientes / no logrados)
  const tok = ir('inicio');
  let r; try { r = await api('inmoResumen'); } catch (e) { liberar($('#view-inicio')).innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  if (tok !== IM.tok) return; // el usuario ya navegó a otra pantalla
  const h = new Date().getHours(); const saludo = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  const kpi = (id, ic, n, t, sub) => `<button class="im-kpi" data-go="${id}"><span class="im-kic">${icon(ic, 20)}</span><b>${n}</b><span>${t}</span>${sub ? `<small>${sub}</small>` : ''}</button>`;
  const aten = [
    ['leads', 'users', r.conLeads, 'con interesados nuevos desde portales', 'Contáctalos: llegaron por WhatsApp, preguntas o solicitudes de visita'],
    ['sinProp', 'user', r.sinPropietario, 'sin propietario registrado', 'Vincula al dueño para firmar mandatos y liquidar'],
    ['reservadas', 'key', r.venta.reservada + r.arriendo.reservada, 'reservadas', 'Prepara la promesa o el contrato'],
    ['sinFotos', 'image', r.sinFotos, 'sin fotos', 'Las fichas con fotos se publican mejor'],
  ].filter((x) => x[2] > 0);
  const negs = (await api('negListar').catch(() => ({ negocios: [] }))).negocios.filter((n) => n.estado === 'abierto');
  if (tok !== IM.tok) return;
  const negAten = [[negs.filter((n) => n.vencida).length, 'clock', 'con la próxima acción vencida', 'Revisa qué quedó pendiente con cada cliente'], [negs.filter((n) => n.firmas?.[n.etapa]?.operacion && n.firmas[n.etapa].estado !== 'firmado').length, 'sign', 'esperando firmas', 'Avanzan solos cuando se firme el documento'], [negs.filter((n) => /^Listo/.test(n.siguiente || '')).length, 'check', 'listos para pasar de etapa', 'Ya está todo hecho en su etapa actual']].filter((x) => x[0] > 0);
  const hoyISO = new Date().toISOString().slice(0, 10);
  const evHoy = (await api('agendaListar', { desde: hoyISO, hasta: hoyISO }).catch(() => [])).filter((e) => e.estado !== 'cancelado');
  if (tok !== IM.tok) return;
  const vacio = !r.propiedades;
  liberar($('#view-inicio')).innerHTML = `<div class="im-wrap">
    <div class="im-hero"><div><small>${esc(new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }))}</small><h1>${saludo}</h1><p>Tu cartera, tus clientes y cada documento firmado, en un solo lugar.</p></div>
      <form class="hub-agent im-ag" id="inAg"><span class="ha-ic">${icon('sparkle', 16)}</span><input id="inAgQ" placeholder="Pregúntale al Agente: «¿qué departamentos tengo en arriendo en Providencia?»" autocomplete="off" /><button class="primary small" type="submit">Preguntar</button></form></div>
    ${vacio ? `<div class="im-empty"><span class="im-eic">${icon('house', 40)}</span><h2>Trae tu cartera</h2><p>Importa las propiedades que ya tienes en Portalfirma (incluidas las que vienen de Convecta) o crea la primera.</p>
      <div class="row" style="justify-content:center"><button class="primary" data-do="importar">${icon('download', 15)} Importar desde Portalfirma</button><button class="secondary" data-do="nuevaProp">${icon('plus', 15)} Nueva propiedad</button><button class="ghost" data-do="aprende">${icon('compass', 15)} Aprende a usarla</button></div></div>` : `
    <div class="im-kpis">
      ${kpi('todas', 'house', r.propiedades, 'propiedades activas')}
      ${kpi('venta', 'tag', r.venta.disponible, 'en venta disponibles', r.venta.reservada ? r.venta.reservada + ' reservadas' : '')}
      ${kpi('arriendo', 'key', r.arriendo.disponible, 'en arriendo disponibles', r.arriendo.arrendada ? r.arriendo.arrendada + ' arrendadas' : '')}
      ${kpi('negocios', 'briefcase', negs.length, 'negocios abiertos', negs.filter((n) => n.vencida).length ? negs.filter((n) => n.vencida).length + ' con acción vencida' : '')}
    </div>
    <div class="im-cols">
      <div class="im-box"><div class="im-bh"><h3>Requieren atención</h3></div>
        ${negAten.map(([n, ic, t, d]) => `<button class="im-at" data-negs="1"><span class="im-aic ng">${icon(ic, 17)}</span><span><b>${n} ${n === 1 ? 'negocio' : 'negocios'} ${t}</b><small>${d}</small></span>${icon('chevR', 16)}</button>`).join('')}
        ${aten.length || negAten.length ? aten.map(([k, ic, n, t, d]) => `<button class="im-at" data-esp="${k}"><span class="im-aic">${icon(ic, 17)}</span><span><b>${n} ${n === 1 ? 'propiedad' : 'propiedades'} ${t}</b><small>${d}</small></span>${icon('chevR', 16)}</button>`).join('') : `<p class="muted im-ok">${icon('check', 16)} Todo en orden.</p>`}
        <div class="im-bh" style="margin-top:14px"><h3>Atajos</h3></div>
        <div class="im-quick"><button class="secondary" data-do="nuevaProp">${icon('plus', 15)} Propiedad</button><button class="secondary" data-do="nuevaPer">${icon('user', 15)} Persona</button><button class="secondary" data-do="enviar">${icon('sign', 15)} Enviar a firmar</button><button class="secondary" data-do="importar">${icon('download', 15)} Actualizar desde Portalfirma</button><button class="secondary" data-do="aprende">${icon('compass', 15)} Aprende a usarla</button><button class="secondary" data-do="portales">${icon('link', 15)} Portales${r.enPortal ? ` · ${r.enPortal} en Portal Inmobiliario` : ''}</button></div>
        ${r.ultimaImportacion ? `<p class="muted small" style="margin:10px 2px 0">Última importación: ${fecha(r.ultimaImportacion.fecha, true)}</p>` : ''}
      </div>
      <div><div class="im-box"><div class="im-bh"><h3>Agenda de hoy</h3><button class="ghost small" data-do="agenda">Ver agenda</button></div>
        ${evHoy.length ? evHoy.map((e) => `<div class="in-ev"><b>${esc(e.hora || '—')}</b><span>${esc(e.titulo)}<small>${esc(e.lugar || '')}</small></span>${e.tipo === 'visita' ? (e.orden?.operacion ? `<i class="im-st ok">Orden ${e.orden.operacion}</i>` : '<i class="im-st res">Sin orden</i>') : ''}</div>`).join('') : '<p class="muted small">Nada agendado para hoy. Pídele al Agente: «agenda una visita…».</p>'}</div>
      <div class="im-box"><div class="im-bh"><h3>Actividad reciente</h3>${r.actividad.length ? '<button class="ghost small" data-do="actividad">Ver toda</button>' : ''}</div>
        ${r.actividad.length ? `<ul class="im-act">${r.actividad.slice(0, 4).map((a) => `<li data-ref="${esc(a.ref)}"><i></i><span><b>${esc(a.nombre)}</b> ${esc(a.texto)}<small>${fecha(a.fecha, true)}</small></span></li>`).join('')}</ul>` : '<p class="muted">Aún no hay actividad.</p>'}
      </div></div>
    </div>`}</div>`;
  const host = $('#view-inicio');
  host.onclick = (e) => {
    const k = e.target.closest('[data-go]'); if (k) { const g = k.dataset.go; if (g === 'personas') return personas(); if (g === 'negocios') return window.Negocios.abrir(); return cartera({ op: g === 'todas' ? 'todas' : g, especial: '' }); }
    const at = e.target.closest('[data-esp]'); if (at) return cartera({ especial: at.dataset.esp, op: 'todas' });
    if (e.target.closest('[data-negs]')) return window.Negocios.abrir();
    const li = e.target.closest('[data-ref]'); if (li) { const id = li.dataset.ref; if (id.startsWith('p')) return abrirFicha(id); if (id.startsWith('c')) return abrirPersona(id); }
    const d = e.target.closest('[data-do]')?.dataset.do;
    if (d === 'actividad') return window.Actividad.abrir(); if (d === 'importar') importar(); if (d === 'portales') portales(); if (d === 'agenda') window.Agenda.abrir(); if (d === 'aprende') window.Aprende.abrir(); if (d === 'nuevaProp') formProp(); if (d === 'nuevaPer') formPersona();
    if (d === 'enviar') { window.studio.goHome(); document.querySelector('[data-act="send"]')?.click(); }
  };
  $('#inAg').onsubmit = (e) => { e.preventDefault(); const t = $('#inAgQ').value.trim(); members(() => { window.Agente.vista(); if (t) window.Agente.enviar(t); }, 'El Agente Portalfirma trabaja con tu cuenta. Inicia sesión para usarlo.'); };
}

// ---------- Cartera ----------
// La lista está en React: src/ui/components/functional/cartera/Cartera.tsx. Se vuelve a montar al abrirla,
// así los datos siempre están al día; los filtros quedan en el store (los que llegan aquí se aplican encima).
// La ficha, el detalle de la persona y Portales se dibujan en el mismo contenedor: antes desmontan React (liberar).
const liberar = (host) => { window.ReactUI?.desmontar(host); return host; };
async function cartera(filtros) {
  IM.ficha = null; ir('cartera');
  const el = $('#view-cartera'); liberar(el); window.ReactUI.montar('Cartera', el, { filtros });
  try { await cargar(); } catch {} // IM.data para la ficha y los formularios
}

// ---------- Ficha de la propiedad ----------
// La ficha está en React: src/ui/components/functional/ficha/FichaPropiedad.tsx. Se monta en el mismo contenedor
// que la lista. Volver a abrir la misma ficha (o renderFicha, después de un formulario de aquí) no la desmonta:
// solo sube `vez` y React la recarga, así no salta el scroll. La pestaña elegida queda en el store de React.
function montarFicha() {
  const el = $('#view-cartera'); IM.vez = (IM.vez || 0) + 1;
  if (!el.querySelector('.im-ficha')) liberar(el); // venía de la lista, de Portales o de otra ficha recién montada
  window.ReactUI.montar('FichaPropiedad', el, { id: IM.ficha, vez: IM.vez });
}
async function abrirFicha(id) { ir('cartera'); IM.ficha = id; montarFicha(); try { await cargar(); } catch {} } // IM.data para los formularios
function renderFicha() { if (IM.ficha) montarFicha(); }
async function dropFiles(paths) {
  if (!IM.ficha) return toast('Abre una propiedad para agregarle documentos.');
  try { await api('inmoDocAgregar', IM.ficha, paths); toast(paths.length === 1 ? 'Documento agregado.' : paths.length + ' documentos agregados.'); await cargar(); renderFicha(); } catch (e) { toast(e.message, 4000); }
}

// ---------- Formulario de propiedad ----------
function formProp(p, opt = {}) {
  const n = !p; p = p || { tipo: 'departamento', venta: true, arriendo: false, precioVenta: { moneda: 'UF' }, precioArriendo: { moneda: 'CLP' } };
  const v = (k) => esc(p[k] ?? ''); const mon = (k, d) => `<select id="pf_${k}M">${['UF', 'CLP', 'USD'].map((m) => `<option ${(p[k]?.moneda || d) === m ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
  const inp = (k, l, t = 'text', ph = '') => `<label>${l}<input id="pf_${k}" type="${t}" value="${v(k)}" placeholder="${ph}" /></label>`;
  modal(`<div class="im-form"><h2>${n ? 'Nueva propiedad' : 'Editar ficha'}</h2>
    <div class="im-fg">
      <label class="s2">Título<input id="pf_titulo" value="${v('titulo')}" placeholder="Departamento en Providencia" /></label>
      <label>Tipo<select id="pf_tipo">${Object.entries(TIPO).map(([k, l]) => `<option value="${k}" ${p.tipo === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${inp('codigo', 'Código', 'text', n ? 'Automático' : '')}
      <div class="s4 im-opsel"><label class="im-ck"><input type="checkbox" id="pf_venta" ${p.venta ? 'checked' : ''} /> En venta</label><label class="im-ck"><input type="checkbox" id="pf_arriendo" ${p.arriendo ? 'checked' : ''} /> En arriendo</label></div>
      <label>Precio de venta<input id="pf_precioVenta" type="number" step="any" value="${esc(p.precioVenta?.valor ?? '')}" /></label><label>Moneda${mon('precioVenta', 'UF')}</label>
      <label>Arriendo mensual<input id="pf_precioArriendo" type="number" step="any" value="${esc(p.precioArriendo?.valor ?? '')}" /></label><label>Moneda${mon('precioArriendo', 'CLP')}</label>
      <label class="s2">Dirección<input id="pf_direccion" value="${v('direccion')}" placeholder="Calle y número" /></label>${inp('unidad', 'Depto. / unidad')}${inp('comuna', 'Comuna')}
      ${inp('region', 'Región')}${inp('rol', 'Rol SII', 'text', '00000-00000')}${inp('supTotal', 'Sup. total (m²)', 'number')}${inp('supUtil', 'Sup. útil (m²)', 'number')}
      ${inp('dormitorios', 'Dormitorios', 'number')}${inp('banos', 'Baños', 'number')}${inp('estacionamientos', 'Estacionamientos', 'number')}${inp('bodegas', 'Bodegas', 'number')}
      ${inp('gastosComunes', 'Gastos comunes ($)', 'number')}<div class="im-opsel"><label class="im-ck"><input type="checkbox" id="pf_amoblado" ${p.amoblado ? 'checked' : ''} /> Amoblado</label></div>
      <label class="s4">Descripción (pública)<textarea id="pf_descripcion" rows="4">${v('descripcion')}</textarea></label>
      <label class="s4">Notas internas (solo tu equipo)<textarea id="pf_notasInternas" rows="2">${v('notasInternas')}</textarea></label>
    </div><p class="error" id="pfErr"></p>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">${n ? 'Crear propiedad' : 'Guardar cambios'}</button></div></div>`);
  $('#modalCard').classList.add('im-wide');
  const val = (k) => $('#pf_' + k).value;
  const dir = window.Direcciones.conectar($('#pf_direccion'), { inicial: p, alElegir: (d) => { if (d.comuna) $('#pf_comuna').value = d.comuna; if (d.region) $('#pf_region').value = d.region; if (!$('#pf_unidad').value) $('#pf_unidad').focus(); } });
  $('#mCancel').onclick = () => { $('#modalCard').classList.remove('im-wide'); closeModal(); };
  $('#mOk').onclick = async () => {
    const o = { id: p.id, titulo: val('titulo').trim(), tipo: val('tipo'), venta: $('#pf_venta').checked, arriendo: $('#pf_arriendo').checked,
      precioVenta: { valor: val('precioVenta'), moneda: val('precioVentaM') }, precioArriendo: { valor: val('precioArriendo'), moneda: val('precioArriendoM') },
      amoblado: $('#pf_amoblado').checked, descripcion: val('descripcion'), notasInternas: val('notasInternas') };
    for (const k of ['direccion', 'unidad', 'comuna', 'region', 'rol', 'supTotal', 'supUtil', 'dormitorios', 'banos', 'estacionamientos', 'bodegas', 'gastosComunes']) o[k] = val(k).trim();
    Object.assign(o, dir.valor()); // coordenadas de la dirección elegida (geolocalización)
    if (val('codigo').trim()) o.codigo = val('codigo').trim();
    if (o.venta && !p.venta) o.estadoVenta = 'disponible'; if (o.arriendo && !p.arriendo) o.estadoArriendo = 'disponible';
    if (!o.venta) o.estadoVenta = null; if (!o.arriendo) o.estadoArriendo = null;
    try { const r = await api('inmoPropGuardar', o); $('#modalCard').classList.remove('im-wide'); closeModal(); toast(n ? 'Propiedad creada.' : 'Ficha guardada.'); opt.despues ? opt.despues(r) : abrirFicha(r.id); }
    catch (e) { $('#pfErr').textContent = e.message; }
  };
  $('#pf_titulo').focus();
}

// ---------- Personas ----------
// La lista está en React: src/ui/components/functional/personas/Personas.tsx (los filtros quedan en el store).
async function personas() {
  IM.persona = null; ir('personas');
  const el = $('#view-personas'); liberar(el); window.ReactUI.montar('Personas', el);
  try { await cargar(); } catch {}
}
// El detalle de la persona está en React: src/ui/components/functional/persona/FichaPersona.tsx (mismo contenedor).
async function abrirPersona(id) {
  ir('personas'); const el = $('#view-personas'); IM.vez = (IM.vez || 0) + 1;
  if (!(IM.persona === id && el.querySelector('.im-ficha'))) liberar(el);
  IM.persona = id; window.ReactUI.montar('FichaPersona', el, { id, vez: IM.vez });
  try { await cargar(); } catch {}
}
function formPersona(c, opt = {}) {
  const n = !c; c = c || { tipo: 'natural', roles: opt.rol ? [opt.rol] : [], nacionalidad: 'chilena', ...(opt.pre || {}) };
  const v = (k) => esc(c[k] ?? ''); const inp = (k, l, t = 'text', ph = '') => `<label>${l}<input id="cf_${k}" type="${t}" value="${v(k)}" placeholder="${ph}" /></label>`;
  modal(`<div class="im-form"><h2>${n ? 'Nueva persona' : 'Editar persona'}</h2><div class="im-fg">
    <label class="s2">Nombre completo o razón social<input id="cf_nombre" value="${v('nombre')}" /></label>${inp('rut', 'RUT o Rol Único Tributario', 'text', 'Ej.: 12.345.678-9')}
    <label>Tipo<select id="cf_tipo"><option value="natural">Persona natural</option><option value="juridica" ${c.tipo === 'juridica' ? 'selected' : ''}>Persona jurídica</option></select></label>
    ${inp('email', 'Correo', 'email')}${inp('telefono', 'Teléfono', 'tel', '+56 9 …')}<label class="s2">Dirección<input id="cf_direccion" value="${v('direccion')}" /></label>
    ${inp('estadoCivil', 'Estado civil')}${inp('profesion', 'Profesión u oficio')}${inp('nacionalidad', 'Nacionalidad')}
    <div class="s4"><span class="im-lbl">Roles</span><div class="im-roles">${Object.entries(ROL).map(([k, l]) => `<label class="im-ck"><input type="checkbox" value="${k}" ${c.roles.includes(k) ? 'checked' : ''} /> ${l}</label>`).join('')}</div></div>
    <label class="s4">Notas<textarea id="cf_notas" rows="2">${v('notas')}</textarea></label></div><p class="error" id="cfErr"></p>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">${n ? 'Crear persona' : 'Guardar'}</button></div></div>`);
  $('#modalCard').classList.add('im-wide');
  const fin = () => { $('#modalCard').classList.remove('im-wide'); closeModal(); };
  // 0.16.16 · empresa o persona: se sugiere por el RUT (50 millones o más) o la razón social (SpA, Ltda., S.A.…)
  let tipoTocado = !n; const sugerir = () => { if (tipoTocado) return; const r = Number(String($('#cf_rut').value).replace(/[^0-9kK]/g, '').slice(0, -1)); const emp = r >= 50000000 || /\b(spa|ltda|limitada|s\.\s?a\.?|eirl|sociedad|inversiones|inmobiliaria)\b/i.test($('#cf_nombre').value); $('#cf_tipo').value = emp ? 'juridica' : 'natural'; civ(); };
  const civ = () => { const j = $('#cf_tipo').value === 'juridica'; ['estadoCivil', 'nacionalidad'].forEach((k) => $('#cf_' + k).closest('label').classList.toggle('hidden', j)); $('#cf_profesion').closest('label').firstChild.textContent = j ? 'Giro' : 'Profesión u oficio'; };
  $('#cf_tipo').onchange = () => { tipoTocado = true; civ(); }; $('#cf_nombre').addEventListener('input', sugerir); civ();
  $('#cf_rut').onchange = (e) => { if (validRut(e.target.value)) e.target.value = formatRut(e.target.value); sugerir(); };
  $('#mCancel').onclick = fin;
  $('#mOk').onclick = async () => {
    const o = { id: c.id, roles: [...document.querySelectorAll('.im-roles input:checked')].map((i) => i.value) };
    for (const k of ['nombre', 'rut', 'tipo', 'email', 'telefono', 'direccion', 'estadoCivil', 'profesion', 'nacionalidad', 'notas']) o[k] = $('#cf_' + k).value;
    try { const r = await api('inmoPerGuardar', o); fin(); toast(n ? 'Persona creada.' : 'Datos guardados.'); if (opt.despues) return opt.despues(r); abrirPersona(r.id); }
    catch (e) { $('#cfErr').textContent = e.message; }
  };
  $('#cf_nombre').focus();
}

// ---------- Importar desde Portalfirma ----------
function importar() {
  members(async () => {
    modal(`<div class="im-form" style="text-align:center"><div class="spinner"></div><h2>Importando tu cartera</h2><p class="muted" id="impTx">Leyendo propiedades de Portalfirma…</p></div>`);
    const off = (x) => { const t = $('#impTx'); if (t) t.textContent = `Propiedad ${x.i} de ${x.total}…`; }; IM._prog = off;
    try {
      const r = await api('inmoImportar');
      modal(`<div class="im-form"><h2>${icon('check', 18)} Cartera actualizada</h2><dl><dt>Propiedades leídas</dt><dd>${r.total}</dd><dt>Nuevas</dt><dd>${r.nuevas}</dd><dt>Actualizadas</dt><dd>${r.actualizadas}</dd><dt>Sin cambios</dt><dd>${r.sinCambios}</dd><dt>Personas nuevas en el CRM</dt><dd>${r.personas}</dd>${r.errores ? `<dt>No se pudieron leer</dt><dd>${r.errores} (se reintentan en la próxima importación)</dd>` : ''}</dl>
        <p class="muted small">Los datos que edites aquí se respetan en las próximas importaciones.</p><div class="actions"><button class="primary" id="mOk">Ver cartera</button></div></div>`);
      $('#mOk').onclick = () => { closeModal(); cartera({ op: 'todas', especial: '' }); };
    } catch (e) { closeModal(); if (e.message !== 'NEEDS_LOGIN') toast('No se pudo importar: ' + e.message, 5000); }
    finally { IM._prog = null; }
  }, 'Para importar tus propiedades, inicia sesión con tu cuenta de Portalfirma.');
}
pf.onInmoProgreso((x) => IM._prog?.(x));

// ---------- Portal Inmobiliario (Mercado Libre) ----------
// El bloque de la ficha está en React (Paneles.tsx); aquí quedan el formulario «Publicar» (Inmo.publicarPI),
// la pantalla Portales y «Vincular avisos existentes», que también se abren desde otras pantallas.
const TIPO_AVISO = { silver: 'Publicación', gold: 'Destacado', gold_premium: 'Destacado premium' };
async function publicarModal(p, op, opts = {}) {
  modal(`<div class="im-form" style="text-align:center"><div class="spinner"></div><p class="muted">Revisando la ficha para Portal Inmobiliario…</p></div>`);
  let r; try { r = await api('mlRevisar', p.id, op, opts); } catch (e) { closeModal(); return toast(e.message, 5000); }
  const sinConexion = r.errores.some((e) => /Conecta la cuenta|WhatsApp de contacto/.test(e));
  const barrioSel = opts.barrio !== undefined ? opts.barrio?.id : p.portalBarrio?.id;
  modal(`<div class="im-form"><h2 class="im-pih"><span class="im-pilogo">PI</span>Publicar en Portal Inmobiliario</h2><p class="muted small">${esc(p.codigo)} · ${op === 'venta' ? 'Venta' : 'Arriendo'} · también aparece en Mercado Libre</p>
    <label>Título del aviso <span class="muted" id="piCnt"></span><input id="piTit" maxlength="${r.categoria?.maxTitulo || 60}" value="${esc(opts.tituloPortal ?? r.titulo ?? '')}" /></label>
    <dl class="im-pidl"><dt>Categoría</dt><dd>${esc(r.categoria ? r.categoria.ruta.join(' › ') : '—')}</dd><dt>Comuna</dt><dd>${esc(r.ubicacion ? r.ubicacion.city.name + ', ' + r.ubicacion.state.name : '—')}</dd><dt>Fotos</dt><dd>${r.fotos} de ${r.minFotos} recomendadas</dd></dl>
    <div class="im-fg2"><label>Barrio <span class="muted">(opcional)</span><select id="piBar"><option value="">Sin barrio</option>${(r.ubicacion?.barrios || []).map((b) => `<option value="${esc(b.id)}" ${barrioSel === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
      <label>Tipo de aviso<select id="piTipo">${Object.entries(TIPO_AVISO).map(([k, v]) => `<option value="${k}" ${r.tipoAviso === k ? 'selected' : ''}>${v}</option>`).join('')}</select>${r.paquete != null ? `<span class="muted small">Quedan ${r.paquete} en tu paquete</span>` : ''}</label></div>
    ${r.errores.length ? `<div class="im-msg err"><b>Antes de publicar</b><ul>${r.errores.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    ${r.avisos.length ? `<div class="im-msg warn"><b>Para mejorar el aviso</b><ul>${r.avisos.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    <div class="actions">${sinConexion ? '<button class="ghost" id="piCfg">Ir a Portales</button><span class="spacer"></span>' : ''}<button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk" ${r.errores.length ? 'disabled' : ''}>Publicar</button></div></div>`);
  $('#modalCard').classList.add('im-wide');
  const cnt = () => { $('#piCnt').textContent = `${$('#piTit').value.length}/${r.categoria?.maxTitulo || 60}`; }; cnt(); $('#piTit').oninput = cnt;
  const actuales = () => { const s = $('#piBar'); const id = s.value; return { tituloPortal: $('#piTit').value, barrio: id ? { id, name: s.selectedOptions[0].textContent } : null, tipoAviso: $('#piTipo').value }; };
  $('#piTipo').onchange = () => publicarModal(p, op, actuales());
  $('#mCancel').onclick = closeModal; if ($('#piCfg')) $('#piCfg').onclick = () => { closeModal(); portales(); };
  $('#mOk').onclick = async () => {
    const b = $('#mOk'); b.disabled = true; b.textContent = 'Publicando…';
    try { await api('mlPublicar', p.id, op, actuales()); closeModal(); toast('Publicada en Portal Inmobiliario.'); await cargar(); renderFicha(); }
    catch (e) { b.disabled = false; b.textContent = 'Publicar'; let m = $('#piErr'); if (!m) { m = document.createElement('p'); m.id = 'piErr'; m.className = 'error'; b.closest('.actions').before(m); } m.textContent = e.message; }
  };
}

// Pantalla «Portales»: conexión de la cuenta, datos de contacto del aviso, sincronización y migración
async function portales() {
  IM.ficha = null; const tok = ir('cartera'); await cargar();
  const host = liberar($('#view-cartera')); if (tok === IM.tok) host.innerHTML = '<div class="im-wrap"><p class="muted">Cargando…</p></div>';
  const e = await api('mlEstado'); IM.ml = e; const c = e.contacto || {};
  let paq = null; if (e.conectada) paq = await api('mlPaquetes').catch(() => null);
  if (tok !== IM.tok) return;
  const avisos = IM.data.propiedades.flatMap((p) => ['venta', 'arriendo'].map((op) => p.portales?.pi?.[op]).filter((a) => a?.itemId));
  const cuenta = (k) => avisos.filter((a) => a.status === k).length;
  host.innerHTML = `<div class="im-wrap">
    <div class="im-fh"><button class="ghost" id="poBack">${icon('chevL', 16)} Cartera</button></div>
    <div class="im-head fx-portales"><div><h1>Portales</h1><p class="muted">Publica la cartera desde la ficha. Cada cambio de precio, fotos o estado se refleja solo en el aviso.</p></div></div>
    <div class="im-cols">
      <div class="im-box"><div class="im-bh"><h3 class="im-pih"><span class="im-pilogo">PI</span>Portal Inmobiliario</h3>${e.conectada ? '<span class="im-st ok">Conectado</span>' : '<span class="im-st">Sin conectar</span>'}</div>
        ${!e.configurada ? `<div class="im-msg warn"><b>Falta registrar la app de PortalFirma en Mercado Libre.</b> Lo hace PortalFirma una sola vez (ver PORTAL-INMOBILIARIO.md); después cada corredora solo conecta su cuenta.</div>` : ''}
        ${e.conectada ? `<dl class="im-pidl"><dt>Cuenta</dt><dd>${esc(e.cuenta.nickname)}${e.cuenta.email ? ' · ' + esc(e.cuenta.email) : ''}</dd>
          <dt>Avisos</dt><dd>${cuenta('active')} activos · ${cuenta('paused')} pausados · ${cuenta('closed')} finalizados</dd>
          ${paq ? `<dt>Paquetes</dt><dd>${Object.entries(TIPO_AVISO).map(([k, v]) => `${v}: ${paq[k] == null ? '—' : paq[k]}`).join(' · ')}</dd>` : ''}
          <dt>Última sincronización</dt><dd>${e.ultimaSync ? fecha(e.ultimaSync, true) : 'Nunca'}</dd></dl>
          <div class="im-quick"><button class="primary" id="poSync">${icon('rotateR', 15)} Sincronizar avisos e interesados</button><button class="secondary" id="poExist">${icon('link', 15)} Vincular avisos existentes</button></div>
          <p class="muted small">¿La corredora ya publicaba con Convecta u otro sistema? «Vincular avisos existentes» asocia esos avisos a sus fichas por código, para no duplicarlos.</p>
          <button class="ghost small" id="poOut">Desconectar cuenta</button>`
        : `<p>Cada corredora conecta su propia cuenta de Mercado Libre. Ahí debe estar activada como inmobiliaria y tener un paquete de publicación contratado.</p><button class="primary" id="poCon" ${e.configurada ? '' : 'disabled'}>${icon('link', 15)} Conectar cuenta de la corredora</button>`}
      </div>
      <div class="im-box"><h3>Contacto que aparece en los avisos</h3>
        <div class="im-fg2"><label>Nombre de la corredora<input id="coNom" value="${esc(c.nombre || '')}" /></label><label>Correo para consultas<input id="coMail" type="email" value="${esc(c.email || '')}" /></label>
          <label>WhatsApp (obligatorio)<input id="coWa" value="${esc(c.whatsapp || '')}" placeholder="+56 9 1234 5678" /></label><label>Teléfono<input id="coTel" value="${esc(c.telefono || '')}" /></label>
          <label>Sitio web<input id="coWeb" value="${esc(c.web || '')}" placeholder="https://" /></label><label>Tipo de aviso por defecto<select id="coTipo">${Object.entries(TIPO_AVISO).map(([k, v]) => `<option value="${k}" ${e.tipoAviso === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
        <p class="error" id="coErr"></p><div class="actions"><button class="secondary" id="coSave">Guardar contacto</button></div></div>
    </div>
    <div class="im-box"><h3>Otros portales</h3><p class="muted small">Se conectan cuando PortalFirma firme el acuerdo de integrador con cada uno. Toman la cartera desde la misma ficha.</p>
      <div class="im-otros">${[['TOCTOC', 'Integra con sistemas de cartera reconocidos (Convecta, Ofinet, Wasi)'], ['Chilepropiedades', 'Lee la cartera una vez al día, sin costo si es factible'], ['Yapo', 'Integración con CRM vía su ejecutivo comercial'], ['Goplaceit', 'Vía Goplaceit Pro']].map(([n, d]) => `<div class="im-otro"><b>${n}</b><small>${d}</small><span class="im-st">Requiere acuerdo</span></div>`).join('')}</div></div></div>`;
  $('#poBack').onclick = () => cartera(); window.Ayuda?.onView('portales');
  $('#coSave').onclick = async () => { try { await api('mlContacto', { nombre: $('#coNom').value, email: $('#coMail').value, whatsapp: $('#coWa').value, telefono: $('#coTel').value, web: $('#coWeb').value }, $('#coTipo').value); $('#coErr').textContent = ''; toast('Contacto guardado.'); } catch (er) { $('#coErr').textContent = er.message; } };
  if ($('#poCon')) $('#poCon').onclick = async () => { const b = $('#poCon'); b.disabled = true; b.textContent = 'Esperando la autorización en Mercado Libre…'; try { await api('mlConectar'); toast('Cuenta conectada.'); } catch (er) { if (!/cerró la ventana/.test(er.message)) toast(er.message, 6000); } portales(); };
  if ($('#poOut')) $('#poOut').onclick = async () => { await api('mlDesconectar'); toast('Cuenta desconectada. Los avisos siguen publicados.'); portales(); };
  if ($('#poSync')) $('#poSync').onclick = async () => { const b = $('#poSync'); b.disabled = true; b.textContent = 'Sincronizando…'; try { const r = await api('mlSincronizar'); await portales(); toast(`${r.avisos} ${r.avisos === 1 ? 'aviso revisado' : 'avisos revisados'} · ${r.leads} ${r.leads === 1 ? 'interesado nuevo' : 'interesados nuevos'}.`, 4000); } catch (er) { toast(er.message, 6000); portales(); } };
  if ($('#poExist')) $('#poExist').onclick = () => existentesModal();
}
async function existentesModal() {
  modal(`<div class="im-form" style="text-align:center"><div class="spinner"></div><p class="muted">Buscando los avisos activos de la cuenta…</p></div>`);
  let l; try { l = await api('mlExistentes'); } catch (e) { closeModal(); return toast(e.message, 5000); }
  const props = IM.data.propiedades.filter((p) => !p.archivada);
  modal(`<div class="im-form"><h2>Avisos existentes en Portal Inmobiliario</h2>
    ${l.length ? `<p class="muted small">Asocia cada aviso a su ficha. Los que coinciden por código ya vienen marcados. Al vincularlos, la app los mantiene al día sin publicar de nuevo.</p>
    <div class="im-exl">${l.map((x, i) => `<div class="im-ex"><input type="checkbox" data-i="${i}" ${x.propId ? 'checked' : ''} /><span class="im-ext"><b>${esc(x.titulo)}</b><small>${esc(x.itemId)}${x.codigo ? ' · código ' + esc(x.codigo) : ''} · ${esc(x.moneda === 'CLF' ? 'UF ' + fmtN(x.precio) : '$' + fmtN(x.precio))}</small></span>
      <select data-p="${i}"><option value="">Elegir propiedad…</option>${props.map((p) => `<option value="${esc(p.id)}" ${x.propId === p.id ? 'selected' : ''}>${esc(p.codigo)} · ${esc(p.titulo.slice(0, 40))}</option>`).join('')}</select>
      <select data-o="${i}"><option value="venta" ${x.op === 'venta' ? 'selected' : ''}>Venta</option><option value="arriendo" ${x.op === 'arriendo' ? 'selected' : ''}>Arriendo</option></select></div>`).join('')}</div>` : '<p>No hay avisos activos sin vincular en la cuenta.</p>'}
    <div class="actions"><button class="secondary" id="mCancel">Cerrar</button>${l.length ? '<button class="primary" id="mOk">Vincular seleccionados</button>' : ''}</div></div>`);
  $('#modalCard').classList.add('im-wide'); $('#mCancel').onclick = closeModal;
  if ($('#mOk')) $('#mOk').onclick = async () => {
    const sel = l.map((x, i) => ({ ...x, propId: $(`[data-p="${i}"]`).value, op: $(`[data-o="${i}"]`).value, ok: $(`[data-i="${i}"]`).checked })).filter((x) => x.ok && x.propId);
    const n = await api('mlVincular', sel); closeModal(); toast(`${n} ${n === 1 ? 'aviso vinculado' : 'avisos vinculados'}.`); portales();
  };
}
pf.onInmoPortal((m) => { toast(m.join(' '), 5000); if (IM.ficha && !$('#view-cartera').classList.contains('hidden')) cargar().then(renderFicha); });

window.Inmo = { fichaTab: (k) => { if (IM.ficha) window.__ficha?.tab(IM.ficha, k); }, portales, publicarPI: publicarModal, cargar, inicio, cartera, personas, abrirFicha, abrirPersona, dropFiles, importar, formProp, formPersona, VIEWS: INMO_VIEWS, _IM: IM, fichaAbierta: () => !!IM.ficha && !$('#view-cartera').classList.contains('hidden') };
