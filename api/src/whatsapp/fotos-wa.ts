// Fotos de una propiedad mandadas por WhatsApp desde el celular del ejecutivo (con su Asset abierto o cerrado).
// Lo atiende siempre el servidor, antes que el equipo o la cola de su Asset:
//  · fotos con el código en el texto («PF-1001») → se agregan a esa propiedad;
//  · fotos sin código → quedan pendientes y Pedro pregunta a cuál (sugiere la última que el ejecutivo creó o tocó);
//    la respuesta («PF-1001», «sí», «no») las agrega o las descarta. Las pendientes vencen a los 30 minutos.
// Las fotos se bajan de wechatia, se suben a R2 (c/<corredora>/p/<propiedad>/fotos/wa_…) y quedan al final de la
// galería de la propiedad (sube su versión: la app la trae en su próxima sincronización).
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, WaVinculo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AlmacenamientoService } from '../archivos/almacenamiento.service';
import { ActividadService } from '../comun/actividad.service';
import { EnviadosService } from './enviados';
import type { Conversacion, MensajeWa, Wechatia } from './wechatia';
import { firma, norm } from './comun';

const PENDIENTES_MS = 30 * 60_000;
const MAX_FOTOS = 40; // por propiedad y vez
const MAX_GALERIA = 60;
const FOTO_MAX = 15 * 1024 * 1024;
const TIPOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const ES_AUDIO = /\.(ogg|oga|opus|mp3|m4a|amr|aac|wav|webm)(\?|$)|audio/i;
const ES_IMAGEN = /\.(jpe?g|png|webp|heic|heif)(\?|$)|image/i;
const ES_OTRO = /\.(pdf|docx?|xlsx?|zip|txt|mp4|mov|3gp)(\?|$)|video|application/i;
const CODIGO = /\b([a-z]{1,4})-?\s?(\d{3,6})\b/i;
const SI = /^(si|sí|dale|ok|okay|ya|claro|correcto|esa|esa misma|si,? esa|agregalas|agrégalas)\b/;
const NO = /^(no|nop|cancela|cancelar|descarta|descartalas|ninguna)\b/;

interface Pendientes {
  urls: string[];
  desde: string;
  sugerida?: { id: string; codigo: string; titulo: string } | null;
  preguntadoEn?: string;
}

@Injectable()
export class FotosWaService {
  private readonly log = new Logger('FotosWa');
  constructor(
    private readonly db: PrismaService,
    private readonly r2: AlmacenamientoService,
    private readonly actividad: ActividadService,
    private readonly enviados: EnviadosService,
  ) {}

  /** ¿podría ser una foto? (lo que no es claramente audio ni otro archivo) */
  private esFoto(u: string) {
    return ES_IMAGEN.test(u) || (!ES_AUDIO.test(u) && !ES_OTRO.test(u));
  }

  /**
   * Toma lo que es de fotos y devuelve los mensajes que siguen su camino (equipo o cola de su Asset). Si algo falla,
   * deja pasar todo: mejor que lo vea el equipo a que se pierda.
   */
  async interceptar(wa: Wechatia, v: WaVinculo, cv: Conversacion, nuevos: MensajeWa[]): Promise<MensajeWa[]> {
    try {
      return await this.procesar(wa, v, cv, nuevos);
    } catch (e) {
      this.log.warn(`fotos por WhatsApp: ${(e as Error).message}`);
      return nuevos;
    }
  }

