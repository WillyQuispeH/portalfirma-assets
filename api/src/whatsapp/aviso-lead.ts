/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- los datos del lead son JSON de la app */
// Aviso al corredor cuando le asignan un lead (el administrador en Asset, o el «propietario» del contacto en wechatia):
// le llega a su WhatsApp con los datos del interesado y de la propiedad.
//  · Si el corredor le escribió al número de la empresa en las últimas 24 h, va como texto libre.
//  · Si no (lo normal: el aviso parte de nosotros), va por la plantilla aprobada por Meta «nuevo_lead_asignado»: se llenan
//    los campos «asset_*» de su contacto y la etiqueta dispara el flujo de wechatia que envía la plantilla.
//  · Si no tiene el celular vinculado, o falla el envío, queda en sus avisos de la app (también cuando sale por plantilla).
// No avisa si el corredor se asignó el lead a sí mismo ni repite el aviso al mismo corredor por el mismo lead.
import { Controller, Get, Header, Injectable, Logger, NotFoundException, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Lead } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Publico } from '../auth/usuario-actual';
import type { Env } from '../config/env';
import { AvisosService } from '../avisos/avisos';
import { WechatiaService, WechatiaError } from './wechatia';
import { EnviadosService } from './enviados';
import { LeadsWaService } from './leads-wa';

/** el botón «Mensaje» de la plantilla: https://<api>/whatsapp/lead/{{1}} → abre el chat directo con el interesado */
const firmar = (secreto: string, id: string) =>
  createHmac('sha256', secreto).update('lead-directo:' + id).digest('hex').slice(0, 16);

export const ETIQUETA_LEAD_ASIGNADO = 'nuevo_lead_asignado';
const CANAL_TXT: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook Messenger',
  email: 'Correo',
  whatsapp: 'WhatsApp',
  portal: 'Portal inmobiliario',
  web: 'Sitio web',
  referido: 'Referido',
  chat: 'Chat',
  otro: 'Otro',
};

/** una variable de plantilla no admite saltos de línea ni quedar vacía */
const campo = (s: unknown, max = 120) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max) || '—';
const monto = (n: unknown, mon?: string | null) => {
  const v = Number(n);
  if (!v) return '';
  return mon === 'UF' ? `${v.toLocaleString('es-CL')} UF` : `$${v.toLocaleString('es-CL')}`;
};

