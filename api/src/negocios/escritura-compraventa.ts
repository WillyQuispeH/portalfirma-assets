/* eslint-disable @typescript-eslint/no-base-to-string -- los datos guardados en el negocio llegan sin tipo */
// BORRADOR DE ESCRITURA DE COMPRAVENTA de un negocio de VENTA, hecho por Asset: plantilla HTML propia
// (src/documentos/plantillas/escritura-compraventa.html) con las variables del negocio → PDF (Chromium del servidor).
// La escritura pública la otorga siempre una notaría: esto es una MINUTA/borrador para llevar a la notaría y revisar con las
// partes. Enviarlo a firmar con Portalfirma es opcional (solo deja constancia de que las partes aprueban el borrador): el
// corredor puede quedarse solo con el PDF (descargarlo y llevarlo a la notaría).
//  · POST /v1/escrituras-compraventa/vista-previa { negocioId }: el PDF (base64) tal como se enviaría. No envía ni cobra.
//    Devuelve también `faltan`: lo que todavía hay que completar (notaría, inscripción de dominio, banco…).
//  · POST /v1/escrituras-compraventa/enviar { negocioId }: lo envía a firmar al comprador y al/los vendedor(es) (cobra del saldo
//    de Portalfirma) y lo registra: la firma en la propiedad y el negocio, y la firma de la etapa «escritura» del negocio: al
//    firmarse, el paso «Escritura firmada» y el negocio avanzan solos (lo hace la revisión de firmas, src/firmas/ronda.ts).
// Los datos salen del negocio (precio en datos.valor y condiciones de la oferta en datos.oferta; si existe la promesa de
// compraventa, datos.ciclo.promesa, se lee sin exigirla), de las personas (comprador y propietarios) y de la ficha de la
// propiedad. Lo propio de la escritura (notaría, fecha, banco, inscripción, deslindes…) está en datos.ciclo.escritura: la app lo
// guarda ANTES de pedir el PDF y este servicio solo lee lo ya guardado.
import { Body, Controller, HttpCode, Injectable, Logger, Post } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { buscarVisible } from '../comun/asignados';
import { ActividadService } from '../comun/actividad.service';
import { PdfService } from '../documentos/pdf.service';
import { EnvioFirmaService, respuestaEnvio } from '../documentos/envio-firma';
import { llenar } from '../documentos/plantilla';
import { hoy } from '../whatsapp/comun';
import { describir, dominioDe, perfilDe, rutDe, unir } from '../documentos/comparecientes';
import { datosCorredora } from '../documentos/corredora-doc';
import { PlantillasDocService } from '../documentos/plantillas-doc';

const SERIE = 'escritura';
/** la firma del negocio a la que se liga el borrador: la etapa «Escritura» del embudo de venta (al firmarse, el negocio avanza solo) */
const ETAPA = 'escritura';
/** el modelo de la corredora: 20 % de pie y el resto con crédito hipotecario */
const PIE_MODELO = 20;

/** lo propio de la escritura (negocio.datos.ciclo.escritura); todo es opcional y se completa en la ventana de la app */
export interface EscrituraDatos {
  notaria?: string;
  ciudad?: string;
  /** fecha de la escritura (AAAA-MM-DD) */
  fecha?: string;
  /** fecha de la entrega material (AAAA-MM-DD); vacío = en el acto de la escritura */
  entregaFecha?: string;
  /** 'credito' (pie y crédito hipotecario) o 'contado'; vacío = según el pie de la oferta */
  modoPago?: string;
  banco?: string;
  // la inscripción de dominio (si no se escribe, vale la de la ficha de la propiedad)
  fojas?: string;
  numeroInscripcion?: string;
  anioInscripcion?: string;
  conservador?: string;
  deslindes?: string;
  /** lo que viene con el inmueble (estacionamiento, bodega…); vacío = lo que diga la ficha */
  incluye?: string;
  promesaFecha?: string;
  promesaNotaria?: string;
  /** poderes o personería de quienes comparecen representados */
  personerias?: string;
  repVendedor?: string;
  repComprador?: string;
}

