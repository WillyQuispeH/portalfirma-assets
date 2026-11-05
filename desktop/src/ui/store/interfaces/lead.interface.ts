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
