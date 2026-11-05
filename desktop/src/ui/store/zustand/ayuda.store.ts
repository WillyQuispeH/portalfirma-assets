// Estado de la Ayuda: la pantalla actual, el panel (abierto, nivel elegido) y el recorrido guiado en curso.
// Qué recorridos ya se vieron queda en localStorage del equipo ('pf.tour.<pantalla>'), como antes.
import { create } from 'zustand';
import type { IPasoVisible, IRecorrido, TNivelAyuda } from '../interfaces/ayuda.interface';

interface IAyudaState {
  vista: string; // la pantalla que se está mostrando (la avisa show() de app.js)
  panelAbierto: boolean;
  nivel: TNivelAyuda | null; // el «?» de un nivel del inicio muestra solo sus guías
  apertura: number; // sube cada vez que se abre el panel: el buscador parte vacío
  recorrido: IRecorrido | null;
  ayudaVista: (vista: string) => void;
  ayudaAbrir: (nivel?: TNivelAyuda | null) => void;
  ayudaCerrar: () => void;
  ayudaRecorrido: (pantalla: string, pasos: IPasoVisible[]) => void;
  ayudaSiguiente: () => void;
  ayudaAnterior: () => void;
  ayudaTerminarRecorrido: () => void;
}

export const recorridoVisto = (pantalla: string) => { try { return localStorage.getItem('pf.tour.' + pantalla) === '1'; } catch { return true; } };
const marcarVisto = (pantalla: string) => { try { localStorage.setItem('pf.tour.' + pantalla, '1'); } catch { /* sin almacenamiento */ } };

export const useAyudaStore = create<IAyudaState>((set, get) => ({
  vista: 'home', panelAbierto: false, nivel: null, apertura: 0, recorrido: null,
  ayudaVista: (vista) => set({ vista, panelAbierto: false }),
  ayudaAbrir: (nivel = null) => set({ panelAbierto: true, nivel, apertura: get().apertura + 1, recorrido: null }),
  ayudaCerrar: () => set({ panelAbierto: false }),
  ayudaRecorrido: (pantalla, pasos) => { marcarVisto(pantalla); set({ recorrido: { pantalla, pasos, i: 0 } }); },
  ayudaSiguiente: () => {
    const r = get().recorrido; if (!r) return;
    set({ recorrido: r.i < r.pasos.length - 1 ? { ...r, i: r.i + 1 } : null }); // en el último paso, «Listo» termina
  },
  ayudaAnterior: () => { const r = get().recorrido; if (r) set({ recorrido: { ...r, i: Math.max(0, r.i - 1) } }); },
  ayudaTerminarRecorrido: () => set({ recorrido: null }),
}));
