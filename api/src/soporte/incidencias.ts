// Incidencias de soporte: /v1/soporte/incidencias. La lista de tareas de quien resuelve los problemas que reportan las corredoras
// y sus usuarios (la app web «asset-admin»). Solo entran los correos de PLATAFORMA_REVISORES; cada cambio deja una nota del
// sistema con quién lo hizo.
//  · GET   /soporte/incidencias            ?estado=abiertas|nueva|en_curso|resuelta|todas &modulo= &corredoraId= &responsable=yo &q=
//                                          → { items, conteo: { nueva, en_curso, resuelta } };
//  · POST  /soporte/incidencias            crea una (título, módulo, prioridad, corredora, usuario, enlace…);
//  · GET   /soporte/incidencias/:id        una incidencia con sus notas;
//  · PATCH /soporte/incidencias/:id        cambia estado, prioridad, responsable, título, descripción o módulo;
//  · POST  /soporte/incidencias/:id/notas  agrega una nota.
import { Body, Controller, Get, Injectable, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { SoporteService } from './soporte';

const ESTADOS = ['nueva', 'en_curso', 'resuelta'] as const;
const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'] as const;
const MODULOS = ['conversacion', 'persona', 'negocio', 'propiedad', 'plantilla', 'documento', 'whatsapp', 'agente', 'usuario', 'otro'] as const;
const ETIQUETA_ESTADO: Record<string, string> = { nueva: 'Nueva', en_curso: 'En curso', resuelta: 'Resuelta' };

const idInc = z.coerce.number().int().positive();
const texto = (max: number) => z.string().trim().max(max);

const listaQ = z.object({
  estado: z.enum(['abiertas', 'todas', ...ESTADOS]).default('abiertas'),
  modulo: z.enum(MODULOS).optional(),
  corredoraId: z.uuid().optional(),
  responsable: z.enum(['yo']).optional(),
  q: texto(120).optional(),
});
const crearB = z.object({
  titulo: texto(160).min(3, 'Escribe un título de al menos 3 letras.'),
  descripcion: texto(5000).default(''),
  modulo: z.enum(MODULOS).default('otro'),
  prioridad: z.enum(PRIORIDADES).default('media'),
  origen: z.enum(['manual', 'automatica']).default('manual'),
  corredoraId: z.uuid().optional(),
  usuarioId: z.uuid().optional(),
  // una ruta de asset-admin (nunca una dirección de otro sitio)
  enlace: texto(500)
    .refine((v) => !v || (v.startsWith('/') && !v.startsWith('//')), 'El enlace debe ser una ruta de asset-admin.')
    .default(''),
  responsable: z.email().optional(),
});
const cambiarB = z
  .object({
    estado: z.enum(ESTADOS),
    prioridad: z.enum(PRIORIDADES),
    modulo: z.enum(MODULOS),
    titulo: texto(160).min(3),
    descripcion: texto(5000),
    responsable: z.email().nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'No hay nada que cambiar.');
const notaB = z.object({ texto: texto(5000).min(1, 'Escribe la nota.') });

@Injectable()
export class IncidenciasService {
  constructor(
    private readonly db: PrismaService,
    private readonly soporte: SoporteService,
  ) {}

  private vista(i: Prisma.IncidenciaGetPayload<object>) {
    return {
      id: i.id,
      titulo: i.titulo,
      descripcion: i.descripcion,
      modulo: i.modulo,
      estado: i.estado,
      prioridad: i.prioridad,
      origen: i.origen,
      corredoraId: i.corredoraId,
      corredora: i.corredoraNombre,
      usuarioId: i.usuarioId,
      usuario: i.usuarioNombre,
      enlace: i.enlace,
      responsable: i.responsable,
      creadaPor: i.creadaPor,
      creada: i.creadoEn.toISOString(),
      actualizada: i.actualizadoEn.toISOString(),
      resuelta: i.resueltaEn?.toISOString() ?? null,
    };
  }

  async listar(quien: string, q: z.infer<typeof listaQ>) {
    const donde: Prisma.IncidenciaWhereInput = {
      ...(q.estado === 'abiertas' ? { estado: { in: ['nueva', 'en_curso'] } } : q.estado !== 'todas' ? { estado: q.estado } : {}),
      ...(q.modulo ? { modulo: q.modulo } : {}),
      ...(q.corredoraId ? { corredoraId: q.corredoraId } : {}),
      ...(q.responsable === 'yo' ? { responsable: quien } : {}),
      ...(q.q
        ? {
            OR: [
              { titulo: { contains: q.q, mode: 'insensitive' } },
              { descripcion: { contains: q.q, mode: 'insensitive' } },
              { corredoraNombre: { contains: q.q, mode: 'insensitive' } },
              { usuarioNombre: { contains: q.q, mode: 'insensitive' } },
              ...(/^(inc-?)?\d+$/i.test(q.q) ? [{ id: Number(q.q.replace(/\D/g, '')) }] : []),
            ],
          }
        : {}),
    };
    const [filas, grupos] = await Promise.all([
      this.db.incidencia.findMany({ where: donde, orderBy: [{ actualizadoEn: 'desc' }], take: 300 }),
      this.db.incidencia.groupBy({ by: ['estado'], _count: { _all: true } }),
    ]);
    const orden = { urgente: 0, alta: 1, media: 2, baja: 3 } as Record<string, number>;
    // las abiertas van primero por urgencia; dentro de cada una, la más reciente arriba (el orden de la consulta se conserva)
    const items = filas
      .map((i, n) => ({ i, n }))
      .sort((a, b) => (a.i.estado === 'resuelta' ? 1 : 0) - (b.i.estado === 'resuelta' ? 1 : 0) || (orden[a.i.prioridad] ?? 9) - (orden[b.i.prioridad] ?? 9) || a.n - b.n)
      .map((x) => this.vista(x.i));
    const conteo = { nueva: 0, en_curso: 0, resuelta: 0 } as Record<string, number>;
    for (const g of grupos) conteo[g.estado] = g._count._all;
    return { items, conteo };
  }

  async crear(quien: string, b: z.infer<typeof crearB>) {
    const [c, u] = await Promise.all([
      b.corredoraId ? this.db.corredora.findUnique({ where: { id: b.corredoraId }, select: { nombre: true } }) : null,
      b.usuarioId ? this.db.usuario.findUnique({ where: { id: b.usuarioId }, select: { nombre: true, corredoraId: true } }) : null,
    ]);
    if (b.corredoraId && !c) throw new NotFoundException('La corredora no existe.');
    if (b.usuarioId && !u) throw new NotFoundException('El usuario no existe.');
    // si solo se dio el usuario, la corredora es la suya
    const corredoraId = b.corredoraId ?? u?.corredoraId ?? null;
    const corredora = c ?? (corredoraId ? await this.db.corredora.findUnique({ where: { id: corredoraId }, select: { nombre: true } }) : null);
    const i = await this.db.incidencia.create({
      data: {
        titulo: b.titulo,
        descripcion: b.descripcion,
        modulo: b.modulo,
        prioridad: b.prioridad,
        origen: b.origen,
        corredoraId,
        corredoraNombre: corredora?.nombre ?? '',
        usuarioId: b.usuarioId ?? null,
        usuarioNombre: u?.nombre ?? '',
        enlace: b.enlace,
        responsable: b.responsable?.toLowerCase() ?? null,
        creadaPor: quien,
        notas: { create: { autor: quien, texto: 'Creó la incidencia.', sistema: true } },
      },
    });
    return this.vista(i);
  }

  async una(id: number) {
    const i = await this.db.incidencia.findUnique({ where: { id }, include: { notas: { orderBy: { id: 'asc' } } } });
    if (!i) throw new NotFoundException('La incidencia no existe.');
    return {
      ...this.vista(i),
      notas: i.notas.map((n) => ({ id: Number(n.id), autor: n.autor, texto: n.texto, sistema: n.sistema, creada: n.creadoEn.toISOString() })),
    };
  }

  async cambiar(quien: string, id: number, b: z.infer<typeof cambiarB>) {
    const antes = await this.db.incidencia.findUnique({ where: { id } });
    if (!antes) throw new NotFoundException('La incidencia no existe.');
    const datos: Prisma.IncidenciaUpdateInput = {};
    const cambios: string[] = [];
    if (b.estado && b.estado !== antes.estado) {
      datos.estado = b.estado;
      datos.resueltaEn = b.estado === 'resuelta' ? new Date() : null;
      cambios.push(`Estado: ${ETIQUETA_ESTADO[antes.estado] ?? antes.estado} → ${ETIQUETA_ESTADO[b.estado]}`);
    }
    if (b.prioridad && b.prioridad !== antes.prioridad) {
      datos.prioridad = b.prioridad;
      cambios.push(`Prioridad: ${antes.prioridad} → ${b.prioridad}`);
    }
    if (b.modulo && b.modulo !== antes.modulo) {
      datos.modulo = b.modulo;
      cambios.push(`Módulo: ${antes.modulo} → ${b.modulo}`);
    }
    if (b.responsable !== undefined && (b.responsable?.toLowerCase() ?? null) !== antes.responsable) {
      datos.responsable = b.responsable?.toLowerCase() ?? null;
      cambios.push(b.responsable ? `Responsable: ${b.responsable.toLowerCase()}` : 'Quitó el responsable');
    }
    if (b.titulo && b.titulo !== antes.titulo) {
      datos.titulo = b.titulo;
      cambios.push('Cambió el título');
    }
    if (b.descripcion !== undefined && b.descripcion !== antes.descripcion) {
      datos.descripcion = b.descripcion;
      cambios.push('Cambió la descripción');
    }
    if (cambios.length) {
      await this.db.$transaction([
        this.db.incidencia.update({ where: { id }, data: datos }),
        this.db.incidenciaNota.createMany({ data: cambios.map((texto) => ({ incidenciaId: id, autor: quien, texto, sistema: true })) }),
      ]);
    }
    return this.una(id);
  }

  async anotar(quien: string, id: number, texto: string) {
    if (!(await this.db.incidencia.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('La incidencia no existe.');
    // la nota también mueve la incidencia al principio de la lista (actualizadoEn)
    await this.db.$transaction([
      this.db.incidenciaNota.create({ data: { incidenciaId: id, autor: quien, texto } }),
      this.db.incidencia.update({ where: { id }, data: { actualizadoEn: new Date() } }),
    ]);
    return this.una(id);
  }
}

@Controller('soporte/incidencias')
export class IncidenciasController {
  constructor(
    private readonly s: IncidenciasService,
    private readonly soporte: SoporteService,
  ) {}

  @Get()
  async listar(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listaQ)) q: z.infer<typeof listaQ>) {
    return this.s.listar(await this.soporte.exigir(u), q);
  }

  @Post()
  async crear(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(crearB)) b: z.infer<typeof crearB>) {
    return this.s.crear(await this.soporte.exigir(u), b);
  }

  @Get(':id')
  async una(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idInc)) id: number) {
    await this.soporte.exigir(u);
    return this.s.una(id);
  }

  @Patch(':id')
  async cambiar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idInc)) id: number, @Body(new ZodPipe(cambiarB)) b: z.infer<typeof cambiarB>) {
    return this.s.cambiar(await this.soporte.exigir(u), id, b);
  }

  @Post(':id/notas')
  async anotar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idInc)) id: number, @Body(new ZodPipe(notaB)) b: z.infer<typeof notaB>) {
    return this.s.anotar(await this.soporte.exigir(u), id, b.texto);
  }
}
