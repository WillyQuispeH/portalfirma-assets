// Personas para soporte: /v1/soporte/personas. Ver y corregir las personas (CRM) de CUALQUIER corredora: buscar, editar todos sus
// datos, eliminar y restaurar, fusionar duplicadas y quitar vínculos con propiedades. Solo entran los correos de
// PLATAFORMA_REVISORES. Usa las mismas reglas que la app (RUT válido y único, nombre que no sea RUT, sin duplicar) y cada cambio queda
// en el historial de la persona con «Soporte (correo)» y en el log del servidor.
//  · GET    /soporte/personas?corredoraId=&q=&eliminadas=&pagina=   lista (100 por página)
//  · GET    /soporte/personas/:id?corredoraId=                      ficha completa: datos, vínculos, negocios, leads, historial, parecidas
//  · POST   /soporte/personas                                       crear
//  · PATCH  /soporte/personas/:id                                   editar (cualquier dato)
//  · DELETE /soporte/personas/:id?corredoraId=&quitarVinculos=      eliminar (borrado lógico; con quitarVinculos suelta antes sus propiedades)
//  · POST   /soporte/personas/:id/restaurar                         volver a dejarla activa
//  · POST   /soporte/personas/fusionar                              { origenId, destinoId }: pasa todo al destino y da de baja al origen
//  · POST   /soporte/personas/:id/quitar-vinculo                    { propiedadId, rol }
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, Logger, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ActividadService } from '../comun/actividad.service';
import { formatearRut, limpiarRut, palabras } from '../comun/texto';
import { PersonasService, personaApp } from '../personas/personas.service';
import { personaEsquema, personaParcial, ROLES } from '../personas/personas.esquemas';
import { SoporteService } from './soporte';

const corredoraQ = z.object({ corredoraId: z.uuid() });
const listaQ = z.object({
  corredoraId: z.uuid(),
  q: z.string().trim().max(100).optional(),
  eliminadas: z.enum(['0', '1']).default('0'),
  pagina: z.coerce.number().int().min(0).max(10_000).default(0),
});
const idP = z.uuid();
const crearB = personaEsquema.extend({ corredoraId: z.uuid(), forzar: z.boolean().default(false) });
const editarB = personaParcial.extend({ corredoraId: z.uuid() });
const eliminarQ = z.object({ corredoraId: z.uuid(), quitarVinculos: z.enum(['0', '1']).default('0') });
const corrB = z.object({ corredoraId: z.uuid() });
const fusionB = z.object({ corredoraId: z.uuid(), origenId: z.uuid(), destinoId: z.uuid() });
const vinculoB = z.object({ corredoraId: z.uuid(), propiedadId: z.uuid(), rol: z.enum(ROLES) });
const POR_PAGINA = 100;

@Injectable()
export class SoportePersonasService {
  private readonly log = new Logger('SoportePersonas');
  constructor(
    private readonly db: PrismaService,
    private readonly personas: PersonasService,
    private readonly actividad: ActividadService,
  ) {}

  /** con la misma regla de la app, pero como administrador de la corredora que se está corrigiendo */
  private como(u: UsuarioToken, corredoraId: string): UsuarioToken {
    return { ...u, corredoraId, rol: 'ADMIN' };
  }

  private async existe(corredoraId: string, id: string, eliminadas = false) {
    const p = await this.db.persona.findFirst({ where: { id, corredoraId, ...(eliminadas ? {} : { eliminadoEn: null }) } });
    if (!p) throw new NotFoundException('La persona no existe en esa corredora.');
    return p;
  }

  private async anotar(u: UsuarioToken, quien: string, corredoraId: string, personaId: string, texto: string, ref2?: string) {
    await this.actividad.registrar({ corredoraId, entidadTipo: 'persona', entidadId: personaId, texto: `Soporte (${quien}): ${texto}`, ref2: ref2 ?? null, usuarioId: u.sub });
    this.log.warn(`${quien} → persona ${personaId} (corredora ${corredoraId}): ${texto}`);
  }

