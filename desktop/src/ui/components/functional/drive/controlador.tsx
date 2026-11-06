// Google Drive: navegar carpetas, elegir uno o varios documentos y
//  · enviarlos a firmar (uno → «Enviar a firmar»; varios o una carpeta completa → carga masiva),
//  · abrirlos en el editor, convertir uno en plantilla, o agregarlos a un expediente o a Plazos.
// Se instala al cargar el bundle (index.tsx) como window.Drive, que usan Enviar a firmar, Expedientes, Plantillas,
// el dictado y la cuenta del usuario.
import { CambiandoCuenta, Conectar, Cuenta, Descargando, Elegidos, EsperandoSelector, Explorador, NoDisponible } from './Drive';
import { drive, driveEstado } from '../../../store/hooks/useDrive.hook';
import { abrirModal, cerrarModal } from '../../../utils/modal';
import { abrirEnEditorVarios, agregarAExpediente, agregarAPlazos, cargaMasivaConArchivos, esMiembro, importarPlantillaDrive, mostrarVista, pedirSesion, soporteWhatsApp, toast } from '../../../utils/app';
import { analizarDocumento } from '../gestion/enviar-a-firmar/controlador';
import { envioOperacion } from '../../../store/hooks/useEnvio.hook';
import type { IDriveArchivo, IDriveEstado, TDriveAccion, TDrivePara } from '../../../store/interfaces/drive.interface';

async function desconectar() { await drive.desconectar(); cerrarModal(); toast('Google Drive desconectado.'); }

export async function abrir(opts: { purpose?: TDrivePara } = {}) {
  const para = opts.purpose || 'sign';
  driveEstado().driveIniciar(para);
  const r = await drive.estado(); const st: IDriveEstado = r.ok && r.data ? r.data : { configured: false };
  if (!st.configured) return noDisponible(para);
  if (!st.connected) return conectar(para, !!st.reconnect);
  if (para === 'connect') return cuenta(st);
  driveEstado().driveIniciar(para, st.email || '');
  if (st.picker) return selector(); // selector oficial de Google (permiso solo sobre lo que eliges)
  abrirModal(<Explorador alHacer={hacer} alDesconectar={desconectar} alReconectar={() => conectar(para, false)} />, { clave: 'modal-66' });
}

// ---------- Cuenta de Google conectada: ver, cambiar o desconectar ----------
function cuenta(st: IDriveEstado) {
  abrirModal(<Cuenta email={st.email} alDesconectar={desconectar} alCambiar={() => { cambiarCuenta(); }} />, { clave: 'modal-67' });
}
export async function cambiarCuenta() {
  await drive.desconectar();
  abrirModal(<CambiandoCuenta />, { clave: 'modal-68' });
  const r = await drive.conectar();
  cerrarModal();
  if (!r.ok) { toast('No se pudo conectar: ' + r.error, 7000); return undefined; }
  toast(`Google Drive conectado con ${r.data?.email || 'la nueva cuenta'}.`);
  return r.data;
}
async function verCuenta() {
  const r = await drive.estado();
  if (r.ok && r.data?.connected) cuenta(r.data); else abrir({ purpose: 'connect' });
}

// ---------- Selector de Google ----------
async function selector() {
  const { para, email } = driveEstado();
  abrirModal(<EsperandoSelector uno={para === 'template'} email={email} alCancelar={() => drive.cancelarSelector()} alReabrir={() => drive.reabrirSelector()} />, { clave: 'modal-69' });
  const r = await drive.elegir({ multi: para !== 'template', folders: para !== 'template' });
  if (!r.ok) { if (/Conecta/.test(r.error || '')) return conectar(para, false); cerrarModal(); return toast(r.error || '', 6000); }
  const archivos: IDriveArchivo[] = []; const fallas: string[] = [];
  for (const f of r.data || []) {
    if (!f.isFolder) { archivos.push(f); continue; }
    const x = await drive.documentosDeCarpeta(f.id);
    if (x.ok && x.data?.length) archivos.push(...x.data); else fallas.push(f.name);
  }
  if (fallas.length) toast(`No pude abrir los documentos de la carpeta «${fallas.join('», «')}». Entra a la carpeta en el selector y elige los archivos (puedes marcar varios).`, 8000);
  if (!archivos.length) return cerrarModal();
  driveEstado().driveElegir(archivos);
  if (para === 'template' && archivos.length === 1) { cerrarModal(); return hacer('template'); }
  if (para === 'exp') return hacer('exp');
  abrirModal(<Elegidos alHacer={hacer} alElegirOtros={selector} alDesconectar={desconectar} />, { clave: 'modal-70' });
}

