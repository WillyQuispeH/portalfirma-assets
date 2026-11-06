// Interfaz pública de la pantalla Integraciones para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useIntegracionesStore } from '../zustand/integraciones.store';

export function useIntegraciones() {
  return useIntegracionesStore(useShallow((s) => ({
    wechatia: s.wechatia, canales: s.canales, ml: s.ml, drive: s.drive, maps: s.maps, ia: s.ia,
    cargando: s.cargando, ocupado: s.ocupado, integCargar: s.integCargar, integAccion: s.integAccion,
  })));
}
