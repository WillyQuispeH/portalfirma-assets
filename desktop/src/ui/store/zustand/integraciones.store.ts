// Estado de la pantalla Integraciones: lo último que se supo de cada servicio y cuál se está conectando.
import { create } from 'zustand';
import { integracionesService as s } from '../services/integraciones.service';
import type { IIntegraciones } from '../interfaces/integraciones.interface';

type TClave = keyof IIntegraciones;

interface IIntegracionesState extends IIntegraciones {
  cargando: boolean;
  /** la integración con una acción en curso (conectar, desconectar…) */
  ocupado: string | null;
  integCargar: () => Promise<void>;
  /** corre una acción sobre una integración y vuelve a leer todo; devuelve el error, si hubo */
  integAccion: (id: string, accion: () => Promise<{ ok: boolean; error?: string }>) => Promise<string | null>;
}

const LECTURAS: [TClave, () => Promise<{ ok: boolean; data?: unknown }>][] = [
  ['wechatia', s.wechatia], ['canales', s.canales], ['ml', s.ml], ['drive', s.drive], ['maps', s.maps], ['ia', s.ia],
];

export const useIntegracionesStore = create<IIntegracionesState>((set, get) => ({
  wechatia: null, canales: null, ml: null, drive: null, maps: null, ia: null, cargando: false, ocupado: null,

  integCargar: async () => {
    set({ cargando: true });
    // cada una por su lado: si una falla (p. ej. el servidor no responde), las demás se ven igual
    const r = await Promise.all(LECTURAS.map(([, leer]) => leer().catch(() => ({ ok: false, data: undefined }))));
    set({ cargando: false, ...Object.fromEntries(LECTURAS.map(([k], i) => [k, r[i].ok ? r[i].data ?? null : null])) });
  },

  integAccion: async (id, accion) => {
    set({ ocupado: id });
    try {
      const r = await accion();
      return r.ok ? null : r.error || 'No se pudo completar.';
    } catch (e) {
      return (e as Error).message || 'No se pudo completar.';
    } finally {
      set({ ocupado: null });
      await get().integCargar();
    }
  },
}));
