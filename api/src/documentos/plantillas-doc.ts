// Sistema de plantillas de documentos: base común (los archivos de documentos/plantillas, iguales para todas) + versión
// propia de cada corredora (sus textos por cláusula, ver bloques.ts) + aprobación legal registrada por el administrador.
//
//  · GET  /v1/plantillas                       la lista con su estado (aprobada / borrador / revisar)
//  · GET  /v1/plantillas/:nombre               bloques (texto base y propio), datos permitidos, versiones y aprobación
//  · PUT  /v1/plantillas/:nombre               { bloques: {clave: texto}, nota } → nueva versión (admin)
//  · POST /v1/plantillas/:nombre/vista-previa  { bloques? } → PDF de muestra (datos de ejemplo + datos reales de la corredora)
//  · POST /v1/plantillas/:nombre/aprobar       { revisor, nota } → aprueba la versión vigente (admin)
//  · PUT  /v1/plantillas/:nombre/firma         { tipoFirma: simple|avanzada|visada|enrolada, tramite: none|legalization } → cómo se firma (admin)
//  · POST /v1/plantillas/:nombre/restaurar     { version } → vuelve a una versión anterior (0 = la base) como versión nueva
//
// Los documentos se arman siempre con la versión vigente (la última guardada). La aprobación queda anotada con quién
// revisó (p. ej. el abogado), quién la registró y cuándo; si después cambia la versión o la base, el estado pasa a
// «borrador» o «revisar». Se guarda en registros › plantillas_doc › <nombre> de cada corredora.
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import { cargarPlantilla, llenar } from './plantilla';
import { aplicar, bloquesDe, huella, revisarTexto, variablesDe } from './bloques';
import { muestra, PLANTILLAS_DOC } from './muestras';
import { datosCorredora } from './corredora-doc';
import { PdfService } from './pdf.service';

const COLECCION = 'plantillas_doc';
const MAX_VERSIONES = 50;

interface Version {
  n: number;
  bloques: Record<string, string>;
  nota: string;
  por: string;
  porNombre: string;
  en: string;
  /** huella del archivo base cuando se guardó */
  base: string;
}
/** cómo se firma el documento de esta plantilla (lo define el administrador por plantilla) */
export const TIPOS_FIRMA = ['simple', 'avanzada', 'visada', 'enrolada'] as const;
export type TipoFirma = (typeof TIPOS_FIRMA)[number];
export interface ConfigFirma {
  tipoFirma: TipoFirma;
  /** none = sin trámite · legalization = legalización notarial de las firmas */
  tramite: 'none' | 'legalization';
}
export const FIRMA_POR_DEFECTO: ConfigFirma = { tipoFirma: 'simple', tramite: 'none' };

/** la configuración de firma de una plantilla en esa corredora (simple y sin trámite si no la cambió) */
export async function configFirma(db: PrismaService, corredoraId: string, nombre: string): Promise<ConfigFirma> {
  const r = await db.registro.findUnique({
    where: { corredoraId_coleccion_id: { corredoraId, coleccion: COLECCION, id: nombre } },
  });
  const f = ((r?.datos ?? {}) as { firma?: Partial<ConfigFirma> }).firma ?? {};
  return {
    tipoFirma: TIPOS_FIRMA.find((t) => t === f.tipoFirma) ?? 'simple',
    tramite: f.tramite === 'legalization' ? 'legalization' : 'none',
  };
}

export interface Aprobacion {
  n: number;
  base: string;
  revisor: string;
  nota: string;
  por: string;
  porNombre: string;
  en: string;
}
interface Registro {
  versiones?: Version[];
  aprobacion?: Aprobacion | null;
  firma?: ConfigFirma;
}
type Estado = 'aprobada' | 'borrador' | 'revisar';

const guardarEsquema = z.object({
  bloques: z.record(z.string().max(60), z.string().max(20_000)),
  nota: z.string().trim().max(500).optional(),
});
const previaEsquema = z.object({ bloques: z.record(z.string().max(60), z.string().max(20_000)).optional() });
const aprobarEsquema = z.object({
  revisor: z.string().trim().min(2, 'Escribe quién revisó la plantilla (nombre del abogado o notario).').max(160),
  nota: z.string().trim().max(500).optional(),
});
const restaurarEsquema = z.object({ version: z.number().int().min(0) });
const firmaEsquema = z.object({
  tipoFirma: z.enum(TIPOS_FIRMA),
  tramite: z.enum(['none', 'legalization']),
});

