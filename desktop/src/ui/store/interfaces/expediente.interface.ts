// Expedientes: una carpeta por caso (en este computador o en Google Drive) con sus archivos e historial.
// Fuente de verdad: src/expedientes.js (exp:*). Si cambian allá, se actualizan aquí.
export type TExpedienteTipo = 'propiedad' | 'persona' | 'empresa' | 'tramite' | 'otro';

export interface IExpediente {
  id: string;
  name: string;
  type: TExpedienteTipo;
  storage: 'local' | 'drive';
  count?: number | null;
  notes?: string;
  created?: string;
  path?: string;
}
export interface IArchivoExpediente { id: string; name: string; size?: number; modified?: string }
export interface IMovimientoExpediente { kind: string; text?: string; at: string; op?: string | number | null }
export interface IAgregados { added?: string[]; skipped?: string[] }
// estado de las operaciones enviadas a firmar (para el historial)
export interface IOperacionResumen { operation: string | number; stage?: string; status?: string; signers?: number; signed?: number }
