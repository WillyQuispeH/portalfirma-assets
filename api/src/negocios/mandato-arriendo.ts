// MANDATO DE GESTIÓN DE ARRIENDO de una propiedad, hecho por Asset: plantilla HTML propia
// (src/documentos/plantillas/mandato-arriendo.html) con las variables de la ficha → PDF (Chromium del servidor).
//  · POST /v1/mandatos-arriendo/vista-previa { propiedadId }: el PDF (base64) tal como se firmaría. No envía ni cobra.
//    La firma NO es obligatoria: el corredor puede quedarse solo con el PDF (descargarlo, imprimirlo y firmarlo aparte).
//  · POST /v1/mandatos-arriendo/enviar { propiedadId }: lo envía a firmar al/los propietario(s) con Portalfirma (cobra del
//    saldo) y lo registra en la propiedad: el paso «Mandato firmado» de la captación lo sigue y se completa al firmarse.
// Los datos salen de la ficha: el propietario (persona vinculada), el inmueble, el canon, y de ficha.* la publicación en
// portales, la exclusividad, las mascotas y los meses de garantía. Los datos de la corredora (representante, RUT,
// domicilio, logo) salen de documentos/corredora-doc.ts.
import { Body, Controller, HttpCode, Injectable, Logger, Post } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ActividadService } from '../comun/actividad.service';
import { PdfService } from '../documentos/pdf.service';
import { EnvioFirmaService, respuestaEnvio } from '../documentos/envio-firma';
import { llenar } from '../documentos/plantilla';
import { describir, unir } from '../documentos/comparecientes';
import { hoy } from '../whatsapp/comun';
import { datosCorredora } from '../documentos/corredora-doc';
import { PlantillasDocService } from '../documentos/plantillas-doc';

const SERIE = 'mandato_arriendo';
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const monto = (v: number, m: string) =>
  m === 'UF'
    ? `UF ${v.toLocaleString('es-CL')}`
    : m === 'USD'
      ? `US$ ${v.toLocaleString('es-CL')}`
      : `$${v.toLocaleString('es-CL')}`;
const m2 = (v: unknown) => (v != null && Number(v) > 0 ? `${Number(v).toLocaleString('es-CL')} m²` : '');
/** un campo sí/no de la ficha: si no se dijo nada, vale el valor por defecto */
const sino = (v: unknown, base: boolean) =>
  v === true || v === 'true' || v === 'si' || v === 'sí'
    ? true
    : v === false || v === 'false' || v === 'no'
      ? false
      : base;

@Injectable()
export class MandatoArriendoService {
  private readonly log = new Logger('MandatoArriendo');
  constructor(
    private readonly db: PrismaService,
    private readonly plantillasDoc: PlantillasDocService,
    private readonly pdfs: PdfService,
    private readonly envio: EnvioFirmaService,
    private readonly actividad: ActividadService,
  ) {}

