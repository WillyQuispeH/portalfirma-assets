// Ayuda de PortalFirma Asset: botón «?» siempre visible, guías paso a paso por nivel, buscador de dudas
// (local, no gasta tokens), recorridos guiados por pantalla y contacto con soporte.
// Se instala al cargar el bundle (index.tsx) como window.Ayuda, con la API de siempre (antes src/renderer/ayuda.js):
//   onView(vista)        show() de app.js y las pantallas (ficha, portales, negocio…) avisan la pantalla actual
//   open({ level })      abre el panel; con level, solo las guías de ese nivel
//   close(), startTour(pantalla), endTour(), search(texto), GUIDES, TOURS
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Ayuda from './Ayuda';
import { GUIAS, RECORRIDOS } from './guias';
import { abrirPanel, alCambiarVista, cerrarPanel, hayRecorrido, iniciarRecorrido, panelAbierto, terminarRecorrido } from './acciones';
import { ayudaEstado } from '../../../store/hooks/useAyuda.hook';
import { buscarGuias } from '../../../utils/ayuda';

// El botón y el panel se dibujan cuando el documento terminó de cargar: los íconos (icons.js) se cargan
// después de react-ui.js.
function montar() {
  if (document.getElementById('ayudaRaiz')) return;
  const el = document.createElement('div'); el.id = 'ayudaRaiz';
  document.body.appendChild(el);
  createRoot(el).render(<StrictMode><Ayuda /></StrictMode>);
}

// Teclado del recorrido (antes que nadie, para que Esc no cierre otra cosa) y Esc del panel
function teclado() {
  document.addEventListener('keydown', (e) => {
    if (!hayRecorrido()) return;
    const S = ayudaEstado();
    if (e.key === 'Escape') { e.stopPropagation(); S.ayudaTerminarRecorrido(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); S.ayudaSiguiente(); }
    else if (e.key === 'ArrowLeft') S.ayudaAnterior();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panelAbierto()) cerrarPanel(); });
}

export function instalarAyuda() {
  window.Ayuda = {
    open: abrirPanel,
    close: cerrarPanel,
    startTour: iniciarRecorrido,
    endTour: terminarRecorrido,
    onView: alCambiarVista,
    search: (q: string) => buscarGuias(q, GUIAS),
    GUIDES: GUIAS,
    TOURS: RECORRIDOS,
  };
  teclado();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
}
