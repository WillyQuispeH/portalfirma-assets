// Lo que Asset hace en Google con las conexiones de google.oauth.ts (todo desde el servidor; la app de escritorio no guarda tokens):
//  · CALENDARIO (Asset → Google): cada evento de la agenda de un corredor se crea, se actualiza o se borra en SU Google Calendar
//    (el calendario principal de la cuenta que conectó). El id del evento de Google queda en el evento (datos.googleEventId).
//    Una visita cancelada o un evento eliminado se borran de Google. Las visitas de Asset no se mueven por lo que pase en Google.
//  · DRIVE: una copia de cada documento enviado a firmar se sube a la carpeta «Portalfirma Asset / Propiedades / <código · título> / <tipo>» del Drive general
//    de la empresa (si el administrador lo conectó) y del Drive del usuario que lo envió (si lo conectó). Con el permiso drive.file la
//    app solo ve lo que ella misma crea.
// Todo es «lo mejor posible»: si el usuario no conectó Google o Google falla, el evento o el documento se guardan igual (solo se anota en el log).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Evento } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { ConexionesService, type DuenoConexion } from './conexiones';

const API = 'https://www.googleapis.com';
const ZONA = 'America/Santiago';
import { RAIZ_DRIVE, rutaDrive, type TTipoDriveDoc } from '../documentos/drive';

const CARPETA_RAIZ = RAIZ_DRIVE;
const RUTA_DOCS = ['Documentos enviados a firmar'];
const DUR_MIN = 45;

type TProv = 'google' | 'google_corredora';
/** de qué es el documento, para saber en qué carpetas va */
export interface IRefDrive { tipo: TTipoDriveDoc | null; propiedadId?: string | null; negocioId?: string | null }
interface IRespuesta { status: number; json: Record<string, unknown> | null }

const p2 = (n: number) => String(n).padStart(2, '0');
/** suma minutos a «AAAA-MM-DD» + «HH:MM» (sin zona: la hora de Chile va aparte) y devuelve «AAAA-MM-DDTHH:MM:00» */
function sumar(dia: string, hora: string, min: number): string {
  const d = new Date(`${dia}T${hora}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + min);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00`;
}
const sumarDia = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
};
const TIPOS: Record<string, string> = { visita: 'Visita', reunion: 'Reunión', firma: 'Firma', llamada: 'Llamada', tarea: 'Tarea', otro: 'Evento' };

@Injectable()
export class GoogleService {
  private readonly log = new Logger('Google');
  private readonly api: string;

  constructor(
    private readonly db: PrismaService,
    private readonly conexiones: ConexionesService,
    config: ConfigService<Env, true>,
  ) {
    const produccion = config.get('NODE_ENV', { infer: true }) === 'production';
    this.api = ((!produccion && config.get('GOOGLE_API_URL', { infer: true })) || API).replace(/\/+$/, '');
  }

  /** ¿ese dueño tiene Google conectado y activo? (sin error: solo sí o no) */
  private async hay(prov: TProv, d: DuenoConexion): Promise<boolean> {
    if (!this.conexiones.hay(prov)) return false;
    try {
      await this.conexiones.acceso(prov, d);
      return true;
    } catch {
      return false;
    }
  }

