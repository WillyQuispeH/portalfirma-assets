// Avisos: /v1/avisos. Lo que el servidor le quiere decir a un usuario (ver el modelo Aviso). Los crean los procesos de
// la API (p. ej. la revisión de firmas); la app los trae cada 30 s y los toma.
//  · GET  /          los propios sin tomar (los más antiguos primero, hasta 100);
//  · POST /tomar     { ids } → los que este pedido tomó (un aviso se toma una sola vez, aunque haya dos equipos).
// Los tomados se borran a los 30 días; los sin tomar, a los 90.
import { Body, Controller, Get, HttpCode, Injectable, Post } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';

export interface NuevoAviso {
  corredoraId: string;
  usuarioId: string;
  tipo: string;
  texto: string;
  datos?: Record<string, unknown>;
}

const tomarEsquema = z.object({
  ids: z
    .array(z.string().regex(/^\d{1,18}$/))
    .min(1)
    .max(100),
});

@Injectable()
export class AvisosService {
  private ultimaLimpieza = 0;
  constructor(private readonly db: PrismaService) {}

  async crear(a: NuevoAviso | NuevoAviso[]) {
    const l = Array.isArray(a) ? a : [a];
    if (!l.length) return;
    await this.db.aviso.createMany({
      data: l.map((x) => ({ ...x, texto: x.texto.slice(0, 2000), datos: (x.datos ?? {}) as Prisma.InputJsonObject })),
    });
  }

  async pendientes(u: UsuarioToken) {
    await this.limpiar();
    const l = await this.db.aviso.findMany({
      where: { usuarioId: u.sub, tomadoEn: null },
      orderBy: { id: 'asc' },
      take: 100,
    });
    return {
      items: l.map((a) => ({
        id: a.id.toString(),
        tipo: a.tipo,
        texto: a.texto,
        datos: a.datos,
        creado: a.creadoEn.toISOString(),
      })),
    };
  }

  async tomar(u: UsuarioToken, ids: string[]) {
    const r = await this.db.$queryRaw<{ id: bigint }[]>`
      UPDATE avisos SET tomado_en = now()
      WHERE usuario_id = ${u.sub}::uuid AND tomado_en IS NULL AND id = ANY(${ids.map((x) => BigInt(x))}::bigint[])
      RETURNING id`;
    return { tomados: r.map((x) => x.id.toString()) };
  }

  private async limpiar() {
    if (Date.now() - this.ultimaLimpieza < 6 * 36e5) return;
    this.ultimaLimpieza = Date.now();
    const dia = 864e5;
    await this.db.aviso.deleteMany({
      where: {
        OR: [
          { tomadoEn: { lt: new Date(Date.now() - 30 * dia) } },
          { creadoEn: { lt: new Date(Date.now() - 90 * dia) } },
        ],
      },
    });
  }
}

@Controller('avisos')
export class AvisosController {
  constructor(private readonly s: AvisosService) {}

  @Get()
  pendientes(@UsuarioActual() u: UsuarioToken) {
    return this.s.pendientes(u);
  }

  @Post('tomar')
  @HttpCode(200)
  tomar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(tomarEsquema)) b: z.infer<typeof tomarEsquema>) {
    return this.s.tomar(u, b.ids);
  }
}
