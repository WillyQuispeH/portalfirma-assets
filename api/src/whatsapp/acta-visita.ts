// ACTA DE VISITA (etapa 1 · Comercialización de un negocio): lo que pasó en la visita a la propiedad.
//  · El corredor graba el audio de la visita en el computador, sube un audio ya grabado o lo manda por WhatsApp al
//    número de la empresa (con el acta «abierta» desde la app, sus audios y fotos caen en ella; «listo» la cierra).
//  · Cada audio se guarda en R2 y se transcribe (OpenAI, como el dictado). Con las transcripciones y las notas del
//    corredor, la IA arma el RESUMEN del acta: qué comentó el interesado, qué comentó el corredor, objeciones, acuerdos
//    y próximos pasos. La IA no inventa: si no se dijo, no aparece.
//  · Las fotos de la visita llegan desde la app o por WhatsApp; quedan en R2 y se miran con enlaces firmados.
// Se guarda en la colección «actas_visita» (registros), una por visita (un negocio puede tener varias). Los archivos van
// en R2 con clave propia (c/<corredora>/r/actas_visita/<acta>/…).
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AlmacenamientoService } from '../archivos/almacenamiento.service';
import { ActividadService } from '../comun/actividad.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { buscarVisible } from '../comun/asignados';
import { TranscripcionService } from '../ia/transcripcion';
import { IaService } from './ia';
import { EnviadosService } from './enviados';
import { WechatiaService, type Conversacion, type MensajeWa, type Wechatia } from './wechatia';
import { firma, hoy, norm } from './comun';

const COLECCION = 'actas_visita';
const AUDIO_MAX = 25 * 1024 * 1024;
const FOTO_MAX = 15 * 1024 * 1024;
const MAX_AUDIOS = 12;
const MAX_FOTOS = 60;
/** el acta abierta para recibir por WhatsApp vence a las 6 horas */
const ABIERTA_MS = 6 * 3_600_000;
const ES_AUDIO = /\.(ogg|oga|opus|mp3|m4a|amr|aac|wav|webm)(\?|$)|audio/i;
const ES_OTRO = /\.(pdf|docx?|xlsx?|zip|txt|mp4|mov|3gp)(\?|$)|video|application/i;
/** «guárdalo en el acta de visita», «haz el acta de visita con este audio» */
const PIDE_ACTA = /acta.{0,14}visita|visita.{0,40}\bacta\b/;
const CIERRA = /\b(cierra|cierralo|cierrala|cerrar|termina|terminala|finaliza|finalizala)\b/;
const CODIGO = /\b([a-z]{1,4})-?\s?(\d{3,6})\b/i;
const SI = /^(si|sí|dale|ok|okay|ya|claro|correcto|esa|esa misma|si,? esa)\b/;
const NO = /^(no|nop|cancela|cancelar|esa no|otra)\b/;
const PENDIENTE_MS = 30 * 60_000;
interface Pendiente {
  audios: string[];
  fotos: string[];
  desde: string;
  /** dijo «guárdalo en el acta» sin mandar el audio todavía: el próximo audio o foto va al acta */
  esperando?: boolean;
  sugerida?: { negocioId: string; etiqueta: string } | null;
}
const TERMINA = /^(listo|lista|terminado|terminada|termine|termino|cerrar|cierra|cierralo|fin|eso es todo|eso seria todo)\b/;
const EXT_AUDIO: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/amr': 'amr',
};

export interface AudioActa {
  n: number;
  clave: string;
  nombre: string;
  tipo: string;
  /** de dónde vino: grabado en la app, un archivo subido o WhatsApp */
  origen: 'app' | 'archivo' | 'whatsapp';
  recibido: string;
  bytes: number;
  transcripcion: string;
  /** lo que no se pudo (sin transcripción disponible, audio vacío…) */
  error: string;
}
export interface FotoActa {
  n: number;
  clave: string;
  nombre: string;
  tipo: string;
  origen: 'app' | 'whatsapp';
  recibido: string;
}
export interface ResumenActa {
  hechoEn: string;
  resumen: string;
  interesado: string[];
  corredor: string[];
  interes: 'alto' | 'medio' | 'bajo' | 'sin_datos';
  objeciones: string[];
  acuerdos: string[];
  proximosPasos: string[];
}
export interface ActaVisita {
  id: string;
  negocioId: string;
  propiedadId: string | null;
  /** el día de la visita (AAAA-MM-DD) */
  fecha: string;
  estado: 'abierta' | 'cerrada';
  creadaEn: string;
  creadaPor: string;
  usuarioId: string;
  notas: string;
  audios: AudioActa[];
  fotos: FotoActa[];
  resumen: ResumenActa | null;
  cerradaEn: string | null;
}

