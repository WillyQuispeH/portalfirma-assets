// Carga masiva: la cola de documentos que se suben, se analizan (firmantes) y se envían a firmar de a uno, y la
// firma masiva con certificado. Fuente de verdad: src/bulk.js (bulk:*) y cds:* en src/main.js.
export type TEstadoDoc = 'queued' | 'converting' | 'uploading' | 'analyzing' | 'ready' | 'needs_data' | 'sending' | 'sent' | 'error' | 'send_error' | 'skipped';
export interface IFirmanteMasiva { fullName: string; rut: string; email: string; phone: string; alias: string }
export interface IDocMasiva {
  id: string;
  name: string;
  path?: string;
  size?: number;
  status: TEstadoDoc;
  selected?: boolean;
  typeDocument?: string;
  operation?: number | string | null;
  error?: string;
  missing?: string[];
  signers?: IFirmanteMasiva[];
  required?: { name?: boolean; email?: boolean; phone?: boolean };
}
// estado de la cola (llega en vivo por pf.onBulk)
export interface IColaMasiva { items: IDocMasiva[]; paused?: boolean; sending?: boolean; coolUntil?: number }
export interface IOpcionesEnvio { protocolization: 'none' | 'legalization' | 'protocolization'; typeSign: 'simple' | 'avanzada' | 'visada' | 'enrolada' }
export interface IOperacionPendiente { operation: string | number; document_name?: string; name?: string }
