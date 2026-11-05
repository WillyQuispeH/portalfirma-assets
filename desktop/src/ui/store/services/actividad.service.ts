// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
import { api } from '../../utils/api';
import type { IActividadConsulta, IActividadPagina } from '../interfaces/actividad.interface';

export const actividadService = {
  getPage: (consulta: IActividadConsulta) => api<IActividadPagina>('inmoActividadTodas', consulta),
};
