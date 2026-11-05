// Estado de Cartera y Personas: los datos (inmoListar trae ambas), los filtros de cada pantalla
// y la selección para asignar captador. Los filtros quedan guardados aquí, así al volver se ve lo mismo.
import { create } from 'zustand';
import { propiedadService } from '../services/propiedad.service';
import type { ICartera, TCaptaciones, TPropiedadEstado, TPropiedadTipo } from '../interfaces/propiedad.interface';
import type { TPersonaRol } from '../interfaces/persona.interface';

export type TFiltroEspecial = '' | 'enCaptacion' | 'sinProp' | 'sinFotos' | 'reservadas' | 'leads';

export interface IFiltrosCartera {
  q: string;
  op: 'todas' | 'venta' | 'arriendo';
  tipo: TPropiedadTipo | '';
  estado: TPropiedadEstado | '';
  comuna: string;
  especial: TFiltroEspecial;
  archivadas: boolean;
  captador: string; // id del corredor, '_sin' (sin captador) o '' (todos)
}

export interface IFiltrosPersonas {
  q: string;
  rol: TPersonaRol | '';
}

interface ICarteraState {
  datos: ICartera;
  captaciones: TCaptaciones;
  cargado: boolean;
  cargando: boolean;
  error: string | null;
  filtros: IFiltrosCartera;
  filtrosPersonas: IFiltrosPersonas;
  seleccion: string[] | null; // null: fuera del modo «Asignar captador»
  carteraGetAll: () => Promise<void>;
  carteraSetFiltros: (f: Partial<IFiltrosCartera>) => void;
  personasSetFiltros: (f: Partial<IFiltrosPersonas>) => void;
  seleccionIniciar: () => void;
  seleccionAlternar: (id: string) => void;
  seleccionFijar: (ids: string[]) => void;
  seleccionCancelar: () => void;
  carteraSetCaptador: (corredorId: string | null) => Promise<{ cambiadas?: number; error?: string }>;
}

export const useCarteraStore = create<ICarteraState>((set, get) => ({
  datos: { propiedades: [], personas: [], ultimaImportacion: null },
  captaciones: {},
  cargado: false,
  cargando: false,
  error: null,
  filtros: { q: '', op: 'todas', tipo: '', estado: '', comuna: '', especial: '', archivadas: false, captador: '' },
  filtrosPersonas: { q: '', rol: '' },
  seleccion: null,

  carteraGetAll: async () => {
    set({ cargando: true, error: null });
    try {
      const [datos, captaciones] = await Promise.all([
        propiedadService.getAll(),
        propiedadService.getCaptaciones().catch(() => ({})), // sin captaciones la cartera se ve igual, solo sin la barra de avance
      ]);
      set({ datos, captaciones, cargado: true, cargando: false });
    } catch (e) {
      set({ error: (e as Error).message, cargando: false });
    }
  },

  carteraSetFiltros: (f) => set((s) => ({ filtros: { ...s.filtros, ...f } })),
  personasSetFiltros: (f) => set((s) => ({ filtrosPersonas: { ...s.filtrosPersonas, ...f } })),

  // al entrar al modo, si no hay filtro de captador, se muestran las que no tienen
  seleccionIniciar: () => set((s) => ({ seleccion: [], filtros: s.filtros.captador ? s.filtros : { ...s.filtros, captador: '_sin' } })),
  seleccionAlternar: (id) => set((s) => {
    const sel = s.seleccion || [];
    return { seleccion: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] };
  }),
  seleccionFijar: (ids) => set({ seleccion: ids }),
  seleccionCancelar: () => set({ seleccion: null }),

  carteraSetCaptador: async (corredorId) => {
    try {
      const r = await propiedadService.setCaptador(get().seleccion || [], corredorId);
      set({ seleccion: null });
      await get().carteraGetAll();
      return { cambiadas: r.cambiadas };
    } catch (e) {
      return { error: (e as Error).message };
    }
  },
}));
