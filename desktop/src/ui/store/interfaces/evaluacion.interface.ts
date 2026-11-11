// La evaluación del arrendatario y sus avales (servidor: api/src/whatsapp/evaluacion.ts).
export interface IEvalCriterio { id: string; nombre: string; peso: number; puntos: number; detalle: string }
export interface IEvalAnalisisPersona {
  porcentaje: number;
  nivel: 'alto' | 'medio' | 'bajo';
  criterios: IEvalCriterio[];
  faltan: string[];
  alertas: string[];
  rentaLiquidaClp: number | null;
}
export interface IEvalArchivo { n: number; nombre: string; clase: string; legible: boolean; resumen: string; alertas: string[]; recibido: string }
export interface IEvalDocumento { id: string; nombre: string; ok: boolean; detalle: string }
export interface IEvalPersona {
  personaId: string;
  rol: 'arrendatario' | 'aval';
  nombre: string;
  telNorm: string;
  solicitadaEn: string;
  archivos: IEvalArchivo[];
  completa: boolean;
  analisis: IEvalAnalisisPersona | null;
  documentos: IEvalDocumento[];
  faltan: string[];
}
export interface IEvalAnalisis {
  hechoEn: string;
  porcentaje: number;
  nivel: 'alto' | 'medio' | 'bajo';
  resumen: string;
  arriendoClp: number | null;
  porPersona: { personaId: string; rol: string; nombre: string; porcentaje: number; nivel: string }[];
}
export interface IEvaluacion {
  vacia?: false;
  negocioId: string;
  estado: 'solicitada' | 'completa' | 'revisada';
  solicitadaEn: string;
  personas: IEvalPersona[];
  analisis: IEvalAnalisis | null;
  decision: { estado: 'aprobada' | 'rechazada'; por: string; en: string; nota: string } | null;
}
export type TEvaluacionRespuesta = IEvaluacion | { vacia: true };
