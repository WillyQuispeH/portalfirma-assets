// Estado del flujo «Publicar» (calidad del aviso → portales → publicar) de una propiedad.
// Lo inicia Publicaciones.publicar(propId, op, paso) en src/renderer/publicaciones.js, que monta la pantalla.
import { create } from 'zustand';
import { publicacionService } from '../services/publicacion.service';
import { propiedadService } from '../services/propiedad.service';
import type { IPropiedad } from '../interfaces/propiedad.interface';
import type {
  ICalidadAviso, IPortal, IResultadoPortalPublicar, TPaquetes, TPasoPublicar, TPubOperacion, TTipoAviso,
} from '../interfaces/publicacion.interface';

type TResultado = { mensaje?: string; error?: string };

// el aviso que la propiedad ya tiene en un portal (si sigue vigente): al publicar de nuevo, se actualiza
export function avisoVigente(p: IPropiedad | null, portal: string, op: TPubOperacion) {
  const a = p?.portales?.[portal]?.[op];
  return a && (portal !== 'pi' || a.itemId) && !['retirada', 'closed'].includes(a.status || '') ? a : null;
}

interface IPublicarState {
  propId: string;
  op: TPubOperacion;
  ops: TPubOperacion[];
  paso: TPasoPublicar;
  propiedad: IPropiedad | null;
  calidad: ICalidadAviso | null;
  catalogo: IPortal[] | null;
  paquetes: TPaquetes | null;
  sel: string[] | null; // portales marcados (null: aún sin elegir, se marcan los disponibles)
  tipoAviso: TTipoAviso;
  destacado: Record<string, boolean>;
  resultados: IResultadoPortalPublicar[] | null;
  publicando: boolean;
  error: string | null;
  publicarIniciar: (o: { propId: string; op: TPubOperacion; ops: TPubOperacion[]; paso: TPasoPublicar }) => Promise<void>;
  publicarSetOp: (op: TPubOperacion) => Promise<void>;
  publicarIr: (paso: TPasoPublicar) => Promise<void>;
  publicarCalidadGet: () => Promise<void>;
  publicarTextosGuardar: (t: { tituloPortal: string; descripcion: string }) => Promise<TResultado>;
  publicarRedactar: () => Promise<TResultado & { titulo?: string; descripcion?: string; destacados?: string[] }>;
  publicarMarcar: (portal: string, si: boolean) => void;
  publicarSetTipoAviso: (t: TTipoAviso) => void;
  publicarSetDestacado: (portal: string, si: boolean) => void;
  publicarEnviar: () => Promise<TResultado>;
}

export const usePublicarStore = create<IPublicarState>((set, get) => ({
  propId: '',
  op: 'venta',
  ops: [],
  paso: 1,
  propiedad: null,
  calidad: null,
  catalogo: null,
  paquetes: null,
  sel: null,
  tipoAviso: 'silver',
  destacado: {},
  resultados: null,
  publicando: false,
  error: null,

  publicarIniciar: async ({ propId, op, ops, paso }) => {
    set({ propId, op, ops, paso, propiedad: null, calidad: null, catalogo: null, sel: null, tipoAviso: 'silver', destacado: {}, resultados: null, publicando: false, error: null });
    await get().publicarIr(paso);
  },

  // al cambiar entre venta y arriendo se vuelve a calcular todo (la calidad y lo ya publicado dependen de la operación)
  publicarSetOp: async (op) => {
    set({ op, sel: null, resultados: null });
    await get().publicarIr(get().paso === 3 ? 2 : get().paso);
  },

  // cada paso se lee al entrar, así lo guardado en otra ventana (ficha, contacto) se ve al día
  publicarIr: async (paso) => {
    set({ paso, error: null, resultados: null });
    const { propId, op } = get();
    try {
      const [cartera, calidad] = await Promise.all([propiedadService.getAll(), publicacionService.getCalidad(propId, op)]);
      const propiedad = cartera.propiedades.find((x) => x.id === propId) || null;
      set({ propiedad, calidad });
      if (paso === 1) return;
      const [catalogo, paquetes] = await Promise.all([
        get().catalogo ? Promise.resolve(get().catalogo!) : publicacionService.getCatalogo(),
        get().paquetes ? Promise.resolve(get().paquetes) : publicacionService.getPaquetes().catch(() => null),
      ]);
      const sel = get().sel ?? catalogo.filter((x) => (x.listo || x.via === 'feed') && !avisoVigente(propiedad, x.id, op)).map((x) => x.id);
      set({ catalogo, paquetes, sel });
    } catch (e) { set({ error: (e as Error).message }); }
  },

  publicarCalidadGet: async () => {
    const { propId, op } = get();
    try { set({ calidad: await publicacionService.getCalidad(propId, op) }); } catch (e) { set({ error: (e as Error).message }); }
  },

  publicarTextosGuardar: async (t) => {
    try {
      const r = await publicacionService.setTextos(get().propId, t);
      await get().publicarCalidadGet();
      return { mensaje: ['Texto guardado.', ...(r.avisos || [])].join(' ') };
    } catch (e) { return { error: (e as Error).message }; }
  },

  publicarRedactar: async () => {
    const { propId, op } = get();
    try { return { ...(await publicacionService.redactar(propId, op)), mensaje: 'Listo: revisa el texto y guárdalo.' }; } catch (e) { return { error: (e as Error).message }; }
  },

  publicarMarcar: (portal, si) => {
    const sel = get().sel || [];
    set({ sel: si ? [...new Set([...sel, portal])] : sel.filter((x) => x !== portal) });
  },
  publicarSetTipoAviso: (tipoAviso) => set({ tipoAviso }),
  publicarSetDestacado: (portal, si) => set({ destacado: { ...get().destacado, [portal]: si } }),

  publicarEnviar: async () => {
    const { propId, op, sel, tipoAviso, destacado } = get();
    set({ publicando: true });
    try {
      const r = await publicacionService.publicar(propId, op, sel || [], { tipoAviso, destacado });
      set({ resultados: r.resultados });
      const n = r.resultados.filter((x) => x.ok).length;
      return n ? { mensaje: `Publicación enviada a ${n} ${n === 1 ? 'portal' : 'portales'}.` } : { error: 'No se pudo publicar.' };
    } catch (e) { return { error: (e as Error).message }; } finally { set({ publicando: false }); }
  },
}));
