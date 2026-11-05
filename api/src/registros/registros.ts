// Registros: /v1/registros/:coleccion. Documentos de la app agrupados por colección (ver el modelo Registro): la app
// los trabaja en memoria y manda el documento entero (PUT con `version`), y trae los cambios con ?desde=, como los
// negocios. Solo se aceptan las colecciones de COLECCIONES, cada una con:
//  · max: tamaño máximo de cada documento;
//  · porUsuario: cada usuario ve y cambia solo los suyos (plazos, expedientes); si no, son de toda la corredora;
//  · archivos: sus documentos pueden tener archivos en R2 (subida firmada, descarga con link firmado), bajo
//    c/<corredora>/r/<colección>/<usuario o «todos»>/<id del registro>/;
//  · soloAdmin: escribirla es del administrador.
// Contadores: POST /v1/contadores/:serie → el siguiente número de la serie (folios), atómico.
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Prisma, type Registro } from '@prisma/client';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { crearCursor, leerCursor } from '../comun/paginas';
import { idDoc, igualJson, listarEsquema, type ListarAsignados } from '../comun/asignados';
import { AlmacenamientoService } from '../archivos/almacenamiento.service';

const KB = 1024;
interface IColeccion {
  max: number;
  porUsuario?: boolean;
  archivos?: boolean;
  soloAdmin?: boolean;
}
export const COLECCIONES: Record<string, IColeccion> = {
  // postventa (de toda la corredora)
  pv_proyectos: { max: 32 * KB },
  pv_unidades: { max: 32 * KB },
  pv_reclamos: { max: 512 * KB },
  pv_contratistas: { max: 16 * KB },
  pv_chats: { max: 1024 * KB }, // la conversación de WhatsApp con el propietario
  pv_config: { max: 64 * KB },
  // gestión documental (de cada usuario, con sus archivos)
  plazos: { max: 256 * KB, porUsuario: true, archivos: true },
  expedientes: { max: 512 * KB, porUsuario: true, archivos: true },
  // la corredora
  corredora_config: { max: 128 * KB },
  consentimientos: { max: 16 * KB }, // quién autorizó importar mensajes de una cuenta (registro legal)
  // cada usuario
  perfil: { max: 32 * KB, porUsuario: true }, // datos propios para los documentos (RUT del corredor…); id «perfil-<usuario>»
};
const ARCHIVO_MAX = 50 * 1024 * 1024;
const coleccionEsquema = z.string().refine((c) => c in COLECCIONES, 'colección desconocida');
const SERVIDOR = ['id', 'version', 'creado', 'actualizado', 'eliminado'];
const registroEsquema = z.looseObject({ version: z.number().int().positive().optional() });
const importarEsquema = z.object({ items: z.array(z.record(z.string(), z.unknown())).min(1).max(200) });
const contadorEsquema = z.object({ minimo: z.number().int().min(0).max(1e9).optional() });
const serieEsquema = z.string().regex(/^[A-Z][A-Z0-9_-]{0,19}$/, 'serie en mayúsculas (p. ej. PV)');
const subidasEsquema = z.object({
  archivos: z
    .array(
      z.object({
        nombre: z.string().trim().min(1).max(200),
        tipo: z
          .string()
          .max(120)
          .regex(/^[\w.+-]+\/[\w.+-]+$/)
          .default('application/octet-stream'),
        tamano: z.number().int().min(1).max(ARCHIVO_MAX),
      }),
    )
    .min(1)
    .max(50),
});
const descargaEsquema = z.object({ clave: z.string().max(400), nombre: z.string().max(200).default('archivo') });
const borrarEsquema = z.object({ claves: z.array(z.string().max(400)).min(1).max(200) });

const datosDe = (c: string, o: Record<string, unknown>) => {
  const d = Object.fromEntries(Object.entries(o).filter(([k, v]) => !SERVIDOR.includes(k) && v !== undefined));
  if (JSON.stringify(d).length > COLECCIONES[c].max)
    throw new BadRequestException(`El registro es demasiado grande para «${c}».`);
  return d as Prisma.InputJsonObject;
};
export const registroApp = (r: Registro) => ({
  ...((r.datos as object) ?? {}),
  id: r.id,
  version: r.version,
  creado: r.creadoEn.toISOString(),
  actualizado: r.actualizadoEn.toISOString(),
});

