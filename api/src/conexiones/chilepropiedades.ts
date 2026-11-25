// Chilepropiedades: los contactos de los avisos (API de lectura, respuesta de Chilepropiedades del 2026-11-25).
//  · Base https://chilepropiedades.cl/api-integraciones; GET /mensajes con «Authorization: <TOKEN>» (sin Bearer);
//    ?fromId=<último id procesado> trae solo lo nuevo (se escribe «fromId», aunque la guía diga fromID).
//  · Límite: 4 consultas por segundo por IP (compartido con el resto del sitio), 10 en cola; si no, 429 (puede venir en
//    HTML). 401 (token faltante o inválido) y 403 (sin acceso) vienen en texto plano. Sin mensajes: 200 con [].
//  · El TOKEN es de la integración y se guarda cifrado en conexiones (proveedor «chilepropiedades», de la corredora);
//    lo pega el administrador de la corredora en Integraciones (o soporte en asset-admin). Nunca se devuelve.
//  · Cada CHILEPROPIEDADES_CADA_SEG (5 min) se leen los mensajes nuevos de cada corredora con token y van a leads_portal de
//    su propiedad, cruzando externalID (la referencia del feed: <código>-V/-A) con el código de la propiedad de ESA
//    corredora. Cada mensaje entra una sola vez (id «cp-<id>»); la app crea la persona al verlo (delServidor), como KONVER.
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Logger,
  Put,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { CifradoService } from './cifrado';

const BASE = 'https://chilepropiedades.cl/api-integraciones';
const PROVEEDOR = 'chilepropiedades';
const DUENO = 'corredora';

interface MensajeCP {
  id: number;
  body?: string;
  emailFrom?: string;
  nameFrom?: string;
  phoneFrom?: string;
  creationDate?: number | string;
  externalID?: string;
  externalId?: string;
}
interface DatosConexion {
  ultimoMensaje?: number;
  ultimaSync?: string;
  leads?: number;
}

const texto = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