@Injectable()
export class PlantillasDocService {
  constructor(
    private readonly db: PrismaService,
    private readonly pdfs: PdfService,
  ) {}

  private existe(nombre: string) {
    const p = PLANTILLAS_DOC.find((x) => x.nombre === nombre);
    if (!p) throw new NotFoundException('Esa plantilla no existe.');
    return p;
  }

  private donde = (corredoraId: string, nombre: string) => ({
    corredoraId_coleccion_id: { corredoraId, coleccion: COLECCION, id: nombre },
  });

  private async registro(corredoraId: string, nombre: string): Promise<Registro> {
    const r = await this.db.registro.findUnique({ where: this.donde(corredoraId, nombre) });
    return (r?.datos ?? {}) as Registro;
  }

  private vigente(r: Registro): Version | null {
    const v = r.versiones ?? [];
    return v.length ? v[v.length - 1] : null;
  }

  private estado(r: Registro, baseHuella: string): Estado {
    const a = r.aprobacion;
    if (!a) return 'borrador';
    const n = this.vigente(r)?.n ?? 0;
    if (a.n !== n) return 'borrador';
    return a.base === baseHuella ? 'aprobada' : 'revisar';
  }

  /** el HTML con que se arma el documento de esta corredora (la base con sus textos propios) */
  async html(corredoraId: string, nombre: string): Promise<string> {
    const base = cargarPlantilla(nombre);
    const v = this.vigente(await this.registro(corredoraId, nombre));
    return v && Object.keys(v.bloques).length ? aplicar(base, v.bloques) : base;
  }

  async lista(u: UsuarioToken) {
    const regs = await this.db.registro.findMany({ where: { corredoraId: u.corredoraId, coleccion: COLECCION } });
    const porNombre = new Map(regs.map((r) => [r.id, (r.datos ?? {}) as Registro]));
    return {
      puedeEditar: u.rol === 'ADMIN',
      items: PLANTILLAS_DOC.map((p) => {
        const r = porNombre.get(p.nombre) ?? {};
        const v = this.vigente(r);
        const base = cargarPlantilla(p.nombre);
        return {
          ...p,
          estado: this.estado(r, huella(base)),
          version: v?.n ?? 0,
          propia: !!v && Object.keys(v.bloques).length > 0,
          cambiadas: v ? Object.keys(v.bloques).length : 0,
          editables: bloquesDe(base).filter((b) => b.texto !== null).length,
          aprobacion: r.aprobacion ?? null,
          firma: { ...FIRMA_POR_DEFECTO, ...(r.firma ?? {}) },
          actualizada: v?.en ?? null,
        };
      }),
    };
  }

  async detalle(u: UsuarioToken, nombre: string) {
    const p = this.existe(nombre);
    const base = cargarPlantilla(nombre);
    const r = await this.registro(u.corredoraId, nombre);
    const v = this.vigente(r);
    return {
      ...p,
      puedeEditar: u.rol === 'ADMIN',
      estado: this.estado(r, huella(base)),
      version: v?.n ?? 0,
      aprobacion: r.aprobacion ?? null,
      firma: { ...FIRMA_POR_DEFECTO, ...(r.firma ?? {}) },
      variables: [...variablesDe(base)].sort(),
      bloques: bloquesDe(base).map((b) => ({
        clave: b.clave,
        titulo: b.titulo,
        tipo: b.tipo,
        editable: b.texto !== null,
        base: b.texto,
        texto: b.texto === null ? null : (v?.bloques[b.clave] ?? b.texto),
        cambiado: b.texto !== null && v?.bloques[b.clave] !== undefined,
      })),
      versiones: (r.versiones ?? [])
        .map((x) => ({
          n: x.n,
          nota: x.nota,
          porNombre: x.porNombre,
          en: x.en,
          cambiadas: Object.keys(x.bloques).length,
        }))
        .reverse(),
    };
  }

