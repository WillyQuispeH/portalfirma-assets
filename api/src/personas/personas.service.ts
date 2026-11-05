// Personas de la corredora (CRM). RUT único por corredora (si viene); borrado lógico; historial en actividad.
// Privacidad: un CORREDOR no ve los datos de los dueños de propiedades que no captó (salvo que la persona también esté
// vinculada a una propiedad suya); se le muestran como «Propietario (reservado)».
import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, type Persona } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActividadService } from '../comun/actividad.service';
import { crearCursor, leerCursor } from '../comun/paginas';
import { formatearRut, limpiarRut, normalizar, palabras, rutValido, texto } from '../comun/texto';
import type { UsuarioToken } from '../auth/usuario-actual';
import type { ListarPersonas, PersonaEntrada, PersonaParcial } from './personas.esquemas';

// razón social o RUT de 50 millones o más → empresa
const RAZON_SOCIAL =
  /\b(spa|s\.?p\.?a\.?|ltda\.?|limitada|s\.\s?a\.?|sociedad an[oó]nima|eirl|e\.i\.r\.l\.?|sociedad|inversiones|inmobiliaria|constructora|comercial|servicios)\b/i;
const esEmpresa = (nombre: string, rut?: string | null) =>
  Number(limpiarRut(rut).slice(0, -1) || 0) >= 50_000_000 || RAZON_SOCIAL.test(nombre);

/** La persona como la usa la app de escritorio. */
export function personaApp(p: Persona, reservada = false) {
  const extra = (p.extra ?? {}) as Record<string, unknown>;
  const base = {
    ...extra,
    id: p.id,
    nombre: p.nombre,
    rut: p.rutFormato ?? '',
    tipo: p.tipo,
    email: p.email ?? '',
    telefono: p.telefono ?? '',
    direccion: p.direccion ?? '',
    estadoCivil: p.estadoCivil ?? '',
    profesion: p.profesion ?? '',
    nacionalidad: p.nacionalidad ?? 'chilena',
    roles: p.roles,
    notas: p.notas ?? '',
    idLegado: p.idLegado,
    version: p.version,
    creado: p.creadoEn.toISOString(),
    actualizado: p.actualizadoEn.toISOString(),
    ...(p.eliminadoEn ? { eliminado: true } : {}),
  };
  if (!reservada) return base;
  return {
    ...base,
    nombre: 'Propietario (reservado)',
    rut: '',
    email: '',
    telefono: '',
    direccion: '',
    estadoCivil: '',
    profesion: '',
    notas: '',
    reservado: true,
  };
}

@Injectable()
export class PersonasService {
  constructor(
    private readonly db: PrismaService,
    private readonly actividad: ActividadService,
  ) {}

  /** Ids de personas cuyos datos no puede ver este usuario (dueños de propiedades ajenas sin otro vínculo visible). */
  async reservadas(u: UsuarioToken): Promise<Set<string>> {
    if (u.rol === 'ADMIN') return new Set();
    const vinculos = await this.db.propiedadPersona.findMany({
      where: { propiedad: { corredoraId: u.corredoraId, eliminadoEn: null } },
      select: { personaId: true, rol: true, propiedad: { select: { captadorId: true } } },
    });
    const visibles = new Set<string>();
    const duenos = new Set<string>();
    for (const v of vinculos) {
      if (v.rol === 'propietario' && v.propiedad.captadorId !== u.sub) duenos.add(v.personaId);
      else visibles.add(v.personaId);
    }
    for (const id of visibles) duenos.delete(id);
    return duenos;
  }

  async listar(u: UsuarioToken, f: ListarPersonas) {
    const cursor = leerCursor(f.cursor);
    const sinc = !!f.desde;
    const where: Prisma.PersonaWhereInput = {
      corredoraId: u.corredoraId,
      ...(sinc ? { actualizadoEn: { gt: new Date(f.desde!) } } : { eliminadoEn: null }),
      ...(f.q ? { AND: palabras(f.q) } : {}),
      ...(cursor
        ? sinc
          ? { OR: [{ actualizadoEn: { gt: cursor.fecha } }, { actualizadoEn: cursor.fecha, id: { gt: cursor.id } }] }
          : { OR: [{ creadoEn: { lt: cursor.fecha } }, { creadoEn: cursor.fecha, id: { lt: cursor.id } }] }
        : {}),
    };
    const filas = await this.db.persona.findMany({
      where,
      orderBy: sinc ? [{ actualizadoEn: 'asc' }, { id: 'asc' }] : [{ creadoEn: 'desc' }, { id: 'desc' }],
      take: f.limite,
    });
    const r = await this.reservadas(u);
    const ult = filas[filas.length - 1];
    return {
      items: filas.map((p) => personaApp(p, r.has(p.id))),
      siguiente: filas.length === f.limite && ult ? crearCursor(sinc ? ult.actualizadoEn : ult.creadoEn, ult.id) : null,
      servidorEn: new Date().toISOString(),
    };
  }