function noDisponible(para: TDrivePara) {
  // Los usuarios no configuran nada: la credencial viene incluida en la app. Si falta, se ofrece soporte.
  abrirModal(<NoDisponible
    alSoporte={() => { cerrarModal(); soporteWhatsApp('Hola, quiero usar Google Drive en PortalFirma Asset y aparece como no disponible.'); }}
    alActivar={async () => { const c = await drive.activar(); if (!c.ok) return toast(c.error || '', 6000); if (!c.data) return; cerrarModal(); toast('Google Drive activado.'); abrir({ purpose: para }); }} />, { clave: 'modal-71' });
}
function conectar(para: TDrivePara, otraVez: boolean) {
  abrirModal(<Conectar otraVez={otraVez} alConectar={async () => {
    const c = await drive.conectar();
    if (!c.ok) { cerrarModal(); return toast(c.error || '', 6000); }
    abrir({ purpose: para });
  }} />, { clave: 'modal-72' });
}

// Descarga lo elegido (de a 2) mostrando el avance
async function descargarTodo(archivos: IDriveArchivo[]) {
  const listos: { f: IDriveArchivo; ruta: string }[] = []; const errores: string[] = []; let i = 0; let hechos = 0;
  abrirModal(<Descargando hechos={0} total={archivos.length} />, { clave: 'modal-73' });
  const trabajador = async () => {
    while (i < archivos.length) {
      const f = archivos[i++]; const r = await drive.descargar(f.id);
      if (r.ok) listos.push({ f, ruta: r.data! }); else errores.push(`${f.name}: ${r.error}`);
      hechos++; abrirModal(<Descargando hechos={hechos} total={archivos.length} />, { clave: 'modal-74' });
    }
  };
  await Promise.all([trabajador(), trabajador()]);
  cerrarModal();
  if (errores.length) toast(`No se pudieron descargar ${errores.length} archivo(s): ${errores[0]}`, 7000);
  return listos;
}

async function hacer(que: TDriveAccion) {
  const archivos = [...driveEstado().elegidos.values()]; if (!archivos.length) return;
  if (que === 'template') { cerrarModal(); return importarPlantillaDrive(archivos[0]); }
  if (que === 'exp') { const got = await descargarTodo(archivos); if (got.length) agregarAExpediente(got.map((x) => x.ruta), `Se copiaron ${got.length} archivo(s) desde Google Drive`); return; }
  if (que === 'plazos') { const got = await descargarTodo(archivos); if (got.length) agregarAPlazos(got.map((x) => x.ruta)); return; }
  if (que === 'open') { const got = await descargarTodo(archivos); if (got.length) abrirEnEditorVarios(got.map((x) => x.ruta)); return; }
  // Enviar a firmar (solo clientes de Portalfirma)
  if (!esMiembro()) { cerrarModal(); return pedirSesion(() => abrir({ purpose: driveEstado().para }), 'Enviar a firmar es exclusivo para clientes de Portalfirma. Inicia sesión con tu cuenta.'); }
  const got = await descargarTodo(archivos); if (!got.length) return;
  if (got.length === 1) {
    mostrarVista('drop');
    try { analizarDocumento(await envioOperacion.revisarArchivo(got[0].ruta)); } catch (e) { toast((e as Error).message, 5000); }
    return;
  }
  await cargaMasivaConArchivos(got.map((x) => x.ruta));
  toast(`${got.length} documento(s) de Google Drive en la carga masiva: revisa los firmantes y envía.`, 6000);
}

export function instalarDrive() {
  window.Drive = { open: abrir, cambiarCuenta, cuenta: verCuenta };
}
