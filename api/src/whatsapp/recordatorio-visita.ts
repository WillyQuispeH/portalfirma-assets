// Recordatorios de visitas al corredor, por WhatsApp (plantilla aprobada «asset_recordatorio_visita_corredor»).
// Cada corredor lo enciende o apaga en Configuración › WhatsApp («Recordatorios de visitas»; apagado por defecto: va en
// el vínculo de su celular, wa_vinculos.datos.recordatoriosVisita) y le llegan a su celular vinculado, con la fecha, la hora,
// la propiedad, el interesado y el negocio (NG-XXX) de cada visita agendada a su cargo:
//   · «vispera»: la tarde anterior, desde las 18:00 (hora de Chile);
//   · «hora»:    1 hora antes de la visita (las visitas de todo el día solo tienen el de la víspera).
// La ronda corre cada RECORDATORIOS_CADA_SEG (60 s; 0 la apaga, para las pruebas). Cada recordatorio queda registrado
// (registros › recordatorios_visita, id «<visita>:<tipo>:<fecha><hora>») ANTES de enviarse: aunque corran dos API, no sale dos veces,
// y si la visita se reprograma a otra fecha u hora, se vuelve a recordar. Si el envío falla se reintenta hasta 3 veces.
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Evento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';
import { WechatiaService } from './wechatia';
import { EnviadosService } from './enviados';
import { diaLargo } from './confirmacion-visita';

export const ETIQUETA_RECORDATORIO_VISITA = 'asset_recordatorio_visita_corredor';
const COLECCION = 'recordatorios_visita';
/** desde esta hora (Chile) del día anterior sale el recordatorio de la víspera */
const HORA_VISPERA = 18 * 60;
const ANTES_MIN = 60;
const REINTENTOS = 3;
const ENTRE_ENVIOS_MS = 4000;

type Tipo = 'vispera' | 'hora';

