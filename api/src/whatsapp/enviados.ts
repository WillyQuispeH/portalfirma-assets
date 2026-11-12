// Lo que Asset manda por WhatsApp desde el número de la empresa, y el envío desde la app a través del servidor.
//  · Todo envío de Asset (asistentes, programados, la app) queda en wa_enviados (id del mensaje y huella del texto):
//    así, al leer una conversación, un mensaje saliente que NO está ahí lo escribió el corredor a mano (y el asistente se
//    calla con esa persona). También deja la marca del último envío a ese número (wa_hilos.ult_envio) y lo dicho en la
//    conversación del asistente, para que sepa qué se le dijo al cliente.
//  · La app ya no guarda la clave de wechatia: envía con estas rutas.
//    POST /whatsapp/enviar           { telefono, nombre?, texto, revisar24? } → texto libre (FUERA_24H si no corresponde);
//    POST /whatsapp/enviar/plantilla { telefono, nombre?, etiqueta, campos } → plantilla aprobada (etiqueta + campos);
//    POST /whatsapp/enviar/contacto  { contactId, texto, telefono? } → a quien ya conversa (avisos de postventa);
//    GET  /whatsapp/enviar/estado/:messageId → si WhatsApp lo entregó.
//  · El mismo texto al mismo número dentro de 15 minutos no se vuelve a mandar (responde duplicado: true).
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { WechatiaError, WechatiaService, type Wechatia } from './wechatia';
import { horaChile, huella, telNorm } from './comun';

const enviarEsquema = z.object({
  telefono: z.string().trim().min(8).max(30),
  nombre: z.string().trim().max(160).default(''),
  texto: z.string().trim().min(1).max(4000),
  revisar24: z.boolean().default(true),
});
const plantillaEsquema = z.object({
  telefono: z.string().trim().min(8).max(30),
  nombre: z.string().trim().max(160).default(''),
  etiqueta: z.string().trim().min(1).max(120),
  campos: z.record(z.string(), z.string().max(1000).nullable().optional()),
});
const contactoEsquema = z.object({
  contactId: z.string().trim().min(3).max(100),
  texto: z.string().trim().min(1).max(4000),
  telefono: z.string().trim().max(30).optional(),
});

export interface Propios {
  ids: Set<string>;
  huellas: Set<string>;
  /** instantes en que se mandó una plantilla (wechatia la envía unos segundos después) */
  plantillas: number[];
}

@Injectable()
export class EnviadosService {
  private readonly log = new Logger('Enviados');
  private readonly recientes = new Map<string, { t: number; r: unknown }>();
  private ultimaLimpieza = 0;
  constructor(
    private readonly db: PrismaService,
    private readonly wa: WechatiaService,
  ) {}

  /** anota un envío de Asset (y, si es texto, lo deja en la conversación del asistente con ese número) */
  async registrar(
    corredoraId: string,
    telefono: string | null | undefined,
    o: { messageId?: string | null; texto?: string; plantilla?: boolean; enHilo?: boolean },
  ) {
    const t = telNorm(telefono);
    if (!t) return;
    await this.db.waEnviado.create({
      data: {
        corredoraId,
        telefonoNorm: t,
        messageId: o.messageId ?? null,
        huella: huella(o.texto ?? ''),
        plantilla: !!o.plantilla,
      },
    });
    const hilo = await this.db.waHilo.findUnique({
      where: { corredoraId_telefonoNorm: { corredoraId, telefonoNorm: t } },
    });
    const mensajes = [...((hilo?.mensajes as unknown as { role: string; content: string }[]) ?? [])];
    if (o.texto && !o.plantilla && o.enHilo !== false)
      mensajes.push({ role: 'assistant', content: String(o.texto).slice(0, 1500) });
    const datos = { ultEnvio: new Date(), mensajes: mensajes.slice(-20) as unknown as Prisma.InputJsonValue };
    await this.db.waHilo.upsert({
      where: { corredoraId_telefonoNorm: { corredoraId, telefonoNorm: t } },
      create: { corredoraId, telefonoNorm: t, ...datos },
      update: datos,
    });
    if (Date.now() - this.ultimaLimpieza > 6 * 36e5) {
      this.ultimaLimpieza = Date.now();
      await this.db.waEnviado
        .deleteMany({ where: { creadoEn: { lt: new Date(Date.now() - 30 * 864e5) } } })
        .catch(() => null);
    }
  }

