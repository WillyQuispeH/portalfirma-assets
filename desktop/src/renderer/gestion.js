/* global $, api, esc, icon, toast, IM, cargar, precio, show */
'use strict';
// ============================================================================
// «Gestionar una propiedad»: flujo guiado dentro del chat del Agente, con tarjetas.
//   1. Elegir la propiedad (por código, dirección o comuna)
//   2. Qué hacer: generar un documento, orden de visita, agendar, negocio, ficha, portal…
//   3. Qué documento: las plantillas de la cuenta (Notaría virtual), ordenadas para esa propiedad
//   4. Formulario prellenado con la ficha, las personas vinculadas y los datos del corredor
//   5. Revisar → enviar a firmar → seguimiento aquí, con el agente o en el panel de Operaciones
// Usa la misma lógica que el agente (documentos.js en el proceso principal).
// ============================================================================
(() => {
const FUENTE = { propiedad: 'de la ficha', persona: 'del CRM', hoy: 'hoy', corredor: 'tus datos', cuenta: 'de la cuenta' };
const EST = { en_firma: ['En firma', 'wait'], firmado: ['Firmado', 'ok'], pendiente_pago: ['Pendiente de pago', 'bad'] };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cleanRut = (r) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
const dirTxt = (p) => [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ');
const precios = (p) => [p.venta ? `Venta ${precio(p.precioVenta) || '—'}` : '', p.arriendo ? `Arriendo ${precio(p.precioArriendo) || '—'}` : ''].filter(Boolean).join(' · ');
const mini = (p) => (p.fotos?.length ? `<img src="${esc(p.fotos[0])}" class="im-img" alt="" loading="lazy" />` : `<span class="ga-noph">${icon('house', 20)}</span>`);
const per = (id) => IM.data.personas.find((c) => c.id === id);
const spin = (t) => `<div class="ga-load"><span class="spinner sm"></span>${esc(t)}</div>`;
const fmtF = (iso) => { try { return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }); } catch { return ''; } };
function card(cls, html) { const d = document.createElement('div'); d.className = 'ga ' + cls; d.innerHTML = html; return d; }
const head = (n, t, sub) => `<div class="ga-h">${n ? `<span class="ga-n">${n}</span>` : ''}<div><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
// una tarjeta ya respondida queda como una línea con la elección
function cerrar(node, ic, txt, cambiar) {
  node.className = 'ga hecha'; node.innerHTML = `<span class="ga-ok">${icon('check', 13)}</span><span>${txt}</span>${cambiar ? '<button class="ghost small" data-cambiar>Cambiar</button>' : ''}`;
  node.dataset.resumen = node.querySelector('span:nth-child(2)').textContent; window.Agente.guardar?.();
  if (cambiar) node.querySelector('[data-cambiar]').onclick = cambiar;
}

// ---------- 1. propiedad ----------
async function iniciar({ destino, propId } = {}) {
  await cargar();
  if (propId) { const p = IM.data.propiedades.find((x) => x.id === propId); if (p) { window.Agente.contexto({ tipo: 'propiedad', id: p.id }); window.Agente.decir(destino === 'documento' ? `Generar un documento para ${p.codigo}` : `Gestionar ${p.codigo}`, 'user'); return destino === 'documento' ? plantillas(p) : acciones(p); } }
  const node = card('ga-prop', `${head(1, '¿Qué propiedad quieres gestionar?', 'Busca por código, dirección, comuna o propietario')}
    <div class="ga-search">${icon('search', 15)}<input data-q placeholder="Ej.: CV-9002, Irarrázaval, Ñuñoa…" spellcheck="false" /></div>
    <div class="ga-chips" data-op>${[['', 'Todas'], ['venta', 'Venta'], ['arriendo', 'Arriendo']].map(([k, t], i) => `<button data-o="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</div>
    <div class="ga-props"></div>`);
  let q = ''; let op = '';
  const pintar = () => {
    const tok = norm(q).split(/\s+/).filter(Boolean);
    const l = IM.data.propiedades.filter((p) => !p.archivada && (!op || p[op]) && tok.every((t) => norm([p.codigo, p.titulo, p.direccion, p.unidad, p.comuna, p.rol, ...(p.vinculos || []).map((v) => { const c = per(v.personaId); return c ? c.nombre + ' ' + c.rut : ''; })].join(' ')).includes(t)))
      .sort((a, b) => String(b.actualizado || '').localeCompare(String(a.actualizado || '')));
    node.querySelector('.ga-props').innerHTML = l.length ? l.slice(0, 8).map((p) => `<button class="ga-pc" data-p="${esc(p.id)}"><span class="ga-ph">${mini(p)}</span><span class="ga-pt"><small>${esc(p.codigo)}</small><b>${esc(p.titulo)}</b><small>${esc(dirTxt(p) || 'Sin dirección')}</small><em>${esc(precios(p))}</em></span></button>`).join('')
      + (l.length > 8 ? `<p class="muted small ga-mas">y ${l.length - 8} más: escribe para afinar la búsqueda.</p>` : '')
      : `<p class="muted small">No encontré propiedades${q ? ` con «${esc(q)}»` : ''}. Puedes pedirle al Agente «sube una propiedad nueva…».</p>`;
    node.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { const p = IM.data.propiedades.find((x) => x.id === b.dataset.p); cerrar(node, 'house', `Propiedad: <b>${esc(p.codigo)}</b> · ${esc(p.titulo)}`, () => iniciar({ destino })); window.Agente.contexto({ tipo: 'propiedad', id: p.id }); destino === 'documento' ? plantillas(p) : acciones(p); }));
  };
  node.querySelector('[data-q]').oninput = (e) => { q = e.target.value; pintar(); };
  node.querySelector('[data-q]').onkeydown = (e) => { if (e.key === 'Enter') node.querySelector('[data-p]')?.click(); };
  node.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => { op = b.dataset.o; node.querySelectorAll('[data-o]').forEach((x) => x.classList.toggle('on', x === b)); pintar(); }));
  pintar();
  window.Agente.tarjeta(node, { usuario: destino === 'documento' ? 'Generar un documento' : 'Gestionar una propiedad' });
  setTimeout(() => node.querySelector('[data-q]')?.focus(), 80);
}

