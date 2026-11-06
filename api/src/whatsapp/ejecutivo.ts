// El celular del ejecutivo (Agente por WhatsApp), HÍBRIDO: el servidor lee el WhatsApp de la empresa y le entrega a su
// Asset abierto lo que escribe desde su celular; su Asset lo atiende con el Agente (Pedro, Juanita, Diego, Fernanda,
// con su cartera y sus herramientas) y responde por aquí. Si su Asset está cerrado, los mensajes esperan en la cola y
// el servidor se lo dice una vez («lo veo apenas abras Asset»).
//  · GET  /whatsapp/ejecutivo              estado del vínculo;
//  · POST /whatsapp/ejecutivo/vincular     { nombre?, email? } → código «ASSET 1234» para enviar desde el celular;
//  · POST /whatsapp/ejecutivo/desvincular;
//  · PUT  /whatsapp/ejecutivo              { activo?, apodo?, email?, numeroEmpresa? };
//  · GET  /whatsapp/ejecutivo/entrantes    los mensajes nuevos (se toman una sola vez; también es la señal de que su
//                                           Asset está abierto);
//  · POST /whatsapp/ejecutivo/responder    { texto } → al celular vinculado.
// También avisa al ejecutivo (avisar): por WhatsApp si tiene el celular vinculado; si no, queda en sus avisos de la app.
import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, Logger, Post, Put } from '@nestjs/common';
import type { Prisma, WaVinculo } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { AvisosService } from '../avisos/avisos';
import { WechatiaService, type Conversacion, type MensajeWa, type Wechatia } from './wechatia';
import { EnviadosService } from './enviados';
import { firma, norm, telNorm } from './comun';

/** sin señal de su Asset en este tiempo, está cerrado */
const ABIERTO_MS = 60_000;
/** «tu Asset está cerrado» a lo más cada tanto */
const AVISO_CERRADO_MS = 30 * 60_000;
const NUMERO_EMPRESA = '+56 9 4497 5958';

const vincularEsquema = z.object({
  nombre: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).optional(),
});
const configurarEsquema = z.object({
  activo: z.boolean().optional(),
  apodo: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).optional(),
  numeroEmpresa: z.string().trim().max(30).optional(),
});
const responderEsquema = z.object({ texto: z.string().trim().min(1).max(3500) });

interface DatosVinculo {
  nombre?: string;
  email?: string;
  apodo?: string;
  numeroEmpresa?: string;
}

const MENU = `Tu equipo:\n• *Pedro* · Captación\n• *Juanita* · Documentos\n• *Diego* · Seguimiento\n• *Fernanda* · Leads\nEscribe el nombre de quien necesitas. También puedes mandar audios.`;

@Injectable()
export class EjecutivoService {
  private readonly log = new Logger('Ejecutivo');
  constructor(
    private readonly db: PrismaService,
    private readonly wa: WechatiaService,
    private readonly enviados: EnviadosService,
    private readonly avisos: AvisosService,
  ) {}

  private vista(v: WaVinculo | null) {
    const d = (v?.datos ?? {}) as DatosVinculo;
    return {
      activo: !!v?.activo,
      telefono: v?.telefono ?? null,
      codigo: v?.codigo ?? null,
      vinculado: v?.vinculadoEn?.toISOString() ?? null,
      numeroEmpresa: d.numeroEmpresa || NUMERO_EMPRESA,
      nombre: d.nombre ?? '',
      email: d.email ?? '',
      apodo: d.apodo ?? '',
    };
  }

  async estado(u: UsuarioToken) {
    return this.vista(await this.db.waVinculo.findUnique({ where: { usuarioId: u.sub } }));
  }

