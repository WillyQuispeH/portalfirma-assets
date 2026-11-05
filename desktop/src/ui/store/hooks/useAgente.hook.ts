// Interfaz pública del Agente para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useAgenteStore } from '../zustand/agente.store';

export function useAgente() {
  return useAgenteStore(useShallow((s) => ({
    items: s.items, adjuntos: s.adjuntos, busy: s.busy, conv: s.conv, convs: s.convs, q: s.q, nombre: s.nombre,
  })));
}
