// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
import { api } from '../../utils/api';
import type { IPerfil } from '../interfaces/perfil.interface';

export const perfilService = {
  get: () => api<IPerfil>('accEstado'),
};
