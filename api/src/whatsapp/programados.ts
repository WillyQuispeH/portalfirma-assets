// WhatsApp programados: /v1/whatsapp/programados. El servidor los envía a su hora con el WhatsApp de la empresa
// (wechatia, clave de la corredora), esté o no abierta la app. Son de quien los programó: solo él los ve y cancela.
//  · GET  /?desde=&cursor=     los propios que cambiaron (la app los sincroniza y avisa el resultado);
//  · POST /                    { id, telefono, nombre?, personaId?, texto, cuando, plantilla? } (idempotente por id);
//  · POST /importar            los que estaban programados solo en un equipo (no pisa los que ya existen);
//  · DELETE /:id               cancela uno que aún no sale;
//  · POST /:id/avisado         la app toma el aviso del resultado (una sola vez, aunque haya dos equipos abiertos).
// La ronda (cada PROGRAMADOS_CADA_SEG): toma los que tocan con FOR UPDATE SKIP LOCKED (aunque corran dos API, nunca
// salen dos veces); los que quedaron «enviando» más de 10 min (la API se cayó a mitad) pasan a fallido, sin reenviar;
// y revisa unos minutos después si Meta rechazó lo enviado. Si la persona no ha escrito en 24 h, va la plantilla
// aprobada (si la corredora la tiene activa en corredora_config › waPlantillas y no le faltan datos).
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type WaProgramado } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { crearCursor, leerCursor } from '../comun/paginas';
import { idDoc } from '../comun/asignados';
import { ActividadService } from '../comun/actividad.service';
import type { Env } from '../config/env';
import { Wechatia, WechatiaError, WechatiaService } from './wechatia';

const ATASCADO_MS = 10 * 60_000;
const REVISAR_MS = 3 * 60_000;
const LOTE = 20;

