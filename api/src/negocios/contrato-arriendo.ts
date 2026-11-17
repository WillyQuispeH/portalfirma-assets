// CONTRATO DE ARRIENDO de un negocio, hecho por Asset: plantilla HTML propia (src/documentos/plantillas/contrato-arriendo.html) → PDF →
// Portalfirma lo recibe y lo envía a firmar a los propietarios (arrendador), al arrendatario y a los codeudores (los avales que se evaluaron con el arrendatario).
//  · POST /v1/contratos-arriendo/vista-previa { negocioId }: el PDF (base64) tal como se enviaría (no envía).
//  · POST /v1/contratos-arriendo/enviar { negocioId, tipoFirma, tramite }: lo envía a firmar y lo registra, ligado a la etapa «contrato»
//    del negocio. tipoFirma: simple | avanzada. tramite: none | legalization (legalizado ante notario).
// Los datos salen de lo ya guardado: negocio (monto, ciclo.contrato.datos), personas y ficha de la propiedad.
import { Body, Controller, HttpCode, Injectable, Logger, Post } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { buscarVisible } from '../comun/asignados';
import { ActividadService } from '../comun/actividad.service';
import { PdfService } from '../documentos/pdf.service';
import { RegistrosService } from '../registros/registros';
import { EnviadosService } from '../whatsapp/enviados';
import { DocumentoRevisionService } from '../whatsapp/documento-revision';
import { EnvioFirmaService, type FirmanteEnvio } from '../documentos/envio-firma';
import { cargarPlantilla, llenar } from '../documentos/plantilla';
import { hoy } from '../whatsapp/comun';
import { describir, dominioDe, unir } from '../documentos/comparecientes';

