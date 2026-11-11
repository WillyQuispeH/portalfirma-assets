// Evaluación del arrendatario y de sus N avales por WhatsApp (etapa 2 de un negocio de arriendo).
//  1. «Solicitar documentación» (POST /v1/evaluaciones/:negocioId/solicitar) manda la plantilla aprobada
//     «asset_solicitar_documentos» al celular del arrendatario (la persona del negocio) y abre la evaluación.
//  2. Lo que el arrendatario manda después al WhatsApp de la empresa (fotos y PDF) lo recibe este servicio ANTES que
//     Tomás: baja cada archivo, lo guarda en R2, lo lee con Claude (qué documento es, qué dice, alertas) y le responde
//     qué recibió y qué falta. Los mensajes de solo texto siguen su camino (Tomás).
//  3. Con todo recibido (contrato, cédula por ambos lados, 3 liquidaciones, AFP de 6 meses y Dicom) arma el resumen y un
//     porcentaje de aprobación con una regla fija (ver puntuar) y avisa al corredor. La decisión es SIEMPRE del corredor:
//     POST /v1/evaluaciones/:negocioId/decidir. El porcentaje es una ayuda, no una resolución.
// Se guarda en la colección «evaluaciones» (registros), con el id del negocio. Los archivos quedan en R2 con clave propia
// (c/<corredora>/r/evaluaciones/todos/<negocio>/…) y se miran con enlaces firmados (GET …/archivo/:n).
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type Anthropic from '@anthropic-ai/sdk';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AlmacenamientoService } from '../archivos/almacenamiento.service';
import { ActividadService } from '../comun/actividad.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { buscarVisible } from '../comun/asignados';
import { EnviadosService } from './enviados';
import { EjecutivoService } from './ejecutivo';
import { IaService } from './ia';
import type { Conversacion, MensajeWa, Wechatia } from './wechatia';
import { firma, telNorm } from './comun';

const COLECCION = 'evaluaciones';
export const ETIQUETA_PLANTILLA = 'asset_solicitar_documentos';
const ARCHIVO_MAX = 20 * 1024 * 1024;
const MAX_ARCHIVOS = 25;
const ES_AUDIO = /\.(ogg|oga|opus|mp3|m4a|amr|aac|wav|webm)(\?|$)|audio/i;
const ES_VIDEO = /\.(mp4|mov|3gp)(\?|$)|video/i;

/** lo que se pide, en el orden en que se le cuenta al arrendatario */
export const DOCUMENTOS = [
  { id: 'contrato', nombre: 'Contrato de trabajo' },
  { id: 'cedula', nombre: 'Cédula de identidad (frente y reverso)' },
  { id: 'liquidaciones', nombre: 'Últimas 3 liquidaciones de sueldo' },
  { id: 'afp', nombre: 'Certificado de cotizaciones AFP (6 meses)' },
  { id: 'dicom', nombre: 'Informe Dicom' },
] as const;
type DocId = (typeof DOCUMENTOS)[number]['id'];

type J = Record<string, any>;

export interface ArchivoEval {
  n: number;
  clave: string;
  nombre: string;
  tipo: string;
  recibido: string;
  /** contrato_trabajo | cedula_frente | cedula_reverso | cedula_ambas | liquidacion | afp | dicom | otro */
  clase: string;
  legible: boolean;
  resumen: string;
  persona: { nombre?: string; rut?: string };
  datos: J;
  alertas: string[];
}
/** cada persona que entrega documentos: el arrendatario y cada aval */
export interface PersonaEval {
  personaId: string;
  rol: 'arrendatario' | 'aval';
  nombre: string;
  telNorm: string;
  solicitadaEn: string;
  archivos: ArchivoEval[];
  /** todos sus documentos recibidos (los lee la IA) */
  completa: boolean;
  analisis: AnalisisPersona | null;
}
export interface Evaluacion {
  negocioId: string;
  /** teléfonos (últimos 9 dígitos) de todas las personas: así se encuentra la evaluación abierta de quien escribe */
  telefonos: string[];
  estado: 'solicitada' | 'completa' | 'revisada';
  solicitadaEn: string;
  solicitadaPor: string | null;
  personas: PersonaEval[];
  analisis: Analisis | null;
  decision: { estado: 'aprobada' | 'rechazada'; por: string; en: string; nota: string } | null;
}
export interface Criterio {
  id: string;
  nombre: string;
  peso: number;
  puntos: number;
  detalle: string;
}
export interface AnalisisPersona {
  porcentaje: number;
  nivel: 'alto' | 'medio' | 'bajo';
  criterios: Criterio[];
  faltan: string[];
  alertas: string[];
  rentaLiquidaClp: number | null;
}
export interface Analisis {
  hechoEn: string;
  /** el del arrendatario si no hay avales; con avales: 60 % el del arrendatario y 40 % el promedio de los avales */
  porcentaje: number;
  nivel: 'alto' | 'medio' | 'bajo';
  resumen: string;
  arriendoClp: number | null;
  porPersona: { personaId: string; rol: string; nombre: string; porcentaje: number; nivel: string }[];
}

const solicitarEsquema = z.object({
  avales: z.array(z.uuid()).max(10).default([]),
  titular: z.boolean().default(true),
});
const decidirEsquema = z.object({
  decision: z.enum(['aprobada', 'rechazada']),
  nota: z.string().trim().max(1000).default(''),
});

