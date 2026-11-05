// Estado de Flujos documentales: modelos, recetas, ejecuciones, la cola de la carga masiva y el estado de las
// operaciones (para seguir las firmas), y el asistente de 5 pasos (plantilla, nómina, campos, revisión, firma).
import { create } from 'zustand';
import { flujoService } from '../services/flujo.service';
import { reglasResueltas, unirColumnas, type TOps } from '../../utils/flujos';
import type { IColaMasiva } from '../interfaces/masiva.interface';
import type { IEjecucion, IModelo, INomina, IOpcionesFlujo, IReceta, IRevision, TRegla } from '../interfaces/flujo.interface';

type TResultado = { mensaje?: string; error?: string };
export interface IAsistenteFlujo {
  paso: number;
  receta: IReceta | null;
  modelId: string | null;
  modelo: IModelo | null;
  reglas: Record<string, TRegla>;
  nomina: INomina | null;
  revision: IRevision | null;
  nombre: string;
  opciones: IOpcionesFlujo;
  ejecucion: IEjecucion | null;
  soloLectura?: boolean; // se está viendo una ejecución anterior
}

interface IFlujoState {
  vista: 'home' | 'wizard';
  modelos: IModelo[];
  recetas: IReceta[];
  ejecuciones: IEjecucion[];
  cola: IColaMasiva;
  ops: TOps;
  w: IAsistenteFlujo | null;
  flujosRecargar: () => Promise<void>;
  flujosVerInicio: () => Promise<void>;
  flujosSetCola: (cola: IColaMasiva) => void;
  asistenteIniciar: (receta?: IReceta | null, paso?: number) => Promise<void>;
  asistenteVerEjecucion: (run: IEjecucion) => void;
  asistenteModelo: (id: string) => Promise<void>;
  asistenteIr: (paso: number) => void;
  asistenteNomina: (n: INomina) => void;
  asistenteRegla: (id: string, regla: TRegla | null) => void;
  asistenteRevisar: () => Promise<TResultado>;
  asistenteFijar: (c: Partial<IAsistenteFlujo>) => void;
  asistenteGuardar: () => Promise<IReceta | null | TResultado>;
  asistenteEjecutar: () => Promise<TResultado>;
  flujosSincronizarFirmas: () => Promise<void>;
  recetaBorrar: (id: string) => Promise<void>;
  ejecucionBorrar: (id: string) => Promise<void>;
}

// se puede ir a un paso si los anteriores están listos
export const puedeIr = (w: IAsistenteFlujo | null, s: number) => {
  if (!w) return false;
  if (s <= 1) return true;
  if (s === 2) return !!w.modelo;
  if (s === 3 || s === 4) return !!(w.modelo && w.nomina);
  if (s === 5) return !!(w.revision && w.revision.ok);
  return false;
};
export const pedido = (w: IAsistenteFlujo) => ({ modelId: w.modelId!, mapping: reglasResueltas(w.reglas, w.nomina!), nomina: w.nomina! });

