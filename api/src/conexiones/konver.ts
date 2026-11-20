// KONVER: Portal Inmobiliario (Mercado Libre) y TocToc por una sola API (docs/KONVER - API de portales - documentacion tecnica.pdf).
// Cada corredora tiene SU llave de KONVER (una llave = una cuenta de Mercado Libre + una de TocToc): la pega el administrador
// en Integraciones y queda cifrada en conexiones (proveedor «konver»), o es la del servidor (KONVER_API_KEY) solo para
// KONVER_CORREDORA_ID. La app de escritorio nunca la ve: pide aquí cada llamada.
//  · GET/PUT/DELETE /v1/konver/conexion   estado (con la cuenta de KONVER: Mercado Libre y TocToc), pegar y quitar la llave;
//  · POST /v1/konver/api { metodo, ruta, cuerpo? } → { status, cuerpo } con la respuesta de KONVER tal cual (también sus
//    errores 4xx, para mostrar el motivo). Solo las rutas /v1/… que usa Asset; conectar cuentas y llaves de TocToc: administrador.
//  · POST /v1/konver/webhook/:corredoraId (pública, firmada con HMAC): KONVER avisa cada lead nuevo apenas llega; queda en
//    leads_portal de su propiedad aunque nadie tenga la app abierta (la app crea la persona al verlo: marca delServidor).
//    El webhook se registra solo al pegar la llave (o en la consulta del estado) si la API tiene dirección pública https.
import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { Publico, UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import type { Env } from '../config/env';
import { CifradoService } from './cifrado';

const PROVEEDOR = 'konver';
/** las rutas de KONVER que usa Asset */
const PERMITIDAS: { m: string[]; r: RegExp; admin?: boolean }[] = [
  { m: ['GET'], r: /^\/v1\/cuenta$/ },
  { m: ['GET'], r: /^\/v1\/cuenta\/conectar-mercadolibre$/, admin: true },
  { m: ['DELETE'], r: /^\/v1\/cuenta\/mercadolibre$/, admin: true },   // desconecta Mercado Libre: KONVER revoca su permiso en la cuenta
  { m: ['PUT', 'DELETE'], r: /^\/v1\/cuenta\/toctoc$/, admin: true },
  { m: ['GET'], r: /^\/v1\/ubicaciones\/(regiones|comunas|barrios)(\?[^#]*)?$/ },
  { m: ['POST'], r: /^\/v1\/propiedades(\/validar)?$/ },
  { m: ['GET'], r: /^\/v1\/portal-inmobiliario\/propiedades(\?[^#]*)?$/ },
  { m: ['GET', 'PATCH'], r: /^\/v1\/portal-inmobiliario\/propiedades\/[A-Za-z0-9]+$/ },
  { m: ['POST'], r: /^\/v1\/portal-inmobiliario\/propiedades\/[A-Za-z0-9]+\/(pausar|activar|finalizar)$/ },
  { m: ['GET'], r: /^\/v1\/portal-inmobiliario\/preguntas(\?[^#]*)?$/ },
  { m: ['POST'], r: /^\/v1\/portal-inmobiliario\/preguntas\/\d+\/responder$/ },
  { m: ['GET'], r: /^\/v1\/toctoc\/propiedades$/ },
  { m: ['DELETE'], r: /^\/v1\/toctoc\/propiedades\/[A-Za-z0-9._-]+$/ },
  { m: ['GET'], r: /^\/v1\/leads(\?[^#]*)?$/ },
];
// sin esquema, host, «..», «//» ni caracteres raros
const FORMA = /^\/v1\/[A-Za-z0-9_\-./]*(\?[A-Za-z0-9_\-.,=&%:+]*)?$/;

const llamadaEsquema = z.object({
  metodo: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  ruta: z.string().min(1).max(2000),
  cuerpo: z.unknown().optional(),
});
type Llamada = z.infer<typeof llamadaEsquema>;
const CANAL: Record<string, string> = { whatsapp: 'WhatsApp', question: 'pregunta', call: 'llamada', contact_request: 'solicitud de contacto', visit_request: 'solicitud de visita', schedule: 'solicitud de visita', quotation: 'cotización' };
type LeadKonver = { id: number; portal?: string; fecha?: string; recibido?: string; tipo?: string; propiedad_id?: string; referencia?: string; nombre?: string; email?: string; telefono?: string; mensaje?: string };
const llaveEsquema = z.object({ llave: z.string().trim().regex(/^kp_[A-Za-z0-9_-]{20,200}$/, 'Esa no parece una llave de KONVER (empieza con «kp_»).') });

@Injectable()
export class KonverService {
  private readonly url: string;
  private readonly llaveServidor: string;
  private readonly corredoraServidor: string;
  private readonly publica: string;
  private readonly log = new Logger('KONVER');

  constructor(
    config: ConfigService<Env, true>,
    private readonly db: PrismaService,
    private readonly cifrado: CifradoService,
  ) {
    this.url = config.get('KONVER_API_URL', { infer: true });
    this.llaveServidor = (config.get('KONVER_API_KEY', { infer: true }) ?? '').trim();
    this.corredoraServidor = (config.get('KONVER_CORREDORA_ID', { infer: true }) ?? '').trim();
    this.publica = config.get('API_URL_PUBLICA', { infer: true });
  }

  /** KONVER solo acepta https a una dirección pública (no localhost ni redes internas) */
  private get webhookUrlBase() {
    return /^https:\/\/(?!localhost|127\.|10\.|192\.168\.)/.test(this.publica) ? this.publica : null;
  }

  /** registra (o renueva) el webhook de la corredora en KONVER y guarda el secreto cifrado; sin dirección pública, nada */
  async registrarWebhook(corredoraId: string, llave: string) {
    const base = this.webhookUrlBase;
    if (!base) return false;
    const url = `${base}/v1/konver/webhook/${corredoraId}`;
    const r = await this.pedir(llave, { metodo: 'PUT', ruta: '/v1/cuenta/webhook', cuerpo: { url } }).catch(() => null);
    const secreto = (r?.cuerpo as { secreto?: string } | null)?.secreto;
    const c = await this.db.conexion.findUnique({ where: this.donde(corredoraId) });
    if (!c) return false;
    const datos: Record<string, unknown> = { ...((c.datos as Record<string, unknown>) ?? {}) };
    if (r?.status === 200 && secreto) {
      Object.assign(datos, { webhookCif: this.cifrado.cifrar(secreto), webhookUrl: url, webhookEn: new Date().toISOString(), webhookError: null });
    } else {
      Object.assign(datos, { webhookError: `KONVER respondió ${r?.status ?? 'sin respuesta'} al registrar el webhook.`, webhookIntento: new Date().toISOString() });
    }
    await this.db.conexion.update({ where: this.donde(corredoraId), data: { datos: datos as Prisma.InputJsonValue } });
    return !!secreto;
  }

  /** POST /v1/konver/webhook/:corredoraId — verifica la firma y guarda el lead en su propiedad */
  async recibirWebhook(corredoraId: string, crudo: unknown, firma: string | undefined) {
    if (!/^[0-9a-f-]{36}$/i.test(corredoraId) || !Buffer.isBuffer(crudo)) throw new BadRequestException();
    const c = await this.db.conexion.findUnique({ where: this.donde(corredoraId) });
    const cif = (c?.datos as { webhookCif?: string } | null)?.webhookCif;
    if (!c || c.estado !== 'activa' || !cif) throw new UnauthorizedException();
    const partes: Record<string, string> = {};
    for (const p of String(firma ?? '').split(',')) {
      const i = p.indexOf('=');
      if (i > 0) partes[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    }
    const t = Number(partes.t);
    if (!partes.v1 || !Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) throw new UnauthorizedException();
    const esperado = Buffer.from(createHmac('sha256', this.cifrado.descifrar(cif)).update(`${partes.t}.`).update(crudo).digest('hex'));
    const recibido = Buffer.from(partes.v1);
    if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) throw new UnauthorizedException();
    let ev: { evento?: string; lead?: LeadKonver };
    try {
      ev = JSON.parse(crudo.toString('utf8')) as typeof ev;
    } catch {
      throw new BadRequestException();
    }
    if (ev.evento !== 'lead.nuevo' || !ev.lead?.id) return { ok: true };
    await this.guardarLead(corredoraId, ev.lead).catch((e: Error) => this.log.warn(`lead ${ev.lead?.id}: ${e.message}`));
    return { ok: true };
  }

  /** el lead va a leads_portal de su propiedad (por el aviso MLC… o por la referencia CÓDIGO-V/A); una sola vez por id */
  async guardarLead(corredoraId: string, l: LeadKonver) {
    const tt = l.portal === 'toctoc';
    const ref = String(l.referencia || (tt ? l.propiedad_id : '') || '');
    const m = ref.match(/^(.*)-(V|A)$/);
    const item = tt ? '' : String(l.propiedad_id || '');
    const cod = m ? m[1] : '';
    const filas = await this.db.$queryRaw<{ id: string; op: string; poritem: boolean }[]>`
      select id,
        case when portales->'pi'->'arriendo'->>'itemId' = ${item} then 'arriendo' else 'venta' end as op,
        (${item} <> '' and (portales->'pi'->'venta'->>'itemId' = ${item} or portales->'pi'->'arriendo'->>'itemId' = ${item})) as poritem
      from app.propiedades
      where corredora_id = ${corredoraId}::uuid and eliminado_en is null
        and ((${item} <> '' and (portales->'pi'->'venta'->>'itemId' = ${item} or portales->'pi'->'arriendo'->>'itemId' = ${item}))
          or (${cod} <> '' and upper(regexp_replace(codigo, '[^A-Za-z0-9._-]+', '-', 'g')) = upper(${cod})))
      order by 3 desc
      limit 1`;
    const f = filas[0];
    if (!f) return false;
    const op = f.poritem ? f.op : m ? (m[2] === 'V' ? 'venta' : 'arriendo') : 'venta';
    const id = 'kv-' + l.id;
    const lead = {
      id, portal: tt ? 'TOCTOC' : 'Portal Inmobiliario', canal: l.tipo, canalTxt: CANAL[l.tipo ?? ''] || l.tipo, nombre: l.nombre, email: l.email, telefono: l.telefono,
      mensaje: l.mensaje || '', fecha: l.fecha || l.recibido, ...(tt ? {} : { itemId: l.propiedad_id }), op, visto: false, recibido: new Date().toISOString(), delServidor: true,
    };
    const n = await this.db.$executeRaw`
      update app.propiedades set leads_portal = jsonb_build_array(${JSON.stringify(lead)}::jsonb) || leads_portal, version = version + 1, actualizado_en = now()
      where id = ${f.id}::uuid and not (leads_portal @> jsonb_build_array(jsonb_build_object('id', ${id}::text)))`;
    return n > 0;
  }

  private donde = (corredoraId: string) => ({
    corredoraId_proveedor_dueno: { corredoraId, proveedor: PROVEEDOR, dueno: 'corredora' },
  });

  /** la llave de la corredora (la suya o, solo para KONVER_CORREDORA_ID, la del servidor) */
  async llaveDe(corredoraId: string): Promise<string | null> {
    const c = await this.db.conexion.findUnique({ where: this.donde(corredoraId) });
    if (c?.estado === 'activa' && c.accesoCif) return this.cifrado.descifrar(c.accesoCif);
    if (this.llaveServidor && this.corredoraServidor && corredoraId === this.corredoraServidor) return this.llaveServidor;
    return null;
  }

  private async pedir(llave: string, l: Llamada) {
    const conCuerpo = l.cuerpo !== undefined && l.metodo !== 'GET' && l.metodo !== 'DELETE';
    const r = await fetch(this.url + l.ruta, {
      method: l.metodo,
      headers: {
        accept: 'application/json',
        'x-api-key': llave,
        ...(conCuerpo ? { 'content-type': 'application/json' } : {}),
      },
      // los POST de estado van sin cuerpo: KONVER pide uno vacío
      body: conCuerpo ? JSON.stringify(l.cuerpo) : l.metodo === 'POST' ? '' : undefined,
      signal: AbortSignal.timeout(90_000),
    }).catch((e: Error) => {
      throw new BadGatewayException(`KONVER no respondió: ${e.message}`);
    });
    const texto = await r.text();
    let cuerpo: unknown = null;
    try {
      cuerpo = texto ? JSON.parse(texto) : null;
    } catch {
      cuerpo = { detail: { error: 'respuesta_no_json', mensaje: texto.slice(0, 500) } };
    }
    return { status: r.status, cuerpo };
  }

  async estado(u: UsuarioToken) {
    const c = await this.db.conexion.findUnique({ where: this.donde(u.corredoraId) });
    const propia = c?.estado === 'activa' && !!c.accesoCif;
    const llave = await this.llaveDe(u.corredoraId);
    let cuenta: unknown = null;
    let error: string | null = null;
    if (llave) {
      const r = await this.pedir(llave, { metodo: 'GET', ruta: '/v1/cuenta' }).catch((e: Error) => ({ status: 502, cuerpo: { detail: { mensaje: e.message } } }));
      if (r.status === 200) cuenta = r.cuerpo;
      if (r.status === 200 && propia && !(c?.datos as { webhookCif?: string } | null)?.webhookCif && this.webhookUrlBase) {
        const intento = (c?.datos as { webhookIntento?: string } | null)?.webhookIntento;
        if (!intento || Date.now() - Date.parse(intento) > 3600e3) void this.registrarWebhook(u.corredoraId, llave).catch(() => undefined);
      }
      if (r.status !== 200) error = r.status === 401 ? 'KONVER rechazó la llave.' : `KONVER respondió ${r.status}.`;
    }
    return { conectado: !!llave, propia, servidor: !!llave && !propia, cuenta, error, admin: u.rol === 'ADMIN', conectadoEn: c?.conectadoEn ?? null };
  }

  /** el administrador pega la llave de SU cuenta de KONVER; se prueba antes de guardarla */
  async conectar(u: UsuarioToken, llave: string) {
    if (u.rol !== 'ADMIN') throw new ForbiddenException('La llave de KONVER la pega el administrador de la corredora.');
    const r = await this.pedir(llave, { metodo: 'GET', ruta: '/v1/cuenta' });
    if (r.status === 401) throw new BadRequestException('KONVER rechazó la llave.');
    if (r.status !== 200) throw new BadGatewayException(`KONVER respondió con un error (${r.status}).`);
    const datos = {
      tipo: 'clave',
      estado: 'activa',
      accesoCif: this.cifrado.cifrar(llave),
      renovarCif: null,
      expiraEn: null,
      cuentaId: null,
      cuentaNombre: String((r.cuerpo as { cliente?: string })?.cliente ?? "") || null,
      ultimoError: null,
      datos: {},
      conectadoPor: u.sub,
      conectadoEn: new Date(),
    };
    await this.db.conexion.upsert({
      where: this.donde(u.corredoraId),
      create: { corredoraId: u.corredoraId, usuarioId: null, proveedor: PROVEEDOR, dueno: 'corredora', ...datos },
      update: datos,
    });
    await this.registrarWebhook(u.corredoraId, llave).catch(() => false);
    return this.estado(u);
  }

  async desconectar(u: UsuarioToken) {
    if (u.rol !== 'ADMIN') throw new ForbiddenException('La llave de KONVER la quita el administrador de la corredora.');
    const llave = await this.llaveDe(u.corredoraId);
    if (llave) await this.pedir(llave, { metodo: 'DELETE', ruta: '/v1/cuenta/webhook' }).catch(() => null);
    await this.db.conexion.deleteMany({ where: { corredoraId: u.corredoraId, proveedor: PROVEEDOR, dueno: 'corredora' } });
    return this.estado(u);
  }

  async llamar(u: UsuarioToken, l: Llamada) {
    const camino = l.ruta.split('?')[0];
    if (!FORMA.test(l.ruta) || camino.includes('..') || camino.includes('//'))
      throw new BadRequestException('Ruta de KONVER no válida.');
    const regla = PERMITIDAS.find((p) => p.m.includes(l.metodo) && p.r.test(l.ruta));
    if (!regla) throw new ForbiddenException('Esa ruta de KONVER no está permitida desde Asset.');
    if (regla.admin && u.rol !== 'ADMIN')
      throw new ForbiddenException('Las cuentas de los portales las conecta el administrador de la corredora.');
    const llave = await this.llaveDe(u.corredoraId);
    if (!llave)
      throw new ConflictException({ codigo: 'KONVER_SIN_LLAVE', message: 'Falta conectar los portales: el administrador pega la llave de KONVER en Integraciones.' });
    return this.pedir(llave, l);
  }
}

/** /v1/konver — la cuenta de KONVER de la corredora y el paso de las llamadas */
@Controller('konver')
export class KonverController {
  constructor(private readonly s: KonverService) {}

  @Get('conexion')
  estado(@UsuarioActual() u: UsuarioToken) {
    return this.s.estado(u);
  }

  @Put('conexion')
  conectar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(llaveEsquema)) b: z.infer<typeof llaveEsquema>) {
    return this.s.conectar(u, b.llave);
  }

  @Delete('conexion')
  desconectar(@UsuarioActual() u: UsuarioToken) {
    return this.s.desconectar(u);
  }

  @Publico()
  @Post('webhook/:corredoraId')
  @HttpCode(200)
  webhook(@Param('corredoraId') corredoraId: string, @Req() req: Request) {
    return this.s.recibirWebhook(corredoraId, req.body, req.header('x-konver-firma'));
  }

  @Post('api')
  @HttpCode(200)
  llamar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(llamadaEsquema)) b: Llamada) {
    return this.s.llamar(u, b);
  }
}
