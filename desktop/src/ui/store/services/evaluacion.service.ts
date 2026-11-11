// Llamadas al proceso principal para la evaluación del arrendatario (src/evaluacion.js). Sin manejo de errores.
import { api } from '../../utils/api';
import type { IEvaluacion, TEvaluacionRespuesta } from '../interfaces/evaluacion.interface';

export const evaluacionService = {
  ver: (negocioId: string) => api<TEvaluacionRespuesta>('evVer', negocioId),
  solicitar: (negocioId: string, avales: string[]) => api<IEvaluacion>('evSolicitar', { negocioId, avales }),
  recalcular: (negocioId: string) => api<IEvaluacion>('evRecalcular', negocioId),
  decidir: (negocioId: string, decision: 'aprobada' | 'rechazada', nota: string) => api<IEvaluacion>('evDecidir', { negocioId, decision, nota }),
  archivo: (negocioId: string, personaId: string, n: number) => api<{ url: string; nombre: string }>('evArchivo', { negocioId, personaId, n }),
};