  /** valida los textos contra la base: solo bloques editables, datos conocidos, condicionales cerrados; deja solo lo distinto de la base */
  private normalizar(nombre: string, bloques: Record<string, string>) {
    const base = cargarPlantilla(nombre);
    const permitidas = variablesDe(base);
    const porClave = new Map(bloquesDe(base).map((b) => [b.clave, b]));
    const propios: Record<string, string> = {};
    for (const [clave, texto] of Object.entries(bloques)) {
      const b = porClave.get(clave);
      if (!b || b.texto === null) throw new BadRequestException(`La cláusula «${clave}» no se puede editar.`);
      const t = texto.replace(/\r/g, '').trim();
      if (!t) throw new BadRequestException(`«${b.titulo}» no puede quedar vacía.`);
      const e = revisarTexto(t, permitidas);
      if (e) throw new BadRequestException(`${b.titulo}: ${e}`);
      if (t !== b.texto.trim()) propios[clave] = t;
    }
    return { base, propios };
  }

  async guardar(u: UsuarioToken, nombre: string, b: z.infer<typeof guardarEsquema>) {
    this.existe(nombre);
    if (u.rol !== 'ADMIN') throw new ForbiddenException('Las plantillas las edita el administrador de la corredora.');
    const { base, propios } = this.normalizar(nombre, b.bloques);
    const r = await this.registro(u.corredoraId, nombre);
    const actual = this.vigente(r);
    if (JSON.stringify(actual?.bloques ?? {}) === JSON.stringify(propios)) return this.detalle(u, nombre); // sin cambios
    await this.nuevaVersion(u, nombre, r, propios, b.nota ?? '', huella(base));
    return this.detalle(u, nombre);
  }

  private async nuevaVersion(
    u: UsuarioToken,
    nombre: string,
    r: Registro,
    bloques: Record<string, string>,
    nota: string,
    base: string,
  ) {
    const quien = await this.db.usuario.findUnique({ where: { id: u.sub }, select: { nombre: true } });
    const versiones = [...(r.versiones ?? [])];
    const n = (versiones[versiones.length - 1]?.n ?? 0) + 1;
    versiones.push({
      n,
      bloques,
      nota,
      por: u.sub,
      porNombre: quien?.nombre ?? '',
      en: new Date().toISOString(),
      base,
    });
    const datos = { ...r, versiones: versiones.slice(-MAX_VERSIONES) } as unknown as Prisma.InputJsonObject;
    await this.db.registro.upsert({
      where: this.donde(u.corredoraId, nombre),
      create: { corredoraId: u.corredoraId, coleccion: COLECCION, id: nombre, creadoPorId: u.sub, datos },
      update: { datos, version: { increment: 1 } },
    });
  }

  async restaurar(u: UsuarioToken, nombre: string, version: number) {
    this.existe(nombre);
    if (u.rol !== 'ADMIN') throw new ForbiddenException('Las plantillas las edita el administrador de la corredora.');
    const r = await this.registro(u.corredoraId, nombre);
    const v = version === 0 ? { bloques: {} } : (r.versiones ?? []).find((x) => x.n === version);
    if (!v) throw new NotFoundException('Esa versión ya no existe.');
    const { base } = this.normalizar(nombre, {});
    await this.nuevaVersion(
      u,
      nombre,
      r,
      v.bloques,
      version === 0 ? 'Vuelve a la plantilla base' : `Vuelve a la versión ${version}`,
      huella(base),
    );
    return this.detalle(u, nombre);
  }

  /** el administrador define cómo se firma esta plantilla (tipo de firma y legalización); no cambia el texto ni su aprobación */
  async guardarFirma(u: UsuarioToken, nombre: string, b: z.infer<typeof firmaEsquema>) {
    this.existe(nombre);
    if (u.rol !== 'ADMIN') throw new ForbiddenException('La firma de cada plantilla la define el administrador de la corredora.');
    const r = await this.registro(u.corredoraId, nombre);
    const datos = { ...r, firma: { tipoFirma: b.tipoFirma, tramite: b.tramite } } as unknown as Prisma.InputJsonObject;
    await this.db.registro.upsert({
      where: this.donde(u.corredoraId, nombre),
      create: { corredoraId: u.corredoraId, coleccion: COLECCION, id: nombre, creadoPorId: u.sub, datos },
      update: { datos, version: { increment: 1 } },
    });
    return this.detalle(u, nombre);
  }

