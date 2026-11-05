// Cliente MCP (protocolo de herramientas de Portalfirma) con un token de acceso ya resuelto. Se reutiliza la conexión
// mientras el token sea el mismo y se cierra tras 5 minutos sin uso: abrirla cuesta un ida y vuelta de saludo.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHash } from 'crypto';

export interface ResultadoMcp {
  content: { type: string; text?: string; [k: string]: unknown }[];
  structuredContent?: unknown;
  isError?: boolean;
}

/** El servidor MCP rechazó el token (401): hay que renovarlo y reintentar. */
export class TokenRechazadoError extends Error {}

const INACTIVO_MS = 5 * 60_000;
const abiertas = new Map<string, { c: Client; t: NodeJS.Timeout }>();
const clave = (url: string, token: string) => url + '|' + createHash('sha256').update(token).digest('hex');

const es401 = (e: unknown) => {
  const x = e as { code?: number; status?: number; message?: string; constructor?: { name?: string } };
  return x?.code === 401 || x?.status === 401 || /UnauthorizedError/.test(x?.constructor?.name ?? '') || /\b401\b|unauthori[sz]ed|invalid_token/i.test(x?.message ?? '');
};

async function cliente(url: string, token: string): Promise<Client> {
  const k = clave(url, token);
  const a = abiertas.get(k);
  if (a) {
    a.t.refresh();
    return a.c;
  }
  const c = new Client({ name: 'portalfirma-asset-api', version: '1.0.0' });
  const transporte = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  try {
    await c.connect(transporte);
  } catch (e) {
    if (es401(e)) throw new TokenRechazadoError('Token rechazado');
    throw e;
  }
  const t = setTimeout(() => cerrar(k), INACTIVO_MS);
  t.unref();
  abiertas.set(k, { c, t });
  return c;
}

function cerrar(k: string) {
  const a = abiertas.get(k);
  if (!a) return;
  abiertas.delete(k);
  clearTimeout(a.t);
  void a.c.close().catch(() => null);
}

/** Llama una herramienta. Lanza TokenRechazadoError si el token no sirve. */
export async function herramientaMcp(url: string, token: string, nombre: string, args: Record<string, unknown>): Promise<ResultadoMcp> {
  const c = await cliente(url, token);
  try {
    return (await c.callTool({ name: nombre, arguments: args }, undefined, { timeout: 120_000 })) as ResultadoMcp;
  } catch (e) {
    cerrar(clave(url, token));
    if (es401(e)) throw new TokenRechazadoError('Token rechazado');
    throw e;
  }
}

/** Todas las herramientas que publica el servidor (incluye las que Portalfirma agregue después). */
export async function herramientasMcp(url: string, token: string) {
  const c = await cliente(url, token);
  try {
    const out: Awaited<ReturnType<Client['listTools']>>['tools'] = [];
    let cursor: string | undefined;
    do {
      const r = await c.listTools(cursor ? { cursor } : {});
      out.push(...r.tools);
      cursor = r.nextCursor;
    } while (cursor);
    return out;
  } catch (e) {
    cerrar(clave(url, token));
    if (es401(e)) throw new TokenRechazadoError('Token rechazado');
    throw e;
  }
}
