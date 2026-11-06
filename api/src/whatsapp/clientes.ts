// Atención de clientes por WhatsApp, en el servidor (antes desktop/src/cliente-agente.js, en cada equipo).
//  · Sofía atiende a los LEADS: toma sus datos, busca propiedades que calcen, ofrece horarios libres de la agenda del
//    corredor a cargo y agenda o cambia la visita. La conversación queda en el lead.
//  · Tomás atiende a las PERSONAS del CRM (si la corredora tiene la atención encendida): responde dudas de SUS
//    propiedades y firmas; para agendar, reprogramar o cancelar solo toma el recado y se lo pasa al corredor.
//  · Si el corredor le escribe a mano al cliente (desde wechatia o su celular), el asistente se calla 3 h con esa
//    persona y le avisa. Si tomó la conversación de un lead en la app («atiende» = corredor), solo se registra.
//  · Los avisos van al corredor a cargo (del lead, o captador de la propiedad), o a los administradores; por WhatsApp
//    si tiene el celular vinculado, si no, a sus avisos de la app.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-base-to-string --
   los datos de leads, eventos y fichas son JSON de la app y se leen campo a campo */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Lead, type Propiedad } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ActividadService } from '../comun/actividad.service';
import { PersonasService } from '../personas/personas.service';
import { limpiarRut, rutValido } from '../comun/texto';
import type { UsuarioToken } from '../auth/usuario-actual';
import { IaService, type HerramientaIa, type TurnoIa } from './ia';
import { EnviadosService } from './enviados';
import { EjecutivoService } from './ejecutivo';
import { LeadsWaService, type DatosLead, type MensajeLead } from './leads-wa';
import type { Conversacion, MensajeWa, Wechatia } from './wechatia';
import {
  ATENCION,
  ahora,
  contexto,
  ddmm,
  fechaLarga,
  horaChile,
  horaDe,
  huella,
  hoy,
  norm,
  sumarDias,
  telNorm,
} from './comun';

const PAUSA_H = 3;
const HORA_INI = 9;
const HORA_FIN = 19;
type J = Record<string, any>;

/** quien escribe: un lead (Sofía) o una persona del CRM (Tomás) */
export interface Cliente {
  quien: 'sofia' | 'tomas';
  nombre: string;
  telefono: string;
  personaId: string | null;
  rut: string;
  lead: Lead | null;
  /** el corredor a cargo (del lead; si no, captador de alguna de sus propiedades) */
  corredorId: string | null;
}
interface Ctx {
  wa: Wechatia;
  corredoraId: string;
  cli: Cliente;
  recados: string[];
  propiedades?: Propiedad[];
}

const num = (v: unknown) => (v == null ? null : Number(v));
const precio = (valor: unknown, moneda: string | null) =>
  valor != null
    ? `${moneda === 'CLP' || !moneda ? '$' : ''}${Number(valor).toLocaleString('es-CL')}${moneda && moneda !== 'CLP' ? ' ' + moneda : ''}`
    : null;
const soloDig = (x: unknown) => String(x ?? '').replace(/\D/g, '');
const mapa = (p: Propiedad) =>
  p.lat != null && p.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}${p.placeId ? '&query_place_id=' + encodeURIComponent(p.placeId) : ''}`
    : p.direccion
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.direccion, p.comuna, 'Chile'].filter(Boolean).join(', '))}`
      : null;
const avisosDe = (p: Propiedad) => {
  const out: J[] = [];
  for (const por of Object.values((p.portales ?? {}) as J))
    for (const a of Object.values(por || {})) if (a && typeof a === 'object') out.push(a);
  return out;
};
const sinQuery = (u: unknown) =>
  String(u ?? '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '');

const TOOLS: HerramientaIa[] = [
  {
    name: 'cliente_info',
    description:
      'Datos de ESTE cliente: sus propiedades (ficha pública: dirección, precio, gastos comunes, superficie, dormitorios, baños, estado), sus visitas agendadas, sus documentos en firma y el último enlace de firma que se le envió. Úsala antes de responder cualquier dato.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cliente_estado_firma',
    description:
      'Revisa si un documento de ESTE cliente ya fue firmado (solo operaciones que aparecen en cliente_info).',
    input_schema: { type: 'object', properties: { operacion: { type: 'string' } }, required: ['operacion'] },
  },
  {
    name: 'cliente_recado',
    description:
      'Le pasa un recado al corredor y lo deja anotado en el CRM. Úsala para TODO lo que no puedes resolver tú: agendar, reprogramar o cancelar una visita o reunión, problemas con la firma, negociar precio, dudas legales o cualquier otra cosa. Incluye lo que pide y su disponibilidad.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['agendar_visita', 'agendar_reunion', 'reprogramar', 'cancelar', 'firma', 'consulta', 'otro'],
        },
        detalle: { type: 'string', description: 'Qué necesita, en una o dos frases, con la propiedad si aplica' },
        disponibilidad: { type: 'string', description: 'Días y horarios que dio el cliente, si los dio' },
      },
      required: ['tipo', 'detalle'],
    },
  },
];
const TOOLS_LEAD: HerramientaIa[] = [
  {
    name: 'lead_guardar_datos',
    description:
      'Guarda en el lead lo que el interesado te contó: nombre completo, RUT, correo y qué busca. Úsala apenas te dé un dato nuevo.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        rut: { type: 'string' },
        email: { type: 'string' },
        operacion: { type: 'string', enum: ['arriendo', 'venta'] },
        tipo: { type: 'string', description: 'departamento, casa, oficina…' },
        comunas: { type: 'array', items: { type: 'string' } },
        dormitorios: { type: 'number' },
        banos: { type: 'number' },
        presupuesto: { type: 'number', description: 'Monto' },
        moneda: { type: 'string', enum: ['CLP', 'UF'] },
        cuando: { type: 'string', description: 'Para cuándo lo necesita' },
        estacionamiento: { type: 'boolean' },
        mascotas: { type: 'boolean' },
      },
    },
  },
  {
    name: 'lead_buscar_propiedades',
    description:
      'Busca en la cartera propiedades disponibles que calcen con lo que busca el interesado (datos públicos de la ficha). Devuelve el código para agendar.',
    input_schema: {
      type: 'object',
      properties: {
        operacion: { type: 'string', enum: ['arriendo', 'venta'] },
        comuna: { type: 'string' },
        dormitorios: { type: 'number' },
        presupuesto: { type: 'number' },
        texto: { type: 'string', description: 'Dirección, código o palabras de la ficha' },
      },
    },
  },
  {
    name: 'lead_horarios',
    description:
      'Horarios libres de la agenda del corredor para una visita en los próximos días (no choca con otros eventos).',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'AAAA-MM-DD; por defecto mañana' },
        dias: { type: 'number', description: 'Cuántos días mirar (máx. 10)' },
      },
    },
  },
  {
    name: 'lead_agendar_visita',
    description:
      'Agenda la visita del interesado a una propiedad en la agenda del corredor. Úsala SOLO cuando el interesado ya eligió propiedad, día y hora.',
    input_schema: {
      type: 'object',
      properties: {
        propiedad: {
          type: 'string',
          description:
            'Código de la ficha (de cliente_info o lead_buscar_propiedades), o el código o link del aviso del portal que mandó el cliente',
        },
        fecha: { type: 'string', description: 'AAAA-MM-DD' },
        hora: { type: 'string', description: 'HH:MM' },
      },
      required: ['propiedad', 'fecha', 'hora'],
    },
  },
  {
    name: 'lead_cambiar_visita',
    description: 'Reprograma o cancela una visita YA agendada de este interesado (las que aparecen en cliente_info).',
    input_schema: {
      type: 'object',
      properties: {
        fecha_actual: { type: 'string', description: 'AAAA-MM-DD de la visita que se cambia' },
        cancelar: { type: 'boolean' },
        fecha: { type: 'string' },
        hora: { type: 'string' },
      },
      required: ['fecha_actual'],
    },
  },
];
const TIP: Record<string, string> = {
  agendar_visita: 'Quiere agendar una visita',
  agendar_reunion: 'Quiere agendar una reunión',
  reprogramar: 'Quiere reprogramar',
  cancelar: 'Quiere cancelar',
  firma: 'Tema de firma',
  consulta: 'Consulta',
  otro: 'Recado',
};
/** mensajes que manda Asset con plantilla o texto fijo: no son «a mano» */
const FIJOS =
  /te saluda .* de portalfirma\. te escribo por|te recordamos tu visita a la propiedad|tienes un documento pendiente de firma|de portalfirma\. te escribo por tu interes|te confirmamos tu visita a la propiedad/;

