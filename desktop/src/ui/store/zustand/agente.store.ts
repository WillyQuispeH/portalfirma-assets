// Estado del Agente: la conversación, los adjuntos, si está trabajando, si el chat está abierto, la
// conversación actual, el contexto (lo que muestra el lienzo) y la lista de conversaciones guardadas.
// La lógica (enviar, eventos, acciones) está en components/functional/agente/controlador.ts.
import { create } from 'zustand';
import type { IAdjunto, IAgenteItem, IConversacion, TContexto } from '../interfaces/agente.interface';

interface IAgenteState {
  items: IAgenteItem[];
  adjuntos: IAdjunto[];
  busy: boolean;
  abierto: boolean;
  modo: 'panel' | 'full';
  conv: { id: string; titulo?: string } | null;
  ctx: TContexto;
  convs: IConversacion[];
  q: string; // búsqueda de conversaciones
  nombre: string; // para el saludo del chat vacío
  fijar: (p: Partial<Omit<IAgenteState, 'fijar' | 'cambiarItems'>>) => void;
  cambiarItems: (f: (items: IAgenteItem[]) => IAgenteItem[]) => void;
}

export const useAgenteStore = create<IAgenteState>((set) => ({
  items: [],
  adjuntos: [],
  busy: false,
  abierto: false,
  modo: 'panel',
  conv: null,
  ctx: { tipo: 'inicio' },
  convs: [],
  q: '',
  nombre: '',
  fijar: (p) => set(p),
  cambiarItems: (f) => set((s) => ({ items: f(s.items) })),
}));
