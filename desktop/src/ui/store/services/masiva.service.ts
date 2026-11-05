// Llamadas al proceso principal de la carga masiva. Devuelven la respuesta tal cual ({ ok, data, error }).
import { apiCruda } from '../../utils/api';
import type { IColaMasiva, IOperacionPendiente } from '../interfaces/masiva.interface';

export const masivaService = {
  estado: () => apiCruda<IColaMasiva>('bulkState'),
  elegir: () => apiCruda<unknown>('bulkPick'),
  pausar: (si: boolean) => apiCruda<unknown>('bulkPause', si),
  reintentar: (id: string | null) => apiCruda<unknown>('bulkRetry', id),
  vaciar: (que: 'done' | 'all') => apiCruda<unknown>('bulkClear', que),
  quitar: (id: string) => apiCruda<unknown>('bulkRemove', id),
  volverAListo: (id: string) => apiCruda<unknown>('bulkRearm', id),
  marcar: (id: string, selected: boolean) => apiCruda<unknown>('bulkUpdate', id, { selected }),
  detener: () => apiCruda<unknown>('bulkStopSend'),
  // firma masiva con certificado: la clave y el código van directo a Portalfirma
  pendientes: (rut: string) => apiCruda<{ operations?: IOperacionPendiente[]; pending?: IOperacionPendiente[] } | IOperacionPendiente[]>('cdsPending', rut),
  pedirCodigo: (rut: string, ops: string[], clave: string) => apiCruda<{ message?: string }>('cdsCode', rut, ops, clave),
  firmar: (rut: string, ops: string[], clave: string, codigo: string) => apiCruda<{ signed?: { ok?: boolean }[]; results?: { ok?: boolean }[]; message?: string }>('cdsSign', rut, ops, clave, codigo),
};