@Injectable()
export class RegistrosService {
  constructor(
    private readonly db: PrismaService,
    private readonly r2: AlmacenamientoService,
  ) {}

  private puedeEscribir(u: UsuarioToken, c: string) {
    if (COLECCIONES[c].soloAdmin && u.rol !== 'ADMIN') throw new ForbiddenException('Esto lo cambia el administrador.');
  }
  private clave = (u: UsuarioToken, c: string, id: string) => ({
    corredoraId_coleccion_id: { corredoraId: u.corredoraId, coleccion: c, id },
  });
  /** en las colecciones de cada usuario, solo lo suyo */
  private dueno = (u: UsuarioToken, c: string) => (COLECCIONES[c].porUsuario ? { usuarioId: u.sub } : {});
  private esMio = (u: UsuarioToken, c: string, r: Registro) => !COLECCIONES[c].porUsuario || r.usuarioId === u.sub;

  async listar(u: UsuarioToken, c: string, f: ListarAsignados) {
    const cursor = leerCursor(f.cursor);
    const filas = await this.db.registro.findMany({
      where: {
        AND: [
          {
            corredoraId: u.corredoraId,
            coleccion: c,
            ...this.dueno(u, c),
            ...(f.desde ? { actualizadoEn: { gt: new Date(f.desde) } } : { eliminadoEn: null }),
          },
          cursor
            ? { OR: [{ actualizadoEn: { gt: cursor.fecha } }, { actualizadoEn: cursor.fecha, id: { gt: cursor.id } }] }
            : {},
        ],
      },
      orderBy: [{ actualizadoEn: 'asc' }, { id: 'asc' }],
      take: f.limite,
    });
    const ult = filas[filas.length - 1];
    return {
      items: filas.map((r) => (r.eliminadoEn ? { id: r.id, eliminado: true } : registroApp(r))),
      siguiente: filas.length === f.limite && ult ? crearCursor(ult.actualizadoEn, ult.id) : null,
      servidorEn: new Date().toISOString(),
    };
  }

  private async buscar(u: UsuarioToken, c: string, id: string) {
    const r = await this.db.registro.findUnique({ where: this.clave(u, c, id) });
    if (!r || r.eliminadoEn || !this.esMio(u, c, r)) throw new NotFoundException('Ese registro ya no está.');
    return r;
  }

  async obtener(u: UsuarioToken, c: string, id: string) {
    return registroApp(await this.buscar(u, c, id));
  }

  async guardar(u: UsuarioToken, c: string, id: string, o: Record<string, unknown> & { version?: number }) {
    this.puedeEscribir(u, c);
    const datos = datosDe(c, o);
    const previa = await this.db.registro.findUnique({ where: this.clave(u, c, id) });
    if (previa && !this.esMio(u, c, previa))
      throw new ConflictException({ message: 'Ese id ya está en uso.', code: 'ID_OCUPADO' });
    if (previa?.eliminadoEn) throw new NotFoundException({ message: 'Ese registro fue eliminado.', code: 'ELIMINADO' });
    if (!previa) {
      try {
        return registroApp(
          await this.db.registro.create({
            data: { corredoraId: u.corredoraId, coleccion: c, id, datos, creadoPorId: u.sub, ...this.dueno(u, c) },
          }),
        );
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
          throw new ConflictException({ message: 'Ese registro se acaba de crear en otro equipo.', code: 'VERSION' });
        throw e;
      }
    }
    if (o.version && o.version !== previa.version)
      throw new ConflictException({ message: 'Otra persona cambió este registro recién.', code: 'VERSION' });
    if (igualJson(datos, previa.datos)) return registroApp(previa);
    const r = await this.db.registro.updateMany({
      where: { corredoraId: u.corredoraId, coleccion: c, id, version: previa.version },
      data: { datos, version: { increment: 1 } },
    });
    if (!r.count)
      throw new ConflictException({ message: 'Otra persona cambió este registro recién.', code: 'VERSION' });
    return this.obtener(u, c, id);
  }

  async eliminar(u: UsuarioToken, c: string, id: string) {
    this.puedeEscribir(u, c);
    await this.buscar(u, c, id);
    await this.db.registro.update({
      where: this.clave(u, c, id),
      data: { eliminadoEn: new Date(), version: { increment: 1 } },
    });
    return { ok: true };
  }

