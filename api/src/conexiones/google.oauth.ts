// Google como proveedor OAuth, para el calendario y el Drive. La app de Asset en Google (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET, un
// cliente OAuth de tipo «Aplicación web») vive solo en el servidor. Hay DOS conexiones que usan la misma app:
//  · «google»           — la cuenta de CADA usuario (la conecta cada corredor): su Google Calendar (las visitas de Asset se crean ahí)
//                         y su Drive (permiso acotado drive.file: la app solo ve los archivos que ella misma crea).
//  · «google_corredora» — el Drive GENERAL de la empresa (lo conecta el administrador, una vez): ahí van copia de los documentos.
// Autorización con PKCE (S256), acceso sin conexión (refresh_token) y consentimiento siempre (si no, Google no devuelve el refresh_token
// la segunda vez). El token de acceso dura 1 hora; el de renovación no rota (al renovar no llega uno nuevo: se conserva el anterior).
// En pruebas, GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL y GOOGLE_API_URL apuntan a un Google falso.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import type { Env } from '../config/env';
import { tokensDesde, type ProveedorOAuth, type TokensOAuth } from './proveedores';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';
export const ALCANCE_CALENDARIO = 'https://www.googleapis.com/auth/calendar.events';
export const ALCANCE_DRIVE = 'https://www.googleapis.com/auth/drive.file';

/** error del servidor de tokens de Google, con su código (invalid_grant → hay que volver a conectar) */
class ErrorGoogle extends Error {
  constructor(
    mensaje: string,
    readonly error: string | undefined,
    readonly status: number,
  ) {
    super(mensaje);
  }
}

/** lo común: la app de Google y el OAuth; cada proveedor dice su id, su dueño y sus permisos */
abstract class GoogleBase implements ProveedorOAuth {
  abstract readonly id: string;
  abstract readonly nombre: string;
  abstract readonly dueno: 'usuario' | 'corredora';
  protected abstract readonly alcances: string[];
  private readonly auth: string;
  private readonly tokenUrl: string;
  private readonly userinfo: string;
  private readonly clientId: string;
  private readonly secreto: string;

  constructor(config: ConfigService<Env, true>) {
    const produccion = config.get('NODE_ENV', { infer: true }) === 'production';
    this.auth = (!produccion && config.get('GOOGLE_AUTH_URL', { infer: true })) || AUTH;
    this.tokenUrl = (!produccion && config.get('GOOGLE_TOKEN_URL', { infer: true })) || TOKEN;
    this.userinfo = (!produccion && config.get('GOOGLE_USERINFO_URL', { infer: true })) || USERINFO;
    this.clientId = (config.get('GOOGLE_CLIENT_ID', { infer: true }) ?? '').trim();
    this.secreto = (config.get('GOOGLE_CLIENT_SECRET', { infer: true }) ?? '').trim();
  }

  /** ¿el servidor tiene la app de Google? Si no, el proveedor no se registra. */
  get configurado() {
    return !!(this.clientId && this.secreto);
  }

  async autorizar({ redirectUri, state }: { redirectUri: string; state: string }) {
    const verificador = randomBytes(48).toString('base64url');
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: ['openid', 'email', ...this.alcances].join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      code_challenge: createHash('sha256').update(verificador).digest('base64url'),
      code_challenge_method: 'S256',
    });
    return { url: `${this.auth}?${q.toString()}`, verificador };
  }

  canjear({ redirectUri, codigo, verificador }: { redirectUri: string; codigo: string; verificador: string }) {
    return this.token({ grant_type: 'authorization_code', code: codigo, redirect_uri: redirectUri, code_verifier: verificador });
  }

  renovar({ tokenRenovar }: { redirectUri: string; tokenRenovar: string }) {
    return this.token({ grant_type: 'refresh_token', refresh_token: tokenRenovar });
  }

  private async token(form: Record<string, string>): Promise<TokensOAuth> {
    const r = await fetch(this.tokenUrl, {
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
      error_description?: string;
    } | null;
    if (!r.ok || !j?.access_token)
      throw new ErrorGoogle(j?.error_description || j?.error || `Google respondió ${r.status}`, j?.error, r.status);
    return tokensDesde({ ...j, access_token: j.access_token });
  }

  async cuenta(acceso: string) {
    const r = await fetch(this.userinfo, { headers: { authorization: `Bearer ${acceso}` }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return { id: null, nombre: null };
    const j = (await r.json().catch(() => ({}))) as { sub?: string; email?: string; name?: string };
    return { id: j.sub ?? null, nombre: j.email || j.name || null };
  }
}

/** la cuenta de Google de cada usuario: su calendario (visitas) y su Drive */
@Injectable()
export class GoogleOAuth extends GoogleBase {
  readonly id = 'google';
  readonly nombre = 'Google (calendario y Drive)';
  readonly dueno = 'usuario' as const;
  protected readonly alcances = [ALCANCE_CALENDARIO, ALCANCE_DRIVE];
  // Nest necesita el constructor en cada clase para saber qué inyectar (no lo hereda de la base)
  constructor(config: ConfigService<Env, true>) {
    super(config);
  }
}

/** el Drive general de la empresa: lo conecta el administrador, una vez */
@Injectable()
export class GoogleEmpresaOAuth extends GoogleBase {
  readonly id = 'google_corredora';
  readonly nombre = 'Google Drive de la empresa';
  readonly dueno = 'corredora' as const;
  protected readonly alcances = [ALCANCE_DRIVE];
  constructor(config: ConfigService<Env, true>) {
    super(config);
  }
}