const t = (v: unknown) => (v == null ? '' : String(v)).trim();
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const ISO = /^\d{4}-\d{2}-\d{2}/;
const fechaLarga = (f: string) =>
  new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
/** una fecha guardada como AAAA-MM-DD sale «17 de noviembre de 2026»; si es otro texto, tal cual */
const fechaTxt = (v: unknown) => (ISO.test(t(v)) ? fechaLarga(t(v)) : t(v));
const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const monto = (v: number, moneda: string) =>
  moneda === 'UF' ? `UF ${fmt(v)}` : moneda === 'USD' ? `US$ ${fmt(v)}` : `$${fmt(v)}`;
const largo = (v: number, moneda: string) =>
  moneda === 'UF'
    ? `${fmt(v)} Unidades de Fomento`
    : moneda === 'USD'
      ? `${fmt(v)} dólares de los Estados Unidos de América`
      : `$${fmt(v)} (pesos chilenos)`;
const num = (v: unknown, base: number, min = 0, max = 100) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > min && n <= max ? n : base;
};
/** el primer texto que haya bajo alguna de estas claves (la promesa de compraventa la escribe otro módulo: se lee sin exigirle una forma) */
const primero = (o: unknown, claves: string[]) => {
  const d = (o ?? {}) as Record<string, unknown>;
  for (const k of claves) {
    const v = d[k];
    if ((typeof v === 'string' || typeof v === 'number') && t(v)) return t(v);
  }
  return '';
};
const cuenta = (n: unknown, uno: string, varios: string) => {
  const c = Number(n) || 0;
  return c > 0 ? `${c} ${c === 1 ? uno : varios}` : '';
};
/** tipos de propiedad que se venden dentro de un edificio o condominio (con bienes comunes) */
const EN_COPROPIEDAD = new Set(['departamento', 'oficina', 'local_comercial', 'estacionamiento', 'bodega']);

@Injectable()
export class EscrituraCompraventaService {
  private readonly log = new Logger('EscrituraCompraventa');
  constructor(
    private readonly db: PrismaService,
    private readonly plantillasDoc: PlantillasDocService,
    private readonly pdfs: PdfService,
    private readonly envio: EnvioFirmaService,
    private readonly actividad: ActividadService,
  ) {}

