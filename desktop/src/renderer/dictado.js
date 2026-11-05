/* global $, api, esc, icon, toast, cargar, IM */
'use strict';
// Dictar una propiedad (0.12): grabas un audio (o pegas texto) mientras captas; Asset llena la ficha, te dice qué falta
// y qué le pareció dudoso, y puedes corregir dictando («no, son 92 metros»). Se crea solo cuando confirmas.
(() => {
const TIPOS = [['departamento', 'Departamento'], ['casa', 'Casa'], ['oficina', 'Oficina'], ['local_comercial', 'Local comercial'], ['parcela', 'Parcela'], ['sitio', 'Sitio'], ['terreno_construccion', 'Terreno'], ['bodega', 'Bodega'], ['estacionamiento', 'Estacionamiento'], ['industrial', 'Industrial'], ['agricola', 'Agrícola']];
const MAX_SEG = 240;
const fmtT = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const card = (html) => { const d = document.createElement('div'); d.className = 'ga ga-dc'; d.innerHTML = html; return d; };

// ---------- grabadora: botón que graba y devuelve el texto transcrito ----------
function grabadora(box, { alTexto, etiqueta = 'Grabar audio' }) {
  box.innerHTML = `<button type="button" class="dc-mic" data-mic>${icon('mic', 18)}<span>${esc(etiqueta)}</span></button><span class="dc-mic-est muted small"></span>`;
  const b = box.querySelector('[data-mic]'); const est = box.querySelector('.dc-mic-est'); let rec = null; let partes = []; let t0 = 0; let tm = null;
  const parar = () => { if (rec && rec.state !== 'inactive') rec.stop(); };
  b.onclick = async () => {
    if (rec && rec.state === 'recording') return parar();
    if (window.Asistente?.ensureConsent && !(await window.Asistente.ensureConsent())) return;
    try { const ok = await api('dictMic'); if (ok === false) { est.textContent = 'Asset no tiene permiso para el micrófono: actívalo en Ajustes del Sistema › Privacidad y seguridad › Micrófono.'; return; } } catch {}
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { est.textContent = 'No pude usar el micrófono. Revisa el permiso o escribe la descripción abajo.'; return; }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); partes = [];
    rec.ondataavailable = (e) => { if (e.data?.size) partes.push(e.data); };
    rec.onstop = async () => {
      clearInterval(tm); stream.getTracks().forEach((t) => t.stop()); b.classList.remove('on'); b.disabled = true; b.innerHTML = `<span class="spinner sm"></span><span>Transcribiendo…</span>`; est.textContent = '';
      try { const blob = new Blob(partes, { type: rec.mimeType || mime || 'audio/webm' }); const bytes = new Uint8Array(await blob.arrayBuffer());
        const r = await api('dictTranscribir', { bytes, mime: blob.type }); if (r.texto) alTexto(r.texto); else est.textContent = 'No se escuchó nada. Intenta de nuevo.'; }
      catch (e) { est.textContent = e.message; }
      b.disabled = false; b.innerHTML = `${icon('mic', 18)}<span>${esc(etiqueta)}</span>`;
    };
    rec.start(1000); t0 = Date.now(); b.classList.add('on'); b.innerHTML = `<i class="dc-rec"></i><span>Detener · 0:00</span>`; est.textContent = 'Habla con naturalidad: dirección, tipo, dormitorios, baños, metros, precio…';
    tm = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); b.querySelector('span').textContent = `Detener · ${fmtT(s)}`; if (s >= MAX_SEG) parar(); }, 500);
  };
  return { parar };
}

