// Agente: /v1/agente. Las conversaciones con el Agente y el registro de lo que hizo.
// Conversaciones (/conversaciones): son de su usuario, que es el único que las escribe. El administrador de la
// corredora puede leer las de cualquier usuario de su corredora (?usuarioId=).
//  · GET /conversaciones?desde=&cursor=        las propias que cambiaron, completas (la app las sincroniza);
//  · GET /conversaciones?usuarioId=            (administrador) la lista de otro usuario, sin el contenido;
//  · GET /conversaciones/:id?usuarioId=        una conversación completa (propia, o de otro si es administrador);
//  · PUT /conversaciones/:id                   crea o reemplaza una propia (sin control de versión: un solo dueño);
//  · DELETE /conversaciones/:id                borrado lógico (la sincronización sabe qué quitar);
//  · POST /conversaciones/importar             sube las que estaban solo en un equipo (no pisa las que ya existen).
// Registro (/registro): POST agrega acciones (de a lotes); GET lista las propias, o las de otro usuario de la
// corredora si es administrador. Solo se agrega: no se edita ni se borra.
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import type { AgenteConversacion, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { crearCursor, leerCursor } from '../comun/paginas';
import { idDoc } from '../comun/asignados';

/** tamaño máximo de una conversación (items + messages); la app ya guarda solo los últimos 400 y 60 */
export const CONVERSACION_MAX = 3 * 1024 * 1024;

const conversacionEsquema = z.looseObject({
  titulo: z.string().max(200).default(''),
  fijada: z.boolean().default(false),
  creado: z.iso.datetime({ offset: true }).optional(),
});
const listarEsquema = z.object({
  desde: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
  usuarioId: z.uuid().optional(),
});
const importarEsquema = z.object({ items: z.array(z.record(z.string(), z.unknown())).min(1).max(50) });
const registroEsquema = z.object({
  items: z
    .array(
      z.object({
        t: z.iso.datetime({ offset: true }).optional(),
        canal: z.enum(['app', 'whatsapp']).default('app'),
        tool: z.string().trim().min(1).max(120),
        action: z.string().max(120).nullable().optional(),
        ok: z.boolean().default(true),
        resumen: z.string().max(500).default(''),
      }),
    )
    .min(1)
    .max(300),
});
const verRegistroEsquema = z.object({ usuarioId: z.uuid().optional(), limite: z.coerce.number().int().min(1).max(500).default(100) });

const SERVIDOR = ['id', 'version', 'creado', 'actualizado', 'eliminado', 'titulo', 'fijada'];

@Injectable()
export class AgenteService {
  constructor(private readonly db: PrismaService) {}

  /** de quién se leen: uno mismo, o (administrador) otro usuario de la corredora */
  private async lector(u: UsuarioToken, usuarioId?: string) {
    if (!usuarioId || usuarioId === u.sub) return u.sub;
    if (u.rol !== 'ADMIN') throw new ForbiddenException('Solo el administrador ve lo de otros usuarios.');
    const otro = await this.db.usuario.findUnique({ where: { id: usuarioId }, select: { corredoraId: true } });
    if (!otro || otro.corredoraId !== u.corredoraId) throw new NotFoundException('Ese usuario no existe');
    return usuarioId;
  }

  private app(c: AgenteConversacion, completo: boolean) {
    const d = (c.datos ?? {}) as Record<string, unknown>;
    const items = Array.isArray(d.items) ? (d.items as { k?: string }[]) : [];
    const base = {
      id: c.id,
      titulo: c.titulo,
      fijada: c.fijada,
      resumen: typeof d.resumen === 'string' ? d.resumen : '',
      ctx: d.ctx ?? null,
      n: items.filter((i) => i?.k === 'user').length,
      version: c.version,
      creado: c.creadoEn.toISOString(),
      actualizado: c.actualizadoEn.toISOString(),
    };
    return completo ? { ...d, ...base } : base;
  }

  async listar(u: UsuarioToken, f: z.infer<typeof listarEsquema>) {
    const de = await this.lector(u, f.usuarioId);
    const propio = de === u.sub;
    const cursor = leerCursor(f.cursor);
    const filas = await this.db.agenteConversacion.findMany({
      where: {
        AND: [
          { usuarioId: de, ...(f.desde ? { actualizadoEn: { gt: new Date(f.desde) } } : { eliminadoEn: null }) },
          cursor ? { OR: [{ actualizadoEn: { gt: cursor.fecha } }, { actualizadoEn: cursor.fecha, id: { gt: cursor.id } }] } : {},
        ],
      },
      orderBy: [{ actualizadoEn: 'asc' }, { id: 'asc' }],
      take: f.limite,
    });
    const ult = filas[filas.length - 1];
    return {
      items: filas.map((c) => (c.eliminadoEn ? { id: c.id, eliminado: true } : this.app(c, propio))),
      siguiente: filas.length === f.limite && ult ? crearCursor(ult.actualizadoEn, ult.id) : null,
      servidorEn: new Date().toISOString(),
    };
  }

  async obtener(u: UsuarioToken, id: string, usuarioId?: string) {
    const de = await this.lector(u, usuarioId);
    const c = await this.db.agenteConversacion.findUnique({ where: { usuarioId_id: { usuarioId: de, id } } });
    if (!c || c.eliminadoEn) throw new NotFoundException('La conversación ya no existe.');
    return this.app(c, true);
  }

  private datos(o: Record<string, unknown>) {
    const d = Object.fromEntries(Object.entries(o).filter(([k, v]) => !SERVIDOR.includes(k) && v !== undefined));
    if (JSON.stringify(d).length > CONVERSACION_MAX) throw new BadRequestException('La conversación es demasiado grande.');
    return d as Prisma.InputJsonObject;
  }

  async guardar(u: UsuarioToken, id: string, b: z.infer<typeof conversacionEsquema>) {
    const datos = this.datos(b);
    const titulo = b.titulo.slice(0, 200);
    const c = await this.db.agenteConversacion.upsert({
      where: { usuarioId_id: { usuarioId: u.sub, id } },
      create: { usuarioId: u.sub, id, corredoraId: u.corredoraId, titulo, fijada: b.fijada, datos, ...(b.creado ? { creadoEn: new Date(b.creado) } : {}) },
      update: { titulo, fijada: b.fijada, datos, version: { increment: 1 }, eliminadoEn: null },
    });
    return this.app(c, false);
  }

  async borrar(u: UsuarioToken, id: string) {
    await this.db.agenteConversacion.updateMany({ where: { usuarioId: u.sub, id, eliminadoEn: null }, data: { eliminadoEn: new Date(), datos: {}, version: { increment: 1 } } });
    return { ok: true };
  }

  async importar(u: UsuarioToken, items: Record<string, unknown>[]) {
    const rechazados: { id: unknown; motivo: string }[] = [];
    const data: Prisma.AgenteConversacionCreateManyInput[] = [];
    for (const x of items) {
      const id = idDoc.safeParse(x.id);
      const b = conversacionEsquema.safeParse(x);
      if (!id.success || !b.success) {
        rechazados.push({ id: x.id, motivo: 'datos no válidos' });
        continue;
      }
      try {
        data.push({ usuarioId: u.sub, id: id.data, corredoraId: u.corredoraId, titulo: b.data.titulo.slice(0, 200), fijada: b.data.fijada, datos: this.datos(b.data), ...(b.data.creado ? { creadoEn: new Date(b.data.creado) } : {}) });
      } catch (e) {
        rechazados.push({ id: x.id, motivo: (e as Error).message });
      }
    }
    const r = data.length ? await this.db.agenteConversacion.createMany({ data, skipDuplicates: true }) : { count: 0 };
    return { nuevos: r.count, existentes: data.length - r.count, rechazados };
  }

  // ---------------------------------------------------------------- registro de acciones
  async registrar(u: UsuarioToken, items: z.infer<typeof registroEsquema>['items']) {
    const r = await this.db.agenteRegistro.createMany({
      data: items.map((x) => ({
        corredoraId: u.corredoraId,
        usuarioId: u.sub,
        fecha: x.t ? new Date(x.t) : new Date(),
        canal: x.canal,
        herramienta: x.tool,
        accion: x.action ?? null,
        ok: x.ok,
        resumen: x.resumen,
      })),
    });
    return { agregados: r.count };
  }

  async verRegistro(u: UsuarioToken, f: z.infer<typeof verRegistroEsquema>) {
    const de = await this.lector(u, f.usuarioId);
    const filas = await this.db.agenteRegistro.findMany({ where: { usuarioId: de }, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], take: f.limite });
    return filas.map((x) => ({ t: x.fecha.toISOString(), canal: x.canal, tool: x.herramienta, action: x.accion, ok: x.ok, resumen: x.resumen }));
  }
}

