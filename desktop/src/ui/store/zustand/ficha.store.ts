// Estado de la ficha de la propiedad: la propiedad abierta, su historial, sus negocios, el avance de la captación,
// la conexión con Portal Inmobiliario y la pestaña elegida en cada ficha.
// La propiedad y las personas vienen de cartera.store (inmoListar trae todo junto): al recargar la ficha
// también se recarga la cartera, así la lista y la ficha muestran lo mismo.
import { create } from 'zustand';
import { propiedadService } from '../services/propiedad.service';
import { negocioService } from '../services/negocio.service';
import { useCarteraStore } from './cartera.store';
import { refrescarCarteraLegado } from '../../utils/app';
import type { IEstadoPortal, IPasosCaptacion, IRegistroActividad, TOperacion } from '../interfaces/propiedad.interface';
import type { INegocio } from '../interfaces/negocio.interface';

export type TFichaTab = 'resumen' | 'propietario' | 'negocios' | 'firmas' | 'portales' | 'historial';
export type TFiltroNegocios = 'abiertos' | 'cerrados' | 'todos';
type TResultado = { mensaje?: string; error?: string };

interface IFichaState {
  propId: string | null;
  cargado: boolean; // los datos de propId ya llegaron
  error: string | null;
  actividad: IRegistroActividad[];
  negocios: INegocio[]; // los de esta propiedad
  portal: IEstadoPortal | null;
  captacion: IPasosCaptacion | null;
  version: number; // sube en cada recarga: los bloques del código antiguo (Etapas) se vuelven a dibujar
  tabs: Record<string, TFichaTab>; // pestaña elegida en cada ficha (por id), como antes IM.fichaTab
  filtroNegocios: TFiltroNegocios | null;
  fichaGet: (id: string) => Promise<void>;
  fichaRecargar: () => Promise<void>;
  fichaSetTab: (id: string, tab: TFichaTab | 'captacion') => void;
  fichaSetFiltroNegocios: (f: TFiltroNegocios) => void;
  fichaSetEstado: (campo: 'estadoVenta' | 'estadoArriendo', valor: string) => Promise<TResultado>;
  fichaArchivar: (archivar: boolean) => Promise<TResultado>;
  fichaNota: (texto: string) => Promise<TResultado>;
  fichaVincular: (personaId: string, rol: string) => Promise<TResultado>;
  fichaDesvincular: (personaId: string, rol: string) => Promise<TResultado>;
  fichaSetCaptador: (corredorId: string | null) => Promise<TResultado>;
  fichaDocElegir: () => Promise<TResultado>;
  fichaDocQuitar: (docId: string) => Promise<TResultado>;
  fichaDocAbrir: (docId: string) => Promise<TResultado>;
  fichaDocCarpeta: () => Promise<TResultado>;
  fichaPdfAbrir: (ruta: string) => Promise<TResultado>;
  fichaAvisoEstado: (op: TOperacion, estado: 'paused' | 'active' | 'closed') => Promise<TResultado>;
  fichaAvisoActualizar: (op: TOperacion) => Promise<TResultado>;
}

let turno = 0; // descarta respuestas que llegan después de abrir otra ficha
const error = (e: unknown): TResultado => ({ error: (e as Error).message });