  async lista(q: z.infer<typeof listaQ>) {
    const where: Prisma.PersonaWhereInput = {
      corredoraId: q.corredoraId,
      eliminadoEn: q.eliminadas === '1' ? { not: null } : null,
      ...(q.q ? { AND: palabras(q.q) } : {}),
    };
    const [filas, total] = await Promise.all([
      this.db.persona.findMany({ where, orderBy: [{ actualizadoEn: 'desc' }, { id: 'desc' }], skip: q.pagina * POR_PAGINA, take: POR_PAGINA }),
      this.db.persona.count({ where }),
    ]);
    return {
      total,
      porPagina: POR_PAGINA,
      items: filas.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        rut: p.rutFormato ?? '',
        tipo: p.tipo,
        email: p.email ?? '',
        telefono: p.telefono ?? '',
        roles: p.roles,
        eliminada: !!p.eliminadoEn,
        actualizada: p.actualizadoEn.toISOString(),
      })),
    };
  }

  async ficha(corredoraId: string, id: string) {
    const p = await this.existe(corredoraId, id, true);
    const [vinculos, negocios, leads, historial, parecida] = await Promise.all([
      this.db.propiedadPersona.findMany({ where: { personaId: id }, include: { propiedad: { select: { id: true, codigo: true, titulo: true, direccion: true, comuna: true, eliminadoEn: true } } } }),
      this.db.negocio.findMany({ where: { corredoraId, clienteId: id, eliminadoEn: null }, orderBy: { actualizadoEn: 'desc' }, take: 50, select: { id: true, tipo: true, estado: true, etapa: true, datos: true } }),
      this.db.lead.findMany({ where: { corredoraId, personaId: id, eliminadoEn: null }, orderBy: { actualizadoEn: 'desc' }, take: 20, select: { id: true, estado: true, origen: true, datos: true } }),
      this.actividad.de(corredoraId, id, 60),
      p.eliminadoEn ? null : this.personas.parecida(corredoraId, { nombre: p.nombre, rut: p.rut, email: p.email, telefono: p.telefono }, id),
    ]);
    // otras personas que podrían ser la misma: por nombre, correo o celular (la primera que calza)
    const parecidas = parecida ? [{ id: parecida.persona.id, nombre: parecida.persona.nombre, rut: parecida.persona.rutFormato ?? '', email: parecida.persona.email ?? '', telefono: parecida.persona.telefono ?? '', motivo: parecida.motivo }] : [];
    const codigo = (d: unknown) => String(((d ?? {}) as { codigo?: unknown }).codigo ?? '');
    return {
      persona: personaApp(p),
      eliminada: !!p.eliminadoEn,
      vinculos: vinculos.map((v) => ({ propiedadId: v.propiedadId, rol: v.rol, codigo: v.propiedad.codigo, titulo: v.propiedad.titulo, direccion: [v.propiedad.direccion, v.propiedad.comuna].filter(Boolean).join(', '), eliminada: !!v.propiedad.eliminadoEn })),
      negocios: negocios.map((n) => ({ id: n.id, codigo: codigo(n.datos), tipo: n.tipo, estado: n.estado, etapa: n.etapa })),
      leads: leads.map((l) => ({ id: l.id, nombre: String(((l.datos ?? {}) as { nombre?: unknown }).nombre ?? ''), estado: l.estado, origen: l.origen })),
      historial: historial.map((h) => ({ fecha: h.fecha, texto: h.texto, tipo: h.tipo })),
      parecidas,
    };
  }

  async crear(u: UsuarioToken, quien: string, b: z.infer<typeof crearB>) {
    const { corredoraId, forzar, ...o } = b;
    const p = (await this.personas.crear(this.como(u, corredoraId), o, { forzar })) as { id: string };
    await this.anotar(u, quien, corredoraId, p.id, 'creó la persona');
    return this.ficha(corredoraId, p.id);
  }

  async editar(u: UsuarioToken, quien: string, id: string, b: z.infer<typeof editarB>) {
    const { corredoraId, version: _version, ...o } = b;
    const antes = await this.existe(corredoraId, id);
    await this.personas.actualizar(this.como(u, corredoraId), id, o);
    const cambios = (['nombre', 'rut', 'tipo', 'email', 'telefono', 'direccion', 'estadoCivil', 'profesion', 'nacionalidad', 'roles', 'notas'] as const).filter((k) => {
      if (o[k] === undefined) return false;
      const antiguo = k === 'rut' ? (antes.rutFormato ?? '') : (antes[k] ?? '');
      const nuevo = k === 'rut' ? (o.rut ? formatearRut(o.rut) : '') : (o[k] ?? '');
      return JSON.stringify(antiguo) !== JSON.stringify(nuevo);
    });
    if (cambios.length) await this.anotar(u, quien, corredoraId, id, `corrigió ${cambios.join(', ')}`);
    return this.ficha(corredoraId, id);
  }

  async eliminar(u: UsuarioToken, quien: string, id: string, corredoraId: string, quitarVinculos: boolean) {
    const p = await this.existe(corredoraId, id);
    if (quitarVinculos) {
      const n = await this.db.propiedadPersona.deleteMany({ where: { personaId: id } });
      if (n.count) await this.anotar(u, quien, corredoraId, id, `soltó ${n.count} vínculo(s) con propiedades antes de eliminarla`);
    }
    await this.personas.eliminar(this.como(u, corredoraId), id);
    await this.anotar(u, quien, corredoraId, id, `eliminó a «${p.nombre}»`);
    return { ok: true };
  }

  async restaurar(u: UsuarioToken, quien: string, id: string, corredoraId: string) {
    const p = await this.existe(corredoraId, id, true);
    if (!p.eliminadoEn) return this.ficha(corredoraId, id);
    // al eliminarla se libera el RUT (queda su formato): se le devuelve si nadie más lo usa
    const rut = p.rutFormato ? limpiarRut(p.rutFormato) : null;
    const ocupado = rut ? await this.db.persona.findFirst({ where: { corredoraId, rut, eliminadoEn: null }, select: { nombre: true } }) : null;
    await this.db.persona.update({ where: { id }, data: { eliminadoEn: null, rut: ocupado ? null : rut, version: { increment: 1 } } });
    await this.anotar(u, quien, corredoraId, id, ocupado ? `la restauró sin RUT (lo usa ${ocupado.nombre})` : 'la restauró');
    return this.ficha(corredoraId, id);
  }

  /** pasa todo lo de `origen` a `destino` (vínculos, negocios, leads, eventos, historial, envíos) y da de baja a `origen` */
  async fusionar(u: UsuarioToken, quien: string, b: z.infer<typeof fusionB>) {
    const { corredoraId, origenId, destinoId } = b;
    if (origenId === destinoId) throw new BadRequestException('Elige dos personas distintas.');
    const [o, d] = await Promise.all([this.existe(corredoraId, origenId), this.existe(corredoraId, destinoId)]);
    if (o.rut && d.rut && o.rut !== d.rut) throw new ConflictException(`Tienen RUT distintos (${o.rutFormato} y ${d.rutFormato}): no son la misma persona. Corrige uno de los dos antes.`);
    await this.db.$transaction(async (tx) => {
      // vínculos con propiedades: los que el destino ya tiene se descartan
      const vs = await tx.propiedadPersona.findMany({ where: { personaId: origenId } });
      for (const v of vs) {
        const ya = await tx.propiedadPersona.findUnique({ where: { propiedadId_personaId_rol: { propiedadId: v.propiedadId, personaId: destinoId, rol: v.rol } } });
        if (ya) await tx.propiedadPersona.delete({ where: { propiedadId_personaId_rol: { propiedadId: v.propiedadId, personaId: origenId, rol: v.rol } } });
        else await tx.propiedadPersona.update({ where: { propiedadId_personaId_rol: { propiedadId: v.propiedadId, personaId: origenId, rol: v.rol } }, data: { personaId: destinoId } });
      }
      await tx.negocio.updateMany({ where: { corredoraId, clienteId: origenId }, data: { clienteId: destinoId } });
      await tx.lead.updateMany({ where: { corredoraId, personaId: origenId }, data: { personaId: destinoId } });
      await tx.$executeRaw`UPDATE eventos SET persona_ids = array_replace(persona_ids, ${origenId}, ${destinoId}) WHERE corredora_id = ${corredoraId}::uuid AND ${origenId} = ANY(persona_ids)`;
      await tx.waProgramado.updateMany({ where: { corredoraId, personaId: origenId }, data: { personaId: destinoId } });
      await tx.actividad.updateMany({ where: { corredoraId, entidadTipo: 'persona', entidadId: origenId }, data: { entidadId: destinoId } });
      await tx.actividad.updateMany({ where: { corredoraId, ref2: origenId }, data: { ref2: destinoId } });
      // el destino completa lo que le falta con lo del origen (nunca pisa lo que ya tiene)
      const completa: Prisma.PersonaUncheckedUpdateInput = {
        roles: [...new Set([...d.roles, ...o.roles])],
        ...(!d.rut && o.rut ? { rut: o.rut, rutFormato: o.rutFormato } : {}),
        ...(!d.email && o.email ? { email: o.email } : {}),
        ...(!d.telefono && o.telefono ? { telefono: o.telefono } : {}),
        ...(!d.direccion && o.direccion ? { direccion: o.direccion } : {}),
        ...(!d.estadoCivil && o.estadoCivil ? { estadoCivil: o.estadoCivil } : {}),
        ...(!d.profesion && o.profesion ? { profesion: o.profesion } : {}),
        ...(o.notas && !(d.notas ?? '').includes(o.notas) ? { notas: [d.notas, o.notas].filter(Boolean).join('\n') } : {}),
        extra: { ...((o.extra as object) ?? {}), ...((d.extra as object) ?? {}) } as Prisma.InputJsonValue,
      };
      // el RUT se libera en el origen antes de pasarlo al destino (es único por corredora)
      await tx.persona.update({ where: { id: origenId }, data: { eliminadoEn: new Date(), rut: null, version: { increment: 1 } } });
      await tx.persona.update({ where: { id: destinoId }, data: { ...completa, version: { increment: 1 } } });
    });
    await this.anotar(u, quien, corredoraId, destinoId, `fusionó aquí a «${o.nombre}»${o.rutFormato ? ` (RUT ${o.rutFormato})` : ''}`, origenId);
    return this.ficha(corredoraId, destinoId);
  }

  async quitarVinculo(u: UsuarioToken, quien: string, id: string, b: z.infer<typeof vinculoB>) {
    await this.existe(b.corredoraId, id, true);
    const r = await this.db.propiedadPersona.deleteMany({ where: { personaId: id, propiedadId: b.propiedadId, rol: b.rol } });
    if (!r.count) throw new NotFoundException('Ese vínculo ya no existe.');
    const prop = await this.db.propiedad.findUnique({ where: { id: b.propiedadId }, select: { codigo: true } });
    await this.anotar(u, quien, b.corredoraId, id, `quitó su vínculo como ${b.rol} de la propiedad ${prop?.codigo ?? b.propiedadId}`, b.propiedadId);
    return this.ficha(b.corredoraId, id);
  }
}

