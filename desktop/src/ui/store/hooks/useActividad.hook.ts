// Interfaz pública de la Actividad para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useActividadStore } from '../zustand/actividad.store';

export function useActividad() {
  return useActividadStore(useShallow((s) => ({
    q: s.q,
    clase: s.clase,
    items: s.items,
    total: s.total,
    cargado: s.cargado,
    cargando: s.cargando,
    error: s.error,
    hayMas: s.items.length < s.total,
    actividadGetPage: s.actividadGetPage,
    actividadSetQ: s.actividadSetQ,
    actividadSetClase: s.actividadSetClase,
  })));
}
