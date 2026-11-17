// Eventos de la agenda. Fuente de verdad: src/agenda.js (vista(), listar(), actualizar()).
// Si cambian allá, se actualizan aquí.

export type TEventoTipo = 'visita' | 'reunion' | 'firma' | 'llamada' | 'tarea' | 'otro';
export type TEventoEstado = 'programado' | 'hecho' | 'cancelado';

export interface IEventoPersona {
  id: string;
  nombre: string;
  rut?: string;
  telefono?: string;
  email?: string;
}

export interface IEvento {
  id: string;
  tipo: TEventoTipo;
  tipoTxt: string;
  estado: TEventoEstado;
  titulo: string;
  fecha: string; // AAAA-MM-DD
  hora: string | null; // HH:MM
  duracion?: number;
  lugar?: string;
  notas?: string;
  propId?: string | null;
  negocioId?: string | null;
  personaIds?: string[];
  corredorId?: string | null; // lo pone el servidor al sincronizar; sin él, es de quien lo creó aquí
  orden?: { operacion?: string } | null; // orden de visita enviada a firmar
  prop: { id: string; codigo: string; titulo: string; direccion?: string; comuna?: string } | null;
  personas: IEventoPersona[];
}

// filtros de agendaListar
export interface IEventoFiltro {
  desde?: string;
  hasta?: string;
  tipo?: TEventoTipo;
}

// cambios que acepta agendaActualizar
export interface IEventoCambios {
  fecha?: string;
  hora?: string;
  estado?: TEventoEstado;
}

// lo que acepta agendaCrear (src/agenda.js crear). Una visita no puede cruzarse con otra de la misma propiedad: si se cruza, lanza el error
export interface IEventoNuevo {
  tipo: TEventoTipo;
  fecha: string;
  hora?: string;
  duracion?: number;
  propId?: string;
  personaIds?: string[];
  negocioId?: string;
  notas?: string;
  titulo?: string;
}
