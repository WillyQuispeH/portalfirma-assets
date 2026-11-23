// Negocios para soporte: /v1/soporte/negocios. SOLO LECTURA: buscar los negocios de cualquier corredora y ver uno completo (etapa,
// propiedad, cliente, corredor, firmas, historial y sus datos tal como están guardados). Solo entran los correos de PLATAFORMA_REVISORES.
//  · GET /soporte/negocios?corredoraId=&q=&estado=&pagina=   lista (100 por página)
//  · GET /soporte/negocios/:id?corredoraId=                  un negocio completo
import { Controller, Get, Injectable, NotFoundException, Param, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { SoporteService } from './soporte';

const listaQ = z.object({
  corredoraId: z.uuid(),
  q: z.string().trim().max(100).optional(),
  estado: z.enum(['abierto', 'ganado', 'perdido', 'todos']).default('todos'),
  pagina: z.coerce.number().int().min(0).max(10_000).default(0),
});
const corredoraQ = z.object({ corredoraId: z.uuid() });
const idP = z.string().min(1).max(80);
const POR_PAGINA = 100;
const cod = (d: unknown) => String(((d ?? {}) as { codigo?: unknown }).codigo ?? '');

@Injectable()
export class SoporteNegociosService {
  constructor(private readonly db: PrismaService) {}

  async lista(q: z.infer<typeof listaQ>) {
    const t = q.q ?? '';
    const where: Prisma.NegocioWhereInput = {
      corredoraId: q.corredoraId,
      eliminadoEn: null,
      ...(q.estado !== 'todos' ? { estado: q.estado } : {}),
      ...(t
        ? {
            OR: [
              { datos: { path: ['codigo'], string_contains: t.toUpperCase() } },
              { cliente: { nombre: { contains: t, mode: 'insensitive' } } },
              { propiedad: { codigo: { contains: t, mode: 'insensitive' } } },
              { propiedad: { titulo: { contains: t, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [filas, total] = await Promise.all([
      this.db.negocio.findMany({
        where,
        orderBy: [{ actualizadoEn: 'desc' }, { id: 'desc' }],
        skip: q.pagina * POR_PAGINA,
        take: POR_PAGINA,
        include: { cliente: { select: { nombre: true } }, propiedad: { select: { codigo: true, titulo: true } }, corredor: { select: { nombre: true } } },
      }),
      this.db.negocio.count({ where }),
    ]);
    return {
      total,
      porPagina: POR_PAGINA,
      items: filas.map((n) => ({
        id: n.id,
        codigo: cod(n.datos),
        tipo: n.tipo,
        estado: n.estado,
        etapa: n.etapa,
        cliente: n.cliente?.nombre ?? '',
        propiedad: n.propiedad ? `${n.propiedad.codigo} · ${n.propiedad.titulo}` : '',
        corredor: n.corredor?.nombre ?? '',
        proximaFecha: n.proximaFecha?.toISOString().slice(0, 10) ?? null,
        actualizado: n.actualizadoEn.toISOString(),
      })),
    };
  }

  async una(corredoraId: string, id: string) {
    const n = await this.db.negocio.findFirst({
      where: { id, corredoraId },
      include: { cliente: { select: { id: true, nombre: true, rutFormato: true } }, propiedad: { select: { id: true, codigo: true, titulo: true, direccion: true, comuna: true } }, corredor: { select: { id: true, nombre: true, email: true } } },
    });
    if (!n) throw new NotFoundException('El negocio no existe en esa corredora.');
    const [firmas, historial] = await Promise.all([
      this.db.firma.findMany({ where: { corredoraId, negocioId: id, eliminadoEn: null }, orderBy: { enviadoEn: 'desc' }, take: 50 }),
      this.db.actividad.findMany({ where: { corredoraId, entidadId: id }, orderBy: { fecha: 'desc' }, take: 80 }),
    ]);
    return {
      id: n.id,
      codigo: cod(n.datos),
      tipo: n.tipo,
      estado: n.estado,
      etapa: n.etapa,
      proximaFecha: n.proximaFecha?.toISOString().slice(0, 10) ?? null,
      creado: n.creadoEn.toISOString(),
      actualizado: n.actualizadoEn.toISOString(),
      eliminado: !!n.eliminadoEn,
      cliente: n.cliente ? { id: n.cliente.id, nombre: n.cliente.nombre, rut: n.cliente.rutFormato ?? '' } : null,
      propiedad: n.propiedad ? { id: n.propiedad.id, codigo: n.propiedad.codigo, titulo: n.propiedad.titulo, direccion: [n.propiedad.direccion, n.propiedad.comuna].filter(Boolean).join(', ') } : null,
      corredor: n.corredor ? { id: n.corredor.id, nombre: n.corredor.nombre, email: n.corredor.email } : null,
      firmas: firmas.map((f) => ({ id: f.id, operacion: f.operacion, documento: f.documento, estado: f.estado, legalizado: f.legalizado, firmados: f.firmados, total: f.total, enviado: f.enviadoEn.toISOString(), firmantes: f.firmantes })),
      historial: historial.map((h) => ({ fecha: h.fecha.toISOString(), texto: h.texto, tipo: h.tipo })),
      datos: n.datos,
    };
  }
}

@Controller('soporte/negocios')
export class SoporteNegociosController {
  constructor(
    private readonly s: SoporteNegociosService,
    private readonly soporte: SoporteService,
  ) {}

  @Get()
  async lista(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listaQ)) q: z.infer<typeof listaQ>) {
    await this.soporte.exigir(u);
    return this.s.lista(q);
  }

  @Get(':id')
  async una(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idP)) id: string, @Query(new ZodPipe(corredoraQ)) q: z.infer<typeof corredoraQ>) {
    await this.soporte.exigir(u);
    return this.s.una(q.corredoraId, id);
  }
}
