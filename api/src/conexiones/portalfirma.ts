// Portalfirma a través de la API: /v1/portalfirma. La app de escritorio ya no guarda la sesión de Portalfirma; pide
// aquí cada herramienta y la API la llama con la sesión de la corredora (tabla conexiones; la conecta el
// administrador), renovándola si hace falta.
//  · GET  /herramientas           lista de herramientas que publica Portalfirma;
//  · POST /herramientas/:nombre   { argumentos } → el resultado tal cual lo entrega Portalfirma (content, isError…);
//  · GET  /archivos/:contrato     el PDF de una operación (servicio oficial de archivos), en base64.
// Si la corredora no ha conectado Portalfirma o la sesión venció, responde 409 con codigo NECESITA_CONEXION.
import {
  BadGatewayException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import type { Env } from '../config/env';
import { ConexionesService, type DuenoConexion } from './conexiones';
import { herramientaMcp, herramientasMcp, TokenRechazadoError, type ResultadoMcp } from './mcp';
import { SesionVencidaError } from './proveedores';

const ARCHIVOS_URL = 'https://api.portalfirma.cl/api/file/getById';
const nombreValido = /^[a-z][a-z0-9_]{1,80}$/;
const llamadaEsquema = z.object({ argumentos: z.record(z.string(), z.unknown()).default({}) });

@Injectable()
export class PortalfirmaService {
  private readonly url: string;
  private readonly archivosId?: string;
  private readonly produccion: boolean;

  constructor(
    private readonly conexiones: ConexionesService,
    config: ConfigService<Env, true>,
  ) {
    this.url = config.get('PORTALFIRMA_MCP_URL', { infer: true });
    this.archivosId = config.get('PORTALFIRMA_ARCHIVOS_ID', { infer: true }) || undefined;
    this.produccion = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  /** el servidor MCP de esa sesión: el de Portalfirma; fuera de producción, una sesión puede traer otro (las pruebas) */
  private async urlDe(d: DuenoConexion) {
    if (this.produccion) return this.url;
    const datos = await this.conexiones.datosDe('portalfirma', d).catch(() => null);
    return typeof datos?.mcpUrl === 'string' ? datos.mcpUrl : this.url;
  }

  /** corre `fn` con un token vigente; si Portalfirma lo rechaza, renueva una vez y reintenta */
  private async conToken<T>(d: DuenoConexion, fn: (token: string) => Promise<T>): Promise<T> {
    try {
      const token = await this.conexiones.acceso('portalfirma', d);
      try {
        return await fn(token);
      } catch (e) {
        if (!(e instanceof TokenRechazadoError)) throw e;
        return await fn(await this.conexiones.acceso('portalfirma', d, token));
      }
    } catch (e) {
      if (e instanceof SesionVencidaError)
        throw new ConflictException({ codigo: 'NECESITA_CONEXION', proveedor: 'portalfirma', message: e.message });
      if (e instanceof TokenRechazadoError)
        throw new ConflictException({
          codigo: 'NECESITA_CONEXION',
          proveedor: 'portalfirma',
          message: 'Portalfirma rechazó la sesión: vuelve a conectarla en Asset.',
        });
      throw e;
    }
  }

  /** para los procesos de la API (p. ej. la revisión de firmas): la sesión de una corredora dada */
  async llamarComo(d: DuenoConexion, nombre: string, args: Record<string, unknown> = {}): Promise<ResultadoMcp> {
    const url = await this.urlDe(d);
    return this.conToken(d, (t) => herramientaMcp(url, t, nombre, args));
  }

  llamar(u: UsuarioToken, nombre: string, args: Record<string, unknown>) {
    if (!nombreValido.test(nombre)) throw new NotFoundException('Esa herramienta no existe');
    return this.llamarComo(this.conexiones.duenoDe(u, 'portalfirma'), nombre, args).catch((e: unknown) => {
      if (e instanceof ConflictException) throw e;
      throw new BadGatewayException(`Portalfirma no respondió: ${(e as Error).message}`);
    });
  }

  async herramientas(u: UsuarioToken) {
    const d = this.conexiones.duenoDe(u, 'portalfirma');
    const url = await this.urlDe(d);
    return this.conToken(d, (t) => herramientasMcp(url, t));
  }

  /** PDF de una operación. Pide que la corredora tenga Portalfirma conectado (la credencial del servicio es de Asset). */
  async archivo(u: UsuarioToken, contrato: string) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(contrato)) throw new NotFoundException('Contrato no válido');
    if (!this.archivosId)
      throw new ServiceUnavailableException('Falta configurar el servicio de archivos de Portalfirma en el servidor.');
    await this.conToken(this.conexiones.duenoDe(u, 'portalfirma'), async () => null);
    const r = await fetch(ARCHIVOS_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', id: this.archivosId },
      body: JSON.stringify({ contract_id: contrato }),
      signal: AbortSignal.timeout(60_000),
    }).catch((e: Error) => {
      throw new BadGatewayException(`No pude conectarme con Portalfirma para traer el documento (${e.message}).`);
    });
    const j = (await r.json().catch(() => null)) as {
      success?: boolean;
      error?: unknown;
      data?: { name?: string; base64?: string; updated?: string };
    } | null;
    if (!r.ok || !j?.success || !j.data?.base64) {
      const e = j?.error as { message?: string } | string | undefined;
      throw new BadGatewayException(
        `Portalfirma no entregó el documento: ${(typeof e === 'string' ? e : e?.message) || (r.ok ? 'respuesta sin archivo' : 'error ' + r.status)}.`,
      );
    }
    return {
      nombre: j.data.name ?? null,
      base64: String(j.data.base64).replace(/^data:[^,]*,/, ''),
      actualizado: j.data.updated ?? null,
    };
  }
}

@Controller('portalfirma')
export class PortalfirmaController {
  constructor(private readonly s: PortalfirmaService) {}

  @Get('herramientas')
  herramientas(@UsuarioActual() u: UsuarioToken) {
    return this.s.herramientas(u);
  }

  @Post('herramientas/:nombre')
  llamar(
    @UsuarioActual() u: UsuarioToken,
    @Param('nombre') nombre: string,
    @Body(new ZodPipe(llamadaEsquema)) b: z.infer<typeof llamadaEsquema>,
  ) {
    return this.s.llamar(u, nombre, b.argumentos);
  }

  @Get('archivos/:contrato')
  archivo(@UsuarioActual() u: UsuarioToken, @Param('contrato') c: string) {
    return this.s.archivo(u, c);
  }
}
