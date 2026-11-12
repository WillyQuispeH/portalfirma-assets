/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-base-to-string -- los datos del lead son JSON de la app */
// Puente corredor ↔ interesado por el WhatsApp de la empresa. Los asistentes ya no conversan con los interesados: crean
// el lead, le asignan corredor y le mandan el primer mensaje; de ahí en adelante habla el corredor.
//
//  · INTERESADO → CORREDOR (`entrante`): lo que escribe un lead se anota en su conversación y se reenvía al celular
//    vinculado del corredor a cargo (si el lead no tiene corredor con celular vinculado, a los administradores; si nadie
//    lo tiene vinculado, queda en los avisos de la app). Cada reenvío se liga al lead (wa_puente) para poder responderlo.
//  · CORREDOR → INTERESADO (`saliente`): el corredor le escribe al número de la empresa desde su celular vinculado y el
//    mensaje sale al interesado, firmado con su nombre. Se elige a quién de dos formas:
//      a) con prefijo:  «Para Juan Pérez: ¿le acomoda el sábado?»  (nombre, parte del nombre o los últimos dígitos del celular)
//      b) respondiendo (citando) el mensaje reenviado.
//    Si no calza ninguna, el mensaje sigue su camino de siempre (el Agente interno).
//  · Primer contacto: si el interesado escribió sin que Asset le hubiera escrito antes, recibe un único aviso fijo.
//  WhatsApp solo deja mandar texto libre si la persona escribió en las últimas 24 h; si no, se le dice al corredor.
import { Injectable, Logger } from '@nestjs/common';
import type { Lead, WaVinculo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EjecutivoService } from './ejecutivo';
import { EnviadosService } from './enviados';
import { LeadsWaService, type MensajeLead } from './leads-wa';
import { horaChile, norm, telNorm } from './comun';
import { WechatiaError, type Conversacion, type MensajeWa, type Wechatia } from './wechatia';

/** etiqueta que dispara el flujo «Asset · Primer contacto (plantilla)» de wechatia (plantilla aprobada asset_primer_contacto) */
const ETIQUETA_PRIMER_CONTACTO = 'asset-primer-contacto';

/** «Para Juan Pérez: texto» (también «Para: Juan, texto» no: el destinatario va antes de los dos puntos) */
const PREFIJO = /^\s*para\s+([^:\n]{2,60}?)\s*:\s*([\s\S]+)$/i;

interface Candidato {
  lead: Lead;
  nombre: string;
  telefono: string;
}

const nombreDe = (l: Lead) => {
  const d = (l.datos ?? {}) as Record<string, unknown>;
  return String(d.nombre || d.chatCon || d.telefono || 'Interesado');
};
/** el usuario de Instagram o Facebook con que escribió el lead (sin @), si se conoce */
const usuarioDe = (l: Lead) => {
  const d = (l.datos ?? {}) as Record<string, any>;
  const c = ([...(d.canales ?? [])] as { usuario?: string }[]).reverse().find((x) => x.usuario);
  return String(c?.usuario || d.ig?.usuario || '').replace(/^@/, '');
};
const telDe = (l: Lead) => String(((l.datos ?? {}) as Record<string, unknown>).telefono ?? '');
const cola = (t: string) => {
  const d = t.replace(/\D/g, '');
  return d.length >= 4 ? `…${d.slice(-4)}` : '';
};

@Injectable()
export class PuenteService {
  private readonly log = new Logger('Puente');
  constructor(
    private readonly db: PrismaService,
    private readonly ejecutivo: EjecutivoService,
    private readonly enviados: EnviadosService,
    private readonly leads: LeadsWaService,
  ) {}

  // ------------------------------------------------------------------ interesado → corredor

