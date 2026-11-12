// Variables de entorno de la API, validadas al arrancar: si falta una o es inválida, la API no parte y dice cuál.
// Archivo según NODE_ENV: .env (desarrollo) o .env.production. Ninguno se sube a git: se entregan aparte.
import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().startsWith('postgresql://', 'debe empezar con postgresql://'),
  JWT_SECRETO: z.string().min(32, 'debe tener al menos 32 caracteres (genera uno con crypto.randomBytes)'),
  JWT_DURACION: z.string().default('15m'),
  REFRESH_DIAS: z.coerce.number().int().positive().default(30),
  // almacenamiento de archivos (Cloudflare R2, compatible con S3): fotos y documentos de las propiedades
  R2_ENDPOINT: z.url('debe ser la URL S3 de la cuenta (https://<cuenta>.r2.cloudflarestorage.com)'),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  /** dominio público del bucket (las fotos se sirven desde ahí) */
  R2_DOMAIN: z.url().transform((u) => u.replace(/\/+$/, '')),
  // integraciones (src/conexiones): llave AES-256 para cifrar los tokens de servicios externos (32 bytes en base64)
  CONEXIONES_CLAVE: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'deben ser 32 bytes en base64 (crypto.randomBytes(32))'),
  /** dirección pública de la API (sin /v1): los proveedores OAuth vuelven a <esta>/v1/conexiones/callback/<proveedor> */
  API_URL_PUBLICA: z.url().transform((u) => u.replace(/\/+$/, '')),
  /** servidor MCP de Portalfirma (firma digital y plantillas) */
  PORTALFIRMA_MCP_URL: z.url().default('https://mcp.portalfirma.cl/api/mcp'),
  /** credencial del servicio de archivos de Portalfirma (cabecera «id» de /api/file/getById); sin ella no se bajan PDFs */
  PORTALFIRMA_ARCHIVOS_ID: z.string().optional(),
  /** correos (separados por coma) de quienes revisan lo de la plataforma: casos y reglas notariales de todas las corredoras */
  PLATAFORMA_REVISORES: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    ),
  /** cada cuántos segundos revisa el servidor los WhatsApp programados que tocan (0 = no los envía esta API) */
  PROGRAMADOS_CADA_SEG: z.coerce.number().int().min(0).max(3600).default(30),
  /** cada cuántos segundos revisa el servidor en Portalfirma lo que está en firma (0 = esta API no lo revisa) */
  FIRMAS_CADA_SEG: z.coerce.number().int().min(0).max(86400).default(300),
  /** cada cuántos segundos lee el servidor el WhatsApp de cada corredora para sus asistentes (0 = esta API no lee) */
  LECTOR_CADA_SEG: z.coerce.number().int().min(0).max(600).default(4),
  /**
   * fuera de producción el lector solo atiende corredoras con wechatia de prueba (conexión con «base»): así la API de
   * desarrollo no le responde a clientes reales. «1» lo deja leer también las reales.
   */
  WA_LECTOR_REAL: z
    .string()
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
  /**
   * el número de WhatsApp de la empresa que atiende ESTE ambiente (+56 9 …): la subcuenta de wechatia tiene varios números
   * (producción y desarrollo). Con él, el lector solo procesa los WhatsApp que llegan a ese número y todo lo que se envía
   * sale desde ese número. Vacío = todos los números y el que elija wechatia (como antes).
   */
  WA_NUMERO: z.string().trim().optional(),
  /** clave de la API de Anthropic (Claude) para los asistentes del servidor; sin ella, responden sin IA */
  IA_CLAVE: z.string().optional(),
  IA_MODELO: z.string().default('claude-opus-5-5'),
  /** solo fuera de producción: otra dirección para la API de IA (las pruebas levantan una falsa) */
  IA_URL: z.url().optional(),
  /** IA de la app de escritorio (ia/ia-app.ts): el agente, leer documentos y el asistente legal */
  IA_MODELO_APP: z.string().default('claude-sonnet-5-5'),
  /** IA de la app para textos cortos y rápidos (retocar un WhatsApp de postventa) */
  IA_MODELO_CORTO: z.string().default('claude-haiku-5-5'),
  /** solo para el dictado de la app: Claude no transcribe audio, así que eso usa la transcripción de OpenAI.
   *  Sin esta clave, el dictado pide escribir o pegar la descripción. */
  OPENAI_CLAVE: z.string().optional(),
  /** app de Asset en Mercado Libre (Portal Inmobiliario); sin las dos, la integración no aparece */
  ML_CLIENT_ID: z.string().optional(),
  ML_CLIENT_SECRET: z.string().optional(),
  /** solo fuera de producción: otras direcciones para la API y la autorización de Mercado Libre (las pruebas) */
  ML_API_URL: z.url().optional(),
  ML_AUTH_URL: z.url().optional(),
});

export type Env = z.infer<typeof esquema>;

export function validarEnv(crudo: Record<string, unknown>): Env {
  const r = esquema.safeParse(crudo);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida (revisa tu archivo .env):\n${detalle}`);
  }
  return r.data;
}

export const archivoEnv = () => (process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