  async aprobar(u: UsuarioToken, nombre: string, b: z.infer<typeof aprobarEsquema>) {
    this.existe(nombre);
    if (u.rol !== 'ADMIN') throw new ForbiddenException('La aprobación la registra el administrador de la corredora.');
    const r = await this.registro(u.corredoraId, nombre);
    const quien = await this.db.usuario.findUnique({ where: { id: u.sub }, select: { nombre: true } });
    const aprobacion: Aprobacion = {
      n: this.vigente(r)?.n ?? 0,
      base: huella(cargarPlantilla(nombre)),
      revisor: b.revisor,
      nota: b.nota ?? '',
      por: u.sub,
      porNombre: quien?.nombre ?? '',
      en: new Date().toISOString(),
    };
    const datos = { ...r, aprobacion } as unknown as Prisma.InputJsonObject;
    await this.db.registro.upsert({
      where: this.donde(u.corredoraId, nombre),
      create: { corredoraId: u.corredoraId, coleccion: COLECCION, id: nombre, creadoPorId: u.sub, datos },
      update: { datos, version: { increment: 1 } },
    });
    return this.detalle(u, nombre);
  }

  /** PDF de muestra: datos de ejemplo con los datos reales de la corredora (logo, RUT…); con `bloques`, sin guardar */
  async vistaPrevia(u: UsuarioToken, nombre: string, bloques?: Record<string, string>) {
    this.existe(nombre);
    let html: string;
    if (bloques) {
      const { base, propios } = this.normalizar(nombre, bloques);
      html = aplicar(base, propios);
    } else html = await this.html(u.corredoraId, nombre);
    const datos = muestra(nombre);
    const c = await datosCorredora(this.db, u.corredoraId);
    const corredora = { ...(datos.corredora as object), ...Object.fromEntries(Object.entries(c).filter(([, v]) => v)) };
    const pdf = await this.pdfs.pdf(llenar(html, { ...datos, corredora }));
    return { pdf: pdf.toString('base64') };
  }
}

@Controller('plantillas')
export class PlantillasDocController {
  constructor(private readonly s: PlantillasDocService) {}

  @Get()
  lista(@UsuarioActual() u: UsuarioToken) {
    return this.s.lista(u);
  }

  @Get(':nombre')
  detalle(@UsuarioActual() u: UsuarioToken, @Param('nombre') nombre: string) {
    return this.s.detalle(u, nombre);
  }

  @Put(':nombre')
  guardar(
    @UsuarioActual() u: UsuarioToken,
    @Param('nombre') nombre: string,
    @Body(new ZodPipe(guardarEsquema)) b: z.infer<typeof guardarEsquema>,
  ) {
    return this.s.guardar(u, nombre, b);
  }

  @Post(':nombre/vista-previa')
  @HttpCode(200)
  vistaPrevia(
    @UsuarioActual() u: UsuarioToken,
    @Param('nombre') nombre: string,
    @Body(new ZodPipe(previaEsquema)) b: z.infer<typeof previaEsquema>,
  ) {
    return this.s.vistaPrevia(u, nombre, b.bloques);
  }

  @Post(':nombre/aprobar')
  @HttpCode(200)
  aprobar(
    @UsuarioActual() u: UsuarioToken,
    @Param('nombre') nombre: string,
    @Body(new ZodPipe(aprobarEsquema)) b: z.infer<typeof aprobarEsquema>,
  ) {
    return this.s.aprobar(u, nombre, b);
  }

  @Put(':nombre/firma')
  firma(
    @UsuarioActual() u: UsuarioToken,
    @Param('nombre') nombre: string,
    @Body(new ZodPipe(firmaEsquema)) b: z.infer<typeof firmaEsquema>,
  ) {
    return this.s.guardarFirma(u, nombre, b);
  }

  @Post(':nombre/restaurar')
  @HttpCode(200)
  restaurar(
    @UsuarioActual() u: UsuarioToken,
    @Param('nombre') nombre: string,
    @Body(new ZodPipe(restaurarEsquema)) b: z.infer<typeof restaurarEsquema>,
  ) {
    return this.s.restaurar(u, nombre, b.version);
  }
}
