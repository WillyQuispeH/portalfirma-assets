// Documento a revisión por WhatsApp cuando la persona NO ha escrito en las últimas 24 h.
//  WhatsApp no deja mandar texto libre ni un PDF fuera de esa ventana; solo una plantilla aprobada por Meta, y las
//  plantillas no pueden llevar un PDF que cambia en cada envío. Por eso:
//  1. se manda la plantilla «asset_documento_revision» («Te envío {documento} para tu revisión…», con el botón
//     «Enviar el documento») y queda guardado el envío pendiente (registro «revisiones_wa»);
//  2. cuando la persona responde (el botón o cualquier texto), la ventana de 24 h ya está abierta: este servicio le
//     manda el mensaje del corredor con el PDF adjunto, ANTES que los asistentes, y le avisa al corredor.
// Sirve para cualquier documento (contrato, acta, carta oferta…): solo cambia `documento` y el archivo.
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UsuarioToken } from '../auth/usuario-actual';
import { AlmacenamientoService } from '../archivos/almacenamiento.service';
import { AvisosService } from '../avisos/avisos';
import { ActividadService } from '../comun/actividad.service';
import { EnviadosService } from './enviados';
import type { Conversacion, MensajeWa, Wechatia } from './wechatia';
import { telNorm } from './comun';

export const ETIQUETA_DOCUMENTO_REVISION = 'asset_documento_revision';
const COLECCION = 'revisiones_wa';
/** pasado este plazo sin respuesta, el envío pendiente se olvida (la persona ya no está esperando ese documento) */
const VIGENCIA_MS = 30 * 24 * 3600_000;

export interface RevisionPendiente {
  estado: 'enviada' | 'entregada' | 'fallida';
  /** celular normalizado al que se mandó la plantilla */
  a: string;
  personaId: string;
  nombre: string;
  negocioId: string | null;
  propiedadId: string | null;
  /** «el contrato de arriendo (versión 2)» */
  documento: string;
  /** el mensaje del corredor que acompaña al PDF */
  texto: string;
  clave: string;
  archivo: string;
  usuarioId: string;
  enviadaEn: string;
  entregadaEn?: string;
  respuesta?: string;
  error?: string;
}

export interface PedidoRevision {
  personaId: string;
  nombre: string;
  telefono: string;
  negocioId?: string | null;
  propiedadId?: string | null;
  documento: string;
  propiedad: string;
  texto: string;
  clave: string;
  archivo: string;
}

@Injectable()
export class DocumentoRevisionService {
  private readonly log = new Logger('DocumentoRevision');
  constructor(
    private readonly db: PrismaService,
    private readonly enviados: EnviadosService,
    private readonly r2: AlmacenamientoService,
    private readonly avisos: AvisosService,
    private readonly actividad: ActividadService,
  ) {}

  /**
   * Manda la plantilla y deja pendiente el PDF. Un envío nuevo a la misma persona por el mismo negocio reemplaza al
   * anterior (se manda la última versión).
   */
  async solicitar(u: UsuarioToken, p: PedidoRevision) {
    const tel = telNorm(p.telefono);
    if (!tel) throw new Error(`${p.nombre} no tiene un celular válido.`);
    const [yo, corredora] = await Promise.all([
      this.db.usuario.findUnique({ where: { id: u.sub }, select: { nombre: true } }),
      this.db.corredora.findUnique({ where: { id: u.corredoraId }, select: { nombre: true } }),
    ]);
    await this.enviados.plantilla(u, {
      telefono: p.telefono,
      nombre: p.nombre,
      etiqueta: ETIQUETA_DOCUMENTO_REVISION,
      campos: {
        nombre: p.nombre.split(/\s+/)[0],
        remitente: [yo?.nombre, corredora?.nombre].filter(Boolean).join(', de '),
        documento: p.documento,
        propiedad: p.propiedad,
      },
    });
    const datos: RevisionPendiente = {
      estado: 'enviada',
      a: tel,
      personaId: p.personaId,
      nombre: p.nombre,
      negocioId: p.negocioId ?? null,
      propiedadId: p.propiedadId ?? null,
      documento: p.documento,
      texto: p.texto,
      clave: p.clave,
      archivo: p.archivo,
      usuarioId: u.sub,
      enviadaEn: new Date().toISOString(),
    };
    const id = `${p.negocioId ?? 'sin-negocio'}:${p.personaId}`;
    const json = datos as unknown as Prisma.InputJsonValue;
    await this.db.registro.upsert({
      where: { corredoraId_coleccion_id: { corredoraId: u.corredoraId, coleccion: COLECCION, id } },
      create: { corredoraId: u.corredoraId, coleccion: COLECCION, id, datos: json, creadoPorId: u.sub },
      update: { datos: json, eliminadoEn: null, version: { increment: 1 } },
    });
    return { plantilla: true as const };
  }

