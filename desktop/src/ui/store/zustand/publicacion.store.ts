// Estado de Publicaciones: la pestaña elegida, el panel de avisos, la bandeja de interesados (con su filtro)
// y los portales. La pestaña y los filtros quedan guardados aquí, así al volver se ve lo mismo.
import { create } from 'zustand';
import { publicacionService } from '../services/publicacion.service';
import { abrirUrl } from '../../utils/app';
import type { IInteresados, IPanelPublicaciones, IPortales, TInteresadoEstado, TPubTab } from '../interfaces/publicacion.interface';

type TResultado = { mensaje?: string; error?: string };
let consultaInteresados = 0; // si llegan respuestas fuera de orden (al buscar), vale solo la última

interface IPublicacionState {
  tab: TPubTab;
  filtro: TInteresadoEstado | ''; // '' = todos
  q: string;
  panel: IPanelPublicaciones | null;
  nuevos: number; // interesados nuevos (para la pestaña)
  interesados: IInteresados | null;
  portales: IPortales | null;
  error: string | null;
  sincronizando: boolean;
  publicacionAbrir: (tab?: TPubTab) => Promise<void>;
  publicacionSetTab: (tab: TPubTab) => void;
  interesadosGetAll: () => Promise<void>;
  interesadosSetFiltro: (f: { filtro?: TInteresadoEstado | ''; q?: string }) => void;
  interesadoSetEstado: (propId: string, leadId: string, estado: TInteresadoEstado) => Promise<TResultado>;
  interesadoResponder: (propId: string, leadId: string, canal: 'wa' | 'mail', codigo: string) => Promise<TResultado>;
  portalesGetAll: () => Promise<void>;
  portalGuardar: (id: string, nombre: string, cambios: { activo: boolean; feedUrl: string; token?: string }) => Promise<TResultado>;
  portalExportarFeed: (id: string) => Promise<TResultado>;
  publicacionSincronizar: () => Promise<TResultado>;
}

export const usePublicacionStore = create<IPublicacionState>((set, get) => ({
  tab: 'avisos',
  filtro: 'nuevo',
  q: '',
  panel: null,
  nuevos: 0,
  interesados: null,
  portales: null,
  error: null,
  sincronizando: false,

  // el panel y la cuenta de nuevos siempre (para las pestañas); el resto según la pestaña
  publicacionAbrir: async (tab) => {
    if (tab) set({ tab });
    set({ error: null });
    try {
      const [panel, todos] = await Promise.all([publicacionService.getPanel(), publicacionService.getInteresados({})]);
      set({ panel, nuevos: todos.cuenta.nuevo || 0 });
    } catch (e) {
      return set({ error: (e as Error).message });
    }
    const t = get().tab;
    if (t === 'interesados') await get().interesadosGetAll();
    if (t === 'portales') await get().portalesGetAll();
  },

  publicacionSetTab: (tab) => {
    set({ tab });
    if (tab === 'interesados') get().interesadosGetAll();
    if (tab === 'portales') get().portalesGetAll();
    if (tab === 'avisos') get().publicacionAbrir();
  },

  interesadosGetAll: async () => {
    const { filtro, q } = get(); const n = ++consultaInteresados;
    try {
      const r = await publicacionService.getInteresados({ estado: filtro || undefined, q: q || undefined });
      if (n === consultaInteresados) set({ interesados: r, error: null });
    } catch (e) {
      if (n === consultaInteresados) set({ error: (e as Error).message });
    }
  },
  interesadosSetFiltro: (f) => { set(f); get().interesadosGetAll(); },

  interesadoSetEstado: async (propId, leadId, estado) => {
    try {
      await publicacionService.setInteresado(propId, leadId, { estado });
      await get().publicacionAbrir();
      return { mensaje: 'Estado actualizado.' };
    } catch (e) { return { error: (e as Error).message }; }
  },

  // abre WhatsApp o el correo con la respuesta lista, y deja al interesado como contactado
  interesadoResponder: async (propId, leadId, canal, codigo) => {
    try {
      const x = await publicacionService.getRespuesta(propId, leadId);
      if (canal === 'wa' && x.whatsapp) abrirUrl(x.whatsapp);
      else if (x.email) abrirUrl(`mailto:${x.email}?subject=${encodeURIComponent('Consulta por ' + codigo)}&body=${encodeURIComponent(x.texto)}`);
      await publicacionService.setInteresado(propId, leadId, { contactado: true });
      await get().publicacionAbrir();
      return { mensaje: 'Se abrió la respuesta lista para enviar.' };
    } catch (e) { return { error: (e as Error).message }; }
  },

  portalesGetAll: async () => {
    try {
      const [catalogo, est] = await Promise.all([publicacionService.getCatalogo(), publicacionService.getContacto().catch(() => null)]);
      const feeds: Record<string, number> = {};
      for (const x of catalogo.filter((y) => y.via !== 'api')) feeds[x.id] = (await publicacionService.getFeed(x.id)).avisos;
      set({ portales: { catalogo, contacto: est?.contacto || {}, feeds }, error: null });
    } catch (e) { set({ error: (e as Error).message }); }
  },

  portalGuardar: async (id, nombre, cambios) => {
    try {
      await publicacionService.setPortal(id, cambios);
      await get().portalesGetAll();
      return { mensaje: `${nombre}: guardado.` };
    } catch (e) { return { error: (e as Error).message }; }
  },

  portalExportarFeed: async (id) => {
    try {
      const r = await publicacionService.exportarFeed(id);
      return r ? { mensaje: `Feed guardado (${r.avisos} avisos): ${r.ruta}` } : {}; // null: se canceló el diálogo
    } catch (e) { return { error: (e as Error).message }; }
  },

  publicacionSincronizar: async () => {
    set({ sincronizando: true });
    try {
      const r = await publicacionService.sincronizar();
      await get().publicacionAbrir();
      return {
        mensaje: ['Portales actualizados.',
          ...(r.chilepropiedades?.leads ? [`${r.chilepropiedades.leads} interesados nuevos de Chilepropiedades.`] : []),
          ...(r.pi?.leads ? [`${r.pi.leads} interesados nuevos de Portal Inmobiliario.`] : []),
          ...r.errores].join(' '),
      };
    } catch (e) { return { error: (e as Error).message }; } finally { set({ sincronizando: false }); }
  },
}));
