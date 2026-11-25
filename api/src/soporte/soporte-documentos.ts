// Documentos para soporte: /v1/soporte/documentos. SOLO LECTURA: los documentos enviados a firmar (tabla firmas) de una corredora
// o de todas, con su estado y sus firmantes (quién firmó y quién falta). Solo entran los correos de PLATAFORMA_REVISORES.
//  · GET /soporte/documentos?corredoraId=&q=&estado=&pagina=   lista (100 por página); sin corredoraId, todas las corredoras
//  · GET /soporte/documentos/:id?corredoraId=                  un documento completo
import { Controller, Get, Injectable, NotFoundException, Param, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { SoporteService } from './soporte';

const ESTADOS = ['en_firma', 'firmado', 'anulado', 'rechazado', 'pendiente_pago'] as const;
const listaQ = z.object({
  corredoraId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
  estado: z.enum([...ESTADOS, 'todos']).default('todos'),
  pagina: z.coerce.number().int().min(0).max(10_000).default(0),
});
const corredoraQ = z.object({ corredoraId: z.uuid() });
const idP = z.string().min(1).max(80);
const POR_PAGINA = 100;

type Json = Record<string, unknown>;
const txt = (v: unknown) =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';

/** los firmantes tal como están guardados → lo que soporte necesita ver */
function firmantesDe(v: unknown) {
  return (Array.isArray(v) ? (v as Json[]) : []).map((s) => ({
    nombre: txt(s?.nombre),
    rut: txt(s?.rut),
    rol: txt(s?.rol || s?.calidad),
    email: txt(s?.email),
    telefono: txt(s?.telefono),
    personaId: txt(s?.personaId) || null,
    firmo: s?.firmo === true,
  }));
}

@Injectable()
export class SoporteDocumentosService {
  constructor(private readonly db: PrismaService) {}

  /** el código NG-XXX de cada negocio, en una sola consulta */
  private async codigos(ids: string[]) {
    const unicos = [...new Set(ids.filter(Boolean))];
    if (!unicos.length) return new Map<string, string>();
    const negocios = await this.db.negocio.findMany({
      where: { id: { in: unicos } },
      select: { id: true, datos: true },
    });
    return new Map(negocios.map((n) => [n.id, txt((n.datos as Json | null)?.codigo)]));
  }

  async lista(q: z.infer<typeof listaQ>) {
    const t = q.q ?? '';
    const op = /^\d{1,9}$/.test(t) ? Number(t) : null;
    // nombre, RUT, correo o teléfono de un firmante: se busca en el JSON como texto
    const porFirmante = t
      ? (
          await this.db.$queryRaw<{ id: string }[]>`
            SELECT id FROM firmas
            WHERE eliminado_en IS NULL AND firmantes::text ILIKE ${'%' + t.replace(/[%_\\]/g, '\\$&') + '%'}
            ${q.corredoraId ? Prisma.sql`AND corredora_id = ${q.corredoraId}::uuid` : Prisma.empty}
            LIMIT 2000`
        ).map((r) => r.id)
      : [];
    const where: Prisma.FirmaWhereInput = {
      eliminadoEn: null,
      ...(q.corredoraId ? { corredoraId: q.corredoraId } : {}),
      ...(q.estado !== 'todos' ? { estado: q.estado } : {}),
      ...(t
        ? {
            OR: [
              { documento: { contains: t, mode: 'insensitive' } },
              ...(op ? [{ operacion: op }] : []),
              { enviadoPor: { nombre: { contains: t, mode: 'insensitive' } } },
              ...(porFirmante.length ? [{ id: { in: porFirmante } }] : []),
            ],
          }
        : {}),
    };
    const [filas, total, porEstado] = await Promise.all([
      this.db.firma.findMany({
        where,
        orderBy: [{ enviadoEn: 'desc' }, { id: 'desc' }],
        skip: q.pagina * POR_PAGINA,
        take: POR_PAGINA,
        include: { corredora: { select: { nombre: true } }, enviadoPor: { select: { nombre: true } } },
      }),
      this.db.firma.count({ where }),
      this.db.firma.groupBy({
        by: ['estado'],
        where: { eliminadoEn: null, ...(q.corredoraId ? { corredoraId: q.corredoraId } : {}) },
        _count: { _all: true },
      }),
    ]);
    const codigos = await this.codigos(filas.map((f) => f.negocioId ?? ''));
    return {
      total,
      porPagina: POR_PAGINA,
      conteo: Object.fromEntries(porEstado.map((e) => [e.estado, e._count._all])) as Record<string, number>,
      items: filas.map((f) => ({
        id: f.id,
        corredoraId: f.corredoraId,
        corredora: f.corredora.nombre,
        operacion: f.operacion,
        documento: f.documento,
        origen: f.origen,
        estado: f.estado,
        legalizado: f.legalizado,
        firmados: f.firmados,
        total: f.total,
        firmantes: firmantesDe(f.firmantes),
        negocioId: f.negocioId,
        negocio: f.negocioId ? codigos.get(f.negocioId) || '' : '',
        enviadoPor: f.enviadoPor?.nombre ?? '',
        enviado: f.enviadoEn.toISOString(),
        firmado: f.firmadoEn?.toISOString() ?? null,
        revisado: f.revisadoEn?.toISOString() ?? null,
        actualizado: f.actualizadoEn.toISOString(),
      })),
    };
  }

  async uno(corredoraId: string, id: string) {
    const f = await this.db.firma.findFirst({
      where: { id, corredoraId },
      include: {
        corredora: { select: { nombre: true } },
        enviadoPor: { select: { id: true, nombre: true, email: true } },
      },
    });
    if (!f) throw new NotFoundException('El documento no existe en esa corredora.');
    const [codigos, propiedades] = await Promise.all([
      this.codigos([f.negocioId ?? '']),
      f.propiedadIds.length
        ? this.db.propiedad.findMany({
            where: { corredoraId, id: { in: f.propiedadIds } },
            select: { id: true, codigo: true, titulo: true, direccion: true, comuna: true },
          })
        : Promise.resolve([]),
    ]);
    return {
      id: f.id,
      corredoraId: f.corredoraId,
      corredora: f.corredora.nombre,
      operacion: f.operacion,
      documento: f.documento,
      origen: f.origen,
      estado: f.estado,
      legalizado: f.legalizado,
      firmados: f.firmados,
      total: f.total,
      firmantes: firmantesDe(f.firmantes),
      negocioId: f.negocioId,
      negocio: f.negocioId ? codigos.get(f.negocioId) || '' : '',
      propiedades: propiedades.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        titulo: p.titulo,
        direccion: [p.direccion, p.comuna].filter(Boolean).join(', '),
      })),
      enviadoPor: f.enviadoPor ? { id: f.enviadoPor.id, nombre: f.enviadoPor.nombre, email: f.enviadoPor.email } : null,
      enviado: f.enviadoEn.toISOString(),
      firmado: f.firmadoEn?.toISOString() ?? null,
      revisado: f.revisadoEn?.toISOString() ?? null,
      creado: f.creadoEn.toISOString(),
      actualizado: f.actualizadoEn.toISOString(),
      eliminado: !!f.eliminadoEn,
      datos: f.datos,
    };
  }
}

@Controller('soporte/documentos')
export class SoporteDocumentosController {
  constructor(
    private readonly s: SoporteDocumentosService,
    private readonly soporte: SoporteService,
  ) {}

  @Get()
  async lista(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listaQ)) q: z.infer<typeof listaQ>) {
    await this.soporte.exigir(u);
    return this.s.lista(q);
  }

  @Get(':id')
  async uno(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', new ZodPipe(idP)) id: string,
    @Query(new ZodPipe(corredoraQ)) q: z.infer<typeof corredoraQ>,
  ) {
    await this.soporte.exigir(u);
    return this.s.uno(q.corredoraId, id);
  }
}
