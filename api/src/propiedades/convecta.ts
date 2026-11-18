// Convecta: el ÚNICO origen desde donde se importa la cartera. Lee las propiedades de su API (POST /properties, paginado
// por la URL: ?pageNumber=N&pageSize=50, el máximo) y las traduce al formato de Asset.
// La clave de suscripción es de CADA corredora (cada una lee SU cuenta de Convecta): la pega su administrador en
// Integraciones y queda cifrada en conexiones (proveedor «convecta»). La app de escritorio nunca la ve.
// CONVECTA_SUBSCRIPTION_KEY del servidor sirve solo a la corredora CONVECTA_CORREDORA_ID (la clave original); ninguna
// otra corredora la usa (si no, cualquier administrador traería la cartera de otra corredora).
import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Put,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { CifradoService } from '../conexiones/cifrado';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import type { PropiedadEntrada } from './propiedades.esquemas';

export interface ConvectaMoneda {
  name?: string | null;
  symbol?: string | null;
}
export interface ConvectaMedia {
  url?: string | null;
  order?: number | null;
  type?: string | null;
  visibility?: number | null;
}
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
const PROVEEDOR = 'convecta';
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
  const tipo = TIPOS[x.idType ?? -1] ?? TIPO_POR_PALABRA.find(([r]) => r.test(titulo.toLowerCase()))?.[1] ?? 'casa';
  const c = x.characteristics ?? {};
  const imagenes = (x.propertyMedia ?? []).filter(
    (m) => /^image$/i.test(m.type ?? '') && /^https?:\/\//.test(m.url ?? ''),
  );
  const publicas = imagenes.filter((m) => m.visibility !== 0);
  const fotos = (publicas.length ? publicas : imagenes)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((m) => String(m.url))
    .slice(0, 60);
  const calle = [x.street, x.number].filter(
    (v) => v !== null && v !== undefined && String(v).trim() && String(v) !== '0',
  );
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
  /** la clave del servidor y la única corredora a la que sirve */
  private readonly claveServidor: string;
  private readonly corredoraServidor: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly db: PrismaService,
    private readonly cifrado: CifradoService,
  ) {
    this.url = config.get('CONVECTA_API_URL', { infer: true }) ?? '';
    this.claveServidor = (config.get('CONVECTA_SUBSCRIPTION_KEY', { infer: true }) ?? '').trim();
    this.corredoraServidor = (config.get('CONVECTA_CORREDORA_ID', { infer: true }) ?? '').trim();
  }

  private donde = (corredoraId: string) => ({
    corredoraId_proveedor_dueno: { corredoraId, proveedor: PROVEEDOR, dueno: 'corredora' },
  });

  /** la clave de Convecta de la corredora (la suya o, solo para CONVECTA_CORREDORA_ID, la del servidor) */
  async claveDe(corredoraId: string): Promise<string | null> {
    const c = await this.db.conexion.findUnique({ where: this.donde(corredoraId) });
    if (c?.estado === 'activa' && c.accesoCif) return this.cifrado.descifrar(c.accesoCif);
    if (this.claveServidor && this.corredoraServidor && corredoraId === this.corredoraServidor)
      return this.claveServidor;
    return null;
  }

  async estado(u: UsuarioToken) {
    const c = await this.db.conexion.findUnique({ where: this.donde(u.corredoraId) });
    const propia = c?.estado === 'activa' && !!c.accesoCif;
    return {
      disponible: !!this.url,
      conectado: propia || !!(await this.claveDe(u.corredoraId)),
      propia,
      conectadoEn: c?.conectadoEn ?? null,
      error: c?.ultimoError ?? null,
      admin: u.rol === 'ADMIN',
    };
  }

  /** el administrador pega la clave de suscripción de SU cuenta de Convecta; se prueba antes de guardarla */
  async conectar(u: UsuarioToken, clave: string) {
    if (u.rol !== 'ADMIN')
      throw new ForbiddenException('La cuenta de Convecta la conecta el administrador de la corredora.');
    if (!this.url)
      throw new ServiceUnavailableException('Convecta no está disponible en el servidor (falta CONVECTA_API_URL).');
    await this.pagina(clave, 1, 1);
    const datos = {
      tipo: 'clave',
      estado: 'activa',
      accesoCif: this.cifrado.cifrar(clave),
      renovarCif: null,
      expiraEn: null,
      cuentaId: null,
      ultimoError: null,
      datos: {},
      conectadoPor: u.sub,
      conectadoEn: new Date(),
    };
    await this.db.conexion.upsert({
      where: this.donde(u.corredoraId),
      create: { corredoraId: u.corredoraId, usuarioId: null, proveedor: PROVEEDOR, dueno: 'corredora', ...datos },
      update: datos,
    });
    return this.estado(u);
  }

  async desconectar(u: UsuarioToken) {
    if (u.rol !== 'ADMIN')
      throw new ForbiddenException('La cuenta de Convecta la desconecta el administrador de la corredora.');
    await this.db.conexion.deleteMany({
      where: { corredoraId: u.corredoraId, proveedor: PROVEEDOR, dueno: 'corredora' },
    });
    return this.estado(u);
  }

  /** una página de la API de Convecta con esa clave */
  private async pagina(
    clave: string,
    pag: number,
    tam = POR_PAGINA,
  ): Promise<{ items: ConvectaPropiedad[]; paginas: number }> {
    let r: Response;
    try {
      r = await fetch(`${this.url}/properties?pageNumber=${pag}&pageSize=${tam}`, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': clave, 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new BadGatewayException('No se pudo conectar con Convecta. Intenta de nuevo en un momento.');
    }
    if (r.status === 401 || r.status === 403)
      throw new BadRequestException('Convecta rechazó la clave de suscripción.');
    if (!r.ok) throw new BadGatewayException(`Convecta respondió con un error (${r.status}).`);
    const j = (await r.json().catch(() => ({}))) as {
      totalPages?: number;
      items?: ConvectaPropiedad[];
      data?: ConvectaPropiedad[];
    };
    return { items: j.items ?? j.data ?? [], paginas: Number(j.totalPages) || 0 };
  }

  /** Todas las propiedades de la cuenta de Convecta de la corredora (páginas de 50). */
  async propiedades(corredoraId: string): Promise<ConvectaPropiedad[]> {
    if (!this.url)
      throw new ServiceUnavailableException('Convecta no está disponible en el servidor (falta CONVECTA_API_URL).');
    const clave = await this.claveDe(corredoraId);
    if (!clave)
      throw new BadRequestException(
        'Conecta primero la cuenta de Convecta de tu corredora en Configuración › Integraciones.',
      );
    const todas = new Map<number, ConvectaPropiedad>();
    // Convecta informa totalPages SOLO en la primera página (las siguientes no lo traen): se guarda el mayor visto y,
    // por si acaso, se sigue mientras una página venga llena. (Antes se pisaba con 1 y de 178 se importaban 100.)
    let paginas = 1;
    for (let pag = 1; pag <= paginas && pag <= MAX_PAGINAS; pag++) {
      const r = await this.pagina(clave, pag);
      paginas = Math.max(paginas, r.paginas, r.items.length >= POR_PAGINA ? pag + 1 : 0);
      for (const it of r.items) if (it?.idProperty) todas.set(it.idProperty, it);
    }
    return [...todas.values()];
  }
}

const conectarEsquema = z.object({ clave: z.string().trim().min(10, 'Esa clave es muy corta.').max(400) });

/** GET/PUT/DELETE /v1/convecta/conexion — la cuenta de Convecta de la corredora (conectar y quitar: administrador) */
@Controller('convecta/conexion')
export class ConvectaController {
  constructor(private readonly s: ConvectaService) {}

  @Get()
  estado(@UsuarioActual() u: UsuarioToken) {
    return this.s.estado(u);
  }

  @Put()
  conectar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(conectarEsquema)) b: z.infer<typeof conectarEsquema>) {
    return this.s.conectar(u, b.clave);
  }

  @Delete()
  desconectar(@UsuarioActual() u: UsuarioToken) {
    return this.s.desconectar(u);
  }
}