  /** una llamada a Google con la sesión de ese dueño; si el token fue rechazado (401), lo renueva y reintenta una vez */
  private async pedir(
    prov: TProv,
    d: DuenoConexion,
    metodo: string,
    ruta: string,
    cuerpo?: Record<string, unknown> | { raw: Buffer; tipo: string },
  ): Promise<IRespuesta> {
    let token = await this.conexiones.acceso(prov, d);
    for (let intento = 0; intento < 2; intento++) {
      const raw = cuerpo && 'raw' in cuerpo;
      const r = await fetch(`${this.api}${ruta}`, {
        method: metodo,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(cuerpo ? { 'content-type': raw ? (cuerpo as { tipo: string }).tipo : 'application/json' } : {}),
        },
        body: cuerpo ? (raw ? new Uint8Array((cuerpo as { raw: Buffer }).raw) : JSON.stringify(cuerpo)) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      if (r.status === 401 && intento === 0) {
        token = await this.conexiones.acceso(prov, d, token);
        continue;
      }
      return { status: r.status, json: (await r.json().catch(() => null)) as Record<string, unknown> | null };
    }
    return { status: 401, json: null };
  }

  // ---------------------------------------------------------------- calendario
  /** lo que lleva el evento en Google: título, lugar, horario y los datos de la propiedad y las personas */
  private async cuerpoEvento(e: Evento): Promise<Record<string, unknown>> {
    const datos = (e.datos ?? {}) as { titulo?: string; lugar?: string; notas?: string; duracion?: number | string };
    const [prop, personas] = await Promise.all([
      e.propiedadId
        ? this.db.propiedad.findUnique({ where: { id: e.propiedadId }, select: { codigo: true, titulo: true } })
        : null,
      e.personaIds.length
        ? this.db.persona.findMany({
            where: { id: { in: e.personaIds.filter((x) => /^[0-9a-f-]{36}$/i.test(x)) }, corredoraId: e.corredoraId },
            select: { nombre: true, telefono: true },
          })
        : [],
    ]);
    const dia = e.fecha.toISOString().slice(0, 10);
    const resumen = datos.titulo || [TIPOS[e.tipo] ?? 'Evento', prop?.codigo].filter(Boolean).join(' · ');
    const descripcion = [
      datos.notas,
      prop ? `Propiedad: ${prop.codigo} ${prop.titulo}` : '',
      ...personas.map((p) => `Con: ${p.nombre}${p.telefono ? ` (${p.telefono})` : ''}`),
      'Agendado desde Asset.',
    ]
      .filter(Boolean)
      .join('\n');
    const dur = Number(datos.duracion) > 0 ? Number(datos.duracion) : DUR_MIN;
    return {
      summary: resumen,
      ...(datos.lugar ? { location: datos.lugar } : {}),
      description: descripcion,
      ...(e.hora
        ? {
            start: { dateTime: `${dia}T${e.hora}:00`, timeZone: ZONA },
            end: { dateTime: sumar(dia, e.hora, dur), timeZone: ZONA },
          }
        : { start: { date: dia }, end: { date: sumarDia(dia, 1) } }),
    };
  }

  /** guarda (o quita) el id del evento de Google en el evento; no cambia su versión (la app lo recibe en su próxima sincronización) */
  private async anotarId(e: Evento, id: string | null) {
    const datos = { ...((e.datos ?? {}) as Record<string, unknown>) };
    if (id) datos.googleEventId = id;
    else delete datos.googleEventId;
    await this.db.evento.update({ where: { id: e.id }, data: { datos: datos as never } });
  }

  /**
   * Refleja el evento en el Google Calendar de su corredor: lo crea, lo actualiza o, si está cancelado o eliminado, lo borra.
   * Nunca lanza: lo que falle se anota en el log y el evento de Asset queda como está.
   */
  async sincronizarEvento(e: Evento): Promise<void> {
    try {
      if (!e.corredorId) return;
      const d: DuenoConexion = { corredoraId: e.corredoraId, usuarioId: e.corredorId };
      if (!(await this.hay('google', d))) return;
      const gid = ((e.datos ?? {}) as { googleEventId?: string }).googleEventId;
      const base = '/calendar/v3/calendars/primary/events';
      if (e.estado === 'cancelado' || e.eliminadoEn) {
        if (gid) {
          const r = await this.pedir('google', d, 'DELETE', `${base}/${encodeURIComponent(gid)}`);
          if (r.status >= 400 && r.status !== 404 && r.status !== 410) throw new Error(`Google respondió ${r.status} al borrar`);
          await this.anotarId(e, null);
        }
        return;
      }
      const cuerpo = await this.cuerpoEvento(e);
      if (gid) {
        const r = await this.pedir('google', d, 'PATCH', `${base}/${encodeURIComponent(gid)}`, cuerpo);
        if (r.status < 400) return;
        if (r.status !== 404 && r.status !== 410) throw new Error(`Google respondió ${r.status} al actualizar`);
        // lo borraron en Google: se vuelve a crear
      }
      const r = await this.pedir('google', d, 'POST', base, cuerpo);
      const id = r.json?.id;
      if (r.status >= 400 || typeof id !== 'string') throw new Error(`Google respondió ${r.status} al crear`);
      await this.anotarId(e, id);
    } catch (x) {
      this.log.warn(`calendario: el evento ${e.id} no se pudo reflejar en Google: ${(x as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- drive
  /** las carpetas de un documento según su propiedad y su negocio (documentos/drive.ts) */
  async rutaDe(corredoraId: string, r: IRefDrive): Promise<string[]> {
    try {
      const [prop, neg] = await Promise.all([
        r.propiedadId ? this.db.propiedad.findFirst({ where: { id: r.propiedadId, corredoraId }, select: { codigo: true, titulo: true } }) : null,
        r.negocioId ? this.db.negocio.findFirst({ where: { id: r.negocioId, corredoraId }, select: { tipo: true, clienteId: true } }) : null,
      ]);
      const cliente = neg?.clienteId ? (await this.db.persona.findUnique({ where: { id: neg.clienteId }, select: { nombre: true } }))?.nombre : null;
      return rutaDrive(r.tipo, prop, neg ? { tipo: neg.tipo, cliente } : null);
    } catch (e) {
      this.log.warn(`drive: no pude armar las carpetas: ${(e as Error).message}`);
      return RUTA_DOCS;
    }
  }

  private async carpeta(prov: TProv, d: DuenoConexion, nombre: string, padre?: string): Promise<string> {
    const q = [
      "mimeType = 'application/vnd.google-apps.folder'",
      `name = '${nombre.replace(/'/g, "\\'")}'`,
      'trashed = false',
      padre ? `'${padre}' in parents` : "'root' in parents",
    ].join(' and ');
    const r = await this.pedir(prov, d, 'GET', `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
    const hallada = (r.json?.files as { id: string }[] | undefined)?.[0]?.id;
    if (hallada) return hallada;
    const c = await this.pedir(prov, d, 'POST', '/drive/v3/files?fields=id', {
      name: nombre,
      mimeType: 'application/vnd.google-apps.folder',
      ...(padre ? { parents: [padre] } : {}),
    });
    const id = c.json?.id;
    if (c.status >= 400 || typeof id !== 'string') throw new Error(`Google respondió ${c.status} al crear la carpeta «${nombre}»`);
    return id;
  }

  private async subirA(prov: TProv, d: DuenoConexion, nombre: string, bytes: Buffer, ruta: string[]): Promise<string | null> {
    // la raíz y, dentro, cada carpeta de la ruta (se crean las que falten)
    let destino = await this.carpeta(prov, d, CARPETA_RAIZ);
    for (const nivel of ruta) destino = await this.carpeta(prov, d, nivel, destino);
    const borde = `asset${randomBytes(12).toString('hex')}`;
    const meta = JSON.stringify({ name: nombre, parents: [destino] });
    const raw = Buffer.concat([
      Buffer.from(`--${borde}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${borde}\r\nContent-Type: application/pdf\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${borde}--`),
    ]);
    const r = await this.pedir(prov, d, 'POST', '/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      raw,
      tipo: `multipart/related; boundary=${borde}`,
    });
    if (r.status >= 400) throw new Error(`Google respondió ${r.status} al subir «${nombre}»`);
    return typeof r.json?.webViewLink === 'string' ? r.json.webViewLink : null;
  }

  /**
   * Sube una copia del PDF al Drive de la empresa (si está conectado) y al del usuario (si lo conectó). Nunca lanza.
   * Devuelve dónde quedó (para avisarle al usuario), o [] si no hay nada conectado.
   */
  async subirDocumento(o: { corredoraId: string; usuarioId?: string | null; nombre: string; bytes: Buffer; ruta?: string[]; ref?: IRefDrive }): Promise<{ donde: string; enlace: string | null }[]> {
    const ruta = o.ruta?.length ? o.ruta : o.ref ? await this.rutaDe(o.corredoraId, o.ref) : RUTA_DOCS;
    const destinos: { prov: TProv; d: DuenoConexion; donde: string }[] = [
      { prov: 'google_corredora', d: { corredoraId: o.corredoraId, usuarioId: null }, donde: 'Drive de la empresa' },
      ...(o.usuarioId ? [{ prov: 'google' as const, d: { corredoraId: o.corredoraId, usuarioId: o.usuarioId }, donde: 'tu Drive' }] : []),
    ];
    const hechos: { donde: string; enlace: string | null }[] = [];
    for (const x of destinos) {
      try {
        if (!(await this.hay(x.prov, x.d))) continue;
        hechos.push({ donde: x.donde, enlace: await this.subirA(x.prov, x.d, o.nombre, o.bytes, ruta) });
      } catch (e) {
        this.log.warn(`drive (${x.donde}): no se pudo subir «${o.nombre}»: ${(e as Error).message}`);
      }
    }
    return hechos;
  }
}
