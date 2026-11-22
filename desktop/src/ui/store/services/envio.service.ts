// Llamadas al proceso principal de «Enviar a firmar». Sin manejo de errores: eso lo hace el store.
import { api, apiCruda } from '../../utils/api';
import type { IAnalisis, IArchivoEnvio, IDetalleOperacion, IPayloadEnvio, IResultadoEnvio } from '../interfaces/envio.interface';

export const envioService = {
  revisarArchivo: (ruta: string) => api<IArchivoEnvio>('checkFile', ruta),
  elegirArchivo: () => api<IArchivoEnvio | null>('pickFile'),
  analizar: (ruta: string) => api<IAnalisis>('analyze', ruta),
  enviar: (payload: IPayloadEnvio & { __fileName: string }) => api<IResultadoEnvio>('send', payload),
  detalle: (op: number | string) => api<IDetalleOperacion>('detail', op),
  reenviar: (o: { operacion: number | string; firmanteId?: string }) => api<{ ok: boolean }>('opReenviar', o),
  leerPdf: (ruta: string) => api<string>('docLeer', ruta),
  vistaPrevia: (ruta: string) => api<string | null>('docVista', ruta),
  archivoOperacion: (op: number | string) => apiCruda<{ path: string }>('opsFile', op),
};
