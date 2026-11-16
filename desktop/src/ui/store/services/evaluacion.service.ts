// Llamadas al proceso principal para la evaluación del arrendatario (src/evaluacion.js). Sin manejo de errores.
import { api } from '../../utils/api';
import type { IEvaluacion, TEvaluacionRespuesta } from '../interfaces/evaluacion.interface';

export const evaluacionService = {
  ver: (negocioId: string) => api<TEvaluacionRespuesta>('evVer', negocioId),
  solicitar: (negocioId: string, avales: string[], titular = true) => api<IEvaluacion>('evSolicitar', { negocioId, avales, titular }),
  recalcular: (negocioId: string) => api<IEvaluacion>('evRecalcular', negocioId),
  decidir: (negocioId: string, decision: 'aprobada' | 'rechazada', nota: string) => api<IEvaluacion>('evDecidir', { negocioId, decision, nota }),
  /** la decisión de UNA persona (el arrendatario o un aval); 'pendiente' la deshace */
  decidirPersona: (negocioId: string, personaId: string, decision: 'aprobada' | 'rechazada' | 'pendiente') => api<IEvaluacion>('evDecidir', { negocioId, personaId, decision, nota: '' }),
  /** el documento recibido en base64 (PDF o imagen), para verlo dentro de la app */
  archivoBytes: (negocioId: string, personaId: string, n: number) => api<{ base64: string; tipo: string; nombre: string }>('evArchivoBytes', { negocioId, personaId, n }),
  clase: (negocioId: string, personaId: string, n: number, clase: string) => api<IEvaluacion>('evClase', { negocioId, personaId, n, clase }),
  archivo: (negocioId: string, personaId: string, n: number) => api<{ url: string; nombre: string }>('evArchivo', { negocioId, personaId, n }),
};
