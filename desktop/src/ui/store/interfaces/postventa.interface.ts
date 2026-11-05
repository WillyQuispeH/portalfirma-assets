// Postventa: reclamos de propietarios con su garantía legal, atendidos por WhatsApp (wechatia), unidades
// entregadas y contratistas. Fuente de verdad: src/postventa.js (tablero, listar, chats, config…) y los
// handlers pv:* de src/main.js. Si cambian allá, se actualizan aquí.

export type TPvTab = 'reclamos' | 'unidades' | 'whatsapp' | 'asistente' | 'contratistas';
export type TPvFiltro = 'abiertos' | 'triage' | 'todos';

// respuesta de pvTablero
export interface IPvTablero {
  abiertos?: number;
  urgentes?: number;
  whatsapp?: number;
  cierrePromedioDias?: number | null;
  satisfaccion?: number | null;
  unidades?: number;
  proyectos?: number;
}

export interface IPvMensaje {
  dir: 'in' | 'out';
  texto?: string;
  fotos?: string[];
  fecha?: string | null;
}

export interface IPvReclamo {
  id: string;
  folio: string;
  urgente?: boolean;
  estado: string;
  estadoTxt: string;
  canal?: 'whatsapp' | string;
  dias: number;
  unidad?: { nombre: string; propietario?: { nombre?: string } } | null;
  contacto?: { nombre?: string } | null;
  items: { tipoTxt?: string; recinto?: string | null; descripcion?: string }[];
}

// una conversación de WhatsApp (en curso o ya convertida en reclamo)
export interface IPvChat {
  id: string;
  nombre?: string;
  telefono?: string;
  unidad?: string;
  pasoTxt: string;
  enCurso?: boolean;
  actualizado?: string;
  reclamo?: { folio: string } | null;
  ultimo?: IPvMensaje | null;
  ultimoIn?: IPvMensaje | null;
  mensajes: IPvMensaje[];
}

// cómo habla el asistente con los propietarios
export interface IPvPersona {
  nombre: string;
  empresa: string;
  trato: 'tu' | 'usted';
  tono: 'cercano' | 'neutro' | 'formal';
  largo: 'breve' | 'normal';
  emojis: boolean;
  horario: string;
  firma: string;
  instrucciones: string;
}

// respuesta de pvConfig
export interface IPvConfig {
  auto: boolean;
  conectado: boolean;
  propia: boolean; // hay clave de WhatsApp propia de postventa
  locationId?: string;
  ultimaRevision?: string | null;
  persona: IPvPersona;
}

export interface IPvProyecto { id: string; nombre: string }
export interface IPvUnidad {
  id: string;
  proyectoId: string;
  nombre: string;
  torre?: string;
  numero: string;
  recepcionDOM?: string | null;
  inscripcionCBR?: string | null;
  propietario?: { nombre?: string; rut?: string; telefono?: string } | null;
}
export interface IPvContratista { id: string; nombre: string; especialidad?: string; telefono?: string }

export interface IPvImportacion { nuevas: number; actualizadas: number; omitidas?: number; errores: string[] }
export interface IPvRevision { procesados: number; enviados: number; nuevos?: unknown[] }
