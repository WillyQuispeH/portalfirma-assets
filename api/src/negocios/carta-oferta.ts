// CARTA OFERTA de un negocio, hecha por Asset: plantilla HTML propia (src/documentos/plantillas/carta-oferta.html) con
// variables que se reemplazan solas → PDF (Chromium del servidor) → Portalfirma lo recibe y lo envía a firmar al oferente
// (el arrendatario o comprador del negocio).
//  · POST /v1/cartas-oferta/vista-previa { negocioId }: el PDF (base64) tal como se enviaría, para verlo antes (no envía).
//  · POST /v1/cartas-oferta/enviar { negocioId }: lo envía a firmar (cobra del saldo de Portalfirma) y lo registra:
//    la firma en la propiedad y el negocio, y la firma de la etapa «Oferta y reserva» del negocio: cuando se firma, el
//    negocio avanza solo (lo hace la revisión de firmas, src/firmas/ronda.ts).
// Los datos salen del negocio (monto, garantía, plazo, vigencia y condiciones de la oferta), de la persona (el oferente) y de
// la ficha de la propiedad. La app los guarda en su origen ANTES de pedir el PDF: este servicio solo lee lo ya guardado.
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

const SERIE = 'carta_oferta';
/** la firma del negocio a la que se liga la carta: en la venta es la etapa «Oferta y reserva» (al firmarse, el negocio avanza solo); en el arriendo es «oferta», que no es una etapa del embudo: firmarla no mueve el negocio (la reserva se paga después) */
const ETAPA_VENTA = 'reserva';
const ETAPA_ARRIENDO = 'oferta';

interface OfertaDatos {
  garantia?: string;
  plazo?: string;
  vigencia?: string | number;
  condiciones?: string;
  // condiciones de la compraventa (si no se escriben, rigen las del modelo de la corredora)
  piePct?: number | string;
  promesaDias?: number | string;
  escrituraDias?: number | string;
  seriedadUF?: number | string;
  comisionPct?: number | string;
}
/** el modelo «Carta oferta y aceptación de compraventa» de la corredora */
const MODELO = { piePct: 20, promesaDias: 7, escrituraDias: 90, seriedadUF: 50, comisionPct: 2, vigenciaDias: 3 };
const num = (v: unknown, base: number, min = 0, max = 100_000) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > min && n <= max ? n : base;
};
const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const largo = (v: number, moneda: string) =>
  moneda === 'UF'
    ? `${fmt(v)} Unidades de Fomento`
    : moneda === 'USD'
      ? `${fmt(v)} dólares de los Estados Unidos de América`
      : `$${fmt(v)} (pesos chilenos)`;

const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const sumarDias = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const monto = (v: number, moneda: string) =>
  moneda === 'UF'
    ? `UF ${v.toLocaleString('es-CL')}`
    : moneda === 'USD'
      ? `US$ ${v.toLocaleString('es-CL')}`
      : `$${v.toLocaleString('es-CL')}`;

@Injectable()
export class CartaOfertaService {
  private readonly log = new Logger('CartaOferta');
  constructor(
    private readonly db: PrismaService,
    private readonly plantillasDoc: PlantillasDocService,
    private readonly pdfs: PdfService,
    private readonly envio: EnvioFirmaService,
    private readonly actividad: ActividadService,
  ) {}

