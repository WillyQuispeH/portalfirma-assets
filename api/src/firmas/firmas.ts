// Firmas: /v1/firmas. Cada documento enviado a firmar desde Asset (ver el modelo Firma). La app sigue haciendo el
// trabajo con Portalfirma (enviar, consultar el detalle, reenviar el enlace): aquí se guarda el registro para que toda
// la corredora vea qué está en firma, quién falta y quién lo envió.
//  · PUT /:id crea o reemplaza el documento entero, con `version` para no pisar cambios ajenos;
//  · GET ?desde= trae lo que cambió en la corredora (lo borrado llega como { id, eliminado: true });
//  · todos los usuarios ven todas las firmas, pero los firmantes que son dueños (propietario, arrendador, vendedor…
//    de una propiedad que el usuario no captó) llegan reservados: sin nombre, RUT, correo ni celular. Si ese usuario
//    manda la firma de vuelta, el servidor conserva los datos reales de esos firmantes.
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Prisma, type Firma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { crearCursor, leerCursor } from '../comun/paginas';
import { esUuid, idDoc, isoOpc, listarEsquema, restoDatos, type ListarAsignados } from '../comun/asignados';

const firmanteEsquema = z.looseObject({
  nombre: z.string().max(200).nullable().optional(),
  rut: z.string().max(20).nullable().optional(),
  rol: z.string().max(60).nullable().optional(),
  calidad: z.string().max(60).nullable().optional(),
  personaId: z.string().max(64).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  telefono: z.string().max(40).nullable().optional(),
  firmo: z.boolean().optional(),
  reservado: z.boolean().optional(),
});
type TFirmante = z.infer<typeof firmanteEsquema>;
export const firmaEsquema = z.looseObject({
  version: z.number().int().positive().optional(),
  operacion: z.coerce.number().int().positive().nullable().optional(),
  plantilla: z.string().trim().max(300).optional(),
  origen: z.string().max(40).default('asset'),
  estado: z.enum(['en_firma', 'firmado', 'anulado', 'rechazado', 'pendiente_pago']).catch('en_firma'),
  legalizado: z.boolean().default(false),
  propIds: z.array(z.string().max(64)).max(20).default([]),
  negocioId: idDoc.nullable().optional(),
  fecha: isoOpc,
  firmado: isoOpc,
  revisado: isoOpc,
  firmantes: z.array(firmanteEsquema).max(60).default([]),
});
type FirmaEntrada = z.infer<typeof firmaEsquema>;
const importarEsquema = z.object({ items: z.array(z.record(z.string(), z.unknown())).min(1).max(200) });

const COLUMNAS = [
  'operacion',
  'plantilla',
  'origen',
  'estado',
  'legalizado',
  'propIds',
  'negocioId',
  'fecha',
  'firmado',
  'revisado',
  'firmantes',
  'enviadoPorId',
];
/** calidades que corresponden al dueño de la propiedad */
const DEL_DUENO = /^(propietari|arrendador|vendedor|promitente vendedor|mandante)/i;
const rutLimpio = (r: unknown) =>
  String(r ?? '')
    .replace(/[^0-9kK]/g, '')
    .toUpperCase();
const RESERVADO = { nombre: 'Propietario (reservado)', rut: '', email: '', telefono: '', reservado: true };

@Injectable()
export class FirmasService {
  constructor(private readonly db: PrismaService) {}

  /** Para un usuario que no es administrador: qué firmantes ocultar en cada propiedad que no captó. */
  private async reservas(u: UsuarioToken, firmas: Firma[]) {
    if (u.rol === 'ADMIN') return null;
    const ids = [...new Set(firmas.flatMap((f) => f.propiedadIds).filter(esUuid))];
    if (!ids.length) return null;
    const props = await this.db.propiedad.findMany({
      where: { corredoraId: u.corredoraId, id: { in: ids } },
      select: { id: true, captadorId: true, vinculos: { where: { rol: 'propietario' }, select: { personaId: true } } },
    });
    const ajenas = props.filter((p) => p.captadorId !== u.sub);
    if (!ajenas.length) return null;
    const personas = await this.db.persona.findMany({
      where: { id: { in: ajenas.flatMap((p) => p.vinculos.map((v) => v.personaId)) } },
      select: { id: true, rut: true },
    });
    return {
      props: new Set(ajenas.map((p) => p.id)),
      personas: new Set(personas.map((p) => p.id)),
      ruts: new Set(personas.map((p) => rutLimpio(p.rut)).filter((r) => r.length > 1)),
    };
  }
  private esDueno(r: NonNullable<Awaited<ReturnType<FirmasService['reservas']>>>, f: Firma, s: TFirmante) {
    if (!f.propiedadIds.some((id) => r.props.has(id))) return false;
    return (
      (!!s.personaId && r.personas.has(s.personaId)) ||
      (rutLimpio(s.rut).length > 1 && r.ruts.has(rutLimpio(s.rut))) ||
      DEL_DUENO.test(String(s.rol ?? s.calidad ?? ''))
    );
  }

