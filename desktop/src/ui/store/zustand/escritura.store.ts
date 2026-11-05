// Estado de Firmas presenciales: los trámites enviados y el trámite en preparación (documento, revisión,
// notaría, contactos y vista previa). Se conserva al salir y volver a la pantalla.
// Los nombres de los campos son los del módulo antiguo: las pruebas los leen por window.Escrituras._s.
import { create } from 'zustand';
import { escrituraService } from '../services/escritura.service';
import { analizarMinuta, analizarPrivados, bloquesEscritura, bloquesReduccion, casoParaReglas, clavePrevia, corregirTodo, datosCaratula, esPrivado, fichaTramite, motor, notariaDatos } from '../../utils/escrituras';
import { caratulaPdf, escrituraPdf, hojasComoImagen, imagenAPdf, paginasDePdf } from '../../utils/escrituras-pdf';
import type { IActoAgregado, IArchivoNotarial, ICotizacion, IDatosPrivado, IDocPrivado, IEscrituraDatos, IMinutaOpciones, INotariaRed, ITramiteEnviado, TNotariaElegida, TPasoEscritura, TTramite, TVistaVisor } from '../interfaces/escritura.interface';

const vacio = (): Omit<IEscrituraDatos, 'sel' | 'tramite' | 'paso'> => ({
  vista: 'notaria', raw: '', name: '', orig: null, a: null, o: null, materia: null, sug: [], descartados: new Set(), agregados: [],
  contactos: {}, proto: { docs: [], info: null, d: null }, red: null, redCuerpo: null, notaria: null, hojasEsc: 0,
});

export type TResultadoPago = { ok: true; cotizacion: boolean } | { ok: false; codigo?: string; error: string };

interface IEscrituraState extends IEscrituraDatos {
  ops: ITramiteEnviado[];
  q: string;
  redNot: INotariaRed[];
  mock: boolean;
  preparado: boolean; // tarifas, reglas y red de notarías cargadas
  ocupado: string; // lectura en curso («Leyendo … con IA: hojas 1 a 3…»)
  enviando: boolean;
  escrituraPreparar: () => Promise<void>;
  escrituraListar: () => Promise<void>;
  escrituraRecargarReglas: () => Promise<void>;
  escrituraElegir: (tramite: TTramite | null) => void; // reinicia el trámite en preparación
  escrituraSel: (sel: string) => void;
  escrituraBuscar: (q: string) => void;
  escrituraIrA: (paso: TPasoEscritura) => void;
  escrituraVista: (v: TVistaVisor) => void;
  escrituraMinuta: (f: IArchivoNotarial) => string | null;
  escrituraLeerPrivados: (archivos: IArchivoNotarial[]) => Promise<string[]>;
  escrituraQuitarDoc: (i: number) => void;
  escrituraCambiarDocumento: () => void;
  escrituraMateria: (v: string) => void;
  escrituraActo: (codigo: string, cobrar: boolean) => void;
  escrituraAgregarActo: (x: IActoAgregado) => void;
  escrituraQuitarAgregado: (i: number) => void;
  escrituraCorregir: (fix: unknown) => void;
  escrituraCorregirTodo: () => void;
  escrituraEditarTexto: (o: { titulo: string; convertir: boolean; cierre: boolean; raw: string }) => void;
  escrituraEditarReduccion: (cuerpo: string | null) => void;
  escrituraContacto: (nombre: string, campo: 'email' | 'tel', valor: string) => void;
  escrituraDato: (k: keyof IDatosPrivado, v: string | boolean) => void;
  escrituraNotaria: (n: TNotariaElegida) => void;
  escrituraVistaPrevia: () => Promise<Uint8Array>;
  escrituraIniciar: (q: ICotizacion) => Promise<TResultadoPago>;
  escrituraSaldo: () => Promise<number>;
}

// La vista previa se guarda fuera del estado (son bytes y no se dibujan): se rehace cuando cambia su clave
let previa: { clave: string; bytes: Uint8Array } | null = null;