  /** el interesado escribe: se anota en su lead, se le da el primer aviso (si corresponde) y se reenvía al corredor */
  async entrante(
    wa: Wechatia,
    corredoraId: string,
    cv: Conversacion,
    cli: { nombre: string; telefono: string; lead: Lead | null },
    nuevos: MensajeWa[],
    anotar: () => Promise<void>,
  ) {
    const lead = cli.lead;
    if (!lead) return;
    await anotar();
    const texto = nuevos
      .map((m) => m.texto.trim() || (m.adjuntos.length ? '📎 Envió un archivo (míralo en la conversación de wechatia)' : ''))
      .filter(Boolean)
      .join('\n');
    if (!texto) return;
    const act = (await this.db.lead.findUnique({ where: { id: lead.id } })) ?? lead;
    const corredor = act.corredorId
      ? await this.db.usuario.findUnique({ where: { id: act.corredorId }, select: { nombre: true } })
      : null;
    // si el corredor había dejado un mensaje pendiente (fuera de las 24 h), ahora que respondió sale solo
    await this.entregarPendiente(wa, corredoraId, act, cv);
    await this.primerAviso(wa, corredoraId, cv, cli, corredor?.nombre ?? null);
    const nombre = nombreDe(act) || cli.nombre;
    await this.reenviar(wa, corredoraId, act, nombre, `(${telDe(act) || cli.telefono})`, texto);
  }

  /** el interesado escribió por Instagram o Facebook (lo lee el observador): se reenvía igual al celular del corredor a cargo */
  async entranteCanal(wa: Wechatia, corredoraId: string, leadId: string, canal: 'instagram' | 'facebook', textos: string[]) {
    const act = await this.db.lead.findFirst({ where: { id: leadId, corredoraId, eliminadoEn: null } });
    const texto = textos.map((t) => t.trim()).filter(Boolean).join('\n');
    if (!act || !texto) return;
    const usuario = String(
      ((((act.datos ?? {}) as Record<string, any>).canales ?? []) as { canal: string; usuario?: string }[]).find((c) => c.canal === canal)?.usuario ?? '',
    );
    const via = canal === 'instagram' ? `Instagram${usuario ? ' @' + usuario : ''}` : 'Facebook Messenger';
    await this.reenviar(wa, corredoraId, act, nombreDe(act), `(${via})`, texto);
  }

  /** manda el mensaje del interesado al corredor a cargo (o a los administradores) y deja el vínculo para responderlo */
  private async reenviar(wa: Wechatia, corredoraId: string, act: Lead, nombre: string, via: string, texto: string) {
    const cuerpo =
      `💬 *${nombre}* ${via} escribió:\n«${texto.slice(0, 1200)}»\n\n` +
      `↩ Para responderle: cita este mensaje, o escribe «Para ${usuarioDe(act) ? '@' + usuarioDe(act) : nombre}: …».`;
    // al corredor a cargo y, si no recibe por WhatsApp (sin celular vinculado o fuera de las 24 h), a los administradores
    const admins = await this.ejecutivo.responsables(corredoraId, null);
    const destinos = [...new Set([...(act.corredorId ? [act.corredorId] : []), ...admins])];
    let entregado = false;
    for (const id of destinos) {
      entregado = await this.ejecutivo.avisar(corredoraId, id, cuerpo, null, wa, false, async (messageId) => {
        if (messageId) await this.db.waPuente.create({ data: { corredoraId, usuarioId: id, leadId: act.id, messageId } });
      });
      if (entregado) break;
    }
    // nadie lo recibió por WhatsApp: queda en los avisos de la app del corredor a cargo (o del administrador)
    if (!entregado && destinos[0]) {
      await this.ejecutivo.avisar(corredoraId, destinos[0], cuerpo, null, wa, true);
      this.log.warn(`lead ${act.id}: nadie con celular vinculado a quien reenviar; quedó en los avisos de la app`);
    }
  }

