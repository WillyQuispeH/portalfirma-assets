// Leads: /v1/leads. La lógica (leer chats exportados, wechatia, WhatsApp, análisis con IA, fusionar duplicados) vive en
// la app (leads.js); aquí se guarda el lead como documento (reglas comunes en ../comun/asignados.ts), su conversación
// (lead_mensajes, upsert por la clave `k` de cada mensaje) y las subidas de sus fotos y audios a R2.
// Un lead nuevo que repite una conversación de wechatia o un teléfono de otro lead vivo se rechaza con 409 DUPLICADO
// (y el id del existente): así dos equipos que reciben al mismo cliente a la vez no lo duplican.
// Reasignar y eliminar son del administrador (como en la app).
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Prisma, type Lead, type LeadMensaje } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { crearCursor, leerCursor } from '../comun/paginas';
import { AlmacenamientoService } from '../archivos/almacenamiento.service';
import {
  buscarVisible,
  esAdmin,
  esUuid,
  idDoc,
  isoOpc,
  listar,
  listarEsquema,
  metaApp,
  puedeVer,
  referencias,
  restoDatos,
  revisarPut,
  type ListarAsignados,
} from '../comun/asignados';

const ESTADOS = ['nuevo', 'contactado', 'visita', 'negociando', 'ganado', 'perdido'] as const;
const ORIGENES = ['chat', 'whatsapp', 'instagram', 'facebook', 'email', 'portal', 'web', 'referido', 'otro'] as const;
export const leadEsquema = z.looseObject({
  version: z.number().int().positive().optional(),
  estado: z.enum(ESTADOS).catch('nuevo'),
  origen: z.enum(ORIGENES).catch('otro'),
  corredorId: z.uuid().nullable().optional(),
  personaId: z.string().max(64).nullable().optional(),
  telefono: z.string().max(40).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  canales: z
    .array(z.looseObject({ conv: z.string().max(120).optional() }))
    .max(50)
    .optional(),
  ultimo: z
    .looseObject({ fecha: z.string().max(40).optional() })
    .nullable()
    .optional(),
  creado: isoOpc,
});
type LeadEntrada = z.infer<typeof leadEsquema>;
const importarEsquema = z.object({ items: z.array(z.record(z.string(), z.unknown())).min(1).max(100) });

const mensajeEsquema = z.looseObject({
  k: z.string().min(1).max(80),
  fecha: z.string().min(10).max(40),
  de: z.string().max(20).nullable().optional(),
  autor: z.string().max(200).nullable().optional(),
  texto: z.string().max(20000).nullable().optional(),
  tipo: z.string().max(20).default('texto'),
  mediaUrl: z
    .string()
    .max(2000)
    .regex(/^https:\/\//)
    .nullable()
    .optional(),
});
type MensajeEntrada = z.infer<typeof mensajeEsquema>;
const mensajesEsquema = z.object({ items: z.array(mensajeEsquema).min(1).max(500) });
const listarMensajesEsquema = z.object({
  desde: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(1000).default(500),
});

const ARCH_TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
  'text/vcard': 'vcf',
  'application/octet-stream': 'bin',
};
const ARCH_MAX = 25 * 1024 * 1024;
const subidasEsquema = z.object({
  archivos: z
    .array(z.object({ tipo: z.enum(Object.keys(ARCH_TIPOS)), tamano: z.number().int().min(1).max(ARCH_MAX) }))
    .min(1)
    .max(50),
});

const COLUMNAS = ['estado', 'origen', 'corredorId', 'personaId'];
const telNorm = (t: unknown) => {
  const d = String(t ?? '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-9) : null;
};
const convsDe = (o: LeadEntrada) => [...new Set((o.canales ?? []).map((c) => c.conv).filter((c): c is string => !!c))];
const emailDe = (e: unknown) =>
  typeof e === 'string' && e.includes('@') ? e.trim().toLowerCase().slice(0, 200) : null;

export const leadApp = (l: Lead) => ({
  ...((l.datos as object) ?? {}),
  id: l.id,
  estado: l.estado,
  origen: l.origen,
  corredorId: l.corredorId,
  personaId: l.personaId,
  ...metaApp(l),
});
const MSG_COLS = new Set(['k', 'fecha', 'de', 'autor', 'texto', 'tipo', 'mediaUrl', 'url']);
export const mensajeApp = (m: LeadMensaje) => ({
  ...((m.datos as object) ?? {}),
  k: m.k,
  fecha: m.fecha,
  de: m.de,
  autor: m.autor,
  texto: m.texto,
  tipo: m.tipo,
  ...(m.mediaUrl ? { mediaUrl: m.mediaUrl } : {}),
  actualizado: m.actualizadoEn.toISOString(),
});
// JSON con las claves ordenadas (jsonb las reordena al guardar)
const estable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(estable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, estable((v as Record<string, unknown>)[k])]),
        )
      : v;