export const useFichaStore = create<IFichaState>((set, get) => {
  // después de un cambio: la ficha (y la cartera) desde el proceso principal, y IM.data del código antiguo
  const recargar = async () => { await Promise.all([get().fichaRecargar(), refrescarCarteraLegado()]); };
  const id = () => get().propId as string;

  return {
    propId: null,
    cargado: false,
    error: null,
    actividad: [],
    negocios: [],
    portal: null,
    captacion: null,
    version: 0,
    tabs: {},
    filtroNegocios: null,

    fichaGet: async (propId) => {
      const t = ++turno;
      // otra propiedad: se limpia lo anterior; la misma: se sigue viendo mientras se recarga
      if (get().propId !== propId) set({ propId, cargado: false, error: null, actividad: [], negocios: [], captacion: null, filtroNegocios: null });
      try {
        const [actividad, negocios, portal, captacion] = await Promise.all([
          propiedadService.getActividad(propId).catch(() => []),
          negocioService.getAll().then((r) => r.negocios.filter((n) => n.propId === propId)).catch(() => []),
          propiedadService.getPortal().catch(() => null),
          propiedadService.getPasosCaptacion(propId).catch(() => null),
          useCarteraStore.getState().carteraGetAll(),
        ]);
        if (t !== turno) return;
        const errCartera = useCarteraStore.getState().error;
        set((s) => ({ actividad, negocios, portal, captacion, cargado: true, error: errCartera, version: s.version + 1 }));
        // los interesados nuevos de los portales quedan vistos al abrir la ficha
        const p = useCarteraStore.getState().datos.propiedades.find((x) => x.id === propId);
        if ((p?.leads || []).some((l) => !l.visto)) propiedadService.leadsVistos(propId).catch(() => {});
      } catch (e) {
        if (t === turno) set({ error: (e as Error).message, cargado: true });
      }
    },

    fichaRecargar: async () => { const p = get().propId; if (p) await get().fichaGet(p); },

    fichaSetTab: (propId, tab) => set((s) => ({ tabs: { ...s.tabs, [propId]: tab === 'captacion' ? 'resumen' : tab } })),
    fichaSetFiltroNegocios: (f) => set((s) => ({ filtroNegocios: f, tabs: s.propId ? { ...s.tabs, [s.propId]: 'negocios' } : s.tabs })),

    fichaSetEstado: async (campo, valor) => {
      try { await propiedadService.guardar({ id: id(), [campo]: valor }); await recargar(); return { mensaje: 'Estado actualizado.' }; } catch (e) { return error(e); }
    },
    fichaArchivar: async (archivar) => {
      try { await propiedadService.archivar(id(), archivar); await recargar(); return { mensaje: archivar ? 'Propiedad archivada.' : 'Propiedad restaurada.' }; } catch (e) { return error(e); }
    },
    fichaNota: async (texto) => {
      try { const actividad = await propiedadService.nota(id(), texto); set({ actividad }); return {}; } catch (e) { return error(e); }
    },
    fichaVincular: async (personaId, rol) => {
      try { await propiedadService.vincular(id(), personaId, rol); await recargar(); return { mensaje: 'Persona vinculada.' }; } catch (e) { return error(e); }
    },
    fichaDesvincular: async (personaId, rol) => {
      try { await propiedadService.desvincular(id(), personaId, rol); await recargar(); return {}; } catch (e) { return error(e); }
    },
    fichaSetCaptador: async (corredorId) => {
      try {
        await propiedadService.setCaptadorUno(id(), corredorId); await recargar();
        return { mensaje: corredorId ? 'Captador asignado. Queda en el historial.' : 'La propiedad quedó sin captador.' };
      } catch (e) { return error(e); }
    },
    fichaDocElegir: async () => {
      try { const r = await propiedadService.docElegir(id()); if (!r) return {}; await recargar(); return { mensaje: 'Documento agregado.' }; } catch (e) { return error(e); }
    },
    fichaDocQuitar: async (docId) => {
      try { await propiedadService.docQuitar(id(), docId); await recargar(); return {}; } catch (e) { return error(e); }
    },
    fichaDocAbrir: async (docId) => { try { await propiedadService.docAbrir(id(), docId); return {}; } catch (e) { return error(e); } },
    fichaDocCarpeta: async () => { try { await propiedadService.docCarpeta(id()); return {}; } catch (e) { return error(e); } },
    fichaPdfAbrir: async (ruta) => { try { await propiedadService.pdfAbrir(ruta); return {}; } catch (e) { return error(e); } },

    fichaAvisoEstado: async (op, estado) => {
      try {
        await propiedadService.avisoEstado(id(), op, estado);
        return { mensaje: estado === 'closed' ? 'Aviso finalizado.' : estado === 'paused' ? 'Aviso pausado.' : 'Aviso reactivado.' };
      } catch (e) { return error(e); } finally { await recargar(); } // con error también: el aviso pudo cambiar en el portal
    },
    fichaAvisoActualizar: async (op) => {
      try { await propiedadService.avisoActualizar(id(), op); return { mensaje: 'Aviso actualizado en Portal Inmobiliario.' }; } catch (e) { return error(e); } finally { await recargar(); }
    },
  };
});
