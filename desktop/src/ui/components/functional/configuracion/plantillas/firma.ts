// Cómo se firma un documento: la configuración de firma de su plantilla (Configuración › Plantillas › «Configurar la firma…»).
// Todos los envíos a firmar del documento (orden de visita, carta oferta, contrato, mandatos…) usan SIEMPRE esta configuración.
import type { IFirmaPlantilla } from './tipos';

export const FIRMA_BASE: IFirmaPlantilla = { tipoFirma: 'simple', tramite: 'none' };

/** los mismos tipos que «Firma tu documento» (cada uno con lo que significa, para la ventana «Cómo se firma») */
export const TIPOS_FIRMA_PLANTILLA: [IFirmaPlantilla['tipoFirma'], string, string][] = [
  ['simple', 'Firma simple', 'Quien firma confirma con un código que le llega por correo o al celular.'],
  ['avanzada', 'Firma avanzada', 'Se verifica la identidad de quien firma con certificado o Clave Única. Cuesta más en Portalfirma.'],
  ['visada', 'Visada por Portalfirma', 'Portalfirma visa el documento. Cuesta más en Portalfirma.'],
  ['enrolada', 'Firma avanzada enrolada', 'Firma avanzada de quien ya está enrolado en Portalfirma. Cuesta más en Portalfirma.'],
];
const tipoDe = (f?: IFirmaPlantilla | null) => TIPOS_FIRMA_PLANTILLA.find((t) => t[0] === f?.tipoFirma) || TIPOS_FIRMA_PLANTILLA[0];

/** «Firma simple» · «Firma avanzada» · «Visada por Portalfirma» · «Firma avanzada enrolada» */
export const tipoFirmaTexto = (f?: IFirmaPlantilla | null) => tipoDe(f)[1];
/** «con legalización» o «sin trámite» */
export const tramiteTexto = (f?: IFirmaPlantilla | null) => (f?.tramite === 'legalization' ? 'con legalización notarial' : 'sin trámite');
/** el resumen corto del detalle: «Firma simple · sin trámite» */
export const resumenFirma = (f?: IFirmaPlantilla | null) => `${tipoFirmaTexto(f)} · ${tramiteTexto(f)}`;
/** la frase de las ventanas de cada documento: «firma avanzada y legalización notarial» */
export const fraseFirma = (f?: IFirmaPlantilla | null) => `${tipoFirmaTexto(f).replace(/^./, (c) => c.toLowerCase())}${f?.tramite === 'legalization' ? ' y legalización notarial' : ''}`;
