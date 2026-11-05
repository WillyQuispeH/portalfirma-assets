// Reglas notariales de la plataforma: /v1/reglas-notariales. Lo que se aprende corrigiendo la detección de materias y
// actos le sirve a todas las corredoras, sin que la información de una llegue a otra:
//  · los casos (documentos corregidos) los manda la app con los datos personales ya tachados. Cada corredora ve y
//    borra solo los suyos; el revisor de la plataforma (correos en PLATAFORMA_REVISORES) los ve todos, sin saber de
//    qué corredora ni de qué usuario vienen;
//  · las reglas son un solo documento de la plataforma (plataforma_documentos › «reglas_notariales»): todos lo leen
//    (solo las aprobadas); el revisor lo ve completo (con propuestas y pruebas) y lo cambia, con `version`.
//  · GET /                 reglas (aprobadas; completas para el revisor) · PUT / (revisor) documento entero con version
//  · GET /permisos         { revisor }
//  · GET /casos            los de la corredora, o todos para el revisor · POST /casos { items } · DELETE /casos/:id
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import type { Env } from '../config/env';

const CLAVE = 'reglas_notariales';
const CASOS_MAX = 2000;
const CASO_MAX = 32 * 1024;
const DOC_MAX = 2 * 1024 * 1024;
const idCaso = z.string().regex(/^[\w-]{4,64}$/, 'id de caso no válido');
const casosEsquema = z.object({ items: z.array(z.looseObject({ id: idCaso, clave: z.string().max(200).optional() })).min(1).max(500) });
const reglaEsquema = z.looseObject({ id: z.string().max(64), activo: z.boolean().optional(), patron: z.string().max(400) });
const documentoEsquema = z.object({
  /** la versión que se leyó (docVersion); 0 si todavía no hay reglas */
  version: z.number().int().min(0).default(0),
  reglas: z.object({
    version: z.string().max(40).nullable().optional(),
    actos: z.array(reglaEsquema).max(500).default([]),
    materias: z.array(reglaEsquema).max(500).default([]),
    excepciones: z.array(reglaEsquema).max(500).default([]),
    propuestas: z.array(z.looseObject({ id: z.string().max(64) })).max(200).default([]),
  }),
});
type Reglas = z.infer<typeof documentoEsquema>['reglas'];
const vacio = (): Reglas => ({ version: null, actos: [], materias: [], excepciones: [], propuestas: [] });
/** lo que ven todas las corredoras: solo las reglas aprobadas, sin las pruebas contra los casos */
const publicas = (r: Reglas) => {
  const sinPrueba = (x: Record<string, unknown>) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'prueba' && k !== 'casos'));
  return { version: r.version ?? null, actos: r.actos.map(sinPrueba), materias: r.materias.map(sinPrueba), excepciones: r.excepciones.map(sinPrueba), propuestas: [] };
};

@Injectable()
export class ReglasNotarialesService {
  private readonly revisores: string[];

  constructor(
    private readonly db: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.revisores = config.get('PLATAFORMA_REVISORES', { infer: true }) as unknown as string[];
  }

  async esRevisor(u: UsuarioToken) {
    if (!this.revisores.length) return false;
    const x = await this.db.usuario.findUnique({ where: { id: u.sub }, select: { email: true, activo: true } });
    return !!x?.activo && this.revisores.includes(x.email.toLowerCase());
  }
  private async exigirRevisor(u: UsuarioToken) {
    if (!(await this.esRevisor(u))) throw new ForbiddenException('Esto lo revisa Portalfirma.');
  }

  async obtener(u: UsuarioToken) {
    const d = await this.db.plataformaDocumento.findUnique({ where: { clave: CLAVE } });
    const r = { ...vacio(), ...((d?.datos as Reglas) ?? {}) };
    return (await this.esRevisor(u)) ? { ...r, docVersion: d?.version ?? 0 } : { ...publicas(r), docVersion: d?.version ?? 0 };
  }

