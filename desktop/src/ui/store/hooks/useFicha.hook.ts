// Interfaz pública de la ficha de la propiedad para los componentes (no importan el store directo).
// La propiedad y las personas salen de la cartera (mismo inmoListar); el resto, de ficha.store.
import { useShallow } from 'zustand/react/shallow';
import { useFichaStore } from '../zustand/ficha.store';
import { useCarteraStore } from '../zustand/cartera.store';

export function useFicha() {
  const ficha = useFichaStore(useShallow((s) => s));
  const { propiedades, personas } = useCarteraStore(useShallow((s) => ({ propiedades: s.datos.propiedades, personas: s.datos.personas })));
  const propiedad = ficha.propId ? propiedades.find((p) => p.id === ficha.propId) || null : null;
  const tab = (ficha.propId && ficha.tabs[ficha.propId]) || 'resumen';
  return { ...ficha, propiedad, personas, tab };
}

// Fuera de React: src/renderer/inmo.js elige la pestaña con Inmo.fichaTab(k) (también lo usan las pruebas)
export const fichaEstado = () => useFichaStore.getState();

export type { TFichaTab, TFiltroNegocios } from '../zustand/ficha.store';
