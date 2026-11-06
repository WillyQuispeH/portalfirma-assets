/* global liberar, pf, $, toast, closeModal, show, api, startAnalysis */
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
  window.Ventanas.abrir('agente.expAvance', { icono: 'drive', titulo: 'Copiando desde Google Drive…', detalle: `${r.data.length} archivo(s)` }, { clave: 'modal-14' });
  const paths = []; for (const f of r.data) { const d = await pf.driveDownload(f.id); if (d.ok) paths.push(d.data); }
  closeModal(); afterAdd(await pf.expAddFiles(e.id, paths, { note: `Se copiaron ${paths.length} archivo(s) desde Google Drive` }));
}
// Llamado por el explorador de Drive (modo sin selector) con los archivos ya descargados
async function addPaths(paths, note) { if (!X.sel) return toast('Primero elige un expediente.'); afterAdd(await pf.expAddFiles(X.sel, paths, { note })); }

async function paths(files) {
  const out = [];
  if (files.length > 1) window.Ventanas.abrir('agente.expAvance', { icono: 'files', titulo: `Preparando ${files.length} archivos…` }, { clave: 'modal-15' });
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

const tipos = () => Object.entries(TYPES).map(([k, [l]]) => [k, l]);
function createDialog(after) {
  window.Ventanas.abrir('agente.expNuevo', {
    tipos: tipos(),
    alCrear: async (o) => {
      if (o.storage === 'drive') { const st = (await pf.driveStatus()).data || {}; if (!st.connected) { closeModal(); toast('Primero conecta Google Drive; después vuelve a crear el expediente.', 6000); window.Drive.open({ purpose: 'connect' }); return; } }
      const r = await pf.expCreate(o); if (!r.ok) { toast(r.error, 6000); return false; }
      closeModal(); if (after) return after(r.data);
      await open(r.data.id); toast('Expediente creado. Agrega sus documentos.');
    },
  }, { clave: 'modal-16' });
}
function moreDialog(e) {
  window.Ventanas.abrir('agente.expMas', {
    nombre: e.name, tipos: tipos(), tipo: e.type, notas: e.notes || '',
    detalle: `Creado el ${fmtD(e.created)} · ${e.storage === 'drive' ? 'Google Drive' : (e.path || '')}`,
    alGuardar: async (v) => { closeModal(); await pf.expUpdate(e.id, v); recargar(e.id); },
    alQuitar: () => window.Ventanas.abrir('agente.expQuitar', {
      nombre: e.name, enDrive: e.storage === 'drive',
      alConfirmar: async () => { closeModal(); await pf.expRemove(e.id); recargar(null); },
    }, { clave: 'modal-18' }),
  }, { clave: 'modal-17' });
}
// Guardar el documento abierto en el editor dentro de un expediente
async function saveCurrent() {
  const l = await pf.expList(); const list = l.ok ? l.data : [];
  const name = (window.editor._state?.name || 'Documento.pdf').replace(/\.[^.]+$/, '') + '.pdf';
  window.Ventanas.abrir('agente.expGuardar', {
    nombre: name, expedientes: list.map((x) => [x.id, x.name + (x.storage === 'drive' ? ' (Drive)' : '')]),
    alNuevo: (nm) => createDialog(async (x) => { await doSave(x.id, nm); }),
    alGuardar: async (id, nm) => { closeModal(); await doSave(id, nm); },
  }, { clave: 'modal-19' });
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
