// ACTA DE ENTREGA E INVENTARIO de un arriendo, hecha por Asset: plantilla HTML propia (src/documentos/plantillas/acta-entrega.html) → PDF →
// Portalfirma la envía a firmar al arrendatario y a los propietarios (firman ambas partes). La firma se liga a «entrega_acta», que NO es una
// etapa del embudo: al firmarse la propiedad queda «Arrendada» (lo hace la app con el aviso), pero el negocio sigue abierto hasta cobrar la comisión.
//  · POST /v1/actas-entrega/vista-previa { negocioId }: el PDF (base64) tal como se enviaría (no envía).
//  · POST /v1/actas-entrega/enviar { negocioId }: la envía a firmar y la registra.
// Los datos salen de lo ya guardado en el negocio (ciclo.entrega: ver el modelo en acta-entrega-datos.ts). Las fotos de cada
// espacio están en R2 (colección «archivos_negocio» del negocio): al armar el PDF se bajan, se achican y entran incrustadas.
import { Body, Controller, HttpCode, Injectable, Logger, Post } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { z } from 'zod';
import { RegistrosService } from '../registros/registros';
import { faltaEnEntrega, fotosParaPdf, varsActaEntrega, type EntregaDatos } from './acta-entrega-datos';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { buscarVisible } from '../comun/asignados';
import { ActividadService } from '../comun/actividad.service';
import { PdfService } from '../documentos/pdf.service';
import { EnvioFirmaService, type FirmanteEnvio } from '../documentos/envio-firma';
import { llenar } from '../documentos/plantilla';
import { hoy } from '../whatsapp/comun';
import { datosCorredora } from '../documentos/corredora-doc';
import { PlantillasDocService } from '../documentos/plantillas-doc';

const SERIE = 'acta_entrega';
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
/** fotos ya achicadas (clave de R2 → data URL): al guardar y volver a ver el PDF no se bajan otra vez */
const CACHE_FOTOS = new Map<string, string>();
const CACHE_MAX = 300;

type Firmante = FirmanteEnvio & { rol: string; personaId?: string };

@Injectable()
export class ActaEntregaService {
  private readonly log = new Logger('ActaEntrega');
  constructor(
    private readonly db: PrismaService,
    private readonly plantillasDoc: PlantillasDocService,
    private readonly pdfs: PdfService,
    private readonly envio: EnvioFirmaService,
    private readonly actividad: ActividadService,
    private readonly registros: RegistrosService,
  ) {}

