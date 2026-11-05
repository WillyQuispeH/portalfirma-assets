// Estado de la agenda: filtros, eventos y acciones. Llama al service y guarda el resultado o el error.
// Los filtros quedan guardados aquí, así al volver a la pestaña se ve el mismo rango.
import { create } from 'zustand';
import { eventoService } from '../services/evento.service';
import type { IEvento, IEventoCambios, TEventoTipo } from '../interfaces/evento.interface';

export type TEventoRango = '14' | '31' | 'todo';

const iso = (d: Date) => d.toISOString().slice(0, 10); // igual que la agenda anterior (agISO)
let ultimaSincronizacion = 0;

interface IEventoState {
  eventos: IEvento[];
  rango: TEventoRango;
  tipo: TEventoTipo | '';
  cargado: boolean;
  cargando: boolean;
  error: string | null;
  eventoGetAll: () => Promise<void>;
  eventoSetRango: (rango: TEventoRango) => void;
  eventoSetTipo: (tipo: TEventoTipo | '') => void;
  eventoUpdate: (id: string, cambios: IEventoCambios) => Promise<string | null>; // null si salió bien; si no, el mensaje de error
  eventoSincronizar: () => void;
}

export const useEventoStore = create<IEventoState>((set, get) => ({
  eventos: [],
  rango: '14',
  tipo: '',
  cargado: false,
  cargando: false,
  error: null,

  eventoGetAll: async () => {
    const { rango, tipo } = get();
    set({ cargando: true, error: null });
    try {
      const todo = rango === 'todo';
      const l = await eventoService.getAll({
        desde: todo ? undefined : iso(new Date()),
        hasta: todo ? undefined : iso(new Date(Date.now() + Number(rango) * 864e5)),
        tipo: tipo || undefined,
      });
      // en un rango acotado no se muestran los cancelados
      set({ eventos: todo ? l : l.filter((e) => e.estado !== 'cancelado'), cargado: true, cargando: false });
    } catch (e) {
      set({ error: (e as Error).message, cargando: false });
    }
  },

  eventoSetRango: (rango) => { set({ rango }); get().eventoGetAll(); },
  eventoSetTipo: (tipo) => { set({ tipo }); get().eventoGetAll(); },

  eventoUpdate: async (id, cambios) => {
    try {
      await eventoService.update(id, cambios);
      await get().eventoGetAll();
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  },

  // como máximo una vez por minuto; las reservas nuevas llegan solas a la agenda
  eventoSincronizar: () => {
    if (Date.now() - ultimaSincronizacion < 60e3) return;
    ultimaSincronizacion = Date.now();
    eventoService.sincronizarReservas().catch(() => {});
  },
}));
