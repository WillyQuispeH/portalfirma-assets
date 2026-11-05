// «La oficina»: lo de hoy repartido entre el equipo (Pedro, Juanita, Diego, Fernanda), las firmas en curso
// y el WhatsApp de la empresa. Fuente de verdad: ofDatos() en src/main.js. Si cambia allá, se actualiza aquí.
import type { IHoyItem } from './hoy.interface';

export type TMiembro = 'pedro' | 'juanita' | 'diego' | 'fernanda';
export type TTareaEstado = 'fail' | 'pend' | 'esp';

// una tarea: un paso de «Hoy» (se le pasa a Etapas.accion) o un lead de Fernanda (leadId)
export interface ITareaOficina extends Partial<IHoyItem> {
  e: TTareaEstado;
  texto: string;
  quien?: string;
  leadId?: string;
}

export interface IFirmaEnCurso {
  texto: string;
  codigo: string;
  titulo: string;
  cliente: string;
  d?: string;
  negocioId: string | null;
  propId: string | null;
}

// respuesta de ofDatos
export interface IOficina {
  tareas: Record<TMiembro, ITareaOficina[]>;
  firmas: IFirmaEnCurso[];
  wa: { activo: boolean; numeroEmpresa: string };
}
