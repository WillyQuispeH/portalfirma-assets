// Herramientas del equipo del ejecutivo (Pedro, Juanita, Diego, Fernanda) que corren EN EL SERVIDOR: así el corredor administra todo desde WhatsApp
// en terreno, con la app de escritorio cerrada. Ver LEEME.md en esta carpeta (convenciones y reparto).
import type { HerramientaIa } from '../ia';

/** un archivo que el corredor mandó por WhatsApp en este turno (ya descargado) */
export interface AdjuntoRecibido {
  nombre: string;
  /** application/pdf, image/jpeg… */
  mime: string;
  bytes: Buffer;
}

/** quién habla y qué mandó en este turno */
export interface CtxHerr {
  corredoraId: string;
  usuarioId: string;
  nombre: string;
  /** administrador de la corredora: ve todo; el corredor, solo lo suyo */
  admin: boolean;
  /** lo que escribió (o dijo) el corredor en este turno */
  texto: string;
  /** los archivos que mandó en este turno (PDF, fotos…) */
  adjuntos: AdjuntoRecibido[];
}

/** una herramienta que el modelo puede llamar: su definición para la IA y lo que hace */
export interface Herramienta extends HerramientaIa {
  ejecutar: (c: CtxHerr, a: Record<string, unknown>) => Promise<unknown>;
}

/** una clase Nest que aporta herramientas (se suma en registro.ts) */
export interface ProveedorHerramientas {
  readonly herramientas: Herramienta[];
}

/** el objeto JSON Schema de entrada, sin repetir «type: object» en cada herramienta */
export const esquema = (properties: Record<string, unknown> = {}, required: string[] = []): HerramientaIa['input_schema'] => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
});
