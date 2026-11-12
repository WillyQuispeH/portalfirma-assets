// Llamadas al proceso principal para el acta de visita (src/acta-visita.js). Sin manejo de errores.
import { api } from '../../utils/api';
import type { IActaVisita } from '../interfaces/acta-visita.interface';

export const actaVisitaService = {
  listar: (negocioId: string) => api<{ items: IActaVisita[] }>('actaListar', negocioId),
  crear: (negocioId: string) => api<IActaVisita>('actaCrear', { negocioId }),
  audio: (actaId: string, bytes: Uint8Array, mime: string, origen: 'app' | 'archivo') => api<IActaVisita>('actaAudio', { actaId, bytes, mime, origen }),
  foto: (actaId: string, bytes: Uint8Array, mime: string) => api<IActaVisita>('actaFoto', { actaId, bytes, mime }),
  notas: (actaId: string, notas: string) => api<IActaVisita>('actaNotas', { actaId, notas }),
  resumir: (actaId: string) => api<IActaVisita>('actaResumir', actaId),
  cerrar: (actaId: string, negocioId: string) => api<IActaVisita>('actaCerrar', { actaId, negocioId }),
  whatsapp: (actaId: string) => api<{ ok: boolean; telefono: string | null }>('actaWhatsapp', actaId),
  eliminar: (actaId: string) => api<{ ok: boolean }>('actaEliminar', actaId),
  archivo: (actaId: string, tipo: 'audio' | 'foto', n: number) => api<{ url: string; descarga: string; nombre: string; tipo: string }>('actaArchivo', { actaId, tipo, n }),
};
