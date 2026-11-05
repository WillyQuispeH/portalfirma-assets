// Estado del Asistente legal: el proveedor de IA (con o sin clave, consentimiento) y la billetera de tokens.
// Es la única copia: el panel del editor (src/renderer/asistente.js) la lee y la actualiza por window.__asistente.
import { create } from 'zustand';
import { asistenteService } from '../services/asistente.service';
import type { IAsistenteEstado, IBilletera } from '../interfaces/asistente.interface';

const SIN_ESTADO: IAsistenteEstado = { hasKey: false, providers: {} };
export const BILLETERA_VACIA: IBilletera = { balance: 0, costs: {}, pack: {} };

interface IAsistenteState {
  estado: IAsistenteEstado | null;
  billetera: IBilletera | null;
  asistenteEstado: (refrescar?: boolean) => Promise<IAsistenteEstado>;
  asistenteBilletera: (refrescar?: boolean) => Promise<IBilletera>;
  asistenteFijarEstado: (e: IAsistenteEstado) => void;
  asistenteFijarBilletera: (b: IBilletera) => void;
  asistenteConsentir: () => Promise<void>;
  asistenteCanjear: (codigo: string) => Promise<string | null>; // null si se activó; si no, el error
}

export const useAsistenteStore = create<IAsistenteState>((set, get) => ({
  estado: null, billetera: null,
  asistenteEstado: async (refrescar = false) => {
    const e = get().estado; if (e && !refrescar) return e;
    const r = await asistenteService.estado(); const n = r.ok && r.data ? r.data : SIN_ESTADO;
    set({ estado: n }); return n;
  },
  asistenteBilletera: async (refrescar = false) => {
    if (!get().billetera || refrescar) { const r = await asistenteService.billetera(); if (r.ok && r.data) set({ billetera: r.data }); }
    return get().billetera || BILLETERA_VACIA;
  },
  asistenteFijarEstado: (estado) => set({ estado }),
  asistenteFijarBilletera: (billetera) => set({ billetera }),
  asistenteConsentir: async () => { await asistenteService.configurar({ consent: true }); await get().asistenteEstado(true); },
  asistenteCanjear: async (codigo) => {
    const r = await asistenteService.canjear(codigo);
    if (!r.ok || !r.data) return r.error || 'No se pudo activar el código.';
    set({ billetera: r.data }); return null;
  },
}));
