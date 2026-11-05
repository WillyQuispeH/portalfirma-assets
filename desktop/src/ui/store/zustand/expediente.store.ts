// Estado de Expedientes: la lista, el elegido con sus archivos e historial, los archivos marcados, la pestaña
// (documentos o historial) y la búsqueda. El elegido y la búsqueda quedan guardados al volver.
import { create } from 'zustand';
import { expedienteService } from '../services/expediente.service';
import type { IAgregados, IArchivoExpediente, IExpediente, IMovimientoExpediente, IOperacionResumen } from '../interfaces/expediente.interface';

type TResultado = { mensaje?: string; error?: string };

interface IExpedienteState {
  lista: IExpediente[];
  cargado: boolean;
  sel: string | null;
  archivos: IArchivoExpediente[];
  historial: IMovimientoExpediente[];
  errorArchivos: string;
  cargandoArchivos: boolean;
  marcados: string[];
  tab: 'docs' | 'hist';
  q: string;
  operaciones: IOperacionResumen[] | null;
  expedientesGetAll: (sel?: string | null) => Promise<void>;
  expedienteElegir: (id: string) => Promise<void>;
  expedienteSetTab: (tab: 'docs' | 'hist') => void;
  expedienteSetQ: (q: string) => void;
  archivoMarcar: (id: string) => void;
  archivosDesmarcar: () => void;
  archivosAgregar: () => Promise<TResultado>;
  archivoQuitar: (archivo: string) => Promise<TResultado>;
}

// lo que se agregó o se saltó (mismos mensajes que antes)
export function resumenAgregados(d?: IAgregados): TResultado {
  if (d?.skipped?.length) return { error: `No se agregaron: ${d.skipped.join(' · ')}` };
  if (d?.added?.length) return { mensaje: d.added.length === 1 ? `Se agregó «${d.added[0]}».` : `Se agregaron ${d.added.length} archivos.` };
  return {};
}

export const useExpedienteStore = create<IExpedienteState>((set, get) => ({
  lista: [], cargado: false, sel: null, archivos: [], historial: [], errorArchivos: '', cargandoArchivos: false,
  marcados: [], tab: 'docs', q: '', operaciones: null,

  // la lista; y el elegido (el pedido, el que había o el primero)
  expedientesGetAll: async (sel) => {
    const r = await expedienteService.getAll(); const lista = r.ok ? r.data || [] : [];
    let elegido = sel !== undefined ? sel : get().sel;
    if (elegido && !lista.some((x) => x.id === elegido)) elegido = null;
    if (!elegido && lista.length) elegido = lista[0].id;
    set({ lista, cargado: true, sel: elegido });
    if (elegido) await get().expedienteElegir(elegido); else set({ archivos: [], historial: [] });
  },

  expedienteElegir: async (id) => {
    set({ sel: id, marcados: [], archivos: [], cargandoArchivos: true });
    const [f, h] = await Promise.all([expedienteService.getArchivos(id), expedienteService.getHistorial(id)]);
    if (get().sel !== id) return; // se eligió otro mientras llegaba
    set({ cargandoArchivos: false, archivos: f.ok ? f.data || [] : [], errorArchivos: f.ok ? '' : f.error || '', historial: h.ok ? h.data || [] : [] });
    const l = await expedienteService.getAll(); if (l.ok) set({ lista: l.data || [] }); // la cuenta de archivos
  },

  expedienteSetTab: (tab) => {
    set({ tab });
    if (tab === 'hist' && !get().operaciones) expedienteService.getOperaciones().then((r) => { if (r.ok) set({ operaciones: r.data?.items || [] }); });
  },
  expedienteSetQ: (q) => set({ q }),
  archivoMarcar: (id) => set((s) => ({ marcados: s.marcados.includes(id) ? s.marcados.filter((x) => x !== id) : [...s.marcados, id] })),
  archivosDesmarcar: () => set({ marcados: [] }),

  archivosAgregar: async () => {
    const id = get().sel; if (!id) return {};
    const r = await expedienteService.elegirArchivos(id); if (!r) return {};
    if (!r.ok) return { error: r.error };
    await get().expedienteElegir(id); return resumenAgregados(r.data);
  },
  archivoQuitar: async (archivo) => {
    const id = get().sel; if (!id) return {};
    const r = await expedienteService.quitarArchivo(id, archivo);
    if (!r.ok) return { error: r.error };
    await get().expedienteElegir(id); return {};
  },
}));
