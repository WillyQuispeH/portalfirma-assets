/* global pf */
'use strict';
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clp = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString('es-CL'));
if (navigator.userAgent.includes('Windows')) document.body.classList.add('win');
// En Windows los atajos se muestran como Ctrl / Shift (los textos de la app usan los símbolos de Mac).
const IS_WIN = navigator.userAgent.includes('Windows');
function winKeys(t) {
  if (!IS_WIN || !t || !/[⌘⌃⇧]/.test(t)) return t;
  return t.replace(/⌃⌘F/g, 'F11').replace(/⌘\/Ctrl/g, 'Ctrl').replace(/([⌃⇧⌘]+)/g, (m) => [...new Set([...m].map((c) => ({ '⌃': 'Ctrl', '⌘': 'Ctrl', '⇧': 'Shift' })[c]))].sort((a, b) => (a === 'Ctrl' ? -1 : b === 'Ctrl' ? 1 : 0)).join('+') + '+').replace(/\+(\s|\)|$)/g, '$1').replace(/Ctrl\+↩/g, 'Ctrl+Enter');
}
if (IS_WIN) {
  const fix = (root) => {
    if (root.nodeType === 1) { if (root.title) root.title = winKeys(root.title); root.querySelectorAll?.('[title]').forEach((n) => { n.title = winKeys(n.title); }); }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/[⌘⌃⇧]/.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
    for (let n; (n = tw.nextNode());) n.data = winKeys(n.data);
  };
  new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'attributes') { const v = winKeys(m.target.title); if (v !== m.target.title) m.target.title = v; } else m.addedNodes.forEach((n) => fix(n)); } })
    .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  document.addEventListener('DOMContentLoaded', () => fix(document.body)); fix(document.body);
}

// «Enviar a firmar» está en React (src/ui/components/functional/gestion/enviar-a-firmar): soltar, analizando,
// revisar y enviado, cada una montada en su sección (#view-drop, #view-working, #view-review, #view-done).
// Aquí quedan la sesión, show(), los formularios en ventana (modal), el arrastre de archivos sobre la ventana
// y los nombres de siempre que usan los demás módulos: startAnalysis() y showDone().
const state = { session: null };