  /** valida y junta todo lo que lleva el mandato; { error } si falta algo */
  private async armar(u: UsuarioToken, propiedadId: string, paraFirma: boolean) {
    const [prop, usuario, corredora] = await Promise.all([
      this.db.propiedad.findFirst({ where: { id: propiedadId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      this.db.usuario.findUnique({ where: { id: u.sub } }),
      datosCorredora(this.db, u.corredoraId),
    ]);
    if (!prop) return { error: 'No encontré la propiedad.' };
    if (!usuario) return { error: 'No encontré tu usuario.' };
    if (!prop.arriendo) return { error: 'El mandato de arriendo es solo para propiedades que se arriendan.' };
    const duenos = await this.db.propiedadPersona.findMany({
      where: { propiedadId: prop.id, rol: 'propietario' },
      include: { persona: true },
    });
    if (!duenos.length)
      return { error: 'La propiedad no tiene propietario en su ficha: vincúlalo para armar el mandato.' };
    for (const d of duenos) {
      const rut = d.persona.rutFormato || d.persona.rut || '';
      if (!rut) return { error: `${d.persona.nombre} no tiene RUT en su ficha: agrégalo para armar el mandato.` };
      // el correo solo es indispensable para enviar a firmar: sin él igual se puede ver y descargar el PDF
      if (paraFirma && (!d.persona.email || !emailOk(d.persona.email)))
        return { error: `Falta el correo de ${d.persona.nombre}: ahí recibe el enlace para firmar.` };
    }
    const f = (prop.ficha ?? {}) as Record<string, unknown>;
    const canon = Number(prop.precioArriendo) || 0;
    const garantia = Number(f.mesesGarantia);
    const mascotas = f.mascotas;
    return {
      prop,
      usuario,
      firmantes: duenos.map((d) => ({
        rut: d.persona.rutFormato || d.persona.rut || '',
        nombre: d.persona.nombre,
        email: d.persona.email ?? '',
        telefono: d.persona.telefono ?? '',
        personaId: d.persona.id,
      })),
      vars: (numero: number) => ({
        numero: numero.toLocaleString('es-CL'),
        fechaEmision: fechaLarga(hoy()),
        ciudad: prop.comuna || 'Santiago',
        corredora,
        corredor: { nombre: usuario.nombre, email: usuario.email, telefono: usuario.telefono ?? '' },
        mandante: {
          nombre: unir(duenos.map((d) => d.persona.nombre)),
          texto: unir(duenos.map((d) => describir(d.persona))),
          rut: unir(duenos.map((d) => d.persona.rutFormato || d.persona.rut || '')),
          email: unir(duenos.map((d) => d.persona.email ?? '')),
          telefono: unir(duenos.map((d) => d.persona.telefono ?? '')),
        },
        propiedad: {
          codigo: prop.codigo,
          tipo: mayus(String(prop.tipo || '').replace(/_/g, ' ')),
          direccion: [prop.direccion, prop.unidad ? `depto. ${prop.unidad}` : ''].filter(Boolean).join(', '),
          comuna: prop.comuna ?? '',
          supTotal: m2(prop.supTotal),
          supUtil: m2(prop.supUtil),
          rol: prop.rol ?? '',
          canon: canon ? monto(canon, prop.monedaArriendo ?? 'UF') : '',
        },
        publicar: { si: sino(f.publicarPortales, true), no: !sino(f.publicarPortales, true) },
        exclusividad: { si: sino(f.exclusividad, false), no: !sino(f.exclusividad, false) },
        condiciones: {
          mascotas:
            mascotas === undefined || mascotas === null || mascotas === '' ? '' : sino(mascotas, false) ? 'Sí' : 'No',
          garantiaMeses: Number.isFinite(garantia) && garantia > 0 ? String(garantia) : '',
          otras: String(f.condicionesMandato ?? '').trim(),
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

  /** el PDF tal como se firmaría (no envía, no cobra): sirve también para quien no quiere firmar en Asset */
  async vistaPrevia(u: UsuarioToken, propiedadId: string): Promise<Record<string, unknown>> {
    const x = await this.armar(u, propiedadId, false);
    if ('error' in x) return { error: x.error };
    const bytes = await this.pdfs.pdf(
      llenar(
        await this.plantillasDoc.html(u.corredoraId, 'mandato-arriendo'),
        x.vars(await this.numeroSiguiente(u.corredoraId)),
      ),
    );
    return {
      ok: true,
      pdf: bytes.toString('base64'),
      archivo: `Mandato de arriendo ${x.prop.codigo}.pdf`,
      propiedad: x.prop.codigo,
      propietarios: x.firmantes.map((p) => p.nombre),
      firmantes: x.firmantes.map((p) => ({ nombre: p.nombre, rol: 'Mandante' })),
    };
  }

  /** genera el PDF, lo envía a firmar al/los propietario(s) y lo registra en la propiedad */
  async enviar(u: UsuarioToken, propiedadId: string): Promise<Record<string, unknown>> {
    const x = await this.armar(u, propiedadId, true);
    if ('error' in x) return { error: x.error };
    const numero = await this.tomarNumero(u.corredoraId);
    const bytes = await this.pdfs.pdf(
      llenar(await this.plantillasDoc.html(u.corredoraId, 'mandato-arriendo'), x.vars(numero)),
    );
    const r = await this.envio.enviar({
      plantilla: 'mandato-arriendo',
      corredoraId: u.corredoraId,
      pagadorRespaldo: x.usuario.email,
      usuarioId: u.sub,
      drive: { tipo: 'Mandatos de arriendo', propiedadId: x.prop.id },
      bytes,
      nombreArchivo: `Mandato de arriendo nº ${numero} - ${x.prop.codigo}.pdf`,
      firmantes: x.firmantes.map((f) => ({
        rut: f.rut,
        fullName: f.nombre,
        email: f.email,
        phone: f.telefono || undefined,
        alias: 'mandante',
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
          documento: `Mandato de arriendo nº ${numero}`,
          origen: 'asset',
          estado: 'en_firma',
          propiedadIds: [x.prop.id],
          enviadoPorId: u.sub,
          total: x.firmantes.length,
          firmantes: x.firmantes.map((f) => ({
            nombre: f.nombre,
            rut: f.rut,
            rol: 'Mandante',
            personaId: f.personaId,
            email: f.email,
            telefono: f.telefono,
            firmo: false,
          })) as Prisma.InputJsonValue,
          datos: { formato: 'mandato_arriendo', hito: 'mandato', numero, tipoFirma: r.tipoFirma, tramite: r.tramite },
        },
        update: {},
      });
      await this.actividad.registrar([
        {
          corredoraId: u.corredoraId,
          entidadTipo: 'propiedad' as const,
          entidadId: x.prop.id,
          texto: `Mandato de arriendo nº ${numero} enviado a firmar a ${unir(x.firmantes.map((f) => f.nombre))} (operación ${operacion})`,
          usuarioId: u.sub,
        },
      ]);
    } catch (e) {
      // el mandato ya salió: lo que falle al registrar no debe esconderlo
      this.log.error(`mandato enviado pero sin registrar del todo: ${(e as Error).message}`);
      return {
        ok: true,
        enviada: true,
        operacion,
        numero,
        aviso: 'El mandato se envió, pero no pude registrarlo del todo en Asset: ábrelo para revisarlo.',
      };
    }
    return {
      ok: true,
      enviada: true,
      operacion,
      numero,
      ...respuestaEnvio(`Mandato de arriendo nº ${numero}`, r),
      indicacion: `El mandato de arriendo nº ${numero} se envió a firmar (operación ${operacion}) a ${unir(x.firmantes.map((f) => f.nombre))}.`,
    };
  }
}

const pedidoEsquema = z.object({ propiedadId: z.string().trim().min(1).max(80) });

@Controller('mandatos-arriendo')
export class MandatoArriendoController {
  constructor(private readonly s: MandatoArriendoService) {}

  @Post('vista-previa')
  @HttpCode(200)
  vistaPrevia(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pedidoEsquema)) b: z.infer<typeof pedidoEsquema>) {
    return this.s.vistaPrevia(u, b.propiedadId);
  }

  @Post('enviar')
  @HttpCode(200)
  enviar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(pedidoEsquema)) b: z.infer<typeof pedidoEsquema>) {
    return this.s.enviar(u, b.propiedadId);
  }
}
