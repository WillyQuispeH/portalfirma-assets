// Interfaz pública de Google Drive para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useDriveStore } from '../zustand/drive.store';
import { driveService } from '../services/drive.service';

export function useDrive() {
  return useDriveStore(useShallow((s) => ({
    para: s.para, email: s.email, ambito: s.ambito, ruta: s.ruta, consulta: s.consulta, archivos: s.archivos, siguiente: s.siguiente,
    cargando: s.cargando, error: s.error, sinConexion: s.sinConexion, elegidos: s.elegidos,
    driveCargar: s.driveCargar, driveAmbito: s.driveAmbito, driveBuscar: s.driveBuscar, driveEntrar: s.driveEntrar, driveSubirA: s.driveSubirA,
    driveMarcar: s.driveMarcar, driveCarpetaCompleta: s.driveCarpetaCompleta,
  })));
}

// Fuera de React (el controlador de Drive)
export const driveEstado = () => useDriveStore.getState();
export const drive = driveService;
