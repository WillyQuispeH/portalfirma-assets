// Estado de «La oficina»: los datos, a quién se eligió (o la sala / tu mesa), si está abierto «Te toca hoy»
// y la luz (mañana, tarde, noche). La elección queda al volver; la luz es una preferencia del menú de usuario
// (Apariencia › Luz de la oficina: automática según la hora, o fija), guardada en este equipo.
import { create } from 'zustand';
import { oficinaService } from '../services/oficina.service';
import type { IOficina, TMiembro } from '../interfaces/oficina.interface';

export type TLuz = 'dia' | 'tarde' | 'noche';
export type TSeleccion = TMiembro | 'sala' | 'yo' | null;
export type TLuzPref = 'auto' | TLuz;
const luzAuto = (): TLuz => { const h = new Date().getHours(); return h >= 7 && h < 17 ? 'dia' : h >= 17 && h < 20 ? 'tarde' : 'noche'; };
const CLAVE_LUZ = 'pfLuzOficina';
const leerLuz = (): TLuzPref => { try { const v = localStorage.getItem(CLAVE_LUZ); return v === 'dia' || v === 'tarde' || v === 'noche' ? v : 'auto'; } catch { return 'auto'; } };
const luzDe = (p: TLuzPref): TLuz => (p === 'auto' ? luzAuto() : p);

interface IOficinaState {
  datos: IOficina | null;
  nombre: string;
  error: string | null;
  sel: TSeleccion;
  toca: boolean;
  luz: TLuz;
  luzPref: TLuzPref;
  oficinaGetAll: () => Promise<void>;
  oficinaElegir: (sel: TSeleccion) => void; // elegir lo mismo otra vez lo cierra
  oficinaAlternarToca: () => void;
  oficinaSetLuz: (luz: TLuzPref) => void; // 'auto': según la hora
}

export const useOficinaStore = create<IOficinaState>((set, get) => ({
  datos: null,
  nombre: '',
  error: null,
  sel: null,
  toca: false,
  luz: luzDe(leerLuz()),
  luzPref: leerLuz(),

  oficinaGetAll: async () => {
    try { set({ datos: await oficinaService.getDatos(), error: null }); } catch (e) { return set({ error: (e as Error).message }); }
    if (!get().nombre) {
      const u = await oficinaService.getUsuario().catch(() => null);
      set({ nombre: String(u?.namePerson || '').split(' ')[0] || '' });
    }
  },
  oficinaElegir: (sel) => set((s) => { const nuevo = s.sel === sel ? null : sel; return { sel: nuevo, toca: nuevo ? false : s.toca }; }),
  oficinaAlternarToca: () => set((s) => ({ toca: !s.toca })),
  oficinaSetLuz: (pref) => { try { localStorage.setItem(CLAVE_LUZ, pref); } catch { /* sin almacenamiento: dura la sesión */ } set({ luzPref: pref, luz: luzDe(pref) }); },
}));
