// Estado de la Notaría virtual: el catálogo (categoría o búsqueda y sus resultados) y el formulario del trámite
// elegido, con sus valores. Se conserva al salir y volver a la pantalla, como antes.
import { create } from 'zustand';
import { notariaService } from '../services/notaria.service';
import { CATEGORIAS, valoresIniciales } from '../../utils/notaria';
import type { IFormulario, ITramite } from '../interfaces/notaria.interface';

interface INotariaState {
  cargado: boolean;
  categoria: string | null; // null: se buscó por texto
  consulta: string;
  buscando: boolean;
  errorCatalogo: string;
  resultados: ITramite[];
  abriendo: boolean;
  actual: IFormulario | null;
  valores: Record<string, string>;
  tocado: boolean; // se intentó enviar: se muestran los errores
  notariaBuscar: (q: string, categoria: string | null) => Promise<void>;
  notariaAbrir: (id: string) => Promise<string | null>;
  notariaVolver: () => void;
  notariaValor: (id: string, valor: string) => void;
  notariaTocar: () => void;
  notariaReiniciar: () => void;
}

export const useNotariaStore = create<INotariaState>((set, get) => ({
  cargado: false, categoria: CATEGORIAS[0], consulta: '', buscando: false, errorCatalogo: '', resultados: [],
  abriendo: false, actual: null, valores: {}, tocado: false,

  notariaBuscar: async (q, categoria) => {
    set({ categoria, consulta: categoria ? '' : q, buscando: true, errorCatalogo: '', cargado: true });
    try {
      const r = await notariaService.buscar(q); const vistos = new Set<string>();
      const lista = (Array.isArray(r) ? r : r?.results || []).filter((t) => t.template_version_id && !vistos.has(t.template_version_id) && vistos.add(t.template_version_id));
      set({ resultados: lista, buscando: false });
    } catch (e) { set({ resultados: [], buscando: false, errorCatalogo: (e as Error).message }); }
  },
  notariaAbrir: async (id) => {
    set({ abriendo: true });
    try {
      const f = await notariaService.formulario(id);
      const meta = get().resultados.find((t) => t.template_version_id === id);
      const actual = { ...f, url: meta?.url };
      set({ actual, valores: valoresIniciales(actual), tocado: false, abriendo: false });
      return null;
    } catch (e) { set({ abriendo: false }); return (e as Error).message; }
  },
  notariaVolver: () => {
    set({ actual: null });
    const s = get(); if (s.resultados.length) s.notariaBuscar(s.categoria || s.consulta || CATEGORIAS[0], s.categoria || (s.consulta ? null : CATEGORIAS[0]));
  },
  notariaValor: (id, valor) => set((s) => ({ valores: { ...s.valores, [id]: valor } })),
  notariaTocar: () => set({ tocado: true }),
  // después de enviar: la próxima vez se abre el catálogo de nuevo
  notariaReiniciar: () => set({ actual: null, cargado: false }),
}));
