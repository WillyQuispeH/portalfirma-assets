/* global $, api, esc, modal, closeModal, toast */
'use strict';
// 0.16.15 · Formatos propios de la corredora en la app: el paso «Mandato firmado» abre esta ventana. Muestra lo que
// ya va en el documento (sacado de la ficha, el propietario y la empresa), pide solo lo que falta y lo envía a firmar.
(() => {
const F = { propId: null, hito: 'mandato', lista: [], i: 0, r: null, despues: null, ver: false, personaId: null, op: null };
const ctx = () => ({ propId: F.propId, personaId: F.personaId, op: F.op });
const opTxt = { venta: 'Venta', arriendo: 'Arriendo' };

function entrada(x) {
  if (x.id === 'operacion') return `<select data-v="operacion"><option value="">—</option><option value="venta">Venta</option><option value="arriendo">Arriendo</option></select>`;
  if (/^(exclusividad|publicar|mascotas)$/.test(x.id)) return `<select data-v="${x.id}"><option value="">—</option><option value="si">Sí</option><option value="no">No</option></select>`;
  const tipo = /Email/.test(x.id) ? 'email' : /supTotal|supUtil|precio|mesesGarantia/.test(x.id) ? 'number" step="any' : 'text';
  return `<input data-v="${x.id}" type="${tipo}" placeholder="${/Rut/.test(x.id) ? 'Ej.: 12.345.678-9' : /Telefono/.test(x.id) ? 'Ej.: +56 9 1234 5678' : /Email/.test(x.id) ? 'Ej.: nombre@correo.cl' : ''}"${x.sugerencia ? ` value="${esc(x.sugerencia)}"` : ''} />`;
}
async function pintar() {
  const f = F.lista[F.i]; F.r = await api('fmtPreparar', { formatoId: f.id, ...ctx() }); if (F.r.op) F.op = F.r.op; const r = F.r;
  const datos = r.datos.filter((d) => d.aplica && !d.auto && !d.falta);
  $('#fmCuerpo').innerHTML = `
    ${F.lista.length > 1 ? `<div class="fb-tabs">${F.lista.map((x, i) => `<button class="fb-tab${i === F.i ? ' on' : ''}" data-i="${i}"><span class="fb-n">${i + 1}</span>${esc(x.titulo)}</button>`).join('')}</div>` : ''}
    <p class="muted small" style="margin:0 0 10px">${esc(r.formato.descripcion || '')}</p>
    ${r.faltan.length ? `<div class="fm-falta"><h4>Falta para enviarlo <small class="muted">(queda guardado en la ficha: no se vuelve a pedir)</small></h4>
      <div class="fb-grid">${r.faltan.map((x) => `<label class="fb-c fb-falta"${x.ayuda ? ` title="${esc(x.ayuda)}"` : ''}><span class="fb-l">${esc(x.t)}${x.motivo ? `<br><span class="fm-motivo">${esc(x.motivo)}</span>` : ''}</span>${entrada(x)}</label>`).join('')}</div>
      <div class="actions"><button class="secondary" id="fmGuardar">Guardar datos</button></div></div>`
    : '<p class="fm-ok">Está todo: el documento sale con los datos de la ficha.</p>'}
    <h4 class="fb-sub">Lo que va en el documento</h4>
    <dl class="fm-dl">${datos.map((d) => `<dt>${esc(d.t)}</dt><dd>${esc(d.txt || '—')}${d.porDefecto ? ' <small class="muted">(por defecto)</small>' : ''}</dd>`).join('')}</dl>
    <h4 class="fb-sub">Firman con Portalfirma</h4>
    <div class="fm-firma"><label>Tipo de firma<select id="fmTipo" ${window.PERFIL && !window.PERFIL.esAdmin ? 'disabled' : ''}>${Object.entries(r.tiposFirma).map(([k, l]) => `<option value="${k}" ${r.firma.tipo === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label>Trámite<select id="fmTram" ${window.PERFIL && !window.PERFIL.esAdmin ? 'disabled' : ''}>${Object.entries(r.tramites).map(([k, l]) => `<option value="${k}" ${r.firma.tramite === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
    <ul class="fm-fir">${r.firmantes.map((s) => `<li><b>${esc(s.titulo)}</b> <span class="cal">(firma como ${esc(s.calidad)})</span> · ${esc(s.nombre || '—')}${s.rut ? ' · ' + esc(s.rut) : ''}${s.email ? ' · ' + esc(s.email) : ''}${s.telefono ? ' · ' + esc(s.telefono) : ''}</li>`).join('')}</ul>
    ${r.empresa ? '<p class="muted small">El propietario es una empresa: firman las personas que la representan. Portalfirma las identifica en el documento al enviarlo.</p>' : ''}
    ${F.ver ? `<iframe class="fm-prev" sandbox="" title="Vista previa" srcdoc="${esc(await api('fmtHtml', f.id, F.propId, { personaId: F.personaId, op: F.op }))}"></iframe>` : ''}`;
  document.querySelectorAll('#fmCuerpo [data-i]').forEach((b) => (b.onclick = () => { F.i = Number(b.dataset.i); pintar(); }));
  if ($('#fmGuardar')) $('#fmGuardar').onclick = guardar;
  const cf = () => api('fmtConfigurar', { firma: { [f.id]: { tipo: $('#fmTipo').value, tramite: $('#fmTram').value } } }).then(() => toast('Tipo de firma guardado para este documento.')).catch((e) => toast(e.message, 4000));
  $('#fmTipo').onchange = cf; $('#fmTram').onchange = cf;
  $('#fmVer').textContent = F.ver ? 'Ocultar documento' : 'Ver documento';
  $('#fmEnviar').disabled = !r.listo; $('#fmEnviar').textContent = `Enviar «${r.formato.titulo}» a firmar`;
}
async function guardar() {
  const valores = {}; document.querySelectorAll('#fmCuerpo [data-v]').forEach((x) => { if (String(x.value).trim()) valores[x.dataset.v] = x.value; });
  if (!Object.keys(valores).length) { $('#fmErr').textContent = 'Completa al menos un dato.'; return false; }
  try { const r = await api('fmtCompletar', { ...ctx(), formatoId: F.lista[F.i].id, valores }); if (r.op) F.op = r.op; $('#fmErr').textContent = ''; if (r.guardado.length) toast('Guardado: ' + r.guardado.join(', ') + '.'); await pintar(); return true; }
  catch (e) { $('#fmErr').textContent = e.message; return false; }
}
async function enviar() {
  const r = F.r; if (!r?.listo) return;
  if (document.querySelector('#fmCuerpo [data-v]')) { if (!(await guardar())) return; if (!F.r.listo) return; }
  modal(`<div class="im-form"><h2>¿Enviar a firmar?</h2><p>«${esc(r.formato.titulo)}» de ${esc(r.propiedad.codigo)} · ${esc(r.firma.tipoTxt)} · ${esc(r.firma.tramiteTxt)}.</p><ul class="fm-fir">${r.firmantes.map((s) => `<li>${esc(s.titulo)} (${esc(s.calidad)}): <b>${esc(s.nombre)}</b> · ${esc(s.email)}</li>`).join('')}</ul>
    <p class="muted small">Se cobra del saldo de Portalfirma y cada firmante recibe su enlace para firmar.</p><p class="error" id="fmErr2"></p>
    <div class="actions"><button class="secondary" id="mCancel">Volver</button><button class="primary" id="mOk">Enviar a firmar</button></div></div>`);
  $('#mCancel').onclick = () => abrir(F.propId, { hito: F.hito, despues: F.despues, i: F.i, personaId: F.personaId, op: F.op });
  $('#mOk').onclick = () => window.members(async () => {
    const b = $('#mOk'); b.disabled = true; b.textContent = 'Enviando…';
    try { const x = await api('fmtEnviar', { formatoId: r.formato.id, ...ctx() }); closeModal(); toast(`${x.numero ? 'Orden de visita nº ' + x.numero + ' enviada' : 'Enviado'} a firmar · operación ${x.operacion}.`, 5000); F.despues?.(); }
    catch (e) { $('#fmErr2').textContent = e.message; b.disabled = false; b.textContent = 'Enviar a firmar'; }
  }, 'Para enviar documentos a firmar, inicia sesión con tu cuenta de Portalfirma.');
}
// sin formatos propios activos: se ofrecen los de la corredora o seguir con las plantillas de Portalfirma
async function activar(propId, o, otro) {
  const e = await api('fmtEstado');
  modal(`<div class="im-form"><h2>Formatos de la corredora</h2><p>Asset puede llenar los documentos propios de la corredora con los datos de la ficha y enviarlos a firmar con Portalfirma.</p>
    <label>Formatos<select id="fmPaq">${e.disponibles.map((d) => `<option value="${esc(d.id)}">${esc(d.nombre)}</option>`).join('')}</select></label>
    <div class="actions"><button class="secondary" id="fmOtro">Usar plantillas de Portalfirma</button><button class="primary" id="fmAct">Usar estos formatos</button></div></div>`);
  $('#fmOtro').onclick = () => { closeModal(); otro?.(); };
  $('#fmAct').onclick = async () => { await api('fmtConfigurar', { paquete: $('#fmPaq').value }); abrir(propId, o, otro); };
}
async function abrir(propId, { hito = 'mandato', despues = null, i = 0, personaId = null, op = null } = {}, otro = null) {
  const e = await api('fmtEstado'); if (!e.paquete) return activar(propId, { hito, despues, personaId, op }, otro);
  const l = await api('fmtDeHito', propId, hito);
  if (!l.length) { if (otro) return otro(); toast('Marca en la ficha si la propiedad va en venta o en arriendo.'); return; }
  if (hito === 'orden' && !personaId) { toast('Primero crea el negocio con el interesado: la orden de visita va a su nombre.', 5000); return; }
  Object.assign(F, { propId, hito, lista: l, i: Math.min(i, l.length - 1), despues, ver: false, personaId, op });
  modal(`<div class="im-form fb"><h2>${l.length > 1 ? 'Mandatos' : esc(l[0].titulo)} <small class="muted">· formatos ${esc(e.nombre)}</small></h2>
    <div id="fmCuerpo"><div class="ga-load"><span class="spinner sm"></span>Revisando los datos…</div></div><p class="error" id="fmErr"></p>
    <div class="actions"><button class="secondary" id="fmCerrar">Cerrar</button><button class="secondary" id="fmVer">Ver documento</button><button class="primary" id="fmEnviar" disabled>Enviar a firmar</button></div></div>`);
  $('#modalCard').classList.add('im-wide');
  $('#fmCerrar').onclick = () => { $('#modalCard').classList.remove('im-wide'); closeModal(); despues?.(); };
  $('#fmVer').onclick = () => { F.ver = !F.ver; pintar(); };
  $('#fmEnviar').onclick = enviar;
  try { await pintar(); } catch (er) { $('#fmCuerpo').innerHTML = `<p class="error">${esc(er.message)}</p>`; }
}
window.Formatos = { abrir };
})();
