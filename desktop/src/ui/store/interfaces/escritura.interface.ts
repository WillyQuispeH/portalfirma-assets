// Firmas presenciales (trámites notariales): escrituras públicas, protocolizaciones y reducciones.
// Lo que analiza el motor notarial (src/renderer/notarial.js y materias.js) se deja como `any`: esos módulos
// también corren en Node para las pruebas y son la fuente de verdad de su forma.
/* eslint-disable @typescript-eslint/no-explicit-any -- resultados del motor notarial */

export type TTramite = 'escritura' | 'protocolizacion' | 'reduccion';
export type TPasoEscritura = 'tramite' | 'doc' | 'rev';
export type TVistaVisor = 'orig' | 'notaria' | 'ambos';

// Un archivo leído por el proceso principal (escr:open, escr:read y sus versiones para documentos privados)
export interface IArchivoNotarial {
  kind: 'word' | 'pdf' | 'image';
  name: string;
  path?: string;
  bytes: Uint8Array; // el PDF (un Word ya viene convertido)
  raw?: Uint8Array; // el Word original
  pdf?: Uint8Array; // vista del Word como PDF (minutas)
  text?: string;
  mime?: string;
}

// Un documento privado ya leído (Word exacto, o PDF/imagen leído con IA)
export interface IDocPrivado {
  name: string;
  bytes: Uint8Array;
  raw?: Uint8Array;
  pages: number;
  text: string;
  origen: 'Word' | 'PDF' | 'Imagen';
  ia?: any[]; // lo que devolvió la IA por cada lote de hojas
}

// Datos del documento privado que completa el cliente (más lo deducido)
export interface IDatosPrivado {
  email: string; tel: string; nota: string; declara: boolean;
  titulo: string; partes: string[]; requirente: string; descripcion: string;
  firmante: string; fechaFirma: string; patente?: string; calidad: string;
}

export interface IMinutaOpciones { titulo: string; partes: string[]; convertir?: boolean; cierre?: boolean; _tp?: boolean }

export interface IActoAgregado { value: string | null; nombre: string; frase: string }

export interface INotariaRed {
  id: string; nombre: string; notario: string; titular: boolean; titularDe?: string;
  numero?: number; ordinal?: string; ciudad?: string; comuna: string; direccion: string; dirCorta?: string;
  horario: string; tomaHoras: number; servicios: TTramite[]; prueba?: boolean;
}
export type TNotariaElegida = INotariaRed | { auto: true };

export interface IArchivoEnviado { kind: string; name: string }
export interface ITramiteEnviado {
  operation: string;
  tramite: TTramite;
  titulo?: string;
  materia?: string;
  status: string; // cotizacion, pagado, aceptado, pausado_ajuste_tarifa, citado, firmado, cerrado
  estado: string; // el texto del estado
  creado: string;
  total: number | null;
  archivos?: (IArchivoEnviado | string)[];
  notaria?: { asignacion?: string; nombre?: string; notario?: string; direccion?: string; comuna?: string; prueba?: boolean } | null;
}

export interface IProto { docs: IDocPrivado[]; info: any; d: IDatosPrivado | null }

export interface ICotizacion { lineas: { concepto: string; detalle: string; monto: number }[]; total: number | null; cotizacion: boolean }

// El estado del trámite en preparación. Los nombres son los del módulo antiguo (window.Escrituras._s),
// que las pruebas leen.
export interface IEscrituraDatos {
  sel: string; // 'draft', 'reglas' o el número del trámite enviado
  vista: TVistaVisor;
  tramite: TTramite | null;
  paso: TPasoEscritura;
  raw: string; // texto de la minuta
  name: string;
  orig: { name: string; path?: string; bytes?: Uint8Array; pdf?: Uint8Array } | null;
  a: any; // análisis de la minuta (Notarial.analyze)
  o: IMinutaOpciones | null;
  materia: string | null;
  sug: any[]; // materias sugeridas (Materias.clasificar)
  descartados: Set<string>;
  agregados: IActoAgregado[];
  contactos: Record<string, { email?: string; tel?: string }>;
  proto: IProto;
  red: any; // texto base de la reducción (Notarial.reduccionTexto)
  redCuerpo: string | null; // el escrito modificado por el cliente
  notaria: TNotariaElegida | null;
  hojasEsc: number;
}