  /**
   * Mensajes nuevos de una conversación: si la persona tiene un documento pendiente, su respuesta abre la ventana de
   * 24 h y se le manda el PDF. Devuelve los mensajes que siguen su camino; ante cualquier error, todos sin tocar.
   */
  async interceptar(wa: Wechatia, corredoraId: string, cv: Conversacion, nuevos: MensajeWa[]): Promise<MensajeWa[]> {
    try {
      const t = telNorm(cv.telefono);
      if (!t || !cv.contactId) return nuevos;
      const filas = await this.db.registro.findMany({
        where: {
          corredoraId,
          coleccion: COLECCION,
          eliminadoEn: null,
          datos: { path: ['a'], equals: t },
        },
        orderBy: { actualizadoEn: 'desc' },
        take: 10,
      });
      const pendientes = filas.filter((f) => {
        const d = f.datos as unknown as RevisionPendiente;
        return d?.estado === 'enviada' && Date.now() - new Date(d.enviadaEn).getTime() < VIGENCIA_MS;
      });
      if (!pendientes.length) return nuevos;
      const primera = Math.min(...pendientes.map((f) => new Date((f.datos as unknown as RevisionPendiente).enviadaEn).getTime()));
      const m = nuevos.find((x) => x.direccion === 'entrante' && new Date(x.fecha).getTime() >= primera - 60_000);
      if (!m) return nuevos;
      for (const f of pendientes) await this.entregar(wa, corredoraId, cv, f, m.texto);
      // el toque del botón no es una conversación: no sigue a los asistentes; un texto propio sí (puede ser una pregunta)
      return esBoton(m.texto) ? nuevos.filter((x) => x !== m) : nuevos;
    } catch (err) {
      this.log.warn(`documento a revisión: ${(err as Error).message}`);
      return nuevos;
    }
  }

  private async entregar(
    wa: Wechatia,
    corredoraId: string,
    cv: Conversacion,
    f: { coleccion: string; id: string; datos: Prisma.JsonValue },
    respuesta: string,
  ) {
    const d = f.datos as unknown as RevisionPendiente;
    let fin: RevisionPendiente;
    try {
      if ((await this.r2.tamano(d.clave)) == null) throw new Error('el archivo ya no está');
      const url = await this.r2.urlDescarga(d.clave, d.archivo);
      const r = await wa.enviarAContacto(cv.contactId!, d.texto, 'whatsapp', [url]);
      await this.enviados.registrar(corredoraId, cv.telefono, { messageId: r.messageId, texto: d.texto });
      fin = { ...d, estado: 'entregada', entregadaEn: new Date().toISOString(), respuesta: respuesta.trim().slice(0, 200) };
    } catch (e) {
      fin = { ...d, estado: 'fallida', error: (e as Error).message.slice(0, 300), respuesta: respuesta.trim().slice(0, 200) };
    }
    await this.db.registro.update({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: f.coleccion, id: f.id } },
      data: { datos: fin as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
    });
    const dijo = esBoton(respuesta) ? '' : ` Respondió: "${fin.respuesta}".`;
    const texto =
      fin.estado === 'entregada'
        ? `${d.nombre} respondió y se le envió ${d.documento} por WhatsApp.${dijo}`
        : `${d.nombre} respondió, pero no se le pudo enviar ${d.documento} (${fin.error}). Envíaselo de nuevo desde Asset.${dijo}`;
    await this.avisos
      .crear({
        corredoraId,
        usuarioId: d.usuarioId,
        tipo: 'documento_revision',
        texto,
        datos: { negocioId: d.negocioId, personaId: d.personaId, estado: fin.estado },
      })
      .catch(() => null);
    if (d.negocioId && fin.estado === 'entregada')
      await this.actividad
        .registrar([
          {
            corredoraId,
            entidadTipo: 'negocio' as const,
            entidadId: d.negocioId,
            ref2: d.propiedadId ?? undefined,
            texto: `${d.documento[0].toUpperCase()}${d.documento.slice(1)} entregado por WhatsApp a ${d.nombre} (respondió a la plantilla)`,
            usuarioId: d.usuarioId,
          },
        ])
        .catch(() => null);
  }
}

/** el texto del botón de respuesta rápida de la plantilla */
function esBoton(texto: string) {
  return /^\s*enviar (el )?documento\s*$/i.test(texto || '');
}
