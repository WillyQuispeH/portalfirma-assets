/* eslint-disable @typescript-eslint/no-base-to-string -- los valores llegan sin tipo (JSON de la app o de Portalfirma) */
// La ORDEN DE VISITA, hecha por Asset: una plantilla HTML propia (src/documentos/plantillas/orden-visita.html) con
// variables que se reemplazan solas → PDF (Chromium del servidor) → Portalfirma lo recibe y lo envía a firmar al visitante.
// Ya no usa la plantilla de la Notaría virtual.
//
// La usan dos caminos, con la misma lógica:
//  · la app (POST /v1/ordenes-visita/vista-previa y /enviar): el corredor VE el PDF antes de enviarlo y decide con un botón;
//  · el equipo por WhatsApp (Juanita), aunque la app esté cerrada: dos pasos, y la confirmación la exige el SERVIDOR
//    (no solo la IA), porque envía un documento a una persona y cobra del saldo de Portalfirma:
//      1. sin `confirmado`: devuelve los datos que llevaría el documento y qué falta; NO envía, NO cobra, NO agenda.
//      2. con `confirmado: true`: solo si se preparó EXACTAMENTE lo mismo hace menos de 15 minutos y el último mensaje
//         del corredor es un sí claro.
// Al enviar: registra la firma, vincula al visitante y deja la visita en la agenda (ligada al negocio, si lo hay).
import { Body, Controller, HttpCode, Injectable, Logger, Post } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import sharp from 'sharp';
import { z } from 'zod';
import type { Prisma, Propiedad, PropiedadFoto, Usuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EnvioFirmaService } from '../documentos/envio-firma';
import { PersonasService } from '../personas/personas.service';
import { ActividadService } from '../comun/actividad.service';
import { PdfService } from '../documentos/pdf.service';
import { llenar } from '../documentos/plantilla';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { esUuid } from '../comun/asignados';
import { dvRut } from '../ia/transcripcion';
import { normalizar } from '../comun/texto';
import { hoy, norm } from './comun';
import { datosCorredora, type DatosCorredora } from '../documentos/corredora-doc';
import { PlantillasDocService } from '../documentos/plantillas-doc';

export interface CtxOrden {
  corredoraId: string;
  usuarioId: string;
  /** lo que escribió (o dijo) el corredor en este turno */
  texto: string;
}
export interface ArgsOrden {
  /** código (PF-1001) de la propiedad */
  codigo_propiedad?: string;
  /** o su id */
  propiedad_id?: string;
  /** otras propiedades que verá (códigos): van en la misma orden */
  otras?: string[];
  /** persona del CRM (id, RUT o nombre) o nombre completo si es nueva */
  visitante?: string;
  rut?: string;
  email?: string;
  telefono?: string;
  fecha?: string;
  hora?: string;
  operacion?: string;
  /** días hábiles de vigencia de la orden (por defecto 250, el modelo de la corredora) */
  vigencia_dias?: string | number;
  /** garantía de seriedad de los arriendos, como se escribe en la orden (por defecto «$250.000») */
  garantia_seriedad?: string;
  /** el negocio del visitante: la firma y la visita quedan ligadas a él */
  negocio_id?: string;
  confirmado?: boolean;
}

const VIGENCIA_MS = 15 * 60_000;
// un «sí» puro: solo palabras de asentimiento («sí», «dale, envíala», «ok gracias»). «Sí, pero a las 12» NO lo es: pide
// un cambio, y el cambio exige preparar la orden de nuevo
const ASIENTE = [
  'si',
  'dale',
  'ok',
  'okay',
  'confirmo',
  'confirmado',
  'confirma',
  'envia',
  'enviala',
  'envialo',
  'manda',
  'mandala',
  'mandalo',
  'hazlo',
  'adelante',
  'correcto',
  'perfecto',
  'claro',
  'exacto',
  'listo',
];
const RELLENO = new Set([
  'de',
  'acuerdo',
  'por',
  'favor',
  'porfa',
  'gracias',
  'y',
  'la',
  'lo',
  'ya',
  'ahora',
  'todo',
  'nomas',
]);
const asiente = (texto: string) => {
  const w = norm(texto)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return (
    w.length > 0 &&
    w.length <= 6 &&
    w.every((x) => ASIENTE.includes(x) || RELLENO.has(x)) &&
    w.some((x) => ASIENTE.includes(x))
  );
};