export const useEscrituraStore = create<IEscrituraState>((set, get) => ({
  sel: 'draft', tramite: null, paso: 'tramite', ...vacio(),
  ops: [], q: '', redNot: [], mock: false, preparado: false, ocupado: '', enviando: false,

  escrituraPreparar: async () => {
    if (get().preparado) return;
    set({ preparado: true });
    const { MT } = motor();
    const t = await escrituraService.tarifas(); if (t.ok && t.data) MT.setTarifas(t.data);
    await get().escrituraRecargarReglas();
    const pr = await escrituraService.preferencias(); const rr = await escrituraService.red();
    set({ mock: !!(pr.ok && pr.data?.mock), redNot: rr.ok ? rr.data || [] : [] });
  },
  escrituraListar: async () => { const r = await escrituraService.listar(); set({ ops: r.ok ? r.data || [] : [] }); },
  escrituraRecargarReglas: async () => { const g = await escrituraService.reglas(); if (g.ok && g.data) motor().MT.setReglas(g.data); },
  escrituraElegir: (tramite) => { previa = null; set({ ...vacio(), tramite, paso: tramite ? 'doc' : 'tramite', sel: 'draft' }); },
  escrituraSel: (sel) => set({ sel }),
  escrituraBuscar: (q) => set({ q }),
  escrituraIrA: (paso) => set({ paso, sel: 'draft' }),
  escrituraVista: (vista) => set({ vista }),

  // Escritura pública: la minuta en Word (el texto se lee con exactitud)
  escrituraMinuta: (f) => {
    const text = f.text || '';
    if (text.replace(/\s/g, '').length < 100) return 'El documento Word está vacío o casi no tiene texto.';
    const S = get();
    set({ ...analizarMinuta({ ...S, o: null }, text, true), orig: { name: f.name, path: f.path, bytes: f.raw, pdf: f.pdf }, name: f.name, paso: 'rev', sel: 'draft' });
    return null;
  },
  // Protocolización y reducción: Word exacto o, si no hay Word, PDF/foto/escaneo leído con IA (incluido en el valor)
  escrituraLeerPrivados: async (archivos) => {
    const errores: string[] = []; const docs = [...get().proto.docs];
    for (const f of archivos) {
      try { set({ ocupado: `Leyendo «${f.name}»…` }); docs.push(await leer(f, (m) => set({ ocupado: m }))); } catch (e) { errores.push(`No se pudo leer «${f.name}»: ${(e as Error).message || e}`); }
    }
    set({ ocupado: '' });
    if (docs.length > get().proto.docs.length) set({ ...analizarPrivados(get(), docs), paso: 'rev', sel: 'draft' });
    return errores;
  },
  escrituraQuitarDoc: (i) => {
    const docs = get().proto.docs.filter((_, j) => j !== i);
    if (docs.length) set(analizarPrivados(get(), docs));
    else set((s) => ({ proto: { ...s.proto, docs }, red: null, redCuerpo: null }));
  },
  escrituraCambiarDocumento: () => set((s) => (esPrivado(s) ? { proto: { ...s.proto, docs: [] }, red: null, redCuerpo: null, paso: 'doc' } : { a: null, raw: '', paso: 'doc' })),

  escrituraMateria: (materia) => set({ materia }),
  escrituraActo: (codigo, cobrar) => set((s) => { const d = new Set(s.descartados); if (cobrar) d.delete(codigo); else d.add(codigo); return { descartados: d }; }),
  escrituraAgregarActo: (x) => set((s) => ({ agregados: [...s.agregados, x] })),
  escrituraQuitarAgregado: (i) => set((s) => ({ agregados: s.agregados.filter((_, j) => j !== i) })),
  escrituraCorregir: (fix) => { const S = get(); set(analizarMinuta(S, motor().N.applyFix(S.raw, fix), false)); },
  escrituraCorregirTodo: () => { const S = get(); set(analizarMinuta(S, corregirTodo(S.raw), false)); },
  escrituraEditarTexto: ({ titulo, convertir, cierre, raw }) => {
    const S = get(); const x = analizarMinuta(S, raw, false);
    const o: IMinutaOpciones = { ...x.o!, convertir, cierre };
    if (titulo && titulo !== o.titulo) { o.titulo = titulo; o._tp = true; }
    set({ ...x, o });
  },
  escrituraEditarReduccion: (cuerpo) => set((s) => ({ redCuerpo: cuerpo != null && cuerpo.trim() === String(s.red?.cuerpo || '').trim() ? null : cuerpo })),
  escrituraContacto: (nombre, campo, valor) => set((s) => ({ contactos: { ...s.contactos, [nombre]: { ...(s.contactos[nombre] || {}), [campo]: valor.trim() } } })),
  escrituraDato: (k, v) => set((s) => ({ proto: { ...s.proto, d: { ...s.proto.d!, [k]: v } } })),
  escrituraNotaria: (notaria) => set({ notaria }),

  escrituraVistaPrevia: async () => {
    const S = get(); const clave = clavePrevia(S);
    if (previa?.clave === clave) return previa.bytes;
    let bytes: Uint8Array;
    if (S.tramite === 'protocolizacion') bytes = await caratulaPdf(datosCaratula(S), S.proto.docs);
    else {
      const r = await escrituraPdf(S.tramite === 'reduccion' ? bloquesReduccion(S) : bloquesEscritura(S));
      bytes = r.bytes; if (get().hojasEsc !== r.pages) set({ hojasEsc: r.pages }); // las hojas cuentan para el precio
    }
    previa = { clave, bytes };
    return bytes;
  },

  escrituraIniciar: async (q) => {
    set({ enviando: true });
    try {
      const S = get();
      const caso = casoParaReglas(S); if (caso) escrituraService.caso(caso).catch(() => {});
      const files = await archivosDelTramite(S);
      const ficha = fichaTramite(S, q);
      files.push({ kind: 'ficha', name: 'Ficha del trámite.json', bytes: new TextEncoder().encode(JSON.stringify(ficha, null, 2)) });
      const r = await escrituraService.iniciar(ficha, files);
      if (!r.ok) return { ok: false, codigo: r.code, error: r.error || '' };
      await get().escrituraListar();
      previa = null; set({ ...vacio(), tramite: null, paso: 'tramite', sel: r.data!.operation });
      return { ok: true, cotizacion: r.data!.status === 'cotizacion' };
    } catch (e) { return { ok: false, error: (e as Error).message || String(e) }; } finally { set({ enviando: false }); }
  },
  escrituraSaldo: async () => { const r = await escrituraService.saldo(); return r.ok && r.data != null ? r.data : 0; },
}));

