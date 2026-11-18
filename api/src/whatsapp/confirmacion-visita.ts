// Confirmación de una visita por WhatsApp (paso «Visita agendada» de un negocio).
//  1. «Confirmar por WhatsApp» (POST /v1/visitas/:id/confirmar) manda la plantilla aprobada «asset_confirmar_visita» al
//     celular del arrendatario (o comprador) de la visita y deja la visita en «confirmación enviada».
//  2. Cuando esa persona responde por el WhatsApp de la empresa, este servicio lee la respuesta ANTES que Tomás:
//       · un sí / ok / confirmo / dale…  → la visita queda CONFIRMADA (el paso pasa a logrado) y se le agradece;
//       · «no puedo», «cancelar», «otro día»… → no se confirma: se le avisa al corredor para que la reprograme;
//       · una pregunta («¿a qué hora?») o un mensaje largo → sigue su camino (Tomás) y la visita sigue sin confirmar.
// Se guarda en el mismo evento, en datos.confirmacion: { estado: 'enviada' | 'confirmada' | 'cambio', a (celular),
// personaId, enviadaEn, respondioEn, respuesta }. Al responder, el corredor recibe un aviso y la app recarga la agenda.
import { BadRequestException, Controller, HttpCode, Injectable, Logger, Param, Post } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { buscarVisible, esUuid } from '../comun/asignados';
import { eventoApp } from '../agenda/eventos';
import { AvisosService } from '../avisos/avisos';
import { EnviadosService } from './enviados';
import { EjecutivoService } from './ejecutivo';
import type { Conversacion, MensajeWa, Wechatia } from './wechatia';
import { firma, telNorm } from './comun';