  async guardar(u: UsuarioToken, b: z.infer<typeof documentoEsquema>) {
    await this.exigirRevisor(u);
    if (JSON.stringify(b.reglas).length > DOC_MAX) throw new BadRequestException('Las reglas son demasiado grandes.');
    const datos = b.reglas as unknown as Prisma.InputJsonObject;
    const actual = await this.db.plataformaDocumento.findUnique({ where: { clave: CLAVE } });
    if (!actual) {
      if (b.version > 0) throw new ConflictException('Las reglas cambiaron: vuelve a cargarlas.');
      const c = await this.db.plataformaDocumento.create({ data: { clave: CLAVE, datos, actualizadoPor: u.sub } });
      return { ...b.reglas, docVersion: c.version };
    }
    if (b.version !== actual.version) throw new ConflictException('Otra persona cambió las reglas: vuelve a cargarlas.');
    const r = await this.db.plataformaDocumento.updateMany({ where: { clave: CLAVE, version: actual.version }, data: { datos, version: { increment: 1 }, actualizadoPor: u.sub } });
    if (!r.count) throw new ConflictException('Otra persona cambió las reglas: vuelve a cargarlas.');
    return { ...b.reglas, docVersion: actual.version + 1 };
  }

  // ---------------------------------------------------------------- casos
  async casos(u: UsuarioToken) {
    const revisor = await this.esRevisor(u);
    const filas = await this.db.reglaCaso.findMany({ where: revisor ? {} : { corredoraId: u.corredoraId }, orderBy: { creadoEn: 'desc' }, take: CASOS_MAX });
    // nunca sale de qué corredora o usuario es el caso
    return filas.map((c) => ({ ...((c.datos as object) ?? {}), id: c.id, clave: c.clave, creado: c.creadoEn.toISOString(), propio: c.corredoraId === u.corredoraId }));
  }

  async agregarCasos(u: UsuarioToken, items: z.infer<typeof casosEsquema>['items']) {
    let n = 0;
    for (const x of items) {
      const { id, clave, creado, propio, ...resto } = x as Record<string, unknown> & { id: string; clave?: string };
      void creado; void propio;
      if (JSON.stringify(resto).length > CASO_MAX) continue;
      const k = String(clave || id).slice(0, 200);
      const datos = resto as Prisma.InputJsonObject;
      // un caso por documento y corredora: si se corrige de nuevo el mismo, se reemplaza
      await this.db.reglaCaso.upsert({
        where: { corredoraId_clave: { corredoraId: u.corredoraId, clave: k } },
        create: { id: `${id}-${u.corredoraId.slice(0, 8)}`, corredoraId: u.corredoraId, usuarioId: u.sub, clave: k, datos },
        update: { datos, usuarioId: u.sub, creadoEn: new Date() },
      });
      n++;
    }
    return { guardados: n };
  }

  async borrarCaso(u: UsuarioToken, id: string) {
    const c = await this.db.reglaCaso.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('El caso ya no existe.');
    if (c.corredoraId !== u.corredoraId && !(await this.esRevisor(u))) throw new NotFoundException('El caso ya no existe.');
    await this.db.reglaCaso.delete({ where: { id } });
    return { ok: true };
  }
}

@Controller('reglas-notariales')
export class ReglasNotarialesController {
  constructor(private readonly s: ReglasNotarialesService) {}

  @Get()
  obtener(@UsuarioActual() u: UsuarioToken) {
    return this.s.obtener(u);
  }

  @Put()
  guardar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(documentoEsquema)) b: z.infer<typeof documentoEsquema>) {
    return this.s.guardar(u, b);
  }

  @Get('permisos')
  async permisos(@UsuarioActual() u: UsuarioToken) {
    return { revisor: await this.s.esRevisor(u) };
  }

  @Get('casos')
  casos(@UsuarioActual() u: UsuarioToken) {
    return this.s.casos(u);
  }

  @Post('casos')
  agregar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(casosEsquema)) b: z.infer<typeof casosEsquema>) {
    return this.s.agregarCasos(u, b.items);
  }

  @Delete('casos/:id')
  borrar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(z.string().max(80))) id: string) {
    return this.s.borrarCaso(u, id);
  }
}
