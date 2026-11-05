// Llamadas al proceso principal de Mis operaciones. Devuelven la respuesta tal cual ({ ok, data, error, code }):
// la pantalla distingue «falta el teléfono» (NO_PHONE) y «falta el acceso a los documentos» (NO_FILE_KEY).
import { api, apiCruda } from '../../utils/api';
import type { IDetalleOperacion, IEstadoCuenta, IOperacion } from '../interfaces/operacion.interface';

type TLista = { items: IOperacion[]; lastSync: string | null; found?: number };
export const operacionService = {
  estado: () => apiCruda<IEstadoCuenta>('opsStatus'),
  getAll: () => apiCruda<TLista>('opsList'),
  sincronizar: () => apiCruda<TLista>('opsSync', false),
  getDetalle: (n: number, refrescar?: boolean) => apiCruda<IDetalleOperacion>('opsDetail', n, refrescar),
  getArchivo: (n: number) => apiCruda<{ path: string; bytes: Uint8Array }>('opsFile', n),
  guardarArchivo: (n: number) => apiCruda<string | null>('opsSaveFile', n),
  compartir: (n: number) => apiCruda<string | null>('opsShare', n),
  // reenviar el enlace de firma (por correo o WhatsApp)
  reenviar: (o: Record<string, unknown>) => api<unknown>('manage', o),
};
