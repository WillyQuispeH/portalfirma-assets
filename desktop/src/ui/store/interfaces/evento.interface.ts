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
