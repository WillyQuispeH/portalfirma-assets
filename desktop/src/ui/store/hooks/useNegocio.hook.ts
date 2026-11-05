// Interfaz pública de los negocios para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useNegocioStore } from '../zustand/negocio.store';

export function useNegocio() {
  return useNegocioStore(useShallow((s) => ({
    negocios: s.negocios,
    etapas: s.etapas,
    cargado: s.cargado,
    cargando: s.cargando,
    error: s.error,
    filtros: s.filtros,
    negocioGetAll: s.negocioGetAll,
    negocioAbrir: s.negocioAbrir,
    negocioSetFiltros: s.negocioSetFiltros,
    negocioMover: s.negocioMover,
    negocioRevisarFirmas: s.negocioRevisarFirmas,
  })));
}

export type { IFiltrosNegocios } from '../zustand/negocio.store';
