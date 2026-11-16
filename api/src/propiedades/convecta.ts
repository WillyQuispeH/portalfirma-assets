// Convecta: el ÚNICO origen desde donde se importa la cartera. Lee las propiedades de su API (POST /properties, paginado
// por la URL: ?pageNumber=N&pageSize=50, el máximo) y las traduce al formato de Asset. La clave de suscripción vive solo
// en el servidor (CONVECTA_SUBSCRIPTION_KEY): la app de escritorio nunca la ve.
import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import type { PropiedadEntrada } from './propiedades.esquemas';

export interface ConvectaMoneda { name?: string | null; symbol?: string | null }
export interface ConvectaMedia { url?: string | null; order?: number | null; type?: string | null; visibility?: number | null }
export interface ConvectaPropiedad {
  idProperty: number;
  idExternal?: string | null;
  idType?: number | null;
  sale?: boolean;
  rent?: boolean;
  visible?: boolean | null;
  street?: string | null;
  number?: number | string | null;
  unit?: number | null;
  letter?: string | null;
  role?: string | null;
  idBorough?: number | null;
  observations?: string | null;
  propertyTitle?: string | null;
  priceSale?: number | null;
  priceRent?: number | null;
  currencySale?: ConvectaMoneda | null;
  currencyRent?: ConvectaMoneda | null;
  coordinatesLat?: string | number | null;
  coordinatesLong?: string | number | null;
  user?: { fullName?: string | null; email?: string | null; phone1?: string | null } | null;
  characteristics?: {
    totalSurface?: number | null;
    utildSurface?: number | null;
    buildedSurface?: number | null;
    landSurface?: number | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    parkings?: number | null;
    warehouses?: number | null;
  } | null;
  propertyMedia?: ConvectaMedia[] | null;
}

export const SISTEMA_CONVECTA = 'convecta';
const POR_PAGINA = 50; // máximo que acepta la API
const MAX_PAGINAS = 200;

