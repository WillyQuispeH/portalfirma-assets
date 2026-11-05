// Interfaz pública de «Aprende» para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useAprendeStore } from '../zustand/aprende.store';

export function useAprende() {
  return useAprendeStore(useShallow((s) => ({
    leccion: s.leccion, hechos: s.hechos, aprendeLeccion: s.aprendeLeccion, aprendeMarcar: s.aprendeMarcar,
  })));
}

// Fuera de React (el controlador)
export const aprendeEstado = () => useAprendeStore.getState();
