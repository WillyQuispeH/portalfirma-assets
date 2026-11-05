// Quién usa la app (usuario de Asset: administrador o corredor).
import { create } from 'zustand';
import { perfilService } from '../services/perfil.service';
import type { IPerfil } from '../interfaces/perfil.interface';

interface IPerfilState {
  perfil: IPerfil | null;
  error: string | null;
  perfilGet: () => Promise<void>;
}

export const usePerfilStore = create<IPerfilState>((set) => ({
  perfil: null,
  error: null,
  perfilGet: async () => {
    try {
      set({ perfil: await perfilService.get(), error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
}));
