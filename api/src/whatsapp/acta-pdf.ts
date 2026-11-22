// ACTA DE VISITA EN PDF: cuando el acta está lista, Asset arma su PDF (plantilla HTML src/documentos/plantillas/acta-visita.html: el número de la
// orden de visita, el resumen, los audios con su transcripción y las fotos) para verlo y compartirlo, por ejemplo por WhatsApp. El acta NO se firma:
// no se envía a Portalfirma ni cuesta nada.
//  · POST /v1/actas-visita/:id/pdf: el PDF (base64) para verlo o guardarlo.
//  · POST /v1/actas-visita/:id/compartir: deja el PDF en R2 y entrega un enlace de descarga por 7 días, el celular del visitante y el
//    enlace de WhatsApp (wa.me) con el mensaje listo; la app lo abre y el corredor solo aprieta «enviar».
import { Controller, HttpCode, Injectable, Logger, NotFoundException, Param, Post } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { buscarVisible } from '../comun/asignados';
import { ActividadService } from '../comun/actividad.service';
import { AlmacenamientoService } from '../archivos/almacenamiento.service';
import { PdfService } from '../documentos/pdf.service';
import { llenar } from '../documentos/plantilla';
import { datosCorredora } from '../documentos/corredora-doc';
import { PlantillasDocService } from '../documentos/plantillas-doc';
import type { ActaVisita } from './acta-visita';

const COLECCION = 'actas_visita';
const INTERES = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo', sin_datos: 'Sin datos' } as const;
const CLASE = { alto: 'alto', medio: 'medio', bajo: 'bajo', sin_datos: 'sin' } as const;
const SIETE_DIAS = 7 * 24 * 3600;
/** fotos que caben en el PDF (las demás se mencionan): cada una pesa unos 60 KB */
const MAX_FOTOS_PDF = 24;
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const cuando = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' }).replace(',', ',');
const lista = (l: string[]) => (l ?? []).filter(Boolean).map((texto) => ({ texto }));
const peso = (b: number) => (b ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : '');
const ORIGEN_AUDIO = { app: 'Grabado en la app', archivo: 'Subido como archivo', whatsapp: 'WhatsApp' } as const;
const ORIGEN_FOTO = { app: 'subida desde Asset', whatsapp: 'por WhatsApp' } as const;

@Injectable()
export class ActaPdfService {
  private readonly log = new Logger('ActaPdf');
  constructor(
    private readonly db: PrismaService,
    private readonly r2: AlmacenamientoService,
    private readonly plantillasDoc: PlantillasDocService,
    private readonly pdfs: PdfService,
    private readonly actividad: ActividadService,
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
    if (!suya) return null;
    return Number((suya.datos as { numero?: number })?.numero) || Number(/n[ºo]\s*(\d+)/i.exec(suya.documento)?.[1]) || null;
  }

