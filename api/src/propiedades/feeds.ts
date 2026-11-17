// Feeds de avisos para los portales que leen la cartera desde una dirección (Chilepropiedades, Broku, TOCTOC, Yapo).
// El portal NO tiene sesión en Asset: lee una URL pública con una clave secreta por corredora
//   GET /v1/feeds/<clave>/<portal>.xml        (público)
// y la clave solo la ve el administrador (GET /v1/portales/feeds; POST /v1/portales/feeds/rotar la cambia: las direcciones
// viejas dejan de funcionar al instante). La clave vive en la colección «feeds_portales» de registros, que la API de
// registros no expone (solo este servicio la lee y la escribe).
// Entra al feed lo que la corredora publicó en ese portal (propiedades.portales[portal][operación].status = en_feed | publicada),
// no archivado, con precio, comuna y tipo, y que no esté vendido, arrendado ni retirado de la venta. Nunca salen datos del propietario.
import { randomBytes } from 'node:crypto';
import { Controller, Get, Header, NotFoundException, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Publico, Roles, UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import type { Env } from '../config/env';

export const PORTALES_FEED = ['chilepropiedades', 'broku', 'toctoc', 'yapo'] as const;
export type PortalFeed = (typeof PORTALES_FEED)[number];
const COLECCION = 'feeds_portales';
const ID = 'clave';
const ESTADOS_EN_FEED = ['en_feed', 'publicada'];
const FUERA = ['vendida', 'arrendada', 'no_disponible'];

const TIPO_FEED: Record<string, string> = {
  casa: 'Casa',
  departamento: 'Departamento',
  oficina: 'Oficina',
  sitio: 'Sitio',
  local_comercial: 'Local Comercial',
  industrial: 'Terreno Industrial',
  agricola: 'Terreno Agricola',
  parcela: 'Parcela',
  estacionamiento: 'Estacionamiento',
  terreno_construccion: 'Terreno',
  bodega: 'Bodega',
};
const MONEDA_FEED: Record<string, string> = { UF: 'CLF', CLP: 'CLP', USD: 'USD' };
const MAX_TITULO: Record<string, number> = { chilepropiedades: 65, broku: 70, toctoc: 70, yapo: 70 };

const cd = (v: unknown) => `<![CDATA[ ${String(v ?? '').replace(/]]>/g, ']]]]><![CDATA[>')} ]]>`;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

interface Contacto {
  nombre?: string;
  email?: string;
  whatsapp?: string;
  telefono?: string;
}
type AvisoPortal = { status?: string; destacado?: boolean };
type PropiedadFeed = Prisma.PropiedadGetPayload<{ include: { fotos: true } }> & {
  captador?: { nombre: string; email: string; telefono: string | null } | null;
};
/** La corredora que figura como agencia de los avisos (Chilepropiedades la usa para reconocer corredoras y agentes). */
export interface Agencia {
  id?: string;
  nombre?: string;
}

const esMovil = (t: string) => /^(\+?56)?9\d{8}$/.test(t.replace(/[\s().-]/g, ''));

/**
 * El contacto de un aviso: el corredor que captó la propiedad (así cada corredor es un agente del portal y sus contactos le
 * llegan a él) y, si no tiene captador, el contacto general de la corredora.
 */
function contactoDe(p: PropiedadFeed, general: Contacto): Contacto {
  const k = p.captador;
  if (!k?.email) return general;
  const tel = k.telefono?.trim() || '';
  return { nombre: k.nombre, email: k.email, whatsapp: tel && esMovil(tel) ? tel : '', telefono: tel && !esMovil(tel) ? tel : '' };
}

/** El XML del feed: una propiedad por operación publicada en ese portal. Exportada para probarla sin base de datos. */
export function construirFeed(portal: string, propiedades: PropiedadFeed[], general: Contacto = {}, agencia: Agencia = {}) {
  const lista: string[] = [];
  for (const p of propiedades) {
    for (const op of ['venta', 'arriendo'] as const) {
      if (!(op === 'venta' ? p.venta : p.arriendo)) continue;
      const estado = op === 'venta' ? p.estadoVenta : p.estadoArriendo;
      if (estado && FUERA.includes(estado)) continue;
      const a = ((p.portales as Record<string, Record<string, AvisoPortal>> | null)?.[portal] ?? {})[op];
      if (!a || !ESTADOS_EN_FEED.includes(a.status ?? '')) continue;
      const precio = op === 'venta' ? num(p.precioVenta) : num(p.precioArriendo);
      const moneda = op === 'venta' ? p.monedaVenta : p.monedaArriendo;
      if (!precio || !TIPO_FEED[p.tipo] || !p.comuna) continue;
      const c = contactoDe(p, general);
      const fotos = p.fotos.map((f) => f.url).filter((u) => /^https:\/\//.test(u));
      const area = (tag: string, v: unknown) => (num(v) != null ? `<${tag} unit="m2">${cd(num(v))}</${tag}>` : '');
      const entero = (tag: string, v: unknown) => (Number.isInteger(num(v)) && Number(v) > 0 ? `<${tag}>${cd(num(v))}</${tag}>` : '');
      const ficha = (p.ficha ?? {}) as Record<string, unknown>;
      // Asset: supUtil = construida/útil y supTotal = terreno/total. Chilepropiedades muestra la construida en unos tipos
      // (floorArea) y la útil en otros (usableFloorArea), y el terreno siempre en plotArea.
      const tipoFeed = TIPO_FEED[p.tipo];
      const usaConstruida = ['Casa', 'Local Comercial', 'Parcela'].includes(tipoFeed);
      const gc = num(p.gastosComunes);
      const titulo = String(p.tituloPortal || p.titulo || '').slice(0, MAX_TITULO[portal] ?? 65);
      lista.push(`<listing>
<referenceId>${cd(`${p.codigo}-${op === 'venta' ? 'V' : 'A'}`)}</referenceId>
<contact><name>${cd(c.nombre)}</name><email>${cd(c.email)}</email><phones>${c.whatsapp ? `<phone whatsapp="true">${cd(c.whatsapp)}</phone>` : ''}${c.telefono && c.telefono !== c.whatsapp ? `<phone whatsapp="false">${cd(c.telefono)}</phone>` : ''}</phones><agencyName>${cd(agencia.nombre ?? general.nombre)}</agencyName>${agencia.id ? `<agencyId>${cd(agencia.id)}</agencyId>` : ''}</contact>
<address>${cd([p.direccion, p.unidad].filter(Boolean).join(' '))}</address><commune>${cd(p.comuna)}</commune>
<title>${cd(titulo)}</title><description>${cd(p.descripcion)}</description>
<prices><price currency="${MONEDA_FEED[moneda ?? 'UF'] ?? 'CLF'}" operation="${op === 'venta' ? 'Venta' : 'Arriendo'}">${cd(precio)}</price></prices>
${gc != null ? `<communityFeesPrice>${cd(Math.round(gc))}</communityFeesPrice>` : ''}<propertyType>${cd(TIPO_FEED[p.tipo])}</propertyType>
${p.lat != null && p.lng != null ? `<coordinates><latitude>${cd(p.lat)}</latitude><longitude>${cd(p.lng)}</longitude></coordinates>` : ''}${p.dormitorios != null ? `<bedrooms>${cd(p.dormitorios)}</bedrooms>` : ''}${p.banos != null ? `<bathrooms>${cd(p.banos)}</bathrooms>` : ''}
${usaConstruida ? area('floorArea', p.supUtil) : area('usableFloorArea', p.supUtil)}${area('plotArea', p.supTotal)}${entero('constructionYear', ficha.anio)}${entero('floorNumber', ficha.pisoUnidad)}${entero('levels', ficha.pisos)}${p.estacionamientos != null ? `<parkingLots>${cd(p.estacionamientos)}</parkingLots>` : ''}<furnished>${cd(p.amoblado ? 'true' : 'false')}</furnished><featured>${cd(a.destacado ? 'true' : 'false')}</featured>
<pictures>${fotos.map((u) => `<picture><url>${cd(u)}</url></picture>`).join('')}</pictures>
</listing>`);
    }
  }
  return { xml: `<?xml version="1.0" encoding="UTF-8"?>\n<listings>\n${lista.join('\n')}\n</listings>\n`, avisos: lista.length };
}

@Controller()
export class FeedsController {
  private readonly base: string;

  constructor(
    private readonly db: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.base = config.get('API_URL_PUBLICA', { infer: true });
  }

  private async clave(corredoraId: string, rotar = false) {
    const fila = await this.db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId, coleccion: COLECCION, id: ID } } });
    const actual = (fila?.datos as { token?: string } | null)?.token;
    if (actual && !rotar) return actual;
    const token = randomBytes(24).toString('base64url');
    await this.db.registro.upsert({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: COLECCION, id: ID } },
      create: { corredoraId, coleccion: COLECCION, id: ID, datos: { token, creado: new Date().toISOString() } },
      update: { datos: { token, rotada: new Date().toISOString() }, version: { increment: 1 }, eliminadoEn: null },
    });
    return token;
  }

  private async propiedadesConAvisos(corredoraId: string, portal: string) {
    return this.db.propiedad.findMany({
      where: { corredoraId, eliminadoEn: null, archivada: false },
      include: { fotos: { orderBy: { orden: 'asc' } }, captador: { select: { nombre: true, email: true, telefono: true } } },
      orderBy: { codigo: 'asc' },
    }).then((l) => l.filter((p) => Object.keys((p.portales as Record<string, unknown>)?.[portal] ?? {}).length));
  }

  private async resumen(corredoraId: string, token: string) {
    const feeds: Record<string, { url: string; avisos: number }> = {};
    const contacto = await this.contacto(corredoraId);
    const agencia = await this.agencia(corredoraId);
    for (const portal of PORTALES_FEED) {
      const { avisos } = construirFeed(portal, await this.propiedadesConAvisos(corredoraId, portal), contacto, agencia);
      feeds[portal] = { url: `${this.base}/feeds/${token}/${portal}.xml`, avisos };
    }
    return { feeds };
  }

  private async agencia(corredoraId: string): Promise<Agencia> {
    const c = await this.db.corredora.findUnique({ where: { id: corredoraId }, select: { nombre: true } });
    return { id: corredoraId, nombre: c?.nombre };
  }

  private async contacto(corredoraId: string): Promise<Contacto> {
    const r = await this.db.registro.findUnique({ where: { corredoraId_coleccion_id: { corredoraId, coleccion: 'corredora_config', id: 'corredora' } } });
    return ((r?.datos as { contacto?: Contacto } | null)?.contacto ?? {}) as Contacto;
  }

  /** GET /v1/portales/feeds — las direcciones de los feeds de la corredora y cuántos avisos tiene cada uno (admin) */
  @Get('portales/feeds')
  @Roles('ADMIN')
  async direcciones(@UsuarioActual() u: UsuarioToken) {
    return this.resumen(u.corredoraId, await this.clave(u.corredoraId));
  }

  /** POST /v1/portales/feeds/rotar — cambia la clave: las direcciones anteriores dejan de funcionar (admin) */
  @Post('portales/feeds/rotar')
  @Roles('ADMIN')
  async rotar(@UsuarioActual() u: UsuarioToken) {
    return this.resumen(u.corredoraId, await this.clave(u.corredoraId, true));
  }

  /** GET /v1/feeds/:clave/:archivo — público: el portal lee aquí (archivo = <portal>.xml) */
  @Get('feeds/:clave/:archivo')
  @Publico()
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async leer(@Param('clave') clave: string, @Param('archivo') archivo: string) {
    const portal = archivo.replace(/\.xml$/i, '');
    if (!(PORTALES_FEED as readonly string[]).includes(portal) || !/^[A-Za-z0-9_-]{20,80}$/.test(clave)) throw new NotFoundException();
    const fila = await this.db.registro.findFirst({
      where: { coleccion: COLECCION, id: ID, eliminadoEn: null, datos: { path: ['token'], equals: clave } },
      select: { corredoraId: true },
    });
    if (!fila) throw new NotFoundException();
    const { xml } = construirFeed(
      portal,
      await this.propiedadesConAvisos(fila.corredoraId, portal),
      await this.contacto(fila.corredoraId),
      await this.agencia(fila.corredoraId),
    );
    return xml;
  }
}
