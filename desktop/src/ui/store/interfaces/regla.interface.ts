// Reglas de detección de materias (interno de Portalfirma). Fuente de verdad: src/reglas.js.

export type TReglaTipo = 'acto' | 'materia' | 'excepcion';

// Un caso: el cliente corrigió la detección (sin RUT, correos ni teléfonos)
export interface IReglaCaso {
  id: string;
  creado: string;
  tramite: string;
  titulo: string;
  materiaAuto: string | null;
  materiaFinal: string | null;
  descartados: { codigo: string | null; nombre: string; cita: string }[];
  agregados: { codigo: string | null; nombre: string; frase: string }[];
}

// Resultado de probar una regla contra los casos guardados (evaluar en src/reglas.js)
export interface IReglaPrueba {
  error?: string;
  positivos: number;
  aciertos: string[];
  otros: string[];
  total: number;
}

// Lo común a una propuesta de la IA y a una regla aprobada
export interface IReglaBase {
  id: string;
  tipo: TReglaTipo;
  patron: string;
  nombre?: string;
  codigo?: string | null;
  materia?: string | null;
  acto?: string | null;
  campo?: 'titulo' | 'cuerpo';
  principal?: boolean;
  explicacion?: string;
  prueba?: IReglaPrueba | { error: string };
}

export interface IReglaPropuesta extends IReglaBase {
  estado: 'propuesta' | 'invalida';
  creado: string;
}

export interface IReglaAprobada extends IReglaBase {
  activo: boolean;
  aprobada: string;
}

export interface IReglas {
  version: string | null;
  actos: Omit<IReglaAprobada, 'tipo'>[];
  materias: Omit<IReglaAprobada, 'tipo'>[];
  excepciones: Omit<IReglaAprobada, 'tipo'>[];
  propuestas: IReglaPropuesta[];
}

export interface IReglaContexto {
  actos: string[];
  materias: { value: string; label: string }[];
}
