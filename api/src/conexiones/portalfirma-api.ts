// Portalfirma por su API de integración (https://developers.portalfirma.cl/api-integration): enviar a firmar, revisar el
// estado, reenviar y bajar el PDF firmado. Reemplaza al MCP en esas tareas.
// Cada corredora guarda SUS credenciales (las ingresa el administrador en Integraciones): la clave «id» del servicio, el
// customer_id (id de la empresa en Portalfirma), el correo y la contraseña del usuario de integración. Con ellas se pide un
// token (POST /auth/generateToken, dura ~2 h) que se guarda en memoria y se renueva solo.
//  · GET/PUT/DELETE /v1/portalfirma-api/conexion   estado, guardar (se prueba antes) y quitar las credenciales.
// Todas las rutas de Portalfirma llevan la cabecera `id` y `Authorization: Bearer <token>`.
import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Logger,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import type { Env } from '../config/env';
import { CifradoService } from './cifrado';

const PROVEEDOR = 'portalfirma_api';
const VIGENCIA_TOKEN_MS = 100 * 60_000; // el token dura ~2 h: se renueva a los 100 minutos

const credencialesEsquema = z.object({
  id: z.string().trim().min(4).max(200),
  customerId: z.string().trim().min(8).max(80),
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
  /** solo fuera de producción: otra dirección de la API (las pruebas levantan un Portalfirma falso) */
  apiUrl: z.url().optional(),
});
type Credenciales = z.infer<typeof credencialesEsquema>;
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangoEsquema = z.object({ desde: fecha, hasta: fecha });
const operacionesEsquema = z.object({ phone: z.string().trim().min(8).max(20), desde: fecha, hasta: fecha, limit: z.number().int().min(1).max(100).default(100) });
const reenviarEsquema = z.object({ processId: z.uuid(), signatoryId: z.uuid().optional() });

/** tipo de firma → código de la API (1 avanzada · 2 visada · 3 enrolada · 4 simple) */
export const CODIGO_TIPO_FIRMA: Record<string, number> = { avanzada: 1, visada: 2, enrolada: 3, simple: 4 };

export interface FirmanteApi {
  rut: string;
  nombre: string;
  paterno: string;
  materno: string;
  email: string;
  telefono?: string;
  /** el rol en el documento (visitante, oferente…) */
  alias: string;
  tipo: 'simple' | 'avanzada' | 'visada' | 'enrolada';
  /** dónde va su firma: página (desde 1) y esquina inferior izquierda del recuadro, en puntos del PDF (origen abajo a la izquierda) */
  posicion?: { pagina: number; x: number; y: number };
}

/** un firmante de una operación con su enlace personal de firma (signatories[].url del detalle de Portalfirma) */
export interface EnlaceFirmante {
  nombre: string;
  rol: string;
  email: string;
  telefono: string;
  url: string;
}

/** los firmantes con su enlace de firma, tal como los informa el detalle de Portalfirma */
export function enlacesDe(d: Json | null | undefined): EnlaceFirmante[] {
  return (((d as Json | null)?.signatories as Json[]) || []).map((s) => ({
    nombre: [s.name, s.paternalLastName, s.maternalLastName].filter(Boolean).join(' ') || String(s.fullName ?? ''),
    rol: String(s.alias ?? ''),
    email: String(s.email ?? ''),
    telefono: String(s.phone ?? ''),
    url: String(s.url ?? ''),
  }));
}

/** «Juan Pablo Pérez Soto» → nombre, apellido paterno y materno (la API pide los tres; si falta uno va «-») */
export function partirNombre(completo: string) {
  const t = completo.trim().split(/\s+/).filter(Boolean);
  if (t.length >= 4) return { nombre: t.slice(0, -2).join(' '), paterno: t[t.length - 2], materno: t[t.length - 1] };
  if (t.length === 3) return { nombre: t[0], paterno: t[1], materno: t[2] };
  if (t.length === 2) return { nombre: t[0], paterno: t[1], materno: '-' };
  return { nombre: t[0] || '-', paterno: '-', materno: '-' };
}

type Json = Record<string, any>;

@Injectable()
export class PortalfirmaApiService {
  private readonly log = new Logger('PortalfirmaApi');
  private readonly base: string;
  private readonly produccion: boolean;
  private readonly tokens = new Map<string, { token: string; hasta: number }>();

