// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
import { api } from '../../utils/api';
import type { IFirmasRevisadas, INegocioLista, INegocioMovido } from '../interfaces/negocio.interface';

export const negocioService = {
  getAll: () => api<INegocioLista>('negListar'),
  mover: (id: string, etapa: string) => api<INegocioMovido>('negMover', id, etapa),
  // revisa en Portalfirma las firmas pendientes; si algo se firmó, los negocios avanzan solos
  revisarFirmas: () => api<IFirmasRevisadas>('negFirmasRevisar'),
};
