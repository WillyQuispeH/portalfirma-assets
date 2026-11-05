// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
import { api } from '../../utils/api';
import type { IDocumentoPersona, IPersona } from '../interfaces/persona.interface';
import type { IRegistroActividad } from '../interfaces/propiedad.interface';

export const personaService = {
  getActividad: (id: string) => api<IRegistroActividad[]>('inmoActividad', id),
  // documentos que firma (órdenes de visita, comprobantes, contratos…), de todas sus propiedades
  getDocumentos: (id: string) => api<IDocumentoPersona[]>('dgPersona', id),
  guardar: (persona: IPersona) => api<IPersona>('inmoPerGuardar', persona),
  borrar: (id: string) => api<unknown>('inmoPerBorrar', id),
  nota: (id: string, texto: string) => api<IRegistroActividad[]>('inmoNota', id, texto),
  pdfAbrir: (ruta: string) => api<unknown>('dgAbrir', ruta),
};