  constructor(
    private readonly db: PrismaService,
    private readonly cifrado: CifradoService,
    config: ConfigService<Env, true>,
  ) {
    this.base = (config.get('PORTALFIRMA_API_URL', { infer: true }) || 'https://integracion.portalfirma.cl/api').replace(/\/+$/, '');
    this.produccion = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  private donde = (corredoraId: string) => ({
    corredoraId_proveedor_dueno: { corredoraId, proveedor: PROVEEDOR, dueno: 'corredora' },
  });

  /** las credenciales guardadas de la corredora (null si no las ingresó) */
  async credenciales(corredoraId: string): Promise<(Credenciales & { conectadoEn: Date | null; base: string }) | null> {
    const c = await this.db.conexion.findUnique({ where: this.donde(corredoraId) });
    if (!c || c.estado !== 'activa' || !c.accesoCif) return null;
    try {
      const s = this.cifrado.descifrarJson<{ id: string; password: string }>(c.accesoCif);
      const d = (c.datos ?? {}) as { customerId?: string; email?: string; apiUrl?: string };
      if (!s.id || !s.password || !d.customerId || !d.email) return null;
      // fuera de producción, la conexión de prueba puede traer otra dirección (las pruebas levantan un Portalfirma falso)
      const base = !this.produccion && typeof d.apiUrl === 'string' ? d.apiUrl.replace(/\/+$/, '') : this.base;
      return { id: s.id, password: s.password, customerId: d.customerId, email: d.email, conectadoEn: c.conectadoEn, base };
    } catch {
      return null;
    }
  }

  async conectado(corredoraId: string) {
    return !!(await this.credenciales(corredoraId));
  }

  private sinConexion(mensaje = 'La corredora no tiene la API de Portalfirma conectada: el administrador debe ingresar las credenciales en Asset › Integraciones.') {
    return new ConflictException({ codigo: 'NECESITA_CONEXION', proveedor: PROVEEDOR, message: mensaje });
  }

  private async llamarCruda(metodo: 'GET' | 'POST', base: string, ruta: string, id: string, token: string | null, cuerpo?: unknown) {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: {
        accept: 'application/json',
        id,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(90_000),
    }).catch((e: Error) => {
      this.log.warn(`sin conexión con ${base}: ${e.message}`);   // el detalle técnico queda en el registro, no en pantalla
      throw new BadGatewayException('No pude conectarme con Portalfirma. Intenta de nuevo en unos minutos.');
    });
    const texto = await r.text();
    let j: Json | null = null;
    try {
      j = texto ? (JSON.parse(texto) as Json) : null;
    } catch {
      j = null;
    }
    return { status: r.status, j, texto };
  }

  /** el mensaje de error de Portalfirma, en texto */
  private motivo(j: Json | null, texto: string, status: number) {
    const e = j?.error ?? j?.message;
    const t = typeof e === 'string' ? e : e && typeof e === 'object' ? ((e as Json).message ?? JSON.stringify(e)) : '';
    return String(t || texto.slice(0, 200) || `error ${status}`);
  }

  /** genera el token con esas credenciales (sin guardar nada) */
  private async generarToken(c: Credenciales, base = this.base) {
    const r = await this.llamarCruda('POST', base, '/auth/generateToken', c.id, null, {
      customer_id: c.customerId,
      email: c.email,
      password: c.password,
    });
    // la documentación lo muestra en data.token; el servidor local lo entrega directo en `token`: se aceptan las dos formas
    const token = (r.j?.data as Json | undefined)?.token ?? r.j?.token;
    if (r.status >= 200 && r.status < 300 && typeof token === 'string' && token) return token;
    if (r.status === 401 || r.status === 400 || r.status === 403)
      throw new BadRequestException(
        'Portalfirma no aceptó las credenciales. Revisa la clave «id», el customer_id (debe ser el de la empresa de ese usuario), el correo y la contraseña.',
      );
    throw new BadGatewayException(`Portalfirma no entregó el token: ${this.motivo(r.j, r.texto, r.status)}`);
  }

  private async tokenDe(corredoraId: string, c: Credenciales & { base: string }, forzar = false) {
    const ya = this.tokens.get(corredoraId);
    if (!forzar && ya && ya.hasta > Date.now()) return ya.token;
    const token = await this.generarToken(c, c.base);
    this.tokens.set(corredoraId, { token, hasta: Date.now() + VIGENCIA_TOKEN_MS });
    return token;
  }

