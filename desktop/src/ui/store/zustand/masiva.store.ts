// Estado de la carga masiva: la cola (la manda el proceso principal), la pestaña y las opciones de envío.
// La clave del certificado NO va aquí: vive solo en el componente mientras dura el proceso.
import { create } from 'zustand';
import type { IColaMasiva, IOpcionesEnvio, IOperacionPendiente } from '../interfaces/masiva.interface';

interface IMasivaState {
  cola: IColaMasiva;
  tab: 'load' | 'cds';
  opciones: IOpcionesEnvio;
  // firma con certificado (sin la clave)
  cds: { rut: string; lista: IOperacionPendiente[]; sel: string[]; paso: 'rut' | 'code'; resultado: string | null };
  masivaSetCola: (cola: IColaMasiva) => void;
  masivaSetTab: (tab: 'load' | 'cds') => void;
  masivaSetOpciones: (o: Partial<IOpcionesEnvio>) => void;
  masivaSetCds: (c: Partial<IMasivaState['cds']>) => void;
}

export const useMasivaStore = create<IMasivaState>((set) => ({
  cola: { items: [] },
  tab: 'load',
  opciones: { protocolization: 'none', typeSign: 'simple' },
  cds: { rut: '', lista: [], sel: [], paso: 'rut', resultado: null },
  masivaSetCola: (cola) => set({ cola }),
  masivaSetTab: (tab) => set({ tab }),
  masivaSetOpciones: (o) => set((s) => ({ opciones: { ...s.opciones, ...o } })),
  masivaSetCds: (c) => set((s) => ({ cds: { ...s.cds, ...c } })),
}));
