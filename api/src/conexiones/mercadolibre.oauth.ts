// Mercado Libre (Portal Inmobiliario) como proveedor OAuth. La app de Asset en Mercado Libre (ML_CLIENT_ID y
// ML_CLIENT_SECRET) vive solo en el servidor: antes iba dentro del instalador y cada equipo hacía su propio OAuth.
// La sesión es de la CORREDORA (una cuenta de Mercado Libre por corredora, con su paquete de publicaciones): la conecta
// el administrador una vez y todos los corredores publican con ella a través del proxy (mercadolibre.ts).
//  · Autorización en auth.mercadolibre.cl con PKCE (S256); el token se canjea en api.mercadolibre.com/oauth/token.
//  · El token de acceso dura 6 horas; el de renovación es de un solo uso (rota en cada renovación: se guarda el nuevo).
//  · La cuenta conectada sale de GET /users/me (id y nickname).
// Fuera de producción, ML_API_URL y ML_AUTH_URL apuntan a otro Mercado Libre (las pruebas levantan uno falso).
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import type { Env } from '../config/env';
import { tokensDesde, type ProveedorOAuth, type TokensOAuth } from './proveedores';

const API = 'https://api.mercadolibre.com';
const AUTH = 'https://auth.mercadolibre.cl/authorization';

/** error del servidor de tokens de Mercado Libre, con su código (invalid_grant → hay que volver a conectar) */
class ErrorMercadoLibre extends Error {
  constructor(
    mensaje: string,
    readonly error: string | undefined,
    readonly status: number,
  ) {
    super(mensaje);
  }
}

@Injectable()
export class MercadoLibreOAuth implements ProveedorOAuth {
  readonly id = 'mercadolibre';
  readonly nombre = 'Mercado Libre';
  readonly dueno = 'corredora' as const;
  /** dirección de la API de Mercado Libre (también la usa el proxy) */
  readonly api: string;
  private readonly auth: string;
  private readonly clientId: string;
  private readonly secreto: string;

  constructor(config: ConfigService<Env, true>) {
    const produccion = config.get('NODE_ENV', { infer: true }) === 'production';
    const sinBarra = (u?: string) => (u ? u.replace(/\/+$/, '') : undefined);
    this.api = (!produccion && sinBarra(config.get('ML_API_URL', { infer: true }))) || API;
    this.auth = (!produccion && config.get('ML_AUTH_URL', { infer: true })) || AUTH;
    this.clientId = (config.get('ML_CLIENT_ID', { infer: true }) ?? '').trim();
    this.secreto = (config.get('ML_CLIENT_SECRET', { infer: true }) ?? '').trim();
  }

  /** ¿el servidor tiene la app de Mercado Libre? Si no, el proveedor no se registra. */
  get configurado() {
    return !!(this.clientId && this.secreto);
  }

  async autorizar({ redirectUri, state }: { redirectUri: string; state: string }) {
    const verificador = randomBytes(48).toString('base64url');
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: createHash('sha256').update(verificador).digest('base64url'),
      code_challenge_method: 'S256',
    });
    return { url: `${this.auth}?${q.toString()}`, verificador };
  }

  canjear({ redirectUri, codigo, verificador }: { redirectUri: string; codigo: string; verificador: string }) {
    return this.token({
      grant_type: 'authorization_code',
      code: codigo,
      redirect_uri: redirectUri,
      code_verifier: verificador,
    });
  }

  renovar({ tokenRenovar }: { redirectUri: string; tokenRenovar: string }) {
    return this.token({ grant_type: 'refresh_token', refresh_token: tokenRenovar });
  }

  private async token(form: Record<string, string>): Promise<TokensOAuth> {
    const r = await fetch(`${this.api}/oauth/token`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...form, client_id: this.clientId, client_secret: this.secreto }).toString(),
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      message?: string;
      error_description?: string;
    } | null;
    if (!r.ok || !j?.access_token)
      throw new ErrorMercadoLibre(
        j?.error_description || j?.message || j?.error || `Mercado Libre respondió ${r.status}`,
        j?.error,
        r.status,
      );
    return tokensDesde({ ...j, access_token: j.access_token });
  }

  async cuenta(acceso: string) {
    const r = await fetch(`${this.api}/users/me`, {
      headers: { accept: 'application/json', authorization: `Bearer ${acceso}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return { id: null, nombre: null };
    const j = (await r.json().catch(() => ({}))) as { id?: number | string; nickname?: string };
    return { id: j.id != null ? String(j.id) : null, nombre: j.nickname || null };
  }
}
