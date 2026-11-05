// Claves de usuario con argon2id; tokens de renovación con SHA-256 (son aleatorios de 256 bits, no hace falta más).
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import * as argon2 from 'argon2';

export const hashClave = (clave: string) => argon2.hash(clave, { type: argon2.argon2id });
export const verificarClave = (hash: string, clave: string) => argon2.verify(hash, clave).catch(() => false);

// Hash de una clave cualquiera, para gastar el mismo tiempo cuando el email no existe (no revela qué emails hay).
let hashFalso: Promise<string> | null = null;
export const gastarTiempo = async (clave: string) => {
  hashFalso ??= hashClave(randomBytes(16).toString('hex'));
  await verificarClave(await hashFalso, clave);
};

export const nuevoSecreto = () => randomBytes(32).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const igualesHex = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
