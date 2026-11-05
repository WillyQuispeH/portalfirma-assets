// Interfaz pública de la bandeja de Leads para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useLeadStore } from '../zustand/lead.store';

export function useLead() {
  return useLeadStore(useShallow((s) => ({
    datos: s.datos,
    sel: s.sel,
    cargado: s.cargado,
    error: s.error,
    filtros: s.filtros,
    leadGetAll: s.leadGetAll,
    leadSetFiltros: s.leadSetFiltros,
    leadSeleccionar: s.leadSeleccionar,
  })));
}

export type { IFiltrosLeads } from '../zustand/lead.store';
