// wechatia (plataforma tipo GoHighLevel / LeadConnector) desde el servidor: WhatsApp de la empresa con la clave de la
// corredora. Es lo mismo que hace la app en desktop/src/reservas.js (contacto por celular, ventana de 24 h, envío,
// revisión de entrega y plantillas aprobadas por Meta), pero con la clave guardada cifrada en la tabla conexiones
// (proveedor «wechatia», tipo «clave», de la corredora). La conecta el administrador desde la app (PUT /v1/whatsapp/conexion).
//  · GET    /whatsapp/conexion   estado (sin la clave);
//  · PUT    /whatsapp/conexion   { token, locationId }: se prueba contra wechatia antes de guardarla. El administrador
//                                 siempre; otro usuario solo si la corredora aún no tiene (la sube su app la primera vez);
//  · DELETE /whatsapp/conexion   (administrador) la quita.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
   las respuestas de wechatia son JSON sin tipo (Json) y se leen campo a campo, con respaldo si falta alguno */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Put,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { CifradoService } from '../conexiones/cifrado';
import type { Env } from '../config/env';

const V2 = 'https://services.leadconnectorhq.com';
const PROVEEDOR = 'wechatia';
const DUENO = 'corredora';

export class WechatiaError extends Error {
  constructor(
    mensaje: string,
    readonly codigo?: 'CLAVE' | 'SIN_CLAVE' | 'FUERA_24H' | 'NO_ENTREGADO',
  ) {
    super(mensaje);
  }
}

export interface CredWechatia {
  token: string;
  locationId: string;
  /** solo fuera de producción: otra dirección para la API de wechatia (las pruebas levantan una falsa) */
  base?: string;
}

interface Opciones {
  body?: unknown;
  version?: string;
  permiso?: string;
  raw?: boolean;
}
type Json = Record<string, any>;

const conexionEsquema = z.object({
  token: z.string().trim().min(20, 'Esa clave es muy corta. Copia la clave completa de la integración.').max(4000),
  locationId: z.string().trim().min(4).max(100),
  base: z.url().optional(),
});