  private async procesar(wa: Wechatia, v: WaVinculo, cv: Conversacion, nuevos: MensajeWa[]) {
    const datos = (v.datos ?? {}) as Record<string, unknown>;
    let pend = datos.fotosPendientes as Pendientes | undefined;
    if (pend && Date.now() - new Date(pend.desde).getTime() > PENDIENTES_MS) pend = undefined;

    const conFotos = nuevos.filter((m) => m.adjuntos.some((u) => this.esFoto(u)));
    const resto = nuevos.filter((m) => !conFotos.includes(m));
    const responder = async (t: string) => {
      if (!cv.contactId) return;
      const texto = `${firma('pedro')}\n${t}`;
      const r = await wa.enviarAContacto(cv.contactId, texto);
      await this.enviados.registrar(v.corredoraId, cv.telefono, { messageId: r.messageId, texto: t, enHilo: false });
    };
    const guardarPend = (p: Pendientes | null) =>
      this.db.waVinculo.update({
        where: { usuarioId: v.usuarioId },
        data: { datos: { ...datos, fotosPendientes: p ?? undefined } as Prisma.InputJsonValue },
      });

    // 1. llegan fotos: con código → a esa propiedad; sin código → pendientes y se pregunta
    if (conFotos.length) {
      const urls = [...(pend?.urls ?? []), ...conFotos.flatMap((m) => m.adjuntos.filter((u) => this.esFoto(u)))];
      // el código puede venir en el texto de una foto o en un mensaje aparte de la misma tanda («PF-1001»)
      const prop =
        (await this.porCodigo(v.corredoraId, conFotos.map((m) => m.texto).join(' '))) ??
        (await this.porCodigo(v.corredoraId, resto.map((m) => m.texto).join(' ')));
      if (prop) {
        await guardarPend(null);
        await responder(await this.agregar(v, prop, urls));
        return resto.filter((m) => !this.soloCodigo(m.texto));
      }
      const sugerida = pend?.sugerida ?? (await this.ultima(v));
      const nuevo: Pendientes = { urls, desde: pend?.desde ?? new Date().toISOString(), sugerida, preguntadoEn: pend?.preguntadoEn };
      // se pregunta una vez por tanda (si mandan 10 fotos llegan en varios mensajes)
      const yaPregunto = pend?.preguntadoEn && Date.now() - new Date(pend.preguntadoEn).getTime() < 2 * 60_000;
      if (!yaPregunto) {
        nuevo.preguntadoEn = new Date().toISOString();
        const n = urls.length;
        await responder(
          `Recibí ${n === 1 ? 'una foto' : n + ' fotos'}. ¿A qué propiedad ${n === 1 ? 'la' : 'las'} agrego?` +
            (sugerida
              ? `\n\n¿A la *${sugerida.codigo}* · ${sugerida.titulo}? Responde *sí*, o escríbeme otro código.`
              : '\n\nEscríbeme el código (por ejemplo, PF-1001).'),
        );
      }
      await guardarPend(nuevo);
      return resto;
    }

    // 2. hay fotos esperando: la respuesta puede ser un código, un sí o un no
    if (pend && resto.length) {
      const texto = resto.map((m) => m.texto).join(' ').trim();
      const n = norm(texto);
      const prop = await this.porCodigo(v.corredoraId, texto);
      const elegida = prop ?? (SI.test(n) && pend.sugerida ? await this.porId(v.corredoraId, pend.sugerida.id) : null);
      if (elegida) {
        await guardarPend(null);
        await responder(await this.agregar(v, elegida, pend.urls));
        // si además pidió otra cosa en el mismo mensaje («PF-1001, y agéndame…»), que siga su camino
        return resto.filter((m) => !this.soloCodigo(m.texto) && !SI.test(norm(m.texto)));
      }
      if (NO.test(n) && n.length < 30) {
        await guardarPend(null);
        await responder(`Ok, no agrego ${pend.urls.length === 1 ? 'la foto' : 'las fotos'}.`);
        return [];
      }
    }
    return nuevos;
  }

  /** el mensaje es solo la respuesta («PF-1001», «a la pf 1001», «sí, a esa»), sin otro pedido */
  private soloCodigo(texto: string) {
    const t = norm(texto).replace(CODIGO, '').replace(/\b(a|en|para|la|esa|esta|propiedad|agregalas?|agregala|ahi|si|porfa|por favor|gracias)\b/g, '');
    return t.replace(/[^a-z0-9]/g, '').length < 4;
  }

  /** la propiedad cuyo código aparece en el texto (PF-1001, pf 1001, PF1001) */
  private async porCodigo(corredoraId: string, texto: string) {
    const m = CODIGO.exec(texto || '');
    if (!m) return null;
    const codigo = `${m[1].toUpperCase()}-${m[2]}`;
    return this.db.propiedad.findFirst({
      where: { corredoraId, eliminadoEn: null, codigo: { equals: codigo, mode: 'insensitive' } },
      select: { id: true, codigo: true, titulo: true },
    });
  }
  private porId(corredoraId: string, id: string) {
    return this.db.propiedad.findFirst({ where: { id, corredoraId, eliminadoEn: null }, select: { id: true, codigo: true, titulo: true } });
  }

