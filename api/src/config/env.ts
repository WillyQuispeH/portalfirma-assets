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
