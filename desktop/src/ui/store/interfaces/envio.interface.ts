// Enviar a firmar: lo que devuelven analyze, send y detail (src/main.js → src/portalfirma.js).
export interface IArchivoEnvio {
  name: string;
  path: string;
  size?: number;
  converted?: boolean; // un Word que se convirtió a PDF antes de subirlo
  original?: string; // nombre del archivo antes de convertirlo
}

export interface IRequeridos { rut?: boolean; alias?: boolean; name?: boolean; email?: boolean; phone?: boolean }

export interface IFirmanteExtraido { fullName?: string; rut?: string; email?: string; phone?: string; alias?: string }

export interface IExtraccion {
  typeDocument?: string;
  summary?: string;
  required_fields?: IRequeridos;
  document_config_id?: string | number; // el tipo de documento fija la firma y el trámite
  documentConfig?: { name?: string };
  type_sign?: string;
  notarial_procedure?: string;
  firmantes?: IFirmanteExtraido[];
}

export interface IAnalisis {
  file: IArchivoEnvio;
  extract?: IExtraccion;
  ingest: { document_id: string | number };
}

export type TCampoFirmante = 'fullName' | 'rut' | 'email' | 'phone' | 'alias' | 'typeSign';

export interface IFirmante {
  fullName: string;
  rut: string;
  email: string;
  phone: string;
  alias: string;
  typeSign: string; // '' = igual que el documento
  tocado?: boolean; // ya salió del campo o intentó enviar: se muestran los errores
  prellenado?: boolean; // vino de una plantilla llenada en el editor
}

export interface IPayloadEnvio {
  document_id: string | number;
  email: string;
  signatories: { rut: string; alias: string; fullName: string; email: string; phone: string; typeSign?: string }[];
  document_config_id?: string | number;
  protocolization?: string;
  code?: string;
}

export interface IResultadoEnvio {
  operation?: number | string | null;
  raw?: { message?: string; [k: string]: unknown };
}

export interface IFirmanteOperacion {
  name?: string;
  paternalLastName?: string;
  maternalLastName?: string;
  email?: string;
  phone?: string;
  rut?: string;
  signed?: boolean;
  url?: string;
  personId?: string | number;
}

export interface IDetalleOperacion {
  operation: number | string;
  status?: string;
  signatories?: IFirmanteOperacion[];
  processId?: string | number;
}
