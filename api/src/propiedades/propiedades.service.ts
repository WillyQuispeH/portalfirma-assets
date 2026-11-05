// La cartera de la corredora en la base. Reglas:
//  · toda la cartera es visible para todos los usuarios de la corredora;
//  · los datos del dueño (ficha propietario* y la persona propietaria) solo los ven el captador y el administrador;
//  · una propiedad que crea un CORREDOR queda como captación suya; asignar el captador, archivar e importar: ADMIN;
//  · cada cambio queda en el historial (actividad) con quién lo hizo; `version` evita pisar cambios ajenos.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActividadService, type NuevaActividad } from '../comun/actividad.service';
import { crearCursor, leerCursor } from '../comun/paginas';
import { formatearRut, limpiarRut, normalizar, palabras, rutValido } from '../comun/texto';
import type { UsuarioToken } from '../auth/usuario-actual';
import {
  columnas,
  combinarFicha,
  INCLUIR,
  propiedadApp,
  puedeVerDueno,
  sinDatosDelDueno,
  textoBusqueda,
  type PropiedadCompleta,
} from './propiedades.mapper';
import type { ImportarEntrada, ListarPropiedades, PropiedadEntrada, VinculoEntrada } from './propiedades.esquemas';

type Tx = Prisma.TransactionClient;
const soloAdmin = (u: UsuarioToken, que: string) => {
  if (u.rol !== 'ADMIN') throw new ForbiddenException(`${que} lo hace el administrador.`);
};

@Injectable()
export class PropiedadesService {
  constructor(
    private readonly db: PrismaService,
    private readonly actividad: ActividadService,
  ) {}

  private log(u: UsuarioToken, entidadId: string, texto: string, extra: Partial<NuevaActividad> = {}): NuevaActividad {
    return { corredoraId: u.corredoraId, entidadTipo: 'propiedad', entidadId, texto, usuarioId: u.sub, ...extra };
  }

  // ------------------------------------------------------------------ lectura

  async listar(u: UsuarioToken, f: ListarPropiedades) {
    const cursor = leerCursor(f.cursor);
    const sinc = !!f.desde;
    const where: Prisma.PropiedadWhereInput = {
      corredoraId: u.corredoraId,
      ...(sinc
        ? { actualizadoEn: { gt: new Date(f.desde!) } }
        : { eliminadoEn: null, ...(f.archivadas === 'todas' ? {} : { archivada: f.archivadas === 'si' }) }),
      ...(f.q ? { AND: palabras(f.q) } : {}),
      ...(f.tipo ? { tipo: f.tipo } : {}),
      ...(f.comuna ? { comuna: { equals: f.comuna, mode: 'insensitive' } } : {}),
      ...(f.operacion === 'venta' ? { venta: true, ...(f.estado ? { estadoVenta: f.estado } : {}) } : {}),
      ...(f.operacion === 'arriendo' ? { arriendo: true, ...(f.estado ? { estadoArriendo: f.estado } : {}) } : {}),
      ...(!f.operacion && f.estado ? { OR: [{ estadoVenta: f.estado }, { estadoArriendo: f.estado }] } : {}),
      ...(f.captador === 'yo'
        ? { captadorId: u.sub }
        : f.captador === 'sin'
          ? { captadorId: null }
          : f.captador
            ? { captadorId: f.captador }
            : {}),
    };
    const paginaWhere: Prisma.PropiedadWhereInput = cursor
      ? sinc
        ? { OR: [{ actualizadoEn: { gt: cursor.fecha } }, { actualizadoEn: cursor.fecha, id: { gt: cursor.id } }] }
        : { OR: [{ creadoEn: { lt: cursor.fecha } }, { creadoEn: cursor.fecha, id: { lt: cursor.id } }] }
      : {};
    const filas = await this.db.propiedad.findMany({
      where: { AND: [where, paginaWhere] },
      include: INCLUIR,
      orderBy: sinc ? [{ actualizadoEn: 'asc' }, { id: 'asc' }] : [{ creadoEn: 'desc' }, { id: 'desc' }],
      take: f.limite,
    });
    const ult = filas[filas.length - 1];
    return {
      items: filas.map((p) => propiedadApp(p, u)),
      siguiente: filas.length === f.limite && ult ? crearCursor(sinc ? ult.actualizadoEn : ult.creadoEn, ult.id) : null,
      servidorEn: new Date().toISOString(),
    };
  }