// ---------- micrófono del cuadro del Agente: hablas y se envía como mensaje ----------
function microfono(box, { alTexto }) {
  if (!box) return; box.className = 'ag-micw';
  box.innerHTML = `<button type="button" class="ag-ib ag-mic" title="Hablarle al Agente (graba, transcribe y envía)">${icon('mic', 16)}</button>`;
  const b = box.querySelector('button'); let rec = null; let partes = []; let t0 = 0; let tm = null;
  const reset = () => { b.classList.remove('on'); b.disabled = false; b.innerHTML = icon('mic', 16); };
  b.onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    if (window.Asistente?.ensureConsent && !(await window.Asistente.ensureConsent())) return;
    try { if ((await api('dictMic')) === false) return toast('Asset no tiene permiso para el micrófono: actívalo en Ajustes del Sistema › Privacidad y seguridad › Micrófono.', 7000); } catch {}
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { return toast('No pude usar el micrófono.', 5000); }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); partes = [];
    rec.ondataavailable = (e) => { if (e.data?.size) partes.push(e.data); };
    rec.onstop = async () => { clearInterval(tm); stream.getTracks().forEach((t) => t.stop()); b.classList.remove('on'); b.disabled = true; b.innerHTML = '<span class="spinner sm"></span>';
      try { const blob = new Blob(partes, { type: rec.mimeType || mime || 'audio/webm' }); const r = await api('dictTranscribir', { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type }); if (r.texto) alTexto(r.texto); } catch (e) { toast(e.message, 5000); }
      reset(); };
    rec.start(1000); t0 = Date.now(); b.classList.add('on'); b.innerHTML = '<i class="dc-rec"></i><small>0:00</small>';
    tm = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); const x = b.querySelector('small'); if (x) x.textContent = fmtT(s); if (s >= MAX_SEG) rec.stop(); }, 500);
  };
}
// el Agente llenó la ficha (asset_dictar_propiedad): se muestra para revisar y confirmar
function mostrar(r, texto) { const node = card(''); window.Agente.tarjeta(node); ficha(node, r, texto || ''); }

// ---------- 1. captura ----------
async function abrir() {
  const node = card(`<div class="ga-h"><span class="ga-n">${icon('mic', 15)}</span><div><b>Dictar una propiedad</b><small>Graba un audio (o pega la descripción) mientras captas: Asset llena la ficha y te pregunta lo que falta.</small></div></div>
    <div class="dc-cap"><div data-grab></div>
      <textarea data-txt rows="5" placeholder="Ej.: Estoy captando un departamento en arriendo en Avenida del Tranque 1234, depto 26B, Lo Barnechea. Tres dormitorios, dos baños, 85 metros útiles, estacionamiento y bodega. 850 lucas, gastos comunes 120 mil…"></textarea>
      <div class="ga-foot"><span class="ga-falta"></span><span class="spacer"></span><button class="primary" data-ok>${icon('sparkle', 15)} Llenar la ficha</button></div></div>`);
  window.Agente.tarjeta(node, { usuario: 'Subir una propiedad' });
  const tx = node.querySelector('[data-txt]');
  grabadora(node.querySelector('[data-grab]'), { alTexto: (t) => { tx.value = [tx.value.trim(), t].filter(Boolean).join('\n'); procesar(); } });
  const procesar = async () => {
    const texto = tx.value.trim(); if (texto.length < 8) { node.querySelector('.ga-falta').innerHTML = `${icon('alert', 13)} Graba o escribe los datos de la propiedad.`; return; }
    if (window.Asistente?.ensureConsent && !(await window.Asistente.ensureConsent())) return;
    const b = node.querySelector('[data-ok]'); b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Llenando la ficha…';
    try { const r = await api('dictExtraer', { texto }); if (r.tokens) window.Asistente?.actualizarTokens?.(r.tokens); node.dataset.resumen = 'Dictado de propiedad'; ficha(node, r, texto); }
    catch (e) { b.disabled = false; b.innerHTML = `${icon('sparkle', 15)} Llenar la ficha`; node.querySelector('.ga-falta').innerHTML = `${icon('alert', 13)} ${esc(e.message)}`; }
  };
  node.querySelector('[data-ok]').onclick = procesar;
  window.Agente.bajar(); setTimeout(() => tx.focus(), 50);
}

