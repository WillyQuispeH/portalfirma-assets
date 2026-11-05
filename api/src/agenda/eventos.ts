// Agenda (visitas, reuniones, firmas, llamadas y tareas): /v1/eventos. Cada evento está a cargo de un corredor:
// si no se indica, el del negocio ligado o, si no, quien lo crea. El corredor ve, edita y borra los suyos; el
// administrador, todos. Reglas comunes en ../comun/asignados.ts.
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Prisma, type Evento } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import {
  buscarVisible,
  esAdmin,
  esUuid,
  fechaDia,
  idDoc,
  isoOpc,
  listar,
  listarEsquema,
  metaApp,
  referencias,
  restoDatos,
  revisarPut,
  type ListarAsignados,
} from '../comun/asignados';

const TIPOS = ['visita', 'reunion', 'firma', 'llamada', 'tarea', 'otro'] as const;
export const eventoEsquema = z.looseObject({
  version: z.number().int().positive().optional(),
  tipo: z.enum(TIPOS).catch('otro'),
  estado: z.enum(['programado', 'hecho', 'cancelado']).default('programado'),
  fecha: fechaDia,
  hora: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'hora HH:MM')
    .nullable()
    .optional(),
  propId: z.uuid().nullable().optional(),
  negocioId: idDoc.nullable().optional(),
  personaIds: z.array(z.string().max(64)).max(50).default([]),
  corredorId: z.uuid().nullable().optional(),
  creado: isoOpc,
});
type EventoEntrada = z.infer<typeof eventoEsquema>;
const importarEsquema = z.object({ items: z.array(z.record(z.string(), z.unknown())).min(1).max(200) });

const COLUMNAS = ['tipo', 'estado', 'fecha', 'hora', 'propId', 'negocioId', 'personaIds', 'corredorId'];
const dia = (f: string) => new Date(f + 'T00:00:00Z');

export const eventoApp = (e: Evento) => ({
  ...((e.datos as object) ?? {}),
  id: e.id,
  tipo: e.tipo,
  estado: e.estado,
  fecha: e.fecha.toISOString().slice(0, 10),
  hora: e.hora,
  propId: e.propiedadId,
  negocioId: e.negocioId,
  personaIds: e.personaIds,
  corredorId: e.corredorId,
  ...metaApp(e),
});

@Injectable()
export class EventosService {
  constructor(private readonly db: PrismaService) {}

  listar(u: UsuarioToken, f: ListarAsignados) {
    return listar(this.db.evento, u, f, eventoApp);
  }

  async obtener(u: UsuarioToken, id: string) {
    return eventoApp(await buscarVisible(this.db.evento, u, id, 'El evento'));
  }

  /** corredor a cargo de un evento nuevo: el indicado (administrador), el del negocio ligado o quien lo crea */
  private async corredorNuevo(u: UsuarioToken, o: EventoEntrada, usuarios: Set<string>) {
    if (!esAdmin(u)) return u.sub;
    if (o.corredorId && usuarios.has(o.corredorId)) return o.corredorId;
    if (o.negocioId) {
      const n = await this.db.negocio.findFirst({
        where: { id: o.negocioId, corredoraId: u.corredoraId },
        select: { corredorId: true },
      });
      if (n?.corredorId) return n.corredorId;
    }
    return u.sub;
  }

  async guardar(u: UsuarioToken, id: string, o: EventoEntrada) {
    const previa = await revisarPut(this.db.evento, u, id, o.version, 'El evento');
    const personas = o.personaIds.filter(esUuid);
    const ref = await referencias(this.db, u, { propiedades: [o.propId], personas, usuarios: [o.corredorId] });
    if (o.propId && !ref.propiedades.has(o.propId)) throw new BadRequestException('La propiedad del evento no existe.');
    if (o.corredorId && !ref.usuarios.has(o.corredorId))
      throw new BadRequestException('Ese corredor no es de tu corredora.');
    const corredorId = !previa
      ? await this.corredorNuevo(u, o, ref.usuarios)
      : esAdmin(u) && o.corredorId !== undefined
        ? (o.corredorId ?? previa.corredorId)
        : previa.corredorId;
    const datos = restoDatos(o, COLUMNAS) as Prisma.InputJsonValue;
    const cols = {
      tipo: o.tipo,
      estado: o.estado,
      fecha: dia(o.fecha),
      hora: o.hora ?? null,
      propiedadId: o.propId ?? null,
      negocioId: o.negocioId ?? null,
      // solo personas de la corredora (una que se borró deja de figurar)
      personaIds: personas.filter((p) => ref.personas.has(p)),
      corredorId,
    };
    if (!previa) {
      try {
        return eventoApp(
          await this.db.evento.create({
            data: {
              id,
              corredoraId: u.corredoraId,
              creadoPorId: u.sub,
              ...(o.creado ? { creadoEn: new Date(o.creado) } : {}),
              ...cols,
              datos,
            },
          }),
        );
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
          throw new ConflictException({ message: 'Ese evento se acaba de crear en otro equipo.', code: 'VERSION' });
        throw e;
      }
    }
    const igual =
      JSON.stringify(datos) === JSON.stringify(previa.datos) &&
      Object.entries(cols).every(([k, v]) => {
        const a = (previa as Record<string, unknown>)[k];
        return (
          JSON.stringify(a instanceof Date ? a.getTime() : a) === JSON.stringify(v instanceof Date ? v.getTime() : v)
        );
      });
    if (igual) return eventoApp(previa);
    const r = await this.db.evento.updateMany({
      where: { id, version: previa.version },
      data: { ...cols, datos, version: { increment: 1 } },
    });
    if (!r.count) throw new ConflictException({ message: 'Otra persona cambió el evento recién.', code: 'VERSION' });
    return eventoApp((await this.db.evento.findUnique({ where: { id } }))!);
  }

