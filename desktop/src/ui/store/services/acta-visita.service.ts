// Llamadas al proceso principal para el acta de visita (src/acta-visita.js). Sin manejo de errores.
import { api } from '../../utils/api';
import type { IActaVisita, IActaFirmaVista } from '../interfaces/acta-visita.interface';

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
  borrarArchivo: (actaId: string, tipo: 'audio' | 'foto', n: number) => api<IActaVisita>('actaBorrarArchivo', { actaId, tipo, n }),
  // acta firmada (api/src/whatsapp/acta-firma.ts): vista previa del PDF, ajustes guardados en su origen y envío a firmar
  firmaVistaPrevia: (actaId: string) => api<IActaFirmaVista>('actaFirmaVistaPrevia', actaId),
  firmaAjustes: (actaId: string, b: { observaciones?: string; interes?: string; visitante?: { nombre?: string; rut?: string; email?: string; telefono?: string } }) => api<{ ok: boolean }>('actaFirmaAjustes', { actaId, ...b }),
  firmaEnviar: (actaId: string) => api<{ operacion: number; indicacion?: string }>('actaFirmaEnviar', actaId),
  archivo: (actaId: string, tipo: 'audio' | 'foto', n: number) => api<{ url: string; descarga: string; nombre: string; tipo: string }>('actaArchivo', { actaId, tipo, n }),
};