@Injectable()
export class ClientesService {
  private readonly log = new Logger('Clientes');
  constructor(
    private readonly db: PrismaService,
    private readonly ia: IaService,
    private readonly enviados: EnviadosService,
    private readonly ejecutivo: EjecutivoService,
    private readonly leads: LeadsWaService,
    private readonly actividad: ActividadService,
    private readonly personas: PersonasService,
  ) {}

  // ------------------------------------------------------------------ quién escribe

  /** un lead (siempre) o una persona del CRM (si la atención de clientes está encendida) */
  async quien(corredoraId: string, telefono: string | null, clientesActivo: boolean): Promise<Cliente | null> {
    const t = telNorm(telefono);
    if (!t) return null;
    const lead = await this.leads.porTelefono(corredoraId, t);
    const per = await this.db.$queryRaw<{ id: string; nombre: string; rut: string | null }[]>`
      SELECT id, nombre, rut FROM personas WHERE corredora_id = ${corredoraId}::uuid AND eliminado_en IS NULL
        AND telefono IS NOT NULL AND right(regexp_replace(telefono, '\\D', '', 'g'), 9) = ${t}
      ORDER BY creado_en LIMIT 1`.then((l) => l[0] ?? null);
    if (lead) {
      const d = this.leads.datos(lead);
      return {
        quien: 'sofia',
        nombre: d.nombre || d.chatCon || per?.nombre || d.telefono || String(telefono),
        telefono: d.telefono || String(telefono),
        personaId: lead.personaId ?? per?.id ?? null,
        rut: d.rut || per?.rut || '',
        lead,
        corredorId: lead.corredorId,
      };
    }
    if (!per || !clientesActivo) return null;
    const cap = await this.db.$queryRaw<{ captador_id: string | null }[]>`
      SELECT p.captador_id FROM propiedad_personas v JOIN propiedades p ON p.id = v.propiedad_id
      WHERE v.persona_id = ${per.id}::uuid AND p.captador_id IS NOT NULL AND p.eliminado_en IS NULL LIMIT 1`;
    return {
      quien: 'tomas',
      nombre: per.nombre,
      telefono: String(telefono),
      personaId: per.id,
      rut: per.rut ?? '',
      lead: null,
      corredorId: cap[0]?.captador_id ?? null,
    };
  }

  // ------------------------------------------------------------------ pausas (la app: «Reanudar», pausar a alguien)

  async pausa(corredoraId: string, telefono: string) {
    const t = telNorm(telefono);
    if (!t) return null;
    const h = await this.db.waHilo.findUnique({
      where: { corredoraId_telefonoNorm: { corredoraId, telefonoNorm: t } },
    });
    return h?.pausaHasta && h.pausaHasta > new Date() ? h.pausaHasta.toISOString() : null;
  }
  async pausar(corredoraId: string, telefono: string, horas = PAUSA_H) {
    const t = telNorm(telefono);
    if (!t) return null;
    const pausaHasta = new Date(Date.now() + horas * 36e5);
    await this.db.waHilo.upsert({
      where: { corredoraId_telefonoNorm: { corredoraId, telefonoNorm: t } },
      create: { corredoraId, telefonoNorm: t, pausaHasta },
      update: { pausaHasta },
    });
    return pausaHasta.toISOString();
  }
  async reanudar(corredoraId: string, telefono: string) {
    const t = telNorm(telefono);
    if (t)
      await this.db.waHilo.updateMany({
        where: { corredoraId, telefonoNorm: t },
        data: { pausaHasta: null, visto: new Date() },
      });
    return true;
  }

  // ------------------------------------------------------------------ lo que el asistente sabe de ESTE cliente

  private async cartera(c: Ctx) {
    c.propiedades ??= await this.db.propiedad.findMany({
      where: { corredoraId: c.corredoraId, eliminadoEn: null, archivada: false },
    });
    return c.propiedades;
  }