  /** la propiedad que el ejecutivo creó o tocó más recientemente (últimos 2 días), para sugerirla */
  private async ultima(v: WaVinculo) {
    const a = await this.db.actividad.findFirst({
      where: { corredoraId: v.corredoraId, usuarioId: v.usuarioId, entidadTipo: 'propiedad', fecha: { gt: new Date(Date.now() - 2 * 86400_000) } },
      orderBy: { fecha: 'desc' },
      select: { entidadId: true },
    });
    const p = a ? await this.porId(v.corredoraId, a.entidadId) : null;
    if (p) return p;
    return this.db.propiedad.findFirst({
      where: { corredoraId: v.corredoraId, eliminadoEn: null, actualizadoEn: { gt: new Date(Date.now() - 2 * 86400_000) } },
      orderBy: { actualizadoEn: 'desc' },
      select: { id: true, codigo: true, titulo: true },
    });
  }

  /** baja las fotos de wechatia, las sube a R2 y las agrega al final de la galería; devuelve el texto para responder */
  private async agregar(v: WaVinculo, prop: { id: string; codigo: string; titulo: string }, urls: string[]) {
    const unicas = [...new Set(urls)];
    const ya = await this.db.propiedadFoto.count({ where: { propiedadId: prop.id } });
    const cupo = Math.max(0, Math.min(MAX_FOTOS, MAX_GALERIA - ya));
    const nuevas: string[] = [];
    let fallidas = 0;
    for (const u of unicas.slice(0, cupo)) {
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(60_000) });
        if (!r.ok) throw new Error(`wechatia respondió ${r.status}`);
        const tipo = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const buf = Buffer.from(await r.arrayBuffer());
        const ext = TIPOS[tipo] ?? (/\.png(\?|$)/i.test(u) ? 'png' : /\.webp(\?|$)/i.test(u) ? 'webp' : /\.jpe?g(\?|$)/i.test(u) ? 'jpg' : null);
        if (!ext || !buf.length || buf.length > FOTO_MAX) throw new Error(`no es una foto JPG, PNG o WebP (${tipo || 'sin tipo'}, ${buf.length} bytes)`);
        const clave = this.r2.nuevaClave(v.corredoraId, prop.id, 'fotos', ext, 'wa');
        nuevas.push(await this.r2.subir(clave, buf, ext === 'jpg' ? 'image/jpeg' : `image/${ext}`));
      } catch (e) {
        fallidas++;
        this.log.warn(`foto de WhatsApp para ${prop.codigo}: ${(e as Error).message}`);
      }
    }
    const sobran = unicas.length - Math.min(unicas.length, cupo);
    if (nuevas.length)
      await this.db.$transaction(async (tx) => {
        await tx.propiedadFoto.createMany({
          data: nuevas.map((url, i) => ({ propiedadId: prop.id, url, orden: ya + i, destacada: ya + i === 0 })),
        });
        await tx.propiedad.update({ where: { id: prop.id }, data: { version: { increment: 1 } } });
        await this.actividad.registrar(
          {
            corredoraId: v.corredoraId,
            entidadTipo: 'propiedad',
            entidadId: prop.id,
            texto: `${nuevas.length} ${nuevas.length === 1 ? 'foto cargada' : 'fotos cargadas'} por WhatsApp`,
            usuarioId: v.usuarioId,
          },
          tx,
        );
      });
    const partes = [
      nuevas.length
        ? `Listo: agregué ${nuevas.length === 1 ? 'la foto' : nuevas.length + ' fotos'} a la *${prop.codigo}* · ${prop.titulo} (ahora tiene ${ya + nuevas.length}).`
        : `No pude agregar ${unicas.length === 1 ? 'la foto' : 'las fotos'} a la *${prop.codigo}*.`,
    ];
    if (fallidas) partes.push(`${fallidas === 1 ? 'Una no se pudo' : fallidas + ' no se pudieron'} bajar o no ${fallidas === 1 ? 'es' : 'son'} JPG, PNG o WebP: mándala${fallidas === 1 ? '' : 's'} de nuevo o súbela${fallidas === 1 ? '' : 's'} desde Asset.`);
    if (sobran) partes.push(`La galería admite hasta ${MAX_GALERIA} fotos: ${sobran === 1 ? 'una quedó' : sobran + ' quedaron'} fuera.`);
    return partes.join('\n');
  }
}
