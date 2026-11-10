// Publicaciones en portales. Fuente de verdad: src/publicaciones.js (panel, interesados, catalogo, feed)
// y mlEstado en src/portales/mercadolibre.js. Si cambian allá, se actualizan aquí.
import type { IMonto } from './negocio.interface';

export type TPubOperacion = 'venta' | 'arriendo';
export type TPubTab = 'avisos' | 'interesados' | 'portales';
export type TInteresadoEstado = 'nuevo' | 'contactado' | 'visita' | 'descartado';

export interface IRecomendacion {
  tipo: 'precio' | 'calidad' | string;
  grave?: boolean;
  t: string;
  accion: string;
}

export interface IAviso {
  propId: string;
  op: TPubOperacion;
  codigo: string;
  titulo: string;
  comuna?: string;
  foto?: string | null;
  precio?: IMonto | null;
  portales: { nombre: string; status?: string; url?: string | null }[];
  visitas: number | null;
  contactos: number | null;
  interesados: number;
  nuevos: number;
  calidad: number; // 0 a 100
  recomendaciones: IRecomendacion[];
  comparables?: { dif: number | null } | null; // % del precio por m² sobre (o bajo) la mediana de la comuna
}

// respuesta de pubPanel
export interface IPanelPublicaciones {
  totales: { avisos: number; visitas: number | null; contactos: number | null; nuevos: number; alertas: number };
  sync?: string | null; // última lectura de los portales
  avisos: IAviso[];
  sinPublicar: { propId: string; codigo: string; titulo: string; calidad: number }[];
}

export interface IInteresado {
  id: string;
  propId: string;
  codigo: string;
  titulo: string;
  nombre?: string;
  portal?: string;
  canal?: string;
  canalTxt?: string;
  fecha?: string;
  recibido?: string;
  mensaje?: string;
  telefono?: string;
  email?: string;
  rut?: string;
  personaId?: string | null;
  estado: TInteresadoEstado;
}

// respuesta de pubInteresados
export interface IInteresados {
  interesados: IInteresado[];
  cuenta: Partial<Record<TInteresadoEstado, number>>;
}

// respuesta de pubRespuesta: el texto listo y por dónde enviarlo
export interface IRespuestaInteresado {
  texto: string;
  whatsapp?: string | null; // enlace wa.me con el texto
  email?: string | null;
}

export interface IPortal {
  id: string; // 'pi', 'chilepropiedades', 'toctoc', 'yapo'…
  nombre: string;
  via: 'api' | 'feed' | 'acuerdo';
  listo: boolean;
  estado: string;
  detalle: string;
  token?: boolean; // hay TOKEN guardado
  feedUrl?: string;
  correo?: string | null; // a quién pedir la integración
}

export interface IContactoAvisos {
  nombre?: string;
  email?: string;
  telefono?: string;
  whatsapp?: string;
  web?: string;
}

// lo que muestra la pestaña Portales
export interface IPortales {
  catalogo: IPortal[];
  contacto: IContactoAvisos;
  feeds: Record<string, number>; // avisos en el feed de cada portal (los que no van por API)
}

// ---------- el flujo «Publicar»: calidad del aviso, portales y publicar (pubCalidad, pubRedactar, pubTextos, pubPublicar) ----------
export type TPasoPublicar = 1 | 2 | 3;
export type TTipoAviso = 'silver' | 'gold' | 'gold_premium'; // aviso de Portal Inmobiliario
export type TPaquetes = Partial<Record<TTipoAviso, number>>; // publicaciones disponibles en el paquete de la cuenta (mlPaquetes)

export interface ICalidadItem {
  id: string;
  t: string;
  ok: boolean;
  parcial?: boolean;
  falta: string;
  arreglo: 'ficha' | 'fotos' | 'ia' | 'contacto';
}

export interface ICalidadAviso {
  op: TPubOperacion;
  puntaje: number; // 0 a 100
  nivel: string; // Excelente, Bueno, Mejorable, Incompleto
  items: ICalidadItem[];
  bloquea: string[]; // lo que impide publicar
  titulo: string; // título para los portales (o el de la ficha)
  descripcion: string;
  fotos: number;
}

export interface IRedaccionAviso {
  titulo: string;
  descripcion: string;
  destacados: string[];
}

export interface IResultadoPortalPublicar {
  portal: string;
  ok: boolean;
  estado?: string;
  espera?: boolean; // queda en espera de la integración
  url?: string | null;
  error?: string;
}

export interface IResultadoSincronizar {
  chilepropiedades?: { leads?: number };
  pi?: { leads?: number };
  errores: string[];
}