/** fecha y minutos del día en Chile */
function ahoraChile(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const g = (k: string) => f.find((x) => x.type === k)?.value ?? '00';
  return { fecha: `${g('year')}-${g('month')}-${g('day')}`, minutos: Number(g('hour')) * 60 + Number(g('minute')) };
}
const sumarDias = (f: string, n: number) => {
  const d = new Date(f + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** los recordatorios que tocan ahora para una visita (puro: sirve para probarlo) */
export function recordatoriosDebidos(
  visita: { fecha: string; hora: string | null },
  ahora: { fecha: string; minutos: number },
): Tipo[] {
  const r: Tipo[] = [];
  if (visita.fecha === sumarDias(ahora.fecha, 1) && ahora.minutos >= HORA_VISPERA) r.push('vispera');
  if (visita.fecha === ahora.fecha && visita.hora) {
    const [h, m] = visita.hora.split(':').map(Number);
    const ini = h * 60 + m;
    if (ahora.minutos >= ini - ANTES_MIN && ahora.minutos < ini) r.push('hora');
  }
  return r;
}

@Injectable()
export class RecordatorioVisitaService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('RecordatorioVisita');
  private reloj: NodeJS.Timeout | null = null;
  private corriendo = false;
  private readonly cadaMs: number;
  private readonly fallos = new Map<string, number>();

  constructor(
    private readonly db: PrismaService,
    private readonly wa: WechatiaService,
    private readonly enviados: EnviadosService,
    config: ConfigService<Env, true>,
  ) {
    this.cadaMs = config.get('RECORDATORIOS_CADA_SEG', { infer: true }) * 1000;
  }

  onModuleInit() {
    if (this.cadaMs <= 0) return;
    this.reloj = setInterval(() => void this.ronda(), this.cadaMs);
    this.reloj.unref?.();
  }
  onModuleDestroy() {
    if (this.reloj) clearInterval(this.reloj);
  }

  /** revisa las visitas de hoy y mañana de cada corredor que encendió los recordatorios; devuelve cuántos envió */
  async ronda(ahora = ahoraChile()): Promise<number> {
    if (this.corriendo) return 0;
    this.corriendo = true;
    let enviados = 0;
    try {
      const vinculos = await this.db.waVinculo.findMany({
        where: { telefono: { not: null }, datos: { path: ['recordatoriosVisita'], equals: true } },
      });
      if (!vinculos.length) return 0;
      const fechas = [ahora.fecha, sumarDias(ahora.fecha, 1)].map((f) => new Date(f + 'T00:00:00Z'));
      for (const v of vinculos) {
        const visitas = await this.db.evento.findMany({
          where: {
            corredoraId: v.corredoraId,
            tipo: 'visita',
            estado: 'programado',
            eliminadoEn: null,
            fecha: { in: fechas },
            OR: [{ corredorId: v.usuarioId }, { corredorId: null, creadoPorId: v.usuarioId }],
          },
          orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
        });
        for (const e of visitas) {
          const fecha = e.fecha.toISOString().slice(0, 10);
          for (const tipo of recordatoriosDebidos({ fecha, hora: e.hora }, ahora)) {
            try {
              if (await this.enviar(v.corredoraId, v.usuarioId, v.telefono!, e, tipo, fecha)) {
                enviados++;
                await dormir(ENTRE_ENVIOS_MS); // el mismo contacto de wechatia: un recordatorio a la vez
              }
            } catch (err) {
              this.log.warn(`recordatorio de visita ${e.id}: ${(err as Error).message}`);
            }
          }
        }
      }
    } catch (err) {
      this.log.warn(`ronda de recordatorios: ${(err as Error).message}`);
    } finally {
      this.corriendo = false;
    }
    return enviados;
  }

  private async enviar(corredoraId: string, usuarioId: string, telefono: string, e: Evento, tipo: Tipo, fecha: string) {
    const id = `${e.id}:${tipo}:${fecha}${e.hora ?? ''}`;
    if ((this.fallos.get(id) ?? 0) >= REINTENTOS) return false;
    // se reserva antes de enviar: si ya existe, otro lo envió (o lo está enviando)
    try {
      await this.db.registro.create({
        data: { corredoraId, coleccion: COLECCION, id, usuarioId, datos: { estado: 'enviando', en: new Date().toISOString() } },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return false;
      throw err;
    }
    const clave = { corredoraId_coleccion_id: { corredoraId, coleccion: COLECCION, id } };
    try {
      const cli = await this.wa.cliente(corredoraId);
      if (!cli) throw new Error('el WhatsApp de la empresa no está conectado');
      const [corredor, prop, negocio] = await Promise.all([
        this.db.usuario.findUnique({ where: { id: usuarioId }, select: { nombre: true } }),
        e.propiedadId ? this.db.propiedad.findUnique({ where: { id: e.propiedadId } }) : null,
        e.negocioId ? this.db.negocio.findUnique({ where: { id: e.negocioId } }) : null,
      ]);
      const personaId = negocio?.clienteId ?? e.personaIds.find((x) => /^[0-9a-f-]{36}$/i.test(x));
      const persona = personaId
        ? await this.db.persona.findFirst({ where: { id: personaId, corredoraId, eliminadoEn: null } })
        : null;
      const direccion = prop ? [prop.direccion, prop.comuna].filter(Boolean).join(', ') || prop.titulo : '';
      const codigoNegocio = (negocio?.datos as { codigo?: string } | null)?.codigo;
      const campos = {
        nombre: (corredor?.nombre ?? '').split(/\s+/)[0] || 'corredor',
        fecha: diaLargo(fecha),
        hora: e.hora ?? 'todo el día',
        propiedad: prop ? [prop.codigo, direccion].filter(Boolean).join(' · ') : 'Sin propiedad',
        interesado: persona ? [persona.nombre, persona.telefono].filter(Boolean).join(' · ') : 'Sin interesado',
        negocio: codigoNegocio ?? 'Sin negocio',
      };
      await cli.enviarPlantilla({ telefono, nombre: corredor?.nombre ?? '', etiqueta: ETIQUETA_RECORDATORIO_VISITA, campos });
      await this.enviados.registrar(corredoraId, telefono, { plantilla: true });
      await this.db.registro.update({
        where: clave,
        data: { datos: { estado: 'enviado', en: new Date().toISOString(), campos } as Prisma.InputJsonObject },
      });
      return true;
    } catch (err) {
      // para reintentar en la próxima ronda (hasta REINTENTOS veces)
      this.fallos.set(id, (this.fallos.get(id) ?? 0) + 1);
      await this.db.registro.delete({ where: clave }).catch(() => null);
      throw err;
    }
  }
}
