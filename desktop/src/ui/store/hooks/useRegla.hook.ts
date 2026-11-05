// Interfaz pública de las reglas de detección para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useReglaStore } from '../zustand/regla.store';

export function useRegla() {
  return useReglaStore(useShallow((s) => ({
    casos: s.casos, reglas: s.reglas,
    reglaCargar: s.reglaCargar, reglaProbar: s.reglaProbar, reglaDecidir: s.reglaDecidir, reglaActivar: s.reglaActivar,
    reglaEliminar: s.reglaEliminar, reglaBorrarCaso: s.reglaBorrarCaso, reglaProponer: s.reglaProponer, reglaExportar: s.reglaExportar,
  })));
}