const filaMensaje = (m: MensajeEntrada) => ({
  fecha: m.fecha,
  de: m.de ?? null,
  autor: m.autor ? m.autor.slice(0, 200) : null,
  texto: m.texto ?? '',
  tipo: m.tipo,
  mediaUrl: m.mediaUrl ?? null,
  datos: Object.fromEntries(
    Object.entries(m).filter(([k, v]) => !MSG_COLS.has(k) && v !== undefined),
  ) as Prisma.InputJsonValue,
});

@Injectable()
export class LeadsService {
  constructor(
    private readonly db: PrismaService,
    private readonly r2: AlmacenamientoService,
  ) {}

  listar(u: UsuarioToken, f: ListarAsignados) {
    return listar(this.db.lead, u, f, leadApp);
  }

  async obtener(u: UsuarioToken, id: string) {
    return leadApp(await buscarVisible(this.db.lead, u, id, 'El lead'));
  }

  /** otro lead vivo de la corredora con la misma conversación o el mismo teléfono */
  private async duplicado(u: UsuarioToken, id: string, convs: string[], tel: string | null) {
    if (!convs.length && !tel) return null;
    return this.db.lead.findFirst({
      where: {
        corredoraId: u.corredoraId,
        eliminadoEn: null,
        id: { not: id },
        OR: [...(convs.length ? [{ convIds: { hasSome: convs } }] : []), ...(tel ? [{ telefonoNorm: tel }] : [])],
      },
      select: { id: true, corredorId: true },
    });
  }
  private errorDuplicado(u: UsuarioToken, d: { id: string; corredorId: string | null }) {
    return new ConflictException({
      message: 'Ese cliente ya tiene un lead.',
      code: 'DUPLICADO',
      id: d.id,
      visible: puedeVer(u, d),
    });
  }

  private columnas(o: LeadEntrada, personaOk: boolean) {
    return {
      estado: o.estado,
      origen: o.origen,
      personaId: personaOk ? (o.personaId as string) : null,
      telefonoNorm: telNorm(o.telefono),
      email: emailDe(o.email),
      convIds: convsDe(o),
      ultimoEn: o.ultimo?.fecha ? String(o.ultimo.fecha).slice(0, 40) : null,
    };
  }

  async guardar(u: UsuarioToken, id: string, o: LeadEntrada) {
    const previa = await revisarPut(this.db.lead, u, id, o.version, 'El lead');
    const ref = await referencias(this.db, u, {
      personas: [esUuid(o.personaId) ? o.personaId : null],
      usuarios: [o.corredorId],
    });
    if (o.corredorId && !ref.usuarios.has(o.corredorId))
      throw new BadRequestException('Ese corredor no es de tu corredora.');
    const cols = this.columnas(o, !!o.personaId && ref.personas.has(o.personaId));
    const corredorId = !esAdmin(u)
      ? (previa?.corredorId ?? u.sub)
      : o.corredorId !== undefined
        ? (o.corredorId ?? null)
        : (previa?.corredorId ?? null);
    const datos = restoDatos(o, COLUMNAS) as Prisma.InputJsonValue;
    if (!previa) {
      const dup = await this.duplicado(u, id, cols.convIds, cols.telefonoNorm);
      if (dup) throw this.errorDuplicado(u, dup);
      try {
        return leadApp(
          await this.db.lead.create({
            data: {
              id,
              corredoraId: u.corredoraId,
              creadoPorId: u.sub,
              ...(o.creado ? { creadoEn: new Date(o.creado) } : {}),
              ...cols,
              corredorId,
              datos,
            },
          }),
        );
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
          throw new ConflictException({ message: 'Ese lead se acaba de crear en otro equipo.', code: 'VERSION' });
        throw e;
      }
    }
    const nuevo = { ...cols, corredorId };
    const igual =
      JSON.stringify(datos) === JSON.stringify(previa.datos) &&
      Object.entries(nuevo).every(
        ([k, v]) => JSON.stringify((previa as Record<string, unknown>)[k]) === JSON.stringify(v),
      );
    if (igual) return leadApp(previa);
    const r = await this.db.lead.updateMany({
      where: { id, version: previa.version },
      data: { ...nuevo, datos, version: { increment: 1 } },
    });
    if (!r.count) throw new ConflictException({ message: 'Otra persona cambió el lead recién.', code: 'VERSION' });
    return leadApp((await this.db.lead.findUnique({ where: { id } }))!);
  }