  /** un único mensaje fijo cuando el interesado escribe sin que Asset le haya escrito antes (no conversa: solo avisa) */
  private async primerAviso(
    wa: Wechatia,
    corredoraId: string,
    cv: Conversacion,
    cli: { nombre: string; telefono: string; lead: Lead | null },
    corredor: string | null,
  ) {
    const t = telNorm(cv.telefono);
    if (!t || !cv.contactId || !cli.lead) return;
    const h = await this.db.waHilo.findUnique({ where: { corredoraId_telefonoNorm: { corredoraId, telefonoNorm: t } } });
    if (h?.ultimo || h?.ultEnvio) return;
    const empresa = (await this.db.corredora.findUnique({ where: { id: corredoraId }, select: { nombre: true } }))?.nombre;
    const primero = cli.nombre && !/^\+?\d/.test(cli.nombre) ? ` ${cli.nombre.split(/\s+/)[0]}` : '';
    const texto =
      `Hola${primero}, gracias por escribir${empresa ? ` a ${empresa}` : ''}. ` +
      (corredor ? `Ya le pasé tu mensaje a ${corredor}, quien te responderá por este mismo chat.` : 'Ya pasé tu mensaje al equipo, que te responderá por este mismo chat.');
    try {
      const r = await wa.enviarAContacto(cv.contactId, texto);
      await this.enviados.registrar(corredoraId, cv.telefono, { messageId: r.messageId, texto, enHilo: false });
      await this.leads.anotar(cli.lead, [
        {
          k: r.messageId ? 'wc' + r.messageId : 'as' + Date.now().toString(36),
          fecha: horaChile(),
          de: 'agente',
          autor: 'Asistente',
          texto,
        },
      ]);
      await this.db.waHilo.upsert({
        where: { corredoraId_telefonoNorm: { corredoraId, telefonoNorm: t } },
        create: { corredoraId, telefonoNorm: t, ultimo: new Date() },
        update: { ultimo: new Date() },
      });
    } catch (e) {
      this.log.warn(`primer aviso: ${(e as Error).message}`);
    }
  }

  // ------------------------------------------------------------------ corredor → interesado

  /**
   * Mensajes del celular vinculado de un corredor: los que van para un interesado (con prefijo «Para X:» o citando un
   * mensaje reenviado) salen hacia él; devuelve los demás para que sigan al Agente.
   */
  async saliente(wa: Wechatia, v: WaVinculo, cv: Conversacion, nuevos: MensajeWa[]): Promise<MensajeWa[]> {
    const resto: MensajeWa[] = [];
    for (const m of nuevos) {
      try {
        if (!(await this.uno(wa, v, cv, m))) resto.push(m);
      } catch (e) {
        this.log.warn(`puente de ${v.usuarioId}: ${(e as Error).message}`);
        resto.push(m);
      }
    }
    return resto;
  }

  /** true si el mensaje era para un interesado (se atendió aquí) */
  private async uno(wa: Wechatia, v: WaVinculo, cv: Conversacion, m: MensajeWa) {
    const texto = m.texto.trim();
    if (!texto) return false;
    let destino: Candidato | null = null;
    let cuerpo = texto;
    // b) respondiendo a un mensaje reenviado
    if (m.respondeA) {
      const p = await this.db.waPuente.findFirst({
        where: { corredoraId: v.corredoraId, messageId: m.respondeA },
        orderBy: { id: 'desc' },
      });
      if (p) {
        const l = await this.db.lead.findFirst({ where: { id: p.leadId, corredoraId: v.corredoraId, eliminadoEn: null } });
        if (l) {
          // el lead pudo reasignarse desde que se reenvió el aviso: solo el dueño de hoy (o un administrador) puede responderle
          const quien = await this.db.usuario.findUnique({ where: { id: v.usuarioId }, select: { rol: true } });
          if (quien?.rol === 'ADMIN' || l.corredorId === v.usuarioId) destino = { lead: l, nombre: nombreDe(l), telefono: telDe(l) };
          else {
            await this.decir(wa, v, cv, `${nombreDe(l)} ya no está a tu cargo: no puedo enviarle ese mensaje.`);
            return true;
          }
        }
      }
    }
    // a) «Para Juan: …»
    if (!destino) {
      const x = PREFIJO.exec(texto);
      if (!x) return false;
      const busca = await this.buscar(v, x[1]);
      if (!busca.length) return false; // no es de ningún lead suyo: puede ser una orden para el Agente
      if (busca.length > 1) {
        const lista = busca
          .slice(0, 6)
          .map((c, i) => `${i + 1}) ${c.nombre} ${cola(c.telefono) || (usuarioDe(c.lead) ? '@' + usuarioDe(c.lead) : c.lead.origen ? '(' + c.lead.origen + ')' : '')}`.trim())
          .join('\n');
        await this.decir(wa, v, cv, `Hay ${busca.length} interesados que calzan con «${x[1].trim()}»:\n${lista}\nRepite con el nombre y apellido, los últimos dígitos del celular o el @usuario: «Para ${cola(busca[0].telefono) || (usuarioDe(busca[0].lead) ? '@' + usuarioDe(busca[0].lead) : busca[0].nombre)}: …».`);
        return true;
      }
      destino = busca[0];
      cuerpo = x[2].trim();
    }
    await this.enviarAlInteresado(wa, v, cv, destino, cuerpo, m);
    return true;
  }

