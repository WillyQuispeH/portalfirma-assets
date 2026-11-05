// Llamadas al proceso principal de Plazos y vencimientos. Devuelven la respuesta tal cual ({ ok, data, error, code }).
import { apiCruda } from '../../utils/api';
import type { IAgregadosPlazos, IDocPlazo } from '../interfaces/plazo.interface';

export const plazoService = {
  getAll: () => apiCruda<IDocPlazo[]>('plazosList'),
  elegir: () => apiCruda<IAgregadosPlazos>('plazosPick'),
  agregar: (rutas: string[]) => apiCruda<IAgregadosPlazos>('plazosAdd', rutas),
  actualizar: (id: string, cambios: Partial<IDocPlazo> & Record<string, unknown>) => apiCruda<IDocPlazo[]>('plazosUpdate', id, cambios),
  quitar: (id: string) => apiCruda<IDocPlazo[]>('plazosRemove', id),
  bytes: (id: string) => apiCruda<Uint8Array>('plazosBytes', id),
  calendario: (id: string) => apiCruda<string | null>('plazosIcs', id),
  aTemporal: (bytes: Uint8Array, nombre: string) => apiCruda<{ path?: string } | string>('edTemp', bytes, nombre),
  // contratos firmados en Portalfirma (Mis operaciones)
  cuenta: () => apiCruda<{ phone?: string; api?: boolean }>('opsStatus'),
  sincronizarOps: () => apiCruda<{ items: { operation: number; stage?: string; status?: string; signers?: number; signed?: number }[] }>('opsSync', false),
  listarOps: () => apiCruda<{ items: { operation: number; stage?: string; status?: string; signers?: number; signed?: number }[] }>('opsList'),
  archivoOp: (n: number) => apiCruda<{ path: string }>('opsFile', n),
};
