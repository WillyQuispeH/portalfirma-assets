// Mis operaciones: lo enviado a firmar con Portalfirma. Fuente de verdad: src/operaciones.js (ops:*) y la
// API de Portalfirma (detalle de la operación). Si cambian allá, se actualizan aquí.
export interface IOperacion {
  operation: number;
  name: string;
  stage?: string;
  status?: string | null; // se completa con el detalle (en segundo plano)
  proc?: string; // 'none', 'legalization' o 'protocolization'
  signed?: number;
  signers?: number;
  created?: string;
  updated?: string;
  asset?: { codigo?: string; firmantes?: { rut?: string; calidad?: string }[] } | null; // enviada desde Asset
}
export interface IFirmante {
  name?: string; paternalLastName?: string; maternalLastName?: string; rut?: string; email?: string; phone?: string;
  signed?: boolean; url?: string; personId?: string | number; alias?: string;
}
export interface IDetalleOperacion {
  operation: number;
  status?: string;
  protocolizationNumber?: string;
  repertoireNumber?: string;
  createdDateAt?: string;
  updatedDateAt?: string;
  processId?: string | null; // sin él no se puede traer el documento
  versions: { label: string; done: boolean }[];
  signatories?: IFirmante[];
}
export interface IEstadoCuenta { api?: boolean; apiAvailable?: boolean; phone?: string; account?: string }