// ---------- 2. la propiedad primero: cómo está, qué negocios tiene y qué sugiere (nada obligatorio) ----------
const ROL = { propietario: 'Propietario', arrendatario: 'Arrendatario', comprador: 'Comprador', codeudor: 'Codeudor', interesado: 'Interesado', proveedor: 'Proveedor' };
const ETXT = { disponible: ['Disponible', 'ok'], reservada: ['Reservada', 'res'], vendida: ['Vendida', 'end'], arrendada: ['Arrendada', 'end'], no_disponible: ['No disponible', ''] };
const amable = (t) => String(t || '').replace(/^Listo para pasar a /, 'pasar a ').replace(/^Falta firmar: /, 'firmar ').replace(/^Esperando firmas: /, 'esperando firmas de ').replace(/^./, (c) => c.toLowerCase());
const primer = (n) => { const x = String(n || '').trim().split(/\s+/)[0] || ''; return x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : ''; };
const fH = (iso) => { try { const d = new Date(iso); return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }); } catch { return ''; } };
function reciente(P) { try { const k = 'pf.recientes'; const l = JSON.parse(localStorage.getItem(k) || '[]').filter((x) => x.id !== P.id); l.unshift({ id: P.id, codigo: P.codigo, titulo: P.titulo }); localStorage.setItem(k, JSON.stringify(l.slice(0, 5))); } catch { /* sin almacenamiento */ } }
async function estado(propId, { usuario } = {}) {
  await cargar(); const p = IM.data.propiedades.find((x) => x.id === propId || x.codigo === propId); if (!p) return toast('La propiedad ya no está en la cartera.', 4000);
  let s; try { s = await api('estEstado', p.id); } catch (e) { return toast(e.message, 5000); }
  const P = s.prop; reciente(P); window.Agente.contexto({ tipo: 'propiedad', id: p.id });
  const chip = (o, x) => { const [t, c] = ETXT[x.estado] || ['—', '']; return `<span class="ga-pr"><small>${o}</small><b>${esc(precio(x.precio) || '—')}</b><i class="im-st ${c}">${t}</i></span>`; };
  // un negocio = una fila por cliente con sus etapas como puntos (hecho · ahora · falta); clic → su estado en el lienzo
  const negRow = (n) => `<button class="ga-ng" data-neg="${esc(n.id)}"><span class="ga-ngt"><span class="ga-ngh"><b>${esc(n.cliente || 'Sin cliente')}</b><small>${n.tipo === 'venta' ? 'venta' : 'arriendo'}</small><em>${esc(n.etapaTxt || '')}</em></span>
    <span class="ga-pipe">${(n.etapas || []).map((e, i) => `<i class="${i < n.orden ? 'h' : i === n.orden ? 'a' : ''}" title="${esc(e.t)}"></i>`).join('')}</span>
    ${n.siguiente ? `<small class="ga-falt">${icon('arrowR', 11)} Siguiente: ${esc(amable(n.siguiente))}</small>` : ''}${n.proximaAccion?.texto ? `<small class="${n.vencida ? 'ga-venc' : ''}">${icon('clock', 11)} ${esc(n.proximaAccion.texto)}${n.proximaAccion.fecha ? ' · ' + esc(n.proximaAccion.fecha) : ''}</small>` : ''}</span><span class="ga-ngv">Ver estado ${icon('chevR', 13)}</span></button>`;
  const linea = [...s.proximos.slice(0, 3).map((e) => `<li class="prox">${icon('calendar', 12)}<span><b>${esc(e.fecha.slice(8))}/${esc(e.fecha.slice(5, 7))}${e.hora ? ' ' + esc(e.hora) : ''}</b> ${esc(e.titulo)}${e.tipo === 'visita' ? (e.orden ? ' · con orden' : ' · <i>sin orden aún</i>') : ''}</span></li>`),
    ...(s.historial || s.ultimo).map((h) => `<li>${icon(h.nota ? 'edit' : 'clock', 12)}<span><b>${fH(h.fecha)}</b> ${esc(h.texto)}</span></li>`)];
  const node = card('ga-est', `<div class="ga-pp"><span class="ga-ph lg">${mini(p)}</span><div class="ga-pt"><small>${esc(P.codigo)} · ${esc(String(P.tipo || '').replace(/_/g, ' '))}${P.rol ? ' · Rol ' + esc(P.rol) : ''}</small><b>${esc(P.titulo)}</b><small>${icon('pin', 12)} ${esc(P.direccion || 'Sin dirección')}</small>
      <span class="ga-prs">${P.venta ? chip('Venta', P.venta) : ''}${P.arriendo ? chip('Arriendo', P.arriendo) : ''}</span>
      ${P.personas.length ? `<span class="ga-pers">${P.personas.map((v) => `<i>${esc(v.nombre)} · ${ROL[v.rol] || v.rol}</i>`).join('')}</span>` : '<span class="ga-pers"><i class="warn">Sin personas vinculadas</i></span>'}</div></div>
    <div class="ga-sec"><h5>${icon('briefcase', 12)} ${s.negocios.length === 1 ? 'Negocio en curso' : s.negocios.length ? `${s.negocios.length} negocios en curso` : 'Negocios'}</h5>${s.negocios.length ? s.negocios.map(negRow).join('') : '<p class="muted small">Sin negocios en curso.</p>'}</div>
    ${s.firmas.length ? `<div class="ga-sec"><h5>${icon('sign', 12)} En firma</h5>${s.firmas.map((f) => `<button class="ga-fr" data-op="${f.operacion || ''}">${icon('sign', 12)}<span>${esc(f.plantilla)}${f.operacion ? ' · operación ' + f.operacion : ''}</span><i class="im-st wait">En firma</i></button>`).join('')}</div>` : ''}
    <div class="ga-sec"><h5>${icon('clock', 12)} Lo último</h5>${linea.length ? `<ul class="ga-hist scroll">${linea.join('')}${s.totalProximos > 3 ? `<li class="prox">${icon('calendar', 12)}<span><i>y ${s.totalProximos - 3} ${s.totalProximos - 3 === 1 ? 'visita más' : 'visitas más'} agendadas</i></span></li>` : ''}</ul>` : '<p class="muted small">Todavía no hay movimientos.</p>'}</div>
    ${s.sugerencias.length ? `<div class="ga-sugs"><small>${icon('sparkle', 11)} Te sugiero <i>(opcional)</i></small>${s.sugerencias.map((x, i) => `<button data-s="${i}">${esc(x.label)}</button>`).join('')}</div>` : ''}
    <div class="ga-row">${[['anotar', 'edit', 'Anotar lo que pasó', 1], ['documento', 'filePlus', 'Documento'], ['agendar', 'calendar', 'Agendar'], ['orden', 'pin', 'Orden de visita'], ['negocio', 'briefcase', 'Nuevo negocio'], ['publicar', 'export', 'Publicar'], ['ficha', 'file', 'Ficha']]
      .map(([k, ic, t, pri]) => `<button class="${pri ? 'primary' : 'secondary'} small" data-a="${k}">${icon(ic, 14)}<span>${t}</span></button>`).join('')}</div>`);
  node.dataset.resumen = `${P.codigo} · ${P.titulo}${s.negocios.length ? ' · ' + s.negocios.map((n) => `${primer(n.cliente) || 'negocio'} en ${n.etapaTxt}`).join(', ') : ''}`; node.dataset.prop = p.id;
  const uno = s.negocios.length === 1 ? s.negocios[0] : null; const opP = p.arriendo ? 'arriendo' : 'venta';
  node.querySelectorAll('[data-neg]').forEach((b) => (b.onclick = () => window.Agente.contexto({ tipo: 'propiedad', id: p.id, negocio: b.dataset.neg }, { ver: true })));
  node.querySelectorAll('.ga-fr[data-op]').forEach((b) => (b.onclick = () => (b.dataset.op ? window.Agente.contexto({ tipo: 'operacion', op: Number(b.dataset.op), propId: p.id }, { ver: true }) : firmas(p.id))));
  node.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => window.Agente.accion(s.sugerencias[Number(b.dataset.s)].accion)));
  node.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
    const k = b.dataset.a;
    if (k === 'anotar') return anotar(p, s);
    if (k === 'documento') return plantillas(p);
    if (k === 'agendar') return agendar({ propId: p.id, personaId: uno?.clienteId || null, negocioId: uno?.id || null });
    if (k === 'orden') { b.disabled = true; try { const l = await api('docPlantillas', { texto: 'Orden de visita', propId: p.id }); const t = l.find((x) => /^orden de visita/i.test(x.nombre)) || l[0]; if (!t) throw new Error('No encontré la plantilla «Orden de visita» en tu cuenta.'); window.Agente.decir(`Orden de visita · ${p.codigo}`, 'user'); formulario(p, t); } catch (e) { toast(e.message, 5000); } finally { b.disabled = false; } return; }
    if (k === 'negocio') return window.Agente.prellenar(`Crea un negocio de ${opP} de ${p.codigo} con `);
    if (k === 'publicar') { window.Agente.acoplar(); return window.Publicaciones.publicar(p.id); }
    if (k === 'ficha') { window.Agente.acoplar(); return window.Inmo.abrirFicha(p.id); }
  }));
  window.Agente.tarjeta(node, { usuario });
  return node;
}
const acciones = (p) => estado(p.id);