// ---------- utilidades ----------
function show(view) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $('#view-' + view).classList.remove('hidden');
  const tabView = view === 'actividad' ? 'inicio' : ['inicio', 'agente', 'cartera', 'personas', 'leads', 'negocios', 'agenda', 'publicaciones', 'postventa', 'finanzas', 'arriendos'].includes(view) ? view : view === 'aprende' || view === 'integraciones' ? '' : 'home'; // lo documental queda bajo «Gestión documental»
  document.body.classList.toggle('wide', view === 'editor');
  document.body.classList.toggle('home-on', view === 'home');
  document.body.classList.toggle('ng-on', view === 'negocios');
  document.body.classList.toggle('ld-on', view === 'leads');
  document.body.classList.toggle('agv-on', view === 'agente');
  document.body.classList.toggle('inmo-on', ['inicio', 'actividad', 'agente', 'publicaciones', 'postventa', 'leads', 'cartera', 'personas', 'negocios', 'agenda', 'aprende', 'finanzas', 'arriendos', 'integraciones'].includes(view));
  document.body.classList.toggle('ops-on', view === 'recientes' || view === 'ops' || view === 'bulk' || view === 'plazos' || view === 'flujos' || view === 'expedientes' || view === 'escrituras');
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === tabView));
  window.editor?.refreshTabs?.();
  window.Ayuda?.onView(view);
  window.editor?.refreshBusy?.();
  window.Agente?.alMostrar?.(view);
}
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), ms); }
// Si React tenía un formulario en el modal (src/ui/utils/modal.tsx), se desmonta antes de escribir o al cerrar
// Cada ventana empieza con su clave: modal(`<!--modal-23-->…`). Se ve chiquita en una esquina (styles.css, #modalCard[data-clave]).
function modal(html) {
  window.ReactUI?.liberarModal(); const c = $('#modalCard');
  const k = /^<!--(modal-\d+)-->/.exec(html); if (k) c.dataset.clave = k[1]; else delete c.dataset.clave;
  c.innerHTML = html; armarSecciones(c); $('#modal').classList.remove('hidden');
}
// La ventana en tres partes, como el Modal del kit (styles.css, .mdl-cab / .mdl-cuerpo / .mdl-pie): encabezado (el primer título, con una X para
// cerrar), cuerpo (lo único que se desplaza) y pie (la última fila de botones, .actions). Los elementos se MUEVEN, no se
// copian: los onclick que cada módulo les pone después de modal() siguen funcionando. El título solo se toma si abre la
// ventana (primer elemento, o primero dentro del primero), y los botones solo si la cierran (lo último del contenido).
function armarSecciones(card) {
  const cuerpo = document.createElement('div'); cuerpo.className = 'mdl-cuerpo';
  while (card.firstChild) cuerpo.appendChild(card.firstChild);
  const primero = cuerpo.firstElementChild;
  const titulo = [primero, primero?.firstElementChild].find((e) => e && /^H[23]$/.test(e.tagName));
  const acciones = [...cuerpo.querySelectorAll('.actions')].pop();
  let alFinal = !!acciones;
  for (let e = acciones; alFinal && e && e !== cuerpo; e = e.parentElement) if (e.nextElementSibling) alFinal = false;
  const cab = titulo ? document.createElement('header') : null;
  const pie = alFinal ? document.createElement('footer') : null;
  if (cab) { cab.className = 'mdl-cab'; cab.appendChild(titulo); }
  if (pie) { pie.className = 'mdl-pie'; pie.appendChild(acciones); }
  // la X: hace lo mismo que «Cancelar» (así quien espera la respuesta se entera); sin Cancelar, cierra
  if (cab && (pie || card.querySelector('#mCancel') || cuerpo.querySelector('#mCancel'))) {
    const x = document.createElement('button'); x.type = 'button'; x.className = 'mdl-x'; x.setAttribute('aria-label', 'Cerrar'); x.innerHTML = icon('x', 16);
    x.onclick = () => { const cancelar = card.querySelector('#mCancel'); if (cancelar && !cancelar.disabled) cancelar.click(); else closeModal(); };
    cab.appendChild(x);
  }
  if (cab) card.appendChild(cab);
  card.appendChild(cuerpo);
  if (pie) card.appendChild(pie);
}
// Esc cierra la ventana antigua como su X (el Modal del kit atiende su propio Esc antes y no lo deja pasar)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || $('#modal').classList.contains('hidden')) return;
  const x = $('#modalCard .mdl-x'); if (x) { e.preventDefault(); x.click(); }
});
// al cerrar también se vacía: si no, sus botones (#mOk, #mCancel…) quedan ocultos en la página y chocan con los de otra ventana
function closeModal() { $('#modal').classList.add('hidden'); $('#modalCard').classList.remove('im-wide'); delete $('#modalCard').dataset.clave; window.ReactUI?.liberarModal(); $('#modalCard').innerHTML = ''; }
async function api(fn, ...args) {
  const r = await pf[fn](...args);
  if (!r.ok) {
    if (r.code === 'NEEDS_ASSET_LOGIN') window.__acceso.vencido(); // venció la sesión de Asset: vuelve la pantalla de ingreso
    else if (r.code === 'NEEDS_LOGIN' || r.error === 'NEEDS_LOGIN') { state.session = null; setAccount(); requireLogin(() => show('drop'), 'Tu sesión expiró. Inicia sesión nuevamente.'); }
    const e = new Error(r.error); e.data = r.data; throw e;
  }
  return r.data;
}