  /** los leads a los que este usuario puede escribirles (los suyos; el administrador, todos) que calzan con lo escrito */
  private async buscar(v: WaVinculo, consulta: string): Promise<Candidato[]> {
    const u = await this.db.usuario.findUnique({ where: { id: v.usuarioId }, select: { rol: true } });
    const leads = await this.db.lead.findMany({
      where: {
        corredoraId: v.corredoraId,
        eliminadoEn: null,
        ...(u?.rol === 'ADMIN' ? {} : { corredorId: v.usuarioId }),
      },
      orderBy: { creadoEn: 'desc' },
      take: 3000,
    });
    const q = norm(consulta);
    const dig = consulta.replace(/\D/g, '');
    const fichas = leads.map((l) => ({ lead: l, nombre: nombreDe(l), telefono: telDe(l) }));
    // por usuario de Instagram o Facebook: «Para @lucia.ig: …»
    const usr = consulta.trim().replace(/^@/, '').toLowerCase();
    if (consulta.trim().startsWith('@') && usr) {
      const porUsuario = fichas.filter((c) => usuarioDe(c.lead).toLowerCase() === usr);
      return porUsuario;
    }
    // por celular (los últimos dígitos)
    if (dig.length >= 4) {
      const porTel = fichas.filter((c) => c.telefono.replace(/\D/g, '').endsWith(dig));
      if (porTel.length) return porTel;
    }
    const palabras = q.split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    const todas = fichas.filter((c) => {
      const n = norm(c.nombre);
      return palabras.every((p) => n.includes(p));
    });
    // un nombre exacto gana si hay varios que lo contienen
    const exacto = todas.filter((c) => norm(c.nombre) === q);
    // con una sola palabra («Willy») nunca se adivina: puede ser el primer nombre de varios; con nombre y apellido, el exacto gana
    return exacto.length === 1 && palabras.length >= 2 ? exacto : todas;
  }

