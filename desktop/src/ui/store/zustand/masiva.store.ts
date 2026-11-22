// Estado de la carga masiva: la cola (la manda el proceso principal) y las opciones de envío.
import { create } from 'zustand';
import type { IColaMasiva, IOpcionesEnvio } from '../interfaces/masiva.interface';

interface IMasivaState {
  cola: IColaMasiva;
  opciones: IOpcionesEnvio;
  masivaSetCola: (cola: IColaMasiva) => void;
  masivaSetOpciones: (o: Partial<IOpcionesEnvio>) => void;
}

export const useMasivaStore = create<IMasivaState>((set) => ({
  cola: { items: [] },
  opciones: { protocolization: 'none', typeSign: 'avanzada' },
  masivaSetCola: (cola) => set({ cola }),
  masivaSetOpciones: (o) => set((s) => ({ opciones: { ...s.opciones, ...o } })),
}));
