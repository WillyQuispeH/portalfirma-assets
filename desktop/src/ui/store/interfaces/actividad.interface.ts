// Actividad de la cartera. Fuente de verdad: actividadTodas() en src/inmo.js.
// Si cambia allá, se actualiza aquí.

// a qué se refiere cada movimiento
export type TActividadClase = 'propiedad' | 'persona' | 'negocio' | 'agenda' | 'otro';
// filtro de la pantalla: una clase, las notas o todo ('')
export type TActividadFiltro = '' | Exclude<TActividadClase, 'otro'> | 'nota';

export interface IActividadItem {
  id: string;
  fecha: string; // ISO
  texto: string;
  nota: boolean;
  clase: TActividadClase;
  nombre: string;
  ir: string | null; // id para abrir (propiedad, persona, negocio) o la fecha del evento
}

// respuesta de inmoActividadTodas (paginada)
export interface IActividadPagina {
  items: IActividadItem[];
  total: number;
}

export interface IActividadConsulta {
  q: string;
  clase: TActividadFiltro;
  desde: number;
  limite: number;
}