  /** valida y junta todo lo que lleva el borrador; { error } si no se puede armar */
  private async armar(u: UsuarioToken, negocioId: string, paraFirma: boolean) {
    const n = await buscarVisible(this.db.negocio, u, negocioId, 'El negocio');
    if (n.tipo !== 'venta') return { error: 'El borrador de escritura de compraventa es solo para negocios de venta.' };
    if (!n.clienteId) return { error: 'El negocio no tiene comprador: vincúlalo en el paso «Interesado registrado».' };
    if (!n.propiedadId) return { error: 'El negocio no tiene propiedad.' };
    const [comprador, prop, usuario, corredora] = await Promise.all([
      this.db.persona.findFirst({ where: { id: n.clienteId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      this.db.propiedad.findFirst({ where: { id: n.propiedadId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      this.db.usuario.findUnique({ where: { id: u.sub } }),
      datosCorredora(this.db, u.corredoraId),
    ]);
    if (!comprador) return { error: 'El comprador del negocio ya no existe.' };
    if (!prop) return { error: 'La propiedad del negocio ya no existe.' };
    if (!usuario) return { error: 'No encontré tu usuario.' };
    const duenos = await this.db.propiedadPersona.findMany({
      where: { propiedadId: prop.id, rol: 'propietario' },
      include: { persona: true },
    });
    if (!duenos.length)
      return { error: 'La propiedad no tiene propietario en su ficha: vincúlalo para armar el borrador de escritura.' };
    // quiénes comparecen: RUT para todos; el correo solo hace falta para enviar a firmar (sin él igual se ve y se descarga el PDF)
    const partes = [{ p: comprador, rol: 'comprador' }, ...duenos.map((d) => ({ p: d.persona, rol: 'vendedor' }))];
    for (const { p, rol } of partes) {
      if (!rutDe(p))
        return { error: `${p.nombre} (${rol}) no tiene RUT en su ficha: agrégalo para armar el borrador.` };
      if (paraFirma && (!p.email || !emailOk(p.email)))
        return { error: `Falta el correo de ${p.nombre} (${rol}): ahí recibe el enlace para firmar.` };
    }

    const datos = (n.datos ?? {}) as {
      valor?: { valor?: number; moneda?: string };
      oferta?: { piePct?: number | string };
      ciclo?: { escritura?: EscrituraDatos; promesa?: unknown };
    };
    const esc = datos.ciclo?.escritura ?? {};
    // el precio: el del negocio (la oferta aceptada); si no hay, el publicado de la propiedad
    const vNegocio = Number(datos.valor?.valor);
    const precio = vNegocio > 0 ? vNegocio : Number(prop.precioVenta) || 0;
    const moneda = vNegocio > 0 ? datos.valor?.moneda || 'UF' : (prop.monedaVenta ?? 'UF');
    if (!(precio > 0)) return { error: 'Falta el precio de la compraventa: escríbelo en las condiciones del negocio.' };

    // la promesa de compraventa (si ya existe): se lee sin exigir una forma
    const prm = datos.ciclo?.promesa as { datos?: unknown } | undefined;
    const pd = prm && typeof prm === 'object' ? (prm.datos && typeof prm.datos === 'object' ? prm.datos : prm) : {};
    const promesaFecha = fechaTxt(
      t(esc.promesaFecha) || primero(pd, ['fecha', 'fechaPromesa', 'fechaFirma', 'firmada']),
    );
    const promesaNotaria = t(esc.promesaNotaria) || primero(pd, ['notaria', 'notariaPromesa']);

    // forma de pago: pie + crédito hipotecario (lo del modelo) o al contado
    const piePct = Math.min(100, num(datos.oferta?.piePct || primero(pd, ['piePct']), PIE_MODELO, 0, 100));
    const credito = esc.modoPago ? esc.modoPago !== 'contado' : piePct < 100;
    const pieValor = credito ? (precio * piePct) / 100 : precio;
    const banco = t(esc.banco);

    // inscripción de dominio: la de esta escritura si se escribió; si no, la de la ficha de la propiedad
    const ficha = { ...((prop.ficha ?? {}) as Record<string, unknown>) };
    const dom = {
      fojas: t(esc.fojas) || t(ficha.fojas),
      numeroInscripcion: t(esc.numeroInscripcion) || t(ficha.numeroInscripcion),
      anioInscripcion: t(esc.anioInscripcion) || t(ficha.anioInscripcion),
      conservador: t(esc.conservador) || t(ficha.conservador),
    };
    const dominioCompleto = !!(dom.fojas && dom.numeroInscripcion && dom.anioInscripcion);

    // lo que todavía hay que completar (no impide ver el PDF; algunas faltas sí impiden enviarlo a firmar)
    const faltan: string[] = [];
    if (!t(esc.notaria)) faltan.push('la notaría');
    if (!t(esc.fecha)) faltan.push('la fecha de la escritura');
    if (!dominioCompleto) faltan.push('la inscripción de dominio (fojas, número y año)');
    if (!dom.conservador) faltan.push('el Conservador de Bienes Raíces');
    if (credito && !banco) faltan.push('el banco del crédito hipotecario');
    if (!prop.rol) faltan.push('el rol de avalúo');
    if (paraFirma) {
      const bloquea = [
        !dominioCompleto && 'la inscripción de dominio (fojas, número y año)',
        credito && !banco && 'el banco del crédito hipotecario',
      ].filter(Boolean);
      if (bloquea.length)
        return { error: `Antes de enviar a firmar completa ${unir(bloquea as string[])} en el borrador.` };
    }

    const ciudad = t(esc.ciudad) || prop.comuna || 'Santiago';
    const incluye =
      t(esc.incluye) ||
      unir(
        [
          cuenta(prop.estacionamientos, 'estacionamiento', 'estacionamientos'),
          cuenta(prop.bodegas, 'bodega', 'bodegas'),
        ].filter(Boolean),
      );
    const lineasDe = (p: (typeof partes)[number]['p']) => ({
      texto: [`RUT ${rutDe(p)}`, perfilDe(p), p.direccion ?? ''].filter(Boolean).join(' · '),
    });
    const firmantes = partes.map(({ p, rol }) => ({
      rut: rutDe(p),
      nombre: p.nombre,
      email: p.email ?? '',
      telefono: p.telefono ?? '',
      alias: rol,
      rol: mayus(rol),
      personaId: p.id,
    }));
    return {
      n,
      prop,
      usuario,
      comprador,
      firmantes,
      faltan,
      vars: (numero: number) => ({
        numero: numero.toLocaleString('es-CL'),
        fechaEmision: fechaLarga(hoy()),
        ciudad,
        corredora,
        corredor: { nombre: usuario.nombre, email: usuario.email, telefono: usuario.telefono ?? '' },
        escritura: {
          notaria: t(esc.notaria) || '[Notaría]',
          fecha: fechaTxt(esc.fecha) || '[fecha]',
          personerias: t(esc.personerias),
        },
        vendedor: {
          nombre: unir(duenos.map((d) => d.persona.nombre)),
          texto: unir(duenos.map((d) => describir(d.persona))),
          rut: unir(duenos.map((d) => rutDe(d.persona))),
          repr: t(esc.repVendedor),
          varios: duenos.length > 1,
          lineas: duenos.map((d) => lineasDe(d.persona)),
        },
        comprador: {
          nombre: comprador.nombre,
          texto: describir(comprador),
          rut: rutDe(comprador),
          repr: t(esc.repComprador),
          lineas: [lineasDe(comprador)],
        },
        propiedad: {
          codigo: prop.codigo,
          tipo: mayus(String(prop.tipo || '').replace(/_/g, ' ')),
          direccion: [prop.direccion, prop.unidad ? `depto. ${prop.unidad}` : ''].filter(Boolean).join(', '),
          comuna: prop.comuna ?? '',
          rol: prop.rol ?? '',
          supTotal:
            prop.supTotal != null && Number(prop.supTotal) > 0
              ? `${Number(prop.supTotal).toLocaleString('es-CL')} m²`
              : '',
          supUtil:
            prop.supUtil != null && Number(prop.supUtil) > 0
              ? `${Number(prop.supUtil).toLocaleString('es-CL')} m²`
              : '',
          incluye,
          deslindes: t(esc.deslindes),
          dominio: dominioDe(dom),
          conservador: dom.conservador
            ? `Conservador de Bienes Raíces de ${dom.conservador}`
            : 'Conservador de Bienes Raíces competente',
          copropiedad: EN_COPROPIEDAD.has(String(prop.tipo)),
        },
        precio: { monto: monto(precio, moneda), largo: largo(precio, moneda), uf: moneda === 'UF' },
        pago: {
          credito,
          contado: !credito,
          modo: credito ? `Pie y crédito hipotecario${banco ? ` (${banco})` : ''}` : 'Al contado',
          piePct: fmt(piePct),
          pie: largo(pieValor, moneda),
          saldoPct: fmt(100 - piePct),
          saldo: largo((precio * (100 - piePct)) / 100, moneda),
          banco: banco || '[institución financiera]',
        },
        promesa: { fecha: promesaFecha, notaria: promesaNotaria },
        entrega: { cuando: esc.entregaFecha ? `el ${fechaTxt(esc.entregaFecha)}` : 'en este acto' },
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

  /** el PDF tal como se enviaría (no envía, no cobra): sirve también para quien solo lo lleva a la notaría */
  async vistaPrevia(u: UsuarioToken, negocioId: string): Promise<Record<string, unknown>> {
    const x = await this.armar(u, negocioId, false);
    if ('error' in x) return { error: x.error };
    const bytes = await this.pdfs.pdf(
      llenar(
        await this.plantillasDoc.html(u.corredoraId, 'escritura-compraventa'),
        x.vars(await this.numeroSiguiente(u.corredoraId)),
      ),
    );
    return {
      ok: true,
      pdf: bytes.toString('base64'),
      archivo: `Borrador de escritura de compraventa ${x.prop.codigo}.pdf`,
      propiedad: x.prop.codigo,
      comprador: x.comprador.nombre,
      firmantes: x.firmantes.map((f) => ({ nombre: f.nombre, rol: f.rol })),
      faltan: x.faltan,
    };
  }

  /** genera el PDF, lo envía a firmar al comprador y a los vendedores y lo registra en la propiedad y el negocio */
  async enviar(u: UsuarioToken, negocioId: string): Promise<Record<string, unknown>> {
    const x = await this.armar(u, negocioId, true);
    if ('error' in x) return { error: x.error };
    const numero = await this.tomarNumero(u.corredoraId);
    const bytes = await this.pdfs.pdf(
      llenar(await this.plantillasDoc.html(u.corredoraId, 'escritura-compraventa'), x.vars(numero)),
    );
    const r = await this.envio.enviar({
      plantilla: 'escritura-compraventa',
      corredoraId: u.corredoraId,
      pagadorRespaldo: x.usuario.email,
      usuarioId: u.sub,
      drive: { tipo: 'Escrituras de compraventa', propiedadId: x.prop.id, negocioId: x.n.id },
      bytes,
      nombreArchivo: `Borrador de escritura de compraventa nº ${numero} - ${x.prop.codigo}.pdf`,
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
          documento: `Borrador de escritura de compraventa nº ${numero}`,
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
          datos: { formato: 'escritura_compraventa', hito: 'escritura', numero, tipoFirma: r.tipoFirma, tramite: r.tramite },
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
      await this.actividad.registrar([
        {
          corredoraId: u.corredoraId,
          entidadTipo: 'negocio' as const,
          entidadId: x.n.id,
          ref2: x.prop.id,
          texto: `Borrador de escritura de compraventa nº ${numero} enviado a firmar a ${quienes} (operación ${operacion})`,
          usuarioId: u.sub,
        },
        {
          corredoraId: u.corredoraId,
          entidadTipo: 'propiedad' as const,
          entidadId: x.prop.id,
          ref2: x.n.id,
          texto: `Borrador de escritura de compraventa nº ${numero} enviado a firmar a ${quienes} (operación ${operacion})`,
          usuarioId: u.sub,
        },
      ]);
    } catch (e) {
      // el borrador ya salió: lo que falle al registrar no debe esconderlo
      this.log.error(`borrador de escritura enviado pero sin registrar del todo: ${(e as Error).message}`);
      return {
        ok: true,
        enviada: true,
        operacion,
        numero,
        aviso: 'El borrador se envió, pero no pude registrarlo del todo en Asset: ábrelo para revisarlo.',
      };
    }
    return {
      ok: true,
      enviada: true,
      operacion,
      numero,
      ...respuestaEnvio(`Borrador de escritura de compraventa nº ${numero}`, r),
      indicacion: `El borrador de escritura de compraventa nº ${numero} se envió a firmar (operación ${operacion}) a ${quienes}. Cuando todos firmen, el paso «Escritura firmada» se completa solo.`,
    };
  }
}

const pedidoEsquema = z.object({ negocioId: z.string().trim().min(1).max(80) });

@Controller('escrituras-compraventa')
export class EscrituraCompraventaController {
  constructor(private readonly s: EscrituraCompraventaService) {}

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