  /** lo que Asset le mandó a un número desde una fecha */
  async propios(corredoraId: string, telefono: string | null | undefined, desde: Date): Promise<Propios> {
    const t = telNorm(telefono);
    const l = t
      ? await this.db.waEnviado.findMany({
          where: { corredoraId, telefonoNorm: t, creadoEn: { gte: new Date(desde.getTime() - 5 * 6e4) } },
          select: { messageId: true, huella: true, plantilla: true, creadoEn: true },
        })
      : [];
    return {
      ids: new Set(l.map((x) => x.messageId).filter((x): x is string => !!x)),
      huellas: new Set(l.map((x) => x.huella).filter(Boolean)),
      plantillas: l.filter((x) => x.plantilla).map((x) => x.creadoEn.getTime()),
    };
  }

  /** ¿Asset tiene registrado que la persona escribió en las últimas 24 h? (mensajes de sus leads) */
  async escribio24(corredoraId: string, telefono: string) {
    const t = telNorm(telefono);
    if (!t) return false;
    const desde = horaChile(new Date(Date.now() - 24 * 36e5));
    const n = await this.db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM lead_mensajes m JOIN leads l ON l.id = m.lead_id AND l.corredora_id = m.corredora_id
      WHERE m.corredora_id = ${corredoraId}::uuid AND l.telefono_norm = ${t} AND m.de = 'cliente' AND m.fecha > ${desde}`;
    return (n[0]?.n ?? 0) > 0;
  }

  /**
   * Aislamiento entre corredores: un interesado (lead) tiene UN dueño (leads.corredor_id) y solo el dueño o un
   * administrador puede escribirle por el número de la empresa. Si varios leads comparten el celular, manda el más antiguo
   * (el mismo criterio con que se enrutan los mensajes que el interesado escribe). Un lead sin dueño no se bloquea.
   * Un teléfono que no es de ningún lead (clientes del CRM, reservas, programados) tampoco.
   */
  async puedeEscribirle(u: { sub: string; corredoraId: string; rol: string }, telefono: string | null | undefined) {
    if (u.rol === 'ADMIN') return true;
    const t = telNorm(telefono);
    if (!t) return true;
    const l = await this.db.lead.findFirst({
      where: { corredoraId: u.corredoraId, telefonoNorm: t, eliminadoEn: null },
      orderBy: { creadoEn: 'asc' },
      select: { corredorId: true },
    });
    return !l?.corredorId || l.corredorId === u.sub;
  }

  private async exigirDueno(u: UsuarioToken, telefono: string | null | undefined) {
    if (!(await this.puedeEscribirle(u, telefono)))
      throw new ForbiddenException({
        message: 'Ese interesado está a cargo de otro corredor: solo él o un administrador puede escribirle.',
        code: 'OTRO_CORREDOR',
      });
  }

  private async cliente(corredoraId: string): Promise<Wechatia> {
    const wa = await this.wa.cliente(corredoraId);
    if (!wa)
      throw new BadRequestException({
        message: 'El WhatsApp de la empresa no está conectado en Asset (Agente › WhatsApp).',
        code: 'SIN_CLAVE',
      });
    return wa;
  }
  private error(e: unknown): never {
    if (e instanceof WechatiaError) throw new BadRequestException({ message: e.message, code: e.codigo ?? 'WECHATIA' });
    throw e;
  }
  private repetido(clave: string) {
    for (const [k, v] of this.recientes) if (Date.now() - v.t > 15 * 6e4) this.recientes.delete(k);
    return this.recientes.get(clave);
  }

  async enviar(u: UsuarioToken, b: z.infer<typeof enviarEsquema>) {
    await this.exigirDueno(u, b.telefono);
    const clave = `${u.corredoraId}|${telNorm(b.telefono)}|${huella(b.texto)}`;
    const prev = this.repetido(clave);
    if (prev) return { ...(prev.r as object), duplicado: true };
    const wa = await this.cliente(u.corredoraId);
    try {
      let r: { contactId: string; messageId: string | null; estado: string };
      if (b.revisar24)
        r = await wa.enviar({
          telefono: b.telefono,
          nombre: b.nombre,
          texto: b.texto,
          entrante24: () => this.escribio24(u.corredoraId, b.telefono),
          revisiones: 2, // la app espera la respuesta (máx. 20 s)
        });
      else {
        const contactId = await wa.contacto(b.telefono, b.nombre);
        r = { contactId, ...(await wa.enviarAContacto(contactId, b.texto)), estado: 'enviado' };
      }
      await this.registrar(u.corredoraId, b.telefono, { messageId: r.messageId, texto: b.texto });
      this.recientes.set(clave, { t: Date.now(), r });
      return r;
    } catch (e) {
      if (e instanceof WechatiaError && e.codigo === 'CLAVE') await this.wa.marcarRechazada(u.corredoraId, e.message);
      this.error(e);
    }
  }

  async plantilla(u: UsuarioToken, b: z.infer<typeof plantillaEsquema>) {
    // la plantilla de aviso al corredor (nuevo_lead_asignado) va al celular del corredor, no a un interesado: pasa por el mismo chequeo
    await this.exigirDueno(u, b.telefono);
    const wa = await this.cliente(u.corredoraId);
    try {
      const r = await wa.enviarPlantilla(b);
      await this.registrar(u.corredoraId, b.telefono, { plantilla: true });
      return { ...r, etiqueta: b.etiqueta };
    } catch (e) {
      this.error(e);
    }
  }

  async contacto(u: UsuarioToken, b: z.infer<typeof contactoEsquema>) {
    // sin teléfono no se sabe a quién va (la app lo usa para avisos al propio corredor): solo se valida cuando viene
    if (b.telefono) await this.exigirDueno(u, b.telefono);
    const wa = await this.cliente(u.corredoraId);
    try {
      const r = await wa.enviarAContacto(b.contactId, b.texto);
      if (b.telefono) await this.registrar(u.corredoraId, b.telefono, { messageId: r.messageId, texto: b.texto });
      return r;
    } catch (e) {
      this.error(e);
    }
  }

  async estado(u: UsuarioToken, messageId: string) {
    const wa = await this.cliente(u.corredoraId);
    return (await wa.estadoMensaje(messageId)) ?? { estado: '', detalle: '' };
  }
}

@Controller('whatsapp/enviar')
export class EnviadosController {
  constructor(private readonly s: EnviadosService) {}

  @Post()
  @HttpCode(200)
  enviar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(enviarEsquema)) b: z.infer<typeof enviarEsquema>) {
    return this.s.enviar(u, b);
  }

  @Post('plantilla')
  @HttpCode(200)
  plantilla(
    @UsuarioActual() u: UsuarioToken,
    @Body(new ZodPipe(plantillaEsquema)) b: z.infer<typeof plantillaEsquema>,
  ) {
    return this.s.plantilla(u, b);
  }

  @Post('contacto')
  @HttpCode(200)
  contacto(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(contactoEsquema)) b: z.infer<typeof contactoEsquema>) {
    return this.s.contacto(u, b);
  }

  @Get('estado/:messageId')
  estado(@UsuarioActual() u: UsuarioToken, @Param('messageId') id: string) {
    return this.s.estado(u, id.slice(0, 100));
  }
}
