// Cifrado de los secretos de las integraciones (tokens OAuth, claves de API) con AES-256-GCM.
// Formato guardado: «v1.<iv>.<etiqueta>.<cifrado>» en base64url. El «v1» deja cambiar la llave más adelante sin
// perder lo ya guardado (una v2 con otra llave convive con la v1 mientras se re-cifra).
// La llave es CONEXIONES_CLAVE del .env y nunca sale del servidor.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { Env } from '../config/env';

@Injectable()
export class CifradoService {
  private readonly llave: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.llave = Buffer.from(String(config.get('CONEXIONES_CLAVE', { infer: true })), 'base64');
  }

  cifrar(texto: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.llave, iv);
    const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
    return ['v1', iv, c.getAuthTag(), datos].map((x) => (typeof x === 'string' ? x : x.toString('base64url'))).join('.');
  }

  descifrar(guardado: string): string {
    const [v, iv, tag, datos] = guardado.split('.');
    if (v !== 'v1' || !iv || !tag || datos === undefined) throw new Error('Secreto con formato desconocido');
    const d = createDecipheriv('aes-256-gcm', this.llave, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(datos, 'base64url')), d.final()]).toString('utf8');
  }

  cifrarJson = (v: unknown) => this.cifrar(JSON.stringify(v));
  descifrarJson = <T>(s: string) => JSON.parse(this.descifrar(s)) as T;
}
