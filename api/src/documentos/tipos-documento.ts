// Tipos de documento de la corredora (Configuración › Documentos): «Carta oferta», «Mandato de venta»… Cada uno dice cómo se firma
// (tipo de firma y trámite legal). Al analizar un PDF, la IA lo clasifica contra esta lista y los formularios de firmantes (app de
// escritorio, carga masiva y WhatsApp) se llenan solos con la firma y el trámite del tipo reconocido.
//
//  · GET    /v1/tipos-documento              la lista (la primera vez se siembra con los tipos por defecto)
//  · POST   /v1/tipos-documento              { nombre, tipoFirma, tramite, palabras? } → crea un tipo (o devuelve el que ya tiene ese nombre)
//  · PUT    /v1/tipos-documento/:id          { nombre?, tipoFirma?, tramite?, palabras? } (admin)
//  · DELETE /v1/tipos-documento/:id          (admin)
//
// Se guarda en registros › tipos_documento de cada corredora. Los tipos que corresponden a una plantilla de Asset (carta oferta,
// mandatos, contrato…) NO duplican la firma: leen y escriben la de la plantilla (Configuración › Plantillas), así hay un solo lugar
// donde se define cómo se firma cada documento.
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, Param, Post, Put } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import { normalizar } from '../comun/texto';
import { configFirma, PlantillasDocService, TIPOS_FIRMA, type ConfigFirma, type TipoFirma } from './plantillas-doc';

const COLECCION = 'tipos_documento';
const MARCA = '_sembrado';
const MAX_TIPOS = 80;

export interface TipoDocumento {
  id: string;
  nombre: string;
  tipoFirma: TipoFirma;
  /** none = sin trámite · legalization = legalización notarial */
  tramite: 'none' | 'legalization';
  /** otras formas de nombrarlo, para reconocerlo en un documento («oferta de compra», «mandato de corretaje»…) */
  palabras: string[];
  /** la plantilla de Asset de la que viene la firma (null = la firma se guarda en el propio tipo) */
  plantilla: string | null;
}

interface Datos {
  nombre?: string;
  tipoFirma?: string;
  tramite?: string;
  palabras?: string[];
  plantilla?: string | null;
  orden?: number;
}

/** los tipos con que parte cada corredora: los de las plantillas de Asset y unos pocos de uso corriente */
export const TIPOS_POR_DEFECTO: { id: string; nombre: string; palabras: string[]; plantilla: string | null }[] = [
  { id: 'orden-visita', nombre: 'Orden de visita', palabras: ['orden de visita', 'autorizacion de visita', 'visita a propiedades'], plantilla: 'orden-visita' },
  { id: 'carta-oferta', nombre: 'Carta oferta', palabras: ['carta oferta', 'carta de oferta', 'oferta de compra', 'oferta de arriendo', 'oferta formal'], plantilla: 'carta-oferta' },
  { id: 'contrato-arriendo', nombre: 'Contrato de arriendo', palabras: ['contrato de arriendo', 'contrato de arrendamiento', 'arriendo de inmueble'], plantilla: 'contrato-arriendo' },
  { id: 'mandato-arriendo', nombre: 'Mandato de gestión de arriendo', palabras: ['mandato de arriendo', 'mandato de gestion de arriendo', 'mandato de corretaje de arriendo', 'encargo de arriendo'], plantilla: 'mandato-arriendo' },
  { id: 'mandato-venta', nombre: 'Mandato de gestión de venta', palabras: ['mandato de venta', 'mandato de gestion de venta', 'mandato de corretaje de venta', 'encargo de venta'], plantilla: 'mandato-venta' },
  { id: 'promesa-compraventa', nombre: 'Promesa de compraventa', palabras: ['promesa de compraventa', 'promesa de compra venta', 'contrato de promesa'], plantilla: 'promesa-compraventa' },
  { id: 'escritura-compraventa', nombre: 'Escritura de compraventa', palabras: ['escritura de compraventa', 'borrador de escritura', 'minuta de escritura', 'compraventa de inmueble'], plantilla: 'escritura-compraventa' },
  { id: 'acta-entrega', nombre: 'Acta de entrega', palabras: ['acta de entrega', 'acta de entrega e inventario', 'inventario de entrega', 'acta de recepcion'], plantilla: 'acta-entrega' },
  { id: 'acta-visita', nombre: 'Acta de visita', palabras: ['acta de visita', 'constancia de visita'], plantilla: 'acta-visita' },
  { id: 'anexo-contrato', nombre: 'Anexo de contrato', palabras: ['anexo de contrato', 'addendum', 'modificacion de contrato'], plantilla: null },
  { id: 'poder', nombre: 'Poder', palabras: ['poder simple', 'mandato especial', 'poder notarial'], plantilla: null },
  { id: 'declaracion-jurada', nombre: 'Declaración jurada', palabras: ['declaracion jurada', 'declaracion simple'], plantilla: null },
];

