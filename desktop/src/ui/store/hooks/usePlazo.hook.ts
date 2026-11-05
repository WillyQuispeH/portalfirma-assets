// Interfaz pública de Plazos y vencimientos para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { usePlazoStore } from '../zustand/plazo.store';
import { plazoService } from '../services/plazo.service';

export function usePlazo() {
  return usePlazoStore(useShallow((s) => ({
    items: s.items, sel: s.sel, leyendo: s.leyendo, inteligentes: s.inteligentes, trayendo: s.trayendo,
    plazosGetAll: s.plazosGetAll, plazosAplicar: s.plazosAplicar, plazoElegir: s.plazoElegir, plazoLeer: s.plazoLeer,
    plazoInteligente: s.plazoInteligente, plazoActualizar: s.plazoActualizar, plazoQuitar: s.plazoQuitar, plazosTraer: s.plazosTraer,
  })));
}
// acciones sobre el archivo de un documento (no cambian el estado de la pantalla)
export const documentoPlazo = { elegir: plazoService.elegir, bytes: plazoService.bytes, aTemporal: plazoService.aTemporal, calendario: plazoService.calendario };
// lectura del estado (pruebas y depuración: window.Plazos._p)
export const estadoPlazos = () => usePlazoStore.getState();