  async vincular(u: UsuarioToken, b: z.infer<typeof vincularEsquema>) {
    if (!(await this.wa.credenciales(u.corredoraId)))
      throw new BadRequestException('Primero conecta el WhatsApp de la empresa (clave de wechatia).');
    const previo = await this.db.waVinculo.findUnique({ where: { usuarioId: u.sub } });
    const datos = {
      ...((previo?.datos ?? {}) as DatosVinculo),
      ...(b.nombre ? { nombre: b.nombre } : {}),
      ...(b.email ? { email: b.email } : {}),
    };
    for (let i = 0; i < 5; i++) {
      const codigo = 'ASSET ' + String(1000 + Math.floor(Math.random() * 9000));
      try {
        const v = await this.db.waVinculo.upsert({
          where: { usuarioId: u.sub },
          create: { usuarioId: u.sub, corredoraId: u.corredoraId, codigo, datos: datos },
          update: { codigo, datos: datos },
        });
        return { codigo, numeroEmpresa: this.vista(v).numeroEmpresa };
      } catch {
        // el código ya lo tiene otro de la corredora: otro número
      }
    }
    throw new BadRequestException('No se pudo generar el código: intenta de nuevo.');
  }

  async desvincular(u: UsuarioToken) {
    await this.db.waVinculo.updateMany({
      where: { usuarioId: u.sub },
      data: { telefono: null, telefonoNorm: null, contactId: null, codigo: null, activo: false, vinculadoEn: null },
    });
    return { ok: true };
  }

  async configurar(u: UsuarioToken, b: z.infer<typeof configurarEsquema>) {
    const v = await this.db.waVinculo.findUnique({ where: { usuarioId: u.sub } });
    const datos = { ...((v?.datos ?? {}) as DatosVinculo) };
    for (const k of ['apodo', 'email', 'numeroEmpresa'] as const) if (b[k] !== undefined) datos[k] = b[k];
    const activo = b.activo === undefined ? !!v?.activo : b.activo && !!v?.telefonoNorm;
    const r = await this.db.waVinculo.upsert({
      where: { usuarioId: u.sub },
      create: { usuarioId: u.sub, corredoraId: u.corredoraId, activo: false, datos: datos },
      update: { activo, datos: datos },
    });
    return this.vista(r);
  }

  /** la app abierta trae lo nuevo del celular (y con eso avisa que está abierta) */
  async entrantes(u: UsuarioToken) {
    await this.db.waVinculo.updateMany({ where: { usuarioId: u.sub }, data: { senalEn: new Date() } });
    const l = await this.db.$queryRaw<{ id: bigint; mensaje: Prisma.JsonValue; creado_en: Date }[]>`
      UPDATE wa_entrantes e SET tomado_en = now()
      FROM (SELECT id FROM wa_entrantes WHERE usuario_id = ${u.sub}::uuid AND tomado_en IS NULL
            ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED) t
      WHERE e.id = t.id
      RETURNING e.id, e.mensaje, e.creado_en`;
    return {
      items: l
        .sort((a, b) => Number(a.id - b.id))
        .map((x) => ({ id: String(x.id), ...(x.mensaje as object), recibido: x.creado_en.toISOString() })),
      estado: await this.estado(u),
    };
  }

  /** la respuesta de su Asset, al celular vinculado */
  async responder(u: UsuarioToken, texto: string) {
    const v = await this.db.waVinculo.findUnique({ where: { usuarioId: u.sub } });
    if (!v?.activo || !v.contactId) throw new BadRequestException('Tu celular no está vinculado.');
    const wa = await this.wa.cliente(u.corredoraId);
    if (!wa) throw new BadRequestException('El WhatsApp de la empresa no está conectado.');
    const r = await wa.enviarAContacto(v.contactId, texto);
    await this.enviados.registrar(u.corredoraId, v.telefono, { messageId: r.messageId, texto, enHilo: false });
    return { ok: true, messageId: r.messageId };
  }

  // ------------------------------------------------------------------ lo que usa el lector

  /** el ejecutivo cuyo celular es este número (vinculado y activo) */
  porTelefono(corredoraId: string, telefono: string | null) {
    const t = telNorm(telefono);
    return t ? this.db.waVinculo.findFirst({ where: { corredoraId, telefonoNorm: t, activo: true } }) : null;
  }

