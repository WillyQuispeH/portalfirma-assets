// Cómo se ordenan en Drive los documentos que Asset envía a firmar (la copia que deja en el Drive de la empresa y en el de cada usuario),
// y después el documento ya firmado cuando todos firman:
//   Portalfirma Asset / Propiedades / <CÓDIGO · título> / <Arriendo · Cliente> / <archivo>.pdf      (lo de un negocio)
//   Portalfirma Asset / Propiedades / <CÓDIGO · título> / <tipo de documento> / <archivo>.pdf       (lo que no es de un negocio: mandato…)
//   Portalfirma Asset / Otros documentos / <tipo de documento> / <archivo>.pdf                      (sin propiedad)
// Una carpeta por propiedad, dentro una por negocio, y dentro de cada una los documentos (el nombre del archivo dice cuál es).
export const RAIZ_DRIVE = 'Portalfirma Asset';
export type TTipoDriveDoc =
  | 'Órdenes de visita'
  | 'Cartas oferta'
  | 'Mandatos de arriendo'
  | 'Mandatos de venta'
  | 'Contratos de arriendo'
  | 'Actas de entrega'
  | 'Actas de visita';

/** a qué documento corresponde el nombre con que se envió a firmar («Carta oferta nº 3»…); null si no se reconoce */
export function tipoDeDocumento(nombre: string): TTipoDriveDoc | null {
  const n = nombre.toLowerCase();
  if (/orden de visita/.test(n)) return 'Órdenes de visita';
  if (/carta oferta/.test(n)) return 'Cartas oferta';
  if (/mandato de venta/.test(n)) return 'Mandatos de venta';
  if (/mandato/.test(n)) return 'Mandatos de arriendo';
  if (/contrato de arriendo/.test(n)) return 'Contratos de arriendo';
  if (/acta de entrega/.test(n)) return 'Actas de entrega';
  if (/acta de visita/.test(n)) return 'Actas de visita';
  return null;
}

/** un nombre de carpeta válido: sin barras ni saltos de línea y de largo razonable */
const limpio = (t: string) =>
  t
    .replace(/[\\/\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

/** la ruta de carpetas (dentro de la raíz) para un documento de una propiedad y, si lo tiene, de su negocio */
export function rutaDrive(
  tipo: TTipoDriveDoc | null,
  prop?: { codigo: string; titulo?: string | null } | null,
  negocio?: { tipo: string; cliente?: string | null } | null,
): string[] {
  const otro = tipo ?? 'Documentos';
  if (!prop?.codigo) return ['Otros documentos', otro];
  const carpetaProp = limpio(prop.titulo ? `${prop.codigo} · ${prop.titulo}` : prop.codigo);
  if (!negocio) return ['Propiedades', carpetaProp, otro];
  const t = negocio.tipo === 'venta' ? 'Venta' : negocio.tipo === 'arriendo' ? 'Arriendo' : 'Negocio';
  return ['Propiedades', carpetaProp, limpio(negocio.cliente ? `${t} · ${negocio.cliente}` : t)];
}
