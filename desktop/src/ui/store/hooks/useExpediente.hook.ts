// Interfaz pública de Expedientes para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useExpedienteStore } from '../zustand/expediente.store';
import { expedienteService } from '../services/expediente.service';

export function useExpediente() {
  return useExpedienteStore(useShallow((s) => ({
    lista: s.lista, cargado: s.cargado, sel: s.sel, archivos: s.archivos, historial: s.historial, errorArchivos: s.errorArchivos,
    cargandoArchivos: s.cargandoArchivos, marcados: s.marcados, tab: s.tab, q: s.q, operaciones: s.operaciones,
    expedientesGetAll: s.expedientesGetAll, expedienteElegir: s.expedienteElegir, expedienteSetTab: s.expedienteSetTab, expedienteSetQ: s.expedienteSetQ,
    archivoMarcar: s.archivoMarcar, archivosDesmarcar: s.archivosDesmarcar, archivosAgregar: s.archivosAgregar, archivoQuitar: s.archivoQuitar,
  })));
}
export const mostrarCarpetaExpediente = expedienteService.mostrarCarpeta;
