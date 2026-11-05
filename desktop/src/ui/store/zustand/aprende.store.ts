// Estado de «Aprende»: la lección abierta (null = todas las lecciones) y cuáles ya se completaron.
// El avance queda en localStorage del equipo ('pf.aprende.<id>' = '1'), como antes.
import { create } from 'zustand';

interface IAprendeState {
  leccion: string | null;
  hechos: Record<string, boolean>;
  aprendeCargar: (ids: string[]) => void; // lee el avance guardado
  aprendeLeccion: (id: string | null) => void;
  aprendeMarcar: (id: string, hecho: boolean) => void;
}

const clave = (id: string) => 'pf.aprende.' + id;

export const useAprendeStore = create<IAprendeState>((set, get) => ({
  leccion: null, hechos: {},
  aprendeCargar: (ids) => {
    const hechos: Record<string, boolean> = {};
    for (const id of ids) { try { hechos[id] = localStorage.getItem(clave(id)) === '1'; } catch { hechos[id] = false; } }
    set({ hechos });
  },
  aprendeLeccion: (leccion) => set({ leccion }),
  aprendeMarcar: (id, hecho) => {
    try { if (hecho) localStorage.setItem(clave(id), '1'); else localStorage.removeItem(clave(id)); } catch { /* sin almacenamiento */ }
    set({ hechos: { ...get().hechos, [id]: hecho } });
  },
}));