  /** valida y junta todo lo que lleva la carta; { error } si falta algo */
  private async armar(u: UsuarioToken, negocioId: string, conPropietario = false) {
    const n = await buscarVisible(this.db.negocio, u, negocioId, 'El negocio');
    const venta = n.tipo === 'venta';
    const quien = venta ? 'comprador' : 'arrendatario';
    if (!n.clienteId) return { error: `El negocio no tiene ${quien}: vincúlalo en el paso «Interesado registrado».` };
    if (!n.propiedadId) return { error: 'El negocio no tiene propiedad.' };
    const [persona, prop, usuario, corredora] = await Promise.all([
      this.db.persona.findFirst({ where: { id: n.clienteId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      this.db.propiedad.findFirst({ where: { id: n.propiedadId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      this.db.usuario.findUnique({ where: { id: u.sub } }),
      datosCorredora(this.db, u.corredoraId),
    ]);
    if (!persona) return { error: `El ${quien} del negocio ya no existe.` };
    if (!prop) return { error: 'La propiedad del negocio ya no existe.' };
    if (!usuario) return { error: 'No encontré tu usuario.' };
    const rut = persona.rutFormato || persona.rut || '';
    if (!rut) return { error: `${persona.nombre} no tiene RUT en su ficha: agrégalo para enviarle la carta a firmar.` };
    if (!persona.email || !emailOk(persona.email))
      return { error: `Falta el correo de ${persona.nombre}: ahí recibe el enlace para firmar.` };
    const datos = (n.datos ?? {}) as { valor?: { valor?: number; moneda?: string }; oferta?: OfertaDatos };
    const v = Number(datos.valor?.valor);
    if (!v || v <= 0) return { error: 'Falta el monto de la oferta: escríbelo en las condiciones del negocio.' };
    const moneda = datos.valor?.moneda || 'UF';
    const of = datos.oferta ?? {};
    const dias = Math.max(
      1,
      Math.min(120, Number(String(of.vigencia ?? '').replace(/\D/g, '')) || MODELO.vigenciaDias),
    );
    const duenos = await this.db.propiedadPersona.findMany({
      where: { propiedadId: prop.id, rol: 'propietario' },
      include: { persona: true },
    });
    const propietario = unir(duenos.map((d) => d.persona.nombre)) || 'el propietario';
    const piePct = Math.min(100, num(of.piePct, MODELO.piePct));
    const precioLista = venta ? prop.precioVenta : prop.precioArriendo;
    const monedaLista = venta ? prop.monedaVenta : prop.monedaArriendo;
    // quién más firma: el propietario acepta la carta con su firma (opcional: sin esto firma solo el oferente)
    if (conPropietario) {
      if (!duenos.length)
        return { error: 'La propiedad no tiene propietario en su ficha: vincúlalo o envía la carta solo al oferente.' };
      for (const d of duenos) {
        const r = d.persona.rutFormato || d.persona.rut || '';
        if (!r)
          return { error: `${d.persona.nombre} no tiene RUT en su ficha: agrégalo o envía la carta solo al oferente.` };
        if (!d.persona.email || !emailOk(d.persona.email))
          return { error: `Falta el correo de ${d.persona.nombre}: agrégalo o envía la carta solo al oferente.` };
      }
    }
    const firmantes = [
      {
        rut,
        nombre: persona.nombre,
        email: persona.email,
        telefono: persona.telefono ?? '',
        alias: venta ? 'comprador' : 'arrendatario',
        rol: venta ? 'Comprador' : 'Arrendatario',
        personaId: persona.id,
      },
      ...(conPropietario
        ? duenos.map((d) => ({
            rut: d.persona.rutFormato || d.persona.rut || '',
            nombre: d.persona.nombre,
            email: d.persona.email ?? '',
            telefono: d.persona.telefono ?? '',
            alias: venta ? 'vendedor' : 'arrendador',
            rol: venta ? 'Vendedor' : 'Arrendador',
            personaId: d.persona.id,
          }))
        : []),
    ];
    return {
      n,
      firmantes,
      persona: { id: persona.id, nombre: persona.nombre, rut, email: persona.email, telefono: persona.telefono ?? '' },
      prop,
      usuario,
      venta,
      dias,
      vars: (numero: number) => ({
        numero: numero.toLocaleString('es-CL'),
        fechaEmision: fechaLarga(hoy()),
        ciudad: prop.comuna || 'Santiago',
        operacionVerbo: venta ? 'comprar' : 'arrendar',
        operacionTxt: venta ? 'Venta' : 'Arriendo',
        contrato: venta ? 'compraventa' : 'arrendamiento',
        esVenta: venta,
        esArriendo: !venta,
        rol: venta
          ? { oferente: 'Comprador', contraparte: 'Vendedor' }
          : { oferente: 'Arrendatario', contraparte: 'Arrendador' },
        corredora,
        corredor: { nombre: usuario.nombre, email: usuario.email, telefono: usuario.telefono ?? '' },
        oferente: {
          nombre: persona.nombre,
          rut,
          email: persona.email,
          telefono: persona.telefono ?? '',
          calidad: quien,
          perfil: perfilDe(persona),
          domicilio: persona.direccion ?? '',
        },
        contraparte: {
          nombre: propietario,
          firma: propietario,
          texto: duenos.length ? unir(duenos.map((d) => describir(d.persona))) : propietario,
        },
        propietario,
        propiedad: {
          codigo: prop.codigo,
          tipo: mayus(String(prop.tipo || '').replace(/_/g, ' ')),
          direccion: [prop.direccion, prop.unidad ? `depto. ${prop.unidad}` : '', prop.comuna, prop.region]
            .filter(Boolean)
            .join(', '),
          precioLista: precioLista && Number(precioLista) ? monto(Number(precioLista), monedaLista ?? 'UF') : '',
          rol: prop.rol ?? '',
          dominio: dominioDe(prop.ficha),
        },
        oferta: {
          monto: monto(v, moneda),
          montoLargo: largo(v, moneda),
          garantia: String(of.garantia ?? '').trim(),
          plazo: String(of.plazo ?? '').trim(),
          vigencia: `${dias} día${dias === 1 ? '' : 's'}`,
          vence: fechaLarga(sumarDias(hoy(), dias)),
          condiciones: String(of.condiciones ?? '').trim(),
        },
        venta: {
          piePct: fmt(piePct),
          pie: largo((v * piePct) / 100, moneda),
          saldoPct: fmt(100 - piePct),
          saldo: largo((v * (100 - piePct)) / 100, moneda),
          promesaDias: String(num(of.promesaDias, MODELO.promesaDias)),
          escrituraDias: String(num(of.escrituraDias, MODELO.escrituraDias)),
          seriedad: largo(num(of.seriedadUF, MODELO.seriedadUF), 'UF'),
          comisionPct: fmt(num(of.comisionPct, MODELO.comisionPct, 0, 20)),
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

  /** el PDF tal como se enviaría, para que el corredor lo vea antes de decidir (no envía, no cobra) */
  async vistaPrevia(u: UsuarioToken, negocioId: string): Promise<Record<string, unknown>> {
    const x = await this.armar(u, negocioId);
    if ('error' in x) return { error: x.error };
    const bytes = await this.pdfs.pdf(
      llenar(
        await this.plantillasDoc.html(u.corredoraId, 'carta-oferta'),
        x.vars(await this.numeroSiguiente(u.corredoraId)),
      ),
    );
    return {
      ok: true,
      pdf: bytes.toString('base64'),
      archivo: `Carta oferta ${x.prop.codigo} - ${x.persona.nombre}.pdf`,
      oferente: x.persona.nombre,
      propiedad: x.prop.codigo,
    };
  }

  /** genera el PDF, lo envía a firmar (cobra del saldo de Portalfirma) y lo registra */
  async enviar(u: UsuarioToken, negocioId: string, conPropietario = false): Promise<Record<string, unknown>> {
    const x = await this.armar(u, negocioId, conPropietario);
    if ('error' in x) return { error: x.error };
    const numero = await this.tomarNumero(u.corredoraId);
    const bytes = await this.pdfs.pdf(
      llenar(await this.plantillasDoc.html(u.corredoraId, 'carta-oferta'), x.vars(numero)),
    );
    const r = await this.envio.enviar({
      corredoraId: u.corredoraId,
      pagadorRespaldo: x.usuario.email,
      usuarioId: u.sub,
      drive: { tipo: 'Cartas oferta', propiedadId: x.prop.id, negocioId: x.n.id },
      bytes,
      nombreArchivo: `Carta oferta nº ${numero} - ${x.prop.codigo}.pdf`,
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
    try {
      await this.db.firma.upsert({
        where: { corredoraId_operacion: { corredoraId: u.corredoraId, operacion } },
        create: {
          id: `op${operacion}`,
          corredoraId: u.corredoraId,
          operacion,
          documento: `Carta oferta nº ${numero}`,
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
          })) as Prisma.InputJsonValue,
          datos: { formato: 'carta_oferta', hito: 'carta', numero, tipoFirma: 'simple', tramite: 'none' },
        },
        update: {},
      });
      // la firma de la etapa del negocio: así la revisión de firmas lo sigue y, al firmarse, el negocio avanza solo
      const datos = { ...((x.n.datos as Record<string, unknown>) ?? {}) };
      const firmas = { ...((datos.firmas as Record<string, unknown>) ?? {}) };
      firmas[x.venta ? ETAPA_VENTA : ETAPA_ARRIENDO] = {
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
      await this.actividad.registrar([
        {
          corredoraId: u.corredoraId,
          entidadTipo: 'negocio' as const,
          entidadId: x.n.id,
          ref2: x.prop.id,
          texto: `Carta oferta nº ${numero} enviada a firmar a ${x.persona.nombre} (operación ${operacion})`,
          usuarioId: u.sub,
        },
        {
          corredoraId: u.corredoraId,
          entidadTipo: 'propiedad' as const,
          entidadId: x.prop.id,
          ref2: x.n.id,
          texto: `Carta oferta nº ${numero} enviada a firmar a ${x.persona.nombre} (operación ${operacion})`,
          usuarioId: u.sub,
        },
      ]);
    } catch (e) {
      // la carta ya salió: lo que falle al registrar no debe esconderlo
      this.log.error(`carta oferta enviada pero sin registrar del todo: ${(e as Error).message}`);
      return {
        ok: true,
        enviada: true,
        operacion,
        numero,
        oferente: x.persona.nombre,
        aviso: 'La carta se envió, pero no pude registrarla del todo en Asset: ábrelo para revisarla.',
      };
    }
    return {
      ok: true,
      enviada: true,
      operacion,
      numero,
      oferente: x.persona.nombre,
      correo: x.persona.email,
      indicacion: `La carta oferta nº ${numero} se envió a firmar (operación ${operacion}): ${x.persona.nombre} recibe el enlace para firmar en ${x.persona.email}. Se cobró del saldo de Portalfirma. Cuando firme, el negocio avanza solo.`,
    };
  }
}

const pedidoEsquema = z.object({
  negocioId: z.string().trim().min(1).max(80),
  /** también firma el propietario (acepta la carta). Opcional: por defecto firma solo el oferente */
  conPropietario: z.boolean().optional(),
});

@Controller('cartas-oferta')
export class CartaOfertaController {
  constructor(private readonly s: CartaOfertaService) {}

  @Post('vista-previa')
  @HttpCode(200)
  vistaPrevia(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pedidoEsquema)) b: z.infer<typeof pedidoEsquema>) {
    return this.s.vistaPrevia(u, b.negocioId);
  }

  @Post('enviar')
  @HttpCode(200)
  enviar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pedidoEsquema)) b: z.infer<typeof pedidoEsquema>) {
    return this.s.enviar(u, b.negocioId, b.conPropietario === true);
  }
}
