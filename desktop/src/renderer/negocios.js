/* global pf, $, esc, toast, closeModal, api, icon, members, ir, IM, precio, fecha, foto, fmtN, formPersona, cargar, abrirFicha, liberar */
'use strict';
// Negocios: tablero por etapas (venta y arriendo), ficha del negocio con tareas, firmas y próxima acción.
// Pensado para usarse sin capacitación: arrastrar una tarjeta mueve el negocio; cada etapa dice qué falta.

const NG = { tipo: 'venta', datos: null, actual: null }; // la ficha y «Nuevo negocio»; los filtros del tablero están en el store de React
const NG_TIPO = { venta: 'Venta', arriendo: 'Arriendo' };
const NG_CLIENTE = { venta: 'Comprador', arriendo: 'Arrendatario' };
const ngMonto = (v, m) => (v == null ? '—' : precio({ valor: Math.round(v * 100) / 100, moneda: m || 'UF' }));
const ngHoy = () => new Date().toISOString().slice(0, 10);
const ngDias = (n) => (n <= 0 ? 'hoy' : n === 1 ? 'hace 1 día' : `hace ${n} días`);
const ngIni = (s) => esc(String(s || '?').trim()[0] || '?');

async function ngCargar() { NG.datos = await api('negListar'); return NG.datos; }

// ---------- tablero ----------
// Está en React: src/ui/components/functional/negocios/Negocios.tsx (filtros, arrastrar y revisión de firmas).
// Se vuelve a montar al abrirlo, así los datos siempre están al día. La ficha del negocio se dibuja en el
// mismo contenedor, por eso antes desmonta React (liberar, en inmo.js).
async function abrirNegocios(opts = {}) {
  NG.actual = null; ir('negocios');
  const el = $('#view-negocios'); liberar(el); window.ReactUI.montar('Negocios', el, { tipo: opts.tipo });
  try { await ngCargar(); } catch {} // NG.datos (etapas) para la ficha y «Nuevo negocio»
}
async function ngMover(id, etapa, alVolver) {
  try { const r = await api('negMover', id, etapa); toast([`Negocio en «${r.negocio.etapaInfo.t}».`, ...r.mensajes].join(' '), 4500); await ngCargar(); alVolver ? alVolver() : abrirNegocios(); }
  catch (e) { toast(e.message, 5000); }
}

