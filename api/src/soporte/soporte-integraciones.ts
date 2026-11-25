/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-base-to-string, @typescript-eslint/no-explicit-any -- respuestas de KONVER y propiedades en el formato de la app (JSON sin tipo) */
// Integraciones para soporte: /v1/soporte/integraciones. Qué tiene conectado cada corredora (Convecta, KONVER con Portal
// Inmobiliario y TOCTOC, wechatia, Mercado Libre directo, Google, Portalfirma…), cuántas propiedades tiene en cada portal y
// la publicación automática (activarla, revisar ahora lo publicado, publicar ahora y el último informe).
// Nunca devuelve llaves ni tokens. Solo entran los correos de PLATAFORMA_REVISORES.
//  · GET  /soporte/integraciones?corredoraId=
//  · POST /soporte/integraciones/publicacion-auto   { corredoraId, activo }
//  · POST /soporte/integraciones/detectar           { corredoraId }   revisa lo publicado en los portales (no publica)
//  · POST /soporte/integraciones/publicar           { corredoraId }   publica lo que falte (en segundo plano)
import { Body, Controller, Get, Injectable, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { SoporteService } from './soporte';
import { KonverService } from '../conexiones/konver';
import { ConvectaService } from '../propiedades/convecta';
import { WechatiaService } from '../whatsapp/wechatia';
import { PublicacionAutoService } from '../conexiones/publicacion-auto';

const corredoraQ = z.object({ corredoraId: z.uuid() });
const activarB = z.object({ corredoraId: z.uuid(), activo: z.boolean() });
type J = Record<string, any>;

const NOMBRES: Record<string, string> = {
  convecta: 'Convecta',
  konver: 'KONVER (portales)',
  wechatia: 'wechatia (WhatsApp)',
  mercadolibre: 'Mercado Libre directo',
  portalfirma: 'Portalfirma',
  portalfirma_api: 'Portalfirma (API)',
  google_drive: 'Google Drive',
  google_calendar: 'Google Calendar',
  google: 'Google',
};
const PORTALES: [string, string][] = [
  ['pi', 'Portal Inmobiliario'],
  ['toctoc', 'TOCTOC'],
  ['chilepropiedades', 'Chilepropiedades'],
  ['broku', 'Broku'],
  ['yapo', 'Yapo'],
];
const PUBLICADO = ['active', 'publicada', 'en_feed'];

@Injectable()
export class SoporteIntegracionesService {
  constructor(
    private readonly db: PrismaService,
    private readonly konver: KonverService,
    private readonly convecta: ConvectaService,
    private readonly wechatia: WechatiaService,
    private readonly auto: PublicacionAutoService,
  ) {}

  async ver(corredoraId: string) {
    const [conexiones, props, cfgFila, auto, claveConvecta, numeroWa] = await Promise.all([
      this.db.conexion.findMany({ where: { corredoraId }, orderBy: [{ proveedor: 'asc' }, { conectadoEn: 'desc' }] }),
      this.db.propiedad.findMany({
        where: { corredoraId, eliminadoEn: null, archivada: false },
        select: { portales: true, venta: true, arriendo: true },
      }),
      this.db.registro.findUnique({
        where: { corredoraId_coleccion_id: { corredoraId, coleccion: 'corredora_config', id: 'corredora' } },
        select: { datos: true },
      }),
      this.auto.estado(corredoraId),
      this.convecta.claveDe(corredoraId).catch(() => null),
      this.wechatia.numeroEmpresa(corredoraId).catch(() => null),
    ]);
    const usuarios = new Map(
      (
        await this.db.usuario.findMany({
          where: { id: { in: conexiones.map((c) => c.usuarioId).filter((x): x is string => !!x) } },
          select: { id: true, nombre: true },
        })
      ).map((u) => [u.id, u.nombre]),
    );
    const cfg = (cfgFila?.datos ?? {}) as J;

    // KONVER en vivo: qué cuentas de portales tiene conectadas
    let konver: J | null = null;
    const r = await this.konver
      .pedirCorredora(corredoraId, { metodo: 'GET', ruta: '/v1/cuenta' })
      .catch((e: Error) => ({ status: 502, cuerpo: { detail: { mensaje: e.message } } }));
    if (r) {
      const c = r.cuerpo as J;
      konver =
        r.status === 200
          ? {
              ok: true,
              cliente: c?.cliente ?? null,
              cupo: c?.cupo_propiedades_por_portal ?? null,
              pi: {
                conectado: !!c?.portal_inmobiliario?.conectado,
                nickname: c?.portal_inmobiliario?.nickname ?? null,
                tipoUsuario: c?.portal_inmobiliario?.tipo_usuario ?? null,
                tipos: (c?.portal_inmobiliario?.tipos_publicacion ?? []) as J[],
              },
              toctoc: {
                conectado: !!c?.toctoc?.conectado,
                planActivo: c?.toctoc?.plan_activo !== false,
                ambiente: c?.toctoc?.llaves?.ambiente ?? null,
              },
            }
          : { ok: false, error: r.status === 401 ? 'KONVER rechazó la llave.' : `KONVER respondió ${r.status}.` };
    }

    // cuántas propiedades hay en cada portal (según lo anotado en cada propiedad)
    const porPortal = PORTALES.map(([id, nombre]) => {
      let publicados = 0;
      let pausados = 0;
      let vinculados = 0;
      let conError = 0;
      for (const p of props) {
        for (const op of ['venta', 'arriendo']) {
          const a = (p.portales as J)?.[id]?.[op];
          if (!a) continue;
          if (PUBLICADO.includes(a.status)) publicados++;
          else if (['paused', 'pausada'].includes(a.status)) pausados++;
          if (a.vinculado) vinculados++;
          if (a.error) conError++;
        }
      }
      const feed = !['pi', 'toctoc'].includes(id);
      return {
        id,
        nombre,
        via: feed ? 'feed' : 'konver',
        conectado: feed
          ? cfg.portales?.[id]?.activo === true
          : id === 'pi'
            ? !!konver?.pi?.conectado
            : !!konver?.toctoc?.conectado,
        pausado: feed && ['chilepropiedades', 'broku'].includes(id),
        publicados,
        pausados,
        vinculados,
        conError,
      };
    });

    const conexion = (prov: string) => conexiones.find((c) => c.proveedor === prov && c.dueno === 'corredora');
    return {
      propiedades: props.length,
      resumen: [
        {
          id: 'convecta',
          nombre: 'Convecta',
          conectado: !!claveConvecta,
          detalle: conexion('convecta') ? 'clave propia' : claveConvecta ? 'clave del servidor' : 'sin conectar',
        },
        {
          id: 'konver',
          nombre: 'KONVER (portales)',
          conectado: !!konver?.ok,
          detalle: konver ? (konver.ok ? konver.cliente || 'conectado' : konver.error) : 'sin llave',
        },
        {
          id: 'pi',
          nombre: 'Portal Inmobiliario',
          conectado: !!konver?.pi?.conectado,
          detalle: konver?.pi?.conectado ? `cuenta ${konver.pi.nickname ?? ''}`.trim() : 'sin conectar',
        },
        {
          id: 'toctoc',
          nombre: 'TOCTOC',
          conectado: !!konver?.toctoc?.conectado,
          detalle: konver?.toctoc?.conectado
            ? konver.toctoc.planActivo
              ? 'plan activo'
              : 'sin plan activo'
            : 'sin conectar',
        },
        {
          id: 'wechatia',
          nombre: 'WhatsApp (wechatia)',
          conectado: conexion('wechatia')?.estado === 'activa',
          detalle: numeroWa ?? (conexion('wechatia') ? conexion('wechatia')!.estado : 'sin conectar'),
        },
      ],
      konver,
      portales: porPortal,
      conexiones: conexiones.map((c) => ({
        id: c.id,
        proveedor: c.proveedor,
        nombre: NOMBRES[c.proveedor] ?? c.proveedor,
        de: c.dueno === 'corredora' ? 'Corredora' : (usuarios.get(c.usuarioId ?? '') ?? 'Usuario'),
        estado: c.estado,
        cuenta: c.cuentaNombre ?? c.cuentaId ?? null,
        conectadoEn: c.conectadoEn.toISOString(),
        expiraEn: c.expiraEn?.toISOString() ?? null,
        error: c.ultimoError,
      })),
      contacto: {
        whatsapp: numeroWa ?? cfg.contacto?.whatsapp ?? null,
        email: cfg.contacto?.email ?? null,
        tipoAviso: cfg.ml?.tipoAviso ?? 'silver',
      },
      publicacionAuto: auto,
    };
  }
}

@Controller('soporte/integraciones')
export class SoporteIntegracionesController {
  constructor(
    private readonly s: SoporteIntegracionesService,
    private readonly auto: PublicacionAutoService,
    private readonly soporte: SoporteService,
  ) {}

  @Get()
  async ver(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(corredoraQ)) q: z.infer<typeof corredoraQ>) {
    await this.soporte.exigir(u);
    return this.s.ver(q.corredoraId);
  }

  @Post('publicacion-auto')
  async activar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(activarB)) b: z.infer<typeof activarB>) {
    await this.soporte.exigir(u);
    return this.auto.activar(b.corredoraId, b.activo, u.sub);
  }

  @Post('detectar')
  async detectar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(corredoraQ)) b: z.infer<typeof corredoraQ>) {
    await this.soporte.exigir(u);
    return this.auto.detectarAhora(b.corredoraId);
  }

  @Post('publicar')
  async publicar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(corredoraQ)) b: z.infer<typeof corredoraQ>) {
    await this.soporte.exigir(u);
    return this.auto.publicarAhora(b.corredoraId);
  }
}
