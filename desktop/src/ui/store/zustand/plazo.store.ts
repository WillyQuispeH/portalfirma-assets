// Estado de Plazos y vencimientos: los documentos, el elegido, si está leyendo, los informes inteligentes en curso
// y el avance de «Traer de Portalfirma». Aquí está también el motor: leer el texto, el informe básico (reglas,
// automático y gratis) y el informe inteligente (IA, 1 token).
import { create } from 'zustand';
import { plazoService } from '../services/plazo.service';
import { textoDePdf } from '../../utils/pdf';
import { extraerPlazos, ia } from '../../utils/app';
import { PEDIDO, fechaClaveDoc } from '../../utils/plazos';
import type { IAgregadosPlazos, IAnalisisPlazo, IDocPlazo } from '../interfaces/plazo.interface';

const ESCANEO = 'No tiene texto legible (¿es un escaneo?). Ábrelo en el editor y usa «Reconocer texto».';
type TResultado = { mensaje?: string; error?: string };

async function textoDe(id: string) {
  const r = await plazoService.bytes(id); if (!r.ok) throw new Error(r.error);
  const t = await textoDePdf(r.data!); if (t.replace(/\s/g, '').length < 80) throw new Error(ESCANEO);
  return t;
}

interface IPlazoState {
  items: IDocPlazo[];
  sel: string | null;
  leyendo: boolean;
  inteligentes: string[]; // ids con informe inteligente en preparación
  trayendo: string; // texto del botón «Traer de Portalfirma» mientras trabaja ('' = libre)
  plazosGetAll: () => Promise<void>;
  plazosAplicar: (r: { ok: boolean; data?: IAgregadosPlazos; error?: string } | null) => TResultado;
  plazoElegir: (id: string | null) => void;
  plazoLeer: (id: string) => Promise<void>;
  plazosLeerTodos: () => Promise<void>;
  plazoInteligente: (id: string) => Promise<TResultado>;
  plazoActualizar: (id: string, cambios: Record<string, unknown>) => Promise<void>;
  plazoQuitar: (id: string) => Promise<void>;
  plazosSetTrayendo: (t: string) => void;
  plazosTraer: () => Promise<TResultado & { sinAcceso?: boolean; fallas?: string[]; agregados?: number }>;
}

