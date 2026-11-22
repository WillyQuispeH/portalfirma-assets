// Llamadas al proceso principal de la carga masiva. Devuelven la respuesta tal cual ({ ok, data, error }).
import { apiCruda } from '../../utils/api';
import type { IColaMasiva } from '../interfaces/masiva.interface';

export const masivaService = {
  estado: () => apiCruda<IColaMasiva>('bulkState'),
  elegir: () => apiCruda<unknown>('bulkPick'),
  pausar: (si: boolean) => apiCruda<unknown>('bulkPause', si),
  reintentar: (id: string | null) => apiCruda<unknown>('bulkRetry', id),
  vaciar: (que: 'done' | 'all') => apiCruda<unknown>('bulkClear', que),
  quitar: (id: string) => apiCruda<unknown>('bulkRemove', id),
  volverAListo: (id: string) => apiCruda<unknown>('bulkRearm', id),
  marcar: (id: string, selected: boolean) => apiCruda<unknown>('bulkUpdate', id, { selected }),
  actualizar: (id: string, cambios: Record<string, unknown>) => apiCruda<unknown>('bulkUpdate', id, cambios),
  cargarIgual: (id: string) => apiCruda<unknown>('bulkForce', id),
  reanalizar: (id: string) => apiCruda<unknown>('bulkReanalyze', id),
  sincronizar: (id: string) => apiCruda<{ sincronizados: number }>('bulkSync', id),
  detener: () => apiCruda<unknown>('bulkStopSend'),
  // firma masiva con certificado: la clave y el código van directo a Portalfirma
};
