/* global $, api, esc, icon, toast, closeModal, ir, pf, liberar */
'use strict';
// «Hoy» y las etapas del negocio (0.15). Tres etapas (Captación · Comercialización · Postventa) con pasos
// logrados, pendientes («te toca» o «esperando a…») y no logrados. Estilo: vidrio sobre la foto del inicio
// desenfocada, y una «luz guía» que recorre el botón recomendado (y se mueve al botón donde está el mouse).
(() => {
const fdm = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '');
const hoyISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const venceTxt = (v) => (!v ? '' : v === hoyISO() ? 'Vence hoy' : v < hoyISO() ? `Venció el ${fdm(v)}` : `Plazo: ${fdm(v)}`);
const IC = {
  ok: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  pend: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  otro: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M7 4h10M7 20h10M8 4c0 4 8 4 8 8s-8 4-8 8M16 4c0 4-8 4-8 8"/></svg>',
  fail: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/></svg>',
  todo: '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="6"/></svg>',
};
const claseDe = (x) => (x.e === 'ok' ? 'ok' : x.e === 'fail' ? 'fail' : x.e === 'pend' ? (x.q === 'otro' ? 'otro' : 'pend') : 'todo');

// ---------- luz guía: el botón recomendado brilla; la luz sigue al mouse y vuelve al recomendado al salir ----------
function luz(root) {
  const def = () => root.querySelector('.luz[data-def]') || root.querySelector('.luz');
  const poner = (el) => { root.querySelectorAll('.luz.on').forEach((x) => x !== el && x.classList.remove('on')); el?.classList.add('on'); };
  poner(def());
  root.querySelectorAll('.luz').forEach((el) => { el.onmouseenter = () => poner(el); el.onmouseleave = () => poner(def()); el.onfocusin = () => poner(el); });
}

// ---------- ventana de trabajo: cada acción se hace en su propia ventana, sin pasar por el chat del Agente ----------
const V = { ov: null, body: null, alCerrar: null };
function ventana(titulo, sub, alCerrar) {
  cerrarVentana(true);
  const ov = document.createElement('div'); ov.className = 'vt-ov';
  ov.innerHTML = `<div class="vt gl-card" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><div class="vt-h"><div><b>${esc(titulo)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div><button class="gl vt-x" aria-label="Cerrar">${icon('x', 16)}</button></div><div class="vt-b"></div></div>`;
  document.body.appendChild(ov); V.ov = ov; V.body = ov.querySelector('.vt-b'); V.alCerrar = alCerrar || null;
  ov.querySelector('.vt-x').onclick = () => cerrarVentana(); ov.addEventListener('mousedown', (e) => { if (e.target === ov) cerrarVentana(); });
  return V.body;
}
function cerrarVentana(silencioso) { if (!V.ov) return; V.ov.remove(); V.ov = null; V.body = null; const f = V.alCerrar; V.alCerrar = null; if (!silencioso) f?.(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && V.ov && document.querySelector('#modal')?.classList.contains('hidden')) cerrarVentana(); });
// los flujos guiados (documentos, agendar…) dibujan tarjetas con Agente.tarjeta: si hay una ventana abierta, van ahí
function engancharAgente() {
  const A = window.Agente; if (!A || A.__vt) return; A.__vt = true;
  const t0 = A.tarjeta, d0 = A.decir, b0 = A.bajar, c0 = A.contexto;
  A.tarjeta = (node, o) => { if (V.body) { node.querySelector(':scope > .ga-x')?.remove(); V.body.appendChild(node); requestAnimationFrame(() => node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); return 0; } return t0(node, o); };
  A.decir = (...a) => (V.body ? undefined : d0(...a)); A.bajar = (...a) => (V.body ? undefined : b0?.(...a)); A.contexto = (...a) => (V.body ? undefined : c0?.(...a));
}
const propDe = (id) => window.Inmo._IM.data?.propiedades?.find((p) => p.id === id) || null;
async function documento(x, re, titulo, buscar) {
  const body = ventana(titulo, [x.codigo, x.titulo].filter(Boolean).join(' · '), x.alTerminar);
  body.innerHTML = '<div class="ga-load"><span class="spinner sm"></span>Buscando la plantilla…</div>';
  window.members(async () => {
    try {
      const l = await api('docPlantillas', { texto: buscar, propId: x.propId }); const t = re.map((r) => l.find((y) => r.test(y.nombre))).find(Boolean);
      body.innerHTML = '';
      if (t) await window.Gestion.usarPlantilla(x.propId, t.id, t.nombre);
      else await window.Gestion.docNuevo({ propId: x.propId, titulo, tipoDoc: 'libre', negocioId: x.negocioId || null });
    } catch (e) { body.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }, 'Para enviar documentos a firmar, inicia sesión con tu cuenta de Portalfirma.');
}

// ---------- acciones de un paso ----------
async function accion(x, alTerminar) {
  const t = x.tipo; const id = x.pasoId || x.id; x.alTerminar = alTerminar; engancharAgente();
  if (x.accion === 'Reprogramar' || x.accion === 'Reintentar') return reprogramar(x, alTerminar);
  // 0.16.14 · los pasos de la ficha abren la ficha completa en su bloque
  const BLQ = { datos: 'esencial', portal: 'portal', legal: 'legal', equip: 'equip' };
  if (BLQ[id] && x.propId) return window.FichaBloques.abrir(x.propId, { bloque: BLQ[id], despues: alTerminar });
  if (id === 'comovisitar' && x.propId) return window.FichaBloques.abrir(x.propId, { bloque: 'visita', despues: alTerminar });
  if (id === 'mandato' && x.propId) { const e = await api('fmtEstado').catch(() => null); const otro = () => documento(x, [/contrato de corretaje/i, /mandato/i, /^(?!.*visita).*corretaje/i], 'Mandato de corretaje', 'Contrato de corretaje');
    return e ? window.Formatos.abrir(x.propId, { hito: 'mandato', despues: alTerminar }, otro) : otro(); }
  if (id === 'mandato') return documento(x, [/contrato de corretaje/i, /mandato/i, /^(?!.*visita).*corretaje/i], 'Mandato de corretaje', 'Contrato de corretaje');
  if (id === 'orden' && x.propId) { const otro = () => documento(x, [/^orden de visita/i, /orden de visita/i], 'Orden de visita', 'Orden de visita'); const e = await api('fmtEstado').catch(() => null);
    if (!e?.paquete || !e.formatos.some((f) => f.id === 'orden_visita')) return otro();
    const neg = x.negocioId ? await api('negObtener', x.negocioId).catch(() => null) : null; return window.Formatos.abrir(x.propId, { hito: 'orden', despues: alTerminar, personaId: neg?.clienteId || null, op: neg?.tipo || null }, otro); }
  if (id === 'visita') { ventana('Agendar visita', [x.codigo, x.titulo].filter(Boolean).join(' · '), alTerminar); const neg = x.negocioId ? (await api('negObtener', x.negocioId).catch(() => null)) : null; return window.Gestion.agendar({ tipo: 'visita', propId: x.propId, personaId: neg?.clienteId || undefined }); }
  if (id === 'fotos' && x.propId) return window.Fotos.drive(x.propId);
  if (id === 'publicada' && x.propId) return window.Publicaciones.publicar(x.propId);
  if (t === 'evaluar' && x.negocioId) return menuPaso(x, alTerminar); // modal-13: solicitar los documentos por WhatsApp, ver lo adjuntado y decidir
  if (t === 'negocio') return window.Negocios.nuevo({ propId: x.propId });
  if (t === 'firma' && document.querySelector('#ngEnv')) return document.querySelector('#ngEnv').click(); // dentro del negocio: el envío de su documento
  if (t === 'cerrar' && document.querySelector('#ngWin')) return document.querySelector('#ngWin').click();
  if (['firma', 'cerrar', 'revisar', 'ver', 'ficha', 'agente'].includes(t)) return x.negocioId ? window.Negocios.abrirNegocio(x.negocioId) : x.propId && window.Inmo.abrirFicha(x.propId);
  if (t === 'ok') { await marcar(x, 'ok'); toast(`Logrado: ${x.paso || x.t}.`); return alTerminar?.(); }
}
const marcar = (x, estado, extra = {}) => api('etMarcar', { negocioId: x.negocioId || null, propId: x.negocioId ? null : x.propId, paso: x.pasoId || x.id, estado, ...extra });
// Las dos ventanas están en React (ventanas/inmo/Etapas.tsx); marcar el paso sigue aquí.
function reprogramar(x, alTerminar) {
  window.Ventanas.abrir('inmo.reprogramar', { titulo: `${x.accion === 'Reprogramar' ? 'Reprogramar' : 'Volver a intentar'}: ${x.paso || x.t}`, hoy: hoyISO(),
    alGuardar: async ({ vence, d }) => { await marcar(x, 'pend', { vence, d }); closeModal(); toast('Vuelve a quedar pendiente.'); alTerminar?.(); } }, { clave: 'modal-12' });
}
// menú de estados de un paso: logrado, no logrado, esperando a…, automático
function menuPaso(x, alTerminar) {
  const fin = async (estado, extra) => { await marcar(x, estado, extra); closeModal(); toast('Paso actualizado.'); alTerminar?.(); };
  window.Ventanas.abrir('inmo.menuPaso', { titulo: x.t, descripcion: x.d, manual: !!x.manual, evaluacionNegocioId: x.tipo === 'evaluar' ? x.negocioId : undefined,
    alElegir: (e) => (e === 'ok' ? fin('ok') : fin(null)),
    alGuardar: (modo, texto, vence) => (modo === 'fail' ? fin('fail', { d: texto }) : fin('pend', { quien: texto || 'otra persona', vence })) }, { clave: 'modal-13', ancho: x.tipo === 'evaluar' });
}

// ---------- pantalla «Hoy» ----------
// Está en React: src/ui/components/functional/hoy/Hoy.tsx. Comparte #view-inicio con «La oficina», que
// antes de dibujar desmonta React (liberar, en inmo.js). Se vuelve a montar al abrirla, así está al día.
function abrir() {
  ir('inicio'); const v = $('#view-inicio');
  liberar(v); window.ReactUI.montar('Hoy', v);
}

// «Empezar algo nuevo»: una ventana con las tres etapas y una acción por línea
function nuevo() {
  engancharAgente();
  const body = ventana('Empezar algo nuevo', 'Elige por dónde partir');
  const G = [['1 · Captación', [['dictar', 'mic', 'Subir una propiedad dictando'], ['prop', 'house', 'Crear una propiedad con formulario']]],
    ['2 · Comercialización', [['lead', 'whatsapp', 'Importar un chat de WhatsApp (lead)'], ['visita', 'calendar', 'Agendar una visita'], ['negocio', 'briefcase', 'Abrir un negocio']]],
    ['3 · Postventa', [['firmas', 'listCheck', 'Ver documentos en firma'], ['negocios', 'flow', 'Ver todos los negocios']]]];
  body.innerHTML = `<div class="vt-nuevo">${G.map(([t, l]) => `<div><small>${t}</small>${l.map(([k, ic, tx]) => `<button class="gl" data-n="${k}">${icon(ic, 15)} ${tx}</button>`).join('')}</div>`).join('')}</div>`;
  body.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { const k = b.dataset.n; if (!['visita'].includes(k)) cerrarVentana(true);
    ({ dictar: () => window.Dictado.abrir(), prop: () => window.Inmo.formProp(), lead: () => window.Leads.abrir(), visita: () => { body.innerHTML = ''; window.Gestion.agendar({ tipo: 'visita' }); },
      negocio: () => window.Negocios.nuevo(), firmas: () => { window.show('ops'); window.Operaciones.open(); }, negocios: () => window.Negocios.abrir() })[k]?.(); }));
}