  private async propPorRef(c: Ctx, ref: unknown) {
    const r = String(ref ?? '').trim();
    if (!r) return null;
    const n = norm(r);
    const ps = await this.cartera(c);
    const exacta = ps.find((p) => norm(p.codigo) === n || p.id === r);
    if (exacta) return exacta;
    const ml = r.match(/MLC-?\s?(\d{6,})/i);
    if (ml) {
      const p = ps.find((x) =>
        avisosDe(x).some(
          (a) =>
            soloDig(a.itemId) === ml[1] || soloDig(String(a.permalink || '').match(/MLC-?(\d{6,})/i)?.[1]) === ml[1],
        ),
      );
      if (p) return p;
    }
    const url = r.match(/https?:\/\/\S+/i)?.[0];
    if (url) {
      const u = sinQuery(url);
      const p = ps.find((x) => avisosDe(x).some((a) => [a.permalink, a.url].some((v) => v && sinQuery(v) === u)));
      if (p) return p;
    }
    const cod = r.match(/\b[A-Z]{1,4}-?\d{2,6}\b/i)?.[0];
    if (cod) {
      const p = ps.find(
        (x) => norm(x.codigo) === norm(cod) || norm(x.codigo.replace('-', '')) === norm(cod.replace('-', '')),
      );
      if (p) return p;
    }
    return null;
  }

  /** las propiedades que el cliente nombra en su mensaje (link, código del portal o de la ficha) */
  private async refsEnTexto(c: Ctx, t: string) {
    const out: Propiedad[] = [];
    for (const m of t.matchAll(/https?:\/\/\S+|MLC-?\s?\d{6,}|\b[A-Z]{1,4}-?\d{3,6}\b/gi)) {
      const p = await this.propPorRef(c, m[0]);
      if (p && !out.includes(p)) out.push(p);
    }
    return out;
  }

  private publica(p: Propiedad) {
    const o: J = {};
    for (const k of [
      'codigo',
      'titulo',
      'tipo',
      'direccion',
      'unidad',
      'comuna',
      'dormitorios',
      'banos',
      'estacionamientos',
      'bodegas',
      'amoblado',
    ] as const)
      if (p[k] != null && p[k] !== '') o[k] = p[k];
    for (const k of ['supTotal', 'supUtil', 'gastosComunes'] as const) if (p[k] != null) o[k] = num(p[k]);
    if (p.venta) o.venta = { precio: precio(p.precioVenta, p.monedaVenta), estado: p.estadoVenta };
    if (p.arriendo) o.arriendo = { precio: precio(p.precioArriendo, p.monedaArriendo), estado: p.estadoArriendo };
    if (p.descripcion) o.descripcion = p.descripcion.slice(0, 700);
    const m = mapa(p);
    if (m) o.mapa = m;
    return o;
  }

  private async propiedadesDe(c: Ctx) {
    const ids = new Set<string>(c.cli.lead ? ((this.leads.datos(c.cli.lead).propiedades as string[]) ?? []) : []);
    const roles = new Map<string, string[]>();
    if (c.cli.personaId) {
      const v = await this.db.propiedadPersona.findMany({ where: { personaId: c.cli.personaId } });
      for (const x of v) {
        ids.add(x.propiedadId);
        roles.set(x.propiedadId, [...(roles.get(x.propiedadId) ?? []), x.rol]);
      }
    }
    return { props: (await this.cartera(c)).filter((p) => ids.has(p.id)), roles };
  }

  private async eventosDe(c: Ctx, desde: string, hasta?: string) {
    const ors: Prisma.EventoWhereInput[] = [];
    if (c.cli.personaId) ors.push({ personaIds: { has: c.cli.personaId } });
    if (c.cli.lead) ors.push({ datos: { path: ['ext', 'id'], equals: c.cli.lead.id } });
    if (!ors.length) return [];
    return this.db.evento.findMany({
      where: {
        corredoraId: c.corredoraId,
        eliminadoEn: null,
        estado: { not: 'cancelado' },
        fecha: { gte: new Date(desde + 'T00:00:00Z'), ...(hasta ? { lte: new Date(hasta + 'T00:00:00Z') } : {}) },
        OR: ors,
      },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
      take: 10,
    });
  }

  private async info(c: Ctx) {
    const { props, roles } = await this.propiedadesDe(c);
    const propiedades = props.map((p) => ({ ...this.publica(p), suRol: roles.get(p.id) ?? [] }));
    const visitas = (await this.eventosDe(c, hoy())).slice(0, 5).map((e) => {
      const p = props.find((x) => x.id === e.propiedadId);
      return {
        fecha: e.fecha.toISOString().slice(0, 10),
        hora: e.hora,
        tipo: e.tipo,
        propiedad: p?.titulo || p?.direccion || null,
        estado: e.estado,
      };
    });
    const firmas: J[] = [];
    if (props.length) {
      const fs = await this.db.firma.findMany({
        where: { corredoraId: c.corredoraId, eliminadoEn: null, propiedadIds: { hasSome: props.map((p) => p.id) } },
        orderBy: { enviadoEn: 'desc' },
        take: 20,
      });
      for (const f of fs)
        if (
          ((f.firmantes ?? []) as J[]).some(
            (s) =>
              (c.cli.personaId && s.personaId === c.cli.personaId) ||
              (s.rut && c.cli.rut && limpiarRut(s.rut) === limpiarRut(c.cli.rut)),
          )
        )
          firmas.push({
            documento: f.documento,
            operacion: f.operacion,
            fecha: f.enviadoEn.toISOString().slice(0, 10),
            estado: f.estado,
          });
    }
    const enl = c.cli.personaId
      ? await this.db.registro.findUnique({
          where: {
            corredoraId_coleccion_id: { corredoraId: c.corredoraId, coleccion: 'enlaces_firma', id: c.cli.personaId },
          },
        })
      : null;
    const busca = c.cli.lead ? this.leads.datos(c.cli.lead).busqueda : null;
    const corredor = await this.nombreCorredor(c);
    return {
      cliente: { nombre: c.cli.nombre, ...(busca && Object.keys(busca).length ? { loQueBusca: busca } : {}) },
      corredor,
      propiedades,
      visitasAgendadas: visitas,
      documentosEnFirma: firmas.slice(0, 6),
      ultimoEnlaceDeFirma: enl && !enl.eliminadoEn ? enl.datos : null,
    };
  }