  async eliminar(u: UsuarioToken, id: string) {
    await buscarVisible(this.db.evento, u, id, 'El evento');
    await this.db.evento.update({ where: { id }, data: { eliminadoEn: new Date(), version: { increment: 1 } } });
    return { ok: true };
  }

  /** Lo que estaba en el JSON local de un equipo: se crea lo que no existe (no pisa nada). */
  async importar(u: UsuarioToken, items: Record<string, unknown>[]) {
    const validos: { id: string; o: EventoEntrada }[] = [];
    const rechazados: { id: unknown; motivo: string }[] = [];
    for (const x of items) {
      const id = idDoc.safeParse(x.id);
      const o = eventoEsquema.safeParse({
        ...x,
        propId: esUuid(x.propId) ? x.propId : null,
        corredorId: esUuid(x.corredorId) ? x.corredorId : null,
        negocioId: typeof x.negocioId === 'string' && idDoc.safeParse(x.negocioId).success ? x.negocioId : null,
        hora: typeof x.hora === 'string' && x.hora ? x.hora : null,
      });
      if (!id.success || !o.success) rechazados.push({ id: x.id, motivo: (id.error ?? o.error)!.issues[0].message });
      else validos.push({ id: id.data, o: o.data });
    }
    const ya = new Set(
      (await this.db.evento.findMany({ where: { id: { in: validos.map((v) => v.id) } }, select: { id: true } })).map(
        (x) => x.id,
      ),
    );
    const nuevos = validos.filter((v) => !ya.has(v.id));
    const ref = await referencias(this.db, u, {
      propiedades: nuevos.map((v) => v.o.propId),
      personas: nuevos.flatMap((v) => v.o.personaIds.filter(esUuid)),
      usuarios: nuevos.map((v) => v.o.corredorId),
    });
    const negs = new Map(
      (
        await this.db.negocio.findMany({
          where: {
            corredoraId: u.corredoraId,
            id: { in: nuevos.map((v) => v.o.negocioId).filter((x): x is string => !!x) },
          },
          select: { id: true, corredorId: true },
        })
      ).map((n) => [n.id, n.corredorId]),
    );
    const r = await this.db.evento.createMany({
      skipDuplicates: true,
      data: nuevos.map(({ id, o }) => ({
        id,
        corredoraId: u.corredoraId,
        creadoPorId: u.sub,
        ...(o.creado ? { creadoEn: new Date(o.creado) } : {}),
        tipo: o.tipo,
        estado: o.estado,
        fecha: dia(o.fecha),
        hora: o.hora ?? null,
        propiedadId: o.propId && ref.propiedades.has(o.propId) ? o.propId : null,
        negocioId: o.negocioId ?? null,
        personaIds: o.personaIds.filter((p) => ref.personas.has(p)),
        corredorId:
          (o.corredorId && ref.usuarios.has(o.corredorId) ? o.corredorId : null) ??
          (o.negocioId ? negs.get(o.negocioId) : null) ??
          u.sub,
        datos: restoDatos(o, COLUMNAS) as Prisma.InputJsonValue,
      })),
    });
    return { nuevos: r.count, existentes: validos.length - nuevos.length, rechazados };
  }
}

@Controller('eventos')
export class EventosController {
  constructor(private readonly eventos: EventosService) {}

  /** GET /v1/eventos?desde=&cursor=&limite= */
  @Get()
  listar(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listarEsquema)) f: ListarAsignados) {
    return this.eventos.listar(u, f);
  }

  /** POST /v1/eventos/importar — { items: [...] } (hasta 200): crea los que no existen */
  @Post('importar')
  importar(
    @UsuarioActual() u: UsuarioToken,
    @Body(new ZodPipe(importarEsquema)) b: { items: Record<string, unknown>[] },
  ) {
    return this.eventos.importar(u, b.items);
  }

  @Get(':id')
  obtener(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string) {
    return this.eventos.obtener(u, id);
  }

  /** PUT /v1/eventos/:id — el evento completo (crea o reemplaza), con `version` si ya existía */
  @Put(':id')
  guardar(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', new ZodPipe(idDoc)) id: string,
    @Body(new ZodPipe(eventoEsquema)) o: EventoEntrada,
  ) {
    return this.eventos.guardar(u, id, o);
  }

  @Delete(':id')
  eliminar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string) {
    return this.eventos.eliminar(u, id);
  }
}
