// Estado de los negocios (tablero de Negocios y Finanzas): los datos, los filtros del tablero y las acciones.
// Los filtros quedan guardados aquí, así al volver al tablero se ve lo mismo.
import { create } from 'zustand';
import { negocioService } from '../services/negocio.service';
import type { IEtapa, INegocio, TNegocioTipo } from '../interfaces/negocio.interface';

export interface IFiltrosNegocios {
  tipo: TNegocioTipo;
  ver: 'abiertos' | 'cerrados';
  q: string;
}

interface INegocioState {
  negocios: INegocio[];
  etapas: Record<TNegocioTipo, IEtapa[]>;
  cargado: boolean;
  cargando: boolean;
  error: string | null;
  filtros: IFiltrosNegocios;
  tipoManual: boolean; // el usuario eligió Ventas o Arriendos: ya no se cambia solo
  negocioGetAll: () => Promise<void>;
  negocioAbrir: (tipo?: TNegocioTipo) => Promise<void>;
  negocioSetFiltros: (f: Partial<IFiltrosNegocios>) => void;
  negocioMover: (id: string, etapa: string) => Promise<{ mensaje?: string; error?: string }>;
  negocioRevisarFirmas: () => Promise<string[]>;
}

export const useNegocioStore = create<INegocioState>((set, get) => ({
  negocios: [],
  etapas: { venta: [], arriendo: [] },
  cargado: false,
  cargando: false,
  error: null,
  filtros: { tipo: 'venta', ver: 'abiertos', q: '' },
  tipoManual: false,

  negocioGetAll: async () => {
    set({ cargando: true, error: null });
    try {
      const r = await negocioService.getAll();
      set({ negocios: r.negocios, etapas: r.etapas, cargado: true, cargando: false });
    } catch (e) {
      set({ error: (e as Error).message, cargando: false });
    }
  },

  // al abrir el tablero: el tipo pedido o, si no se eligió a mano, donde está lo último que se movió
  negocioAbrir: async (tipo) => {
    await get().negocioGetAll();
    if (tipo) return set((s) => ({ filtros: { ...s.filtros, tipo } }));
    if (get().tipoManual) return;
    const ultimo = get().negocios.filter((n) => n.estado === 'abierto')
      .sort((a, b) => String(b.actualizado || b.creado || '').localeCompare(String(a.actualizado || a.creado || '')))[0];
    if (ultimo) set((s) => ({ filtros: { ...s.filtros, tipo: ultimo.tipo } }));
  },

  negocioSetFiltros: (f) => set((s) => ({ filtros: { ...s.filtros, ...f }, tipoManual: s.tipoManual || 'tipo' in f })),

  negocioMover: async (id, etapa) => {
    try {
      const r = await negocioService.mover(id, etapa);
      await get().negocioGetAll();
      return { mensaje: [`Negocio en «${r.negocio.etapaInfo?.t}».`, ...r.mensajes].join(' ') };
    } catch (e) {
      return { error: (e as Error).message };
    }
  },

  negocioRevisarFirmas: async () => {
    try {
      const r = await negocioService.revisarFirmas();
      if (r.mensajes.length) set({ negocios: r.negocios });
      return r.mensajes;
    } catch {
      return []; // en segundo plano: si falla, se revisa la próxima vez
    }
  },
}));