  /** las fotos del inventario como imágenes incrustadas (achicadas: el PDF debe pesar poco). Las que fallan no salen. */
  private async imagenes(u: UsuarioToken, negocioId: string, claves: string[]) {
    const out = new Map<string, string>();
    const pendientes = claves.filter((c) => {
      const v = CACHE_FOTOS.get(c);
      if (v) out.set(c, v);
      return !v;
    });
    for (let i = 0; i < pendientes.length; i += 6) {
      await Promise.all(
        pendientes.slice(i, i + 6).map(async (clave) => {
          try {
            const bytes = await this.registros.archivoBytes(u, 'archivos_negocio', negocioId, clave);
            const jpg = await sharp(bytes)
              .rotate()
              .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 70 })
              .toBuffer();
            const url = `data:image/jpeg;base64,${jpg.toString('base64')}`;
            out.set(clave, url);
            if (CACHE_FOTOS.size >= CACHE_MAX) CACHE_FOTOS.delete(CACHE_FOTOS.keys().next().value as string);
            CACHE_FOTOS.set(clave, url);
          } catch (e) {
            this.log.warn(`foto del acta ${clave.slice(-40)}: ${(e as Error).message}`);
          }
        }),
      );
    }
    return out;
  }

  private async armar(u: UsuarioToken, negocioId: string) {
    const n = await buscarVisible(this.db.negocio, u, negocioId, 'El negocio');
    if (n.tipo !== 'arriendo') return { error: 'El acta de entrega es solo para negocios de arriendo.' };
    if (!n.clienteId) return { error: 'El negocio no tiene arrendatario.' };
    if (!n.propiedadId) return { error: 'El negocio no tiene propiedad.' };
    const [arr, prop, usuario, corredora, duenos] = await Promise.all([
      this.db.persona.findFirst({ where: { id: n.clienteId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      this.db.propiedad.findFirst({ where: { id: n.propiedadId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      this.db.usuario.findUnique({ where: { id: u.sub } }),
      datosCorredora(this.db, u.corredoraId),
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
        ? `${nombre} no tiene RUT en su ficha: agrégalo para enviarle el acta a firmar.`
        : !email || !emailOk(email)
          ? `Falta el correo de ${nombre}: ahí recibe el enlace para firmar.`
          : '';
    if (!duenos.length) return { error: 'La propiedad no tiene propietario en su ficha: vincúlalo para poder firmar.' };
    for (const p of [...duenos.map((d) => d.persona), arr]) {
      const e = falta(p.nombre, rutDe(p), p.email);
      if (e) return { error: e };
    }
    const ciclo = ((n.datos ?? {}) as { ciclo?: { entrega?: EntregaDatos } }).ciclo ?? {};
    const k = ciclo.entrega ?? {};
    const faltaDato = faltaEnEntrega(k);
    if (faltaDato) return { error: faltaDato };
    const imagenes = await this.imagenes(u, n.id, fotosParaPdf(k));
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
    ];
    return {
      n,
      prop,
      usuario,
      firmantes,
      vars: (numero: number) =>
        varsActaEntrega({
          numero,
          hoy: hoy(),
          corredora,
          duenos: duenos.map((d) => ({ nombre: d.persona.nombre, rut: rutDe(d.persona) })),
          arrendatario: { nombre: arr.nombre, rut: rutDe(arr) },
          propiedad: prop,
          usuario: { nombre: usuario.nombre },
          entrega: k,
          imagenes,
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
      llenar(
        await this.plantillasDoc.html(u.corredoraId, 'acta-entrega'),
        x.vars(await this.numeroSiguiente(u.corredoraId)),
      ),
    );
    return {
      ok: true,
      pdf: bytes.toString('base64'),
      archivo: `Acta de entrega ${x.prop.codigo}.pdf`,
      firmantes: x.firmantes.map((f) => ({ nombre: f.fullName, rol: f.rol })),
    };
  }

  async enviar(u: UsuarioToken, negocioId: string): Promise<Record<string, unknown>> {
    const x = await this.armar(u, negocioId);
    if ('error' in x) return { error: x.error };
    const numero = await this.tomarNumero(u.corredoraId);
    const bytes = await this.pdfs.pdf(
      llenar(await this.plantillasDoc.html(u.corredoraId, 'acta-entrega'), x.vars(numero)),
    );
    const r = await this.envio.enviar({
      plantilla: 'acta-entrega',
      corredoraId: u.corredoraId,
      pagadorRespaldo: x.usuario.email,
      usuarioId: u.sub,
      drive: { tipo: 'Actas de entrega', propiedadId: x.prop.id, negocioId: x.n.id },
      bytes,
      nombreArchivo: `Acta de entrega nº ${numero} - ${x.prop.codigo}.pdf`,
      firmantes: x.firmantes.map((f) => ({
        rut: f.rut,
        fullName: f.fullName,
        email: f.email,
        phone: f.phone,
        alias: f.alias,
        typeSign: 'simple' as const,
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
          documento: `Acta de entrega e inventario nº ${numero}`,
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
          datos: { formato: 'acta_entrega', hito: 'entrega', numero, tipoFirma: r.tipoFirma, tramite: r.tramite },
        },
        update: {},
      });
      const datos = { ...((x.n.datos as Record<string, unknown>) ?? {}) };
      const firmas = { ...((datos.firmas as Record<string, unknown>) ?? {}) };
      firmas.entrega_acta = { operacion, estado: 'en_firma', firmados: 0, total, revisado: null, error: null };
      await this.db.negocio.update({
        where: { id: x.n.id },
        data: { datos: { ...datos, firmas } as Prisma.InputJsonValue, version: { increment: 1 } },
      });
      const texto = `Acta de entrega nº ${numero} enviada a firmar a ${total} personas (operación ${operacion})`;
      await this.actividad.registrar([
        {
          corredoraId: u.corredoraId,
          entidadTipo: 'negocio' as const,
          entidadId: x.n.id,
          ref2: x.prop.id,
          texto,
          usuarioId: u.sub,
        },
        {
          corredoraId: u.corredoraId,
          entidadTipo: 'propiedad' as const,
          entidadId: x.prop.id,
          ref2: x.n.id,
          texto,
          usuarioId: u.sub,
        },
      ]);
    } catch (e) {
      this.log.error(`acta de entrega enviada pero sin registrar del todo: ${(e as Error).message}`);
      return {
        ok: true,
        enviada: true,
        operacion,
        numero,
        aviso: 'El acta se envió, pero no pude registrarla del todo en Asset: ábrela para revisarla.',
      };
    }
    return {
      ok: true,
      enviada: true,
      operacion,
      numero,
      indicacion: `El acta de entrega nº ${numero} se envió a firmar (operación ${operacion}) al arrendatario y a los propietarios. Se cobró del saldo de Portalfirma. Cuando firmen, la propiedad queda arrendada.`,
    };
  }
}

const pedidoEsquema = z.object({ negocioId: z.string().trim().min(1).max(80) });

@Controller('actas-entrega')
export class ActaEntregaController {
  constructor(private readonly s: ActaEntregaService) {}

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
