// Negocios (venta o arriendo, por etapas): /v1/negocios. La lógica del embudo (etapas, tareas, firmas, estado de la
// propiedad) vive en la app (negocios.js); aquí se guarda el documento, se valida lo que se relaciona y se aplica
// quién lo ve. Reglas en ../comun/asignados.ts. Borrar es del administrador (como en la app).
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Prisma, type Negocio } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import {
  buscarVisible,
  esAdmin,
  esUuid,
  igualJson,
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

const uuidNulo = z.uuid().nullable().optional();
export const negocioEsquema = z.looseObject({
  version: z.number().int().positive().optional(),
  tipo: z.enum(['venta', 'arriendo']),
  estado: z.enum(['abierto', 'ganado', 'perdido']).default('abierto'),
  etapa: z.string().trim().min(1).max(40),
  propId: uuidNulo,
  clienteId: uuidNulo,
  corredorId: uuidNulo,
  creado: isoOpc,
});
type NegocioEntrada = z.infer<typeof negocioEsquema>;
const importarEsquema = z.object({ items: z.array(z.record(z.string(), z.unknown())).min(1).max(200) });

const COLUMNAS = ['tipo', 'estado', 'etapa', 'propId', 'clienteId', 'corredorId'];
const fechaDe = (o: Record<string, unknown>) => {
  const f = (o.proximaAccion as { fecha?: unknown } | null | undefined)?.fecha;
  return typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) ? new Date(f + 'T00:00:00Z') : null;
};

export const negocioApp = (n: Negocio) => ({
  ...((n.datos as object) ?? {}),
  id: n.id,
  tipo: n.tipo,
  estado: n.estado,
  etapa: n.etapa,
  propId: n.propiedadId,
  clienteId: n.clienteId,
  corredorId: n.corredorId,
  ...metaApp(n),
});

@Injectable()
export class NegociosService {
  constructor(private readonly db: PrismaService) {}

  listar(u: UsuarioToken, f: ListarAsignados) {
    return listar(this.db.negocio, u, f, negocioApp);
  }

  async obtener(u: UsuarioToken, id: string) {
    return negocioApp(await buscarVisible(this.db.negocio, u, id, 'El negocio'));
  }

  async guardar(u: UsuarioToken, id: string, o: NegocioEntrada) {
    const previa = await revisarPut(this.db.negocio, u, id, o.version, 'El negocio');
    const ref = await referencias(this.db, u, {
      propiedades: [o.propId],
      personas: [o.clienteId],
      usuarios: [o.corredorId],
    });
    if (o.propId && !ref.propiedades.has(o.propId))
      throw new BadRequestException('La propiedad del negocio no existe.');
    if (o.clienteId && !ref.personas.has(o.clienteId))
      throw new BadRequestException('El cliente del negocio no existe.');
    if (o.corredorId && !ref.usuarios.has(o.corredorId))
      throw new BadRequestException('Ese corredor no es de tu corredora.');
    // el corredor: lo nuevo queda suyo y no lo reasigna; el administrador decide (sin dato, se mantiene)
    const corredorId = !esAdmin(u)
      ? (previa?.corredorId ?? u.sub)
      : o.corredorId !== undefined
        ? (o.corredorId ?? null)
        : (previa?.corredorId ?? null);
    const datos = restoDatos(o, COLUMNAS) as Prisma.InputJsonValue;
    const cols = {
      tipo: o.tipo,
      estado: o.estado,
      etapa: o.etapa,
      propiedadId: o.propId ?? null,
      clienteId: o.clienteId ?? null,
      corredorId,
      proximaFecha: fechaDe(o),
    };
    if (!previa) {
      try {
        const n = await this.db.negocio.create({
          data: {
            id,
            corredoraId: u.corredoraId,
            creadoPorId: u.sub,
            ...(o.creado ? { creadoEn: new Date(o.creado) } : {}),
            ...cols,
            datos,
          },
        });
        return negocioApp(n);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
          throw new ConflictException({ message: 'Ese negocio se acaba de crear en otro equipo.', code: 'VERSION' });
        throw e;
      }
    }
    const igual =
      igualJson(datos, previa.datos) &&
      Object.entries(cols).every(([k, v]) => {
        const a = (previa as Record<string, unknown>)[k];
        return (a instanceof Date ? a.getTime() : a) === (v instanceof Date ? v.getTime() : v);
      });
    if (igual) return negocioApp(previa);
    const r = await this.db.negocio.updateMany({
      where: { id, version: previa.version },
      data: { ...cols, datos, version: { increment: 1 } },
    });
    if (!r.count) throw new ConflictException({ message: 'Otra persona cambió el negocio recién.', code: 'VERSION' });
    return negocioApp((await this.db.negocio.findUnique({ where: { id } }))!);
  }