const SISTEMA_LECTURA = `Eres un analista que revisa los documentos que un postulante a arriendo en Chile manda por WhatsApp. Recibes UNA foto o PDF. Devuelve un objeto JSON con:
{
 "clase": "contrato_trabajo" | "cedula_frente" | "cedula_reverso" | "cedula_ambas" | "liquidacion" | "afp" | "dicom" | "otro",
 "legible": true|false (false si está borroso, cortado o no se puede leer lo importante),
 "resumen": "una o dos frases con lo esencial, en español",
 "persona": { "nombre": "nombre completo que aparece (o vacío)", "rut": "RUT tal como aparece (o vacío)" },
 "datos": { solo las claves que apliquen a su clase:
   contrato_trabajo: "empleador", "cargo", "tipoContrato" ("indefinido"|"plazo_fijo"|"obra_faena"|"honorarios"|"otro"), "fechaInicio" (AAAA-MM-DD), "sueldoBase" (número en pesos);
   cedula_*: "vigencia" (AAAA-MM-DD de vencimiento si se ve), "nacionalidad";
   liquidacion: "periodo" (AAAA-MM), "liquido" (líquido a pagar, número en pesos), "bruto" (total haberes), "empleador"; si el archivo trae VARIAS liquidaciones, "liquidaciones": [{ "periodo", "liquido" }] en vez de las tres primeras claves;
   afp: "afp" (nombre), "empleador", "mesesCotizados" (cuántos meses aparecen cotizados), "ultimoMes" (AAAA-MM), "alDia" (true si no hay meses impagos o sin pago), "mesesImpagos" (número);
   dicom: "sinDeudas" (true si no registra morosidades ni protestos), "cantidadDeudas" (número), "montoMoroso" (pesos), "fechaEmision" (AAAA-MM-DD)
 },
 "alertas": ["cosas raras: documento adulterado o editado, datos que no calzan, vencido, de otra persona, ilegible, etc. Vacío si no hay"]
}
No inventes: si un dato no se ve, omítelo. Los montos van como número sin puntos ni símbolos.`;

const SISTEMA_RESUMEN = `Eres analista de una corredora de propiedades en Chile. Con los datos de los documentos de un postulante a arriendo y el puntaje que calculó el sistema, escribe un resumen para el corredor: 4 a 6 líneas, en español, claras y sin adornos, con lo bueno, lo preocupante y qué conviene verificar. No repitas el porcentaje como una decisión: la decide el corredor. Devuelve un JSON {"resumen": "..."}.`;

