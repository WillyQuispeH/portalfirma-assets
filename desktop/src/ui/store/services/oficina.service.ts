// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
import { api, apiSilenciosa } from '../../utils/api';
import type { IOficina } from '../interfaces/oficina.interface';

export const oficinaService = {
  getDatos: () => api<IOficina>('ofDatos'),
  getUsuario: () => apiSilenciosa<{ namePerson?: string } | null>('apiUser'), // para el saludo
};
