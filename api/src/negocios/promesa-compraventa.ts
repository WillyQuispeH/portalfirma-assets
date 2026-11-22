// PROMESA DE COMPRAVENTA de un negocio de VENTA, hecha por Asset: plantilla HTML propia
// (src/documentos/plantillas/promesa-compraventa.html) con variables que se reemplazan solas → PDF (Chromium del servidor) →
// Portalfirma lo recibe y lo envía a firmar al comprador y al/los vendedor(es) (los propietarios de la propiedad).
//  · POST /v1/promesas-compraventa/vista-previa { negocioId }: el PDF (base64) tal como se enviaría, para verlo antes (no envía ni cobra).
//    La firma NO es obligatoria: el corredor puede quedarse solo con el PDF (descargarlo, imprimirlo y firmarlo aparte).
//  · POST /v1/promesas-compraventa/enviar { negocioId }: lo envía a firmar (cobra del saldo de Portalfirma) y lo registra: la firma
//    en la propiedad y el negocio, y la firma de la etapa «Promesa» del negocio: cuando se firma, el paso «Promesa firmada» y el
//    negocio avanzan solos (lo hace la revisión de firmas, src/firmas/ronda.ts), igual que la carta oferta con la etapa «reserva».
// Los datos salen de lo ya guardado: el negocio (precio y condiciones de la carta oferta aceptada: n.datos.valor y n.datos.oferta;
// lo propio de la promesa en n.datos.ciclo.promesa), las personas (comprador y propietarios) y la ficha de la propiedad (rol e
// inscripción de dominio). La app los guarda en su origen ANTES de pedir el PDF: este servicio solo lee. Es el gemelo de
// carta-oferta.ts (misma forma, su propia serie de folio).
import { Body, Controller, HttpCode, Injectable, Logger, Post } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { buscarVisible } from '../comun/asignados';
import { ActividadService } from '../comun/actividad.service';
import { PdfService } from '../documentos/pdf.service';
import { EnvioFirmaService } from '../documentos/envio-firma';
import { llenar } from '../documentos/plantilla';
import { hoy } from '../whatsapp/comun';
import { describir, dominioDe, perfilDe, unir } from '../documentos/comparecientes';
import { datosCorredora } from '../documentos/corredora-doc';
import { PlantillasDocService } from '../documentos/plantillas-doc';

const SERIE = 'promesa';
/** la firma del negocio a la que se liga la promesa: la etapa «promesa» del embudo de venta (al firmarse, el negocio avanza solo) */
const ETAPA = 'promesa';

interface OfertaDatos {
  piePct?: number | string;
  escrituraDias?: number | string;
  seriedadUF?: number | string;
  comisionPct?: number | string;
}
/** lo propio de la promesa (n.datos.ciclo.promesa): lo edita el corredor en la ventana de la promesa */
interface PromesaDatos {
  /** días corridos para firmar la escritura, desde la promesa (si no se dice: los de la carta oferta, o 90) */
  escrituraDias?: number | string;
  /** AAAA-MM-DD: cuándo se entrega el inmueble (vacío: al inscribirse la compraventa) */
  fechaEntrega?: string;
  /** cómo se paga el saldo: hipotecario (por defecto) o contado */
  saldoForma?: string;
  /** otras modalidades de pago, en texto */
  pagoNota?: string;
  /** condiciones adicionales de la promesa, en texto */
  condiciones?: string;
  /** la notaría donde se firmará la escritura (vacío: la que las partes designen de común acuerdo) */
  notaria?: string;
}
/** el modelo «Carta oferta y aceptación de compraventa» de la corredora (lo que no se escribió en la carta) */
const MODELO = { piePct: 20, escrituraDias: 90, seriedadUF: 50, comisionPct: 2 };
/** un dato escrito (texto o número) como texto; cualquier otra cosa, vacío */
const txt = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const num = (v: unknown, base: number, min = 0, max = 100_000) => {
  const n = Number(txt(v).replace(',', '.'));
  return Number.isFinite(n) && n > min && n <= max ? n : base;
};
const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const largo = (v: number, moneda: string) =>
  moneda === 'UF'
    ? `${fmt(v)} Unidades de Fomento`
    : moneda === 'USD'
      ? `${fmt(v)} dólares de los Estados Unidos de América`
      : `$${fmt(v)} (pesos chilenos)`;
const monto = (v: number, moneda: string) =>
  moneda === 'UF'
    ? `UF ${v.toLocaleString('es-CL')}`
    : moneda === 'USD'
      ? `US$ ${v.toLocaleString('es-CL')}`
      : `$${v.toLocaleString('es-CL')}`;
