// Interfaz pública de los documentos recientes para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useRecienteStore } from '../zustand/reciente.store';
import { recienteService } from '../services/reciente.service';

export function useReciente() {
  return useRecienteStore(useShallow((s) => ({
    lista: s.lista, cargado: s.cargado, q: s.q, tipo: s.tipo, pagina: s.pagina,
    recientesGetAll: s.recientesGetAll, recientesSetFiltros: s.recientesSetFiltros, recienteQuitar: s.recienteQuitar,
    recientesQuitarFaltantes: s.recientesQuitarFaltantes, recientesBorrarTodo: s.recientesBorrarTodo,
  })));
}
export const mostrarEnCarpeta = recienteService.mostrarEnCarpeta;
export type { TTipoArchivo } from '../zustand/reciente.store';
