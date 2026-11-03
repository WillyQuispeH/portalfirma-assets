/* global pf, $, esc, show, toast, modal, closeModal, api, icon, members, formatRut, validRut */
'use strict';
// PortalFirma Asset: Inicio inmobiliario, Cartera (propiedades) y Personas (CRM con RUT único).
// Los datos viven en la base local (src/inmo.js); las propiedades reales se importan desde Portalfirma.

const IM = { data: { propiedades: [], personas: [] }, f: { q: '', op: 'todas', tipo: '', estado: '', comuna: '', especial: '', archivadas: false, captador: '' }, pf: { q: '', rol: '' }, ficha: null, persona: null };
const TIPO = { casa: 'Casa', departamento: 'Departamento', oficina: 'Oficina', sitio: 'Sitio', local_comercial: 'Local comercial', industrial: 'Industrial', agricola: 'Agrícola', parcela: 'Parcela', estacionamiento: 'Estacionamiento', terreno_construccion: 'Terreno', bodega: 'Bodega' };
const ESTADO = { disponible: ['Disponible', 'ok'], reservada: ['Reservada', 'res'], vendida: ['Vendida', 'end'], arrendada: ['Arrendada', 'end'], no_disponible: ['No disponible', 'off'] };
const ROL = { propietario: 'Propietario', arrendatario: 'Arrendatario', comprador: 'Comprador', codeudor: 'Codeudor', interesado: 'Interesado', proveedor: 'Proveedor' };
const PRONTO = {
  negocios: { t: 'Negocios y firma', ic: 'briefcase', etapa: 2, d: 'El embudo de cada venta y arriendo: reserva, promesa, contrato, escritura y entrega. Los contratos salen de tus plantillas con los datos de la ficha, y cada hito se marca solo cuando el documento queda firmado.', hoy: [['tpl', 'Notaría virtual', 'Contratos y mandatos con los datos de la propiedad'], ['send', 'Enviar a firmar', 'Cualquier documento, firma simple o avanzada'], ['escr', 'Gestión de firmas presenciales', 'Escrituras y reducciones en notaría']] },
  arriendos: { t: 'Arriendos y cobranza', ic: 'key', etapa: 3, d: 'Cobro mensual con enlace Flow o transferencia, reajuste IPC/UF, morosidad, liquidación al propietario, garantía, renovación y término, con avisos por WhatsApp.', hoy: [['plazos', 'Plazos y vencimientos', 'Tus contratos ordenados por vencimiento']] },
  finanzas: { t: 'Facturación y contabilidad', ic: 'coins', etapa: 4, d: 'Facturas y boletas por comisión y administración, emitidas desde aquí. Cada cobro, pago y liquidación genera su asiento contable y queda respaldado.', hoy: [] },
};

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
const INMO_VIEWS = ['inicio', 'cartera', 'personas', 'pronto'];
function ir(v) { IM.tok = (IM.tok || 0) + 1; show(v); document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === (v === 'pronto' ? IM.pronto : v === 'actividad' ? 'inicio' : v)));  return IM.tok; }

