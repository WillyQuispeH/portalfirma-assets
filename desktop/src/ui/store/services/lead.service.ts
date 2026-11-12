// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store o el componente.
import { api } from '../../utils/api';
import type { ILeadCambios, ILeadConsulta, ILeadDetalle, ILeadLista, IResultadoEnvio } from '../interfaces/lead.interface';

export const leadService = {
  getAll: (consulta: ILeadConsulta) => api<ILeadLista>('leadsListar', consulta),
  obtener: (id: string) => api<ILeadDetalle>('leadsObtener', id),
  actualizar: (id: string, cambios: ILeadCambios) => api<ILeadDetalle>('leadsActualizar', id, cambios),
  asignar: (id: string, corredorId: string | null) => api<unknown>('leadsAsignar', id, corredorId),
  reanalizar: (id: string) => api<unknown>('leadsReanalizar', id),
  // le escribe al interesado por el número de la empresa (o Instagram / Facebook): mismas reglas que el puente del servidor
  enviar: (id: string, texto: string) => api<ILeadDetalle & { envio?: IResultadoEnvio }>('leadsResponder', id, texto),
};
