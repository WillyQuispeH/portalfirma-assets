// Leads (conversaciones con clientes). Fuente de verdad: listar() y vista() en src/leads.js.
// Si cambian allá, se actualizan aquí.
import type { IMonto } from './negocio.interface';

// filtro de la bandeja: un estado, 'abiertos', 'seguimiento' o 'todos'
export type TLeadFiltro = 'abiertos' | 'nuevo' | 'seguimiento' | 'visita' | 'ganado' | 'perdido' | 'todos';

export interface ILeadBusqueda {
  operacion?: 'venta' | 'arriendo' | string;
  tipo?: string;
  dormitorios?: number | null;
  banos?: number | null;
  comunas?: string[];
  presupuesto?: IMonto | null;
}

export interface ILead {
  id: string;
  nombre?: string;
  telefono?: string;
  chatCon?: string;
  ig?: unknown; // viene de Instagram
  estado: string;
  estadoTxt: string;
  ultimo?: { fecha: string; de?: 'broker' | string; texto?: string } | null;
  noLeidos?: number;
  corredor?: { id: string; nombre: string } | null;
  sinRespuesta?: boolean;
  vencida?: boolean;
  busqueda?: ILeadBusqueda;
}

// respuesta de leadsListar
export interface ILeadLista {
  leads: ILead[];
  cuenta: Record<string, number>; // por estado, de todos los leads (sin filtro)
  estados: [string, string][];
  origenes: Record<string, string>;
  brokers: string[];
  corredores: { id: string; nombre: string }[];
  sinCorredor: number;
  kpis: { abiertos: number; nuevos: number; seguimiento: number; visitas: number };
}

export interface ILeadConsulta {
  estado?: string;
  q: string;
  origen?: string;
  broker?: string;
}

// ---------- detalle de un lead (leadsObtener: obtener() de src/leads.js) ----------
export type TCanal = 'whatsapp' | 'instagram' | 'facebook' | 'email';

export interface IMensajeLead {
  k?: string;
  fecha: string; // 'AAAA-MM-DDTHH:MM:SS' o 'AAAA-MM-DD HH:MM'
  de: 'cliente' | 'broker' | 'agente' | string;
  autor?: string;
  texto?: string;
  tipo?: 'texto' | 'imagen' | 'audio' | 'video' | 'documento' | 'contacto' | 'omitido' | string;
  url?: string | null;
  archivo?: string;
  transcripcion?: string;
  canal?: TCanal | string;
  ig?: boolean;
  wa?: boolean;
  fallido?: string | null;
}

export interface ILeadDetalle extends ILead {
  email?: string;
  rut?: string;
  notas?: string;
  origen?: string;
  origenTxt?: string;
  corredorId?: string | null;
  resumen?: string;
  perfil?: string;
  motivoPerdida?: string;
  personaId?: string | null;
  mensajes?: number;
  proximaAccion?: { texto?: string; fecha?: string | null; manual?: boolean } | null;
  busqueda?: ILeadBusqueda & { estacionamiento?: boolean | null; mascotas?: boolean | null; plazo?: string | null; otros?: string[] };
  propiedadesInfo?: { id: string; codigo: string; titulo: string; foto?: string | null }[];
  links?: string[];
  historial?: { fecha: string; texto: string; tipo?: string }[];
  canales?: { canal: string; contactId?: string; usuario?: string }[];
  ig?: { usuario?: string; cuenta?: string } | null;
  wa?: boolean;
  corto?: number;
  pendiente?: { texto: string; corredor: string; en: string } | null;
  mensajesLista: IMensajeLead[];
}

// lo que se guarda solo al cambiar un campo (leadsActualizar)
export interface ILeadCambios {
  estado?: string;
  motivo?: string;
  nombre?: string;
  telefono?: string;
  email?: string;
  rut?: string;
  notas?: string;
  proximaAccion?: { texto: string; fecha: string | null };
  busqueda?: ILeadDetalle['busqueda'];
}

// respuesta de leadsResponder: el lead al día y qué pasó con el envío
export interface IResultadoEnvio {
  ok: boolean;
  estado: 'enviado' | 'plantilla' | 'error';
  canal?: TCanal;
  mensaje: string;
}
