// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
import { api } from '../../utils/api';
import type { IAsignacionCaptador, ICartera, IEstadoPortal, IPasosCaptacion, IPropiedad, IRegistroActividad, TCaptaciones, TOperacion } from '../interfaces/propiedad.interface';

export const propiedadService = {
  // propiedades y personas (ya filtradas por perfil en el proceso principal)
  getAll: () => api<ICartera>('inmoListar'),
  getCaptaciones: () => api<TCaptaciones>('etCaptaciones'),
  setCaptador: (ids: string[], corredorId: string | null) => api<IAsignacionCaptador>('accCaptadorVarios', ids, corredorId),

  // ficha de la propiedad
  getActividad: (id: string) => api<IRegistroActividad[]>('inmoActividad', id),
  getPasosCaptacion: (id: string) => api<IPasosCaptacion>('etPasos', { propId: id, ambito: 'captacion' }),
  getPortal: () => api<IEstadoPortal>('mlEstado'),
  guardar: (cambios: Partial<IPropiedad> & { id: string }) => api<IPropiedad>('inmoPropGuardar', cambios),
  archivar: (id: string, archivar: boolean) => api<unknown>('inmoPropArchivar', id, archivar),
  nota: (id: string, texto: string) => api<IRegistroActividad[]>('inmoNota', id, texto),
  vincular: (id: string, personaId: string, rol: string) => api<unknown>('inmoVincular', id, personaId, rol),
  desvincular: (id: string, personaId: string, rol: string) => api<unknown>('inmoDesvincular', id, personaId, rol),
  setCaptadorUno: (id: string, corredorId: string | null) => api<unknown>('accCaptador', id, corredorId),
  leadsVistos: (id: string) => api<unknown>('inmoLeadsVistos', id),
  // documentos de la carpeta de la propiedad
  docElegir: (id: string) => api<unknown>('inmoDocElegir', id), // diálogo del sistema; null si se cancela
  docQuitar: (id: string, docId: string) => api<unknown>('inmoDocQuitar', id, docId),
  docAbrir: (id: string, docId: string) => api<unknown>('inmoDocAbrir', id, docId),
  docCarpeta: (id: string) => api<unknown>('inmoDocCarpeta', id),
  // PDF creado en Asset (documentos en firma)
  pdfAbrir: (ruta: string) => api<unknown>('dgAbrir', ruta),
  // aviso en Portal Inmobiliario
  avisoEstado: (id: string, op: TOperacion, estado: string) => api<unknown>('mlEstadoAviso', id, op, estado),
  avisoActualizar: (id: string, op: TOperacion) => api<unknown>('mlActualizar', id, op),
};
