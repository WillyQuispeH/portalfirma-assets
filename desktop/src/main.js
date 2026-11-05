const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme, protocol, net, nativeImage, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');
const { openForEditor, EXTENSIONS, tmpDir, htmlToPdf } = require('./convert');
const ai = require('./ai');
const pf = process.env.PF_MOCK === '1' ? require('./mock') : require('./portalfirma');

const MAX_BYTES = 20 * 1024 * 1024; // límite del conector (~20 MB)
const APP_NAME = 'PortalFirma Asset';
app.setName(APP_NAME);
// fotos guardadas en este computador (las que vienen de Google Drive): pffoto://f/<propiedad>/<archivo>
protocol.registerSchemesAsPrivileged([{ scheme: 'pffoto', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const fotosDir = () => { const d = path.join(process.env.PF_INMO_DIR || path.join(app.getPath('userData'), 'inmo'), 'fotos'); fs.mkdirSync(d, { recursive: true }); return d; };
let win = null;
// a la ventana, solo si sigue viva: en Mac se puede cerrar con Asset abierto (y el WhatsApp sigue trabajando)
function toUI(...a) { try { if (win && !win.isDestroyed()) win.webContents.send(...a); } catch {} }
let pendingFiles = []; // archivos abiertos antes de que la ventana esté lista
let docState = { name: '', dirty: false, hasDoc: false, dirtyNames: [] };
let quitting = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 880, minWidth: 980, minHeight: 640,
    title: APP_NAME,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#12141a' : '#f6f7fb',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => { if (pendingFiles.length) { openInEditor(pendingFiles); pendingFiles = []; } });
  win.on('close', (e) => { // aviso de cambios sin guardar
    // 0.16.20 · «siempre activo»: cerrar la ventana la oculta; Asset sigue atendiendo WhatsApp y siguiendo firmas
    if (!quitting && siempreActivo() && !process.env.PF_MOCK) { e.preventDefault(); win.hide(); if (process.platform === 'darwin') app.dock?.hide?.(); return; }
    const names = docState.dirtyNames?.length ? docState.dirtyNames : (docState.dirty ? [docState.name] : []);
    if (!names.length || win.__forceClose) return;
    e.preventDefault();
    const many = names.length > 1;
    const r = dialog.showMessageBoxSync(win, { type: 'warning', buttons: [many ? 'Guardar todo' : 'Guardar', 'Cancelar', 'No guardar'], defaultId: 0, cancelId: 1,
      message: many ? `Hay ${names.length} documentos con cambios sin guardar` : `¿Guardar los cambios de «${names[0]}»?`,
      detail: (many ? names.map((n) => '• ' + n).join('\n') + '\n\n' : '') + 'Si no guardas, se perderán los cambios.' });
    if (r === 0) win.webContents.send('menu', 'saveAndClose');
    if (r === 2) { win.__forceClose = true; win.close(); }
    if (r === 1) quitting = false;
  });
  buildMenu();
  // al volver a la ventana, la cartera trae lo que cambió en el servidor
  win.on('focus', () => { try { inmo.sincronizar(); } catch {} });
  // Los enlaces externos se abren en el navegador del sistema.
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function readDoc(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.pdf', '.docx'].includes(ext)) throw new Error('Solo se aceptan archivos PDF o DOCX.');
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_BYTES) throw new Error('El archivo supera los 20 MB permitidos.');
  return { name: path.basename(filePath), size: stat.size, path: filePath };
}
const SUPPORTED = new RegExp(`\\.(${EXTENSIONS.join('|')})$`, 'i');
function openInEditor(paths) { win.webContents.send('open-in-editor', paths); }

// Mac: arrastrar al ícono del Dock o "Abrir con…" → se abre en el editor
app.on('open-file', (e, filePath) => {
  e.preventDefault();
  if (win && !win.webContents.isLoading()) openInEditor([filePath]); else pendingFiles.push(filePath);
});
// Windows: el archivo llega como argumento
pendingFiles.push(...process.argv.slice(1).filter((a) => SUPPORTED.test(a)));

// En desarrollo (yarn dev, PF_DEV=1) nodemon reinicia la app y la instancia anterior puede tardar un
// instante en cerrarse: sin esta excepción la nueva se encontraría con el bloqueo y se cerraría sola.
const gotLock = process.env.PF_DEV === '1' || app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', (_e, argv) => {
  const f = argv.filter((a) => SUPPORTED.test(a));
  if (win) { if (!win.isVisible()) { win.show(); app.dock?.show?.(); } if (win.isMinimized()) win.restore(); win.focus(); if (f.length) openInEditor(f); }
});

// 0.16.20 · Asset siempre activo (por defecto): abre al iniciar sesión en el computador (oculto), no deja que el sistema
// lo suspenda y sigue corriendo con la ventana cerrada. Así los asistentes responden y siguen firmas sin que haya que
// tener la app a la vista. (24/7 aun con el computador apagado requiere el servicio en el servidor de Portalfirma.)
const siempreActivo = () => store.get('siempreActivo') !== false;
let bloqueoSueno = null;
function aplicarSiempreActivo() {
  const on = siempreActivo();
  if (!process.env.PF_MOCK) { try { app.setLoginItemSettings({ openAtLogin: on, openAsHidden: on, args: on ? ['--oculto'] : [] }); } catch {} }
  if (on && bloqueoSueno == null) bloqueoSueno = powerSaveBlocker.start('prevent-app-suspension');
  if (!on && bloqueoSueno != null) { try { powerSaveBlocker.stop(bloqueoSueno); } catch {} bloqueoSueno = null; }
  return { activo: on };
}
app.whenReady().then(() => {
  aplicarSiempreActivo();
  protocol.handle('pffoto', (req) => { const u = new URL(req.url); const base = u.host === 'l' ? (fs.mkdirSync(leadsDir(), { recursive: true }), leadsDir()) : fotosDir(); const f = path.resolve(base, decodeURIComponent(u.pathname).replace(/^\/+/, ''));
    if (!f.startsWith(base + path.sep) || !fs.existsSync(f)) return new Response('', { status: 404 }); return net.fetch(require('url').pathToFileURL(f).toString()); });
  createWindow();
  if (process.argv.includes('--oculto') || app.getLoginItemSettings?.().wasOpenedAsHidden) { win.once('ready-to-show', () => win.hide()); setTimeout(() => { try { win.hide(); app.dock?.hide?.(); } catch {} }, 1500); }
});
app.on('before-quit', () => { quitting = true; });

// ---- Menú nativo ----
const send = (action, arg) => () => toUI('menu', action, arg);
function recents() { return (store.get('recent') || []).filter((r) => r && r.path); }
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const rec = recents().slice(0, 12);
  const template = [
    ...(isMac ? [{ label: APP_NAME, submenu: [{ role: 'about', label: `Acerca de ${APP_NAME}` }, { type: 'separator' }, { role: 'hide', label: 'Ocultar' }, { role: 'hideOthers', label: 'Ocultar otros' }, { type: 'separator' }, { role: 'quit', label: 'Salir' }] }] : []),
    { label: 'Archivo', submenu: [
      { label: 'Inicio', accelerator: 'CmdOrCtrl+Shift+H', click: send('home') },
      { type: 'separator' },
      { label: 'Crear PDF…', accelerator: 'CmdOrCtrl+N', click: send('new') },
      { label: 'Abrir…', accelerator: 'CmdOrCtrl+O', click: send('open') },
      { label: 'Abrir reciente', submenu: rec.length ? [...rec.map((r) => ({ label: r.name, click: send('openRecent', r.path) })), { type: 'separator' }, { label: 'Borrar lista', click: () => { store.set('recent', []); buildMenu(); toUI('recent-changed'); } }] : [{ label: 'Sin documentos recientes', enabled: false }] },
      { label: 'Combinar archivos…', accelerator: 'CmdOrCtrl+Shift+M', click: send('combine') },
      { label: 'Convertir a PDF (Word, Excel, imágenes)…', click: send('convert') },
      { type: 'separator' },
      { label: 'Guardar', accelerator: 'CmdOrCtrl+S', click: send('save') },
      { label: 'Guardar como…', accelerator: 'CmdOrCtrl+Shift+S', click: send('saveAs') },
      { label: 'Exportar', submenu: [
        { label: 'Word (.docx)…', click: send('export', 'docx') },
        { label: 'Imágenes PNG…', click: send('export', 'png') },
        { label: 'Imágenes JPG…', click: send('export', 'jpg') },
        { label: 'Texto (.txt)…', click: send('export', 'txt') },
      ] },
      { type: 'separator' },
      { label: 'Imprimir…', accelerator: 'CmdOrCtrl+P', click: send('print') },
      { type: 'separator' },
      { label: 'Crear plantilla con este documento…', click: send('tplDesign') },
      { label: 'Mis plantillas…', click: send('tplList') },
      { type: 'separator' },
      { label: 'Firmar plano arquitectónico…', click: send('plan') },
      { label: 'Enviar a firmar…', accelerator: 'CmdOrCtrl+Enter', click: send('send') },
      { type: 'separator' },
      { label: 'Cerrar documento', accelerator: 'CmdOrCtrl+W', click: send('close') },
      ...(isMac ? [] : [{ role: 'quit', label: 'Salir' }]),
    ] },
    { label: 'Edición', submenu: [{ role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' }, { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' },
      { type: 'separator' },
      { label: 'Buscar…', accelerator: 'CmdOrCtrl+F', click: send('find') },
      { label: 'Buscar siguiente', accelerator: 'CmdOrCtrl+G', click: send('findNext') },
      { label: 'Buscar anterior', accelerator: 'CmdOrCtrl+Shift+G', click: send('findPrev') }] },
    { label: 'Herramientas', submenu: [
      { label: 'Editar texto', accelerator: 'CmdOrCtrl+E', click: send('tool', 'edittext') },
      { label: 'Agregar texto', accelerator: 'CmdOrCtrl+T', click: send('tool', 'text') },
      { label: 'Agregar imagen', click: send('tool', 'image') },
      { label: 'Tapar', click: send('tool', 'whiteout') },
      { type: 'separator' },
      { label: 'Reconocer texto (OCR)…', accelerator: 'CmdOrCtrl+Shift+R', click: send('ocr') },
      { label: 'Comprimir PDF', click: send('compress') },
      { label: 'Dividir PDF…', click: send('split') },
      { label: 'Numerar páginas…', click: send('number') },
      { label: 'Marca de agua…', click: send('watermark') },
    ] },
    { label: 'Ver', submenu: [
      { label: 'Acercar', accelerator: 'CmdOrCtrl+Plus', click: send('zoom', 1) },
      { label: 'Alejar', accelerator: 'CmdOrCtrl+-', click: send('zoom', -1) },
      { label: 'Tamaño ajustado', accelerator: 'CmdOrCtrl+0', click: send('zoom', 0) },
      { type: 'separator' },
      { label: 'Pantalla completa (modo lectura)', accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11', click: send('fullscreen') },
      { type: 'separator' },
      { label: 'Pestaña siguiente', accelerator: 'Ctrl+Tab', click: send('nextTab') },
      { label: 'Pestaña anterior', accelerator: 'Ctrl+Shift+Tab', click: send('prevTab') },
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
    ] },
    { role: 'windowMenu', label: 'Ventana' },
    { label: 'Ayuda', submenu: [{ label: 'Conexión directa con Portalfirma (diagnóstico)…', click: send('apiDiag') }, { type: 'separator' }, { label: 'Portalfirma', click: () => shell.openExternal('https://www.portalfirma.cl') }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
function addRecent(p) {
  if (!p || !fs.existsSync(p)) return;
  const list = recents().filter((r) => r.path !== p);
  list.unshift({ path: p, name: path.basename(p), date: new Date().toISOString(), size: fs.statSync(p).size });
  store.set('recent', list.slice(0, 500)); app.addRecentDocument(p); buildMenu();
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else if (win && !win.isVisible()) { win.show(); app.dock?.show?.(); } });

// ---- IPC: cada handler devuelve {ok, data} o {ok:false, error, code} ----
// Canales que solo usa el administrador (rol ADMIN del usuario de Asset; el resto lo usa también el corredor)
const SOLO_ADMIN = { 'gdrive:connect': 'conexiones', 'gdrive:setClient': 'conexiones', 'gdrive:disconnect': 'conexiones', 'ml:conectar': 'conexiones', 'ml:desconectar': 'conexiones', 'ml:contacto': 'conexiones',
  'res:configurar': 'conexiones', 'pv:claveWa': 'conexiones', 'obs:configurar': 'conexiones', 'dir:configurar': 'conexiones', 'ops:setFileKey': 'conexiones', 'ai:config': 'conexiones',
  'pv:configurar': 'fernanda', 'wallet:topup': 'saldo', 'inmo:propArchivar': 'borrar', 'inmo:perBorrar': 'borrar', 'leads:borrar': 'borrar', 'neg:borrar': 'borrar',
  'leads:asignar': 'reasignar', 'neg:corredor': 'reasignar', 'inmo:importar': 'importar', 'pv:importar': 'importar', 'fmt:configurar': 'documentos', 'usr:listar': 'usuarios', 'usr:crear': 'usuarios', 'usr:editar': 'usuarios', 'usr:clave': 'usuarios', 'usr:wechatia': 'usuarios' };
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { if (SOLO_ADMIN[channel] && !process.env.PF_SIN_PERFILES) permisos.permiso(SOLO_ADMIN[channel]); return { ok: true, data: await fn(...args) }; }
    catch (e) {
      let msg = e.message || String(e);
      if (/MCP error -32602|Input validation error/i.test(msg)) msg = 'Portalfirma rechazó los datos de la consulta (formato inválido).'; // no mostrar el error técnico completo
      else if (/MCP error -?\d+/i.test(msg)) msg = 'Portalfirma no respondió correctamente. Intenta de nuevo en unos minutos.';
      return { ok: false, error: msg, code: e.code, data: e.data };
    }
  });
}

ipcMain.on('cfg:sync', (e) => { e.returnValue = { version: app.getVersion(), postventa: process.env.PF_POSTVENTA === '1', noTours: process.env.PF_NO_TOURS === '1' || (process.env.PF_MOCK === '1' && process.env.PF_TOURS !== '1'), oficina: process.env.PF_MOCK !== '1' || process.env.PF_OFICINA === '1' }; });
let lastSession = null;
const remember = (s) => { lastSession = s; return s; };
handle('auth:restore', async () => remember(await pf.tryRestore()));
handle('auth:login', async () => { try { docs.limpiar(); } catch {} return remember(await pf.login()); });
handle('auth:logout', async () => { lastSession = null; try { docs.limpiar(); } catch {} return pf.logout(); });
handle('auth:session', async () => remember(await pf.session()));

// ---- Cuenta de Asset (login propio contra la API de Asset; Portalfirma queda solo como conexión para firmar) ----
const asset = require('./asset');
// La sesión define quién usa la app (permisos.js) y carga la cartera de su corredora (inmo.js) y el equipo (equipo.js)
let yoAsset = null;
const usuarioAsset = () => yoAsset || asset.actual?.() || null;
async function sesionAsset(u) {
  yoAsset = u || null; if (!u) return u;
  await equipo.cargar();
  await inmo.iniciar(u);
  setTimeout(() => { try { leads.sincronizarTodos(); } catch {} }, 500); // los leads quedan como persona en la base
  return u;
}
async function cerrarSesionAsset() { try { await inmo.cerrar(); } catch {} equipo.vaciar(); yoAsset = null; }
handle('asset:restaurar', async () => sesionAsset(await asset.restaurar()));
handle('asset:ingresar', async (email, clave) => { const u = await asset.ingresar(email, clave); if (yoAsset && yoAsset.id !== u.id) await cerrarSesionAsset(); return sesionAsset(u); });
handle('asset:yo', async () => { const u = await asset.yo(); yoAsset = u; return u; });
// al cerrar la sesión de Asset también se desconecta Portalfirma: en este equipo puede entrar otra persona
handle('asset:salir', async () => {
  await cerrarSesionAsset(); // manda lo pendiente de la cartera antes de cerrar el token
  await asset.salir();
  lastSession = null; try { docs.limpiar(); } catch {}
  try { await pf.logout(); } catch {}
  try { store.set('opsCache', undefined); pfapi.logout(); } catch {}
  return true;
});