  /** ¿el mensaje trae el código de vinculación de alguien de la corredora? */
  async porCodigo(corredoraId: string, texto: string) {
    const t = norm(texto).replace(/\s+/g, '');
    if (!/asset\d{4}/.test(t)) return null;
    const pend = await this.db.waVinculo.findMany({ where: { corredoraId, codigo: { not: null } } });
    return pend.find((v) => t.includes(norm(v.codigo).replace(/\s+/g, ''))) ?? null;
  }

  /** el celular que mandó el código queda ligado a esa cuenta */
  async vincularCelular(wa: Wechatia, v: WaVinculo, cv: Conversacion) {
    const t = telNorm(cv.telefono);
    // si ese celular estaba ligado a otra cuenta de la corredora, se suelta de ella
    await this.db.waVinculo.updateMany({
      where: { corredoraId: v.corredoraId, telefonoNorm: t, usuarioId: { not: v.usuarioId } },
      data: { telefono: null, telefonoNorm: null, contactId: null, activo: false, vinculadoEn: null },
    });
    await this.db.waVinculo.update({
      where: { usuarioId: v.usuarioId },
      data: {
        telefono: cv.telefono,
        telefonoNorm: t,
        contactId: cv.contactId,
        codigo: null,
        activo: true,
        vinculadoEn: new Date(),
      },
    });
    const d = (v.datos ?? {}) as DatosVinculo;
    if (cv.contactId) {
      const texto = `Listo, este celular quedó conectado a PortalFirma Asset${d.nombre ? ' de ' + d.nombre : ''}.\n\n${MENU}`;
      const r = await wa.enviarAContacto(cv.contactId, texto);
      await this.enviados.registrar(v.corredoraId, cv.telefono, { messageId: r.messageId, texto, enHilo: false });
    }
    await this.avisos.crear({
      corredoraId: v.corredoraId,
      usuarioId: v.usuarioId,
      tipo: 'wa_vinculado',
      texto: `Tu celular ${cv.telefono ?? ''} quedó conectado al Agente por WhatsApp.`,
    });
  }

  /** mensajes nuevos del celular del ejecutivo → a la cola de su Asset (y, si está cerrado, se lo dice una vez) */
  async recibir(wa: Wechatia, v: WaVinculo, cv: Conversacion, nuevos: MensajeWa[]) {
    if (cv.contactId && cv.contactId !== v.contactId)
      await this.db.waVinculo.update({ where: { usuarioId: v.usuarioId }, data: { contactId: cv.contactId } });
    await this.db.waEntrante.createMany({
      data: nuevos.map((m) => ({
        corredoraId: v.corredoraId,
        usuarioId: v.usuarioId,
        mensaje: { id: m.id, body: m.texto, attachments: m.adjuntos, dateAdded: m.fecha },
      })),
    });
    const abierto = v.senalEn && Date.now() - v.senalEn.getTime() < ABIERTO_MS;
    const avisado = v.avisoCerradoEn && Date.now() - v.avisoCerradoEn.getTime() < AVISO_CERRADO_MS;
    if (!abierto && !avisado && cv.contactId) {
      const texto =
        'Tu Asset está cerrado en el computador: tu equipo verá tu mensaje apenas lo abras. Si es urgente, abre Asset y te respondo de inmediato.';
      try {
        const r = await wa.enviarAContacto(cv.contactId, texto);
        await this.enviados.registrar(v.corredoraId, cv.telefono, { messageId: r.messageId, texto, enHilo: false });
      } catch (e) {
        this.log.warn(`aviso de Asset cerrado: ${(e as Error).message}`);
      }
      await this.db.waVinculo.update({ where: { usuarioId: v.usuarioId }, data: { avisoCerradoEn: new Date() } });
    }
  }