@Injectable()
export class AvisoLeadService {
  private readonly log = new Logger('AvisoLead');
  constructor(
    private readonly db: PrismaService,
    private readonly wa: WechatiaService,
    private readonly enviados: EnviadosService,
    private readonly avisos: AvisosService,
    private readonly leads: LeadsWaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** el enlace del botón (solo la parte variable) y el enlace completo */
  enlace(leadId: string) {
    const token = `${leadId}.${firmar(this.config.get('JWT_SECRETO', { infer: true }), leadId)}`;
    return { token, url: `${this.config.get('API_URL_PUBLICA', { infer: true })}/whatsapp/lead/${token}` };
  }

  /**
   * El botón «Mensaje» ya NO abre el WhatsApp personal del corredor con el interesado (no quedaría registro y rompería el
   * aislamiento entre corredores): devuelve el primer nombre del lead si el enlace es válido, para mostrar cómo responder.
   */
  async destino(token: string): Promise<string | null> {
    const [id, firma] = token.split('.');
    if (!id || !firma) return null;
    const esperado = firmar(this.config.get('JWT_SECRETO', { infer: true }), id);
    if (firma.length !== esperado.length || !timingSafeEqual(Buffer.from(firma), Buffer.from(esperado))) return null;
    const lead = await this.db.lead.findFirst({ where: { id, eliminadoEn: null } });
    if (!lead) return null;
    const d = this.leads.datos(lead);
    return String(d.nombre || d.chatCon || 'el interesado').split(/\s+/)[0];
  }

  /** qué busca, en una línea */
  private busca(d: Record<string, any>) {
    const b = (d.busqueda ?? {}) as Record<string, any>;
    const partes = [
      b.operacion,
      b.tipo,
      Array.isArray(b.comunas) && b.comunas.length ? 'en ' + b.comunas.join(' o ') : '',
      b.dormitorios ? `${b.dormitorios} dorm.` : '',
      b.presupuesto?.valor ? `hasta ${monto(b.presupuesto.valor, b.presupuesto.moneda)}` : '',
    ].filter(Boolean);
    return partes.join(', ') || String(d.resumen ?? '').slice(0, 120) || 'Aún sin datos';
  }

  private async propiedad(corredoraId: string, d: Record<string, any>) {
    const ids = (Array.isArray(d.propiedades) ? d.propiedades : []).filter((x: unknown) => typeof x === 'string');
    if (!ids.length) return 'Sin propiedad asociada';
    const l = await this.db.propiedad.findMany({
      where: { corredoraId, id: { in: ids } },
      select: {
        codigo: true,
        titulo: true,
        direccion: true,
        comuna: true,
        arriendo: true,
        precioArriendo: true,
        monedaArriendo: true,
        precioVenta: true,
        monedaVenta: true,
      },
    });
    if (!l.length) return 'Sin propiedad asociada';
    return l
      .map((p) => {
        const precio = p.arriendo && p.precioArriendo
          ? monto(p.precioArriendo, p.monedaArriendo) + '/mes'
          : monto(p.precioVenta, p.monedaVenta);
        return [p.codigo, [p.direccion, p.comuna].filter(Boolean).join(', ') || p.titulo, precio]
          .filter(Boolean)
          .join(' · ');
      })
      .join(' | ');
  }

  /**
   * `quien`: el usuario que asignó (null si fue wechatia). Nunca lanza: el aviso no puede frenar la asignación.
   */
  async asignado(lead: Lead, corredorId: string, quien: string | null) {
    try {
      if (!corredorId || corredorId === quien) return false;
      const d = this.leads.datos(lead);
      if (d.avisoAsignado?.corredorId === corredorId) return false;
      const co = await this.db.usuario.findFirst({
        where: { id: corredorId, corredoraId: lead.corredoraId, activo: true },
        select: { id: true, nombre: true },
      });
      if (!co) return false;
      const nombre = String(d.nombre || d.chatCon || 'Sin nombre');
      const canal = CANAL_TXT[String(lead.origen ?? '')] ?? String(lead.origen ?? 'Otro');
      const prop = await this.propiedad(lead.corredoraId, d);
      const busca = this.busca(d);
      const enlace = this.enlace(lead.id);
      const texto = [
        '🆕 *Nuevo lead asignado*',
        `Interesado: ${nombre}`,
        `Celular: ${d.telefono || '—'}`,
        `Correo: ${d.email || '—'}`,
        `Canal: ${canal}`,
        `Busca: ${busca}`,
        `Propiedad: ${prop}`,
        `Para responderle: cita este aviso, o escribe «Para ${nombre.split(/\s+/)[0]}: …». Sale por el número de la empresa y queda registrado.`,
      ].join('\n');

      const medio = await this.enviar(lead.corredoraId, co, texto, {
        nombre: campo(co.nombre.split(/\s+/)[0], 40),
        lead_nombre: campo(nombre, 80),
        lead_celular: campo(d.telefono, 30),
        lead_correo: campo(d.email, 80),
        lead_busca: campo(busca),
        propiedad: campo(prop, 160), // el campo «asset_propiedad» ya existe en wechatia
        lead_canal: campo(canal, 40),
        lead_enlace: enlace.token, // lo que va después de /whatsapp/lead/ en el botón «Mensaje»
      });
      if (medio !== 'texto')
        await this.avisos.crear({
          corredoraId: lead.corredoraId,
          usuarioId: co.id,
          tipo: 'lead',
          texto: texto.replace(/\*/g, ''),
          datos: { leadId: lead.id },
        });
      await this.leads.cambiar(lead.id, (dd) => {
        dd.avisoAsignado = { corredorId, en: new Date().toISOString(), medio };
        dd.historial = [
          ...(dd.historial || []),
          {
            fecha: new Date().toISOString(),
            texto: `Se avisó a ${co.nombre} por ${medio === 'app' ? 'la app (no tiene WhatsApp vinculado o no se pudo enviar)' : medio === 'plantilla' ? 'WhatsApp (plantilla)' : 'WhatsApp'}`,
            tipo: 'aviso',
          },
        ].slice(-200);
        return { datos: dd };
      });
      return true;
    } catch (e) {
      this.log.warn(`aviso de lead asignado: ${(e as Error).message}`);
      return false;
    }
  }

  /** 'texto' | 'plantilla' | 'app' */
  private async enviar(
    corredoraId: string,
    co: { id: string; nombre: string },
    texto: string,
    campos: Record<string, string>,
  ): Promise<'texto' | 'plantilla' | 'app'> {
    const v = await this.db.waVinculo.findUnique({ where: { usuarioId: co.id } });
    if (!v?.activo || !v.telefono) return 'app';
    const cli = await this.wa.cliente(corredoraId);
    if (!cli) return 'app';
    try {
      const r = await cli.enviar({ telefono: v.telefono, nombre: co.nombre, texto: texto.slice(0, 3500), revisiones: 2 });
      await this.enviados.registrar(corredoraId, v.telefono, { messageId: r.messageId, texto, enHilo: false });
      return 'texto';
    } catch (e) {
      if (!(e instanceof WechatiaError) || e.codigo !== 'FUERA_24H') {
        this.log.warn(`aviso por WhatsApp: ${(e as Error).message}`);
        return 'app';
      }
    }
    try {
      await cli.enviarPlantilla({ telefono: v.telefono, nombre: co.nombre, etiqueta: ETIQUETA_LEAD_ASIGNADO, campos });
      await this.enviados.registrar(corredoraId, v.telefono, { plantilla: true });
      return 'plantilla';
    } catch (e) {
      this.log.warn(`aviso por plantilla: ${(e as Error).message}`);
      return 'app';
    }
  }
}

/** el botón «Mensaje» de la plantilla de lead asignado: lleva al chat directo con el interesado */
@Controller('whatsapp/lead')
export class AvisoLeadController {
  constructor(private readonly s: AvisoLeadService) {}

  @Publico()
  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async abrir(@Param('token') token: string) {
    const nombre = await this.s.destino(token);
    if (!nombre) throw new NotFoundException('Enlace no válido');
    const n = nombre.replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 40);
    return (
      '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Responder al interesado</title><body style="font-family:system-ui,sans-serif;max-width:28rem;margin:2rem auto;padding:0 1rem;line-height:1.5">' +
      '<h2>Responder al interesado</h2>' +
      `<p>Vuelve a WhatsApp y responde en el chat de Asset:</p><ul><li>cita el aviso del lead, o</li><li>escribe <b>Para ${n}: tu mensaje</b></li></ul>` +
      '<p>El mensaje sale por el número de la empresa y queda registrado en Asset.</p></body></html>'
    );
  }
}