  private async enviarAlInteresado(wa: Wechatia, v: WaVinculo, cv: Conversacion, d: Candidato, cuerpo: string, m: MensajeWa) {
    const usuario = await this.db.usuario.findUnique({ where: { id: v.usuarioId }, select: { nombre: true } });
    const corredor = usuario?.nombre || 'Tu corredor';
    const texto = `*${corredor}* (corredor):\n${cuerpo}`.slice(0, 3800);
    const tel = telNorm(d.telefono);
    // se le responde por el canal en que escribió por última vez: Instagram o Facebook (por el mismo contacto de wechatia),
    // aunque tenga celular guardado (wechatia junta sus canales en un solo contacto)
    const via = this.canalDe(d.lead);
    let canalProbado = false;
    if (via) {
      const ult = await this.db.leadMensaje.findFirst({
        where: { leadId: d.lead.id, de: 'cliente' },
        orderBy: { fecha: 'desc' },
        select: { datos: true },
      });
      const ultimoCanal = String(((ult?.datos ?? {}) as Record<string, unknown>).canal ?? '');
      if (!tel || ultimoCanal === via.canal) {
        canalProbado = true;
        // con celular, si Instagram/Facebook falla se sigue con WhatsApp; sin celular, el error se le dice al corredor
        if (await this.enviarPorCanal(wa, v, cv, d, via, cuerpo, texto, corredor, m, !!tel)) return;
        if (!tel) return;
      }
    }
    if (!tel) {
      await this.decir(wa, v, cv, `${d.nombre} no tiene celular guardado ni escribió por Instagram o Facebook: no puedo escribirle.`);
      return;
    }
    try {
      const r = await wa.enviar({
        telefono: d.telefono,
        nombre: d.nombre,
        texto,
        revisiones: 1,
        entrante24: async () => {
          const h = await this.db.waConversacion.findFirst({ where: { corredoraId: v.corredoraId, telefonoNorm: tel } });
          if (!h) return false;
          const ms = await wa.mensajes(h.convId, 15);
          return ms.some((x) => x.direccion === 'entrante' && Date.now() - new Date(x.fecha).getTime() < 24 * 36e5);
        },
      });
      await this.enviados.registrar(v.corredoraId, d.telefono, { messageId: r.messageId, texto, enHilo: false });
      const ms: MensajeLead[] = [
        {
          k: r.messageId ? 'wc' + r.messageId : 'as' + Date.now().toString(36),
          fecha: horaChile(),
          de: 'broker',
          autor: corredor,
          texto: cuerpo,
        },
      ];
      await this.leads.anotar(d.lead, ms);
      await this.leads.contactado(d.lead, `${corredor} respondió por WhatsApp`).catch(() => null);
      const extra = m.adjuntos.length ? ' (los archivos no se reenvían: solo el texto)' : '';
      await this.decir(wa, v, cv, `✅ Enviado a ${d.nombre}${extra}.`);
    } catch (e) {
      const fuera = e instanceof WechatiaError && e.codigo === 'FUERA_24H';
      if (fuera) {
        // fuera de las 24 h de WhatsApp: primero por Instagram/Facebook si no se había probado; si no, la plantilla de primer contacto
        if (via && !canalProbado && (await this.enviarPorCanal(wa, v, cv, d, via, cuerpo, texto, corredor, m, true))) return;
        return this.plantillaYPendiente(wa, v, cv, d, cuerpo, corredor);
      }
      await this.decir(wa, v, cv, `No pude enviarle a ${d.nombre}: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  /**
   * Fuera de las 24 h: se le manda la plantilla aprobada «primer contacto» (abre la ventana) y el mensaje del corredor queda
   * pendiente en el lead; sale solo cuando el interesado responde (`entrante`).
   */
  private async plantillaYPendiente(wa: Wechatia, v: WaVinculo, cv: Conversacion, d: Candidato, cuerpo: string, corredor: string) {
    try {
      await wa.enviarPlantilla({
        telefono: d.telefono,
        nombre: d.nombre,
        etiqueta: ETIQUETA_PRIMER_CONTACTO,
        campos: { nombre: d.nombre.split(/\s+/)[0], remitente: corredor, motivo: 'tu consulta' },
      });
      await this.enviados.registrar(v.corredoraId, d.telefono, { plantilla: true });
      await this.leads.cambiar(d.lead.id, (dd) => {
        dd.pendiente = { usuarioId: v.usuarioId, corredor, texto: cuerpo.slice(0, 3500), en: new Date().toISOString() };
        dd.historial = [
          ...(dd.historial || []),
          { fecha: new Date().toISOString(), texto: `${corredor} le mandó la plantilla de primer contacto; su mensaje saldrá cuando responda`, tipo: 'canal' },
        ].slice(-200);
        return { datos: dd, cols: {} };
      });
      await this.decir(
        wa,
        v,
        cv,
        `📨 ${d.nombre} no ha escrito en las últimas 24 h: le mandé la plantilla de primer contacto. Tu mensaje saldrá solo cuando responda.`,
      );
    } catch (e) {
      await this.decir(wa, v, cv, `No pude enviarle la plantilla a ${d.nombre}: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  /** el interesado respondió: sale el mensaje que el corredor dejó pendiente (si no pasaron más de 7 días) */
  private async entregarPendiente(wa: Wechatia, corredoraId: string, lead: Lead, cv: Conversacion) {
    const p = ((lead.datos ?? {}) as Record<string, any>).pendiente as
      | { usuarioId: string; corredor: string; texto: string; en: string }
      | undefined;
    if (!p?.texto || !cv.contactId) return;
    // se retira primero: si dos rondas coinciden, solo una lo manda
    const retirado = await this.leads.cambiar(lead.id, (dd) => {
      if (!(dd as Record<string, any>).pendiente) return null;
      delete (dd as Record<string, any>).pendiente;
      return { datos: dd, cols: {} };
    });
    if (!retirado) return;
    if (Date.now() - new Date(p.en).getTime() > 7 * 864e5) return;
    const texto = `*${p.corredor}* (corredor):\n${p.texto}`.slice(0, 3800);
    try {
      const r = await wa.enviarAContacto(cv.contactId, texto);
      await this.enviados.registrar(corredoraId, telDe(lead), { messageId: r.messageId, texto, enHilo: false });
      await this.leads.anotar(lead, [
        { k: r.messageId ? 'wc' + r.messageId : 'as' + Date.now().toString(36), fecha: horaChile(), de: 'broker', autor: p.corredor, texto: p.texto },
      ]);
      await this.leads.contactado(lead, `${p.corredor} respondió por WhatsApp`).catch(() => null);
      await this.ejecutivo.avisar(corredoraId, p.usuarioId, `✅ ${nombreDe(lead)} respondió y ya le llegó tu mensaje pendiente.`, null, wa, false);
    } catch (e) {
      this.log.warn(`mensaje pendiente de ${lead.id}: ${(e as Error).message}`);
      await this.ejecutivo.avisar(corredoraId, p.usuarioId, `No pude entregarle tu mensaje pendiente a ${nombreDe(lead)}: ${(e as Error).message.slice(0, 160)}`, null, wa, true);
    }
  }

  /** el canal de mensajería directa (Instagram o Facebook) por el que el lead escribió, con su contacto de wechatia */
  private canalDe(l: Lead): { canal: 'instagram' | 'facebook'; contactId: string } | null {
    const cs = (((l.datos ?? {}) as Record<string, any>).canales ?? []) as { canal?: string; contactId?: string }[];
    const c = [...cs].reverse().find((x) => (x.canal === 'instagram' || x.canal === 'facebook') && x.contactId);
    return c ? { canal: c.canal as 'instagram' | 'facebook', contactId: String(c.contactId) } : null;
  }

  private async enviarPorCanal(
    wa: Wechatia,
    v: WaVinculo,
    cv: Conversacion,
    d: Candidato,
    via: { canal: 'instagram' | 'facebook'; contactId: string },
    cuerpo: string,
    texto: string,
    corredor: string,
    m: MensajeWa,
    silencioso = false,
  ): Promise<boolean> {
    const nombreCanal = via.canal === 'instagram' ? 'Instagram' : 'Facebook';
    try {
      const r = await wa.enviarAContacto(via.contactId, texto, via.canal);
      await this.leads.anotar(d.lead, [
        {
          k: r.messageId ? 'wc' + r.messageId : 'as' + Date.now().toString(36),
          fecha: horaChile(),
          de: 'broker',
          autor: corredor,
          texto: cuerpo,
          datos: { canal: via.canal },
        },
      ]);
      await this.leads.contactado(d.lead, `${corredor} respondió por ${nombreCanal}`).catch(() => null);
      const extra = m.adjuntos.length ? ' (los archivos no se reenvían: solo el texto)' : '';
      await this.decir(wa, v, cv, `✅ Enviado a ${d.nombre} por ${nombreCanal}${extra}.`);
      return true;
    } catch (e) {
      if (silencioso) {
        this.log.warn(`respuesta por ${nombreCanal}: ${(e as Error).message}`);
        return false;
      }
      await this.decir(
        wa,
        v,
        cv,
        `No pude enviarle a ${d.nombre} por ${nombreCanal}: ${(e as Error).message.slice(0, 200)}. ${nombreCanal} solo deja responder a quien escribió hace poco.`,
      );
      return false;
    }
  }

  /** un mensaje del sistema al celular del corredor */
  private async decir(wa: Wechatia, v: WaVinculo, cv: Conversacion, texto: string) {
    const contactId = cv.contactId ?? v.contactId;
    if (!contactId) return;
    try {
      const r = await wa.enviarAContacto(contactId, texto);
      await this.enviados.registrar(v.corredoraId, v.telefono, { messageId: r.messageId, texto, enHilo: false });
    } catch (e) {
      this.log.warn(`aviso al corredor: ${(e as Error).message}`);
    }
  }
}
