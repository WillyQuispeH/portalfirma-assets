// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
import { api } from '../../utils/api';
import type { IReciente } from '../interfaces/reciente.interface';

export const recienteService = {
  getAll: () => api<IReciente[]>('recentList'),
  quitar: (ruta: string) => api<unknown>('recentRemove', ruta),
  borrarTodo: () => api<unknown>('recentClear'),
  mostrarEnCarpeta: (ruta: string) => api<unknown>('showInFolder', ruta),
};
