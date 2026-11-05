// Estado de la cuenta de Asset: quién entró y si hay que mostrar la pantalla de ingreso.
import { create } from 'zustand';
import { accesoService } from '../services/acceso.service';
import type { EstadoAcceso, IUsuarioAsset } from '../interfaces/acceso.interface';

interface IAccesoState {
  estado: EstadoAcceso;
  usuario: IUsuarioAsset | null;
  error: string;
  enviando: boolean;
  accesoRestaurar: () => Promise<void>;
  accesoIngresar: (email: string, clave: string) => Promise<boolean>;
  accesoSalir: () => Promise<void>;
  accesoVencido: (aviso?: string) => void;
}

export const useAccesoStore = create<IAccesoState>((set) => ({
  estado: 'cargando', usuario: null, error: '', enviando: false,
  accesoRestaurar: async () => {
    set({ estado: 'cargando', error: '' });
    const r = await accesoService.restaurar().catch((e: Error) => ({ ok: false, error: e.message, data: null }));
    if (r.ok && r.data) set({ estado: 'dentro', usuario: r.data });
    else set({ estado: 'fuera', usuario: null, error: r.ok ? '' : r.error || '' });
  },
  accesoIngresar: async (email, clave) => {
    set({ enviando: true, error: '' });
    try {
      const r = await accesoService.ingresar(email, clave);
      if (!r.ok || !r.data) { set({ error: r.error || 'No se pudo iniciar sesión.' }); return false; }
      set({ estado: 'dentro', usuario: r.data });
      return true;
    } finally { set({ enviando: false }); }
  },
  accesoSalir: async () => { await accesoService.salir().catch(() => null); set({ estado: 'fuera', usuario: null, error: '' }); },
  accesoVencido: (aviso) => set({ estado: 'fuera', usuario: null, error: aviso || 'Tu sesión venció. Ingresa de nuevo.' }),
}));
