// Llamadas al proceso principal de Expedientes. Devuelven la respuesta tal cual ({ ok, data, error }):
// la carpeta puede no estar (Drive desconectado, carpeta movida) y la pantalla lo muestra en su lugar.
import { apiCruda } from '../../utils/api';
import type { IAgregados, IArchivoExpediente, IExpediente, IMovimientoExpediente, IOperacionResumen } from '../interfaces/expediente.interface';

export const expedienteService = {
  getAll: () => apiCruda<IExpediente[]>('expList'),
  getArchivos: (id: string) => apiCruda<IArchivoExpediente[]>('expFiles', id),
  getHistorial: (id: string) => apiCruda<IMovimientoExpediente[]>('expHistory', id),
  elegirArchivos: (id: string) => apiCruda<IAgregados>('expPickFiles', id),
  quitarArchivo: (id: string, archivo: string) => apiCruda<unknown>('expRemoveFile', id, archivo),
  mostrarCarpeta: (id: string) => apiCruda<unknown>('expReveal', id),
  getOperaciones: () => apiCruda<{ items?: IOperacionResumen[] }>('opsList'),
};
