// Mercado Libre (Portal Inmobiliario) a través de la API: /v1/mercadolibre. La app de escritorio ya no guarda tokens
// de Mercado Libre ni la app (client_id y secreto): pide aquí cada llamada y la API la hace con la sesión de la
// corredora (tabla conexiones; la conecta el administrador), renovándola si hace falta.
//  · POST /api  { metodo, ruta, cuerpo? } → { status, cuerpo }: la respuesta de Mercado Libre tal cual (también sus
//    errores 4xx, para que la app muestre el motivo). Solo rutas relativas de api.mercadolibre.com y solo las que usa
//    la app (avisos, paquetes, interesados, métricas, preguntas, categorías y ubicaciones); nunca /oauth.
// Las consultas públicas (categorías y ubicaciones) no necesitan la cuenta conectada. Para el resto, si la corredora
// no ha conectado Mercado Libre o la sesión venció, responde 409 con codigo NECESITA_CONEXION.
import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  Injectable,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import { ConexionesService, type DuenoConexion } from './conexiones';
import { MercadoLibreOAuth } from './mercadolibre.oauth';
import { SesionVencidaError } from './proveedores';

const ID = 'mercadolibre';
/** lo que la app usa de la API de Mercado Libre */
const PERMITIDAS = [
  /^\/items(\/|\?|$)/,
  /^\/users\/(me|\d+)(\/|\?|$)/,
  /^\/vis\/users\/\d+\/leads(\/|\?|$)/,
  /^\/questions(\/|\?|$)/,
  /^\/answers(\/|\?|$)/,
  /^\/my\/received_questions(\/|\?|$)/,
  /^\/categories\//,
  /^\/classified_locations\//,
  /^\/sites\/MLC(\/|\?|$)/,
];
/** consultas públicas: no llevan token ni piden la cuenta conectada */
const PUBLICAS = [/^\/categories\//, /^\/classified_locations\//, /^\/sites\/MLC(\/|\?|$)/];
// ruta relativa, sin esquema, host, «..», «//», «\» ni caracteres raros
const FORMA = /^\/[A-Za-z0-9_\-./]*(\?[A-Za-z0-9_\-.,=&%:+]*)?$/;

const llamadaEsquema = z.object({
  metodo: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  ruta: z.string().min(1).max(2000),
  cuerpo: z.unknown().optional(),
});
type Llamada = z.infer<typeof llamadaEsquema>;

/** Mercado Libre rechazó el token (401) */
class TokenRechazado extends Error {}

@Injectable()
export class MercadoLibreService {
  constructor(
    private readonly conexiones: ConexionesService,
    private readonly oauth: MercadoLibreOAuth,
  ) {}

  /** ¿la ruta se puede pedir? (lanza 403 si no) */
  private validar(ruta: string) {
    const camino = ruta.split('?')[0];
    if (!FORMA.test(ruta) || camino.includes('..') || camino.includes('//'))
      throw new BadRequestException('La ruta debe ser relativa a la API de Mercado Libre (p. ej. /items/MLC123).');
    if (!PERMITIDAS.some((r) => r.test(ruta)))
      throw new ForbiddenException('Esa ruta de Mercado Libre no está permitida desde Asset.');
    return PUBLICAS.some((r) => r.test(ruta));
  }

  private async pedir(l: Llamada, token: string | null) {
    const conCuerpo = l.cuerpo !== undefined && l.metodo !== 'GET';
    const r = await fetch(this.oauth.api + l.ruta, {
      method: l.metodo,
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(conCuerpo ? { 'content-type': 'application/json' } : {}),
      },
      body: conCuerpo ? JSON.stringify(l.cuerpo) : undefined,
      signal: AbortSignal.timeout(60_000),
    }).catch((e: Error) => {
      throw new BadGatewayException(`Mercado Libre no respondió: ${e.message}`);
    });
    if (r.status === 401 && token) throw new TokenRechazado();
    const texto = await r.text();
    let cuerpo: unknown = null;
    try {
      cuerpo = texto ? JSON.parse(texto) : null;
    } catch {
      cuerpo = { message: texto.slice(0, 500) };
    }
    return { status: r.status, cuerpo };
  }

  private necesitaConexion(mensaje: string) {
    return new ConflictException({ codigo: 'NECESITA_CONEXION', proveedor: ID, message: mensaje });
  }

  /** con la sesión de la corredora `d`; si Mercado Libre rechaza el token, renueva una vez y reintenta */
  async llamarComo(d: DuenoConexion, l: Llamada) {
    this.exigirConfigurado();
    if (this.validar(l.ruta) && l.metodo === 'GET') return this.pedir(l, null);
    try {
      const token = await this.conexiones.acceso(ID, d);
      try {
        return await this.pedir(l, token);
      } catch (e) {
        if (!(e instanceof TokenRechazado)) throw e;
        return await this.pedir(l, await this.conexiones.acceso(ID, d, token));
      }
    } catch (e) {
      if (e instanceof SesionVencidaError) throw this.necesitaConexion(e.message);
      if (e instanceof TokenRechazado)
        throw this.necesitaConexion('Mercado Libre rechazó la sesión: vuelve a conectarla en Asset.');
      throw e;
    }
  }

  private exigirConfigurado() {
    if (!this.conexiones.hay(ID))
      throw new ServiceUnavailableException('Mercado Libre no está configurado en el servidor de Asset.');
  }

  llamar(u: UsuarioToken, l: Llamada) {
    this.exigirConfigurado();
    return this.llamarComo(this.conexiones.duenoDe(u, ID), l);
  }
}

@Controller('mercadolibre')
export class MercadoLibreController {
  constructor(private readonly s: MercadoLibreService) {}

  @Post('api')
  @HttpCode(200)
  llamar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(llamadaEsquema)) b: Llamada) {
    return this.s.llamar(u, b);
  }
}