// ---- Editor PDF ----
handle('editor:pick', async (multi) => {
  const r = await dialog.showOpenDialog(win, { properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [{ name: 'Documentos e imágenes', extensions: EXTENSIONS }] });
  return r.canceled ? [] : r.filePaths;
});
handle('editor:open', (p) => openForEditor(p));
handle('editor:save', async (bytes, suggested) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), suggested || 'documento.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(bytes));
  return r.filePath;
});
handle('editor:saveTo', (p, bytes) => { fs.writeFileSync(p, Buffer.from(bytes)); addRecent(p); return p; });
handle('editor:saveAs', async (bytes, suggested) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), (suggested || 'documento').replace(/\.[^.]+$/, '') + '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(bytes)); addRecent(r.filePath);
  return r.filePath;
});
handle('editor:chooseDir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Guardar aquí' });
  return r.canceled ? null : r.filePaths[0];
});
handle('editor:writeFile', (dir, name, bytes) => { const f = path.join(dir, name.replace(/[\\/:*?"<>|]/g, '-')); fs.writeFileSync(f, Buffer.from(bytes)); return f; });
handle('editor:saveText', async (txt, suggested) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), suggested), filters: [{ name: 'Texto', extensions: ['txt'] }] });
  if (r.canceled || !r.filePath) return null; fs.writeFileSync(r.filePath, txt, 'utf8'); return r.filePath;
});
handle('editor:exportDocx', async (pages, families, suggested) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), suggested), filters: [{ name: 'Word', extensions: ['docx'] }] });
  if (r.canceled || !r.filePath) return null;
  const { Document, Packer, Paragraph, TextRun, AlignmentType, PageBreak } = require('docx');
  const AL = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
  const children = [];
  pages.forEach((pg, pi) => {
    pg.paragraphs.forEach((pa, k) => {
      const runs = [];
      for (const r2 of pa.runs) r2.text.split('\n').forEach((t, n) => { if (n) runs.push(new TextRun({ break: 1 })); if (t) runs.push(new TextRun({ text: t, bold: !!r2.bold, italics: !!r2.italic, underline: r2.underline ? {} : undefined, size: Math.round((r2.size || 11) * 2), font: families[r2.family] || 'Arial' })); });
      if (pi > 0 && k === 0) runs.unshift(new PageBreak());
      children.push(new Paragraph({ children: runs, alignment: AL[pa.align] || AlignmentType.LEFT, spacing: { after: 120 } }));
    });
    if (!pg.paragraphs.length && pi > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
  });
  const doc = new Document({ creator: APP_NAME, sections: [{ children }] });
  fs.writeFileSync(r.filePath, await Packer.toBuffer(doc));
  return r.filePath;
});
handle('recent:list', () => recents().map((r) => ({ ...r, exists: fs.existsSync(r.path) })));
handle('recent:add', (p) => { addRecent(p); return true; });
handle('recent:remove', (p) => { store.set('recent', recents().filter((r) => r.path !== p)); buildMenu(); return true; });
handle('recent:clear', () => { store.set('recent', []); buildMenu(); return true; });
handle('doc:state', (st) => {
  docState = { ...docState, ...st };
  if (win) { win.setTitle(st.hasDoc ? `${st.name}${st.dirty ? ' •' : ''} — ${APP_NAME}` : APP_NAME); win.setDocumentEdited?.(!!st.dirty); if (st.path) win.setRepresentedFilename?.(st.path); }
  return true;
});
// ---- Asistente legal (IA) ----
handle('ai:status', () => ai.status());
handle('ai:config', (p) => ai.setConfig(p || {}));
handle('ai:models', () => ai.models());
handle('ai:chat', (req) => { if (!lastSession) { const e = new Error('El asistente legal es exclusivo para clientes de Portalfirma. Inicia sesión con tu cuenta.'); e.code = 'NEEDS_ACCOUNT'; throw e; } return ai.chat(req || {}); });
const gdrive = require('./gdrive');
// Fotos de una propiedad desde Google Drive (la carpeta de la empresa): se eligen en el selector de Google, se bajan,
// se pasan a JPG (también las HEIC del iPhone) de hasta 2048 px y quedan guardadas en este computador.
async function fotosDesdeDrive(propId) {
  const p = inmo.obtener(propId); const st = gdrive.status();
  if (!st.connected) { const e = new Error('Conecta el Google Drive de la empresa para elegir las fotos.'); e.code = 'NO_DRIVE'; throw e; }
  const calle = String(p.direccion || '').match(/^(.*?\d+)/)?.[1] || p.direccion || p.titulo || '';
  const picked = (await gdrive.pick(null, { multi: true, imagenes: true, query: calle.trim() })).filter((f) => !f.isFolder);
  if (!picked.length) return { agregadas: 0, total: (p.fotos || []).length, omitidas: [], cancelado: true };
  const dir = path.join(fotosDir(), p.id); fs.mkdirSync(dir, { recursive: true });
  const ya = new Set((p.fotos || []).map((u) => String(u).split('/').pop()));
  const nuevas = []; const omitidas = [];
  for (const [i, f] of picked.slice(0, 40).entries()) {
    const nombre = `d-${String(f.id).replace(/[^\w-]/g, '').slice(0, 40)}.jpg`; if (ya.has(nombre)) { omitidas.push({ name: f.name, motivo: 'ya estaba cargada' }); continue; }
    try {
      const { bytes } = await gdrive.bytesDe(f.id); let img = nativeImage.createFromBuffer(Buffer.from(bytes));
      if (img.isEmpty()) { omitidas.push({ name: f.name, motivo: /hei[cf]/i.test(f.mimeType || f.name) ? 'formato HEIC no legible en este computador' : 'no es una imagen legible' }); continue; }
      const { width } = img.getSize(); if (width > 2048) img = img.resize({ width: 2048, quality: 'best' });
      fs.writeFileSync(path.join(dir, nombre), img.toJPEG(86)); nuevas.push(`pffoto://f/${encodeURIComponent(p.id)}/${nombre}`);
    } catch (e) { omitidas.push({ name: f.name, motivo: e.message }); }
    if (i % 4 === 3) toUI('agent:event', { type: 'progreso', que: 'fotos', hechas: i + 1, total: picked.length });
  }
  if (picked.length > 40) omitidas.push({ name: `${picked.length - 40} fotos más`, motivo: 'máximo 40 por vez' });
  if (nuevas.length) inmo.parchear(p.id, (pp) => { pp.fotos = [...(pp.fotos || []), ...nuevas].slice(0, 60); }, `${nuevas.length} ${nuevas.length === 1 ? 'foto cargada' : 'fotos cargadas'} desde Google Drive`);
  return { agregadas: nuevas.length, total: (inmo.obtener(p.id).fotos || []).length, omitidas };
}
handle('gdrive:status', () => gdrive.status());
handle('gdrive:connect', () => gdrive.connect());
handle('gdrive:setClient', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Credencial OAuth de Google (JSON)', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return gdrive.setClientFile(r.filePaths[0]);
});
handle('gdrive:disconnect', () => gdrive.disconnect());
handle('gdrive:list', (opts) => gdrive.list(opts || {}));
handle('gdrive:folderDocs', (id) => gdrive.listFolderDocs(id));
handle('gdrive:download', (id) => gdrive.download(id));
handle('gdrive:pick', async (opts) => {
  try { return await gdrive.pick(win, opts || {}); }
  finally { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); if (process.platform === 'darwin') app.focus({ steal: true }); } } // vuelve a Studio al terminar en el navegador
});
handle('gdrive:pickCancel', () => gdrive.cancelPick());
handle('gdrive:pickReopen', () => gdrive.reopenPick());
handle('ai:wallet', () => ai.walletStatus());
handle('ai:redeem', (code) => ai.redeem(code));
handle('ai:draftPdf', async (html, name) => {
  const pdf = await htmlToPdf(`<style>@page{size:Letter;margin:2.5cm 2.5cm}body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;text-align:justify}h1{font-size:14pt;text-align:center;margin:0 0 18pt}h2{font-size:12pt;margin:14pt 0 6pt}p{margin:0 0 9pt}.ph{white-space:nowrap}.leyenda{margin-top:18pt;font-size:10.5pt;font-style:italic}</style>${html}`);
  const file = path.join(tmpDir(), String(name || 'Borrador').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 90) + '.pdf');
  fs.writeFileSync(file, pdf); return { file, bytes: new Uint8Array(pdf) };
});

// ---- Mis plantillas (biblioteca local: un PDF con la definición incrustada + una ficha .json) ----
const tplDir = () => { const d = path.join(app.getPath('userData'), 'plantillas'); fs.mkdirSync(d, { recursive: true }); return d; };
const safeName = (n) => String(n || 'Plantilla').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Plantilla';
handle('plantillas:list', () => fs.readdirSync(tplDir()).filter((f) => f.endsWith('.json')).map((f) => {
  try { const m = JSON.parse(fs.readFileSync(path.join(tplDir(), f), 'utf8')); const pdf = path.join(tplDir(), f.replace(/\.json$/, '.pdf')); return fs.existsSync(pdf) ? { ...m, file: pdf } : null; } catch { return null; }
}).filter(Boolean).sort((a, b) => String(b.updated).localeCompare(String(a.updated))));
handle('plantillas:exists', (name) => fs.existsSync(path.join(tplDir(), safeName(name) + '.pdf')));
handle('plantillas:save', (name, bytes, meta) => {
  const base = path.join(tplDir(), safeName(name));
  fs.writeFileSync(base + '.pdf', Buffer.from(bytes));
  fs.writeFileSync(base + '.json', JSON.stringify({ ...meta, name: safeName(name), updated: new Date().toISOString() }, null, 1));
  return base + '.pdf';
});
handle('plantillas:read', (file) => { if (!file.startsWith(tplDir())) throw new Error('Ruta no permitida'); return new Uint8Array(fs.readFileSync(file)); });
handle('plantillas:delete', (file) => { if (!file.startsWith(tplDir())) throw new Error('Ruta no permitida'); for (const f of [file, file.replace(/\.pdf$/, '.json')]) try { fs.unlinkSync(f); } catch {} return true; });

handle('app:closeNow', () => { if (win) { win.__forceClose = true; win.close(); } return true; });

