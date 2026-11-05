// Llamadas a Google Drive (src/gdrive.js). Devuelven la respuesta tal cual ({ ok, data, error }), porque según
// el error se pide volver a conectar. Sin manejo de errores: eso lo hacen el store y el controlador.
import { apiCruda } from '../../utils/api';
import type { IDriveArchivo, IDriveEstado, IDriveLista } from '../interfaces/drive.interface';

export const driveService = {
  estado: () => apiCruda<IDriveEstado>('driveStatus'),
  conectar: () => apiCruda<{ email?: string }>('driveConnect'),
  desconectar: () => apiCruda('driveDisconnect'),
  activar: () => apiCruda<unknown>('driveSetClient'), // administrador: carga la credencial de Google
  listar: (o: { search: string; folder: string; scope: string; pageToken: string }) => apiCruda<IDriveLista>('driveList', o),
  documentosDeCarpeta: (id: string) => apiCruda<IDriveArchivo[]>('driveFolderDocs', id),
  descargar: (id: string) => apiCruda<string>('driveDownload', id),
  elegir: (o: { multi: boolean; folders: boolean }) => apiCruda<IDriveArchivo[]>('drivePick', o),
  cancelarSelector: () => apiCruda('drivePickCancel'),
  reabrirSelector: () => apiCruda('drivePickReopen'),
};