  private async buscar(u: UsuarioToken, id: string, tx: Tx = this.db): Promise<PropiedadCompleta> {
    const p = await tx.propiedad.findFirst({
      where: { id, corredoraId: u.corredoraId, eliminadoEn: null },
      include: INCLUIR,
    });
    if (!p) throw new NotFoundException('La propiedad ya no existe.');
    return p;
  }

  async obtener(u: UsuarioToken, id: string) {
    return propiedadApp(await this.buscar(u, id), u);
  }

  // ------------------------------------------------------------------ escritura

  /** Siguiente código PF-#### de la corredora (atómico: dos altas a la vez no reciben el mismo). */
  private async siguienteCodigo(tx: Tx, corredoraId: string) {
    for (let i = 0; i < 20; i++) {
      const [r] = await tx.$queryRaw<{ n: number }[]>`
        UPDATE corredoras SET siguiente_codigo = siguiente_codigo + 1 WHERE id = ${corredoraId}::uuid RETURNING siguiente_codigo - 1 AS n`;
      const codigo = `PF-${r.n}`;
      if (!(await tx.propiedad.findFirst({ where: { corredoraId, codigo }, select: { id: true } }))) return codigo;
    }
    throw new ConflictException('No se pudo asignar un código a la propiedad. Intenta de nuevo.');
  }

  private async fijarFotos(tx: Tx, propiedadId: string, urls: string[]) {
    await tx.propiedadFoto.deleteMany({ where: { propiedadId } });
    if (urls.length)
      await tx.propiedadFoto.createMany({
        data: urls.map((url, orden) => ({ propiedadId, url, orden, destacada: orden === 0 })),
      });
  }

  private async captadorValido(tx: Tx, u: UsuarioToken, id: string | null | undefined) {
    if (!id) return null;
    const c = await tx.usuario.findFirst({
      where: { id, corredoraId: u.corredoraId },
      select: { id: true, nombre: true },
    });
    if (!c) throw new BadRequestException('Ese usuario no es de tu corredora.');
    return c;
  }

  async crear(u: UsuarioToken, o: PropiedadEntrada) {
    if (!o.titulo) throw new BadRequestException('Indica un título para la propiedad.');
    if (!o.venta && !o.arriendo)
      throw new BadRequestException('Marca si la propiedad está en venta, en arriendo o ambas.');
    if (u.rol !== 'ADMIN') o = { ...o, captadorId: u.sub }; // la crea un corredor: queda como captación suya
    const p = await this.db.$transaction(async (tx) => {
      await this.captadorValido(tx, u, o.captadorId);
      const codigo =
        o.codigo && !(await tx.propiedad.findFirst({ where: { corredoraId: u.corredoraId, codigo: o.codigo } }))
          ? o.codigo
          : await this.siguienteCodigo(tx, u.corredoraId);
      const d = columnas(o) as Prisma.PropiedadUncheckedCreateInput;
      const creada = await tx.propiedad.create({
        data: {
          ...d,
          codigo,
          titulo: o.titulo!,
          corredoraId: u.corredoraId,
          estadoVenta: o.venta ? (o.estadoVenta ?? 'disponible') : null,
          estadoArriendo: o.arriendo ? (o.estadoArriendo ?? 'disponible') : null,
          ficha: combinarFicha({}, o.ficha ?? {}) as Prisma.InputJsonValue,
          captadorId: o.captadorId ?? null,
          idLegado: o.idLegado ?? null,
          creadoPorId: u.sub,
          busqueda: textoBusqueda({ ...o, codigo, titulo: o.titulo! }),
        },
      });
      if (o.fotos) await this.fijarFotos(tx, creada.id, o.fotos);
      await this.actividad.registrar(this.log(u, creada.id, 'Propiedad creada'), tx);
      return this.buscar(u, creada.id, tx);
    });
    return propiedadApp(p, u);
  }

