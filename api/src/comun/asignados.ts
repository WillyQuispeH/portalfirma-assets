// Lo común de los datos «a cargo de un corredor» que la app de escritorio sincroniza como documentos completos
// (negocios y eventos de la agenda; después, leads):
//  · el id lo pone la app (texto): el mismo de su JSON local o un UUID para los nuevos;
//  · PUT /:id crea o reemplaza el documento entero, con `version` para no pisar cambios ajenos;
//  · GET ?desde= trae lo que cambió en la corredora: lo que este usuario no puede ver (o lo borrado) llega solo como
//    { id, eliminado: true }, así la app lo saca de su copia si se lo reasignaron a otro;
//  · el corredor ve y edita lo suyo; el administrador, todo. Reasignar es del administrador.
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { PrismaService } from '../prisma/prisma.service';
import type { UsuarioToken } from '../auth/usuario-actual';
import { crearCursor, leerCursor } from './paginas';

export const idDoc = z.string().regex(/^[\w-]{6,64}$/, 'id no válido (6 a 64 letras, números, - o _)');
export const fechaDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha AAAA-MM-DD');
export const isoOpc = z.iso.datetime({ offset: true }).optional().catch(undefined);

export const listarEsquema = z.object({
  desde: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(500).default(200),
});
export type ListarAsignados = z.infer<typeof listarEsquema>;

/** Campos que maneja el servidor: no se guardan dentro de `datos`. */
export const DEL_SERVIDOR = ['id', 'version', 'creado', 'actualizado', 'eliminado', 'creadoPorId'];
const DATOS_MAX = 256 * 1024;

export const esAdmin = (u: UsuarioToken) => u.rol === 'ADMIN';
export const puedeVer = (u: UsuarioToken, x: { corredorId: string | null }) =>
  esAdmin(u) || (!!x.corredorId && x.corredorId === u.sub);

/** El resto del documento (lo que no tiene columna) para guardar en `datos`. */
export function restoDatos(o: Record<string, unknown>, columnas: string[]) {
  const fuera = new Set([...DEL_SERVIDOR, ...columnas]);
  const datos = Object.fromEntries(Object.entries(o).filter(([k, v]) => !fuera.has(k) && v !== undefined));
  if (JSON.stringify(datos).length > DATOS_MAX) throw new BadRequestException('El registro es demasiado grande.');
  return datos;
}

/** Fila común de las tablas a cargo de un corredor. */
export interface FilaAsignada {
  id: string;
  corredoraId: string;
  corredorId: string | null;
  datos: unknown;
  version: number;
  creadoEn: Date;
  actualizadoEn: Date;
  eliminadoEn: Date | null;
}

export const metaApp = (f: FilaAsignada) => ({
  version: f.version,
  creado: f.creadoEn.toISOString(),
  actualizado: f.actualizadoEn.toISOString(),
});

/** Delegado de Prisma (negocio o evento) con lo que usan las funciones comunes. */
export interface Delegado<F extends FilaAsignada> {
  findMany(a: unknown): Promise<F[]>;
  findUnique(a: unknown): Promise<F | null>;
}

/** Listado paginado; con `desde` es la sincronización por cambios (incluye lo borrado y lo no visible como baja). */
export async function listar<F extends FilaAsignada, A>(
  tabla: Delegado<F>,
  u: UsuarioToken,
  f: ListarAsignados,
  aApp: (fila: F) => A,
) {
  const cursor = leerCursor(f.cursor);
  const sinc = !!f.desde;
  const where = {
    corredoraId: u.corredoraId,
    ...(sinc ? { actualizadoEn: { gt: new Date(f.desde!) } } : { eliminadoEn: null }),
    // sin `desde`, el corredor recibe solo lo suyo; con `desde`, todo lo que cambió (lo ajeno, como baja)
    ...(!sinc && !esAdmin(u) ? { corredorId: u.sub } : {}),
  };
  const pagina = cursor
    ? { OR: [{ actualizadoEn: { gt: cursor.fecha } }, { actualizadoEn: cursor.fecha, id: { gt: cursor.id } }] }
    : {};
  const filas = await tabla.findMany({
    where: { AND: [where, pagina] },
    orderBy: [{ actualizadoEn: 'asc' }, { id: 'asc' }],
    take: f.limite,
  });
  const ult = filas[filas.length - 1];
  return {
    items: filas.map((x) => (x.eliminadoEn || !puedeVer(u, x) ? { id: x.id, eliminado: true } : aApp(x))),
    siguiente: filas.length === f.limite && ult ? crearCursor(ult.actualizadoEn, ult.id) : null,
    servidorEn: new Date().toISOString(),
  };
}

