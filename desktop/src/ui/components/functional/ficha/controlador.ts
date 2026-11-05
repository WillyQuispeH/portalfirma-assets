// Lo que src/renderer/inmo.js usa de la ficha en React: elegir la pestaña (Inmo.fichaTab, que también usan
// las pruebas, el Agente y etapas.js). Se instala al cargar el bundle (index.tsx) como window.__ficha.
import { fichaEstado, type TFichaTab } from '../../../store/hooks/useFicha.hook';

export function instalarFicha() {
  window.__ficha = { tab: (propId, tab) => fichaEstado().fichaSetTab(propId, tab as TFichaTab | 'captacion') };
}
