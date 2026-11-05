/* global $, api, esc, icon, toast, IM, cargar, precio */
'use strict';
// ============================================================================
// Lienzo en vivo: la columna derecha del Agente a pantalla completa. Muestra lo que se está trabajando
// (tu día, una propiedad, un negocio con sus etapas, la agenda de un día o una firma) y se actualiza solo
// cada vez que el agente o un botón cambia algo. Sus botones hacen acciones fijas (nunca dependen del modelo).
// ============================================================================
(() => {
const L = { ctx: { tipo: 'inicio' }, tok: 0, dato: null, hist: [], ultNeg: {} };
const hoyISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fmtDia = (f) => { try { const t = new Date(f + 'T12:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }); return t[0].toUpperCase() + t.slice(1); } catch { return f; } };
const dirTxt = (p) => [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ');
const EST = { disponible: ['Disponible', 'ok'], reservada: ['Reservada', 'res'], vendida: ['Vendida', 'end'], arrendada: ['Arrendada', 'end'], no_disponible: ['No disponible', ''] };
const FIRMA = { en_firma: ['En firma', 'wait'], firmado: ['Firmado', 'ok'], pendiente_pago: ['Pendiente de pago', 'bad'] };
const amable = (t) => String(t || '').replace(/^Listo para pasar a /, 'pasar a ').replace(/^Falta firmar: /, 'firmar ').replace(/^Esperando firmas: /, 'esperando firmas de ').replace(/^./, (c) => c.toLowerCase());
const host = () => $('#agCanvas');
const btn = (k, ic, t, pri) => `<button class="${pri ? 'primary' : 'secondary'} small" data-lz="${k}">${icon(ic, 14)}<span>${t}</span></button>`;
const vacioTxt = (t) => `<p class="lz-vacio">${t}</p>`;

function cabeza(titulo, sub, ic) {
  const atras = L.ctx.tipo !== 'inicio' ? `<button class="lz-back" data-lz="inicio" title="Volver a tu día">${icon('chevL', 15)}<span>Tu día</span></button>` : '';
  return `<div class="lz-h">${atras}<div class="lz-ht"><span class="lz-hic">${icon(ic, 16)}</span><div><b>${titulo}</b>${sub ? `<small>${sub}</small>` : ''}</div></div></div>`;
}

async function mostrar(ctx, { silencioso } = {}) {
  if (ctx) L.ctx = ctx; const h = host(); if (!h) return;
  const my = ++L.tok; if (!silencioso) h.classList.add('cargando');
  try {
    const html = await ({ inicio: vInicio, propiedad: vPropiedad, negocio: vNegocio, agenda: vAgenda, operacion: vOperacion }[L.ctx.tipo] || vInicio)(L.ctx);
    if (my !== L.tok) return;
    h.innerHTML = `<div class="lz-in${silencioso ? '' : ' lz-anim'}">${html}</div>`; h.classList.remove('cargando'); conectar();
  } catch (e) { if (my === L.tok) { h.innerHTML = `<div class="lz-in">${cabeza('Tu día', '', 'compass')}${vacioTxt(esc(e.message))}</div>`; h.classList.remove('cargando'); L.ctx = { tipo: 'inicio' }; } }
}
const refrescar = () => mostrar(null, { silencioso: true });

// ---------- tu día ----------
async function vInicio() {
  await cargar(); const hoy = hoyISO();
  const [ev, ng] = await Promise.all([api('agendaListar', { desde: hoy, hasta: hoy }).catch(() => []), api('negListar').catch(() => ({ negocios: [] }))]);
  const abiertos = ng.negocios.filter((n) => n.estado === 'abierto');
  const urgentes = abiertos.filter((n) => n.vencida || /Falta firmar|Esperando firmas/.test(n.siguiente || '')).slice(0, 5);
  const firmas = IM.data.propiedades.flatMap((p) => (p.firmas || []).filter((f) => f.estado !== 'firmado').map((f) => ({ ...f, p }))).slice(0, 5);
  const act = IM.data.propiedades.filter((p) => !p.archivada);
  const meta = abiertos.length ? Math.round(abiertos.reduce((s, n) => s + (n.orden + 1) / n.total, 0) / abiertos.length * 100) : 0;
  L.dato = null;
  return `${cabeza('Tu día', fmtDia(hoy), 'compass')}
    <div class="lz-kpis"><button data-ver="cartera" class="k1"><b>${act.length}</b><small>propiedades</small></button><button data-ver="negocios" class="k2"><b>${abiertos.length}</b><small>negocios abiertos</small></button><button data-ver="agenda" class="k3"><b>${ev.filter((e) => e.estado === 'programado').length}</b><small>eventos hoy</small></button></div>
    ${abiertos.length ? `<div class="lz-meta"><span>Avance de tus negocios</span><div class="lz-bar"><i style="width:${meta}%"></i></div><b>${meta}%</b></div>` : ''}
    <section class="lz-sec lz-card"><h4>${icon('calendar', 13)} Agenda de hoy${ev.length ? `<em>${ev.length}</em>` : ''}</h4>${ev.length ? ev.slice(0, 4).map((e) => `<button class="lz-row lz-ag" data-ag="${esc(e.fecha)}"><span class="lz-hr">${esc(e.hora || '—')}</span><span class="lz-rt"><b>${esc(e.titulo)}</b><small>${esc(e.lugar || '')}</small>${e.tipo === 'visita' ? (e.orden?.operacion ? '<i class="lz-tag ok">Con orden de visita</i>' : '<i class="lz-tag res">Sin orden de visita</i>') : ''}</span></button>`).join('')
      + (ev.length > 4 ? `<button class="lz-mas" data-ver="agenda">Ver ${ev.length - 4} más en la agenda ${icon('chevR', 13)}</button>` : '') : vacioTxt('Nada agendado para hoy.')}</section>
    <section class="lz-sec lz-card"><h4>${icon('briefcase', 13)} Negocios que te necesitan${urgentes.length ? `<em>${urgentes.length}</em>` : ''}</h4>${urgentes.length ? urgentes.map((n) => `<button class="lz-row" data-neg="${esc(n.id)}"><span class="lz-dot ${n.vencida ? 'bad' : 'wait'}"></span><span class="lz-rt"><b>${esc(n.titulo)}</b><small>${esc(n.vencida ? 'Acción vencida: ' + (n.proximaAccion?.texto || '') : n.siguiente || '')}</small></span>${icon('chevR', 14)}</button>`).join('') : vacioTxt(abiertos.length ? 'Todo al día.' : 'Aún no hay negocios. Pídele al Agente: «crea un negocio…».')}</section>
    <section class="lz-sec lz-card"><h4>${icon('sign', 13)} Documentos en firma${firmas.length ? `<em>${firmas.length}</em>` : ''}</h4>${firmas.length ? firmas.map((f) => `<button class="lz-row" data-op="${f.operacion || ''}" data-pid="${esc(f.p.id)}"><span class="lz-dot wait"></span><span class="lz-rt"><b>${esc(f.plantilla)}</b><small>${esc(f.p.codigo)}${f.operacion ? ' · operación ' + f.operacion : ''}</small></span>${icon('chevR', 14)}</button>`).join('') : vacioTxt('No hay documentos esperando firmas.')}</section>`;
}

// ---------- propiedad: cómo está y, si tiene negocio, sus etapas aquí mismo ----------
const fH = (iso) => { try { return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }); } catch { return ''; } };
function stepper(n, et) {
  const tareas = n.etapaInfo?.tareas || []; const f = n.firmas?.[n.etapa]; const firmaOk = f?.estado === 'firmado';
  return `<ol class="lz-steps clic">${et.map((e, i) => `<li class="${i < n.orden ? 'hecho' : i === n.orden ? 'ahora' : ''}"><button data-etapa="${esc(e.id)}" data-i="${i}" ${i === n.orden ? 'disabled' : ''} title="${i === n.orden ? 'Etapa actual' : 'Pasar a esta etapa'}"><span>${i < n.orden ? icon('check', 12) : i + 1}</span><b>${esc(e.t)}</b>${e.firma ? `<small>${icon('sign', 11)} ${esc(e.firma)}</small>` : ''}</button></li>`).join('')}</ol>
    <div class="lz-conf hidden" id="lzConf"></div>
    <div class="lz-ahora"><h5>Ahora: ${esc(n.etapaInfo?.t || '')}</h5>
      ${tareas.map((t, i) => `<label class="lz-tarea"><input type="checkbox" data-tarea="${i}" ${n.tareas?.[n.etapa]?.[i] ? 'checked' : ''} /><span>${esc(t)}</span></label>`).join('')}
      ${n.etapaInfo?.firma ? (firmaOk ? `<p class="lz-ok">${icon('check', 13)} ${esc(n.etapaInfo.firma)} firmado${f.fuera ? ' fuera de Asset' : ''}</p>`
        : `<div class="lz-firma"><span>${icon('sign', 13)} ${esc(n.etapaInfo.firma)}${f?.operacion ? ` · operación ${f.operacion}` : ''}</span>${f?.operacion ? btn('op-neg', 'rotateR', 'Ver firma') : btn('documento', 'filePlus', 'Generar')}<button class="ghost small" data-lz="fuera">Firmado fuera de Asset</button></div>`) : ''}
      ${n.proximaAccion?.texto ? `<p class="lz-acc ${n.vencida ? 'bad' : ''}">${icon('clock', 13)} ${esc(n.proximaAccion.texto)}${n.proximaAccion.fecha ? ' · ' + esc(n.proximaAccion.fecha) : ''}</p>` : ''}</div>`;
}
// «¿Qué sigue?»: el paso natural de la etapa actual, con sus botones (nada obligatorio)
function guia(n, s, sig) {
  const nom = (n.cliente?.nombre || '').split(' ')[0]; const N = nom ? nom[0] + nom.slice(1).toLowerCase() : 'el cliente';
  const vis = (s.proximos || []).find((e) => e.tipo === 'visita' && (!n.cliente || (e.personas || []).some((x) => x === n.cliente.nombre)));
  const b = (k, ic, t, pri, extra = '') => `<button class="${pri ? 'primary' : 'secondary'} small" data-lz="${k}" ${extra}>${icon(ic, 14)}<span>${t}</span></button>`;
  let txt = ''; let acts = '';
  if (n.etapa === 'interes') { txt = `Primer contacto con ${esc(N)}. Lo natural es coordinar la visita.`; acts = b('agendar', 'calendar', 'Agendar visita', true) + b('anotar', 'edit', 'Anotar llamada'); }
  else if (n.etapa === 'visita') {
    if (vis) { txt = `Visita el <b>${esc(vis.fecha.slice(8))}/${esc(vis.fecha.slice(5, 7))}${vis.hora ? ' a las ' + esc(vis.hora) : ''}</b>${vis.confirmada ? ' · confirmada ✓' : ''}${vis.orden ? ' · con orden de visita' : ''}.`;
      acts = (vis.confirmada ? '' : `<button class="secondary small lz-wab" data-confev="${esc(vis.id)}">${icon('whatsapp', 14)}<span>Confirmar por WhatsApp</span></button>`) + (vis.orden ? '' : b('orden-ev', 'sign', 'Orden de visita', false, `data-ev="${esc(vis.id)}"`)); }
    txt += `${txt ? '<br>' : ''}¿Cómo le fue a ${esc(N)}?`;
    acts += (sig ? b('avanzar', 'arrowR', `Le interesó: pasar a «${esc(sig.t)}»`, true) : '') + b('perdido', 'x', 'No siguió') + (vis ? '' : b('agendar', 'calendar', 'Agendar visita'));
  } else if (sig) { txt = `${esc(N)} está en «${esc(n.etapaInfo?.t || '')}». Cuando esté listo, pasa a «${esc(sig.t)}».`; acts = b('avanzar', 'arrowR', `Pasar a «${esc(sig.t)}»`, true) + b('anotar', 'edit', 'Anotar'); }
  else { txt = `${esc(N)} está en la última etapa.`; acts = b('anotar', 'edit', 'Anotar'); }
  return `<div class="lz-guia"><h5>${icon('compass', 13)} ¿Qué sigue?</h5><p>${txt}</p><div class="lz-acts">${acts}</div></div>`;
}
async function vPropiedad(ctx) {
  await cargar(); const p = IM.data.propiedades.find((x) => x.id === ctx.id); if (!p) throw new Error('La propiedad ya no está en la cartera.');
  const [s, ng] = await Promise.all([api('estEstado', p.id), api('negListar').catch(() => ({ negocios: [], etapas: {} }))]);
  const negs = ng.negocios.filter((n) => n.propId === p.id && n.estado === 'abierto');
  if (ctx.negocio) L.ultNeg[p.id] = ctx.negocio;
  const n = negs.find((x) => x.id === (ctx.negocio || L.ultNeg[p.id])) || negs[0] || null; if (n) L.ultNeg[p.id] = n.id;
  const est = (o) => { const [t, c] = EST[p['estado' + (o === 'venta' ? 'Venta' : 'Arriendo')]] || ['—', '']; return `<span class="lz-pr"><small>${o === 'venta' ? 'Venta' : 'Arriendo'}</small><b>${precio(o === 'venta' ? p.precioVenta : p.precioArriendo) || '—'}</b><i class="im-st ${c}">${t}</i></span>`; };
  L.dato = { prop: p, negocio: n, sig: n ? ng.etapas[n.tipo][n.orden + 1] : null, etapas: n ? ng.etapas[n.tipo] : null, sugerencias: s.sugerencias };
  return `${cabeza(esc(p.codigo), esc(p.titulo), 'house')}
    <div class="lz-pp"><div class="lz-foto sm">${p.fotos?.length ? `<img src="${esc(p.fotos[0])}" class="im-img" alt="" />` : `<span>${icon('house', 28)}</span>`}</div>
      <div><p class="lz-dir">${icon('pin', 13)} ${esc(dirTxt(p) || 'Sin dirección')}</p><div class="lz-prs">${p.venta ? est('venta') : ''}${p.arriendo ? est('arriendo') : ''}</div></div></div>
    ${n ? `<section class="lz-sec lz-neg"><h4>${icon('briefcase', 13)} ${negs.length > 1 ? 'Negocios en curso' : 'Negocio en curso'}</h4>
      ${negs.length > 1 ? `<div class="lz-clis"><small>Toca un cliente para ver su estado</small>${negs.map((x) => `<button data-tabneg="${esc(x.id)}" class="lz-cli ${x.id === n.id ? 'on' : ''}"><span><b>${esc(x.cliente?.nombre || 'Sin cliente')}</b><small>${x.tipo === 'venta' ? 'Venta' : 'Arriendo'} · ${esc(x.etapaInfo?.t || '')}</small></span><span class="ga-pipe">${ng.etapas[x.tipo].map((e, i) => `<i class="${i < x.orden ? 'h' : i === x.orden ? 'a' : ''}" title="${esc(e.t)}"></i>`).join('')}</span></button>`).join('')}</div>` : ''}
      <div class="lz-nh"><b>${esc(n.cliente?.nombre || n.titulo)}</b><small>${n.tipo === 'venta' ? 'Venta' : 'Arriendo'} · etapa ${n.orden + 1} de ${n.total}</small><div class="lz-bar sm"><i style="width:${Math.round((n.orden + 1) / n.total * 100)}%"></i></div></div>
      ${guia(n, s, L.dato.sig)}
      ${stepper(n, ng.etapas[n.tipo])}
      <div class="lz-acts">${btn('agendar', 'calendar', 'Agendar')}${btn('documento', 'filePlus', 'Documento')}${btn('negocio-completo', 'grid', 'Ver completo')}</div></section>`
      : `<div class="lz-acts">${btn('anotar', 'edit', 'Anotar', true)}${btn('agendar', 'calendar', 'Agendar visita')}${btn('negocio-nuevo', 'briefcase', 'Crear negocio')}${btn('publicar', 'export', 'Publicar')}${btn('ficha', 'file', 'Ficha')}</div>`}
    ${s.sugerencias.length ? `<section class="lz-sec"><h4>${icon('sparkle', 13)} Te sugiero <i class="muted">(opcional)</i></h4><div class="lz-sugs">${s.sugerencias.map((x, i) => `<button data-sg="${i}">${esc(x.label)}</button>`).join('')}</div></section>` : ''}
    <section class="lz-sec"><h4>${icon('calendar', 13)} Próximas visitas${s.totalProximos > 1 ? ` <i class="muted">(${s.totalProximos})</i>` : ''}</h4>${s.proximos.length ? s.proximos.map((e) => `<div class="lz-rw">${e.tipo === 'visita' && e.personas?.length ? `<button class="lz-wa ${e.confirmada ? 'ok' : ''}" data-confev="${esc(e.id)}" title="${e.confirmada ? 'Confirmada por WhatsApp (enviar de nuevo)' : 'Confirmar por WhatsApp'}">${icon(e.confirmada ? 'check' : 'whatsapp', 14)}</button>` : ''}<button class="lz-row" data-ag="${esc(e.fecha)}"><span class="lz-hr">${esc(e.fecha.slice(5).split('-').reverse().join('/'))}<small>${esc(e.hora || '')}</small></span><span class="lz-rt"><b>${esc(e.titulo)}</b>${e.personas?.length ? `<small>${esc(e.personas.join(', '))}</small>` : ''}</span>${e.orden ? '<i class="im-st ok">Con orden</i>' : ''}</button></div>`).join('') : vacioTxt('Sin visitas agendadas.')}</section>
    ${(p.firmas || []).length ? `<section class="lz-sec"><h4>${icon('sign', 13)} Documentos</h4>${p.firmas.slice(0, 4).map((f) => { const [t, c] = FIRMA[f.estado] || FIRMA.en_firma; return `<button class="lz-row" data-op="${f.operacion || ''}" data-pid="${esc(p.id)}"><span class="lz-rt"><b>${esc(f.plantilla)}</b><small>${f.operacion ? 'operación ' + f.operacion : ''}</small></span><i class="im-st ${c}">${t}</i></button>`; }).join('')}</section>` : ''}
    <details class="lz-sec lz-det"${L.histAbierto ? ' open' : ''}><summary><h4>${icon('clock', 13)} Historial <i class="muted">(${s.historial.length})</i></h4><span class="lz-dl">${s.historial[0] ? esc(fH(s.historial[0].fecha) + ' · ' + s.historial[0].texto) : 'Sin movimientos'}</span>${icon('chevD', 14)}</summary>${s.historial.length ? `<ul class="lz-hist">${s.historial.map((h) => `<li class="${h.nota ? 'nota' : ''}"><small>${fH(h.fecha)}</small><span>${esc(h.texto)}</span></li>`).join('')}</ul>` : ''}</details>`;
}

// ---------- negocio ----------
async function vNegocio(ctx) {
  const [n, ng] = await Promise.all([api('negObtener', ctx.id), api('negListar')]);
  const et = ng.etapas[n.tipo]; const sig = et[n.orden + 1]; const pct = Math.round((n.orden + 1) / n.total * 100);
  L.dato = { negocio: n, sig, prop: n.prop ? { id: n.prop.id, codigo: n.prop.codigo } : null };
  const firma = n.etapaInfo?.firma ? (n.firmas?.[n.etapa]?.estado === 'firmado' ? `<p class="lz-ok">${icon('check', 13)} ${esc(n.etapaInfo.firma)} firmado</p>` : `<p class="lz-falta">${icon('sign', 13)} Siguiente: ${esc(amable(n.siguiente))}</p>`) : (n.siguiente ? `<p class="lz-falta">${icon('arrowR', 13)} Siguiente: ${esc(amable(n.siguiente))}</p>` : '');
  return `${cabeza(esc(n.tipo === 'venta' ? 'Negocio de venta' : 'Negocio de arriendo'), esc(n.prop ? n.prop.codigo + ' · ' + n.prop.titulo : ''), 'briefcase')}
    <h3 class="lz-tit">${esc(n.cliente?.nombre || n.titulo)}</h3>
    <div class="lz-meta"><span>${n.estado === 'abierto' ? `Etapa ${n.orden + 1} de ${n.total}` : n.estado === 'ganado' ? 'Cerrado con éxito' : 'Cerrado'}</span><div class="lz-bar"><i style="width:${n.estado === 'ganado' ? 100 : pct}%"></i></div><b>${n.estado === 'ganado' ? 100 : pct}%</b></div>
    ${firma}
    ${n.proximaAccion?.texto ? `<p class="lz-acc ${n.vencida ? 'bad' : ''}">${icon('clock', 13)} ${esc(n.proximaAccion.texto)}${n.proximaAccion.fecha ? ' · ' + esc(n.proximaAccion.fecha) : ''}</p>` : ''}
    <ol class="lz-steps">${et.map((e, i) => `<li class="${i < n.orden ? 'hecho' : i === n.orden ? 'ahora' : ''}"><span>${i < n.orden ? icon('check', 12) : i + 1}</span><b>${esc(e.t)}</b>${e.firma ? `<small>${icon('sign', 11)} ${esc(e.firma)}</small>` : ''}</li>`).join('')}</ol>
    <div class="lz-acts">${n.estado === 'abierto' && sig ? btn('avanzar', 'arrowR', `Pasar a «${esc(sig.t)}»`, true) : ''}${btn('documento', 'filePlus', 'Documento')}${btn('agendar', 'calendar', 'Agendar')}${btn('negocio-completo', 'grid', 'Ver completo')}</div>`;
}

// ---------- agenda de un día ----------
async function vAgenda(ctx) {
  const f = ctx.fecha || hoyISO(); const ev = await api('agendaListar', { desde: f, hasta: f });
  L.dato = { eventos: ev };
  return `${cabeza('Agenda', fmtDia(f), 'calendar')}
    <div class="lz-acts">${btn('agendar', 'plus', 'Agendar otra', true)}${btn('agenda-completa', 'calendar', 'Agenda completa')}</div>
    <section class="lz-sec">${ev.length ? ev.map((e) => `<div class="lz-ev ${e.estado}"><span class="lz-hr">${esc(e.hora || '—')}</span><span class="lz-rt"><b>${esc(e.titulo)}</b><small>${esc([e.lugar, e.personas.map((c) => c.nombre).join(', ')].filter(Boolean).join(' · '))}</small>
      ${e.tipo === 'visita' ? (e.orden?.operacion ? `<i class="im-st ok">Orden ${e.orden.operacion}</i>` : `<button class="ag-ord" data-orden="${esc(e.id)}">${icon('sign', 12)} Generar orden de visita</button>`) : ''}${e.tipo === 'visita' && e.personas.length && e.estado === 'programado' ? `<button class="ag-ord wa" data-confev="${esc(e.id)}">${icon(e.confirmacion ? 'check' : 'whatsapp', 12)} ${e.confirmacion ? 'Confirmada' : 'Confirmar por WhatsApp'}</button>` : ''}</span></div>`).join('') : vacioTxt('No hay eventos este día.')}</section>`;
}

// ---------- firma ----------
async function vOperacion(ctx) {
  const r = await api('docSeguimiento', ctx.op); const [t, c] = FIRMA[r.estado] || FIRMA.en_firma; const pct = r.total ? Math.round(r.firmados / r.total * 100) : 0;
  L.dato = { op: ctx.op, propId: ctx.propId || null };
  return `${cabeza(`Operación ${r.operacion}`, 'Seguimiento de la firma', 'sign')}
    <div class="lz-meta"><span>${r.firmados} de ${r.total} firmaron</span><div class="lz-bar ${r.estado === 'firmado' ? 'ok' : ''}"><i style="width:${pct}%"></i></div><i class="im-st ${c}">${t}</i></div>
    <section class="lz-sec">${r.firmantes.map((s) => `<div class="lz-row st"><span class="ga-av">${esc((s.nombre || '?').trim()[0])}</span><span class="lz-rt"><b>${esc(s.nombre)}</b><small>${esc(s.rut || '')}</small></span><i class="im-st ${s.firmo ? 'ok' : 'res'}">${s.firmo ? 'Firmó' : 'Pendiente'}</i></div>`).join('')}</section>
    <div class="lz-acts">${btn('op-actualizar', 'rotateR', 'Actualizar', true)}${btn('op-operaciones', 'listCheck', 'Seguir en Operaciones')}${ctx.propId ? btn('op-prop', 'house', 'Ver propiedad') : ''}</div>`;
}

// ---------- acciones (siempre las mismas, sin pasar por el modelo) ----------
function conectar() {
  const h = host(); const d = L.dato || {};
  h.querySelectorAll('[data-neg]').forEach((b) => (b.onclick = () => mostrar({ tipo: 'negocio', id: b.dataset.neg })));
  h.querySelectorAll('[data-ag]').forEach((b) => (b.onclick = () => mostrar({ tipo: 'agenda', fecha: b.dataset.ag })));
  h.querySelectorAll('[data-op]').forEach((b) => (b.onclick = () => (b.dataset.op ? mostrar({ tipo: 'operacion', op: Number(b.dataset.op), propId: b.dataset.pid || null }) : mostrar({ tipo: 'propiedad', id: b.dataset.pid }))));
  h.querySelectorAll('[data-ver]').forEach((b) => (b.onclick = () => { window.Agente.acoplar(); ({ cartera: () => window.Inmo.cartera(), negocios: () => window.Negocios.abrir(), agenda: () => window.Agenda.abrir() })[b.dataset.ver](); }));
  h.querySelectorAll('[data-orden]').forEach((b) => (b.onclick = async () => { const e = (d.eventos || []).find((x) => x.id === b.dataset.orden); if (e) window.Agenda.ordenVisita(e, (r) => { refrescar(); window.Agente.decir(`Orden de visita enviada a firmar: operación ${r.operacion}.`); }); }));
  h.querySelector('.lz-det')?.addEventListener('toggle', (e) => { L.histAbierto = e.target.open; });
  h.querySelectorAll('[data-confev]').forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); window.Gestion.confirmar(b.dataset.confev); }));
  h.querySelectorAll('[data-tabneg]').forEach((b) => (b.onclick = () => mostrar({ ...L.ctx, negocio: b.dataset.tabneg })));
  h.querySelectorAll('[data-sg]').forEach((b) => (b.onclick = () => window.Agente.accion(d.sugerencias[Number(b.dataset.sg)].accion)));
  h.querySelectorAll('[data-tarea]').forEach((c) => (c.onchange = async () => { try { await api('negTarea', d.negocio.id, d.negocio.etapa, Number(c.dataset.tarea), c.checked); window.AssetRefrescar?.(); refrescar(); } catch (e) { c.checked = !c.checked; toast(e.message, 4000); } }));
  h.querySelectorAll('[data-etapa]').forEach((b) => (b.onclick = () => {
    const e = d.etapas[Number(b.dataset.i)]; const c = h.querySelector('#lzConf'); const atras = Number(b.dataset.i) < d.negocio.orden;
    c.innerHTML = `<span>¿${atras ? 'Volver' : 'Pasar'} a «${esc(e.t)}»?${!atras && Number(b.dataset.i) > d.negocio.orden + 1 ? ' <small>Te saltas etapas: puede pasar si lo hiciste por fuera.</small>' : ''}</span><button class="ghost small" data-cno>No</button><button class="primary small" data-csi>Sí, ${atras ? 'volver' : 'pasar'}</button>`;
    c.classList.remove('hidden');
    c.querySelector('[data-cno]').onclick = () => c.classList.add('hidden');
    c.querySelector('[data-csi]').onclick = async (ev) => { ev.target.disabled = true; try { const r = await api('assetEjecutar', 'asset_mover_negocio', { negocio: d.negocio.id, etapa: e.id }); window.Agente.decir(`Negocio de ${d.negocio.cliente?.nombre?.split(' ')[0] || d.prop.codigo} en «${r.negocio.etapa}».${(r.avisos || []).length ? ' ' + r.avisos.join(' ') : ''}`); if (!atras) window.Agente.festejo?.(); window.AssetRefrescar?.(); refrescar(); } catch (er) { ev.target.disabled = false; toast(er.message, 5000); } };
  }));
  const A = {
    inicio: () => mostrar({ tipo: 'inicio' }),
    anotar: () => window.Gestion.anotar(d.prop?.id || d.negocio?.propId),
    'orden-ev': (b) => window.Agente.accion({ tipo: 'orden', eventoId: b.dataset.ev }),
    perdido: () => {
      const c = h.querySelector('#lzConf'); c.innerHTML = `<span>¿Cerrar el negocio de ${esc(d.negocio.cliente?.nombre || '')} como perdido?<input id="lzMot" placeholder="Motivo (ej.: no le gustó la ubicación)" /></span><button class="ghost small" data-cno>No</button><button class="primary small" data-csi>Sí, cerrar</button>`;
      c.classList.remove('hidden'); c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); c.querySelector('#lzMot').focus();
      c.querySelector('[data-cno]').onclick = () => c.classList.add('hidden');
      c.querySelector('[data-csi]').onclick = async (ev) => { const m = c.querySelector('#lzMot').value.trim(); if (!m) return c.querySelector('#lzMot').focus(); ev.target.disabled = true;
        try { await api('negCerrar', d.negocio.id, 'perdido', m); window.Agente.decir(`Negocio de ${d.negocio.cliente?.nombre || d.prop?.codigo} cerrado: ${m}.`); window.AssetRefrescar?.(); refrescar(); } catch (er) { ev.target.disabled = false; toast(er.message, 5000); } };
    },
    fuera: async (b) => { b.disabled = true; try { await api('negFirmaFuera', d.negocio.id, d.negocio.etapa); window.Agente.decir(`Anotado: ${d.negocio.etapaInfo.firma.toLowerCase()} firmado fuera de Asset.`); window.AssetRefrescar?.(); refrescar(); } catch (e) { b.disabled = false; toast(e.message, 5000); } },
    'op-neg': () => mostrar({ tipo: 'operacion', op: d.negocio.firmas[d.negocio.etapa].operacion, propId: d.prop?.id || null }),
    agendar: () => window.Gestion.agendar({ propId: d.prop?.id || d.negocio?.propId || null, personaId: d.negocio?.clienteId || null, negocioId: d.negocio?.id || null }),
    documento: () => { const pid = d.prop?.id || d.negocio?.propId; return pid ? window.Gestion.documento(pid) : window.Gestion.iniciar({ destino: 'documento' }); },
    'negocio-nuevo': () => window.Agente.prellenar(`Crea un negocio de ${d.prop?.arriendo ? 'arriendo' : 'venta'} de ${d.prop?.codigo} con `),
    ficha: () => { window.Agente.acoplar(); window.Inmo.abrirFicha(d.prop.id); },
    publicar: () => window.Publicaciones.publicar(d.prop.id),
    avanzar: async (b) => { b.disabled = true; try { const r = await api('assetEjecutar', 'asset_mover_negocio', { negocio: d.negocio.id, etapa: d.sig.id }); window.Agente.decir(`Negocio en «${r.negocio.etapa}».${(r.avisos || []).length ? ' ' + r.avisos.join(' ') : ''}`); window.Agente.festejo?.(); refrescar(); } catch (e) { b.disabled = false; toast(e.message, 5000); } },
    'negocio-completo': () => { window.Agente.acoplar(); window.Negocios.abrirNegocio(d.negocio.id); },
    'agenda-completa': () => { window.Agente.acoplar(); window.Agenda.abrir(); },
    'op-actualizar': () => mostrar(),
    'op-operaciones': () => window.Gestion.operaciones(d.op),
    'op-prop': () => mostrar({ tipo: 'propiedad', id: d.propId }),
  };
  h.querySelectorAll('[data-lz]').forEach((b) => (b.onclick = () => A[b.dataset.lz]?.(b)));
}

window.Lienzo = { mostrar, refrescar, actual: () => ({ ctx: L.ctx, ...(L.dato || {}) }) };
})();
