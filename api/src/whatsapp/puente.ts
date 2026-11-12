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
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../comun/zod.pipe';
import { idDoc } from '../comun/asignados';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import type { Lead, WaVinculo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EjecutivoService } from './ejecutivo';
import { EnviadosService } from './enviados';
import { LeadsWaService, type MensajeLead } from './leads-wa';
import { horaChile, norm, telNorm } from './comun';
import { WechatiaError, WechatiaService, type Conversacion, type MensajeWa, type Wechatia } from './wechatia';

/** etiqueta que dispara el flujo «Asset · Primer contacto (plantilla)» de wechatia (plantilla aprobada asset_primer_contacto) */
const ETIQUETA_PRIMER_CONTACTO = 'asset-primer-contacto';

/** «#12 texto» (también «#12: texto»): atajo con el número corto que trae el aviso */
const ATAJO = /^\s*#(\d{1,6})\b\s*[:,.-]?\s*([\s\S]+)$/;

/** el aviso que Asset le manda al corredor: «💬 *Nombre* (canal) escribió: …» */
const AVISO = /💬\s*\*([^*\n]+)\*[^\n]*escribió/;

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

/** lo que pasó al escribirle a un interesado (el `mensaje` es para el corredor) */
export interface ResultadoEnvio {
  ok: boolean;
  estado: 'enviado' | 'plantilla' | 'error';
  canal?: 'whatsapp' | 'instagram' | 'facebook';
  codigo?: 'OTRO_CORREDOR' | 'SIN_CANAL' | 'NO_ENVIADO';
  mensaje: string;
}

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

  /** el número corto del interesado en su corredora («#12»): se asigna la primera vez que se le avisa al corredor */
  private async codigoCorto(act: Lead): Promise<number> {
    const previo = Number(((act.datos ?? {}) as Record<string, any>).corto);
    if (previo > 0) return previo;
    const r = await this.db.$queryRaw<{ m: number | null }[]>`
      SELECT max((datos->>'corto')::int) AS m FROM leads
      WHERE corredora_id = ${act.corredoraId}::uuid AND datos->>'corto' ~ '^[0-9]+$'`;
    const n = (r[0]?.m ?? 0) + 1;
    await this.leads.cambiar(act.id, (dd) => {
      if ((dd as Record<string, any>).corto) return null;
      (dd as Record<string, any>).corto = n;
      return { datos: dd, cols: {} };
    });
    const l = await this.db.lead.findUnique({ where: { id: act.id }, select: { datos: true } });
    return Number(((l?.datos ?? {}) as Record<string, any>).corto) || n;
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
    const corto = await this.codigoCorto(act);
    const cuerpo =
      `💬 *${nombre}* ${via} escribió:\n«${texto.slice(0, 1200)}»\n\n` +
      `↩ Para responderle escribe «#${corto} tu mensaje» o «Para ${usuarioDe(act) ? '@' + usuarioDe(act) : nombre}: …».`;
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
      // WhatsApp cita por su propio id (wamid…): se busca ese mensaje en la conversación (su `altId`) para sacar el id de wechatia
      const orig = (await wa.mensajes(cv.id, 100)).find((x) => x.altId === m.respondeA || x.id === m.respondeA);
      let p = await this.db.waPuente.findFirst({
        where: { corredoraId: v.corredoraId, messageId: { in: [m.respondeA, ...(orig ? [orig.id] : [])] } },
        orderBy: { id: 'desc' },
      });
      const esAviso = !!orig && AVISO.test(orig.texto);
      if (!p) this.log.warn(`cita sin vínculo: respondeA=${m.respondeA} mensaje=${orig?.id ?? 'no está en las últimas 100'} aviso=${esAviso}`);
      let l: Lead | null = p
        ? await this.db.lead.findFirst({ where: { id: p.leadId, corredoraId: v.corredoraId, eliminadoEn: null } })
        : null;
      if (!l && esAviso) {
        // respaldo: el aviso dice a quién es («💬 *Nombre* (canal) escribió»)
        const nombre = AVISO.exec(orig!.texto)![1];
        const busca = await this.buscar(v, nombre);
        if (busca.length === 1) l = busca[0].lead;
        else if (busca.length > 1) {
          await this.preguntarCual(wa, v, cv, busca, nombre);
          return true;
        } else {
          await this.decir(wa, v, cv, `No encontré a «${nombre}» entre tus interesados (¿se reasignó o se eliminó?): no puedo enviarle ese mensaje.`);
          return true;
        }
      }
      if (l) {
        // el lead pudo reasignarse desde que se reenvió el aviso: solo el dueño de hoy (o un administrador) puede responderle
        const quien = await this.db.usuario.findUnique({ where: { id: v.usuarioId }, select: { rol: true } });
        if (quien?.rol === 'ADMIN' || l.corredorId === v.usuarioId) destino = { lead: l, nombre: nombreDe(l), telefono: telDe(l) };
        else {
          await this.decir(wa, v, cv, `${nombreDe(l)} ya no está a tu cargo: no puedo enviarle ese mensaje.`);
          return true;
        }
      } else if (esAviso) {
        // era la respuesta a un aviso de un interesado, pero no se pudo identificar: no se manda al Agente
        await this.decir(wa, v, cv, 'No pude saber a quién le respondes. Escribe «Para Nombre: …» con el nombre del interesado.');
        return true;
      }
    }
    // a0) «#12 texto»: el número corto del aviso
    if (!destino) {
      const c = ATAJO.exec(texto);
      if (c) {
        const u = await this.db.usuario.findUnique({ where: { id: v.usuarioId }, select: { rol: true } });
        const l = await this.db.lead.findFirst({
          where: { corredoraId: v.corredoraId, eliminadoEn: null, datos: { path: ['corto'], equals: Number(c[1]) } },
        });
        if (!l) {
          await this.decir(wa, v, cv, `No encontré al interesado #${c[1]}. Revisa el número del aviso o escribe «Para Nombre: …».`);
          return true;
        }
        if (u?.rol !== 'ADMIN' && l.corredorId !== v.usuarioId) {
          await this.decir(wa, v, cv, `El interesado #${c[1]} no está a tu cargo: solo su corredor o un administrador puede escribirle.`);
          return true;
        }
        destino = { lead: l, nombre: nombreDe(l), telefono: telDe(l) };
        cuerpo = c[2].trim();
      }
    }
    // a) «Para Juan: …»
    if (!destino) {
      const x = PREFIJO.exec(texto);
      if (!x) return false;
      const busca = await this.buscar(v, x[1]);
      if (!busca.length) {
        // si calza con un interesado de OTRO corredor se le dice (antes lo contestaba el Agente); si no, puede ser una orden para el Agente
        if (await this.buscar(v, x[1], true).then((a) => a.length > 0)) {
          await this.decir(wa, v, cv, `«${x[1].trim()}» no está entre tus interesados: lo atiende otro corredor, y solo él o un administrador puede escribirle.`);
          return true;
        }
        return false;
      }
      if (busca.length > 1) {
        await this.preguntarCual(wa, v, cv, busca, x[1].trim());
        return true;
      }
      destino = busca[0];
      cuerpo = x[2].trim();
    }
    await this.enviarAlInteresado(wa, v, cv, destino, cuerpo, m);
    return true;
  }

  /** varios interesados calzan con lo escrito: se pregunta a cuál */
  private async preguntarCual(wa: Wechatia, v: WaVinculo, cv: Conversacion, busca: Candidato[], consulta: string) {
    const lista = busca
      .slice(0, 6)
      .map((c, i) => `${i + 1}) ${c.nombre} ${((c.lead.datos as Record<string, any>)?.corto ? '#' + (c.lead.datos as Record<string, any>).corto + ' ' : '')}${cola(c.telefono) || (usuarioDe(c.lead) ? '@' + usuarioDe(c.lead) : c.lead.origen ? '(' + c.lead.origen + ')' : '')}`.trim())
      .join('\n');
    await this.decir(
      wa,
      v,
      cv,
      `Hay ${busca.length} interesados que calzan con «${consulta}»:\n${lista}\nRepite con el nombre y apellido, los últimos dígitos del celular o el @usuario: «Para ${cola(busca[0].telefono) || (usuarioDe(busca[0].lead) ? '@' + usuarioDe(busca[0].lead) : busca[0].nombre)}: …».`,
    );
  }

  /** los leads a los que este usuario puede escribirles (los suyos; el administrador, todos) que calzan con lo escrito */
  private async buscar(v: WaVinculo, consulta: string, ajenos = false): Promise<Candidato[]> {
    const u = await this.db.usuario.findUnique({ where: { id: v.usuarioId }, select: { rol: true } });
    if (ajenos && u?.rol === 'ADMIN') return []; // el administrador ve todos
    const leads = await this.db.lead.findMany({
      where: {
        corredoraId: v.corredoraId,
        eliminadoEn: null,
        ...(u?.rol === 'ADMIN' ? {} : ajenos ? { corredorId: { not: v.usuarioId } } : { corredorId: v.usuarioId }),
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

  /** desde el celular del corredor: se responde y se le cuenta el resultado por WhatsApp */
  private async enviarAlInteresado(wa: Wechatia, v: WaVinculo, cv: Conversacion, d: Candidato, cuerpo: string, m: MensajeWa) {
    const r = await this.responder(wa, v.corredoraId, v.usuarioId, d.lead, cuerpo);
    const extra = r.ok && r.estado === 'enviado' && m.adjuntos.length ? ' (los archivos no se reenvían: solo el texto)' : '';
    await this.decir(wa, v, cv, extra ? r.mensaje.replace(/\.$/, extra + '.') : r.mensaje);
  }

  /**
   * Le escribe el corredor (`usuarioId`) a un interesado. Lo usan el puente (WhatsApp del corredor) y la app (Leads).
   *  · Solo el corredor a cargo o un administrador.
   *  · Por el canal en que el interesado escribió por última vez (Instagram o Facebook, por el mismo contacto de wechatia),
   *    aunque tenga celular guardado; si no, por WhatsApp.
   *  · WhatsApp fuera de las 24 h: se prueba Instagram/Facebook y, si no, la plantilla de primer contacto; el mensaje queda
   *    pendiente en el lead y sale cuando el interesado responde (`entregarPendiente`).
   * Nunca lanza: devuelve qué pasó, con el texto para el corredor.
   */
  async responder(wa: Wechatia, corredoraId: string, usuarioId: string, lead: Lead, cuerpo: string): Promise<ResultadoEnvio> {
    const usuario = await this.db.usuario.findUnique({ where: { id: usuarioId }, select: { nombre: true, rol: true } });
    const nombre = nombreDe(lead);
    if (usuario?.rol !== 'ADMIN' && lead.corredorId !== usuarioId)
      return { ok: false, estado: 'error', codigo: 'OTRO_CORREDOR', mensaje: `${nombre} no está a tu cargo: solo su corredor o un administrador puede escribirle.` };
    const corredor = usuario?.nombre || 'Tu corredor';
    const texto = `*${corredor}* (corredor):\n${cuerpo}`.slice(0, 3800);
    const telefono = telDe(lead);
    const tel = telNorm(telefono);
    const via = this.canalDe(lead);
    let canalProbado = false;
    if (via) {
      const ult = await this.db.leadMensaje.findFirst({
        where: { leadId: lead.id, de: 'cliente' },
        orderBy: { fecha: 'desc' },
        select: { datos: true },
      });
      const ultimoCanal = String(((ult?.datos ?? {}) as Record<string, unknown>).canal ?? '');
      if (!tel || ultimoCanal === via.canal) {
        canalProbado = true;
        const r = await this.enviarPorCanal(wa, lead, via, cuerpo, texto, corredor);
        // con celular, si Instagram/Facebook falla se sigue con WhatsApp
        if (r.ok || !tel) return r;
      }
    }
    if (!tel)
      return { ok: false, estado: 'error', codigo: 'SIN_CANAL', mensaje: `${nombre} no tiene celular guardado ni escribió por Instagram o Facebook: no hay por dónde escribirle.` };
    try {
      const r = await wa.enviar({
        telefono,
        nombre,
        texto,
        revisiones: 1,
        entrante24: async () => {
          const h = await this.db.waConversacion.findFirst({ where: { corredoraId, telefonoNorm: tel } });
          if (!h) return false;
          const ms = await wa.mensajes(h.convId, 15);
          return ms.some((x) => x.direccion === 'entrante' && Date.now() - new Date(x.fecha).getTime() < 24 * 36e5);
        },
      });
      await this.enviados.registrar(corredoraId, telefono, { messageId: r.messageId, texto, enHilo: false });
      await this.leads.anotar(lead, [
        {
          k: r.messageId ? 'wc' + r.messageId : 'as' + Date.now().toString(36),
          fecha: horaChile(),
          de: 'broker',
          autor: corredor,
          texto: cuerpo,
          datos: { canal: 'whatsapp' },
        },
      ]);
      await this.leads.contactado(lead, `${corredor} respondió por WhatsApp`).catch(() => null);
      return { ok: true, estado: 'enviado', canal: 'whatsapp', mensaje: `✅ Enviado a ${nombre} por WhatsApp.` };
    } catch (e) {
      if (e instanceof WechatiaError && e.codigo === 'FUERA_24H') {
        if (via && !canalProbado) {
          const r = await this.enviarPorCanal(wa, lead, via, cuerpo, texto, corredor);
          if (r.ok) return r;
        }
        return this.plantillaYPendiente(wa, corredoraId, usuarioId, lead, cuerpo, corredor);
      }
      return { ok: false, estado: 'error', codigo: 'NO_ENVIADO', mensaje: `No pude enviarle a ${nombre}: ${(e as Error).message.slice(0, 200)}` };
    }
  }

  /**
   * Fuera de las 24 h: se le manda la plantilla aprobada «primer contacto» (abre la ventana) y el mensaje del corredor queda
   * pendiente en el lead; sale solo cuando el interesado responde (`entrante`).
   */
  private async plantillaYPendiente(
    wa: Wechatia,
    corredoraId: string,
    usuarioId: string,
    lead: Lead,
    cuerpo: string,
    corredor: string,
  ): Promise<ResultadoEnvio> {
    const nombre = nombreDe(lead);
    try {
      await wa.enviarPlantilla({
        telefono: telDe(lead),
        nombre,
        etiqueta: ETIQUETA_PRIMER_CONTACTO,
        campos: { nombre: nombre.split(/\s+/)[0], remitente: corredor, motivo: 'tu consulta' },
      });
      await this.enviados.registrar(corredoraId, telDe(lead), { plantilla: true });
      await this.leads.cambiar(lead.id, (dd) => {
        dd.pendiente = { usuarioId, corredor, texto: cuerpo.slice(0, 3500), en: new Date().toISOString() };
        dd.historial = [
          ...(dd.historial || []),
          { fecha: new Date().toISOString(), texto: `${corredor} le mandó la plantilla de primer contacto; su mensaje saldrá cuando responda`, tipo: 'canal' },
        ].slice(-200);
        return { datos: dd, cols: {} };
      });
      return {
        ok: true,
        estado: 'plantilla',
        canal: 'whatsapp',
        mensaje: `📨 ${nombre} no ha escrito en las últimas 24 h: le mandé la plantilla de primer contacto. Tu mensaje saldrá solo cuando responda.`,
      };
    } catch (e) {
      return { ok: false, estado: 'error', codigo: 'NO_ENVIADO', mensaje: `No pude enviarle la plantilla a ${nombre}: ${(e as Error).message.slice(0, 200)}` };
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
    lead: Lead,
    via: { canal: 'instagram' | 'facebook'; contactId: string },
    cuerpo: string,
    texto: string,
    corredor: string,
  ): Promise<ResultadoEnvio> {
    const nombreCanal = via.canal === 'instagram' ? 'Instagram' : 'Facebook';
    const nombre = nombreDe(lead);
    try {
      const r = await wa.enviarAContacto(via.contactId, texto, via.canal);
      await this.leads.anotar(lead, [
        {
          k: r.messageId ? 'wc' + r.messageId : 'as' + Date.now().toString(36),
          fecha: horaChile(),
          de: 'broker',
          autor: corredor,
          texto: cuerpo,
          datos: { canal: via.canal },
        },
      ]);
      await this.leads.contactado(lead, `${corredor} respondió por ${nombreCanal}`).catch(() => null);
      return { ok: true, estado: 'enviado', canal: via.canal, mensaje: `✅ Enviado a ${nombre} por ${nombreCanal}.` };
    } catch (e) {
      this.log.warn(`respuesta por ${nombreCanal}: ${(e as Error).message}`);
      return {
        ok: false,
        estado: 'error',
        codigo: 'NO_ENVIADO',
        canal: via.canal,
        mensaje: `No pude enviarle a ${nombre} por ${nombreCanal}: ${(e as Error).message.slice(0, 200)}. ${nombreCanal} solo deja responder a quien escribió hace poco.`,
      };
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

const enviarEsquema = z.object({ texto: z.string().trim().min(1, 'Escribe el mensaje.').max(3500) });

/** POST /v1/leads/:id/enviar { texto } — escribirle al interesado desde la app (Leads), con las mismas reglas del puente */
@Controller('leads')
export class LeadsEnvioController {
  constructor(
    private readonly puente: PuenteService,
    private readonly db: PrismaService,
    private readonly wa: WechatiaService,
  ) {}

  @Post(':id/enviar')
  @HttpCode(200)
  async enviar(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', new ZodPipe(idDoc)) id: string,
    @Body(new ZodPipe(enviarEsquema)) b: z.infer<typeof enviarEsquema>,
  ) {
    const lead = await this.db.lead.findFirst({ where: { id, corredoraId: u.corredoraId, eliminadoEn: null } });
    if (!lead) throw new NotFoundException('El lead no existe.');
    const wa = await this.wa.cliente(u.corredoraId);
    if (!wa)
      throw new BadRequestException({ message: 'El WhatsApp de la empresa no está conectado en Asset.', code: 'SIN_CLAVE' });
    const r = await this.puente.responder(wa, u.corredoraId, u.sub, lead, b.texto);
    if (!r.ok) {
      const cuerpo = { message: r.mensaje, code: r.codigo };
      throw r.codigo === 'OTRO_CORREDOR' ? new ForbiddenException(cuerpo) : new BadRequestException(cuerpo);
    }
    return r;
  }
}