// RUT chileno: módulo 11
function cleanRut(r) { return String(r || '').replace(/[^0-9kK]/g, '').toUpperCase(); }
function validRut(r) {
  const c = cleanRut(r); if (c.length < 2) return false;
  const body = c.slice(0, -1), dv = c.slice(-1);
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += Number(body[i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const res = 11 - (sum % 11);
  const exp = res === 11 ? '0' : res === 10 ? 'K' : String(res);
  return dv === exp;
}
function formatRut(r) {
  const c = cleanRut(r); if (c.length < 2) return r;
  const body = c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${c.slice(-1)}`;
}

// ---------- conexión con Portalfirma (solo para firma y plantillas) ----------
// El login de la app es el de Asset (React: components/functional/acceso, src/asset.js). Portalfirma ya no es un
// login: es una conexión que se pide solo al usar sus funciones. state.session es esa conexión.
// La interfaz de la cuenta está en React (src/ui/components/functional/cuenta): el botón y el menú del usuario
// (#account, window.Usuario), la pantalla «Conecta tu cuenta» (#view-login) y la conexión directa
// (window.ApiDiag). La sesión del conector y estas funciones siguen aquí porque las usan muchos módulos.
function setAccount() {
  const on = !!state.session;
  document.body.classList.toggle('guest', !on);
  window.dispatchEvent(new Event('pf-account'));
  window.Usuario?.refresh(); // React vuelve a leer la cuenta (y corrige .guest si hay conexión directa)
}
function toLoggedIn(sess) {
  state.session = sess; setAccount();
  const next = state.afterLogin; state.afterLogin = null;
  if (next) next(); else if (!$('#view-login').classList.contains('hidden')) show('drop');
}
function toLoggedOut(msg) {
  state.session = null; setAccount();
  if (msg) { window.__cuenta.aviso(msg); show('login'); }
}
// Ejecuta `fn` si hay sesión; si no, muestra el inicio de sesión y continúa después.
function requireLogin(fn, why, forTab) {
  if (state.session) return fn();
  state.afterLogin = fn; state.loginFor = forTab || null;
  window.__cuenta.motivo(why); // sin motivo, el texto de siempre
  show('login');
}
// Funciones exclusivas para clientes de Portalfirma (IA y firma): piden iniciar sesión y vuelven a donde estaba.
const MEMBERS_WHY = 'Esta función es exclusiva para clientes de Portalfirma. Inicia sesión con tu cuenta para usarla.';
function members(fn, why) {
  if (state.session) return fn();
  const back = [...document.querySelectorAll('.view')].find((v) => !v.classList.contains('hidden'))?.id.replace('view-', '') || 'home';
  requireLogin(() => { if (back === 'editor') window.studio.goEditor(); else if (back === 'home') window.studio.goHome(); else show(back); return fn(); }, why || MEMBERS_WHY);
}
window.members = members;
window.isMember = () => !!state.session || !!window.Usuario?._u.user;
async function refreshBalance() { try { const b = await api('balance'); if (state.session) state.session.balance = b; } catch {} }
window.refreshBalance = refreshBalance;
window.saldoSesion = () => state.session?.balance;
// Lo que la cuenta en React lee de la sesión
window.sesionActual = () => state.session;
window.cancelarInicioSesion = () => { state.afterLogin = null; };
// «Conecta tu cuenta de Portalfirma» (React: src/ui/components/functional/cuenta/InicioSesion.tsx)
window.ReactUI.montar('InicioSesion', $('#view-login'));
// Finanzas (React, src/ui/componentes/Finanzas.jsx): se vuelve a montar al abrirla, así los datos siempre están al día
function abrirFinanzas() {
  const el = $('#view-finanzas'); show('finanzas');
  window.ReactUI.desmontar(el); window.ReactUI.montar('Finanzas', el);
}
window.abrirFinanzas = abrirFinanzas;
// Arriendos (React, src/ui/components/functional/arriendos): la etapa 3, todavía en construcción
function abrirArriendos() {
  const el = $('#view-arriendos'); show('arriendos');
  window.ReactUI.desmontar(el); window.ReactUI.montar('Arriendos', el);
}
// Configuración (React, src/ui/components/functional/configuracion): desde el menú del usuario, con pestañas (General,
// WhatsApp y asistentes, Integraciones). Usa #view-integraciones; se vuelve a montar al abrirla, así el estado de cada
// conexión está al día. «Integraciones» abre su pestaña.
function abrirConfiguracion(pestana) {
  const el = $('#view-integraciones'); show('integraciones');
  window.ReactUI.desmontar(el); window.ReactUI.montar('Configuracion', el, { pestana: pestana || 'general' });
}
const abrirIntegraciones = () => abrirConfiguracion('integraciones');
window.abrirConfiguracion = abrirConfiguracion;
window.abrirIntegraciones = abrirIntegraciones;
document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => {
  const v = t.dataset.view;
  if (v === 'inicio') window.Inmo.inicio();
  else if (v === 'agente') window.Agente.vista();
  else if (v === 'cartera') window.Inmo.cartera();
  else if (v === 'personas') window.Inmo.personas();
  else if (v === 'negocios') window.Negocios.abrir();
  else if (v === 'agenda') window.Agenda.abrir();
  else if (v === 'publicaciones') window.Publicaciones.abrir();
  else if (v === 'postventa') window.Postventa.abrir();
  else if (v === 'leads') window.Leads.abrir();
  else if (v === 'finanzas') abrirFinanzas();
  else if (v === 'arriendos') abrirArriendos();
  else if (v === 'home') window.studio.goHome();
  else if (v === 'editor') window.studio.goEditor();
  else if (v === 'tpl') requireLogin(() => { show('tpl'); window.openTemplates && window.openTemplates(); }, 'Para usar la Notaría virtual, inicia sesión en Portalfirma.', 'tpl');
  else if (v === 'plazos') window.Plazos.open();
  else if (v === 'recientes') window.Recientes.open();
  else if (v === 'ops') { show('ops'); window.Operaciones.open(); }
  else requireLogin(() => show(window.__envio.hayAnalisis() ? 'review' : 'drop'), 'Para enviar documentos a firmar, inicia sesión en Portalfirma.', 'send');
}));

// ---------- arrastrar y soltar ----------
let dragDepth = 0;
const isFileDrag = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { e.preventDefault(); if (!isFileDrag(e)) return; dragDepth++; $('#dragOverlay').classList.remove('hidden'); document.body.classList.add('dragging'); });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { $('#dragOverlay').classList.add('hidden'); document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; $('#dragOverlay').classList.add('hidden'); document.body.classList.remove('dragging');
  const files = [...e.dataTransfer.files]; const f = files[0]; if (!f) return;
  const paths = files.map((x) => pf.pathForFile(x));
  if (!$('#view-leads').classList.contains('hidden')) return window.Leads.dropFiles(paths); // leads: chats exportados de WhatsApp
  if (window.Inmo?.fichaAbierta()) return window.Inmo.dropFiles(paths); // ficha de propiedad: los archivos quedan en sus documentos
  if (!$('#view-bulk').classList.contains('hidden')) return pf.bulkAdd(paths); // carga masiva: todo va a la cola
  if (!$('#view-expedientes').classList.contains('hidden')) return window.Expedientes.dropFiles(paths); // expedientes: los archivos se guardan en el caso elegido
  if (!$('#view-escrituras').classList.contains('hidden')) return window.Escrituras.dropFiles(paths); // escrituras: minuta o documentos a protocolizar
  if (!$('#view-flujos').classList.contains('hidden')) return window.Flujos.dropFiles(paths); // flujos: la nómina (en otros pasos no se abre nada)
  const onSend = !$('#view-drop').classList.contains('hidden') && state.session;
  // Fuera de "Enviar a firmar": cada PDF se abre en su pestaña; Word, Excel e imágenes se convierten.
  if (!onSend) { window.studio.goEditor(); return window.editor.openEach(paths); }
  // Varios archivos, o formatos que hay que convertir (Excel, imágenes): se abren en el editor.
  if (files.length > 1 || !/\.(pdf|docx)$/i.test(f.name)) {
    show('editor'); window.editor.open(); window.editor.openPaths(paths, true);
    return toast(files.length > 1 ? 'Se abrieron en el Editor PDF para combinarlos.' : 'Se abrió en el Editor PDF para convertirlo a PDF.', 4000);
  }
  try { startAnalysis(await api('checkFile', pf.pathForFile(f))); } catch (err) { toast(err.message, 4000); }
});
pf.onFile((f) => window.editor.openPaths([f.path], true));
pf.onOpenInEditor((paths) => window.editor.openPaths(paths, true));
pf.onFileError((m) => toast(m, 4000));

// ---------- Enviar a firmar (React) ----------
// Las cuatro pantallas se montan una vez; su estado está en src/ui/store/zustand/envio.store.ts.
['drop', 'working', 'review', 'done'].forEach((paso) => window.ReactUI.montar('GestionEnviarAFirmar', $('#view-' + paso), { paso }));
// Analiza un archivo ({ name, path }) y pasa a revisar. `firmantes`: los de una plantilla llenada en el editor.
function startAnalysis(file, firmantes) { return window.__envio.analizar(file, firmantes || null); }
// La pantalla «Enviado» (también la usa la Notaría virtual, en templates.js)
function showDone(r) { window.__envio.listo(r); }

// ---------- inicio: primero la cuenta de Asset (pantalla de ingreso); después, la conexión con Portalfirma ----------
// Perfil del usuario de Asset (ADMIN o CORREDOR): oculta lo que solo hace el administrador. Se lee al entrar.
window.perfilEquipo = async () => { try { const r = await pf.accEstado(); if (r.ok) { document.body.classList.toggle('perfil-corredor', !r.data.esAdmin); window.PERFIL = r.data; } } catch {} };
(async () => {
  setAccount();
  await window.__acceso.esperar(); // sin sesión de Asset no sigue: la pantalla de ingreso tapa la app
  window.perfilEquipo();
  const vistaActual = () => [...document.querySelectorAll('.view')].find((v) => !v.classList.contains('hidden'))?.id;
  const antes = vistaActual();
  const r = await pf.restore();
  // con conexión, Asset abre en el Agente; salvo que la persona ya se haya movido a otra pantalla mientras tanto
  if (r.ok && r.data) { state.session = r.data; setAccount(); if (pf.inicioVista === 'agente' && vistaActual() === antes) { const v = () => window.Agente?.vista(); if (document.readyState === 'complete') v(); else window.addEventListener('load', v, { once: true }); } return; } // con sesión, Asset abre en el Agente
  // sin conexión con Portalfirma la app se usa igual; se pide al usar la firma o las plantillas
})();
// Postventa en pausa (0.13): la pestaña se muestra solo si se habilita
try { if (!pf.cfg?.()?.postventa) document.querySelector('#nav [data-view="postventa"]')?.remove(); } catch {}
