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
    await this.primerAviso(wa, corredoraId, cv, cli, corredor?.nombre ?? null);
    const nombre = nombreDe(act) || cli.nombre;
    const cuerpo =
      `💬 *${nombre}* (${telDe(act) || cli.telefono}) escribió:\n«${texto.slice(0, 1200)}»\n\n` +
      `↩ Para responderle: cita este mensaje, o escribe «Para ${nombre.split(/\s+/)[0]}: …».`;
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
        if (l) destino = { lead: l, nombre: nombreDe(l), telefono: telDe(l) };
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
          .map((c, i) => `${i + 1}) ${c.nombre} ${cola(c.telefono)}`.trim())
          .join('\n');
        await this.decir(wa, v, cv, `Hay ${busca.length} interesados que calzan con «${x[1].trim()}»:\n${lista}\nRepite con el nombre completo o los últimos dígitos del celular: «Para ${cola(busca[0].telefono) || busca[0].nombre}: …».`);
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
    return exacto.length === 1 ? exacto : todas;
  }

  private async enviarAlInteresado(wa: Wechatia, v: WaVinculo, cv: Conversacion, d: Candidato, cuerpo: string, m: MensajeWa) {
    const usuario = await this.db.usuario.findUnique({ where: { id: v.usuarioId }, select: { nombre: true } });
    const corredor = usuario?.nombre || 'Tu corredor';
    const texto = `*${corredor}* (corredor):\n${cuerpo}`.slice(0, 3800);
    const tel = telNorm(d.telefono);
    if (!tel) {
      await this.decir(wa, v, cv, `${d.nombre} no tiene celular guardado: no puedo escribirle por WhatsApp.`);
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
      await this.decir(
        wa,
        v,
        cv,
        fuera
          ? `No pude enviarle a ${d.nombre}: no ha escrito en las últimas 24 h y WhatsApp solo deja mandar una plantilla aprobada. Escríbele desde Asset o por otro medio.`
          : `No pude enviarle a ${d.nombre}: ${(e as Error).message.slice(0, 200)}`,
      );
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