export const useFlujoStore = create<IFlujoState>((set, get) => {
  const fijarW = (c: Partial<IAsistenteFlujo>) => set((s) => ({ w: s.w ? { ...s.w, ...c } : s.w }));
  return {
    vista: 'home', modelos: [], recetas: [], ejecuciones: [], cola: { items: [] }, ops: null, w: null,

    flujosRecargar: async () => {
      const [m, r, x, b] = await Promise.all([flujoService.modelos(), flujoService.recetas(), flujoService.ejecuciones(), flujoService.cola()]);
      set({ ...(m.ok ? { modelos: m.data } : {}), ...(r.ok ? { recetas: r.data } : {}), ...(x.ok ? { ejecuciones: x.data } : {}), ...(b.ok ? { cola: b.data } : {}) });
    },
    flujosVerInicio: async () => { await get().flujosRecargar(); set({ vista: 'home' }); },
    flujosSetCola: (cola) => set({ cola }),

    asistenteIniciar: async (receta, paso = 1) => {
      const w: IAsistenteFlujo = {
        paso: 1, receta: receta || null, modelId: receta?.modelId || null, modelo: null, reglas: receta ? JSON.parse(JSON.stringify(receta.mapping || {})) : {},
        nomina: null, revision: null, nombre: receta?.name || '', opciones: { protocolization: 'none', typeSign: 'simple', ...(receta?.opts || {}) }, ejecucion: null,
      };
      if (w.modelId) { const r = await flujoService.modelo(w.modelId); if (r.ok) w.modelo = r.data!; }
      w.paso = receta ? paso : 1; if (w.paso >= 3 && !w.nomina) w.paso = 2;
      set({ w, vista: 'wizard' });
    },
    asistenteVerEjecucion: (run) => set((s) => ({
      vista: 'wizard',
      w: { paso: 5, ejecucion: run, receta: s.recetas.find((x) => x.id === run.recipeId) || null, modelId: null, modelo: null, reglas: {}, nomina: null, revision: null, nombre: '', opciones: { protocolization: 'none', typeSign: 'simple' }, soloLectura: true },
    })),
    asistenteModelo: async (id) => {
      const w = get().w; if (!w) return;
      const r = await flujoService.modelo(id); if (!r.ok || !r.data) return;
      fijarW({ modelo: r.data, modelId: id, ...(w.modelId !== id ? { reglas: {}, revision: null } : {}), paso: 2 });
    },
    asistenteIr: (paso) => {
      const w = get().w; if (!puedeIr(w, paso)) return;
      // al entrar a «Campos» se unen las columnas que reconoce (también si cambió el modelo)
      fijarW(paso === 3 && w!.modelo && w!.nomina ? { paso, reglas: unirColumnas(w!.modelo, w!.nomina, w!.reglas) } : { paso });
    },
    asistenteNomina: (n) => { const w = get().w; if (!w?.modelo) return; fijarW({ nomina: n, revision: null, reglas: unirColumnas(w.modelo, n, w.reglas) }); },
    asistenteRegla: (id, regla) => {
      const w = get().w; if (!w) return; const reglas = { ...w.reglas };
      if (regla && regla.type !== 'empty') reglas[id] = regla; else delete reglas[id];
      fijarW({ reglas, revision: null });
    },
    asistenteRevisar: async () => {
      const w = get().w; if (!w) return {};
      const r = await flujoService.revisar(pedido(w)); if (!r.ok) return { error: r.error };
      fijarW({ revision: r.data! }); return {};
    },
    asistenteFijar: fijarW,
    asistenteGuardar: async () => {
      const w = get().w; if (!w) return null;
      const r = await flujoService.guardarReceta({ id: w.receta?.id, created: w.receta?.created, name: w.nombre, modelId: w.modelId!, mapping: w.reglas, opts: w.opciones });
      if (!r.ok) return { error: r.error };
      fijarW({ receta: r.data! }); return r.data!;
    },
    asistenteEjecutar: async () => {
      const rec = await get().asistenteGuardar(); if (!rec || 'error' in rec) return (rec as TResultado) || {};
      const w = get().w!; const r = await flujoService.ejecutar({ ...pedido(w), recipeId: (rec as IReceta).id, recipeName: (rec as IReceta).name });
      if (!r.ok) return { error: r.error };
      fijarW({ ejecucion: r.data! }); await get().flujosRecargar(); return {};
    },
    flujosSincronizarFirmas: async () => {
      const r = await flujoService.sincronizarOps();
      if (r.ok) set({ ops: r.data! }); else { const l = await flujoService.listarOps(); if (l.ok) set({ ops: l.data! }); }
    },
    recetaBorrar: async (id) => { await flujoService.borrarReceta(id); await get().flujosRecargar(); },
    ejecucionBorrar: async (id) => { const q = await flujoService.borrarEjecucion(id); if (q.ok) set({ ejecuciones: q.data! }); },
  };
});