  /**
   * Un aviso para un ejecutivo: por WhatsApp (firmado por quien avisa) si tiene el celular vinculado; si no (o si
   * falla), queda en sus avisos de la app (salvo `respaldo` false: la app ya lo muestra por su cuenta). Devuelve true
   * si salió por WhatsApp.
   */
  async avisar(
    corredoraId: string,
    usuarioId: string,
    texto: string,
    como: string | null = null,
    wa?: Wechatia | null,
    respaldo = true,
  ) {
    const v = await this.db.waVinculo.findUnique({ where: { usuarioId } });
    const t = como ? `${firma(como)}\n${texto}` : texto;
    if (v?.activo && v.contactId) {
      try {
        const cli = wa ?? (await this.wa.cliente(corredoraId));
        if (cli) {
          const r = await cli.enviarAContacto(v.contactId, t.slice(0, 3500));
          await this.enviados.registrar(corredoraId, v.telefono, { messageId: r.messageId, texto: t, enHilo: false });
          return true;
        }
      } catch (e) {
        this.log.warn(`aviso por WhatsApp: ${(e as Error).message}`);
      }
    }
    if (respaldo) await this.avisos.crear({ corredoraId, usuarioId, tipo: 'whatsapp', texto: texto.slice(0, 2000) });
    return false;
  }

  /** a quién se le avisa algo de un cliente: su corredor; si no tiene, los administradores */
  async responsables(corredoraId: string, corredorId: string | null | undefined) {
    if (corredorId) {
      const u = await this.db.usuario.findFirst({
        where: { id: corredorId, corredoraId, activo: true },
        select: { id: true },
      });
      if (u) return [u.id];
    }
    const adm = await this.db.usuario.findMany({
      where: { corredoraId, rol: 'ADMIN', activo: true },
      select: { id: true },
      orderBy: { creadoEn: 'asc' },
    });
    return adm.map((x) => x.id);
  }

  /** avisa al corredor a cargo (o a los administradores) */
  async avisarResponsables(
    corredoraId: string,
    corredorId: string | null | undefined,
    texto: string,
    como: string | null,
    wa?: Wechatia | null,
  ) {
    let alguno = false;
    for (const id of await this.responsables(corredoraId, corredorId))
      if (await this.avisar(corredoraId, id, texto, como, wa)) alguno = true;
    return alguno;
  }

  /** teléfonos vinculados de la corredora (no son clientes: nadie más los atiende) */
  async telefonosVinculados(corredoraId: string) {
    const l = await this.db.waVinculo.findMany({
      where: { corredoraId, telefonoNorm: { not: null } },
      select: { telefonoNorm: true },
    });
    return new Set(l.map((x) => x.telefonoNorm!));
  }
}

@Controller('whatsapp/ejecutivo')
export class EjecutivoController {
  constructor(private readonly s: EjecutivoService) {}

  @Get()
  estado(@UsuarioActual() u: UsuarioToken) {
    return this.s.estado(u);
  }

  @Post('vincular')
  @HttpCode(200)
  vincular(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(vincularEsquema)) b: z.infer<typeof vincularEsquema>) {
    return this.s.vincular(u, b);
  }

  @Post('desvincular')
  @HttpCode(200)
  desvincular(@UsuarioActual() u: UsuarioToken) {
    return this.s.desvincular(u);
  }

  @Put()
  configurar(
    @UsuarioActual() u: UsuarioToken,
    @Body(new ZodPipe(configurarEsquema)) b: z.infer<typeof configurarEsquema>,
  ) {
    return this.s.configurar(u, b);
  }

  @Get('entrantes')
  entrantes(@UsuarioActual() u: UsuarioToken) {
    return this.s.entrantes(u);
  }

  @Post('responder')
  @HttpCode(200)
  responder(
    @UsuarioActual() u: UsuarioToken,
    @Body(new ZodPipe(responderEsquema)) b: z.infer<typeof responderEsquema>,
  ) {
    return this.s.responder(u, b.texto);
  }
}