  /** una foto del acta, achicada y como imagen incrustada (así el PDF no depende de enlaces que vencen) */
  private async fotoIncrustada(clave: string) {
    const jpg = await sharp(await this.r2.bajar(clave)).rotate().resize({ width: 760, withoutEnlargement: true }).jpeg({ quality: 74 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString('base64')}`;
  }

  private async armar(u: UsuarioToken, id: string) {
    const { a, n } = await this.leer(u, id);
    const propId = a.propiedadId ?? n.propiedadId;
    const [persona, prop, usuario, corredora] = await Promise.all([
      n.clienteId ? this.db.persona.findFirst({ where: { id: n.clienteId, corredoraId: u.corredoraId, eliminadoEn: null } }) : null,
      propId ? this.db.propiedad.findFirst({ where: { id: propId, corredoraId: u.corredoraId, eliminadoEn: null } }) : null,
      this.db.usuario.findUnique({ where: { id: a.usuarioId || u.sub } }),
      datosCorredora(this.db, u.corredoraId),
    ]);
    if (!prop) throw new NotFoundException('La propiedad del acta ya no existe.');
    const numero = await this.ordenDe(u.corredoraId, n.id, prop.id, persona?.id ?? null);
    const r = a.resumen;
    const ordenTexto = numero ? `Orden de visita nº ${numero}` : 'Sin orden de visita registrada';
    const sobran = Math.max(0, a.fotos.length - MAX_FOTOS_PDF);
    const fotos: { n: number; src: string; pie: string }[] = [];
    for (const f of a.fotos.slice(0, MAX_FOTOS_PDF)) {
      try {
        fotos.push({ n: f.n, src: await this.fotoIncrustada(f.clave), pie: ORIGEN_FOTO[f.origen] ?? '' });
      } catch (e) {
        this.log.warn(`foto ${f.n} del acta ${a.id} no se pudo leer: ${(e as Error).message}`);
      }
    }
    const audios = a.audios.map((x) => ({
      n: x.n,
      origen: ORIGEN_AUDIO[x.origen] ?? '',
      cuando: cuando(x.recibido),
      peso: peso(x.bytes),
      extracto: x.transcripcion.trim() ? x.transcripcion.trim().replace(/\s+/g, ' ').slice(0, 520) + (x.transcripcion.length > 520 ? '…' : '') : 'Sin transcripción disponible.',
    }));
    const vars = {
      fechaVisita: fechaLarga(a.fecha),
      fechaEmision: fechaLarga(new Date().toISOString().slice(0, 10)),
      orden: { texto: ordenTexto },
      corredora,
      corredor: { nombre: usuario?.nombre ?? '', email: usuario?.email ?? '' },
      visitante: {
        nombre: persona?.nombre || 'Visitante sin registrar',
        rut: persona?.rutFormato || persona?.rut || '—',
        email: persona?.email || '—',
        telefono: persona?.telefono || '—',
      },
      propiedad: {
        codigo: prop.codigo,
        tipo: mayus(String(prop.tipo || '').replace(/_/g, ' ')),
        direccion: [prop.direccion, prop.unidad ? `depto. ${prop.unidad}` : '', prop.comuna].filter(Boolean).join(', '),
      },
      interes: INTERES[r?.interes ?? 'sin_datos'],
      interesClase: CLASE[r?.interes ?? 'sin_datos'],
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
      hayAudios: audios.length > 0,
      audios,
      hayFotos: fotos.length > 0,
      fotos,
      fotosMas: sobran ? `y ${sobran} ${sobran === 1 ? 'foto más' : 'fotos más'} en Asset` : '',
    };
    const archivo = `Acta de visita ${prop.codigo}${persona ? ' - ' + persona.nombre : ''} (${a.fecha}).pdf`;
    return { a, n, persona, prop, usuario, vars, archivo };
  }

  private async generar(u: UsuarioToken, id: string) {
    const x = await this.armar(u, id);
    const bytes = await this.pdfs.pdf(llenar(await this.plantillasDoc.html(u.corredoraId, 'acta-visita'), x.vars));
    return { ...x, bytes };
  }

  /** el PDF del acta (base64), para verlo o guardarlo */
  async pdf(u: UsuarioToken, id: string) {
    const x = await this.generar(u, id);
    return { ok: true, pdf: x.bytes.toString('base64'), archivo: x.archivo, visitante: x.persona?.nombre ?? null, orden: x.vars.orden.texto, fotos: x.vars.fotos.length, audios: x.vars.audios.length };
  }

  /** el PDF queda en R2 y se entrega un enlace de descarga por 7 días, con el WhatsApp del visitante y el mensaje ya escrito */
  async compartir(u: UsuarioToken, id: string) {
    const x = await this.generar(u, id);
    const clave = `c/${u.corredoraId}/r/${COLECCION}/${x.a.id}/acta-visita.pdf`;
    await this.r2.subir(clave, x.bytes, 'application/pdf');
    const enlace = await this.r2.urlDescarga(clave, x.archivo, SIETE_DIAS);
    const tel = String(x.persona?.telefono ?? '').replace(/\D/g, '');
    const celular = tel.length === 8 ? `569${tel}` : tel.length === 9 ? `56${tel}` : tel.length >= 10 ? tel : '';
    const saludo = x.persona?.nombre ? `Hola ${x.persona.nombre.split(' ')[0]}, ` : 'Hola, ';
    const texto = `${saludo}te comparto el acta de la visita a la propiedad ${x.prop.codigo} del ${fechaLarga(x.a.fecha)}:\n${enlace}\n\n${x.usuario?.nombre ?? ''}${x.vars.corredora?.nombre ? ' · ' + x.vars.corredora.nombre : ''}`.trim();
    try {
      const a = { ...x.a, pdf: { clave, generadoEn: new Date().toISOString() } };
      await this.db.registro.update({
        where: { corredoraId_coleccion_id: { corredoraId: u.corredoraId, coleccion: COLECCION, id: a.id } },
        data: { datos: a as unknown as Prisma.InputJsonObject, version: { increment: 1 } },
      });
      const t = `Acta de visita del ${x.a.fecha.slice(8, 10)}/${x.a.fecha.slice(5, 7)} compartida${x.persona ? ' con ' + x.persona.nombre : ''}`;
      await this.actividad.registrar([
        { corredoraId: u.corredoraId, entidadTipo: 'negocio' as const, entidadId: x.n.id, ref2: x.prop.id, texto: t, usuarioId: u.sub },
      ]);
    } catch (e) {
      this.log.warn(`acta compartida pero sin registrar: ${(e as Error).message}`);
    }
    return {
      ok: true,
      enlace,
      archivo: x.archivo,
      telefono: celular ? `+${celular}` : null,
      visitante: x.persona?.nombre ?? null,
      texto,
      // con el celular del visitante abre su conversación; sin él, WhatsApp pide elegir a quién
      wa: `https://wa.me/${celular}?text=${encodeURIComponent(texto)}`,
    };
  }
}

@Controller('actas-visita')
export class ActaPdfController {
  constructor(private readonly s: ActaPdfService) {}

  @Post(':id/pdf')
  @HttpCode(200)
  pdf(@UsuarioActual() u: UsuarioToken, @Param('id') id: string) {
    return this.s.pdf(u, id.slice(0, 80));
  }

  @Post(':id/compartir')
  @HttpCode(200)
  compartir(@UsuarioActual() u: UsuarioToken, @Param('id') id: string) {
    return this.s.compartir(u, id.slice(0, 80));
  }
}
