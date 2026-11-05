// Interfaz pública de «Hoy» para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useHoyStore } from '../zustand/hoy.store';

export function useHoy() {
  return useHoyStore(useShallow((s) => ({
    datos: s.datos,
    eventos: s.eventos,
    hayCartera: s.hayCartera,
    nombre: s.nombre,
    error: s.error,
    verTodos: s.verTodos,
    verEsperando: s.verEsperando,
    hoyGetAll: s.hoyGetAll,
    hoyAlternarTodos: s.hoyAlternarTodos,
    hoyAlternarEsperando: s.hoyAlternarEsperando,
  })));
}

export { hoyLocal } from '../zustand/hoy.store';
