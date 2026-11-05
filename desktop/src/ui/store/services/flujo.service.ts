// Llamadas al proceso principal de Flujos documentales. Devuelven la respuesta tal cual ({ ok, data, error }).
import { apiCruda } from '../../utils/api';
import type { IColaMasiva } from '../interfaces/masiva.interface';
import type { IEjecucion, IModelo, INomina, IReceta, IRevision, TRegla } from '../interfaces/flujo.interface';

export type TPedidoFlujo = { modelId: string; mapping: Record<string, TRegla | { type: 'col'; col: number }>; nomina: INomina };
export const flujoService = {
  modelos: () => apiCruda<IModelo[]>('flujosModels'),
  modelo: (id: string) => apiCruda<IModelo>('flujosModel', id),
  recetas: () => apiCruda<IReceta[]>('flujosRecipes'),
  ejecuciones: () => apiCruda<IEjecucion[]>('flujosRuns'),
  cola: () => apiCruda<IColaMasiva>('bulkState'),
  guardarReceta: (r: Partial<IReceta>) => apiCruda<IReceta>('flujosSaveRecipe', r),
  borrarReceta: (id: string) => apiCruda<unknown>('flujosDeleteRecipe', id),
  borrarEjecucion: (id: string) => apiCruda<IEjecucion[]>('flujosDeleteRun', id),
  elegirNomina: () => apiCruda<INomina | null>('flujosPickNomina'),
  leerNomina: (ruta: string) => apiCruda<INomina>('flujosReadNomina', ruta),
  revisar: (p: TPedidoFlujo) => apiCruda<IRevision>('flujosCheck', p),
  ejecutar: (p: TPedidoFlujo & { recipeId: string; recipeName: string }) => apiCruda<IEjecucion>('flujosRun', p),
  detener: () => apiCruda<unknown>('bulkStopSend'),
  sincronizarOps: () => apiCruda<{ items: { operation: number | string; stage?: string; status?: string; signers?: number; signed?: number }[] }>('opsSync', false),
  listarOps: () => apiCruda<{ items: { operation: number | string; stage?: string; status?: string; signers?: number; signed?: number }[] }>('opsList'),
};