  private async nombreCorredor(c: { corredoraId: string; cli: Cliente }) {
    if (c.cli.corredorId) {
      const u = await this.db.usuario.findUnique({ where: { id: c.cli.corredorId }, select: { nombre: true } });
      if (u) return u.nombre;
    }
    const cfg = await this.db.registro.findUnique({
      where: {
        corredoraId_coleccion_id: { corredoraId: c.corredoraId, coleccion: 'corredora_config', id: 'corredora' },
      },
    });
    const d = (cfg?.datos ?? {}) as J;
    return String(
      d.corredor?.nombre ||
        d.nombre ||
        (await this.db.corredora.findUnique({ where: { id: c.corredoraId } }))?.nombre ||
        'tu corredor',
    );
  }

  /** ¿el corredor tiene libre esa hora? (visitas de 45 min; mira su agenda, o la de toda la corredora si no tiene) */
  private async libre(c: Ctx, fecha: string, hora: string, sinId: string | null = null) {
    const evs = await this.db.evento.findMany({
      where: {
        corredoraId: c.corredoraId,
        eliminadoEn: null,
        estado: { not: 'cancelado' },
        fecha: new Date(fecha + 'T00:00:00Z'),
        ...(c.cli.corredorId ? { corredorId: c.cli.corredorId } : {}),
      },
    });
    const [h, m] = hora.split(':').map(Number);
    const t = h * 60 + m;
    return !evs.some((e) => {
      if (e.id === sinId || !e.hora) return false;
      const [eh, em] = e.hora.split(':').map(Number);
      const ei = eh * 60 + em;
      const dur = Number(((e.datos ?? {}) as J).duracion) || 45;
      return t < ei + dur && ei < t + 45;
    });
  }

  // ------------------------------------------------------------------ herramientas

  private async avisar(c: Ctx, texto: string) {
    return this.ejecutivo
      .avisarResponsables(c.corredoraId, c.cli.corredorId, texto, c.cli.quien, c.wa)
      .catch(() => false);
  }

  private async registrarPersona(c: Ctx, texto: string, ref2?: string) {
    if (!c.cli.personaId) return;
    await this.actividad
      .registrar({
        corredoraId: c.corredoraId,
        entidadTipo: 'persona',
        entidadId: c.cli.personaId,
        texto: texto.slice(0, 500),
        ...(ref2 ? { ref2 } : {}),
      })
      .catch(() => null);
  }

  /** un usuario de la corredora en cuyo nombre actúa el asistente (el corredor a cargo o un administrador) */
  private async como(c: Ctx): Promise<UsuarioToken> {
    const ids = await this.ejecutivo.responsables(c.corredoraId, c.cli.corredorId);
    return { sub: ids[0], corredoraId: c.corredoraId, rol: 'ADMIN', sid: 'asistente' };
  }

  /** la persona del lead en el CRM (se crea si dio su RUT) */
  private async personaDelLead(c: Ctx) {
    if (c.cli.personaId) return c.cli.personaId;
    const l = c.cli.lead;
    if (!l) return null;
    const d = this.leads.datos(l);
    if (!d.rut) return null;
    let id: string | null = null;
    try {
      const p = await this.personas.crear(await this.como(c), {
        nombre: d.nombre || c.cli.nombre,
        rut: d.rut,
        email: d.email || null,
        telefono: d.telefono || c.cli.telefono,
        roles: ['interesado'],
      });
      id = (p as { id: string }).id;
    } catch {
      const x = await this.db.persona.findFirst({
        where: { corredoraId: c.corredoraId, rut: limpiarRut(d.rut), eliminadoEn: null },
      });
      id = x?.id ?? null;
    }
    if (id) {
      await this.leads.cambiar(l.id, () => ({ cols: { personaId: id } }));
      c.cli.personaId = id;
    }
    return id;
  }

