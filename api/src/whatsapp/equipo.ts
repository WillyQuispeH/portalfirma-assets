// El equipo del ejecutivo (Pedro · Captación, Juanita · Documentos, Diego · Seguimiento, Fernanda · Leads) atendido
// por el SERVIDOR cuando su Asset está cerrado: así el corredor siempre tiene respuesta desde su celular.
// Con su Asset abierto, lo atiende el Asset (ejecutivo.ts lo deja en la cola), con todas sus herramientas.
//
// Trabaja sobre la base, con los permisos del usuario (el corredor ve sus leads, negocios y agenda; el administrador,
// todo; los datos del propietario solo en las propiedades que captó o si es administrador): resumen del día, cartera,
// personas, negocios, leads (y su conversación), agenda (ver y agendar), firmas y notas. Lo que necesita el computador
// (generar documentos, enviar a firmar, publicar en portales, Google Drive, editar fichas, audios) lo deja para cuando
// abra Asset: queda en su cola (wa_entrantes) y su Asset lo atiende al abrirse.
// Cada personaje lleva su propia conversación (wa_vinculos.datos.hilos), como en la app.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-base-to-string --
   los datos de leads, negocios y eventos son JSON de la app y se leen campo a campo */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type WaVinculo } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ActividadService } from '../comun/actividad.service';
import { TranscripcionService } from '../ia/transcripcion';
import { normalizar } from '../comun/texto';
import { IaService, type HerramientaIa, type TurnoIa } from './ia';
import { EnviadosService } from './enviados';
import type { Conversacion, MensajeWa, Wechatia } from './wechatia';
import { contexto, firma, hoy, norm, sumarDias } from './comun';

type TPersona = 'pedro' | 'juanita' | 'diego' | 'fernanda';
const PERSONAS: Record<TPersona, { nombre: string; area: string; foco: string }> = {
  pedro: { nombre: 'Pedro', area: 'Captación', foco: 'la cartera: propiedades, sus datos, captaciones y propietarios' },
  juanita: { nombre: 'Juanita', area: 'Documentos', foco: 'los documentos y las firmas en curso' },
  diego: {
    nombre: 'Diego',
    area: 'Seguimiento',
    foco: 'los negocios (ventas y arriendos), sus etapas, la agenda y las visitas',
  },
  fernanda: {
    nombre: 'Fernanda',
    area: 'Leads',
    foco: 'los leads: quién escribió, qué busca, en qué quedó y qué sigue',
  },
};
const ES_AUDIO = /\.(ogg|oga|opus|mp3|m4a|amr|aac|wav|webm)(\?|$)|audio/i;

/** turnos que se guardan por personaje */
const MAX_TURNOS = 16;

interface Ctx {
  corredoraId: string;
  usuarioId: string;
  nombre: string;
  admin: boolean;
}