  private aApp(f: Firma, r: Awaited<ReturnType<FirmasService['reservas']>>) {
    const firmantes = (f.firmantes as TFirmante[]).map((s) =>
      r && this.esDueno(r, f, s) ? { ...s, ...RESERVADO } : s,
    );
    return {
      ...((f.datos as object) ?? {}),
      id: f.id,
      operacion: f.operacion,
      plantilla: f.documento,
      origen: f.origen,
      estado: f.estado,
      legalizado: f.legalizado,
      propIds: f.propiedadIds,
      negocioId: f.negocioId,
      enviadoPorId: f.enviadoPorId,
      fecha: f.enviadoEn.toISOString(),
      firmado: f.firmadoEn?.toISOString() ?? null,
      revisado: f.revisadoEn?.toISOString() ?? null,
      firmantes,
      version: f.version,
      actualizado: f.actualizadoEn.toISOString(),
    };
  }
  private async variasApp(u: UsuarioToken, l: Firma[]) {
    const r = await this.reservas(u, l);
    return l.map((f) => this.aApp(f, r));
  }

  async listar(u: UsuarioToken, f: ListarAsignados) {
    const cursor = leerCursor(f.cursor);
    const filas = await this.db.firma.findMany({
      where: {
        AND: [
          {
            corredoraId: u.corredoraId,
            ...(f.desde ? { actualizadoEn: { gt: new Date(f.desde) } } : { eliminadoEn: null }),
          },
          cursor
            ? { OR: [{ actualizadoEn: { gt: cursor.fecha } }, { actualizadoEn: cursor.fecha, id: { gt: cursor.id } }] }
            : {},
        ],
      },
      orderBy: [{ actualizadoEn: 'asc' }, { id: 'asc' }],
      take: f.limite,
    });
    const vivas = await this.variasApp(
      u,
      filas.filter((x) => !x.eliminadoEn),
    );
    const porId = new Map(vivas.map((x) => [x.id, x]));
    const ult = filas[filas.length - 1];
    return {
      items: filas.map((x) => (x.eliminadoEn ? { id: x.id, eliminado: true } : porId.get(x.id)!)),
      siguiente: filas.length === f.limite && ult ? crearCursor(ult.actualizadoEn, ult.id) : null,
      servidorEn: new Date().toISOString(),
    };
  }

  private async buscar(u: UsuarioToken, id: string) {
    const f = await this.db.firma.findUnique({ where: { id } });
    if (!f || f.corredoraId !== u.corredoraId || f.eliminadoEn) throw new NotFoundException('Esa firma ya no está.');
    return f;
  }

  async obtener(u: UsuarioToken, id: string) {
    return (await this.variasApp(u, [await this.buscar(u, id)]))[0];
  }

  /** columnas y datos a partir de lo que manda la app (las propiedades, solo las de la corredora) */
  private async filaDe(u: UsuarioToken, o: FirmaEntrada) {
    const ids = o.propIds.filter(esUuid);
    const props = ids.length
      ? new Set(
          (
            await this.db.propiedad.findMany({
              where: { corredoraId: u.corredoraId, id: { in: ids } },
              select: { id: true },
            })
          ).map((p) => p.id),
        )
      : new Set<string>();
    const firmantes = o.firmantes.map(({ reservado: _r, ...s }) => s);
    return {
      operacion: o.operacion ?? null,
      documento: (o.plantilla || (o.operacion ? `Operación ${o.operacion}` : 'Documento')).slice(0, 300),
      origen: o.origen,
      estado: o.estado,
      legalizado: o.legalizado,
      firmados: firmantes.filter((s) => s.firmo).length,
      total: firmantes.length,
      propiedadIds: ids.filter((id) => props.has(id)),
      negocioId: o.negocioId ?? null,
      ...(o.fecha ? { enviadoEn: new Date(o.fecha) } : {}),
      firmadoEn: o.firmado ? new Date(o.firmado) : o.estado === 'firmado' ? new Date() : null,
      revisadoEn: o.revisado ? new Date(o.revisado) : null,
      firmantes: firmantes as Prisma.InputJsonValue,
      datos: restoDatos(o, COLUMNAS) as Prisma.InputJsonValue,
    };
  }

