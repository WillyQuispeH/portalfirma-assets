// Observador de Leads, en el servidor (antes desktop/src/observador.js, en cada equipo): cada pocos minutos lee en
// wechatia las conversaciones de Instagram, Facebook Messenger y correo y las anota en Leads (una por persona, con su
// historial); la IA deja el perfil, qué busca y los datos de contacto. Nunca responde ni envía nada por esos canales.
//  · El «propietario» del contacto en wechatia es el corredor a cargo del lead (si cambia allá, cambia aquí y queda en
//    el historial). Vale también para los leads de WhatsApp.
//  · GET /whatsapp/observador · PUT /whatsapp/observador { activo?, canales?, ia?, diasInicio?, autorizado? } ·
//    POST /whatsapp/observador/revisar («revisar ahora»).
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
   los datos del lead son JSON de la app */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Post,
  Put,
} from '@nestjs/common';
import type { Lead, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { IaService } from './ia';
import { LeadsWaService, type MensajeLead } from './leads-wa';
import { AvisoLeadService } from './aviso-lead';
import { WechatiaService, type Conversacion, type Wechatia } from './wechatia';
import { horaChile, hoy, telNorm } from './comun';

type J = Record<string, any>;
export const CANALES: Record<string, { re: RegExp; t: string }> = {
  instagram: { re: /INSTAGRAM/i, t: 'Instagram' },
  facebook: { re: /FACEBOOK/i, t: 'Facebook Messenger' },
  email: { re: /EMAIL/i, t: 'Correo' },
};
export const canalDe = (tipo: string) => Object.keys(CANALES).find((k) => CANALES[k].re.test(tipo)) ?? null;
const limpiarHtml = (s: string) =>
  s
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
const sinCita = (t: string) =>
  t.split(/\n(?:El .{5,80} escribió:|On .{5,80} wrote:|-----Original Message-----|De: .+\nEnviado:)/)[0].trim();
const ORIGEN_TXT: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook Messenger',
  email: 'Correo',
  whatsapp: 'WhatsApp',
};
export const CFG_OBS = {
  activo: true, // conectar wechatia ya autoriza la lectura; el administrador puede apagarlo
  canales: { instagram: true, facebook: true, email: true },
  ia: true,
  diasInicio: 30,
};
const CADA_MS = 2 * 60_000;

const SISTEMA = `Eres el asistente de una corredora de propiedades en Chile. Lees la conversación (WhatsApp, Instagram o correo) entre un broker y un cliente (lead) y devuelves SOLO un JSON:
{"resumen": "1 o 2 frases: qué busca y en qué quedaron", "busqueda": {"operacion": "arriendo"|"venta"|null, "tipo": "departamento"|"casa"|"oficina"|"local_comercial"|"parcela"|"terreno_construccion"|"bodega"|"estacionamiento"|null, "comunas": [..], "presupuesto": {"valor": número, "moneda": "CLP"|"UF"} o null, "dormitorios": número o null, "banos": número o null, "estacionamiento": true|false|null, "mascotas": true|false|null, "plazo": "cuándo lo necesita" o null, "otros": ["requisitos cortos"]},
 "email": string o null, "rut": string o null, "telefono": "celular que el cliente haya dado" o null, "perfil": "quién es: para quién busca, familia o socios, trabajo o giro, motivo y urgencia, forma de pago (contado, crédito, subsidio), lo que se sepa; 1 a 3 frases" o null, "estadoSugerido": "nuevo"|"contactado"|"visita"|"negociando"|"ganado"|"perdido", "proximaAccion": {"texto": "acción concreta para el broker", "fecha": "YYYY-MM-DD" o null}}
Reglas: «lucas» = miles de pesos (290 lucas = 290000 CLP). Usa solo lo que dice la conversación; si no se dijo, null. Si el cliente cambió de idea, usa lo último. «visita» si quedaron de ir a ver una propiedad; «perdido» si dijo que ya no busca o encontró otra.`;

const configurarEsquema = z.object({
  activo: z.boolean().optional(),
  canales: z
    .object({ instagram: z.boolean().optional(), facebook: z.boolean().optional(), email: z.boolean().optional() })
    .optional(),
  ia: z.boolean().optional(),
  diasInicio: z.number().int().min(1).max(365).optional(),
  autorizado: z.boolean().optional(),
  autorizadoPor: z.string().max(120).optional(),
});