// ---------- 2. resumen editable ----------
function ficha(node, r, transcripcion) {
  const c = r.campos; const hay = (k) => c[k] != null && c[k] !== '' && c[k] !== false;
  const v = (k) => esc(c[k] ?? ''); const cls = (k) => (hay(k) ? 'dic' : '');
  const pr = (k, l) => `<label class="${cls(k)}" data-f="${k}"><span>${l}</span><span class="dc-pr"><input data-k="${k}" inputmode="decimal" value="${c[k] ? esc(c[k].valor) : ''}" /><select data-k="${k}M">${['CLP', 'UF', 'USD'].map((m) => `<option ${(c[k]?.moneda || (k === 'precioArriendo' ? 'CLP' : 'UF')) === m ? 'selected' : ''}>${m}</option>`).join('')}</select></span></label>`;
  const nm = (k, l) => `<label class="${cls(k)}" data-f="${k}"><span>${l}</span><input data-k="${k}" inputmode="numeric" value="${v(k)}" /></label>`;
  const tt = (k, l, ph = '') => `<label class="${cls(k)}" data-f="${k}"><span>${l}</span><input data-k="${k}" value="${v(k)}" placeholder="${ph}" /></label>`;
  node.innerHTML = `<div class="ga-h"><span class="ga-n">${icon('house', 15)}</span><div><b>Esto entendí</b><small>Revisa y corrige lo que haga falta. Lo marcado en lila vino del dictado.</small></div></div>
    <div data-avisos></div>
    <div class="dc-g">
      <label class="${cls('tipo')}" data-f="tipo"><span>Tipo</span><select data-k="tipo"><option value="">—</option>${TIPOS.map(([k, l]) => `<option value="${k}" ${c.tipo === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="dc-op ${c.venta || c.arriendo ? 'dic' : ''}" data-f="operacion"><span>Operación</span><label class="ga-chk"><input type="checkbox" data-k="venta" ${c.venta ? 'checked' : ''} /> Venta</label><label class="ga-chk"><input type="checkbox" data-k="arriendo" ${c.arriendo ? 'checked' : ''} /> Arriendo</label></div>
      ${pr('precioVenta', 'Precio de venta')}${pr('precioArriendo', 'Precio de arriendo')}
      <label class="s2 ${cls('direccion')}" data-f="direccion"><span>Dirección</span><input data-k="direccion" value="${v('direccion')}" placeholder="Calle y número" /></label>
      ${tt('unidad', 'Depto / unidad', '26B')}${tt('comuna', 'Comuna')}
      ${nm('dormitorios', 'Dormitorios')}${nm('banos', 'Baños')}${nm('estacionamientos', 'Estacionamientos')}${nm('bodegas', 'Bodegas')}
      ${nm('supUtil', 'm² útiles')}${nm('supTotal', 'm² totales')}${nm('gastosComunes', 'Gastos comunes ($)')}
      <label class="ga-chk dc-am"><input type="checkbox" data-k="amoblado" ${c.amoblado ? 'checked' : ''} /> Amoblado</label>
      <label class="s4 ${cls('titulo')}" data-f="titulo"><span>Título del aviso</span><input data-k="titulo" maxlength="60" value="${v('titulo')}" /></label>
      <label class="s4 ${cls('caracteristicas')}" data-f="caracteristicas"><span>Características <i>(separadas por coma)</i></span><input data-k="caracteristicas" value="${esc((c.caracteristicas || []).join(', '))}" /></label>
      <label class="s4 ${cls('descripcion')}" data-f="descripcion"><span>Descripción</span><textarea data-k="descripcion" rows="4">${v('descripcion')}</textarea></label>
    </div>
    ${[c.piso != null ? `piso ${c.piso}` : '', c.antiguedad != null ? `${c.antiguedad} años` : '', c.orientacion ? `orientación ${c.orientacion}` : ''].filter(Boolean).length ? `<p class="muted small">También anoté: ${esc([c.piso != null ? `piso ${c.piso}` : '', c.antiguedad != null ? `${c.antiguedad} años` : '', c.orientacion ? `orientación ${c.orientacion}` : ''].filter(Boolean).join(', '))} (queda en las notas internas).</p>` : ''}
    <details class="lz-det dc-tr"><summary>Lo que dictaste</summary><p>${esc(transcripcion).replace(/\n/g, '<br>')}</p></details>
    <div class="dc-cor hidden"><b>Corregir o agregar dictando</b><small class="muted">Ej.: «son 92 metros útiles, no 85» o «tiene piscina y quincho».</small><div data-grab2></div><textarea data-t2 rows="2" placeholder="O escríbelo aquí"></textarea><div class="ga-foot"><span class="spacer"></span><button class="ghost small" data-c2no>Cancelar</button><button class="secondary small" data-c2ok>Aplicar</button></div></div>
    <div class="ga-foot"><span class="ga-falta"></span><span class="spacer"></span><button class="secondary" data-cor>${icon('mic', 15)} Corregir dictando</button><button class="primary" data-crear>${icon('check', 15)} Crear propiedad</button></div>`;
  node.className = 'ga ga-form ga-dc';
  const q = (s) => node.querySelector(s);
  const dir = window.Direcciones?.conectar(q('[data-k="direccion"]'), { alElegir: (d) => { if (d.comuna) q('[data-k="comuna"]').value = d.comuna; revisar(); } });
  const leer = () => { const g = (k) => q(`[data-k="${k}"]`); const o = { tipo: g('tipo').value || null, venta: g('venta').checked, arriendo: g('arriendo').checked,
      precioVenta: g('precioVenta').value.trim() ? { valor: g('precioVenta').value.trim(), moneda: g('precioVentaM').value } : null, precioArriendo: g('precioArriendo').value.trim() ? { valor: g('precioArriendo').value.trim(), moneda: g('precioArriendoM').value } : null,
      amoblado: g('amoblado').checked, caracteristicas: g('caracteristicas').value.split(',').map((x) => x.trim()).filter(Boolean), piso: c.piso, antiguedad: c.antiguedad, orientacion: c.orientacion, ficha: c.ficha, ...(dir?.valor?.() || {}) };
    for (const k of ['direccion', 'unidad', 'comuna', 'titulo', 'descripcion']) o[k] = g(k).value.trim() || null;
    for (const k of ['dormitorios', 'banos', 'estacionamientos', 'bodegas', 'supUtil', 'supTotal', 'gastosComunes']) { const x = g(k).value.trim().replace(/\./g, '').replace(',', '.'); o[k] = x === '' || isNaN(Number(x)) ? null : Number(x); }
    return o; };
  const avisos = (dudas) => { q('[data-avisos]').innerHTML = (dudas || []).length ? `<div class="dc-dudas">${icon('alert', 13)}<div>${dudas.map((d) => `<p>${esc(d)}</p>`).join('')}</div></div>` : ''; };
  let tk = 0; const revisar = async () => { const my = ++tk; const f = await api('dictFaltan', leer()).catch(() => []); if (my !== tk) return;
    node.querySelectorAll('[data-f]').forEach((x) => x.classList.remove('falta')); f.forEach((x) => node.querySelector(`[data-f="${x.id}"]`)?.classList.add('falta'));
    q('.ga-foot:last-child .ga-falta').innerHTML = f.length ? `${icon('alert', 13)} Me falta: ${esc(f.map((x) => x.t.toLowerCase()).join(', '))}` : `<span class="ok">${icon('check', 13)} Lista para crear</span>`; return f; };
  node.querySelectorAll('[data-k]').forEach((i) => { i.addEventListener('input', () => { i.closest('[data-f]')?.classList.remove('dic'); revisar(); }); i.addEventListener('change', revisar); });
  // corregir dictando: se manda lo que hay + lo nuevo, y se vuelve a pintar
  let g2 = null; const cor = q('.dc-cor');
  q('[data-cor]').onclick = () => { cor.classList.remove('hidden'); g2 ||= grabadora(q('[data-grab2]'), { etiqueta: 'Grabar corrección', alTexto: (t) => { q('[data-t2]').value = [q('[data-t2]').value.trim(), t].filter(Boolean).join(' '); aplicar(); } }); q('[data-t2]').focus(); window.Agente.bajar(); };
  q('[data-c2no]').onclick = () => cor.classList.add('hidden');
  const aplicar = async () => { const t = q('[data-t2]').value.trim(); if (!t) return; const b = q('[data-c2ok]'); b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Aplicando…';
    try { const r2 = await api('dictExtraer', { texto: t, previo: leer() }); if (r2.tokens) window.Asistente?.actualizarTokens?.(r2.tokens); ficha(node, r2, `${transcripcion}\n${t}`); toast('Corrección aplicada.'); }
    catch (e) { b.disabled = false; b.textContent = 'Aplicar'; toast(e.message, 5000); } };
  q('[data-c2ok]').onclick = aplicar;
  q('[data-crear]').onclick = async (e) => { const b = e.currentTarget; const f = await revisar();
    if (f.some((x) => ['tipo', 'operacion', 'direccion'].includes(x.id))) { toast('Para crearla necesito al menos el tipo, si es venta o arriendo, y la dirección.', 5000); return; }
    b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Creando…';
    try { const p = await api('dictCrear', leer()); creada(node, p, f); } catch (er) { b.disabled = false; b.innerHTML = `${icon('check', 15)} Crear propiedad`; toast(er.message, 5000); } };
  avisos(r.dudas); revisar(); window.Agente.bajar();
}

// ---------- 3. creada ----------
async function creada(node, p, faltan) {
  node.className = 'ga hecha';
  node.innerHTML = `<span class="ga-hi">${icon('check', 14)}</span><span><b>${esc(p.codigo)}</b> · ${esc(p.titulo)} creada dictando${faltan.length ? ` · faltó: ${esc(faltan.map((x) => x.t.toLowerCase()).join(', '))}` : ''}</span>`;
  node.dataset.resumen = `${p.codigo} · ${p.titulo} creada dictando`;
  try { await cargar(); } catch {} window.AssetRefrescar?.();
  window.Agente.contexto({ tipo: 'propiedad', id: p.id });
  window.Agente.sugerencias([{ label: 'Cargar fotos desde Drive', accion: { tipo: 'fotosDrive', propId: p.id } }, { label: 'Ver la ficha', accion: { tipo: 'ficha', propId: p.id } }, { label: 'Gestionar la propiedad', accion: { tipo: 'estadoProp', propId: p.id } }, { label: 'Publicar en portales', accion: { tipo: 'publicar', propId: p.id } }]);
  window.Agente.festejo?.();
}

window.Dictado = { abrir, mostrar, microfono };

// ---------- fotos de la propiedad desde Google Drive (el Drive de la empresa) ----------
async function fotosDrive(propId) {
  const st = await api('driveStatus').catch(() => ({}));
  if (st && st.configured === false) return toast('Google Drive no está configurado en esta versión de Asset.', 6000);
  if (!st.connected) {
    const ok = await new Promise((res) => { window.modal(`<h2>${icon('drive', 18)} Conectar Google Drive</h2><p>Para cargar las fotos, conecta la cuenta de Google que tiene acceso a la carpeta de <b>captaciones</b> de la empresa. Se abrirá tu navegador para autorizar.</p>
      <p class="muted small">Asset solo puede abrir los archivos que tú elijas en el selector de Google; no ve el resto del Drive.</p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Conectar</button></div>`);
      $('#mCancel').onclick = () => { window.closeModal(); res(false); }; $('#mOk').onclick = () => { window.closeModal(); res(true); }; });
    if (!ok) return; try { const r = await api('driveConnect'); if (!r.connected) return; toast(`Google Drive conectado${r.email ? ': ' + r.email : ''}.`); } catch (e) { return toast('No se pudo conectar Google Drive: ' + e.message, 8000); }
  }
  else {
    const st2 = await api('driveStatus').catch(() => ({}));
    const ir = await new Promise((res) => { window.modal(`<h2>${icon('drive', 18)} Fotos desde Google Drive</h2><p>Vas a elegir las fotos con la cuenta <b>${esc(st2.email || 'conectada')}</b>.</p><p class="muted small">¿La carpeta de captaciones está en otra cuenta de Google? Cámbiala aquí.</p>
      <div class="actions"><button class="ghost" id="fdCambiar">Cambiar cuenta</button><span class="spacer"></span><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Elegir fotos</button></div>`);
      $('#mCancel').onclick = () => { window.closeModal(); res('no'); }; $('#mOk').onclick = () => { window.closeModal(); res('si'); }; $('#fdCambiar').onclick = () => res('cambiar'); });
    if (ir === 'no') return;
    if (ir === 'cambiar') { const c = await window.Drive.cambiarCuenta(); if (!c) return; }
  }
  toast('Se abrió Google Drive en tu navegador: busca la carpeta de la propiedad, entra a «fotos con logo» y selecciona las fotos.', 9000);
  const r = await pf.fotosDrive(propId);
  if (!r.ok) return toast(r.error, 8000);
  const d = r.data; if (d.cancelado) return toast('No elegiste fotos.');
  toast(`${d.agregadas} ${d.agregadas === 1 ? 'foto cargada' : 'fotos cargadas'} (la propiedad tiene ${d.total}).${d.omitidas.length ? ` ${d.omitidas.length} sin cargar: ${d.omitidas.slice(0, 2).map((x) => `${x.name} (${x.motivo})`).join('; ')}.` : ''}`, 8000);
  try { await cargar(); } catch {} window.AssetRefrescar?.(); window.Lienzo?.refrescar?.();
  if (document.querySelector('#view-cartera:not(.hidden) .im-ficha')) window.Inmo.abrirFicha(propId);
  return d;
}
window.Fotos = { drive: fotosDrive };
})();
