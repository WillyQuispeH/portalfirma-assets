// Estado del explorador de Google Drive: para qué se abrió, dónde está (Mi unidad, compartidos o una búsqueda),
// los archivos de la carpeta y los elegidos.
import { create } from 'zustand';
import { driveService } from '../services/drive.service';
import type { IDriveArchivo, TDrivePara } from '../interfaces/drive.interface';

const RAIZ = { id: 'root', name: 'Mi unidad' };

interface IDriveState {
  para: TDrivePara;
  email: string;
  ambito: 'mine' | 'shared';
  ruta: { id: string; name: string }[];
  consulta: string;
  archivos: IDriveArchivo[];
  siguiente: string;
  cargando: boolean;
  error: string;
  sinConexion: boolean; // Google cerró la conexión: hay que volver a conectar
  elegidos: Map<string, IDriveArchivo>;
  driveIniciar: (para: TDrivePara, email?: string) => void;
  driveCargar: (agregar?: boolean) => Promise<void>;
  driveAmbito: (a: 'mine' | 'shared') => void;
  driveBuscar: (q: string) => void;
  driveEntrar: (carpeta: IDriveArchivo) => void;
  driveSubirA: (i: number) => void;
  driveMarcar: (f: IDriveArchivo) => void;
  driveElegir: (lista: IDriveArchivo[]) => void;
  driveCarpetaCompleta: () => Promise<string>;
}

export const useDriveStore = create<IDriveState>((set, get) => ({
  para: 'sign', email: '', ambito: 'mine', ruta: [RAIZ], consulta: '', archivos: [], siguiente: '', cargando: false, error: '', sinConexion: false, elegidos: new Map(),

  driveIniciar: (para, email) => set((s) => ({ para, email: email ?? s.email, elegidos: new Map(), consulta: '', sinConexion: false, error: '' })),
  driveCargar: async (agregar = false) => {
    const s = get(); const aqui = s.ruta[s.ruta.length - 1];
    set({ cargando: true, error: '' });
    const r = await driveService.listar({ search: s.consulta, folder: aqui.id, scope: s.ambito, pageToken: agregar ? s.siguiente : '' });
    if (!r.ok) {
      if (/Conecta|cerró la conexión/.test(r.error || '')) return set({ cargando: false, sinConexion: true });
      return set({ cargando: false, error: r.error || 'No se pudo leer Google Drive.' });
    }
    set((x) => ({ cargando: false, archivos: agregar ? [...x.archivos, ...r.data!.files] : r.data!.files, siguiente: r.data!.next }));
  },
  driveAmbito: (a) => { set({ ambito: a, consulta: '', ruta: [RAIZ], archivos: [] }); get().driveCargar(); },
  driveBuscar: (q) => { set({ consulta: q, archivos: [] }); get().driveCargar(); },
  driveEntrar: (c) => { set((s) => ({ ruta: [...s.ruta, { id: c.id, name: c.name }], ambito: 'mine', consulta: '', archivos: [] })); get().driveCargar(); },
  driveSubirA: (i) => { set((s) => ({ ruta: s.ruta.slice(0, i + 1), archivos: [] })); get().driveCargar(); },
  driveMarcar: (f) => set((s) => { const m = new Map(s.elegidos); if (m.has(f.id)) m.delete(f.id); else m.set(f.id, f); return { elegidos: m }; }),
  driveElegir: (lista) => set({ elegidos: new Map(lista.map((f) => [f.id, f])) }),
  // marca todos los documentos de la carpeta actual (también los de sus subcarpetas, según el proceso principal)
  driveCarpetaCompleta: async () => {
    const aqui = get().ruta[get().ruta.length - 1];
    const r = await driveService.documentosDeCarpeta(aqui.id);
    if (!r.ok) throw new Error(r.error);
    set((s) => { const m = new Map(s.elegidos); for (const f of r.data!) m.set(f.id, f); return { elegidos: m }; });
    return `${r.data!.length} documento(s) de «${aqui.name}» seleccionados.`;
  },
}));
