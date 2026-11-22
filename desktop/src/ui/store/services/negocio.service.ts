// Llamadas puras al proceso principal. Sin manejo de errores: eso lo hace el store.
// La lógica de negocio vive en el servidor (api/src/negocios/negocio-acciones.ts): estas llamadas le piden cada operación (con la cuenta de Asset)
// y devuelven { negocio, mensajes } con los avisos del servidor.
import { api } from '../../utils/api';
import type { IFirmasRevisadas, INegocioLista, INegocioMovido } from '../interfaces/negocio.interface';

export type TTipoPago = 'reserva' | 'garantia' | 'primer_mes' | 'comision' | 'otro';
/** el archivo de un comprobante tal como lo da la pantalla; el servidor lo sube a R2 */
export interface IArchivoComprobante { nombre: string; mime?: string; bytes: Uint8Array }
export interface IPagoEntrada {
  negocioId: string; tipo: TTipoPago; monto: number; moneda: string; fecha: string; medio: string; nota?: string; referencia?: string;
  comprobante?: { clave: string; nombre: string; tipo: string; bytes: number; fecha: string } | null; // el que ya tenía el pago
  archivo?: IArchivoComprobante; // uno nuevo
}
export type TAccionAceptacion = 'acepta' | 'contraoferta' | 'rechaza' | 'oferta';
export type IPostarriendoEntrada =
  | { tipo: 'reajuste'; desde?: string; ipc: number; rentaNueva?: number }
  | { tipo: 'renovacion'; decision: 'renovar' | 'termino'; meses?: number; nota?: string }
  | { tipo: 'devolucion'; fechaRecepcion: string; conforme: boolean; descuento: number; motivo: string; fechaDevolucion: string; archivo?: IArchivoComprobante }
  | { tipo: 'quitar_renovacion' }
  | { tipo: 'quitar_devolucion' };

export const negocioService = {
  getAll: () => api<INegocioLista>('negListar'),
  mover: (id: string, etapa: string) => api<INegocioMovido>('negMover', id, etapa),
  // pide la revisión de firmas al servidor; si algo se firmó, el negocio avanza solo (lo hace el servidor)
  revisarFirmas: () => api<IFirmasRevisadas>('negFirmasRevisar'),
  pago: (o: IPagoEntrada) => api<INegocioMovido>('negPago', o),
  quitarPago: (id: string, tipo: Exclude<TTipoPago, 'otro'>) => api<INegocioMovido>('negPagoQuitar', id, tipo),
  factura: (id: string, o: { numero?: string; fecha: string; monto: number; moneda: string }) => api<INegocioMovido>('negFactura', id, o),
  quitarFactura: (id: string) => api<INegocioMovido>('negFacturaQuitar', id),
  aceptacion: (id: string, o: { accion: TAccionAceptacion; monto?: number; moneda?: string; garantia?: string; plazo?: string; condiciones?: string; nota?: string }) => api<INegocioMovido>('negAceptacion', id, o),
  contratoAprobar: (id: string, o: { personaId?: string; todos?: boolean; aprobado?: boolean }) => api<INegocioMovido>('negContratoAprobar', id, o),
  postarriendo: (id: string, o: IPostarriendoEntrada) => api<INegocioMovido>('negPostarriendo', id, o),
};
