// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
import { api, apiSilenciosa } from '../../utils/api';
import type { IHoy } from '../interfaces/hoy.interface';
import type { IEvento } from '../interfaces/evento.interface';

export const hoyService = {
  getHoy: () => api<IHoy>('etHoy'),
  getResumen: () => api<{ propiedades: number }>('inmoResumen'),
  getAgenda: (dia: string) => api<IEvento[]>('agendaListar', { desde: dia, hasta: dia }),
  // el nombre de la cuenta de Portalfirma, para el saludo (sin sesión no hay nombre, y no se pide iniciarla)
  getUsuario: () => apiSilenciosa<{ namePerson?: string } | null>('apiUser'),
};