const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const m2 = (v: unknown) => (v != null && Number(v) > 0 ? `${Number(v).toLocaleString('es-CL')} m²` : '');
const texto = (v: unknown, max: number) => txt(v).trim().slice(0, max);

@Injectable()
export class PromesaCompraventaService {
  private readonly log = new Logger('PromesaCompraventa');
  constructor(
    private readonly db: PrismaService,
    private readonly plantillasDoc: PlantillasDocService,
    private readonly pdfs: PdfService,
    private readonly envio: EnvioFirmaService,
    private readonly actividad: ActividadService,
  ) {}

  /** valida y junta todo lo que lleva la promesa; { error } si falta algo. Para firmar además se exigen correos y la inscripción de dominio */
  private async armar(u: UsuarioToken, negocioId: string, paraFirma: boolean) {
    const n = await buscarVisible(this.db.negocio, u, negocioId, 'El negocio');
    if (n.tipo !== 'venta') return { error: 'La promesa de compraventa es solo para negocios de venta.' };
    if (!n.clienteId) return { error: 'El negocio no tiene comprador: vincúlalo en el paso «Interesado registrado».' };
    if (!n.propiedadId) return { error: 'El negocio no tiene propiedad.' };
    const [persona, prop, usuario, corredora] = await Promise.all([
      this.db.persona.findFirst({ where: { id: n.clienteId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      this.db.propiedad.findFirst({ where: { id: n.propiedadId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      this.db.usuario.findUnique({ where: { id: u.sub } }),
      datosCorredora(this.db, u.corredoraId),
    ]);
    if (!persona) return { error: 'El comprador del negocio ya no existe.' };
    if (!prop) return { error: 'La propiedad del negocio ya no existe.' };
    if (!usuario) return { error: 'No encontré tu usuario.' };
    const rut = persona.rutFormato || persona.rut || '';
    if (!rut) return { error: `${persona.nombre} no tiene RUT en su ficha: agrégalo para armar la promesa.` };
    if (paraFirma && (!persona.email || !emailOk(persona.email)))
      return { error: `Falta el correo de ${persona.nombre}: ahí recibe el enlace para firmar.` };

    const duenos = await this.db.propiedadPersona.findMany({
      where: { propiedadId: prop.id, rol: 'propietario' },
      include: { persona: true },
    });
    if (!duenos.length)
      return { error: 'La propiedad no tiene propietario en su ficha: vincúlalo para armar la promesa.' };
    for (const d of duenos) {
      if (!(d.persona.rutFormato || d.persona.rut))
        return { error: `${d.persona.nombre} no tiene RUT en su ficha: agrégalo para armar la promesa.` };
      if (paraFirma && (!d.persona.email || !emailOk(d.persona.email)))
        return { error: `Falta el correo de ${d.persona.nombre}: ahí recibe el enlace para firmar.` };
    }

    const f = (prop.ficha ?? {}) as Record<string, unknown>;
    const dom = (k: string) => txt(f[k]).trim();
    if (paraFirma && !(dom('fojas') && dom('numeroInscripcion')))
      return {
        error:
          'Falta la inscripción de dominio del inmueble (fojas y número): complétala en los datos legales de la propiedad.',
      };

    const datos = (n.datos ?? {}) as {
      valor?: { valor?: number; moneda?: string };
      oferta?: OfertaDatos;
      ciclo?: { promesa?: PromesaDatos };
    };
    const v = Number(datos.valor?.valor);
    if (!v || v <= 0) return { error: 'Falta el precio de la compraventa: escríbelo en las condiciones del negocio.' };
    const moneda = datos.valor?.moneda || 'UF';
    const of = datos.oferta ?? {};
    const pr = datos.ciclo?.promesa ?? {};
    const piePct = num(of.piePct, MODELO.piePct);
    if (piePct >= 100) return { error: 'El pie debe ser menor al 100 % del precio: corrígelo en la promesa.' };
    const escrituraDias = Math.min(720, Math.round(num(pr.escrituraDias, num(of.escrituraDias, MODELO.escrituraDias))));
    const fechaEntrega = /^\d{4}-\d{2}-\d{2}$/.test(String(pr.fechaEntrega ?? '')) ? String(pr.fechaEntrega) : '';
    const hipotecario = pr.saldoForma !== 'contado';
    const notaria = texto(pr.notaria, 160);

    const vendedorTexto = unir(duenos.map((d) => describir(d.persona)));
    const firmantes = [
      {
        rut,
        nombre: persona.nombre,
        email: persona.email ?? '',
        telefono: persona.telefono ?? '',
        alias: 'comprador',
        rol: 'Comprador',
        personaId: persona.id,
      },
      ...duenos.map((d) => ({
        rut: d.persona.rutFormato || d.persona.rut || '',
        nombre: d.persona.nombre,
        email: d.persona.email ?? '',
        telefono: d.persona.telefono ?? '',
        alias: 'vendedor',
        rol: 'Vendedor',
        personaId: d.persona.id,
      })),
    ];
    return {
      n,
      firmantes,
      persona: { id: persona.id, nombre: persona.nombre, rut, email: persona.email ?? '' },
      prop,
      usuario,
      vars: (numero: number) => ({
        numero: numero.toLocaleString('es-CL'),
        fechaEmision: fechaLarga(hoy()),
        ciudad: prop.comuna || 'Santiago',
        // en venta firma el representante de venta (si la corredora tiene uno distinto)
        corredora: { ...corredora, representante: corredora.representanteVenta },
        corredor: { nombre: usuario.nombre, email: usuario.email, telefono: usuario.telefono ?? '' },
        vendedor: {
          nombre: unir(duenos.map((d) => d.persona.nombre)),
          firma: unir(duenos.map((d) => d.persona.nombre)),
          texto: vendedorTexto,
          // una línea por propietario para la tarjeta (sin repetir el nombre)
          lineas: duenos
            .map((d) =>
              [
                d.persona.rutFormato || d.persona.rut ? `RUT ${d.persona.rutFormato || d.persona.rut}` : '',
                perfilDe(d.persona),
                d.persona.direccion ?? '',
                d.persona.email ?? '',
              ]
                .filter(Boolean)
                .join(' · '),
            )
            .map((t) => ({ texto: t })),
        },
        comprador: {
          nombre: persona.nombre,
          rut,
          email: persona.email ?? '',
          telefono: persona.telefono ?? '',
          perfil: perfilDe(persona),
          domicilio: persona.direccion ?? '',
          texto: describir(persona),
        },
        propiedad: {
          codigo: prop.codigo,
          tipo: mayus(String(prop.tipo || '').replace(/_/g, ' ')),
          direccion: [prop.direccion, prop.unidad ? `depto. ${prop.unidad}` : '', prop.comuna]
            .filter(Boolean)
            .join(', '),
          rol: prop.rol ?? '',
          superficie: m2(prop.supUtil) || m2(prop.supTotal),
          dominio: dominioDe(prop.ficha),
        },
        precio: { monto: monto(v, moneda), montoLargo: largo(v, moneda), enUF: moneda === 'UF' },
        venta: {
          piePct: fmt(piePct),
          pie: largo((v * piePct) / 100, moneda),
          saldoPct: fmt(100 - piePct),
          saldo: largo((v * (100 - piePct)) / 100, moneda),
          seriedad: largo(num(of.seriedadUF, MODELO.seriedadUF), 'UF'),
          comisionPct: fmt(num(of.comisionPct, MODELO.comisionPct, 0, 20)),
        },
        pago: { hipotecario, contado: !hipotecario, nota: texto(pr.pagoNota, 600) },
        escritura: { dias: String(escrituraDias) },
        entrega: {
          conFecha: !!fechaEntrega,
          sinFecha: !fechaEntrega,
          fecha: fechaEntrega ? fechaLarga(fechaEntrega) : '',
        },
        notaria: { hay: !!notaria, sin: !notaria, nombre: notaria },
        condiciones: { otras: texto(pr.condiciones, 1500) },
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

  /** el PDF tal como se enviaría, para que el corredor lo vea antes de decidir (no envía, no cobra) */
  async vistaPrevia(u: UsuarioToken, negocioId: string): Promise<Record<string, unknown>> {
    const x = await this.armar(u, negocioId, false);
    if ('error' in x) return { error: x.error };
    const bytes = await this.pdfs.pdf(
      llenar(
        await this.plantillasDoc.html(u.corredoraId, 'promesa-compraventa'),
        x.vars(await this.numeroSiguiente(u.corredoraId)),
      ),
    );
    return {
      ok: true,
      pdf: bytes.toString('base64'),
      archivo: `Promesa de compraventa ${x.prop.codigo} - ${x.persona.nombre}.pdf`,
      comprador: x.persona.nombre,
      propiedad: x.prop.codigo,
      firmantes: x.firmantes.map((f) => ({ nombre: f.nombre, rol: f.rol })),
    };
  }

  /** genera el PDF, lo envía a firmar al comprador y al/los vendedor(es) (cobra del saldo de Portalfirma) y lo registra */
  async enviar(u: UsuarioToken, negocioId: string): Promise<Record<string, unknown>> {
    const x = await this.armar(u, negocioId, true);
    if ('error' in x) return { error: x.error };
    const numero = await this.tomarNumero(u.corredoraId);
    const bytes = await this.pdfs.pdf(
      llenar(await this.plantillasDoc.html(u.corredoraId, 'promesa-compraventa'), x.vars(numero)),
    );
    const r = await this.envio.enviar({
      plantilla: 'promesa-compraventa',
      corredoraId: u.corredoraId,
      pagadorRespaldo: x.usuario.email,
      usuarioId: u.sub,
      drive: { tipo: 'Promesas de compraventa', propiedadId: x.prop.id, negocioId: x.n.id },
      bytes,
      nombreArchivo: `Promesa de compraventa nº ${numero} - ${x.prop.codigo}.pdf`,
      firmantes: x.firmantes.map((f) => ({
        rut: f.rut,
        fullName: f.nombre,
        email: f.email,
        phone: f.telefono || undefined,
        alias: f.alias,
        typeSign: 'simple' as const,
      })),
    });
    if ('error' in r) return { error: r.error };
    const operacion = r.operacion;
    const quienes = unir(x.firmantes.map((f) => f.nombre));
    try {
      await this.db.firma.upsert({
        where: { corredoraId_operacion: { corredoraId: u.corredoraId, operacion } },
        create: {
          id: `op${operacion}`,
          corredoraId: u.corredoraId,
          operacion,
          documento: `Promesa de compraventa nº ${numero}`,
          origen: 'asset',
          estado: 'en_firma',
          propiedadIds: [x.prop.id],
          negocioId: x.n.id,
          enviadoPorId: u.sub,
          total: x.firmantes.length,
          firmantes: x.firmantes.map((f) => ({
            nombre: f.nombre,
            rut: f.rut,
            rol: f.rol,
            personaId: f.personaId,
            email: f.email,
            telefono: f.telefono,
            firmo: false,
          })),
          datos: { formato: 'promesa_compraventa', hito: 'promesa', numero, tipoFirma: r.tipoFirma, tramite: r.tramite },
        },
        update: {},
      });
      // la firma de la etapa del negocio: así la revisión de firmas lo sigue y, al firmarse, el negocio avanza solo
      const datos = { ...((x.n.datos as Record<string, unknown>) ?? {}) };
      const firmas = { ...((datos.firmas as Record<string, unknown>) ?? {}) };
      firmas[ETAPA] = {
        operacion,
        estado: 'en_firma',
        firmados: 0,
        total: x.firmantes.length,
        revisado: null,
        error: null,
      };
      await this.db.negocio.update({
        where: { id: x.n.id },
        data: { datos: { ...datos, firmas } as Prisma.InputJsonValue, version: { increment: 1 } },
      });
      const resumen = `Promesa de compraventa nº ${numero} enviada a firmar a ${quienes} (operación ${operacion})`;
      await this.actividad.registrar([
        {
          corredoraId: u.corredoraId,
          entidadTipo: 'negocio' as const,
          entidadId: x.n.id,
          ref2: x.prop.id,
          texto: resumen,
          usuarioId: u.sub,
        },
        {
          corredoraId: u.corredoraId,
          entidadTipo: 'propiedad' as const,
          entidadId: x.prop.id,
          ref2: x.n.id,
          texto: resumen,
          usuarioId: u.sub,
        },
      ]);
    } catch (e) {
      // la promesa ya salió: lo que falle al registrar no debe esconderlo
      this.log.error(`promesa enviada pero sin registrar del todo: ${(e as Error).message}`);
      return {
        ok: true,
        enviada: true,
        operacion,
        numero,
        comprador: x.persona.nombre,
        aviso: 'La promesa se envió, pero no pude registrarla del todo en Asset: ábrela para revisarla.',
      };
    }
    return {
      ok: true,
      enviada: true,
      operacion,
      numero,
      comprador: x.persona.nombre,
      indicacion: `La promesa de compraventa nº ${numero} se envió a firmar (operación ${operacion}) a ${quienes}. Se cobró del saldo de Portalfirma. Cuando firmen todos, el negocio avanza solo.`,
    };
  }
}

const pedidoEsquema = z.object({ negocioId: z.string().trim().min(1).max(80) });

@Controller('promesas-compraventa')
export class PromesaCompraventaController {
  constructor(private readonly s: PromesaCompraventaService) {}

  @Post('vista-previa')
  @HttpCode(200)
  vistaPrevia(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pedidoEsquema)) b: z.infer<typeof pedidoEsquema>) {
    return this.s.vistaPrevia(u, b.negocioId);
  }

  @Post('enviar')
  @HttpCode(200)
  enviar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pedidoEsquema)) b: z.infer<typeof pedidoEsquema>) {
    return this.s.enviar(u, b.negocioId);
  }
}
