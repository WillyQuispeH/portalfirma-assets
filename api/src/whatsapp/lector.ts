// El lector de WhatsApp del servidor: por cada corredora con wechatia conectado, lee las conversaciones que cambiaron
// y reparte los mensajes nuevos de cada una a UN solo asistente, en este orden:
//   1. el código de vinculación («ASSET 1234») → liga ese celular a la cuenta que lo pidió;
//   2. el celular de un ejecutivo → a la cola de su Asset (ejecutivo.ts);
//   3. un reclamo de postventa en curso → postventa;
//   4. un lead → Sofía (si está encendida; si no, el mensaje solo se anota en el lead);
//   5. un propietario o un mensaje de postventa → postventa (si la respuesta automática está encendida);
//   6. una persona del CRM → Tomás (si la atención de clientes está encendida);
//   7. un número que nadie conoce → se crea su lead y lo atiende Sofía (si está apagada, solo queda en Leads).
// Instagram, Facebook y correo los lee el observador (solo lectura), cada 2 minutos.
// Un solo lector a la vez por corredora (turno en wa_ajustes, aunque corran dos API): nunca se responde dos veces.
// Ritmo: cada LECTOR_CADA_SEG (4 s) si alguien conversa con un asistente en los últimos 10 min o hay un código de
// vinculación pendiente; si no, cada 12 s.
// Fuera de producción solo lee corredoras con wechatia de prueba (WA_LECTOR_REAL=1 para leer también las reales).
//  · GET /whatsapp/asistentes            estado (Sofía, Tomás, número de la empresa, última lectura, IA);
//  · PUT /whatsapp/asistentes            { clientesActivo?, leadsActivo? } (administrador);
//  · GET /whatsapp/asistentes/pausa?telefono=   · POST …/pausar { telefono, horas? } · POST …/reanudar { telefono }.
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Post,
  Put,
  Query,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import type { Env } from '../config/env';
import { WechatiaError, WechatiaService, type Conversacion, type Wechatia } from './wechatia';
import { EjecutivoService } from './ejecutivo';
import { ClientesService } from './clientes';
import { PostventaWaService } from './postventa';
import { ObservadorService, canalDe } from './observador';
import { IaService } from './ia';
import { telNorm } from './comun';
import { NUMERO_EMPRESA } from './ejecutivo';

const TURNO_MS = 3 * 60_000;
const RAPIDO_MS = 10 * 60_000;
const LENTO_MS = 12_000;
/** una conversación que aparece por primera vez se lee desde este tiempo atrás */
const NUEVA_MS = 30_000;
/** mensajes de otros canales dentro de una conversación con teléfono: no son de WhatsApp */
const OTRO_CANAL = /INSTAGRAM|FACEBOOK|EMAIL|GMB|LIVE_CHAT|TIKTOK|WEBCHAT|REVIEW/i;

const ajustesEsquema = z
  .object({ clientesActivo: z.boolean().optional(), leadsActivo: z.boolean().optional() })
  .refine((b) => b.clientesActivo !== undefined || b.leadsActivo !== undefined, 'Falta qué cambiar.');
const telEsquema = z.object({
  telefono: z.string().trim().min(8).max(30),
  horas: z.number().min(0.25).max(72).optional(),
});

