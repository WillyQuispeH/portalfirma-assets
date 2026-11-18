// Lectura automática de la copia de dominio vigente (PDF o foto) de una propiedad: la IA lee la inscripción de dominio
// (fojas, número, año, conservador), el rol de avalúo, los propietarios inscritos y las alertas (hipotecas, embargos,
// prohibiciones) y PROPONE los datos; no guarda nada: la app se los muestra al corredor para que los confirme.
//  · POST /v1/propiedades/:id/dominio-ia  { documentoId }  → { fojas, numeroInscripcion, anioInscripcion, conservador, rol,
//    propietarios, deslindes, alertas, vigente, emision, legible, resumen }
// El documento tiene que ser uno de los que ya se subieron a esa propiedad (pestaña Documentos).
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AlmacenamientoService } from '../archivos/almacenamiento.service';
import { IaService } from '../whatsapp/ia';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';

const MAX_BYTES = 20 * 1024 * 1024;

const SISTEMA = `Eres un asistente de una corredora de propiedades en Chile. Recibes la COPIA DE DOMINIO VIGENTE (o el certificado de dominio) de un inmueble, emitida por un Conservador de Bienes Raíces, como PDF o foto. Extrae SOLO lo que aparece escrito; si un dato no está o no se lee, déjalo vacío: nunca lo inventes. Devuelve un objeto JSON con:
{
 "legible": true|false (false si está borroso o no es una copia/certificado de dominio),
 "fojas": "las fojas de la INSCRIPCIÓN DE DOMINIO del propietario actual, solo el número, con «vta» si lo trae (ej. «45678 vta»)",
 "numeroInscripcion": "el número de esa inscripción, solo el número",
 "anioInscripcion": "el año del Registro de Propiedad de esa inscripción (4 dígitos)",
 "conservador": "solo la comuna o ciudad del Conservador de Bienes Raíces (ej. «Santiago», «Las Condes», «Viña del Mar»)",
 "rol": "rol de avalúo si aparece (ej. «1234-56»), o vacío",
 "propietarios": [{ "nombre": "nombre completo del dueño inscrito", "rut": "RUT si aparece" }],
 "deslindes": "los deslindes del inmueble tal como aparecen, en un solo texto (o vacío)",
 "vigente": true|false|null (si el documento dice estar vigente o la fecha de emisión es de los últimos 30 días; null si no se sabe),
 "emision": "fecha de emisión AAAA-MM-DD si aparece, o vacío",
 "alertas": ["cada hipoteca, embargo, prohibición, litigio o gravamen vigente que mencione, en una frase corta"],
 "resumen": "una o dos frases con lo esencial, en español"
}
Si el documento trae varias inscripciones, usa la del propietario ACTUAL (la más reciente). No incluyas texto fuera del JSON.`;

const pedidoEsquema = z.object({ documentoId: z.string().uuid() });

const t = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const solo = (v: unknown, patron: RegExp) => (patron.exec(t(v))?.[0] ?? '').trim();
const sinPuntos = (s: string) => s.replace(/\.(?=\d{3})/g, '');

@Injectable()
export class DominioIaService {
  constructor(
    private readonly db: PrismaService,
    private readonly r2: AlmacenamientoService,
    private readonly ia: IaService,
  ) {}

  async leer(u: UsuarioToken, propiedadId: string, documentoId: string) {
    const prop = await this.db.propiedad.findFirst({
      where: { id: propiedadId, corredoraId: u.corredoraId, eliminadoEn: null },
      select: { id: true },
    });
    if (!prop) throw new NotFoundException('No encontré la propiedad.');
    const doc = await this.db.propiedadDocumento.findFirst({ where: { id: documentoId, propiedadId: prop.id } });
    if (!doc?.claveAlmacenamiento) throw new NotFoundException('No encontré ese documento en la propiedad.');
    if ((doc.tamano ?? 0) > MAX_BYTES) throw new BadRequestException('El archivo pesa más de 20 MB.');

    const buf = await this.r2.bajar(doc.claveAlmacenamiento);
    if (!buf.length || buf.length > MAX_BYTES)
      throw new BadRequestException('El archivo está vacío o pesa más de 20 MB.');
    let contenido: Anthropic.Beta.BetaContentBlockParam;
    if (buf.subarray(0, 4).toString() === '%PDF') {
      contenido = {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') },
      };
    } else {
      let jpg: Buffer;
      try {
        jpg = await sharp(buf)
          .rotate()
          .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 88 })
          .toBuffer();
      } catch {
        throw new BadRequestException('Ese archivo no es un PDF ni una foto que se pueda leer.');
      }
      contenido = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpg.toString('base64') } };
    }

    let j: Record<string, unknown>;
    try {
      j = await this.ia.leerDocumento({
        corredoraId: u.corredoraId,
        uso: 'dominio:lectura',
        sistema: SISTEMA,
        contenido: [contenido, { type: 'text', text: 'Lee la copia de dominio y devuelve el JSON pedido.' }],
      });
    } catch (e) {
      throw new BadRequestException(`No pude leer el documento con la IA: ${(e as Error).message}`);
    }
    const propietarios = (Array.isArray(j.propietarios) ? (j.propietarios as Record<string, unknown>[]) : [])
      .map((p) => ({ nombre: t(p?.nombre), rut: t(p?.rut) }))
      .filter((p) => p.nombre)
      .slice(0, 6);
    return {
      legible: j.legible !== false,
      fojas: sinPuntos(solo(j.fojas, /\d[\d.]*(\s*(vta|vuelta)\.?)?/i))
        .replace(/\.$/, '')
        .replace(/vuelta/i, 'vta'),
      numeroInscripcion: sinPuntos(solo(j.numeroInscripcion, /\d[\d.]*/)),
      anioInscripcion: solo(j.anioInscripcion, /(19|20)\d{2}/),
      conservador: t(j.conservador)
        .replace(/^conservador(a)?( de bienes raíces)?( de)?\s+/i, '')
        .slice(0, 80),
      rol: solo(j.rol, /\d[\d-]*/),
      propietarios,
      deslindes: t(j.deslindes).slice(0, 1500),
      vigente: typeof j.vigente === 'boolean' ? j.vigente : null,
      emision: solo(j.emision, /\d{4}-\d{2}-\d{2}/),
      alertas: (Array.isArray(j.alertas) ? j.alertas : []).map(t).filter(Boolean).slice(0, 8),
      resumen: t(j.resumen).slice(0, 400),
    };
  }
}

@Controller('propiedades/:id/dominio-ia')
export class DominioIaController {
  constructor(private readonly s: DominioIaService) {}

  @Post()
  @HttpCode(200)
  leer(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(pedidoEsquema)) b: z.infer<typeof pedidoEsquema>,
  ) {
    return this.s.leer(u, id, b.documentoId);
  }
}
