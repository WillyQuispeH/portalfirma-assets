// La respuesta de una parte a la revisión del contrato de arriendo, por WhatsApp.
//  Cuando el corredor manda una versión del contrato a revisión (contrato-arriendo.ts › revisionEnviar) queda pendiente la respuesta de
//  esa persona (registro «revisiones_contrato»). Cuando ella escribe, este servicio la INTERPRETA con la IA y la registra sola:
//   · aprueba          → queda aprobada la versión (ciclo.contrato.aprobado) y se le avisa al corredor;
//   · comenta / pide un cambio → queda el comentario en el contrato (con su versión) y se le avisa al corredor con el texto, para corregir;
//   · pregunta         → queda como comentario y se le avisa al corredor para que responda;
//   · otra cosa        → sigue su camino (asistentes) sin tocar nada.
//  Así el corredor recibe la retroalimentación de todas las partes y nadie tiene que registrar la aprobación a mano.
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IaService } from './ia';
import { EnviadosService } from './enviados';
import { EjecutivoService } from './ejecutivo';
import { telNorm } from './comun';
import type { Conversacion, MensajeWa, Wechatia } from './wechatia';

const COLECCION = 'revisiones_contrato';
const VIGENCIA_MS = 45 * 24 * 3600_000;

interface Pendiente {
  estado: 'esperando' | 'aprobada';
  a: string;
  personaId: string;
  nombre: string;
  negocioId: string;
  version: number;
  via: 'directo' | 'plantilla';
  usuarioId: string;
  enviadaEn: string;
  /** el último mensaje suyo ya interpretado (no se vuelve a leer) */
  hastaEn?: string;
}

type Decision = 'aprueba' | 'comenta' | 'pregunta' | 'otro';

const SISTEMA = `Eres quien lee la respuesta de una persona (propietario, arrendatario o aval) a un CONTRATO DE ARRIENDO que una corredora de propiedades en Chile le mandó por WhatsApp para su revisión.
Clasifica lo que escribió en UNA decisión:
- "aprueba": está de acuerdo con el contrato tal como está, sin condiciones ni cambios pendientes («está bien», «apruebo», «de acuerdo», «conforme», «ok, pueden enviarlo a firma»). Un simple «ok» o «gracias» SIN referirse al contrato, o «lo reviso» NO es aprobación.
- "comenta": pide un cambio, corrige un dato, objeta una cláusula o aprueba CON condiciones o reparos (aunque diga «ok pero…»).
- "pregunta": tiene una duda y espera una respuesta de la corredora.
- "otro": un saludo, algo que no tiene relación con el contrato o no se entiende.
Devuelve un objeto JSON: {"decision": "aprueba"|"comenta"|"pregunta"|"otro", "resumen": "lo que pide o pregunta, en una frase corta (vacío si aprueba u otro)"}.
Ante la duda entre aprobar y no aprobar, NO apruebes.`;

/** el toque de un botón de plantilla no es una respuesta sobre el contrato */
const esBoton = (t: string) => /^\s*(enviar el documento|enviar documento|enviar)\s*$/i.test(t);

@Injectable()
export class RevisionContratoWaService {
  private readonly log = new Logger('RevisionContratoWa');
  constructor(
    private readonly db: PrismaService,
    private readonly ia: IaService,
    private readonly enviados: EnviadosService,
    private readonly ejecutivo: EjecutivoService,
    private readonly modulo: ModuleRef,
  ) {}

  /**
   * Mensajes nuevos de una conversación: si la persona tiene un contrato esperando su respuesta, se interpreta. Devuelve los mensajes que
   * siguen su camino; ante cualquier error (o sin IA), todos sin tocar.
   */
  async interceptar(wa: Wechatia, corredoraId: string, cv: Conversacion, nuevos: MensajeWa[]): Promise<MensajeWa[]> {
    try {
      const tel = telNorm(cv.telefono);
      if (!tel || !cv.contactId) return nuevos;
      const filas = await this.db.registro.findMany({
        where: { corredoraId, coleccion: COLECCION, eliminadoEn: null, datos: { path: ['a'], equals: tel } },
        orderBy: { actualizadoEn: 'desc' },
        take: 5,
      });
      const esperando = filas.filter((f) => {
        const d = f.datos as unknown as Pendiente;
        return d?.estado === 'esperando' && Date.now() - new Date(d.enviadaEn).getTime() < VIGENCIA_MS;
      });
      if (!esperando.length) return nuevos;
      let resto = nuevos;
      for (const f of esperando) {
        const d = f.datos as unknown as Pendiente;
        const desde = await this.entregadoEn(corredoraId, d);
        if (!desde) continue; // el PDF todavía no le llegó (plantilla sin responder): lo que escriba no es sobre el contrato
        const mios = resto.filter(
          (m) =>
            m.direccion === 'entrante' &&
            m.texto.trim() &&
            !esBoton(m.texto) &&
            new Date(m.fecha).getTime() > Math.max(new Date(desde).getTime(), d.hastaEn ? new Date(d.hastaEn).getTime() : 0),
        );
        if (!mios.length) continue;
        if (!(await this.ia.disponible(corredoraId))) continue;
        const consumidos = await this.interpretar(wa, corredoraId, cv, f, d, mios);
        if (consumidos) resto = resto.filter((m) => !mios.includes(m));
      }
      return resto;
    } catch (e) {
      this.log.warn(`respuesta al contrato: ${(e as Error).message}`);
      return nuevos;
    }
  }

