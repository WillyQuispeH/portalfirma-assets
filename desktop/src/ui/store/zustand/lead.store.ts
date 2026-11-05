// Estado de la bandeja de Leads: filtros, la lista y el lead elegido.
// Los filtros y el elegido quedan guardados aquí, así al volver se ve lo mismo.
import { create } from 'zustand';
import { leadService } from '../services/lead.service';
import type { ILeadLista, TLeadFiltro } from '../interfaces/lead.interface';

export interface IFiltrosLeads {
  filtro: TLeadFiltro;
  q: string;
  origen: string;
  broker: string; // id de corredor, '_sin', o el nombre del broker (cuentas sin corredores)
}

let consultaActual = 0; // si llegan respuestas fuera de orden, vale solo la última

interface ILeadState {
  datos: ILeadLista | null;
  sel: string | null;
  cargado: boolean;
  error: string | null;
  filtros: IFiltrosLeads;
  leadGetAll: () => Promise<void>;
  leadSetFiltros: (f: Partial<IFiltrosLeads>) => void;
  leadSeleccionar: (id: string | null) => void;
}

export const useLeadStore = create<ILeadState>((set, get) => ({
  datos: null,
  sel: null,
  cargado: false,
  error: null,
  filtros: { filtro: 'abiertos', q: '', origen: '', broker: '' },

  // trae la lista; si el elegido ya no está en ella, queda elegido el primero
  leadGetAll: async () => {
    const { filtro, q, origen, broker } = get().filtros;
    const n = ++consultaActual;
    try {
      const datos = await leadService.getAll({ estado: filtro === 'todos' ? undefined : filtro, q, origen: origen || undefined, broker: broker || undefined });
      if (n !== consultaActual) return;
      const sel = get().sel;
      set({ datos, cargado: true, error: null, sel: sel && datos.leads.some((l) => l.id === sel) ? sel : datos.leads[0]?.id || null });
    } catch (e) {
      if (n === consultaActual) set({ error: (e as Error).message });
    }
  },

  leadSetFiltros: (f) => { set((s) => ({ filtros: { ...s.filtros, ...f } })); get().leadGetAll(); },
  leadSeleccionar: (sel) => set({ sel }),
}));
