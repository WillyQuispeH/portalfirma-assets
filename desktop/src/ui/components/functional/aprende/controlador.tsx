// «Aprende a usarla»: se instala al cargar el bundle (index.tsx) como window.Aprende, con la API de siempre
// (antes src/renderer/aprende.js): abrir() muestra todas las lecciones, leccion(id) abre una y LECCIONES es la lista.
// La usan el inicio («Aprende a usarla»), la agenda, el panel de ayuda y las pruebas (aprende-e2e).
// El avance queda guardado en el equipo (aprende.store.ts).
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import AprendePage from '../../../app/aprende/page';
import { LECCIONES } from './lecciones';
import { aprendeEstado } from '../../../store/hooks/useAprende.hook';
import { irAVista } from '../../../utils/app';

let raiz: Root | null = null;

// pasa a #view-aprende y monta la página la primera vez (después, el store la mantiene al día)
function mostrar(leccion: string | null) {
  irAVista('aprende');
  const S = aprendeEstado(); S.aprendeCargar(LECCIONES.map((l) => l.id)); S.aprendeLeccion(leccion);
  const el = document.getElementById('view-aprende');
  if (!el) return;
  if (!raiz) { el.innerHTML = ''; raiz = createRoot(el); const r = raiz; flushSync(() => r.render(<StrictMode><AprendePage /></StrictMode>)); }
}

export const abrirAprende = () => mostrar(null);
export const abrirLeccion = (id: string) => mostrar(id);

export function instalarAprende() {
  window.Aprende = { abrir: abrirAprende, leccion: abrirLeccion, LECCIONES };
}
