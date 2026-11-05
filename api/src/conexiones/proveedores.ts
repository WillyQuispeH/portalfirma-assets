// Lo común de los proveedores OAuth. Cada proveedor (Portalfirma, Mercado Libre, Google Drive…) dice cómo armar la
// página de autorización, cómo canjear el código, cómo renovar y quién es la cuenta conectada. El resto (guardar
// cifrado, renovar a tiempo y sin carreras, estados) lo hace ConexionesService igual para todos.

export interface TokensOAuth {
  acceso: string;
  /** algunos proveedores no lo entregan al renovar: entonces se conserva el anterior */
  renovar?: string;
  expiraEn?: Date;
  alcance?: string;
}

export interface ProveedorOAuth {
  readonly id: string;
  readonly nombre: string;
  /** de quién es la sesión: de cada usuario o de toda la corredora (la conecta el administrador) */
  readonly dueno: 'usuario' | 'corredora';
  autorizar(o: { redirectUri: string; state: string }): Promise<{ url: string; verificador: string }>;
  canjear(o: { redirectUri: string; codigo: string; verificador: string }): Promise<TokensOAuth>;
  renovar(o: { redirectUri: string; tokenRenovar: string }): Promise<TokensOAuth>;
  cuenta(acceso: string): Promise<{ id?: string | null; nombre?: string | null }>;
}

/** El proveedor dice que el token de renovación ya no sirve (revocado o vencido): hay que volver a conectar. */
export class SesionVencidaError extends Error {
  constructor(mensaje = 'La sesión con el servicio venció: vuelve a conectar la cuenta.') {
    super(mensaje);
  }
}

/** ¿El error del proveedor significa que la autorización ya no vale? (invalid_grant / invalid_client / 401) */
export function esSesionVencida(e: unknown): boolean {
  const x = e as { errorCode?: string; error?: string; status?: number; message?: string; constructor?: { name?: string } };
  const codigo = x?.errorCode ?? x?.error ?? '';
  return (
    ['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(codigo) ||
    /InvalidGrant|InvalidClient|UnauthorizedClient/.test(x?.constructor?.name ?? '') ||
    /invalid_grant/i.test(x?.message ?? '')
  );
}

/** Token de proveedor → TokensOAuth (expires_in en segundos). */
export function tokensDesde(t: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }): TokensOAuth {
  return {
    acceso: t.access_token,
    renovar: t.refresh_token || undefined,
    expiraEn: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : undefined,
    alcance: t.scope || undefined,
  };
}