  /** una llamada a Portalfirma con el token de la corredora (si lo rechaza, pide otro una vez); devuelve `data` */
  async pedir<T = Json>(corredoraId: string, metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<T> {
    const c = await this.credenciales(corredoraId);
    if (!c) throw this.sinConexion();
    let token: string;
    try {
      token = await this.tokenDe(corredoraId, c);
    } catch (e) {
      if (e instanceof BadRequestException) throw this.sinConexion(e.message);
      throw e;
    }
    let r = await this.llamarCruda(metodo, c.base, ruta, c.id, token, cuerpo);
    if (r.status === 401) {
      try {
        token = await this.tokenDe(corredoraId, c, true);
      } catch (e) {
        if (e instanceof BadRequestException) throw this.sinConexion(e.message);
        throw e;
      }
      r = await this.llamarCruda(metodo, c.base, ruta, c.id, token, cuerpo);
    }
    if (r.status < 200 || r.status >= 300 || r.j?.success === false)
      throw new BadGatewayException(`Portalfirma: ${this.motivo(r.j, r.texto, r.status)}`);
    return (r.j && 'data' in r.j ? r.j.data : r.j) as T;
  }

  // ------------------------------------------------------------------ lo que usa Asset

  /**
   * Envía el PDF a firmar. Cada firmante lleva su posición (arrastrada en el PDF) o, si no la trae, se agrega una página de
   * firmas al final del documento. Devuelve el id del proceso y el número de operación.
   */
  async enviar(
    corredoraId: string,
    o: { pdf: Buffer; firmantes: FirmanteApi[]; protocolizar: boolean; paginaFirmas?: boolean; paginaExtra?: boolean },
  ): Promise<{ processId: string; operacion: number | null; firmantes: EnlaceFirmante[] }> {
    // con todas las firmas ubicadas se usan esas posiciones; `paginaExtra` pide además la página de firmas al final (la agrega Portalfirma)
    const manual = !o.paginaFirmas && o.firmantes.every((f) => !!f.posicion);
    const r = await this.pedir<{ processId?: string }>(corredoraId, 'POST', '/document/sendToSign', {
      document: o.pdf.toString('base64'),
      withProtocolization: o.protocolizar,
      addSignaturePage: !manual || !!o.paginaExtra,
      signatories: o.firmantes.map((f) => ({
        signatory: {
          rut: f.rut,
          name: f.nombre,
          paternalLastName: f.paterno,
          maternalLastName: f.materno,
          email: f.email,
          ...(f.telefono ? { phone: f.telefono } : {}),
        },
        signature: {
          xCoordinate: manual ? Math.round(f.posicion!.x) : 0,
          yCoordinate: manual ? Math.round(f.posicion!.y) : 0,
          pageNumber: manual ? f.posicion!.pagina : 1,
          type: CODIGO_TIPO_FIRMA[f.tipo] ?? 4,
          alias: f.alias,
        },
      })),
    });
    const processId = r?.processId;
    if (!processId) throw new BadGatewayException('Portalfirma no devolvió el id del proceso.');
    // sendToSign entrega solo el proceso: el número de operación sale de su detalle
    const d = await this.detallePorProceso(corredoraId, processId).catch(() => null);
    const op = Number(d?.operation);
    return { processId, operacion: Number.isFinite(op) && op > 0 ? op : null, firmantes: enlacesDe(d) };
  }

  /**
   * Todas las operaciones de la cuenta (POST /document/getAll, paginado por etapa: starting · process · finalized · inactive, de a 100):
   * cada fila ya trae el nombre del documento, sus fechas y los firmantes con su estado, así que no hace falta pedir el detalle de cada una.
   * No tiene filtro de fechas: se filtra aquí por la fecha de creación. Falla (y se usa el listado anterior) si la respuesta no tiene la forma esperada.
   */
  private async listadoPorEtapas(corredoraId: string, desde: string, hasta: string) {
    const ini = `${desde}T00:00:00`;
    const fin = `${hasta}T23:59:59.999`;
    const vistas = new Map<number, Json>();
    for (const etapa of ['process', 'finalized', 'starting', 'inactive'] as const) {
      for (let pagina = 1; pagina <= 200; pagina++) {
        const r = await this.pedir<{ data?: unknown; pagination?: { totalPages?: number } }>(corredoraId, 'POST', '/document/getAll', {
          page: pagina,
          pageSize: 100,
          stage: etapa,
        });
        if (!r || typeof r !== 'object' || !Array.isArray(r.data)) throw new Error('la respuesta no trae la lista de procesos');
        for (const x of r.data as Json[]) {
          const c = x?.contract;
          const operation = Number(c?.operation);
          const creado = String(c?.createdDate ?? '');
          if (!Number.isFinite(operation) || operation <= 0 || vistas.has(operation)) continue;
          if (creado && (creado < ini || creado > fin)) continue;
          const firmantes = Array.isArray(x?.signers) ? (x.signers as Json[]).filter((q) => q?.isSignatory !== false) : [];
          vistas.set(operation, {
            operation,
            contractId: String(c?.id ?? ''),
            creado,
            actualizado: String(c?.updateDate ?? creado),
            nombre: String(c?.document_name ?? '').trim(),
            estado: etapa,
            estadoPortalfirma: String(x?.status ?? ''),
            firmantes: firmantes.length,
            firmaron: firmantes.filter((q) => q?.signed === true).length,
            legalizado: !!c?.legalized,
            sinEnviar: false,
          });
        }
        const total = Number(r.pagination?.totalPages ?? 1);
        if (!Number.isFinite(total) || pagina >= total) break;
      }
    }
    const filas = [...vistas.values()].sort((a, b) => Number(b.operation) - Number(a.operation));
    return { listo: true as const, motivo: null, filas };
  }

  /**
   * Todas las operaciones de la empresa en un rango de fechas (GET /document/getAll/YYYYMMDD/YYYYMMDD): una fila por operación con
   * su proceso, fecha y cantidad de firmantes. Mientras Portalfirma la tenga en mantenimiento (responde un texto en vez del resumen),
   * devuelve `listo: false` para que la app use el listado por teléfono.
   */
  async operacionesDeLaEmpresa(corredoraId: string, desde: string, hasta: string) {
    // la forma nueva (POST /document/getAll paginado por etapa); si Portalfirma aún no la tiene, sigue la de siempre (GET con fechas)
    const nueva = await this.listadoPorEtapas(corredoraId, desde, hasta).catch((e: Error) => {
      this.log.warn(`getAll por etapas no disponible, se usa el listado anterior: ${e.message.slice(0, 160)}`);
      return null;
    });
    if (nueva) return nueva;
    // el listado anterior acepta como mucho un año por consulta: un rango mayor se parte en tramos y se juntan las filas
    const dia = 86_400_000;
    const tramos: [string, string][] = [];
    for (let fin = new Date(`${hasta}T00:00:00Z`).getTime(), ini0 = new Date(`${desde}T00:00:00Z`).getTime(); fin >= ini0; fin -= 365 * dia + dia) {
      tramos.push([new Date(Math.max(ini0, fin - 364 * dia)).toISOString().slice(0, 10), new Date(fin).toISOString().slice(0, 10)]);
      if (tramos.length >= 12) break;
    }
    const todas = new Map<number, Json>();
    let ultimo: Awaited<ReturnType<PortalfirmaApiService['listadoAnterior']>> | null = null;
    for (const [i, f] of tramos) {
      ultimo = await this.listadoAnterior(corredoraId, i, f);
      if (!ultimo.listo) return ultimo;
      for (const x of ultimo.filas) if (!todas.has(Number(x.operation))) todas.set(Number(x.operation), x);
    }
    return { listo: true as const, motivo: null, filas: [...todas.values()].sort((a, b) => Number(b.operation) - Number(a.operation)) };
  }

  /** el listado anterior de la empresa (GET /document/getAll/AAAAMMDD/AAAAMMDD, hasta un año por consulta) */
  private async listadoAnterior(corredoraId: string, desde: string, hasta: string) {
    const d = await this.pedir<unknown>(corredoraId, 'GET', `/document/getAll/${desde.replace(/-/g, '')}/${hasta.replace(/-/g, '')}`);
    // el resumen viene en cubos: `total`, `active`, `signed`… traen solo el CONTEO (su `data` va vacío); las filas con su operación están en
    // `processSent` (enviadas a firmar), `processSigned` y `processNotSent` (creadas sin enviar). `inactive.data` son solo números de operación.
    const r0 = d && typeof d === 'object' ? (d as Json) : null;
    const cubo = (k: string) => (Array.isArray((r0?.[k] as { data?: unknown } | undefined)?.data) ? ((r0![k] as { data: Json[] }).data) : null);
    const enviadas = cubo('processSent');
    const firmadas = cubo('processSigned');
    const sinEnviar = cubo('processNotSent');
    const resto = cubo('total'); // por si Portalfirma vuelve a llenarlo
    if (!r0 || (!enviadas && !firmadas && !sinEnviar && !resto))
      return { listo: false as const, motivo: typeof d === 'string' ? d : 'Portalfirma no entregó el resumen', filas: [] as Json[] };
    const vistas = new Map<number, { operation: number; contractId: string; creado: string; firmantes: number; sinEnviar: boolean }>();
    const sumar = (lista: Json[] | null, sin: boolean) => {
      for (const r of lista ?? []) {
        if (!r || typeof r !== 'object') continue;
        const operation = Number(r?.contract?.operation);
        if (!Number.isFinite(operation) || operation <= 0 || vistas.has(operation)) continue;
        vistas.set(operation, {
          operation,
          contractId: String(r?.contract?.id ?? ''),
          creado: String(r?.contract?.createdDate ?? ''),
          firmantes: Number(r?.signersCount ?? 0),
          sinEnviar: sin,
        });
      }
    };
    sumar(enviadas, false);
    sumar(firmadas, false);
    sumar(resto, false);
    sumar(sinEnviar, true);
    const filas = [...vistas.values()].sort((a, b) => b.operation - a.operation);
    return { listo: true as const, motivo: null, filas };
  }

  /**
   * Las operaciones de un teléfono en un rango de fechas (máx. 366 días, hasta 100 por consulta): lo que se ve en «Mis operaciones».
   * (El listado general `getAll` de Portalfirma hoy responde «Petición en mantenimiento»: este es el que funciona.)
   */
  operaciones(corredoraId: string, o: { phone: string; desde: string; hasta: string; limit: number }) {
    return this.pedir<Json>(corredoraId, 'POST', '/document/getOperationsByPhone', { phone: o.phone, startDate: o.desde, endDate: o.hasta, limit: o.limit });
  }

  detallePorProceso(corredoraId: string, processId: string) {
    return this.pedir<Json>(corredoraId, 'GET', `/document/getByProcessId/${encodeURIComponent(processId)}`);
  }

  detallePorOperacion(corredoraId: string, operacion: number | string) {
    return this.pedir<Json>(corredoraId, 'GET', `/document/getByOperation/${encodeURIComponent(String(operacion))}`);
  }

  /** vuelve a mandar el enlace de firma a todos los firmantes pendientes */
  reenviar(corredoraId: string, processId: string) {
    return this.pedir(corredoraId, 'POST', '/document/resendToSign', { processId });
  }

  /** vuelve a mandar el enlace de firma a un firmante (su id es el de `signatories[].id` del detalle) */
  reenviarFirmante(corredoraId: string, processId: string, signatoryId: string) {
    return this.pedir(corredoraId, 'POST', '/document/resendSignatoryToSign', { processId, signatoryId });
  }

  /**
   * el PDF de un proceso. Sin `version`: el firmado si ya lo está, luego el legalizado y, si no, el original. Con `version`
   * (original, signed o legalized): esa, o un error claro si Portalfirma todavía no la tiene.
   */
  async archivo(corredoraId: string, processId: string, version?: 'original' | 'signed' | 'legalized') {
    const d = await this.detallePorProceso(corredoraId, processId);
    const f = (d?.files ?? {}) as Json;
    const elegido = (version
      ? (version === 'legalized' ? (f.legalized?.id ? f.legalized : f.protocolized) : f[version])
      : f.signed?.id ? f.signed : f.legalized?.id ? f.legalized : f.original) as Json | undefined;
    if (!elegido?.id)
      throw new BadGatewayException(
        version ? 'Portalfirma todavía no tiene esa versión del documento.' : 'Portalfirma no tiene el documento de esta operación.',
      );
    const r = await this.pedir<unknown>(corredoraId, 'GET', `/file/${encodeURIComponent(String(elegido.id))}`);
    const base64 = typeof r === 'string' ? r : String((r as Json)?.base64 ?? (r as Json)?.file ?? '');
    if (!base64) throw new BadGatewayException('Portalfirma no entregó el archivo.');
    return {
      nombre: (elegido.name as string | undefined) ?? null,
      base64: base64.replace(/^data:[^,]*,/, ''),
      actualizado: (d.updatedDateAt as string | undefined) ?? null,
    };
  }

  // ------------------------------------------------------------------ la conexión (Integraciones)

  async estado(u: UsuarioToken) {
    const c = await this.credenciales(u.corredoraId);
    return {
      conectado: !!c,
      customerId: c?.customerId ?? null,
      email: c?.email ?? null,
      conectadoEn: c?.conectadoEn ?? null,
      admin: u.rol === 'ADMIN',
    };
  }

  /** el administrador ingresa las credenciales: se prueba un token antes de guardarlas */
  async conectar(u: UsuarioToken, b: Credenciales) {
    if (u.rol !== 'ADMIN') throw new ForbiddenException('Las credenciales de Portalfirma las ingresa el administrador de la corredora.');
    const apiUrl = !this.produccion && b.apiUrl ? b.apiUrl.replace(/\/+$/, '') : undefined;
    const token = await this.generarToken(b, apiUrl ?? this.base);
    this.tokens.set(u.corredoraId, { token, hasta: Date.now() + VIGENCIA_TOKEN_MS });
    const datos = {
      tipo: 'clave',
      estado: 'activa',
      accesoCif: this.cifrado.cifrarJson({ id: b.id, password: b.password }),
      renovarCif: null,
      expiraEn: null,
      cuentaId: b.customerId,
      cuentaNombre: b.email,
      ultimoError: null,
      datos: { customerId: b.customerId, email: b.email, ...(apiUrl ? { apiUrl } : {}) },
      conectadoPor: u.sub,
      conectadoEn: new Date(),
    };
    await this.db.conexion.upsert({
      where: this.donde(u.corredoraId),
      create: { corredoraId: u.corredoraId, usuarioId: null, proveedor: PROVEEDOR, dueno: 'corredora', ...datos },
      update: datos,
    });
    this.log.log(`corredora ${u.corredoraId}: API de Portalfirma conectada`);
    return this.estado(u);
  }

  async desconectar(u: UsuarioToken) {
    if (u.rol !== 'ADMIN') throw new ForbiddenException('Las credenciales de Portalfirma las quita el administrador de la corredora.');
    this.tokens.delete(u.corredoraId);
    await this.db.conexion.deleteMany({ where: { corredoraId: u.corredoraId, proveedor: PROVEEDOR, dueno: 'corredora' } });
    return this.estado(u);
  }
}

/** /v1/portalfirma-api — las credenciales de la API de Portalfirma de la corredora */
@Controller('portalfirma-api')
export class PortalfirmaApiController {
  constructor(private readonly s: PortalfirmaApiService) {}