/** Cliente de wechatia para una corredora (una instancia por envío o ronda). */
export class Wechatia {
  private campos: Record<string, string> | null = null;
  constructor(
    private readonly c: CredWechatia,
    private readonly espera = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private get base() {
    return this.c.base || V2;
  }

  async api(method: string, path: string, o: Opciones = {}): Promise<Json> {
    let r: Response;
    try {
      r = await fetch(this.base + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.c.token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Version: o.version ?? '2021-04-15',
        },
        body: o.body ? JSON.stringify(o.body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new WechatiaError('No se pudo conectar con wechatia.');
    }
    const j = (await r.json().catch(() => ({}))) as Json;
    if (r.status === 401 || r.status === 403)
      throw new WechatiaError(
        o.permiso ||
          'wechatia rechazó la clave para conversaciones. Agrega a la integración privada los permisos de conversaciones y mensajes (ver y enviar).',
        'CLAVE',
      );
    if (!r.ok) {
      if (o.raw) return { _status: r.status, ...j };
      throw new WechatiaError(
        `wechatia: ${Array.isArray(j.message) ? j.message.join(' ') : j.message || j.msg || 'HTTP ' + r.status}`,
      );
    }
    return j;
  }

  /** prueba la clave leyendo una conversación */
  probar = () => this.api('GET', `/conversations/search?locationId=${encodeURIComponent(this.c.locationId)}&limit=1`);

  async contacto(telefono: string, nombre: string) {
    let d = String(telefono || '').replace(/\D/g, '');
    if (d.length === 8) d = '569' + d;
    else if (d.length === 9) d = '56' + d;
    if (d.length < 10) throw new WechatiaError('El celular no es válido.');
    const e164 = '+' + d;
    const PERM =
      'La clave de wechatia no tiene permiso para ver o crear contactos. Agrega «Ver contactos» y «Editar contactos» a la integración privada.';
    const loc = this.c.locationId;
    const dup = await this.api(
      'GET',
      `/contacts/search/duplicate?locationId=${encodeURIComponent(loc)}&number=${encodeURIComponent(e164)}`,
      { version: '2021-07-28', permiso: PERM },
    );
    let contactId: string | null = dup.contact?.id || null;
    if (!contactId) {
      const [first, ...rest] = String(nombre || '')
        .trim()
        .split(/\s+/);
      const c = await this.api('POST', '/contacts/', {
        version: '2021-07-28',
        permiso: PERM,
        raw: true,
        body: {
          locationId: loc,
          phone: e164,
          ...(first ? { firstName: first, lastName: rest.join(' ') || undefined, name: String(nombre).trim() } : {}),
          source: 'PortalFirma Asset',
        },
      });
      contactId = c.contact?.id || c.meta?.contactId || c.contactId || null;
      if (!contactId)
        throw new WechatiaError(`wechatia no pudo crear el contacto: ${c.message || 'error ' + (c._status || '')}`);
    }
    return contactId;
  }

  /** ¿la persona escribió en las últimas 24 h? null = no se pudo saber */
  async ventana24(contactId: string): Promise<boolean | null> {
    try {
      const j = await this.api(
        'GET',
        `/conversations/search?locationId=${encodeURIComponent(this.c.locationId)}&contactId=${encodeURIComponent(contactId)}`,
      );
      const c = ((j.conversations as Json[]) || []).find((x) => x.contactId === contactId);
      if (!c) return false;
      const ms: Json[] = (await this.api('GET', `/conversations/${c.id}/messages?limit=30`)).messages?.messages || [];
      const lim = Date.now() - 24 * 36e5 + 5 * 6e4; // 5 min de margen
      return ms.some((m) => m.direction === 'inbound' && new Date(m.dateAdded).getTime() > lim);
    } catch {
      return null;
    }
  }

  async estadoMensaje(messageId: string): Promise<{ estado: string; detalle: string } | null> {
    try {
      const m = (await this.api('GET', `/conversations/messages/${encodeURIComponent(messageId)}`)).message || {};
      return {
        estado: String(m.status || '').toLowerCase(),
        detalle: String(m.meta?.error || m.error || m.errorMessage || m.meta?.errorMessage || ''),
      };
    } catch {
      return null;
    }
  }

  /**
   * Envía un texto libre. `entrante24` dice si Asset tiene registrado que la persona escribió en 24 h (cuando wechatia
   * no lo puede confirmar). Lanza FUERA_24H si WhatsApp no lo dejaría pasar.
   */
  async enviar(o: { telefono: string; nombre: string; texto: string; entrante24?: () => Promise<boolean> }) {
    const contactId = await this.contacto(o.telefono, o.nombre);
    let v24 = await this.ventana24(contactId);
    if (v24 === null) v24 = o.entrante24 ? await o.entrante24().catch(() => false) : false;
    if (!v24)
      throw new WechatiaError(
        'Esa persona no le ha escrito al número de la empresa en las últimas 24 h: WhatsApp solo deja enviar una plantilla aprobada por Meta.',
        'FUERA_24H',
      );
    const env = await this.api('POST', '/conversations/messages', {
      body: { type: 'WhatsApp', contactId, message: o.texto },
      permiso:
        'La clave de wechatia no tiene permiso para enviar mensajes. Agrega «Editar mensajes de conversaciones» a la integración privada.',
    });
    const messageId: string | null = env.messageId || env.id || null;
    let estado = 'enviado';
    let detalle = '';
    if (messageId) {
      // Meta puede rechazarlo unos segundos después: se revisa hasta que quede entregado o fallido
      for (let i = 0; i < 4; i++) {
        await this.espera(4000);
        const m = await this.estadoMensaje(messageId);
        if (!m) continue;
        if (['failed', 'undelivered', 'error'].includes(m.estado)) {
          estado = 'fallido';
          detalle = m.detalle;
          break;
        }
        if (m.estado) estado = m.estado;
        if (['delivered', 'read'].includes(m.estado)) break;
      }
    }
    if (estado === 'fallido') {
      const fuera = /24|window|session|template|plantilla|re-engagement|131047|470/i.test(detalle) || !detalle;
      throw new WechatiaError(
        fuera
          ? 'WhatsApp no lo entregó: la persona no ha escrito en las últimas 24 h y solo se puede con una plantilla aprobada.'
          : `WhatsApp no entregó el mensaje: ${detalle}`,
        fuera ? 'FUERA_24H' : 'NO_ENTREGADO',
      );
    }
    return { contactId, messageId, estado };
  }

  /**
   * Plantilla aprobada por Meta: se llenan los campos «asset_*» del contacto y se le pone la etiqueta; un flujo de
   * wechatia («etiqueta añadida» → enviar plantilla → quitar etiqueta) la envía.
   */
  async enviarPlantilla(o: {
    telefono: string;
    nombre: string;
    etiqueta: string;
    campos: Record<string, string | null | undefined>;
  }) {
    const contactId = await this.contacto(o.telefono, o.nombre);
    if (!this.campos) {
      try {
        const j = await this.api(
          'GET',
          `/locations/${encodeURIComponent(this.c.locationId)}/customFields?model=contact`,
          { version: '2021-07-28' },
        );
        this.campos = Object.fromEntries(
          ((j.customFields as Json[]) || []).map((f) => [String(f.fieldKey || '').replace(/^contact\./, ''), f.id]),
        );
      } catch {
        this.campos = {}; // sin permiso para leer campos: se usa la clave del campo
      }
    }
    const ids = this.campos;
    const customFields = Object.entries(o.campos)
      .filter(([, v]) => v != null && String(v).trim())
      .map(([k, v]) =>
        ids['asset_' + k]
          ? { id: ids['asset_' + k], field_value: String(v).trim() }
          : { key: 'asset_' + k, field_value: String(v).trim() },
      );
    const PERM =
      'La clave de wechatia no tiene permiso para editar contactos. Agrega «Editar contactos» a la integración privada.';
    await this.api('PUT', `/contacts/${contactId}`, { version: '2021-07-28', permiso: PERM, body: { customFields } });
    // si la etiqueta quedó puesta de un envío anterior, se quita primero para que el flujo vuelva a dispararse
    await this.api('DELETE', `/contacts/${contactId}/tags`, {
      version: '2021-07-28',
      body: { tags: [o.etiqueta] },
    }).catch(() => null);
    await this.api('POST', `/contacts/${contactId}/tags`, {
      version: '2021-07-28',
      permiso: PERM,
      body: { tags: [o.etiqueta] },
    });
    return { contactId };
  }
}

@Injectable()
export class WechatiaService {
  private readonly produccion: boolean;
  constructor(
    private readonly db: PrismaService,
    private readonly cifrado: CifradoService,
    config: ConfigService<Env, true>,
  ) {
    this.produccion = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  private donde = (corredoraId: string) => ({
    corredoraId_proveedor_dueno: { corredoraId, proveedor: PROVEEDOR, dueno: DUENO },
  });

  /** la clave de la corredora, o null si no la tiene conectada */
  async credenciales(corredoraId: string): Promise<CredWechatia | null> {
    const c = await this.db.conexion.findUnique({ where: this.donde(corredoraId) });
    if (!c || c.estado !== 'activa' || !c.accesoCif) return null;
    const d = (c.datos ?? {}) as { locationId?: string; base?: string };
    if (!d.locationId) return null;
    return {
      token: this.cifrado.descifrar(c.accesoCif),
      locationId: d.locationId,
      ...(d.base && !this.produccion ? { base: d.base } : {}),
    };
  }

  async cliente(corredoraId: string) {
    const c = await this.credenciales(corredoraId);
    return c ? new Wechatia(c) : null;
  }

  /** la clave dejó de servir: queda marcada para que la app pida conectarla de nuevo */
  async marcarRechazada(corredoraId: string, error: string) {
    await this.db.conexion.updateMany({
      where: { corredoraId, proveedor: PROVEEDOR, dueno: DUENO },
      data: { estado: 'error', ultimoError: error.slice(0, 500) },
    });
  }

  async estado(u: UsuarioToken) {
    const c = await this.db.conexion.findUnique({ where: this.donde(u.corredoraId) });
    return {
      conectado: !!c && c.estado === 'activa',
      estado: c?.estado ?? null,
      locationId: ((c?.datos ?? {}) as { locationId?: string }).locationId ?? null,
      conectadoEn: c?.conectadoEn ?? null,
      error: c?.ultimoError ?? null,
      puedeConectar: u.rol === 'ADMIN' || !c,
    };
  }

  async conectar(u: UsuarioToken, b: z.infer<typeof conexionEsquema>) {
    const ya = await this.db.conexion.findUnique({ where: this.donde(u.corredoraId) });
    if (ya && u.rol !== 'ADMIN')
      throw new ForbiddenException('El WhatsApp de la empresa ya está conectado; cambiarlo es del administrador.');
    if (b.base && this.produccion) throw new BadRequestException('base no se acepta en producción');
    try {
      await new Wechatia({ token: b.token, locationId: b.locationId, base: b.base }).probar();
    } catch (e) {
      throw new BadRequestException(`wechatia no aceptó la clave: ${(e as Error).message}`);
    }
    const datos = {
      tipo: 'clave',
      estado: 'activa',
      accesoCif: this.cifrado.cifrar(b.token),
      renovarCif: null,
      expiraEn: null,
      cuentaId: b.locationId,
      ultimoError: null,
      datos: { locationId: b.locationId, ...(b.base ? { base: b.base } : {}) },
      conectadoPor: u.sub,
      conectadoEn: new Date(),
    };
    await this.db.conexion.upsert({
      where: this.donde(u.corredoraId),
      create: { corredoraId: u.corredoraId, usuarioId: null, proveedor: PROVEEDOR, dueno: DUENO, ...datos },
      update: datos,
    });
    return this.estado(u);
  }

  async desconectar(u: UsuarioToken) {
    if (u.rol !== 'ADMIN') throw new ForbiddenException('Desconectar el WhatsApp de la empresa es del administrador.');
    await this.db.conexion.deleteMany({ where: { corredoraId: u.corredoraId, proveedor: PROVEEDOR, dueno: DUENO } });
    return { ok: true };
  }
}

@Controller('whatsapp/conexion')
export class WechatiaController {
  constructor(private readonly s: WechatiaService) {}

  @Get()
  estado(@UsuarioActual() u: UsuarioToken) {
    return this.s.estado(u);
  }

  @Put()
  conectar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(conexionEsquema)) b: z.infer<typeof conexionEsquema>) {
    return this.s.conectar(u, b);
  }

  @Delete()
  desconectar(@UsuarioActual() u: UsuarioToken) {
    return this.s.desconectar(u);
  }
}
