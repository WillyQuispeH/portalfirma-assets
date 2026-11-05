// Estado de «La oficina»: los datos, a quién se eligió (o la sala / tu mesa), si está abierto «Te toca hoy»
// y la luz (mañana, tarde, noche). La elección y la luz quedan guardadas al volver.
import { create } from 'zustand';
import { oficinaService } from '../services/oficina.service';
import type { IOficina, TMiembro } from '../interfaces/oficina.interface';

export type TLuz = 'dia' | 'tarde' | 'noche';
export type TSeleccion = TMiembro | 'sala' | 'yo' | null;
const luzAuto = (): TLuz => { const h = new Date().getHours(); return h >= 7 && h < 17 ? 'dia' : h >= 17 && h < 20 ? 'tarde' : 'noche'; };

interface IOficinaState {
  datos: IOficina | null;
  nombre: string;
  error: string | null;
  sel: TSeleccion;
  toca: boolean;
  luz: TLuz;
  oficinaGetAll: () => Promise<void>;
  oficinaElegir: (sel: TSeleccion) => void; // elegir lo mismo otra vez lo cierra
  oficinaAlternarToca: () => void;
  oficinaSetLuz: (luz: TLuz) => void;
}

export const useOficinaStore = create<IOficinaState>((set, get) => ({
  datos: null,
  nombre: '',
  error: null,
  sel: null,
  toca: false,
  luz: luzAuto(),

  oficinaGetAll: async () => {
    try { set({ datos: await oficinaService.getDatos(), error: null }); } catch (e) { return set({ error: (e as Error).message }); }
    if (!get().nombre) {
      const u = await oficinaService.getUsuario().catch(() => null);
      set({ nombre: String(u?.namePerson || '').split(' ')[0] || '' });
    }
  },
  oficinaElegir: (sel) => set((s) => { const nuevo = s.sel === sel ? null : sel; return { sel: nuevo, toca: nuevo ? false : s.toca }; }),
  oficinaAlternarToca: () => set((s) => ({ toca: !s.toca })),
  oficinaSetLuz: (luz) => set({ luz }),
}));