const HERRAMIENTAS: HerramientaIa[] = [
  {
    name: 'resumen',
    description:
      'El día del corredor: cuántas propiedades, negocios abiertos por etapa, leads por estado, la agenda de hoy y las firmas en curso. Úsala para «¿cómo va todo?», «¿qué tengo hoy?».',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'buscar_propiedades',
    description: 'Busca en la cartera por texto (código, dirección, comuna, título) y filtros. Devuelve hasta 10.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string' },
        operacion: { type: 'string', enum: ['venta', 'arriendo'] },
        comuna: { type: 'string' },
        dormitorios_min: { type: 'number' },
      },
    },
  },
  {
    name: 'ver_propiedad',
    description:
      'La ficha de una propiedad por su código (CV-9001) o id: datos, precios, estado, negocios, próximas visitas y (si corresponde) sus propietarios.',
    input_schema: { type: 'object', properties: { codigo: { type: 'string' } }, required: ['codigo'] },
  },
  {
    name: 'buscar_personas',
    description: 'Busca personas del CRM por nombre, RUT, correo o teléfono.',
    input_schema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  },
  {
    name: 'negocios',
    description:
      'Los negocios (ventas y arriendos) abiertos, con su etapa, propiedad, cliente y próxima fecha. Filtra por texto (código, cliente) si se da.',
    input_schema: { type: 'object', properties: { texto: { type: 'string' }, incluir_cerrados: { type: 'boolean' } } },
  },
  {
    name: 'leads',
    description:
      'Los leads: filtro abiertos | nuevos | seguimiento (sin respuesta o con la acción vencida) | visita, y texto opcional (nombre, teléfono, comuna).',
    input_schema: {
      type: 'object',
      properties: {
        filtro: { type: 'string', enum: ['abiertos', 'nuevos', 'seguimiento', 'visita', 'todos'] },
        texto: { type: 'string' },
      },
    },
  },
  {
    name: 'ver_lead',
    description:
      'Un lead (por nombre o teléfono): qué busca, su estado, la próxima acción y los últimos mensajes de su conversación.',
    input_schema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  },
  {
    name: 'agenda',
    description: 'La agenda entre dos fechas (AAAA-MM-DD; por defecto, de hoy a 7 días).',
    input_schema: { type: 'object', properties: { desde: { type: 'string' }, hasta: { type: 'string' } } },
  },
  {
    name: 'agendar',
    description:
      'Agenda un evento en la agenda del corredor: visita, reunión, llamada o tarea. Si es una visita, da el código de la propiedad. Confirma con el corredor el día y la hora antes de agendar.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['visita', 'reunion', 'llamada', 'tarea'] },
        titulo: { type: 'string' },
        fecha: { type: 'string', description: 'AAAA-MM-DD' },
        hora: { type: 'string', description: 'HH:MM' },
        codigo_propiedad: { type: 'string' },
        lugar: { type: 'string' },
        notas: { type: 'string' },
      },
      required: ['tipo', 'titulo', 'fecha'],
    },
  },
  {
    name: 'firmas',
    description:
      'Los documentos enviados a firmar: quién falta por firmar y cuáles están listos. Por defecto, los que están en curso.',
    input_schema: { type: 'object', properties: { todas: { type: 'boolean' } } },
  },
  {
    name: 'anotar',
    description: 'Deja una nota en el historial de una propiedad (por su código).',
    input_schema: {
      type: 'object',
      properties: { codigo_propiedad: { type: 'string' }, nota: { type: 'string' } },
      required: ['codigo_propiedad', 'nota'],
    },
  },
  {
    name: 'dejar_para_asset',
    description:
      'Para lo que solo se hace con Asset abierto en el computador (generar documentos o contratos, enviar a firmar, publicar en portales, Google Drive, crear o editar fichas, enviar WhatsApp a clientes): deja el pedido en la cola y su Asset lo hace apenas se abra.',
    input_schema: { type: 'object', properties: { pedido: { type: 'string' } }, required: ['pedido'] },
  },
];

const fecha = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const pesos = (n: unknown, m?: string | null) =>
  n == null ? null : `${m === 'UF' ? 'UF ' : '$'}${Number(n).toLocaleString('es-CL')}`;

@Injectable()
export class EquipoService {
  private readonly log = new Logger('Equipo');
  constructor(
    private readonly db: PrismaService,
    private readonly ia: IaService,
    private readonly enviados: EnviadosService,
    private readonly actividad: ActividadService,
    private readonly transcripcion: TranscripcionService,
  ) {}

  /** transcribe los audios de los mensajes; lo que no se pueda transcribir queda para su Asset (cola) como antes */
  private async escuchar(corredoraId: string, nuevos: MensajeWa[]) {
    const textos: string[] = [];
    const avisos: string[] = [];
    for (const m of nuevos)
      for (const url of m.adjuntos.filter((u) => ES_AUDIO.test(u))) {
        try {
          const r = await this.transcripcion.transcribirUrl(corredoraId, url);
          if (r.texto) textos.push(r.texto);
          avisos.push(...r.avisos);
        } catch (e) {
          this.log.warn(`audio sin transcribir: ${(e as Error).message}`);
        }
      }
    return { textos, avisos: [...new Set(avisos)] };
  }

  /** a quién le habla: el personaje que nombra («Juanita, …», «mis documentos Juanita»; si nombra varios, el primero),
   *  o el de la última vez (Pedro si es la primera) */
  private personaDe(texto: string, previa: unknown): TPersona {
    const t = norm(texto);
    let mejor: { id: TPersona; en: number } | null = null;
    for (const id of Object.keys(PERSONAS) as TPersona[]) {
      const m = new RegExp(`(^|[^a-z])${id}([^a-z]|$)`).exec(t);
      if (m && (!mejor || m.index < mejor.en)) mejor = { id, en: m.index };
    }
    if (mejor) return mejor.id;
    return previa && (previa as string) in PERSONAS ? (previa as TPersona) : 'pedro';
  }

