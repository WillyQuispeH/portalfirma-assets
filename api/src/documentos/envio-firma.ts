// Envío de un PDF que armó Asset a firmar con Portalfirma, por su API de integración (conexiones/portalfirma-api.ts: la
// corredora ingresa sus credenciales en Integraciones). Lo usan todos los documentos de Asset.
// Dónde va cada firma: si quien envía las ubicó arrastrándolas en el PDF (PUT /v1/firmas-posiciones/:plantilla, que guarda
// las posiciones hasta el próximo envío de esa plantilla), se usan esas; si no, Portalfirma agrega una página de firmas al final.
import { BadGatewayException, Body, ConflictException, Controller, Delete, Injectable, Logger, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import { PortalfirmaApiService, partirNombre, type FirmanteApi } from '../conexiones/portalfirma-api';
import { GoogleService, type IRefDrive } from '../conexiones/google';
import { configFirma, type TipoFirma } from './plantillas-doc';

/** la firma de alguien ubicada en el PDF: página (desde 1) y esquina inferior izquierda del recuadro, en puntos (origen abajo a la izquierda) */
export interface PosicionFirma {
  /** quién es: su RUT o, si no, su rol en el documento (alias); sin ninguno, el orden de los firmantes */
  rut?: string;
  alias?: string;
  pagina: number;
  x: number;
  y: number;
}

export interface FirmanteEnvio {
  rut: string;
  fullName: string;
  email: string;
  phone?: string;
  /** el rol en el documento (visitante, oferente…) */
  alias: string;
  typeSign?: 'simple' | 'avanzada' | 'visada' | 'enrolada';
}

/** el número de operación que devuelve Portalfirma al enviar a firmar (en JSON o dentro del texto) */
export function operacionDe(r: unknown): number | null {
  if (r == null) return null;
  if (typeof r === 'number') return r;
  if (typeof r === 'string') {
    try {
      return operacionDe(JSON.parse(r));
    } catch {
      const m = /operaci[oó]n\D{0,12}(\d{3,})/i.exec(r) || /operation\D{0,12}(\d{3,})/i.exec(r);
      return m ? Number(m[1]) : null;
    }
  }
  if (typeof r === 'object') {
    const o = r as Record<string, unknown>;
    const v = o.operation ?? o.operacion ?? o.operationNumber ?? o.numberOperation ?? o.operation_number;
    if (v != null && Number(v)) return Number(v);
    for (const k of Object.keys(o)) {
      const x = o[k];
      if (typeof x === 'object' && x) {
        const d = operacionDe(x);
        if (d) return d;
      }
    }
    if (typeof o.message === 'string') return operacionDe(o.message);
    if (typeof o.text === 'string') return operacionDe(o.text);
  }
  return null;
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const rutLimpio = (r?: string | null) => (r ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
const VIGENCIA_POSICIONES_MS = 60 * 60_000;

const posicionesEsquema = z.object({
  posiciones: z
    .array(
      z.object({
        rut: z.string().trim().max(20).optional(),
        alias: z.string().trim().max(80).optional(),
        pagina: z.number().int().min(1).max(500),
        x: z.number().min(0).max(5000),
        y: z.number().min(0).max(5000),
      }),
    )
    .min(1)
    .max(20),
});

@Injectable()
export class EnvioFirmaService {
  private readonly log = new Logger('EnvioFirma');
  /** posiciones de firma pendientes: de quien las ubicó y para qué plantilla; se usan en su próximo envío */
  private readonly pendientes = new Map<string, { en: number; posiciones: PosicionFirma[] }>();

  constructor(
    private readonly db: PrismaService,
    private readonly pf: PortalfirmaApiService,
    private readonly google: GoogleService,
  ) {}

  private clave = (usuarioId: string, plantilla: string) => `${usuarioId}|${plantilla}`;

  guardarPosiciones(u: UsuarioToken, plantilla: string, posiciones: PosicionFirma[]) {
    this.pendientes.set(this.clave(u.sub, plantilla), { en: Date.now(), posiciones });
    if (this.pendientes.size > 500) for (const k of this.pendientes.keys()) { this.pendientes.delete(k); break; }
    return { ok: true, posiciones: posiciones.length };
  }

  quitarPosiciones(u: UsuarioToken, plantilla: string) {
    this.pendientes.delete(this.clave(u.sub, plantilla));
    return { ok: true };
  }

  /** las posiciones pendientes de ese usuario y plantilla, asignadas a cada firmante; null si no hay o no alcanzan para todos */
  private tomarPosiciones(usuarioId: string | undefined, plantilla: string | undefined, firmantes: FirmanteEnvio[]) {
    if (!usuarioId || !plantilla) return null;
    const k = this.clave(usuarioId, plantilla);
    const p = this.pendientes.get(k);
    if (!p || Date.now() - p.en > VIGENCIA_POSICIONES_MS) return null;
    const usadas = new Set<number>();
    const asignadas = firmantes.map((f, i) => {
      let j = p.posiciones.findIndex((x, n) => !usadas.has(n) && !!x.rut && rutLimpio(x.rut) === rutLimpio(f.rut));
      if (j < 0) j = p.posiciones.findIndex((x, n) => !usadas.has(n) && !x.rut && !!x.alias && x.alias === f.alias);
      if (j < 0 && !p.posiciones[i]?.rut && !p.posiciones[i]?.alias && !usadas.has(i)) j = i;
      if (j >= 0) usadas.add(j);
      return j >= 0 ? p.posiciones[j] : null;
    });
    return asignadas.every(Boolean) ? (asignadas as PosicionFirma[]) : null;
  }

  /** envía el PDF a firmar (cobra del saldo de Portalfirma); devuelve la operación o qué falló */
  async enviar(o: {
    corredoraId: string;
    /** sin uso desde la API de Portalfirma (el pago sale de la cuenta de las credenciales); se conserva para no cambiar a quienes lo llaman */
    pagadorRespaldo?: string;
    /** quien lo envía: si conectó su Google Drive, ahí también queda una copia (y en el Drive de la empresa, si está conectado) */
    usuarioId?: string;
    /** de qué es el documento (tipo, propiedad y negocio): decide en qué carpetas de Drive queda la copia; sin esto, «Documentos enviados a firmar» */
    drive?: IRefDrive;
    bytes: Buffer;
    nombreArchivo: string;
    firmantes: FirmanteEnvio[];
    /** trámite notarial: none (por defecto) o legalization (legalizado). Con `plantilla`, lo define la plantilla */
    protocolizacion?: 'none' | 'legalization';
    /**
     * la plantilla del documento (orden-visita, mandato-venta…): su configuración de firma (Configuración › Plantillas) decide el
     * tipo de firma de TODOS los firmantes y si lleva legalización; reemplaza lo que venga en `firmantes` y `protocolizacion`
     */
    plantilla?: string;
    /** firmas ya ubicadas (si no vienen, se usan las que dejó pendientes quien envía; y si tampoco, página de firmas) */
    posiciones?: PosicionFirma[];
    /** además de las firmas ubicadas, que Portalfirma agregue una página de firmas al final */
    paginaExtra?: boolean;
  }): Promise<
    | { operacion: number; tipoFirma: TipoFirma; tramite: 'none' | 'legalization'; processId?: string; paginaFirmas?: boolean }
    | { error: string }
  > {
    try {
      const cfg = o.plantilla
        ? await configFirma(this.db, o.corredoraId, o.plantilla)
        : {
            tipoFirma: o.firmantes.find((f) => f.typeSign && f.typeSign !== 'simple')?.typeSign ?? ('simple' as const),
            tramite: o.protocolizacion ?? ('none' as const),
          };
      const firmantes = o.plantilla ? o.firmantes.map((f) => ({ ...f, typeSign: cfg.tipoFirma })) : o.firmantes;
      const pos = o.posiciones?.length
        ? firmantes.map((f, i) => o.posiciones!.find((x) => x.rut && rutLimpio(x.rut) === rutLimpio(f.rut)) ?? o.posiciones![i] ?? null)
        : this.tomarPosiciones(o.usuarioId, o.plantilla, firmantes);
      const ubicadas = !!pos && pos.every(Boolean);
      const lista: FirmanteApi[] = firmantes.map((f, i) => ({
        rut: f.rut,
        ...partirNombre(f.fullName),
        email: f.email,
        telefono: f.phone || undefined,
        alias: f.alias,
        tipo: f.typeSign ?? 'simple',
        ...(ubicadas ? { posicion: { pagina: pos![i]!.pagina, x: pos![i]!.x, y: pos![i]!.y } } : {}),
      }));
      const r = await this.pf.enviar(o.corredoraId, {
        pdf: o.bytes,
        firmantes: lista,
        protocolizar: cfg.tramite === 'legalization',
        paginaFirmas: !ubicadas,
        paginaExtra: !!o.paginaExtra,
      });
      if (r.operacion == null)
        return {
          error: `Portalfirma recibió el documento (proceso ${r.processId}) pero no informó el número de operación. Revisa «Mis operaciones» antes de reintentar.`,
        };
      // ya se usaron: si el envío fallara, quedan para el reintento
      if (o.usuarioId && o.plantilla) this.pendientes.delete(this.clave(o.usuarioId, o.plantilla));
      // una copia en Drive (empresa y usuario, si los conectaron): sin esperar y sin que un fallo afecte el envío
      void this.google
        .subirDocumento({
          corredoraId: o.corredoraId,
          usuarioId: o.usuarioId,
          nombre: o.nombreArchivo,
          bytes: o.bytes,
          ref: o.drive,
        })
        .catch(() => null);
      return { operacion: r.operacion, tipoFirma: cfg.tipoFirma, tramite: cfg.tramite, processId: r.processId, paginaFirmas: !ubicadas };
    } catch (e) {
      const m = (e as { response?: { codigo?: string } }).response;
      if (m?.codigo === 'NECESITA_CONEXION')
        return {
          error:
            'La corredora no tiene la API de Portalfirma conectada: el administrador debe ingresar las credenciales (clave id, customer_id, correo y contraseña) en Asset › Integraciones.',
        };
      this.log.error(`envío a firmar: ${(e as Error).message}`);
      return { error: (e as Error).message };
    }
  }
}

/** /v1/firmas-posiciones — las firmas que quien envía ubicó arrastrándolas en el PDF, para el próximo envío de esa plantilla */
@Controller('firmas-posiciones')
export class PosicionesFirmaController {
  constructor(private readonly envio: EnvioFirmaService) {}

  @Put(':plantilla')
  guardar(
    @UsuarioActual() u: UsuarioToken,
    @Param('plantilla') plantilla: string,
    @Body(new ZodPipe(posicionesEsquema)) b: z.infer<typeof posicionesEsquema>,
  ) {
    return this.envio.guardarPosiciones(u, plantilla.slice(0, 80), b.posiciones);
  }

  @Delete(':plantilla')
  quitar(@UsuarioActual() u: UsuarioToken, @Param('plantilla') plantilla: string) {
    return this.envio.quitarPosiciones(u, plantilla.slice(0, 80));
  }
}

const enviarPdfEsquema = z.object({
  /** el PDF en base64 */
  pdf: z.string().min(100).max(40_000_000),
  nombre: z.string().trim().min(1).max(200),
  firmantes: z
    .array(
      z.object({
        rut: z.string().trim().min(3).max(20),
        nombre: z.string().trim().min(1).max(200),
        email: z.string().trim().email().max(200),
        telefono: z.string().trim().max(30).optional(),
        alias: z.string().trim().min(1).max(80),
        tipoFirma: z.enum(['simple', 'avanzada', 'visada', 'enrolada']).default('simple'),
      }),
    )
    .min(1)
    .max(20),
  tramite: z.enum(['none', 'legalization']).default('none'),
  /** firmas ubicadas en el PDF; sin ellas, Portalfirma agrega una página de firmas */
  posiciones: z
    .array(
      z.object({
        rut: z.string().trim().max(20).optional(),
        alias: z.string().trim().max(80).optional(),
        pagina: z.number().int().min(1).max(500),
        x: z.number().min(0).max(5000),
        y: z.number().min(0).max(5000),
      }),
    )
    .max(20)
    .optional(),
  /** además de las firmas ubicadas, una página de firmas extra al final (la agrega Portalfirma) */
  paginaExtra: z.boolean().optional(),
  propiedadId: z.string().max(80).optional(),
  negocioId: z.string().max(80).optional(),
  /** el tipo de documento (carta-oferta, mandato-venta…): su configuración de firma manda y se usan las firmas ubicadas para esa plantilla */
  plantilla: z.string().trim().max(80).optional(),
});

/** /v1/firmas-envio — un PDF que armó la app de escritorio, enviado a firmar con las credenciales de la corredora */
@Controller('firmas-envio')
export class EnvioPdfController {
  constructor(
    private readonly envio: EnvioFirmaService,
    private readonly api: PortalfirmaApiService,
  ) {}

  @Post('pdf')
  async pdf(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(enviarPdfEsquema)) b: z.infer<typeof enviarPdfEsquema>) {
    if (!(await this.api.conectado(u.corredoraId)))
      throw new ConflictException({
        codigo: 'NECESITA_CONEXION',
        proveedor: 'portalfirma_api',
        message: 'La corredora no tiene la API de Portalfirma conectada: el administrador debe ingresar las credenciales en Integraciones.',
      });
    const r = await this.envio.enviar({
      corredoraId: u.corredoraId,
      usuarioId: u.sub,
      drive: b.propiedadId ? { tipo: null, propiedadId: b.propiedadId, negocioId: b.negocioId ?? null } : undefined,
      bytes: Buffer.from(b.pdf, 'base64'),
      nombreArchivo: b.nombre,
      protocolizacion: b.tramite,
      plantilla: b.plantilla,
      posiciones: b.posiciones,
      paginaExtra: b.paginaExtra,
      firmantes: b.firmantes.map((f) => ({
        rut: f.rut,
        fullName: f.nombre,
        email: f.email,
        phone: f.telefono || undefined,
        alias: f.alias,
        typeSign: f.tipoFirma,
      })),
    });
    if ('error' in r) throw new BadGatewayException(r.error);
    return { operacion: r.operacion, processId: r.processId ?? null, paginaFirmas: !!r.paginaFirmas };
  }
}
