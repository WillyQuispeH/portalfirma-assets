// Acciones de la Ayuda que usan el controlador (window.Ayuda), el panel y «Aprende».
// Están aparte del controlador para que Aprende las use sin importar los componentes de la Ayuda.
import { RECORRIDOS } from './guias';
import { ayudaEstado, recorridoVisto } from '../../../store/hooks/useAyuda.hook';
import { sinRecorridos, toast } from '../../../utils/app';
import type { IPasoVisible, TNivelAyuda } from '../../../store/interfaces/ayuda.interface';

function visible(el: Element | null): el is Element {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

// Recorrido guiado: globos sobre cada parte de la pantalla. Solo se muestran los pasos visibles ahora.
export function iniciarRecorrido(pantalla: string) {
  const pasos: IPasoVisible[] = [];
  for (const [sel, t, d] of RECORRIDOS[pantalla] || []) { const el = document.querySelector(sel); if (visible(el)) pasos.push({ el, t, d }); }
  if (!pasos.length) { toast('Esta pantalla no tiene recorrido guiado.'); return; }
  ayudaEstado().ayudaRecorrido(pantalla, pasos);
}
export const terminarRecorrido = () => ayudaEstado().ayudaTerminarRecorrido();
export const hayRecorrido = () => !!ayudaEstado().recorrido;

// Panel de ayuda. Con nivel muestra solo las guías de ese nivel (el «?» de cada nivel del inicio).
export const abrirPanel = (opts: { level?: string | null } = {}) => ayudaEstado().ayudaAbrir((opts.level || null) as TNivelAyuda | null);
export const cerrarPanel = () => ayudaEstado().ayudaCerrar();
export const panelAbierto = () => ayudaEstado().panelAbierto;

// show() de app.js avisa cada cambio de pantalla. La primera vez que se entra a una pantalla con
// recorrido se ofrece (una sola vez), salvo que la configuración lo apague (PF_NO_TOURS, o en modo de prueba).
export function alCambiarVista(vista: string) {
  ayudaEstado().ayudaVista(vista);
  if (sinRecorridos() || !RECORRIDOS[vista] || recorridoVisto(vista)) return;
  setTimeout(() => {
    if (ayudaEstado().vista === vista && !hayRecorrido() && !document.querySelector('#modal:not(.hidden)')) iniciarRecorrido(vista);
  }, 900);
}
