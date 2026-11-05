// Reglas de detección (interno de Portalfirma): los casos que corrigieron los clientes, las propuestas de la IA
// y las reglas aprobadas. Cada acción devuelve { mensaje } o { error } para avisar con utils/app.ts (avisar).
import { create } from 'zustand';
import { reglaService } from '../services/regla.service';
import type { IReglaBase, IReglaCaso, IReglaContexto, IReglaPrueba, IReglas } from '../interfaces/regla.interface';

type TResultado = { mensaje?: string; error?: string };
const VACIAS: IReglas = { version: null, actos: [], materias: [], excepciones: [], propuestas: [] };

interface IReglaState {
  casos: IReglaCaso[];
  reglas: IReglas | null; // null mientras carga
  reglaCargar: () => Promise<void>;
  reglaProbar: (p: IReglaBase, patron: string) => Promise<IReglaPrueba | { error: string }>;
  reglaDecidir: (id: string, accion: 'aprobar' | 'descartar', patron?: string) => Promise<TResultado>;
  reglaActivar: (id: string, activo: boolean) => Promise<TResultado>;
  reglaEliminar: (id: string) => Promise<TResultado>;
  reglaBorrarCaso: (id: string) => Promise<void>;
  reglaProponer: (ctx: IReglaContexto) => Promise<TResultado>;
  reglaExportar: () => Promise<TResultado>;
}

export const useReglaStore = create<IReglaState>((set, get) => ({
  casos: [], reglas: null,
  reglaCargar: async () => {
    const [c, r] = await Promise.all([reglaService.casos(), reglaService.reglas()]);
    set({ casos: c.ok && c.data ? c.data : [], reglas: r.ok && r.data ? { ...VACIAS, ...r.data } : VACIAS });
  },
  reglaProbar: async (p, patron) => {
    const r = await reglaService.probar({ ...p, patron });
    return r.ok && r.data ? r.data : { error: r.error || 'No se pudo probar.' };
  },
  reglaDecidir: async (id, accion, patron) => {
    const r = await reglaService.decidir({ id, accion, patron });
    if (!r.ok || !r.data) return { error: r.error || 'No se pudo.' };
    set({ reglas: { ...VACIAS, ...r.data } });
    return { mensaje: accion === 'aprobar' ? 'Regla aprobada: ya se aplica en los trámites' : 'Propuesta descartada' };
  },
  reglaActivar: async (id, activo) => {
    const r = await reglaService.activar({ id, activo });
    if (!r.ok || !r.data) return { error: r.error || 'No se pudo.' };
    set({ reglas: { ...VACIAS, ...r.data } });
    return { mensaje: activo ? 'Regla activada' : 'Regla desactivada' };
  },
  reglaEliminar: async (id) => {
    const r = await reglaService.eliminar(id);
    if (!r.ok || !r.data) return { error: r.error || 'No se pudo.' };
    set({ reglas: { ...VACIAS, ...r.data } });
    return {};
  },
  reglaBorrarCaso: async (id) => { await reglaService.borrarCaso(id); await get().reglaCargar(); },
  reglaProponer: async (ctx) => {
    const r = await reglaService.proponer(ctx);
    if (!r.ok || !r.data) return { error: 'No se pudo: ' + (r.error || '') };
    const n = r.data.propuestas.length; const modelo = r.data.uso?.modelo;
    await get().reglaCargar();
    return { mensaje: `${n} ${n === 1 ? 'propuesta nueva' : 'propuestas nuevas'}${modelo ? ` · ${modelo}` : ''}` };
  },
  reglaExportar: async () => {
    const r = await reglaService.exportar();
    if (!r.ok) return { error: r.error || 'No se pudo exportar.' };
    return r.data ? { mensaje: 'Reglas exportadas' } : {};
  },
}));