const firmaBase: ConfigFirma = { tipoFirma: 'simple', tramite: 'none' };
const slug = (s: string) => normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

const crearEsquema = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre del documento.').max(80),
  tipoFirma: z.enum(TIPOS_FIRMA),
  tramite: z.enum(['none', 'legalization']),
  palabras: z.array(z.string().trim().min(2).max(80)).max(12).optional(),
});
const editarEsquema = z.object({
  nombre: z.string().trim().min(2).max(80).optional(),
  tipoFirma: z.enum(TIPOS_FIRMA).optional(),
  tramite: z.enum(['none', 'legalization']).optional(),
  palabras: z.array(z.string().trim().min(2).max(80)).max(12).optional(),
});

@Injectable()
export class TiposDocumentoService {
  constructor(
    private readonly db: PrismaService,
    private readonly plantillas: PlantillasDocService,
  ) {}

  private donde = (corredoraId: string, id: string) => ({ corredoraId_coleccion_id: { corredoraId, coleccion: COLECCION, id } });

  /** la primera vez, deja a la corredora con los tipos por defecto (una sola vez: lo que después borre no vuelve) */
  private async sembrar(corredoraId: string) {
    const marca = await this.db.registro.findUnique({ where: this.donde(corredoraId, MARCA) });
    if (marca) return;
    const datos = (d: Datos) => d as unknown as Prisma.InputJsonObject;
    await this.db.registro.createMany({
      data: [
        ...TIPOS_POR_DEFECTO.map((t, i) => ({
          corredoraId,
          coleccion: COLECCION,
          id: t.id,
          datos: datos({ nombre: t.nombre, palabras: t.palabras, plantilla: t.plantilla, orden: i, ...(t.plantilla ? {} : firmaBase) }),
        })),
        { corredoraId, coleccion: COLECCION, id: MARCA, datos: datos({}) },
      ],
      skipDuplicates: true,
    });
  }

  private async vista(corredoraId: string, id: string, d: Datos): Promise<TipoDocumento> {
    const f = d.plantilla ? await configFirma(this.db, corredoraId, d.plantilla) : null;
    return {
      id,
      nombre: String(d.nombre ?? id),
      tipoFirma: f?.tipoFirma ?? TIPOS_FIRMA.find((t) => t === d.tipoFirma) ?? 'simple',
      tramite: f ? f.tramite : d.tramite === 'legalization' ? 'legalization' : 'none',
      palabras: Array.isArray(d.palabras) ? d.palabras.map(String) : [],
      plantilla: d.plantilla ?? null,
    };
  }

  /** los tipos de la corredora, en su orden (los por defecto primero, después los que fue agregando) */
  async lista(corredoraId: string): Promise<TipoDocumento[]> {
    await this.sembrar(corredoraId);
    const regs = await this.db.registro.findMany({ where: { corredoraId, coleccion: COLECCION }, orderBy: { creadoEn: 'asc' } });
    const filas = regs
      .filter((r) => r.id !== MARCA)
      .map((r) => ({ id: r.id, d: (r.datos ?? {}) as Datos }))
      .sort((a, b) => (a.d.orden ?? 999) - (b.d.orden ?? 999));
    return Promise.all(filas.map((f) => this.vista(corredoraId, f.id, f.d)));
  }

  /** a cuál tipo de la corredora corresponde lo que la IA leyó («Carta de oferta de compra» → Carta oferta); null si ninguno */
  async reconocer(corredoraId: string, ...textos: (string | null | undefined)[]): Promise<TipoDocumento | null> {
    const tipos = await this.lista(corredoraId);
    return reconocerEn(tipos, ...textos);
  }

  async crear(u: UsuarioToken, b: z.infer<typeof crearEsquema>) {
    const tipos = await this.lista(u.corredoraId);
    const ya = tipos.find((t) => normalizar(t.nombre) === normalizar(b.nombre));
    if (ya) return ya;
    if (tipos.length >= MAX_TIPOS) throw new ForbiddenException('Ya hay demasiados tipos de documento: borra los que no uses.');
    let id = slug(b.nombre) || 'documento';
    if (tipos.some((t) => t.id === id) || id === MARCA) id = `${id}-${Date.now().toString(36)}`;
    const d: Datos = { nombre: b.nombre, tipoFirma: b.tipoFirma, tramite: b.tramite, palabras: b.palabras ?? [], plantilla: null, orden: 1000 + tipos.length };
    await this.db.registro.create({
      data: { corredoraId: u.corredoraId, coleccion: COLECCION, id, creadoPorId: u.sub, datos: d as unknown as Prisma.InputJsonObject },
    });
    return this.vista(u.corredoraId, id, d);
  }