  async actualizar(u: UsuarioToken, id: string, entrada: PropiedadEntrada) {
    const p = await this.db.$transaction(async (tx) => {
      const previa = await this.buscar(u, id, tx);
      if (entrada.version && entrada.version !== previa.version)
        throw new ConflictException({
          message: 'Otra persona cambió esta propiedad recién. Vuelve a abrirla.',
          code: 'VERSION',
        });
      // un corredor en una propiedad que no captó no toca los datos del dueño; el captador lo asigna el administrador
      let o = puedeVerDueno(u, previa) ? entrada : sinDatosDelDueno(entrada);
      if (u.rol !== 'ADMIN') o = { ...o, captadorId: undefined };
      const d = columnas(o);
      if (o.ficha) d.ficha = combinarFicha(previa.ficha, o.ficha) as Prisma.InputJsonValue;
      if (o.captadorId !== undefined) d.captadorId = (await this.captadorValido(tx, u, o.captadorId))?.id ?? null;
      if (
        o.codigo &&
        o.codigo !== previa.codigo &&
        (await tx.propiedad.findFirst({ where: { corredoraId: u.corredoraId, codigo: o.codigo } }))
      )
        throw new ConflictException('Ya hay otra propiedad con ese código.');

      // qué cambió de verdad (para el historial y para que una reimportación no pise lo editado aquí)
      const antes = propiedadApp(previa, u) as Record<string, unknown>;
      const cambios = Object.keys(o).filter(
        (k) =>
          !['version', 'idLegado'].includes(k) &&
          JSON.stringify(antes[k] ?? null) !== JSON.stringify((o as Record<string, unknown>)[k] ?? null),
      );
      if (!cambios.length) return previa;
      if (previa.origenSistema) d.editados = [...new Set([...previa.editados, ...cambios])];
      d.busqueda = textoBusqueda({
        codigo: (d.codigo as string) ?? previa.codigo,
        titulo: (d.titulo as string) ?? previa.titulo,
        direccion: (d.direccion as string | null | undefined) ?? previa.direccion,
        unidad: (d.unidad as string | null | undefined) ?? previa.unidad,
        comuna: (d.comuna as string | null | undefined) ?? previa.comuna,
      });
      await tx.propiedad.update({ where: { id }, data: { ...d, version: { increment: 1 } } });
      if (o.fotos) await this.fijarFotos(tx, id, o.fotos);
      const estados = cambios.filter((k) => /^estado/.test(k));
      const texto = estados.length
        ? 'Estado: ' +
          estados
            .map(
              (k) =>
                `${k === 'estadoVenta' ? 'venta' : 'arriendo'} ${((o as Record<string, string | null | undefined>)[k] ?? '—').replace('_', ' ')}`,
            )
            .join(', ')
        : `Ficha actualizada (${cambios.length} ${cambios.length === 1 ? 'dato' : 'datos'})`;
      await this.actividad.registrar(this.log(u, id, texto), tx);
      return this.buscar(u, id, tx);
    });
    return propiedadApp(p, u);
  }

  async archivar(u: UsuarioToken, id: string, archivada: boolean) {
    soloAdmin(u, 'Archivar una propiedad');
    await this.buscar(u, id);
    await this.db.$transaction(async (tx) => {
      await tx.propiedad.update({ where: { id }, data: { archivada, version: { increment: 1 } } });
      await this.actividad.registrar(this.log(u, id, archivada ? 'Propiedad archivada' : 'Propiedad restaurada'), tx);
    });
    return this.obtener(u, id);
  }

  async eliminar(u: UsuarioToken, id: string) {
    soloAdmin(u, 'Eliminar una propiedad');
    await this.buscar(u, id);
    // borrado lógico: libera el código y el id de origen, y deja la marca para la sincronización
    await this.db.propiedad.update({
      where: { id },
      data: {
        eliminadoEn: new Date(),
        codigo: `eliminada-${id}`,
        origenId: null,
        idLegado: null,
        version: { increment: 1 },
      },
    });
    return true;
  }

  async asignarCaptador(u: UsuarioToken, id: string, captadorId: string | null) {
    soloAdmin(u, 'Asignar quién captó una propiedad');
    const previa = await this.buscar(u, id);
    if ((previa.captadorId ?? null) === captadorId) return propiedadApp(previa, u);
    await this.db.$transaction(async (tx) => {
      const nuevo = await this.captadorValido(tx, u, captadorId);
      const antes = previa.captadorId
        ? await tx.usuario.findUnique({ where: { id: previa.captadorId }, select: { nombre: true } })
        : null;
      await tx.propiedad.update({ where: { id }, data: { captadorId: nuevo?.id ?? null, version: { increment: 1 } } });
      const texto = nuevo
        ? antes
          ? `Captador: pasó de ${antes.nombre} a ${nuevo.nombre}`
          : `Captada por ${nuevo.nombre}`
        : `Quedó sin captador${antes ? ` (era ${antes.nombre})` : ''}`;
      await this.actividad.registrar(this.log(u, id, texto), tx);
    });
    return this.obtener(u, id);
  }

