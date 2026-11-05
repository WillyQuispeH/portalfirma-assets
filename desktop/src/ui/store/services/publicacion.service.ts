// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
import { api } from '../../utils/api';
import type { IContactoAvisos, IInteresados, IPanelPublicaciones, IPortal, IRespuestaInteresado, IResultadoSincronizar, TInteresadoEstado } from '../interfaces/publicacion.interface';

export const publicacionService = {
  getPanel: () => api<IPanelPublicaciones>('pubPanel'),
  getInteresados: (f: { estado?: string; q?: string }) => api<IInteresados>('pubInteresados', f),
  sincronizar: () => api<IResultadoSincronizar>('pubSincronizar'),
  setInteresado: (propId: string, leadId: string, cambios: { estado?: TInteresadoEstado; contactado?: boolean }) => api<unknown>('pubInteresado', propId, leadId, cambios),
  getRespuesta: (propId: string, leadId: string) => api<IRespuestaInteresado>('pubRespuesta', propId, leadId),
  getCatalogo: () => api<IPortal[]>('pubCatalogo'),
  getContacto: () => api<{ contacto?: IContactoAvisos } | null>('mlEstado'),
  getFeed: (portal: string) => api<{ avisos: number }>('pubFeed', portal),
  setPortal: (portal: string, cambios: { activo: boolean; feedUrl: string; token?: string }) => api<unknown>('pubConfigurar', portal, cambios),
  exportarFeed: (portal: string) => api<{ avisos: number; ruta: string } | null>('pubExportarFeed', portal),
};