const clp = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-CL')}`);
const txt = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(txt(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const rutLimpio = (r: unknown) =>
  txt(r)
    .replace(/[^0-9kK]/g, '')
    .toUpperCase();
const mesesDesde = (f: string, hasta = new Date()) => {
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? null : (hasta.getTime() - d.getTime()) / (30.44 * 864e5);
};

/** qué hay y qué falta, según lo ya leído */
export function revisarDocumentos(ev: Pick<PersonaEval, 'archivos'>) {
  const ok = ev.archivos.filter((a) => a.legible);
  const clases = (c: string) => ok.filter((a) => a.clase === c);
  const periodos = new Set<string>();
  let liquidaciones = 0;
  for (const a of clases('liquidacion')) {
    const lista = Array.isArray(a.datos.liquidaciones) ? (a.datos.liquidaciones as J[]) : [a.datos];
    for (const l of lista) {
      liquidaciones++;
      if (l.periodo) periodos.add(String(l.periodo));
    }
  }
  const nLiq = periodos.size >= 1 ? Math.max(periodos.size, 0) : liquidaciones;
  const cedula =
    clases('cedula_ambas').length > 0 || (clases('cedula_frente').length > 0 && clases('cedula_reverso').length > 0);
  const estado: Record<DocId, { ok: boolean; detalle: string }> = {
    contrato: { ok: clases('contrato_trabajo').length > 0, detalle: '' },
    cedula: {
      ok: cedula,
      detalle: cedula
        ? ''
        : clases('cedula_frente').length
          ? 'falta el reverso'
          : clases('cedula_reverso').length
            ? 'falta el frente'
            : '',
    },
    liquidaciones: { ok: nLiq >= 3, detalle: nLiq && nLiq < 3 ? `${nLiq} de 3` : '' },
    afp: { ok: clases('afp').length > 0, detalle: '' },
    dicom: { ok: clases('dicom').length > 0, detalle: '' },
  };
  const faltan = DOCUMENTOS.filter((d) => !estado[d.id].ok).map(
    (d) => d.nombre + (estado[d.id].detalle ? ` (${estado[d.id].detalle})` : ''),
  );
  return { estado, faltan, completo: faltan.length === 0 };
}

/** UF del día (mindicador.cl, sin datos de nadie); se guarda un día */
let ufCache: { fecha: string; valor: number } | null = null;
async function valorUf(): Promise<number | null> {
  const hoy = new Date().toISOString().slice(0, 10);
  if (ufCache?.fecha === hoy) return ufCache.valor;
  try {
    const r = await fetch('https://mindicador.cl/api/uf', { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { serie?: { valor: number }[] };
    const v = j.serie?.[0]?.valor;
    if (v && v > 10000) {
      ufCache = { fecha: hoy, valor: v };
      return v;
    }
  } catch {
    /* sin UF: el criterio de renta queda sin evaluar */
  }
  return ufCache?.valor ?? null;
}

/**
 * El puntaje (100): una regla fija y explicable, no un juicio de la IA.
 *  · Documentos completos y legibles ........ 20
 *  · Renta líquida ≥ 3 veces el arriendo .... 30 (proporcional hasta 3×; menos de 2× = 0)
 *  · Estabilidad laboral .................... 15 (contrato indefinido y ≥ 6 meses de antigüedad)
 *  · Cotizaciones AFP al día (6 meses) ...... 10
 *  · Dicom sin morosidades .................. 15
 *  · Identidad coherente y cédula vigente ... 10
 */
export function puntuar(ev: Pick<PersonaEval, 'archivos' | 'nombre'>, arriendoClp: number | null): AnalisisPersona {
  const rev = revisarDocumentos(ev);
  const ok = ev.archivos.filter((a) => a.legible);
  const por = (c: string) => ok.filter((a) => a.clase === c);
  const criterios: Criterio[] = [];
  const alertas: string[] = [...new Set(ok.flatMap((a) => a.alertas))];
  const crit = (id: string, nombre: string, peso: number, fraccion: number, detalle: string) =>
    criterios.push({
      id,
      nombre,
      peso,
      puntos: Math.round(peso * Math.max(0, Math.min(1, fraccion)) * 10) / 10,
      detalle,
    });

  crit(
    'documentos',
    'Documentos completos y legibles',
    20,
    (DOCUMENTOS.length - rev.faltan.length) / DOCUMENTOS.length,
    rev.completo ? 'Están los 5 documentos.' : `Faltan: ${rev.faltan.join(', ')}.`,
  );

  // renta: promedio de las liquidaciones leídas
  const liquidos: number[] = [];
  for (const a of por('liquidacion')) {
    const lista = Array.isArray(a.datos.liquidaciones) ? (a.datos.liquidaciones as J[]) : [a.datos];
    for (const l of lista) {
      const v = num(l.liquido);
      if (v) liquidos.push(v);
    }
  }
  const renta = liquidos.length ? liquidos.reduce((s, v) => s + v, 0) / liquidos.length : null;
  if (renta && arriendoClp) {
    const x = renta / arriendoClp;
    crit(
      'renta',
      'Renta líquida frente al arriendo',
      30,
      x >= 3 ? 1 : x < 2 ? 0 : x - 2,
      `Líquido promedio ${clp(renta)} = ${x.toFixed(1)} veces el arriendo (${clp(arriendoClp)}); lo recomendable es 3 o más.`,
    );
  } else {
    crit(
      'renta',
      'Renta líquida frente al arriendo',
      30,
      0,
      renta
        ? `Líquido promedio ${clp(renta)}, pero no se pudo comparar con el arriendo (falta su precio).`
        : 'Sin liquidaciones leídas.',
    );
  }

  // estabilidad laboral
  const c = por('contrato_trabajo')[0];
  if (c) {
    const tipo = String(c.datos.tipoContrato || '');
    const meses = c.datos.fechaInicio ? mesesDesde(String(c.datos.fechaInicio)) : null;
    const f =
      (tipo === 'indefinido' ? 0.6 : tipo === 'plazo_fijo' ? 0.3 : tipo === 'honorarios' ? 0.2 : 0.2) +
      (meses == null ? 0 : meses >= 6 ? 0.4 : (meses / 6) * 0.4);
    crit(
      'estabilidad',
      'Estabilidad laboral',
      15,
      f,
      `Contrato ${tipo || 'sin tipo claro'}${c.datos.empleador ? ' con ' + String(c.datos.empleador) : ''}${meses == null ? ', no se ve la fecha de inicio' : `, ${Math.floor(meses)} meses de antigüedad`}.`,
    );
  } else crit('estabilidad', 'Estabilidad laboral', 15, 0, 'Sin contrato de trabajo.');

  // AFP
  const afp = por('afp')[0];
  if (afp) {
    const meses = num(afp.datos.mesesCotizados) ?? 0;
    const alDia = afp.datos.alDia !== false && !(num(afp.datos.mesesImpagos) ?? 0);
    crit(
      'afp',
      'Cotizaciones AFP al día',
      10,
      (alDia ? 0.5 : 0) + Math.min(meses, 6) / 12,
      `${meses ? meses + ' meses cotizados' : 'Meses no legibles'}${alDia ? ', al día' : ', con meses impagos'}.`,
    );
  } else crit('afp', 'Cotizaciones AFP al día', 10, 0, 'Sin certificado de AFP.');

  // Dicom
  const dic = por('dicom')[0];
  if (dic) {
    const sin =
      dic.datos.sinDeudas === true || ((num(dic.datos.cantidadDeudas) ?? 0) === 0 && !num(dic.datos.montoMoroso));
    crit(
      'dicom',
      'Dicom sin morosidades',
      15,
      sin ? 1 : 0,
      sin
        ? 'Sin morosidades ni protestos.'
        : `Registra ${num(dic.datos.cantidadDeudas) ?? 'algunas'} morosidades por ${clp(num(dic.datos.montoMoroso))}.`,
    );
  } else crit('dicom', 'Dicom sin morosidades', 15, 0, 'Sin informe Dicom.');

  // identidad: mismo RUT en todos los documentos, cédula vigente
  const ruts = new Set(ok.map((a) => rutLimpio(a.persona?.rut)).filter((r) => r.length >= 7));
  const ced = [...por('cedula_frente'), ...por('cedula_reverso'), ...por('cedula_ambas')].find((a) => a.datos.vigencia);
  const vencida = ced ? new Date(String(ced.datos.vigencia)).getTime() < Date.now() : false;
  let idf = ok.length ? 1 : 0;
  const idd: string[] = [];
  if (ruts.size > 1) {
    idf -= 0.6;
    idd.push('el RUT no coincide entre los documentos');
    alertas.push('El RUT no es el mismo en todos los documentos.');
  }
  if (vencida) {
    idf -= 0.4;
    idd.push('la cédula está vencida');
    alertas.push('La cédula está vencida.');
  }
  if (!ruts.size && ok.length) {
    idf -= 0.3;
    idd.push('no se pudo leer el RUT');
  }
  crit(
    'identidad',
    'Identidad coherente y cédula vigente',
    10,
    idf,
    idd.length ? idd.join('; ') + '.' : 'El RUT coincide y la cédula está vigente.',
  );

  const porcentaje = Math.round(criterios.reduce((s, x) => s + x.puntos, 0));
  return {
    porcentaje,
    nivel: porcentaje >= 75 ? 'alto' : porcentaje >= 50 ? 'medio' : 'bajo',
    criterios,
    faltan: rev.faltan,
    alertas,
    rentaLiquidaClp: renta,
  };
}

@Injectable()
export class EvaluacionService {
  private readonly log = new Logger('Evaluacion');
  constructor(
    private readonly db: PrismaService,
    private readonly r2: AlmacenamientoService,
    private readonly ia: IaService,
    private readonly enviados: EnviadosService,
    private readonly ejecutivo: EjecutivoService,
    private readonly actividad: ActividadService,
  ) {}

  // ------------------------------------------------------------------ registro

  private async leer(corredoraId: string, negocioId: string) {
    const r = await this.db.registro.findUnique({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: COLECCION, id: negocioId } },
    });
    return r && !r.eliminadoEn ? (r.datos as unknown as Evaluacion) : null;
  }

  private async guardar(corredoraId: string, negocioId: string, ev: Evaluacion, usuarioId?: string | null) {
    const datos = ev as unknown as Prisma.InputJsonObject;
    await this.db.registro.upsert({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: COLECCION, id: negocioId } },
      create: { corredoraId, coleccion: COLECCION, id: negocioId, datos, creadoPorId: usuarioId ?? null },
      update: { datos, version: { increment: 1 }, eliminadoEn: null },
    });
  }

  /** la evaluación abierta en la que participa ese celular (esperando documentos), si hay */
  private async abierta(corredoraId: string, t: string) {
    const filas = await this.db.registro.findMany({
      where: {
        corredoraId,
        coleccion: COLECCION,
        eliminadoEn: null,
        datos: { path: ['telefonos'], array_contains: t },
      },
      orderBy: { actualizadoEn: 'desc' },
      take: 5,
    });
    const f = filas.find((x) => (x.datos as unknown as Evaluacion).estado !== 'revisada');
    return f ? { id: f.id, ev: f.datos as unknown as Evaluacion } : null;
  }

  private publica(ev: Evaluacion) {
    return {
      ...ev,
      personas: ev.personas.map((p) => {
        const rev = revisarDocumentos(p);
        return {
          ...p,
          documentos: DOCUMENTOS.map((d) => ({
            id: d.id,
            nombre: d.nombre,
            ok: rev.estado[d.id].ok,
            detalle: rev.estado[d.id].detalle,
          })),
          faltan: rev.faltan,
        };
      }),
    };
  }

  // ------------------------------------------------------------------ app

  async ver(u: UsuarioToken, negocioId: string) {
    await buscarVisible(this.db.negocio, u, negocioId, 'El negocio');
    const ev = await this.leer(u.corredoraId, negocioId);
    return ev ? this.publica(ev) : { vacia: true };
  }

  /**
   * Pide los documentos al arrendatario (la persona del negocio) y a cada aval (`avales`: personas del CRM). Se puede
   * volver a llamar para sumar avales: a quien ya se le pidió no se le vuelve a escribir.
   */
  async solicitar(u: UsuarioToken, negocioId: string, avales: string[], conTitular = true) {
    const n = await buscarVisible(this.db.negocio, u, negocioId, 'El negocio');
    if (n.tipo !== 'arriendo')
      throw new BadRequestException('La evaluación de documentos es de los negocios de arriendo.');
    if (!n.clienteId) throw new BadRequestException('El negocio no tiene arrendatario. Agrégalo y vuelve a intentar.');
    const ids = [...(conTitular ? [n.clienteId] : []), ...avales.filter((x) => x !== n.clienteId)];
    if (!ids.length) throw new BadRequestException('Elige a quién pedirle la documentación.');
    const personas = await this.db.persona.findMany({
      where: { id: { in: ids }, corredoraId: u.corredoraId, eliminadoEn: null },
    });
    const previa = await this.leer(u.corredoraId, negocioId);
    const prop = n.propiedadId ? await this.db.propiedad.findUnique({ where: { id: n.propiedadId } }) : null;
    const yo = await this.db.usuario.findUnique({ where: { id: u.sub }, select: { nombre: true } });
    const corredora = await this.db.corredora.findUnique({ where: { id: u.corredoraId }, select: { nombre: true } });
    const propiedad = prop
      ? [prop.titulo, prop.direccion, prop.comuna].filter(Boolean).join(', ') || prop.codigo
      : 'la propiedad';
    const remitente = [yo?.nombre, corredora?.nombre].filter(Boolean).join(', de ');
    const titular =
      personas.find((x) => x.id === n.clienteId) ??
      (await this.db.persona.findFirst({ where: { id: n.clienteId, corredoraId: u.corredoraId } }));
    if (!titular) throw new BadRequestException('El arrendatario del negocio ya no existe.');

    const lista: PersonaEval[] = [...(previa?.personas ?? [])];
    const nuevas: { p: (typeof personas)[number]; rol: PersonaEval['rol'] }[] = [];
    for (const id of ids) {
      const p = personas.find((x) => x.id === id);
      if (!p) throw new BadRequestException('Una de las personas ya no existe.');
      if (lista.some((x) => x.personaId === id)) continue;
      const t = telNorm(p.telefono);
      if (!p.telefono || !t)
        throw new BadRequestException(`${p.nombre} no tiene celular registrado. Agrégalo en su ficha.`);
      const otra = await this.abierta(u.corredoraId, t);
      if (otra && otra.id !== negocioId)
        throw new BadRequestException(`${p.nombre} ya tiene otra evaluación abierta. Ciérrala primero.`);
      nuevas.push({ p, rol: id === n.clienteId ? 'arrendatario' : 'aval' });
    }
    if (!nuevas.length)
      throw new BadRequestException(
        'Ya se les pidió la documentación a todos. Agrega un aval para pedirle a otra persona.',
      );
    for (const { p, rol } of nuevas) {
      await this.enviados.plantilla(u, {
        telefono: p.telefono!,
        nombre: p.nombre,
        etiqueta: ETIQUETA_PLANTILLA,
        campos: {
          nombre: p.nombre.split(/\s+/)[0],
          remitente,
          propiedad: rol === 'aval' ? `${propiedad}, como aval de ${titular.nombre}` : propiedad,
        },
      });
      lista.push({
        personaId: p.id,
        rol,
        nombre: p.nombre,
        telNorm: telNorm(p.telefono)!,
        solicitadaEn: new Date().toISOString(),
        archivos: [],
        completa: false,
        analisis: null,
      });
    }
    const ev: Evaluacion = {
      negocioId,
      telefonos: lista.map((x) => x.telNorm),
      estado: 'solicitada',
      solicitadaEn: previa?.solicitadaEn ?? new Date().toISOString(),
      solicitadaPor: previa?.solicitadaPor ?? u.sub,
      personas: lista,
      analisis: previa?.analisis ?? null,
      decision: null,
    };
    await this.guardar(u.corredoraId, negocioId, ev, u.sub);
    await this.actividad
      .registrar({
        corredoraId: u.corredoraId,
        entidadTipo: 'negocio',
        entidadId: negocioId,
        texto: `Documentación solicitada por WhatsApp a ${nuevas.map((x) => `${x.p.nombre}${x.rol === 'aval' ? ' (aval)' : ''}`).join(', ')}`,
        usuarioId: u.sub,
      })
      .catch(() => null);
    return this.publica(ev);
  }

  async decidir(u: UsuarioToken, negocioId: string, b: z.infer<typeof decidirEsquema>) {
    await buscarVisible(this.db.negocio, u, negocioId, 'El negocio');
    const x = await this.leer(u.corredoraId, negocioId);
    if (!x) throw new NotFoundException('Todavía no se solicitó la documentación.');
    const yo = await this.db.usuario.findUnique({ where: { id: u.sub }, select: { nombre: true } });
    const ev: Evaluacion = {
      ...x,
      estado: 'revisada',
      decision: { estado: b.decision, por: yo?.nombre || 'Corredor', en: new Date().toISOString(), nota: b.nota },
    };
    await this.guardar(u.corredoraId, negocioId, ev, u.sub);
    await this.actividad
      .registrar({
        corredoraId: u.corredoraId,
        entidadTipo: 'negocio',
        entidadId: negocioId,
        texto: `Evaluación del arrendatario ${b.decision === 'aprobada' ? 'aprobada' : 'rechazada'} por ${yo?.nombre || 'el corredor'}${x.analisis ? ` (puntaje ${x.analisis.porcentaje}%)` : ''}`,
        usuarioId: u.sub,
      })
      .catch(() => null);
    return this.publica(ev);
  }

  /** vuelve a calcular el resumen y el porcentaje con lo que ya hay (p. ej. tras cambiar el precio del arriendo) */
  async recalcular(u: UsuarioToken, negocioId: string) {
    await buscarVisible(this.db.negocio, u, negocioId, 'El negocio');
    const x = await this.leer(u.corredoraId, negocioId);
    if (!x) throw new NotFoundException('Todavía no se solicitó la documentación.');
    const ev = { ...x, analisis: await this.analizar(u.corredoraId, x) };
    await this.guardar(u.corredoraId, negocioId, ev, u.sub);
    return this.publica(ev);
  }

  async enlaceArchivo(u: UsuarioToken, negocioId: string, personaId: string, n: number) {
    await buscarVisible(this.db.negocio, u, negocioId, 'El negocio');
    const x = await this.leer(u.corredoraId, negocioId);
    const a = x?.personas.find((p) => p.personaId === personaId)?.archivos.find((f) => f.n === n);
    if (!a) throw new NotFoundException('Ese archivo no existe.');
    return { url: await this.r2.urlDescarga(a.clave, a.nombre), nombre: a.nombre };
  }

  // ------------------------------------------------------------------ WhatsApp

  /**
   * Lo que llega de quien debe entregar documentos (arrendatario o aval). Devuelve los mensajes que siguen su camino
   * (el texto suelto va a Tomás); si esa persona no tiene una evaluación abierta, devuelve todo sin tocar. Si algo
   * falla, deja pasar todo.
   */
  async interceptar(wa: Wechatia, corredoraId: string, cv: Conversacion, nuevos: MensajeWa[]): Promise<MensajeWa[]> {
    try {
      const t = telNorm(cv.telefono);
      if (!t) return nuevos;
      const conArchivos = nuevos.filter((m) => m.adjuntos.some((u) => !ES_AUDIO.test(u)));
      if (!conArchivos.length) return nuevos;
      const ab = await this.abierta(corredoraId, t);
      if (!ab || ab.ev.estado === 'revisada') return nuevos;
      await this.recibir(wa, corredoraId, cv, ab.id, ab.ev, t, conArchivos);
      return nuevos.filter((m) => !conArchivos.includes(m) || m.texto.trim().length > 20);
    } catch (e) {
      this.log.warn(`documentos de la evaluación: ${(e as Error).message}`);
      return nuevos;
    }
  }

  private async decir(wa: Wechatia, corredoraId: string, cv: Conversacion, texto: string) {
    if (!cv.contactId) return;
    const r = await wa.enviarAContacto(cv.contactId, `${firma('tomas')}\n${texto}`);
    await this.enviados.registrar(corredoraId, cv.telefono, { messageId: r.messageId, texto, enHilo: false });
  }

  private async recibir(
    wa: Wechatia,
    corredoraId: string,
    cv: Conversacion,
    negocioId: string,
    ev: Evaluacion,
    t: string,
    ms: MensajeWa[],
  ) {
    const ix = ev.personas.findIndex((p) => p.telNorm === t);
    if (ix < 0) return;
    let yo = ev.personas[ix];
    const urls = [...new Set(ms.flatMap((m) => m.adjuntos.filter((u) => !ES_AUDIO.test(u))))];
    const nuevos: ArchivoEval[] = [];
    const ilegibles: string[] = [];
    let otros = 0;
    let noAbiertos = 0;
    for (const u of urls) {
      if (yo.archivos.length + nuevos.length >= MAX_ARCHIVOS) break;
      if (ES_VIDEO.test(u)) {
        noAbiertos++;
        continue;
      }
      try {
        const a = await this.leerArchivo(
          corredoraId,
          negocioId,
          yo.personaId,
          u,
          yo.archivos.length + nuevos.length + 1,
        );
        if (!a) {
          noAbiertos++;
          continue;
        }
        nuevos.push(a);
        if (!a.legible) ilegibles.push(a.nombre);
        else if (a.clase === 'otro') otros++;
      } catch (e) {
        this.log.warn(`archivo de la evaluación: ${(e as Error).message}`);
        noAbiertos++;
      }
    }
    yo = { ...yo, archivos: [...yo.archivos, ...nuevos] };
    const rev = revisarDocumentos(yo);
    const eraCompleta = yo.completa;
    yo.completa = rev.completo;
    const partes: string[] = [];
    const buenos = nuevos.filter((a) => a.legible && a.clase !== 'otro');
    if (buenos.length)
      partes.push(
        `Recibí ${buenos.length === 1 ? 'tu documento' : 'tus ' + buenos.length + ' documentos'}: ${buenos.map((a) => this.nombreClase(a.clase)).join(', ')}.`,
      );
    if (ilegibles.length)
      partes.push(
        `${ilegibles.length === 1 ? 'Una foto no se lee bien' : ilegibles.length + ' archivos no se leen bien'}: ¿puedes mandarl${ilegibles.length === 1 ? 'a' : 'os'} de nuevo, de frente, con buena luz y sin cortar los bordes?`,
      );
    if (otros)
      partes.push(
        `No logré reconocer ${otros === 1 ? 'un archivo' : otros + ' archivos'} como parte de lo que pedimos.`,
      );
    if (noAbiertos)
      partes.push(
        `${noAbiertos === 1 ? 'Un archivo no se pudo abrir' : noAbiertos + ' archivos no se pudieron abrir'}: mándalo como foto o PDF.`,
      );
    if (rev.completo)
      partes.push('¡Listo, ya tengo toda tu documentación! La revisamos y te avisamos los pasos que siguen.');
    else if (nuevos.length) partes.push(`Me falta: ${rev.faltan.join('; ')}.`);
    const personas = ev.personas.map((p, i) => (i === ix ? yo : p));
    ev = { ...ev, personas };
    const todas = personas.every((p) => p.completa);
    // primero se guardan los archivos (si el análisis fallara, no se pierden) y después se le responde
    await this.guardar(corredoraId, negocioId, ev);
    if (partes.length) await this.decir(wa, corredoraId, cv, partes.join('\n'));
    if (nuevos.length) ev.analisis = await this.analizar(corredoraId, ev, todas);
    if (todas && ev.estado === 'solicitada') ev.estado = 'completa';
    await this.guardar(corredoraId, negocioId, ev);
    if (rev.completo && !eraCompleta) {
      const n = await this.db.negocio.findUnique({ where: { id: negocioId }, select: { corredorId: true } });
      const a = ev.analisis;
      const aviso = todas
        ? `📄 Llegó toda la documentación del arriendo (${personas.map((p) => p.nombre + (p.rol === 'aval' ? ' · aval' : '')).join(', ')}). Puntaje de la evaluación: ${a?.porcentaje ?? '—'}% (${a?.nivel ?? '—'}).\n${a?.resumen ?? ''}\n\nRevísala en Asset (Negocios › Evaluación) y decide: la aprobación es tuya.`
        : `📄 ${yo.nombre}${yo.rol === 'aval' ? ' (aval)' : ''} mandó toda su documentación. Faltan ${personas
            .filter((p) => !p.completa)
            .map((p) => p.nombre)
            .join(', ')}.`;
      await this.ejecutivo.avisarResponsables(corredoraId, n?.corredorId, aviso, 'tomas', wa).catch(() => false);
    }
  }

  private nombreClase(c: string) {
    return (
      (
        {
          contrato_trabajo: 'contrato de trabajo',
          cedula_frente: 'cédula (frente)',
          cedula_reverso: 'cédula (reverso)',
          cedula_ambas: 'cédula',
          liquidacion: 'liquidación de sueldo',
          afp: 'certificado de AFP',
          dicom: 'informe Dicom',
        } as Record<string, string>
      )[c] || 'documento'
    );
  }

  /** baja el archivo, lo guarda en R2 y lo lee con la IA */
  private async leerArchivo(
    corredoraId: string,
    negocioId: string,
    personaId: string,
    url: string,
    n: number,
  ): Promise<ArchivoEval | null> {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`wechatia respondió ${r.status}`);
    let tipo = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > ARCHIVO_MAX) throw new Error(`tamaño no válido (${buf.length} bytes)`);
    if (!tipo || tipo === 'application/octet-stream')
      tipo = /\.pdf(\?|$)/i.test(url)
        ? 'application/pdf'
        : /\.png(\?|$)/i.test(url)
          ? 'image/png'
          : /\.webp(\?|$)/i.test(url)
            ? 'image/webp'
            : 'image/jpeg';
    let cuerpo = buf;
    let ext: string;
    let contenido: Anthropic.Beta.BetaContentBlockParam;
    if (tipo === 'application/pdf') {
      ext = 'pdf';
      contenido = {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') },
      };
    } else if (tipo.startsWith('image/')) {
      // JPG de hasta 2000 px: se lee bien y pesa poco (también cubre HEIC y WebP)
      cuerpo = await sharp(buf)
        .rotate()
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      tipo = 'image/jpeg';
      ext = 'jpg';
      contenido = {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: cuerpo.toString('base64') },
      };
    } else return null;
    const clave = `c/${corredoraId}/r/${COLECCION}/todos/${negocioId}/${personaId}/${randomUUID()}.${ext}`;
    await this.r2.subir(clave, cuerpo, tipo);
    let lectura: J;
    try {
      lectura = await this.ia.leerDocumento({
        corredoraId,
        uso: 'evaluacion:archivo',
        sistema: SISTEMA_LECTURA,
        contenido: [contenido, { type: 'text', text: 'Lee este archivo y devuelve el JSON pedido.' }],
      });
    } catch (e) {
      this.log.warn(`lectura con IA: ${(e as Error).message}`);
      lectura = { clase: 'otro', legible: false, resumen: 'No se pudo leer con la IA.', alertas: [] };
    }
    const claseOk = [
      'contrato_trabajo',
      'cedula_frente',
      'cedula_reverso',
      'cedula_ambas',
      'liquidacion',
      'afp',
      'dicom',
      'otro',
    ];
    return {
      n,
      clave,
      nombre: `documento-${n}.${ext}`,
      tipo,
      recibido: new Date().toISOString(),
      clase: claseOk.includes(String(lectura.clase)) ? String(lectura.clase) : 'otro',
      legible: lectura.legible !== false,
      resumen: String(lectura.resumen ?? '').slice(0, 600),
      persona: {
        nombre: txt((lectura.persona as J | undefined)?.nombre),
        rut: txt((lectura.persona as J | undefined)?.rut),
      },
      datos: typeof lectura.datos === 'object' && lectura.datos ? (lectura.datos as J) : {},
      alertas: Array.isArray(lectura.alertas) ? lectura.alertas.map(String).slice(0, 8) : [],
    };
  }

  /**
   * El puntaje de cada persona (regla fija) y el global: sin avales es el del arrendatario; con avales, 60 % el del
   * arrendatario y 40 % el promedio de los avales. El resumen para el corredor lo redacta la IA con esos datos.
   */
  async analizar(corredoraId: string, ev: Evaluacion, redactar = true): Promise<Analisis> {
    const n = await this.db.negocio.findUnique({ where: { id: ev.negocioId } });
    const prop = n?.propiedadId ? await this.db.propiedad.findUnique({ where: { id: n.propiedadId } }) : null;
    let arriendoClp: number | null = null;
    if (prop?.precioArriendo) {
      const v = Number(prop.precioArriendo);
      if (prop.monedaArriendo === 'UF') {
        const uf = await valorUf();
        arriendoClp = uf ? Math.round(v * uf) : null;
      } else arriendoClp = v;
    }
    const puntajes = ev.personas.map((p) => {
      const x = puntuar(p, arriendoClp);
      p.analisis = x;
      return x;
    });
    const tit = ev.personas.findIndex((p) => p.rol === 'arrendatario');
    const avales = puntajes.filter((_, i) => i !== tit);
    const promedio = (l: { porcentaje: number }[]) =>
      l.length ? l.reduce((s, x) => s + x.porcentaje, 0) / l.length : 0;
    // sin arrendatario entre los consultados todavía, el global es el promedio de los avales
    const porcentaje =
      tit < 0
        ? Math.round(promedio(avales))
        : avales.length
          ? Math.round(puntajes[tit].porcentaje * 0.6 + promedio(avales) * 0.4)
          : puntajes[tit].porcentaje;
    const nivel: Analisis['nivel'] = porcentaje >= 75 ? 'alto' : porcentaje >= 50 ? 'medio' : 'bajo';
    let resumen = '';
    if (redactar && ev.personas.some((p) => p.archivos.length)) {
      try {
        const j = await this.ia.json({
          corredoraId,
          uso: 'evaluacion:resumen',
          sistema: SISTEMA_RESUMEN,
          usuario: JSON.stringify({
            arriendoMensualClp: arriendoClp,
            puntajeGlobal: porcentaje,
            personas: ev.personas.map((p, i) => ({
              nombre: p.nombre,
              rol: p.rol,
              puntaje: puntajes[i].porcentaje,
              criterios: puntajes[i].criterios,
              alertas: puntajes[i].alertas,
              documentos: p.archivos
                .filter((a) => a.legible && a.clase !== 'otro')
                .map((a) => ({ clase: a.clase, resumen: a.resumen, datos: a.datos })),
            })),
          }),
        });
        resumen = txt(j.resumen);
      } catch (e) {
        this.log.warn(`resumen con IA: ${(e as Error).message}`);
      }
    }
    if (!resumen)
      resumen = ev.personas
        .map(
          (p, i) =>
            `${p.nombre}${p.rol === 'aval' ? ' (aval)' : ''}: ${puntajes[i].porcentaje}%.${puntajes[i].faltan.length ? ' Faltan: ' + puntajes[i].faltan.join(', ') + '.' : ''}`,
        )
        .join(' ');
    return {
      hechoEn: new Date().toISOString(),
      porcentaje,
      nivel,
      resumen,
      arriendoClp,
      porPersona: ev.personas.map((p, i) => ({
        personaId: p.personaId,
        rol: p.rol,
        nombre: p.nombre,
        porcentaje: puntajes[i].porcentaje,
        nivel: puntajes[i].nivel,
      })),
    };
  }
}