// ---------- anotar lo que pasó (fuera de Asset: por teléfono, en persona…) ----------
function anotar(p, s) {
  const negs = s?.negocios || [];
  const TIPOS = [['llamada', 'Llamé'], ['visita', 'Visitó'], ['documentos', 'Envió documentos'], ['oferta', 'Hizo oferta'], ['otro', 'Otro']];
  const node = card('ga-anot', `${head(null, 'Anotar lo que pasó', `${esc(p.codigo)} · queda en el historial y te sugiero qué sigue. Nada cambia sin tu toque.`)}
    <div class="ga-chips" data-tipo>${TIPOS.map(([k, t], i) => `<button data-t="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</div>
    <div class="ga-fs">${negs.length ? `<label class="s2"><span>Negocio</span><select data-f="neg">${negs.map((n) => `<option value="${esc(n.id)}">${esc(n.cliente || 'Sin cliente')} · ${esc(n.etapaTxt || '')}</option>`).join('')}<option value="">Solo la propiedad</option></select></label>` : ''}
      <label class="s2"><span>Qué pasó</span><textarea data-f="txt" rows="2" placeholder="Ej.: quiere visitar el jueves a las 11"></textarea></label></div>
    <div class="ga-foot"><span class="ga-falta"></span><span class="spacer"></span><button class="ghost" data-cancel>Cancelar</button><button class="primary" data-ok>${icon('check', 15)} Anotar</button></div>`);
  let tipo = 'llamada';
  node.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { tipo = b.dataset.t; node.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); node.querySelector('[data-f="txt"]').focus(); }));
  const ok = async () => {
    const texto = node.querySelector('[data-f="txt"]').value.trim(); const negocioId = node.querySelector('[data-f="neg"]')?.value || undefined;
    if (!texto && tipo === 'otro') { node.querySelector('.ga-falta').innerHTML = `${icon('alert', 13)} Escribe qué pasó.`; return; }
    const b = node.querySelector('[data-ok]'); b.disabled = true;
    try {
      const r = await api('estAnotar', p.id, { tipo, texto, negocioId });
      cerrar(node, 'edit', `Anotado${r.negocio ? ` en el negocio de ${esc(primer(r.negocio.cliente) || p.codigo)}` : ` en ${esc(p.codigo)}`}: «${esc(r.anotado)}»`);
      window.AssetRefrescar?.(); window.Lienzo?.refrescar?.();
      window.Agente.sugerencias([...r.sugerencias, { label: 'Ver estado de la propiedad', accion: { tipo: 'estadoProp', propId: p.id } }]);
    } catch (e) { b.disabled = false; node.querySelector('.ga-falta').innerHTML = `${icon('alert', 13)} ${esc(e.message)}`; }
  };
  node.querySelector('[data-ok]').onclick = ok;
  node.querySelector('[data-f="txt"]').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ok(); } else if (e.key === 'Escape') window.Agente.quitar(node); };
  node.querySelector('[data-cancel]').onclick = () => window.Agente.quitar(node);
  window.Agente.tarjeta(node, { usuario: `Anotar · ${p.codigo}` });
  setTimeout(() => node.querySelector('[data-f="txt"]')?.focus(), 80);
}

// ---------- 3. qué documento ----------
async function plantillas(p) {
  const node = card('ga-tpl', `${head(3, '¿Qué documento quieres hacer?', `Plantillas de tu cuenta en la Notaría virtual · ordenadas para ${esc(p.codigo)}`)}
    <div class="ga-search">${icon('search', 15)}<input data-q placeholder="Busca: contrato de arriendo, promesa, mandato, acta de entrega…" spellcheck="false" /></div>
    <div class="ga-tpls">${spin('Buscando tus plantillas…')}</div>`);
  window.Agente.tarjeta(node);
  const lista = node.querySelector('.ga-tpls'); let tk = 0;
  const cargarL = async (texto) => {
    const my = ++tk; lista.innerHTML = spin(texto ? `Buscando «${texto}»…` : 'Buscando tus plantillas…');
    let l; try { l = await api('docPlantillas', { texto, propId: p.id }); } catch (e) { if (my === tk) lista.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
    if (my !== tk) return;
    const crearFila = texto ? `<button class="ga-tp ga-crear" data-crear><span class="ga-aic">${icon('filePlus', 16)}</span><span><b>${l.length ? '¿No es ninguno? ' : 'No hay una plantilla así. '}Crear «${esc(texto)}» con Asset</b><small>Asset lo arma en PDF con los datos de ${esc(p.codigo)} y sus personas, y lo envía a firmar.</small></span></button>` : '';
    lista.innerHTML = (l.length ? '' : crearFila) + (l.length ? l.map((t) => `<button class="ga-tp" data-t="${esc(t.id)}"><span class="ga-aic">${icon(/arriendo|arrendamiento/i.test(t.nombre) ? 'key' : /compraventa|promesa|oferta/i.test(t.nombre) ? 'coins' : /visita|acta/i.test(t.nombre) ? 'pin' : /poder|mandato|corretaje/i.test(t.nombre) ? 'briefcase' : 'file', 16)}</span><span><b>${esc(t.nombre)}</b><small>${esc(t.descripcion)}</small></span>${icon('chevR', 15)}</button>`).join('') : '<p class="muted small">No encontré plantillas con esa búsqueda.</p>') + (l.length ? crearFila : '');
    lista.querySelector('[data-crear]')?.addEventListener('click', () => { cerrar(node, 'filePlus', `Documento nuevo: <b>${esc(texto)}</b>`, () => plantillas(p)); docNuevo({ propId: p.id, titulo: texto }); });
    lista.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { const t = l.find((x) => x.id === b.dataset.t); cerrar(node, 'file', `Documento: <b>${esc(t.nombre)}</b>`, () => plantillas(p)); formulario(p, t); }));
    window.Agente.bajar();
  };
  let h; node.querySelector('[data-q]').oninput = (e) => { clearTimeout(h); const v = e.target.value.trim(); h = setTimeout(() => cargarL(v.length > 1 ? v : ''), 450); };
  cargarL('');
}

// ---------- 4. formulario prellenado ----------
async function formulario(p, t, personas = {}, nodoPrevio) {
  const node = nodoPrevio || card('ga-form', spin(`Preparando «${t.nombre}» con los datos de ${p.codigo}…`));
  if (nodoPrevio) node.innerHTML = spin('Actualizando…'); else window.Agente.tarjeta(node);
  let f; try { f = await api('docFormulario', { plantilla: t.id, propId: p.id, personas }); } catch (e) { node.innerHTML = `${head(4, esc(t.nombre))}<p class="error">${esc(e.message)}</p>`; return; }
  const total = f.grupos.reduce((s, g) => s + g.campos.length, 0); const llenos = f.grupos.reduce((s, g) => s + g.campos.filter((c) => c.valor).length, 0);
  const pers = [...f.personas].sort((a, b) => (b.rolEnPropiedad ? 1 : 0) - (a.rolEnPropiedad ? 1 : 0) || a.nombre.localeCompare(b.nombre, 'es'));
  const tipo = (c) => (c.tipo === 'date' ? 'date' : c.tipo === 'email' ? 'email' : c.tipo === 'phone' ? 'tel' : 'text');
  node.className = 'ga ga-form';
  node.innerHTML = `${head(4, esc(f.plantilla.nombre), `${esc(p.codigo)} · completé <b>${llenos} de ${total}</b> datos con la ficha, el CRM y tus datos`)}
    ${f.grupos.map((g) => `<fieldset class="ga-g" data-g="${esc(g.grupo)}"><legend>${esc(g.titulo)}${g.rolTxt ? ` <i>${esc(g.rolTxt)}</i>` : ''}</legend>
      ${g.firmante && g.rol !== 'corredor' ? `<label class="ga-per">${icon('user', 13)} Persona<select data-per="${esc(g.grupo)}"><option value="">Persona nueva (escribe sus datos)</option>${pers.map((c) => `<option value="${esc(c.id)}" ${g.personaId === c.id ? 'selected' : ''}>${esc(c.nombre)} · ${esc(c.rut)}${c.rolEnPropiedad ? ' · ' + esc(c.rolEnPropiedad) : ''}</option>`).join('')}</select></label>` : ''}
      <div class="ga-fs">${g.campos.map((c) => `<label class="${c.requerido && !c.valor ? 'falta' : ''}"><span>${esc(c.etiqueta.charAt(0) + c.etiqueta.slice(1).toLowerCase())}${c.requerido ? '' : ' <i>(opcional)</i>'}${c.fuente ? `<em>${FUENTE[c.fuente] || ''}</em>` : ''}</span><input data-c="${esc(c.id)}" data-cp="${esc(c.campoPersona || '')}" data-req="${c.requerido ? 1 : ''}" type="${tipo(c)}" value="${esc(c.valor)}" spellcheck="false" /></label>`).join('')}</div></fieldset>`).join('')}
    ${f.aviso ? `<p class="ga-nota">${icon('alert', 13)} ${esc(f.aviso)}</p>` : ''}
    ${f.negocio?.pideFirma ? `<label class="ga-neg"><input type="checkbox" data-neg checked /> Ligar a la etapa «${esc(f.negocio.etapa)}» del negocio ${esc(f.negocio.titulo)}: cuando se firme, el negocio avanza solo.</label>` : ''}
    <div class="ga-foot"><span class="ga-falta"></span><span class="spacer"></span><button class="ghost small" data-otro>Otro documento</button><button class="primary" data-rev>${icon('sign', 15)} Revisar y enviar a firmar</button></div>`;
  const falta = () => { let n = 0; node.querySelectorAll('input[data-c]').forEach((i) => { const m = i.dataset.req && !i.value.trim(); i.parentElement.classList.toggle('falta', !!m); if (m) n++; }); node.querySelector('.ga-falta').innerHTML = n ? `${icon('alert', 13)} Faltan ${n} ${n === 1 ? 'dato' : 'datos'}` : `<span class="ok">${icon('check', 13)} Todo completo</span>`; return n; };
  node.querySelectorAll('input[data-c]').forEach((i) => (i.oninput = falta));
  node.querySelectorAll('[data-per]').forEach((s) => (s.onchange = () => { const c = f.personas.find((x) => x.id === s.value); s.closest('fieldset').querySelectorAll('input[data-cp]').forEach((i) => { if (!i.dataset.cp) return; i.value = c ? (c[i.dataset.cp] || '') : ''; const em = i.parentElement.querySelector('em'); if (em) em.remove(); }); falta(); }));
  node.querySelector('[data-otro]').onclick = () => plantillas(p);
  const recoger = () => { const valores = {}; node.querySelectorAll('input[data-c]').forEach((i) => { valores[i.dataset.c] = i.value.trim(); }); const ps = {}; node.querySelectorAll('[data-per]').forEach((s) => { ps[s.dataset.per] = s.value || null; });
    return { plantilla: t.id, propId: p.id, valores, personas: ps, negocioId: node.querySelector('[data-neg]')?.checked ? f.negocio.id : null }; };
  node.querySelector('[data-rev]').onclick = async () => {
    if (falta()) { node.querySelector('.falta input')?.focus(); return toast('Completa los datos marcados.'); }
    const o = recoger(); const b = node.querySelector('[data-rev]'); b.disabled = true;
    let r; try { r = await api('docRevisar', o); } catch (e) { b.disabled = false; return toast(e.message, 5000); } b.disabled = false;
    if (r.faltan.length) return toast('Faltan datos: ' + r.faltan.join(', '), 6000);
    revisar(node, p, f, o, r);
  };
  falta(); window.Agente.bajar();
}

// ---------- 5. revisar y enviar ----------
function revisar(node, p, f, o, r) {
  const pie = node.querySelector('.ga-foot');
  const conf = document.createElement('div'); conf.className = 'ga-conf';
  conf.innerHTML = `<div class="ga-conf-h">${icon('alert', 15)}<b>Revisa antes de enviar a firmar</b></div>
    <ul>${r.firmantes.map((s) => `<li><b>${esc(s.titulo)}:</b> ${esc(s.nombre)}${s.rut ? ' · ' + esc(s.rut) : ''}${s.email ? ' · ' + esc(s.email) : ''}</li>`).join('')}</ul>
    ${o.negocioId ? `<p class="muted small">Queda ligado al negocio ${esc(f.negocio.titulo)} (${esc(f.negocio.etapa)}).</p>` : ''}
    <p class="ga-cobro">Se cobra del saldo de Portalfirma y cada firmante recibe su enlace para firmar.</p>
    <div class="ga-foot"><span class="spacer"></span><button class="ghost small" data-edit>Volver a editar</button><button class="primary" data-send>${icon('sign', 15)} Confirmar y enviar a firmar</button></div>`;
  pie.replaceWith(conf); node.querySelectorAll('input,select').forEach((i) => (i.disabled = true));
  conf.querySelector('[data-edit]').onclick = () => { node.querySelectorAll('input,select').forEach((i) => (i.disabled = false)); conf.replaceWith(pie); };
  conf.querySelector('[data-send]').onclick = async () => {
    const b = conf.querySelector('[data-send]'); b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Generando y enviando…'; conf.querySelector('[data-edit]').disabled = true;
    let res; try { res = await api('docGenerar', o); } catch (e) { b.disabled = false; b.innerHTML = `${icon('sign', 15)} Confirmar y enviar a firmar`; conf.querySelector('[data-edit]').disabled = false; return toast(e.message, 6000); }
    cerrar(node, 'sign', `<b>${esc(f.plantilla.nombre)}</b> · ${esc(p.codigo)} enviado a firmar`);
    resultado(res, p); window.AssetRefrescar?.();
  };
  window.Agente.bajar();
}

// ---------- 6. seguimiento ----------
function filaFirmante(s) { return `<div class="ga-fi" data-rut="${esc(cleanRut(s.rut))}" data-nom="${esc(norm(s.nombre))}"><span class="ga-av">${esc((s.nombre || '?').trim()[0] || '?')}</span><span><b>${esc(s.nombre)}</b><small>${esc([s.rol, s.rut].filter(Boolean).join(' · '))}</small></span><i class="im-st res">Pendiente</i></div>`; }
async function actualizarEstado(node, op, silencioso) {
  let r; try { r = await api('docSeguimiento', op); } catch (e) { if (!silencioso) toast(e.message, 5000); return; }
  const [t, c] = EST[r.estado] || EST.en_firma; const chip = node.querySelector('[data-est-op]'); if (chip) { chip.className = 'im-st ' + c; chip.textContent = t; }
  for (const s of r.firmantes) { const row = node.querySelector(`.ga-fi[data-rut="${cleanRut(s.rut)}"]`) || [...node.querySelectorAll('.ga-fi')].find((x) => x.dataset.nom && norm(s.nombre).includes(x.dataset.nom.split(' ')[0])); const i = row?.querySelector('i'); if (i) { i.className = 'im-st ' + (s.firmo ? 'ok' : 'res'); i.textContent = s.firmo ? 'Firmó' : 'Pendiente'; } }
  const pr = node.querySelector('[data-prog]'); if (pr) pr.textContent = `${r.firmados} de ${r.total} firmaron`;
  return r;
}
function resultado(r, p) {
  const op = r.operacion;
  const node = card('ga-res', `<div class="ga-res-h"><span class="ga-big ok">${icon('check', 20)}</span><div><b>Enviado a firmar</b><small>${esc(r.plantilla)} · ${esc(p.codigo)}</small></div><span class="spacer"></span>${op ? `<span class="ga-opn">Operación <b>${op}</b></span>` : ''}</div>
    <div class="ga-firm"><div class="ga-firm-h"><b>Firmantes</b><span class="muted small" data-prog></span><i class="im-st wait" data-est-op>En firma</i></div>${r.firmantes.map(filaFirmante).join('')}</div>
    ${r.negocio ? `<p class="ga-nota">${icon('briefcase', 13)} ${esc(r.negocio)}</p>` : ''}
    <p class="muted small">Mientras firman, sigue el trámite aquí, pregúntale al Agente o ábrelo en el panel de Operaciones: el chat queda a tu lado.</p>
    <div class="ga-btns"><button class="primary" data-ops ${op ? '' : 'disabled'}>${icon('listCheck', 15)} Seguir en Operaciones</button><button class="secondary" data-est ${op ? '' : 'disabled'}>${icon('rotateR', 15)} Ver estado ahora</button>
      <button class="secondary" data-ask ${op ? '' : 'disabled'}>${icon('sparkle', 15)} Preguntar al Agente</button><button class="ghost" data-ficha>${icon('house', 15)} Ver la ficha</button></div>`);
  node.querySelector('[data-ops]').onclick = () => operaciones(op);
  node.querySelector('[data-est]').onclick = () => actualizarEstado(node, op);
  node.querySelector('[data-ask]').onclick = () => window.Agente.enviar(`¿Cómo va la firma de la operación ${op}? ¿Quién falta?`);
  node.querySelector('[data-ficha]').onclick = () => { window.Agente.acoplar(); window.Inmo.abrirFicha(p.id); };
  node.dataset.resumen = `${r.plantilla} · ${p.codigo} enviado a firmar${op ? ' (operación ' + op + ')' : ''}`;
  window.Agente.tarjeta(node); if (op) window.Agente.contexto({ tipo: 'operacion', op, propId: p.id }); window.Agente.festejo?.();
}
// Panel de Operaciones (de Studio) con el chat acoplado al lado
async function operaciones(op) {
  window.Agente.acoplar(); show('ops'); await window.Operaciones.open();
  if (op) window.Operaciones.select(Number(op));
}
// Documentos enviados a firmar desde las propiedades (todos o los de una)
async function firmas(propId) {
  await cargar();
  const l = IM.data.propiedades.filter((p) => !propId || p.id === propId).flatMap((p) => (p.firmas || []).map((f) => ({ ...f, p }))).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 15);
  const node = card('ga-fl', `${head(null, 'Documentos en firma', propId ? esc(l[0]?.p.codigo || '') : 'Lo último que enviaste a firmar desde tus propiedades')}
    ${l.length ? `<div class="ga-fl-l">${l.map((f) => { const [t, c] = EST[f.estado] || EST.en_firma; return `<div class="ga-flr" data-op="${f.operacion || ''}"><span class="ga-aic">${icon('sign', 15)}</span><span class="ga-flt"><b>${esc(f.plantilla)}</b><small>${esc(f.p.codigo)} · ${fmtF(f.fecha)}${f.operacion ? ' · operación ' + f.operacion : ''} · ${esc(f.firmantes.map((s) => s.nombre).join(', '))}</small></span><i class="im-st ${c}" data-est-op>${t}</i>${f.operacion ? `<button class="ghost small" data-ver title="Ver estado">${icon('rotateR', 14)}</button><button class="secondary small" data-ops>Operaciones</button>` : ''}</div>`; }).join('')}</div>`
    : '<p class="muted small">Todavía no hay documentos enviados desde Asset. Usa «Generar un documento».</p>'}`);
  node.querySelectorAll('.ga-flr').forEach((row) => { const op = Number(row.dataset.op); row.querySelector('[data-ops]')?.addEventListener('click', () => operaciones(op));
    row.querySelector('[data-ver]')?.addEventListener('click', async () => { const r = await actualizarEstado(row, op); if (r) toast(`Operación ${op}: ${r.firmados} de ${r.total} firmaron.`); }); });
  window.Agente.tarjeta(node, { usuario: 'Seguimiento de firmas' });
}

// ---------- agendar (acción fija: solo agenda, nunca genera documentos) ----------
// después de agendar (en Asset o en el calendario de reservas): hito del negocio y vuelta al flujo de la propiedad
async function trasAgendar(e, h, propId) {
  window.AssetRefrescar?.();
  if (h?.movido) { window.Agente.decir(`Hito registrado: el negocio de ${primer(h.cliente) || 'tu cliente'} pasó a «Visita».`); window.Agente.festejo?.(); }
  if (propId) {
    await estado(propId);
    const sg = [];
    if (/visita/i.test(e.tipo) && (e.personas || []).length) sg.push({ label: `Confirmar por WhatsApp a ${primer(e.personas[0]?.nombre || e.personas[0]) || 'el cliente'}`, accion: { tipo: 'confirmar', eventoId: e.id } });
    if (h?.movido) sg.push({ label: 'Dejarlo en «Interesado»', accion: { tipo: 'mover', negocioId: h.negocioId, etapa: 'interes' } });
    if (sg.length) window.Agente.sugerencias(sg);
  } else { window.Agente.contexto({ tipo: 'agenda', fecha: e.fecha }); window.Agente.sugerir(['otra'], { eventoId: e.id }); }
}
// ---------- confirmar la visita por WhatsApp: mensaje listo (editable) con día, hora y dirección ----------
async function confirmar(eventoId, personaId) {
  let r; try { r = await api('estConfirmacion', eventoId, personaId || null); } catch (e) { return toast(e.message, 5000); }
  const ev = await api('agendaObtener', eventoId).catch(() => null); const ps = ev?.personas || [];
  const node = card('ga-wa', `${head(null, 'Confirmar por WhatsApp', r.automatico ? 'Se envía desde el WhatsApp de tu cuenta de wechatia, sin salir de Asset' : 'Se abre WhatsApp con el mensaje listo: tú lo envías')}
    ${ps.length > 1 ? `<label class="ga-wal"><span>Para</span><select data-per>${ps.map((c) => `<option value="${esc(c.id)}" ${r.persona?.id === c.id ? 'selected' : ''}>${esc(c.nombre)}${c.telefono ? ' · ' + esc(c.telefono) : ' · sin celular'}</option>`).join('')}</select></label>` : ''}
    <div data-tel></div>
    <textarea data-txt rows="4">${esc(r.texto)}</textarea>
    ${r.enviada ? `<p class="muted small">${icon('check', 12)} Ya se envió una confirmación el ${esc(new Date(r.enviada.fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }))}. Puedes mandarla de nuevo.</p>` : ''}
    <div class="ga-foot"><span class="ga-falta"></span><span class="spacer"></span><button class="ghost" data-cancel>Cancelar</button>${r.automatico ? `<button class="secondary" data-abrir title="Abre WhatsApp con el mensaje para enviarlo tú">Abrir en mi WhatsApp</button>` : ''}<button class="primary ga-wab" data-ok>${icon('whatsapp', 15)} ${r.automatico ? 'Enviar por WhatsApp' : 'Abrir WhatsApp'}</button></div>`);
  const falta = (t) => { node.querySelector('.ga-falta').innerHTML = t ? `${icon('alert', 13)} ${t}` : ''; };
  const pintarTel = () => {
    const box = node.querySelector('[data-tel]');
    box.innerHTML = r.whatsapp ? '' : `<label class="ga-wal"><span>Celular de ${esc(primer(r.persona?.nombre) || 'la persona')}</span><span class="ga-inl"><input data-cel placeholder="+56 9 1234 5678" /><button class="secondary small" data-gcel>Guardar</button></span></label>`;
    box.querySelector('[data-gcel]')?.addEventListener('click', async () => {
      const t = box.querySelector('[data-cel]').value.trim(); if (String(t).replace(/\D/g, '').length < 8) return falta('Escribe el celular con su código, por ejemplo +56 9 1234 5678.');
      try { await cargar(); const c = IM.data.personas.find((x) => x.id === r.persona.id); await api('inmoPerGuardar', { ...c, telefono: t }); r = await api('estConfirmacion', eventoId, c.id); node.querySelector('[data-txt]').value = r.texto; falta(''); pintarTel(); toast('Celular guardado en su ficha.'); } catch (e) { falta(esc(e.message)); }
    });
  };
  pintarTel();
  node.querySelector('[data-per]')?.addEventListener('change', async (e) => { r = await api('estConfirmacion', eventoId, e.target.value); node.querySelector('[data-txt]').value = r.texto; falta(''); pintarTel(); });
  node.querySelector('[data-cancel]').onclick = () => window.Agente.quitar(node);
  const enviar = async (modo, btn) => {
    if (!r.whatsapp) return falta(`${esc(primer(r.persona?.nombre) || 'La persona')} no tiene celular: escríbelo arriba.`);
    const bs = node.querySelectorAll('[data-ok],[data-abrir]'); bs.forEach((b) => (b.disabled = true)); const t0 = btn.innerHTML; if (modo === 'auto') btn.innerHTML = `${icon('whatsapp', 15)} Enviando…`; falta('');
    try {
      const x = await api('estConfirmar', eventoId, r.persona?.id || null, node.querySelector('[data-txt]').value, modo);
      const est = { delivered: 'entregado', read: 'leído', sent: 'enviado', enviado: 'enviado', pending: 'en camino' }[x.envio?.estado] || 'enviado';
      cerrar(node, 'whatsapp', x.automatico ? `Confirmación enviada por WhatsApp a <b>${esc(x.persona?.nombre || '')}</b> · ${est}${x.envio?.creado ? ' · se creó su contacto en wechatia' : ''}` : `Confirmación por WhatsApp a <b>${esc(x.persona?.nombre || '')}</b> · se abrió WhatsApp con el mensaje`);
      if (ev?.propId) window.Agente.sugerencias([{ label: 'Ver estado de la propiedad', accion: { tipo: 'estadoProp', propId: ev.propId } }]);
      window.AssetRefrescar?.(); window.Lienzo?.refrescar?.();
    } catch (er) { bs.forEach((b) => (b.disabled = false)); btn.innerHTML = t0; falta(esc(er.message)); node.querySelector('[data-abrir]')?.classList.add('ga-pulso'); }
  };
  node.querySelector('[data-ok]').onclick = (e) => enviar(r.automatico ? 'auto' : 'abrir', e.currentTarget);
  node.querySelector('[data-abrir]')?.addEventListener('click', (e) => enviar('abrir', e.currentTarget));
  window.Agente.tarjeta(node, { usuario: 'Confirmar visita por WhatsApp' });
}
const MODO_K = 'pf.agendarModo';
const modoGuardado = () => { try { return localStorage.getItem(MODO_K); } catch { return null; } };
async function agendar(pre = {}) {
  await cargar();
  const props = IM.data.propiedades.filter((p) => !p.archivada); const man = new Date(Date.now() + 864e5); const f0 = new Date(man.getTime() - man.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const pers = () => [...IM.data.personas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const TIPOS = [['visita', 'Visita'], ['reunion', 'Reunión'], ['llamada', 'Llamada'], ['firma', 'Firma'], ['tarea', 'Tarea']];
  let res = await api('resEstado').catch(() => null);
  let tipo = pre.tipo || 'visita'; let modo = pre.fecha ? 'asset' : (modoGuardado() || (res?.conectado ? 'res' : 'asset'));
  const node = card('ga-agd', `${head(null, 'Agendar', 'Solo queda en tu agenda: no genera documentos ni cobra')}
    <div class="ga-agt"><div class="ga-chips" data-tipo>${TIPOS.map(([k, t]) => `<button data-t="${k}" class="${tipo === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="ga-seg" data-modo><button data-m="res">${icon('calendar', 13)} Calendario de reservas</button><button data-m="asset">${icon('clock', 13)} Rápido en Asset</button></div></div>
    <div class="ga-fs">
      <label><span>Propiedad</span><select data-f="prop"><option value="">— Sin propiedad —</option>${props.map((p) => `<option value="${esc(p.id)}" ${pre.propId === p.id ? 'selected' : ''}>${esc(p.codigo)} · ${esc(p.titulo.slice(0, 40))}</option>`).join('')}</select></label>
      <label><span>Con quién</span><span class="ga-inl"><select data-f="per"><option value="">— Nadie por ahora —</option>${pers().map((c) => `<option value="${esc(c.id)}" ${pre.personaId === c.id ? 'selected' : ''}>${esc(c.nombre)} · ${esc(c.rut)}</option>`).join('')}</select><button class="ghost small" data-nueva title="Persona nueva">${icon('plus', 14)}</button></span></label>
      <label data-solo="asset"><span>Día</span><input type="date" data-f="fecha" value="${esc(pre.fecha || f0)}" /></label>
      <label data-solo="asset"><span>Hora</span><input type="time" data-f="hora" value="${esc(pre.hora || '11:00')}" /></label>
      <label class="s2" data-solo="asset"><span>Notas <i>(opcional)</i></span><input data-f="notas" placeholder="Ej.: llevar llaves, conserje avisado" /></label>
    </div>
    <div class="ga-res" data-solo="res"></div>
    <div class="ga-foot"><span class="ga-falta"></span><span class="spacer"></span><button class="ghost" data-cancel>Cancelar</button>
      <button class="primary" data-ok data-solo="asset">${icon('calendar', 15)} Agendar</button><button class="primary" data-listo data-solo="res">${icon('check', 15)} Listo, ya reservé</button></div>`);
  const v = (k) => node.querySelector(`[data-f="${k}"]`).value; const falta = (t) => { node.querySelector('.ga-falta').innerHTML = t ? `${icon('alert', 13)} ${t}` : ''; };
  let abierto = 0;
  // el widget del calendario, con los datos del cliente ya puestos (si el calendario los acepta)
  const pintarRes = () => {
    const box = node.querySelector('.ga-res'); const c = IM.data.personas.find((x) => x.id === v('per')); const p = IM.data.propiedades.find((x) => x.id === v('prop'));
    const [nom, ...ape] = String(c?.nombre || '').split(/\s+/);
    const q = new URLSearchParams(Object.entries({ first_name: c ? nom : '', last_name: ape.join(' '), email: c?.email || '', phone: c?.telefono || '', notes: p ? `Visita ${p.codigo} · ${[p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ')}` : '' }).filter(([, x]) => x)).toString();
    abierto = Date.now();
    box.innerHTML = `<div class="ga-resh">${res?.conectado ? `<span class="ok">${icon('check', 12)} Conectado${res.calendario ? ': ' + esc(res.calendario) : ''}. La reserva llega sola a tu agenda.</span>` : `<span class="warn">${icon('alert', 12)} Sin conectar: después de reservar, anota la hora en «Rápido en Asset».</span>`}<a href="#" data-conf>${res?.conectado ? 'Configurar' : 'Conectar'}</a></div>
      <div class="ga-resf"><iframe src="${esc(res?.url || '')}${q ? '?' + esc(q) : ''}" title="Calendario de reservas" allow="payment" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    box.querySelector('[data-conf]').onclick = (e) => { e.preventDefault(); configurar(); };
  };
  const configurar = () => {
    const box = node.querySelector('.ga-res');
    box.innerHTML = `<div class="ga-resc"><b>Calendario de reservas (wechatia)</b>
      <label><span>Código o dirección del widget</span><input data-c="w" value="${esc(res?.widget || '')}" placeholder="Pega aquí el &lt;iframe…&gt; o la dirección …/widget/booking/…" spellcheck="false" /></label>
      <label><span>Clave de la API ${res?.conectado ? '<i>(ya guardada; escribe una nueva para cambiarla)</i>' : ''}</span><input data-c="t" type="password" autocomplete="off" spellcheck="false" placeholder="Integración privada de wechatia (pit-…)" /></label>
      <small>En wechatia: Configuración › Integraciones privadas › crear, con permisos de <b>calendarios y eventos</b> y <b>contactos</b> (solo lectura). La clave queda cifrada en este computador.</small>
      <p class="ga-falta" data-ce></p>
      <span class="ga-inl">${res?.conectado ? '<button class="ghost small" data-quitar>Desconectar</button>' : ''}<span class="spacer"></span><button class="secondary small" data-volver>Volver</button><button class="primary small" data-guardar>Guardar</button></span></div>`;
    box.querySelector('[data-volver]').onclick = pintarRes;
    box.querySelector('[data-quitar]')?.addEventListener('click', async () => { res = await api('resConfigurar', { token: '' }); pintarRes(); toast('Calendario desconectado.'); });
    box.querySelector('[data-guardar]').onclick = async (ev) => {
      const w = box.querySelector('[data-c="w"]').value.trim(); const t = box.querySelector('[data-c="t"]').value.trim(); ev.target.disabled = true;
      try { res = await api('resConfigurar', { ...(w ? { widget: w } : {}), ...(t ? { token: t } : {}) }); box.querySelector('[data-c="t"]').value = ''; toast(res.conectado ? 'Calendario conectado.' : 'Calendario guardado.'); pintarRes(); }
      catch (er) { ev.target.disabled = false; box.querySelector('[data-ce]').innerHTML = `${icon('alert', 13)} ${esc(er.message)}`; }
    };
  };
  const aplicarModo = () => {
    if (tipo !== 'visita' && modo === 'res') modo = 'asset';
    node.querySelector('[data-modo]').classList.toggle('hidden', tipo !== 'visita');
    node.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === modo));
    node.querySelectorAll('[data-solo]').forEach((x) => x.classList.toggle('hidden', x.dataset.solo !== modo));
    falta(''); if (modo === 'res') pintarRes();
  };
  node.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { tipo = b.dataset.t; node.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); aplicarModo(); }));
  node.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { modo = b.dataset.m; try { localStorage.setItem(MODO_K, modo); } catch { /* sin almacenamiento */ } aplicarModo(); }));
  node.querySelector('[data-f="per"]').addEventListener('change', () => { if (modo === 'res') pintarRes(); });
  node.querySelector('[data-f="prop"]').addEventListener('change', () => { if (modo === 'res') pintarRes(); });
  node.querySelector('[data-nueva]').onclick = (e) => { e.preventDefault(); window.Inmo.formPersona(null, { rol: 'interesado', despues: async (c) => { await cargar(); const s = node.querySelector('[data-f="per"]'); s.insertAdjacentHTML('beforeend', `<option value="${esc(c.id)}">${esc(c.nombre)} · ${esc(c.rut)}</option>`); s.value = c.id; if (modo === 'res') pintarRes(); } }); };
  node.querySelector('[data-cancel]').onclick = () => window.Agente.quitar(node);
  // reservado en el calendario: Asset la trae y la liga a la propiedad, el cliente y el negocio
  node.querySelector('[data-listo]').onclick = async (ev) => {
    const prop = v('prop'); const per = v('per');
    if (!prop) return falta('Elige la propiedad de la visita.');
    if (!res?.conectado) { modo = 'asset'; aplicarModo(); return falta('Sin conexión al calendario: anota aquí el día y la hora que reservaste.'); }
    ev.target.disabled = true; falta('');
    try {
      const r = await api('resSincronizar', { propId: prop, personaId: per || null, negocioId: pre.negocioId || null, desde: abierto });
      if (!r.vinculada) { ev.target.disabled = false; return falta('Todavía no veo la reserva en el calendario. Termina de confirmarla en el widget y vuelve a tocar «Listo».'); }
      const e = r.vinculada; const pp = IM.data.propiedades.find((x) => x.id === prop);
      cerrar(node, 'calendar', `<b>Visita reservada</b> · ${esc(e.fecha)} ${esc(e.hora || '')}${pp ? ' · ' + esc(pp.codigo) : ''}${e.personas?.length ? ' · ' + esc(e.personas.map((x) => x.nombre).join(', ')) : ''} · calendario de reservas`);
      await trasAgendar(e, r.hito, prop);
    } catch (er) { ev.target.disabled = false; falta(esc(er.message)); }
  };
  node.querySelector('[data-ok]').onclick = async () => {
    const val = { prop: v('prop'), per: v('per'), fecha: v('fecha'), hora: v('hora'), notas: v('notas') };
    if (tipo === 'visita' && !val.prop) return falta('Una visita necesita la propiedad.');
    const b = node.querySelector('[data-ok]'); b.disabled = true;
    try {
      const r = await api('assetEjecutar', 'asset_crear_evento', { tipo, fecha: val.fecha, hora: val.hora || undefined, propiedad: val.prop || undefined, personas: val.per ? [val.per] : [], negocio: pre.negocioId || undefined, notas: val.notas || undefined });
      const e = r.evento;
      cerrar(node, 'calendar', `<b>${esc(e.tipo)} agendada</b> · ${esc(e.fecha)}${e.hora ? ' ' + esc(e.hora) : ''}${e.propiedad ? ' · ' + esc(e.propiedad) : ''}${e.personas.length ? ' · ' + esc(e.personas.join(', ')) : ''}`);
      await trasAgendar(e, r.negocio, val.prop);
    } catch (er) { console.error('agendar', er); b.disabled = false; const f = node.querySelector('.ga-falta'); if (f) f.innerHTML = `${icon('alert', 13)} ${esc(er.message)}`; else toast(er.message, 5000); }
  };
  aplicarModo();
  window.Agente.tarjeta(node, { usuario: tipo === 'visita' ? 'Agendar una visita' : 'Agendar' });
}

// ---------- documento a medida: no hay plantilla con ese nombre → Asset lo arma, lo pasa a PDF y lo envía a firmar ----------
async function docNuevo({ propId = null, titulo = '', tipoDoc = null, personaId = null, negocioId = null } = {}) {
  const node = card('ga-dn', spin(`Preparando «${titulo || 'el documento'}»…`)); window.Agente.tarjeta(node, { usuario: titulo ? `Crear «${titulo}»` : 'Crear un documento' });
  let tipo = tipoDoc; if (!tipo) { try { const b = await api('dgBuscar', { texto: titulo, propId }); tipo = b.tipo; titulo = b.titulo; } catch { tipo = 'libre'; } }
  let f; try { f = await api('dgPreparar', { tipo, titulo, propId, negocioId, personaId }); } catch (e) { node.innerHTML = `${head(null, esc(titulo))}<p class="error">${esc(e.message)}</p>`; return; }
  const S = { auto: true, ia: tipo !== 'libre', firm: f.firmantes.map((x) => ({ ...x })) };
  const campo = (c) => `<label class="${c.requerido && !c.valor ? 'falta' : ''} ${c.tipo === 'textarea' ? 's2' : ''}"><span>${esc(c.etiqueta)}${c.requerido ? '' : ' <i>(opcional)</i>'}</span>${c.tipo === 'select' ? `<select data-d="${esc(c.id)}">${c.opciones.map((o) => `<option ${o === c.valor ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : c.tipo === 'textarea' ? `<textarea data-d="${esc(c.id)}" rows="2" placeholder="Ej.: deja constancia de que el cliente desiste de la reserva y se le devuelve el dinero">${esc(c.valor)}</textarea>` : `<input data-d="${esc(c.id)}" data-req="${c.requerido ? 1 : ''}" type="${c.tipo === 'date' ? 'date' : c.tipo === 'number' ? 'number' : 'text'}" value="${esc(c.valor)}" ${c.id === 'monto' ? 'placeholder="Ej.: 350000"' : ''} />`}</label>`;
  const pers = [...f.personas].sort((a, b) => (b.rol ? 1 : 0) - (a.rol ? 1 : 0) || a.nombre.localeCompare(b.nombre, 'es'));
  const firmHtml = (x, i) => `<fieldset class="ga-g ga-dnf" data-i="${i}"><legend><label class="ga-chk"><input type="checkbox" data-firma ${x.firma ? 'checked' : ''} /> ${esc(x.titulo)}</label>${x.rol === 'corredor' ? ' <i>tus datos</i>' : ''}</legend>
    ${x.rol !== 'corredor' ? `<label class="ga-per">${icon('user', 13)} Persona<select data-per><option value="">Persona nueva (escribe sus datos)</option>${pers.map((c) => `<option value="${esc(c.id)}" ${x.personaId === c.id ? 'selected' : ''}>${esc(c.nombre)} · ${esc(c.rut)}${c.rol ? ' · ' + esc(c.rol) : ''}</option>`).join('')}</select></label>` : ''}
    <div class="ga-fs">${[['alias', 'Rol en el documento'], ['nombre', 'Nombre'], ['rut', 'RUT'], ['email', 'Correo'], ['telefono', 'Celular']].map(([k, l]) => `<label class="${x[k] ? '' : 'falta'}"><span>${l}</span><input data-k="${k}" value="${esc(x[k] || '')}" ${k === 'telefono' ? 'placeholder="+56 9 …"' : k === 'alias' ? 'placeholder="pagador, visitante, arrendatario…"' : ''} /></label>`).join('')}</div></fieldset>`;
  node.className = 'ga ga-form ga-dn';
  node.innerHTML = `${head(null, `Crear «${esc(f.titulo)}» con Asset`, `${f.propiedad ? esc(f.propiedad.codigo) + ' · ' : ''}No hay una plantilla con ese nombre en tu cuenta: Asset lo arma en PDF con estos datos y lo envía a firmar.`)}
    <label class="ga-dnt"><span>Título del documento</span><input data-titulo value="${esc(f.titulo)}" /></label>
    ${f.campos.length ? `<fieldset class="ga-g"><legend>Datos</legend><div class="ga-fs">${f.campos.map(campo).join('')}</div></fieldset>` : ''}
    <div class="ga-dnfs">${S.firm.map(firmHtml).join('')}</div>
    <div class="ga-dntx"><div class="ga-dnth"><b>Texto del documento</b><small data-modo></small><span class="spacer"></span>${tipo === 'libre' ? `<button class="secondary small" data-ia>${icon('sparkle', 13)} Redactar con IA</button>` : '<button class="ghost small hidden" data-auto>Volver al texto automático</button>'}</div>
      <textarea data-texto rows="9" placeholder="${tipo === 'libre' ? 'Pulsa «Redactar con IA» o escríbelo tú. Separa los párrafos con una línea en blanco.' : ''}"></textarea></div>
    ${f.negocio?.pideFirma ? `<label class="ga-neg"><input type="checkbox" data-neg checked /> Ligar a la etapa «${esc(f.negocio.etapa)}» del negocio ${esc(f.negocio.titulo)}: cuando se firme, avanza solo.</label>` : ''}
    <p class="ga-nota">${icon('alert', 13)} Revisa el texto antes de enviarlo: Asset lo arma con tus datos, pero no reemplaza la revisión de un abogado.</p>
    <div class="ga-foot"><span class="ga-falta"></span><span class="spacer"></span><button class="ghost small" data-pdf>${icon('file', 14)} Ver PDF</button><button class="primary" data-rev>${icon('sign', 15)} Revisar y enviar a firmar</button></div>`;
  const $n = (q) => node.querySelector(q); const tx = $n('[data-texto]');
  const datos = () => { const d = {}; node.querySelectorAll('[data-d]').forEach((i) => { d[i.dataset.d] = i.value.trim(); }); return d; };
  const firmantes = () => [...node.querySelectorAll('.ga-dnf')].map((fs) => { const x = { ...S.firm[Number(fs.dataset.i)] }; x.firma = fs.querySelector('[data-firma]').checked; fs.querySelectorAll('[data-k]').forEach((i) => { x[i.dataset.k] = i.value.trim(); }); const sel = fs.querySelector('[data-per]'); x.personaId = sel ? sel.value || null : null; return x; });
  const parrafos = () => tx.value.split(/\n\s*\n/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const modo = () => { $n('[data-modo]').textContent = tipo === 'libre' ? (S.iaHecha ? 'Redactado con IA · puedes editarlo' : '') : S.auto ? 'Automático: se actualiza con los datos' : 'Editado por ti'; $n('[data-auto]')?.classList.toggle('hidden', S.auto); };
  const objeto = () => ({ tipo, titulo: $n('[data-titulo]').value.trim(), propId, negocioId: $n('[data-neg]')?.checked ? f.negocio.id : null, personaId, datos: datos(), firmantes: firmantes(), parrafos: parrafos() });
  let tk = 0; const regenerar = async () => { if (tipo === 'libre' || !S.auto) return; const my = ++tk; try { const r = await api('dgRedactar', objeto()); if (my === tk && S.auto) { tx.value = r.parrafos.join('\n\n'); falta(); } } catch {} };
  const falta = () => { let n = 0;
    node.querySelectorAll('[data-d][data-req="1"]').forEach((i) => { const m = !i.value.trim(); i.parentElement.classList.toggle('falta', m); if (m) n++; });
    node.querySelectorAll('.ga-dnf').forEach((fs) => { const on = fs.querySelector('[data-firma]').checked; fs.classList.toggle('off', !on); fs.querySelectorAll('[data-k]').forEach((i) => { const m = on && !i.value.trim(); i.parentElement.classList.toggle('falta', m); if (m) n++; }); });
    if (!parrafos().length) n++; const hueco = /____/.test(tx.value);
    $n('.ga-falta').innerHTML = n ? `${icon('alert', 13)} Faltan ${n} ${n === 1 ? 'dato' : 'datos'}` : hueco ? `${icon('alert', 13)} Completa los «____» del texto` : `<span class="ok">${icon('check', 13)} Todo completo</span>`; return n + (hueco ? 1 : 0); };
  let h; const cambio = () => { falta(); clearTimeout(h); h = setTimeout(regenerar, 250); };
  node.querySelectorAll('[data-d], [data-k], [data-firma], [data-titulo]').forEach((i) => i.addEventListener('input', cambio));
  node.querySelectorAll('[data-d], [data-firma]').forEach((i) => i.addEventListener('change', cambio));
  node.querySelectorAll('[data-per]').forEach((sel) => sel.addEventListener('change', () => { const c = f.personas.find((x) => x.id === sel.value); const fs = sel.closest('.ga-dnf'); fs.querySelectorAll('[data-k]').forEach((i) => { i.value = c ? c[i.dataset.k] || '' : ''; }); S.firm[Number(fs.dataset.i)].personaId = c?.id || null; cambio(); }));
  tx.addEventListener('input', () => { if (tipo !== 'libre' && S.auto) { S.auto = false; modo(); } falta(); });
  $n('[data-auto]')?.addEventListener('click', () => { S.auto = true; modo(); regenerar(); });
  $n('[data-ia]')?.addEventListener('click', async (e) => { const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Redactando…';
    try { const r = await api('dgRedactar', objeto()); tx.value = r.parrafos.join('\n\n'); S.iaHecha = true; modo(); falta(); if (r.tokens) window.Asistente?.actualizarTokens?.(r.tokens); } catch (er) { toast(er.message, 6000); }
    b.disabled = false; b.innerHTML = `${icon('sparkle', 13)} ${S.iaHecha ? 'Redactar de nuevo' : 'Redactar con IA'}`; });
  $n('[data-pdf]').onclick = async (e) => { const b = e.currentTarget; if (!parrafos().length) return toast('Primero el texto del documento.'); b.disabled = true; try { await api('dgVista', objeto()); toast('Se abrió el PDF de borrador.'); } catch (er) { toast(er.message, 5000); } b.disabled = false; };
  $n('[data-rev]').onclick = () => { if (falta()) { node.querySelector('.falta input, .falta select')?.focus(); return toast('Completa los datos marcados.'); } confirmarDoc(node, objeto(), f); };
  await regenerar(); modo(); falta(); window.Agente.bajar();
}
function confirmarDoc(node, o, f) {
  const pie = node.querySelector('.ga-foot'); let pag = ''; try { pag = localStorage.getItem('pf.pagador') || ''; } catch {} pag ||= o.firmantes.find((x) => x.rol === 'corredor')?.email || '';
  const conf = document.createElement('div'); conf.className = 'ga-conf';
  conf.innerHTML = `<div class="ga-conf-h">${icon('alert', 15)}<b>Revisa antes de enviar a firmar</b></div>
    <ul><li><b>Documento:</b> ${esc(o.titulo)}${f.propiedad ? ' · ' + esc(f.propiedad.codigo) : ''} (PDF de Asset)</li>${o.firmantes.filter((x) => x.firma).map((x) => `<li><b>${esc(x.titulo)}</b> (${esc(x.alias)}): ${esc(x.nombre)} · ${esc(x.rut)} · ${esc(x.email)}</li>`).join('')}</ul>
    <label class="ga-wal"><span>Correo del pagador (tu cuenta)</span><input data-pag type="email" value="${esc(pag)}" placeholder="pagos@empresa.cl" /></label>
    <p class="ga-cobro">Se sube el PDF a Portalfirma, se cobra del saldo y cada firmante recibe su enlace. Queda guardado en la ficha de la propiedad y en la de cada firmante.</p>
    <div class="ga-foot"><span class="ga-falta"></span><span class="spacer"></span><button class="ghost small" data-edit>Volver a editar</button><button class="primary" data-send>${icon('sign', 15)} Confirmar y enviar a firmar</button></div>`;
  pie.replaceWith(conf); const ctr = node.querySelectorAll('input:not([data-pag]),select,textarea,[data-pdf],[data-ia],[data-auto]'); ctr.forEach((i) => (i.disabled = true));
  conf.querySelector('[data-edit]').onclick = () => { ctr.forEach((i) => (i.disabled = false)); conf.replaceWith(pie); };
  conf.querySelector('[data-send]').onclick = async () => {
    const email = conf.querySelector('[data-pag]').value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { conf.querySelector('.ga-falta').innerHTML = `${icon('alert', 13)} Escribe el correo del pagador.`; return; }
    try { localStorage.setItem('pf.pagador', email); } catch {}
    const b = conf.querySelector('[data-send]'); b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Creando el PDF y enviando…'; conf.querySelector('[data-edit]').disabled = true;
    let res; try { res = await api('dgEnviar', { ...o, email }); } catch (e) { b.disabled = false; b.innerHTML = `${icon('sign', 15)} Confirmar y enviar a firmar`; conf.querySelector('[data-edit]').disabled = false; conf.querySelector('.ga-falta').innerHTML = `${icon('alert', 13)} ${esc(e.message)}`; return; }
    cerrar(node, 'sign', `<b>${esc(o.titulo)}</b>${f.propiedad ? ' · ' + esc(f.propiedad.codigo) : ''} creado en Asset y enviado a firmar`);
    resultado({ ...res, plantilla: o.titulo }, f.propiedad || { codigo: '', id: null }); window.AssetRefrescar?.();
    if (res.archivo) { const c = window.Agente; c.sugerencias?.([{ label: 'Ver el PDF', accion: { tipo: 'pdf', archivo: res.archivo } }]); }
  };
  window.Agente.bajar();
}
async function usarPlantilla(propId, plantillaId, nombre) { await cargar(); const p = IM.data.propiedades.find((x) => x.id === propId); if (!p) return iniciar({ destino: 'documento' }); window.Agente.contexto({ tipo: 'propiedad', id: p.id }); return formulario(p, { id: plantillaId, nombre }); }
window.Gestion = { docNuevo, usarPlantilla, agendar, confirmar, iniciar, firmas, operaciones, estado, anotar: async (propId) => { await cargar(); const p = IM.data.propiedades.find((x) => x.id === propId); if (p) anotar(p, await api('estEstado', p.id).catch(() => null)); }, documento: (propId) => iniciar({ destino: 'documento', propId }) };
})();