const SERIE = 'contrato_arriendo';
/** multa por cada atraso en el pago (modelo de contrato de la corredora) */
const MULTA_MORA = '0,5 Unidades de Fomento';
/** último día del plazo: inicio + N meses − 1 día */
const terminoDe = (inicio: string, meses: number) => {
  const d = new Date(`${inicio}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const cuenta = (n: number, uno: string, varios: string) => (n > 0 ? `${n} ${n === 1 ? uno : varios}` : '');
/** «compuesto por 3 dormitorios y 2 baños» (vacío si no hay nada que decir) */
const conLista = (inicio: string, partes: string[]) => {
  const p = partes.filter(Boolean);
  return p.length ? `${inicio} ${p.join(' y ')}` : '';
};
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monto = (v: number, m: string) =>
  m === 'UF' ? `UF ${v.toLocaleString('es-CL')}` : m === 'USD' ? `US$ ${v.toLocaleString('es-CL')}` : `$${v.toLocaleString('es-CL')}`;

export interface ContratoDatos {
  inicio?: string;
  plazoMeses?: number | string;
  reajuste?: string;
  avisoDias?: number | string;
  /** para qué se arrienda: habitacional | comercial | oficina | bodega | estacionamiento */
  uso?: string;
  /** (contratos antiguos) texto libre del destino */
  destino?: string;
  diaPago?: number | string;
  /** cuenta donde se paga la renta («corriente nº 00-123 del Banco de Chile»); si no se escribe, el contrato dice que el arrendador la indicará */
  cuenta?: string;
  /** garantía: cuántos meses de renta */
  garantiaMeses?: number | string;
  /** (contratos antiguos) texto libre de la garantía */
  garantia?: string;
  clausulas?: string;
}
const USO: Record<string, string> = {
  habitacional: 'vivienda habitacional del Arrendatario y su grupo familiar',
  comercial: 'fines comerciales (local comercial)',
  oficina: 'oficina',
  bodega: 'bodega o almacenamiento',
  estacionamiento: 'estacionamiento de vehículos',
};
const REAJUSTE: Record<string, string> = {
  ipc_anual: 'La renta se reajusta cada 12 meses según la variación del IPC.',
  ipc_semestral: 'La renta se reajusta cada 6 meses según la variación del IPC.',
  uf: 'La renta está expresada en UF y se paga según su valor al día del pago.',
  sin: 'La renta no se reajusta durante la vigencia del contrato.',
};

type Firmante = FirmanteEnvio & { rol: string; personaId?: string };

@Injectable()
export class ContratoArriendoService {
  private readonly log = new Logger('ContratoArriendo');
  constructor(
    private readonly db: PrismaService,
    private readonly pdfs: PdfService,
    private readonly envio: EnvioFirmaService,
    private readonly actividad: ActividadService,
    private readonly registros: RegistrosService,
    private readonly enviados: EnviadosService,
    private readonly revisionWa: DocumentoRevisionService,
  ) {}

  private async armar(u: UsuarioToken, negocioId: string) {
    const n = await buscarVisible(this.db.negocio, u, negocioId, 'El negocio');
    if (n.tipo !== 'arriendo') return { error: 'El contrato de arriendo es solo para negocios de arriendo.' };
    if (!n.clienteId) return { error: 'El negocio no tiene arrendatario: vincúlalo en el paso «Interesado registrado».' };
    if (!n.propiedadId) return { error: 'El negocio no tiene propiedad.' };
    const [arr, prop, usuario, corredora, duenos] = await Promise.all([
      this.db.persona.findFirst({ where: { id: n.clienteId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      this.db.propiedad.findFirst({ where: { id: n.propiedadId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      this.db.usuario.findUnique({ where: { id: u.sub } }),
      this.db.corredora.findUnique({ where: { id: u.corredoraId }, select: { nombre: true, rut: true } }),
      this.db.propiedadPersona.findMany({
        where: { propiedadId: n.propiedadId, rol: 'propietario' },
        include: { persona: true },
      }),
    ]);
    if (!arr) return { error: 'El arrendatario del negocio ya no existe.' };
    if (!prop) return { error: 'La propiedad del negocio ya no existe.' };
    if (!usuario) return { error: 'No encontré tu usuario.' };
    const rutDe = (p: { rutFormato: string | null; rut: string | null }) => p.rutFormato || p.rut || '';
    const falta = (nombre: string, rut: string, email: string | null) =>
      !rut
        ? `${nombre} no tiene RUT en su ficha: agrégalo para enviarle el contrato a firmar.`
        : !email || !emailOk(email)
          ? `Falta el correo de ${nombre}: ahí recibe el enlace para firmar.`
          : '';
    if (!duenos.length) return { error: 'La propiedad no tiene propietario en su ficha: vincúlalo para poder firmar.' };
    for (const d of duenos) {
      const e = falta(d.persona.nombre, rutDe(d.persona), d.persona.email);
      if (e) return { error: e };
    }
    const eArr = falta(arr.nombre, rutDe(arr), arr.email);
    if (eArr) return { error: eArr };
    const datos = (n.datos ?? {}) as {
      valor?: { valor?: number; moneda?: string };
      ciclo?: { contrato?: { datos?: ContratoDatos } };
    };
    const k = datos.ciclo?.contrato?.datos ?? {};
    const v = Number(datos.valor?.valor);
    if (!v || v <= 0) return { error: 'Falta la renta: escríbela en las condiciones del negocio.' };
    if (!k.inicio || !/^\d{4}-\d{2}-\d{2}$/.test(k.inicio)) return { error: 'Falta la fecha de inicio del contrato.' };
    const inicio = k.inicio;
    const plazo = Number(k.plazoMeses);
    if (!plazo || plazo < 1 || plazo > 600) return { error: 'Falta el plazo del contrato (en meses).' };
    // los codeudores (avales) son los que se evaluaron junto con el arrendatario: ya tenemos sus datos en sus fichas
    const ev = await this.db.registro.findUnique({
      where: { corredoraId_coleccion_id: { corredoraId: u.corredoraId, coleccion: 'evaluaciones', id: negocioId } },
    });
    const idsAvales = (((ev && !ev.eliminadoEn ? ev.datos : null) as { personas?: { personaId: string; rol: string }[] } | null)?.personas ?? [])
      .filter((p) => p.rol === 'aval')
      .map((p) => p.personaId);
    const avales = idsAvales.length
      ? await this.db.persona.findMany({ where: { id: { in: idsAvales }, corredoraId: u.corredoraId, eliminadoEn: null } })
      : [];
    for (const a of avales) {
      const e = falta(a.nombre, rutDe(a), a.email);
      if (e) return { error: e };
    }
    const aviso = Number(k.avisoDias) || 0;
    const moneda = datos.valor?.moneda || 'CLP';
    const firmantes: Firmante[] = [
      ...duenos.map((d) => ({
        rut: rutDe(d.persona),
        fullName: d.persona.nombre,
        email: d.persona.email ?? '',
        phone: d.persona.telefono || undefined,
        alias: 'arrendador',
        rol: 'Arrendador',
        personaId: d.persona.id,
      })),
      {
        rut: rutDe(arr),
        fullName: arr.nombre,
        email: arr.email ?? '',
        phone: arr.telefono || undefined,
        alias: 'arrendatario',
        rol: 'Arrendatario',
        personaId: arr.id,
      },
      ...avales.map((a) => ({
        rut: rutDe(a),
        fullName: a.nombre,
        email: a.email ?? '',
        phone: a.telefono || undefined,
        alias: 'codeudor',
        rol: 'Codeudor',
        personaId: a.id,
      })),
    ];
    const meses = Number(k.garantiaMeses) || Number(/d+([.,]d+)?/.exec(String(k.garantia ?? ''))?.[0]?.replace(',', '.')) || 1;
    const garantiaTxt = `${meses.toLocaleString('es-CL')} ${meses === 1 ? 'mes' : 'meses'} de renta (${monto(Math.round(v * meses), moneda)})`;
    const varios = avales.length > 1;
    // dónde se paga la renta: lo escrito en el contrato o, si no, lo de la ficha de la propiedad
    const cuentaPago =
      String(k.cuenta ?? '').trim() || String(((prop.ficha ?? {}) as Record<string, unknown>).cuentaPago ?? '').trim();
    return {
      n,
      prop,
      usuario,
      firmantes,
      vars: (numero: number) => ({
        numero: numero.toLocaleString('es-CL'),
        fechaEmision: fechaLarga(hoy()),
        ciudad: prop.comuna || 'Santiago',
        corredora: { nombre: corredora?.nombre ?? 'la corredora', rut: corredora?.rut ?? '' },
        corredor: { nombre: usuario.nombre, email: usuario.email, telefono: usuario.telefono ?? '' },
        arrendador: {
          texto: unir(duenos.map((d) => describir(d.persona))),
          firma: unir(duenos.map((d) => d.persona.nombre)),
          email: unir(duenos.map((d) => d.persona.email ?? '')),
          domicilio: unir(duenos.map((d) => d.persona.direccion ?? '')),
          cuentaTxt: cuentaPago
            ? `en la cuenta ${cuentaPago}, a nombre del Arrendador`
            : 'en la cuenta que el Arrendador indique por escrito',
        },
        arrendatario: {
          nombre: arr.nombre,
          texto: describir(arr),
          rut: rutDe(arr),
          email: arr.email ?? '',
          telefono: arr.telefono ?? '',
          domicilio: arr.direccion ?? '',
        },
        codeudor: avales.length
          ? {
              texto: unir(avales.map((a) => describir(a))),
              titulo: varios ? 'codeudores solidarios' : 'codeudor solidario',
              etiqueta: varios ? 'los «Codeudores»' : 'el «Codeudor»',
              verbo: varios ? 'intervienen' : 'interviene',
              obliga: varios ? 'se obligan solidariamente' : 'se obliga solidariamente',
              nombres: avales.map((a) => a.nombre).join(' y '),
            }
          : undefined,
        propiedad: {
          codigo: prop.codigo,
          tipo: mayus(String(prop.tipo || '').replace(/_/g, ' ')),
          direccion: [prop.direccion, prop.unidad ? `depto. ${prop.unidad}` : '', prop.comuna].filter(Boolean).join(', '),
          // «el departamento número 1502, ubicado en…, de una superficie aproximada de 85 m², compuesto por…»
          descripcion: [
            `${String(prop.tipo || 'inmueble').replace(/_/g, ' ')}${prop.unidad ? ` número ${prop.unidad}` : ''}`,
            `ubicado en ${[prop.direccion, prop.comuna, prop.region].filter(Boolean).join(', ') || 'la dirección indicada'}`,
            prop.supTotal || prop.supUtil
              ? `de una superficie aproximada de ${Number(prop.supUtil || prop.supTotal).toLocaleString('es-CL')} m²`
              : '',
            conLista('compuesto por', [cuenta(prop.dormitorios ?? 0, 'dormitorio', 'dormitorios'), cuenta(prop.banos ?? 0, 'baño', 'baños')]),
            conLista('con', [cuenta(prop.estacionamientos ?? 0, 'estacionamiento', 'estacionamientos'), cuenta(prop.bodegas ?? 0, 'bodega', 'bodegas')]),
          ]
            .filter(Boolean)
            .join(', '),
          dominio: dominioDe(prop.ficha),
        },
        contrato: {
          inicio: fechaLarga(inicio),
          termino: fechaLarga(terminoDe(inicio, plazo)),
          avisoDias: aviso ? String(aviso) : '',
          multaMora: MULTA_MORA,
          plazo: `${plazo} mes${plazo === 1 ? '' : 'es'}`,
          aviso: aviso
            ? `Si ninguna de las partes avisa por escrito con ${aviso} días de anticipación su intención de no renovar, el contrato se renueva por períodos iguales.`
            : 'El contrato termina al vencer el plazo, salvo que las partes acuerden renovarlo por escrito.',
          renta: monto(v, moneda),
          diaPago: String(Number(k.diaPago) || 5),
          reajuste: REAJUSTE[String(k.reajuste ?? '')] ?? '',
          garantia: garantiaTxt,
          destino: USO[String(k.uso ?? '')] ?? (String(k.destino ?? '').trim() || USO.habitacional),
          clausulas: String(k.clausulas ?? '').trim(),
        },
      }),
    };
  }

  private async numeroSiguiente(corredoraId: string) {
    const f = await this.db.contador.findUnique({ where: { corredoraId_serie: { corredoraId, serie: SERIE } } });
    return (f?.valor ?? 0) + 1;
  }
  private async tomarNumero(corredoraId: string) {
    const f = await this.db.contador.upsert({
      where: { corredoraId_serie: { corredoraId, serie: SERIE } },
      create: { corredoraId, serie: SERIE, valor: 1 },
      update: { valor: { increment: 1 } },
    });
    return f.valor;
  }

  async vistaPrevia(u: UsuarioToken, negocioId: string): Promise<Record<string, unknown>> {
    const x = await this.armar(u, negocioId);
    if ('error' in x) return { error: x.error };
    const bytes = await this.pdfs.pdf(
      llenar(cargarPlantilla('contrato-arriendo'), x.vars(await this.numeroSiguiente(u.corredoraId))),
    );
    return {
      ok: true,
      pdf: bytes.toString('base64'),
      archivo: `Contrato de arriendo ${x.prop.codigo}.pdf`,
      firmantes: x.firmantes.map((f) => ({ nombre: f.fullName, rol: f.rol })),
    };
  }

  /** el PDF de una versión guardada del contrato (en los archivos del negocio); exige que sea un PDF */
  private async versionPdf(u: UsuarioToken, negocioId: string, clave: string): Promise<Buffer> {
    const bytes = await this.registros.archivoBytes(u, 'archivos_negocio', negocioId, clave);
    if (bytes.subarray(0, 4).toString() !== '%PDF')
      throw new BadRequestException(
        'La versión aprobada no es un PDF: guarda la versión final en PDF para enviarla a firmar.',
      );
    return bytes;
  }

  /** el PDF de una versión guardada (base64), para verla en la app */
  async versionVer(u: UsuarioToken, negocioId: string, clave: string): Promise<Record<string, unknown>> {
    try {
      return { ok: true, pdf: (await this.versionPdf(u, negocioId, clave)).toString('base64') };
    } catch (e) {
      return { error: (e as { message?: string }).message || 'No pude leer el contrato.' };
    }
  }

  /**
   * Manda por WhatsApp la versión del contrato (con el PDF adjunto) al arrendatario o al propietario, pidiéndole que la apruebe o la
   * comente. El texto lo arma y lo confirma el corredor; el celular sale de la ficha (no de la app). Fuera de la ventana de 24 h
   * WhatsApp no deja mandar el PDF: se manda la plantilla «asset_documento_revision» y el PDF sale solo cuando la persona responde.
   */
  async revisionEnviar(u: UsuarioToken, b: z.infer<typeof revisionEsquema>): Promise<Record<string, unknown>> {
    const n = await buscarVisible(this.db.negocio, u, b.negocioId, 'El negocio');
    if (n.tipo !== 'arriendo' || !n.propiedadId) return { error: 'El negocio no es un arriendo con propiedad.' };
    // solo se le puede mandar a un firmante: un propietario de la propiedad, el arrendatario o un aval de la evaluación
    const duenos = await this.db.propiedadPersona.findMany({
      where: { propiedadId: n.propiedadId, rol: 'propietario' },
      select: { personaId: true },
    });
    const ev = await this.db.registro.findUnique({
      where: { corredoraId_coleccion_id: { corredoraId: u.corredoraId, coleccion: 'evaluaciones', id: b.negocioId } },
    });
    const avales = (((ev && !ev.eliminadoEn ? ev.datos : null) as { personas?: { personaId: string; rol: string }[] } | null)?.personas ?? [])
      .filter((p) => p.rol === 'aval')
      .map((p) => p.personaId);
    const permitidos = new Set([...duenos.map((d) => d.personaId), ...(n.clienteId ? [n.clienteId] : []), ...avales]);
    if (!permitidos.has(b.personaId)) return { error: 'Esa persona no es firmante de este contrato.' };
    const persona = await this.db.persona.findFirst({
      where: { id: b.personaId, corredoraId: u.corredoraId, eliminadoEn: null },
    });
    if (!persona) return { error: 'Esa persona ya no existe.' };
    if (!persona.telefono)
      return { error: `${persona.nombre} no tiene celular en su ficha: agrégalo para mandarle el contrato por WhatsApp.` };
    const url = (await this.registros.descarga(u, 'archivos_negocio', b.negocioId, b.clave, b.nombre)).url;
    let plantilla = false;
    try {
      await this.enviados.enviarArchivo(u, { telefono: persona.telefono, nombre: persona.nombre, texto: b.texto, url });
    } catch (e) {
      // no escribió en las últimas 24 h: plantilla aprobada ahora, el PDF cuando responda
      const r = e instanceof BadRequestException ? (e.getResponse() as { code?: string }) : null;
      if (r?.code !== 'FUERA_24H') throw e;
      const prop = await this.db.propiedad.findUnique({ where: { id: n.propiedadId } });
      const dir = prop ? [prop.direccion, prop.comuna].filter(Boolean).join(', ') : '';
      await this.revisionWa.solicitar(u, {
        personaId: persona.id,
        nombre: persona.nombre,
        telefono: persona.telefono,
        negocioId: n.id,
        propiedadId: n.propiedadId,
        documento: b.documento || 'el contrato de arriendo',
        propiedad: prop ? `${prop.codigo}${dir ? ' (' + dir + ')' : ''}` : 'la propiedad',
        texto: b.texto,
        clave: b.clave,
        archivo: b.nombre,
      });
      plantilla = true;
    }
    await this.actividad.registrar([
      {
        corredoraId: u.corredoraId,
        entidadTipo: 'negocio' as const,
        entidadId: n.id,
        ref2: n.propiedadId,
        texto: plantilla
          ? `Contrato para revisión: a ${persona.nombre} se le envió la plantilla de WhatsApp (no había escrito en 24 h); el PDF le llega cuando responda`
          : `Contrato enviado por WhatsApp a ${persona.nombre} para su revisión`,
        usuarioId: u.sub,
      },
    ]);
    return { ok: true, plantilla, persona: { id: persona.id, nombre: persona.nombre } };
  }

  /**
   * Envía a firmar el contrato YA APROBADO: el PDF de la versión que aprobaron el propietario y el arrendatario (se guarda al armar
   * cada versión, o al registrar la que devolvió el propietario). Los firmantes salen de las fichas.
   */
  async enviar(
    u: UsuarioToken,
    negocioId: string,
    clave: string,
    tipoFirma: 'simple' | 'avanzada',
    tramite: 'none' | 'legalization',
  ): Promise<Record<string, unknown>> {
    const x = await this.armar(u, negocioId);
    if ('error' in x) return { error: x.error };
    let bytes: Buffer;
    try {
      bytes = await this.versionPdf(u, negocioId, clave);
    } catch (e) {
      return { error: (e as { message?: string }).message || 'No pude leer el contrato aprobado.' };
    }
    const numero = await this.tomarNumero(u.corredoraId);
    const r = await this.envio.enviar({
      corredoraId: u.corredoraId,
      pagadorRespaldo: x.usuario.email,
      usuarioId: u.sub,
      drive: { tipo: 'Contratos de arriendo', propiedadId: x.prop.id, negocioId: x.n.id },
      bytes,
      nombreArchivo: `Contrato de arriendo nº ${numero} - ${x.prop.codigo}.pdf`,
      protocolizacion: tramite,
      firmantes: x.firmantes.map((f) => ({
        rut: f.rut,
        fullName: f.fullName,
        email: f.email,
        phone: f.phone,
        alias: f.alias,
        typeSign: tipoFirma,
      })),
    });
    if ('error' in r) return { error: r.error };
    const operacion = r.operacion;
    const total = x.firmantes.length;
    try {
      await this.db.firma.upsert({
        where: { corredoraId_operacion: { corredoraId: u.corredoraId, operacion } },
        create: {
          id: `op${operacion}`,
          corredoraId: u.corredoraId,
          operacion,
          documento: `Contrato de arriendo nº ${numero}`,
          origen: 'asset',
          estado: 'en_firma',
          propiedadIds: [x.prop.id],
          negocioId: x.n.id,
          enviadoPorId: u.sub,
          total,
          firmantes: x.firmantes.map((f) => ({
            nombre: f.fullName,
            rut: f.rut,
            rol: f.rol,
            personaId: f.personaId,
            email: f.email,
            telefono: f.phone ?? '',
            firmo: false,
          })) as Prisma.InputJsonValue,
          datos: { formato: 'contrato_arriendo', hito: 'contrato', numero, tipoFirma, tramite, versionClave: clave },
        },
        update: {},
      });
      const datos = { ...((x.n.datos as Record<string, unknown>) ?? {}) };
      const firmas = { ...((datos.firmas as Record<string, unknown>) ?? {}) };
      firmas.contrato = { operacion, estado: 'en_firma', firmados: 0, total, revisado: null, error: null };
      await this.db.negocio.update({
        where: { id: x.n.id },
        data: { datos: { ...datos, firmas } as Prisma.InputJsonValue, version: { increment: 1 } },
      });
      const texto = `Contrato de arriendo nº ${numero} enviado a firmar a ${total} persona${total === 1 ? '' : 's'} (operación ${operacion})`;
      await this.actividad.registrar([
        { corredoraId: u.corredoraId, entidadTipo: 'negocio' as const, entidadId: x.n.id, ref2: x.prop.id, texto, usuarioId: u.sub },
        { corredoraId: u.corredoraId, entidadTipo: 'propiedad' as const, entidadId: x.prop.id, ref2: x.n.id, texto, usuarioId: u.sub },
      ]);
    } catch (e) {
      this.log.error(`contrato enviado pero sin registrar del todo: ${(e as Error).message}`);
      return {
        ok: true,
        enviada: true,
        operacion,
        numero,
        aviso: 'El contrato se envió, pero no pude registrarlo del todo en Asset: ábrelo para revisarlo.',
      };
    }
    return {
      ok: true,
      enviada: true,
      operacion,
      numero,
      firmantes: x.firmantes.map((f) => ({ nombre: f.fullName, rol: f.rol, correo: f.email })),
      indicacion: `El contrato de arriendo nº ${numero} se envió a firmar (operación ${operacion}) a ${total} persona${total === 1 ? '' : 's'}${tramite === 'legalization' ? ', con legalización notarial' : ''}. Se cobró del saldo de Portalfirma.`,
    };
  }
}

const revisionEsquema = z.object({
  negocioId: z.string().trim().min(1).max(80),
  /** a quién se le manda: un firmante (propietario, arrendatario o aval/codeudor) */
  personaId: z.string().trim().min(1).max(80),
  clave: z.string().trim().min(3).max(300),
  nombre: z.string().trim().max(200).default('Contrato de arriendo.pdf'),
  texto: z.string().trim().min(1).max(3500),
  /** cómo se nombra en la plantilla cuando no escribió en 24 h: «el contrato de arriendo (versión 2)» */
  documento: z.string().trim().max(120).optional(),
});
const pedidoEsquema = z.object({
  negocioId: z.string().trim().min(1).max(80),
  clave: z.string().trim().min(3).max(300).optional(),
  tipoFirma: z.enum(['simple', 'avanzada']).default('simple'),
  tramite: z.enum(['none', 'legalization']).default('none'),
});

@Controller('contratos-arriendo')
export class ContratoArriendoController {
  constructor(private readonly s: ContratoArriendoService) {}

  @Post('vista-previa')
  @HttpCode(200)
  vistaPrevia(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pedidoEsquema)) b: z.infer<typeof pedidoEsquema>) {
    return this.s.vistaPrevia(u, b.negocioId);
  }

  /** el contrato aprobado (PDF de la versión guardada) a firmar */
  @Post('enviar')
  @HttpCode(200)
  enviar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pedidoEsquema)) b: z.infer<typeof pedidoEsquema>) {
    if (!b.clave) return { error: 'Falta el contrato aprobado: primero se aprueba en el paso «Revisión del contrato».' };
    return this.s.enviar(u, b.negocioId, b.clave, b.tipoFirma, b.tramite);
  }

  /** el PDF de una versión guardada (base64) */
  @Post('version')
  @HttpCode(200)
  version(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pedidoEsquema)) b: z.infer<typeof pedidoEsquema>) {
    return this.s.versionVer(u, b.negocioId, b.clave ?? '');
  }

  /** la versión por WhatsApp (con el PDF) al arrendatario o al propietario, para que la apruebe o la comente */
  @Post('revision/enviar')
  @HttpCode(200)
  revisionEnviar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(revisionEsquema)) b: z.infer<typeof revisionEsquema>) {
    return this.s.revisionEnviar(u, b);
  }
}