  /** Lo que estaba en un equipo: se crea lo que no existe (no pisa nada). */
  async importar(u: UsuarioToken, c: string, items: Record<string, unknown>[]) {
    this.puedeEscribir(u, c);
    const rechazados: { id: unknown; motivo: string }[] = [];
    const validos: { id: string; datos: Prisma.InputJsonObject }[] = [];
    for (const x of items) {
      const id = idDoc.safeParse(x.id);
      if (!id.success) {
        rechazados.push({ id: x.id, motivo: id.error.issues[0].message });
        continue;
      }
      try {
        validos.push({ id: id.data, datos: datosDe(c, x) });
      } catch (e) {
        rechazados.push({ id: x.id, motivo: (e as Error).message });
      }
    }
    const r = await this.db.registro.createMany({
      skipDuplicates: true,
      data: validos.map((v) => ({
        corredoraId: u.corredoraId,
        coleccion: c,
        id: v.id,
        datos: v.datos,
        creadoPorId: u.sub,
        ...this.dueno(u, c),
      })),
    });
    return { nuevos: r.count, existentes: validos.length - r.count, rechazados };
  }

  // ------------------------------------------------------------------ archivos de un registro (R2)

  /** carpeta de los archivos de un registro: c/<corredora>/r/<colección>/<usuario|todos>/<id>/ */
  private carpeta(u: UsuarioToken, c: string, id: string) {
    if (!COLECCIONES[c].archivos) throw new BadRequestException('Esta colección no guarda archivos.');
    return `c/${u.corredoraId}/r/${c}/${COLECCIONES[c].porUsuario ? u.sub : 'todos'}/${id}/`;
  }
  /** el registro puede no existir todavía (se sube el archivo antes de crearlo), pero si existe debe ser de este usuario */
  private async puedeArchivos(u: UsuarioToken, c: string, id: string) {
    const r = await this.db.registro.findUnique({ where: this.clave(u, c, id) });
    if (r && !this.esMio(u, c, r)) throw new NotFoundException('Ese registro ya no está.');
    return this.carpeta(u, c, id);
  }

  async subidas(u: UsuarioToken, c: string, id: string, archivos: { nombre: string; tipo: string; tamano: number }[]) {
    const dir = await this.puedeArchivos(u, c, id);
    return {
      subidas: await Promise.all(
        archivos.map(async (a) => {
          const ext = (a.nombre.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? '').toLowerCase();
          const clave = `${dir}${randomUUID()}${ext ? '.' + ext : ''}`;
          return { nombre: a.nombre, clave, subida: await this.r2.urlSubida(clave, a.tipo, a.tamano) };
        }),
      ),
    };
  }

  async descarga(u: UsuarioToken, c: string, id: string, clave: string, nombre: string) {
    const dir = await this.puedeArchivos(u, c, id);
    if (!clave.startsWith(dir)) throw new BadRequestException('Ese archivo no es de este registro.');
    if ((await this.r2.tamano(clave)) == null) throw new NotFoundException('El archivo ya no está.');
    return { url: await this.r2.urlDescarga(clave, nombre) };
  }

  async borrarArchivos(u: UsuarioToken, c: string, id: string, claves: string[]) {
    const dir = await this.puedeArchivos(u, c, id);
    if (claves.some((k) => !k.startsWith(dir))) throw new BadRequestException('Ese archivo no es de este registro.');
    this.r2.borrar(claves);
    return { ok: true };
  }

  /** El siguiente número de la serie (si se indica `minimo`, la serie sigue desde ahí como mínimo). */
  async contador(u: UsuarioToken, serie: string, minimo = 0) {
    const [r] = await this.db.$queryRaw<{ valor: number }[]>`
      INSERT INTO contadores (corredora_id, serie, valor) VALUES (${u.corredoraId}::uuid, ${serie}, ${minimo + 1})
      ON CONFLICT (corredora_id, serie) DO UPDATE SET valor = GREATEST(contadores.valor + 1, ${minimo + 1})
      RETURNING valor`;
    return { serie, valor: Number(r.valor) };
  }
}

@Controller('registros/:coleccion')
export class RegistrosController {
  constructor(private readonly registros: RegistrosService) {}

