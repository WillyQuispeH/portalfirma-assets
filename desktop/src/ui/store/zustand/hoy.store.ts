// Estado de «Hoy»: el resumen de etapas, la agenda del día, si hay cartera, el nombre para el saludo,
// y lo que se despliega («Ver más», «Esperando a otros»), que queda guardado al volver.
import { create } from 'zustand';
import { hoyService } from '../services/hoy.service';
import type { IHoy } from '../interfaces/hoy.interface';
import type { IEvento } from '../interfaces/evento.interface';

// la fecha de hoy en la hora local (como hoyISO() de etapas.js)
export const hoyLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

interface IHoyState {
  datos: IHoy | null;
  eventos: IEvento[];
  hayCartera: boolean;
  nombre: string;
  error: string | null;
  verTodos: boolean;
  verEsperando: boolean;
  hoyGetAll: () => Promise<void>;
  hoyAlternarTodos: () => void;
  hoyAlternarEsperando: () => void;
}

export const useHoyStore = create<IHoyState>((set) => ({
  datos: null,
  eventos: [],
  hayCartera: true,
  nombre: '',
  error: null,
  verTodos: false,
  verEsperando: false,

  hoyGetAll: async () => {
    try {
      const [datos, resumen, eventos] = await Promise.all([
        hoyService.getHoy(), hoyService.getResumen(), hoyService.getAgenda(hoyLocal()).catch(() => [] as IEvento[]),
      ]);
      set({ datos, hayCartera: !!resumen.propiedades, eventos: eventos.filter((e) => e.estado !== 'cancelado'), error: null });
    } catch (e) {
      return set({ error: (e as Error).message });
    }
    const u = await hoyService.getUsuario().catch(() => null);
    set({ nombre: String(u?.namePerson || '').split(' ')[0] || '' });
  },

  hoyAlternarTodos: () => set((s) => ({ verTodos: !s.verTodos })),
  hoyAlternarEsperando: () => set((s) => ({ verEsperando: !s.verEsperando })),
}));
