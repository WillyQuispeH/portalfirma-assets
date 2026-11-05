// Interfaz pública de la carga masiva para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useMasivaStore } from '../zustand/masiva.store';
import { masivaService } from '../services/masiva.service';

export function useMasiva() {
  return useMasivaStore(useShallow((s) => ({
    cola: s.cola, tab: s.tab, opciones: s.opciones, cds: s.cds,
    masivaSetCola: s.masivaSetCola, masivaSetTab: s.masivaSetTab, masivaSetOpciones: s.masivaSetOpciones, masivaSetCds: s.masivaSetCds,
  })));
}
// las acciones sobre la cola: el proceso principal manda el estado nuevo por pf.onBulk
export const cola = masivaService;
// lectura del estado (pruebas y depuración: window.Masiva._bk / _cds)
export const estadoMasiva = () => useMasivaStore.getState();
