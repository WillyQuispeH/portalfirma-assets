// Conexiones: /v1/conexiones. Las sesiones con servicios externos (Portalfirma, Mercado Libre, Google Drive…) viven
// solo aquí (tabla conexiones, cifradas). La app de escritorio nunca recibe un token: pide a la API que llame.
//  · GET /                       los proveedores y el estado de la sesión del usuario (o de la corredora);
//  · POST /:proveedor/iniciar    → { url } de la página de autorización del proveedor (la app la abre en el navegador);
//  · GET /callback/:proveedor    (público) el proveedor vuelve aquí con el código; se canjea y se guarda la sesión;
//  · DELETE /:proveedor          desconectar.
// acceso() entrega un token de acceso vigente a los demás servicios de la API: renueva antes de que venza, con la
// fila bloqueada (SELECT … FOR UPDATE) para que dos pedidos a la vez no gasten dos veces un token de renovación de
// un solo uso; si el proveedor rechaza la renovación, la sesión queda «vencida» y la app pide reconectar.
import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Conexion } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Publico, UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import type { Env } from '../config/env';
import { CifradoService } from './cifrado';
import { esSesionVencida, SesionVencidaError, type ProveedorOAuth, type TokensOAuth } from './proveedores';
import { PortalfirmaOAuth } from './portalfirma.oauth';
import { MercadoLibreOAuth } from './mercadolibre.oauth';

const PENDIENTE_MIN = 10;
/** se renueva si al token le queda menos que esto */
const MARGEN_MS = 2 * 60_000;