const plantillaEsquema = z.object({
  id: z.string().max(60),
  nombre: z.string().max(120),
  etiqueta: z.string().max(120),
  campos: z.record(z.string(), z.string().max(1000).nullable().optional()),
});
const nuevoEsquema = z.object({
  id: idDoc,
  telefono: z.string().trim().min(8).max(30),
  nombre: z.string().trim().max(160).default(''),
  personaId: z.string().max(64).nullable().optional(),
  texto: z.string().trim().min(1).max(4000),
  cuando: z.iso.datetime({ offset: true }),
  plantilla: plantillaEsquema.nullable().optional(),
});
type Nuevo = z.infer<typeof nuevoEsquema>;
const importarEsquema = z.object({ items: z.array(z.record(z.string(), z.unknown())).min(1).max(200) });
const listarEsquema = z.object({
  desde: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

/** hora local de Chile «AAAA-MM-DDTHH:MM:SS» (como guardan la fecha los mensajes de los leads) */
function horaChile(d: Date) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const g = (k: string) => f.find((x) => x.type === k)?.value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}`;
}

@Injectable()
export class ProgramadosService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Programados');
  private reloj: NodeJS.Timeout | null = null;
  private corriendo = false;
  private readonly cadaMs: number;

  constructor(
    private readonly db: PrismaService,
    private readonly wa: WechatiaService,
    private readonly actividad: ActividadService,
    config: ConfigService<Env, true>,
  ) {
    this.cadaMs = config.get('PROGRAMADOS_CADA_SEG', { infer: true }) * 1000;
  }

  onModuleInit() {
    if (this.cadaMs <= 0) return;
    this.reloj = setInterval(() => void this.ronda(), this.cadaMs);
    this.reloj.unref?.();
  }
  onModuleDestroy() {
    if (this.reloj) clearInterval(this.reloj);
  }

  // ---------------------------------------------------------------- lo que ve la app
  private app(x: WaProgramado) {
    return {
      id: x.id,
      telefono: x.telefono,
      nombre: x.nombre,
      personaId: x.personaId,
      texto: x.texto,
      cuando: x.cuando.toISOString(),
      estado: x.estado,
      plantilla: x.plantilla,
      resultado: x.resultado,
      enviadoEn: x.enviadoEn?.toISOString() ?? null,
      avisado: !!x.avisadoEn,
      version: x.version,
      creado: x.creadoEn.toISOString(),
      actualizado: x.actualizadoEn.toISOString(),
    };
  }

  async listar(u: UsuarioToken, f: z.infer<typeof listarEsquema>) {
    const cursor = leerCursor(f.cursor);
    const filas = await this.db.waProgramado.findMany({
      where: {
        AND: [
          {
            corredoraId: u.corredoraId,
            usuarioId: u.sub,
            ...(f.desde ? { actualizadoEn: { gt: new Date(f.desde) } } : {}),
          },
          cursor
            ? { OR: [{ actualizadoEn: { gt: cursor.fecha } }, { actualizadoEn: cursor.fecha, id: { gt: cursor.id } }] }
            : {},
        ],
      },
      orderBy: [{ actualizadoEn: 'asc' }, { id: 'asc' }],
      take: f.limite,
    });
    const ult = filas[filas.length - 1];
    return {
      items: filas.map((x) => this.app(x)),
      siguiente: filas.length === f.limite && ult ? crearCursor(ult.actualizadoEn, ult.id) : null,
      servidorEn: new Date().toISOString(),
    };
  }

  private fila(u: UsuarioToken, b: Nuevo): Prisma.WaProgramadoCreateManyInput {
    return {
      corredoraId: u.corredoraId,
      id: b.id,
      usuarioId: u.sub,
      telefono: b.telefono,
      nombre: b.nombre,
      personaId: b.personaId ?? null,
      texto: b.texto,
      cuando: new Date(b.cuando),
      plantilla: b.plantilla ?? Prisma.DbNull,
    };
  }

  async crear(u: UsuarioToken, b: Nuevo) {
    const ya = await this.db.waProgramado.findUnique({
      where: { corredoraId_id: { corredoraId: u.corredoraId, id: b.id } },
    });
    if (ya) {
      if (ya.usuarioId !== u.sub) throw new NotFoundException('Ese programado no existe');
      return this.app(ya);
    }
    await this.db.waProgramado.createMany({ data: [this.fila(u, b)], skipDuplicates: true });
    return this.app(
      await this.db.waProgramado.findUniqueOrThrow({
        where: { corredoraId_id: { corredoraId: u.corredoraId, id: b.id } },
      }),
    );
  }

  async importar(u: UsuarioToken, items: Record<string, unknown>[]) {
    const rechazados: { id: unknown; motivo: string }[] = [];
    const data: Prisma.WaProgramadoCreateManyInput[] = [];
    for (const x of items) {
      const r = nuevoEsquema.safeParse(x);
      if (r.success) data.push(this.fila(u, r.data));
      else rechazados.push({ id: x.id, motivo: r.error.issues[0]?.message ?? 'no válido' });
    }
    const r = data.length ? await this.db.waProgramado.createMany({ data, skipDuplicates: true }) : { count: 0 };
    return { nuevos: r.count, existentes: data.length - r.count, rechazados };
  }

  async cancelar(u: UsuarioToken, id: string) {
    const r = await this.db.waProgramado.updateMany({
      where: { corredoraId: u.corredoraId, id, usuarioId: u.sub, estado: 'programado' },
      data: { estado: 'cancelado', version: { increment: 1 } },
    });
    if (!r.count) {
      const x = await this.db.waProgramado.findUnique({
        where: { corredoraId_id: { corredoraId: u.corredoraId, id } },
      });
      if (!x || x.usuarioId !== u.sub) throw new NotFoundException('Ese programado no existe');
      return { ok: x.estado === 'cancelado', estado: x.estado };
    }
    return { ok: true, estado: 'cancelado' };
  }

  /** la app toma el aviso del resultado: true solo la primera vez */
  async avisado(u: UsuarioToken, id: string) {
    const r = await this.db.waProgramado.updateMany({
      where: {
        corredoraId: u.corredoraId,
        id,
        usuarioId: u.sub,
        avisadoEn: null,
        estado: { in: ['enviado', 'no_entregado', 'fallido'] },
      },
      data: { avisadoEn: new Date() },
    });
    return { tomado: r.count === 1 };
  }

  // ---------------------------------------------------------------- la ronda
  async ronda() {
    if (this.corriendo) return;
    this.corriendo = true;
    try {
      await this.atascados();
      const toca = await this.tomar();
      for (const x of toca) await this.enviar(x);
      await this.revisarEntregas();
    } catch (e) {
      this.log.error(`ronda: ${(e as Error).message}`);
    } finally {
      this.corriendo = false;
    }
  }

  /** «enviando» por más de 10 min: la API se cayó a mitad. No se reenvía (podría haber salido): queda fallido. */
  private async atascados() {
    await this.db.waProgramado.updateMany({
      where: { estado: 'enviando', actualizadoEn: { lt: new Date(Date.now() - ATASCADO_MS) } },
      data: {
        estado: 'fallido',
        resultado: {
          error: 'El envío se interrumpió y no se sabe si salió: revisa la conversación antes de reenviarlo.',
        },
        version: { increment: 1 },
      },
    });
  }

  private async tomar(): Promise<WaProgramado[]> {
    return this.db.$queryRaw<WaProgramado[]>`
      UPDATE wa_programados p SET estado = 'enviando', version = p.version + 1, actualizado_en = now()
      FROM (SELECT corredora_id, id FROM wa_programados
            WHERE estado = 'programado' AND cuando <= now()
            ORDER BY cuando LIMIT ${LOTE} FOR UPDATE SKIP LOCKED) t
      WHERE p.corredora_id = t.corredora_id AND p.id = t.id
      RETURNING p.corredora_id AS "corredoraId", p.id, p.usuario_id AS "usuarioId", p.telefono, p.nombre,
                p.persona_id AS "personaId", p.texto, p.cuando, p.plantilla`;
  }

  /** ¿Asset tiene registrado que la persona escribió en las últimas 24 h? (mensajes de sus leads) */
  private async escribio24(corredoraId: string, telefono: string) {
    const t = String(telefono).replace(/\D/g, '').slice(-9);
    if (t.length < 8) return false;
    const desde = horaChile(new Date(Date.now() - 24 * 36e5));
    const n = await this.db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM lead_mensajes m JOIN leads l ON l.id = m.lead_id AND l.corredora_id = m.corredora_id
      WHERE m.corredora_id = ${corredoraId}::uuid AND l.telefono_norm = ${t} AND m.de = 'cliente' AND m.fecha > ${desde}`;
    return (n[0]?.n ?? 0) > 0;
  }

  private async plantillaActiva(corredoraId: string, id: string) {
    const c = await this.db.registro.findUnique({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: 'corredora_config', id: 'corredora' } },
    });
    return !!((c?.datos ?? {}) as { waPlantillas?: Record<string, boolean> }).waPlantillas?.[id];
  }

  private async terminar(
    x: Pick<WaProgramado, 'corredoraId' | 'id'>,
    estado: string,
    resultado: Record<string, unknown>,
    enviado = false,
  ) {
    await this.db.waProgramado.update({
      where: { corredoraId_id: { corredoraId: x.corredoraId, id: x.id } },
      data: {
        estado,
        resultado: resultado as Prisma.InputJsonObject,
        version: { increment: 1 },
        ...(enviado
          ? { enviadoEn: new Date(), revisarHasta: resultado.messageId ? new Date(Date.now() + REVISAR_MS) : null }
          : {}),
      },
    });
  }

  private async enviar(x: WaProgramado) {
    const wa = await this.wa.cliente(x.corredoraId);
    if (!wa)
      return this.terminar(x, 'fallido', {
        error: 'El WhatsApp de la empresa no está conectado en Asset (Agente › WhatsApp).',
      });
    try {
      let r: Record<string, unknown>;
      try {
        const e = await wa.enviar({
          telefono: x.telefono,
          nombre: x.nombre,
          texto: x.texto,
          entrante24: () => this.escribio24(x.corredoraId, x.telefono),
        });
        r = { messageId: e.messageId, contactId: e.contactId, entrega: e.estado };
      } catch (e) {
        if (!(e instanceof WechatiaError) || e.codigo !== 'FUERA_24H') throw e;
        r = await this.conPlantilla(wa, x, e.message);
      }
      await this.terminar(x, 'enviado', r, true);
      if (x.personaId)
        await this.actividad
          .registrar({
            corredoraId: x.corredoraId,
            entidadTipo: 'persona',
            entidadId: x.personaId,
            usuarioId: x.usuarioId,
            texto: r.plantilla
              ? `WhatsApp programado (plantilla ${r.plantilla as string}) enviado desde wechatia`
              : `WhatsApp programado enviado: ${x.texto.slice(0, 160)}`,
          })
          .catch(() => null);
    } catch (e) {
      const m = (e as Error).message || String(e);
      if (e instanceof WechatiaError && e.codigo === 'CLAVE') await this.wa.marcarRechazada(x.corredoraId, m);
      await this.terminar(x, 'fallido', {
        error: m.slice(0, 300),
        ...(e instanceof WechatiaError && e.codigo ? { codigo: e.codigo } : {}),
      });
    }
  }

  /** fuera de las 24 h: la plantilla aprobada, si está activa y tiene sus datos; si no, falla con el motivo */
  private async conPlantilla(wa: Wechatia, x: WaProgramado, motivo: string) {
    const p = x.plantilla as z.infer<typeof plantillaEsquema> | null;
    const err = (m: string) => new WechatiaError(m, 'FUERA_24H');
    if (!p) throw err(motivo);
    if (!(await this.plantillaActiva(x.corredoraId, p.id)))
      throw err(`${motivo} La plantilla «${p.nombre}» aún no está activa.`);
    const faltan = Object.entries(p.campos)
      .filter(([, v]) => !String(v ?? '').trim())
      .map(([k]) => k);
    if (faltan.length) throw err(`${motivo} A la plantilla «${p.nombre}» le faltan: ${faltan.join(', ')}.`);
    const r = await wa.enviarPlantilla({
      telefono: x.telefono,
      nombre: x.nombre,
      etiqueta: p.etiqueta,
      campos: p.campos,
    });
    return { contactId: r.contactId, plantilla: p.nombre };
  }

  /** unos minutos después: ¿Meta rechazó alguno ya enviado? */
  private async revisarEntregas() {
    const l = await this.db.waProgramado.findMany({
      where: { estado: 'enviado', revisarHasta: { gt: new Date() }, enviadoEn: { lt: new Date(Date.now() - 25_000) } },
      take: 50,
    });
    const clientes = new Map<string, Wechatia | null>();
    for (const x of l) {
      const id = (x.resultado as { messageId?: string }).messageId;
      if (!clientes.has(x.corredoraId)) clientes.set(x.corredoraId, await this.wa.cliente(x.corredoraId));
      const wa = clientes.get(x.corredoraId);
      const m = id && wa ? await wa.estadoMensaje(id) : null;
      if (m && ['failed', 'undelivered', 'error'].includes(m.estado)) {
        const fuera = /24|window|session|template|plantilla|re-engagement|131047|470/i.test(m.detalle) || !m.detalle;
        await this.db.waProgramado.update({
          where: { corredoraId_id: { corredoraId: x.corredoraId, id: x.id } },
          data: {
            estado: 'no_entregado',
            revisarHasta: null,
            avisadoEn: null, // se vuelve a avisar: ahora con el rechazo
            version: { increment: 1 },
            resultado: {
              ...(x.resultado as object),
              entrega: m.estado,
              error: fuera
                ? 'WhatsApp no lo entregó: no ha escrito en las últimas 24 h (solo se puede con una plantilla aprobada).'
                : `WhatsApp no lo entregó: ${m.detalle}`,
            },
          },
        });
      } else if (m && ['delivered', 'read'].includes(m.estado)) {
        await this.db.waProgramado.update({
          where: { corredoraId_id: { corredoraId: x.corredoraId, id: x.id } },
          data: { revisarHasta: null, resultado: { ...(x.resultado as object), entrega: m.estado } },
        });
      }
    }
  }
}

@Controller('whatsapp/programados')
export class ProgramadosController {
  constructor(private readonly s: ProgramadosService) {}

  @Get()
  listar(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listarEsquema)) q: z.infer<typeof listarEsquema>) {
    return this.s.listar(u, q);
  }

  @Post()
  crear(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(nuevoEsquema)) b: Nuevo) {
    return this.s.crear(u, b);
  }

  @Post('importar')
  importar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(importarEsquema)) b: z.infer<typeof importarEsquema>) {
    return this.s.importar(u, b.items);
  }

  @Delete(':id')
  cancelar(@UsuarioActual() u: UsuarioToken, @Param('id') id: string) {
    return this.s.cancelar(u, id);
  }

  @Post(':id/avisado')
  @HttpCode(200)
  avisado(@UsuarioActual() u: UsuarioToken, @Param('id') id: string) {
    return this.s.avisado(u, id);
  }
}