export const ETIQUETA_CONFIRMAR_VISITA = 'asset_confirmar_visita';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
/** «sábado 15 de noviembre» */
const diaLargo = (f: string) => {
  const d = new Date(f + 'T12:00:00Z');
  return `${SEMANA[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
};

/** lo que dice quien responde: confirma, pide cambiar, o es otra cosa (pregunta, conversación) */
export function clasificarRespuesta(texto: string): 'confirma' | 'cambio' | 'otro' {
  const t = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[!¡.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return 'otro';
  if (t.length > 90) return 'otro';
  if (/\?|¿/.test(texto) || /\b(a que hora|cuando|donde|como|cual|quien|cuanto)\b/.test(t)) return 'otro';
  if (
    /(^|\s)(no puedo|no podre|no podria|no voy|no alcanzo|no llego|cancel|reagend|reprogram|cambiar|cambiemos|otro dia|otra hora|otra fecha|imposible|mejor otro|ya no)/.test(
      t,
    ) ||
    /^no(\s|$)/.test(t)
  )
    return 'cambio';
  if (
    /(^|\s)(si|sip|sii+|claro|ok|okey|oka|listo|dale|confirmo|confirmado|confirmada|perfecto|de acuerdo|ahi estare|alla estare|nos vemos|excelente|genial|gracias|vale|bueno|buenisimo)(\s|$)/.test(
      t,
    ) ||
    /[👍👌✅🙌🙏]/u.test(texto)
  )
    return 'confirma';
  return 'otro';
}

interface Confirmacion {
  estado: 'enviada' | 'confirmada' | 'cambio';
  via: 'plantilla';
  a: string;
  personaId: string;
  nombre: string;
  enviadaEn: string;
  respondioEn?: string;
  respuesta?: string;
}

@Injectable()
export class ConfirmacionVisitaService {
  private readonly log = new Logger('ConfirmacionVisita');
  constructor(
    private readonly db: PrismaService,
    private readonly enviados: EnviadosService,
    private readonly ejecutivo: EjecutivoService,
    private readonly avisos: AvisosService,
  ) {}

  /** manda la plantilla de confirmación al celular de quien hará la visita */
  async solicitar(u: UsuarioToken, eventoId: string) {
    const e = await buscarVisible(this.db.evento, u, eventoId, 'La visita');
    if (e.tipo !== 'visita') throw new BadRequestException('Solo se confirman las visitas.');
    if (e.estado !== 'programado') throw new BadRequestException('La visita ya no está agendada.');
    const n = e.negocioId
      ? await this.db.negocio.findUnique({ where: { id: e.negocioId }, select: { clienteId: true, tipo: true } })
      : null;
    const id = n?.clienteId && e.personaIds.includes(n.clienteId) ? n.clienteId : e.personaIds.find((x) => esUuid(x));
    if (!id || !esUuid(id))
      throw new BadRequestException('La visita no tiene persona: agrégala para poder confirmarle por WhatsApp.');
    const p = await this.db.persona.findFirst({ where: { id, corredoraId: u.corredoraId, eliminadoEn: null } });
    if (!p) throw new BadRequestException('La persona de la visita ya no existe.');
    const tel = telNorm(p.telefono);
    if (!p.telefono || !tel)
      throw new BadRequestException(`${p.nombre} no tiene celular registrado. Agrégalo en su ficha.`);

    const prop = e.propiedadId ? await this.db.propiedad.findUnique({ where: { id: e.propiedadId } }) : null;
    const yo = await this.db.usuario.findUnique({ where: { id: u.sub }, select: { nombre: true } });
    const corredora = await this.db.corredora.findUnique({ where: { id: u.corredoraId }, select: { nombre: true } });
    const fecha = e.fecha.toISOString().slice(0, 10);
    const direccion = prop
      ? [prop.direccion, prop.comuna].filter(Boolean).join(', ') || prop.titulo || prop.codigo
      : 'la propiedad';
    await this.enviados.plantilla(u, {
      telefono: p.telefono,
      nombre: p.nombre,
      etiqueta: ETIQUETA_CONFIRMAR_VISITA,
      campos: {
        nombre: p.nombre.split(/\s+/)[0],
        remitente: [yo?.nombre, corredora?.nombre].filter(Boolean).join(', de '),
        propiedad: direccion,
        fecha: diaLargo(fecha),
        hora: e.hora ?? 'durante el día',
      },
    });
    const confirmacion: Confirmacion = {
      estado: 'enviada',
      via: 'plantilla',
      a: tel,
      personaId: p.id,
      nombre: p.nombre,
      enviadaEn: new Date().toISOString(),
    };
    const r = await this.db.evento.update({
      where: { id: e.id },
      data: {
        datos: { ...((e.datos as object) ?? {}), confirmacion } as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    return eventoApp(r);
  }

  /**
   * Una respuesta al mensaje de confirmación. Devuelve los mensajes que siguen su camino (Tomás); si la persona no
   * tiene una confirmación pendiente, o si algo falla, devuelve todo sin tocar.
   */
  async interceptar(wa: Wechatia, corredoraId: string, cv: Conversacion, nuevos: MensajeWa[]): Promise<MensajeWa[]> {
    try {
      const t = telNorm(cv.telefono);
      if (!t) return nuevos;
      const filas = await this.db.evento.findMany({
        where: {
          corredoraId,
          tipo: 'visita',
          estado: 'programado',
          eliminadoEn: null,
          datos: { path: ['confirmacion', 'a'], equals: t },
        },
        orderBy: { actualizadoEn: 'desc' },
        take: 5,
      });
      const e = filas.find(
        (x) => ((x.datos as unknown as { confirmacion?: Confirmacion })?.confirmacion?.estado ?? '') === 'enviada',
      );
      if (!e) return nuevos;
      const c = (e.datos as unknown as { confirmacion: Confirmacion }).confirmacion;
      const desde = new Date(c.enviadaEn).getTime();
      for (const m of nuevos) {
        if (m.direccion !== 'entrante' || m.adjuntos.length) continue;
        if (new Date(m.fecha).getTime() < desde - 60_000) continue; // anterior al envío de la plantilla
        const k = clasificarRespuesta(m.texto);
        if (k === 'otro') continue;
        await this.responder(wa, corredoraId, cv, e, c, k, m.texto);
        return nuevos.filter((x) => x !== m);
      }
      return nuevos;
    } catch (err) {
      this.log.warn(`confirmación de visita: ${(err as Error).message}`);
      return nuevos;
    }
  }

  private async responder(
    wa: Wechatia,
    corredoraId: string,
    cv: Conversacion,
    e: Awaited<ReturnType<PrismaService['evento']['findMany']>>[number],
    c: Confirmacion,
    k: 'confirma' | 'cambio',
    texto: string,
  ) {
    const confirmacion: Confirmacion = {
      ...c,
      estado: k === 'confirma' ? 'confirmada' : 'cambio',
      respondioEn: new Date().toISOString(),
      respuesta: texto.trim().slice(0, 200),
    };
    await this.db.evento.update({
      where: { id: e.id },
      data: {
        datos: { ...((e.datos as object) ?? {}), confirmacion } as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    const cuando = `${diaLargo(e.fecha.toISOString().slice(0, 10))}${e.hora ? ' a las ' + e.hora : ''}`;
    if (cv.contactId) {
      const dicho =
        k === 'confirma'
          ? `¡Gracias${c.nombre ? ', ' + c.nombre.split(/\s+/)[0] : ''}! Quedó confirmada tu visita del ${cuando}. ¡Nos vemos!`
          : `Entendido, le aviso al corredor para coordinar otro horario contigo.`;
      const r = await wa.enviarAContacto(cv.contactId, `${firma('tomas', corredoraId)}\n${dicho}`);
      await this.enviados.registrar(corredoraId, cv.telefono, { messageId: r.messageId, texto: dicho, enHilo: false });
    }
    const aviso =
      k === 'confirma'
        ? `✅ ${c.nombre} confirmó la visita del ${cuando}.`
        : `⚠️ ${c.nombre} no puede en el horario de la visita del ${cuando}: "${confirmacion.respuesta}". Reprográmala en Asset.`;
    await this.ejecutivo.avisarResponsables(corredoraId, e.corredorId, aviso, 'tomas', wa).catch(() => false);
    const usuarioId = e.corredorId ?? e.creadoPorId;
    if (usuarioId)
      await this.avisos
        .crear({
          corredoraId,
          usuarioId,
          tipo: 'visita_confirmacion',
          texto: aviso.replace(/^\S+\s/, ''),
          datos: { eventoId: e.id, negocioId: e.negocioId, estado: confirmacion.estado },
        })
        .catch(() => null);
  }
}

@Controller('visitas')
export class ConfirmacionVisitaController {
  constructor(private readonly s: ConfirmacionVisitaService) {}

  @Post(':id/confirmar')
  @HttpCode(200)
  confirmar(@UsuarioActual() u: UsuarioToken, @Param('id') id: string) {
    return this.s.solicitar(u, id.slice(0, 80));
  }
}
