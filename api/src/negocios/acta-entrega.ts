// ACTA DE ENTREGA E INVENTARIO de un arriendo, hecha por Asset: plantilla HTML propia (src/documentos/plantillas/acta-entrega.html) → PDF →
// Portalfirma la envía a firmar al arrendatario y a los propietarios (firman ambas partes). La firma se liga a «entrega_acta», que NO es una
// etapa del embudo: al firmarse la propiedad queda «Arrendada» (lo hace la app con el aviso), pero el negocio sigue abierto hasta cobrar la comisión.
//  · POST /v1/actas-entrega/vista-previa { negocioId }: el PDF (base64) tal como se enviaría (no envía).
//  · POST /v1/actas-entrega/enviar { negocioId }: la envía a firmar y la registra.
// Los datos salen de lo ya guardado en el negocio (ciclo.entrega: fecha, llaves, medidores, inventario, observaciones).
import { Body, Controller, HttpCode, Injectable, Logger, Post } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { buscarVisible } from '../comun/asignados';
import { ActividadService } from '../comun/actividad.service';
import { PdfService } from '../documentos/pdf.service';
import { EnvioFirmaService, type FirmanteEnvio } from '../documentos/envio-firma';
import { cargarPlantilla, llenar } from '../documentos/plantilla';
import { hoy } from '../whatsapp/comun';

const SERIE = 'acta_entrega';
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const ESTADO: Record<string, string> = { bueno: 'Bueno', regular: 'Regular', malo: 'Malo', na: 'No aplica' };
const MEDIDOR: [string, string][] = [['luz', 'Electricidad'], ['agua', 'Agua'], ['gas', 'Gas']];

interface EntregaDatos {
  fecha?: string;
  llaves?: string;
  observaciones?: string;
  medidores?: Record<string, { numero?: string; lectura?: string }>;
  inventario?: { espacio?: string; estado?: string; nota?: string }[];
}

type Firmante = FirmanteEnvio & { rol: string; personaId?: string };

@Injectable()
export class ActaEntregaService {
  private readonly log = new Logger('ActaEntrega');
  constructor(
    private readonly db: PrismaService,
    private readonly pdfs: PdfService,
    private readonly envio: EnvioFirmaService,
    private readonly actividad: ActividadService,
  ) {}

  private async armar(u: UsuarioToken, negocioId: string) {
    const n = await buscarVisible(this.db.negocio, u, negocioId, 'El negocio');
    if (n.tipo !== 'arriendo') return { error: 'El acta de entrega es solo para negocios de arriendo.' };
    if (!n.clienteId) return { error: 'El negocio no tiene arrendatario.' };
    if (!n.propiedadId) return { error: 'El negocio no tiene propiedad.' };
    const [arr, prop, usuario, corredora, duenos] = await Promise.all([
      this.db.persona.findFirst({ where: { id: n.clienteId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      this.db.propiedad.findFirst({ where: { id: n.propiedadId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      this.db.usuario.findUnique({ where: { id: u.sub } }),
      this.db.corredora.findUnique({ where: { id: u.corredoraId }, select: { nombre: true } }),
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
    if (!k.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(k.fecha)) return { error: 'Falta la fecha de entrega.' };
    const fecha = k.fecha;
    const inventario = (k.inventario ?? []).filter((i) => String(i.espacio ?? '').trim());
    if (!inventario.length) return { error: 'El inventario está vacío: agrega al menos un espacio o ítem.' };
    const medidores = MEDIDOR.flatMap(([id, nombre]) => {
      const m = k.medidores?.[id];
      return m && (m.numero || m.lectura) ? [{ nombre, numero: String(m.numero ?? '').trim() || '—', lectura: String(m.lectura ?? '').trim() || '—' }] : [];
    });
    const firmantes: Firmante[] = [
      ...duenos.map((d) => ({
        rut: rutDe(d.persona), fullName: d.persona.nombre, email: d.persona.email ?? '', phone: d.persona.telefono || undefined,
        alias: 'arrendador', rol: 'Arrendador', personaId: d.persona.id,
      })),
      { rut: rutDe(arr), fullName: arr.nombre, email: arr.email ?? '', phone: arr.telefono || undefined, alias: 'arrendatario', rol: 'Arrendatario', personaId: arr.id },
    ];
    return {
      n,
      prop,
      usuario,
      firmantes,
      vars: (numero: number) => ({
        numero: numero.toLocaleString('es-CL'),
        fechaEmision: fechaLarga(hoy()),
        fechaEntrega: fechaLarga(fecha),
        corredora: { nombre: corredora?.nombre ?? 'la corredora' },
        arrendador: duenos.map((d) => `${d.persona.nombre}, RUT ${rutDe(d.persona)}`).join(', y '),
        arrendatario: { nombre: arr.nombre, rut: rutDe(arr) },
        propiedad: {
          codigo: prop.codigo,
          tipo: mayus(String(prop.tipo || '').replace(/_/g, ' ')),
          direccion: [prop.direccion, prop.unidad ? `depto. ${prop.unidad}` : '', prop.comuna].filter(Boolean).join(', '),
        },
        llaves: String(k.llaves ?? '').trim() || 'No se registró la cantidad de llaves entregadas.',
        hayMedidores: medidores.length > 0,
        medidores,
        inventario: inventario.map((i) => ({
          espacio: String(i.espacio).trim(),
          estado: ESTADO[String(i.estado ?? '')] ?? 'Bueno',
          nota: String(i.nota ?? '').trim(),
        })),
        observaciones: String(k.observaciones ?? '').trim(),
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
      llenar(cargarPlantilla('acta-entrega'), x.vars(await this.numeroSiguiente(u.corredoraId))),
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
    const bytes = await this.pdfs.pdf(llenar(cargarPlantilla('acta-entrega'), x.vars(numero)));
    const r = await this.envio.enviar({
      corredoraId: u.corredoraId,
      pagadorRespaldo: x.usuario.email,
      bytes,
      nombreArchivo: `Acta de entrega nº ${numero} - ${x.prop.codigo}.pdf`,
      firmantes: x.firmantes.map((f) => ({
        rut: f.rut, fullName: f.fullName, email: f.email, phone: f.phone, alias: f.alias, typeSign: 'simple' as const,
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
            nombre: f.fullName, rut: f.rut, rol: f.rol, personaId: f.personaId, email: f.email, telefono: f.phone ?? '', firmo: false,
          })) as Prisma.InputJsonValue,
          datos: { formato: 'acta_entrega', hito: 'entrega', numero, tipoFirma: 'simple', tramite: 'none' },
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
        { corredoraId: u.corredoraId, entidadTipo: 'negocio' as const, entidadId: x.n.id, ref2: x.prop.id, texto, usuarioId: u.sub },
        { corredoraId: u.corredoraId, entidadTipo: 'propiedad' as const, entidadId: x.prop.id, ref2: x.n.id, texto, usuarioId: u.sub },
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
