/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- las respuestas de Mercado Libre y la ficha son JSON libre */
// Portal Inmobiliario (Mercado Libre Chile, sitio MLC) para las propiedades de la corredora: port al servidor de
// desktop/src/portales/mercadolibre.js (revisar la ficha, publicar, actualizar, pausar/reactivar/finalizar, sincronizar estados e
// interesados, rendimiento y bandeja). La app de escritorio y las herramientas de WhatsApp usan ESTA misma lógica.
//  · La conexión es de la CORREDORA (la conecta el administrador; ver mercadolibre.ts); cada llamada pasa por MercadoLibreService.
//  · POST /items con el atributo CMG_SITE = "POI" publica a la vez en Mercado Libre y Portal Inmobiliario.
//  · seller_contact.country_code2 + phone2 (WhatsApp, solo dígitos) son obligatorios desde el 01/10/2026.
// Endpoints (/v1/portal-inmobiliario): POST revisar · POST publicar · POST aviso (pausar|reactivar|actualizar|finalizar) · POST sincronizar ·
// GET rendimiento · GET interesados.
import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ActividadService } from '../comun/actividad.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ConexionesService } from './conexiones';
import { MercadoLibreService } from './mercadolibre';
import { PropiedadesService } from '../propiedades/propiedades.service';
import { PersonasAccionesService } from '../personas/personas-acciones';
import * as FC from '../propiedades/ficha-campos';
import { normalizar, rutValido } from '../comun/texto';

const ROOT = 'MLC1459'; // Inmuebles (Chile)
const PORTAL = 'Portal Inmobiliario';
const TIPO_ML: Record<string, string> = {
  casa: 'Casas', departamento: 'Departamentos', oficina: 'Oficinas', sitio: 'Sitios', local_comercial: 'Locales', industrial: 'Industriales',
  agricola: 'Agrícolas', parcela: 'Parcelas', estacionamiento: 'Estacionamientos', terreno_construccion: 'Terrenos', bodega: 'Bodegas',
};
const MIN_FOTOS: Record<string, number> = { casa: 12, departamento: 12, oficina: 12, parcela: 12, estacionamiento: 4 };
const MONEDA: Record<string, string> = { UF: 'CLF', CLP: 'CLP', USD: 'USD' };
const NOMBRE_ATR: Record<string, string> = { TOTAL_AREA: 'superficie total', COVERED_AREA: 'superficie útil', BEDROOMS: 'dormitorios', FULL_BATHROOMS: 'baños', PARKING_LOTS: 'estacionamientos', WAREHOUSES: 'bodegas' };
const EXTRANJEROS = /china|inglaterra|usa|argentina|peru|bolivia/i;
const ESTADO_TXT: Record<string, string> = { active: 'activo', paused: 'pausado', closed: 'finalizado', under_review: 'en revisión', inactive: 'inactivo' };
const CANAL: Record<string, string> = { whatsapp: 'WhatsApp', question: 'pregunta', call: 'llamada', schedule: 'solicitud de visita', quotation: 'cotización' };
const CAMPOS_AVISO = ['titulo', 'tituloPortal', 'precioVenta', 'precioArriendo', 'fotos', 'descripcion', 'direccion', 'unidad'];
const SIN: Record<string, string> = {
  'superficie terraza': 'supTerraza', 'cantidad de pisos': 'pisos', 'numero de piso de la unidad': 'pisoUnidad', 'piso de la unidad': 'pisoUnidad', ascensores: 'ascensores',
  antiguedad: 'anio', 'ano de construccion': 'anio', 'admite mascotas': 'mascotas', 'permite mascotas': 'mascotas', suites: 'suites', 'cantidad de suites': 'suites',
  ambientes: 'ambientes', 'tipo de calefaccion': 'calefaccion', calefaccion: 'calefaccion', orientacion: 'orientacion', 'tipo de casa': 'tipoCasa',
  'tipo de departamento': 'subtipo', 'tipo de seguridad': 'tipoSeguridad', 'horario de contacto': 'horarioContacto', 'con piscina': 'piscina', piscina: 'piscina',
  gimnasio: 'gimnasio', 'con gimnasio': 'gimnasio',
};
type Op = 'venta' | 'arriendo';
type J = Record<string, any>;
const nn = (s: unknown) => normalizar(String(s ?? '')).replace(/[^a-z0-9]+/g, ' ').trim();
const nc = (s: unknown) => normalizar(String(s ?? '')).replace(/[^a-z0-9]/g, '');

export function whatsappDe(n: unknown) {
  let d = String(n ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 9 && d.startsWith('9')) d = '56' + d;
  if (!d.startsWith('56') || d.length < 10) return null;
  return { country_code2: '56', phone2: d.slice(2) };
}
function tituloAviso(p: J, max: number) {
  const t = String(p.tituloPortal || p.titulo || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max + 1).replace(/\s+\S*$/, '').slice(0, max);
}
function mensajeMl(r: { status: number; cuerpo: any }) {
  const j = r.cuerpo || {};
  const causas = (j.cause || []).map((c: any) => (typeof c === 'string' ? c : c.message || c.code)).filter(Boolean);
  return [j.message || j.error || 'error ' + r.status, ...causas].join(' · ');
}

@Injectable()
export class PortalInmobiliarioService {
  /** categorías y ubicaciones: caché de 7 días en memoria */
  private readonly cache = new Map<string, { t: number; v: any }>();

  constructor(
    private readonly db: PrismaService,
    private readonly conexiones: ConexionesService,
    private readonly ml: MercadoLibreService,
    private readonly props: PropiedadesService,
    private readonly personas: PersonasAccionesService,
    private readonly actividad: ActividadService,
  ) {}

