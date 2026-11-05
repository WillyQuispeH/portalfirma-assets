// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
import { api } from '../../utils/api';
import type {
  IPvChat, IPvConfig, IPvContratista, IPvImportacion, IPvMensaje, IPvPersona, IPvProyecto, IPvReclamo, IPvRevision, IPvTablero, IPvUnidad,
} from '../interfaces/postventa.interface';

export const postventaService = {
  getTablero: () => api<IPvTablero>('pvTablero'),
  getConfig: () => api<IPvConfig>('pvConfig'),
  getReclamos: (f: { estado?: string; q?: string }) => api<IPvReclamo[]>('pvListar', f),
  getChats: () => api<IPvChat[]>('pvChats'),
  getProyectos: () => api<IPvProyecto[]>('pvProyectos'),
  getUnidades: () => api<IPvUnidad[]>('pvUnidades'),
  getContratistas: () => api<IPvContratista[]>('pvContratistas'),
  guardarPlantilla: () => api<string | null>('pvPlantilla'), // null: se canceló
  importarUnidades: () => api<IPvImportacion | null>('pvImportar'),
  setClaveWa: (o: { token: string; locationId?: string }) => api<unknown>('pvClaveWa', o),
  configurar: (o: { auto?: boolean; persona?: IPvPersona }) => api<unknown>('pvConfigurar', o),
  revisar: () => api<IPvRevision>('pvRevisar'),
  muestra: (p: IPvPersona) => api<{ mensajes: (IPvMensaje & { fotos?: unknown })[] }>('pvMuestra', p),
  probarEstilo: (p: IPvPersona) => api<{ texto: string; ia: boolean; descartado?: string }>('pvProbarEstilo', p),
};