// Guarda una copia temporal para enviarla al flujo de firma (subir + detectar firmantes).
handle('editor:temp', (bytes, name) => {
  const file = path.join(tmpDir(), (name || 'documento.pdf').replace(/[\\/:*?"<>|]/g, '-').replace(/\.[^.]+$/, '') + '.pdf');
  fs.writeFileSync(file, Buffer.from(bytes));
  return readDoc(file);
});

// ---- Notaría virtual ----
handle('tpl:search', (q) => pf.templateSearch(q, 20));
handle('tpl:forms', (id) => pf.templateForms(id));
handle('tpl:send', async (id, values, name) => {
  const r = await pf.templateSend(id, values);
  const operation = r?.operation ?? r?.operationNumber ?? r?.data?.operation ?? findKey(r, /operation/i);
  const history = store.get('history') || [];
  history.unshift({ operation, name: name || 'Plantilla notarial', date: new Date().toISOString() });
  store.set('history', history.slice(0, 200));
  return { raw: r, operation };
});
handle('open:path', (p) => { shell.showItemInFolder(p); return true; });
handle('wallet:balance', () => pf.balance());
handle('wallet:topup', async (amount, email) => {
  const r = await pf.topUp(amount, email);
  const url = r?.url || r?.payment_url || r?.paymentUrl || findUrl(r);
  if (url) shell.openExternal(url);
  return r;
});

handle('file:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Documentos', extensions: ['pdf', 'docx'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return readDoc(r.filePaths[0]);
});
handle('file:check', (p) => readDoc(p));

// Paso 1+2: subir el documento y detectar firmantes (igual que el conector)
// Portalfirma recibe PDF: un Word se convierte antes de subirlo (el servidor falla al enviar un .docx).
async function asPdfForSigning(filePath) {
  if (!/\.docx$/i.test(filePath)) return { path: filePath };
  const r = await openForEditor(filePath);
  const out = path.join(tmpDir(), r.name.replace(/[\\/:*?"<>|]/g, '-'));
  fs.writeFileSync(out, Buffer.from(r.bytes));
  return { path: out, converted: 'Word', original: path.basename(filePath) };
}
handle('doc:analyze', async (originalPath) => {
  const conv = await asPdfForSigning(originalPath);
  const filePath = conv.path;
  const info = { ...readDoc(filePath), converted: conv.converted, original: conv.original };
  const b64 = fs.readFileSync(filePath).toString('base64');
  const ing = await pf.ingest(b64, info.name);
  if (!ing?.document_id) throw new Error(ing?.message || 'Portalfirma no devolvió el documento.');
  const ext = await pf.extractSigners(ing.document_id);
  return { file: info, ingest: ing, extract: ext };
});
handle('doc:reextract', (documentId, configId) => pf.extractSigners(documentId, configId));

// Paso 3: enviar a firmar
handle('doc:send', async (payload) => {
  const r = await pf.sendToSign(payload);
  const operation = r?.operation ?? r?.operationNumber ?? r?.numberOperation ?? findKey(r, /operation/i);
  // Sin número de operación y con un mensaje de error, el envío falló (aunque el servidor no lo marque como error).
  const msg = typeof r?.message === 'string' ? r.message : '';
  if (operation == null && /error|fall[oó]|failed|status code/i.test(msg)) {
    const code = /status code (\d+)/.exec(msg)?.[1];
    throw new Error(code ? `Portalfirma no pudo crear la operación (error ${code} del servidor). Revisa «Mis operaciones» antes de reintentar, para no duplicarla.` : msg);
  }
  const history = store.get('history') || [];
  history.unshift({ operation, name: payload.__fileName, date: new Date().toISOString() });
  store.set('history', history.slice(0, 200));
  return { raw: r, operation };
});

// ---- Mis operaciones sincronizadas con Portalfirma ----
const sync = require('./sync'); sync.init(pf, process.env.PF_MOCK === '1' && !process.env.PF_API_BASE ? null : require('./pfapi'));
handle('ops:status', () => sync.status());
handle('ops:setPhone', (p) => sync.setPhone(p));
// 0.16.16 · lo enviado desde Asset muestra a qué propiedad pertenece
const conProp = (r) => { try { for (const it of r?.items || []) if (it.asset?.propId) { const p = require('./inmo').obtener(it.asset.propId); if (p) it.asset.codigo = p.codigo; } } catch {} return r; };
handle('ops:sync', async (full) => conProp(await sync.sync({ full: !!full })));
handle('ops:list', () => conProp(sync.list()));
handle('ops:detail', (n, refresh) => sync.detail(n, { refresh: !!refresh }));
handle('ops:file', async (n) => { const f = await sync.file(n); return { path: f, bytes: new Uint8Array(fs.readFileSync(f)) }; });
handle('ops:saveFile', async (n) => {
  const f = await sync.file(n);
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), path.basename(f)), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null; fs.copyFileSync(f, r.filePath); return r.filePath;
});
handle('ops:share', async (n) => {
  const f = await sync.file(n);
  if (process.platform === 'darwin') { const { ShareMenu } = require('electron'); new ShareMenu({ filePaths: [f] }).popup({ window: win }); return 'menu'; }
  shell.showItemInFolder(f); return 'folder';
});
handle('ops:fileKey', () => !!pf.fileKey());
handle('ops:setFileKey', (v) => pf.setFileKey(v));

// ---- API directa de Portalfirma (inicio de sesión local + diagnóstico) ----
const pfapi = require('./pfapi');
handle('api:login', (email, password) => pfapi.login(email, password));
handle('api:logout', () => { store.set('opsCache', undefined); return pfapi.logout(); });
handle('api:user', () => pfapi.user());
handle('api:wallet', async () => { const w = await pfapi.wallet(); return { amount: w?.amount ?? null }; });
handle('api:diag', async () => {
  const out = await pfapi.diagnostic();
  const name = `PortalFirma-diagnostico-API-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  const dir = process.env.PF_DIAG_DIR || app.getPath('downloads');
  fs.writeFileSync(path.join(dir, name), JSON.stringify(out, null, 2));
  return { file: name, tests: out.tests.map((t) => ({ name: t.name, status: t.status, ok: t.ok, success: t.success })) };
});

// ---- Plazos y vencimientos ----
// ---- Escrituras y protocolizaciones ----
// Lee minutas (Word, texto) y documentos privados (PDF: el texto se extrae en la ventana con pdf.js).
// Escrituras: solo Word (todas sus variantes). Un PDF no siempre deja leer su texto con exactitud.
const W = require('./wordtext');
async function escrRead(file) {
  const ext = path.extname(file).toLowerCase(); const name = path.basename(file);
  if (!W.WORD_EXT.includes(ext)) throw new Error(`«${name}»: para escrituras sube la minuta en Word (.doc, .docx, .rtf u .odt). Los PDF no se aceptan porque su texto no siempre se puede leer con exactitud.`);
  const st = fs.statSync(file); if (st.size > 40 * 1024 * 1024) throw new Error(`«${name}» supera los 40 MB.`);
  const text = await W.wordText(file);
  const pdf = ext === '.docx' ? (await openForEditor(file)).bytes : await htmlToPdf(W.textToHtml(text)); // «cómo llegó»
  return { path: file, name, ext, text, raw: new Uint8Array(fs.readFileSync(file)), pdf: new Uint8Array(pdf) };
}
handle('escr:open', async (kind) => {
  const r = await dialog.showOpenDialog(win, { title: 'Abrir minuta (Word)', properties: ['openFile'], filters: [{ name: 'Word', extensions: W.WORD_EXT.map((e) => e.slice(1)) }] });
  if (r.canceled) return [];
  const out = []; for (const f of r.filePaths) out.push(await escrRead(f)); return out;
});
// Documentos privados (protocolización y reducción): se pide Word (lectura exacta). Si solo hay PDF o una
// foto/escaneo, la ventana lo lee con IA. Word se convierte también a PDF para adjuntarlo y contar hojas.
const PRIV_EXT = [...W.WORD_EXT.map((e) => e.slice(1)), 'pdf', 'jpg', 'jpeg', 'png', 'webp'];
async function privRead(file) {
  const ext = path.extname(file).toLowerCase(); const name = path.basename(file);
  if (!PRIV_EXT.includes(ext.slice(1))) throw new Error(`«${name}»: se acepta Word (.doc, .docx, .rtf, .odt), PDF o una imagen (JPG, PNG).`);
  if (fs.statSync(file).size > 40 * 1024 * 1024) throw new Error(`«${name}» supera los 40 MB.`);
  if (W.WORD_EXT.includes(ext)) {
    const text = await W.wordText(file); const raw = fs.readFileSync(file);
    const pdf = ext === '.docx' ? (await openForEditor(file)).bytes : await htmlToPdf(W.textToHtml(text));
    return { path: file, name, kind: 'word', text, bytes: new Uint8Array(pdf), raw: new Uint8Array(raw) };
  }
  const r = await openForEditor(file);
  return { path: file, name, kind: r.kind, mime: r.mime || 'application/pdf', bytes: new Uint8Array(r.bytes) };
}
handle('escr:openPriv', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Documento privado (de preferencia en Word)', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Word', extensions: W.WORD_EXT.map((e) => e.slice(1)) }, { name: 'PDF o imagen (se lee con IA)', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'] }] });
  if (r.canceled) return []; const out = []; for (const f of r.filePaths) out.push(await privRead(f)); return out;
});
handle('escr:readPriv', async (paths) => { const out = []; for (const f of paths) out.push(await privRead(f)); return out; });
// Lectura con IA de un PDF o una imagen (incluida en el valor del trámite: no descuenta tokens)
handle('ai:leerDoc', (args) => ai.leerDocumento(args));
handle('escr:read', async (paths) => { const out = []; for (const f of paths) out.push(await escrRead(f)); return out; });
handle('escr:cfg', () => store.get('escrNotaria') || null);
handle('escr:setCfg', (c) => { store.set('escrNotaria', c); return true; });
handle('escr:saveDocx', async (kind, data, notaria, suggested) => {
  const X = require('./escrituras-docx');
  const buf = kind === 'caratula' ? await X.caratulaDocx(data, notaria) : await X.escrituraDocx(data, notaria);
  if (process.env.PF_SAVE_DIR) { const f = path.join(process.env.PF_SAVE_DIR, suggested); fs.writeFileSync(f, buf); return f; }
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), suggested), filters: [{ name: 'Word', extensions: ['docx'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, buf); return r.filePath;
});
handle('escr:docxBytes', async (kind, data, notaria) => { const X = require('./escrituras-docx'); return new Uint8Array(kind === 'caratula' ? await X.caratulaDocx(data, notaria) : await X.escrituraDocx(data, notaria)); });
handle('escr:savePdf', async (bytes, suggested) => {
  if (process.env.PF_SAVE_DIR) { const f = path.join(process.env.PF_SAVE_DIR, suggested); fs.writeFileSync(f, Buffer.from(bytes)); return f; }
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), suggested), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(bytes)); addRecent(r.filePath); return r.filePath;
});

// ---- Trámites notariales: pago e inicio (Portalfirma como puente con la notaría) ----
const notarias = require('./notarias');
handle('not:saldo', () => notarias.saldo(pfapi));
handle('not:list', () => notarias.list());
handle('not:tarifas', () => notarias.tarifas(pfapi));
handle('not:archivo', (op, name) => notarias.archivo(op, name));
handle('not:red', () => notarias.red(pfapi));
handle('not:iniciar', (payload, files) => notarias.iniciar(pfapi, payload, files));
// Agente Portalfirma: conversa y usa todas las herramientas del MCP con la sesión de Studio
const agente = require('./agente').crear({ pf, ai: require('./ai'), emit: (e) => toUI('agent:event', e) });
if (process.env.PF_MOCK === '1') { global.__agente = agente; global.__pfMock = pf; }
handle('agent:send', (texto) => agente.enviar(texto, { email: store.get('payerEmail') || '' }));
handle('agent:confirm', (id, r) => agente.responder(id, r));
handle('agent:attach', (name, bytes) => agente.adjuntar(String(name), bytes));
handle('agent:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'PDF o Word', extensions: ['pdf', 'docx', 'doc'] }] });
  if (r.canceled) return null; let l = null; for (const f of r.filePaths) l = agente.adjuntar(path.basename(f), fs.readFileSync(f)); return l;
});
handle('agent:unattach', (name) => agente.quitar(String(name)));
handle('agent:reset', () => agente.reiniciar());
// Conversaciones guardadas (barra izquierda del Agente)
const convs = require('./conversaciones');
handle('conv:listar', (q) => convs.listar(q));
handle('conv:abrir', (id) => { const c = convs.obtener(id); agente.restaurar(c.messages); return { ...c, messages: undefined }; });
handle('conv:guardar', (id, o) => convs.guardar(id, { ...(o || {}), messages: agente.mensajes() }));
handle('conv:nueva', () => { agente.reiniciar(); return convs.nuevoId(); });
handle('conv:renombrar', (id, t) => convs.renombrar(id, t));
handle('conv:fijar', (id, v) => convs.fijar(id, v));
handle('conv:borrar', (id) => convs.borrar(id));
handle('agent:tools', () => agente.herramientas());
handle('agent:log', () => agente.actividad());
// Aprendizaje de reglas: casos corregidos → propuestas de la IA → aprobación de Portalfirma
const reglas = require('./reglas');
handle('reglas:get', () => reglas.obtener(pfapi));
handle('reglas:caso', (c) => reglas.agregarCaso(pfapi, c || {}));
handle('reglas:casos', () => reglas.listarCasos());
handle('reglas:borrarCaso', (id) => reglas.borrarCaso(id));
handle('reglas:proponer', (ctx) => reglas.proponer(ctx || {}));
handle('reglas:probar', (p) => reglas.probar(p || {}));
handle('reglas:decidir', (d) => reglas.decidir(d || {}));
handle('reglas:activar', (d) => reglas.activar(d || {}));
handle('reglas:eliminar', (id) => reglas.eliminar(id));
handle('reglas:exportar', async () => {
  const data = JSON.stringify(reglas.exportar(), null, 2);
  if (process.env.PF_SAVE_DIR) { const f = path.join(process.env.PF_SAVE_DIR, 'reglas-notariales.json'); fs.writeFileSync(f, data); return f; }
  const r = await dialog.showSaveDialog(win, { defaultPath: 'reglas-notariales.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null; fs.writeFileSync(r.filePath, data); return r.filePath;
});

const plazos = require('./plazos');
plazos.init({ asPdf: (p) => asPdfForSigning(p), open: () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); win.webContents.send('open:plazos'); } } });
handle('plazos:list', () => plazos.list());
handle('plazos:add', (paths) => plazos.add((paths || []).filter((p) => typeof p === 'string')));
handle('plazos:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Documentos', extensions: ['pdf', 'docx'] }] });
  if (r.canceled) return { items: plazos.list(), added: 0, skipped: [] }; return plazos.add(r.filePaths);
});
handle('plazos:bytes', (id) => plazos.bytes(id));
handle('plazos:update', (id, patch) => plazos.update(id, patch || {}));
handle('plazos:remove', (id) => plazos.remove(id));
handle('plazos:ics', async (id) => {
  const txt = plazos.ics(id); const it = plazos.list().find((x) => x.id === id);
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), (it.name.replace(/\.pdf$/i, '') + ' - plazo.ics').replace(/[\\/:*?"<>|]+/g, '-')), filters: [{ name: 'Calendario', extensions: ['ics'] }] });
  if (r.canceled || !r.filePath) return null; fs.writeFileSync(r.filePath, txt); shell.openPath(r.filePath); return r.filePath;
});

// ---- Carga masiva ----
const bulk = require('./bulk');
bulk.init(pf, { asPdf: (p) => asPdfForSigning(p), onUpdate: (st) => win && !win.isDestroyed() && win.webContents.send('bulk:update', st),
  sent: (it) => { if (it.flow?.expId) require('./expedientes').log(it.flow.expId, { kind: 'sent', op: it.operation, text: `Enviado a firmar «${it.flow.file || it.name}»`, files: [it.flow.file || it.name] }); } });
handle('bulk:state', () => bulk.state());
handle('bulk:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Documentos', extensions: ['pdf', 'docx'] }] });
  if (r.canceled) return bulk.state(); return bulk.add(r.filePaths);
});
handle('bulk:add', (paths) => bulk.add((paths || []).filter((p) => typeof p === 'string' || (p && typeof p.path === 'string')).map((p) => (typeof p === 'string' ? p : { path: p.path, flow: p.flow && typeof p.flow === 'object' ? { expId: String(p.flow.expId || ''), file: String(p.flow.file || '') } : undefined }))));
handle('bulk:update', (id, patch) => bulk.update(id, patch || {}));
handle('bulk:applySigners', (signers) => bulk.applySigners(signers || []));
handle('bulk:retry', (id) => bulk.retry(id));
handle('bulk:remove', (id) => bulk.remove(id));
handle('bulk:clear', (which) => bulk.clear(which));
handle('bulk:pause', (v) => bulk.pause(v));
handle('bulk:send', (ids, opts) => bulk.send(ids || [], opts || {}));
handle('bulk:stopSend', () => bulk.stopSend());
handle('bulk:rearm', (id) => bulk.rearm(id));
// ---- Expedientes (carpetas por caso, en el computador o en Google Drive) ----
const exped = require('./expedientes');
handle('exp:list', () => exped.list());
handle('exp:create', (o) => exped.create(o || {}));
handle('exp:update', (id, p) => exped.update(id, p || {}));
handle('exp:remove', (id) => exped.remove(id));
handle('exp:history', (id) => exped.history(id));
handle('exp:files', (id) => exped.files(id));
handle('exp:addFiles', (id, paths, o) => exped.addFiles(id, (paths || []).filter((p) => typeof p === 'string'), o || {}));
handle('exp:pickFiles', async (id) => {
  const r = await dialog.showOpenDialog(win, { title: 'Agregar archivos al expediente', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Documentos e imágenes', extensions: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'txt'] }, { name: 'Todos', extensions: ['*'] }] });
  return r.canceled ? { added: [], skipped: [] } : exped.addFiles(id, r.filePaths);
});
handle('exp:addBytes', (id, name, bytes, o) => exped.addBytes(id, name, bytes, o || {}));
handle('exp:localPath', (id, fid) => exped.localPath(id, fid));
handle('exp:removeFile', (id, fid) => exped.removeFile(id, fid));
handle('exp:reveal', (id) => exped.reveal(id));
handle('exp:log', (id, entry) => exped.log(id, entry || {}) && true);
// ---- Flujos documentales (recetas: modelo + nómina + firmantes → carga masiva) ----
const flujos = require('./flujos');
flujos.init({ htmlToPdf, bulkModule: bulk, onUpdate: (st) => win && !win.isDestroyed() && win.webContents.send('flujos:update', st) });
handle('flujos:models', () => flujos.modelList());
handle('flujos:model', (id) => flujos.model(id));
handle('flujos:recipes', () => flujos.recipes());
handle('flujos:saveRecipe', (r) => flujos.saveRecipe(r || {}));
handle('flujos:deleteRecipe', (id) => flujos.deleteRecipe(id));
handle('flujos:pickNomina', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Elige la nómina', properties: ['openFile'], filters: [{ name: 'Planillas', extensions: ['xlsx', 'xls', 'csv', 'ods'] }] });
  return r.canceled ? null : flujos.readNomina(r.filePaths[0]);
});
handle('flujos:readNomina', (file) => flujos.readNomina(String(file)));
handle('flujos:check', (spec) => flujos.check(spec));
handle('flujos:sample', (spec) => flujos.sample(spec));
handle('flujos:run', (spec) => flujos.run(spec));
handle('flujos:runs', () => flujos.runs());
handle('flujos:deleteRun', (id) => flujos.deleteRun(id));
handle('flujos:state', () => flujos.state());
// Firma masiva con certificado: la clave va directo a Portalfirma; no se guarda ni se registra
handle('cds:pending', (rut) => pf.cds({ action: 'list_pending', rut }));
handle('cds:code', (rut, operations, clave) => pf.cds({ action: 'request_sign_code', rut, operations, clave_certificado: clave }));
handle('cds:sign', (rut, operations, clave, code) => pf.cds({ action: 'sign_documents', rut, operations, clave_certificado: clave, segundo_factor: code }));

// Seguimiento
handle('op:detail', (n) => {
  const num = String(n ?? '').replace(/\D/g, '');
  if (!num) throw new Error('Esta entrada no tiene número de operación: el envío no se completó en Portalfirma.');
  return pf.processDetail(Number(num));
});
handle('op:manage', (args) => pf.manage(args));
handle('op:byRut', (rut, start, end) => pf.byRut(rut, start, end));
handle('history:list', () => { // los envíos que fallaron (sin número de operación) no se muestran
  const h = (store.get('history') || []).filter((x) => x && x.operation != null && x.operation !== '');
  store.set('history', h); return h;
});

handle('prefs:get', () => ({ payerEmail: store.get('payerEmail') || '', serverUrl: pf.serverUrl(), mock: process.env.PF_MOCK === '1' }));
handle('prefs:set', (p) => { if (p.payerEmail !== undefined) store.set('payerEmail', p.payerEmail); return true; });
handle('open:url', (u) => { if (process.env.PF_MOCK === '1') { (global.__abiertos ||= []).push(u); return true; } if (/^https:\/\//.test(u)) shell.openExternal(u); return true; }); // en pruebas no se abre el navegador
// Enlaces dentro de un PDF (el usuario ya confirmó en la app)
handle('open:link', (u) => { if (/^(https?:|mailto:)/i.test(String(u))) shell.openExternal(String(u)); return true; });
handle('win:fullscreen', (v) => { if (win) win.setFullScreen(v === undefined || v === null ? !win.isFullScreen() : !!v); return true; });

// Imprimir: las páginas llegan como imágenes; se arma una página HTML con el tamaño de cada hoja y se abre el diálogo del sistema.
handle('print:pages', async (pages, name) => {
  if (!Array.isArray(pages) || !pages.length) throw new Error('No hay páginas para imprimir.');
  const dir = fs.mkdtempSync(path.join(tmpDir(), 'imprimir-'));
  // Todas las hojas usan el tamaño de la primera (el usuario puede cambiarlo en el diálogo); cada página se ajusta a la hoja.
  const sizes = [`${Number(pages[0].w).toFixed(2)} ${Number(pages[0].h).toFixed(2)}`];
  const body = pages.map((p, i) => { const f = `p${i}.jpg`; fs.writeFileSync(path.join(dir, f), Buffer.from(p.bytes)); return `<div class="pg"><img src="${f}"></div>`; }).join('');
  const [W0, H0] = sizes[0].split(' ');
  const title = String(name || 'documento.pdf').replace(/[<>&"]/g, '');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    @page { size: ${W0}pt ${H0}pt; margin: 0; } html, body { margin: 0; padding: 0; background: #fff; }
    .pg { width: 100vw; height: 100vh; break-after: page; overflow: hidden; display: flex; align-items: center; justify-content: center; } .pg:last-child { break-after: auto; }
    .pg img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }</style></head><body>${body}</body></html>`;
  const htmlPath = path.join(dir, 'imprimir.html'); fs.writeFileSync(htmlPath, html);
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await pw.loadFile(htmlPath);
  const cleanup = () => { try { pw.destroy(); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
  if (process.env.PF_PRINT_DRYRUN === '1') { const out = { html: htmlPath, pages: pages.length, sizes }; try { pw.destroy(); } catch {} return out; }
  pw.webContents.print({ silent: false, printBackground: true, margins: { marginType: 'none' } }, () => cleanup());
  return { pages: pages.length };
});

function findKey(obj, re) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (re.test(k) && (typeof v === 'number' || /^\d+$/.test(String(v)))) return v;
    const inner = findKey(v, re); if (inner !== undefined) return inner;
  }
}
function findUrl(obj) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && /^https:\/\//.test(v)) return v;
    const inner = findUrl(v); if (inner) return inner;
  }
}

// ---- PortalFirma Asset: cartera, personas y actividad (base local) ----
const inmo = require('./inmo');
global.__inmo = inmo; // las pruebas e2e lo usan desde el proceso principal (app.evaluate)
inmo.configurar({ avisar: (texto) => toUI('agent:event', { type: 'aviso', texto }), cambio: (que) => toUI('agent:event', { type: 'datos', que: que || 'propiedades' }), nombreUsuario: (id) => equipo.nombre(id) });
const ml = require('./portales/mercadolibre');
const negocios = require('./negocios');
// Un cambio en la ficha (desde un botón, un negocio o el agente) mantiene al día el aviso del portal
const cambiarPropiedad = async (id, cambios) => {
  const antes = JSON.parse(JSON.stringify(inmo.obtener(id))); const p = await propietarioPendiente(await inmo.guardarPropiedad({ id, ...cambios }));
  return ml.reaccionar(antes, p).catch(() => []);
};
negocios.configurar({ alCambiarPropiedad: cambiarPropiedad });
// Agenda y herramientas de Asset para el agente (y para los botones que usan la misma lógica)
const agenda = require('./agenda');
// 0.16.16 · control del flujo de firma: número de operación, registro en «Mis operaciones», seguimiento automático,
// revisión de contacto antes de enviar y corrección/reenvío de enlaces (los envía Portalfirma)
const firmas = require('./firmas').crear({ inmo, pf, negocios, aviso: (r) => {
  const t = (r.cambios || []).join(' · '); if (!t) return;
  toUI('agent:event', { type: 'aviso', texto: t }); toUI('agent:event', { type: 'datos', que: 'propiedades' });
  try { waAgente.avisarComo('juanita', `Firmas: ${t}.`); } catch {}
}, alDetalle: (op, d) => { sync.guardarDetalle(op, d); toUI('agent:event', { type: 'datos', que: 'operaciones', op }); } });
handle('fir:pendientes', (o) => firmas.pendientes(o || {}));
handle('fir:revisar', (op) => firmas.revisar(op));
handle('fir:ronda', () => firmas.ronda());
handle('fir:reenviar', (o) => firmas.reenviar(o || {}));
handle('fir:corregir', (o) => firmas.corregir(o || {}));
handle('fir:revisarContacto', (l) => firmas.revisarFirmantes(l || []));
// cada 5 minutos (si hay algo en firma y la sesión de Portalfirma está abierta)
setInterval(() => { if (pf.isConnected?.() === false) return; firmas.ronda().catch(() => null); }, 5 * 60 * 1000);
const docs = require('./documentos').crear({ inmo, negocios, pf, firmas });
const est = require('./estado').crear({ inmo, negocios, agenda });
// HTML → PDF (carta) con una ventana oculta; lo usan los documentos a medida
async function htmlAPdf(html, { cabecera = '' } = {}) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pfdoc-')); const f = path.join(dir, 'doc.html'); fs.writeFileSync(f, html);
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
  try { await pw.loadFile(f); return await pw.webContents.printToPDF({ pageSize: 'Letter', printBackground: true, preferCSSPageSize: true, ...(cabecera ? { displayHeaderFooter: true, headerTemplate: cabecera, footerTemplate: '<span></span>' } : {}) }); }
  finally { try { pw.destroy(); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}
// 0.16.15 · formatos propios de la corredora (mandatos de The Living…): se llenan con la ficha y se firman en Portalfirma
const formatos = require('./formatos').crear({ inmo, pf, firmas, negocios, mock: !!process.env.PF_MOCK, pagador: () => store.get('payerEmail') || (process.env.PF_MOCK ? 'demo@portalfirma.cl' : ''), renderPdf: htmlAPdf, cambiarPropiedad, dir: () => { const d = process.env.PF_INMO_DIR || path.join(app.getPath('userData'), 'inmo'); fs.mkdirSync(d, { recursive: true }); return d; } });
handle('fmt:estado', () => formatos.estado());
handle('fmt:configurar', (o) => formatos.configurar(o || {}));
handle('fmt:deHito', (propId, hito) => formatos.deHito(inmo.obtener(propId), hito));
const guardFmt = (fid, propId) => { if (propId && !/orden/i.test(String(fid || ''))) permisos.exigir(inmo.obtener(propId), 'los datos del propietario (para el mandato)'); };
handle('fmt:preparar', (o) => { guardFmt(o?.formatoId, o?.propId); return formatos.preparar(o || {}); });
handle('fmt:completar', (o) => { guardFmt(o?.formatoId, o?.propId); return formatos.completar(o || {}); });
handle('fmt:html', (id, propId, o) => { guardFmt(id, propId); return formatos.html(id, propId, o || {}); });
handle('fmt:vistaPrevia', async (o) => { guardFmt(o?.formatoId, o?.propId); const f = await formatos.vistaPrevia(o || {}); openInEditor([f]); return f; });
handle('fmt:enviar', (o) => { guardFmt(o?.formatoId, o?.propId); return formatos.enviar(o || {}); });
const docgen = require('./docgen').crear({ inmo, negocios, docs, firmas, ai: require('./ai'), pf, renderPdf: htmlAPdf, dir: () => { const d = process.env.PF_INMO_DIR || path.join(app.getPath('userData'), 'inmo'); fs.mkdirSync(d, { recursive: true }); return d; } });
handle('est:estado', (id) => est.estado(id));
// direcciones (Google Places con la clave de la corredora; sin clave, OpenStreetMap)
const dirs = require('./direcciones').crear({ store, mock: !!process.env.PF_MOCK });
handle('dir:estado', () => dirs.estado());
handle('dir:configurar', (k) => dirs.configurar(k));
handle('dir:sugerir', (t, s) => dirs.sugerir(t, s));
handle('dir:detalle', (id, s) => dirs.detalle(id, s));
handle('dir:buscar', (t) => dirs.buscarLibre(t));
// calendario de reservas (wechatia): widget dentro de Asset + reservas a la agenda con la clave de la API
const reservas = require('./reservas').crear({ store, inmo, agenda, est, mock: !!process.env.PF_MOCK });
handle('res:estado', () => reservas.estado());
handle('res:configurar', (o) => reservas.configurar(o || {}));
handle('res:sincronizar', async (pend) => { const r = await reservas.sincronizar(pend || null); if (r.cita && !r.cita.ok && r.cita.permiso) toUI('agent:event', { type: 'aviso', texto: r.cita.error }); if (r.nuevas || r.actualizadas || r.canceladas) toUI('agent:event', { type: 'datos', que: 'agenda' }); return r; });
// Postventa (MVP): unidades entregadas, reclamos con garantía y atención por WhatsApp vía wechatia
const postventa = require('./postventa').crear({ dir: () => { const d = process.env.PF_INMO_DIR || path.join(app.getPath('userData'), 'inmo'); fs.mkdirSync(d, { recursive: true }); return d; }, wa: require('./postventa').whatsappWechatia(reservas), ia: (o) => require('./ai').redactarCorto(o) });
const pvAviso = (r) => { if (r?.procesados) toUI('agent:event', { type: 'datos', que: 'postventa' }); return r; };
handle('pv:tablero', () => postventa.tablero());
handle('pv:listar', (o) => postventa.listar(o || {}));
handle('pv:obtener', (id) => postventa.obtener(id));
handle('pv:crear', (o) => postventa.crearReclamo(o || {}));
handle('pv:item', (id, it, o) => postventa.editarItem(id, it, o || {}));
handle('pv:unidad', (id, u) => postventa.asignarUnidad(id, u));
handle('pv:mover', (id, e, o) => postventa.mover(id, e, o || {}));
handle('pv:orden', (id) => postventa.ordenContratista(id));
handle('pv:contratistas', () => postventa.contratistas());
handle('pv:contratista', (o) => postventa.guardarContratista(o || {}));
handle('pv:proyectos', () => postventa.proyectos());
handle('pv:unidades', (pid) => postventa.unidades(pid));
handle('pv:importar', async (ruta) => {
  if (!ruta) { const r = await dialog.showOpenDialog(win, { title: 'Planilla de unidades entregadas', filters: [{ name: 'Excel o CSV', extensions: ['xlsx', 'xls', 'csv'] }], properties: ['openFile'] }); if (r.canceled || !r.filePaths[0]) return null; ruta = r.filePaths[0]; }
  return postventa.importarArchivo(ruta);
});
handle('pv:plantilla', async () => { const r = await dialog.showSaveDialog(win, { title: 'Guardar plantilla de unidades', defaultPath: 'plantilla-unidades-postventa.xlsx', filters: [{ name: 'Excel', extensions: ['xlsx'] }] }); if (r.canceled || !r.filePath) return null; const f = /\.xlsx$/i.test(r.filePath) ? r.filePath : r.filePath + '.xlsx'; fs.writeFileSync(f, postventa.plantillaXLSX()); shell.showItemInFolder(f); return f; });
handle('pv:config', () => ({ ...postventa.config(), ...reservas.estadoWa() }));
handle('pv:claveWa', (o) => reservas.configurarWa(o || {}));
handle('pv:configurar', (o) => postventa.configurar(o || {}));
handle('pv:chats', () => postventa.chats());
// Apariencia: claro, oscuro o como el sistema (cambia prefers-color-scheme en la ventana)
const TEMAS = ['system', 'light', 'dark'];
try { const t = require('./store').get('tema'); if (TEMAS.includes(t)) nativeTheme.themeSource = t; } catch {}
handle('tema:get', () => ({ tema: nativeTheme.themeSource, oscuro: nativeTheme.shouldUseDarkColors }));
handle('tema:set', (t) => { if (!TEMAS.includes(t)) throw new Error('Tema no válido.'); nativeTheme.themeSource = t; require('./store').set('tema', t); win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#12141a' : '#f6f7fb'); return { tema: t, oscuro: nativeTheme.shouldUseDarkColors }; });
handle('pv:muestra', (o) => postventa.muestra(o || {}));
handle('pv:probarEstilo', (o) => postventa.probarEstilo(o || {}));
handle('pv:revisar', () => postventa.revisarWhatsApp({ forzar: true, excluir: [(store.get('waAgente') || {}).telefono] }).then(pvAviso));
// WhatsApp de postventa: revisa cada 4 s si hay alguien conversando con el asistente, cada 10 s si no (sin superponerse)
let pvOcupado = false;
const pvCiclo = async () => {
  if (!pvOcupado && reservas.estadoWa().conectado && postventa.config().auto) { pvOcupado = true; try { pvAviso(await postventa.revisarWhatsApp({ excluir: [(store.get('waAgente') || {}).telefono] })); } catch {} pvOcupado = false; }
  setTimeout(pvCiclo, postventa.ritmo()).unref?.();
};
if (process.env.PF_POSTVENTA === '1') setTimeout(pvCiclo, 5e3).unref?.(); // Postventa en pausa (0.13): su WhatsApp lo usa ahora el Agente
setInterval(() => { if (!reservas.estado().conectado) return; reservas.sincronizar().then((r) => { if (r.nuevas || r.actualizadas || r.canceladas) toUI('agent:event', { type: 'datos', que: 'agenda' }); }).catch(() => {}); }, 5 * 60e3).unref?.();
handle('est:anotar', (id, o) => est.anotar(id, o || {}));
handle('est:confirmacion', (id, per) => ({ ...est.confirmacion(id, per), automatico: reservas.estadoWa().conectado && !!reservas.locationId() }));
// confirmar por WhatsApp: con wechatia conectado se envía solo; si no (o si se pide), se abre WhatsApp con el mensaje
handle('est:confirmar', async (id, per, texto, modo) => {
  const auto = modo !== 'abrir' && reservas.estadoWa().conectado && !!reservas.locationId();
  if (auto) {
    const p = est.preparar(id, per, texto); const env = await reservas.enviarWhatsApp({ telefono: p.telefono, nombre: p.persona?.nombre, texto: p.texto });
    // WhatsApp puede rechazarlo unos segundos después (24 h sin respuesta del cliente): se revisa de nuevo y se avisa
    if (env.messageId && !['delivered', 'read'].includes(env.estado)) setTimeout(async () => {
      try { const m = (await reservas.api('GET', `/conversations/messages/${env.messageId}`)).message || {};
        if (['failed', 'undelivered', 'error'].includes(String(m.status || '').toLowerCase())) {
          const ev = agenda.ver(id); const t = `WhatsApp no entregó la confirmación a ${p.persona?.nombre || 'el cliente'} (lleva más de 24 h sin escribir a tu número). Envíala desde tu WhatsApp.`;
          inmo.registrar(id, t, { ref2: ev.propId }); if (ev.propId) inmo.registrar(ev.propId, t, { ref2: id }); inmo.guardar();
          toUI('agent:event', { type: 'aviso', texto: t }); toUI('agent:event', { type: 'datos' });
        } } catch {}
    }, process.env.PF_MOCK === '1' ? 1500 : 25000).unref?.();
    return { ...est.confirmada(id, per, p.texto, { via: 'wechatia' }), automatico: true, envio: env };
  }
  const r = est.confirmada(id, per, texto); if (process.env.PF_MOCK === '1') (global.__abiertos ||= []).push(r.whatsapp); else shell.openExternal(r.whatsapp); return { ...r, automatico: false };
});
const pubs = require('./publicaciones').crear({ ml, ai: require('./ai'), cambiarPropiedad });
const dictado = require('./dictado').crear({ ai: require('./ai'), estilo: () => inmo.config().estiloDescripcion || '' });
const assetTools = require('./asset-tools').crear({ inmo, negocios, agenda, ml, pf, cambiarPropiedad, docs, pubs, est, docgen, dictado, formatos, firmas, acceso: { verNegocio: (n) => permisos.verNegocio(n) } });
// 0.16.1 · WhatsApp a clientes desde el Agente (y desde el equipo por WhatsApp): ahora o programado (recordatorios)
const cleanTel = (t) => String(t || '').replace(/\D/g, '');
function destinoWa(a) {
  const pareceId = (x) => /^[a-z0-9]{12,}$/i.test(String(x || '').trim()) && /\d/.test(x) && /[a-z]/i.test(x); // «cmvkzg9q17y3rp» es un id de wechatia, no un nombre
  if (a.telefono && cleanTel(a.telefono).length >= 8) return { telefono: a.telefono, nombre: [a.nombre, a.para].find((x) => x && !pareceId(x) && !/^\+?[\d\s]+$/.test(x)) || '', personaId: null };
  const ref = String(a.para || a.nombre || '').trim(); if (!ref) throw new Error('Indica a quién (persona del CRM) o su celular.');
  const n = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const all = inmo.listar().personas; const r = n(ref); const rr = cleanTel(ref);
  let l = all.filter((c) => c.id === ref || (rr.length > 6 && cleanTel(c.rut) === rr));
  if (!l.length) { const tok = r.split(/\s+/).filter((t) => t.length > 1); l = all.filter((c) => tok.every((t) => n(c.nombre).includes(t))); }
  if (!l.length) throw new Error(`No encontré a «${ref}» en el CRM. Pide su celular al usuario y pásalo en «telefono».`);
  if (l.length > 1) throw new Error(`Hay varias personas que coinciden: ${l.slice(0, 5).map((c) => c.nombre).join(', ')}. Pregunta cuál.`);
  const c = l[0]; if (!c.telefono) throw new Error(`${c.nombre} no tiene celular en el CRM. Pídeselo al usuario y pásalo en «telefono».`);
  return { telefono: c.telefono, nombre: c.nombre, personaId: c.id };
}
const cuandoOk = (c) => { if (!c) return null; const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/.exec(String(c).trim()); if (!m) throw new Error('«cuando» debe ser AAAA-MM-DD HH:MM.'); const d = new Date(`${m[1]}T${m[2]}:00`); return d.getTime() <= Date.now() + 60e3 ? null : `${m[1]} ${m[2]}`; };
const enlaceWa = (tel, texto) => { let d = cleanTel(tel); if (d.length === 9) d = '56' + d; else if (d.length === 8) d = '569' + d; return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`; };
// 0.16.5 · plantillas de WhatsApp (wechatia): fuera de las 24 h se usan cuando están activas (Meta ya las aprobó)
const PLANTILLAS_WA = {
  primer_contacto: { nombre: 'asset_primer_contacto', etiqueta: 'asset-primer-contacto', campos: ['remitente', 'motivo'], uso: 'primer mensaje a alguien o retomar contacto («te escribo por {motivo}»)' },
  recordatorio_visita: { nombre: 'asset_recordatorio_visita', etiqueta: 'asset-recordatorio-visita', campos: ['propiedad', 'fecha', 'hora'], uso: 'recordar una visita agendada' },
  enlace_firma: { nombre: 'asset_enlace_firma', etiqueta: 'asset-enlace-firma', campos: ['documento', 'enlace'], uso: 'mandar el enlace de un documento pendiente de firma' },
  seguimiento_lead: { nombre: 'asset_seguimiento_lead', etiqueta: 'asset-seguimiento-lead', campos: ['remitente', 'propiedad'], uso: 'seguimiento a un interesado («tu interés en {propiedad}»)' },
};
const plantillasActivas = () => store.get('waPlantillas') || {};
function datosPlantilla(a) {
  // 0.16.18 · una confirmación o recordatorio de visita va con su plantilla (propiedad, fecha y hora), no como primer contacto
  const esVisita = a.propiedad && a.fecha && a.hora && (!a.plantilla || a.plantilla === 'primer_contacto');
  const id = esVisita ? 'recordatorio_visita' : PLANTILLAS_WA[a.plantilla] ? a.plantilla : 'primer_contacto'; const P = PLANTILLAS_WA[id];
  // el remitente es el ejecutivo (nunca el nombre de un asistente: Pedro, Juanita, Diego o Fernanda)
  const rem0 = String(a.remitente || '').trim(); const asistente = /^(pedro|juanita|diego|fernanda)\b/i.test(rem0) && rem0.split(/\s+/).length <= 2;
  const remitente = (!asistente && rem0) || inmo.config().corredor?.nombre || inmo.config().contacto?.nombre || inmo.config().nombre || '';
  const v = { remitente, motivo: a.motivo, propiedad: a.propiedad, fecha: a.fecha, hora: a.hora, documento: a.documento, enlace: a.enlace };
  const campos = Object.fromEntries(P.campos.map((k) => [k, v[k]])); const faltan = P.campos.filter((k) => !String(campos[k] || '').trim());
  return { id, P, campos, faltan };
}
// fuera de las 24 h: plantilla si está activa; si no (o faltan datos), el enlace para enviarlo desde el WhatsApp del usuario
// 0.16.10 · lo que Asset le manda a un contacto queda en Leads: si no está en el CRM (o es un primer contacto o seguimiento
// de lead), se crea el lead para que Fernanda siga la conversación cuando responda.
function alLead(d, texto, plantilla = null) {
  try {
    let l = leads.porTelefono(d.telefono);
    if (!l && (!d.personaId || ['primer_contacto', 'seguimiento_lead'].includes(plantilla))) l = leads.crearDesdeWa({ nombre: d.nombre || '', telefono: d.telefono, personaId: d.personaId || null });
    if (l) leads.registrarWa(l.id, { de: 'agente', texto });
    clientesWa.marcarEnvio(d.telefono, texto);
  } catch {}
}
async function fueraDe24(d, a) {
  const { id, P, campos, faltan } = datosPlantilla(a);
  if (plantillasActivas()[id]) {
    if (faltan.length) return { ok: false, noEnviado: true, faltanDatos: faltan, motivo: `Fuera de las 24 h hay que usar la plantilla «${P.nombre}» y le faltan: ${faltan.join(', ')}.`, instruccion: `Vuelve a llamar a asset_enviar_whatsapp con plantilla="${id}" y ${faltan.join(', ')} (pídele al usuario solo lo que no sepas).` };
    await reservas.enviarPlantilla({ telefono: d.telefono, nombre: d.nombre, etiqueta: P.etiqueta, campos });
    alLead(d, `(Plantilla ${P.nombre}) ${Object.values(campos).filter(Boolean).join(' · ')}`, id);
    if (d.personaId) { try { inmo.registrar(d.personaId, `WhatsApp (plantilla ${P.nombre}) enviado desde wechatia`); inmo.guardar(); } catch {} }
    return { ok: true, enviadoConPlantilla: { para: d.nombre || d.telefono, plantilla: P.nombre, datos: campos }, nota: 'Como esa persona no ha escrito en las últimas 24 h, salió la plantilla aprobada (no tu texto libre). wechatia la envía en unos segundos; cuando responda, ya se puede conversar libremente.' };
  }
  try { const l = leads.porTelefono(d.telefono); if (l) leads.registrarWa(l.id, { de: 'agente', texto: a.texto, fallido: 'No se envió: fuera de las 24 h y sin plantilla activa' }); clientesWa.marcarEnvio(d.telefono, a.texto); } catch {}
  return { ok: false, noEnviado: true, motivo: 'WhatsApp no lo entrega: esa persona no le ha escrito al número de la empresa en las últimas 24 horas (Meta solo permite plantillas aprobadas).', enlace: enlaceWa(d.telefono, a.texto), plantillaPendiente: P.nombre, instruccion: `Dile al usuario que NO se envió y dale el enlace: al tocarlo se abre SU WhatsApp con el mensaje listo para enviarlo él. Muestra el enlace tal cual. Cuando Meta apruebe la plantilla «${P.nombre}» y se active en Asset, estos mensajes saldrán solos.` };
}
// 0.16.18 · si WhatsApp rechaza un mensaje después (Meta avisa con retraso), queda marcado «No entregado» y se avisa al
// ejecutivo con el enlace para mandarlo desde su WhatsApp
function avisarNoEntregado(x, motivo) {
  const t = `WhatsApp no le entregó el mensaje a ${x.nombre || x.telefono}${/24/.test(motivo || '') || !motivo ? ' (no ha escrito a tu número en las últimas 24 h; solo se puede con una plantilla aprobada)' : ': ' + motivo}. Mándaselo tú desde tu WhatsApp: ${enlaceWa(x.telefono, x.texto)}`;
  try { leads.marcarFallido(x.telefono, x.texto, motivo || 'Fuera de las 24 h'); } catch {}
  if (x.personaId) { try { inmo.registrar(x.personaId, t); inmo.guardar(); } catch {} }
  toUI('agent:event', { type: 'aviso', texto: t }); try { waAgente.avisar?.(t); } catch {}
}
function vigilarEntrega(x, r) {
  if (!r?.messageId || ['delivered', 'read', 'fallido'].includes(r.estado) || r.duplicado) return;
  for (const ms of process.env.PF_MOCK === '1' ? [1200] : [30000, 120000]) setTimeout(async () => {
    if (x.__avisado) return; const m = await reservas.estadoMensaje(r.messageId).catch(() => null);
    if (m && ['failed', 'undelivered', 'error'].includes(m.estado)) { x.__avisado = true; avisarNoEntregado(x, m.detalle); }
  }, ms).unref?.();
}
async function enviarWaCliente(x) {
  const r = await reservas.enviarWhatsApp({ telefono: x.telefono, nombre: x.nombre, texto: x.texto, revisar24: true, entranteLocal: () => leads.escribioEn24(x.telefono) });
  vigilarEntrega(x, r);
  if (x.personaId) { try { inmo.registrar(x.personaId, `WhatsApp enviado: ${x.texto.slice(0, 160)}`); inmo.guardar(); } catch {} }
  return r;
}
assetTools.push({ name: 'asset_enviar_whatsapp', modo: 'confirmar',
  description: 'Envía un WhatsApp a un cliente o a cualquier persona desde el número de la empresa: avisos, recordatorios de visita, pedir que se comunique, mandar un enlace. Ahora, o programado con «cuando» (p. ej. un recordatorio mañana a las 09:00). Busca el celular en el CRM por nombre o RUT; si no está, pásalo en «telefono». Redacta tú el mensaje completo, cordial y en nombre del usuario. Ojo: WhatsApp solo entrega texto libre si esa persona le escribió al número de la empresa en las últimas 24 h; si no, sale la plantilla aprobada que corresponda (indica siempre «plantilla» y sus datos), o, si aún no está activa, la herramienta devuelve un enlace para que el usuario lo mande desde su propio WhatsApp. NUNCA digas que enviaste o programaste un WhatsApp sin usar esta herramienta.',
  parameters: { type: 'object', properties: { para: { type: 'string', description: 'Persona del CRM: nombre, RUT o id' }, telefono: { type: 'string', description: 'Celular, si no está en el CRM (+56 9 …)' }, nombre: { type: 'string', description: 'Nombre del destinatario, si se da el celular' }, texto: { type: 'string', description: 'El mensaje completo que se envía' }, cuando: { type: 'string', description: 'Opcional: AAAA-MM-DD HH:MM para programarlo; vacío = ahora' }, plantilla: { type: 'string', enum: Object.keys(PLANTILLAS_WA), description: 'La plantilla aprobada que corresponde, por si esa persona no ha escrito en 24 h: ' + Object.entries(PLANTILLAS_WA).map(([k, p]) => `${k} = ${p.uso} (datos: ${p.campos.join(', ')})`).join('; ') }, motivo: { type: 'string', description: 'primer_contacto: por qué le escribes, en pocas palabras («la visita a Zenteno 864»)' }, propiedad: { type: 'string', description: 'recordatorio_visita / seguimiento_lead: la propiedad, como dirección corta' }, fecha: { type: 'string', description: 'recordatorio_visita: «el viernes 6 de noviembre»' }, hora: { type: 'string', description: 'recordatorio_visita: «12:30»' }, documento: { type: 'string', description: 'enlace_firma: nombre del documento' }, enlace: { type: 'string', description: 'enlace_firma: el enlace para firmar' }, remitente: { type: 'string', description: 'Quién escribe (por defecto, el corredor configurado)' } }, required: ['texto'] },
  preparar: async (a) => { if (!reservas.estadoWa().conectado) throw new Error('El WhatsApp de la empresa no está conectado (Agente › WhatsApp).'); const d = destinoWa(a); const c = cuandoOk(a.cuando); a.__d = d; a.__c = c;
    return { titulo: c ? `Programar un WhatsApp para ${d.nombre || d.telefono}` : `Enviar un WhatsApp a ${d.nombre || d.telefono}`, detalle: [`Para: ${d.nombre ? d.nombre + ' · ' : ''}${d.telefono}`, `Mensaje: ${a.texto}`, ...(c ? [`Se envía el ${c.slice(8, 10)}/${c.slice(5, 7)} a las ${c.slice(11)}`] : [])], aviso: 'Sale desde el WhatsApp de la empresa. Si esa persona no le ha escrito a tu número en las últimas 24 h, WhatsApp puede no entregarlo (exige una plantilla aprobada).' }; },
  run: async (a) => { const d = a.__d || destinoWa(a); const c = a.__c !== undefined ? a.__c : cuandoOk(a.cuando);
    // 0.16.8 · el último enlace de firma enviado a una persona: el asistente de clientes puede reenviarlo si lo pide
    if (a.enlace && d.personaId) { const ef = store.get('enlacesFirma') || {}; ef[d.personaId] = { documento: a.documento || '', enlace: a.enlace, fecha: new Date().toISOString() }; store.set('enlacesFirma', ef); }
    if (c) { const l = store.get('waProgramados') || []; const it = { id: 'wp' + Date.now().toString(36), ...d, texto: a.texto, cuando: c, estado: 'programado', creado: new Date().toISOString(), pl: Object.fromEntries(['plantilla', 'motivo', 'propiedad', 'fecha', 'hora', 'documento', 'enlace', 'remitente'].filter((k) => a[k]).map((k) => [k, a[k]])) }; l.push(it); store.set('waProgramados', l.slice(-200)); return { ok: true, programado: { para: d.nombre || d.telefono, cuando: c } }; }
    try { const r = await enviarWaCliente({ ...d, texto: a.texto }); if (r.duplicado) return { ok: true, yaEnviado: true, nota: 'Ese mismo mensaje ya se le envió hace unos minutos: no lo repetí. No vuelvas a intentarlo.' }; alLead(d, a.texto, a.plantilla || null); return { ok: true, enviado: { para: d.nombre || d.telefono, estado: r.estado === 'enviado' ? 'enviado (WhatsApp aún no confirma la entrega; si la rechaza, te aviso)' : r.estado } }; }
    catch (e) {
      if (e.code === 'FUERA_24H' || /24 horas/.test(e.message)) return fueraDe24(d, a);
      // 0.16.18 · cualquier otro rechazo: NO se reintenta (antes el agente lo repetía y llegaban varios iguales)
      try { const l = leads.porTelefono(d.telefono); if (l) leads.registrarWa(l.id, { de: 'agente', texto: a.texto, fallido: e.message }); clientesWa.marcarEnvio(d.telefono, a.texto); } catch {}
      return { ok: false, noEnviado: true, motivo: e.message, enlace: enlaceWa(d.telefono, a.texto), instruccion: 'NO lo reintentes: dile al usuario que no se envió, por qué, y dale el enlace para mandarlo desde su WhatsApp.' }; } } });
// 0.16.19 · «contacta a X y que agende la visita»: el ejecutivo pide que se coordine una visita y Fernanda sigue sola.
// Se le escribe a la persona (con plantilla si no ha escrito en 24 h), queda como interesado en la propiedad y, cuando
// responda, Fernanda le ofrece horarios libres de la agenda y la agenda (hora de Chile).
function propPorRef(ref) {
  const r = String(ref || '').trim().toLowerCase(); if (!r) throw new Error('Indica la propiedad (código, por ejemplo PF-1001).');
  const all = inmo.todas().filter((p) => !p.archivada);
  const l = all.filter((p) => p.id === ref || String(p.codigo || '').toLowerCase() === r || String(p.codigo || '').toLowerCase().replace('-', '') === r.replace('-', ''));
  if (l.length === 1) return l[0];
  const t = all.filter((p) => [p.titulo, p.direccion, p.comuna].join(' ').toLowerCase().includes(r)); if (t.length === 1) return t[0];
  throw new Error(l.length || t.length ? `Hay varias propiedades que coinciden con «${ref}»: indica el código.` : `No encontré la propiedad «${ref}».`);
}
assetTools.push({ name: 'asset_coordinar_visita', modo: 'confirmar',
  description: 'Cuando el usuario pide CONTACTAR a una persona para que AGENDE una visita a una propiedad («escríbele a Juan para que agende la visita a PF-1001», «coordina con Ana una visita»). Le escribe por WhatsApp desde el número de la empresa (con la plantilla aprobada si no ha escrito en 24 h) y deja a Fernanda a cargo: cuando responda, le ofrece horarios libres de la agenda y le agenda la visita, y te avisa. No la uses si el usuario ya dio día y hora (eso es asset_crear_evento).',
  parameters: { type: 'object', properties: { para: { type: 'string', description: 'Persona del CRM: nombre, RUT o id' }, telefono: { type: 'string', description: 'Celular, si no está en el CRM' }, nombre: { type: 'string', description: 'Nombre, si se da el celular' }, propiedad: { type: 'string', description: 'Código de la propiedad (ej. PF-1001)' }, texto: { type: 'string', description: 'Opcional: el mensaje; si no, se arma uno cordial en nombre del usuario' } }, required: ['propiedad'] },
  preparar: async (a) => { if (!reservas.estadoWa().conectado) throw new Error('El WhatsApp de la empresa no está conectado (Agente › WhatsApp).'); const d = destinoWa(a); const p = propPorRef(a.propiedad);
    const c = inmo.config().corredor?.nombre || inmo.config().contacto?.nombre || 'tu corredor';
    a.__d = d; a.__p = p; a.__t = a.texto || `Hola ${String(d.nombre || '').split(' ')[0] || ''}, te escribo de parte de ${c} por la propiedad ${p.codigo}${p.titulo ? ' (' + p.titulo + ')' : ''}${p.comuna ? ' en ' + p.comuna : ''}. ¿Qué día y horario te acomoda para visitarla? Te propongo opciones y la dejamos agendada.`.replace(/Hola ,/, 'Hola,');
    return { titulo: `Coordinar una visita a ${p.codigo} con ${d.nombre || d.telefono}`, detalle: [`Para: ${d.nombre ? d.nombre + ' · ' : ''}${d.telefono}`, `Mensaje: ${a.__t}`, 'Cuando responda, Fernanda le ofrece horarios libres de tu agenda y la agenda; te aviso.'], aviso: 'Sale desde el WhatsApp de la empresa. Si no ha escrito en 24 h, va la plantilla aprobada de seguimiento.' }; },
  run: async (a) => { const d = a.__d || destinoWa(a); const p = a.__p || propPorRef(a.propiedad); const texto = a.__t || a.texto;
    // queda como interesado (lead) de esa propiedad: así lo atiende Fernanda, que puede agendar
    const l = leads.porTelefono(d.telefono) || leads.crearDesdeWa({ nombre: d.nombre || '', telefono: d.telefono, personaId: d.personaId || null });
    if (l) { try { leads.actualizar(l.id, { propiedades: [...new Set([...(l.propiedades || []), p.id])], proximaAccion: { texto: `Coordinar visita a ${p.codigo} (Fernanda)`, fecha: require('./hora').hoy() } }); if (l.atiende === 'corredor') leads.atencion(l.id, 'agente'); } catch {} }
    if (d.personaId && !(p.vinculos || []).some((v) => v.personaId === d.personaId)) try { await inmo.vincular(p.id, d.personaId, 'interesado'); } catch {}
    const remitente = inmo.config().corredor?.nombre || inmo.config().contacto?.nombre || '';
    let r;
    try { const x = await enviarWaCliente({ ...d, texto }); alLead(d, texto, 'seguimiento_lead'); r = { ok: true, enviado: { para: d.nombre || d.telefono, estado: x.duplicado ? 'ya enviado hace unos minutos (no se repitió)' : x.estado } }; }
    catch (e) { if (e.code === 'FUERA_24H' || /24 horas/.test(e.message)) r = await fueraDe24(d, { texto, plantilla: 'seguimiento_lead', remitente, propiedad: `${p.codigo}${p.titulo ? ' · ' + p.titulo : ''}` });
      else { try { if (l) leads.registrarWa(l.id, { de: 'agente', texto, fallido: e.message }); clientesWa.marcarEnvio(d.telefono, texto); } catch {} r = { ok: false, noEnviado: true, motivo: e.message, enlace: enlaceWa(d.telefono, texto), instruccion: 'NO lo reintentes: dile al usuario que no se envió y dale el enlace.' }; } }
    if (d.personaId) try { inmo.registrar(d.personaId, `Coordinar visita a ${p.codigo}: ${r.ok ? 'mensaje enviado; Fernanda le ofrecerá horarios' : 'no se pudo enviar'}`, { ref2: p.id }); inmo.guardar(); } catch {}
    return { ...r, propiedad: p.codigo, siguiente: r.ok ? 'Cuando responda, Fernanda le ofrece horarios libres y agenda la visita; te aviso por WhatsApp y queda en la agenda.' : null, efectos: { datos: 'leads' } };
  } });
assetTools.push({ name: 'asset_plantillas_whatsapp', modo: 'escribir',
  description: 'Ve o cambia qué plantillas de WhatsApp (aprobadas por Meta en wechatia) usa Asset cuando un cliente no ha escrito en 24 h. Úsala cuando el usuario diga que Meta ya aprobó una plantilla («ya se aprobaron las plantillas, actívalas») o pregunte cuáles están activas. Sin «activar» ni «desactivar», solo muestra el estado.',
  parameters: { type: 'object', properties: { activar: { type: 'array', items: { type: 'string', enum: [...Object.keys(PLANTILLAS_WA), 'todas'] } }, desactivar: { type: 'array', items: { type: 'string', enum: [...Object.keys(PLANTILLAS_WA), 'todas'] } } } },
  run: async (a) => { const c = { ...plantillasActivas() }; const exp = (l) => (l || []).includes('todas') ? Object.keys(PLANTILLAS_WA) : (l || []);
    for (const k of exp(a.activar)) c[k] = true; for (const k of exp(a.desactivar)) c[k] = false; store.set('waPlantillas', c);
    return { ok: true, plantillas: Object.entries(PLANTILLAS_WA).map(([k, p]) => ({ plantilla: p.nombre, uso: p.uso, activa: !!c[k] })), nota: 'Para que salga de verdad, en wechatia tiene que estar publicado el flujo de esa plantilla (etiqueta añadida → enviar plantilla → quitar etiqueta).' }; } });
// los WhatsApp programados salen a su hora (mientras Asset esté abierto); el resultado se le avisa al ejecutivo
let enviandoProgramados = false;
setInterval(async () => {
  if (enviandoProgramados) return;   // 0.16.18 · una sola ronda a la vez (si no, los envíos lentos se repetían)
  enviandoProgramados = true; try { await enviarProgramados(); } finally { enviandoProgramados = false; }
}, process.env.PF_MOCK === '1' ? 3000 : 30000).unref?.();
async function enviarProgramados() {
  const l = store.get('waProgramados') || []; const ahora = new Date(); const hhmm = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const toca = l.filter((x) => x.estado === 'programado' && x.cuando <= hhmm(ahora)); if (!toca.length) return;
  for (const x of toca) { x.estado = 'enviando'; } store.set('waProgramados', l);   // marcados antes de enviar: nunca dos veces
  for (const x of toca) {
    try {
      try { await enviarWaCliente(x); }
      catch (e) { if (e.code !== 'FUERA_24H') throw e; const r = await fueraDe24(x, { ...(x.pl || {}), texto: x.texto }); if (!r.ok) { const e2 = new Error(r.motivo); throw e2; } x.plantilla = r.enviadoConPlantilla.plantilla; }
      x.estado = 'enviado'; try { waAgente.avisar?.(`Le envié a ${x.nombre || x.telefono} el WhatsApp programado${x.plantilla ? ` (con la plantilla ${x.plantilla}, porque no había escrito en 24 h)` : ''}: «${x.texto.slice(0, 120)}»`); } catch {} }
    catch (e) { x.estado = 'fallido'; x.error = String(e.message).slice(0, 200); try { waAgente.avisar?.(`No pude enviarle a ${x.nombre || x.telefono} el WhatsApp programado: ${x.error}\nEnvíaselo tú desde tu WhatsApp (se abre con el mensaje listo): ${enlaceWa(x.telefono, x.texto)}`); } catch {} }
  }
  store.set('waProgramados', l);
}
agente.registrarLocales(assetTools);
// Publicaciones: el flujo «Publicar» (calidad, portales, rendimiento e interesados), separado del resto
handle('pub:catalogo', () => pubs.catalogo());
handle('pub:configurar', (id, c) => pubs.configurar(id, c || {}));
handle('pub:calidad', (id, op) => pubs.calidad(id, op));
handle('pub:redactar', (id, op) => pubs.redactar(id, op));
handle('pub:textos', (id, t) => pubs.guardarTextos(id, t || {}));
handle('pub:publicar', (id, op, portales, o) => pubs.publicar(id, op, portales || [], o || {}));
handle('pub:retirar', (id, op, portal) => pubs.retirar(id, op, portal));
handle('pub:panel', () => pubs.panel());
handle('pub:sincronizar', () => pubs.sincronizar());
handle('pub:interesados', (f) => pubs.interesados(f || {}));
handle('pub:interesado', (propId, leadId, c) => pubs.actualizarInteresado(propId, leadId, c || {}));
handle('pub:agregarInteresado', (propId, o) => pubs.agregarInteresado(propId, o || {}));
handle('pub:respuesta', (propId, leadId) => pubs.respuesta(propId, leadId));
handle('pub:feed', (portal) => pubs.feed(portal));
handle('pub:exportarFeed', async (portal) => {
  const { xml, avisos } = pubs.feed(portal);
  const r = await dialog.showSaveDialog(win, { title: 'Guardar el feed de avisos', defaultPath: `feed-${portal}.xml`, filters: [{ name: 'XML', extensions: ['xml'] }] });
  if (r.canceled || !r.filePath) return null; require('fs').writeFileSync(r.filePath, xml); return { ruta: r.filePath, avisos };
});
// Documentos desde plantillas (flujo «Gestionar una propiedad»): misma lógica que usa el agente
handle('doc:plantillas', (o) => docs.plantillas(o || {}));
// documentos a medida: buscar plantilla → si no hay, crear con Asset → PDF → firmar
// dictar una propiedad: audio → texto → ficha → (el broker confirma) → propiedad
handle('fotos:drive', (propId) => fotosDesdeDrive(propId));
// ---- Agente por WhatsApp: el ejecutivo le escribe desde su celular vinculado al número de la empresa (wechatia) ----
// ---- Leads (0.14): conversaciones de WhatsApp con clientes (chat exportado) → ficha del lead con su búsqueda ----
const leadsDir = () => path.join(process.env.PF_INMO_DIR || path.join(app.getPath('userData'), 'inmo'), 'leads');
// El equipo son los usuarios de Asset de la corredora (equipo.js); quién usa la app y qué puede ver, la sesión (permisos.js)
const equipo = require('./equipo').crear({ asset, res: reservas, alCambiar: () => toUI('agent:event', { type: 'datos', que: 'equipo' }) });
const permisos = require('./permisos').crear({ inmo, equipo, usuario: usuarioAsset });
handle('acc:estado', async () => { if (!equipo.lista().length && usuarioAsset()) await equipo.cargar(); return permisos.estado(); });
handle('acc:captador', async (propId, usuarioId) => { const r = await permisos.asignarCaptador(propId, usuarioId || null); toUI('agent:event', { type: 'datos', que: 'propiedades' }); return r; });
handle('acc:captadorVarios', async (ids, usuarioId) => { const r = await permisos.asignarVarios(ids || [], usuarioId || null); toUI('agent:event', { type: 'datos', que: 'propiedades' }); return r; });
// usuarios de la corredora (pantalla «Usuarios» del administrador; el equipo lo leen todos)
handle('usr:equipo', async () => (await equipo.cargar()).map(({ id, nombre, email, rol, telefono, activo, wechatiaId, wechatiaNombre }) => ({ id, nombre, email, rol, telefono, activo, wechatiaId, wechatiaNombre })));
handle('usr:listar', () => equipo.listar());
handle('usr:crear', (o) => equipo.crear(o || {}));
handle('usr:editar', (id, o) => equipo.editar(id, o || {}));
handle('usr:clave', (id, clave) => equipo.clave(id, clave));
handle('usr:wechatia', () => equipo.usuariosWechatia({ admin: permisos.esAdmin() }));
const leads = require('./leads').crear({ dir: leadsDir, ai: require('./ai'), inmo, broker: () => ({ nombre: (store.get('waAgente') || {}).nombre || store.get('leadsBroker') || '' }), emit: (e) => toUI('agent:event', e), corredores: () => equipo.lista() });
setTimeout(() => { try { leads.repararDuplicados(); } catch {} try { leads.sincronizarTodos(); } catch {} }, 3000); // 0.16.23 · leads anteriores quedan como persona
handle('leads:asignar', (id, corredorId) => leads.asignar(id, corredorId || null, 'manual'));
// 0.16.23 · derivar: se le avisa al corredor dueño por WhatsApp con los datos del lead y un enlace para escribirle
function textoDerivar(l) {
  const B = l.busqueda || {}; const bq = [B.operacion && (B.operacion === 'arriendo' ? 'arriendo' : 'compra'), B.tipo, B.dormitorios != null && B.dormitorios + 'D', (B.comunas || []).join(', '), B.presupuesto && `hasta ${B.presupuesto.moneda === 'UF' ? 'UF ' : '$'}${Number(B.presupuesto.valor).toLocaleString('es-CL')}`].filter(Boolean).join(' · ');
  const ig = l.ig?.usuario || (l.canales || []).find((c) => c.usuario)?.usuario;
  return [`*Lead para ti* (Asset)`, `${l.nombre || l.chatCon || 'Interesado'}${l.telefono ? ' · ' + l.telefono : ''}${l.email ? ' · ' + l.email : ''}`, `Llegó por ${l.origenTxt || l.origen}${ig ? ' (@' + ig + ')' : ''}`,
    bq && `Busca: ${bq}`, l.resumen, l.perfil && `Perfil: ${l.perfil}`,
    l.telefono ? `Escríbele: ${enlaceWa(l.telefono, `Hola ${String(l.nombre || '').split(' ')[0] || ''}, te escribo por la propiedad que consultaste.`.replace('Hola ,', 'Hola,'))}` : ig ? `Instagram: https://instagram.com/${ig}` : l.email ? `Correo: ${l.email}` : 'Sin teléfono todavía: pídeselo por el canal donde escribió.'].filter(Boolean).join('\n');
}
handle('leads:derivarVer', (id) => { const l = leads.obtener(id, { marcarLeido: false }); const c = l.corredorId ? equipo.porId(l.corredorId) : null; return { corredor: c, texto: textoDerivar(l), conectado: !!reservas.estadoWa().conectado }; });
handle('leads:derivar', async (id) => {
  const l = leads.obtener(id, { marcarLeido: false }); const c = l.corredorId ? equipo.porId(l.corredorId) : null;
  if (!c) throw new Error('Primero asigna el lead a un corredor.'); if (!c.celular) throw new Error(`Falta el teléfono de ${c.nombre} (Usuarios).`);
  const texto = textoDerivar(l);
  try { await reservas.enviarWhatsApp({ telefono: c.celular, nombre: c.nombre, texto, revisar24: true });
    leads.registrarEvento(id, `Derivado a ${c.nombre}: se le avisó por WhatsApp`, 'derivado'); return { ok: true }; }
  catch (e) { leads.registrarEvento(id, `Derivado a ${c.nombre} (aviso preparado; no salió desde el número de la empresa)`, 'derivado');
    return { ok: false, motivo: e.message, enlace: enlaceWa(c.celular, texto) }; }
});
handle('leads:listar', (o) => { const c = permisos.corredorActual(); return leads.listar({ ...(o || {}), ...(c ? { soloDe: c } : {}) }); });
handle('leads:obtener', (id) => { const l = leads.obtener(id); if (!permisos.verLead(l)) throw new Error('Ese lead es de otro corredor.'); try { const pz = l?.telefono ? clientesWa.pausa(l.telefono) : null; if (pz) l.pausaHasta = pz; } catch {} return l; });
handle('leads:analizar', async (o) => { if (o?.miNombre) store.set('leadsBroker', String(o.miNombre).slice(0, 80));
  // 0.16.21 · un .zip puede ser un chat de WhatsApp o la descarga de Instagram: se reconoce por lo que trae
  if (/\.zip$/i.test(o?.ruta || '') || o?.canal === 'instagram') { try { return await leads.analizarInstagram(o || {}); } catch (e) { if (o?.canal === 'instagram' || e.code !== 'NO_IG') throw e; } }
  return leads.analizar(o || {}); });
handle('leads:importarInstagram', (o) => leads.importarInstagram({ brokerNombre: store.get('leadsBroker') || '', ...(o || {}) }));
handle('leads:consentimientos', () => leads.consentimientos());
// 0.16.22 · observador en vivo: Instagram, Facebook y correo desde wechatia, solo lectura
const observador = require('./observador').crear({ res: reservas, leads, store, corredores: equipo, emit: (e) => toUI('agent:event', e) });
handle('obs:estado', () => observador.estado());
handle('obs:configurar', (o) => { const r = observador.configurar({ autorizadoPor: store.get('leadsBroker') || '', ...(o || {}) }); if (r.activo) observador.revisar().catch(() => {}); return r; });
handle('obs:revisar', async () => { const r = await observador.revisar({ forzar: true }); return { ...r, estado: observador.estado() }; });
setTimeout(() => observador.revisar().catch(() => {}), 20000); setInterval(() => observador.revisar().catch(() => {}), 2 * 60000);
handle('leads:importar', (o) => leads.importar(o || {}));
handle('leads:actualizar', (id, c) => leads.actualizar(id, c || {}));
handle('leads:reanalizar', (id) => leads.analizarConIA(id));
handle('leads:borrar', (id) => leads.borrar(id));
// 0.16.9 · Leads: el corredor toma (o devuelve a Fernanda) la conversación de WhatsApp y le responde desde Asset
handle('leads:atencion', (id, quien) => leads.atencion(id, quien));
handle('leads:reanudar', (id) => { const l = leads.obtener(id, { marcarLeido: false }); if (l?.telefono) clientesWa.reanudar(l.telefono); if (l?.atiende === 'corredor') leads.atencion(id, 'agente'); return true; });
handle('leads:responder', async (id, texto) => {
  const l = leads.obtener(id, { marcarLeido: false }); const t = String(texto || '').trim(); if (!t) throw new Error('Escribe el mensaje.');
  if (!l.telefono) throw new Error('Este lead no tiene celular.');
  try { await reservas.enviarWhatsApp({ telefono: l.telefono, nombre: l.nombre || l.chatCon, texto: t, revisar24: true }); }
  catch (e) { if (e.code === 'FUERA_24H') throw new Error('Este lead no ha escrito en las últimas 24 horas: WhatsApp no deja enviar texto libre. Pídele a Fernanda que le envíe la plantilla de seguimiento.'); throw e; }
  leads.registrarWa(id, { de: 'broker', texto: t }); try { clientesWa.marcarEnvio(l.telefono, t); } catch {} if (l.atiende !== 'corredor') leads.atencion(id, 'corredor');
  return leads.obtener(id);
});
// 0.16.8 · atención de clientes: las personas del CRM que escriben al número de la empresa las atiende Diego (asistente
// del corredor). Responde dudas de sus propiedades y de la firma; para agendar o cambiar visitas solo toma el recado.
const clientesWa = require('./cliente-agente').crear({ store, inmo, agenda, docs, leads, ai: require('./ai'), wa: require('./postventa').whatsappWechatia(reservas),
  avisarCorredor: (t, como) => waAgente.avisarComo(como || 'diego', t), emitUI: (e) => toUI('agent:event', e), mock: process.env.PF_MOCK === '1' });
// 0.16.12 · el equipo puede leer la conversación de WhatsApp de un cliente o lead (lo que respondió y lo que le dijo Fernanda)
assetTools.push({ name: 'asset_conversacion_cliente', modo: 'leer',
  description: 'Lee la conversación de WhatsApp con un cliente o lead (lo que escribió el cliente y lo que le respondieron Fernanda, Diego o el corredor) y quién la está atendiendo. Úsala SIEMPRE que el usuario pregunte qué dijo o respondió un cliente, o antes de escribirle de nuevo; no le pidas al usuario que te cuente lo que respondió el cliente.',
  parameters: { type: 'object', properties: { cliente: { type: 'string', description: 'Nombre, celular o RUT del cliente o lead' }, mensajes: { type: 'number', description: 'Cuántos mensajes recientes (máx. 30)' } }, required: ['cliente'] },
  run: async (a) => {
    const q = String(a.cliente || '').trim(); const nq = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); const tel = cleanTel(q);
    const cAct = permisos.corredorActual(); const todos = leads.listar(cAct ? { soloDe: cAct } : {}).leads;
    let l = tel.length >= 8 ? leads.porTelefono(q) : null; if (l && !permisos.verLead(l)) return { nota: 'Ese lead es de otro corredor: no puedo mostrar su conversación.' };
    if (!l) { const c = todos.filter((x) => [x.nombre, x.chatCon].some((v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(nq))); if (c.length > 1) return { error: `Hay varios: ${c.slice(0, 5).map((x) => x.nombre || x.telefono).join(', ')}. ¿Cuál?` }; l = c[0] || null; }
    if (!l) { try { const d = destinoWa({ para: q }); l = leads.porTelefono(d.telefono); if (!l) return { cliente: d.nombre, nota: 'No tiene conversación registrada en Leads (es un cliente del CRM: lo que conversó con Diego queda en su actividad).' }; } catch (e) { return { error: e.message }; } }
    const o = leads.obtener(l.id, { marcarLeido: false }); const n = Math.min(30, a.mensajes || 15);
    return { lead: o.nombre || o.chatCon || o.telefono, telefono: o.telefono, atiende: o.atiende === 'corredor' ? 'el corredor (tomó la conversación)' : 'Fernanda (responde sola)', estado: o.estadoTxt, busca: o.busqueda,
      mensajes: o.mensajesLista.slice(-n).map((m) => ({ de: m.de === 'cliente' ? 'cliente' : m.de === 'agente' ? 'Fernanda' : 'corredor', fecha: m.fecha.replace('T', ' ').slice(0, 16), texto: m.texto || m.transcripcion || `(${m.tipo})` })) };
  } });
assetTools.push({ name: 'asset_atencion_clientes', modo: 'escribir',
  description: 'Enciende, apaga o muestra la atención de clientes por WhatsApp: cuando una persona del CRM le escribe al número de la empresa, Diego (asistente del corredor) le responde dudas de sus propiedades y de la firma, y toma recados para agendar, reprogramar o cancelar visitas o reuniones (no confirma nada solo). Con «pausar» y una persona, deja de responderle 12 h porque el corredor la atiende.',
  parameters: { type: 'object', properties: { activar: { type: 'boolean', description: 'true enciende, false apaga; vacío = solo estado' }, pausar: { type: 'string', description: 'Persona del CRM a la que el corredor quiere atender él (nombre, RUT o id)' }, siempre_activo: { type: 'boolean', description: 'Asset siempre activo (abre al encender el computador, sigue con la ventana cerrada y no se suspende): true/false' } } },
  run: async (a) => {
    if (a.pausar) { const d = destinoWa({ para: a.pausar }); const per = inmo.personaPorId(d.personaId); const h = clientesWa.pausar(per); return { ok: true, pausado: per.nombre, hasta: h }; }
    if (a.activar !== undefined) clientesWa.configurar({ activo: !!a.activar });
    if (a.siempre_activo !== undefined) { store.set('siempreActivo', !!a.siempre_activo); aplicarSiempreActivo(); }
    return { ok: true, ...clientesWa.estado(), nota: clientesWa.activo() ? 'Diego responde a las personas del CRM que escriban al número de la empresa, y te avisa por WhatsApp de cada recado. Asset queda activo aunque cierres la ventana y se abre solo al encender el computador; solo deja de responder si el computador está apagado o sin internet.' : 'Apagada: los mensajes de clientes no se responden solos.', siempreActivo: siempreActivo() };
  } });
const waAgente = require('./whatsapp-agente').crear({ store, wa: require('./postventa').whatsappWechatia(reservas), crearAgente: (o) => require('./agente').crear({ pf, ai: require('./ai'), ...o }),
  locales: assetTools, dictado, inmo, convs, leads, ai: require('./ai'), equipoHoy: () => ofDatos(), emitUI: (e) => toUI('agent:event', e), mock: process.env.PF_MOCK === '1', clientes: clientesWa });
// 0.16.26 · el Agente respeta quién usa el equipo: no muestra datos de dueños reservados ni prepara documentos con ellos
{ const DUENO = new Set(['asset_preparar_formato', 'asset_enviar_formato', 'asset_formulario_documento', 'asset_generar_documento']);
  for (const t of assetTools) { if (t.__acc) continue; t.__acc = true; const run0 = t.run; const prep0 = t.preparar;
    const guard = (a) => { const p = a?.propiedad ? (() => { try { return propPorRef(a.propiedad); } catch { return null; } })() : null; if (!p) return;
      if ((DUENO.has(t.name) && !/orden/i.test(String(a.formato || a.documento || ''))) || (t.name === 'asset_vincular_persona' && a.rol === 'propietario')) permisos.exigir(p); };
    if (prep0) t.preparar = async (a) => { guard(a); return prep0(a); };
    t.run = async (a) => { guard(a); if (['asset_atencion_clientes', 'asset_plantillas_whatsapp'].includes(t.name) && Object.keys(a || {}).some((k) => !/^(consultar|ver)$/.test(k))) permisos.permiso('fernanda'); const out = await run0(a); if (!out || typeof out !== 'object') return out; const ef = out.efectos; const r = permisos.limpiar(out); if (ef) r.efectos = ef; return r; }; } }
handle('wa:estado', () => ({ ...waAgente.estado(), ...reservas.estadoWa() }));
handle('app:siempreActivo', (v) => { if (typeof v === 'boolean') { permisos.permiso('fernanda'); store.set('siempreActivo', v); } return aplicarSiempreActivo(); });
handle('wa:vincular', (o) => { if (!reservas.estadoWa().conectado) throw new Error('Primero conecta el WhatsApp de la empresa (clave de wechatia).'); return waAgente.vincular(o || {}); });
handle('wa:desvincular', () => waAgente.desvincular());
handle('wa:configurar', (o) => waAgente.configurar(o || {}));
handle('wa:revisar', () => waAgente.revisar());
let waOcupado = false;
const waCiclo = async () => { const e = waAgente.estado();
  if (!waOcupado && reservas.estadoWa().conectado && (e.activo || e.codigo)) { waOcupado = true; try { await waAgente.revisar(); } catch {} waOcupado = false; }
  setTimeout(waCiclo, waAgente.ritmo()).unref?.(); };
setTimeout(waCiclo, 4e3).unref?.();
handle('dict:mic', async () => { if (process.platform !== 'darwin') return true; const { systemPreferences } = require('electron'); const st = systemPreferences.getMediaAccessStatus('microphone'); if (st === 'granted') return true; if (st === 'denied' || st === 'restricted') return false; return systemPreferences.askForMediaAccess('microphone'); });
handle('dict:transcribir', (o) => dictado.transcribir({ bytes: o?.bytes, mime: o?.mime }));
handle('dict:extraer', (o) => dictado.extraer(o || {}));
handle('dict:faltan', (o) => dictado.faltan(o || {}));
handle('dict:crear', async (o) => { const p = await inmo.guardarPropiedad(dictado.aFicha(o || {})); inmo.registrar(p.id, 'Propiedad creada dictando'); inmo.guardar(); return p; });
handle('dg:buscar', (o) => docgen.buscar(o || {}));
handle('dg:preparar', (o) => docgen.preparar(o || {}));
handle('dg:redactar', (o) => docgen.redactar(o || {}));
handle('dg:vista', async (o) => { const f = await docgen.vistaPrevia(o || {}); if (process.env.PF_MOCK === '1') (global.__abiertos ||= []).push(f); else shell.openPath(f); return f; });
handle('dg:enviar', (o) => docgen.enviar(o || {}));
handle('dg:persona', (id) => (permisos.personaVisible(id) ? docgen.dePersona(id) : []));
handle('dg:abrir', (f) => { const base = path.join(process.env.PF_INMO_DIR || path.join(app.getPath('userData'), 'inmo'), 'documentos'); const r = path.resolve(String(f || '')); if (!r.startsWith(base + path.sep) || !fs.existsSync(r)) throw new Error('El archivo ya no está.'); if (process.env.PF_MOCK === '1') (global.__abiertos ||= []).push(r); else shell.openPath(r); return true; });
handle('doc:formulario', (o) => docs.formulario(o || {}));
handle('doc:revisar', async (o) => { const r = await docs.revisar(o || {}); return { faltan: r.faltan, firmantes: r.firmantes, plantilla: r.f.plantilla, propiedad: r.f.propiedad, negocio: r.f.negocio }; });
handle('doc:generar', (o) => docs.generar(o || {}));
handle('doc:seguimiento', (op) => docs.seguimiento(op));
handle('agenda:listar', (f) => agenda.listar(f || {}));
handle('agenda:obtener', (id) => agenda.obtener(id));
handle('agenda:crear', async (o) => { const e = agenda.crear(o); const hito = await est.alAgendar(e); return hito ? { ...e, hito } : e; });
handle('agenda:actualizar', (id, o) => agenda.actualizar(id, o));
handle('agenda:borrar', (id) => agenda.borrar(id));
handle('asset:preparar', (name, args) => agente.prepararLocal(name, args || {}));
handle('asset:ejecutar', (name, args) => agente.ejecutarLocal(name, args || {}));
// Etapas (0.15): captación → comercialización → postventa, con pasos logrados / pendientes / no logrados
const etapas = require('./etapas').crear({ agenda, formatos });
handle('et:pasos', (o) => { const n = o?.negocioId ? inmo.negocios().find((x) => x.id === o.negocioId) : null; const p = o?.propId ? inmo.todas().find((x) => x.id === o.propId) : null; if (!n && !p) throw new Error('No encontré el negocio.'); return etapas.pasos({ n, p: n ? null : p, ambito: o?.ambito || (n ? 'negocio' : 'captacion') }); });
handle('et:marcar', (o) => etapas.marcar(o || {}));
// 0.16.11 · Cartera: el avance de captación de cada propiedad (lo logrado y lo que falta)
handle('et:captaciones', () => Object.fromEntries(inmo.todas().filter((p) => !p.archivada).map((p) => { const r = etapas.pasos({ p, ambito: 'captacion' }); const e = r.etapas[0];
  return [p.id, { ok: e.ok, total: e.total, completa: !r.actual, falta: e.pasos.filter((x) => x.e !== 'ok').map((x) => x.t), actual: r.actual ? { t: r.actual.t, e: r.actual.e } : null }]; })));
handle('et:hoy', () => etapas.resumenHoy());
// 0.16 · «La oficina»: lo de hoy repartido entre el equipo (Pedro · Captación, Juanita · Documentos, Diego · Seguimiento,
// Fernanda · Leads), las firmas en curso (la sala de reuniones) y cómo hablarles por WhatsApp
const personas = require('./personas');
function ofDatos() {
  const r = etapas.resumenHoy(); const t = Object.fromEntries(personas.EQUIPO.map((p) => [p.id, []]));
  const quien = (x) => (x.clase === 'esperando' && x.tipo === 'revisar' ? 'juanita' : personas.deP(x.pasoId));
  for (const [lista, e] of [[r.atencion, 'fail'], [r.tetoca, 'pend'], [r.esperando, 'esp']]) for (const x of lista) t[quien(x)].push({ ...x, e, texto: (e === 'pend' && x.accion ? x.accion : x.paso) + (x.codigo ? ' · ' + x.codigo : ''), quien: x.quien });
  try {
    for (const l of leads.listar({ estado: 'abiertos', ...(permisos.corredorActual() ? { soloDe: permisos.corredorActual() } : {}) }).leads) {
      const nom = l.nombre || l.chatCon || l.telefono || 'un cliente';
      const e = l.vencida ? 'fail' : l.sinRespuesta || l.estado === 'nuevo' || l.proximaAccion ? 'pend' : null; if (!e) continue;
      const texto = l.sinRespuesta ? `Responderle a ${nom}` : l.estado === 'nuevo' ? `Contactar a ${nom}` : `${l.proximaAccion?.texto || 'Seguir'} · ${nom}`;
      t.fernanda.push({ e, texto: l.vencida ? `${texto} (venció ${String(l.proximaAccion?.fecha || '').slice(8, 10)}/${String(l.proximaAccion?.fecha || '').slice(5, 7)})` : texto, leadId: l.id, vence: l.proximaAccion?.fecha || null });
    }
  } catch {}
  const orden = { fail: 0, pend: 1, esp: 2 }; for (const k of Object.keys(t)) t[k].sort((a, b) => orden[a.e] - orden[b.e]);
  const firmas = r.esperando.filter((x) => quien(x) === 'juanita').map((x) => ({ texto: x.paso, codigo: x.codigo, titulo: x.titulo, cliente: x.cliente, d: x.d, negocioId: x.negocioId, propId: x.propId }));
  let wa = {}; try { wa = { ...waAgente.estado(), ...reservas.estadoWa() }; } catch {}
  return { tareas: t, firmas, wa: { activo: !!wa.activo, numeroEmpresa: wa.numeroEmpresa || '', telefono: wa.telefono || null, persona: wa.persona || null }, kpis: r.kpis, equipo: personas.EQUIPO.map(({ temas, ...p }) => p) };
}
handle('of:datos', () => ofDatos());
handle('neg:listar', () => { const r = negocios.listar(); return { ...r, negocios: r.negocios.filter((n) => permisos.verNegocio(n)) }; });
handle('neg:obtener', async (id) => { const n = await negocios.obtener(id); if (!permisos.verNegocio(n)) throw new Error('Ese negocio es de otro corredor.'); return n; });
// 0.16.27 · cada negocio es de un corredor (el que lo abrió o el dueño del lead); el administrador lo puede reasignar
handle('neg:corredor', async (id, corredorId) => { const n = await negocios.obtener(id); const c = corredorId ? equipo.porId(corredorId) : null; if (corredorId && !c) throw new Error('Ese usuario no es de tu corredora.');
  const antes = n.corredorId ? equipo.nombre(n.corredorId) : null; negocios.guardar({ id, corredorId: c?.id || null, corredor: c?.nombre || '' });
  try { await negocios.nota(id, c ? (antes ? `Pasó de ${antes} a ${c.nombre}` : `Asignado a ${c.nombre}`) : 'Quedó sin corredor'); } catch {} return negocios.obtener(id); });
handle('neg:guardar', (o) => { if (o?.id) { if (!permisos.verNegocio(negocios.ver(o.id))) throw new Error('Ese negocio es de otro corredor.'); const { corredorId, ...resto } = o; return negocios.guardar(resto); }
  // nuevo: del corredor que lo abre; si lo abre el administrador, del corredor dueño del lead del cliente
  let cid = permisos.corredorActual(); if (!cid && o?.clienteId) { const per = inmo.personaPorId(o.clienteId); const l = per?.leadId ? leads._db().leads.find((x) => x.id === per.leadId) : null; cid = l?.corredorId || null; }
  const c = cid ? equipo.porId(cid) : null; return negocios.guardar({ ...o, ...(c ? { corredorId: c.id, corredor: o.corredor || c.nombre } : {}) }); });
handle('neg:mover', (id, e) => negocios.mover(id, e));
handle('neg:tarea', (id, e, i, v) => negocios.tarea(id, e, i, v));
handle('neg:firmaFuera', (id, e) => negocios.firmaFuera(id, e));
handle('neg:cerrar', (id, r, m) => negocios.cerrar(id, r, m));
handle('neg:reabrir', (id) => negocios.reabrir(id));
handle('neg:nota', (id, t) => negocios.nota(id, t));
handle('neg:borrar', (id) => negocios.borrar(id));
handle('neg:firmaVincular', (id, e, op) => negocios.vincularFirma(id, e, op));
handle('neg:firmaQuitar', (id, e) => negocios.quitarFirma(id, e));
handle('neg:firmasRevisar', (id) => negocios.revisarFirmas(pf, id));
handle('ml:estado', () => ml.estado());
handle('ml:conectar', () => ml.conectar(win));
handle('ml:desconectar', () => ml.desconectar());
handle('ml:contacto', (c, t) => ml.guardarContacto(c, t));
handle('ml:paquetes', () => ml.paquetes());
handle('ml:revisar', (id, op, o) => ml.revisar(id, op, o).then((r) => ({ ...r, payload: undefined })));
handle('ml:publicar', (id, op, o) => ml.publicar(id, op, o));
handle('ml:actualizar', (id, op) => ml.actualizar(id, op));
handle('ml:estadoAviso', (id, op, st) => ml.cambiarEstado(id, op, st));
handle('ml:sincronizar', () => ml.sincronizar());
handle('ml:existentes', () => ml.avisosExistentes());
handle('ml:vincular', (l) => ml.vincularAvisos(l));
handle('ml:barrios', (c, r) => ml.barrios(c, r));
handle('inmo:leadsVistos', (id) => inmo.parchear(id, (p) => (p.leads || []).forEach((l) => { l.visto = true; })));
if (process.env.PF_MOCK === '1' && process.env.PF_ML_MOCK !== '0') global.__mlMock = require('./portales/mercadolibre-mock')._state;
handle('inmo:listar', () => permisos.listar(inmo.listar()));
handle('inmo:resumen', async () => permisos.limpiar(await inmo.resumen()));
// 0.16.14 · ficha completa por bloques (ficha-campos.js). El propietario se anota en la ficha mientras falta su RUT;
// apenas hay nombre y RUT válido entra al CRM y queda vinculado a la propiedad.
const FC = require('./ficha-campos');
async function propietarioPendiente(p) {
  const f = p.ficha || {}; if ((p.vinculos || []).some((v) => v.rol === 'propietario')) return p;
  if (!f.propietarioNombre || !f.propietarioRut || !inmo.validRut(f.propietarioRut)) return p;
  const ya = inmo.listar().personas.find((x) => String(x.rut).replace(/[^0-9kK]/g, '').toUpperCase() === String(f.propietarioRut).replace(/[^0-9kK]/g, '').toUpperCase());
  let per = ya;
  try { if (!per) per = await inmo.guardarPersona({ nombre: f.propietarioNombre, rut: f.propietarioRut, email: f.propietarioEmail || '', telefono: f.propietarioCelular || '', roles: ['propietario'] }); } catch { return p; }
  try { return await inmo.vincular(p.id, per.id, 'propietario'); } catch { return p; }
}
function fichaDe(id) {
  const p = inmo.obtener(id);
  return { prop: p, bloques: FC.avance(p), siguiente: FC.siguiente(p).bloque?.id || null,
    campos: FC.CAMPOS.map((c) => ({ id: c.id, t: c.t, k: c.k, b: c.b, op: c.op || null, pi: c.pi, plano: c.plano, virtual: !!c.virtual, per: c.per || null, aplica: c.si(p), clave: !!(c.req && c.req(p)), valor: FC.valor(p, c) ?? null, falta: c.si(p) && FC.falta(p, c) })) };
}
handle('inmo:ficha', (id) => { const f = fichaDe(id); if (permisos.puede(f.prop)) return { ...f, prop: permisos.redactarProp(f.prop) };
  return { ...f, prop: permisos.redactarProp(f.prop), campos: f.campos.map((c) => (c.per || /^propietario/.test(c.id) ? { ...c, valor: null, falta: false, reservado: true } : c)) }; });
// dictar o pegar datos sueltos de una propiedad ya creada («depto 504, piso 5, tiene piscina…»)
handle('inmo:completarFicha', async (id, texto) => {
  const r = await dictado.completar({ texto, p: inmo.obtener(id) });
  const o = { ...r.plano, ...(Object.keys(r.ficha).length ? { ficha: r.ficha } : {}) };
  if (Object.keys(o).length) await cambiarPropiedad(id, o);
  return { guardado: [...Object.keys(r.plano), ...Object.keys(r.ficha)].map((k) => FC.POR_ID[k]?.t || k), plano: r.plano, campos: r.ficha, dudas: r.dudas, ficha: fichaDe(id) };
});
handle('inmo:propGuardar', async (o) => {
  const antes = o.id ? JSON.parse(JSON.stringify(inmo.obtener(o.id))) : null;
  o = permisos.filtrarGuardado(o);
  const p = await propietarioPendiente(await inmo.guardarPropiedad(o)); // la que crea un corredor queda captada por él (inmo / API)
  if (antes) ml.reaccionar(antes, p).then((m) => { if (m.length) toUI('inmo:portal', m); }).catch(() => {}); // el aviso del portal se mantiene al día solo
  return p;
});
handle('inmo:propArchivar', (id, a) => inmo.archivarPropiedad(id, a));
handle('inmo:perGuardar', (o) => { if (o?.id && !permisos.personaVisible(o.id)) throw new Error('Los datos de este propietario solo los edita el corredor que captó su propiedad o el administrador.'); return inmo.guardarPersona(o); });
handle('inmo:perBorrar', (id) => inmo.borrarPersona(id));
handle('inmo:vincular', (p, c, r) => { if (r === 'propietario') permisos.exigir(inmo.obtener(p)); return inmo.vincular(p, c, r); });
handle('inmo:desvincular', (p, c, r) => { if (r === 'propietario') permisos.exigir(inmo.obtener(p)); return inmo.desvincular(p, c, r); });
handle('inmo:nota', (ref, t) => inmo.nota(ref, t));
handle('inmo:actividad', async (id) => permisos.limpiar(await inmo.actividadDe(id)));
handle('inmo:actividadTodas', async (o) => permisos.limpiar(await inmo.actividadTodas(o || {})));
handle('inmo:docAgregar', (id, paths, tipo) => inmo.agregarDocumentos(id, paths, tipo));
handle('inmo:docElegir', async (id) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Documentos e imágenes', extensions: ['pdf', 'docx', 'doc', 'xlsx', 'jpg', 'jpeg', 'png', 'webp', 'heic'] }] });
  return r.canceled ? null : inmo.agregarDocumentos(id, r.filePaths);
});
handle('inmo:docQuitar', (id, d) => inmo.quitarDocumento(id, d));
handle('inmo:docAbrir', (id, d) => { const p = inmo.docPath(id, d); if (/\.(pdf|docx?|xlsx?|jpe?g|png|webp)$/i.test(p)) openInEditor([p]); else shell.openPath(p); return true; });
handle('inmo:docCarpeta', (id) => inmo.mostrarCarpeta(id));
handle('inmo:importar', () => inmo.importarPF(pf, (x) => toUI('inmo:progreso', x)));
