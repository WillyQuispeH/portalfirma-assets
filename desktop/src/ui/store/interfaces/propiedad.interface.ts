// Propiedades de la cartera. Fuente de verdad: src/inmo.js (listar) y src/permisos.js (redactarProp),
// y las captaciones de et:captaciones en src/main.js. Si cambian allá, se actualizan aquí.
import type { IMonto } from './negocio.interface';
import type { IPersona } from './persona.interface';

export type TPropiedadTipo = 'casa' | 'departamento' | 'oficina' | 'sitio' | 'local_comercial' | 'industrial' | 'agricola'
  | 'parcela' | 'estacionamiento' | 'terreno_construccion' | 'bodega';
export type TPropiedadEstado = 'disponible' | 'reservada' | 'vendida' | 'arrendada' | 'no_disponible';
export type TOperacion = 'venta' | 'arriendo';

export interface IVinculo {
  personaId: string;
  rol: string;
}

export interface IPropiedad {
  id: string;
  codigo: string;
  tipo: TPropiedadTipo;
  titulo: string;
  direccion?: string;
  unidad?: string;
  comuna?: string;
  region?: string;
  lat?: number | null;
  lng?: number | null;
  rol?: string; // rol del SII
  fotos?: string[];
  venta?: boolean;
  arriendo?: boolean;
  precioVenta?: IMonto | null;
  precioArriendo?: IMonto | null;
  estadoVenta?: TPropiedadEstado;
  estadoArriendo?: TPropiedadEstado;
  dormitorios?: number | null;
  banos?: number | null;
  estacionamientos?: number | null;
  supUtil?: number | null;
  supTotal?: number | null;
  archivada?: boolean;
  vinculos?: IVinculo[];
  captadorId?: string | null;
  captador: { id: string; nombre: string } | null;
  duenoVisible?: boolean;
  portales?: { pi?: Partial<Record<TOperacion, IAvisoPortal>>; [portal: string]: Partial<Record<TOperacion, IAvisoPortal>> | undefined };
  tituloPortal?: string; // título para los portales (máximo 60)
  leads?: ILeadPortal[];
  // lo que muestra la ficha
  bodegas?: number | null;
  gastosComunes?: number | null;
  amoblado?: boolean;
  corredor?: { nombre: string; email?: string } | null;
  descripcion?: string;
  notasInternas?: string;
  origen?: { fuente?: string; importado?: string } | null; // importada desde Portalfirma
  editados?: string[]; // datos editados aquí que se respetan al importar de nuevo
  documentos?: IDocumentoPropiedad[];
  firmas?: IFirmaPropiedad[];
  ficha?: { propietarioNombre?: string; propietarioCelular?: string; propietarioEmail?: string; [campo: string]: unknown };
}

// aviso en Portal Inmobiliario (src/portales/mercadolibre.js)
export interface IAvisoPortal {
  status?: string; // active, paused, closed, under_review, inactive
  itemId?: string;
  permalink?: string;
  error?: string;
}

// interesado que llegó desde un aviso
export interface ILeadPortal {
  visto?: boolean;
  nombre?: string;
  canal?: string; // whatsapp, question, call, schedule, quotation
  canalTxt?: string;
  fecha?: string;
  rut?: string;
  telefono?: string;
  email?: string;
}

// archivo guardado en la carpeta de la propiedad
export interface IDocumentoPropiedad {
  id: string;
  nombre: string;
  fecha: string;
}

// documento generado desde una plantilla y enviado a firmar desde Asset
export interface IFirmaPropiedad {
  plantilla: string;
  fecha: string;
  estado?: string; // en_firma, firmado, pendiente_pago, anulado
  operacion?: number | string;
  archivo?: string; // PDF creado en Asset
  firmantes?: { nombre: string }[];
}

// un registro del historial (actividadDe en src/inmo.js)
export interface IRegistroActividad {
  ref?: string;
  texto: string;
  fecha: string;
  tipo?: string; // 'nota' para las notas escritas a mano
}

// resumen de los pasos de la captación (etPasos con ámbito captacion, en src/main.js)
export interface IPasosCaptacion {
  etapas: { ok: number; total: number }[];
  actual: { t: string } | null;
}

// conexión con Portal Inmobiliario (mlEstado)
export interface IEstadoPortal {
  conectada: boolean;
  cuenta?: { nickname?: string; email?: string } | null;
}

// respuesta de inmoListar
export interface ICartera {
  propiedades: IPropiedad[];
  personas: IPersona[];
  ultimaImportacion?: { fecha: string } | null;
}

// avance de la captación de cada propiedad (etCaptaciones), por id
export interface ICaptacion {
  ok: number;
  total: number;
  completa: boolean;
  falta: string[];
  actual: { t: string; e: string } | null;
}
export type TCaptaciones = Record<string, ICaptacion>;

// respuesta de accCaptadorVarios
export interface IAsignacionCaptador {
  cambiadas: number;
  total: number;
}
