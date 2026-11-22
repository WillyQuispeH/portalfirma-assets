// Llamadas al proceso principal de Mis operaciones. Devuelven la respuesta tal cual ({ ok, data, error, code }):
// la pantalla distingue «falta el teléfono» (NO_PHONE) y «falta el acceso a los documentos» (NO_FILE_KEY).
import { api, apiCruda } from '../../utils/api';
import type { IDetalleOperacion, IEstadoCuenta, IOperacion, TVersionDoc } from '../interfaces/operacion.interface';

type TLista = { items: IOperacion[]; lastSync: string | null; found?: number };
export const operacionService = {
  estado: () => apiCruda<IEstadoCuenta>('opsStatus'),
  getAll: () => apiCruda<TLista>('opsList'),
  sincronizar: () => apiCruda<TLista>('opsSync', false),
  getDetalle: (n: number, refrescar?: boolean) => apiCruda<IDetalleOperacion>('opsDetail', n, refrescar),
  // `version`: original, signed o legalized (sin ella, la más avanzada que haya)
  getArchivo: (n: number, version?: TVersionDoc) => apiCruda<{ path: string; bytes: Uint8Array }>('opsFile', n, version),
  guardarArchivo: (n: number, version?: TVersionDoc) => apiCruda<string | null>('opsSaveFile', n, version),
  compartir: (n: number, version?: TVersionDoc) => apiCruda<string | null>('opsShare', n, version),
  // reenviar el enlace de firma (por correo o WhatsApp)
  reenviar: (o: { operacion: number | string; firmanteId?: string }) => api<{ ok: boolean }>('opReenviar', o),
};
