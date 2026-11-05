// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
import { api } from '../../utils/api';
import type { ILeadConsulta, ILeadLista } from '../interfaces/lead.interface';

export const leadService = {
  getAll: (consulta: ILeadConsulta) => api<ILeadLista>('leadsListar', consulta),
};