@Controller('agente')
export class AgenteController {
  constructor(private readonly s: AgenteService) {}

  @Get('conversaciones')
  listar(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listarEsquema)) q: z.infer<typeof listarEsquema>) {
    return this.s.listar(u, q);
  }

  @Post('conversaciones/importar')
  importar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(importarEsquema)) b: z.infer<typeof importarEsquema>) {
    return this.s.importar(u, b.items);
  }

  @Get('conversaciones/:id')
  obtener(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Query('usuarioId') usuarioId?: string) {
    if (usuarioId !== undefined && !z.uuid().safeParse(usuarioId).success) throw new BadRequestException('usuarioId no válido');
    return this.s.obtener(u, id, usuarioId);
  }

  @Put('conversaciones/:id')
  guardar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(conversacionEsquema)) b: z.infer<typeof conversacionEsquema>) {
    return this.s.guardar(u, id, b);
  }

  @Delete('conversaciones/:id')
  borrar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string) {
    return this.s.borrar(u, id);
  }

  @Post('registro')
  registrar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(registroEsquema)) b: z.infer<typeof registroEsquema>) {
    return this.s.registrar(u, b.items);
  }

  @Get('registro')
  verRegistro(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(verRegistroEsquema)) q: z.infer<typeof verRegistroEsquema>) {
    return this.s.verRegistro(u, q);
  }
}