  async guardar(u: UsuarioToken, id: string, o: FirmaEntrada) {
    const previa = await this.db.firma.findUnique({ where: { id } });
    if (previa && previa.corredoraId !== u.corredoraId)
      throw new ConflictException({ message: 'Ese id ya está en uso.', code: 'ID_OCUPADO' });
    if (previa?.eliminadoEn) throw new NotFoundException({ message: 'Esa firma fue eliminada.', code: 'ELIMINADO' });
    if (previa && o.version && o.version !== previa.version)
      throw new ConflictException({ message: 'Otra persona actualizó esta firma recién.', code: 'VERSION' });
    if (o.operacion && id.startsWith('op') && id !== `op${o.operacion}`)
      throw new BadRequestException('El id no calza con la operación.');
    // lo que este usuario recibió reservado: se conservan los datos reales que ya estaban guardados
    if (previa && o.firmantes.some((s) => s.reservado)) {
      const antes = previa.firmantes as TFirmante[];
      o = {
        ...o,
        firmantes: o.firmantes.map((s, i) =>
          s.reservado ? { ...(antes[i] ?? s), firmo: s.firmo ?? antes[i]?.firmo } : s,
        ),
      };
    }
    const fila = await this.filaDe(u, o);
    if (!previa) {
      try {
        const f = await this.db.firma.create({
          data: { id, corredoraId: u.corredoraId, enviadoPorId: u.sub, ...fila },
        });
        return this.obtener(u, f.id);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
          throw new ConflictException({ message: 'Esa operación ya está registrada.', code: 'VERSION' });
        throw e;
      }
    }
    const r = await this.db.firma.updateMany({
      where: { id, version: previa.version },
      data: { ...fila, firmadoEn: fila.firmadoEn ?? previa.firmadoEn, version: { increment: 1 } },
    });
    if (!r.count)
      throw new ConflictException({ message: 'Otra persona actualizó esta firma recién.', code: 'VERSION' });
    return this.obtener(u, id);
  }

  async eliminar(u: UsuarioToken, id: string) {
    const f = await this.buscar(u, id);
    if (u.rol !== 'ADMIN' && f.enviadoPorId !== u.sub)
      throw new ForbiddenException('Quitar esta firma lo hace quien la envió o el administrador.');
    await this.db.firma.update({ where: { id }, data: { eliminadoEn: new Date(), version: { increment: 1 } } });
    return { ok: true };
  }

  /** Lo que estaba en un equipo (firmas de cada propiedad e historial de «Mis operaciones»): se crea lo que falta. */
  async importar(u: UsuarioToken, items: Record<string, unknown>[]) {
    const rechazados: { id: unknown; motivo: string }[] = [];
    let nuevos = 0;
    let existentes = 0;
    for (const x of items) {
      const id = idDoc.safeParse(x.id);
      const o = firmaEsquema.safeParse(x);
      if (!id.success || !o.success) {
        rechazados.push({ id: x.id, motivo: (id.error ?? o.error)!.issues[0].message });
        continue;
      }
      const ya =
        (await this.db.firma.findUnique({ where: { id: id.data }, select: { id: true } })) ||
        (o.data.operacion &&
          (await this.db.firma.findUnique({
            where: { corredoraId_operacion: { corredoraId: u.corredoraId, operacion: o.data.operacion } },
            select: { id: true },
          })));
      if (ya) {
        existentes++;
        continue;
      }
      await this.db.firma.create({
        data: { id: id.data, corredoraId: u.corredoraId, enviadoPorId: u.sub, ...(await this.filaDe(u, o.data)) },
      });
      nuevos++;
    }
    return { nuevos, existentes, rechazados };
  }
}

@Controller('firmas')
export class FirmasController {
  constructor(private readonly firmas: FirmasService) {}

  /** GET /v1/firmas?desde=&cursor=&limite= */
  @Get()
  listar(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listarEsquema)) f: ListarAsignados) {
    return this.firmas.listar(u, f);
  }

  /** POST /v1/firmas/importar — { items } (hasta 200): crea las que no existen (por id o por operación) */
  @Post('importar')
  importar(
    @UsuarioActual() u: UsuarioToken,
    @Body(new ZodPipe(importarEsquema)) b: { items: Record<string, unknown>[] },
  ) {
    return this.firmas.importar(u, b.items);
  }

  @Get(':id')
  obtener(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string) {
    return this.firmas.obtener(u, id);
  }

  /** PUT /v1/firmas/:id — la firma completa (crea o reemplaza); id «op<número>» si tiene operación */
  @Put(':id')
  guardar(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', new ZodPipe(idDoc)) id: string,
    @Body(new ZodPipe(firmaEsquema)) o: FirmaEntrada,
  ) {
    return this.firmas.guardar(u, id, o);
  }

  @Delete(':id')
  eliminar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string) {
    return this.firmas.eliminar(u, id);
  }
}
