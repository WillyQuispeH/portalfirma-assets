// Portalfirma (firma digital y plantillas) como proveedor OAuth. Es el mismo servidor MCP que usa el conector de
// Portalfirma en Claude: OAuth 2.1 con PKCE en integracion.portalfirma.cl, con registro dinámico del cliente (Asset
// se registra solo la primera vez y guarda su client_id en oauth_clientes).
// La sesión es de la CORREDORA: en Portalfirma una cuenta tiene varios usuarios que comparten la billetera, así que
// el administrador conecta la cuenta una vez y todos los corredores firman con ella (Asset anota quién envió cada
// documento en la tabla firmas). La revisión de firmas del servidor usa esa misma sesión.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';
import { CifradoService } from './cifrado';
import { tokensDesde, type ProveedorOAuth } from './proveedores';
import { herramientaMcp } from './mcp';

type Info = Awaited<ReturnType<typeof discoverOAuthServerInfo>>;
const INFO_TTL = 60 * 60_000;

@Injectable()
export class PortalfirmaOAuth implements ProveedorOAuth {
  readonly id = 'portalfirma';
  readonly nombre = 'Portalfirma';
  readonly dueno = 'corredora' as const;
  readonly mcpUrl: string;
  private info: { v: Info; t: number } | null = null;
  private readonly clientes = new Map<string, OAuthClientInformationFull>();

  constructor(
    private readonly db: PrismaService,
    private readonly cifrado: CifradoService,
    config: ConfigService<Env, true>,
  ) {
    this.mcpUrl = config.get('PORTALFIRMA_MCP_URL', { infer: true });
  }

  /** dónde está el servidor de autorización y qué admite (se guarda una hora) */
  private async servidor(): Promise<Info & { metadata: NonNullable<Info['authorizationServerMetadata']> }> {
    if (!this.info || Date.now() - this.info.t > INFO_TTL) this.info = { v: await discoverOAuthServerInfo(this.mcpUrl), t: Date.now() };
    const v = this.info.v;
    if (!v.authorizationServerMetadata) throw new Error('Portalfirma no publica su configuración OAuth');
    return { ...v, metadata: v.authorizationServerMetadata };
  }
  private recurso = () => new URL(this.mcpUrl);

  /** el registro de Asset en Portalfirma para esta dirección de retorno (se crea la primera vez) */
  private async cliente(redirectUri: string): Promise<OAuthClientInformationFull> {
    const enMemoria = this.clientes.get(redirectUri);
    if (enMemoria) return enMemoria;
    const fila = await this.db.oauthCliente.findUnique({ where: { proveedor_redirectUri: { proveedor: this.id, redirectUri } } });
    if (fila) {
      const c = this.cifrado.descifrarJson<OAuthClientInformationFull>(fila.clienteCif);
      this.clientes.set(redirectUri, c);
      return c;
    }
    const s = await this.servidor();
    const c = await registerClient(s.authorizationServerUrl, {
      metadata: s.metadata,
      clientMetadata: {
        client_name: 'PortalFirma Asset',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'mcp',
      },
    });
    // si dos pedidos registran a la vez, gana el primero que se guardó
    await this.db.oauthCliente.createMany({ data: [{ proveedor: this.id, redirectUri, clienteCif: this.cifrado.cifrarJson(c) }], skipDuplicates: true });
    const guardado = await this.db.oauthCliente.findUniqueOrThrow({ where: { proveedor_redirectUri: { proveedor: this.id, redirectUri } } });
    const final = this.cifrado.descifrarJson<OAuthClientInformationFull>(guardado.clienteCif);
    this.clientes.set(redirectUri, final);
    return final;
  }

  async autorizar({ redirectUri, state }: { redirectUri: string; state: string }) {
    const s = await this.servidor();
    const r = await startAuthorization(s.authorizationServerUrl, {
      metadata: s.metadata,
      clientInformation: await this.cliente(redirectUri),
      redirectUrl: redirectUri,
      scope: 'mcp',
      state,
      resource: this.recurso(),
    });
    return { url: r.authorizationUrl.toString(), verificador: r.codeVerifier };
  }

  async canjear({ redirectUri, codigo, verificador }: { redirectUri: string; codigo: string; verificador: string }) {
    const s = await this.servidor();
    const t = await exchangeAuthorization(s.authorizationServerUrl, {
      metadata: s.metadata,
      clientInformation: await this.cliente(redirectUri),
      authorizationCode: codigo,
      codeVerifier: verificador,
      redirectUri,
      resource: this.recurso(),
    });
    return tokensDesde(t);
  }

  async renovar({ redirectUri, tokenRenovar }: { redirectUri: string; tokenRenovar: string }) {
    const s = await this.servidor();
    const t = await refreshAuthorization(s.authorizationServerUrl, {
      metadata: s.metadata,
      clientInformation: await this.cliente(redirectUri),
      refreshToken: tokenRenovar,
      resource: this.recurso(),
    });
    return tokensDesde(t);
  }

  /** quién se conectó: la sesión de partner de Portalfirma */
  async cuenta(acceso: string) {
    const r = await herramientaMcp(this.mcpUrl, acceso, 'get_partner_session', {});
    let d: Record<string, unknown> = {};
    try {
      d = JSON.parse(r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')) as Record<string, unknown>;
    } catch {
      /* sin datos de la cuenta: igual queda conectada */
    }
    const u = (d.user ?? d.partner ?? d) as Record<string, unknown>;
    const s = (k: string) => (typeof u[k] === 'string' || typeof u[k] === 'number' ? String(u[k]) : null);
    const correo = s('email');
    const nombre = s('nameEntity') ?? s('name') ?? s('nombre');
    // hoy la sesión de partner trae solo ids (entity_id = la cuenta, user_id = quién autorizó): el nombre queda vacío
    return { id: s('entity_id') ?? s('user_id') ?? s('id') ?? correo, nombre: [nombre, correo].filter(Boolean).join(' · ') || null };
  }
}
