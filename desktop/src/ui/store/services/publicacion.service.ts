// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
import { api } from '../../utils/api';
import type {
  ICalidadAviso, IContactoAvisos, IInteresados, IPanelPublicaciones, IPortal, IRedaccionAviso, IRespuestaInteresado, IResultadoPortalPublicar,
  IResultadoSincronizar, TAccionAviso, TInteresadoEstado, TPaquetes, TPubOperacion, TTipoAviso,
} from '../interfaces/publicacion.interface';

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
  // el CRUD del aviso en un portal: publicar, actualizar, pausar, reactivar, retirar o eliminar
  accionAviso: (propId: string, op: TPubOperacion, portal: string, que: TAccionAviso) => api<{ mensaje: string; estado: string | null }>('pubAccion', propId, op, portal, que),
  // direcciones públicas de los feeds que sirve la API (solo el administrador)
  getFeedsServidor: () => api<{ feeds: Record<string, { url: string; avisos: number }> }>('pubFeeds'),
  rotarFeedsServidor: () => api<{ feeds: Record<string, { url: string; avisos: number }> }>('pubFeedsRotar'),
  exportarFeed: (portal: string) => api<{ avisos: number; ruta: string } | null>('pubExportarFeed', portal),
  // el flujo «Publicar»
  getCalidad: (propId: string, op: TPubOperacion) => api<ICalidadAviso>('pubCalidad', propId, op),
  redactar: (propId: string, op: TPubOperacion) => api<IRedaccionAviso>('pubRedactar', propId, op),
  setTextos: (propId: string, t: { tituloPortal: string; descripcion: string }) => api<{ avisos?: string[] }>('pubTextos', propId, t),
  getPaquetes: () => api<TPaquetes | null>('mlPaquetes'),
  publicar: (propId: string, op: TPubOperacion, portales: string[], o: { tipoAviso: TTipoAviso; destacado: Record<string, boolean> }) =>
    api<{ resultados: IResultadoPortalPublicar[] }>('pubPublicar', propId, op, portales, o),
};