  async actualizar(u: UsuarioToken, id: string, b: z.infer<typeof editarEsquema>) {
    if (u.rol !== 'ADMIN') throw new ForbiddenException('Los tipos de documento los edita el administrador de la corredora.');
    await this.sembrar(u.corredoraId);
    const r = await this.db.registro.findUnique({ where: this.donde(u.corredoraId, id) });
    if (!r || id === MARCA) throw new NotFoundException('Ese tipo de documento no existe.');
    const d = { ...((r.datos ?? {}) as Datos) };
    if (b.nombre !== undefined) {
      const otro = (await this.lista(u.corredoraId)).find((t) => t.id !== id && normalizar(t.nombre) === normalizar(b.nombre!));
      if (otro) throw new BadRequestException(`Ya existe «${otro.nombre}».`);
      d.nombre = b.nombre;
    }
    if (b.palabras !== undefined) d.palabras = b.palabras;
    if (d.plantilla) {
      // la firma es la de la plantilla: un solo lugar donde se define
      if (b.tipoFirma !== undefined || b.tramite !== undefined) {
        const actual = await configFirma(this.db, u.corredoraId, d.plantilla);
        await this.plantillas.guardarFirma(u, d.plantilla, { tipoFirma: b.tipoFirma ?? actual.tipoFirma, tramite: b.tramite ?? actual.tramite });
      }
    } else {
      if (b.tipoFirma !== undefined) d.tipoFirma = b.tipoFirma;
      if (b.tramite !== undefined) d.tramite = b.tramite;
    }
    await this.db.registro.update({ where: this.donde(u.corredoraId, id), data: { datos: d as unknown as Prisma.InputJsonObject, version: { increment: 1 } } });
    return this.vista(u.corredoraId, id, d);
  }

  async borrar(u: UsuarioToken, id: string) {
    if (u.rol !== 'ADMIN') throw new ForbiddenException('Los tipos de documento los edita el administrador de la corredora.');
    const r = await this.db.registro.findUnique({ where: this.donde(u.corredoraId, id) });
    if (!r || id === MARCA) throw new NotFoundException('Ese tipo de documento no existe.');
    await this.db.registro.delete({ where: this.donde(u.corredoraId, id) });
    return { ok: true };
  }
}

/**
 * El tipo cuyo nombre o palabras aparecen en lo que leyó la IA. Gana la frase que aparece primero (el documento es lo que su título
 * dice primero: «Finiquito de contrato de arriendo» es un finiquito, no un contrato) y, a igual posición, la más larga («mandato de
 * venta» antes que «mandato»).
 */
export function reconocerEn(tipos: TipoDocumento[], ...textos: (string | null | undefined)[]): TipoDocumento | null {
  const limpio = (s: string) => normalizar(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const t = ` ${limpio(textos.filter(Boolean).join(' '))} `;
  if (t.trim() === '') return null;
  let mejor: { tipo: TipoDocumento; pos: number; largo: number } | null = null;
  for (const tipo of tipos) {
    for (const frase of [tipo.nombre, ...tipo.palabras]) {
      const f = limpio(frase);
      if (f.length < 4) continue;
      const pos = t.indexOf(` ${f} `);
      if (pos < 0) continue;
      if (!mejor || pos < mejor.pos || (pos === mejor.pos && f.length > mejor.largo)) mejor = { tipo, pos, largo: f.length };
    }
  }
  return mejor?.tipo ?? null;
}

@Controller('tipos-documento')
export class TiposDocumentoController {
  constructor(private readonly s: TiposDocumentoService) {}

  @Get()
  async lista(@UsuarioActual() u: UsuarioToken) {
    return { puedeEditar: u.rol === 'ADMIN', items: await this.s.lista(u.corredoraId) };
  }

  @Post()
  @HttpCode(200)
  crear(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(crearEsquema)) b: z.infer<typeof crearEsquema>) {
    return this.s.crear(u, b);
  }

  @Put(':id')
  actualizar(@UsuarioActual() u: UsuarioToken, @Param('id') id: string, @Body(new ZodPipe(editarEsquema)) b: z.infer<typeof editarEsquema>) {
    return this.s.actualizar(u, id, b);
  }

  @Delete(':id')
  borrar(@UsuarioActual() u: UsuarioToken, @Param('id') id: string) {
    return this.s.borrar(u, id);
  }
}