@Controller('soporte/personas')
export class SoportePersonasController {
  constructor(
    private readonly s: SoportePersonasService,
    private readonly soporte: SoporteService,
  ) {}

  @Get()
  async lista(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listaQ)) q: z.infer<typeof listaQ>) {
    await this.soporte.exigir(u);
    return this.s.lista(q);
  }

  @Post()
  async crear(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(crearB)) b: z.infer<typeof crearB>) {
    return this.s.crear(u, await this.soporte.exigir(u), b);
  }

  // «fusionar» va antes de «:id» para que no se lea como un id
  @Post('fusionar')
  async fusionar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(fusionB)) b: z.infer<typeof fusionB>) {
    return this.s.fusionar(u, await this.soporte.exigir(u), b);
  }

  @Get(':id')
  async ficha(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idP)) id: string, @Query(new ZodPipe(corredoraQ)) q: z.infer<typeof corredoraQ>) {
    await this.soporte.exigir(u);
    return this.s.ficha(q.corredoraId, id);
  }

  @Patch(':id')
  async editar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idP)) id: string, @Body(new ZodPipe(editarB)) b: z.infer<typeof editarB>) {
    return this.s.editar(u, await this.soporte.exigir(u), id, b);
  }

  @Delete(':id')
  async eliminar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idP)) id: string, @Query(new ZodPipe(eliminarQ)) q: z.infer<typeof eliminarQ>) {
    return this.s.eliminar(u, await this.soporte.exigir(u), id, q.corredoraId, q.quitarVinculos === '1');
  }

  @Post(':id/restaurar')
  async restaurar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idP)) id: string, @Body(new ZodPipe(corrB)) b: z.infer<typeof corrB>) {
    return this.s.restaurar(u, await this.soporte.exigir(u), id, b.corredoraId);
  }

  @Post(':id/quitar-vinculo')
  async quitarVinculo(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idP)) id: string, @Body(new ZodPipe(vinculoB)) b: z.infer<typeof vinculoB>) {
    return this.s.quitarVinculo(u, await this.soporte.exigir(u), id, b);
  }
}
