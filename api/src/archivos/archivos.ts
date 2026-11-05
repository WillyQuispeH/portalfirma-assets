// Fotos y documentos de una propiedad en R2. La subida es en tres pasos, sin que los bytes pasen por la API:
//  1. la app pide una subida (tipo y tamaño) → recibe una URL firmada (PUT, 15 min) y la clave o URL pública;
//  2. la app sube el archivo directo a R2 con ese PUT;
//  3. fotos: la app manda la lista nueva en el PATCH de la propiedad (como siempre, urls https);
//     documentos: la app confirma (POST …/documentos con la clave) y la API revisa que el archivo esté y pese lo dicho.
// Bajar un documento: GET …/documentos/:doc/descarga → URL firmada (5 min) con su nombre original.
// Toda la cartera es visible para la corredora, así que cualquier usuario de ella puede ver y agregar documentos.
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Global,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ActividadService } from '../comun/actividad.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { INCLUIR, propiedadApp } from '../propiedades/propiedades.mapper';
import { AlmacenamientoService } from './almacenamiento.service';

export const FOTO_MAX = 15 * 1024 * 1024;
export const DOC_MAX = 50 * 1024 * 1024;
const FOTO_TIPOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const subidaFotosEsquema = z.object({
  archivos: z
    .array(
      z.object({
        tipo: z.enum(Object.keys(FOTO_TIPOS)),
        tamano: z.number().int().min(1).max(FOTO_MAX),
        /** referencia de origen (p. ej. «d-<id de Drive>»), va al inicio del nombre para reconocer repetidas */
        ref: z
          .string()
          .regex(/^[\w-]{1,48}$/)
          .optional(),
      }),
    )
    .min(1)
    .max(40),
});
const nombreDoc = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .transform((s) => s.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_'));
const subidaDocEsquema = z.object({
  nombre: nombreDoc,
  tipoArchivo: z
    .string()
    .max(120)
    .regex(/^[\w.+-]+\/[\w.+-]+$/)
    .default('application/octet-stream'),
  tamano: z.number().int().min(1).max(DOC_MAX),
});
const documentoEsquema = z.object({
  clave: z.string().max(300),
  nombre: nombreDoc,
  /** categoría: mandato, escritura, plano, otro… */
  tipo: z.string().trim().min(1).max(40).default('otro'),
  tamano: z.number().int().min(1).max(DOC_MAX),
});

const ext = (nombre: string) => (nombre.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? '').toLowerCase();

@Injectable()
export class ArchivosService {
  constructor(
    private readonly db: PrismaService,
    private readonly actividad: ActividadService,
    private readonly r2: AlmacenamientoService,
  ) {}

  private async propiedad(u: UsuarioToken, id: string) {
    const p = await this.db.propiedad.findFirst({
      where: { id, corredoraId: u.corredoraId, eliminadoEn: null },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('La propiedad ya no existe.');
  }

  private async completa(u: UsuarioToken, id: string) {
    const p = await this.db.propiedad.findUniqueOrThrow({ where: { id }, include: INCLUIR });
    return propiedadApp(p, u);
  }

  async subidaFotos(u: UsuarioToken, propId: string, archivos: { tipo: string; tamano: number; ref?: string }[]) {
    await this.propiedad(u, propId);
    return {
      subidas: await Promise.all(
        archivos.map(async (a) => {
          const clave = this.r2.nuevaClave(u.corredoraId, propId, 'fotos', FOTO_TIPOS[a.tipo], a.ref);
          return { subida: await this.r2.urlSubida(clave, a.tipo, a.tamano), url: this.r2.urlPublica(clave) };
        }),
      ),
    };
  }

  async subidaDocumento(u: UsuarioToken, propId: string, o: z.infer<typeof subidaDocEsquema>) {
    await this.propiedad(u, propId);
    const clave = this.r2.nuevaClave(u.corredoraId, propId, 'docs', ext(o.nombre));
    return { clave, subida: await this.r2.urlSubida(clave, o.tipoArchivo, o.tamano) };
  }

  async agregarDocumento(u: UsuarioToken, propId: string, o: z.infer<typeof documentoEsquema>) {
    await this.propiedad(u, propId);
    if (!o.clave.startsWith(`c/${u.corredoraId}/p/${propId}/docs/`))
      throw new BadRequestException('Ese archivo no es de esta propiedad.');
    if (await this.db.propiedadDocumento.findFirst({ where: { claveAlmacenamiento: o.clave }, select: { id: true } }))
      throw new BadRequestException('Ese archivo ya está agregado.');
    const real = await this.r2.tamano(o.clave);
    if (real == null) throw new BadRequestException('El archivo no se terminó de subir. Intenta de nuevo.');
    if (real !== o.tamano) throw new BadRequestException('El archivo llegó incompleto. Intenta de nuevo.');
    await this.db.$transaction(async (tx) => {
      await tx.propiedadDocumento.create({
        data: {
          propiedadId: propId,
          nombre: o.nombre,
          tipo: o.tipo,
          tamano: real,
          claveAlmacenamiento: o.clave,
          subidoPorId: u.sub,
        },
      });
      // solo la marca de cambio (para la sincronización), no la versión: un documento no choca con una edición
      await tx.propiedad.update({ where: { id: propId }, data: { actualizadoEn: new Date() } });
      await this.actividad.registrar(
        {
          corredoraId: u.corredoraId,
          entidadTipo: 'propiedad',
          entidadId: propId,
          texto: `Documento agregado: ${o.nombre}`,
          usuarioId: u.sub,
        },
        tx,
      );
    });
    return this.completa(u, propId);
  }

  private async documento(u: UsuarioToken, propId: string, docId: string) {
    await this.propiedad(u, propId);
    const d = await this.db.propiedadDocumento.findFirst({ where: { id: docId, propiedadId: propId } });
    if (!d) throw new NotFoundException('El documento ya no está.');
    return d;
  }

  async descarga(u: UsuarioToken, propId: string, docId: string) {
    const d = await this.documento(u, propId, docId);
    if (!d.claveAlmacenamiento) throw new NotFoundException('Ese documento no tiene archivo.');
    return { nombre: d.nombre, tamano: d.tamano, url: await this.r2.urlDescarga(d.claveAlmacenamiento, d.nombre) };
  }

  async quitarDocumento(u: UsuarioToken, propId: string, docId: string) {
    const d = await this.documento(u, propId, docId);
    await this.db.$transaction(async (tx) => {
      await tx.propiedadDocumento.delete({ where: { id: d.id } });
      await tx.propiedad.update({ where: { id: propId }, data: { actualizadoEn: new Date() } });
      await this.actividad.registrar(
        {
          corredoraId: u.corredoraId,
          entidadTipo: 'propiedad',
          entidadId: propId,
          texto: `Documento quitado: ${d.nombre}`,
          usuarioId: u.sub,
        },
        tx,
      );
    });
    if (d.claveAlmacenamiento) this.r2.borrar([d.claveAlmacenamiento]);
    return this.completa(u, propId);
  }
}

@Controller('propiedades/:id')
export class ArchivosController {
  constructor(private readonly archivos: ArchivosService) {}

  /** POST /v1/propiedades/:id/fotos/subidas — { archivos: [{ tipo, tamano }] } → { subidas: [{ subida, url }] } */
  @Post('fotos/subidas')
  subidaFotos(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(subidaFotosEsquema)) b: z.infer<typeof subidaFotosEsquema>,
  ) {
    return this.archivos.subidaFotos(u, id, b.archivos);
  }

  /** POST /v1/propiedades/:id/documentos/subida — { nombre, tipoArchivo, tamano } → { clave, subida } */
  @Post('documentos/subida')
  subidaDocumento(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(subidaDocEsquema)) b: z.infer<typeof subidaDocEsquema>,
  ) {
    return this.archivos.subidaDocumento(u, id, b);
  }

  /** POST /v1/propiedades/:id/documentos — { clave, nombre, tipo, tamano } → la propiedad */
  @Post('documentos')
  agregarDocumento(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(documentoEsquema)) b: z.infer<typeof documentoEsquema>,
  ) {
    return this.archivos.agregarDocumento(u, id, b);
  }

  @Get('documentos/:doc/descarga')
  descarga(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('doc', ParseUUIDPipe) doc: string,
  ) {
    return this.archivos.descarga(u, id, doc);
  }

  @Delete('documentos/:doc')
  quitarDocumento(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('doc', ParseUUIDPipe) doc: string,
  ) {
    return this.archivos.quitarDocumento(u, id, doc);
  }
}

@Global()
@Module({
  providers: [AlmacenamientoService, ArchivosService],
  controllers: [ArchivosController],
  exports: [AlmacenamientoService],
})
export class ArchivosModule {}