@Injectable()
export class ChilepropiedadesService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Chilepropiedades');
  private readonly cadaMs: number;
  private reloj: NodeJS.Timeout | null = null;
  private corriendo = false;

  constructor(
    private readonly db: PrismaService,
    private readonly cifrado: CifradoService,
    config: ConfigService<Env, true>,
  ) {
    this.cadaMs = config.get('CHILEPROPIEDADES_CADA_SEG', { infer: true }) * 1000;
  }

  onModuleInit() {
    if (this.cadaMs <= 0) return;
    this.reloj = setInterval(() => void this.ronda(), this.cadaMs);
    this.reloj.unref?.();
  }
  onModuleDestroy() {
    if (this.reloj) clearInterval(this.reloj);
  }

  private donde = (corredoraId: string) => ({
    corredoraId_proveedor_dueno: { corredoraId, proveedor: PROVEEDOR, dueno: DUENO },
  });

  /** GET a la API de Chilepropiedades → JSON, o un error legible (401/403 en texto plano, 429 en HTML) */
  private async pedir<T>(
    token: string,
    ruta: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const u = new URL(BASE + ruta);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, String(v));
    let r: Response;
    try {
      r = await fetch(u, {
        headers: { Authorization: token, accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new Error(`Chilepropiedades no respondió: ${(e as Error).message}`);
    }
    const cuerpo = await r.text();
    if (r.status === 401) throw new Error('Chilepropiedades rechazó el token (401).');
    if (r.status === 403) throw new Error('El token no tiene acceso a esta información (403).');
    if (r.status === 429)
      throw new Error('Demasiadas consultas a Chilepropiedades (429); se reintenta en la próxima vuelta.');
    if (!r.ok)
      throw new Error(
        `Chilepropiedades respondió ${r.status}: ${cuerpo
          .replace(/<[^>]+>/g, ' ')
          .trim()
          .slice(0, 200)}`,
      );
    try {
      return JSON.parse(cuerpo || '[]') as T;
    } catch {
      throw new Error('Chilepropiedades respondió algo que no es JSON.');
    }
  }

  // ------------------------------------------------------------------ conexión (soporte)
  async estado(corredoraId: string) {
    const c = await this.db.conexion.findUnique({ where: this.donde(corredoraId) });
    const d = (c?.datos ?? {}) as DatosConexion;
    return {
      conectado: c?.estado === 'activa' && !!c.accesoCif,
      estado: c?.estado ?? null,
      conectadoEn: c?.conectadoEn?.toISOString() ?? null,
      ultimaSync: d.ultimaSync ?? null,
      ultimoMensaje: d.ultimoMensaje ?? null,
      leads: d.leads ?? 0,
      error: c?.ultimoError ?? null,
    };
  }

  /** guarda el token (se prueba antes con una consulta que no trae nada) */
  async guardarToken(corredoraId: string, token: string, quien: string) {
    const t = token.trim();
    if (!/^[A-Za-z0-9-]{16,200}$/.test(t)) throw new BadRequestException('Ese no parece un token de Chilepropiedades.');
    try {
      await this.pedir<unknown[]>(t, '/mensajes', { fromId: 2_000_000_000 });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const ya = await this.db.conexion.findUnique({ where: this.donde(corredoraId) });
    const datos = {
      tipo: 'clave',
      estado: 'activa',
      accesoCif: this.cifrado.cifrar(t),
      renovarCif: null,
      expiraEn: null,
      cuentaId: null,
      cuentaNombre: null,
      ultimoError: null,
      // si se cambia el token se conserva hasta dónde se leyó
      datos: { ...((ya?.datos ?? {}) as DatosConexion) },
      conectadoPor: quien,
      conectadoEn: new Date(),
    };
    await this.db.conexion.upsert({
      where: this.donde(corredoraId),
      create: { corredoraId, usuarioId: null, proveedor: PROVEEDOR, dueno: DUENO, ...datos },
      update: datos,
    });
    void this.revisarCorredora(corredoraId).catch(() => undefined);
    return this.estado(corredoraId);
  }

  async quitarToken(corredoraId: string) {
    await this.db.conexion.deleteMany({ where: { corredoraId, proveedor: PROVEEDOR, dueno: DUENO } });
    return this.estado(corredoraId);
  }

  // ------------------------------------------------------------------ lectura de contactos
  async ronda() {
    if (this.corriendo) return;
    this.corriendo = true;
    try {
      const cs = await this.db.conexion.findMany({
        where: { proveedor: PROVEEDOR, dueno: DUENO, estado: 'activa' },
        select: { corredoraId: true },
      });
      for (const c of cs) {
        await this.revisarCorredora(c.corredoraId).catch((e: Error) =>
          this.log.warn(`corredora ${c.corredoraId}: ${e.message}`),
        );
        await new Promise((r) => setTimeout(r, 500)); // 4 por segundo por IP, compartido con el resto del sitio
      }
    } finally {
      this.corriendo = false;
    }
  }

  /** los mensajes nuevos de una corredora → leads de sus propiedades; devuelve cuántos entraron */
  async revisarCorredora(corredoraId: string) {
    const c = await this.db.conexion.findUnique({ where: this.donde(corredoraId) });
    if (!c || c.estado !== 'activa' || !c.accesoCif) return { nuevos: 0, leidos: 0 };
    const d = (c.datos ?? {}) as DatosConexion;
    let msgs: MensajeCP[];
    try {
      msgs = await this.pedir<MensajeCP[]>(this.cifrado.descifrar(c.accesoCif), '/mensajes', {
        fromId: d.ultimoMensaje || undefined,
      });
    } catch (e) {
      const m = (e as Error).message;
      // un token rechazado deja la conexión en error (se ve en asset-admin); lo demás se reintenta solo
      await this.db.conexion.update({
        where: { id: c.id },
        data: { ultimoError: m.slice(0, 500), ...(/401|403/.test(m) ? { estado: 'error' } : {}) },
      });
      throw e;
    }
    let max = d.ultimoMensaje || 0;
    let nuevos = 0;
    for (const m of (Array.isArray(msgs) ? msgs : []).sort((a, b) => Number(a.id) - Number(b.id))) {
      const id = Number(m.id) || 0;
      if (!id || id <= (d.ultimoMensaje || 0)) continue;
      if (await this.guardarLead(corredoraId, m)) nuevos++;
      max = Math.max(max, id);
    }
    await this.db.conexion.update({
      where: { id: c.id },
      data: {
        ultimoError: null,
        datos: {
          ...d,
          ultimoMensaje: max || undefined,
          ultimaSync: new Date().toISOString(),
          leads: (d.leads ?? 0) + nuevos,
        },
      },
    });
    return { nuevos, leidos: Array.isArray(msgs) ? msgs.length : 0 };
  }

  /** el mensaje va a leads_portal de su propiedad (por la referencia <código>-V/-A del feed); una sola vez por id */
  private async guardarLead(corredoraId: string, m: MensajeCP) {
    const ref = texto(m.externalID ?? m.externalId);
    const x = ref.match(/^(.*)-(V|A)$/);
    const cod = x ? x[1] : ref;
    if (!cod) return false;
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      select id from app.propiedades
      where corredora_id = ${corredoraId}::uuid and eliminado_en is null
        and upper(regexp_replace(codigo, '[^A-Za-z0-9._-]+', '-', 'g')) = upper(${cod})
      limit 1`;
    const f = filas[0];
    if (!f) return false;
    const op = x ? (x[2] === 'V' ? 'venta' : 'arriendo') : 'venta';
    const id = 'cp-' + m.id;
    const fecha = m.creationDate
      ? new Date(typeof m.creationDate === 'number' ? m.creationDate : Date.parse(m.creationDate))
      : null;
    const lead = {
      id,
      portal: 'Chilepropiedades',
      canal: 'email',
      canalTxt: 'mensaje',
      nombre: texto(m.nameFrom),
      email: texto(m.emailFrom),
      telefono: texto(m.phoneFrom),
      mensaje: texto(m.body),
      fecha: fecha && !Number.isNaN(fecha.getTime()) ? fecha.toISOString() : new Date().toISOString(),
      referencia: ref,
      op,
      visto: false,
      recibido: new Date().toISOString(),
      delServidor: true,
    };
    const n = await this.db.$executeRaw`
      update app.propiedades set leads_portal = jsonb_build_array(${JSON.stringify(lead)}::jsonb) || leads_portal, version = version + 1, actualizado_en = now()
      where id = ${f.id}::uuid and not (leads_portal @> jsonb_build_array(jsonb_build_object('id', ${id}::text)))`;
    return n > 0;
  }
}

const tokenEsquema = z.object({ token: z.string().trim().min(1).max(200) });

/** /v1/chilepropiedades/conexion — el token de la cuenta de Chilepropiedades de la corredora (lo pega el administrador) */
@Controller('chilepropiedades')
export class ChilepropiedadesController {
  constructor(private readonly s: ChilepropiedadesService) {}

  @Get('conexion')
  async estado(@UsuarioActual() u: UsuarioToken) {
    return { ...(await this.s.estado(u.corredoraId)), admin: u.rol === 'ADMIN' };
  }

  @Put('conexion')
  async conectar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(tokenEsquema)) b: z.infer<typeof tokenEsquema>) {
    if (u.rol !== 'ADMIN') throw new ForbiddenException('El token lo pega el administrador de la corredora.');
    return { ...(await this.s.guardarToken(u.corredoraId, b.token, u.sub)), admin: true };
  }

  @Delete('conexion')
  async desconectar(@UsuarioActual() u: UsuarioToken) {
    if (u.rol !== 'ADMIN') throw new ForbiddenException('El token lo quita el administrador de la corredora.');
    return { ...(await this.s.quitarToken(u.corredoraId)), admin: true };
  }
}