  /** El administrador asigna el captador a varias propiedades de una vez (la cartera importada llega sin captador). */
  async asignarVarios(u: UsuarioToken, ids: string[], captadorId: string | null) {
    soloAdmin(u, 'Asignar quién captó las propiedades');
    let cambiadas = 0;
    for (const id of ids) {
      const p = await this.db.propiedad.findFirst({
        where: { id, corredoraId: u.corredoraId, eliminadoEn: null },
        select: { captadorId: true },
      });
      if (p && (p.captadorId ?? null) !== captadorId) {
        await this.asignarCaptador(u, id, captadorId);
        cambiadas++;
      }
    }
    return { cambiadas, total: ids.length };
  }

  // ------------------------------------------------------------------ personas vinculadas

  async vincular(u: UsuarioToken, id: string, { personaId, rol }: VinculoEntrada) {
    const p = await this.buscar(u, id);
    const c = await this.db.persona.findFirst({
      where: { id: personaId, corredoraId: u.corredoraId, eliminadoEn: null },
    });
    if (!c) throw new NotFoundException('La persona ya no existe.');
    if (rol === 'propietario' && !puedeVerDueno(u, p))
      throw new ForbiddenException('El propietario lo vincula quien captó la propiedad o el administrador.');
    if (p.vinculos.some((v) => v.personaId === personaId && v.rol === rol)) return propiedadApp(p, u);
    await this.db.$transaction(async (tx) => {
      await tx.propiedadPersona.create({ data: { propiedadId: id, personaId, rol } });
      if (!c.roles.includes(rol))
        await tx.persona.update({
          where: { id: personaId },
          data: { roles: [...c.roles, rol], version: { increment: 1 } },
        });
      await tx.propiedad.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.actividad.registrar(this.log(u, id, `${c.nombre} vinculado como ${rol}`, { ref2: personaId }), tx);
    });
    return this.obtener(u, id);
  }

  async desvincular(u: UsuarioToken, id: string, { personaId, rol }: VinculoEntrada) {
    const p = await this.buscar(u, id);
    if (rol === 'propietario' && !puedeVerDueno(u, p))
      throw new ForbiddenException('El propietario lo cambia quien captó la propiedad o el administrador.');
    const c = await this.db.persona.findUnique({ where: { id: personaId }, select: { nombre: true } });
    await this.db.$transaction(async (tx) => {
      await tx.propiedadPersona.deleteMany({ where: { propiedadId: id, personaId, rol } });
      await tx.propiedad.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.actividad.registrar(
        this.log(u, id, `${c?.nombre ?? 'Persona'} ya no figura como ${rol}`, { ref2: personaId }),
        tx,
      );
    });
    return this.obtener(u, id);
  }

  // ------------------------------------------------------------------ importación (Portalfirma u otro sistema)

