// Estado de Postventa: la pestaña, el tablero y la configuración (para el encabezado), la lista de reclamos con
// sus conversaciones en curso, el elegido ('chat:<id>' si es una conversación) y los datos de cada pestaña.
// La pestaña, el filtro, la búsqueda y el elegido quedan guardados al volver.
import { create } from 'zustand';
import { postventaService } from '../services/postventa.service';
import type {
  IPvChat, IPvConfig, IPvContratista, IPvPersona, IPvProyecto, IPvReclamo, IPvTablero, IPvUnidad, TPvFiltro, TPvTab,
} from '../interfaces/postventa.interface';

type TResultado = { mensaje?: string; error?: string };
let consultaReclamos = 0; // si llegan respuestas fuera de orden (al buscar), vale solo la última

interface IPostventaState {
  tab: TPvTab;
  filtro: TPvFiltro;
  q: string;
  sel: string | null;
  tablero: IPvTablero | null;
  config: IPvConfig | null;
  reclamos: IPvReclamo[] | null;
  chats: IPvChat[];
  proyectos: IPvProyecto[] | null;
  unidades: IPvUnidad[];
  contratistas: IPvContratista[] | null;
  error: string | null;
  pvAbrir: (o?: { tab?: TPvTab; sel?: string | null; filtro?: TPvFiltro }) => Promise<void>;
  pvSetTab: (tab: TPvTab) => void;
  reclamosGetAll: () => Promise<void>;
  reclamosSetFiltro: (f: { filtro?: TPvFiltro; q?: string }) => void;
  pvSeleccionar: (sel: string | null) => void;
  unidadesGetAll: () => Promise<void>;
  contratistasGetAll: () => Promise<void>;
  unidadesPlantilla: () => Promise<TResultado>;
  unidadesImportar: () => Promise<TResultado>;
  waGuardarClave: (token: string, locationId: string) => Promise<TResultado>;
  waQuitarClave: () => Promise<TResultado>;
  waSetAuto: (auto: boolean) => Promise<TResultado>;
  waRevisar: () => Promise<TResultado>;
  asistenteGuardar: (p: IPvPersona) => Promise<TResultado>;
}

const fallo = (e: unknown) => ({ error: (e as Error).message });

export const usePostventaStore = create<IPostventaState>((set, get) => ({
  tab: 'reclamos',
  filtro: 'abiertos',
  q: '',
  sel: null,
  tablero: null,
  config: null,
  reclamos: null,
  chats: [],
  proyectos: null,
  unidades: [],
  contratistas: null,
  error: null,

  // el encabezado siempre; luego los datos de la pestaña
  pvAbrir: async (o = {}) => {
    if (o.tab) set({ tab: o.tab });
    if (o.filtro) set({ filtro: o.filtro });
    if (o.sel !== undefined) set({ sel: o.sel });
    const [tablero, config] = await Promise.all([postventaService.getTablero().catch(() => null), postventaService.getConfig().catch(() => null)]);
    set({ tablero, config });
    const t = get().tab;
    if (t === 'reclamos') await get().reclamosGetAll();
    if (t === 'unidades') await get().unidadesGetAll();
    if (t === 'contratistas') await get().contratistasGetAll();
    if (t === 'whatsapp') set({ chats: await postventaService.getChats().catch(() => []) });
  },

  pvSetTab: (tab) => { set({ tab }); get().pvAbrir(); },

  // los reclamos y las conversaciones en curso; si no hay elegido, el primer reclamo (o la primera conversación)
  reclamosGetAll: async () => {
    const { filtro, q } = get(); const n = ++consultaReclamos;
    try {
      const [reclamos, chats] = await Promise.all([
        postventaService.getReclamos({ estado: filtro === 'todos' ? undefined : filtro, q }),
        postventaService.getChats().catch(() => [] as IPvChat[]),
      ]);
      if (n !== consultaReclamos) return;
      const enCurso = chats.filter((c) => c.enCurso);
      // como antes: el reclamo elegido se sigue mostrando aunque ya no esté en la lista (p. ej. recién cerrado);
      // solo una conversación que terminó (ya es reclamo) deja paso al primero
      let sel = get().sel;
      if (sel?.startsWith('chat:') && !enCurso.some((c) => 'chat:' + c.id === sel)) sel = reclamos[0]?.id || null;
      if (!sel) sel = reclamos[0]?.id || (enCurso[0] ? 'chat:' + enCurso[0].id : null);
      set({ reclamos, chats, sel, error: null });
    } catch (e) {
      if (n === consultaReclamos) set({ error: (e as Error).message });
    }
  },
  reclamosSetFiltro: (f) => { set({ ...f, ...(f.filtro ? { sel: null } : {}) }); get().reclamosGetAll(); },
  pvSeleccionar: (sel) => set({ sel }),

  unidadesGetAll: async () => {
    try {
      const [proyectos, unidades] = await Promise.all([postventaService.getProyectos(), postventaService.getUnidades()]);
      set({ proyectos, unidades, error: null });
    } catch (e) { set({ error: (e as Error).message }); }
  },
  contratistasGetAll: async () => {
    try { set({ contratistas: await postventaService.getContratistas(), error: null }); } catch (e) { set({ error: (e as Error).message }); }
  },

  unidadesPlantilla: async () => {
    try { return (await postventaService.guardarPlantilla()) ? { mensaje: 'Plantilla guardada.' } : {}; } catch (e) { return fallo(e); }
  },
  unidadesImportar: async () => {
    try {
      const r = await postventaService.importarUnidades(); if (!r) return {};
      await get().pvAbrir();
      return { mensaje: `${r.nuevas} unidades nuevas, ${r.actualizadas} actualizadas.${r.omitidas ? ' Se omitió la fila de ejemplo.' : ''}${r.errores.length ? ` ${r.errores.length} filas con errores: ${r.errores.slice(0, 2).join(' ')}` : ''}` };
    } catch (e) { return fallo(e); }
  },

  waGuardarClave: async (token, locationId) => {
    try { await postventaService.setClaveWa({ token, locationId }); await get().pvAbrir(); return { mensaje: 'Clave de WhatsApp guardada y probada.' }; } catch (e) { return fallo(e); }
  },
  waQuitarClave: async () => {
    try { await postventaService.setClaveWa({ token: '' }); await get().pvAbrir(); return { mensaje: 'Clave de postventa quitada.' }; } catch (e) { return fallo(e); }
  },
  waSetAuto: async (auto) => {
    try { await postventaService.configurar({ auto }); await get().pvAbrir(); return { mensaje: auto ? 'WhatsApp atendiendo la postventa.' : 'Respuesta automática en pausa.' }; } catch (e) { return fallo(e); }
  },
  waRevisar: async () => {
    try {
      const r = await postventaService.revisar(); await get().pvAbrir();
      return { mensaje: `${r.procesados} mensajes nuevos, ${r.enviados} respuestas${r.nuevos?.length ? `, ${r.nuevos.length} reclamos nuevos` : ''}.` };
    } catch (e) { return fallo(e); }
  },

  asistenteGuardar: async (persona) => {
    try { await postventaService.configurar({ persona }); set({ config: await postventaService.getConfig() }); return { mensaje: 'Listo: el asistente ya habla así con los propietarios.' }; } catch (e) { return fallo(e); }
  },
}));