  /** atiende lo que escribió el ejecutivo con su Asset cerrado; devuelve false si no pudo (la IA no está) */
  async atender(wa: Wechatia, v: WaVinculo, cv: Conversacion, nuevos: MensajeWa[]) {
    const escrito = nuevos
      .map((m) => m.texto.trim())
      .filter(Boolean)
      .join('\n');
    const conAdjuntos = nuevos.some((m) => m.adjuntos.length);
    // los audios (notas de voz) se transcriben aquí, aun con su Asset cerrado; el resto de los archivos los ve su Asset
    const { textos: dichos, avisos: avisosAudio } = await this.escuchar(v.corredoraId, nuevos);
    const texto = [escrito, ...dichos].filter(Boolean).join('\n');
    const datos = (v.datos ?? {}) as { persona?: string; hilos?: Record<string, TurnoIa[]>; nombre?: string };
    const persona = this.personaDe(texto, datos.persona);
    const p = PERSONAS[persona];
    const enviar = async (t: string) => {
      if (!cv.contactId) return;
      const r = await wa.enviarAContacto(cv.contactId, `${firma(persona)}\n${t}`.slice(0, 3500));
      await this.enviados.registrar(v.corredoraId, cv.telefono, { messageId: r.messageId, texto: t, enHilo: false });
    };
    // lo que se entendió del audio, para que lo corrija si el micrófono o el ruido jugaron una mala pasada
    if (dichos.length && cv.contactId) {
      const eco = `🎙️ Entendí: «${dichos.join(' ').slice(0, 1200)}»${avisosAudio.map((x) => `\n⚠️ ${x}`).join('')}`;
      const r = await wa.enviarAContacto(cv.contactId, eco);
      await this.enviados.registrar(v.corredoraId, cv.telefono, { messageId: r.messageId, texto: eco, enHilo: false });
    }
    // audios y archivos: los atiende su Asset al abrirse (el servidor solo lee texto)
    if (!texto && conAdjuntos) {
      await this.encolar(v, nuevos);
      await enviar(
        'Recibí tu audio o archivo. Con Asset cerrado solo leo texto: lo veo apenas abras Asset. Si es urgente, escríbemelo.',
      );
      return true;
    }
    if (!texto) return true;
    if (!(await this.ia.disponible(v.corredoraId))) return false;

    const u = await this.db.usuario.findUnique({ where: { id: v.usuarioId } });
    if (!u) return false;
    const c: Ctx = { corredoraId: v.corredoraId, usuarioId: u.id, nombre: u.nombre, admin: u.rol === 'ADMIN' };
    const nota = avisosAudio.length
      ? `\n\n[Aviso de la transcripción del audio: ${avisosAudio.join(' ')} No guardes ese dato sin que lo confirme.]`
      : '';
    const hilo = [...(datos.hilos?.[persona] ?? []), { role: 'user' as const, content: texto + nota }].slice(-MAX_TURNOS);
    while (hilo.length && hilo[0].role !== 'user') hilo.shift();
    const sistema = [
      `Eres ${p.nombre}, del área de ${p.area} del equipo de PortalFirma Asset (CRM inmobiliario chileno). Trabajas para ${u.nombre}, corredor${c.admin ? ' y administrador' : ''} de la corredora, y le respondes por WhatsApp. Tu foco: ${p.foco}, pero ayudas con lo que te pida usando las herramientas.`,
      contexto(),
      'Su Asset está cerrado en el computador: tú respondes desde el servidor. Puedes consultar la cartera, personas, negocios, leads, la agenda y las firmas, agendar eventos y dejar notas. Lo que necesita Asset abierto (generar documentos, enviar a firmar, publicar en portales, Drive, crear o editar fichas, escribirle a clientes) déjalo con dejar_para_asset y dile que se hará al abrir Asset.',
      'Fotos de una propiedad: el corredor puede mandarlas a este mismo chat con el código en el mensaje (por ejemplo «PF-1001») y se agregan solas a la ficha, aun con Asset cerrado. Nunca digas que no puedes recibir fotos.',
      'Responde corto y claro, como en WhatsApp: frases breves, listas con «•», *negrita* con asteriscos simples, sin títulos ni tablas. Usa siempre las herramientas antes de afirmar datos; nunca inventes. Fechas como «lunes 10/11». Trátalo de tú.',
    ].join('\n\n');
    let respuesta = '';
    try {
      respuesta = await this.ia.conversar({
        corredoraId: v.corredoraId,
        uso: 'equipo',
        sistema,
        historial: hilo,
        herramientas: HERRAMIENTAS,
        ejecutar: (n, a) => this.ejecutar(c, v, n, a),
        vueltas: 6,
      });
    } catch (e) {
      this.log.warn(`equipo (${persona}): ${(e as Error).message}`);
      return false;
    }
    if (!respuesta.trim()) respuesta = 'No pude resolverlo ahora. Lo veo apenas abras Asset.';
    await enviar(respuesta);
    const hilos = {
      ...(datos.hilos ?? {}),
      [persona]: [...hilo, { role: 'assistant' as const, content: respuesta }].slice(-MAX_TURNOS),
    };
    await this.db.waVinculo.update({
      where: { usuarioId: v.usuarioId },
      data: { datos: { ...datos, persona, hilos } as unknown as Prisma.InputJsonValue },
    });
    return true;
  }

