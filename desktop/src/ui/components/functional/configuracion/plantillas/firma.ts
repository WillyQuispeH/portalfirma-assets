// Cómo se firma un documento: la configuración de firma de su plantilla (Configuración › Plantillas › «Configurar la firma…»).
// Todos los envíos a firmar del documento (orden de visita, carta oferta, contrato, mandatos…) usan SIEMPRE esta configuración.
import type { IFirmaPlantilla } from './tipos';

export const FIRMA_BASE: IFirmaPlantilla = { tipoFirma: 'simple', tramite: 'none' };

/** «Firma simple» · «Firma avanzada» */
export const tipoFirmaTexto = (f?: IFirmaPlantilla | null) => (f?.tipoFirma === 'avanzada' ? 'Firma avanzada' : 'Firma simple');
/** «con legalización» o «sin trámite» */
export const tramiteTexto = (f?: IFirmaPlantilla | null) => (f?.tramite === 'legalization' ? 'con legalización notarial' : 'sin trámite');
/** el resumen corto del detalle: «Firma simple · sin trámite» */
export const resumenFirma = (f?: IFirmaPlantilla | null) => `${tipoFirmaTexto(f)} · ${tramiteTexto(f)}`;
/** la frase de las ventanas de cada documento: «firma avanzada y legalización notarial» */
export const fraseFirma = (f?: IFirmaPlantilla | null) => `firma ${f?.tipoFirma === 'avanzada' ? 'avanzada' : 'simple'}${f?.tramite === 'legalization' ? ' y legalización notarial' : ''}`;
