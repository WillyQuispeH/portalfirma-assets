/* global pf, $, show, toast, requireLogin, liberar */
'use strict';
// Pantalla de inicio de PortalFirma Asset: acciones y documentos recientes.



// Inicio ordenado por niveles: lo esencial para empezar, lo que ahorra tiempo y lo avanzado.
// Cada función muestra para qué sirve; las nuevas llevan «Nuevo» hasta que se abren por primera vez.
// El inicio de Gestión documental (con la biblioteca de plantillas) y «Recientes» están en React:
// src/ui/components/functional/gestion/inicio, .../recientes y .../editor-pdf. Aquí quedan las acciones (homeAction) y el menú nativo.
async function openRecent(p) { const ok = await window.editor.openPaths([p], true); if (ok === false) toast('No se pudo abrir: el archivo ya no está en esa ubicación.', 4000); }
function renderHome() { const el = $('#homeBody'); liberar(el); window.ReactUI.montar('GestionInicio', el); }
// Acciones que necesitan un documento: si no hay uno abierto, se pide primero.
async function withDoc(fn) {
  if (window.editor.hasDoc()) { window.studio.goEditor(); return fn(); }
  const ok = await window.editor.openDialog(false); if (ok) return fn();
}
async function homeAction(k) {
  const E = window.editor;
  switch (k) {
    case 'open': return E.openDialog(true);
    case 'new': return E.createBlank();
    case 'combine': case 'convert': { const r = await pf.edPick(true); if (r.ok && r.data.length) return E.openPaths(r.data, true); return; }
    case 'edittext': return withDoc(() => E.tool('edittext'));
    case 'ocr': return withDoc(() => E.ocrDialog());
    case 'organize': return withDoc(() => E.tool('select'));
    case 'split': return withDoc(() => E.splitDialog());
    case 'compress': return withDoc(() => E.compress());
    case 'export': return withDoc(() => E.exportDialog());
    case 'print': return withDoc(() => E.print());
    case 'plan': return window.members(() => { window.studio.goEditor(); return E.planWizard(); });
    case 'ai': return window.members(() => { if (E.hasDoc()) { window.studio.goEditor(); return window.Asistente.open(); } return window.Asistente.draftDialog(); }, 'El asistente legal con IA es exclusivo para clientes de Portalfirma. Inicia sesión con tu cuenta para usarlo.');
    case 'tpls': return $('#tplLib')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    case 'send': return E.hasDoc() ? window.members(() => { window.studio.goEditor(); return E.sendToSign(); }) : requireLogin(() => show('drop'), 'Para enviar documentos a firmar, inicia sesión en Portalfirma.', 'send');
    case 'tpl': return requireLogin(() => { show('tpl'); window.openTemplates && window.openTemplates(); }, 'Para usar la Notaría virtual, inicia sesión en Portalfirma.', 'tpl');
    case 'ops': { show('ops'); return window.Operaciones.open(); }
    case 'bulk': return window.Masiva.open();
    case 'flows': return window.Flujos.open();
    case 'exp': return window.Expedientes.open();
    case 'plazos': return window.Plazos.open();
    case 'escr': return window.Escrituras.open();
  }
}

// Soporte por WhatsApp
const WHATSAPP_SOPORTE = '56972525400';
function whatsapp(text = 'Hola, necesito ayuda con PortalFirma Asset.') { pf.openUrl(`https://wa.me/${WHATSAPP_SOPORTE}?text=${encodeURIComponent(text)}`); }

// ---- Pestaña «Recientes»: todos los documentos, con búsqueda y páginas de 20
window.Recientes = { open() { show('recientes'); const el = $('#view-recientes'); liberar(el); window.ReactUI.montar('GestionRecientes', el); } };

window.studio = {
  whatsapp,
  goHome() { show('home'); renderHome(); },
  goEditor() { if ($('#view-editor').classList.contains('hidden')) show('editor'); window.editor.open(); },
  editorVisible: () => !$('#view-editor').classList.contains('hidden'),
  accion: homeAction, abrirReciente: openRecent, // para React
};

// Menú nativo (Archivo, Herramientas, Ver)
pf.onMenu(async (action, arg) => {
  const E = window.editor;
  switch (action) {
    case 'home': return window.studio.goHome();
    case 'apiDiag': return window.ApiDiag.open();
    case 'new': return E.createBlank();
    case 'open': return E.openDialog(true);
    case 'openRecent': return E.openPaths([arg], true);
    case 'combine': { const r = await pf.edPick(true); if (r.ok && r.data.length) E.openPaths(r.data, E.hasDoc() ? false : true); return; }
    case 'convert': { const r = await pf.edPick(true); if (r.ok && r.data.length) E.openPaths(r.data, true); return; }
    case 'save': return E.hasDoc() && E.save();
    case 'saveAs': return E.hasDoc() && E.saveAs();
    case 'saveAndClose': { const ok = await E.saveAll(); if (ok) pf.closeNow(); return; }
    case 'export': return withDoc(() => E.exportDialog(arg));
    case 'plan': return window.members(() => { window.studio.goEditor(); return E.planWizard(); });
    case 'send': return window.members(() => withDoc(() => E.sendToSign()));
    case 'close': if (!$('#view-editor').classList.contains('hidden')) return E.closeDoc(); return;
    case 'print': return withDoc(() => E.print());
    case 'tplDesign': return withDoc(() => window.Plantillas.enterDesign());
    case 'tplList': window.studio.goHome(); return setTimeout(() => $('#tplLib')?.scrollIntoView({ block: 'start' }), 200);
    case 'find': return withDoc(() => E.find());
    case 'findNext': return E.hasDoc() && E.findStep(1);
    case 'findPrev': return E.hasDoc() && E.findStep(-1);
    case 'fullscreen': return E.hasDoc() && !$('#view-editor').classList.contains('hidden') ? E.reading() : pf.setFullScreen();
    case 'nextTab': return E.cycleTab(1);
    case 'prevTab': return E.cycleTab(-1);
    case 'tool': return withDoc(() => E.tool(arg));
    case 'ocr': return withDoc(() => E.ocrDialog());
    case 'compress': return withDoc(() => E.compress());
    case 'split': return withDoc(() => E.splitDialog());
    case 'number': return withDoc(() => E.number());
    case 'watermark': return withDoc(() => E.watermark());
    case 'zoom': if (E.hasDoc()) E.zoom(arg); return;
  }
});
pf.onRecentChanged(() => window.dispatchEvent(new Event('pf:recientes'))); // React vuelve a leer la lista

window.Inmo.inicio(); // PortalFirma Asset abre en el inicio inmobiliario
