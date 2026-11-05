// Interfaz pública de la Ayuda para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useAyudaStore } from '../zustand/ayuda.store';

export function useAyuda() {
  return useAyudaStore(useShallow((s) => ({
    vista: s.vista, panelAbierto: s.panelAbierto, nivel: s.nivel, apertura: s.apertura, recorrido: s.recorrido,
    ayudaSiguiente: s.ayudaSiguiente, ayudaAnterior: s.ayudaAnterior, ayudaTerminarRecorrido: s.ayudaTerminarRecorrido,
  })));
}

// Fuera de React (el controlador y las acciones de la Ayuda)
export const ayudaEstado = () => useAyudaStore.getState();
export { recorridoVisto } from '../zustand/ayuda.store';
