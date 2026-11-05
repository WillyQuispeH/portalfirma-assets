// Lo que el código antiguo usa de «Enviar a firmar». Se instala al cargar el bundle (index.tsx):
//   window.__envio.analizar(archivo, firmantes?)  → startAnalysis() de app.js (editor, Drive, expedientes, negocios…)
//   window.__envio.listo(resultado)              → showDone() de app.js (también la Notaría virtual)
//   window.__envio.hayAnalisis()                 → la pestaña vuelve a «revisar» si hay un documento a medias
import { envioEstado } from '../../../../store/hooks/useEnvio.hook';
import { mostrarVista, refrescarSaldo, registrarEnExpediente, toast } from '../../../../utils/app';
import type { IArchivoEnvio, IFirmante, IResultadoEnvio } from '../../../../store/interfaces/envio.interface';

export async function analizarDocumento(archivo: IArchivoEnvio, prellenar: Partial<IFirmante>[] | null = null) {
  if (envioEstado().ocupado) return;
  mostrarVista('working');
  const r = await envioEstado().envioAnalizar(archivo, prellenar);
  if (r === 'ok') mostrarVista('review');
  else if (r !== 'ocupado') { mostrarVista('drop'); toast('No se pudo analizar: ' + r, 5000); }
}

export function mostrarEnviado(r: IResultadoEnvio) {
  if (envioEstado().envioListo(r) === 'rechazado') { mostrarVista('review'); return; }
  const ctx = window.__expCtx; window.__expCtx = null; // enviado desde un expediente: queda en su historial
  if (r.operation != null) window.dispatchEvent(new CustomEvent('pf-operacion', { detail: { operation: r.operation } })); // p. ej., un negocio esperando esta firma
  if (ctx && r.operation != null) registrarEnExpediente(ctx.id, { kind: 'sent', op: r.operation, text: `Enviado a firmar «${ctx.file}»`, files: [ctx.file] });
  mostrarVista('done'); refrescarSaldo(); // los enlaces de firma los trae la pantalla «Enviado» al cambiar la operación
}

export function instalarEnvio() {
  window.__envio = {
    analizar: (archivo, prellenar) => analizarDocumento(archivo as IArchivoEnvio, (prellenar as Partial<IFirmante>[]) || null),
    listo: (r) => mostrarEnviado(r as IResultadoEnvio),
    hayAnalisis: () => !!envioEstado().analisis,
  };
}