  async eliminar(u: UsuarioToken, id: string) {
    if (!esAdmin(u)) throw new ForbiddenException('Eliminar un lead lo hace el administrador.');
    await buscarVisible(this.db.lead, u, id, 'El lead');
    await this.db.lead.update({ where: { id }, data: { eliminadoEn: new Date(), version: { increment: 1 } } });
    return { ok: true };
  }

  /**
   * Los leads del índice local de un equipo: se crea lo que no existe. Si ya hay un lead con la misma conversación o
   * teléfono, no se crea: en `mapeo` va { idLocal: idExistente } para que la app suba los mensajes ahí.
   */
  async importar(u: UsuarioToken, items: Record<string, unknown>[]) {
    const rechazados: { id: unknown; motivo: string }[] = [];
    const mapeo: Record<string, string> = {};
    let nuevos = 0;
    let existentes = 0;
    for (const x of items) {
      const id = idDoc.safeParse(x.id);
      const o = leadEsquema.safeParse({ ...x, corredorId: esUuid(x.corredorId) ? x.corredorId : null });
      if (!id.success || !o.success) {
        rechazados.push({ id: x.id, motivo: (id.error ?? o.error)!.issues[0].message });
        continue;
      }
      if (await this.db.lead.findUnique({ where: { id: id.data }, select: { id: true } })) {
        existentes++;
        continue;
      }
      const ref = await referencias(this.db, u, {
        personas: [esUuid(o.data.personaId) ? o.data.personaId : null],
        usuarios: [o.data.corredorId],
      });
      const cols = this.columnas(o.data, !!o.data.personaId && ref.personas.has(o.data.personaId));
      const dup = await this.duplicado(u, id.data, cols.convIds, cols.telefonoNorm);
      if (dup) {
        mapeo[id.data] = dup.id;
        continue;
      }
      await this.db.lead.create({
        data: {
          id: id.data,
          corredoraId: u.corredoraId,
          creadoPorId: u.sub,
          ...(o.data.creado ? { creadoEn: new Date(o.data.creado) } : {}),
          ...cols,
          corredorId:
            o.data.corredorId && ref.usuarios.has(o.data.corredorId) ? o.data.corredorId : esAdmin(u) ? null : u.sub,
          datos: restoDatos(o.data, COLUMNAS) as Prisma.InputJsonValue,
        },
      });
      nuevos++;
    }
    return { nuevos, existentes, mapeo, rechazados };
  }

  // ------------------------------------------------------------------ conversación

  async mensajes(u: UsuarioToken, id: string, f: z.infer<typeof listarMensajesEsquema>) {
    await buscarVisible(this.db.lead, u, id, 'El lead');
    const cursor = leerCursor(f.cursor);
    const filas = await this.db.leadMensaje.findMany({
      where: {
        leadId: id,
        ...(f.desde ? { actualizadoEn: { gt: new Date(f.desde) } } : {}),
        ...(cursor
          ? {
              OR: [
                { actualizadoEn: { gt: cursor.fecha } },
                { actualizadoEn: cursor.fecha, id: { gt: BigInt(cursor.id) } },
              ],
            }
          : {}),
      },
      orderBy: [{ actualizadoEn: 'asc' }, { id: 'asc' }],
      take: f.limite,
    });
    const ult = filas[filas.length - 1];
    return {
      items: filas.map(mensajeApp),
      siguiente: filas.length === f.limite && ult ? crearCursor(ult.actualizadoEn, String(ult.id)) : null,
      servidorEn: new Date().toISOString(),
    };
  }

