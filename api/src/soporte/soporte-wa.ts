// WhatsApp para soporte: /v1/soporte/wa. Cómo conversan los clientes (propietarios, arrendatarios, interesados…) con los
// asistentes de cada corredora, y qué está fallando. Solo entran los correos de PLATAFORMA_REVISORES; cada lectura de una
// conversación y cada pausa quedan en el log del servidor con quién las hizo.
//  · GET  /soporte/wa/resumen?corredoraId=               números y problemas: vínculos, mensajes sin tomar, envíos que fallaron, pausas;
//  · GET  /soporte/wa/clientes?corredoraId=&q=&filtro=   las conversaciones de clientes con Sofía / Tomás (todas, solo pausadas);
//  · GET  /soporte/wa/clientes/:telefono?corredoraId=    una conversación completa (lo último que habló el asistente y todo lo del lead);
//  · POST /soporte/wa/pausa                              pausa o reanuda al asistente en un número (la única acción: se deshace sola).
import { BadRequestException, Body, Controller, Get, Injectable, Logger, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { telNorm } from '../whatsapp/comun';
import { SoporteService } from './soporte';

const DIA = 24 * 3600 * 1000;
const corredoraQ = z.object({ corredoraId: z.uuid() });
const clientesQ = z.object({
  corredoraId: z.uuid(),
  q: z.string().trim().max(80).optional(),
  filtro: z.enum(['todos', 'pausados']).default('todos'),
});
const telefonoP = z.string().regex(/^\d{8,9}$/, 'Teléfono no válido.');
const pausaB = z.object({
  corredoraId: z.uuid(),
  telefono: z.string().min(8).max(20),
  accion: z.enum(['pausar', 'reanudar']),
  horas: z.number().int().min(1).max(72).default(3),
  incidenciaId: z.number().int().positive().optional(),
});

type Msg = { role: string; content: string };
const mensajesDe = (j: unknown): Msg[] => (Array.isArray(j) ? (j as Msg[]).filter((m) => m && typeof m.content === 'string') : []);

@Injectable()
export class SoporteWaService {
  private readonly log = new Logger('SoporteWa');
  constructor(private readonly db: PrismaService) {}

  /** quién es cada número: el lead (lo atiende Sofía) o la persona del CRM (lo atiende Tomás), con sus roles */
  private async identificar(corredoraId: string, tels: string[]) {
    const quien = new Map<string, { tipo: 'lead' | 'persona'; nombre: string; leadId: string | null; personaId: string | null; roles: string[]; corredor: string }>();
    if (!tels.length) return quien;
    const [leads, personas] = await Promise.all([
      this.db.lead.findMany({
        where: { corredoraId, telefonoNorm: { in: tels }, eliminadoEn: null },
        orderBy: { actualizadoEn: 'asc' },
        select: { id: true, telefonoNorm: true, datos: true, estado: true, personaId: true, corredor: { select: { nombre: true } } },
      }),
      this.db.$queryRaw<{ id: string; nombre: string; tel: string; roles: string[] | null }[]>`
        SELECT p.id::text AS id, p.nombre, right(regexp_replace(p.telefono, '\D', '', 'g'), 9) AS tel,
               (SELECT array_agg(DISTINCT x.rol::text) FROM propiedad_personas x WHERE x.persona_id = p.id) AS roles
        FROM personas p
        WHERE p.corredora_id = ${corredoraId}::uuid AND p.eliminado_en IS NULL AND p.telefono IS NOT NULL
          AND right(regexp_replace(p.telefono, '\D', '', 'g'), 9) = ANY(${tels}::text[])`,
    ]);
    for (const p of personas) quien.set(p.tel, { tipo: 'persona', nombre: p.nombre, leadId: null, personaId: p.id, roles: p.roles ?? [], corredor: '' });
    // si el número es a la vez persona y lead, manda el lead (es lo que lo está atendiendo hoy)
    for (const l of leads) {
      const t = l.telefonoNorm!;
      const d = (l.datos ?? {}) as { nombre?: string };
      const p = quien.get(t);
      quien.set(t, { tipo: 'lead', nombre: d.nombre || p?.nombre || '', leadId: l.id, personaId: l.personaId ?? p?.personaId ?? null, roles: p?.roles ?? [], corredor: l.corredor?.nombre ?? '' });
    }
    return quien;
  }

  async resumen(corredoraId: string) {
    const ahora = new Date();
    const desde = new Date(ahora.getTime() - 7 * DIA);
    const [vinculos, entrantes, programados, hilos, pausados, fallidos, sinTomar] = await Promise.all([
      this.db.waVinculo.findMany({ where: { corredoraId }, select: { usuarioId: true, telefono: true, activo: true, codigo: true, senalEn: true, usuario: { select: { nombre: true, activo: true } } } }),
      this.db.waEntrante.count({ where: { corredoraId, tomadoEn: null } }),
      this.db.waProgramado.groupBy({ by: ['estado'], where: { corredoraId, cuando: { gte: desde } }, _count: { _all: true } }),
      this.db.waHilo.count({ where: { corredoraId, actualizadoEn: { gte: desde } } }),
      this.db.waHilo.count({ where: { corredoraId, pausaHasta: { gt: ahora } } }),
      this.db.waProgramado.findMany({
        where: { corredoraId, estado: { in: ['fallido', 'no_entregado'] }, cuando: { gte: desde } },
        orderBy: { cuando: 'desc' },
        take: 20,
      }),
      this.db.waEntrante.findMany({ where: { corredoraId, tomadoEn: null, creadoEn: { lt: new Date(ahora.getTime() - 10 * 60_000) } }, orderBy: { creadoEn: 'asc' }, take: 20 }),
    ]);
    const nombres = new Map((await this.db.usuario.findMany({ where: { corredoraId }, select: { id: true, nombre: true } })).map((u) => [u.id, u.nombre]));
    const conteo = (e: string) => programados.find((x) => x.estado === e)?._count._all ?? 0;
    return {
      vinculos: {
        total: vinculos.length,
        activos: vinculos.filter((v) => v.activo).length,
        pendientes: vinculos.filter((v) => !v.activo && v.codigo).length,
      },
      entrantesSinTomar: entrantes,
      programados7d: { enviados: conteo('enviado'), fallidos: conteo('fallido'), noEntregados: conteo('no_entregado'), pendientes: conteo('programado') },
      hilos7d: hilos,
      pausados,
      problemas: {
        enviosFallidos: fallidos.map((x) => ({
          id: x.id,
          cuando: x.cuando.toISOString(),
          estado: x.estado,
          usuario: nombres.get(x.usuarioId) ?? '',
          telefono: x.telefono,
          nombre: x.nombre,
          texto: x.texto.slice(0, 140),
          motivo: String(((x.resultado ?? {}) as { error?: string; entrega?: string }).error ?? ((x.resultado ?? {}) as { entrega?: string }).entrega ?? ''),
        })),
        mensajesSinTomar: sinTomar.map((x) => ({
          id: Number(x.id),
          desde: x.creadoEn.toISOString(),
          usuario: nombres.get(x.usuarioId) ?? '',
          texto: String(((x.mensaje ?? {}) as { body?: string }).body ?? '').slice(0, 140),
        })),
        vinculosPendientes: vinculos.filter((v) => !v.activo && v.codigo).map((v) => ({ usuarioId: v.usuarioId, usuario: v.usuario.nombre, telefono: v.telefono })),
      },
    };
  }

  async clientes(corredoraId: string, q: z.infer<typeof clientesQ>) {
    const ahora = new Date();
    const donde: Prisma.WaHiloWhereInput = { corredoraId, ...(q.filtro === 'pausados' ? { pausaHasta: { gt: ahora } } : { OR: [{ ultimo: { not: null } }, { ultEnvio: { not: null } }] }) };
    const texto = q.q ?? '';
    const digitos = texto.replace(/\D/g, '');
    if (digitos.length >= 3) donde.telefonoNorm = { contains: digitos.slice(-9) };
    else if (texto.length >= 2) {
      // por nombre: se buscan primero los números de leads y personas que se llaman así
      const [ls, ps] = await Promise.all([
        this.db.lead.findMany({ where: { corredoraId, eliminadoEn: null, telefonoNorm: { not: null }, datos: { path: ['nombre'], string_contains: texto } }, select: { telefonoNorm: true }, take: 100 }),
        this.db.persona.findMany({ where: { corredoraId, eliminadoEn: null, telefono: { not: null }, nombre: { contains: texto, mode: 'insensitive' } }, select: { telefono: true }, take: 100 }),
      ]);
      const tels = [...ls.map((l) => l.telefonoNorm), ...ps.map((p) => telNorm(p.telefono))].filter((t): t is string => !!t);
      donde.telefonoNorm = { in: tels.length ? tels : ['sin-resultados'] };
    }
    const hilos = await this.db.waHilo.findMany({ where: donde, orderBy: { actualizadoEn: 'desc' }, take: 200 });
    const quien = await this.identificar(corredoraId, hilos.map((h) => h.telefonoNorm));
    return hilos.map((h) => {
      const ms = mensajesDe(h.mensajes);
      const ult = ms.at(-1);
      const x = quien.get(h.telefonoNorm);
      return {
        telefono: h.telefonoNorm,
        nombre: x?.nombre || '',
        tipo: x?.tipo ?? 'desconocido',
        asistente: x ? (x.tipo === 'lead' ? 'Sofía' : 'Tomás') : '',
        roles: x?.roles ?? [],
        corredor: x?.corredor ?? '',
        mensajes: ms.length,
        ultimo: ult ? { de: ult.role === 'user' ? 'cliente' : 'asistente', texto: ult.content.slice(0, 160) } : null,
        ultimaRespuesta: h.ultimo?.toISOString() ?? null,
        actualizado: h.actualizadoEn.toISOString(),
        pausaHasta: h.pausaHasta && h.pausaHasta > ahora ? h.pausaHasta.toISOString() : null,
      };
    });
  }

  async cliente(quien: string, corredoraId: string, telefono: string) {
    this.log.log(`${quien} leyó la conversación de WhatsApp del número ${telefono} (corredora ${corredoraId})`);
    const ahora = new Date();
    const [hilo, id, programados] = await Promise.all([
      this.db.waHilo.findUnique({ where: { corredoraId_telefonoNorm: { corredoraId, telefonoNorm: telefono } } }),
      this.identificar(corredoraId, [telefono]).then((m) => m.get(telefono) ?? null),
      this.db.waProgramado.findMany({ where: { corredoraId, telefono: { endsWith: telefono } }, orderBy: { cuando: 'desc' }, take: 20 }),
    ]);
    const lead = id?.leadId
      ? await this.db.leadMensaje.findMany({ where: { leadId: id.leadId }, orderBy: { id: 'desc' }, take: 200, select: { fecha: true, de: true, autor: true, texto: true, tipo: true } })
      : [];
    return {
      telefono,
      nombre: id?.nombre ?? '',
      tipo: id?.tipo ?? 'desconocido',
      asistente: id ? (id.tipo === 'lead' ? 'Sofía' : 'Tomás') : '',
      roles: id?.roles ?? [],
      corredor: id?.corredor ?? '',
      leadId: id?.leadId ?? null,
      personaId: id?.personaId ?? null,
      pausaHasta: hilo?.pausaHasta && hilo.pausaHasta > ahora ? hilo.pausaHasta.toISOString() : null,
      ultimaRespuesta: hilo?.ultimo?.toISOString() ?? null,
      // lo que el asistente tiene presente (las últimas 20 vueltas): con esto responde
      hilo: mensajesDe(hilo?.mensajes),
      // la conversación completa del lead (cliente, corredor y asistente), de la más antigua a la más nueva
      conversacion: lead.reverse().map((m) => ({ fecha: m.fecha, de: m.de ?? '', autor: m.autor ?? '', texto: m.texto, tipo: m.tipo })),
      envios: programados.map((p) => ({ cuando: p.cuando.toISOString(), estado: p.estado, texto: p.texto.slice(0, 140) })),
    };
  }

  async pausa(quien: string, b: z.infer<typeof pausaB>) {
    const t = telNorm(b.telefono);
    if (!t) throw new BadRequestException('El teléfono no es válido.');
    const pausaHasta = b.accion === 'pausar' ? new Date(Date.now() + b.horas * 36e5) : null;
    await this.db.waHilo.upsert({
      where: { corredoraId_telefonoNorm: { corredoraId: b.corredoraId, telefonoNorm: t } },
      create: { corredoraId: b.corredoraId, telefonoNorm: t, pausaHasta },
      update: b.accion === 'pausar' ? { pausaHasta } : { pausaHasta: null, visto: new Date() },
    });
    this.log.warn(`${quien} ${b.accion === 'pausar' ? `pausó ${b.horas} h` : 'reanudó'} al asistente en el número ${t} (corredora ${b.corredoraId})`);
    if (b.incidenciaId) {
      await this.db.incidenciaNota
        .create({
          data: {
            incidenciaId: b.incidenciaId,
            autor: quien,
            texto: b.accion === 'pausar' ? `Pausó al asistente en el número ${t} por ${b.horas} h` : `Reanudó al asistente en el número ${t}`,
            sistema: true,
          },
        })
        .catch(() => null);
    }
    return { telefono: t, pausaHasta: pausaHasta?.toISOString() ?? null };
  }
}

@Controller('soporte/wa')
export class SoporteWaController {
  constructor(
    private readonly s: SoporteWaService,
    private readonly soporte: SoporteService,
  ) {}

  @Get('resumen')
  async resumen(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(corredoraQ)) q: z.infer<typeof corredoraQ>) {
    await this.soporte.exigir(u);
    return this.s.resumen(q.corredoraId);
  }

  @Get('clientes')
  async clientes(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(clientesQ)) q: z.infer<typeof clientesQ>) {
    await this.soporte.exigir(u);
    return this.s.clientes(q.corredoraId, q);
  }

  @Get('clientes/:telefono')
  async cliente(
    @UsuarioActual() u: UsuarioToken,
    @Param('telefono', new ZodPipe(telefonoP)) telefono: string,
    @Query(new ZodPipe(corredoraQ)) q: z.infer<typeof corredoraQ>,
  ) {
    return this.s.cliente(await this.soporte.exigir(u), q.corredoraId, telefono);
  }

  @Post('pausa')
  async pausa(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pausaB)) b: z.infer<typeof pausaB>) {
    return this.s.pausa(await this.soporte.exigir(u), b);
  }
}
