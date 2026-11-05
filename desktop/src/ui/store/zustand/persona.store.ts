// Estado del detalle de una persona del CRM: su historial y los documentos que firma.
// Los datos de la persona y sus propiedades vienen de cartera.store (inmoListar trae todo junto).
// Los documentos se guardan por persona: también los usa la pestaña Propietario de la ficha.
import { create } from 'zustand';
import { personaService } from '../services/persona.service';
import { useCarteraStore } from './cartera.store';
import { refrescarCarteraLegado } from '../../utils/app';
import type { IDocumentoPersona, IPersona } from '../interfaces/persona.interface';
import type { IRegistroActividad } from '../interfaces/propiedad.interface';

type TResultado = { mensaje?: string; error?: string };

interface IPersonaState {
  personaId: string | null;
  cargado: boolean;
  actividad: IRegistroActividad[];
  documentos: Record<string, IDocumentoPersona[] | 'error'>; // por id de persona; sin clave: cargando
  personaGet: (id: string) => Promise<void>;
  personaDocumentosGet: (id: string) => Promise<void>;
  personaNota: (texto: string) => Promise<TResultado>;
  personaGuardar: (persona: IPersona, mensaje: string) => Promise<TResultado>;
  personaBorrar: () => Promise<TResultado>;
  personaPdfAbrir: (ruta: string) => Promise<TResultado>;
}

let turno = 0; // descarta respuestas que llegan después de abrir otra persona
const error = (e: unknown): TResultado => ({ error: (e as Error).message });

export const usePersonaStore = create<IPersonaState>((set, get) => ({
  personaId: null,
  cargado: false,
  actividad: [],
  documentos: {},

  personaGet: async (id) => {
    const t = ++turno;
    if (get().personaId !== id) set({ personaId: id, cargado: false, actividad: [] });
    const [actividad] = await Promise.all([
      personaService.getActividad(id).catch(() => []),
      useCarteraStore.getState().carteraGetAll(),
      get().personaDocumentosGet(id),
    ]);
    if (t === turno) set({ actividad, cargado: true });
  },

  personaDocumentosGet: async (id) => {
    try {
      const ds = await personaService.getDocumentos(id);
      set((s) => ({ documentos: { ...s.documentos, [id]: ds } }));
    } catch {
      set((s) => ({ documentos: { ...s.documentos, [id]: 'error' } }));
    }
  },

  personaNota: async (texto) => {
    const id = get().personaId; if (!id) return {};
    try { set({ actividad: await personaService.nota(id, texto) }); return {}; } catch (e) { return error(e); }
  },

  // p. ej. las notas sobre el propietario, desde la ficha de la propiedad
  personaGuardar: async (persona, mensaje) => {
    try {
      await personaService.guardar(persona);
      await Promise.all([useCarteraStore.getState().carteraGetAll(), refrescarCarteraLegado()]);
      return { mensaje };
    } catch (e) { return error(e); }
  },

  personaBorrar: async () => {
    const id = get().personaId; if (!id) return {};
    try { await personaService.borrar(id); await refrescarCarteraLegado(); return { mensaje: 'Persona eliminada.' }; } catch (e) { return error(e); }
  },

  personaPdfAbrir: async (ruta) => { try { await personaService.pdfAbrir(ruta); return {}; } catch (e) { return error(e); } },
}));
