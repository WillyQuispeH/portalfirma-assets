// ACTA DE VISITA FIRMADA: cuando el acta está cerrada, Asset arma su PDF (plantilla HTML src/documentos/plantillas/acta-visita.html,
// con el número de la orden de visita, lo conversado y el interés del visitante) y lo envía a firmar al visitante con Portalfirma.
//  · POST /v1/actas-visita/:id/firma/vista-previa: el PDF (base64) y los datos que lleva, para verlo antes (no envía).
//  · POST /v1/actas-visita/:id/firma/ajustes: corrige lo que lleva (observaciones, interés y los datos del visitante, que se
//    guardan en la persona del CRM); solo antes de enviarla.
//  · POST /v1/actas-visita/:id/firma/enviar: la envía a firmar (cobra del saldo de Portalfirma) y la registra.
// El paso «Acta de visita» del negocio queda logrado cuando el visitante firma (lo sigue la revisión de firmas).
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { buscarVisible } from '../comun/asignados';
import { ActividadService } from '../comun/actividad.service';
import { PersonasService } from '../personas/personas.service';
import { PdfService } from '../documentos/pdf.service';
import { EnvioFirmaService } from '../documentos/envio-firma';
import { cargarPlantilla, llenar } from '../documentos/plantilla';
import type { ActaVisita } from './acta-visita';

const COLECCION = 'actas_visita';
const INTERES = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo', sin_datos: 'Sin datos' } as const;
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const lista = (l: string[]) => (l ?? []).filter(Boolean).map((texto) => ({ texto }));

const ajustesEsquema = z.object({
  observaciones: z.string().max(4000).optional(),
  interes: z.enum(['alto', 'medio', 'bajo', 'sin_datos']).optional(),
  visitante: z
    .object({
      nombre: z.string().max(160).optional(),
      rut: z.string().max(20).optional(),
      email: z.string().max(160).optional(),
      telefono: z.string().max(40).optional(),
    })
    .optional(),
});

@Injectable()
export class ActaFirmaService {
  private readonly log = new Logger('ActaFirma');
  constructor(
    private readonly db: PrismaService,
    private readonly pdfs: PdfService,
    private readonly envio: EnvioFirmaService,
    private readonly actividad: ActividadService,
    private readonly personas: PersonasService,
  ) {}

  private async leer(u: UsuarioToken, id: string) {
    const r = await this.db.registro.findUnique({
      where: { corredoraId_coleccion_id: { corredoraId: u.corredoraId, coleccion: COLECCION, id } },
    });
    if (!r || r.eliminadoEn) throw new NotFoundException('Esa acta de visita ya no existe.');
    const a = r.datos as unknown as ActaVisita;
    const n = await buscarVisible(this.db.negocio, u, a.negocioId, 'El negocio');
    return { a, n };
  }
  private async guardar(u: UsuarioToken, a: ActaVisita) {
    await this.db.registro.update({
      where: { corredoraId_coleccion_id: { corredoraId: u.corredoraId, coleccion: COLECCION, id: a.id } },
      data: { datos: a as unknown as Prisma.InputJsonObject, version: { increment: 1 } },
    });
  }

  /** el número de la orden de visita de este negocio (o de ese visitante en esa propiedad) */
  private async ordenDe(corredoraId: string, negocioId: string, propiedadId: string | null, personaId: string | null) {
    const filas = await this.db.firma.findMany({
      where: { corredoraId, eliminadoEn: null, documento: { startsWith: 'Orden de visita' } },
      orderBy: { enviadoEn: 'desc' },
      take: 40,
    });
    const suya =
      filas.find((f) => f.negocioId === negocioId) ??
      filas.find(
        (f) =>
          propiedadId &&
          f.propiedadIds.includes(propiedadId) &&
          ((f.firmantes as { personaId?: string }[]) ?? []).some((s) => s.personaId === personaId),
      );
    if (!suya) return { numero: null as number | null, operacion: null as number | null };
    const numero =
      Number((suya.datos as { numero?: number })?.numero) || Number(/n[ºo]\s*(\d+)/i.exec(suya.documento)?.[1]) || null;
    return { numero, operacion: suya.operacion };
  }