  /**
   * Crea o actualiza por (sistema, origenId): reimportar no duplica y no pisa lo editado en Asset (`editados`).
   * El propietario (con RUT válido) entra al CRM y queda vinculado.
   */
  async importar(u: UsuarioToken, { sistema, items }: ImportarEntrada) {
    soloAdmin(u, 'Importar la cartera');
    const res = { nuevas: 0, actualizadas: 0, sinCambios: 0, personas: 0, total: items.length };
    for (const it of items) {
      await this.db.$transaction(async (tx) => {
        const previa = await tx.propiedad.findFirst({
          where: { corredoraId: u.corredoraId, origenSistema: sistema, origenId: it.origenId },
          include: INCLUIR,
        });
        let propId: string;
        if (!previa) {
          const o = it.datos;
          const codigo =
            o.codigo && !(await tx.propiedad.findFirst({ where: { corredoraId: u.corredoraId, codigo: o.codigo } }))
              ? o.codigo
              : await this.siguienteCodigo(tx, u.corredoraId);
          const titulo = o.titulo || `Propiedad ${codigo}`;
          const creada = await tx.propiedad.create({
            data: {
              ...(columnas(o) as Prisma.PropiedadUncheckedCreateInput),
              codigo,
              titulo,
              corredoraId: u.corredoraId,
              ficha: combinarFicha({}, o.ficha ?? {}) as Prisma.InputJsonValue,
              origenSistema: sistema,
              origenId: it.origenId,
              origenDatos: (it.origenDatos ?? {}) as Prisma.InputJsonValue,
              creadoPorId: u.sub,
              busqueda: textoBusqueda({ ...o, codigo, titulo }),
            },
          });
          if (o.fotos?.length) await this.fijarFotos(tx, creada.id, o.fotos);
          await this.actividad.registrar(this.log(u, creada.id, `Importada desde ${sistema}`), tx);
          propId = creada.id;
          res.nuevas++;
        } else {
          propId = previa.id;
          // solo lo que no se editó en Asset
          const libres = Object.fromEntries(
            Object.entries(it.datos).filter(([k]) => !previa.editados.includes(k)),
          ) as PropiedadEntrada;
          const antes = propiedadApp(previa, u) as Record<string, unknown>;
          const cambios = Object.keys(libres).filter(
            (k) => JSON.stringify(antes[k] ?? null) !== JSON.stringify((libres as Record<string, unknown>)[k] ?? null),
          );
          const d = columnas(libres);
          if (libres.ficha) d.ficha = combinarFicha(previa.ficha, libres.ficha) as Prisma.InputJsonValue;
          if (cambios.length) {
            await tx.propiedad.update({
              where: { id: previa.id },
              data: {
                ...d,
                origenDatos: {
                  ...((previa.origenDatos as object) ?? {}),
                  ...(it.origenDatos ?? {}),
                } as Prisma.InputJsonValue,
                busqueda: textoBusqueda({
                  ...previa,
                  ...(libres as object),
                  codigo: libres.codigo ?? previa.codigo,
                  titulo: libres.titulo || previa.titulo,
                }),
                version: { increment: 1 },
              },
            });
            if (libres.fotos) await this.fijarFotos(tx, previa.id, libres.fotos);
            await this.actividad.registrar(
              this.log(
                u,
                previa.id,
                `Actualizada desde ${sistema} (${cambios.length} ${cambios.length === 1 ? 'dato' : 'datos'})`,
              ),
              tx,
            );
            res.actualizadas++;
          } else res.sinCambios++;
        }
        // el propietario al CRM (por RUT) y vinculado
        const pr = it.propietario;
        if (pr?.rut && rutValido(pr.rut)) {
          const rut = limpiarRut(pr.rut);
          let c = await tx.persona.findFirst({ where: { corredoraId: u.corredoraId, rut } });
          if (!c) {
            const nombre = (pr.nombre || 'Propietario').trim();
            c = await tx.persona.create({
              data: {
                corredoraId: u.corredoraId,
                nombre,
                rut,
                rutFormato: formatearRut(rut),
                email: pr.email?.trim().toLowerCase() || null,
                telefono: pr.telefono?.trim() || null,
                roles: ['propietario'],
                busqueda: normalizar(nombre, formatearRut(rut), pr.email, pr.telefono),
              },
            });
            await this.actividad.registrar(
              {
                corredoraId: u.corredoraId,
                entidadTipo: 'persona',
                entidadId: c.id,
                texto: `Propietario importado desde ${sistema}`,
                usuarioId: u.sub,
              },
              tx,
            );
            res.personas++;
          } else if (!c.roles.includes('propietario')) {
            await tx.persona.update({
              where: { id: c.id },
              data: { roles: [...c.roles, 'propietario'], version: { increment: 1 } },
            });
          }
          await tx.propiedadPersona.upsert({
            where: { propiedadId_personaId_rol: { propiedadId: propId, personaId: c.id, rol: 'propietario' } },
            create: { propiedadId: propId, personaId: c.id, rol: 'propietario' },
            update: {},
          });
        }
      });
    }
    return res;
  }

  // ------------------------------------------------------------------ resumen (inicio)

  async resumen(u: UsuarioToken) {
    const base = { corredoraId: u.corredoraId, eliminadoEn: null, archivada: false };
    const c = (w: Prisma.PropiedadWhereInput) => this.db.propiedad.count({ where: { ...base, ...w } });
    const [total, vDisp, vRes, vVend, aDisp, aRes, aArr, sinProp, sinFotos, personas] = await Promise.all([
      c({}),
      c({ venta: true, estadoVenta: 'disponible' }),
      c({ venta: true, estadoVenta: 'reservada' }),
      c({ venta: true, estadoVenta: 'vendida' }),
      c({ arriendo: true, estadoArriendo: 'disponible' }),
      c({ arriendo: true, estadoArriendo: 'reservada' }),
      c({ arriendo: true, estadoArriendo: 'arrendada' }),
      c({ vinculos: { none: { rol: 'propietario' } } }),
      c({ fotos: { none: {} } }),
      this.db.persona.count({ where: { corredoraId: u.corredoraId, eliminadoEn: null } }),
    ]);
    return {
      propiedades: total,
      personas,
      venta: { disponible: vDisp, reservada: vRes, vendida: vVend },
      arriendo: { disponible: aDisp, reservada: aRes, arrendada: aArr },
      sinPropietario: sinProp,
      sinFotos,
    };
  }
}