// Convecta entrega solo ids de tipo y de comuna (sus catálogos no están en la API que usamos). Estas tablas se completan
// con lo que ya se vio en su cartera; lo que no esté se deduce del título («Casa en Las Condes») y, si no, queda vacío.
const TIPOS: Record<number, PropiedadEntrada['tipo']> = { 1: 'casa', 2: 'departamento', 3: 'oficina', 4: 'sitio' };
const COMUNAS: Record<number, { nombre: string; region: string }> = {
  86: { nombre: 'Machalí', region: "Libertador General Bernardo O'Higgins" },
  98: { nombre: 'Rengo', region: "Libertador General Bernardo O'Higgins" },
  292: { nombre: 'Colina', region: 'Metropolitana de Santiago' },
  311: { nombre: 'Lo Barnechea', region: 'Metropolitana de Santiago' },
  312: { nombre: 'Vitacura', region: 'Metropolitana de Santiago' },
  313: { nombre: 'Las Condes', region: 'Metropolitana de Santiago' },
  337: { nombre: 'Providencia', region: 'Metropolitana de Santiago' },
};
const TIPO_POR_PALABRA: [RegExp, PropiedadEntrada['tipo']][] = [
  [/^casa/, 'casa'],
  [/^(departamento|depto)/, 'departamento'],
  [/^oficina/, 'oficina'],
  [/^(sitio|terreno)/, 'sitio'],
  [/^local/, 'local_comercial'],
  [/^bodega/, 'bodega'],
  [/^parcela/, 'parcela'],
  [/^estacionamiento/, 'estacionamiento'],
  [/^(industrial|galp)/, 'industrial'],
  [/^agr/, 'agricola'],
];

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(typeof v === 'string' ? v.replace(',', '.') : v);
  return Number.isFinite(n) ? n : null;
};
const positivo = (v: unknown) => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};
const moneda = (m?: ConvectaMoneda | null): 'UF' | 'CLP' | 'USD' => {
  const t = `${m?.name ?? ''} ${m?.symbol ?? ''}`.toLowerCase();
  if (/uf/.test(t)) return 'UF';
  if (/d[oó]lar|usd|us\$/.test(t)) return 'USD';
  return 'CLP';
};
const html2txt = (h?: string | null) =>
  String(h ?? '')
    .replace(/<\s*br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

/** Una propiedad de Convecta en el formato de importación de Asset. */
export function aPropiedadAsset(x: ConvectaPropiedad): PropiedadEntrada {
  const titulo = (x.propertyTitle ?? '').trim();
  const sufijo = titulo.match(/ en (.+)$/i)?.[1]?.trim();
  const comuna = COMUNAS[x.idBorough ?? -1];
  const tipo =
    TIPOS[x.idType ?? -1] ?? TIPO_POR_PALABRA.find(([r]) => r.test(titulo.toLowerCase()))?.[1] ?? 'casa';
  const c = x.characteristics ?? {};
  const imagenes = (x.propertyMedia ?? []).filter((m) => /^image$/i.test(m.type ?? '') && /^https?:\/\//.test(m.url ?? ''));
  const publicas = imagenes.filter((m) => m.visibility !== 0);
  const fotos = (publicas.length ? publicas : imagenes)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((m) => String(m.url))
    .slice(0, 60);
  const calle = [x.street, x.number].filter((v) => v !== null && v !== undefined && String(v).trim() && String(v) !== '0');
  const lat = num(x.coordinatesLat);
  const lng = num(x.coordinatesLong);
  const venta = !!x.sale;
  const arriendo = !!x.rent;
  const pv = positivo(x.priceSale);
  const pa = positivo(x.priceRent);
  const unidad = x.unit ? `${x.unit}${x.letter ?? ''}` : '';
  return {
    codigo: `CV-${x.idProperty}`,
    titulo: titulo || undefined,
    tipo,
    venta,
    arriendo,
    precioVenta: venta && pv !== null ? { valor: pv, moneda: moneda(x.currencySale) } : null,
    precioArriendo: arriendo && pa !== null ? { valor: pa, moneda: moneda(x.currencyRent) } : null,
    estadoVenta: venta ? 'disponible' : null,
    estadoArriendo: arriendo ? 'disponible' : null,
    direccion: calle.join(' ').replace(/\s+/g, ' ').trim() || null,
    unidad: unidad || null,
    comuna: comuna?.nombre ?? sufijo ?? null,
    region: comuna?.region ?? null,
    rol: (x.role ?? '').trim() || null,
    lat: lat !== null && lat !== 0 ? lat : null,
    lng: lng !== null && lng !== 0 ? lng : null,
    supTotal: positivo(c.totalSurface) ?? positivo(c.landSurface),
    supUtil: positivo(c.utildSurface) ?? positivo(c.buildedSurface),
    dormitorios: positivo(c.bedrooms),
    banos: positivo(c.bathrooms),
    estacionamientos: positivo(c.parkings),
    bodegas: positivo(c.warehouses),
    descripcion: html2txt(x.observations) || null,
    fotos,
  };
}

@Injectable()
export class ConvectaService {
  private readonly url: string;
  private readonly clave: string;

  constructor(config: ConfigService<Env, true>) {
    this.url = config.get('CONVECTA_API_URL', { infer: true }) ?? '';
    this.clave = (config.get('CONVECTA_SUBSCRIPTION_KEY', { infer: true }) ?? '').trim();
  }

  get disponible() {
    return !!(this.url && this.clave);
  }

  /** Todas las propiedades de Convecta (páginas de 50). */
  async propiedades(): Promise<ConvectaPropiedad[]> {
    if (!this.disponible) {
      throw new ServiceUnavailableException(
        'Convecta no está configurado en el servidor (faltan CONVECTA_API_URL y CONVECTA_SUBSCRIPTION_KEY).',
      );
    }
    const todas = new Map<number, ConvectaPropiedad>();
    let paginas = 1;
    for (let pag = 1; pag <= paginas && pag <= MAX_PAGINAS; pag++) {
      let r: Response;
      try {
        r = await fetch(`${this.url}/properties?pageNumber=${pag}&pageSize=${POR_PAGINA}`, {
          method: 'POST',
          headers: { 'Ocp-Apim-Subscription-Key': this.clave, 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new BadGatewayException('No se pudo conectar con Convecta. Intenta de nuevo en un momento.');
      }
      if (!r.ok) {
        throw new BadGatewayException(
          r.status === 401 || r.status === 403
            ? 'Convecta rechazó la clave de acceso del servidor.'
            : `Convecta respondió con un error (${r.status}).`,
        );
      }
      const j = (await r.json()) as { items?: ConvectaPropiedad[]; totalPages?: number };
      paginas = Math.max(1, Number(j.totalPages) || 1);
      for (const it of j.items ?? []) if (it?.idProperty) todas.set(it.idProperty, it);
    }
    return [...todas.values()];
  }
}