  // ------------------------------------------------------------------ configuración de la corredora (contacto y tipo de aviso)
  private async config(corredoraId: string): Promise<J> {
    const r = await this.db.registro.findUnique({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: 'corredora_config', id: 'corredora' } },
      select: { datos: true },
    });
    return (r?.datos ?? {}) as J;
  }
  private async guardarConfig(corredoraId: string, parcial: J) {
    const datos = { ...(await this.config(corredoraId)), ...parcial };
    await this.db.registro.upsert({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: 'corredora_config', id: 'corredora' } },
      create: { corredoraId, coleccion: 'corredora_config', id: 'corredora', datos: datos as Prisma.InputJsonObject },
      update: { datos: datos as Prisma.InputJsonObject, version: { increment: 1 } },
    });
  }

  // ------------------------------------------------------------------ conexión y llamadas
  /** ¿la corredora tiene su cuenta conectada? (y cuál) */
  async cuenta(u: UsuarioToken): Promise<{ activa: boolean; cuentaId: string | null; configurada: boolean; vencida: boolean }> {
    try {
      const r = await this.conexiones.estado(u, 'mercadolibre');
      const c = r.conexion;
      return { activa: c?.estado === 'activa', cuentaId: c?.cuentaId ?? null, configurada: true, vencida: c?.estado === 'vencida' };
    } catch {
      return { activa: false, cuentaId: null, configurada: false, vencida: false };
    }
  }
  private async exigirCuenta(u: UsuarioToken) {
    const c = await this.cuenta(u);
    if (!c.configurada) throw new BadRequestException('Portal Inmobiliario no está configurado en el servidor de Asset.');
    if (!c.activa)
      throw new ConflictException({ codigo: 'NECESITA_CONEXION', message: 'Conecta la cuenta de Portal Inmobiliario de la corredora (la conecta el administrador en Portales).' });
    if (!c.cuentaId) throw new ConflictException({ codigo: 'NECESITA_CONEXION', message: 'No se sabe qué cuenta de Mercado Libre está conectada: vuelve a conectarla.' });
    return c.cuentaId;
  }
  private llamada(u: UsuarioToken, metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', ruta: string, cuerpo?: unknown) {
    return this.ml.llamar(u, { metodo, ruta, ...(cuerpo !== undefined ? { cuerpo } : {}) }) as Promise<{ status: number; cuerpo: any }>;
  }
  private async api(u: UsuarioToken, metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', ruta: string, cuerpo?: unknown) {
    const r = await this.llamada(u, metodo, ruta, cuerpo);
    if (r.status >= 400) throw new BadRequestException(`${PORTAL}: ${mensajeMl(r)}`);
    return r.cuerpo;
  }
  private async pub(u: UsuarioToken, ruta: string) {
    const hit = this.cache.get(ruta);
    if (hit && Date.now() - hit.t < 7 * 864e5) return hit.v;
    const r = await this.llamada(u, 'GET', ruta);
    if (r.status !== 200) throw new BadRequestException(`No se pudo consultar Mercado Libre (${ruta}): ${mensajeMl(r)}`);
    this.cache.set(ruta, { t: Date.now(), v: r.cuerpo });
    return r.cuerpo;
  }

  // ------------------------------------------------------------------ categoría, ubicación
  private async categoria(u: UsuarioToken, tipo: string, op: Op) {
    const raiz = await this.pub(u, '/categories/' + ROOT);
    const t = raiz.children_categories.find((c: J) => nc(c.name) === nc(TIPO_ML[tipo]));
    if (!t) throw new BadRequestException(`Portal Inmobiliario no tiene la categoría «${TIPO_ML[tipo] || tipo}».`);
    let cat = await this.pub(u, '/categories/' + t.id);
    const ruta = [t.name];
    const o = cat.children_categories.find((c: J) => nc(c.name) === (op === 'venta' ? 'venta' : 'arriendo'));
    if (!o) throw new BadRequestException(`«${t.name}» no admite ${op} en Portal Inmobiliario.`);
    cat = await this.pub(u, '/categories/' + o.id);
    ruta.push(o.name);
    while (cat.children_categories?.length) {
      // subtipo: propiedades usadas (los proyectos nuevos van por otra vía)
      const s = cat.children_categories.find((c: J) => /usad/i.test(c.name)) || cat.children_categories[0];
      cat = await this.pub(u, '/categories/' + s.id);
      ruta.push(s.name);
    }
    return { id: cat.id as string, ruta, maxTitulo: (cat.settings?.max_title_length as number) || 60 };
  }
  private async ubicacion(u: UsuarioToken, comuna: string, region: string) {
    if (!comuna) throw new BadRequestException('Falta la comuna de la propiedad.');
    const pais = await this.pub(u, '/classified_locations/countries/CL');
    const nr = nc(region);
    const states = pais.states.filter((s: J) => !EXTRANJEROS.test(s.name));
    const orden = [
      ...states.filter(
        (s: J) =>
          nr &&
          (nr.includes(nc(s.name).replace('rm', '')) ||
            nc(s.name).includes(nr.slice(0, 8)) ||
            (nr.includes('metropolitana') && /metropolitana/i.test(s.name)) ||
            (nr.includes('higgins') && /higgins/i.test(s.name))),
      ),
      ...states,
    ];
    const vistos = new Set<string>();
    for (const s of orden) {
      if (vistos.has(s.id)) continue;
      vistos.add(s.id);
      const st = await this.pub(u, '/classified_locations/states/' + s.id);
      const c = (st.cities || []).find((x: J) => nc(x.name) === nc(comuna));
      if (c) {
        const city = await this.pub(u, '/classified_locations/cities/' + c.id);
        return {
          state: { id: s.id, name: s.name },
          city: { id: c.id, name: c.name },
          barrios: (city.neighborhoods || []).map((n: J) => ({ id: n.id, name: n.name })),
        };
      }
    }
    throw new BadRequestException(`Portal Inmobiliario no reconoce la comuna «${comuna}». Revísala en la ficha.`);
  }

  // ------------------------------------------------------------------ revisar la ficha y armar el aviso
  /** Revisa la ficha y arma el aviso. `errores` = no se puede publicar; `avisos` = baja la calidad del aviso. */
  async revisar(u: UsuarioToken, propId: string, op: Op, opts: { tituloPortal?: string; tipoAviso?: string } = {}) {
    const p: J = await this.props.obtener(u, propId);
    const errores: string[] = [];
    const avisos: string[] = [];
    if (!(op === 'venta' ? p.venta : p.arriendo)) throw new BadRequestException(`La propiedad no está marcada en ${op}.`);
    const precio = op === 'venta' ? p.precioVenta : p.precioArriendo;
    if (!precio?.valor) errores.push(`Falta el precio de ${op}.`);
    let cat: Awaited<ReturnType<PortalInmobiliarioService['categoria']>> | null = null;
    try {
      cat = await this.categoria(u, p.tipo, op);
    } catch (e) {
      errores.push((e as Error).message);
    }
    let ub: Awaited<ReturnType<PortalInmobiliarioService['ubicacion']>> | null = null;
    try {
      ub = await this.ubicacion(u, p.comuna, p.region);
    } catch (e) {
      errores.push((e as Error).message);
    }
    if (!String(p.direccion || '').trim()) errores.push('Falta la dirección.');
    const fotos: string[] = (p.fotos || []).filter((x: string) => /^https:\/\//.test(x)).slice(0, 30);
    if (!fotos.length) errores.push('El aviso necesita al menos una foto.');
    const minF = MIN_FOTOS[p.tipo] || 6;
    if (fotos.length && fotos.length < minF)
      avisos.push(`Tiene ${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}; Portal Inmobiliario pide ${minF} o más para la mejor calidad de aviso.`);
    if (!String(p.descripcion || '').trim()) avisos.push('Sin descripción: agrega una para mejorar la calidad del aviso.');
    const cfg = await this.config(u.corredoraId);
    const c: J = cfg.contacto || {};
    const wa = whatsappDe(c.whatsapp);
    if (!wa) errores.push('Configura el WhatsApp de contacto de la corredora en «Portales» (obligatorio desde el 01/10/2026).');
    const tituloBase = opts.tituloPortal !== undefined ? { ...p, tituloPortal: opts.tituloPortal } : p;
    const titulo = cat ? tituloAviso(tituloBase, cat.maxTitulo) : p.titulo;
    if (cat && String(tituloBase.tituloPortal || p.titulo).trim().length > cat.maxTitulo)
      avisos.push(`El título se acorta a ${cat.maxTitulo} caracteres: «${titulo}». Puedes escribir uno especial para el portal.`);
    // atributos
    const attrs: J[] = [];
    let catAttrs: J[] = [];
    if (cat) {
      try {
        catAttrs = await this.pub(u, `/categories/${cat.id}/attributes`);
      } catch {
        avisos.push('No se pudieron leer los atributos de la categoría; se envían los básicos.');
      }
    }
    const existe = (id: string) => !catAttrs.length || catAttrs.some((a) => a.id === id);
    const add = (id: string, v: unknown, fmt: (x: any) => string = (x) => String(x)) => {
      if (v != null && v !== '' && existe(id)) attrs.push({ id, value_name: fmt(v) });
    };
    const m2 = (x: unknown) => `${Math.round(Number(x) * 100) / 100} m²`;
    add('TOTAL_AREA', p.supTotal ?? p.supUtil, m2);
    add('COVERED_AREA', p.supUtil ?? p.supTotal, m2);
    add('BEDROOMS', p.dormitorios);
    add('FULL_BATHROOMS', p.banos);
    add('PARKING_LOTS', p.estacionamientos ?? (['casa', 'departamento', 'oficina'].includes(p.tipo) ? 0 : null));
    add('WAREHOUSES', p.bodegas);
    if (existe('FURNISHED')) attrs.push({ id: 'FURNISHED', value_name: p.amoblado ? 'Sí' : 'No' });
    add('MAINTENANCE_FEE', p.gastosComunes, (x) => `${Math.round(x)} CLP`);
    add('PROPERTY_CODE', p.codigo);
    // el resto de la ficha (★ en Prop360): se cruza por nombre con los atributos que pide la categoría
    if (catAttrs.length) {
      const porNombre = Object.fromEntries(FC.CAMPOS.filter((x) => x.pi && !x.plano && !x.virtual).map((x) => [nn(x.t), x]));
      for (const a of catAttrs) {
        if (attrs.some((y) => y.id === a.id)) continue;
        const key = nn(a.name);
        const campo = FC.POR_ID[SIN[key]] || porNombre[key] || porNombre[key.replace(/^con /, '')] || porNombre[key.replace(/^tiene /, '')];
        if (!campo) continue;
        let v = p.ficha?.[campo.id];
        if (v == null) continue;
        if (campo.id === 'anio' && /antiguedad/.test(key)) v = new Date().getFullYear() - Number(v);
        if (a.value_type === 'boolean' || campo.k === 'bool') {
          attrs.push({ id: a.id, value_name: v ? 'Sí' : 'No' });
          continue;
        }
        if (Array.isArray(a.values) && a.values.length && a.value_type === 'list') {
          const m = a.values.find((x: J) => nn(x.name) === nn(v)) || a.values.find((x: J) => nn(x.name).includes(nn(v)) || nn(v).includes(nn(x.name)));
          if (m) attrs.push({ id: a.id, value_id: m.id, value_name: m.name });
          else avisos.push(`«${campo.t}: ${v}» no calza con las opciones de Portal Inmobiliario; no se envía.`);
          continue;
        }
        if (a.value_type === 'number_unit') {
          attrs.push({ id: a.id, value_name: campo.id === 'supTerraza' ? m2(v) : String(v) });
          continue;
        }
        attrs.push({ id: a.id, value_name: String(v) });
      }
    }
    attrs.push({ id: 'CMG_SITE', value_name: 'POI' }); // visible también en Portal Inmobiliario
    for (const a of catAttrs.filter((x) => x.tags?.required)) if (!attrs.some((y) => y.id === a.id)) errores.push(`Falta ${NOMBRE_ATR[a.id] || '«' + a.name + '»'}.`);
    {
      // lo esencial que falte (ej. el N° de depto) impide publicar; lo clave para portales que falte baja la calidad del aviso
      const av = FC.avance({ ...p, ocultarDueno: true } as FC.PropFicha);
      for (const t of av[0].faltanClave) if (!errores.some((e) => e.includes(t))) errores.push(`Falta ${t} (dato clave de la ficha).`);
      for (const t of av[1].faltanClave) (/^Piso en que/.test(t) ? errores : avisos).push(`Falta ${t} en la ficha.`);
    }
    if (p.supUtil == null && p.supTotal != null && existe('COVERED_AREA')) avisos.push('Sin superficie útil: se informa la total también como útil.');
    if (p.estacionamientos == null && attrs.some((a) => a.id === 'PARKING_LOTS' && a.value_name === '0')) avisos.push('Sin estacionamientos registrados: se publica con 0.');
    let barrio: J | null = null;
    try {
      barrio = typeof p.portalBarrio === 'string' && p.portalBarrio.startsWith('{') ? JSON.parse(p.portalBarrio) : null;
    } catch {
      barrio = null;
    }
    const location = ub
      ? { address_line: [p.direccion, p.unidad ? 'depto. ' + p.unidad : ''].filter(Boolean).join(', '), city: { id: ub.city.id }, state: { id: ub.state.id }, ...(barrio?.id ? { neighborhood: { id: barrio.id } } : {}) }
      : null;
    const tipoAviso = opts.tipoAviso || cfg.ml?.tipoAviso || 'silver';
    const desc = [String(p.descripcion || '').trim(), `Código: ${p.codigo}`].filter(Boolean).join('\n\n');
    const payload = {
      title: titulo, category_id: cat?.id, price: precio?.valor, currency_id: MONEDA[precio?.moneda] || 'CLF', available_quantity: 1, buying_mode: 'classified',
      listing_type_id: tipoAviso, condition: 'used', channels: ['marketplace'], description: { plain_text: desc }, pictures: fotos.map((source) => ({ source })),
      location, seller_contact: { contact: c.nombre || '', email: c.email || '', phone: String(c.telefono || '').replace(/\D/g, ''), country_code: '56', webpage: c.web || '', ...(wa || {}) },
      attributes: attrs, seller_custom_field: p.codigo,
    };
    // paquete disponible
    let paquete: number | null = null;
    const cuenta = await this.cuenta(u);
    if (cuenta.activa && cuenta.cuentaId) {
      try {
        const r = await this.api(u, 'GET', `/users/${cuenta.cuentaId}/classifieds_promotion_packs/${tipoAviso}`);
        const lista = Array.isArray(r) ? r : r ? [r] : [];
        const quedan = lista.reduce((s: number, x: J) => s + (Number(x.remaining_listings) || 0), 0);
        paquete = quedan;
        if (!p.portales?.pi?.[op]?.itemId && quedan <= 0)
          errores.push(`No quedan publicaciones disponibles en el paquete «${tipoAviso}». La corredora debe contratar uno en Mercado Libre.`);
      } catch (e) {
        avisos.push('No se pudo consultar el paquete de publicaciones.' + ((e as Error).message ? '' : ''));
      }
    } else errores.push('Conecta la cuenta de Portal Inmobiliario de la corredora en «Portales».');
    return { errores, avisos, payload, categoria: cat, ubicacion: ub, barrio, fotos: fotos.length, minFotos: minF, tipoAviso, paquete, titulo, aviso: (p.portales?.pi?.[op] as J) || null, propiedad: { id: p.id as string, codigo: p.codigo as string } };
  }

  // ------------------------------------------------------------------ guardar el estado del aviso en la ficha
  /** deja anotado el aviso (itemId, estado, enlace…) en `portales.pi` de la propiedad: sube su versión y queda en el historial */
  private async guardarAviso(u: UsuarioToken, propId: string, op: Op, datos: J, texto?: string) {
    const fila = await this.db.propiedad.findFirst({ where: { id: propId, corredoraId: u.corredoraId, eliminadoEn: null }, select: { portales: true } });
    if (!fila) return;
    const portales = { ...((fila.portales as J) ?? {}) };
    portales.pi = { ...(portales.pi || {}) };
    portales.pi[op] = { ...(portales.pi[op] || {}), ...datos, actualizado: new Date().toISOString() };
    await this.db.propiedad.update({ where: { id: propId }, data: { portales: portales as Prisma.InputJsonValue, version: { increment: 1 } } });
    if (texto) await this.actividad.registrar({ corredoraId: u.corredoraId, entidadTipo: 'propiedad', entidadId: propId, texto, usuarioId: u.sub });
  }
  private async avisoDe(u: UsuarioToken, propId: string, op: Op): Promise<J | null> {
    const p: J = await this.props.obtener(u, propId);
    return (p.portales?.pi?.[op] as J) || null;
  }

  // ------------------------------------------------------------------ publicar, actualizar, estado
  async publicar(u: UsuarioToken, propId: string, op: Op, opts: { tituloPortal?: string; tipoAviso?: string } = {}) {
    if (opts.tituloPortal !== undefined) await this.props.actualizar(u, propId, { tituloPortal: String(opts.tituloPortal).trim() });
    const r = await this.revisar(u, propId, op, opts);
    if (r.errores.length) throw new BadRequestException('No se puede publicar todavía: ' + r.errores.join(' '));
    const a = await this.avisoDe(u, propId, op);
    if (a?.itemId && a.status !== 'closed') return this.actualizar(u, propId, op);
    const item = await this.api(u, 'POST', '/items', r.payload);
    await this.guardarAviso(
      u, propId, op,
      { itemId: item.id, permalink: item.permalink, status: item.status, tipoAviso: r.tipoAviso, publicado: new Date().toISOString(), error: null },
      `Publicada en ${PORTAL} (${op}): ${item.id}`,
    );
    return { aviso: await this.avisoDe(u, propId, op), accion: 'publicado' as const };
  }
  async actualizar(u: UsuarioToken, propId: string, op: Op) {
    const a = await this.avisoDe(u, propId, op);
    if (!a?.itemId) throw new BadRequestException('Esta propiedad no tiene aviso en Portal Inmobiliario.');
    const r = await this.revisar(u, propId, op);
    const graves = r.errores.filter((e) => !/paquete/.test(e));
    if (graves.length) throw new BadRequestException(graves.join(' '));
    const { title, price, pictures, seller_contact } = r.payload;
    const item = await this.api(u, 'PUT', `/items/${a.itemId}`, { title, price, pictures, seller_contact });
    await this.llamada(u, 'PUT', `/items/${a.itemId}/description`, { plain_text: r.payload.description.plain_text }).catch(() => null);
    await this.guardarAviso(u, propId, op, { status: item.status || a.status, permalink: item.permalink || a.permalink, error: null }, `Aviso de ${PORTAL} actualizado (${op})`);
    return { aviso: await this.avisoDe(u, propId, op), accion: 'actualizado' as const };
  }
  async cambiarEstado(u: UsuarioToken, propId: string, op: Op, status: 'active' | 'paused' | 'closed', motivo?: string) {
    const a = await this.avisoDe(u, propId, op);
    if (!a?.itemId) throw new BadRequestException('Esta propiedad no tiene aviso en Portal Inmobiliario.');
    const item = await this.api(u, 'PUT', `/items/${a.itemId}`, { status });
    await this.guardarAviso(u, propId, op, { status: item.status || status, pausadoPorEstado: status === 'paused' && !!motivo }, `Aviso de ${PORTAL} ${ESTADO_TXT[status]} (${op})${motivo ? ': ' + motivo : ''}`);
    return { aviso: await this.avisoDe(u, propId, op), accion: ({ active: 'reactivado', paused: 'pausado', closed: 'finalizado' } as const)[status] };
  }
  /** pausar | reactivar | actualizar | finalizar el aviso */
  async accion(u: UsuarioToken, propId: string, op: Op, accion: 'pausar' | 'reactivar' | 'actualizar' | 'finalizar') {
    if (accion === 'actualizar') return this.actualizar(u, propId, op);
    return this.cambiarEstado(u, propId, op, { pausar: 'paused', reactivar: 'active', finalizar: 'closed' }[accion] as 'paused' | 'active' | 'closed');
  }

  /** La ficha cambió: el aviso se mantiene al día solo (precio, fotos, título, estado comercial). Nunca lanza. */
  async reaccionar(u: UsuarioToken, antes: J, p: J): Promise<string[]> {
    if (!p.portales?.pi || !Object.values(p.portales.pi).some((a: any) => a?.itemId)) return [];
    if (!(await this.cuenta(u)).activa) return [];
    const out: string[] = [];
    for (const op of ['venta', 'arriendo'] as const) {
      const a = p.portales.pi[op];
      if (!a?.itemId || a.status === 'closed') continue;
      const k = op === 'venta' ? 'estadoVenta' : 'estadoArriendo';
      const e0 = antes[k];
      const e1 = p[k];
      try {
        if (e0 !== e1 && ['vendida', 'arrendada', 'no_disponible', 'reservada'].includes(e1) && a.status === 'active') {
          await this.cambiarEstado(u, p.id, op, 'paused', `la propiedad quedó ${String(e1).replace('_', ' ')}`);
          out.push(`Aviso de ${op} pausado en Portal Inmobiliario.`);
          continue;
        }
        if (e0 !== e1 && e1 === 'disponible' && a.status === 'paused' && a.pausadoPorEstado) {
          await this.cambiarEstado(u, p.id, op, 'active');
          out.push(`Aviso de ${op} reactivado en Portal Inmobiliario.`);
          continue;
        }
        if (a.status === 'active' && CAMPOS_AVISO.some((c) => JSON.stringify(antes[c]) !== JSON.stringify(p[c]))) {
          await this.actualizar(u, p.id, op);
          out.push(`Aviso de ${op} actualizado en Portal Inmobiliario.`);
        }
      } catch (e) {
        await this.guardarAviso(u, p.id, op, { error: (e as Error).message }).catch(() => null);
        out.push(`No se pudo actualizar el aviso de ${op}: ${(e as Error).message}`);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ sincronizar: estados de los avisos e interesados
  private async todasLasPropiedades(u: UsuarioToken): Promise<J[]> {
    const r = await this.props.listar(u, { archivadas: 'no', limite: 500 });
    return r.items as J[];
  }
  async sincronizar(u: UsuarioToken) {
    const cuentaId = await this.exigirCuenta(u);
    const props = await this.todasLasPropiedades(u);
    const lista: { p: J; op: Op; a: J }[] = [];
    for (const p of props) for (const op of ['venta', 'arriendo'] as const) {
      const a = p.portales?.pi?.[op];
      if (a?.itemId) lista.push({ p, op, a });
    }
    let cambiados = 0;
    for (let i = 0; i < lista.length; i += 20) {
      const parte = lista.slice(i, i + 20);
      const r = await this.api(u, 'GET', '/items?ids=' + parte.map((x) => x.a.itemId).join(','));
      for (const it of r || []) {
        if (it.code !== 200 || !it.body) continue;
        const x = parte.find((y) => y.a.itemId === it.body.id);
        if (!x || x.a.status === it.body.status) continue;
        await this.guardarAviso(u, x.p.id, x.op, { status: it.body.status, permalink: it.body.permalink || x.a.permalink }, `${PORTAL} informa aviso ${ESTADO_TXT[it.body.status] || it.body.status} (${x.op})`);
        cambiados++;
      }
    }
    const nuevos = await this.traerInteresados(u, cuentaId, props);
    const cfg = await this.config(u.corredoraId);
    await this.guardarConfig(u.corredoraId, { ml: { ...(cfg.ml || {}), ultimaSync: new Date().toISOString() } });
    return { avisos: lista.length, estadosCambiados: cambiados, interesadosNuevos: nuevos };
  }
  private async traerInteresados(u: UsuarioToken, cuentaId: string, props: J[]) {
    const cfg = await this.config(u.corredoraId);
    const hoy = new Date();
    const desde = cfg.ml?.leadsDesde ? new Date(cfg.ml.leadsDesde) : new Date(Date.now() - 30 * 864e5);
    const f = (d: Date) => d.toISOString().slice(0, 10);
    const porItem = new Map<string, string>();
    for (const p of props) for (const op of ['venta', 'arriendo']) {
      const a = p.portales?.pi?.[op];
      if (a?.itemId) porItem.set(a.itemId, p.id);
    }
    let nuevos = 0;
    let offset = 0;
    for (let vuelta = 0; vuelta < 40; vuelta++) {
      const r = await this.api(u, 'GET', `/vis/users/${cuentaId}/leads/buyers?date_from=${f(desde)}&date_to=${f(hoy)}&limit=50&offset=${offset}`);
      const res: J[] = r?.results || [];
      if (!res.length) break;
      for (const b of res)
        for (const l of b.leads || []) {
          const propId = porItem.get(l.item_id || b.item_id);
          if (!propId) continue;
          const canal = l.channel || l.contact_type;
          if (
            await this.registrarInteresado(u, propId, {
              id: l.id || l.uuid, portal: PORTAL, canal, canalTxt: CANAL[canal] || canal, nombre: b.name, email: b.email, telefono: b.phone,
              rut: b.identification_type === 'RUT' ? b.identification_number : null, fecha: l.created_at, itemId: l.item_id || b.item_id, visto: false,
            })
          )
            nuevos++;
        }
      offset += res.length;
      if (res.length < 50) break;
    }
    const cfg2 = await this.config(u.corredoraId);
    await this.guardarConfig(u.corredoraId, { ml: { ...(cfg2.ml || {}), leadsDesde: f(new Date(Date.now() - 2 * 864e5)), ultimosLeads: new Date().toISOString() } });
    return nuevos;
  }
  /** un interesado que llegó del portal: queda en la ficha de la propiedad, en el CRM (rol interesado) y vinculado. false si ya estaba. */
  async registrarInteresado(u: UsuarioToken, propId: string, l: J) {
    const fila = await this.db.propiedad.findFirst({ where: { id: propId, corredoraId: u.corredoraId, eliminadoEn: null }, select: { leadsPortal: true } });
    if (!fila) return false;
    const leads: J[] = Array.isArray(fila.leadsPortal) ? [...(fila.leadsPortal as J[])] : [];
    if (leads.some((x) => x.id === l.id)) return false;
    leads.unshift({ ...l, recibido: new Date().toISOString() });
    leads.length = Math.min(leads.length, 300);
    await this.db.propiedad.update({ where: { id: propId }, data: { leadsPortal: leads as Prisma.InputJsonValue, version: { increment: 1 } } });
    await this.actividad.registrar({ corredoraId: u.corredoraId, entidadTipo: 'propiedad', entidadId: propId, texto: `Nuevo interesado desde ${l.portal}: ${l.nombre || 'sin nombre'} (${l.canalTxt || l.canal})`, tipo: 'lead', usuarioId: u.sub });
    const c = await this.personas.deContacto(u, { nombre: l.nombre, telefono: l.telefono, email: l.email, rut: l.rut && rutValido(l.rut) ? l.rut : null, origen: l.portal });
    if (c) await this.props.vincular(u, propId, { personaId: c.id, rol: 'interesado' }).catch(() => null);
    return true;
  }

  // ------------------------------------------------------------------ calidad, rendimiento y bandeja
  private calidad(p: J, op: Op, contacto: J) {
    const fotos = (p.fotos || []).filter((x: string) => /^https:\/\//.test(x)).length;
    const titulo = String(p.tituloPortal || p.titulo || '').trim();
    const desc = String(p.descripcion || '').trim();
    const precio = op === 'venta' ? p.precioVenta : p.precioArriendo;
    const viv = ['casa', 'departamento', 'parcela', 'oficina'].includes(p.tipo);
    const items = [
      { id: 'precio', ok: !!precio?.valor, peso: 15, falta: `Falta el precio de ${op}.` },
      { id: 'direccion', ok: !!(String(p.direccion || '').trim() && String(p.comuna || '').trim()), peso: 10, falta: 'Falta la dirección o la comuna.' },
      { id: 'fotos', ok: fotos >= 8, parcial: fotos >= 1 && fotos < 8, peso: 25, falta: fotos ? `Tiene ${fotos} ${fotos === 1 ? 'foto' : 'fotos'}; los avisos con 8 o más reciben muchas más visitas.` : 'Sin fotos: ningún portal publica sin al menos una.' },
      { id: 'titulo', ok: titulo.length >= 25 && titulo.length <= 60, parcial: titulo.length > 0, peso: 10, falta: !titulo ? 'Falta el título.' : titulo.length > 60 ? `El título tiene ${titulo.length} caracteres; Portal Inmobiliario acepta 60.` : 'El título es muy corto: di tipo, lo mejor y la ubicación.' },
      { id: 'descripcion', ok: desc.length >= 300, parcial: desc.length >= 80, peso: 15, falta: desc ? `La descripción tiene ${desc.length} caracteres; con 300 o más se explica mejor la propiedad.` : 'Sin descripción.' },
      { id: 'superficie', ok: !!(p.supTotal || p.supUtil), peso: 10, falta: 'Falta la superficie en m².' },
      ...(viv ? [{ id: 'programa', ok: p.dormitorios != null && p.banos != null, peso: 5, falta: 'Faltan dormitorios o baños.' }] : []),
      ...(['departamento', 'oficina'].includes(p.tipo) ? [{ id: 'gc', ok: p.gastosComunes != null, peso: 5, falta: 'Faltan los gastos comunes.' }] : []),
      { id: 'contacto', ok: !!String(contacto.whatsapp || '').trim(), peso: 5, falta: 'Configura el WhatsApp de la corredora (Portal Inmobiliario lo exige).' },
    ] as { id: string; ok: boolean; parcial?: boolean; peso: number; falta: string }[];
    const total = items.reduce((s, x) => s + x.peso, 0);
    const pts = items.reduce((s, x) => s + (x.ok ? x.peso : x.parcial ? x.peso / 2 : 0), 0);
    return { puntaje: Math.round((pts / total) * 100), faltas: items.filter((x) => !x.ok).map((x) => x.falta) };
  }
  private precioM2(p: J, op: Op) {
    const pr = op === 'venta' ? p.precioVenta : p.precioArriendo;
    const m2 = p.supUtil || p.supTotal;
    return pr?.valor && m2 ? { v: pr.valor / m2, moneda: pr.moneda } : null;
  }
  private comparables(p: J, op: Op, todas: J[]) {
    const yo = this.precioM2(p, op);
    if (!yo) return null;
    const pares = todas
      .filter((x) => x.id !== p.id && !x.archivada && x.tipo === p.tipo && nc(x.comuna) === nc(p.comuna) && (op === 'venta' ? x.venta : x.arriendo))
      .map((x) => this.precioM2(x, op))
      .filter((x): x is { v: number; moneda: string } => !!x && x.moneda === yo.moneda)
      .map((x) => x.v)
      .sort((a, b) => a - b);
    if (pares.length < 2) return { n: pares.length, dif: null as number | null };
    const med = pares[Math.floor(pares.length / 2)];
    return { n: pares.length, dif: Math.round((yo.v / med - 1) * 100) };
  }

  /** cómo van los avisos: visitas, contactos, interesados, calidad y recomendaciones (de una propiedad o de todas) */
  async rendimiento(u: UsuarioToken, propId?: string) {
    const props = await this.todasLasPropiedades(u);
    const cfg = await this.config(u.corredoraId);
    const contacto: J = cfg.contacto || {};
    const cuenta = await this.cuenta(u);
    const avisos: J[] = [];
    for (const p of props) {
      if (propId && p.id !== propId) continue;
      for (const op of ['venta', 'arriendo'] as const) {
        if (!(op === 'venta' ? p.venta : p.arriendo)) continue;
        const a = p.portales?.pi?.[op];
        if (!a?.itemId) continue;
        // visitas y teléfonos de los últimos 30 días (si hay cuenta conectada); si no, lo último que quedó guardado
        let stats: J | null = a.stats || null;
        if (cuenta.activa && a.status !== 'closed') {
          const [v, t] = await Promise.all([
            this.llamada(u, 'GET', `/items/${a.itemId}/visits/time_window?last=30&unit=day`).catch(() => null),
            this.llamada(u, 'GET', `/items/${a.itemId}/contacts/phone_views/time_window?last=30&unit=day`).catch(() => null),
          ]);
          if (v && v.status === 200) {
            const interesados = (p.leads || []).filter((l: J) => l.itemId === a.itemId).length;
            const tel = t && t.status === 200 ? (t.cuerpo?.total ?? t.cuerpo?.total_phone_views ?? 0) : 0;
            stats = { visitas: v.cuerpo?.total_visits ?? 0, contactos: tel + interesados, telefonos: tel, dias: 30, al: new Date().toISOString() };
            await this.guardarAviso(u, p.id, op, { stats });
          }
        }
        const desde = a.publicado || null;
        const dias = desde ? Math.floor((Date.now() - new Date(desde).getTime()) / 864e5) : 0;
        const interesados = (p.leads || []).filter((l: J) => l.itemId === a.itemId).length;
        const vis = stats?.visitas || 0;
        const con = (stats?.contactos || 0) + (stats ? 0 : interesados);
        const comp = this.comparables(p, op, props);
        const rec: string[] = [];
        const precio = op === 'venta' ? p.precioVenta : p.precioArriendo;
        if (comp?.dif != null && comp.dif >= 12 && precio)
          rec.push(`El m² está ${comp.dif}% sobre la mediana de ${comp.n} propiedades parecidas de tu cartera en ${p.comuna}. Evalúa bajar a ${Math.round(precio.valor * (1 - Math.min(comp.dif, 15) / 100) * 100) / 100} ${precio.moneda}.`);
        if (dias >= 21 && con === 0) rec.push(`${dias} días publicada sin contactos: baja el precio entre 3% y 5% o renueva fotos y título.`);
        else if (vis >= 80 && con / Math.max(vis, 1) < 0.01) rec.push(`${vis} visitas y solo ${con} contactos: revisa precio, primera foto y que la descripción responda lo básico.`);
        if (dias >= 7 && vis < 20) rec.push(`Pocas visitas (${vis}) en ${dias} días: mejora el título con lo mejor de la propiedad.`);
        const q = this.calidad(p, op, contacto);
        if (q.puntaje < 70) rec.push(`Calidad del aviso ${q.puntaje}/100: ${q.faltas.slice(0, 2).join(' ')}`);
        avisos.push({ propId: p.id, codigo: p.codigo, titulo: p.titulo, op, estado: a.status, enlace: a.permalink || null, dias, visitas: vis, contactos: con, interesados, calidad: q.puntaje, recomendaciones: rec });
      }
    }
    const sinPublicar = props
      .filter((p) => !propId && ((p.venta && p.estadoVenta === 'disponible' && !p.portales?.pi?.venta?.itemId) || (p.arriendo && p.estadoArriendo === 'disponible' && !p.portales?.pi?.arriendo?.itemId)))
      .slice(0, 10)
      .map((p) => p.codigo as string);
    return {
      conectada: cuenta.activa,
      totales: { avisos: avisos.length, visitas: avisos.reduce((s, x) => s + x.visitas, 0), contactos: avisos.reduce((s, x) => s + x.contactos, 0), alertas: avisos.filter((x) => x.recomendaciones.length).length },
      avisos,
      sinPublicar,
    };
  }

  /** bandeja de interesados de los portales (nuevos, contactados, en visita) */
  async bandeja(u: UsuarioToken, estado?: string, propId?: string) {
    const props = await this.todasLasPropiedades(u);
    const cuenta: Record<string, number> = { nuevo: 0, contactado: 0, visita: 0, descartado: 0 };
    const l: J[] = [];
    for (const p of props)
      for (const x of ((propId && p.id !== propId ? [] : p.leads) || []) as J[]) {
        const e = x.estado || (x.visto ? 'contactado' : 'nuevo');
        cuenta[e] = (cuenta[e] || 0) + 1;
        if (estado && e !== estado) continue;
        l.push({ nombre: x.nombre, portal: x.portal, canal: x.canalTxt || x.canal, propiedad: p.codigo, estado: e, fecha: x.fecha || x.recibido, telefono: x.telefono, email: x.email, mensaje: x.mensaje ? String(x.mensaje).slice(0, 160) : null });
      }
    l.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    return { cuenta, interesados: l.slice(0, 15), total: l.length };
  }
}

const opEsquema = z.enum(['venta', 'arriendo']);
const revisarEsquema = z.object({ propiedadId: z.uuid(), operacion: opEsquema, tituloPortal: z.string().max(160).optional(), tipoAviso: z.enum(['silver', 'gold', 'gold_premium']).optional() });
const avisoEsquema = z.object({ propiedadId: z.uuid(), operacion: opEsquema, accion: z.enum(['pausar', 'reactivar', 'actualizar', 'finalizar']) });
const rendimientoEsquema = z.object({ propiedadId: z.uuid().optional() });
const bandejaEsquema = z.object({ estado: z.enum(['nuevo', 'contactado', 'visita', 'descartado']).optional() });

@Controller('portal-inmobiliario')
export class PortalInmobiliarioController {
  constructor(private readonly s: PortalInmobiliarioService) {}

  @Post('revisar')
  @HttpCode(200)
  revisar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(revisarEsquema)) b: z.infer<typeof revisarEsquema>) {
    return this.s.revisar(u, b.propiedadId, b.operacion, b);
  }

  @Post('publicar')
  @HttpCode(200)
  publicar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(revisarEsquema)) b: z.infer<typeof revisarEsquema>) {
    return this.s.publicar(u, b.propiedadId, b.operacion, b);
  }

  @Post('aviso')
  @HttpCode(200)
  aviso(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(avisoEsquema)) b: z.infer<typeof avisoEsquema>) {
    return this.s.accion(u, b.propiedadId, b.operacion, b.accion);
  }

  @Post('sincronizar')
  @HttpCode(200)
  sincronizar(@UsuarioActual() u: UsuarioToken) {
    return this.s.sincronizar(u);
  }

  @Get('rendimiento')
  rendimiento(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(rendimientoEsquema)) q: z.infer<typeof rendimientoEsquema>) {
    return this.s.rendimiento(u, q.propiedadId);
  }

  @Get('interesados')
  interesados(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(bandejaEsquema)) q: z.infer<typeof bandejaEsquema>) {
    return this.s.bandeja(u, q.estado);
  }
}
