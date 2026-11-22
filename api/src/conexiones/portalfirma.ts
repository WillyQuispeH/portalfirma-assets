// Portalfirma a través de la API: /v1/portalfirma. La app de escritorio ya no guarda la sesión de Portalfirma; pide
// aquí cada herramienta y la API la llama con la sesión de la corredora (tabla conexiones; la conecta el
// administrador), renovándola si hace falta.
//  · GET  /herramientas           lista de herramientas que publica Portalfirma;
//  · POST /herramientas/:nombre   { argumentos } → el resultado tal cual lo entrega Portalfirma (content, isError…);
//  · GET  /archivos/:contrato     el PDF de una operación (API de integración de Portalfirma), en base64.
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
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

type VersionArchivo = 'original' | 'signed' | 'legalized';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import type { Env } from '../config/env';
import { ConexionesService, type DuenoConexion } from './conexiones';
import { herramientaMcp, herramientasMcp, TokenRechazadoError, type ResultadoMcp } from './mcp';
import { SesionVencidaError } from './proveedores';
import { PortalfirmaApiService } from './portalfirma-api';

const nombreValido = /^[a-z][a-z0-9_]{1,80}$/;
const llamadaEsquema = z.object({ argumentos: z.record(z.string(), z.unknown()).default({}) });

@Injectable()
export class PortalfirmaService {
  private readonly url: string;
  private readonly produccion: boolean;

  constructor(
    private readonly conexiones: ConexionesService,
    private readonly api: PortalfirmaApiService,
    config: ConfigService<Env, true>,
  ) {
    this.url = config.get('PORTALFIRMA_MCP_URL', { infer: true });
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
  async archivo(u: UsuarioToken, contrato: string, version?: VersionArchivo) {
    return this.descargar(this.conexiones.duenoDe(u, 'portalfirma'), contrato, version);
  }

  /** lo mismo para los procesos del servidor que no tienen un usuario (p. ej. copiar a Drive el documento ya firmado) */
  archivoDeCorredora(corredoraId: string, contrato: string) {
    return this.descargar({ corredoraId, usuarioId: null }, contrato);
  }

  /** el PDF de una operación, por la API de integración de Portalfirma con las credenciales de la corredora (si faltan: 409 NECESITA_CONEXION) */
  private async descargar(d: DuenoConexion, contrato: string, version?: VersionArchivo) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(contrato)) throw new NotFoundException('Contrato no válido');
    return this.api.archivo(d.corredoraId, contrato, version);
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

  /** `?version=original|signed|legalized` pide esa versión del documento; sin ella, la más avanzada */
  @Get('archivos/:contrato')
  archivo(@UsuarioActual() u: UsuarioToken, @Param('contrato') c: string, @Query('version') v?: string) {
    const version = v === 'original' || v === 'signed' || v === 'legalized' ? v : undefined;
    return this.s.archivo(u, c, version);
  }
}
