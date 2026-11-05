// Personas del CRM (un registro por RUT). Fuente de verdad: src/inmo.js y redactarPersona() en src/permisos.js.
export type TPersonaRol = 'propietario' | 'arrendatario' | 'comprador' | 'codeudor' | 'interesado' | 'proveedor';

export interface IPersona {
  id: string;
  nombre: string;
  rut: string;
  email: string;
  telefono?: string;
  roles: TPersonaRol[];
  reservado?: boolean; // dueño de una propiedad ajena: sin datos de contacto
  tipo?: 'natural' | 'juridica';
  direccion?: string;
  estadoCivil?: string;
  profesion?: string;
  nacionalidad?: string;
  notas?: string;
  corredor?: { nombre: string } | null;
  leadId?: string | null; // llegó como lead (bandeja de Leads)
}

// documento que firma la persona (dgPersona en src/main.js, dePersona() en src/docgen.js)
export interface IDocumentoPersona {
  titulo: string;
  fecha: string;
  estado?: string; // en_firma, firmado, pendiente_pago
  origen?: string; // 'asset' si se creó en Asset
  operacion?: number | string;
  archivo?: string;
  propiedad?: { codigo: string } | null;
}
