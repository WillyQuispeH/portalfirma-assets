// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
import { api, apiSilenciosa } from '../../utils/api';
import type { IEvento, IEventoCambios, IEventoFiltro } from '../interfaces/evento.interface';

export const eventoService = {
  getAll: (filtro: IEventoFiltro) => api<IEvento[]>('agendaListar', filtro),
  update: (id: string, cambios: IEventoCambios) => api<IEvento>('agendaActualizar', id, cambios),
  // reservas del calendario de wechatia: si está conectado, se piden de nuevo
  sincronizarReservas: async () => {
    const r = await apiSilenciosa<{ conectado?: boolean }>('resEstado');
    if (r?.conectado) await apiSilenciosa('resSincronizar', null);
  },
};
