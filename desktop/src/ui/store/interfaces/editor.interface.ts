// Editor PDF (components/functional/gestion/editor-pdf): cada pestaña es un documento con su propio estado.
// Los objetos de pdf.js (pdf, viewports) y los bytes del PDF no tienen tipos en la app: van como `any`.
/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js, pdf-lib y Tesseract no tienen tipos en la app */

export type THerramienta = 'select' | 'hand' | 'edittext' | 'text' | 'image' | 'whiteout';
export type TLado = 'pages' | 'outline';

// Formato del próximo texto (o del texto elegido)
export interface IFormato {
  family: string; size: number; color: string;
  bold: boolean; italic: boolean; underline: boolean;
  align: string; lh: number;
}

// Objeto sobre la página: texto enriquecido (nuevo o editado), imagen o «tapar».
// Coordenadas en puntos de la página tal como se ve (x→derecha, y→abajo).
export interface IObjeto {
  type: 'rich' | 'image' | 'whiteout';
  id: string;
  x: number; y: number; w: number; h: number;
  // texto
  html?: string; family?: string; size?: number; align?: string; lh?: number; color?: string;
  ph?: boolean; // texto de ejemplo que se reemplaza al escribir
  blockId?: string; cover?: { x: number; y: number; w: number; h: number } | null; bg?: number[];
  detected?: string; source?: 'pdf' | 'ocr'; transparent?: boolean;
  // imagen
  src?: string; mime?: string; bytes?: Uint8Array; ratio?: number;
  lift?: boolean; // tapa el lugar de una imagen del PDF que se volvió movible
  // plantillas
  tplHtml?: string; locked?: boolean; baseSize?: number; maxBottom?: number; shrunk?: number; overflow?: boolean;
}

// Párrafo detectado en la página (texto digital u OCR)
export interface IBloque {
  id: string; box: { x: number; y: number; w: number; h: number };
  x0: number; x1: number; base0: number; align: string; lh: number; size: number; family: string;
  html: string; text: string; detected: string; source: 'pdf' | 'ocr';
}

// ---------- Plantillas con campos ----------
export type TTipoCampo = 'texto' | 'rut' | 'fecha' | 'monto' | 'numero' | 'email' | 'telefono' | 'opcion' | 'parrafo';
export interface ICampo {
  id: string; label: string; type: TTipoCampo;
  format?: { case?: string; date?: string; words?: boolean | 'solo'; symbol?: boolean };
  required?: boolean; options?: string[]; sample?: string;
  signer?: { role: string; attr: string } | null;
}
export interface IPlantillaArchivo { v: number; app: string; name: string; fields: ICampo[]; blocks: { page: number; o: IObjeto }[] }
export interface IPlantillaEstado {
  mode: 'design' | 'fill';
  def: { name: string; fields: ICampo[]; saved?: string };
  dirty?: boolean; file?: string;
  values: Record<string, string>; status: Record<string, { overflow: boolean }>;
  errs?: Record<string, string>; // el error que se ve bajo cada dato del formulario
  src?: IPlantillaArchivo;
}
export interface IPlantillaLista { file: string; name: string; fields: number; signers?: string[]; updated?: string }

// ---------- Asistente legal ----------
export interface IObservacion {
  tipo: string; gravedad?: string; cita: string | null; sugerencia: string | null; explicacion: string;
  local?: boolean; done?: string;
}
export interface IMensajeIA { role: 'user' | 'assistant'; content: string; ctx?: boolean }
export interface IAsistenteDoc {
  open?: boolean; tab: 'review' | 'draft' | 'ask' | 'settings';
  items: IObservacion[] | null; summary?: string; chat: IMensajeIA[]; draftQ?: string;
  model?: string; usage?: unknown;
}
// Documento redactado (por la IA o desde un modelo de Portalfirma): el texto con [[marcadores]] y sus campos
export interface ICampoSpec { etiqueta: string; tipo: string; firmante: { rol: string; dato: string } | null; valor: string | null; solo_formulario?: boolean }
export interface ISpec {
  titulo: string; cuerpo: string; campos: ICampoSpec[];
  modelo?: { id: string; nombre: string };
  desc?: string; history?: { instr: string; note: string }[];
}

// ---------- Documento (una pestaña) ----------
export interface IDocumento {
  id: string;
  bytes: Uint8Array | null; name: string; path: string | null; fromPdf: boolean; dirty: boolean;
  pdf: any; count: number; current: number; selected: Set<number>;
  zoom: number; scale: number; scales: number[];
  overlays: Record<number, IObjeto[]>; undo: any[];
  sel: string | null; multi: string[]; editing: string | null; tool: THerramienta;
  lifted: Record<number, { x: number; y: number; w: number; h: number }[]>;
  blocks: Record<number, IBloque[]>; ocr: Record<number, any>; vp1: Record<number, any>;
  renderToken: number; notice: string | null; scrollFrac: number;
  find: { q: string; matches: { p: number; s: number; e: number }[]; idx: number; searching: boolean } | null;
  findOpen: boolean; // la barra de búsqueda está a la vista
  textIndex: Record<number, any>; side: TLado; outline: any[] | undefined;
  fmt: IFormato;
  rev: number; // sube cada vez que cambian los bytes (las miniaturas se vuelven a dibujar)
  scanned: boolean; // la página actual es una imagen (fotocopia): se ofrece reconocer el texto
  pdfImgs?: { bytes: Uint8Array | null; pages: Record<number, any[]> };
  tpl?: IPlantillaEstado | null; ai?: IAsistenteDoc; aiDoc?: ISpec;
  signers?: object[]; // firmantes que vienen de una plantilla llenada (al enviar a firmar)
}

// Lo que devuelve el proceso principal al abrir un archivo para el editor (editor:open)
export interface IArchivoAbierto { kind: 'pdf' | 'image'; bytes: ArrayBuffer | Uint8Array; name: string; mime?: string; converted?: string | null; path: string }