const limpioRut = (r: unknown) =>
  String(r ?? '')
    .replace(/[^0-9kK]/g, '')
    .toUpperCase();
const rutValido = (r: string) => {
  const c = limpioRut(r);
  return c.length >= 8 && c.length <= 9 && dvRut(c.slice(0, -1)) === c.slice(-1);
};
const rutFormato = (r: string) => {
  const c = limpioRut(r);
  return `${c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${c.slice(-1)}`;
};
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

type Moneda = string | null;
const precio = (valor: Prisma.Decimal | number | null, moneda: Moneda) => {
  if (valor == null) return null;
  const n = Number(valor);
  if (!n) return null;
  return moneda === 'UF' ? `UF ${n.toLocaleString('es-CL')}` : `$${n.toLocaleString('es-CL')}`;
};
const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type PropConFotos = Propiedad & { fotos: PropiedadFoto[] };
type Visitante = {
  persona?: { id: string; email: string | null; telefono: string | null };
  nueva?: { nombre: string; rut: string; email: string; telefono: string };
  nombre: string;
  rut: string;
  email: string;
  telefono: string;
  nacionalidad?: string;
};
/** todo lo necesario para el documento, ya validado */
interface Armada {
  c: CtxOrden;
  p: PropConFotos;
  props: PropConFotos[];
  vis: Visitante;
  usuario: Usuario;
  corredora: DatosCorredora;
  op: 'venta' | 'arriendo';
  vigenciaDias: string;
  garantiaSeriedad: string;
  fecha: string;
  hora: string;
  negocioId: string | null;
  propiedades: Record<string, unknown>[];
}

const SERIE = 'orden_visita';

@Injectable()
export class OrdenVisitaService {
  private readonly log = new Logger('OrdenVisita');
  /** lo último que se preparó por usuario (solo en memoria: vale 15 minutos) */
  private readonly preparadas = new Map<string, { clave: string; en: number; args: ArgsOrden }>();

  constructor(
    private readonly db: PrismaService,
    private readonly plantillasDoc: PlantillasDocService,
    private readonly envio: EnvioFirmaService,
    private readonly personas: PersonasService,
    private readonly actividad: ActividadService,
    private readonly pdfs: PdfService,
  ) {}