@Controller('evaluaciones')
export class EvaluacionController {
  constructor(private readonly s: EvaluacionService) {}

  @Get(':negocioId')
  ver(@UsuarioActual() u: UsuarioToken, @Param('negocioId') id: string) {
    return this.s.ver(u, id.slice(0, 80));
  }

  @Post(':negocioId/solicitar')
  @HttpCode(200)
  solicitar(
    @UsuarioActual() u: UsuarioToken,
    @Param('negocioId') id: string,
    @Body(new ZodPipe(solicitarEsquema)) b: z.infer<typeof solicitarEsquema>,
  ) {
    return this.s.solicitar(u, id.slice(0, 80), b.avales, b.titular);
  }

  @Post(':negocioId/recalcular')
  @HttpCode(200)
  recalcular(@UsuarioActual() u: UsuarioToken, @Param('negocioId') id: string) {
    return this.s.recalcular(u, id.slice(0, 80));
  }

  @Post(':negocioId/decidir')
  @HttpCode(200)
  decidir(
    @UsuarioActual() u: UsuarioToken,
    @Param('negocioId') id: string,
    @Body(new ZodPipe(decidirEsquema)) b: z.infer<typeof decidirEsquema>,
  ) {
    return this.s.decidir(u, id.slice(0, 80), b);
  }

  @Get(':negocioId/archivo/:personaId/:n')
  archivo(
    @UsuarioActual() u: UsuarioToken,
    @Param('negocioId') id: string,
    @Param('personaId') pid: string,
    @Param('n') n: string,
  ) {
    return this.s.enlaceArchivo(u, id.slice(0, 80), pid.slice(0, 80), Number(n) || 0);
  }
}