/** De quién es la sesión que se busca: un usuario o la corredora. */
export interface DuenoConexion {
  corredoraId: string;
  /** id del usuario, o null si la sesión es de la corredora */
  usuarioId: string | null;
}

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pagina = (titulo: string, texto: string, ok: boolean) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(titulo)}</title></head>` +
  `<body style="font-family:-apple-system,Segoe UI,sans-serif;text-align:center;padding:64px;color:#1f2430">` +
  `<h2 style="color:${ok ? '#1a7f4b' : '#b42318'}">${escapar(titulo)}</h2><p>${escapar(texto)}</p></body></html>`;

@Injectable()
export class ConexionesService {
  private readonly proveedores = new Map<string, ProveedorOAuth>();
  private readonly base: string;

  constructor(
    private readonly db: PrismaService,
    private readonly cifrado: CifradoService,
    config: ConfigService<Env, true>,
    portalfirma: PortalfirmaOAuth,
    mercadolibre: MercadoLibreOAuth,
  ) {
    this.base = config.get('API_URL_PUBLICA', { infer: true });
    for (const p of [portalfirma]) this.proveedores.set(p.id, p);
    // Mercado Libre solo si el servidor tiene la app (ML_CLIENT_ID y ML_CLIENT_SECRET)
    if (mercadolibre.configurado) this.proveedores.set(mercadolibre.id, mercadolibre);
  }

  /** ¿ese proveedor está disponible en este servidor? */
  hay = (id: string) => this.proveedores.has(id);

  proveedor(id: string): ProveedorOAuth {
    const p = this.proveedores.get(id);
    if (!p) throw new NotFoundException('Esa integración no existe');
    return p;
  }
  redirectUri = (id: string) => `${this.base}/v1/conexiones/callback/${id}`;
  private dueno = (p: ProveedorOAuth, d: DuenoConexion) =>
    p.dueno === 'corredora' ? 'corredora' : (d.usuarioId ?? '');
  /** el dueño de la sesión de un proveedor para el usuario de la petición */
  duenoDe = (u: UsuarioToken, id: string): DuenoConexion => ({
    corredoraId: u.corredoraId,
    usuarioId: this.proveedor(id).dueno === 'corredora' ? null : u.sub,
  });

  private exigirPuedeConectar(u: UsuarioToken, p: ProveedorOAuth) {
    if (p.dueno === 'corredora' && u.rol !== 'ADMIN')
      throw new ForbiddenException(`${p.nombre} se conecta para toda la corredora: lo hace el administrador.`);
  }

  // ---------------------------------------------------------------- conectar
  async iniciar(u: UsuarioToken, id: string) {
    const p = this.proveedor(id);
    this.exigirPuedeConectar(u, p);
    await this.db.oauthPendiente.deleteMany({ where: { expiraEn: { lt: new Date() } } });
    const state = randomBytes(24).toString('base64url');
    const { url, verificador } = await p.autorizar({ redirectUri: this.redirectUri(id), state });
    const expiraEn = new Date(Date.now() + PENDIENTE_MIN * 60_000);
    await this.db.oauthPendiente.create({
      data: {
        state,
        corredoraId: u.corredoraId,
        usuarioId: u.sub,
        proveedor: id,
        deCorredora: p.dueno === 'corredora',
        verificadorCif: this.cifrado.cifrar(verificador),
        expiraEn,
      },
    });
    return { url, expiraEn };
  }

  /** El proveedor volvió con el código. Devuelve la página que ve el usuario en el navegador. */
  async callback(id: string, q: { code?: string; state?: string; error?: string; error_description?: string }) {
    const p = this.proveedores.get(id);
    if (!p || !q.state)
      return pagina('No se pudo conectar', 'El enlace no es válido. Vuelve a Asset e inténtalo de nuevo.', false);
    // el state se usa una sola vez: se borra al leerlo
    const pend = await this.db.oauthPendiente.delete({ where: { state: q.state } }).catch(() => null);
    if (!pend || pend.proveedor !== id || pend.expiraEn < new Date())
      return pagina(
        'No se pudo conectar',
        'Se acabó el tiempo para autorizar. Vuelve a Asset e inténtalo de nuevo.',
        false,
      );
    if (q.error || !q.code)
      return pagina(
        'No se conectó',
        q.error === 'access_denied'
          ? 'No se dio el permiso. Puedes cerrar esta ventana.'
          : `${p.nombre} respondió: ${q.error_description || q.error || 'sin código'}.`,
        false,
      );
    try {
      const t = await p.canjear({
        redirectUri: this.redirectUri(id),
        codigo: q.code,
        verificador: this.cifrado.descifrar(pend.verificadorCif),
      });
      const cuenta = await p.cuenta(t.acceso).catch(() => ({ id: null, nombre: null }));
      const d: DuenoConexion = { corredoraId: pend.corredoraId, usuarioId: pend.deCorredora ? null : pend.usuarioId };
      await this.guardar(p, d, t, {
        cuentaId: cuenta.id ?? null,
        cuentaNombre: cuenta.nombre ?? null,
        conectadoPor: pend.usuarioId,
        // la sesión se renueva siempre con el registro con que se conectó (aunque cambie el dominio de la API)
        datos: { redirectUri: this.redirectUri(id) },
      });
      return pagina(
        `${p.nombre} conectado`,
        `${cuenta.nombre ? `Conectado como ${cuenta.nombre}. ` : ''}Ya puedes volver a Asset y cerrar esta ventana.`,
        true,
      );
    } catch (e) {
      return pagina(
        'No se pudo conectar',
        `${p.nombre} no aceptó la autorización (${(e as Error).message}). Vuelve a Asset e inténtalo de nuevo.`,
        false,
      );
    }
  }

  private async guardar(
    p: ProveedorOAuth,
    d: DuenoConexion,
    t: TokensOAuth,
    extra: {
      cuentaId: string | null;
      cuentaNombre: string | null;
      conectadoPor: string;
      datos: { redirectUri: string };
    },
  ) {
    const dueno = this.dueno(p, d);
    const datos = {
      tipo: 'oauth',
      estado: 'activa',
      accesoCif: this.cifrado.cifrar(t.acceso),
      renovarCif: t.renovar ? this.cifrado.cifrar(t.renovar) : null,
      expiraEn: t.expiraEn ?? null,
      alcance: t.alcance ?? null,
      ultimoError: null,
      conectadoEn: new Date(),
      renovadoEn: null,
      ...extra,
    };
    await this.db.conexion.upsert({
      where: { corredoraId_proveedor_dueno: { corredoraId: d.corredoraId, proveedor: p.id, dueno } },
      create: { corredoraId: d.corredoraId, usuarioId: d.usuarioId, proveedor: p.id, dueno, ...datos },
      update: datos,
    });
  }

  // ---------------------------------------------------------------- ver y desconectar
  private publica(c: Conexion | undefined) {
    if (!c) return null;
    return {
      estado: c.estado,
      cuenta: c.cuentaNombre,
      cuentaId: c.cuentaId,
      conectadoEn: c.conectadoEn,
      expiraEn: c.expiraEn,
      usadoEn: c.usadoEn,
      error: c.ultimoError,
    };
  }

  async listar(u: UsuarioToken) {
    const filas = await this.db.conexion.findMany({
      where: { corredoraId: u.corredoraId, dueno: { in: [u.sub, 'corredora'] } },
    });
    return {
      proveedores: [...this.proveedores.values()].map((p) => ({
        id: p.id,
        nombre: p.nombre,
        dueno: p.dueno,
        puedeConectar: p.dueno === 'usuario' || u.rol === 'ADMIN',
        conexion: this.publica(
          filas.find((f) => f.proveedor === p.id && f.dueno === this.dueno(p, this.duenoDe(u, p.id))),
        ),
      })),
    };
  }

  async estado(u: UsuarioToken, id: string) {
    const p = this.proveedor(id);
    const c = await this.db.conexion.findUnique({
      where: {
        corredoraId_proveedor_dueno: {
          corredoraId: u.corredoraId,
          proveedor: id,
          dueno: this.dueno(p, this.duenoDe(u, id)),
        },
      },
    });
    return { id, nombre: p.nombre, dueno: p.dueno, conexion: this.publica(c ?? undefined) };
  }

  async desconectar(u: UsuarioToken, id: string) {
    const p = this.proveedor(id);
    this.exigirPuedeConectar(u, p);
    await this.db.conexion.deleteMany({
      where: { corredoraId: u.corredoraId, proveedor: id, dueno: this.dueno(p, this.duenoDe(u, id)) },
    });
    return { ok: true };
  }

  /** los datos no secretos de una sesión (p. ej. locationId, redirectUri), o null si no hay */
  async datosDe(id: string, d: DuenoConexion): Promise<Record<string, unknown> | null> {
    const p = this.proveedor(id);
    const c = await this.db.conexion.findUnique({
      where: { corredoraId_proveedor_dueno: { corredoraId: d.corredoraId, proveedor: id, dueno: this.dueno(p, d) } },
      select: { datos: true },
    });
    return c ? ((c.datos ?? {}) as Record<string, unknown>) : null;
  }

  // ---------------------------------------------------------------- token vigente (para los servicios de la API)
  /**
   * Token de acceso vigente de la sesión de `d` con el proveedor `id`. Si `rechazado` es el token que el proveedor
   * acaba de rechazar (401), se renueva aunque no haya vencido (salvo que otro pedido ya lo haya renovado).
   */
  async acceso(id: string, d: DuenoConexion, rechazado?: string): Promise<string> {
    const p = this.proveedor(id);
    const where = {
      corredoraId_proveedor_dueno: { corredoraId: d.corredoraId, proveedor: id, dueno: this.dueno(p, d) },
    };
    const c = await this.db.conexion.findUnique({ where });
    if (!c || !c.accesoCif) throw new SesionVencidaError(`Conecta tu cuenta de ${p.nombre} en Asset.`);
    if (c.estado !== 'activa')
      throw new SesionVencidaError(`La sesión de ${p.nombre} venció: vuelve a conectarla en Asset.`);
    const actual = this.cifrado.descifrar(c.accesoCif);
    const vigente = !c.expiraEn || c.expiraEn.getTime() - Date.now() > MARGEN_MS;
    if (vigente && actual !== rechazado) {
      if (!c.usadoEn || Date.now() - c.usadoEn.getTime() > 5 * 60_000)
        void this.db.conexion.update({ where: { id: c.id }, data: { usadoEn: new Date() } }).catch(() => null);
      return actual;
    }
    return this.renovar(p, c.id, rechazado ?? actual);
  }

  private async renovar(p: ProveedorOAuth, conexionId: string, viejo: string): Promise<string> {
    let vencida: string | null = null;
    const token = await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM conexiones WHERE id = ${conexionId}::uuid FOR UPDATE`;
        const c = await tx.conexion.findUniqueOrThrow({ where: { id: conexionId } });
        if (c.estado !== 'activa' || !c.accesoCif)
          throw new SesionVencidaError(`La sesión de ${p.nombre} venció: vuelve a conectarla en Asset.`);
        const actual = this.cifrado.descifrar(c.accesoCif);
        // otro pedido la renovó mientras esperábamos el bloqueo
        if (actual !== viejo && (!c.expiraEn || c.expiraEn.getTime() - Date.now() > MARGEN_MS)) return actual;
        if (!c.renovarCif) {
          vencida = 'El servicio no entregó cómo renovar la sesión.';
          return null;
        }
        try {
          const redirectUri = (c.datos as { redirectUri?: string } | null)?.redirectUri ?? this.redirectUri(p.id);
          const t = await p.renovar({ redirectUri, tokenRenovar: this.cifrado.descifrar(c.renovarCif) });
          await tx.conexion.update({
            where: { id: c.id },
            data: {
              accesoCif: this.cifrado.cifrar(t.acceso),
              ...(t.renovar ? { renovarCif: this.cifrado.cifrar(t.renovar) } : {}),
              expiraEn: t.expiraEn ?? null,
              ...(t.alcance ? { alcance: t.alcance } : {}),
              renovadoEn: new Date(),
              usadoEn: new Date(),
              ultimoError: null,
            },
          });
          return t.acceso;
        } catch (e) {
          if (!esSesionVencida(e)) throw e;
          vencida = (e as Error).message || 'invalid_grant';
          return null;
        }
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
    if (token) return token;
    // se marca fuera de la transacción (si no, el rollback la desharía)
    await this.db.conexion.update({
      where: { id: conexionId },
      data: { estado: 'vencida', ultimoError: String(vencida).slice(0, 500) },
    });
    throw new SesionVencidaError(`La sesión de ${p.nombre} venció: vuelve a conectarla en Asset.`);
  }
}

@Controller('conexiones')
export class ConexionesController {
  constructor(private readonly s: ConexionesService) {}

  @Get()
  listar(@UsuarioActual() u: UsuarioToken) {
    return this.s.listar(u);
  }

  @Get(':proveedor')
  estado(@UsuarioActual() u: UsuarioToken, @Param('proveedor') id: string) {
    return this.s.estado(u, id);
  }

  @Post(':proveedor/iniciar')
  iniciar(@UsuarioActual() u: UsuarioToken, @Param('proveedor') id: string) {
    return this.s.iniciar(u, id);
  }

  @Delete(':proveedor')
  desconectar(@UsuarioActual() u: UsuarioToken, @Param('proveedor') id: string) {
    return this.s.desconectar(u, id);
  }

  @Publico()
  @Get('callback/:proveedor')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  callback(@Param('proveedor') id: string, @Query() q: Record<string, string>) {
    if (Object.values(q).some((v) => typeof v !== 'string')) throw new BadRequestException();
    return this.s.callback(id, q);
  }
}