@Injectable()
export class LectorService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('LectorWA');
  private reloj: NodeJS.Timeout | null = null;
  private corriendo = false;
  private readonly cadaMs: number;
  private readonly soloPrueba: boolean;

  constructor(
    private readonly db: PrismaService,
    private readonly wa: WechatiaService,
    private readonly ejecutivo: EjecutivoService,
    private readonly clientes: ClientesService,
    private readonly postventa: PostventaWaService,
    private readonly observador: ObservadorService,
    private readonly ia: IaService,
    config: ConfigService<Env, true>,
  ) {
    this.cadaMs = config.get('LECTOR_CADA_SEG', { infer: true }) * 1000;
    this.soloPrueba =
      config.get('NODE_ENV', { infer: true }) !== 'production' && !config.get('WA_LECTOR_REAL', { infer: true });
  }

  onModuleInit() {
    if (this.cadaMs <= 0) return;
    this.reloj = setInterval(() => void this.ronda(), this.cadaMs);
    this.reloj.unref?.();
  }
  onModuleDestroy() {
    if (this.reloj) clearInterval(this.reloj);
  }

  async ronda() {
    if (this.corriendo) return;
    this.corriendo = true;
    try {
      const cx = await this.db.conexion.findMany({
        where: { proveedor: 'wechatia', dueno: 'corredora', estado: 'activa' },
        select: { corredoraId: true, datos: true },
      });
      const lista = cx
        .filter((c) => !this.soloPrueba || !!(c.datos as { base?: string } | null)?.base)
        .map((c) => c.corredoraId);
      await Promise.all(lista.map((id) => this.corredora(id)));
    } catch (e) {
      this.log.error(`ronda: ${(e as Error).message}`);
    } finally {
      this.corriendo = false;
    }
  }

  /** toma el turno de la corredora (si nadie lo tiene y le toca según el ritmo) */
  private async turno(corredoraId: string) {
    await this.db.$executeRaw`
      INSERT INTO wa_ajustes (corredora_id, actualizado_en) VALUES (${corredoraId}::uuid, now()) ON CONFLICT DO NOTHING`;
    const pend = await this.db.waVinculo.count({ where: { corredoraId, codigo: { not: null } } });
    const lento = pend ? 0 : LENTO_MS;
    const r = await this.db.$executeRaw`
      UPDATE wa_ajustes SET lector_hasta = now() + make_interval(secs => ${TURNO_MS / 1000}::float8)
      WHERE corredora_id = ${corredoraId}::uuid
        AND (lector_hasta IS NULL OR lector_hasta < now())
        AND (lector_en IS NULL OR rapido_hasta > now() OR lector_en < now() - make_interval(secs => ${lento / 1000}::float8))`;
    return r === 1;
  }

  private async corredora(corredoraId: string) {
    if (!(await this.turno(corredoraId))) return;
    let error: string | null = null;
    try {
      const wa = await this.wa.cliente(corredoraId);
      if (wa) await this.leer(wa, corredoraId);
    } catch (e) {
      error = (e as Error).message.slice(0, 300);
      if (e instanceof WechatiaError && e.codigo === 'CLAVE') await this.wa.marcarRechazada(corredoraId, e.message);
      this.log.warn(`${corredoraId}: ${error}`);
    } finally {
      await this.db.waAjustes
        .update({ where: { corredoraId }, data: { lectorHasta: null, lectorEn: new Date(), lectorError: error } })
        .catch(() => null);
    }
  }

  private async rapido(corredoraId: string) {
    await this.db.waAjustes.update({ where: { corredoraId }, data: { rapidoHasta: new Date(Date.now() + RAPIDO_MS) } });
  }

  /** lee las conversaciones de la corredora y reparte lo nuevo */
  async leer(wa: Wechatia, corredoraId: string) {
    const convs = await wa.conversaciones(50);
    const ajustes = await this.db.waAjustes.findUnique({ where: { corredoraId } });
    const clientesActivo = ajustes?.clientesActivo ?? true;
    const leadsActivo = ajustes?.leadsActivo ?? true;
    const codigos = (await this.db.waVinculo.count({ where: { corredoraId, codigo: { not: null } } })) > 0;
    const pv = await this.postventa.cargar(corredoraId);
    for (const cv of convs) {
      // Instagram, Facebook y correo sin teléfono: solo el observador
      if (canalDe(cv.tipo) && !cv.telefono) continue;
      try {
        await this.conversacion(wa, corredoraId, cv, { clientesActivo, leadsActivo, codigos, pv });
      } catch (e) {
        this.log.warn(`conversación ${cv.id}: ${(e as Error).message}`);
        if (e instanceof WechatiaError && e.codigo === 'CLAVE') throw e;
      }
    }
    if (await this.observador.toca(corredoraId)) await this.observador.ronda(wa, corredoraId, convs);
  }

  private async conversacion(
    wa: Wechatia,
    corredoraId: string,
    cv: Conversacion,
    o: {
      clientesActivo: boolean;
      leadsActivo: boolean;
      codigos: boolean;
      pv: Awaited<ReturnType<PostventaWaService['cargar']>>;
    },
  ) {
    const previa = await this.db.waConversacion.findUnique({
      where: { corredoraId_convId: { corredoraId, convId: cv.id } },
    });
    if (previa && cv.marca != null && previa.marca === cv.marca) return;
    const t = telNorm(cv.telefono);
    const vinc = t ? await this.ejecutivo.porTelefono(corredoraId, t) : null;
    const cli = !vinc && t ? await this.clientes.quien(corredoraId, t, o.clientesActivo) : null;
    const pvChat = o.pv?.chats.has(cv.id) ?? false;
    // solo interesa si alguien la atiende, si es un número nuevo (será un lead) o para encontrar un código de vinculación
    if (!previa && !vinc && !cli && !t && !o.pv && !o.codigos && !pvChat) return;
    // conversación nueva: lo que llegó poco antes de esta lectura también cuenta (si no, el primer mensaje se perdería)
    let desde = previa?.desde ?? new Date(Date.now() - NUEVA_MS);
    if (!previa && o.codigos) {
      const v = await this.db.waVinculo.findFirst({
        where: { corredoraId, codigo: { not: null } },
        orderBy: { actualizadoEn: 'asc' },
      });
      if (v && v.actualizadoEn < desde && Date.now() - v.actualizadoEn.getTime() < 15 * 60_000) desde = v.actualizadoEn;
    }
    if (!previa && t) {
      // conversación nueva: desde el último envío de Asset a ese número (así su respuesta no se pierde)
      const h = await this.db.waHilo.findUnique({
        where: { corredoraId_telefonoNorm: { corredoraId, telefonoNorm: t } },
      });
      if (h?.ultEnvio && h.ultEnvio < desde) desde = h.ultEnvio;
    }
    const todos = (await wa.mensajes(cv.id, 30)).filter((m) => !OTRO_CANAL.test(m.tipo));
    const ix = previa?.ultimoMsgId ? todos.findIndex((m) => m.id === previa.ultimoMsgId) : -1;
    // lo llegado desde la última lectura (entrantes y salientes: un saliente que no mandó Asset lo escribió el corredor)
    const recientes = ix >= 0 ? todos.slice(ix + 1) : todos.filter((m) => new Date(m.fecha) >= desde);
    const nuevos = recientes.filter((m) => m.direccion === 'entrante');
    const datos = {
      marca: cv.marca,
      ultimoMsgId: todos.at(-1)?.id ?? previa?.ultimoMsgId ?? null,
      telefonoNorm: t,
      contactId: cv.contactId,
    };
    await this.db.waConversacion.upsert({
      where: { corredoraId_convId: { corredoraId, convId: cv.id } },
      create: { corredoraId, convId: cv.id, canal: 'whatsapp', desde, ...datos },
      update: datos,
    });
    if (!nuevos.length) return;

    // 1. el código de vinculación
    if (o.codigos) {
      for (const m of nuevos) {
        const v = await this.ejecutivo.porCodigo(corredoraId, m.texto);
        if (v) {
          await this.ejecutivo.vincularCelular(wa, v, cv);
          await this.rapido(corredoraId);
          return;
        }
      }
    }
    // 2. el celular de un ejecutivo
    if (vinc) {
      await this.ejecutivo.recibir(wa, vinc, cv, nuevos);
      await this.rapido(corredoraId);
      return;
    }
    // 3. un reclamo de postventa en curso
    if (o.pv && this.postventa.enCurso(o.pv, cv.id)) {
      await this.postventa.manejar(wa, corredoraId, o.pv, cv, nuevos);
      await this.rapido(corredoraId);
      return;
    }
    // 4. un lead: Sofía (apagada: solo se anota la conversación en el lead, y responde el corredor)
    if (cli?.quien === 'sofia') {
      if (o.leadsActivo) await this.atender(wa, corredoraId, cv, cli, nuevos, recientes);
      else if (cli.lead) await this.clientes.soloAnotar(corredoraId, cli, nuevos, recientes);
      return;
    }
    // 5. postventa (propietario o mensaje de postventa)
    if (o.pv && (await this.postventa.manejar(wa, corredoraId, o.pv, cv, nuevos))) {
      await this.rapido(corredoraId);
      return;
    }
    // 6. una persona del CRM: Tomás
    if (cli) {
      await this.atender(wa, corredoraId, cv, cli, nuevos, recientes);
      return;
    }
    // 7. un número que nadie conoce: su lead nuevo, y Sofía (encendida) lo atiende
    if (t && !vinc) {
      const nuevo = await this.clientes.leadNuevo(corredoraId, cv);
      if (!nuevo) return;
      if (o.leadsActivo) await this.atender(wa, corredoraId, cv, nuevo, nuevos, recientes);
      else await this.clientes.soloAnotar(corredoraId, nuevo, nuevos, recientes);
    }
  }

  private async atender(
    wa: Wechatia,
    corredoraId: string,
    cv: Conversacion,
    cli: NonNullable<Awaited<ReturnType<ClientesService['quien']>>>,
    nuevos: Parameters<ClientesService['manejar']>[4],
    recientes: Parameters<ClientesService['manejar']>[5],
  ) {
    await this.rapido(corredoraId);
    try {
      await this.clientes.manejar(wa, corredoraId, cv, cli, nuevos, recientes);
    } catch (e) {
      await this.ejecutivo
        .avisarResponsables(
          corredoraId,
          cli.corredorId,
          `No pude responderle a ${cli.nombre} por WhatsApp: ${(e as Error).message.slice(0, 160)}`,
          cli.quien,
          wa,
        )
        .catch(() => null);
      throw e;
    }
  }

  // ------------------------------------------------------------------ lo que ve la app

  async estado(u: UsuarioToken) {
    const a = await this.db.waAjustes.findUnique({ where: { corredoraId: u.corredoraId } });
    const cx = await this.wa.credenciales(u.corredoraId);
    return {
      conectado: !!cx,
      clientesActivo: a?.clientesActivo ?? true,
      leadsActivo: a?.leadsActivo ?? true,
      numeroEmpresa: NUMERO_EMPRESA,
      lectorEncendido: this.cadaMs > 0,
      ultimaLectura: a?.lectorEn?.toISOString() ?? null,
      error: a?.lectorError ?? null,
      ia: await this.ia.disponible(u.corredoraId),
      enServidor: true,
    };
  }

  async configurar(u: UsuarioToken, b: { clientesActivo?: boolean; leadsActivo?: boolean }) {
    if (u.rol !== 'ADMIN')
      throw new ForbiddenException('Los asistentes de WhatsApp los enciende o apaga el administrador.');
    const datos = {
      ...(b.clientesActivo !== undefined ? { clientesActivo: b.clientesActivo } : {}),
      ...(b.leadsActivo !== undefined ? { leadsActivo: b.leadsActivo } : {}),
    };
    await this.db.waAjustes.upsert({
      where: { corredoraId: u.corredoraId },
      create: { corredoraId: u.corredoraId, ...datos },
      update: datos,
    });
    return this.estado(u);
  }
}

@Controller('whatsapp/asistentes')
export class LectorController {
  constructor(
    private readonly s: LectorService,
    private readonly clientes: ClientesService,
  ) {}

  @Get()
  estado(@UsuarioActual() u: UsuarioToken) {
    return this.s.estado(u);
  }

  @Put()
  configurar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(ajustesEsquema)) b: z.infer<typeof ajustesEsquema>) {
    return this.s.configurar(u, b);
  }

  @Get('pausa')
  async pausa(@UsuarioActual() u: UsuarioToken, @Query('telefono') telefono: string) {
    return { pausaHasta: await this.clientes.pausa(u.corredoraId, String(telefono || '')) };
  }

  @Post('pausar')
  @HttpCode(200)
  async pausar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(telEsquema)) b: z.infer<typeof telEsquema>) {
    return { pausaHasta: await this.clientes.pausar(u.corredoraId, b.telefono, b.horas) };
  }

  @Post('reanudar')
  @HttpCode(200)
  async reanudar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(telEsquema)) b: z.infer<typeof telEsquema>) {
    return { ok: await this.clientes.reanudar(u.corredoraId, b.telefono) };
  }
}