@Injectable()
export class ObservadorService {
  private readonly log = new Logger('Observador');
  constructor(
    private readonly db: PrismaService,
    private readonly ia: IaService,
    private readonly leads: LeadsWaService,
    private readonly wa: WechatiaService,
    private readonly avisoLead: AvisoLeadService,
  ) {}

  private async ajustes(corredoraId: string) {
    const a = await this.db.waAjustes.findUnique({ where: { corredoraId } });
    const o = (a?.observador ?? {}) as J;
    return { a, cfg: { ...CFG_OBS, ...o, canales: { ...CFG_OBS.canales, ...(o.canales || {}) } } };
  }

  async estado(u: UsuarioToken) {
    const { a, cfg } = await this.ajustes(u.corredoraId);
    const por = await this.db.waConversacion.groupBy({
      by: ['canal'],
      where: { corredoraId: u.corredoraId, canal: { in: Object.keys(CANALES) }, leadId: { not: null } },
      _count: { _all: true },
    });
    const res = (a?.observadorRes ?? {}) as J;
    return {
      ...cfg,
      ultima: a?.observadorEn?.toISOString() ?? null,
      error: res.error ?? null,
      ultimo: res.ultimo ?? null,
      leads: por.reduce((s, x) => s + x._count._all, 0),
      porCanal: Object.fromEntries(por.map((x) => [x.canal, x._count._all])),
      canalesTxt: Object.fromEntries(Object.entries(CANALES).map(([k, v]) => [k, v.t])),
    };
  }

  async configurar(u: UsuarioToken, b: z.infer<typeof configurarEsquema>) {
    if (u.rol !== 'ADMIN') throw new ForbiddenException('El observador lo configura el administrador.');
    const { cfg } = await this.ajustes(u.corredoraId);
    const antes = cfg.activo;
    if (b.activo !== undefined) cfg.activo = b.activo;
    if (b.canales)
      for (const k of Object.keys(CANALES))
        if ((b.canales as J)[k] !== undefined) (cfg.canales as J)[k] = !!(b.canales as J)[k];
    if (b.ia !== undefined) cfg.ia = b.ia;
    if (b.diasInicio) cfg.diasInicio = b.diasInicio;
    if (cfg.activo && !antes) {
      if (!b.autorizado)
        throw new BadRequestException({
          message: 'Confirma que la corredora autoriza leer y guardar estas conversaciones.',
          code: 'AUT',
        });
      const quien = await this.db.usuario.findUnique({ where: { id: u.sub }, select: { nombre: true } });
      // registro legal de la autorización (colección consentimientos, la misma de la app)
      const id = 'c' + Date.now().toString(36);
      await this.db.registro.create({
        data: {
          corredoraId: u.corredoraId,
          coleccion: 'consentimientos',
          id,
          creadoPorId: u.sub,
          datos: {
            canal: 'wechatia',
            cuenta: Object.keys(CANALES)
              .filter((k) => (cfg.canales as J)[k])
              .map((k) => CANALES[k].t)
              .join(', '),
            autorizadoPor: String(b.autorizadoPor || quien?.nombre || '').slice(0, 120),
            fecha: new Date().toISOString(),
            conversaciones: 0,
          },
        },
      });
    }
    const o = cfg as unknown as Prisma.InputJsonObject;
    await this.db.waAjustes.upsert({
      where: { corredoraId: u.corredoraId },
      create: { corredoraId: u.corredoraId, observador: o },
      update: { observador: o, ...(cfg.activo && !antes ? { observadorEn: null } : {}) },
    });
    return this.estado(u);
  }

  /** «revisar ahora» desde la app */
  async revisarAhora(u: UsuarioToken) {
    const wa = await this.wa.cliente(u.corredoraId);
    if (!wa) throw new BadRequestException('Falta conectar wechatia.');
    const convs = await wa.conversaciones(50);
    const r = await this.ronda(wa, u.corredoraId, convs, true);
    return { ...r, estado: await this.estado(u) };
  }

  /** ¿toca revisar? (cada 2 min, si está activo) */
  async toca(corredoraId: string) {
    const { a, cfg } = await this.ajustes(corredoraId);
    return cfg.activo && (!a?.observadorEn || Date.now() - a.observadorEn.getTime() > CADA_MS);
  }