  /** la foto de la ficha como imagen incrustada en el documento (achicada: el PDF debe pesar poco) */
  private async imagenDe(p: { fotos: PropiedadFoto[] }): Promise<string | null> {
    const f =
      p.fotos.find((x) => /^https?:\/\/.*\.(jpe?g|png)(\?|$)/i.test(x.url)) ??
      p.fotos.find((x) => /^https?:\/\//.test(x.url));
    if (!f) return null;
    try {
      // si la foto tarda, la orden sale igual sin ella (la app espera la respuesta)
      const r = await fetch(f.url, { signal: AbortSignal.timeout(7_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const jpg = await sharp(Buffer.from(await r.arrayBuffer()))
        .rotate()
        .resize({ width: 520, height: 390, fit: 'cover' })
        .jpeg({ quality: 72 })
        .toBuffer();
      return `data:image/jpeg;base64,${jpg.toString('base64')}`;
    } catch (e) {
      this.log.warn(`foto de la ficha ${f.url.slice(-40)}: ${(e as Error).message}`);
      return null;
    }
  }

  // ---------------------------------------------------------------- el visitante
  private async visitante(c: CtxOrden, a: ArgsOrden): Promise<Visitante | { error: string }> {
    const q = String(a.visitante ?? '').trim();
    if (!q) return { error: 'Indica quién es el visitante (nombre completo y RUT, o una persona del CRM).' };
    const esId: boolean = esUuid(q); // (sin que TypeScript estreche q)
    const digitos = limpioRut(q);
    const porRut =
      (a.rut ? limpioRut(a.rut) : '') ||
      (digitos.length >= 8 && /\d/.test(digitos) && !/[a-z]/i.test(q.replace(/[kK]/g, '')) ? digitos : '');
    let persona = esUuid(q)
      ? await this.db.persona.findFirst({ where: { id: q, corredoraId: c.corredoraId, eliminadoEn: null } })
      : null;
    if (!persona && porRut)
      persona = await this.db.persona.findFirst({
        where: { corredoraId: c.corredoraId, eliminadoEn: null, rut: porRut },
      });
    if (!persona && !esId) {
      const l = await this.db.persona.findMany({
        where: { corredoraId: c.corredoraId, eliminadoEn: null, busqueda: { contains: normalizar(q) } },
        take: 5,
      });
      const exactas = l.filter((x) => norm(x.nombre) === norm(q));
      if (exactas.length === 1) persona = exactas[0];
      else if (l.length === 1) persona = l[0];
      else if (l.length > 1)
        return {
          error: `Hay varias personas que calzan con «${q}»: ${l.map((x) => `${x.nombre} (${x.rutFormato || 'sin RUT'})`).join('; ')}. Pregúntale cuál.`,
        };
    }
    const email = String(a.email ?? '').trim() || persona?.email || '';
    const telefono = String(a.telefono ?? '').trim() || persona?.telefono || '';
    if (email && !emailOk(email)) return { error: `El correo «${email}» no es válido.` };
    if (!persona) {
      const rut = a.rut ? limpioRut(a.rut) : '';
      if (!rut)
        return { error: `«${q}» no está en el CRM: para la orden necesito su nombre completo y su RUT (y su correo).` };
      if (!rutValido(rut))
        return {
          error: `El RUT ${rutFormato(rut)} no es válido (el dígito verificador no calza): pídele que lo confirme.`,
        };
      return {
        nueva: { nombre: q, rut: rutFormato(rut), email, telefono },
        nombre: q,
        rut: rutFormato(rut),
        email,
        telefono,
      };
    }
    const rut = persona.rutFormato || persona.rut || '';
    if (!rut)
      return { error: `${persona.nombre} no tiene RUT en su ficha: agrégalo para poder enviarle la orden a firmar.` };
    return { persona, nombre: persona.nombre, rut, email, telefono, nacionalidad: persona.nacionalidad ?? '' };
  }

  // ---------------------------------------------------------------- los datos del documento
  private async datosPropiedad(x: PropConFotos, op: 'venta' | 'arriendo') {
    const rasgos: { nombre: string; valor: string }[] = [];
    const r = (nombre: string, valor: unknown) =>
      valor != null && String(valor) !== '' && Number(valor) !== 0 && rasgos.push({ nombre, valor: String(valor) });
    r('Dormitorios', x.dormitorios);
    r('Baños', x.banos);
    r('Estacionamientos', x.estacionamientos);
    r('Bodegas', x.bodegas);
    if (x.supUtil || x.supTotal) rasgos.push({ nombre: 'Superficie', valor: `${Number(x.supUtil || x.supTotal)} m²` });
    if (x.gastosComunes)
      rasgos.push({ nombre: 'Gastos comunes', valor: `$${Number(x.gastosComunes).toLocaleString('es-CL')}` });
    const pv = precio(x.precioVenta, x.monedaVenta);
    const pa = precio(x.precioArriendo, x.monedaArriendo);
    return {
      codigo: x.codigo,
      tipo: mayus(String(x.tipo || '').replace(/_/g, ' ')),
      direccion: [x.direccion, x.unidad ? `depto. ${x.unidad}` : '', x.comuna].filter(Boolean).join(', '),
      operacion: op === 'arriendo' ? 'Arriendo' : 'Venta',
      precio: (op === 'arriendo' ? pa || pv : pv || pa) ?? '',
      descripcion: (x.descripcion ?? '').replace(/\s+/g, ' ').trim().slice(0, 320),
      foto: (await this.imagenDe(x)) ?? '',
      rasgos,
    };
  }

  /** valida el pedido y junta todo lo que lleva el documento; { error } si falta algo */
  private async armar(c: CtxOrden, a: ArgsOrden): Promise<Armada | { error: string }> {
    const fecha = String(a.fecha ?? '').trim() || hoy();
    const hora = String(a.hora ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'La fecha de la visita va como AAAA-MM-DD.' };
    if (hora && !/^\d{2}:\d{2}$/.test(hora)) return { error: 'La hora va como HH:MM.' };

    const codigo = String(a.codigo_propiedad ?? '').trim();
    const idProp = String(a.propiedad_id ?? '').trim();
    if (!codigo && !esUuid(idProp)) return { error: 'Indica el código de la propiedad (por ejemplo PF-1001).' };
    const incluir = { fotos: { orderBy: { orden: 'asc' as const } } };
    const p = await this.db.propiedad.findFirst({
      where: {
        corredoraId: c.corredoraId,
        eliminadoEn: null,
        ...(esUuid(idProp) ? { id: idProp } : { codigo: { equals: codigo, mode: 'insensitive' as const } }),
      },
      include: incluir,
    });
    if (!p) return { error: `No encontré la propiedad ${codigo || idProp}.` };
    const props: PropConFotos[] = [p];
    for (const cod of [...new Set((a.otras ?? []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 6)) {
      if (cod.toLowerCase() === p.codigo.toLowerCase()) continue;
      const o = await this.db.propiedad.findFirst({
        where: { corredoraId: c.corredoraId, eliminadoEn: null, codigo: { equals: cod, mode: 'insensitive' } },
        include: incluir,
      });
      if (!o) return { error: `No encontré la propiedad ${cod}.` };
      props.push(o);
    }
    const usuario = await this.db.usuario.findUnique({ where: { id: c.usuarioId } });
    if (!usuario) return { error: 'No encontré tu usuario.' };
    const corredora = await datosCorredora(this.db, c.corredoraId);

    const vis = await this.visitante(c, a);
    if ('error' in vis) return { error: vis.error };
    if (!vis.email) return { error: `Falta el correo de ${vis.nombre}: ahí recibe el enlace para firmar.` };

    const op =
      a.operacion === 'arriendo' || a.operacion === 'venta'
        ? a.operacion
        : p.arriendo && !p.venta
          ? 'arriendo'
          : 'venta';
    const propiedades = await Promise.all(props.map((x) => this.datosPropiedad(x, op)));
    const vig = String(a.vigencia_dias ?? '').replace(/D/g, '');
    if (vig && (Number(vig) < 1 || Number(vig) > 999))
      return { error: 'La vigencia de la orden va en días hábiles, entre 1 y 999.' };
    return {
      vigenciaDias: vig || '250',
      garantiaSeriedad:
        String(a.garantia_seriedad ?? '')
          .trim()
          .slice(0, 40) || '$250.000',
      c,
      p,
      props,
      vis,
      usuario,
      corredora,
      op,
      fecha,
      hora,
      negocioId: a.negocio_id ? String(a.negocio_id).slice(0, 80) : null,
      propiedades,
    };
  }

  /** el número que llevará la próxima orden (sin gastarlo) */
  private async numeroSiguiente(corredoraId: string) {
    const f = await this.db.contador.findUnique({ where: { corredoraId_serie: { corredoraId, serie: SERIE } } });
    return (f?.valor ?? 0) + 1;
  }
  /** gasta el número: atómico */
  private async tomarNumero(corredoraId: string) {
    const f = await this.db.contador.upsert({
      where: { corredoraId_serie: { corredoraId, serie: SERIE } },
      create: { corredoraId, serie: SERIE, valor: 1 },
      update: { valor: { increment: 1 } },
    });
    return f.valor;
  }

  private async html(x: Armada, numero: number) {
    return llenar(await this.plantillasDoc.html(x.c.corredoraId, 'orden-visita'), {
      numero: numero.toLocaleString('es-CL'),
      fechaEmision: fechaLarga(hoy()),
      corredora: x.corredora,
      corredor: { nombre: x.usuario.nombre, email: x.usuario.email, telefono: x.usuario.telefono ?? '' },
      visitante: {
        nombre: x.vis.nombre,
        rut: x.vis.rut,
        email: x.vis.email,
        telefono: x.vis.telefono,
        nacionalidad: x.vis.nacionalidad ?? '',
      },
      visita: { fecha: fechaLarga(x.fecha), hora: x.hora ? `${x.hora} hrs.` : 'hora a coordinar' },
      operacion: {
        txt: x.op === 'arriendo' ? 'arriendo' : 'venta',
        venta: x.op === 'venta',
        arriendo: x.op === 'arriendo',
      },
      // condiciones del modelo de la corredora (orden de visita): vigencia de la orden y garantía de seriedad del arriendo
      vigenciaDias: x.vigenciaDias,
      garantiaSeriedad: x.garantiaSeriedad,
      propiedades: x.propiedades,
    });
  }

  private resumen(x: Armada) {
    return {
      propiedad: x.props.map((q) => `${q.codigo} · ${q.titulo}`).join(' + '),
      visitante: x.vis.nombre,
      rut: x.vis.rut,
      correo: x.vis.email,
      fecha: x.fecha,
      hora: x.hora || null,
      plantilla: 'Orden de visita de Asset',
      datosDelDocumento: [
        { campo: 'Propiedades', valor: x.props.map((q) => q.codigo).join(', ') },
        { campo: 'Visitante', valor: `${x.vis.nombre} · ${x.vis.rut}` },
        { campo: 'Correo', valor: x.vis.email },
        { campo: 'Fecha de la visita', valor: `${x.fecha}${x.hora ? ' ' + x.hora : ''}` },
        { campo: 'Atiende', valor: x.usuario.nombre },
      ],
    };
  }

  // ---------------------------------------------------------------- la app: ver el PDF y enviarlo
  /** el PDF tal como se enviaría, para que el corredor lo vea antes de decidir (no envía, no cobra, no agenda) */
  async vistaPrevia(c: CtxOrden, a: ArgsOrden): Promise<Record<string, unknown>> {
    const x = await this.armar(c, a);
    if ('error' in x) return { error: x.error };
    const bytes = await this.pdfs.pdf(await this.html(x, await this.numeroSiguiente(c.corredoraId)));
    return {
      ok: true,
      pdf: bytes.toString('base64'),
      archivo: `Orden de visita ${x.p.codigo} - ${x.vis.nombre}.pdf`,
      ...this.resumen(x),
    };
  }

  /** genera el PDF, lo sube a Portalfirma y lo envía a firmar al visitante (cobra del saldo); luego lo registra */
  async enviar(c: CtxOrden, a: ArgsOrden): Promise<Record<string, unknown>> {
    const x = await this.armar(c, a);
    if ('error' in x) return { error: x.error };
    return this.despachar(x);
  }

  private async despachar(x: Armada): Promise<Record<string, unknown>> {
    const { c, p, vis, usuario } = x;
    const numero = await this.tomarNumero(c.corredoraId);
    const bytes = await this.pdfs.pdf(await this.html(x, numero));
    const nombreArchivo = `Orden de visita nº ${numero} - ${p.codigo}.pdf`;
    const r = await this.envio.enviar({
      corredoraId: c.corredoraId,
      pagadorRespaldo: usuario.email,
      usuarioId: c.usuarioId,
      drive: { tipo: 'Órdenes de visita', propiedadId: p.id, negocioId: x.negocioId },
      bytes,
      nombreArchivo,
      firmantes: [
        {
          rut: vis.rut,
          fullName: vis.nombre,
          email: vis.email,
          phone: vis.telefono || undefined,
          alias: 'visitante',
          typeSign: 'simple',
        },
      ],
    });
    if ('error' in r) return { error: r.error };
    return this.registrar(x, numero, r.operacion);
  }

  /** lo que queda anotado cuando la orden ya salió */
  private async registrar(x: Armada, numero: number, operacion: number): Promise<Record<string, unknown>> {
    const { c, p, vis, usuario, fecha, hora } = x;
    try {
      const token = { sub: c.usuarioId, corredoraId: c.corredoraId, rol: usuario.rol, sid: '' };
      let personaId = vis.persona?.id ?? null;
      if (vis.nueva) {
        const nueva = await this.personas.crear(token, {
          nombre: vis.nueva.nombre,
          rut: vis.nueva.rut,
          email: vis.nueva.email || undefined,
          telefono: vis.nueva.telefono || undefined,
          roles: ['interesado'],
        });
        personaId = (nueva as { id: string }).id;
      } else if (vis.persona && ((!vis.persona.email && vis.email) || (!vis.persona.telefono && vis.telefono)))
        await this.db.persona.update({
          where: { id: vis.persona.id },
          data: {
            ...(vis.persona.email ? {} : { email: vis.email }),
            ...(vis.persona.telefono || !vis.telefono ? {} : { telefono: vis.telefono }),
            version: { increment: 1 },
          },
        });
      if (personaId)
        for (const q of x.props)
          await this.db.propiedadPersona.upsert({
            where: { propiedadId_personaId_rol: { propiedadId: q.id, personaId, rol: 'interesado' } },
            create: { propiedadId: q.id, personaId, rol: 'interesado' },
            update: {},
          });
      await this.db.firma.upsert({
        where: { corredoraId_operacion: { corredoraId: c.corredoraId, operacion } },
        create: {
          id: `op${operacion}`,
          corredoraId: c.corredoraId,
          operacion,
          documento: `Orden de visita nº ${numero}`,
          origen: 'asset',
          estado: 'en_firma',
          propiedadIds: x.props.map((q) => q.id),
          negocioId: x.negocioId,
          enviadoPorId: c.usuarioId,
          total: 1,
          firmantes: [
            {
              nombre: vis.nombre,
              rut: vis.rut,
              rol: 'Visitante',
              personaId,
              email: vis.email,
              telefono: vis.telefono,
              firmo: false,
            },
          ] as Prisma.InputJsonValue,
          datos: { formato: 'orden_visita', hito: 'orden', numero, tipoFirma: 'simple', tramite: 'none' },
        },
        update: {},
      });
      // la visita en la agenda: si ya había una de esa propiedad ese día a la misma hora, se le anota la orden; si no, se
      // crea (otra visita el mismo día, de otra persona, no se toca)
      const dia = new Date(`${fecha}T00:00:00Z`);
      const ya = await this.db.evento.findFirst({
        where: {
          corredoraId: c.corredoraId,
          propiedadId: p.id,
          tipo: 'visita',
          fecha: dia,
          hora: hora || null,
          eliminadoEn: null,
          estado: 'programado',
        },
      });
      if (ya)
        await this.db.evento.update({
          where: { id: ya.id },
          data: {
            datos: {
              ...(ya.datos as object),
              orden: { operacion, numero },
              actualizado: new Date().toISOString(),
            },
            ...(hora && !ya.hora ? { hora } : {}),
            ...(x.negocioId && !ya.negocioId ? { negocioId: x.negocioId } : {}),
            version: { increment: 1 },
          },
        });
      else
        await this.db.evento.create({
          data: {
            id: 'v' + Date.now().toString(36) + randomBytes(2).toString('hex'),
            corredoraId: c.corredoraId,
            tipo: 'visita',
            fecha: dia,
            hora: hora || null,
            propiedadId: p.id,
            negocioId: x.negocioId,
            personaIds: personaId ? [personaId] : [],
            corredorId: c.usuarioId,
            creadoPorId: c.usuarioId,
            datos: {
              titulo: `Visita de ${vis.nombre} a ${p.codigo}`,
              duracion: 45,
              lugar: [p.direccion, p.unidad, p.comuna].filter(Boolean).join(', '),
              notas: `Orden de visita nº ${numero}: operación ${operacion}`,
              orden: { operacion, numero },
              creado: new Date().toISOString(),
              actualizado: new Date().toISOString(),
              ext: { fuente: 'orden-visita' },
            },
          },
        });
      await this.actividad.registrar({
        corredoraId: c.corredoraId,
        entidadTipo: 'propiedad',
        entidadId: p.id,
        texto: `Orden de visita nº ${numero} enviada a firmar a ${vis.nombre} (operación ${operacion})`,
        usuarioId: c.usuarioId,
      });
    } catch (e) {
      // la orden ya salió: lo que falle al registrar no debe esconderlo
      this.log.error(`orden de visita enviada pero sin registrar del todo: ${(e as Error).message}`);
      return {
        ok: true,
        enviada: true,
        operacion,
        numero,
        visitante: vis.nombre,
        aviso: 'La orden se envió, pero no pude registrarla del todo en Asset: ábrelo para revisarla.',
      };
    }
    return {
      ok: true,
      enviada: true,
      operacion,
      numero,
      visitante: vis.nombre,
      correo: vis.email,
      fecha,
      hora: hora || null,
      indicacion: `La orden nº ${numero} se envió a firmar (operación ${operacion}): ${vis.nombre} recibe el enlace para firmar en ${vis.email}. Se cobró del saldo de Portalfirma. La visita quedó en la agenda.`,
    };
  }

  // ---------------------------------------------------------------- la herramienta del equipo por WhatsApp
  async ejecutar(c: CtxOrden, pedido: ArgsOrden): Promise<Record<string, unknown>> {
    let a = pedido;
    if (pedido.confirmado) {
      // el modelo no recuerda con exactitud los argumentos del turno anterior: se envía EXACTAMENTE lo que se le mostró
      // al corredor (lo último que se preparó), y solo ante un «sí» puro de este turno
      const pend = this.preparadas.get(c.usuarioId);
      if (!pend || Date.now() - pend.en > VIGENCIA_MS)
        return {
          error:
            'Primero hay que preparar la orden y mostrarle los datos (llámala sin confirmado). No hay nada preparado o venció (15 minutos).',
        };
      if (!asiente(c.texto))
        return {
          error:
            'El corredor todavía no confirmó: pregúntale si la envías y espera su sí. Si pidió un cambio, prepárala de nuevo con el cambio.',
        };
      a = { ...pend.args, confirmado: true };
    }
    const x = await this.armar(c, a);
    if ('error' in x) return { error: x.error };
    const clave = createHash('sha1')
      .update(
        JSON.stringify([
          x.props.map((q) => q.id),
          norm(x.vis.nombre),
          x.vis.rut,
          x.vis.email,
          x.vis.telefono,
          x.fecha,
          x.hora,
          x.op,
          x.vigenciaDias,
          x.garantiaSeriedad,
          x.negocioId,
        ]),
      )
      .digest('hex');

    // ---- paso 1: preparar
    if (!a.confirmado) {
      this.preparadas.set(c.usuarioId, { clave, en: Date.now(), args: { ...a, confirmado: false } });
      return {
        ok: true,
        enviada: false,
        necesitaConfirmacion: true,
        ...this.resumen(x),
        indicacion:
          'La orden NO se envió, NO se cobró y NO se agendó. Muéstrale estos datos y pregúntale si la envías (se cobra del saldo de Portalfirma y el visitante recibe el enlace para firmar en su correo). Cuando conteste que sí, vuelve a llamar esta herramienta con confirmado: true y EXACTAMENTE los mismos datos. Sin su sí, no la envíes.',
      };
    }

    // ---- paso 2: enviar lo que se mostró (si los datos cambiaron desde entonces, se vuelve a mostrar)
    const previa = this.preparadas.get(c.usuarioId);
    if (!previa || previa.clave !== clave)
      return {
        error:
          'Los datos cambiaron desde que se los mostraste (la ficha o el visitante): prepárala de nuevo y muéstraselos otra vez.',
      };
    this.preparadas.delete(c.usuarioId);
    return this.despachar(x);
  }
}

// ---------------------------------------------------------------- HTTP para la app
const pedidoEsquema = z.object({
  propiedadId: z.string().trim().max(64).optional(),
  codigo: z.string().trim().max(40).optional(),
  otras: z.array(z.string().trim().max(40)).max(6).optional(),
  personaId: z.string().trim().max(64).optional(),
  visitante: z.string().trim().max(160).optional(),
  rut: z.string().trim().max(20).optional(),
  email: z.string().trim().max(160).optional(),
  telefono: z.string().trim().max(40).optional(),
  fecha: z.string().trim().max(10).optional(),
  hora: z.string().trim().max(5).optional(),
  operacion: z.enum(['venta', 'arriendo']).optional(),
  vigenciaDias: z.string().trim().max(4).optional(),
  garantiaSeriedad: z.string().trim().max(40).optional(),
  negocioId: z.string().trim().max(80).optional(),
});
type Pedido = z.infer<typeof pedidoEsquema>;
const aArgs = (b: Pedido): ArgsOrden => ({
  propiedad_id: b.propiedadId,
  codigo_propiedad: b.codigo,
  otras: b.otras,
  visitante: b.personaId || b.visitante,
  rut: b.rut,
  email: b.email,
  telefono: b.telefono,
  fecha: b.fecha,
  hora: b.hora,
  operacion: b.operacion,
  vigencia_dias: b.vigenciaDias,
  garantia_seriedad: b.garantiaSeriedad,
  negocio_id: b.negocioId,
});

@Controller('ordenes-visita')
export class OrdenVisitaController {
  constructor(private readonly s: OrdenVisitaService) {}

  /** el PDF (base64) y los datos que lleva, para verlo antes de enviar */
  @Post('vista-previa')
  @HttpCode(200)
  vistaPrevia(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pedidoEsquema)) b: Pedido) {
    return this.s.vistaPrevia({ corredoraId: u.corredoraId, usuarioId: u.sub, texto: '' }, aArgs(b));
  }

  /** envía la orden a firmar (cobra del saldo de Portalfirma) */
  @Post('enviar')
  @HttpCode(200)
  enviar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pedidoEsquema)) b: Pedido) {
    return this.s.enviar({ corredoraId: u.corredoraId, usuarioId: u.sub, texto: '' }, aArgs(b));
  }
}