  private async armar(u: UsuarioToken, id: string) {
    const { a, n } = await this.leer(u, id);
    if (a.estado !== 'cerrada') return { error: 'Cierra el acta antes de enviarla a firmar.' };
    if (a.firma) return { error: `El acta ya se envió a firmar (operación ${a.firma.operacion}).` };
    if (!n.clienteId) return { error: 'El negocio no tiene visitante: vincúlalo en el paso «Interesado registrado».' };
    const propId = a.propiedadId ?? n.propiedadId;
    const [persona, prop, usuario, corredora] = await Promise.all([
      this.db.persona.findFirst({ where: { id: n.clienteId, corredoraId: u.corredoraId, eliminadoEn: null } }),
      propId
        ? this.db.propiedad.findFirst({ where: { id: propId, corredoraId: u.corredoraId, eliminadoEn: null } })
        : null,
      this.db.usuario.findUnique({ where: { id: u.sub } }),
      this.db.corredora.findUnique({ where: { id: u.corredoraId }, select: { nombre: true, rut: true } }),
    ]);
    if (!persona) return { error: 'El visitante ya no existe.' };
    if (!prop) return { error: 'La propiedad del negocio ya no existe.' };
    if (!usuario) return { error: 'No encontré tu usuario.' };
    const rut = persona.rutFormato || persona.rut || '';
    // lo que falta para poder enviarla (se corrige en la ventana: la vista previa trae los datos igual)
    const falta = !rut
      ? `${persona.nombre} no tiene RUT en su ficha: agrégalo para enviarle el acta a firmar.`
      : !persona.email || !emailOk(persona.email)
        ? `Falta el correo de ${persona.nombre}: ahí recibe el enlace para firmar.`
        : '';
    const orden = await this.ordenDe(u.corredoraId, n.id, prop.id, persona.id);
    const r = a.resumen;
    const ordenTexto = orden.numero ? `Orden de visita nº ${orden.numero}` : 'Sin orden de visita registrada';
    return {
      a,
      n,
      falta,
      persona: {
        id: persona.id,
        nombre: persona.nombre,
        rut,
        email: persona.email ?? '',
        telefono: persona.telefono ?? '',
      },
      prop,
      usuario,
      orden,
      ordenTexto,
      vars: {
        fechaVisita: fechaLarga(a.fecha),
        fechaEmision: fechaLarga(new Date().toISOString().slice(0, 10)),
        orden: { texto: ordenTexto },
        corredora: { nombre: corredora?.nombre ?? 'la corredora', rut: corredora?.rut ?? '' },
        corredor: { nombre: usuario.nombre, email: usuario.email },
        visitante: { nombre: persona.nombre, rut, email: persona.email ?? '', telefono: persona.telefono ?? '' },
        propiedad: {
          codigo: prop.codigo,
          tipo: mayus(String(prop.tipo || '').replace(/_/g, ' ')),
          direccion: [prop.direccion, prop.unidad ? `depto. ${prop.unidad}` : '', prop.comuna]
            .filter(Boolean)
            .join(', '),
        },
        interes: INTERES[r?.interes ?? 'sin_datos'],
        observaciones: r?.resumen?.trim() || 'Sin observaciones registradas.',
        notas: (a.notas ?? '').trim(),
        hayInteresado: !!r?.interesado?.length,
        interesado: lista(r?.interesado ?? []),
        hayCorredor: !!r?.corredor?.length,
        comentarioCorredor: lista(r?.corredor ?? []),
        hayObjeciones: !!r?.objeciones?.length,
        objeciones: lista(r?.objeciones ?? []),
        hayAcuerdos: !!r?.acuerdos?.length,
        acuerdos: lista(r?.acuerdos ?? []),
        hayProximos: !!r?.proximosPasos?.length,
        proximosPasos: lista(r?.proximosPasos ?? []),
      },
    };
  }

  async vistaPrevia(u: UsuarioToken, id: string): Promise<Record<string, unknown>> {
    const x = await this.armar(u, id);
    if ('error' in x) return { error: x.error };
    const datos = {
      visitante: x.persona,
      interes: x.a.resumen?.interes ?? 'sin_datos',
      observaciones: x.a.resumen?.resumen ?? '',
      orden: x.ordenTexto,
      propiedad: { codigo: x.prop.codigo, titulo: x.prop.titulo, direccion: x.vars.propiedad.direccion },
    };
    // sin RUT o correo del visitante no se arma el PDF, pero se devuelven los datos para completarlos en la ventana
    if (x.falta) return { error: x.falta, ...datos };
    const bytes = await this.pdfs.pdf(llenar(cargarPlantilla('acta-visita'), x.vars));
    return {
      ok: true,
      pdf: bytes.toString('base64'),
      archivo: `Acta de visita ${x.prop.codigo} - ${x.persona.nombre}.pdf`,
      ...datos,
    };
  }

  /** corrige lo que lleva el acta (antes de enviarla): observaciones, interés y los datos del visitante, que se guardan en su ficha */
  async ajustar(u: UsuarioToken, id: string, b: z.infer<typeof ajustesEsquema>) {
    const { a, n } = await this.leer(u, id);
    if (a.firma) throw new BadRequestException('El acta ya se envió a firmar: no se puede cambiar.');
    if (b.visitante && n.clienteId) {
      const v = b.visitante;
      if (v.email && !emailOk(v.email)) throw new BadRequestException('El correo del visitante no es válido.');
      await this.personas.actualizar(u, n.clienteId, {
        ...(v.nombre ? { nombre: v.nombre } : {}),
        ...(v.rut ? { rut: v.rut } : {}),
        ...(v.email !== undefined ? { email: v.email } : {}),
        ...(v.telefono !== undefined ? { telefono: v.telefono } : {}),
      });
    }
    if (b.observaciones !== undefined || b.interes) {
      const r = a.resumen ?? {
        hechoEn: new Date().toISOString(),
        resumen: '',
        interesado: [],
        corredor: [],
        interes: 'sin_datos' as const,
        objeciones: [],
        acuerdos: [],
        proximosPasos: [],
      };
      if (b.observaciones !== undefined) r.resumen = b.observaciones.trim();
      if (b.interes) r.interes = b.interes;
      a.resumen = r;
      await this.guardar(u, a);
    }
    return { ok: true };
  }

