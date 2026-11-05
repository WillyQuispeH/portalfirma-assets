// Estado de los documentos recientes (lo usan el inicio de Gestión documental y la pantalla «Recientes»):
// la lista, y la búsqueda, el tipo y la página de «Recientes», que quedan guardados al volver.
import { create } from 'zustand';
import { recienteService } from '../services/reciente.service';
import type { IReciente } from '../interfaces/reciente.interface';

export type TTipoArchivo = '' | 'pdf' | 'doc' | 'xls' | 'img';

interface IRecienteState {
  lista: IReciente[];
  cargado: boolean;
  q: string;
  tipo: TTipoArchivo;
  pagina: number;
  recientesGetAll: () => Promise<void>;
  recientesSetFiltros: (f: { q?: string; tipo?: TTipoArchivo; pagina?: number }) => void;
  recienteQuitar: (ruta: string) => Promise<void>;
  recientesQuitarFaltantes: () => Promise<void>;
  recientesBorrarTodo: () => Promise<void>;
}

export const useRecienteStore = create<IRecienteState>((set, get) => ({
  lista: [],
  cargado: false,
  q: '',
  tipo: '',
  pagina: 1,
  recientesGetAll: async () => { const lista = await recienteService.getAll().catch(() => [] as IReciente[]); set({ lista, cargado: true }); },
  // cambiar la búsqueda o el tipo vuelve a la primera página
  recientesSetFiltros: (f) => set((s) => ({ ...f, pagina: f.pagina ?? ('q' in f || 'tipo' in f ? 1 : s.pagina) })),
  recienteQuitar: async (ruta) => { await recienteService.quitar(ruta); await get().recientesGetAll(); },
  recientesQuitarFaltantes: async () => { for (const x of get().lista) if (!x.exists) await recienteService.quitar(x.path); await get().recientesGetAll(); },
  recientesBorrarTodo: async () => { await recienteService.borrarTodo(); set({ pagina: 1 }); await get().recientesGetAll(); },
}));