// ---------- nuevo negocio ----------
function nuevoNegocio(pre = {}) {
  const tipo = pre.tipo || NG.tipo || 'venta';
  const props = IM.data.propiedades.filter((p) => !p.archivada && (tipo === 'venta' ? p.venta : p.arriendo));
  const pers = [...IM.data.personas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const p0 = props.find((p) => p.id === pre.propId) || null;
  const et = (NG.datos?.etapas || {})[tipo] || [];
  const vez = (NG.vez = (NG.vez || 0) + 1); // cada llamada parte el formulario de nuevo, como cuando se volvía a dibujar
  window.Ventanas.abrir('negocios.nuevo', {
    vez, tipo, hoy: ngHoy(), propId: p0?.id || '', clienteId: pers.some((c) => c.id === pre.clienteId) ? pre.clienteId : '', etapa: pre.etapa || '',
    etapas: et.map((e) => ({ id: e.id, t: e.t })),
    propiedades: props.map((p) => ({ id: p.id, texto: `${p.codigo} · ${p.titulo.slice(0, 46)}`, precio: (tipo === 'venta' ? p.precioVenta : p.precioArriendo) || null })),
    personas: pers.map((c) => ({ id: c.id, texto: `${c.nombre} · ${c.rut}` })),
    alCambiarTipo: (leido) => nuevoNegocio(leido),
    alCrearPersona: (guardado) => formPersona(null, { rol: tipo === 'venta' ? 'comprador' : 'arrendatario', despues: async (c) => { await cargar(); nuevoNegocio({ ...guardado, clienteId: c.id }); } }),
    // si falla, la ventana muestra el error (antes, #nnErr)
    alGuardar: async (o) => { const n = await api('negGuardar', o); closeModal(); toast('Negocio creado.'); NG.tipo = n.tipo; await cargar(); abrirNegocio(n.id); },
  }, { clave: 'modal-44', ancho: true });
}

// ---------- ficha del negocio ----------
async function abrirNegocio(id) {
  NG.actual = id; const tok = ir('negocios');
  let n; try { n = await api('negObtener', id); } catch (e) { toast(e.message, 4000); return abrirNegocios(); }
  NG.tipo = n.tipo; await ngCargar(); if (tok !== IM.tok) return; // siempre al día y en la pestaña de su tipo (venta/arriendo)
  const et = NG.datos.etapas[n.tipo]; const e = n.etapaInfo; const f = n.firmas?.[n.etapa] || null;
  const abierto = n.estado === 'abierto'; const sig = et[n.orden + 1];
  const tareas = (e.tareas || []).map((t, i) => `<label class="ng-task"><input type="checkbox" data-task="${i}" ${n.tareas?.[n.etapa]?.[i] ? 'checked' : ''} ${abierto ? '' : 'disabled'} /> <span>${esc(t)}</span></label>`).join('');
  const bloqueFirma = !e.firma ? '' : f?.estado === 'firmado'
    ? `<div class="ng-fb ok">${icon('check', 18)}<div><b>${esc(e.firma)} firmado</b><small>${f.fuera ? 'Firmado fuera de Asset' : 'Operación ' + f.operacion} · ${fecha(f.firmado, true)}</small></div></div>`
    : f?.operacion
      ? `<div class="ng-fb wait">${icon('sign', 18)}<div><b>${esc(e.firma)}: en firma</b><small>Operación ${f.operacion}${f.total ? ` · ${f.firmados} de ${f.total} firmas` : ''}${f.revisado ? ' · revisado ' + fecha(f.revisado, true) : ''}${f.error ? ' · ' + esc(f.error) : ''}</small></div><span class="spacer"></span><button class="secondary small" id="ngRev">Revisar ahora</button><button class="ghost small" id="ngOp">Ver operación</button><button class="ghost small" id="ngFq" title="Desvincular">${icon('x', 14)}</button></div>`
      : `<div class="ng-fb need">${icon('sign', 18)}<div><b>Falta firmar: ${esc(e.firma)}</b><small>Al quedar firmado, el negocio pasa solo a la siguiente etapa.</small></div><span class="spacer"></span><button class="primary small" id="ngEnv" ${abierto ? '' : 'disabled'}>Enviar a firmar</button><button class="ghost small" id="ngVin" ${abierto ? '' : 'disabled'}>Ya lo envié</button></div>`;
  const firmasTodas = et.filter((x) => x.firma).map((x) => { const y = n.firmas?.[x.id]; return `<div class="ng-fl"><span class="ng-dot ${y?.estado === 'firmado' ? 'ok' : y?.operacion ? 'wait' : ''}"></span><span>${esc(x.firma)}</span><small>${y?.estado === 'firmado' ? 'Firmado' : y?.operacion ? `En firma · op. ${y.operacion}` : 'Pendiente'}</small></div>`; }).join('');
  const host = liberar($('#view-negocios'));
  host.innerHTML = `<div class="im-wrap im-ficha ng-ficha">
    <div class="im-fh"><button class="ghost" id="ngBack">${icon('chevL', 16)} Negocios</button><span class="spacer"></span>${abierto ? '' : '<button class="secondary" id="ngReab">Reabrir</button>'}<button class="ghost" id="ngDel" title="Eliminar negocio">${icon('trash', 15)}</button></div>
    <div class="im-ft"><small class="im-code">${NG_TIPO[n.tipo]} · ${esc(n.prop?.codigo || '')}</small><h1>${esc(n.prop?.titulo || 'Negocio')}</h1>
      <p class="muted">${esc(NG_CLIENTE[n.tipo])}: <b>${esc(n.cliente?.nombre || '—')}</b>${n.valor ? ` · ${ngMonto(n.valor.valor, n.valor.moneda)}${n.tipo === 'arriendo' ? '/mes' : ''}` : ''}${n.estado === 'ganado' ? ' · <span class="im-st ok">Cerrado con éxito</span>' : n.estado === 'perdido' ? ` · <span class="im-st off">Perdido: ${esc(n.motivoPerdida)}</span>` : ''}</p></div>
    <p class="ng-cor">${icon('user', 13)} Corredor: ${window.PERFIL?.esAdmin && window.PERFIL.corredores?.length ? `<select id="ngCorSel"><option value="">— sin corredor —</option>${window.PERFIL.corredores.map((c) => `<option value="${esc(c.id)}" ${n.corredorId === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>` : `<b>${esc(n.corredor || 'sin asignar')}</b>`}</p>
    <div id="ngEt" class="ng-et"></div>
    <ol class="ng-steps hidden">${et.map((x, i) => `<li class="${i < n.orden || n.estado === 'ganado' ? 'hecho' : i === n.orden ? 'actual' : ''}" ${abierto ? `data-mv="${x.id}" title="Mover a ${esc(x.t)}"` : ''}><span>${i < n.orden || n.estado === 'ganado' ? icon('check', 13) : i + 1}</span><b>${esc(x.t)}</b>${x.firma ? `<i>${icon('sign', 11)}</i>` : ''}</li>`).join('')}</ol>
    <div class="im-fcols">
      <div>
        <div class="im-box ng-etapa"><div class="im-bh"><h3>Etapa actual: ${esc(e.t)}</h3><small class="muted">${ngDias(n.diasEnEtapa)}</small></div>
          <p class="muted" style="margin-top:0">${esc(e.d)}</p>
          ${tareas ? `<div class="ng-tasks">${tareas}</div>` : ''}
          ${bloqueFirma}
          ${abierto ? `<div class="actions ng-acts"><button class="ghost im-danger" id="ngLost">Marcar como perdido</button><span class="spacer"></span>${e.final ? '<button class="primary" id="ngWin">Cerrar negocio con éxito</button>' : `<button class="primary" id="ngNext">Pasar a «${esc(sig.t)}» ${icon('arrowR', 15)}</button>`}</div>` : ''}
        </div>
        <div class="im-box"><h3>Próxima acción</h3>
          <form class="ng-pa" id="ngPa"><input id="ngPaT" placeholder="Qué hay que hacer y con quién" value="${esc(n.proximaAccion?.texto || '')}" /><input id="ngPaF" type="date" value="${esc(n.proximaAccion?.fecha || '')}" /><button class="secondary small">Guardar</button></form>
          ${n.vencida ? `<p class="error small" style="margin:8px 0 0">Esta acción venció el ${esc(n.proximaAccion.fecha)}.</p>` : ''}</div>
        <div class="im-box"><h3>Historial</h3><form class="im-nota" id="ngNota"><input id="ngNotaT" placeholder="Agregar una nota (llamada, oferta, acuerdo…)" /><button class="secondary small">Guardar</button></form>
          <ul class="im-act sm">${(n.actividad || []).map((a) => `<li class="${a.tipo === 'nota' ? 'nota' : ''}"><i></i><span>${esc(a.texto)}<small>${fecha(a.fecha, true)}</small></span></li>`).join('')}</ul></div>
      </div>
      <div>
        ${n.prop ? `<button class="im-box ng-prop" id="ngProp"><span class="ng-pph">${foto({ fotos: n.prop.foto ? [n.prop.foto] : [] })}</span><span><small class="im-code">${esc(n.prop.codigo)}</small><b>${esc(n.prop.titulo)}</b><small class="muted">${esc(n.prop.comuna || '')} · Ver ficha</small></span>${icon('chevR', 16)}</button>` : ''}
        <div class="im-box"><h3>Personas</h3>
          ${n.cliente ? `<div class="im-pv"><span class="im-av">${ngIni(n.cliente.nombre)}</span><span class="im-pvt"><b>${esc(n.cliente.nombre)}</b><small>${NG_CLIENTE[n.tipo]} · ${esc(n.cliente.rut)}</small></span>${n.cliente.telefono ? `<button class="ghost small" data-wa="${esc(n.cliente.telefono)}" title="WhatsApp">${icon('whatsapp', 15)}</button>` : ''}${n.cliente.email ? `<button class="ghost small" data-mail="${esc(n.cliente.email)}" title="Copiar correo">${icon('mail', 15)}</button>` : ''}</div>` : ''}
          ${(n.prop?.propietarios || []).map((c) => `<div class="im-pv"><span class="im-av">${ngIni(c.nombre)}</span><span class="im-pvt"><b>${esc(c.nombre)}</b><small>Propietario · ${esc(c.rut)}</small></span></div>`).join('') || '<p class="muted small">La propiedad no tiene propietario registrado: agrégalo en su ficha para firmar.</p>'}</div>
        <div class="im-box"><h3>Condiciones</h3>
          <div class="im-fg2"><label>${n.tipo === 'venta' ? 'Precio acordado' : 'Arriendo mensual'}<span class="ng-inl"><input id="ngVal" type="number" step="any" value="${esc(n.valor?.valor ?? '')}" /><select id="ngMon" style="width:84px">${['UF', 'CLP', 'USD'].map((m) => `<option ${(n.valor?.moneda || 'UF') === m ? 'selected' : ''}>${m}</option>`).join('')}</select></span></label>
            <label>Comisión<span class="ng-inl"><input id="ngCom" type="number" step="any" value="${esc(n.comision?.valor ?? '')}" /><select id="ngComT" style="width:110px"><option value="%">%</option><option value="monto" ${n.comision?.tipo === 'monto' ? 'selected' : ''}>monto</option></select></span></label></div>
          <div class="row-between"><span class="muted small">Comisión estimada: <b>${n.comisionMonto != null ? ngMonto(n.comisionMonto, n.valor?.moneda) : '—'}</b> + IVA</span><button class="secondary small" id="ngCond">Guardar</button></div></div>
        <div class="im-box"><h3>Documentos del negocio</h3>${firmasTodas}</div>
      </div></div></div>`;
  const recargar = () => abrirNegocio(id); window.Ayuda?.onView('negocio');
  window.Etapas?.bloque($('#ngEt'), { negocioId: id, alCambiar: async () => { await ngCargar(); recargar(); } });
  $('#ngBack').onclick = () => abrirNegocios();
  host.querySelectorAll('[data-mv]').forEach((li) => (li.onclick = () => ngMover(id, li.dataset.mv, recargar)));
  host.querySelectorAll('[data-task]').forEach((c) => (c.onchange = async () => { await api('negTarea', id, n.etapa, Number(c.dataset.task), c.checked); recargar(); }));
  if ($('#ngNext')) $('#ngNext').onclick = () => {
    if (e.firma && f?.estado !== 'firmado') {
      window.Ventanas.abrir('negocios.pasarSinFirma', { firma: e.firma, siguiente: sig.t, alConfirmar: () => { closeModal(); ngMover(id, sig.id, recargar); } }, { clave: 'modal-45' }); return;
    }
    ngMover(id, sig.id, recargar);
  };
  if ($('#ngWin')) $('#ngWin').onclick = async () => { try { const r = await api('negCerrar', id, 'ganado'); toast(['¡Negocio cerrado!', ...r.mensajes].join(' '), 5000); await ngCargar(); recargar(); } catch (er) { toast(er.message, 5000); } };
  if ($('#ngLost')) $('#ngLost').onclick = () => {
    window.Ventanas.abrir('negocios.perdido', {
      alGuardar: async (m) => { try { const r = await api('negCerrar', id, 'perdido', m); closeModal(); toast(['Negocio marcado como perdido.', ...r.mensajes].join(' '), 5000); await ngCargar(); recargar(); } catch (er) { toast(er.message, 4000); } },
    }, { clave: 'modal-46' });
  };
  if ($('#ngReab')) $('#ngReab').onclick = async () => { const r = await api('negReabrir', id); toast(['Negocio reabierto.', ...r.mensajes].join(' '), 4000); await ngCargar(); recargar(); };
  $('#ngCorSel')?.addEventListener('change', async (ev) => { try { await api('negCorredor', id, ev.target.value || null); toast('Negocio reasignado. Queda en su historial.'); } catch (er) { toast(er.message, 5000); } });
  $('#ngDel').onclick = () => window.Ventanas.abrir('negocios.eliminar', { alConfirmar: async () => { closeModal(); await api('negBorrar', id); toast('Negocio eliminado.'); abrirNegocios(); } }, { clave: 'modal-47' });
  $('#ngPa').onsubmit = async (ev) => { ev.preventDefault(); await api('negGuardar', { id, proximaAccion: { texto: $('#ngPaT').value, fecha: $('#ngPaF').value } }); toast('Próxima acción guardada.'); await ngCargar(); recargar(); };
  $('#ngNota').onsubmit = async (ev) => { ev.preventDefault(); const t = $('#ngNotaT').value.trim(); if (t) { await api('negNota', id, t); recargar(); } };
  $('#ngCond').onclick = async () => { await api('negGuardar', { id, valor: { valor: $('#ngVal').value, moneda: $('#ngMon').value }, comision: { tipo: $('#ngComT').value, valor: $('#ngCom').value } }); toast('Condiciones guardadas.'); await ngCargar(); recargar(); };
  if ($('#ngProp')) $('#ngProp').onclick = () => abrirFicha(n.prop.id);
  host.querySelectorAll('[data-wa]').forEach((b) => (b.onclick = () => pf.openUrl('https://wa.me/' + b.dataset.wa.replace(/\D/g, ''))));
  host.querySelectorAll('[data-mail]').forEach((b) => (b.onclick = async () => { await navigator.clipboard.writeText(b.dataset.mail); toast('Correo copiado.'); }));
  // firmas
  if ($('#ngVin')) $('#ngVin').onclick = () => {
    window.Ventanas.abrir('negocios.vincularFirma', {
      firma: e.firma,
      // si falla, la ventana muestra el error (antes, #vfErr)
      alGuardar: async (op) => { await api('negFirmaVincular', id, n.etapa, op); closeModal(); toast('Firma vinculada. Revisando su estado…'); await revisarYVolver(); },
    }, { clave: 'modal-48' });
  };
  const revisarYVolver = async () => { try { const r = await api('negFirmasRevisar', id); if (r.mensajes.length) toast(r.mensajes.join(' '), 6000); } catch (er) { toast(er.message, 5000); } await ngCargar(); recargar(); };
  if ($('#ngRev')) $('#ngRev').onclick = () => members(revisarYVolver, 'Para revisar las firmas, inicia sesión con tu cuenta de Portalfirma.');
  if ($('#ngOp')) $('#ngOp').onclick = async () => { const { show } = window; show('ops'); await window.Operaciones.open(); window.Operaciones.select(Number(f.operacion)); };
  if ($('#ngFq')) $('#ngFq').onclick = async () => { await api('negFirmaQuitar', id, n.etapa); recargar(); };
  if ($('#ngEnv')) $('#ngEnv').onclick = () => enviarDocumento(n);
}
// Enviar el documento de la etapa: desde los documentos de la propiedad o un archivo. La operación queda ligada sola.
function enviarDocumento(n) {
  const p = IM.data.propiedades.find((x) => x.id === n.prop?.id); const docs = (p?.documentos || []).filter((d) => /\.(pdf|docx?)$/i.test(d.nombre));
  const ctx = () => { window.__negCtx = { id: n.id, etapa: n.etapa }; };
  window.Ventanas.abrir('negocios.enviarDocumento', {
    firma: n.etapaInfo.firma, codigo: n.prop?.codigo || '',
    documentos: docs.map((d) => ({ id: d.id, nombre: d.nombre, fecha: fecha(d.fecha) })),
    alElegirDocumento: (docId) => members(async () => { closeModal(); ctx(); await api('inmoDocAbrir', p.id, docId); toast('Revisa el documento y pulsa «Enviar a firmar». La operación quedará ligada al negocio.', 6000); }, 'Para enviar a firmar, inicia sesión con tu cuenta de Portalfirma.'),
    alElegirArchivo: () => members(() => { closeModal(); ctx(); window.show('drop'); toast('Elige o arrastra el documento. La operación quedará ligada al negocio.', 5000); }, 'Para enviar a firmar, inicia sesión con tu cuenta de Portalfirma.'),
    alUsarNotaria: () => members(() => { closeModal(); ctx(); window.show('tpl'); window.openTemplates?.(); toast('Al enviar la plantilla, la operación quedará ligada al negocio.', 5000); }, 'Para usar la Notaría virtual, inicia sesión con tu cuenta de Portalfirma.'),
  }, { clave: 'modal-49' });
}
// La pantalla de envío avisa cuando se crea la operación
window.addEventListener('pf-operacion', (ev) => {
  const c = window.__negCtx; window.__negCtx = null; const op = ev.detail?.operation;
  if (!c || op == null) return;
  api('negFirmaVincular', c.id, c.etapa, op).then(() => toast(`Operación ${op} ligada al negocio. Cuando se firme, avanzará solo.`, 6000)).catch((e) => toast(e.message, 5000));
});

window.Negocios = { abrir: abrirNegocios, nuevo: nuevoNegocio, abrirNegocio, _NG: NG, cargar: ngCargar };
