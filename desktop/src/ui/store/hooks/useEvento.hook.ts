// Interfaz pública de la agenda para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useEventoStore } from '../zustand/evento.store';

export function useEvento() {
  return useEventoStore(useShallow((s) => ({
    eventos: s.eventos,
    rango: s.rango,
    tipo: s.tipo,
    cargado: s.cargado,
    cargando: s.cargando,
    error: s.error,
    eventoGetAll: s.eventoGetAll,
    eventoSetRango: s.eventoSetRango,
    eventoSetTipo: s.eventoSetTipo,
    eventoUpdate: s.eventoUpdate,
    eventoSincronizar: s.eventoSincronizar,
  })));
}

export type { TEventoRango } from '../zustand/evento.store';
