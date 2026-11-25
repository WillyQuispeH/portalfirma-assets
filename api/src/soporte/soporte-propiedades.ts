// Propiedades para soporte: /v1/soporte/propiedades. SOLO LECTURA: la cartera de una corredora o de todas, y una propiedad completa
// (precios, estados, captador, fotos, personas vinculadas, negocios, documentos enviados a firmar, portales y ficha).
// Solo entran los correos de PLATAFORMA_REVISORES.
//  · GET /soporte/propiedades?corredoraId=&q=&operacion=&archivadas=&pagina=   lista (100 por página); sin corredoraId, todas
//  · GET /soporte/propiedades/:id?corredoraId=                                 una propiedad completa
import { Controller, Get, Injectable, NotFoundException, Param, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { palabras } from '../comun/texto';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { SoporteService } from './soporte';

const listaQ = z.object({
  corredoraId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
  operacion: z.enum(['todas', 'venta', 'arriendo']).default('todas'),
  archivadas: z.enum(['0', '1']).default('0'),
  pagina: z.coerce.number().int().min(0).max(10_000).default(0),
});
const corredoraQ = z.object({ corredoraId: z.uuid() });
const idP = z.uuid();
const POR_PAGINA = 100;

const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));
const dir = (p: { direccion: string | null; unidad: string | null; comuna: string | null }) =>
  [[p.direccion, p.unidad].filter(Boolean).join(' '), p.comuna].filter(Boolean).join(', ');

@Injectable()
export class SoportePropiedadesService {
  constructor(private readonly db: PrismaService) {}

  async lista(q: z.infer<typeof listaQ>) {
    const where: Prisma.PropiedadWhereInput = {
      eliminadoEn: null,
      archivada: q.archivadas === '1',
      ...(q.corredoraId ? { corredoraId: q.corredoraId } : {}),
      ...(q.operacion === 'venta' ? { venta: true } : q.operacion === 'arriendo' ? { arriendo: true } : {}),
      ...(q.q ? { AND: palabras(q.q) } : {}),
    };
    const [filas, total] = await Promise.all([
      this.db.propiedad.findMany({
        where,
        orderBy: [{ actualizadoEn: 'desc' }, { id: 'desc' }],
        skip: q.pagina * POR_PAGINA,
        take: POR_PAGINA,
        include: {
          corredora: { select: { nombre: true } },
          captador: { select: { nombre: true } },
          fotos: { orderBy: [{ destacada: 'desc' }, { orden: 'asc' }], take: 1, select: { url: true } },
          _count: { select: { fotos: true, negocios: true, vinculos: true } },
        },
      }),
      this.db.propiedad.count({ where }),
    ]);
    return {
      total,
      porPagina: POR_PAGINA,
      items: filas.map((p) => ({
        id: p.id,
        corredoraId: p.corredoraId,
        corredora: p.corredora.nombre,
        codigo: p.codigo,
        titulo: p.titulo,
        tipo: p.tipo,
        venta: p.venta,
        arriendo: p.arriendo,
        precioVenta: num(p.precioVenta),
        monedaVenta: p.monedaVenta,
        precioArriendo: num(p.precioArriendo),
        monedaArriendo: p.monedaArriendo,
        estadoVenta: p.estadoVenta,
        estadoArriendo: p.estadoArriendo,
        direccion: dir(p),
        captador: p.captador?.nombre ?? '',
        foto: p.fotos[0]?.url ?? null,
        fotos: p._count.fotos,
        negocios: p._count.negocios,
        personas: p._count.vinculos,
        archivada: p.archivada,
        origen: p.origenSistema ?? '',
        actualizado: p.actualizadoEn.toISOString(),
      })),
    };
  }