  async eliminar(u: UsuarioToken, id: string) {
    if (!esAdmin(u)) throw new ForbiddenException('Eliminar un negocio lo hace el administrador.');
    await buscarVisible(this.db.negocio, u, id, 'El negocio');
    await this.db.negocio.update({ where: { id }, data: { eliminadoEn: new Date(), version: { increment: 1 } } });
    return { ok: true };
  }

  /** Lo que estaba en el JSON local de un equipo: se crea lo que no existe (no pisa nada). */
  async importar(u: UsuarioToken, items: Record<string, unknown>[]) {
    const validos: { id: string; o: NegocioEntrada }[] = [];
    const rechazados: { id: unknown; motivo: string }[] = [];
    for (const x of items) {
      const id = idDoc.safeParse(x.id);
      const o = negocioEsquema.safeParse({
        ...x,
        propId: esUuid(x.propId) ? x.propId : null,
        clienteId: esUuid(x.clienteId) ? x.clienteId : null,
        corredorId: esUuid(x.corredorId) ? x.corredorId : null,
      });
      if (!id.success || !o.success) rechazados.push({ id: x.id, motivo: (id.error ?? o.error)!.issues[0].message });
      else validos.push({ id: id.data, o: o.data });
    }
    const ya = new Set(
      (await this.db.negocio.findMany({ where: { id: { in: validos.map((v) => v.id) } }, select: { id: true } })).map(
        (x) => x.id,
      ),
    );
    const nuevos = validos.filter((v) => !ya.has(v.id));
    const ref = await referencias(this.db, u, {
      propiedades: nuevos.map((v) => v.o.propId),
      personas: nuevos.map((v) => v.o.clienteId),
      usuarios: nuevos.map((v) => v.o.corredorId),
    });
    const r = await this.db.negocio.createMany({
      skipDuplicates: true,
      data: nuevos.map(({ id, o }) => ({
        id,
        corredoraId: u.corredoraId,
        creadoPorId: u.sub,
        ...(o.creado ? { creadoEn: new Date(o.creado) } : {}),
        tipo: o.tipo,
        estado: o.estado,
        etapa: o.etapa,
        // lo que ya no existe en la base queda sin ligar (el negocio se conserva)
        propiedadId: o.propId && ref.propiedades.has(o.propId) ? o.propId : null,
        clienteId: o.clienteId && ref.personas.has(o.clienteId) ? o.clienteId : null,
        corredorId: o.corredorId && ref.usuarios.has(o.corredorId) ? o.corredorId : esAdmin(u) ? null : u.sub,
        proximaFecha: fechaDe(o),
        datos: restoDatos(o, COLUMNAS) as Prisma.InputJsonValue,
      })),
    });
    return { nuevos: r.count, existentes: validos.length - nuevos.length, rechazados };
  }
}

@Controller('negocios')
export class NegociosController {
  constructor(private readonly negocios: NegociosService) {}

  /** GET /v1/negocios?desde=&cursor=&limite= */
  @Get()
  listar(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listarEsquema)) f: ListarAsignados) {
    return this.negocios.listar(u, f);
  }

  /** POST /v1/negocios/importar — { items: [...] } (hasta 200): crea los que no existen */
  @Post('importar')
  importar(
    @UsuarioActual() u: UsuarioToken,
    @Body(new ZodPipe(importarEsquema)) b: { items: Record<string, unknown>[] },
  ) {
    return this.negocios.importar(u, b.items);
  }

  @Get(':id')
  obtener(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string) {
    return this.negocios.obtener(u, id);
  }

  /** PUT /v1/negocios/:id — el negocio completo (crea o reemplaza), con `version` si ya existía */
  @Put(':id')
  guardar(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', new ZodPipe(idDoc)) id: string,
    @Body(new ZodPipe(negocioEsquema)) o: NegocioEntrada,
  ) {
    return this.negocios.guardar(u, id, o);
  }

  @Delete(':id')
  eliminar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string) {
    return this.negocios.eliminar(u, id);
  }
}