  @Get('conexion')
  estado(@UsuarioActual() u: UsuarioToken) {
    return this.s.estado(u);
  }

  /** el detalle de una operación (firmantes, quién firmó, estado, archivos) tal como lo entrega Portalfirma */
  @Get('operacion/:op')
  operacion(@UsuarioActual() u: UsuarioToken, @Param('op') op: string) {
    if (!/^\d{1,12}$/.test(op)) throw new BadRequestException('El número de operación no es válido.');
    return this.s.detallePorOperacion(u.corredoraId, op);
  }

  /** todas las operaciones de la empresa en un rango (getAll de Portalfirma); `listo: false` mientras ese listado no esté habilitado */
  @Get('operaciones')
  todas(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(rangoEsquema)) q: z.infer<typeof rangoEsquema>) {
    return this.s.operacionesDeLaEmpresa(u.corredoraId, q.desde, q.hasta);
  }

  /** las operaciones de un teléfono en un rango de fechas («Mis operaciones», mientras getAll no esté habilitado) */
  @Post('operaciones')
  listar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(operacionesEsquema)) b: z.infer<typeof operacionesEsquema>) {
    return this.s.operaciones(u.corredoraId, b);
  }

  /** vuelve a mandar el enlace de firma: a un firmante (con signatoryId) o a todos los pendientes */
  @Post('reenviar')
  async reenviar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(reenviarEsquema)) b: z.infer<typeof reenviarEsquema>) {
    await (b.signatoryId ? this.s.reenviarFirmante(u.corredoraId, b.processId, b.signatoryId) : this.s.reenviar(u.corredoraId, b.processId));
    return { ok: true };
  }

  @Put('conexion')
  conectar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(credencialesEsquema)) b: Credenciales) {
    return this.s.conectar(u, b);
  }

  @Delete('conexion')
  desconectar(@UsuarioActual() u: UsuarioToken) {
    return this.s.desconectar(u);
  }
}
