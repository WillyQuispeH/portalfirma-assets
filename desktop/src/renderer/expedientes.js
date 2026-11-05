/* global liberar, pf, $, esc, toast, modal, closeModal, icon, show, api, startAnalysis */
'use strict';
(() => { // módulo aislado
// ============================================================================
// Expedientes: una carpeta por caso (propiedad, persona, empresa, trámite) con sus documentos
// (contratos, cédulas, fotos…) y su historial. Se guarda en el computador o en Google Drive.
// Los archivos se eligen aquí y se usan en Studio: abrir, combinar, enviar a firmar, agregar a Plazos.
// ============================================================================
const X = { sel: null }; // el expediente elegido en la pantalla (React)
const TYPES = { propiedad: ['Propiedad', 'home'], persona: ['Persona', 'user'], empresa: ['Empresa', 'building'], tramite: ['Trámite', 'listCheck'], otro: ['Otro', 'folder'] };
const fmtD = (iso) => { try { return new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const ext = (n) => String(n).split('.').pop().toLowerCase();
const usable = (n) => /^(pdf|docx?|xlsx?|csv|ods|jpe?g|png|webp)$/.test(ext(n)); // lo que Studio sabe abrir

// La pantalla está en React: src/ui/components/functional/gestion/expedientes. Aquí quedan los formularios
// (nuevo, más opciones, guardar desde el editor), traer desde Drive, soltar archivos y las acciones sobre
// los archivos marcados. React avisa cuál está elegido (elegido) y aquí se le pide recargar (pf:expedientes).
function open(id) {
  show('expedientes'); const el = $('#view-expedientes');
  liberar(el); window.ReactUI.montar('GestionExpedientes', el, { sel: id || null });
}
const recargar = (sel) => window.dispatchEvent(new CustomEvent('pf:expedientes', { detail: sel === undefined ? {} : { sel } }));
function elegido(id) { X.sel = id; }

function afterAdd(r) {
  if (!r?.ok) return r && toast(r.error, 5000);
  if (r.data.skipped?.length) toast(`No se agregaron: ${r.data.skipped.join(' · ')}`, 7000);
  else if (r.data.added?.length) toast(r.data.added.length === 1 ? `Se agregó «${r.data.added[0]}».` : `Se agregaron ${r.data.added.length} archivos.`);
  recargar();
}
// Archivos de Drive: se copian al expediente (quedan guardados en su carpeta)
async function fromDrive(e) {
  const st = (await pf.driveStatus()).data || {};
  if (!st.picker) return window.Drive.open({ purpose: 'exp' });
  if (!st.connected) return window.Drive.open({ purpose: 'exp' });
  const r = await pf.drivePick({ multi: true, folders: false }); if (!r.ok) return toast(r.error, 5000);
  if (!r.data.length) return;
  modal(`<h2>${icon('drive', 18)} Copiando desde Google Drive…</h2><p class="muted">${r.data.length} archivo(s)</p>`);
  const paths = []; for (const f of r.data) { const d = await pf.driveDownload(f.id); if (d.ok) paths.push(d.data); }
  closeModal(); afterAdd(await pf.expAddFiles(e.id, paths, { note: `Se copiaron ${paths.length} archivo(s) desde Google Drive` }));
}
// Llamado por el explorador de Drive (modo sin selector) con los archivos ya descargados
async function addPaths(paths, note) { if (!X.sel) return toast('Primero elige un expediente.'); afterAdd(await pf.expAddFiles(X.sel, paths, { note })); }

async function paths(files) {
  const out = [];
  if (files.length > 1) modal(`<h2>Preparando ${files.length} archivos…</h2>`);
  for (const f of files) { const r = await pf.expLocalPath(X.sel, f.id); if (r.ok) out.push({ f, path: r.data }); else toast(`${f.name}: ${r.error}`, 5000); }
  if (files.length > 1) closeModal();
  return out;
}
async function act(what, files, e) {
  files = files.filter((f) => usable(f.name)); if (!files.length) return;
  if (what === 'sign' && !window.isMember()) return window.members(() => act(what, files, e), 'Enviar a firmar es exclusivo para clientes de Portalfirma. Inicia sesión con tu cuenta.');
  const got = await paths(files); if (!got.length) return;
  if (what === 'open') { window.studio.goEditor(); return window.editor.openEach(got.map((x) => x.path)); }
  if (what === 'combine') { show('editor'); window.editor.open(); window.editor.openPaths(got.map((x) => x.path), true); return toast('Se abrieron juntos en el editor: ordénalos y guarda el PDF combinado.', 5000); }
  if (what === 'plazos') {
    const r = await pf.plazosAdd(got.map((x) => x.path)); if (!r.ok) return toast(r.error, 5000);
    await pf.expLog(e.id, { kind: 'plazos', text: `Agregado a Plazos y vencimientos: ${got.map((x) => '«' + x.f.name + '»').join(', ')}` });
    window.Plazos.open(); setTimeout(() => window.Plazos.afterAdd(r), 300); return;
  }
  if (what === 'sign') {
    if (got.length === 1) { window.__expCtx = { id: e.id, file: got[0].f.name }; show('drop'); try { startAnalysis(await api('checkFile', got[0].path)); } catch (err) { toast(err.message, 5000); } return; }
    await pf.bulkAdd(got.map((x) => ({ path: x.path, flow: { expId: e.id, file: x.f.name } })));
    window.Masiva.open('load'); toast(`${got.length} documento(s) del expediente en la carga masiva: revisa los firmantes y envía.`, 6000);
  }
}

function createDialog(after) {
  modal(`<h2>${icon('folderOpen', 18)} Nuevo expediente</h2>
    <label>Nombre<input id="xnName" placeholder="Ej.: Depto Calle Nueva 120, torre 2" maxlength="90" /></label>
    <label>Tipo<select id="xnType">${Object.entries(TYPES).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
    <div class="xp-store"><span>¿Dónde se guarda?</span>
      <label class="xp-opt on"><input type="radio" name="xnSt" value="local" checked /><span><b>${icon('folder', 14)} En este computador</b><small>Carpeta «Expedientes PortalFirma» en Documentos.</small></span></label>
      <label class="xp-opt"><input type="radio" name="xnSt" value="drive" /><span><b>${icon('drive', 14)} En Google Drive</b><small>Carpeta «Expedientes PortalFirma» en tu Drive: la ves desde cualquier equipo.</small></span></label></div>
    <label>Notas (opcional)<input id="xnNotes" placeholder="Ej.: arriendo 2026, corredora SEC Propiedades" maxlength="200" /></label>
    <div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Crear</button></div>`);
  $('#modalCard').querySelectorAll('input[name="xnSt"]').forEach((r) => (r.onchange = () => $('#modalCard').querySelectorAll('.xp-opt').forEach((l) => l.classList.toggle('on', l.contains(r) && r.checked))));
  $('#mCancel').onclick = closeModal; $('#xnName').focus();
  $('#mOk').onclick = async () => {
    const name = $('#xnName').value.trim(); if (!name) { $('#xnName').classList.add('invalid'); return; }
    const storage = $('#modalCard').querySelector('input[name="xnSt"]:checked').value;
    const o = { name, type: $('#xnType').value, storage, notes: $('#xnNotes').value.trim() };
    if (storage === 'drive') { const st = (await pf.driveStatus()).data || {}; if (!st.connected) { closeModal(); toast('Primero conecta Google Drive; después vuelve a crear el expediente.', 6000); return window.Drive.open({ purpose: 'connect' }); } }
    $('#mOk').disabled = true; $('#mOk').innerHTML = '<i class="bk-spin"></i> Creando…';
    const r = await pf.expCreate(o); if (!r.ok) { $('#mOk').disabled = false; $('#mOk').textContent = 'Crear'; return toast(r.error, 6000); }
    closeModal(); if (after) return after(r.data);
    await open(r.data.id); toast('Expediente creado. Agrega sus documentos.');
  };
}
function moreDialog(e) {
  modal(`<h2>${esc(e.name)}</h2>
    <label>Tipo<select id="xmType">${Object.entries(TYPES).map(([k, [l]]) => `<option value="${k}" ${e.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Notas<input id="xmNotes" value="${esc(e.notes || '')}" maxlength="200" /></label>
    <p class="muted small">Creado el ${fmtD(e.created)} · ${e.storage === 'drive' ? 'Google Drive' : esc(e.path || '')}</p>
    <div class="actions"><button class="ghost danger-t" id="xmDel" style="margin-right:auto">Quitar de la lista</button><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk">Guardar</button></div>`);
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async () => { closeModal(); await pf.expUpdate(e.id, { type: $('#xmType').value, notes: $('#xmNotes').value }); recargar(e.id); };
  $('#xmDel').onclick = () => {
    modal(`<h2>Quitar de la lista</h2><p>«${esc(e.name)}» deja de aparecer en la app. <b>La carpeta y sus archivos no se borran</b>: siguen ${e.storage === 'drive' ? 'en tu Google Drive' : 'en tu computador'}.</p><div class="actions"><button class="secondary" id="mCancel">Cancelar</button><button class="danger" id="mOk">Quitar</button></div>`);
    $('#mCancel').onclick = closeModal; $('#mOk').onclick = async () => { closeModal(); await pf.expRemove(e.id); recargar(null); };
  };
}
// Guardar el documento abierto en el editor dentro de un expediente
async function saveCurrent() {
  const l = await pf.expList(); const list = l.ok ? l.data : [];
  const name = (window.editor._state?.name || 'Documento.pdf').replace(/\.[^.]+$/, '') + '.pdf';
  modal(`<h2>${icon('folderOpen', 18)} Guardar en un expediente</h2>
    <label>Nombre del archivo<input id="xsName" value="${esc(name)}" /></label>
    ${list.length ? `<label>Expediente<select id="xsExp">${list.map((x) => `<option value="${x.id}">${esc(x.name)}${x.storage === 'drive' ? ' (Drive)' : ''}</option>`).join('')}</select></label>` : '<p class="muted">Todavía no tienes expedientes: crea uno.</p>'}
    <div class="actions"><button class="ghost" id="xsNew" style="margin-right:auto">${icon('plus', 13)} Nuevo expediente</button><button class="secondary" id="mCancel">Cancelar</button><button class="primary" id="mOk" ${list.length ? '' : 'disabled'}>Guardar</button></div>`);
  $('#mCancel').onclick = closeModal;
  $('#xsNew').onclick = () => { const nm = $('#xsName').value; createDialog(async (x) => { await doSave(x.id, nm); }); };
  $('#mOk').onclick = async () => { const id = $('#xsExp').value; const nm = $('#xsName').value; closeModal(); await doSave(id, nm); };
}
async function doSave(id, name) {
  const b64 = await window.editor.exportBase64(); const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const r = await pf.expAddBytes(id, /\.pdf$/i.test(name) ? name : name + '.pdf', bytes, { note: `Se guardó desde el editor «${name}»` });
  if (!r.ok) return toast(r.error, 6000);
  toast(`Guardado en el expediente como «${r.data}».`, 5000);
}
// Archivos soltados en la ventana mientras se ve un expediente
async function dropFiles(paths) { if (!X.sel) return toast('Primero crea o elige un expediente.'); afterAdd(await pf.expAddFiles(X.sel, paths)); }

window.Expedientes = { open, dropFiles, addPaths, saveCurrent, createDialog: () => createDialog(), mas: moreDialog, desdeDrive: fromDrive, accion: act, elegido, _x: X };
})();