  /** desde cuándo la persona tiene el PDF: al enviarlo directo, desde el envío; con plantilla, desde que lo recibió al responder */
  private async entregadoEn(corredoraId: string, d: Pendiente): Promise<string | null> {
    if (d.via === 'directo') return d.enviadaEn;
    const r = await this.db.registro.findUnique({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: 'revisiones_wa', id: `${d.negocioId}:${d.personaId}` } },
    });
    const x = r && !r.eliminadoEn ? (r.datos as { estado?: string; entregadaEn?: string } | null) : null;
    return x?.estado === 'entregada' && x.entregadaEn ? x.entregadaEn : null;
  }

  private async interpretar(
    wa: Wechatia,
    corredoraId: string,
    cv: Conversacion,
    f: { coleccion: string; id: string; datos: Prisma.JsonValue },
    d: Pendiente,
    mios: MensajeWa[],
  ): Promise<boolean> {
    const escrito = mios.map((m) => m.texto.trim()).join('\n').slice(0, 1500);
    let decision: Decision = 'otro';
    let resumen = '';
    try {
      const j = await this.ia.json({
        corredoraId,
        uso: 'contrato:respuesta',
        sistema: SISTEMA,
        usuario: `Persona: ${d.nombre}\nVersión del contrato: V${d.version}\nLo que escribió:\n${escrito}`,
      });
      const x = String(j.decision ?? '');
      decision = x === 'aprueba' || x === 'comenta' || x === 'pregunta' ? x : 'otro';
      resumen = String(j.resumen ?? '').trim().slice(0, 500);
    } catch (e) {
      this.log.warn(`no se pudo interpretar la respuesta de ${d.nombre}: ${(e as Error).message}`);
      return false;
    }
    const ultima = mios[mios.length - 1].fecha;
    const marcar = (estado: Pendiente['estado']) =>
      this.db.registro.update({
        where: { corredoraId_coleccion_id: { corredoraId, coleccion: f.coleccion, id: f.id } },
        data: { datos: { ...d, estado, hastaEn: ultima } as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
      });
    if (decision === 'otro') {
      await marcar(d.estado);
      return false;
    }
    const acciones = this.modulo.get((await import('../negocios/negocio-acciones.js')).NegocioAccionesService, { strict: false });
    const de = await this.rolDe(d);
    const r =
      decision === 'aprueba'
        ? await acciones.respuestaContrato(corredoraId, d.negocioId, d.personaId, { tipo: 'aprueba' })
        : await acciones.respuestaContrato(corredoraId, d.negocioId, d.personaId, {
            tipo: 'comenta',
            de,
            texto: decision === 'pregunta' ? `Pregunta: ${resumen || escrito}` : `${resumen ? resumen + ' — ' : ''}«${escrito.slice(0, 800)}»`,
          });
    if (!r) return false; // el negocio ya no está abierto o la versión cambió: que lo vea el corredor
    await marcar(decision === 'aprueba' ? 'aprobada' : 'esperando');

    const propiedad = await this.db.negocio
      .findUnique({ where: { id: d.negocioId }, select: { propiedad: { select: { codigo: true } }, datos: true } })
      .then((n) => `${(n?.datos as { codigo?: string } | null)?.codigo ?? ''}${n?.propiedad?.codigo ? ' · ' + n.propiedad.codigo : ''}`.trim());
    const nombre = d.nombre.split(/\s+/)[0];
    const responder = async (t: string) => {
      const x = await wa.enviarAContacto(cv.contactId!, t);
      await this.enviados.registrar(corredoraId, cv.telefono, { messageId: x.messageId, texto: t, enHilo: false });
    };
    let aviso: string;
    if (decision === 'aprueba') {
      await responder(`Gracias, ${nombre}: quedó registrada tu aprobación del contrato. Te avisaremos cuando esté listo para firmar.`);
      aviso = `✅ ${d.nombre} aprobó el contrato V${r.version}${propiedad ? ` (${propiedad})` : ''} por WhatsApp. Aprobaron ${r.aprobados} de ${r.total}.${r.todos ? ' Ya aprobaron todos: puedes enviarlo a firmar.' : ''}`;
    } else if (decision === 'comenta') {
      await responder(`Gracias, ${nombre}. Le paso tus comentarios a tu corredor para que los revise y te envíe la versión corregida.`);
      aviso = `✍️ ${d.nombre} comentó el contrato V${r.version}${propiedad ? ` (${propiedad})` : ''}: «${(resumen || escrito).slice(0, 400)}». Quedó anotado en el contrato; corrígelo y envía una versión nueva.`;
    } else {
      await responder(`Gracias por tu consulta, ${nombre}. Se la paso a tu corredor y te responde a la brevedad.`);
      aviso = `❓ ${d.nombre} tiene una duda sobre el contrato V${r.version}${propiedad ? ` (${propiedad})` : ''}: «${(resumen || escrito).slice(0, 400)}». Respóndele directamente.`;
    }
    await this.ejecutivo.avisarResponsables(corredoraId, r.corredorId, aviso, 'juanita', wa).catch(() => null);
    return true;
  }

  /** su rol en el contrato, para el comentario («propietario», «arrendatario», «codeudor») */
  private async rolDe(d: Pendiente): Promise<string> {
    const n = await this.db.negocio.findUnique({ where: { id: d.negocioId }, select: { datos: true } });
    const vs =
      (n?.datos as { ciclo?: { contrato?: { versiones?: { firmantes?: { personaId?: string; rol?: string }[] }[] } } } | null)?.ciclo?.contrato
        ?.versiones ?? [];
    const rol = String(vs[vs.length - 1]?.firmantes?.find((x) => x.personaId === d.personaId)?.rol ?? '').toLowerCase();
    return /arrendador|propietario|dueñ/.test(rol) ? 'propietario' : /arrendatario/.test(rol) ? 'arrendatario' : /codeudor|aval/.test(rol) ? 'codeudor' : 'arrendatario';
  }
}
