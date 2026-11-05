// Notaría virtual: trámites del catálogo de Portalfirma (plantillas aprobadas) y su formulario.
export interface ITramite { template_version_id: string; name: string; description?: string; url?: string }

export type TTipoCampo = 'text' | 'date' | 'email' | 'phone' | 'rut' | 'select' | string;
export interface IVariable { id: string; name?: string; label?: string; input_type: TTipoCampo; required?: boolean }
export interface IGrupoFormulario { group: string; type?: 'signer' | string; variables?: IVariable[] }
export interface IFormulario {
  template_version_id: string;
  name: string;
  description?: string;
  groups?: IGrupoFormulario[];
  requires_property?: boolean;
  url?: string; // la página del trámite en la web (viene del catálogo)
}
