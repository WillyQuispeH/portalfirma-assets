// Interfaz pública de Personas para los componentes. Los datos vienen del mismo store que la Cartera
// (inmoListar trae propiedades y personas juntas).
import { useShallow } from 'zustand/react/shallow';
import { useCarteraStore } from '../zustand/cartera.store';

export function usePersonas() {
  return useCarteraStore(useShallow((s) => ({
    personas: s.datos.personas,
    propiedades: s.datos.propiedades,
    cargado: s.cargado,
    error: s.error,
    filtros: s.filtrosPersonas,
    personasGetAll: s.carteraGetAll,
    personasSetFiltros: s.personasSetFiltros,
  })));
}
