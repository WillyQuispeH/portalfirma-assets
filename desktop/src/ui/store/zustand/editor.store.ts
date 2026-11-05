// Estado del editor PDF: las pestañas (un documento cada una), la activa y el aviso de «trabajando».
//
// Cada documento es un objeto mutable (IDocumento) con los objetos de pdf.js, los bytes del PDF, las ediciones y lo
// que muestra el panel: el motor del editor (utils/editor-pdf) y los controladores lo cambian en el lugar, como antes,
// y avisan con editorTocar() para que React vuelva a dibujar. Así las pruebas siguen leyendo y cambiando
// window.editor._state (el documento activo) igual que siempre.
import { create } from 'zustand';
import { editorService } from '../services/editor.service';
import type { IDocumento, IPlantillaLista } from '../interfaces/editor.interface';

let secuencia = 0;
export function nuevoDocumento(): IDocumento {
  return {
    id: 't' + (++secuencia),
    bytes: null, name: 'documento.pdf', path: null, fromPdf: false, dirty: false,
    pdf: null, count: 0, current: 0, selected: new Set(), zoom: 1, scale: 1, scales: [],
    overlays: {}, undo: [], sel: null, multi: [], editing: null, tool: 'select', lifted: {},
    blocks: {}, ocr: {}, vp1: {}, renderToken: 0, notice: null,
    scrollFrac: 0, find: null, findOpen: false, textIndex: {}, side: 'pages', outline: undefined,
    fmt: { family: 'sans', size: 11, color: '#111111', bold: false, italic: false, underline: false, align: 'left', lh: 1.25 },
    rev: 0, scanned: false,
  };
}

interface IEditorState {
  pestanas: IDocumento[];
  doc: IDocumento; // la pestaña activa (un documento vacío si no hay ninguna)
  v: number; // sube con cada cambio: React vuelve a leer el documento
  ocupado: { msg: string; pct: number | null } | null;
  plantillas: IPlantillaLista[] | null; // «Mis plantillas» (en el inicio de Gestión documental)
  editorUsar: (d: IDocumento) => void;
  editorAgregar: (d: IDocumento) => void; // nueva pestaña (queda activa)
  editorQuitar: (d: IDocumento) => void;
  editorTocar: () => void;
  editorOcupado: (msg: string | null, pct?: number | null) => void;
  editorPlantillas: () => Promise<void>;
}

export const useEditorStore = create<IEditorState>((set) => ({
  pestanas: [], doc: nuevoDocumento(), v: 0, ocupado: null, plantillas: null,
  editorUsar: (doc) => set((s) => ({ doc, v: s.v + 1 })),
  editorAgregar: (doc) => set((s) => ({ pestanas: [...s.pestanas, doc], doc, v: s.v + 1 })),
  editorQuitar: (d) => set((s) => ({ pestanas: s.pestanas.filter((x) => x !== d), v: s.v + 1 })),
  editorTocar: () => set((s) => ({ v: s.v + 1 })),
  editorOcupado: (msg, pct = null) => set({ ocupado: msg ? { msg, pct } : null }),
  editorPlantillas: async () => { const r = await editorService.plantillas(); set({ plantillas: r.ok ? r.data || [] : [] }); },
}));
