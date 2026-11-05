// Estado de Mis operaciones: la lista (con su detalle traído en segundo plano), el filtro, la búsqueda,
// la operación elegida con su detalle, y si está sincronizando. El filtro y la elegida quedan al volver.
import { create } from 'zustand';
import { operacionService } from '../services/operacion.service';
import type { IDetalleOperacion, IOperacion } from '../interfaces/operacion.interface';

export type TFiltroOps = 'all' | 'pending' | 'signed' | 'notary' | 'action';

const STAGE: Record<string, [string, string]> = {
  finalized: ['Firmado', 'ok'], process: ['En firma', 'wait'], in_progress: ['En firma', 'wait'], starting: ['Iniciada', 'muted'],
  unPayed: ['Pendiente de pago', 'bad'], unData: ['Faltan datos', 'bad'], pending: ['Pendiente', 'wait'],
};
// [texto, clase] del estado de una operación
export function estadoOperacion(it: Partial<IOperacion>): [string, string] {
  const fin = it.stage === 'finalized' || it.status === 'finalized';
  if (fin && it.signers && (it.signed ?? 0) < it.signers) return ['Cerrada sin todas las firmas', 'muted'];
  if (fin && it.proc && it.proc !== 'none') return it.proc === 'legalization' ? ['Legalizado', 'legal'] : ['Protocolizado', 'proto'];
  return STAGE[it.stage || ''] || STAGE[it.status || ''] || [it.stage || '—', 'muted'];
}
export function grupoOperacion(it: IOperacion): Exclude<TFiltroOps, 'all'> {
  const [l] = estadoOperacion(it);
  if (l === 'Cerrada sin todas las firmas' || l === 'Pendiente de pago' || l === 'Faltan datos') return 'action';
  if (l === 'Firmado') return 'signed';
  if (l === 'Legalizado' || l === 'Protocolizado') return 'notary';
  return 'pending';
}
// lo que el detalle dice del avance (para la fila)
const avance = (d: IDetalleOperacion) => ({ status: d.status, proc: d.protocolizationNumber || 'none', signed: (d.signatories || []).filter((s) => s.signed).length, signers: (d.signatories || []).length });

interface IOperacionState {
  items: IOperacion[];
  lastSync: string | null;
  cuenta: string;
  filtro: TFiltroOps;
  q: string;
  sel: number | null;
  detalle: IDetalleOperacion | null;
  errorDetalle: string;
  sincronizando: boolean;
  prefetching: boolean;
  operacionesGetAll: () => Promise<boolean>;
  operacionesSincronizar: (callado?: boolean) => Promise<{ mensaje?: string; error?: string; sinTelefono?: boolean }>;
  operacionesCompletar: (visible: () => boolean) => Promise<void>;
  operacionElegir: (n: number, refrescar?: boolean) => Promise<void>;
  operacionesSetFiltro: (f: { filtro?: TFiltroOps; q?: string }) => void;
  operacionesSetCuenta: (cuenta: string) => void;
}

export const useOperacionStore = create<IOperacionState>((set, get) => ({
  items: [], lastSync: null, cuenta: '', filtro: 'all', q: '', sel: null, detalle: null, errorDetalle: '', sincronizando: false, prefetching: false,

  operacionesGetAll: async () => { const l = await operacionService.getAll(); if (l.ok && l.data) set({ items: l.data.items, lastSync: l.data.lastSync }); return !!l.ok; },

  operacionesSincronizar: async (callado) => {
    set({ sincronizando: true }); const r = await operacionService.sincronizar(); set({ sincronizando: false });
    if (!r.ok) return r.code === 'NO_PHONE' ? { sinTelefono: true } : callado ? {} : { error: 'No se pudo sincronizar: ' + r.error };
    set({ items: r.data!.items, lastSync: r.data!.lastSync });
    return !callado && r.data!.found != null ? { mensaje: `Sincronizado: ${r.data!.items.length} operación(es).` } : {};
  },

  // trae en segundo plano el detalle (de a 2) para saber si están legalizadas y cuántos firmaron;
  // las que siguen en firma se vuelven a mirar (antes quedaban «sin firmar» aunque ya hubieran firmado)
  operacionesCompletar: async (visible) => {
    if (get().prefetching) return; set({ prefetching: true });
    try {
      const l = get().items;
      const todo = [...l.filter((x) => x.status == null).slice(0, 150), ...l.filter((x) => x.status != null && x.status !== 'finalized' && x.stage !== 'finalized').slice(0, 40)].map((x) => x.operation);
      let i = 0;
      const trabajador = async () => {
        while (i < todo.length && visible()) {
          const n = todo[i++]; const r = await operacionService.getDetalle(n);
          if (r.ok && r.data) { const a = avance(r.data); set((s) => ({ items: s.items.map((x) => (x.operation === n ? { ...x, ...a } : x)) })); }
        }
      };
      await Promise.all([trabajador(), trabajador()]);
    } finally { set({ prefetching: false }); }
  },

  operacionElegir: async (n, refrescar) => {
    set({ sel: n, detalle: null, errorDetalle: '' });
    const r = await operacionService.getDetalle(n, refrescar);
    if (get().sel !== n) return; // se eligió otra mientras llegaba
    if (!r.ok || !r.data) return set({ errorDetalle: r.error || 'No se pudo leer la operación.' });
    const d = r.data; const a = avance(d);
    if (get().items.some((x) => x.operation === n)) set((s) => ({ items: s.items.map((x) => (x.operation === n ? { ...x, ...a } : x)) }));
    else await get().operacionesGetAll(); // una buscada por número que no estaba en la lista
    set({ detalle: d });
  },

  operacionesSetFiltro: (f) => set(f),
  operacionesSetCuenta: (cuenta) => set({ cuenta }),
}));