// ---------- Inicio ----------
async function inicio() {
  if (window.Oficina && window.Oficina.pref.get() !== 'clasica') return window.Oficina.abrir(); // 0.16: «La oficina» con el equipo
  if (window.Hoy) return window.Hoy.abrir(); // 0.15: «Hoy» (etapas, logrados / pendientes / no logrados)
  const tok = ir('inicio');
  let r; try { r = await api('inmoResumen'); } catch (e) { $('#view-inicio').innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
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
  $('#view-inicio').innerHTML = `<div class="im-wrap">
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
async function cartera(filtros) {
  if (filtros) Object.assign(IM.f, filtros);
  IM.ficha = null; const tok = ir('cartera'); await cargar(); if (tok === IM.tok) renderCartera();
}
function filtrar() {
  const f = IM.f; const q = f.q.trim().toLowerCase();
  return IM.data.propiedades.filter((p) => {
    if (!!p.archivada !== f.archivadas) return false;
    if (f.op === 'venta' && !p.venta) return false; if (f.op === 'arriendo' && !p.arriendo) return false;
    if (f.tipo && p.tipo !== f.tipo) return false; if (f.comuna && p.comuna !== f.comuna) return false;
    if (f.estado && !((p.venta && p.estadoVenta === f.estado) || (p.arriendo && p.estadoArriendo === f.estado))) return false;
    if (f.captador && (f.captador === '_sin' ? !!p.captadorId : p.captadorId !== f.captador)) return false;
    if (f.especial === 'sinProp' && (p.vinculos || []).some((v) => v.rol === 'propietario')) return false;
    if (f.especial === 'sinFotos' && p.fotos?.length) return false;
    if (f.especial === 'leads' && !(p.leads || []).some((l) => !l.visto)) return false;
    if (f.especial === 'reservadas' && p.estadoVenta !== 'reservada' && p.estadoArriendo !== 'reservada') return false;
    if (f.especial === 'enCaptacion' && IM.capt?.[p.id]?.completa !== false) return false;
    if (q) { const dueños = (p.vinculos || []).map((v) => per(v.personaId)).filter(Boolean).map((c) => c.nombre + ' ' + c.rut).join(' ');
      if (![p.codigo, p.titulo, p.direccion, p.comuna, p.rol, dueños].join(' ').toLowerCase().includes(q)) return false; }
    return true;
  });
}
const ESPECIAL = { enCaptacion: 'Captación incompleta', sinProp: 'Sin propietario', sinFotos: 'Sin fotos', reservadas: 'Reservadas', leads: 'Con interesados nuevos' };
// 0.16.11 · captación de la propiedad (datos, mandato, fotos, publicada): se ve en Cartera, no en Negocios
function captTag(p) {
  const c = IM.capt?.[p.id]; if (!c) return '';
  if (c.completa) return `<span class="im-capt ok" title="Captación completa">${icon('check', 12)} Captación completa</span>`;
  return `<span class="im-capt ${c.actual?.e === 'fail' ? 'fail' : ''}" title="Falta: ${esc(c.falta.join(', '))}"><span class="im-cbar"><i style="width:${Math.round((c.ok / c.total) * 100)}%"></i></span>Captación ${c.ok}/${c.total} · falta ${esc((c.falta[0] || '').toLowerCase())}${c.falta.length > 1 ? ` y ${c.falta.length - 1} más` : ''}</span>`;
}
function renderCartera() {
  const host = $('#view-cartera'); const f = IM.f; const lista = filtrar();
  const comunas = [...new Set(IM.data.propiedades.map((p) => p.comuna).filter(Boolean))].sort();
  const hayCor = !!IM.acc?.corredores?.length; const sel = IM.selCapt;
  const card = (p) => `<button class="im-card${sel ? ' im-selmode' : ''}${sel?.has(p.id) ? ' im-sel' : ''}" data-id="${esc(p.id)}">${sel ? `<span class="im-check">${sel.has(p.id) ? icon('check', 14) : ''}</span>` : ''}<span class="im-ph">${foto(p)}<span class="im-ops">${p.venta ? '<i>Venta</i>' : ''}${p.arriendo ? '<i>Arriendo</i>' : ''}${['venta', 'arriendo'].some((o) => p.portales?.pi?.[o]?.status === 'active') ? '<i class="pi" title="Publicada en Portal Inmobiliario">PI</i>' : ''}${(p.leads || []).some((l) => !l.visto) ? '<i class="ld">Interesados</i>' : ''}</span></span>
    <span class="im-cb"><small class="im-code">${esc(p.codigo || '')} · ${esc(TIPO[p.tipo] || p.tipo)}</small><strong>${esc(p.titulo)}</strong><span class="im-addr">${icon('pin', 13)}${esc(dirTxt(p) || 'Sin dirección')}</span>
    <span class="im-prices">${p.venta && p.precioVenta ? `<b>${precio(p.precioVenta)}</b>` : ''}${p.arriendo && p.precioArriendo ? `<b>${precio(p.precioArriendo)}<small>/mes</small></b>` : ''}</span>
    <span class="im-specs">${specs(p)}</span><span class="im-sts">${p.venta ? pill(p.estadoVenta, p.arriendo ? 'V' : '') : ''}${p.arriendo ? pill(p.estadoArriendo, p.venta ? 'A' : '') : ''}</span>${captTag(p)}${hayCor ? `<span class="im-captby${p.captador ? '' : ' sin'}">${icon('user', 11)} ${esc(p.captador?.nombre || 'Sin captador')}</span>` : ''}</span></button>`;
  host.innerHTML = `<div class="im-wrap">
    <div class="im-head fx-cartera"><div><h1>Cartera</h1><p class="muted">${IM.data.propiedades.filter((p) => !p.archivada).length} propiedades${IM.data.ultimaImportacion ? ' · actualizada desde Portalfirma el ' + fecha(IM.data.ultimaImportacion.fecha) : ''}</p></div>
      <div class="row"><button class="secondary" id="imPort">${icon('link', 15)} Portales</button><button class="secondary" id="imImp">${icon('download', 15)} Importar desde Portalfirma</button><button class="secondary" id="imDict" title="Graba un audio o pega la descripción y Asset llena la ficha">${icon('mic', 15)} Dictar</button><button class="primary" id="imNew">${icon('plus', 15)} Nueva propiedad</button></div></div>
    <div class="im-bar">
      <label class="im-search">${icon('search', 15)}<input id="imQ" placeholder="Buscar por código, dirección, comuna, rol o propietario" value="${esc(f.q)}" /></label>
      <div class="im-seg" id="imOp">${['todas', 'venta', 'arriendo'].map((o) => `<button data-op="${o}" class="${f.op === o ? 'on' : ''}">${o === 'todas' ? 'Todas' : o === 'venta' ? 'Venta' : 'Arriendo'}</button>`).join('')}</div>
      <select id="imTipo"><option value="">Todo tipo</option>${Object.entries(TIPO).map(([k, v]) => `<option value="${k}" ${f.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select id="imEst"><option value="">Todo estado</option>${Object.entries(ESTADO).map(([k, [v]]) => `<option value="${k}" ${f.estado === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      ${(() => { const n = IM.data.propiedades.filter((p) => !p.archivada && IM.capt?.[p.id]?.completa === false).length; return n ? `<button class="im-cf ${f.especial === 'enCaptacion' ? 'on' : ''}" id="imCapt" title="Propiedades a las que les falta algo de la captación">${icon('clock', 13)} En captación · ${n}</button>` : ''; })()}
      <select id="imCom"><option value="">Toda comuna</option>${comunas.map((c) => `<option ${f.comuna === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      ${hayCor ? `<select id="imCaptF"><option value="">Todo captador</option><option value="_sin" ${f.captador === '_sin' ? 'selected' : ''}>Sin captador · ${IM.data.propiedades.filter((p) => !p.archivada && !p.captadorId).length}</option>${IM.acc.corredores.map((c) => `<option value="${esc(c.id)}" ${f.captador === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>` : ''}
      ${hayCor && IM.acc.esAdmin && !sel ? `<button class="secondary small" id="imCaptBulk" title="Elige varias propiedades y asígnales quién las captó">${icon('users', 14)} Asignar captador</button>` : ''}
    </div>
    ${sel ? `<div class="im-bulk"><b id="imBulkN">${sel.size} seleccionada${sel.size === 1 ? '' : 's'}</b><button class="ghost small" id="imBulkAll">Seleccionar las ${lista.length} de la lista</button><button class="ghost small" id="imBulkNone">Ninguna</button><span class="spacer"></span>
      <label>Captada por<select id="imBulkCor">${IM.acc.corredores.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}<option value="">— quitar captador —</option></select></label>
      <button class="primary small" id="imBulkOk" ${sel.size ? '' : 'disabled'}>Asignar</button><button class="secondary small" id="imBulkX">Cancelar</button></div>` : ''}
    ${f.especial || f.archivadas ? `<div class="im-chips">${f.especial ? `<span class="im-chip">${ESPECIAL[f.especial]}<button data-clr="especial" title="Quitar filtro">${icon('x', 12)}</button></span>` : ''}${f.archivadas ? `<span class="im-chip">Archivadas<button data-clr="archivadas">${icon('x', 12)}</button></span>` : ''}</div>` : ''}
    ${lista.length ? `<div class="im-grid">${lista.map(card).join('')}</div>` : `<div class="im-empty sm"><span class="im-eic">${icon('search', 30)}</span><p>${IM.data.propiedades.length ? 'Ninguna propiedad coincide con los filtros.' : 'Aún no tienes propiedades. Impórtalas desde Portalfirma o crea la primera.'}</p></div>`}
    <p class="im-foot"><button class="ghost small" id="imArch">${f.archivadas ? 'Ver activas' : 'Ver archivadas'}</button></p></div>`;
  const re = () => renderCartera();
  $('#imQ').oninput = (e) => { f.q = e.target.value; clearTimeout(IM._t); IM._t = setTimeout(() => { re(); const i = $('#imQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 180); };
  $('#imOp').onclick = (e) => { const b = e.target.closest('[data-op]'); if (b) { f.op = b.dataset.op; re(); } };
  $('#imCapt')?.addEventListener('click', () => { f.especial = f.especial === 'enCaptacion' ? '' : 'enCaptacion'; re(); });
  $('#imTipo').onchange = (e) => { f.tipo = e.target.value; re(); }; $('#imEst').onchange = (e) => { f.estado = e.target.value; re(); }; $('#imCom').onchange = (e) => { f.comuna = e.target.value; re(); };
  $('#imNew').onclick = () => formProp(); $('#imImp').onclick = () => importar(); $('#imPort').onclick = () => portales();
  $('#imDict')?.addEventListener('click', async () => { await window.Agente.open?.(); window.Dictado.abrir(); });
  $('#imArch').onclick = () => { f.archivadas = !f.archivadas; re(); };
  host.querySelector('.im-grid')?.addEventListener('click', (e) => { const c = e.target.closest('[data-id]'); if (!c) return;
    if (IM.selCapt) { const id = c.dataset.id; IM.selCapt.has(id) ? IM.selCapt.delete(id) : IM.selCapt.add(id); return re(); } abrirFicha(c.dataset.id); });
  $('#imCaptF')?.addEventListener('change', (e) => { f.captador = e.target.value; re(); });
  $('#imCaptBulk')?.addEventListener('click', () => { IM.selCapt = new Set(); if (!f.captador) f.captador = '_sin'; re(); });
  if (IM.selCapt) {
    $('#imBulkAll').onclick = () => { lista.forEach((p) => IM.selCapt.add(p.id)); re(); };
    $('#imBulkNone').onclick = () => { IM.selCapt.clear(); re(); };
    $('#imBulkX').onclick = () => { IM.selCapt = null; re(); };
    $('#imBulkOk').onclick = async () => { const ids = [...IM.selCapt]; const cor = $('#imBulkCor').value; const nom = $('#imBulkCor').selectedOptions[0].textContent;
      modal(`<h2>Asignar captador</h2><p>${cor ? `¿Dejar <b>${ids.length}</b> propiedad${ids.length === 1 ? '' : 'es'} como captada${ids.length === 1 ? '' : 's'} por <b>${esc(nom)}</b>?` : `¿Quitar el captador de <b>${ids.length}</b> propiedad${ids.length === 1 ? '' : 'es'}?`}</p><p class="muted small">Queda anotado en el historial de cada una. ${cor ? `${esc(nom.split(' ')[0])} verá los datos de sus propietarios.` : ''}</p>
        <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Asignar</button></div>`);
      $('#mCancel').onclick = closeModal;
      $('#mOk').onclick = async () => { try { const r = await api('accCaptadorVarios', ids, cor || null); closeModal(); IM.selCapt = null; toast(`${r.cambiadas} propiedad${r.cambiadas === 1 ? '' : 'es'} ${cor ? 'asignada' + (r.cambiadas === 1 ? '' : 's') + ' a ' + nom : 'sin captador'}.`, 5000); await cargar(); re(); } catch (e) { closeModal(); toast(e.message, 5000); } }; };
  }
  host.querySelectorAll('[data-clr]').forEach((b) => (b.onclick = () => { f[b.dataset.clr] = b.dataset.clr === 'archivadas' ? false : ''; re(); }));
}

// ---------- Ficha de la propiedad ----------
async function abrirFicha(id) { const tok = ir('cartera'); IM.ficha = id; await cargar(); if (tok === IM.tok) renderFicha(); }
async function renderFicha() {
  const p = prop(IM.ficha); const host = $('#view-cartera'); if (!p) return cartera();
  const tok = IM.tok; const act = await api('inmoActividad', p.id).catch(() => []);
  IM.negs = (await api('negListar').catch(() => ({ negocios: [] }))).negocios.filter((n) => n.propId === p.id);
  IM.ml = await api('mlEstado').catch(() => null);
  if (tok !== IM.tok || IM.ficha !== p.id) return;
  const fila = (k, v) => (v === '' || v == null ? '' : `<div><dt>${k}</dt><dd>${v}</dd></div>`);
  const est = (campo, val, opts) => `<select data-est="${campo}">${opts.map((o) => `<option value="${o}" ${val === o ? 'selected' : ''}>${ESTADO[o][0]}</option>`).join('')}</select>`;
  const vincs = (p.vinculos || []).map((v) => ({ ...v, c: per(v.personaId) })).filter((v) => v.c);
  const origen = p.origen ? `<p class="im-orig">${icon('link', 13)} Importada desde Portalfirma${p.origen.fuente ? ` (origen ${esc(p.origen.fuente)})` : ''} · ${fecha(p.origen.importado, true)}${p.editados?.length ? ` · ${p.editados.length} ${p.editados.length === 1 ? 'dato editado' : 'datos editados'} aquí se mantienen al actualizar` : ''}</p>` : '';
  // 0.16.16 · la ficha en pestañas, con una franja de resumen arriba (antes todo se apilaba en una columna larga)
  const abiertos = (IM.negs || []).filter((n) => n.estado === 'abierto'); const enFirma = (p.firmas || []).filter((f) => f.operacion && !['firmado', 'anulado'].includes(f.estado));
  const pub = ['venta', 'arriendo'].filter((o) => p[o] && p.portales?.pi?.[o]?.status === 'active');
  const TABS = [['resumen', 'Resumen'], ['propietario', `Propietario${p.duenoVisible === false ? ` ${icon('lock', 12)}` : ''}`], ['negocios', `Negocios${abiertos.length ? ` <b>${abiertos.length}</b>` : ''}`], ['firmas', `Firmas y documentos${enFirma.length ? ` <b>${enFirma.length}</b>` : ''}`], ['portales', 'Portales'], ['historial', 'Historial']];
  const tab = (IM.fichaTab?.[p.id] === 'captacion' ? 'resumen' : IM.fichaTab?.[p.id]) || 'resumen';
  host.innerHTML = `<div class="im-wrap im-ficha">
    <div class="im-fh"><button class="ghost" id="fBack">${icon('chevL', 16)} Cartera</button><span class="spacer"></span>
      <button class="primary" id="fPub">${icon('export', 15)} Publicar</button><button class="secondary" id="fAg">${icon('sparkle', 15)} Ver en el Agente</button><button class="secondary" id="fGen">${icon('filePlus', 15)} Generar documento</button><button class="secondary" id="fFicha">${icon('edit', 15)} Ficha completa</button><button class="secondary" id="fEdit">Datos básicos</button><button class="ghost" id="fArch">${p.archivada ? 'Restaurar' : 'Archivar'}</button></div>
    <div class="im-ft"><small class="im-code">${esc(p.codigo || '')} · ${esc(TIPO[p.tipo] || p.tipo)}${p.rol ? ' · Rol ' + esc(p.rol) : ''}</small><h1>${esc(p.titulo)}</h1><p class="muted">${icon('pin', 14)} ${esc(dirTxt(p) || 'Sin dirección')}${p.region ? ', ' + esc(p.region) : ''}${p.lat != null ? ` · <a href="#" id="fMapa">ver en el mapa</a>` : ''}</p>${origen}</div>
    <div class="im-strip" id="fStrip">
      ${p.venta ? `<button class="im-sc" data-go="resumen"><small>Venta</small><b>${precio(p.precioVenta) || 'Sin precio'}</b><em>${esc(ESTADO[p.estadoVenta || 'disponible']?.[0] || '')}</em></button>` : ''}
      ${p.arriendo ? `<button class="im-sc" data-go="resumen"><small>Arriendo</small><b>${precio(p.precioArriendo) || 'Sin precio'}</b><em>${esc(ESTADO[p.estadoArriendo || 'disponible']?.[0] || '')}</em></button>` : ''}
      <button class="im-sc" data-go="resumen" id="fStripCaptB"><small>Captación</small><b id="fStripCapt">…</b><em id="fStripCaptD"></em></button>
      <button class="im-sc" data-go="negocios"><small>Negocios abiertos</small><b>${abiertos.length}</b><em>${abiertos.length ? esc([...new Set(abiertos.map((n) => n.etapaInfo?.t))].slice(0, 2).join(' · ')) : 'Ninguno'}</em></button>
      <button class="im-sc${enFirma.length ? ' wait' : ''}" data-go="firmas"><small>En firma</small><b>${enFirma.length}</b><em>${enFirma.length ? esc(enFirma[0].plantilla) : 'Nada pendiente'}</em></button>
      <button class="im-sc${pub.length ? ' ok' : ''}" data-go="portales"><small>Portal Inmobiliario</small><b>${pub.length ? 'Publicada' : 'No publicada'}</b><em>${pub.length ? pub.join(' y ') : ''}</em></button>
    </div>
    <div class="im-ftabs" role="tablist">${TABS.map(([k, l]) => `<button class="im-ftab${k === tab ? ' on' : ''}" data-tab="${k}" role="tab">${l}</button>`).join('')}</div>
    <div class="im-pane${tab === 'resumen' ? '' : ' hidden'}" data-pane="resumen"><div class="im-captres" id="fCapt"><p class="muted small">Cargando la captación…</p></div><div class="im-fcols">
      <div>
        <div class="im-gal">${p.fotos?.length ? `<div class="im-gmain">${foto(p)}</div>${p.fotos.length > 1 ? `<div class="im-thumbs">${p.fotos.slice(0, 12).map((u, i) => `<img src="${esc(u)}" data-i="${i}" class="im-th ${i ? '' : 'on'}" loading="lazy" alt="" />`).join('')}</div>` : ''}` : `<div class="im-gmain vacia">${foto(p)}<span class="im-gnote">Sin fotos todavía</span></div>`}<button class="secondary small im-gdrive" id="fDrive">${icon('drive', 14)} Fotos desde Drive</button></div>
        <div class="im-box"><h3>Características</h3>${[p.supTotal, p.supUtil, p.dormitorios, p.banos, p.estacionamientos, p.bodegas, p.gastosComunes].every((x) => x == null || x === '') && !p.amoblado && !p.corredor ? `<p class="muted small im-vacio">Sin características todavía · <a href="#" id="fCarVacio">Completar ficha</a></p>` : ''}<dl class="im-dl">
          ${fila('Superficie total', p.supTotal != null ? fmtN(p.supTotal) + ' m²' : '')}${fila('Superficie útil', p.supUtil != null ? fmtN(p.supUtil) + ' m²' : '')}
          ${fila('Dormitorios', p.dormitorios)}${fila('Baños', p.banos)}${fila('Estacionamientos', p.estacionamientos)}${fila('Bodegas', p.bodegas)}
          ${fila('Gastos comunes', p.gastosComunes != null ? '$' + fmtN(p.gastosComunes) : '')}${fila('Amoblado', p.amoblado ? 'Sí' : '')}
          ${fila('Corredor', p.corredor ? esc(p.corredor.nombre) + (p.corredor.email ? `<br><span class="muted small">${esc(p.corredor.email)}</span>` : '') : '')}</dl>
          ${p.descripcion ? `<h3 style="margin-top:14px">Descripción</h3><p class="im-desc">${esc(p.descripcion)}</p>` : ''}
          ${p.notasInternas ? `<h3 style="margin-top:14px">Notas internas</h3><p class="im-desc">${esc(p.notasInternas)}</p>` : ''}</div>
      </div>
      <div>
        <div class="im-box"><h3>Comercialización</h3>
          ${p.venta ? `<div class="im-com"><span><small>Venta</small><b>${precio(p.precioVenta) || 'Sin precio'}</b></span>${est('estadoVenta', p.estadoVenta, ['disponible', 'reservada', 'vendida', 'no_disponible'])}</div>` : ''}
          ${p.arriendo ? `<div class="im-com"><span><small>Arriendo mensual</small><b>${precio(p.precioArriendo) || 'Sin precio'}</b></span>${est('estadoArriendo', p.estadoArriendo, ['disponible', 'reservada', 'arrendada', 'no_disponible'])}</div>` : ''}</div>
        <div class="im-box"><div class="im-bh"><h3>Personas</h3><button class="secondary small" id="fVinc">${icon('plus', 13)} Vincular</button></div>
          ${vincs.length ? vincs.map((v) => `<div class="im-pv"><span class="im-av">${esc(v.c.nombre.trim()[0] || '?')}</span><span class="im-pvt"><b ${v.c.reservado ? '' : `data-per="${esc(v.c.id)}"`}>${v.c.reservado ? icon('lock', 12) + ' ' : ''}${esc(v.c.nombre)}</b><small>${esc(ROL[v.rol])}${v.c.rut ? ' · ' + esc(v.c.rut) : v.c.reservado ? ' · lo ve quien captó la propiedad' : ''}</small></span>
            ${v.c.telefono ? `<button class="ghost small" title="WhatsApp" data-wa="${esc(v.c.telefono)}">${icon('whatsapp', 15)}</button>` : ''}${v.c.email ? `<button class="ghost small" title="Copiar correo" data-mail="${esc(v.c.email)}">${icon('mail', 15)}</button>` : ''}
            ${v.c.reservado ? '' : `<button class="ghost small" title="Quitar vínculo" data-unl="${esc(v.c.id)}" data-rol="${esc(v.rol)}">${icon('x', 14)}</button>`}</div>`).join('') : '<p class="muted small">Sin personas vinculadas. Agrega al propietario para poder firmar el mandato.</p>'}</div>
        <div class="im-box"><div class="im-bh"><h3>Lo último</h3><button class="ghost small" data-go="historial">Ver todo</button></div><ul class="im-act sm">${act.slice(0, 5).map((a) => `<li class="${a.tipo === 'nota' ? 'nota' : ''}"><i></i><span>${esc(a.texto)}<small>${fecha(a.fecha, true)}</small></span></li>`).join('')}</ul></div>
      </div></div></div>
    <div class="im-pane${tab === 'propietario' ? '' : ' hidden'}" data-pane="propietario"><div class="im-pw" id="fDueno"><p class="muted small">Cargando…</p></div></div>
    </div></div>
    <div class="im-pane${tab === 'negocios' ? '' : ' hidden'}" data-pane="negocios"><div class="im-pw">${negociosBox(p)}</div></div>
    <div class="im-pane${tab === 'firmas' ? '' : ' hidden'}" data-pane="firmas"><div class="im-fcols"><div>${firmasBox(p)}</div><div>
        <div class="im-box" id="fDocs"><div class="im-bh"><h3>Documentos</h3><span><button class="ghost small" id="fDir" title="Abrir carpeta">${icon('folderOpen', 15)}</button><button class="secondary small" id="fDoc">${icon('plus', 13)} Agregar</button></span></div>
          ${(p.documentos || []).length ? p.documentos.map((d) => `<div class="im-doc"><span class="im-dic">${icon('file', 16)}</span><span class="im-dt"><b>${esc(d.nombre)}</b><small>${fecha(d.fecha)}</small></span><button class="secondary small" data-open="${esc(d.id)}">Abrir</button><button class="ghost small" data-rm="${esc(d.id)}" title="Quitar">${icon('trash', 14)}</button></div>`).join('') : '<p class="muted small">Arrastra aquí mandatos, escrituras, certificados o fotos. Los PDF se abren en el editor para enviarlos a firmar.</p>'}</div>
    </div></div></div>
    <div class="im-pane${tab === 'portales' ? '' : ' hidden'}" data-pane="portales"><div class="im-fcols"><div>${portalBox(p) || '<div class="im-box"><p class="muted small">Marca la propiedad en venta o arriendo para publicarla.</p></div>'}</div><div>${leadsBox(p) || '<div class="im-box"><h3>Interesados desde portales</h3><p class="muted small">Todavía no llegan interesados desde los avisos.</p></div>'}</div></div></div>
    <div class="im-pane${tab === 'historial' ? '' : ' hidden'}" data-pane="historial"><div class="im-pw">
        <div class="im-box"><h3>Historial</h3><form class="im-nota" id="fNota"><input id="fNotaT" placeholder="Agregar una nota (visita, llamada, acuerdo…)" /><button class="secondary small">Guardar</button></form>
          <ul class="im-act sm">${act.map((a) => `<li class="${a.tipo === 'nota' ? 'nota' : ''}"><i></i><span>${esc(a.texto)}<small>${fecha(a.fecha, true)}</small></span></li>`).join('')}</ul></div>
    </div></div>
    </div>`;
  const irTab = (k) => { if (k === 'captacion') k = 'resumen'; (IM.fichaTab ||= {})[p.id] = k; host.querySelectorAll('.im-ftab').forEach((b) => b.classList.toggle('on', b.dataset.tab === k)); host.querySelectorAll('.im-pane').forEach((x) => x.classList.toggle('hidden', x.dataset.pane !== k)); };
  IM.irTab = irTab;
  host.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => irTab(b.dataset.tab)));
  host.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => irTab(b.dataset.go)));
  api('etPasos', { propId: p.id, ambito: 'captacion' }).then((r) => { const e = r.etapas[0]; if (!$('#fStripCapt')) return; $('#fStripCapt').textContent = `${e.ok} de ${e.total}`; $('#fStripCaptD').textContent = r.actual ? r.actual.t : 'Completa'; $('#fStripCapt').closest('.im-sc').classList.toggle('ok', !r.actual); }).catch(() => {});
  window.Etapas?.bloque($('#fCapt'), { propId: p.id, alCambiar: () => renderFicha(), compacto: true });
  $('#fCarVacio')?.addEventListener('click', (e) => { e.preventDefault(); $('#fFicha').click(); });
  propietarioBox(p);
  $('#fBack').onclick = () => cartera(); $('#fEdit').onclick = () => formProp(p); $('#fFicha').onclick = () => window.FichaBloques.abrir(p.id, { despues: () => renderFicha() });
  $('#fPub').onclick = () => window.Publicaciones.publicar(p.id);
  $('#fMapa')?.addEventListener('click', (e) => { e.preventDefault(); pf.openUrl(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`); });
  $('#fAg').onclick = () => members(async () => { await window.Agente.vista(); window.Gestion.estado(p.id, { usuario: `¿Cómo va ${p.codigo}?` }); }, 'El Agente trabaja con tu cuenta de Portalfirma. Inicia sesión para usarlo.');
  $('#fGen').onclick = () => members(() => window.Gestion.documento(p.id), 'Para generar documentos desde tus plantillas, inicia sesión con tu cuenta de Portalfirma.');
  $('#fFirmas')?.addEventListener('click', () => window.Gestion.firmas(p.id));
  $('#fDrive')?.addEventListener('click', () => window.Fotos.drive(p.id));
  document.querySelectorAll('#fFirmasBox [data-pdf]').forEach((b) => (b.onclick = () => api('dgAbrir', b.dataset.pdf).catch((e) => toast(e.message, 4000))));
  host.querySelectorAll('[data-fop]').forEach((b) => (b.onclick = () => window.Gestion.operaciones(Number(b.dataset.fop))));
  wirePortal(p);
  window.Ayuda?.onView('ficha');
  $('#view-cartera').querySelectorAll('[data-neg]').forEach((b) => (b.onclick = () => window.Negocios.abrirNegocio(b.dataset.neg)));
  $('#view-cartera').querySelectorAll('[data-nf]').forEach((b) => (b.onclick = () => { IM.negFiltro = b.dataset.nf; IM.fichaTab = { ...(IM.fichaTab || {}), [p.id]: 'negocios' }; renderFicha(); }));
  $('#view-cartera').querySelectorAll('[data-negnew]').forEach((b) => (b.onclick = () => window.Negocios.nuevo({ tipo: b.dataset.negnew, propId: p.id, clienteId: b.dataset.cli || undefined })));
  if ((p.leads || []).some((l) => !l.visto)) api('inmoLeadsVistos', p.id).catch(() => {});
  $('#fArch').onclick = async () => { await api('inmoPropArchivar', p.id, !p.archivada); toast(p.archivada ? 'Propiedad restaurada.' : 'Propiedad archivada.'); await cargar(); renderFicha(); };
  host.querySelectorAll('[data-est]').forEach((s) => (s.onchange = async () => { await api('inmoPropGuardar', { id: p.id, [s.dataset.est]: s.value }); toast('Estado actualizado.'); await cargar(); renderFicha(); }));
  host.querySelectorAll('.im-thumbs img').forEach((t) => (t.onclick = () => { host.querySelector('.im-gmain img').src = t.src; host.querySelectorAll('.im-thumbs img').forEach((x) => x.classList.toggle('on', x === t)); }));
  $('#fVinc').onclick = () => vincularModal(p);
  $('#fDoc').onclick = async () => { const r = await api('inmoDocElegir', p.id); if (r) { toast('Documento agregado.'); await cargar(); renderFicha(); } };
  $('#fDir').onclick = () => api('inmoDocCarpeta', p.id);
  $('#fNota').onsubmit = async (e) => { e.preventDefault(); const t = $('#fNotaT').value.trim(); if (!t) return; await api('inmoNota', p.id, t); renderFicha(); };
  host.onclick = async (e) => {
    const b = e.target.closest('[data-open],[data-rm],[data-unl],[data-per],[data-wa],[data-mail]'); if (!b) return;
    try {
      if (b.dataset.open) await api('inmoDocAbrir', p.id, b.dataset.open);
      else if (b.dataset.rm) { await api('inmoDocQuitar', p.id, b.dataset.rm); await cargar(); renderFicha(); }
      else if (b.dataset.unl) { await api('inmoDesvincular', p.id, b.dataset.unl, b.dataset.rol); await cargar(); renderFicha(); }
      else if (b.dataset.per) abrirPersona(b.dataset.per);
      else if (b.dataset.wa) pf.openUrl('https://wa.me/' + b.dataset.wa.replace(/\D/g, ''));
      else if (b.dataset.mail) { await navigator.clipboard.writeText(b.dataset.mail); toast('Correo copiado.'); }
    } catch (err) { toast(err.message, 4000); }
  };
}
// Documentos generados desde plantillas y enviados a firmar desde Asset
function firmasBox(p) {
  const l = (p.firmas || []).slice(0, 5); const E = { en_firma: ['En firma', 'wait'], firmado: ['Firmado', 'ok'], pendiente_pago: ['Pendiente de pago', 'bad'] };
  return `<div class="im-box" id="fFirmasBox"><div class="im-bh"><h3>Documentos en firma</h3>${l.length ? `<button class="ghost small" id="fFirmas">${icon('rotateR', 13)} Seguimiento</button>` : ''}</div>
    ${l.length ? l.map((f) => { const [t, c] = E[f.estado] || E.en_firma; return `<div class="im-doc"><span class="im-dic">${icon('sign', 16)}</span><span class="im-dt"><b>${esc(f.plantilla)}</b><small>${fecha(f.fecha)}${f.operacion ? ' · operación ' + f.operacion : ''} · ${esc((f.firmantes || []).map((s) => s.nombre).join(', '))}</small></span><i class="im-st ${c}">${t}</i>${f.archivo ? `<button class="ghost small im-pdf" data-pdf="${esc(f.archivo)}" title="Abrir el PDF creado en Asset">PDF</button>` : ''}${f.operacion ? `<button class="secondary small" data-fop="${f.operacion}">Ver</button>` : ''}</div>`; }).join('')
      : '<p class="muted small">Genera contratos, promesas, mandatos u órdenes de visita con tus plantillas: se llenan solos con la ficha y las personas. Si no tienes la plantilla (por ejemplo, el comprobante de pago de una reserva), Asset lo crea.</p>'}</div>`;
}
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

// ---------- Vincular persona a la propiedad ----------
function vincularModal(p) {
  modal(`<div class="im-form"><h2>Vincular persona</h2><p class="muted small">${esc(p.codigo)} · ${esc(p.titulo)}</p>
    <label>Rol en la propiedad<select id="vRol">${Object.entries(ROL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
    <label>Buscar en tu CRM<input id="vQ" placeholder="Nombre o RUT" autocomplete="off" /></label>
    <div class="im-vl" id="vList"></div>
    <div class="actions"><button class="ghost" id="vNew">${icon('plus', 14)} Crear persona nueva</button><span class="spacer"></span><button class="secondary" id="mCancel">Cancelar</button></div></div>`);
  const pintar = () => {
    const q = $('#vQ').value.trim().toLowerCase(); const qr = q.replace(/[^0-9k]/g, '');
    const l = IM.data.personas.filter((c) => !q || c.nombre.toLowerCase().includes(q) || (qr.length > 2 && c.rut.toLowerCase().replace(/[^0-9k]/g, '').includes(qr))).slice(0, 8);
    $('#vList').innerHTML = l.length ? l.map((c) => `<button class="im-vi" data-c="${esc(c.id)}"><span class="im-av">${esc(c.nombre[0])}</span><span><b>${esc(c.nombre)}</b><small>${esc(c.rut)} · ${c.roles.map((r) => ROL[r]).join(', ') || 'sin rol'}</small></span></button>`).join('') : '<p class="muted small">No hay coincidencias. Crea la persona nueva.</p>';
  };
  pintar(); $('#vQ').oninput = pintar; $('#vQ').focus();
  $('#mCancel').onclick = closeModal;
  $('#vList').onclick = async (e) => { const b = e.target.closest('[data-c]'); if (!b) return; try { await api('inmoVincular', p.id, b.dataset.c, $('#vRol').value); closeModal(); toast('Persona vinculada.'); await cargar(); renderFicha(); } catch (err) { toast(err.message, 4000); } };
  $('#vNew').onclick = () => { const rol = $('#vRol').value; formPersona(null, { rol, despues: async (c) => { await api('inmoVincular', p.id, c.id, rol); await cargar(); renderFicha(); } }); };
}

// ---------- Personas ----------
async function personas() { IM.persona = null; const tok = ir('personas'); await cargar(); if (tok === IM.tok) renderPersonas(); }
function renderPersonas() {
  const host = $('#view-personas'); const f = IM.pf; const q = f.q.trim().toLowerCase(); const qr = q.replace(/[^0-9k]/g, '');
  const cuenta = (c) => IM.data.propiedades.filter((p) => (p.vinculos || []).some((v) => v.personaId === c.id)).length;
  const l = IM.data.personas.filter((c) => (!f.rol || c.roles.includes(f.rol)) && (!q || c.nombre.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (qr.length > 2 && c.rut.toLowerCase().replace(/[^0-9k]/g, '').includes(qr))))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  host.innerHTML = `<div class="im-wrap">
    <div class="im-head fx-personas"><div><h1>Personas</h1><p class="muted">${IM.data.personas.length} en tu CRM · un registro por RUT, se reutiliza en cada contrato</p></div><button class="primary" id="cNew">${icon('plus', 15)} Nueva persona</button></div>
    <div class="im-bar"><label class="im-search">${icon('search', 15)}<input id="cQ" placeholder="Buscar por nombre, RUT o correo" value="${esc(f.q)}" /></label>
      <div class="im-seg" id="cRol"><button data-r="" class="${!f.rol ? 'on' : ''}">Todas</button>${Object.entries(ROL).map(([k, v]) => `<button data-r="${k}" class="${f.rol === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
    ${l.length ? `<div class="im-table"><div class="im-tr th"><span>Nombre</span><span>RUT</span><span>Roles</span><span>Contacto</span><span>Propiedades</span></div>
      ${l.map((c) => `<button class="im-tr" data-c="${esc(c.id)}"><span class="im-tn"><span class="im-av">${esc(c.nombre[0])}</span><b>${esc(c.nombre)}</b></span><span>${esc(c.rut || "—")}</span><span>${c.roles.map((r) => `<i class="im-rl">${ROL[r]}</i>`).join('')}</span><span class="muted small">${esc(c.email || c.telefono || '—')}</span><span>${cuenta(c) || '—'}</span></button>`).join('')}</div>`
      : `<div class="im-empty sm"><span class="im-eic">${icon('users', 30)}</span><p>${IM.data.personas.length ? 'Nadie coincide con la búsqueda.' : 'Aún no hay personas. Se crean al importar propiedades con propietario, o agrégalas aquí.'}</p></div>`}</div>`;
  $('#cQ').oninput = (e) => { f.q = e.target.value; clearTimeout(IM._t); IM._t = setTimeout(() => { renderPersonas(); const i = $('#cQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 180); };
  $('#cRol').onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) { f.rol = b.dataset.r; renderPersonas(); } };
  $('#cNew').onclick = () => formPersona();
  host.querySelector('.im-table')?.addEventListener('click', (e) => { const r = e.target.closest('[data-c]'); if (r) abrirPersona(r.dataset.c); });
}
async function abrirPersona(id) {
  const tok = ir('personas'); await cargar(); IM.persona = id; const c = per(id); if (!c) return personas();
  const act = await api('inmoActividad', id).catch(() => []); if (tok !== IM.tok) return;
  const props = IM.data.propiedades.flatMap((p) => (p.vinculos || []).filter((v) => v.personaId === id).map((v) => ({ p, rol: v.rol })));
  const fila = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
  $('#view-personas').innerHTML = `<div class="im-wrap im-ficha">
    <div class="im-fh"><button class="ghost" id="pBack">${icon('chevL', 16)} Personas</button><span class="spacer"></span><button class="secondary" id="pEdit">${icon('edit', 15)} Editar</button><button class="danger" id="pDel">Eliminar</button></div>
    <div class="im-ft im-pt"><span class="im-av xl">${esc(c.nombre[0])}</span><div><small class="im-code">${c.tipo === 'juridica' ? 'Persona jurídica' : 'Persona natural'} · ${c.rut ? 'RUT ' + esc(c.rut) : 'Sin RUT todavía'}</small><h1>${esc(c.nombre)}</h1><p>${c.roles.map((r) => `<i class="im-rl">${ROL[r]}</i>`).join('') || '<span class="muted">Sin rol</span>'}</p></div></div>
    <div class="im-fcols">
      <div><div class="im-box"><h3>Datos</h3><dl class="im-dl">${fila('Corredor', esc(c.corredor?.nombre || ''))}${fila('Correo', esc(c.email))}${fila('Teléfono', esc(c.telefono))}${fila('Dirección', esc(c.direccion))}${fila('Estado civil', esc(c.estadoCivil))}${fila('Profesión', esc(c.profesion))}${fila('Nacionalidad', esc(c.nacionalidad))}</dl>
        ${c.notas ? `<h3 style="margin-top:14px">Notas</h3><p class="im-desc">${esc(c.notas)}</p>` : ''}
        <div class="row" style="margin-top:12px">${c.leadId ? `<button class="secondary small" id="pLead">${icon('sparkle', 14)} Ver en Leads</button>` : ''}${c.telefono ? `<button class="secondary small" id="pWa">${icon('whatsapp', 14)} WhatsApp</button>` : ''}${c.email ? `<button class="secondary small" id="pMail">${icon('mail', 14)} Copiar correo</button>` : ''}</div></div>
        <div class="im-box"><h3>Propiedades</h3>${props.length ? props.map(({ p, rol }) => `<button class="im-pp" data-p="${esc(p.id)}"><span class="im-pph">${foto(p)}</span><span><b>${esc(p.titulo)}</b><small>${esc(ROL[rol])} · ${esc(p.codigo)} · ${esc(p.comuna || '')}</small></span>${icon('chevR', 16)}</button>`).join('') : '<p class="muted small">No está vinculada a ninguna propiedad.</p>'}</div>
        <div class="im-box" id="pDocs"><h3>Documentos</h3><p class="muted small">Cargando…</p></div></div>
      <div><div class="im-box"><h3>Historial</h3><form class="im-nota" id="pNota"><input id="pNotaT" placeholder="Agregar una nota" /><button class="secondary small">Guardar</button></form>
        <ul class="im-act sm">${act.map((a) => `<li class="${a.tipo === 'nota' ? 'nota' : ''}"><i></i><span>${esc(a.texto)}<small>${fecha(a.fecha, true)}</small></span></li>`).join('')}</ul></div></div></div></div>`;
  $('#pBack').onclick = () => personas(); $('#pEdit').onclick = () => formPersona(c);
  $('#pDel').onclick = () => { modal(`<h2>Eliminar persona</h2><p>¿Eliminar a <b>${esc(c.nombre)}</b> de tu CRM?</p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="danger" id="mOk">Eliminar</button></div>`);
    $('#mCancel').onclick = closeModal; $('#mOk').onclick = async () => { try { await api('inmoPerBorrar', c.id); closeModal(); toast('Persona eliminada.'); personas(); } catch (e) { closeModal(); toast(e.message, 5000); } }; };
  if ($('#pWa')) $('#pWa').onclick = () => pf.openUrl('https://wa.me/' + c.telefono.replace(/\D/g, ''));
  if ($('#pLead')) $('#pLead').onclick = () => window.Leads.abrir(c.leadId);
  if ($('#pMail')) $('#pMail').onclick = async () => { await navigator.clipboard.writeText(c.email); toast('Correo copiado.'); };
  $('#pNota').onsubmit = async (e) => { e.preventDefault(); const t = $('#pNotaT').value.trim(); if (t) { await api('inmoNota', c.id, t); abrirPersona(c.id); } };
  $('#view-personas').querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => abrirFicha(b.dataset.p)));
  // documentos que firma (órdenes de visita, comprobantes, contratos…), de todas sus propiedades
  api('dgPersona', id).then((ds) => { const box = $('#pDocs'); if (!box || IM.persona !== id) return; const E = { en_firma: ['En firma', 'wait'], firmado: ['Firmado', 'ok'], pendiente_pago: ['Pendiente de pago', 'bad'] };
    box.innerHTML = `<h3>Documentos <i class="muted">(${ds.length})</i></h3>${ds.length ? ds.slice(0, 12).map((d) => { const [t, c] = E[d.estado] || E.en_firma; return `<div class="im-doc"><span class="im-dic">${icon(d.origen === 'asset' ? 'filePlus' : 'sign', 16)}</span><span class="im-dt"><b>${esc(d.titulo)}</b><small>${fecha(d.fecha)}${d.propiedad ? ' · ' + esc(d.propiedad.codigo) : ''}${d.operacion ? ' · operación ' + d.operacion : ''}</small></span><i class="im-st ${c}">${t}</i>${d.archivo ? `<button class="ghost small im-pdf" data-pdf="${esc(d.archivo)}">PDF</button>` : ''}</div>`; }).join('') : '<p class="muted small">Aún no firma documentos desde Asset.</p>'}`;
    box.querySelectorAll('[data-pdf]').forEach((b) => (b.onclick = () => api('dgAbrir', b.dataset.pdf).catch((e) => toast(e.message, 4000)))); }).catch(() => { const box = $('#pDocs'); if (box) box.innerHTML = '<h3>Documentos</h3><p class="muted small">No se pudieron cargar.</p>'; });
}
// ---------- 0.16.26 · pestaña Propietario: captador, datos del dueño, notas de perfil y sus documentos ----------
async function propietarioBox(p) {
  const box = $('#fDueno'); if (!box) return; const acc = await api('accEstado').catch(() => null); if (!acc || !$('#fDueno')) return;
  const capt = p.captador; const duenos = (p.vinculos || []).filter((v) => v.rol === 'propietario').map((v) => per(v.personaId)).filter(Boolean);
  const captBox = `<div class="im-box im-capt"><div class="im-bh"><h3>Quién captó esta propiedad</h3></div><p class="muted small">Este equipo lo usa: <b>${esc(acc.nombre)}</b> · <a href="#" id="fEquipo">cambiar</a></p>
    ${acc.esAdmin ? `<label class="im-captsel">Captada por<select id="fCaptador"><option value="">— sin captador —</option>${acc.corredores.map((c) => `<option value="${esc(c.id)}" ${capt?.id === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>
      ${acc.corredores.length ? '' : '<p class="muted small">Agrega a los corredores en Leads › Corredores para asignar quién captó cada propiedad.</p>'}`
    : `<p>Captada por <b>${esc(capt?.nombre || 'nadie todavía')}</b>${capt?.id === acc.corredorId ? ' (tú)' : ''}.</p>`}
    <p class="muted small">Toda la cartera la ven todos los corredores; los datos del propietario solo quien captó la propiedad y el administrador.</p></div>`;
  if (p.duenoVisible === false) {
    box.innerHTML = captBox + `<div class="im-box im-lock">${icon('lock', 22)}<div><b>Datos del propietario reservados</b><p class="muted small">Los ve ${capt ? esc(capt.nombre) + ', que captó esta propiedad,' : 'el administrador (aún no tiene captador asignado)'} y el administrador. Puedes ofrecer la propiedad, agendar visitas y abrir negocios con tus clientes; para el mandato o el contrato pídeselo a ${capt ? esc(capt.nombre.split(' ')[0]) : 'el administrador'}.</p></div></div>`;
  } else {
    const f = p.ficha || {};
    const tarj = duenos.length ? duenos.map((c) => `<div class="im-box im-dueno"><div class="im-bh"><h3>${esc(c.nombre)}</h3><button class="ghost small" data-per="${esc(c.id)}">Ver persona</button></div>
        <dl class="im-dl">${[['RUT', c.rut || 'Sin RUT todavía'], ['Celular', c.telefono], ['Correo', c.email], ['Dirección', c.direccion], ['Estado civil', c.estadoCivil], ['Profesión', c.profesion]].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <div class="row">${c.telefono ? `<button class="secondary small" data-wa="${esc(c.telefono)}">${icon('whatsapp', 14)} WhatsApp</button>` : ''}${c.email ? `<button class="secondary small" data-mail="${esc(c.email)}">${icon('mail', 14)} Copiar correo</button>` : ''}</div>
        <label class="im-dnotas">Notas sobre el propietario <small class="muted">(cómo es, cómo prefiere que lo contacten, acuerdos…)</small><textarea rows="3" data-dnota="${esc(c.id)}">${esc(c.notas || '')}</textarea></label>
        <div class="row"><button class="secondary small" data-dguardar="${esc(c.id)}">Guardar notas</button></div>
        <div class="im-ddocs" data-ddocs="${esc(c.id)}"><p class="muted small">Cargando documentos…</p></div></div>`).join('')
      : `<div class="im-box"><h3>Propietario</h3>${f.propietarioNombre ? `<p><b>${esc(f.propietarioNombre)}</b>${f.propietarioCelular ? ' · ' + esc(f.propietarioCelular) : ''}${f.propietarioEmail ? ' · ' + esc(f.propietarioEmail) : ''}</p><p class="muted small">Anotado en la ficha; queda en Personas cuando tenga RUT válido.</p>` : '<p class="muted small">Todavía no hay propietario. Vincúlalo para poder enviar el mandato.</p>'}
        <div class="row"><button class="secondary small" id="fDVinc">${icon('plus', 13)} Vincular propietario</button></div></div>`;
    box.innerHTML = captBox + tarj;
    box.querySelectorAll('[data-dguardar]').forEach((b) => (b.onclick = async () => { const c = per(b.dataset.dguardar); try { await api('inmoPerGuardar', { ...c, notas: box.querySelector(`[data-dnota="${b.dataset.dguardar}"]`).value }); toast('Notas guardadas.'); await cargar(); } catch (e) { toast(e.message, 5000); } }));
    box.querySelectorAll('[data-ddocs]').forEach((d) => api('dgPersona', d.dataset.ddocs).then((ds) => { d.innerHTML = `<h4>Documentos que firma${ds.length ? ` <i class="muted">(${ds.length})</i>` : ''}</h4>${ds.length ? ds.slice(0, 8).map((x) => `<div class="im-doc"><span class="im-dic">${icon('sign', 15)}</span><span class="im-dt"><b>${esc(x.titulo)}</b><small>${fecha(x.fecha)}${x.propiedad ? ' · ' + esc(x.propiedad.codigo) : ''}</small></span>${x.archivo ? `<button class="ghost small" data-pdf2="${esc(x.archivo)}">PDF</button>` : ''}</div>`).join('') : '<p class="muted small">Aún no firma documentos desde Asset.</p>'}`;
      d.querySelectorAll('[data-pdf2]').forEach((b) => (b.onclick = () => api('dgAbrir', b.dataset.pdf2).catch((e) => toast(e.message, 4000)))); }).catch(() => { d.innerHTML = ''; }));
    box.querySelectorAll('[data-wa]').forEach((b) => (b.onclick = () => pf.openUrl('https://wa.me/' + b.dataset.wa.replace(/\D/g, ''))));
    box.querySelectorAll('[data-mail]').forEach((b) => (b.onclick = async () => { await navigator.clipboard.writeText(b.dataset.mail); toast('Correo copiado.'); }));
    box.querySelectorAll('[data-per]').forEach((b) => (b.onclick = () => abrirPersona(b.dataset.per)));
    $('#fDVinc')?.addEventListener('click', () => $('#fVinc')?.click());
  }
  $('#fEquipo').onclick = (e) => { e.preventDefault(); equipo(() => renderFicha()); };
  $('#fCaptador')?.addEventListener('change', async (e) => { try { await api('accCaptador', p.id, e.target.value || null); toast(e.target.value ? 'Captador asignado. Queda en el historial.' : 'La propiedad quedó sin captador.'); await cargar(); renderFicha(); } catch (er) { toast(er.message, 5000); } });
}
// quién usa este equipo (y la clave de administrador)
async function equipo(despues) {
  const a = await api('accEstado');
  modal(`<div class="im-form"><h2>${icon('user', 18)} ¿Quién usa este equipo?</h2>
    <p class="muted">Define qué datos se muestran aquí. Un corredor ve toda la cartera, pero los datos del propietario solo en las propiedades que captó.</p>
    <label>Este equipo lo usa<select id="eqU"><option value="admin">Administrador</option>${a.corredores.map((c) => `<option value="${esc(c.id)}" ${a.corredorId === c.id ? 'selected' : ''}>${esc(c.nombre)} (corredor)</option>`).join('')}</select></label>
    ${a.pin && !a.esAdmin ? '<label>Clave de administrador<input id="eqPin" type="password" inputmode="numeric" placeholder="Solo si cambias a administrador o a otro corredor" /></label>' : ''}
    ${a.esAdmin ? `<details class="im-eqpin"><summary>${a.pin ? 'Cambiar o quitar la clave de administrador' : 'Poner una clave de administrador (recomendado)'}</summary>
      <p class="muted small">Con clave, un corredor no puede pasar este equipo a administrador sin ella.</p>${a.pin ? '<label>Clave actual<input id="eqPinA" type="password" inputmode="numeric" /></label>' : ''}<label>Nueva clave (4 a 8 números; vacía para quitarla)<input id="eqPinN" type="password" inputmode="numeric" /></label>
      <button class="secondary small" id="eqPinOk">Guardar clave</button></details>` : ''}
    ${a.corredores.length ? '' : '<p class="muted small">Aún no hay corredores: agrégalos en Leads › Corredores.</p>'}
    <p class="error" id="eqErr"></p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Guardar</button></div></div>`);
  $('#eqU').value = a.esAdmin ? 'admin' : a.corredorId;
  $('#mCancel').onclick = closeModal;
  $('#eqPinOk')?.addEventListener('click', async () => { try { await api('accPin', { pin: $('#eqPinN').value, actual: $('#eqPinA')?.value || '' }); toast('Clave guardada.'); equipo(despues); } catch (e) { $('#eqErr').textContent = e.message; } });
  $('#mOk').onclick = async () => { const v = $('#eqU').value; try { const r = await api('accUsar', v === 'admin' ? { rol: 'admin', pin: $('#eqPin')?.value || '' } : { rol: 'corredor', corredorId: v, pin: $('#eqPin')?.value || '' }); closeModal(); toast(`Este equipo lo usa ${r.nombre}.`); await cargar(); despues?.(); } catch (e) { $('#eqErr').textContent = e.message; } };
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

// ---------- Próximas etapas ----------
function pronto(k) {
  IM.pronto = k; ir('pronto'); const P = PRONTO[k];
  $('#view-pronto').innerHTML = `<div class="im-wrap"><div class="im-soon"><span class="im-eic">${icon(P.ic, 36)}</span><small>Etapa ${P.etapa} · en construcción</small><h1>${P.t}</h1><p>${P.d}</p>
    ${P.hoy.length ? `<h3>Mientras tanto, desde Gestión documental</h3><div class="im-soonb">${P.hoy.map(([a, t, d]) => `<button class="im-at" data-act="${a}"><span><b>${t}</b><small>${d}</small></span>${icon('chevR', 16)}</button>`).join('')}</div>` : ''}</div></div>`;
  $('#view-pronto').querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => { window.studio.goHome(); setTimeout(() => document.querySelector(`#homeBody [data-act="${b.dataset.act}"]`)?.click(), 60); }));
}

// ---------- Portal Inmobiliario (Mercado Libre) ----------
const PI_ST = { active: ['Activo', 'ok'], paused: ['Pausado', 'res'], closed: ['Finalizado', 'off'], under_review: ['En revisión', 'res'], inactive: ['Inactivo', 'off'] };
const TIPO_AVISO = { silver: 'Publicación', gold: 'Destacado', gold_premium: 'Destacado premium' };
function portalBox(p) {
  const ops = ['venta', 'arriendo'].filter((op) => p[op]); if (!ops.length) return '';
  const fila = (op) => {
    const a = p.portales?.pi?.[op]; const st = a?.status; const [l, c] = PI_ST[st] || [st, ''];
    const pillH = !a?.itemId ? '<span class="im-st">No publicado</span>' : `<span class="im-st ${c}">${esc(l)}</span>`;
    const btns = !a?.itemId || st === 'closed'
      ? `<button class="primary small" data-pi="publicar" data-op="${op}">${st === 'closed' ? 'Publicar de nuevo' : 'Publicar'}</button>`
      : `${a.permalink ? `<button class="ghost small" data-pi="ver" data-op="${op}" title="Abrir el aviso">${icon('export', 14)}</button>` : ''}<button class="secondary small" data-pi="actualizar" data-op="${op}">Actualizar</button>${st === 'active' ? `<button class="ghost small" data-pi="paused" data-op="${op}">Pausar</button>` : st === 'paused' ? `<button class="ghost small" data-pi="active" data-op="${op}">Reactivar</button>` : ''}<button class="ghost small im-danger" data-pi="closed" data-op="${op}">Finalizar</button>`;
    return `<div class="im-pirow"><span class="im-pit"><small>${op === 'venta' ? 'Venta' : 'Arriendo'}${a?.itemId ? ' · ' + esc(a.itemId) : ''}</small>${pillH}${a?.error ? `<em class="im-err">${esc(a.error)}</em>` : ''}</span><span class="im-pib">${btns}</span></div>`;
  };
  return `<div class="im-box" id="fPI"><div class="im-bh"><h3 class="im-pih"><span class="im-pilogo">PI</span>Portal Inmobiliario</h3>${IM.ml?.conectada ? `<small class="muted">${esc(IM.ml.cuenta?.nickname || '')}</small>` : '<button class="ghost small" data-pi="config">Conectar cuenta</button>'}</div>${ops.map(fila).join('')}</div>`;
}
const CANAL_IC = { whatsapp: 'whatsapp', question: 'help', call: 'phone', schedule: 'calendar', quotation: 'coins' };
function leadsBox(p) {
  const l = (p.leads || []).slice(0, 12); if (!l.length) return '';
  return `<div class="im-box"><div class="im-bh"><h3>Interesados desde portales</h3><small class="muted">${p.leads.length}</small></div>${l.map((x, i) => `<div class="im-pv${x.visto ? '' : ' nuevo'}"><span class="im-av">${icon(CANAL_IC[x.canal] || 'user', 15)}</span><span class="im-pvt"><b>${esc(x.nombre || 'Sin nombre')}${x.visto ? '' : ' <i class="im-new">Nuevo</i>'}</b><small>${esc(x.canalTxt || x.canal)} · ${fecha(x.fecha, true)}${x.rut ? ' · ' + esc(x.rut) : ''}</small></span>
    ${x.telefono ? `<button class="ghost small" title="WhatsApp" data-wa="${esc(x.telefono)}">${icon('whatsapp', 15)}</button>` : ''}${x.email ? `<button class="ghost small" title="Copiar correo" data-mail="${esc(x.email)}">${icon('mail', 15)}</button>` : ''}${x.rut ? (() => { const c = IM.data.personas.find((q) => q.rut.replace(/[^0-9kK]/g, '') === String(x.rut).replace(/[^0-9kK]/g, '')); return c ? `<button class="ghost small" title="Crear negocio con esta persona" data-negnew="${p.venta ? 'venta' : 'arriendo'}" data-cli="${esc(c.id)}">${icon('briefcase', 15)}</button>` : ''; })() : `<button class="ghost small" title="Agregar al CRM" data-lead="${i}">${icon('plus', 14)}</button>`}</div>`).join('')}</div>`;
}
function negociosBox(p) {
  // 0.16.16 · una fila por negocio (cliente, operación, etapa con su avance y la próxima acción); los cerrados, aparte
  const l = IM.negs || []; const ops = ['venta', 'arriendo'].filter((o) => p[o]); const f = IM.negFiltro || (l.some((n) => n.estado === 'abierto') ? 'abiertos' : 'todos');
  const ver = l.filter((n) => (f === 'todos' ? true : f === 'abiertos' ? n.estado === 'abierto' : n.estado !== 'abierto'));
  const cuenta = (k) => l.filter((n) => (k === 'abiertos' ? n.estado === 'abierto' : n.estado !== 'abierto')).length;
  const fila = (n) => { const pct = n.total ? Math.round(((n.orden + 1) / n.total) * 100) : 0; const pa = n.proximaAccion;
    return `<button class="im-nrow" data-neg="${esc(n.id)}"><span class="im-nc"><b>${esc(n.cliente?.nombre || 'Sin cliente')}</b><small>${n.tipo === 'venta' ? 'Venta' : 'Arriendo'}</small></span>
      <span class="im-ne">${n.estado === 'abierto' ? `<b>${esc(n.etapaInfo?.t || '')}</b><span class="im-nbar"><i style="width:${pct}%"></i></span><small>Etapa ${n.orden + 1} de ${n.total}</small>` : `<b class="${n.estado === 'ganado' ? 'ok' : 'bad'}">${n.estado === 'ganado' ? 'Cerrado con éxito' : 'Perdido'}</b>`}</span>
      <span class="im-na">${n.estado === 'abierto' ? `${esc(pa?.texto || n.siguiente || '—')}${pa?.fecha ? `<small>${fecha(pa.fecha)}</small>` : ''}` : ''}</span>${icon('chevR', 16)}</button>`; };
  return `<div class="im-box"><div class="im-bh"><h3>Negocios</h3><span>${ops.map((o) => `<button class="secondary small" data-negnew="${o}">${icon('plus', 13)} ${o === 'venta' ? 'Venta' : 'Arriendo'}</button>`).join(' ')}</span></div>
    ${l.length ? `<div class="im-nf">${[['abiertos', 'Abiertos'], ['cerrados', 'Cerrados'], ['todos', 'Todos']].map(([k, t]) => `<button class="im-nfb${f === k ? ' on' : ''}" data-nf="${k}">${t}${k !== 'todos' ? ` <b>${cuenta(k)}</b>` : ''}</button>`).join('')}</div>
      <div class="im-ntab"><div class="im-nhead"><span>Cliente</span><span>Etapa</span><span>Próxima acción</span><span></span></div>${ver.map(fila).join('') || '<p class="muted small" style="padding:10px 4px">No hay negocios con ese filtro.</p>'}</div>`
    : '<p class="muted small">Sin negocios. Créalo cuando aparezca un interesado: cada etapa te dirá qué falta y qué firmar.</p>'}</div>`;
}
function wirePortal(p) {
  const box = $('#fPI'); if (box) box.onclick = async (e) => {
    const b = e.target.closest('[data-pi]'); if (!b) return; const op = b.dataset.op, a = b.dataset.pi;
    try {
      if (a === 'config') return portales();
      if (a === 'publicar') return publicarModal(p, op);
      if (a === 'ver') return pf.openUrl(p.portales.pi[op].permalink);
      if (a === 'closed') {
        modal(`<h2>Finalizar el aviso</h2><p>El aviso de ${op} se cierra en Portal Inmobiliario y Mercado Libre. <b>No se puede reactivar</b>: para volver a publicar se crea un aviso nuevo, que usa otra publicación del paquete.</p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="danger" id="mOk">Finalizar aviso</button></div>`);
        $('#mCancel').onclick = closeModal; $('#mOk').onclick = async () => { closeModal(); try { await api('mlEstadoAviso', p.id, op, 'closed'); toast('Aviso finalizado.'); } catch (er) { toast(er.message, 5000); } await cargar(); renderFicha(); };
        return;
      }
      b.disabled = true;
      if (a === 'actualizar') { await api('mlActualizar', p.id, op); toast('Aviso actualizado en Portal Inmobiliario.'); }
      if (a === 'paused' || a === 'active') { await api('mlEstadoAviso', p.id, op, a); toast(a === 'paused' ? 'Aviso pausado.' : 'Aviso reactivado.'); }
      await cargar(); renderFicha();
    } catch (er) { b.disabled = false; toast(er.message, 6000); await cargar(); renderFicha(); }
  };
  $('#view-cartera').querySelectorAll('[data-lead]').forEach((b) => (b.onclick = () => {
    const x = p.leads[Number(b.dataset.lead)];
    formPersona(null, { rol: 'interesado', pre: { nombre: x.nombre || '', email: x.email || '', telefono: x.telefono || '' }, despues: async (c) => { await api('inmoVincular', p.id, c.id, 'interesado'); await cargar(); renderFicha(); } });
  }));
}
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
  const host = $('#view-cartera'); if (tok === IM.tok) host.innerHTML = '<div class="im-wrap"><p class="muted">Cargando…</p></div>';
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

window.Inmo = { equipo, fichaTab: (k) => { if (IM.ficha) (IM.fichaTab ||= {})[IM.ficha] = k; IM.irTab?.(k); }, portales, inicio, cartera, personas, pronto, abrirFicha, abrirPersona, dropFiles, importar, formProp, formPersona, VIEWS: INMO_VIEWS, _IM: IM, fichaAbierta: () => !!IM.ficha && !$('#view-cartera').classList.contains('hidden') };
