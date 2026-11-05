// Interfaz pública de la Cartera para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useCarteraStore } from '../zustand/cartera.store';

export function useCartera() {
  return useCarteraStore(useShallow((s) => ({
    propiedades: s.datos.propiedades,
    personas: s.datos.personas,
    ultimaImportacion: s.datos.ultimaImportacion,
    captaciones: s.captaciones,
    cargado: s.cargado,
    error: s.error,
    filtros: s.filtros,
    seleccion: s.seleccion,
    carteraGetAll: s.carteraGetAll,
    carteraSetFiltros: s.carteraSetFiltros,
    seleccionIniciar: s.seleccionIniciar,
    seleccionAlternar: s.seleccionAlternar,
    seleccionFijar: s.seleccionFijar,
    seleccionCancelar: s.seleccionCancelar,
    carteraSetCaptador: s.carteraSetCaptador,
  })));
}

export type { IFiltrosCartera, TFiltroEspecial } from '../zustand/cartera.store';
