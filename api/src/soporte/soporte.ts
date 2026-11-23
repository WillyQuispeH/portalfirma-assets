// Soporte de la plataforma: /v1/soporte. SOLO LECTURA, para quien resuelve problemas de las corredoras y sus usuarios (la app
// web «asset-admin»). Solo entran los correos de PLATAFORMA_REVISORES (los mismos que revisan las reglas notariales); cada
// lectura de conversaciones queda en el log del servidor con quién leyó qué.
//  · GET /soporte/yo                                  { soporte: true } (403 si no es de soporte);
//  · GET /soporte/corredoras                          todas las corredoras, con cuántos usuarios y actividad reciente;
//  · GET /soporte/usuarios?corredoraId=               los usuarios de una corredora, su WhatsApp y su actividad con el Agente;
//  · GET /soporte/conversaciones?usuarioId=           las conversaciones del Agente de ese usuario (sin el contenido);
//  · GET /soporte/conversaciones/:id?usuarioId=       una conversación completa;
//  · GET /soporte/hilos?usuarioId=                    lo que habló por WhatsApp con cada asistente (Pedro, Juanita, Diego, Fernanda);
//  · GET /soporte/registro?usuarioId=&limite=         lo que hizo el Agente (cada herramienta que cambió algo).
import { Controller, ForbiddenException, Get, Injectable, Logger, NotFoundException, Param, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { idDoc } from '../comun/asignados';
import type { Env } from '../config/env';

const usuarioQ = z.object({ usuarioId: z.uuid() });
const corredoraQ = z.object({ corredoraId: z.uuid() });
const registroQ = z.object({ usuarioId: z.uuid(), limite: z.coerce.number().int().min(1).max(500).default(200) });
const DIAS = 7 * 24 * 3600 * 1000;

@Injectable()
export class SoporteService {
  private readonly log = new Logger('Soporte');
  private readonly revisores: string[];

  constructor(
    private readonly db: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.revisores = config.get('PLATAFORMA_REVISORES', { infer: true }) as unknown as string[];
  }

  /** quién es de soporte (su correo); 403 si no */
  async exigir(u: UsuarioToken) {
    const x = this.revisores.length
      ? await this.db.usuario.findUnique({ where: { id: u.sub }, select: { email: true, activo: true } })
      : null;
    if (!x?.activo || !this.revisores.includes(x.email.toLowerCase())) throw new ForbiddenException('Esto es solo para soporte de Portalfirma.');
    return x.email.toLowerCase();
  }

  async corredoras() {
    const desde = new Date(Date.now() - DIAS);
    const cs = await this.db.corredora.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } });
    const us = await this.db.usuario.groupBy({ by: ['corredoraId', 'activo'], _count: { _all: true } });
    const ultimo = await this.db.usuario.groupBy({ by: ['corredoraId'], _max: { ultimoIngreso: true } });
    const convs = await this.db.agenteConversacion.groupBy({
      by: ['corredoraId'],
      where: { eliminadoEn: null, actualizadoEn: { gte: desde } },
      _count: { _all: true },
    });
    return cs.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      usuarios: us.filter((x) => x.corredoraId === c.id).reduce((n, x) => n + x._count._all, 0),
      activos: us.find((x) => x.corredoraId === c.id && x.activo)?._count._all ?? 0,
      ultimoIngreso: ultimo.find((x) => x.corredoraId === c.id)?._max.ultimoIngreso?.toISOString() ?? null,
      conversaciones7d: convs.find((x) => x.corredoraId === c.id)?._count._all ?? 0,
    }));
  }

  async usuarios(corredoraId: string) {
    const us = await this.db.usuario.findMany({ where: { corredoraId }, orderBy: { nombre: 'asc' } });
    const ids = us.map((u) => u.id);
    const vs = await this.db.waVinculo.findMany({ where: { usuarioId: { in: ids } } });
    const convs = await this.db.agenteConversacion.groupBy({
      by: ['usuarioId'],
      where: { usuarioId: { in: ids }, eliminadoEn: null },
      _count: { _all: true },
      _max: { actualizadoEn: true },
    });
    const regs = await this.db.agenteRegistro.groupBy({ by: ['usuarioId'], where: { usuarioId: { in: ids } }, _count: { _all: true }, _max: { fecha: true } });
    return us.map((u) => {
      const v = vs.find((x) => x.usuarioId === u.id);
      const c = convs.find((x) => x.usuarioId === u.id);
      const r = regs.find((x) => x.usuarioId === u.id);
      return {
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        telefono: u.telefono ?? '',
        activo: u.activo,
        ultimoIngreso: u.ultimoIngreso?.toISOString() ?? null,
        whatsapp: v ? { telefono: v.telefono, activo: v.activo, vinculadoEn: v.vinculadoEn?.toISOString() ?? null, senalEn: v.senalEn?.toISOString() ?? null } : null,
        conversaciones: c?._count._all ?? 0,
        ultimaConversacion: c?._max.actualizadoEn?.toISOString() ?? null,
        acciones: r?._count._all ?? 0,
        ultimaAccion: r?._max.fecha?.toISOString() ?? null,
      };
    });
  }

  async conversaciones(usuarioId: string) {
    const l = await this.db.agenteConversacion.findMany({ where: { usuarioId, eliminadoEn: null }, orderBy: { actualizadoEn: 'desc' }, take: 200 });
    return l.map((c) => {
      const d = (c.datos ?? {}) as { items?: { k?: string; text?: string }[]; resumen?: string };
      const items = Array.isArray(d.items) ? d.items : [];
      const ult = [...items].reverse().find((i) => i?.k === 'user' || i?.k === 'bot');
      return {
        id: c.id,
        titulo: c.titulo,
        canal: c.id === 'whatsapp' ? 'whatsapp' : 'app',
        mensajes: items.filter((i) => i?.k === 'user').length,
        resumen: d.resumen ?? '',
        ultimo: ult?.text?.slice(0, 160) ?? '',
        creado: c.creadoEn.toISOString(),
        actualizado: c.actualizadoEn.toISOString(),
      };
    });
  }

  async conversacion(quien: string, usuarioId: string, id: string) {
    const c = await this.db.agenteConversacion.findUnique({ where: { usuarioId_id: { usuarioId, id } } });
    if (!c || c.eliminadoEn) throw new NotFoundException('La conversación ya no existe.');
    this.log.log(`${quien} leyó la conversación «${c.titulo}» (${id}) del usuario ${usuarioId}`);
    const d = (c.datos ?? {}) as { items?: unknown[]; ctx?: unknown; resumen?: string };
    return {
      id: c.id,
      titulo: c.titulo,
      creado: c.creadoEn.toISOString(),
      actualizado: c.actualizadoEn.toISOString(),
      resumen: d.resumen ?? '',
      ctx: d.ctx ?? null,
      items: Array.isArray(d.items) ? d.items : [],
    };
  }

  /** la conversación por WhatsApp con cada asistente (se guarda en el vínculo del celular del usuario) */
  async hilos(quien: string, usuarioId: string) {
    const v = await this.db.waVinculo.findUnique({ where: { usuarioId } });
    this.log.log(`${quien} leyó los hilos de WhatsApp del usuario ${usuarioId}`);
    const hilos = ((v?.datos ?? {}) as { hilos?: Record<string, { role: string; content: string }[]> }).hilos ?? {};
    return {
      telefono: v?.telefono ?? null,
      hilos: Object.entries(hilos).map(([asistente, mensajes]) => ({ asistente, mensajes: Array.isArray(mensajes) ? mensajes : [] })),
    };
  }

  async registro(usuarioId: string, limite: number) {
    const l = await this.db.agenteRegistro.findMany({ where: { usuarioId }, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], take: limite });
    return l.map((x) => ({ t: x.fecha.toISOString(), canal: x.canal, herramienta: x.herramienta, accion: x.accion, ok: x.ok, resumen: x.resumen }));
  }
}