export const usePlazoStore = create<IPlazoState>((set, get) => ({
  items: [], sel: null, leyendo: false, inteligentes: [], trayendo: '',

  plazosGetAll: async () => { const r = await plazoService.getAll(); if (r.ok) set({ items: r.data || [] }); get().plazosLeerTodos(); },

  // después de agregar (desde el computador, Drive, un expediente o Portalfirma)
  plazosAplicar: (r) => {
    if (!r) return {};
    if (!r.ok) return { error: r.error };
    set({ items: r.data!.items });
    if (r.data!.added) get().plazosLeerTodos();
    return r.data!.skipped?.length ? { error: `Omitidos: ${r.data!.skipped.join(' · ')}` } : {};
  },

  // al elegirlo se lee solo, si todavía no se leyó
  plazoElegir: (id) => { set({ sel: id }); const it = get().items.find((x) => x.id === id); if (it && it.status === 'pending' && !get().leyendo) get().plazoLeer(it.id); },

  // informe básico (sin IA): reglas sobre el texto del documento
  plazoLeer: async (id) => {
    const it = get().items.find((x) => x.id === id); if (!it) return;
    set((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, status: 'reading' } : x)) }));
    let cambios: Record<string, unknown>;
    try {
      const l = extraerPlazos(await textoDe(id));
      const basic: IAnalisisPlazo = { tipo: l[0]?.tipo || 'Documento', contratos: l, fuente: 'reglas' };
      const k = fechaClaveDoc(it.analysis || basic);
      cambios = { status: 'done', basic, deadline: k.deadline || null, deadlineLabel: k.label, end: k.end || null, error: '' };
    } catch (e) { cambios = { status: 'error', error: (e as Error).message }; }
    await get().plazoActualizar(id, cambios);
  },
  plazosLeerTodos: async () => {
    if (get().leyendo) return; set({ leyendo: true });
    try {
      let it: IDocPlazo | undefined;
      while ((it = get().items.find((x) => x.status === 'pending' || (x.status === 'done' && !x.basic && !x.analysis)))) await get().plazoLeer(it.id);
    } finally { set({ leyendo: false }); }
  },

  // informe inteligente (IA, 1 token, opcional)
  plazoInteligente: async (id) => {
    const it = get().items.find((x) => x.id === id); if (!it || get().inteligentes.includes(id)) return {};
    if (!(await ia.consentimiento())) return {};
    set((s) => ({ inteligentes: [...s.inteligentes, id] }));
    try {
      const texto = await textoDe(id);
      const a = ia.leerJson(await ia.preguntar({ action: 'plazo', json: true, system: ia.sistema(), messages: [{ role: 'user', content: PEDIDO(it.name, texto, it.basic) }] })) as IAnalisisPlazo;
      if (!Array.isArray(a.contratos) || !a.contratos.length) { const { acciones: _a, resumen: _r, tipo: _t, ...c } = a; a.contratos = [c]; }
      const k = fechaClaveDoc(a);
      await get().plazoActualizar(id, { status: 'done', analysis: a, smartAt: new Date().toISOString(), deadline: k.deadline || null, deadlineLabel: k.label, end: k.end || null, summary: a.resumen || '', error: '' });
      return {};
    } catch (e) { return (e as { silent?: boolean }).silent ? {} : { error: (e as Error).message }; } // sin tokens o sin sesión: el aviso ya se mostró
    finally { set((s) => ({ inteligentes: s.inteligentes.filter((x) => x !== id) })); }
  },

  plazoActualizar: async (id, cambios) => { const r = await plazoService.actualizar(id, cambios); if (r.ok) set({ items: r.data || [] }); },
  plazoQuitar: async (id) => { const r = await plazoService.quitar(id); if (r.ok) set({ items: r.data || [], sel: null }); },
  plazosSetTrayendo: (trayendo) => set({ trayendo }),

  // trae los contratos firmados de Mis operaciones (la versión firmada de cada operación finalizada)
  plazosTraer: async () => {
    const st = (await plazoService.cuenta()).data;
    if (!st?.phone && !st?.api) return { error: 'Primero abre «Mis operaciones» para conectar tu cuenta de Portalfirma.' };
    set({ trayendo: 'Sincronizando…' });
    try {
      const s = await plazoService.sincronizarOps(); const l = s.ok ? s.data : (await plazoService.listarOps()).data;
      const ya = new Set(get().items.map((x) => String(x.op || '')));
      const fin = (l?.items || []).filter((x) => (x.stage === 'finalized' || x.status === 'finalized') && !ya.has(String(x.operation)) && !(x.signers && (x.signed ?? 0) < x.signers));
      if (!fin.length) return { mensaje: 'No hay contratos firmados nuevos en Portalfirma.' };
      const rutas: { op: number; path: string }[] = []; const fallas: string[] = []; let i = 0;
      for (const it of fin) {
        set({ trayendo: `Descargando ${++i} de ${fin.length}…` });
        const f = await plazoService.archivoOp(it.operation); // servicio oficial getById
        if (!f.ok) { if (f.code === 'NO_FILE_KEY') return { sinAcceso: true }; fallas.push(`${it.operation}: ${f.error}`); continue; }
        rutas.push({ op: it.operation, path: f.data!.path });
      }
      if (rutas.length) {
        const r = await plazoService.agregar(rutas.map((x) => x.path));
        if (r.ok) for (const x of r.data!.items) { const m = rutas.find((p) => x.name && p.path.endsWith(x.name)); if (m && !x.op) await plazoService.actualizar(x.id, { op: m.op }); }
        await get().plazosGetAll();
      }
      return fallas.length ? { fallas, agregados: rutas.length } : {};
    } finally { set({ trayendo: '' }); }
  },
}));