// ---------- bloque de etapas dentro de un negocio ----------
async function bloque(host, { negocioId, propId, alCambiar, compacto = false } = {}) {
  let r; try { r = await api('etPasos', { negocioId, propId }); } catch (e) { host.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  if (!host.isConnected) return; // mientras tanto se cerró la ficha o el negocio (o React la volvió a dibujar)
  const a = r.actual; const abiertas = bloque._abiertas[negocioId || propId] ||= {};
  const recargar = () => (alCambiar ? alCambiar() : bloque(host, { negocioId, propId }));
  const x0 = a ? { ...a, negocioId, propId, pasoId: a.id, paso: a.t } : null;
  const cls = a ? claseDe(a) : 'ok';
  const uno = r.etapas.length === 1; // la captación de una propiedad: una sola lista, sin tarjetas de etapa
  host.innerHTML = `<div class="et">
    <div class="et-cards" ${uno ? 'hidden' : ''}>${r.etapas.map((e, i) => `<div class="gl-card et-c ${e.actual ? (e.fail ? 'act fail' : 'act') : ''}"><div class="et-ch"><span class="et-n ${e.completa ? 'ok' : e.actual ? (e.fail ? 'fail' : 'act') : ''}">${e.completa ? IC.ok : i + 1}</span><b>${esc(e.nombre)}</b></div>
      <small>${e.completa ? `Completa · ${e.ok} de ${e.total}` : e.actual ? `En curso · ${e.ok} de ${e.total}` : `Por comenzar · ${e.total} pasos`}</small><span class="et-bar"><i class="${e.completa ? 'ok' : e.fail ? 'fail' : ''}" style="width:${Math.round((e.ok / e.total) * 100)}%"></i></span></div>`).join('')}</div>
    ${a ? `<div class="gl-card et-next ${cls}"><small class="et-nl">${cls === 'fail' ? 'No logrado · decide qué hacer' : cls === 'otro' ? `Esperando a ${esc(a.quien)}` : 'Siguiente paso · te toca'}</small>
      <h3>${esc(a.t)}</h3>${a.d ? `<p>${esc(a.d)}</p>` : ''}
      <div class="et-nb"><span class="luz" data-def><button class="gl ${cls === 'fail' ? 'rojo' : cls === 'otro' ? '' : 'azul'}" id="etAcc">${esc(a.accion)}</button></span>${a.tipo !== 'ok' && cls !== 'fail' ? '<span class="luz"><button class="gl" id="etOk">Marcar como logrado</button></span>' : ''}<span class="luz"><button class="gl" id="etMas">Otro estado…</button></span>${a.vence ? `<span class="muted small">${esc(venceTxt(a.vence))}</span>` : ''}</div></div>`
      : compacto ? `<div class="gl-card et-next ok et-lista"><b>${IC.ok} ${uno ? 'Captación completa' : 'Todo logrado'}</b><small class="muted">Todos los pasos están logrados.</small></div>` : '<div class="gl-card et-next ok"><h3>Operación cerrada</h3><p>Todos los pasos están logrados.</p></div>'}
    ${r.etapas.map((e, i) => { const ab = abiertas[i] !== undefined ? abiertas[i] : (compacto ? false : e.actual); return `<section class="gl-card et-e"><button class="et-eh" data-tog="${i}" aria-expanded="${ab}"><span class="et-chev ${ab ? 'abierto' : ''}">›</span><b>${uno ? `Pasos de ${esc(e.nombre.toLowerCase())}` : `Etapa ${i + 1} · ${esc(e.nombre)}`}</b><span class="spacer"></span><i class="et-badge ${e.completa ? 'ok' : e.fail ? 'fail' : e.actual ? 'act' : ''}">${e.fail ? `No logrado · ${e.ok} de ${e.total}` : `${e.ok} de ${e.total} logrados`}</i></button>
      ${ab ? `<div class="et-ps">${e.pasos.map((x, j) => { const c = claseDe(x); const esA = a && a.ei === i && a.pi === j; return `<div class="et-p ${esA ? 'act' : ''}"><span class="et-pi ${c}">${IC[c]}</span><div class="et-pt"><b>${esc(x.t)}</b><small>${esc(c === 'ok' ? `Logrado${x.f ? ' · ' + fdm(x.f.slice(0, 10)) : ''}${x.d ? ' · ' + x.d : ''}` : c === 'fail' ? `No logrado · ${x.d || ''}` : c === 'otro' ? `Esperando a ${x.quien}${x.d ? ' · ' + x.d : ''}` : c === 'pend' ? `Pendiente${x.vence ? ' · ' + venceTxt(x.vence) : ''}${x.d ? ' · ' + x.d : ''}` : 'Por hacer')}</small></div>
        <i class="et-tag ${c}">${{ ok: 'Logrado', fail: 'No logrado', otro: 'Esperando', pend: 'Te toca', todo: '' }[c]}</i><button class="ghost small et-pm" data-pm="${i}.${j}" aria-label="Cambiar el estado de ${esc(x.t)}">···</button></div>`; }).join('')}</div>` : ''}</section>`; }).join('')}
  </div>`;
  host.querySelectorAll('[data-tog]').forEach((b) => (b.onclick = () => { const i = Number(b.dataset.tog); const e = r.etapas[i]; abiertas[i] = !(abiertas[i] !== undefined ? abiertas[i] : (compacto ? false : e.actual)); bloque(host, { negocioId, propId, alCambiar, compacto }); }));
  host.querySelectorAll('[data-pm]').forEach((b) => (b.onclick = () => { const [i, j] = b.dataset.pm.split('.').map(Number); menuPaso({ ...r.etapas[i].pasos[j], negocioId, propId }, recargar); }));
  if (x0) {
    $('#etAcc').onclick = () => accion(x0, recargar);
    $('#etOk')?.addEventListener('click', async () => { await marcar(x0, 'ok'); toast(`Logrado: ${a.t}.`); recargar(); });
    $('#etMas').onclick = () => menuPaso({ ...a, negocioId, propId }, recargar);
  }
  luz(host);
}
bloque._abiertas = {};

window.Hoy = { abrir, nuevo };
window.Ventana = { abrir: ventana, cerrar: cerrarVentana };
window.Etapas = { bloque, luz, accion };
})();
