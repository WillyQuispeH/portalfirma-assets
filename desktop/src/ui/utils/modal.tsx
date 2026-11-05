// Formularios en ventana hechos en React. Usan el mismo modal de la app (#modal y #modalCard, en index.html),
// así se ven igual que los del código antiguo y las pruebas los encuentran en el mismo lugar.
//
//   abrirModal(<MiFormulario … />);   // dibuja dentro de #modalCard y lo muestra
//   cerrarModal();                     // lo oculta (closeModal de app.js) y desmonta React
//
// El código antiguo escribe en #modalCard con modal(html): antes de hacerlo llama a ReactUI.liberarModal()
// (en app.js), que desmonta lo que React tenía ahí. Así nunca hay dos dueños del mismo contenedor.
import { StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';

let raiz: Root | null = null;

export function liberarModal() {
  if (!raiz) return;
  const r = raiz; raiz = null;
  r.unmount();
}

export function abrirModal(contenido: ReactNode, { ancho = false }: { ancho?: boolean } = {}) {
  const card = document.getElementById('modalCard'); const fondo = document.getElementById('modal');
  if (!card || !fondo) return;
  if (!raiz) { card.innerHTML = ''; raiz = createRoot(card); }
  const r = raiz;
  // sincrónico: quien abre el formulario puede buscar sus campos justo después (las pruebas también)
  try { flushSync(() => r.render(<StrictMode>{contenido}</StrictMode>)); } catch { r.render(<StrictMode>{contenido}</StrictMode>); }
  card.classList.toggle('im-wide', ancho);
  fondo.classList.remove('hidden');
}

export function cerrarModal() { window.closeModal(); }