const audioEsquema = z.object({
  audio: z.string().min(2000).max(34_000_000),
  mime: z.string().max(80).default('audio/webm'),
  origen: z.enum(['app', 'archivo']).default('app'),
});
const fotoEsquema = z.object({
  imagen: z.string().min(500).max(21_000_000),
  mime: z.string().max(80).default('image/jpeg'),
});
const notasEsquema = z.object({ notas: z.string().max(6000).default('') });
const crearEsquema = z.object({ fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

const SISTEMA_RESUMEN = `Eres el asistente de un corredor de propiedades en Chile. Con las transcripciones de los audios de una VISITA a una propiedad (y las notas del corredor) escribe el acta de la visita. Los audios pueden ser la conversación grabada durante la visita o una nota de voz del corredor después de ella; las voces no vienen identificadas: deduce con cuidado quién dice cada cosa (el interesado pregunta, opina y objeta; el corredor muestra, explica y ofrece).
Devuelve un objeto JSON:
{
 "resumen": "5 a 8 líneas, en español, de cómo fue la visita (quién fue, qué se vio, cómo reaccionó el interesado, en qué quedaron)",
 "interesado": ["lo que comentó, preguntó o valoró el interesado, una frase por punto"],
 "corredor": ["lo que comentó, explicó u ofreció el corredor, una frase por punto"],
 "interes": "alto" | "medio" | "bajo" | "sin_datos",
 "objeciones": ["reparos del interesado (precio, ubicación, estado, etc.)"],
 "acuerdos": ["lo que se acordó o prometió"],
 "proximosPasos": ["qué sigue y quién lo hace"]
}
REGLAS: usa solo lo que dicen los audios y las notas; no inventes nombres, cifras ni acuerdos. Si algo no se dijo, deja la lista vacía. Si no hay texto suficiente, "interes" es "sin_datos" y el resumen lo dice.`;

type J = Record<string, unknown>;
const lista = (v: unknown, max = 12) =>
  Array.isArray(v)
    ? v
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

@Injectable()
export class ActaVisitaService {
  private readonly log = new Logger('ActaVisita');
  constructor(
    private readonly db: PrismaService,
    private readonly r2: AlmacenamientoService,
    private readonly ia: IaService,
    private readonly transcripcion: TranscripcionService,
    private readonly enviados: EnviadosService,
    private readonly wa: WechatiaService,
    private readonly actividad: ActividadService,
  ) {}

  // ------------------------------------------------------------------ registro

  private async leer(corredoraId: string, id: string) {
    const r = await this.db.registro.findUnique({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: COLECCION, id } },
    });
    return r && !r.eliminadoEn ? (r.datos as unknown as ActaVisita) : null;
  }

  private async guardar(corredoraId: string, a: ActaVisita, usuarioId?: string | null) {
    const datos = a as unknown as Prisma.InputJsonObject;
    await this.db.registro.upsert({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: COLECCION, id: a.id } },
      create: { corredoraId, coleccion: COLECCION, id: a.id, datos, creadoPorId: usuarioId ?? null },
      update: { datos, version: { increment: 1 }, eliminadoEn: null },
    });
  }

  /** el acta, si el usuario puede ver su negocio */
  private async visible(u: UsuarioToken, id: string) {
    const a = await this.leer(u.corredoraId, id);
    if (!a) throw new NotFoundException('Esa acta de visita ya no existe.');
    await buscarVisible(this.db.negocio, u, a.negocioId, 'El negocio');
    return a;
  }

  private publica(a: ActaVisita) {
    return {
      ...a,
      audios: a.audios.map(({ clave: _c, ...x }) => x),
      fotos: a.fotos.map(({ clave: _c, ...x }) => x),
    };
  }

  // ------------------------------------------------------------------ app

  async listar(u: UsuarioToken, negocioId: string) {
    await buscarVisible(this.db.negocio, u, negocioId, 'El negocio');
    const filas = await this.db.registro.findMany({
      where: { corredoraId: u.corredoraId, coleccion: COLECCION, eliminadoEn: null, datos: { path: ['negocioId'], equals: negocioId } },
      orderBy: { creadoEn: 'desc' },
      take: 50,
    });
    return { items: filas.map((f) => this.publica(f.datos as unknown as ActaVisita)) };
  }

  async crear(u: UsuarioToken, negocioId: string, fecha?: string) {
    const n = await buscarVisible(this.db.negocio, u, negocioId, 'El negocio');
    const yo = await this.db.usuario.findUnique({ where: { id: u.sub }, select: { nombre: true } });
    const a: ActaVisita = {
      id: randomUUID(),
      negocioId,
      propiedadId: n.propiedadId ?? null,
      fecha: fecha ?? hoy(),
      estado: 'abierta',
      creadaEn: new Date().toISOString(),
      creadaPor: yo?.nombre || 'Corredor',
      usuarioId: u.sub,
      notas: '',
      audios: [],
      fotos: [],
      resumen: null,
      cerradaEn: null,
    };
    await this.guardar(u.corredoraId, a, u.sub);
    return this.publica(a);
  }

  async ver(u: UsuarioToken, id: string) {
    return this.publica(await this.visible(u, id));
  }

  async subirAudio(u: UsuarioToken, id: string, b: z.infer<typeof audioEsquema>) {
    const a = await this.visible(u, id);
    const buf = Buffer.from(b.audio, 'base64');
    const r = await this.agregarAudio(u.corredoraId, a, buf, b.mime, b.origen);
    await this.guardar(u.corredoraId, a, u.sub);
    return { ...this.publica(a), recibido: r };
  }

  async subirFoto(u: UsuarioToken, id: string, b: z.infer<typeof fotoEsquema>) {
    const a = await this.visible(u, id);
    await this.agregarFoto(u.corredoraId, a, Buffer.from(b.imagen, 'base64'), 'app');
    await this.guardar(u.corredoraId, a, u.sub);
    return this.publica(a);
  }

  async notas(u: UsuarioToken, id: string, notas: string) {
    const a = await this.visible(u, id);
    a.notas = notas.trim();
    await this.guardar(u.corredoraId, a, u.sub);
    return this.publica(a);
  }

  /** arma (o rehace) el resumen con todo lo que hay */
  async resumir(u: UsuarioToken, id: string) {
    const a = await this.visible(u, id);
    a.resumen = await this.armarResumen(u.corredoraId, a);
    await this.guardar(u.corredoraId, a, u.sub);
    return this.publica(a);
  }

  async cerrar(u: UsuarioToken, id: string) {
    const a = await this.visible(u, id);
    if (!a.audios.length && !a.fotos.length && !a.notas.trim())
      throw new BadRequestException('El acta está vacía: graba o sube un audio, agrega fotos o escribe notas.');
    await this.terminar(u.corredoraId, a, u.sub);
    return this.publica(a);
  }

  /** elimina el acta con sus audios y fotos (los archivos de R2 se borran en segundo plano) */
  async eliminar(u: UsuarioToken, id: string) {
    const a = await this.visible(u, id);
    await this.db.registro.update({
      where: { corredoraId_coleccion_id: { corredoraId: u.corredoraId, coleccion: COLECCION, id } },
      data: { eliminadoEn: new Date(), version: { increment: 1 } },
    });
    this.r2.borrar([...a.audios.map((x) => x.clave), ...a.fotos.map((x) => x.clave)]);
    // si estaba abierta para recibir por WhatsApp, deja de recibir
    const v = await this.db.waVinculo.findUnique({ where: { usuarioId: a.usuarioId } });
    const d = (v?.datos ?? {}) as Record<string, unknown>;
    if ((d.actaAbierta as { id?: string } | undefined)?.id === id) await this.cerrarAbierta(a.usuarioId, d);
    await this.actividad
      .registrar({
        corredoraId: u.corredoraId,
        entidadTipo: 'negocio',
        entidadId: a.negocioId,
        texto: `Acta de visita del ${a.fecha.slice(8, 10)}/${a.fecha.slice(5, 7)} eliminada`,
        usuarioId: u.sub,
      })
      .catch(() => null);
    return { ok: true };
  }

  async enlaceArchivo(u: UsuarioToken, id: string, tipo: string, n: number) {
    const a = await this.visible(u, id);
    const f = (tipo === 'audio' ? a.audios : tipo === 'foto' ? a.fotos : []).find((x) => x.n === n);
    if (!f) throw new NotFoundException('Ese archivo no existe.');
    // url: para verlo dentro de la app; descarga: la misma con nombre para guardarlo
    const [url, descarga] = await Promise.all([this.r2.urlVer(f.clave), this.r2.urlDescarga(f.clave, f.nombre)]);
    return { url, descarga, nombre: f.nombre, tipo: f.tipo };
  }

  /**
   * Abre el acta para recibir por WhatsApp: los audios y fotos que el corredor mande a la empresa desde su celular
   * vinculado caen aquí hasta que escriba «listo» (o pasen 6 horas).
   */
  async abrirWhatsapp(u: UsuarioToken, id: string) {
    const a = await this.visible(u, id);
    if (a.estado === 'cerrada') throw new BadRequestException('El acta ya está cerrada.');
    const v = await this.db.waVinculo.findUnique({ where: { usuarioId: u.sub } });
    if (!v?.activo || !v.contactId)
      throw new BadRequestException('Tu celular no está vinculado a WhatsApp. Vincúlalo en Asset › Integraciones.');
    const wa = await this.wa.cliente(u.corredoraId);
    if (!wa) throw new BadRequestException('La corredora no tiene WhatsApp conectado.');
    const p = a.propiedadId ? await this.db.propiedad.findUnique({ where: { id: a.propiedadId }, select: { codigo: true } }) : null;
    const d = (v.datos ?? {}) as Record<string, unknown>;
    await this.db.waVinculo.update({
      where: { usuarioId: u.sub },
      data: { datos: { ...d, actaAbierta: { id, desde: new Date().toISOString() } } as Prisma.InputJsonValue },
    });
    const texto = `${firma('juanita')}\n📝 Acta de visita${p ? ' de ' + p.codigo : ''} abierta. Mándame por aquí el *audio* de la visita (o varios) y las *fotos*; las voy sumando al acta. Cuando termines, escribe *listo* y te mando el resumen.`;
    const r = await wa.enviarAContacto(v.contactId, texto);
    await this.enviados.registrar(u.corredoraId, v.telefono, { messageId: r.messageId, texto, enHilo: false });
    return { ok: true, telefono: v.telefono };
  }

  // ------------------------------------------------------------------ lo que se agrega (app y WhatsApp)

  private async agregarAudio(corredoraId: string, a: ActaVisita, buf: Buffer, mime: string, origen: AudioActa['origen']) {
    if (a.estado === 'cerrada') throw new BadRequestException('El acta ya está cerrada.');
    if (a.audios.length >= MAX_AUDIOS) throw new BadRequestException(`Un acta admite hasta ${MAX_AUDIOS} audios.`);
    if (buf.length < 1000) throw new BadRequestException('El audio está vacío.');
    if (buf.length > AUDIO_MAX) throw new BadRequestException('El audio es demasiado largo (máximo 25 MB).');
    const tipo = (mime.split(';')[0] || 'audio/webm').trim().toLowerCase();
    const n = (a.audios.reduce((m, x) => Math.max(m, x.n), 0) || 0) + 1;
    const ext = EXT_AUDIO[tipo] ?? (tipo.split('/')[1] || 'audio').replace(/[^a-z0-9]/g, '').slice(0, 5);
    const clave = `c/${corredoraId}/r/${COLECCION}/${a.id}/audio-${n}-${randomUUID().slice(0, 8)}.${ext}`;
    await this.r2.subir(clave, buf, tipo);
    let transcripcion = '';
    let error = '';
    try {
      transcripcion = (await this.transcripcion.transcribir(corredoraId, buf, tipo)).texto;
      if (!transcripcion.trim()) error = 'No se escuchó nada en este audio.';
    } catch (e) {
      error = (e as Error).message;
      this.log.warn(`audio del acta ${a.id}: ${error}`);
    }
    const x: AudioActa = {
      n,
      clave,
      nombre: `audio-visita-${n}.${ext}`,
      tipo,
      origen,
      recibido: new Date().toISOString(),
      bytes: buf.length,
      transcripcion,
      error,
    };
    a.audios.push(x);
    return { n, transcrito: !!transcripcion.trim(), error };
  }

  private async agregarFoto(corredoraId: string, a: ActaVisita, buf: Buffer, origen: FotoActa['origen']) {
    if (a.estado === 'cerrada') throw new BadRequestException('El acta ya está cerrada.');
    if (a.fotos.length >= MAX_FOTOS) throw new BadRequestException(`Un acta admite hasta ${MAX_FOTOS} fotos.`);
    if (buf.length > FOTO_MAX) throw new BadRequestException('La foto es demasiado pesada (máximo 15 MB).');
    let jpg: Buffer;
    try {
      jpg = await sharp(buf)
        .rotate()
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException('Ese archivo no es una imagen que pueda abrir (JPG, PNG, WebP o HEIC).');
    }
    const n = (a.fotos.reduce((m, x) => Math.max(m, x.n), 0) || 0) + 1;
    const clave = `c/${corredoraId}/r/${COLECCION}/${a.id}/foto-${n}-${randomUUID().slice(0, 8)}.jpg`;
    await this.r2.subir(clave, jpg, 'image/jpeg');
    a.fotos.push({ n, clave, nombre: `foto-visita-${n}.jpg`, tipo: 'image/jpeg', origen, recibido: new Date().toISOString() });
    return n;
  }

  private async armarResumen(corredoraId: string, a: ActaVisita): Promise<ResumenActa> {
    const textos = a.audios.filter((x) => x.transcripcion.trim());
    const n = await this.db.negocio.findUnique({ where: { id: a.negocioId }, select: { clienteId: true, tipo: true } });
    const [prop, persona] = await Promise.all([
      a.propiedadId ? this.db.propiedad.findUnique({ where: { id: a.propiedadId } }) : null,
      n?.clienteId ? this.db.persona.findUnique({ where: { id: n.clienteId }, select: { nombre: true } }) : null,
    ]);
    const vacio = (resumen: string): ResumenActa => ({
      hechoEn: new Date().toISOString(),
      resumen,
      interesado: [],
      corredor: [],
      interes: 'sin_datos',
      objeciones: [],
      acuerdos: [],
      proximosPasos: [],
    });
    if (!textos.length && !a.notas.trim())
      return vacio('Todavía no hay audios transcritos ni notas: el resumen se arma con lo que se dijo en la visita.');
    try {
      const j = await this.ia.json({
        corredoraId,
        uso: 'acta-visita:resumen',
        sistema: SISTEMA_RESUMEN,
        usuario: JSON.stringify({
          visita: a.fecha,
          operacion: n?.tipo ?? null,
          propiedad: prop ? [prop.codigo, prop.titulo, prop.direccion, prop.comuna].filter(Boolean).join(' · ') : null,
          interesado: persona?.nombre ?? null,
          corredor: a.creadaPor,
          notasDelCorredor: a.notas.trim() || null,
          audios: textos.map((x) => ({ n: x.n, origen: x.origen, transcripcion: x.transcripcion.slice(0, 40_000) })),
        }),
      });
      const interes = String(j.interes ?? '');
      return {
        hechoEn: new Date().toISOString(),
        resumen: String(j.resumen ?? '').trim().slice(0, 2500) || 'No se pudo redactar el resumen.',
        interesado: lista(j.interesado),
        corredor: lista(j.corredor),
        interes: (['alto', 'medio', 'bajo', 'sin_datos'] as const).find((x) => x === interes) ?? 'sin_datos',
        objeciones: lista(j.objeciones),
        acuerdos: lista(j.acuerdos),
        proximosPasos: lista(j.proximosPasos),
      };
    } catch (e) {
      this.log.warn(`resumen del acta ${a.id}: ${(e as Error).message}`);
      return vacio('No pude redactar el resumen con la IA ahora. Las transcripciones quedaron guardadas: vuelve a intentarlo.');
    }
  }

  /** cierra el acta: resumen al día y registro en la actividad del negocio */
  private async terminar(corredoraId: string, a: ActaVisita, usuarioId: string | null) {
    a.resumen = await this.armarResumen(corredoraId, a);
    a.estado = 'cerrada';
    a.cerradaEn = new Date().toISOString();
    await this.guardar(corredoraId, a, usuarioId);
    await this.actividad
      .registrar({
        corredoraId,
        entidadTipo: 'negocio',
        entidadId: a.negocioId,
        texto: `Acta de visita del ${a.fecha.slice(8, 10)}/${a.fecha.slice(5, 7)} cerrada (${a.audios.length} audio${a.audios.length === 1 ? '' : 's'}, ${a.fotos.length} foto${a.fotos.length === 1 ? '' : 's'})`,
        usuarioId,
      })
      .catch(() => null);
  }

  // ------------------------------------------------------------------ WhatsApp

  /**
   * Los mensajes del celular de un ejecutivo con un acta abierta: sus audios y fotos se suman al acta y «listo» la cierra.
   * Devuelve lo que sigue su camino (lo que no es del acta). Si algo falla, deja pasar todo.
   */
  async interceptar(wa: Wechatia, v: { usuarioId: string; corredoraId: string; datos: unknown }, cv: Conversacion, nuevos: MensajeWa[]): Promise<MensajeWa[]> {
    const d = (v.datos ?? {}) as { actaAbierta?: { id: string; desde: string } };
    try {
      if (d.actaAbierta) return await this.recibirWa(wa, v, d, d.actaAbierta, cv, nuevos);
      return await this.pedidoDirecto(wa, v, d as Record<string, unknown>, cv, nuevos);
    } catch (e) {
      this.log.warn(`acta de visita por WhatsApp: ${(e as Error).message}`);
      return nuevos;
    }
  }

  private async guardarDatos(usuarioId: string, d: Record<string, unknown>, pend: Pendiente | null) {
    const { actaPend: _x, ...resto } = d;
    await this.db.waVinculo.update({
      where: { usuarioId },
      data: { datos: (pend ? { ...resto, actaPend: pend } : resto) as Prisma.InputJsonValue },
    });
  }

  /**
   * El corredor le dice al agente, sin abrir nada en la app: «guarda este audio en el acta de visita» (con el audio en el
   * mismo mensaje, antes o después). El negocio se elige por el código de la propiedad que nombre; si no lo nombra, se le
   * propone su visita más reciente y se espera su sí. Se transcribe, se suma al acta del negocio (se abre una si no hay)
   * y se responde con el resumen.
   */
  private async pedidoDirecto(wa: Wechatia, v: { usuarioId: string; corredoraId: string }, d: Record<string, unknown>, cv: Conversacion, nuevos: MensajeWa[]) {
    let pend = d.actaPend as Pendiente | undefined;
    if (pend && Date.now() - new Date(pend.desde).getTime() > PENDIENTE_MS) pend = undefined;
    const audios = nuevos.flatMap((m) => m.adjuntos.filter((u) => ES_AUDIO.test(u)));
    const fotos = nuevos.flatMap((m) => m.adjuntos.filter((u) => !ES_AUDIO.test(u) && !ES_OTRO.test(u)));
    const texto = nuevos.map((m) => m.texto).join(' ').trim();
    const n = norm(texto);
    const pide = PIDE_ACTA.test(n);
    const responde = !!pend?.sugerida && !pide;
    const captura = pide || !!pend?.esperando;

    // sin pedido: solo se recuerdan los audios por si dice «guárdalo en el acta de visita» enseguida
    if (!captura && !responde) {
      if (audios.length) await this.guardarDatos(v.usuarioId, d, { audios: [...(pend?.audios ?? []), ...audios].slice(-6), fotos: pend?.fotos ?? [], desde: new Date().toISOString() });
      return nuevos;
    }
    const decir = async (t: string) => {
      if (!cv.contactId) return;
      const x = `${firma('juanita')}\n${t}`;
      const r = await wa.enviarAContacto(cv.contactId, x);
      await this.enviados.registrar(v.corredoraId, cv.telefono, { messageId: r.messageId, texto: t, enHilo: false });
    };
    const medios = { audios: [...new Set([...(pend?.audios ?? []), ...audios])], fotos: [...new Set([...(pend?.fotos ?? []), ...(captura ? fotos : [])])] };
    const consumidos = (m: MensajeWa) => (pide && PIDE_ACTA.test(norm(m.texto))) || (captura && m.adjuntos.length > 0 && m.adjuntos.every((u) => ES_AUDIO.test(u) || !ES_OTRO.test(u)));

    // respuesta a «¿es la visita de …?»
    if (responde && pend?.sugerida) {
      const cod = CODIGO.exec(texto);
      let neg: { id: string; etiqueta: string } | null = null;
      if (cod) neg = await this.negocioPorCodigo(v, `${cod[1].toUpperCase()}-${cod[2]}`);
      else if (SI.test(n)) neg = { id: pend.sugerida.negocioId, etiqueta: pend.sugerida.etiqueta };
      else if (NO.test(n) && n.length < 30) {
        await this.guardarDatos(v.usuarioId, d, null);
        await decir('Ok, no guardo nada. Cuando quieras, mándame el audio y dime el código de la propiedad.');
        return [];
      }
      if (!neg) {
        if (cod) await decir(`No encontré un negocio abierto tuyo en la propiedad ${cod[1].toUpperCase()}-${cod[2]}.`);
        return cod ? [] : nuevos;
      }
      await this.guardarDatos(v.usuarioId, d, null);
      await this.guardarEnActa(v, neg, { audios: [...new Set([...pend.audios, ...audios])], fotos: [...pend.fotos, ...fotos] }, decir, CIERRA.test(n));
      return nuevos.filter((m) => !SI.test(norm(m.texto)) && !(CODIGO.test(m.texto) && m.texto.trim().length < 30) && !consumidos(m));
    }

    // ¿a qué negocio?
    const cod = CODIGO.exec(texto);
    const neg: { id: string; etiqueta: string } | null = cod ? await this.negocioPorCodigo(v, `${cod[1].toUpperCase()}-${cod[2]}`) : null;
    if (cod && !neg) {
      await decir(`No encontré un negocio abierto tuyo en la propiedad ${cod[1].toUpperCase()}-${cod[2]}. Revisa el código.`);
      return nuevos.filter((m) => !consumidos(m));
    }
    const sinMedios = !medios.audios.length && !medios.fotos.length;
    if (!neg) {
      const sug = await this.negocioSugerido(v);
      if (sinMedios) {
        await this.guardarDatos(v.usuarioId, d, { ...medios, desde: new Date().toISOString(), esperando: true, sugerida: null });
        await decir('Listo, mándame el *audio* de la visita (y las fotos si quieres) y lo guardo en el acta de visita. Dime también el código de la propiedad (por ejemplo PF-1001).');
        return nuevos.filter((m) => !consumidos(m));
      }
      await this.guardarDatos(v.usuarioId, d, { ...medios, desde: new Date().toISOString(), sugerida: sug ? { negocioId: sug.id, etiqueta: sug.etiqueta } : null });
      await decir(sug ? `¿Lo guardo en el acta de la visita de *${sug.etiqueta}*? Responde *sí*, o escríbeme otro código de propiedad.` : 'No sé a qué visita corresponde. Escríbeme el código de la propiedad (por ejemplo PF-1001).');
      return nuevos.filter((m) => !consumidos(m));
    }
    if (sinMedios) {
      await this.guardarDatos(v.usuarioId, d, { ...medios, desde: new Date().toISOString(), esperando: true, sugerida: null });
      await decir(`Listo, mándame el audio de la visita de *${neg.etiqueta}* (y las fotos) y lo guardo en el acta.`);
      return nuevos.filter((m) => !consumidos(m));
    }
    await this.guardarDatos(v.usuarioId, d, null);
    await this.guardarEnActa(v, neg, medios, decir, CIERRA.test(n));
    return nuevos.filter((m) => !consumidos(m));
  }

  /** la misma visibilidad que la app: el admin ve todo; el corredor, lo suyo */
  private async visibles(v: { usuarioId: string }) {
    const u = await this.db.usuario.findUnique({ where: { id: v.usuarioId }, select: { rol: true } });
    return u?.rol === 'ADMIN' ? {} : { corredorId: v.usuarioId };
  }

  private async etiquetaNegocio(n: { propiedadId: string | null; clienteId: string | null }) {
    const [p, c] = await Promise.all([
      n.propiedadId ? this.db.propiedad.findUnique({ where: { id: n.propiedadId }, select: { codigo: true } }) : null,
      n.clienteId ? this.db.persona.findUnique({ where: { id: n.clienteId }, select: { nombre: true } }) : null,
    ]);
    return [p?.codigo, c?.nombre].filter(Boolean).join(' · ') || 'el negocio';
  }

  private async negocioPorCodigo(v: { usuarioId: string; corredoraId: string }, codigo: string) {
    const n = await this.db.negocio.findFirst({
      where: { corredoraId: v.corredoraId, eliminadoEn: null, estado: 'abierto', ...(await this.visibles(v)), propiedad: { codigo: { equals: codigo, mode: 'insensitive' } } },
      orderBy: { actualizadoEn: 'desc' },
    });
    return n ? { id: n.id, etiqueta: await this.etiquetaNegocio(n) } : null;
  }

  /** la visita más reciente del corredor (últimos 3 días); si no hay, su negocio abierto tocado más recién */
  private async negocioSugerido(v: { usuarioId: string; corredoraId: string }) {
    const vis = await this.visibles(v);
    const ev = await this.db.evento.findFirst({
      where: { corredoraId: v.corredoraId, eliminadoEn: null, tipo: 'visita', estado: { not: 'cancelado' }, negocioId: { not: null }, ...vis, fecha: { gte: new Date(Date.now() - 3 * 86400_000), lte: new Date(Date.now() + 86400_000) } },
      orderBy: { fecha: 'desc' },
    });
    let n = ev?.negocioId ? await this.db.negocio.findFirst({ where: { id: ev.negocioId, corredoraId: v.corredoraId, eliminadoEn: null, estado: 'abierto' } }) : null;
    if (!n)
      n = await this.db.negocio.findFirst({
        where: { corredoraId: v.corredoraId, eliminadoEn: null, estado: 'abierto', ...vis, actualizadoEn: { gt: new Date(Date.now() - 7 * 86400_000) } },
        orderBy: { actualizadoEn: 'desc' },
      });
    return n ? { id: n.id, etiqueta: await this.etiquetaNegocio(n) } : null;
  }

  /** suma los audios (transcritos) y fotos al acta abierta de ese negocio (la crea si no hay), la resume y responde */
  private async guardarEnActa(
    v: { usuarioId: string; corredoraId: string },
    neg: { id: string; etiqueta: string },
    medios: { audios: string[]; fotos: string[] },
    decir: (t: string) => Promise<void>,
    cerrar: boolean,
  ) {
    const fila = await this.db.registro.findFirst({
      where: { corredoraId: v.corredoraId, coleccion: COLECCION, eliminadoEn: null, AND: [{ datos: { path: ['negocioId'], equals: neg.id } }, { datos: { path: ['estado'], equals: 'abierta' } }] },
      orderBy: { creadoEn: 'desc' },
    });
    let acta = fila ? (fila.datos as unknown as ActaVisita) : null;
    if (!acta) {
      const n = await this.db.negocio.findUnique({ where: { id: neg.id }, select: { propiedadId: true } });
      const yo = await this.db.usuario.findUnique({ where: { id: v.usuarioId }, select: { nombre: true } });
      acta = { id: randomUUID(), negocioId: neg.id, propiedadId: n?.propiedadId ?? null, fecha: hoy(), estado: 'abierta', creadaEn: new Date().toISOString(), creadaPor: yo?.nombre || 'Corredor', usuarioId: v.usuarioId, notas: '', audios: [], fotos: [], resumen: null, cerradaEn: null };
    }
    const { nAudios, nFotos, aviso } = await this.sumarMedios(v.corredoraId, acta, medios.audios, medios.fotos);
    if (cerrar) await this.terminar(v.corredoraId, acta, v.usuarioId);
    else {
      acta.resumen = await this.armarResumen(v.corredoraId, acta);
      await this.guardar(v.corredoraId, acta, v.usuarioId);
    }
    const s = acta.resumen;
    const recibido = [nAudios ? (nAudios === 1 ? 'tu audio' : nAudios + ' audios') : '', nFotos ? (nFotos === 1 ? 'la foto' : nFotos + ' fotos') : ''].filter(Boolean).join(' y ');
    await decir(
      [
        recibido ? `📝 Guardé ${recibido} en el acta de visita de *${neg.etiqueta}*${nAudios ? ' y lo transcribí' : ''}.` : `📝 No pude guardar nada en el acta de *${neg.etiqueta}*.`,
        s?.resumen ? `*Resumen:* ${s.resumen}` : '',
        s?.acuerdos.length ? `*Acuerdos:* ${s.acuerdos.join('; ')}` : '',
        s?.proximosPasos.length ? `*Próximos pasos:* ${s.proximosPasos.join('; ')}` : '',
        ...aviso,
        cerrar ? 'Acta cerrada. La ves completa en Asset, en la etapa 1 del negocio.' : 'El acta sigue abierta: mándame más audios o fotos y los sumo, o dime «cierra el acta». La ves en Asset, en la etapa 1 del negocio.',
      ].filter(Boolean).join('\n'),
    );
  }

  /** baja de wechatia y suma al acta los audios y fotos; devuelve cuántos entraron y los avisos de lo que falló */
  private async sumarMedios(corredoraId: string, acta: ActaVisita, audios: string[], fotos: string[]) {
    const aviso: string[] = [];
    let nAudios = 0;
    let nFotos = 0;
    for (const u of audios) {
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(90_000) });
        if (!r.ok) throw new Error(`wechatia respondió ${r.status}`);
        const x = await this.agregarAudio(corredoraId, acta, Buffer.from(await r.arrayBuffer()), r.headers.get('content-type') || 'audio/ogg', 'whatsapp');
        nAudios++;
        if (x.error) aviso.push(`El audio ${x.n} quedó guardado pero no pude transcribirlo (${x.error}).`);
      } catch (e) {
        aviso.push(`No pude recibir un audio: ${(e as Error).message}`);
      }
    }
    for (const u of fotos) {
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(60_000) });
        if (!r.ok) throw new Error(`wechatia respondió ${r.status}`);
        await this.agregarFoto(corredoraId, acta, Buffer.from(await r.arrayBuffer()), 'whatsapp');
        nFotos++;
      } catch (e) {
        aviso.push(`No pude recibir una foto: ${(e as Error).message}`);
      }
    }
    return { nAudios, nFotos, aviso };
  }

  private async cerrarAbierta(usuarioId: string, d: Record<string, unknown>) {
    const { actaAbierta: _x, ...resto } = d;
    await this.db.waVinculo.update({ where: { usuarioId }, data: { datos: resto as Prisma.InputJsonValue } });
  }

  private async recibirWa(
    wa: Wechatia,
    v: { usuarioId: string; corredoraId: string },
    d: Record<string, unknown>,
    abierta: { id: string; desde: string },
    cv: Conversacion,
    nuevos: MensajeWa[],
  ) {
    const acta = await this.leer(v.corredoraId, abierta.id);
    if (!acta || acta.estado === 'cerrada' || Date.now() - new Date(abierta.desde).getTime() > ABIERTA_MS) {
      await this.cerrarAbierta(v.usuarioId, d);
      return nuevos;
    }
    const decir = async (t: string) => {
      if (!cv.contactId) return;
      const texto = `${firma('juanita')}\n${t}`;
      const r = await wa.enviarAContacto(cv.contactId, texto);
      await this.enviados.registrar(v.corredoraId, cv.telefono, { messageId: r.messageId, texto: t, enHilo: false });
    };
    const propios: MensajeWa[] = [];
    const audios: string[] = [];
    const fotos: string[] = [];
    for (const m of nuevos) {
      const a = m.adjuntos.filter((u) => ES_AUDIO.test(u));
      const f = m.adjuntos.filter((u) => !ES_AUDIO.test(u) && !ES_OTRO.test(u));
      audios.push(...a);
      fotos.push(...f);
      if (a.length || f.length) propios.push(m);
    }
    const cierra = nuevos.find((m) => !m.adjuntos.length && TERMINA.test(norm(m.texto).trim()) && m.texto.trim().length < 40);
    if (!audios.length && !fotos.length && !cierra) return nuevos;

    const { nAudios, nFotos, aviso } = await this.sumarMedios(v.corredoraId, acta, audios, fotos);
    await this.guardar(v.corredoraId, acta, v.usuarioId);
    if (cierra) {
      await this.terminar(v.corredoraId, acta, v.usuarioId);
      await this.cerrarAbierta(v.usuarioId, d);
      const s = acta.resumen;
      await decir(
        [
          '✅ Acta de visita cerrada.',
          s?.resumen,
          s?.acuerdos.length ? `*Acuerdos:* ${s.acuerdos.join('; ')}` : '',
          s?.proximosPasos.length ? `*Próximos pasos:* ${s.proximosPasos.join('; ')}` : '',
          ...aviso,
          'La ves completa en Asset, en la etapa 1 del negocio.',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    } else {
      const partes = [nAudios ? `🎙️ ${nAudios === 1 ? 'Audio recibido' : nAudios + ' audios recibidos'}` : '', nFotos ? `📷 ${nFotos === 1 ? 'Foto recibida' : nFotos + ' fotos recibidas'}` : ''].filter(Boolean);
      await decir(`${partes.join(' y ')} (el acta lleva ${acta.audios.length} audio${acta.audios.length === 1 ? '' : 's'} y ${acta.fotos.length} foto${acta.fotos.length === 1 ? '' : 's'}). ${aviso.join(' ')} Escribe *listo* cuando termines.`.trim());
    }
    return nuevos.filter((m) => !propios.includes(m) && m !== cierra);
  }
}

@Controller('actas-visita')
export class ActaVisitaController {
  constructor(private readonly s: ActaVisitaService) {}

  @Get('negocio/:negocioId')
  listar(@UsuarioActual() u: UsuarioToken, @Param('negocioId') id: string) {
    return this.s.listar(u, id.slice(0, 80));
  }

  @Post('negocio/:negocioId')
  @HttpCode(200)
  crear(
    @UsuarioActual() u: UsuarioToken,
    @Param('negocioId') id: string,
    @Body(new ZodPipe(crearEsquema)) b: z.infer<typeof crearEsquema>,
  ) {
    return this.s.crear(u, id.slice(0, 80), b.fecha);
  }

  @Get(':id')
  ver(@UsuarioActual() u: UsuarioToken, @Param('id') id: string) {
    return this.s.ver(u, id.slice(0, 80));
  }

  @Delete(':id')
  eliminar(@UsuarioActual() u: UsuarioToken, @Param('id') id: string) {
    return this.s.eliminar(u, id.slice(0, 80));
  }

  @Post(':id/audio')
  @HttpCode(200)
  audio(@UsuarioActual() u: UsuarioToken, @Param('id') id: string, @Body(new ZodPipe(audioEsquema)) b: z.infer<typeof audioEsquema>) {
    return this.s.subirAudio(u, id.slice(0, 80), b);
  }

  @Post(':id/foto')
  @HttpCode(200)
  foto(@UsuarioActual() u: UsuarioToken, @Param('id') id: string, @Body(new ZodPipe(fotoEsquema)) b: z.infer<typeof fotoEsquema>) {
    return this.s.subirFoto(u, id.slice(0, 80), b);
  }

  @Post(':id/notas')
  @HttpCode(200)
  notas(@UsuarioActual() u: UsuarioToken, @Param('id') id: string, @Body(new ZodPipe(notasEsquema)) b: z.infer<typeof notasEsquema>) {
    return this.s.notas(u, id.slice(0, 80), b.notas);
  }

  @Post(':id/resumir')
  @HttpCode(200)
  resumir(@UsuarioActual() u: UsuarioToken, @Param('id') id: string) {
    return this.s.resumir(u, id.slice(0, 80));
  }

  @Post(':id/cerrar')
  @HttpCode(200)
  cerrar(@UsuarioActual() u: UsuarioToken, @Param('id') id: string) {
    return this.s.cerrar(u, id.slice(0, 80));
  }

  @Post(':id/whatsapp')
  @HttpCode(200)
  whatsapp(@UsuarioActual() u: UsuarioToken, @Param('id') id: string) {
    return this.s.abrirWhatsapp(u, id.slice(0, 80));
  }

  @Get(':id/archivo/:tipo/:n')
  archivo(@UsuarioActual() u: UsuarioToken, @Param('id') id: string, @Param('tipo') tipo: string, @Param('n') n: string) {
    return this.s.enlaceArchivo(u, id.slice(0, 80), tipo.slice(0, 10), Number(n) || 0);
  }
}
