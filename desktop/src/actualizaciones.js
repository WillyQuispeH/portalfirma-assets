// Actualizaciones automáticas con electron-updater, desde GitHub Releases (ver INSTALADORES.md).
//  · Al abrir la app (a los 15 s) y cada 4 horas pregunta si hay una versión nueva; si la hay, la descarga sola.
//  · Descargada: la interfaz muestra «Reiniciar para actualizar» (estado()/instalar(), canal 'act:estado').
//  · «Siempre activo»: la app casi nunca se cierra del todo (cerrar la ventana la oculta). Si la versión nueva está lista
//    y la ventana lleva 30 minutos oculta sin documentos sin guardar, se instala sola y vuelve a quedar oculta.
//  · Mac sin firmar: macOS no deja que se instale sola. Si falla por eso, se ofrece descargarla desde la página de la
//    versión (estado.manual + estado.url). Cuando la app esté firmada y notarizada, funciona sola sin cambiar nada aquí.
//  · Solo en la app instalada (app.isPackaged) y nunca en modo de prueba (PF_MOCK).
const { app } = require('electron');

const CADA = 4 * 60 * 60 * 1000;
const OCULTA_PARA_INSTALAR = 30 * 60 * 1000;

let actualizador = null;
let estado = { fase: 'nada', version: null, avance: 0, error: null, manual: false, url: null };
let avisar = () => {};
let opciones = {};
let ocultaDesde = null;

const cambiar = (x) => { estado = { ...estado, ...x }; avisar(estado); };
const paginaVersion = (v) => {
  const p = require('../package.json').build?.publish; const pub = Array.isArray(p) ? p[0] : p;
  return pub?.owner && pub?.repo ? `https://github.com/${pub.owner}/${pub.repo}/releases/${v ? 'tag/v' + v : 'latest'}` : null;
};

/**
 * @param {{ alCambiar: (estado: object) => void, ventana: () => Electron.BrowserWindow | null,
 *           sinCambios: () => boolean, antesDeInstalar: () => void }} o
 */
function init(o) {
  opciones = o; avisar = o.alCambiar || avisar;
  if (!app.isPackaged || process.env.PF_MOCK === '1') return;
  try { ({ autoUpdater: actualizador } = require('electron-updater')); } catch (e) { console.warn('[actualizaciones] sin electron-updater:', e.message); return; }
  actualizador.autoDownload = true;
  actualizador.autoInstallOnAppQuit = true; // si se cierra del todo (Salir), se instala al salir
  actualizador.logger = { info: () => {}, warn: (m) => console.warn('[actualizaciones]', m), error: (m) => console.warn('[actualizaciones]', m), debug: () => {} };

  actualizador.on('checking-for-update', () => cambiar({ fase: estado.fase === 'lista' ? 'lista' : 'buscando', error: null }));
  actualizador.on('update-not-available', () => cambiar({ fase: 'nada', version: null }));
  actualizador.on('update-available', (i) => cambiar({ fase: 'descargando', version: i.version, avance: 0, url: paginaVersion(i.version) }));
  actualizador.on('download-progress', (p) => cambiar({ fase: 'descargando', avance: Math.round(p.percent || 0) }));
  actualizador.on('update-downloaded', (i) => { cambiar({ fase: 'lista', version: i.version, avance: 100 }); revisarSiInstalarSola(); });
  actualizador.on('error', (e) => {
    const msg = String(e?.message || e);
    // Mac sin firmar (o sin permiso para reemplazar la app): se ofrece descargarla a mano
    if (process.platform === 'darwin' && estado.version) return cambiar({ fase: 'manual', manual: true, error: msg, url: paginaVersion(estado.version) });
    cambiar({ fase: estado.fase === 'lista' ? 'lista' : 'nada', error: msg });
  });

  setTimeout(buscar, 15_000);
  setInterval(buscar, CADA);
  setInterval(revisarSiInstalarSola, 60_000);
}

function buscar() {
  if (!actualizador) return Promise.resolve(estado);
  return actualizador.checkForUpdates().then(() => estado).catch((e) => { cambiar({ error: String(e?.message || e) }); return estado; });
}

/** reinicia e instala la versión descargada (la pide la interfaz o la instalación sola) */
function instalar({ oculta = false } = {}) {
  if (!actualizador || estado.fase !== 'lista') return false;
  try { opciones.antesDeInstalar?.({ oculta }); } catch {}
  // isSilent: el instalador de Windows no muestra pantallas; isForceRunAfter: vuelve a abrir la app al terminar
  setImmediate(() => actualizador.quitAndInstall(true, true));
  return true;
}

// con la versión lista, la ventana oculta hace 30 minutos y nada sin guardar: se instala sola
function revisarSiInstalarSola() {
  const w = opciones.ventana?.();
  const oculta = !!w && !w.isDestroyed() && !w.isVisible();
  if (!oculta) { ocultaDesde = null; return; }
  ocultaDesde ??= Date.now();
  if (estado.fase === 'lista' && Date.now() - ocultaDesde >= OCULTA_PARA_INSTALAR && opciones.sinCambios?.()) instalar({ oculta: true });
}

module.exports = { init, buscar, instalar, estado: () => ({ ...estado, actual: app.getVersion(), activo: !!actualizador }) };