  private async buscar(u: UsuarioToken, id: string) {
    const p = await this.db.persona.findFirst({ where: { id, corredoraId: u.corredoraId, eliminadoEn: null } });
    if (!p) throw new NotFoundException('La persona ya no existe.');
    return p;
  }

  async obtener(u: UsuarioToken, id: string) {
    const p = await this.buscar(u, id);
    return personaApp(p, (await this.reservadas(u)).has(p.id));
  }

  private datos(o: PersonaParcial, previo?: Persona): Prisma.PersonaUncheckedUpdateInput {
    const d: Prisma.PersonaUncheckedUpdateInput = {};
    if (o.nombre !== undefined) d.nombre = o.nombre.trim().replace(/\s+/g, ' ');
    if (o.rut !== undefined) {
      const r = String(o.rut ?? '').trim();
      if (r && !rutValido(r)) throw new BadRequestException('El RUT no es válido.');
      d.rut = r ? limpiarRut(r) : null;
      d.rutFormato = r ? formatearRut(r) : null;
    }
    for (const k of ['email', 'telefono', 'direccion', 'estadoCivil', 'profesion', 'notas'] as const)
      if (o[k] !== undefined) d[k] = texto(o[k]);
    if (o.email !== undefined && typeof d.email === 'string') d.email = d.email.toLowerCase();
    if (o.nacionalidad !== undefined) d.nacionalidad = texto(o.nacionalidad) ?? 'chilena';
    if (o.roles !== undefined) d.roles = [...new Set(o.roles ?? [])];
    if (o.extra !== undefined)
      d.extra = { ...((previo?.extra as object) ?? {}), ...(o.extra ?? {}) } as Prisma.InputJsonValue;
    const nombre = (d.nombre as string | undefined) ?? previo?.nombre ?? '';
    if (o.tipo) d.tipo = o.tipo;
    else if (!previo) d.tipo = esEmpresa(nombre, (d.rut as string | null) ?? null) ? 'juridica' : 'natural';
    d.busqueda = normalizar(
      nombre,
      ((d.rutFormato as string | null | undefined) ?? previo?.rutFormato) || '',
      ((d.email as string | null | undefined) ?? previo?.email) || '',
      ((d.telefono as string | null | undefined) ?? previo?.telefono) || '',
    );
    return d;
  }

  private duplicado(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new ConflictException({ message: 'Ya existe una persona con ese RUT.', code: 'DUP_RUT' });
    throw e;
  }

  async crear(u: UsuarioToken, o: PersonaEntrada) {
    const d = this.datos(o) as Prisma.PersonaUncheckedCreateInput;
    try {
      const p = await this.db.$transaction(async (tx) => {
        const p = await tx.persona.create({
          data: { ...d, corredoraId: u.corredoraId, idLegado: texto(o.idLegado, 80) },
        });
        await this.actividad.registrar(
          {
            corredoraId: u.corredoraId,
            entidadTipo: 'persona',
            entidadId: p.id,
            texto: 'Persona creada',
            usuarioId: u.sub,
          },
          tx,
        );
        return p;
      });
      return personaApp(p);
    } catch (e) {
      this.duplicado(e);
    }
  }

  async actualizar(u: UsuarioToken, id: string, o: PersonaParcial) {
    const previo = await this.buscar(u, id);
    if ((await this.reservadas(u)).has(id))
      throw new ConflictException('No tienes acceso a los datos de esta persona.');
    if (o.version && o.version !== previo.version)
      throw new ConflictException({
        message: 'Otra persona cambió estos datos recién. Vuelve a abrirlos.',
        code: 'VERSION',
      });
    try {
      const p = await this.db.$transaction(async (tx) => {
        const p = await tx.persona.update({
          where: { id },
          data: { ...this.datos(o, previo), version: { increment: 1 } },
        });
        await this.actividad.registrar(
          {
            corredoraId: u.corredoraId,
            entidadTipo: 'persona',
            entidadId: id,
            texto: 'Datos actualizados',
            usuarioId: u.sub,
          },
          tx,
        );
        return p;
      });
      return personaApp(p);
    } catch (e) {
      this.duplicado(e);
    }
  }

  async eliminar(u: UsuarioToken, id: string) {
    await this.buscar(u, id);
    const usos = await this.db.propiedadPersona.findMany({
      where: { personaId: id, propiedad: { eliminadoEn: null } },
      select: { propiedad: { select: { codigo: true } } },
      take: 2,
    });
    if (usos.length)
      throw new ConflictException({
        message: `No se puede eliminar: está vinculada a ${usos.length === 1 ? 'la propiedad ' + usos[0].propiedad.codigo : 'varias propiedades'}. Quita primero el vínculo.`,
        code: 'EN_USO',
      });
    // borrado lógico: libera el RUT (para poder volver a crearla) y deja la marca para la sincronización
    await this.db.persona.update({
      where: { id },
      data: { eliminadoEn: new Date(), rut: null, version: { increment: 1 } },
    });
    return true;
  }
}