@Controller('soporte')
export class SoporteController {
  constructor(private readonly s: SoporteService) {}

  @Get('yo')
  async yo(@UsuarioActual() u: UsuarioToken) {
    return { soporte: true, email: await this.s.exigir(u) };
  }

  @Get('corredoras')
  async corredoras(@UsuarioActual() u: UsuarioToken) {
    await this.s.exigir(u);
    return this.s.corredoras();
  }

  @Get('usuarios')
  async usuarios(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(corredoraQ)) q: z.infer<typeof corredoraQ>) {
    await this.s.exigir(u);
    return this.s.usuarios(q.corredoraId);
  }

  @Get('conversaciones')
  async conversaciones(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(usuarioQ)) q: z.infer<typeof usuarioQ>) {
    await this.s.exigir(u);
    return this.s.conversaciones(q.usuarioId);
  }

  @Get('conversaciones/:id')
  async conversacion(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', new ZodPipe(idDoc)) id: string,
    @Query(new ZodPipe(usuarioQ)) q: z.infer<typeof usuarioQ>,
  ) {
    return this.s.conversacion(await this.s.exigir(u), q.usuarioId, id);
  }

  @Get('hilos')
  async hilos(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(usuarioQ)) q: z.infer<typeof usuarioQ>) {
    return this.s.hilos(await this.s.exigir(u), q.usuarioId);
  }

  @Get('registro')
  async registro(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(registroQ)) q: z.infer<typeof registroQ>) {
    await this.s.exigir(u);
    return this.s.registro(q.usuarioId, q.limite);
  }
}