  private async ejecutarLead(c: Ctx, nombre: string, a: J): Promise<unknown> {
    const l = c.cli.lead ? await this.db.lead.findUnique({ where: { id: c.cli.lead.id } }) : null;
    if (!l || l.eliminadoEn) return { error: 'Este interesado ya no está en Leads.' };
    c.cli.lead = l;
    if (nombre === 'lead_guardar_datos') {
      const cambio: J = {};
      for (const k of ['nombre', 'rut', 'email']) if (a[k]) cambio[k] = String(a[k]).trim().slice(0, 120);
      if (cambio.rut && !rutValido(cambio.rut)) return { error: 'Ese RUT no es válido: pídele que lo revise.' };
      if (cambio.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cambio.email))
        return { error: 'Ese correo no es válido: pídele que lo revise.' };
      const b: J = {};
      for (const k of ['operacion', 'tipo', 'comunas', 'dormitorios', 'banos', 'cuando', 'estacionamiento', 'mascotas'])
        if (a[k] != null && a[k] !== '') b[k] = a[k];
      if (a.presupuesto)
        b.presupuesto = {
          valor: Number(a.presupuesto),
          moneda: a.moneda || (Number(a.presupuesto) < 100000 ? 'UF' : 'CLP'),
        };
      const r = await this.leads.cambiar(l.id, (d) => {
        Object.assign(d, cambio);
        if (Object.keys(b).length) d.busqueda = { ...(d.busqueda || {}), ...b };
        d.actualizado = new Date().toISOString();
        return { datos: d, cols: cambio.email ? { email: String(cambio.email).toLowerCase() } : {} };
      });
      if (r) c.cli.lead = r;
      if (cambio.nombre) c.cli.nombre = cambio.nombre;
      if (cambio.rut) c.cli.rut = cambio.rut;
      return { ok: true, guardado: [...Object.keys(cambio), ...(Object.keys(b).length ? ['busqueda'] : [])] };
    }
    if (nombre === 'lead_buscar_propiedades') {
      const t = norm(a.texto);
      const ps = (await this.cartera(c)).filter((p) => {
        if (a.operacion === 'venta' && !p.venta) return false;
        if (a.operacion === 'arriendo' && !p.arriendo) return false;
        if (a.comuna && !norm(p.comuna).includes(norm(a.comuna))) return false;
        if (a.dormitorios && Number(p.dormitorios || 0) < Number(a.dormitorios)) return false;
        if (a.presupuesto) {
          const pr = a.operacion === 'venta' ? p.precioVenta : (p.precioArriendo ?? p.precioVenta);
          if (pr != null && Number(pr) > Number(a.presupuesto) * 1.1) return false;
        }
        return !t || norm([p.codigo, p.titulo, p.direccion, p.comuna, p.descripcion].join(' ')).includes(t);
      });
      return {
        propiedades: ps.slice(0, 6).map((p) => ({
          codigo: p.codigo,
          titulo: p.titulo,
          direccion: p.direccion,
          comuna: p.comuna,
          dormitorios: p.dormitorios,
          banos: p.banos,
          gastosComunes: num(p.gastosComunes),
          arriendo: p.arriendo ? precio(p.precioArriendo, p.monedaArriendo) : null,
          venta: p.venta ? precio(p.precioVenta, p.monedaVenta) : null,
        })),
        total: ps.length,
      };
    }
    if (nombre === 'lead_horarios') {
      const h0 = hoy();
      const f0 =
        typeof a.desde === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.desde) && a.desde >= h0
          ? a.desde
          : sumarDias(h0, 1);
      const dias = Math.min(10, Math.max(1, Number(a.dias) || 5));
      const [ah, am] = ahora().split(':').map(Number);
      const minHoy = ah * 60 + am + 120; // hoy, con al menos 2 h de aviso
      const out: J[] = [];
      for (let i = 0; i < dias && out.length < 12; i++) {
        const f = sumarDias(f0, i);
        const dw = new Date(`${f}T12:00:00Z`).getUTCDay();
        if (dw === 0) continue;
        const libres: string[] = [];
        for (let h = HORA_INI; h < (dw === 6 ? 14 : HORA_FIN); h++) {
          const hh = String(h).padStart(2, '0') + ':00';
          if (f === h0 && h * 60 < minHoy) continue;
          if (await this.libre(c, f, hh)) libres.push(hh);
        }
        if (libres.length) out.push({ fecha: f, dia: fechaLarga(f), horas: libres.slice(0, 6) });
      }
      return { horarios: out, nota: 'Ofrece 2 o 3 opciones, no la lista entera.' };
    }
    if (nombre === 'lead_agendar_visita') {
      const p = await this.propPorRef(c, a.propiedad);
      if (!p) return { error: 'No encontré esa propiedad: usa el código de cliente_info o lead_buscar_propiedades.' };
      const fecha = String(a.fecha || '');
      const hora = String(a.hora || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora))
        return { error: 'Fecha AAAA-MM-DD y hora HH:MM.' };
      if (fecha < hoy() || (fecha === hoy() && hora <= ahora()))
        return { error: 'Ese día u hora ya pasó (hora de Chile): ofrece otro con lead_horarios.' };
      if (!(await this.libre(c, fecha, hora)))
        return { error: 'Ese horario ya está ocupado en la agenda: ofrece otro con lead_horarios.' };
      const pid = await this.personaDelLead(c);
      const ahoraIso = new Date().toISOString();
      const id = 'v' + Date.now().toString(36) + randomBytes(2).toString('hex');
      const lugar = [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna]
        .filter(Boolean)
        .join(', ')
        .slice(0, 200);
      await this.db.evento.create({
        data: {
          id,
          corredoraId: c.corredoraId,
          tipo: 'visita',
          estado: 'programado',
          fecha: new Date(fecha + 'T00:00:00Z'),
          hora,
          propiedadId: p.id,
          personaIds: pid ? [pid] : [],
          corredorId: l.corredorId ?? p.captadorId ?? null,
          datos: {
            titulo: ['Visita', `${p.codigo} ${p.titulo || ''}`.trim(), c.cli.nombre].join(' · ').slice(0, 120),
            duracion: 45,
            lugar,
            notas: `Agendada por Sofía por WhatsApp con ${c.cli.nombre} (${c.cli.telefono})`,
            orden: null,
            ext: { fuente: 'lead', id: l.id },
            creado: ahoraIso,
            actualizado: ahoraIso,
          },
        },
      });
      const cuando = `${fecha} ${hora}`;
      await this.actividad
        .registrar([
          {
            corredoraId: c.corredoraId,
            entidadTipo: 'evento',
            entidadId: id,
            texto: `Visita agendada para ${cuando} (Sofía, por WhatsApp)`,
            ref2: p.id,
          },
          {
            corredoraId: c.corredoraId,
            entidadTipo: 'propiedad',
            entidadId: p.id,
            texto: `Visita agendada para ${cuando} con ${c.cli.nombre} (Sofía, por WhatsApp)`,
            ref2: id,
          },
          ...(pid
            ? [
                {
                  corredoraId: c.corredoraId,
                  entidadTipo: 'persona' as const,
                  entidadId: pid,
                  texto: `Visita agendada para ${cuando} en ${p.codigo}`,
                  ref2: id,
                },
              ]
            : []),
        ])
        .catch(() => null);
      if (pid) {
        const r = await this.db.propiedadPersona.createMany({
          data: [{ propiedadId: p.id, personaId: pid, rol: 'interesado' }],
          skipDuplicates: true,
        });
        if (r.count) await this.db.propiedad.update({ where: { id: p.id }, data: { version: { increment: 1 } } });
      }
      const r = await this.leads.cambiar(l.id, (d, act) => {
        d.propiedades = [...new Set([...(d.propiedades || []), p.id])];
        d.proximaAccion = { texto: `Visita ${p.codigo} el ${ddmm(fecha)} ${hora}`, fecha };
        d.actualizado = new Date().toISOString();
        return { datos: d, cols: act.estado === 'ganado' || act.estado === 'perdido' ? {} : { estado: 'visita' } };
      });
      if (r) c.cli.lead = r;
      const d = this.leads.datos(c.cli.lead);
      const falta = [!d.rut && 'RUT', !d.email && 'correo'].filter(Boolean) as string[];
      await this.avisar(
        c,
        `📅 *Visita agendada por Sofía*\n${c.cli.nombre} (${c.cli.telefono}) · ${p.codigo} ${p.titulo || ''}\n${ddmm(fecha)} a las ${hora}${
          falta.length
            ? `\nAún le falta: ${falta.join(' y ')} (para la orden de visita).`
            : `\nTiene RUT y correo: si quieres la orden de visita, pídesela a Juanita.`
        }`,
      );
      return {
        ok: true,
        agendada: { propiedad: p.codigo, direccion: lugar, mapa: mapa(p), fecha, hora },
        ...(falta.length ? { pedir: `Pídele ${falta.join(' y ')} para preparar la orden de visita.` } : {}),
      };
    }
    if (nombre === 'lead_cambiar_visita') {
      const f = String(a.fecha_actual || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return { error: 'Indica la fecha de la visita (AAAA-MM-DD).' };
      const e = (await this.eventosDe(c, f, f)).find((x) => x.tipo === 'visita');
      if (!e) return { error: 'No encontré una visita de este interesado ese día.' };
      const p = e.propiedadId ? (await this.cartera(c)).find((x) => x.id === e.propiedadId) : null;
      const datos = { ...((e.datos ?? {}) as J), actualizado: new Date().toISOString() };
      if (a.cancelar) {
        await this.db.evento.update({
          where: { id: e.id },
          data: { estado: 'cancelado', datos, version: { increment: 1 } },
        });
        await this.avisar(
          c,
          `❌ ${c.cli.nombre} canceló la visita del ${ddmm(f)} ${e.hora || ''} (${p?.codigo || ''}).`,
        );
        return { ok: true, cancelada: true };
      }
      const fecha = String(a.fecha || '');
      const hora = String(a.hora || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora))
        return { error: 'Para reprogramar necesito fecha y hora nuevas.' };
      if (!(await this.libre(c, fecha, hora, e.id)))
        return { error: 'Ese horario está ocupado: ofrece otro con lead_horarios.' };
      await this.db.evento.update({
        where: { id: e.id },
        data: { fecha: new Date(fecha + 'T00:00:00Z'), hora, datos, version: { increment: 1 } },
      });
      await this.avisar(
        c,
        `🔁 Sofía reprogramó la visita de ${c.cli.nombre} (${p?.codigo || ''}): ahora ${ddmm(fecha)} a las ${hora}.`,
      );
      return { ok: true, reprogramada: { fecha, hora } };
    }
    return { error: 'Herramienta desconocida' };
  }

  private async ejecutar(c: Ctx, nombre: string, a: J): Promise<unknown> {
    if (c.cli.lead && nombre.startsWith('lead_')) return this.ejecutarLead(c, nombre, a);
    if (nombre === 'cliente_info') return this.info(c);
    if (nombre === 'cliente_estado_firma') {
      const op = soloDig(a.operacion);
      const info = await this.info(c);
      if (!info.documentosEnFirma.some((f) => String(f.operacion) === op))
        return { error: 'Esa operación no es de este cliente.' };
      const f = await this.db.firma.findFirst({ where: { corredoraId: c.corredoraId, operacion: Number(op) } });
      if (!f) return { error: 'No encontré ese documento.' };
      const yo = ((f.firmantes ?? []) as J[]).find(
        (s) =>
          (c.cli.personaId && s.personaId === c.cli.personaId) ||
          (c.cli.rut && s.rut && limpiarRut(s.rut) === limpiarRut(c.cli.rut)) ||
          norm(s.nombre) === norm(c.cli.nombre),
      );
      return {
        documento: f.documento,
        estado: f.estado === 'firmado' ? 'firmado por todos' : f.estado,
        firmados: `${f.firmados} de ${f.total}`,
        esteClienteFirmo: yo ? !!yo.firmo : null,
        revisado: f.revisadoEn?.toISOString() ?? null,
      };
    }
    if (nombre === 'cliente_recado') {
      const tipo = TIP[String(a.tipo)] ? String(a.tipo) : 'otro';
      const detalle = String(a.detalle || '').slice(0, 400);
      const disp = a.disponibilidad ? String(a.disponibilidad).slice(0, 200) : '';
      const yo = ATENCION[c.cli.quien].nombre;
      await this.registrarPersona(
        c,
        `WhatsApp · ${TIP[tipo]}: ${detalle.slice(0, 200)}${disp ? ' · Disponibilidad: ' + disp : ''}`,
      );
      const avisado = await this.avisar(
        c,
        `📩 *Recado de ${c.cli.nombre}* (${c.cli.telefono})\n${TIP[tipo]}: ${detalle}${disp ? `\nDisponibilidad: ${disp}` : ''}\n(Lo atendió ${yo} por WhatsApp${c.cli.lead ? '; la conversación está en Leads, donde puedes tomarla' : ''}.)`,
      );
      c.recados.push(tipo);
      return {
        ok: true,
        avisado,
        instruccion: `Dile al cliente que le pasaste el recado a ${await this.nombreCorredor(c)} y que le confirmará. No prometas fecha ni hora.`,
      };
    }
    return { error: 'Herramienta desconocida' };
  }

  private sistema(cli: Cliente, corredor: string, primera: boolean) {
    const yo = ATENCION[cli.quien].nombre;
    const lead = !!cli.lead;
    return `Eres ${yo}, asistente virtual de ${corredor}, corredor de propiedades que trabaja con PortalFirma. Atiendes por WhatsApp a ${cli.nombre}, cliente de ${corredor}.
- ${contexto()} Usa siempre esta fecha y hora para «hoy», «mañana» o «el jueves»; nunca ofrezcas horarios que ya pasaron.
- Escribe en español de Chile, cercano, breve (2 a 4 líneas), sin firmas ni encabezados.${primera ? `\n- Es el primer mensaje de esta conversación: preséntate en una línea («Hola ${String(cli.nombre || '').split(' ')[0]}, soy ${yo}, asistente de ${corredor}»).` : ''}
- Antes de dar cualquier dato, usa cliente_info. Responde SOLO con lo que entrega: nunca inventes precios, fechas, direcciones ni plazos. Si un dato no está, dilo y ofrece consultarlo con ${corredor} (cliente_recado).
- Solo hablas de las propiedades, visitas y documentos de este cliente.${lead ? ` Es un interesado (lead): si busca algo y no hay una propiedad que calce, pregunta qué busca (comuna, dormitorios, presupuesto) y pásaselo a ${corredor} con cliente_recado.` : ''} Nunca entregues datos de otras personas ni notas internas.
${
  lead
    ? `- Es un INTERESADO (lead) y tú llevas todo lo suyo. Tu objetivo: conocer qué busca y agendarle una visita.
  · Toma sus datos de a poco y guárdalos con lead_guardar_datos: qué busca (operación, comuna, dormitorios, presupuesto, para cuándo), nombre completo, y antes o después de agendar, RUT y correo (se usan para la orden de visita). Máximo una o dos preguntas por mensaje.
  · Si pregunta por una propiedad, usa cliente_info; si busca otra cosa, lead_buscar_propiedades. Si su mensaje trae el link o el código del aviso (por ejemplo MLC-1234567890), ya viene identificada en la nota interna: no le pidas el código de nuevo.
  · Si el corredor te pidió coordinar una visita (la conversación la inició él y ya hay una propiedad en cliente_info), al responder ofrécele de inmediato 2 o 3 horarios de lead_horarios para esa propiedad.
  · Para visitar: ofrece 2 o 3 horarios de lead_horarios, y cuando elija, agéndala con lead_agendar_visita y confírmale día, hora, dirección y el link de Google Maps (campo mapa) para que llegue sin problemas. Si quiere cambiarla o cancelarla, usa lead_cambiar_visita.
  · Negociación de precio, condiciones del contrato o dudas legales: cliente_recado.`
    : `- Visitas y reuniones: NO puedes agendar, confirmar, reprogramar ni cancelar. Pregunta qué necesita y su disponibilidad (días y horarios) en una sola pregunta, luego usa cliente_recado y dile que ${corredor} le confirmará. Nunca digas que quedó agendado.`
}
- Firma: el enlace para firmar le llega por correo desde Portalfirma (y a veces por este WhatsApp). Si lo pide y hay ultimoEnlaceDeFirma, compártelo. Puedes revisar si ya firmó con cliente_estado_firma. Si tiene un problema o dudas del contrato, usa cliente_recado.
- Precio, negociación, dudas legales o cualquier otro tema: cliente_recado y dile que ${corredor} lo contactará.
- Si te preguntan si eres una persona, di con naturalidad que eres el asistente virtual de ${corredor}.`;
  }

  // ------------------------------------------------------------------ un mensaje entrante

  private manuales(recientes: MensajeWa[], propios: { ids: Set<string>; huellas: Set<string>; plantillas: number[] }) {
    return recientes.filter((x) => {
      if (x.direccion !== 'saliente') return false;
      const t = new Date(x.fecha).getTime();
      if (propios.ids.has(x.id) || propios.huellas.has(huella(x.texto))) return false;
      if (propios.plantillas.some((p) => Math.abs(t - p) < 10 * 6e4)) return false;
      if (/template|plantilla/i.test(x.tipo) || /workflow|automation|campaign|api/i.test(x.origen)) return false;
      if (FIJOS.test(norm(x.texto))) return false;
      return !!x.usuarioId || /^(app|manual|mobile)/i.test(x.origen);
    });
  }

  /**
   * Los mensajes nuevos de un cliente (llegados juntos se responden en una sola vuelta). `recientes` es todo lo llegado
   * a la conversación desde la última lectura (para ver si el corredor escribió a mano). Devuelve true si respondió.
   */
  async manejar(
    wa: Wechatia,
    corredoraId: string,
    cv: Conversacion,
    cli: Cliente,
    nuevos: MensajeWa[],
    recientes: MensajeWa[],
  ) {
    const t = telNorm(cv.telefono)!;
    const c: Ctx = { wa, corredoraId, cli, recados: [] };
    const yo = ATENCION[cli.quien];
    let h = await this.db.waHilo.findUnique({ where: { corredoraId_telefonoNorm: { corredoraId, telefonoNorm: t } } });
    const propios = await this.enviados.propios(corredoraId, t, new Date(Date.now() - 2 * 864e5));
    const manuales = this.manuales(recientes, propios);
    const cambios: Prisma.WaHiloUpdateInput = {};
    let pausaHasta = h?.pausaHasta ?? null;
    if (manuales.length) {
      pausaHasta = new Date(Date.now() + PAUSA_H * 36e5);
      cambios.pausaHasta = pausaHasta;
      cambios.visto = new Date(manuales.at(-1)!.fecha);
    }
    // la conversación queda en el lead (lo del cliente y lo que escribió el corredor a mano)
    if (cli.lead) {
      const nombreCli = cli.nombre;
      const corredor = await this.nombreCorredor(c);
      const ms: MensajeLead[] = [
        ...manuales.map((m) => ({
          k: 'wc' + m.id,
          fecha: horaChile(new Date(m.fecha)),
          de: 'broker' as const,
          autor: corredor,
          texto: m.texto || '📎 Archivo',
        })),
        ...nuevos.map((m) => ({
          k: 'wc' + m.id,
          fecha: horaChile(new Date(m.fecha)),
          de: 'cliente' as const,
          autor: nombreCli,
          texto: m.texto.trim() || (m.adjuntos.length ? '📎 Envió un archivo (míralo en wechatia)' : ''),
        })),
      ].filter((m) => m.texto);
      await this.leads.anotar(cli.lead, ms, { atiende: true });
    }
    const texto = nuevos
      .map((m) => m.texto.trim())
      .filter(Boolean)
      .join('\n');
    const adjuntos = nuevos.flatMap((m) => m.adjuntos);
    const guardar = async (extra: Prisma.WaHiloUpdateInput = {}) => {
      const d = { ...cambios, ...extra };
      h = await this.db.waHilo.upsert({
        where: { corredoraId_telefonoNorm: { corredoraId, telefonoNorm: t } },
        create: { ...(d as Prisma.WaHiloUncheckedCreateInput), corredoraId, telefonoNorm: t },
        update: d,
      });
    };
    const leadAct = cli.lead ? await this.db.lead.findUnique({ where: { id: cli.lead.id } }) : null;
    if (leadAct) cli.lead = leadAct;
    const tomada = !!leadAct && this.leads.datos(leadAct).atiende === 'corredor';
    const enPausa = !!pausaHasta && pausaHasta > new Date();
    if (tomada || enPausa) {
      await guardar();
      if (texto)
        await this.avisar(
          c,
          tomada
            ? `💬 ${cli.nombre} te escribió: «${texto.slice(0, 200)}»\n(La conversación es tuya: respóndele desde Leads o WhatsApp.)`
            : `💬 ${cli.nombre} te escribió: «${texto.slice(0, 200)}»\n(${yo.nombre} está en pausa en esta conversación hasta las ${horaDe(pausaHasta!)} porque le escribiste tú. Respóndele, o en Leads pulsa «Reanudar» para que siga ${yo.nombre}.)`,
        );
      return false;
    }
    if (!texto) {
      if (adjuntos.length && cv.contactId) {
        const r = `Recibí tu archivo. Se lo paso a ${await this.nombreCorredor(c)}.`;
        await this.enviarYAnotar(c, cv, r);
        await guardar();
        await this.avisar(
          c,
          `📎 ${cli.nombre} (${cli.telefono}) mandó un archivo por WhatsApp. Míralo en la conversación de wechatia.`,
        );
      }
      return true;
    }
    if (!(await this.ia.disponible(corredoraId))) {
      await guardar();
      await this.avisar(
        c,
        `💬 ${cli.nombre} escribió por WhatsApp: «${texto.slice(0, 200)}»\n(${yo.nombre} no pudo responder: la IA del servidor no está configurada. Respóndele tú.)`,
      );
      return false;
    }
    const nuevo = !h?.ultimo || Date.now() - h.ultimo.getTime() > 6 * 36e5;
    const primera = !h?.ultimo || Date.now() - h.ultimo.getTime() > 24 * 36e5;
    // si el cliente manda el link o el código del aviso, la propiedad queda identificada para la conversación
    const nombradas = await this.refsEnTexto(c, texto);
    if (nombradas.length && cli.lead) {
      const r = await this.leads.cambiar(cli.lead.id, (d) => {
        const antes = (d.propiedades as string[]) || [];
        const nuevas = [...new Set([...antes, ...nombradas.map((p) => p.id)])];
        if (nuevas.length === antes.length) return null;
        d.propiedades = nuevas;
        return { datos: d };
      });
      if (r) cli.lead = r;
    }
    const nota = nombradas.length
      ? `\n\n[Nota interna, no la repitas tal cual: el cliente se refiere a ${nombradas
          .map(
            (p) =>
              `la propiedad ${p.codigo} (${[p.titulo, [p.direccion, p.comuna].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}${p.venta ? ' · venta ' + (precio(p.precioVenta, p.monedaVenta) || '') : ''}${p.arriendo ? ' · arriendo ' + (precio(p.precioArriendo, p.monedaArriendo) || '') : ''})`,
          )
          .join('; ')}. Para agendar usa el código ${nombradas[0].codigo}.]`
      : '';
    const previos = ((h?.mensajes ?? []) as unknown as TurnoIa[]).slice(-16);
    // la conversación debe empezar con el cliente: lo que mandó Asset antes queda como contexto
    const historial: TurnoIa[] = [];
    for (const m of previos) {
      if (!historial.length && m.role === 'assistant') {
        historial.push({
          role: 'user',
          content: '(Antes de este mensaje, Asset le escribió al cliente lo que sigue.)',
        });
      }
      const ult = historial.at(-1);
      if (ult && ult.role === m.role) ult.content += '\n' + m.content;
      else historial.push({ role: m.role, content: m.content });
    }
    if (historial.at(-1)?.role === 'user') historial.at(-1)!.content += '\n' + texto + nota;
    else historial.push({ role: 'user', content: texto + nota });
    const corredor = await this.nombreCorredor(c);
    let final = '';
    try {
      final = await this.ia.conversar({
        corredoraId,
        uso: cli.quien,
        sistema: this.sistema(cli, corredor, primera),
        historial,
        herramientas: cli.lead ? [...TOOLS, ...TOOLS_LEAD] : TOOLS,
        ejecutar: (n, a) => this.ejecutar(c, n, a),
      });
    } catch (e) {
      this.log.warn(`IA (${cli.quien}): ${(e as Error).message}`);
    }
    if (!final) final = `Gracias por escribir. Le paso tu mensaje a ${corredor} y te contacta.`;
    final = final.slice(0, 3000);
    await this.enviarYAnotar(c, cv, final);
    const conversado = [
      ...((h?.mensajes ?? []) as unknown as TurnoIa[]),
      { role: 'user', content: texto },
      { role: 'assistant', content: final },
    ].slice(-20);
    await guardar({ mensajes: conversado as unknown as Prisma.InputJsonValue, ultimo: new Date() });
    await this.registrarPersona(
      c,
      `WhatsApp · ${cli.nombre}: «${texto.slice(0, 140)}» → ${yo.nombre}: «${final.slice(0, 140)}»`,
    );
    if (nuevo && !c.recados.length)
      await this.avisar(
        c,
        `💬 ${cli.nombre} escribió por WhatsApp: «${texto.slice(0, 160)}»\nLe respondí: «${final.slice(0, 200)}»${cli.lead ? '\n(Puedes seguir la conversación y tomarla en Leads.)' : ''}`,
      );
    return true;
  }

  /** envía al cliente, lo anota como envío de Asset y, si es lead, en su conversación */
  private async enviarYAnotar(c: Ctx, cv: Conversacion, texto: string) {
    if (!cv.contactId) return;
    const r = await c.wa.enviarAContacto(cv.contactId, texto);
    await this.enviados.registrar(c.corredoraId, cv.telefono, { messageId: r.messageId, texto, enHilo: false });
    if (c.cli.lead)
      await this.leads.anotar(c.cli.lead, [
        {
          k: r.messageId ? 'wc' + r.messageId : 'as' + Date.now().toString(36),
          fecha: horaChile(),
          de: 'agente',
          autor: `${ATENCION[c.cli.quien].nombre} (asistente)`,
          texto,
        },
      ]);
  }
}

export type { DatosLead };
