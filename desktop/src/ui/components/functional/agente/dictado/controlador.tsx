// Dictado (window.Dictado) y fotos desde Google Drive (window.Fotos). Las instala el controlador del Agente.
/* eslint-disable @typescript-eslint/no-explicit-any -- datos del proceso principal sin tipos */
import { toast } from '../../../../utils/app';
import { W, api, cartera, montar } from '../tarjetas/comun';
import { Dictado } from './Dictado';

/** «Subir una propiedad»: graba o escribe la descripción */
export function abrir() { montar('ga-dc', <Dictado />, { usuario: 'Subir una propiedad' }); }
/** el Agente llenó la ficha (asset_dictar_propiedad): se muestra para revisar y confirmar */
export function mostrar(r: any, texto?: string) { montar('ga-dc', <Dictado r0={r} texto0={texto || ''} />); }

// ---------- fotos de la propiedad desde Google Drive (el Drive de la empresa) ----------
const preguntar = <T,>(ventana: string, props: object, clave: string) => new Promise<T>((res) => W.Ventanas.abrir(ventana, { ...props, alResponder: (x: T) => { if (x !== ('cambiar' as unknown as T)) W.closeModal(); res(x); } }, { clave }));

export async function fotosDrive(propId: string) {
  const st = await api('driveStatus').catch(() => ({}));
  if (st && st.configured === false) return toast('Google Drive no está configurado en esta versión de Asset.', 6000);
  if (!st.connected) {
    if (!(await preguntar<boolean>('agente.conectarDriveFotos', {}, 'modal-10'))) return;
    try { const r = await api('driveConnect'); if (!r.connected) return; toast(`Google Drive conectado${r.email ? ': ' + r.email : ''}.`); }
    catch (e) { return toast('No se pudo conectar Google Drive: ' + (e as Error).message, 8000); }
  } else {
    const st2 = await api('driveStatus').catch(() => ({}));
    const ir = await preguntar<'si' | 'no' | 'cambiar'>('agente.fotosDrive', { email: st2.email }, 'modal-11');
    if (ir === 'no') return;
    if (ir === 'cambiar' && !(await W.Drive.cambiarCuenta())) return;
  }
  toast('Se abrió Google Drive en tu navegador: busca la carpeta de la propiedad, entra a «fotos con logo» y selecciona las fotos.', 9000);
  const r = await W.pf.fotosDrive(propId);
  if (!r.ok) return toast(r.error, 8000);
  const d = r.data; if (d.cancelado) return toast('No elegiste fotos.');
  toast(`${d.agregadas} ${d.agregadas === 1 ? 'foto cargada' : 'fotos cargadas'} (la propiedad tiene ${d.total}).${d.omitidas.length ? ` ${d.omitidas.length} sin cargar: ${d.omitidas.slice(0, 2).map((x: any) => `${x.name} (${x.motivo})`).join('; ')}.` : ''}`, 8000);
  try { await cartera(); } catch { /* se verá al refrescar */ }
  W.AssetRefrescar?.(); W.Lienzo?.refrescar?.();
  if (document.querySelector('#view-cartera:not(.hidden) .im-ficha')) W.Inmo.abrirFicha(propId);
  return d;
}

export function instalarDictado() {
  W.Dictado = { abrir, mostrar };
  W.Fotos = { drive: fotosDrive };
}