  async enviar(u: UsuarioToken, id: string): Promise<Record<string, unknown>> {
    const x = await this.armar(u, id);
    if ('error' in x) return { error: x.error };
    if (x.falta) return { error: x.falta };
    const bytes = await this.pdfs.pdf(llenar(cargarPlantilla('acta-visita'), x.vars));
    const nombre = x.orden.numero
      ? `Acta de visita · orden nº ${x.orden.numero}`
      : `Acta de visita del ${x.a.fecha.slice(8, 10)}/${x.a.fecha.slice(5, 7)}`;
    const r = await this.envio.enviar({
      corredoraId: u.corredoraId,
      pagadorRespaldo: x.usuario.email,
      bytes,
      nombreArchivo: `${nombre} - ${x.prop.codigo}.pdf`,
      firmantes: [
        {
          rut: x.persona.rut,
          fullName: x.persona.nombre,
          email: x.persona.email,
          phone: x.persona.telefono || undefined,
          alias: 'visitante',
          typeSign: 'simple',
        },
      ],
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
          documento: nombre,
          origen: 'asset',
          estado: 'en_firma',
          propiedadIds: [x.prop.id],
          negocioId: x.n.id,
          enviadoPorId: u.sub,
          total: 1,
          firmantes: [
            {
              nombre: x.persona.nombre,
              rut: x.persona.rut,
              rol: 'Visitante',
              personaId: x.persona.id,
              email: x.persona.email,
              telefono: x.persona.telefono,
              firmo: false,
            },
          ] as Prisma.InputJsonValue,
          datos: {
            formato: 'acta_visita',
            hito: 'acta',
            actaId: x.a.id,
            ordenNumero: x.orden.numero,
            tipoFirma: 'simple',
            tramite: 'none',
          },
        },
        update: {},
      });
      x.a.firma = { operacion, enviadaEn: new Date().toISOString(), ordenNumero: x.orden.numero, nombre };
      await this.guardar(u, x.a);
      // el paso queda a cargo de la firma (ya no «falta enviarla»)
      const datos = { ...((x.n.datos as Record<string, unknown>) ?? {}) };
      const pasos = { ...((datos.pasos as Record<string, unknown>) ?? {}) };
      if (pasos.acta) {
        delete pasos.acta;
        await this.db.negocio.update({
          where: { id: x.n.id },
          data: { datos: { ...datos, pasos } as Prisma.InputJsonValue, version: { increment: 1 } },
        });
      }
      const texto = `${nombre} enviada a firmar a ${x.persona.nombre} (operación ${operacion})`;
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
      this.log.error(`acta enviada pero sin registrar del todo: ${(e as Error).message}`);
      return {
        ok: true,
        enviada: true,
        operacion,
        visitante: x.persona.nombre,
        aviso: 'El acta se envió, pero no pude registrarla del todo en Asset: ábrelo para revisarla.',
      };
    }
    return {
      ok: true,
      enviada: true,
      operacion,
      visitante: x.persona.nombre,
      correo: x.persona.email,
      indicacion: `El acta de visita se envió a firmar (operación ${operacion}): ${x.persona.nombre} recibe el enlace para firmar en ${x.persona.email}. Se cobró del saldo de Portalfirma.`,
    };
  }
}

@Controller('actas-visita')
export class ActaFirmaController {
  constructor(private readonly s: ActaFirmaService) {}

  @Post(':id/firma/vista-previa')
  @HttpCode(200)
  vistaPrevia(@UsuarioActual() u: UsuarioToken, @Param('id') id: string) {
    return this.s.vistaPrevia(u, id.slice(0, 80));
  }

  @Post(':id/firma/ajustes')
  @HttpCode(200)
  ajustes(
    @UsuarioActual() u: UsuarioToken,
    @Param('id') id: string,
    @Body(new ZodPipe(ajustesEsquema)) b: z.infer<typeof ajustesEsquema>,
  ) {
    return this.s.ajustar(u, id.slice(0, 80), b);
  }

  @Post(':id/firma/enviar')
  @HttpCode(200)
  enviar(@UsuarioActual() u: UsuarioToken, @Param('id') id: string) {
    return this.s.enviar(u, id.slice(0, 80));
  }
}
