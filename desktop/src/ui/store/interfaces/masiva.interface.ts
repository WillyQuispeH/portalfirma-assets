// Carga masiva: la cola de documentos que se suben, se analizan (firmantes) y se envían a firmar de a uno, y la
// Fuente de verdad: src/bulk.js (bulk:*).
export type TEstadoDoc = 'queued' | 'converting' | 'uploading' | 'analyzing' | 'ready' | 'needs_data' | 'sending' | 'sent' | 'error' | 'send_error' | 'skipped';
export interface IFirmanteMasiva { fullName: string; rut: string; email: string; phone: string; alias: string; typeSign?: string; pagina?: number }
export interface IDocMasiva {
  id: string;
  name: string;
  path?: string;
  /** el PDF que se envía (si el original era Word, el convertido) */
  pdfPath?: string;
  pages?: number;
  size?: number;
  /** trámite de este documento (si no, el general) */
  tramite?: 'none' | 'legalization' | 'protocolization';
  /** con página para las firmas (la agrega Portalfirma, y las firmas ubicadas se quitan); por defecto no */
  paginaExtra?: boolean;
  /** las firmas ubicadas en el PDF (una por firmante, en orden); sin ellas van en su hoja, de a dos por fila */
  posiciones?: { pagina: number; x: number; y: number }[] | null;
  /** sube cada vez que «Sincronizar PDF» le cambia la configuración (la pantalla vuelve a armar su PDF) */
  syncRev?: number;
  /** el archivo ya se envió antes desde la carga masiva */
  dupSent?: boolean;
  /** omitido por repetido, ya enviado o no legible: se puede reintentar */
  forzable?: boolean;
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
export interface IProgresoMasiva { analisis: { total: number; hechos: number; activo: boolean } | null; envio: { total: number; hechos: number; errores: number } | null }
export interface IColaMasiva { items: IDocMasiva[]; paused?: boolean; sending?: boolean; coolUntil?: number; progreso?: IProgresoMasiva }
export interface IOpcionesEnvio { protocolization: 'none' | 'legalization' | 'protocolization'; typeSign: 'simple' | 'avanzada' | 'visada' | 'enrolada' }
export interface IOperacionPendiente { operation: string | number; document_name?: string; name?: string }