  /** deja mensajes en la cola de su Asset (los toma al abrirse) */
  private async encolar(
    v: WaVinculo,
    ms: { id: string; texto: string; adjuntos?: Prisma.InputJsonValue[]; fecha?: string }[],
  ) {
    await this.db.waEntrante.createMany({
      data: ms.map((m) => ({
        corredoraId: v.corredoraId,
        usuarioId: v.usuarioId,
        mensaje: {
          id: m.id,
          body: m.texto,
          attachments: m.adjuntos ?? [],
          dateAdded: m.fecha ?? new Date().toISOString(),
        },
      })),
    });
  }

  // ------------------------------------------------------------------ herramientas

  private async propiedad(c: Ctx, codigo: string) {
    const k = String(codigo || '').trim();
    return this.db.propiedad.findFirst({
      where: {
        corredoraId: c.corredoraId,
        eliminadoEn: null,
        OR: [{ codigo: { equals: k, mode: 'insensitive' } }, ...(/^[0-9a-f-]{36}$/i.test(k) ? [{ id: k }] : [])],
      },
    });
  }
  /** lo del corredor (sus leads, negocios, agenda) o todo, si es administrador */
  private mio(c: Ctx) {
    return c.admin ? {} : { corredorId: c.usuarioId };
  }

  private async ejecutar(c: Ctx, v: WaVinculo, nombre: string, a: Record<string, unknown>): Promise<unknown> {
    const txt = (k: string) => String(a[k] ?? '').trim();
    switch (nombre) {
      case 'resumen': {
        const [props, negs, leads, evs, firmas] = await Promise.all([
          this.db.propiedad.count({ where: { corredoraId: c.corredoraId, eliminadoEn: null, archivada: false } }),
          this.db.negocio.groupBy({
            by: ['etapa'],
            where: { corredoraId: c.corredoraId, eliminadoEn: null, estado: 'abierto', ...this.mio(c) },
            _count: { _all: true },
          }),
          this.db.lead.groupBy({
            by: ['estado'],
            where: { corredoraId: c.corredoraId, eliminadoEn: null, ...this.mio(c) },
            _count: { _all: true },
          }),
          this.agenda(c, hoy(), hoy()),
          this.db.firma.count({
            where: {
              corredoraId: c.corredoraId,
              eliminadoEn: null,
              estado: { notIn: ['firmado', 'finalizada', 'cancelada'] },
              ...(c.admin ? {} : { enviadoPorId: c.usuarioId }),
            },
          }),
        ]);
        return {
          propiedades: props,
          negociosAbiertosPorEtapa: Object.fromEntries(negs.map((x) => [x.etapa, x._count._all])),
          leadsPorEstado: Object.fromEntries(leads.map((x) => [x.estado, x._count._all])),
          agendaDeHoy: evs,
          firmasEnCurso: firmas,
        };
      }
      case 'buscar_propiedades': {
        const where: Prisma.PropiedadWhereInput = { corredoraId: c.corredoraId, eliminadoEn: null, archivada: false };
        if (txt('texto')) where.busqueda = { contains: normalizar(txt('texto')) };
        if (txt('comuna')) where.comuna = { contains: txt('comuna'), mode: 'insensitive' };
        if (a.operacion === 'venta') where.venta = true;
        if (a.operacion === 'arriendo') where.arriendo = true;
        if (typeof a.dormitorios_min === 'number') where.dormitorios = { gte: a.dormitorios_min };
        const l = await this.db.propiedad.findMany({ where, take: 10, orderBy: { actualizadoEn: 'desc' } });
        return l.map((p) => ({
          codigo: p.codigo,
          titulo: p.titulo,
          tipo: p.tipo,
          comuna: p.comuna,
          venta: p.venta ? pesos(p.precioVenta, p.monedaVenta) : null,
          arriendo: p.arriendo ? pesos(p.precioArriendo, p.monedaArriendo) : null,
          estado: [p.estadoVenta, p.estadoArriendo].filter(Boolean).join(' / '),
          dormitorios: p.dormitorios,
          banos: p.banos,
          m2: p.supUtil ? Number(p.supUtil) : null,
        }));
      }
      case 'ver_propiedad': {
        const p = await this.propiedad(c, txt('codigo'));
        if (!p) return { error: 'No encontré esa propiedad: búscala con buscar_propiedades.' };
        const [negs, evs, vinc] = await Promise.all([
          this.db.negocio.findMany({
            where: { corredoraId: c.corredoraId, propiedadId: p.id, eliminadoEn: null, estado: 'abierto' },
          }),
          this.db.evento.findMany({
            where: {
              corredoraId: c.corredoraId,
              propiedadId: p.id,
              eliminadoEn: null,
              fecha: { gte: new Date(hoy() + 'T00:00:00Z') },
            },
            orderBy: { fecha: 'asc' },
            take: 5,
          }),
          c.admin || p.captadorId === c.usuarioId
            ? this.db.propiedadPersona.findMany({ where: { propiedadId: p.id }, include: { persona: true } })
            : Promise.resolve([]),
        ]);
        return {
          codigo: p.codigo,
          titulo: p.titulo,
          tipo: p.tipo,
          direccion: [p.direccion, p.unidad, p.comuna].filter(Boolean).join(', '),
          venta: p.venta ? pesos(p.precioVenta, p.monedaVenta) : null,
          arriendo: p.arriendo ? pesos(p.precioArriendo, p.monedaArriendo) : null,
          estadoVenta: p.estadoVenta,
          estadoArriendo: p.estadoArriendo,
          dormitorios: p.dormitorios,
          banos: p.banos,
          estacionamientos: p.estacionamientos,
          m2Utiles: p.supUtil ? Number(p.supUtil) : null,
          m2Totales: p.supTotal ? Number(p.supTotal) : null,
          gastosComunes: p.gastosComunes ? Number(p.gastosComunes) : null,
          descripcion: (p.descripcion || '').slice(0, 600),
          negociosAbiertos: negs.map((n) => ({ tipo: n.tipo, etapa: n.etapa })),
          proximasVisitas: evs.map((e) => ({
            fecha: fecha(e.fecha),
            hora: e.hora,
            tipo: e.tipo,
            titulo: (e.datos as { titulo?: string })?.titulo,
          })),
          propietarios: vinc.length
            ? vinc.map((x) => ({ nombre: x.persona.nombre, telefono: x.persona.telefono, email: x.persona.email }))
            : c.admin || p.captadorId === c.usuarioId
              ? []
              : 'reservado (no la captaste)',
        };
      }
      case 'buscar_personas': {
        const l = await this.db.persona.findMany({
          where: { corredoraId: c.corredoraId, eliminadoEn: null, busqueda: { contains: normalizar(txt('texto')) } },
          take: 8,
        });
        return l.map((x) => ({
          nombre: x.nombre,
          roles: x.roles,
          ...(c.admin ? { telefono: x.telefono, email: x.email, rut: x.rutFormato || x.rut } : {}),
        }));
      }
      case 'negocios': {
        const l = await this.db.negocio.findMany({
          where: {
            corredoraId: c.corredoraId,
            eliminadoEn: null,
            ...(a.incluir_cerrados ? {} : { estado: 'abierto' }),
            ...this.mio(c),
          },
          orderBy: { actualizadoEn: 'desc' },
          take: 40,
        });
        const props = await this.db.propiedad.findMany({
          where: { id: { in: l.map((n) => n.propiedadId).filter((x): x is string => !!x) } },
          select: { id: true, codigo: true, titulo: true },
        });
        const pers = await this.db.persona.findMany({
          where: { id: { in: l.map((n) => n.clienteId).filter((x): x is string => !!x) } },
          select: { id: true, nombre: true },
        });
        const q = norm(txt('texto'));
        return l
          .map((n) => {
            const p = props.find((x) => x.id === n.propiedadId);
            const cli = pers.find((x) => x.id === n.clienteId);
            return {
              tipo: n.tipo,
              estado: n.estado,
              etapa: n.etapa,
              propiedad: p ? `${p.codigo} ${p.titulo}` : null,
              cliente: cli?.nombre ?? null,
              proximaFecha: fecha(n.proximaFecha),
            };
          })
          .filter((n) => !q || norm(`${n.propiedad} ${n.cliente}`).includes(q))
          .slice(0, 15);
      }
      case 'leads': {
        const f = txt('filtro') || 'abiertos';
        const where: Prisma.LeadWhereInput = { corredoraId: c.corredoraId, eliminadoEn: null, ...this.mio(c) };
        if (f === 'abiertos' || f === 'seguimiento') where.estado = { notIn: ['ganado', 'perdido'] };
        if (f === 'nuevos') where.estado = 'nuevo';
        if (f === 'visita') where.estado = 'visita';
        const l = await this.db.lead.findMany({ where, orderBy: { actualizadoEn: 'desc' }, take: 60 });
        const q = norm(txt('texto'));
        const hoyF = hoy();
        return l
          .map((x) => {
            const d = x.datos as Record<string, any>;
            const vencida = !!(d.proximaAccion?.fecha && d.proximaAccion.fecha < hoyF);
            const sinRespuesta =
              d.ultimo?.de === 'cliente' && Date.now() - new Date(String(d.ultimo.fecha)).getTime() > 24 * 36e5;
            return {
              nombre: d.nombre || d.chatCon || d.telefono,
              telefono: d.telefono,
              estado: x.estado,
              origen: x.origen,
              busca: d.resumen || '',
              ultimo: String(d.ultimo?.texto ?? '').slice(0, 120),
              proximaAccion: d.proximaAccion ?? null,
              seguimiento: vencida || sinRespuesta,
            };
          })
          .filter(
            (x) =>
              (f !== 'seguimiento' || x.seguimiento) &&
              (!q || norm(`${x.nombre} ${x.telefono} ${x.busca}`).includes(q)),
          )
          .slice(0, 15);
      }
      case 'ver_lead': {
        const q = norm(txt('texto'));
        const tel = q.replace(/\D/g, '').slice(-9);
        const l = (
          await this.db.lead.findMany({
            where: { corredoraId: c.corredoraId, eliminadoEn: null, ...this.mio(c) },
            orderBy: { actualizadoEn: 'desc' },
            take: 300,
          })
        ).find((x) => {
          const d = x.datos as Record<string, any>;
          return (tel.length >= 8 && x.telefonoNorm === tel) || norm(`${d.nombre} ${d.chatCon}`).includes(q);
        });
        if (!l) return { error: 'No encontré ese lead entre los tuyos.' };
        const d = l.datos as Record<string, any>;
        const ms = await this.db.leadMensaje.findMany({
          where: { leadId: l.id },
          orderBy: { fecha: 'desc' },
          take: 10,
        });
        return {
          nombre: d.nombre || d.chatCon,
          telefono: d.telefono,
          estado: l.estado,
          busca: d.resumen || '',
          busqueda: d.busqueda ?? {},
          proximaAccion: d.proximaAccion ?? null,
          atiende: d.atiende === 'corredor' ? 'el corredor (tomó la conversación)' : 'Sofía',
          mensajes: ms.reverse().map((m) => ({ de: m.de, texto: String(m.texto ?? '').slice(0, 300), fecha: m.fecha })),
        };
      }
      case 'agenda':
        return this.agenda(c, txt('desde') || hoy(), txt('hasta') || sumarDias(txt('desde') || hoy(), 7));
      case 'agendar': {
        const f = txt('fecha');
        const h = txt('hora');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return { error: 'La fecha va como AAAA-MM-DD.' };
        if (h && !/^\d{2}:\d{2}$/.test(h)) return { error: 'La hora va como HH:MM.' };
        const p = txt('codigo_propiedad') ? await this.propiedad(c, txt('codigo_propiedad')) : null;
        if (txt('codigo_propiedad') && !p) return { error: 'No encontré esa propiedad.' };
        const id = 'v' + Date.now().toString(36) + randomBytes(2).toString('hex');
        const ahoraIso = new Date().toISOString();
        const lugar = txt('lugar') || (p ? [p.direccion, p.unidad, p.comuna].filter(Boolean).join(', ') : '');
        await this.db.evento.create({
          data: {
            id,
            corredoraId: c.corredoraId,
            tipo: txt('tipo') || 'tarea',
            estado: 'programado',
            fecha: new Date(f + 'T00:00:00Z'),
            hora: h || null,
            propiedadId: p?.id ?? null,
            personaIds: [],
            corredorId: c.usuarioId,
            creadoPorId: c.usuarioId,
            datos: {
              titulo: txt('titulo').slice(0, 120),
              duracion: 45,
              lugar: lugar.slice(0, 200),
              notas: txt('notas'),
              orden: null,
              creado: ahoraIso,
              actualizado: ahoraIso,
              ext: { fuente: 'whatsapp' },
            },
          },
        });
        await this.actividad.registrar({
          corredoraId: c.corredoraId,
          entidadTipo: 'evento',
          entidadId: id,
          texto: `Agendado por WhatsApp: ${txt('titulo')} (${f}${h ? ' ' + h : ''})`,
          ref2: p?.id ?? null,
          usuarioId: c.usuarioId,
        });
        return { ok: true, fecha: f, hora: h || null, titulo: txt('titulo') };
      }
      case 'firmas': {
        const l = await this.db.firma.findMany({
          where: {
            corredoraId: c.corredoraId,
            eliminadoEn: null,
            ...(a.todas ? {} : { estado: { notIn: ['firmado', 'finalizada', 'cancelada'] } }),
            ...(c.admin ? {} : { enviadoPorId: c.usuarioId }),
          },
          orderBy: { enviadoEn: 'desc' },
          take: 15,
        });
        return l.map((f) => ({
          documento: f.documento,
          operacion: f.operacion,
          estado: f.estado,
          firmaron: `${f.firmados} de ${f.total}`,
          enviado: fecha(f.enviadoEn),
          faltan: (Array.isArray(f.firmantes) ? (f.firmantes as Record<string, unknown>[]) : [])
            .filter((x) => !x?.signed && !x?.firmado)
            .map((x) => String(x?.nombre || x?.name || ''))
            .filter(Boolean),
        }));
      }
      case 'anotar': {
        const p = await this.propiedad(c, txt('codigo_propiedad'));
        if (!p) return { error: 'No encontré esa propiedad.' };
        await this.actividad.registrar({
          corredoraId: c.corredoraId,
          entidadTipo: 'propiedad',
          entidadId: p.id,
          texto: txt('nota').slice(0, 1000),
          tipo: 'nota',
          usuarioId: c.usuarioId,
        });
        return { ok: true };
      }
      case 'dejar_para_asset':
        await this.encolar(v, [{ id: 'eq' + Date.now().toString(36), texto: txt('pedido') }]);
        return { ok: true, nota: 'Queda en la cola: su Asset lo hará apenas se abra.' };
      default:
        return { error: 'Herramienta desconocida.' };
    }
  }

  private async agenda(c: Ctx, desde: string, hasta: string) {
    const l = await this.db.evento.findMany({
      where: {
        corredoraId: c.corredoraId,
        eliminadoEn: null,
        fecha: { gte: new Date(desde + 'T00:00:00Z'), lte: new Date(hasta + 'T00:00:00Z') },
        ...this.mio(c),
      },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
      take: 40,
    });
    return l.map((e) => {
      const d = e.datos as Record<string, any>;
      return {
        fecha: fecha(e.fecha),
        hora: e.hora,
        tipo: e.tipo,
        estado: e.estado,
        titulo: d?.titulo ?? '',
        lugar: d?.lugar ?? '',
      };
    });
  }
}
