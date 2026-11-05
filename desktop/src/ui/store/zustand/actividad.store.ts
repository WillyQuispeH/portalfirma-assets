// Estado de la Actividad: búsqueda, filtro y la lista paginada («Ver más» agrega la página siguiente).
// La búsqueda y el filtro quedan guardados aquí, así al volver se ve lo mismo.
import { create } from 'zustand';
import { actividadService } from '../services/actividad.service';
import type { IActividadItem, TActividadFiltro } from '../interfaces/actividad.interface';

const LIMITE = 60;
let consultaActual = 0; // si llegan respuestas fuera de orden (al escribir rápido), vale solo la última

interface IActividadState {
  q: string;
  clase: TActividadFiltro;
  items: IActividadItem[];
  total: number;
  cargado: boolean;
  cargando: boolean;
  error: string | null;
  actividadGetPage: (reiniciar: boolean) => Promise<void>;
  actividadSetQ: (q: string) => void;
  actividadSetClase: (clase: TActividadFiltro) => void;
}

export const useActividadStore = create<IActividadState>((set, get) => ({
  q: '',
  clase: '',
  items: [],
  total: 0,
  cargado: false,
  cargando: false,
  error: null,

  actividadGetPage: async (reiniciar) => {
    const { q, clase, items } = get();
    const n = ++consultaActual;
    set({ cargando: true, error: null });
    try {
      const r = await actividadService.getPage({ q, clase, desde: reiniciar ? 0 : items.length, limite: LIMITE });
      if (n !== consultaActual) return;
      set({ items: reiniciar ? r.items : [...items, ...r.items], total: r.total, cargado: true, cargando: false });
    } catch (e) {
      if (n === consultaActual) set({ error: (e as Error).message, cargando: false });
    }
  },

  actividadSetQ: (q) => { set({ q }); get().actividadGetPage(true); },
  actividadSetClase: (clase) => { set({ clase }); get().actividadGetPage(true); },
}));
