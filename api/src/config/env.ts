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
    .transform((v) => v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)),
  /** cada cuántos segundos revisa el servidor los WhatsApp programados que tocan (0 = no los envía esta API) */
  PROGRAMADOS_CADA_SEG: z.coerce.number().int().min(0).max(3600).default(30),
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