  /** el corredor a cargo según el «propietario» del contacto en wechatia */
  async dueno(corredoraId: string, cv: Conversacion, leadId: string | null, previo: string | null) {
    if (!leadId || !cv.asignado || cv.asignado === previo) return;
    const co = await this.db.usuario.findFirst({ where: { corredoraId, wechatiaId: cv.asignado, activo: true } });
    if (!co) return;
    let cambio = false;
    await this.leads.cambiar(leadId, (d, l) => {
      if (l.corredorId === co.id) return null;
      cambio = true;
      d.historial = [
        ...(d.historial || []),
        { fecha: new Date().toISOString(), texto: `Asignado a ${co.nombre} (según wechatia)`, tipo: 'dueno' },
      ].slice(-200);
      return { datos: d, cols: { corredorId: co.id } as Prisma.LeadUpdateManyMutationInput };
    });
    // el «propietario» de wechatia es el corredor a cargo: se le avisa por WhatsApp con los datos del lead
    if (cambio) {
      const lead = await this.db.lead.findUnique({ where: { id: leadId } });
      if (lead) await this.avisoLead.asignado(lead, co.id, null);
    }
  }

  /** el lead de una conversación de otro canal: el que ya la tiene, o por sus mensajes, contacto, teléfono o correo */
  private async leadDe(corredoraId: string, cv: Conversacion, canal: string, ids: string[]) {
    const porConv = await this.db.lead.findFirst({
      where: { corredoraId, eliminadoEn: null, convIds: { has: cv.id } },
      orderBy: { creadoEn: 'asc' },
    });
    if (porConv) return porConv;
    if (ids.length) {
      const m = await this.db.leadMensaje.findFirst({
        where: { corredoraId, k: { in: ids.map((i) => 'wc' + i) } },
        select: { leadId: true },
      });
      if (m) {
        const l = await this.db.lead.findFirst({ where: { id: m.leadId, eliminadoEn: null } });
        if (l) return l;
      }
    }
    const t = telNorm(cv.telefono);
    const email = cv.email.toLowerCase().trim();
    const otro = await this.db.lead.findFirst({
      where: {
        corredoraId,
        eliminadoEn: null,
        OR: [
          ...(cv.contactId ? [{ datos: { path: ['canales'], array_contains: [{ contactId: cv.contactId }] } }] : []),
          ...(t ? [{ telefonoNorm: t }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      orderBy: { creadoEn: 'asc' },
    });
    if (otro) return otro;
    const canalObj = {
      canal,
      conv: cv.id,
      contactId: cv.contactId ?? '',
      usuario: canal === 'instagram' ? cv.usuario : '',
    };
    return this.leads.crear(corredoraId, {
      nombre: cv.nombre,
      telefono: cv.telefono ?? '',
      email,
      origen: canal,
      canal: canalObj,
      datos: {
        chatCon: cv.nombre || cv.usuario || email || cv.telefono || '',
        historial: [
          {
            fecha: new Date().toISOString(),
            texto: `Llegó por ${ORIGEN_TXT[canal] || canal}${cv.usuario ? ' (@' + cv.usuario + ')' : ''}`,
            tipo: 'canal',
          },
        ],
        ...(canal === 'instagram' ? { ig: { usuario: cv.usuario, cuenta: 'wechatia' } } : {}),
      },
    });
  }

  /** la ronda del observador sobre las conversaciones ya leídas por el lector */
  async ronda(wa: Wechatia, corredoraId: string, convs: Conversacion[], forzar = false) {
    const { cfg } = await this.ajustes(corredoraId);
    const resumen = { revisadas: 0, nuevos: 0, mensajes: 0, analizados: 0 };
    let error: string | null = null;
    if (!cfg.activo && !forzar) return { activo: false, ...resumen };
    try {
      const desde = Date.now() - (cfg.diasInicio || 30) * 864e5;
      const paraIA: string[] = [];
      for (const cv of convs) {
        const canal = canalDe(cv.tipo);
        const previa = await this.db.waConversacion.findUnique({
          where: { corredoraId_convId: { corredoraId, convId: cv.id } },
        });
        if (!canal) {
          // WhatsApp: solo el dueño del lead según wechatia
          if (cv.asignado && cv.telefono && cv.asignado !== previa?.dueno) {
            const l = await this.leads.porTelefono(corredoraId, cv.telefono);
            if (l) {
              await this.dueno(corredoraId, cv, l.id, previa?.dueno ?? null);
              await this.db.waConversacion.upsert({
                where: { corredoraId_convId: { corredoraId, convId: cv.id } },
                create: {
                  corredoraId,
                  convId: cv.id,
                  canal: 'whatsapp',
                  telefonoNorm: telNorm(cv.telefono),
                  contactId: cv.contactId,
                  dueno: cv.asignado,
                },
                update: { dueno: cv.asignado },
              });
            }
          }
          continue;
        }
        if (!(cfg.canales as J)[canal]) continue;
        const tm = Number.isFinite(Number(cv.marca)) ? Number(cv.marca) : Date.parse(String(cv.marca));
        if (!previa?.leadId && tm && tm < desde) continue; // conversaciones antiguas: no se traen al activar
        if (previa?.leadId && previa.marca === cv.marca && !forzar) {
          await this.dueno(corredoraId, cv, previa.leadId, previa.dueno);
          if (cv.asignado !== previa.dueno)
            await this.db.waConversacion.update({
              where: { corredoraId_convId: { corredoraId, convId: cv.id } },
              data: { dueno: cv.asignado },
            });
          continue;
        }
        resumen.revisadas++;
        const ms = (await wa.mensajes(cv.id, 100)).filter((m) => canalDe(m.tipo) || !m.tipo);
        let l: Lead = await this.leadDe(
          corredoraId,
          cv,
          canal,
          ms.map((m) => m.id),
        );
        const nuevo = !previa?.leadId && l.creadoEn.getTime() > Date.now() - 60_000;
        // la conversación queda en el lead (y el canal, si es otro)
        if (!l.convIds.includes(cv.id)) {
          l =
            (await this.leads.cambiar(l.id, (d, act) => {
              d.canales = [
                ...(d.canales || []),
                { canal, conv: cv.id, contactId: cv.contactId ?? '', usuario: canal === 'instagram' ? cv.usuario : '' },
              ];
              d.historial = [
                ...(d.historial || []),
                { fecha: new Date().toISOString(), texto: `También escribe por ${ORIGEN_TXT[canal]}`, tipo: 'canal' },
              ].slice(-200);
              if (!d.nombre && cv.nombre) d.nombre = cv.nombre;
              if (!d.telefono && cv.telefono) d.telefono = cv.telefono;
              if (!d.email && cv.email) d.email = cv.email.toLowerCase();
              return {
                datos: d,
                cols: {
                  convIds: [...act.convIds, cv.id],
                  ...(!act.telefonoNorm && cv.telefono ? { telefonoNorm: telNorm(cv.telefono) } : {}),
                },
              };
            })) ?? l;
        }
        const d = this.leads.datos(l);
        const msgs: MensajeLead[] = ms
          .map((m) => {
            let texto = m.texto;
            if (canal === 'email') texto = sinCita(limpiarHtml(texto));
            if (m.adjuntos.length) texto = [texto, ...m.adjuntos.map((u) => '📎 ' + u)].filter(Boolean).join('\n');
            if (canal === 'email' && m.asunto) texto = `[${m.asunto}] ${texto}`;
            return {
              k: 'wc' + m.id,
              fecha: horaChile(new Date(m.fecha)),
              de: m.direccion === 'entrante' ? ('cliente' as const) : ('broker' as const),
              autor: m.direccion === 'entrante' ? d.nombre || d.chatCon || 'Cliente' : 'Corredora',
              texto: texto.slice(0, 6000),
              datos: { canal, ...(m.asunto ? { asunto: m.asunto } : {}) },
            };
          })
          .filter((m) => m.texto.trim());
        const r = await this.leads.anotar(l, msgs);
        await this.db.waConversacion.upsert({
          where: { corredoraId_convId: { corredoraId, convId: cv.id } },
          create: {
            corredoraId,
            convId: cv.id,
            canal,
            telefonoNorm: telNorm(cv.telefono),
            contactId: cv.contactId,
            marca: cv.marca,
            leadId: l.id,
            dueno: cv.asignado,
          },
          update: { canal, marca: cv.marca, leadId: l.id, dueno: cv.asignado },
        });
        await this.dueno(corredoraId, cv, l.id, previa?.dueno ?? null);
        if (nuevo) resumen.nuevos++;
        resumen.mensajes += r.agregados;
        if (r.delCliente && !paraIA.includes(l.id)) paraIA.push(l.id);
      }
      // IA: perfil, búsqueda y contacto (hasta 5 por ronda, para no gastar de más)
      if (cfg.ia && (await this.ia.disponible(corredoraId)))
        for (const id of paraIA.slice(0, 5)) {
          try {
            await this.analizar(corredoraId, id);
            resumen.analizados++;
          } catch (e) {
            this.log.warn(`análisis de ${id}: ${(e as Error).message}`);
          }
        }
    } catch (e) {
      const m = (e as Error).message;
      error = /permiso|403|401|CLAVE/i.test(m)
        ? 'La clave de wechatia no tiene permiso para ver conversaciones. Agrega «Ver conversaciones» y «Ver mensajes de conversaciones» a la integración privada.'
        : m;
    }
    await this.db.waAjustes.upsert({
      where: { corredoraId },
      create: { corredoraId, observadorEn: new Date(), observadorRes: { ultimo: resumen, error } },
      update: { observadorEn: new Date(), observadorRes: { ultimo: resumen, error } },
    });
    return { activo: cfg.activo, ...resumen, error };
  }

  /** IA: búsqueda, resumen, perfil, estado y próxima acción, a partir de la conversación */
  async analizar(corredoraId: string, id: string) {
    const ms = await this.db.leadMensaje.findMany({ where: { leadId: id }, orderBy: { fecha: 'asc' } });
    const lineas = ms.map(
      (m) =>
        `[${m.fecha.slice(8, 10)}/${m.fecha.slice(5, 7)} ${m.fecha.slice(11, 16)}] ${m.de === 'cliente' ? 'Cliente' : 'Broker'}: ${(m.texto || '(' + m.tipo + ')').replace(/\s*\n\s*/g, ' ')}`,
    );
    let conv = lineas.join('\n');
    if (conv.length > 14000) conv = '…\n' + conv.slice(-14000);
    const j = (await this.ia.json({
      corredoraId,
      uso: 'observador',
      sistema: SISTEMA,
      usuario: `EXTRAER_LEAD\nHoy: ${hoy()}\nCONVERSACION:\n${conv}`,
    })) as J;
    const b = (j.busqueda || {}) as J;
    const n = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    await this.leads.cambiar(id, (d, l) => {
      d.busqueda = {
        operacion: ['arriendo', 'venta'].includes(b.operacion) ? b.operacion : null,
        tipo: b.tipo || null,
        comunas: (Array.isArray(b.comunas) ? b.comunas : []).map(String).filter(Boolean).slice(0, 8),
        presupuesto:
          b.presupuesto && n(b.presupuesto.valor)
            ? { valor: n(b.presupuesto.valor), moneda: b.presupuesto.moneda === 'UF' ? 'UF' : 'CLP' }
            : null,
        dormitorios: n(b.dormitorios),
        banos: n(b.banos),
        estacionamiento: typeof b.estacionamiento === 'boolean' ? b.estacionamiento : null,
        mascotas: typeof b.mascotas === 'boolean' ? b.mascotas : null,
        plazo: b.plazo ? String(b.plazo).slice(0, 80) : null,
        otros: (Array.isArray(b.otros) ? b.otros : []).map(String).slice(0, 8),
      };
      d.resumen = String(j.resumen || '').slice(0, 400);
      const cols: Prisma.LeadUpdateManyMutationInput = {};
      if (j.email && !d.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(j.email)) {
        d.email = j.email;
        cols.email = String(j.email).toLowerCase();
      }
      if (j.rut && !d.rut) d.rut = String(j.rut).slice(0, 14);
      if (j.telefono && !d.telefono && telNorm(j.telefono)) {
        d.telefono = String(j.telefono).trim().slice(0, 20);
        if (!l.telefonoNorm) cols.telefonoNorm = telNorm(j.telefono);
      }
      if (j.perfil) d.perfil = String(j.perfil).slice(0, 500);
      if (
        l.estado === 'nuevo' &&
        ['contactado', 'visita', 'negociando', 'ganado', 'perdido'].includes(j.estadoSugerido)
      )
        cols.estado = j.estadoSugerido;
      if (j.proximaAccion?.texto && !d.proximaAccion?.manual)
        d.proximaAccion = {
          texto: String(j.proximaAccion.texto).slice(0, 160),
          fecha: /^\d{4}-\d{2}-\d{2}$/.test(j.proximaAccion.fecha || '') ? j.proximaAccion.fecha : null,
        };
      d.analizado = new Date().toISOString();
      d.actualizado = d.analizado;
      return { datos: d, cols };
    });
  }
}

@Controller('whatsapp/observador')
export class ObservadorController {
  constructor(private readonly s: ObservadorService) {}

  @Get()
  estado(@UsuarioActual() u: UsuarioToken) {
    return this.s.estado(u);
  }

  @Put()
  configurar(
    @UsuarioActual() u: UsuarioToken,
    @Body(new ZodPipe(configurarEsquema)) b: z.infer<typeof configurarEsquema>,
  ) {
    return this.s.configurar(u, b);
  }

  @Post('revisar')
  @HttpCode(200)
  revisar(@UsuarioActual() u: UsuarioToken) {
    return this.s.revisarAhora(u);
  }
}