  async una(corredoraId: string, id: string) {
    const p = await this.db.propiedad.findFirst({
      where: { id, corredoraId },
      include: {
        corredora: { select: { nombre: true } },
        captador: { select: { id: true, nombre: true, email: true } },
        fotos: { orderBy: [{ destacada: 'desc' }, { orden: 'asc' }], select: { id: true, url: true, destacada: true } },
        documentos: { orderBy: { creadoEn: 'desc' }, select: { id: true, nombre: true, tipo: true, creadoEn: true } },
        vinculos: {
          include: { persona: { select: { id: true, nombre: true, rutFormato: true, email: true, telefono: true } } },
        },
        negocios: {
          where: { eliminadoEn: null },
          orderBy: { actualizadoEn: 'desc' },
          take: 50,
          select: { id: true, tipo: true, estado: true, etapa: true, datos: true, actualizadoEn: true },
        },
      },
    });
    if (!p) throw new NotFoundException('La propiedad no existe en esa corredora.');
    const firmas = await this.db.firma.findMany({
      where: { corredoraId, propiedadIds: { has: id }, eliminadoEn: null },
      orderBy: { enviadoEn: 'desc' },
      take: 50,
      select: {
        id: true,
        documento: true,
        operacion: true,
        estado: true,
        firmados: true,
        total: true,
        enviadoEn: true,
      },
    });
    return {
      id: p.id,
      corredoraId: p.corredoraId,
      corredora: p.corredora.nombre,
      codigo: p.codigo,
      titulo: p.titulo,
      tipo: p.tipo,
      venta: p.venta,
      arriendo: p.arriendo,
      precioVenta: num(p.precioVenta),
      monedaVenta: p.monedaVenta,
      precioArriendo: num(p.precioArriendo),
      monedaArriendo: p.monedaArriendo,
      estadoVenta: p.estadoVenta,
      estadoArriendo: p.estadoArriendo,
      direccion: dir(p),
      region: p.region ?? '',
      rol: p.rol ?? '',
      caracteristicas: {
        supTotal: num(p.supTotal),
        supUtil: num(p.supUtil),
        dormitorios: p.dormitorios,
        banos: p.banos,
        estacionamientos: p.estacionamientos,
        bodegas: p.bodegas,
        amoblado: p.amoblado,
        gastosComunes: num(p.gastosComunes),
      },
      descripcion: p.descripcion ?? '',
      notasInternas: p.notasInternas ?? '',
      etiquetas: p.etiquetas,
      captador: p.captador,
      archivada: p.archivada,
      eliminada: !!p.eliminadoEn,
      origen: p.origenSistema ? `${p.origenSistema}${p.origenId ? ` · ${p.origenId}` : ''}` : '',
      creado: p.creadoEn.toISOString(),
      actualizado: p.actualizadoEn.toISOString(),
      fotos: p.fotos,
      archivos: p.documentos.map((d) => ({
        id: d.id,
        nombre: d.nombre,
        tipo: d.tipo,
        creado: d.creadoEn.toISOString(),
      })),
      personas: p.vinculos.map((v) => ({
        id: v.persona.id,
        nombre: v.persona.nombre,
        rut: v.persona.rutFormato ?? '',
        email: v.persona.email ?? '',
        telefono: v.persona.telefono ?? '',
        rol: v.rol,
      })),
      negocios: p.negocios.map((n) => ({
        id: n.id,
        codigo: ((c) => (typeof c === 'string' ? c : ''))((n.datos as { codigo?: unknown } | null)?.codigo),
        tipo: n.tipo,
        estado: n.estado,
        etapa: n.etapa,
        actualizado: n.actualizadoEn.toISOString(),
      })),
      firmas: firmas.map((f) => ({
        id: f.id,
        documento: f.documento,
        operacion: f.operacion,
        estado: f.estado,
        firmados: f.firmados,
        total: f.total,
        enviado: f.enviadoEn.toISOString(),
      })),
      portales: p.portales,
      ficha: p.ficha,
    };
  }
}

@Controller('soporte/propiedades')
export class SoportePropiedadesController {
  constructor(
    private readonly s: SoportePropiedadesService,
    private readonly soporte: SoporteService,
  ) {}

  @Get()
  async lista(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listaQ)) q: z.infer<typeof listaQ>) {
    await this.soporte.exigir(u);
    return this.s.lista(q);
  }

  @Get(':id')
  async una(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', new ZodPipe(idP)) id: string,
    @Query(new ZodPipe(corredoraQ)) q: z.infer<typeof corredoraQ>,
  ) {
    await this.soporte.exigir(u);
    return this.s.una(q.corredoraId, id);
  }
}