/** La fila (viva) visible para este usuario, o 404/403. */
export async function buscarVisible<F extends FilaAsignada>(
  tabla: Delegado<F>,
  u: UsuarioToken,
  id: string,
  que: string,
) {
  const x = await tabla.findUnique({ where: { id } });
  if (!x || x.corredoraId !== u.corredoraId || x.eliminadoEn) throw new NotFoundException(`${que} ya no existe.`);
  if (!puedeVer(u, x)) throw new ForbiddenException(`${que} es de otro corredor.`);
  return x;
}

/** Antes de un PUT: ¿existe? ¿es de esta corredora? ¿coincide la versión? Devuelve la fila previa o null (nueva). */
export async function revisarPut<F extends FilaAsignada>(
  tabla: Delegado<F>,
  u: UsuarioToken,
  id: string,
  version: number | undefined,
  que: string,
) {
  const previa = await tabla.findUnique({ where: { id } });
  if (!previa) return null;
  if (previa.corredoraId !== u.corredoraId)
    throw new ConflictException({ message: 'Ese id ya está en uso.', code: 'ID_OCUPADO' });
  if (previa.eliminadoEn) throw new NotFoundException({ message: `${que} fue eliminado.`, code: 'ELIMINADO' });
  if (!puedeVer(u, previa)) throw new ForbiddenException(`${que} es de otro corredor.`);
  if (version && version !== previa.version)
    throw new ConflictException({ message: `Otra persona cambió ${que.toLowerCase()} recién.`, code: 'VERSION' });
  return previa;
}

/** Ids de referencias de la corredora que existen (para validar propiedad, persona y corredor). */
export async function referencias(
  db: PrismaService,
  u: UsuarioToken,
  r: {
    propiedades?: (string | null | undefined)[];
    personas?: (string | null | undefined)[];
    usuarios?: (string | null | undefined)[];
  },
) {
  const ids = (l?: (string | null | undefined)[]) => [...new Set((l ?? []).filter((x): x is string => !!x))];
  const [p, c, us] = await Promise.all([
    ids(r.propiedades).length
      ? db.propiedad.findMany({
          where: { corredoraId: u.corredoraId, id: { in: ids(r.propiedades) } },
          select: { id: true },
        })
      : [],
    ids(r.personas).length
      ? db.persona.findMany({
          where: { corredoraId: u.corredoraId, id: { in: ids(r.personas) } },
          select: { id: true },
        })
      : [],
    ids(r.usuarios).length
      ? db.usuario.findMany({
          where: { corredoraId: u.corredoraId, id: { in: ids(r.usuarios) } },
          select: { id: true },
        })
      : [],
  ]);
  return {
    propiedades: new Set(p.map((x) => x.id)),
    personas: new Set(c.map((x) => x.id)),
    usuarios: new Set(us.map((x) => x.id)),
  };
}

/** JSON con las claves ordenadas: para comparar contenido (jsonb reordena las claves al guardar) */
export const estable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(estable)
    : v && typeof v === 'object' && !(v instanceof Date)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, estable((v as Record<string, unknown>)[k])]),
        )
      : v;
export const igualJson = (a: unknown, b: unknown) => JSON.stringify(estable(a)) === JSON.stringify(estable(b));

export const esUuid = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