  /** GET /v1/registros/:coleccion?desde=&cursor=&limite= */
  @Get()
  listar(
    @UsuarioActual() u: UsuarioToken,
    @Param('coleccion', new ZodPipe(coleccionEsquema)) c: string,
    @Query(new ZodPipe(listarEsquema)) f: ListarAsignados,
  ) {
    return this.registros.listar(u, c, f);
  }

  /** POST /v1/registros/:coleccion/importar — { items } (hasta 200): crea los que no existen */
  @Post('importar')
  importar(
    @UsuarioActual() u: UsuarioToken,
    @Param('coleccion', new ZodPipe(coleccionEsquema)) c: string,
    @Body(new ZodPipe(importarEsquema)) b: { items: Record<string, unknown>[] },
  ) {
    return this.registros.importar(u, c, b.items);
  }

  @Get(':id')
  obtener(
    @UsuarioActual() u: UsuarioToken,
    @Param('coleccion', new ZodPipe(coleccionEsquema)) c: string,
    @Param('id', new ZodPipe(idDoc)) id: string,
  ) {
    return this.registros.obtener(u, c, id);
  }

  /** PUT /v1/registros/:coleccion/:id — el documento completo (crea o reemplaza), con `version` si ya existía */
  @Put(':id')
  guardar(
    @UsuarioActual() u: UsuarioToken,
    @Param('coleccion', new ZodPipe(coleccionEsquema)) c: string,
    @Param('id', new ZodPipe(idDoc)) id: string,
    @Body(new ZodPipe(registroEsquema)) o: Record<string, unknown> & { version?: number },
  ) {
    return this.registros.guardar(u, c, id, o);
  }

  @Delete(':id')
  eliminar(
    @UsuarioActual() u: UsuarioToken,
    @Param('coleccion', new ZodPipe(coleccionEsquema)) c: string,
    @Param('id', new ZodPipe(idDoc)) id: string,
  ) {
    return this.registros.eliminar(u, c, id);
  }

  /** POST /v1/registros/:coleccion/:id/archivos/subidas — { archivos: [{ nombre, tipo, tamano }] } → [{ clave, subida }] */
  @Post(':id/archivos/subidas')
  subidas(
    @UsuarioActual() u: UsuarioToken,
    @Param('coleccion', new ZodPipe(coleccionEsquema)) c: string,
    @Param('id', new ZodPipe(idDoc)) id: string,
    @Body(new ZodPipe(subidasEsquema)) b: z.infer<typeof subidasEsquema>,
  ) {
    return this.registros.subidas(u, c, id, b.archivos);
  }

  /** GET /v1/registros/:coleccion/:id/archivos/descarga?clave=&nombre= → { url } (5 minutos) */
  @Get(':id/archivos/descarga')
  descarga(
    @UsuarioActual() u: UsuarioToken,
    @Param('coleccion', new ZodPipe(coleccionEsquema)) c: string,
    @Param('id', new ZodPipe(idDoc)) id: string,
    @Query(new ZodPipe(descargaEsquema)) q: z.infer<typeof descargaEsquema>,
  ) {
    return this.registros.descarga(u, c, id, q.clave, q.nombre);
  }

  /** POST /v1/registros/:coleccion/:id/archivos/borrar — { claves } */
  @Post(':id/archivos/borrar')
  borrarArchivos(
    @UsuarioActual() u: UsuarioToken,
    @Param('coleccion', new ZodPipe(coleccionEsquema)) c: string,
    @Param('id', new ZodPipe(idDoc)) id: string,
    @Body(new ZodPipe(borrarEsquema)) b: { claves: string[] },
  ) {
    return this.registros.borrarArchivos(u, c, id, b.claves);
  }
}

@Controller('contadores')
export class ContadoresController {
  constructor(private readonly registros: RegistrosService) {}

  /** POST /v1/contadores/:serie — { minimo? } → { serie, valor } (el siguiente número) */
  @Post(':serie')
  siguiente(
    @UsuarioActual() u: UsuarioToken,
    @Param('serie', new ZodPipe(serieEsquema)) serie: string,
    @Body(new ZodPipe(contadorEsquema)) b: { minimo?: number },
  ) {
    return this.registros.contador(u, serie, b.minimo ?? 0);
  }
}