  /** Agrega o actualiza mensajes por su clave `k` (mandar dos veces el mismo no lo duplica). */
  async guardarMensajes(u: UsuarioToken, id: string, items: MensajeEntrada[]) {
    await buscarVisible(this.db.lead, u, id, 'El lead');
    const porK = new Map(items.map((m) => [m.k, m])); // el último gana si viene repetido
    const ya = new Map(
      (
        await this.db.leadMensaje.findMany({
          where: { leadId: id, k: { in: [...porK.keys()] } },
          select: { k: true, fecha: true, de: true, autor: true, texto: true, tipo: true, mediaUrl: true, datos: true },
        })
      ).map((m) => [m.k, m]),
    );
    const nuevos = [...porK.values()].filter((m) => !ya.has(m.k));
    const cambiados = [...porK.values()].filter((m) => {
      const a = ya.get(m.k);
      if (!a) return false;
      const { k: _k, ...antes } = a;
      return JSON.stringify(estable(antes)) !== JSON.stringify(estable(filaMensaje(m)));
    });
    await this.db.$transaction(async (tx) => {
      if (nuevos.length)
        await tx.leadMensaje.createMany({
          skipDuplicates: true,
          data: nuevos.map((m) => ({ leadId: id, corredoraId: u.corredoraId, k: m.k, ...filaMensaje(m) })),
        });
      for (const m of cambiados)
        await tx.leadMensaje.update({ where: { leadId_k: { leadId: id, k: m.k } }, data: filaMensaje(m) });
    });
    return { nuevos: nuevos.length, actualizados: cambiados.length };
  }

  async subidas(u: UsuarioToken, id: string, archivos: { tipo: string; tamano: number }[]) {
    await buscarVisible(this.db.lead, u, id, 'El lead');
    return {
      subidas: await Promise.all(
        archivos.map(async (a) => {
          const clave = this.r2.claveLead(u.corredoraId, id, ARCH_TIPOS[a.tipo]);
          return { subida: await this.r2.urlSubida(clave, a.tipo, a.tamano), url: this.r2.urlPublica(clave) };
        }),
      ),
    };
  }
}

@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  /** GET /v1/leads?desde=&cursor=&limite= */
  @Get()
  listar(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listarEsquema)) f: ListarAsignados) {
    return this.leads.listar(u, f);
  }

  /** POST /v1/leads/importar — { items } (hasta 100) */
  @Post('importar')
  importar(
    @UsuarioActual() u: UsuarioToken,
    @Body(new ZodPipe(importarEsquema)) b: { items: Record<string, unknown>[] },
  ) {
    return this.leads.importar(u, b.items);
  }

  @Get(':id')
  obtener(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string) {
    return this.leads.obtener(u, id);
  }

  /** PUT /v1/leads/:id — el lead completo (crea o reemplaza); 409 DUPLICADO si es nuevo y el cliente ya tiene lead */
  @Put(':id')
  guardar(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', new ZodPipe(idDoc)) id: string,
    @Body(new ZodPipe(leadEsquema)) o: LeadEntrada,
  ) {
    return this.leads.guardar(u, id, o);
  }

  @Delete(':id')
  eliminar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string) {
    return this.leads.eliminar(u, id);
  }

  /** GET /v1/leads/:id/mensajes?desde=&cursor=&limite= — por fecha de cambio (para traer solo lo nuevo) */
  @Get(':id/mensajes')
  mensajes(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', new ZodPipe(idDoc)) id: string,
    @Query(new ZodPipe(listarMensajesEsquema)) f: z.infer<typeof listarMensajesEsquema>,
  ) {
    return this.leads.mensajes(u, id, f);
  }

  /** POST /v1/leads/:id/mensajes — { items: [...] } (hasta 500), upsert por `k` */
  @Post(':id/mensajes')
  guardarMensajes(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', new ZodPipe(idDoc)) id: string,
    @Body(new ZodPipe(mensajesEsquema)) b: { items: MensajeEntrada[] },
  ) {
    return this.leads.guardarMensajes(u, id, b.items);
  }

  /** POST /v1/leads/:id/archivos/subidas — { archivos: [{ tipo, tamano }] } → URLs firmadas a R2 */
  @Post(':id/archivos/subidas')
  subidas(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', new ZodPipe(idDoc)) id: string,
    @Body(new ZodPipe(subidasEsquema)) b: z.infer<typeof subidasEsquema>,
  ) {
    return this.leads.subidas(u, id, b.archivos);
  }
}
