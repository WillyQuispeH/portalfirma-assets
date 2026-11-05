// Interfaz pública de «La oficina» para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useOficinaStore } from '../zustand/oficina.store';

export function useOficina() {
  return useOficinaStore(useShallow((s) => ({
    datos: s.datos,
    nombre: s.nombre,
    error: s.error,
    sel: s.sel,
    toca: s.toca,
    luz: s.luz,
    oficinaGetAll: s.oficinaGetAll,
    oficinaElegir: s.oficinaElegir,
    oficinaAlternarToca: s.oficinaAlternarToca,
    oficinaSetLuz: s.oficinaSetLuz,
  })));
}

export type { TLuz, TSeleccion } from '../zustand/oficina.store';
