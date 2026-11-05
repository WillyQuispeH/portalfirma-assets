// Flujos documentales: una receta une un modelo de la Notaría Virtual, una nómina (Excel o CSV) y sus firmantes;
// cada ejecución genera un documento por fila y lo envía a firmar (por la carga masiva).
// Fuente de verdad: src/flujos.js (flujos:*). Si cambia allá, se actualiza aquí.
export interface ICampoModelo {
  id: string; key: string; label: string; group: string; groupLabel: string;
  required?: boolean; signer?: boolean; signerKey?: 'fullName' | 'rut' | 'email' | 'phone';
}
export interface IModelo { id: string; nombre: string; categoria: string; descripcion?: string; fields: ICampoModelo[]; roles: { alias: string }[] }
// de dónde sale cada dato: una columna (por su título), un valor fijo, la fecha de hoy o vacío
export type TRegla = { type: 'col'; header: string } | { type: 'fixed'; value: string } | { type: 'today' } | { type: 'empty' };
export interface IReceta { id: string; name: string; modelId: string; mapping: Record<string, TRegla>; opts?: IOpcionesFlujo; created?: string }
export interface IOpcionesFlujo { protocolization: 'none' | 'legalization' | 'protocolization'; typeSign: 'simple' | 'avanzada' | 'visada' | 'enrolada' }
export interface INomina { name: string; headers: string[]; rows: { s: string }[][] }
export interface IRevision { ok: number; bad: number; rows: { n: number; ok: boolean; label: string; errors: string[] }[] }
export interface IFilaEjecucion { n: number; label: string; file?: string; bulkId?: string; operation?: number | string }
export interface IEjecucion { id: string; recipeId: string; recipeName: string; modelName?: string; date: string; nomina?: string; total: number; status?: string; error?: string; rows?: IFilaEjecucion[] }
