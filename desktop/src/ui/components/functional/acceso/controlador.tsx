// La cuenta de Asset en la ventana. Se instala al cargar el bundle (index.tsx), antes que app.js:
//  · Monta la pantalla de ingreso (AccesoAsset) con su propia raíz, sobre todo lo demás.
//  · window.__acceso: lo que usa app.js para esperar la sesión al abrir, cerrar sesión y avisar si venció.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AccesoAsset from './AccesoAsset';
import { accesoEstado, alCambiarAcceso } from '../../../store/hooks/useAcceso.hook';

/** Se resuelve cuando hay sesión de Asset (al tiro si ya la hay). */
export function esperarAcceso(): Promise<void> {
  if (accesoEstado().estado === 'dentro') return Promise.resolve();
  return new Promise((listo) => {
    const fin = alCambiarAcceso((s) => { if (s.estado === 'dentro') { fin(); listo(); } });
  });
}

export function instalarAcceso() {
  window.__acceso = {
    esperar: esperarAcceso,
    usuario: () => accesoEstado().usuario,
    salir: () => accesoEstado().accesoSalir(),
    vencido: (aviso?: string) => accesoEstado().accesoVencido(aviso),
  };
  // la clase en <body> deja saber a CSS y a las pruebas si se está en la pantalla de ingreso
  alCambiarAcceso((s) => document.body.classList.toggle('sin-acceso', s.estado !== 'dentro'));
  const montar = () => {
    const el = document.createElement('div'); el.id = 'accesoRaiz'; document.body.appendChild(el);
    createRoot(el).render(<StrictMode><AccesoAsset /></StrictMode>);
    document.body.classList.add('sin-acceso');
    accesoEstado().accesoRestaurar();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
}