// Lee un documento privado: el Word con exactitud; el PDF o la foto con IA, de a 3 hojas
async function leer(f: IArchivoNotarial, avisar: (m: string) => void): Promise<IDocPrivado> {
  if (f.kind === 'word') return { name: f.name, bytes: f.bytes, raw: f.raw, pages: await paginasDePdf(f.bytes), text: f.text || '', origen: 'Word' };
  const origen = f.kind === 'image' ? 'Imagen' : 'PDF';
  const bytes = f.kind === 'image' ? await imagenAPdf(f.bytes, f.mime || 'image/jpeg') : f.bytes;
  const n = await paginasDePdf(bytes); const ia: Record<string, unknown>[] = []; const LOTE = 3;
  for (let d = 1; d <= n; d += LOTE) {
    avisar(`Leyendo «${f.name}» con IA: hojas ${d} a ${Math.min(n, d + LOTE - 1)} de ${n}…`);
    const r = await escrituraService.leerConIA({ imagenes: await hojasComoImagen(bytes, d, d + LOTE - 1), desde: d, total: n });
    if (!r.ok) throw new Error(r.error);
    ia.push(r.data || {});
  }
  return { name: f.name, bytes, pages: n, text: ia.map((x) => (x.texto as string) || '').join('\n\n'), origen, ia };
}

// Los archivos que recibe la notaría según el trámite
async function archivosDelTramite(S: IEscrituraState) {
  const files: { kind: string; name: string; bytes: Uint8Array }[] = [];
  const sinExt = (n: string) => n.replace(/\.[^.]+$/, '');
  const privados = () => S.proto.docs.forEach((x) => { files.push({ kind: 'documento', name: sinExt(x.name) + '.pdf', bytes: x.bytes }); if (x.raw) files.push({ kind: 'documento_word', name: x.name, bytes: x.raw }); });
  if (S.tramite === 'protocolizacion') {
    const car = datosCaratula(S);
    files.push({ kind: 'caratula_pdf', name: 'Carátula.pdf', bytes: await caratulaPdf(car) });
    files.push({ kind: 'para_notaria', name: 'Carátula y documentos.pdf', bytes: await S.escrituraVistaPrevia() });
    const dx = await escrituraService.word('caratula', car, notariaDatos(S)); if (dx.ok && dx.data) files.push({ kind: 'caratula_docx', name: 'Carátula.docx', bytes: dx.data });
    privados();
  } else if (S.tramite === 'reduccion') {
    privados();
    files.push({ kind: 'reduccion_pdf', name: 'Escritura de reducción.pdf', bytes: await S.escrituraVistaPrevia() });
    const dx = await escrituraService.word('escritura', bloquesReduccion(S), notariaDatos(S)); if (dx.ok && dx.data) files.push({ kind: 'reduccion_docx', name: 'Escritura de reducción.docx', bytes: dx.data });
  } else {
    if (S.orig?.bytes) files.push({ kind: 'original', name: S.orig.name, bytes: S.orig.bytes });
    files.push({ kind: 'escritura_pdf', name: 'Escritura formateada.pdf', bytes: await S.escrituraVistaPrevia() });
    const dx = await escrituraService.word('escritura', bloquesEscritura(S), notariaDatos(S)); if (dx.ok && dx.data) files.push({ kind: 'escritura_docx', name: 'Escritura formateada.docx', bytes: dx.data });
  }
  return files;
}
