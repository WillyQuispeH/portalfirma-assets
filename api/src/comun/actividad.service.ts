// Historial (tabla actividad): lo que pasó con cada propiedad, persona, negocio o evento, y quién lo hizo.
import { Global, Injectable, Module } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type EntidadTipo = 'propiedad' | 'persona' | 'negocio' | 'evento' | 'otro';

export interface NuevaActividad {
  corredoraId: string;
  entidadTipo: EntidadTipo;
  entidadId: string;
  texto: string;
  ref2?: string | null;
  tipo?: string | null;
  usuarioId?: string | null;
}

const fila = (a: NuevaActividad): Prisma.ActividadCreateManyInput => ({
  corredoraId: a.corredoraId,
  entidadTipo: a.entidadTipo,
  entidadId: a.entidadId,
  texto: String(a.texto).slice(0, 600),
  ref2: a.ref2 ?? null,
  tipo: a.tipo ?? null,
  usuarioId: a.usuarioId ?? null,
});

const salida = (a: {
  id: bigint;
  entidadTipo: string;
  entidadId: string;
  ref2: string | null;
  tipo: string | null;
  texto: string;
  usuarioId: string | null;
  fecha: Date;
}) => ({
  id: a.id.toString(),
  clase: a.entidadTipo,
  ref: a.entidadId,
  ref2: a.ref2,
  tipo: a.tipo,
  texto: a.texto,
  usuarioId: a.usuarioId,
  fecha: a.fecha.toISOString(),
});

@Injectable()
export class ActividadService {
  constructor(private readonly db: PrismaService) {}

  /** Registra una o varias entradas. Acepta un cliente de transacción para que quede junto con el cambio. */
  async registrar(entradas: NuevaActividad | NuevaActividad[], tx: Prisma.TransactionClient = this.db) {
    const lista = Array.isArray(entradas) ? entradas : [entradas];
    if (lista.length) await tx.actividad.createMany({ data: lista.map(fila) });
  }

  /** Lo de una entidad (como referencia principal o relacionada), lo más reciente primero. */
  async de(corredoraId: string, entidadId: string, limite = 200) {
    const r = await this.db.actividad.findMany({
      where: { corredoraId, OR: [{ entidadId }, { ref2: entidadId }] },
      orderBy: { fecha: 'desc' },
      take: Math.min(limite, 500),
    });
    return r.map(salida);
  }

  /** Toda la actividad de la corredora, por páginas (antes de `antesDe`, el id de la última que se vio). */
  async todas(corredoraId: string, { antesDe, limite = 60 }: { antesDe?: string; limite?: number }) {
    const r = await this.db.actividad.findMany({
      where: { corredoraId, ...(antesDe ? { id: { lt: BigInt(antesDe) } } : {}) },
      orderBy: { id: 'desc' },
      take: Math.min(limite, 200),
    });
    return {
      items: r.map(salida),
      siguiente: r.length === Math.min(limite, 200) ? r[r.length - 1].id.toString() : null,
    };
  }
}

@Global()
@Module({ providers: [ActividadService], exports: [ActividadService] })
export class ActividadModule {}
