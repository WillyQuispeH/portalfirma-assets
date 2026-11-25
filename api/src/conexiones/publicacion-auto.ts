/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-base-to-string, @typescript-eslint/no-explicit-any -- respuestas de KONVER y propiedades en el formato de la app (JSON sin tipo) */
// Publicación automática en los portales (en el servidor, con la app cerrada).
//
// Cuándo: al importar la cartera desde Convecta (toda la cartera) y al crear o editar una propiedad (solo esa). Solo si la
// corredora la tiene activada (colección privada «publicacion_auto» de registros; la activa soporte en asset-admin).
//
// Qué publica: cada operación (venta/arriendo) disponible de cada propiedad no archivada, en cada portal conectado, si la
// propiedad tiene los datos que el portal exige y si ese aviso NO existe ya:
//  · Portal Inmobiliario y TOCTOC por KONVER (la misma lógica que desktop/src/portales/konver.js, ahora en el servidor);
//  · los feeds (Chilepropiedades, Broku, Yapo) solo si su integración está activa en la configuración de la corredora y no
//    está pausada (hoy Chilepropiedades y Broku están pausados por orden del 2026-11-19).
//
// No duplicar: antes de publicar se DETECTA lo que ya está publicado en cada cuenta, lo haya publicado Asset, Convecta u otro
// sistema. KONVER lista todos los avisos de la cuenta de Mercado Libre (activos y pausados) y los de TOCTOC; cada aviso
// se cruza con su propiedad por referencia (<código>-V/-A), por el código de la propiedad en el aviso (Convecta lo deja en
// los atributos), por el id de Convecta o, si nada de eso, por calle + número + comuna. Lo que coincide queda vinculado en
// la propiedad (portales.pi / portales.toctoc, «vinculado») y ya no se publica. Lo que no coincide con ninguna propiedad
// queda en el informe para revisarlo. Si la detección de un portal falla, ese portal NO se publica en esa vuelta.
// Los feeds no se pueden consultar: si otro sistema ya manda la cartera a ese portal, habrá avisos repetidos (se informa).
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActividadService } from '../comun/actividad.service';
import { KonverService } from './konver';
import { WechatiaService } from '../whatsapp/wechatia';
import { eventosCartera, type EventoCartera } from '../propiedades/propiedades.eventos';

type J = Record<string, any>;
type Op = 'venta' | 'arriendo';
const OPS: Op[] = ['venta', 'arriendo'];
const COLECCION = 'publicacion_auto';
const ID = 'estado';
/** feeds que hoy no se publican aunque estén activos (orden del usuario 2026-11-19) */
const FEEDS_PAUSADOS = new Set(['chilepropiedades', 'broku']);
const FEEDS = ['chilepropiedades', 'broku', 'yapo'];
const NO_DISPONIBLE = ['vendida', 'arrendada', 'no_disponible', 'reservada'];
const MAX_INFORME = 300;

// ---------- la propiedad en el formato de KONVER (port de desktop/src/portales/konver.js › armar) ----------
const TIPO: Record<string, string> = {
  casa: 'casa',
  departamento: 'departamento',
  oficina: 'oficina',
  local_comercial: 'local',
  bodega: 'bodega',
  estacionamiento: 'estacionamiento',
  terreno_construccion: 'terreno',
  sitio: 'sitio',
  parcela: 'parcela',
  industrial: 'industrial',
  agricola: 'agricola',
};
const TERRENO = ['sitio', 'parcela', 'terreno_construccion', 'agricola', 'industrial'];
const MONEDAS = ['CLP', 'UF', 'USD'];
const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const referencia = (p: J, op: Op) =>
  `${String(p.codigo || p.id)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .slice(0, 56)}-${op === 'venta' ? 'V' : 'A'}`;
const https = (u: unknown) => (u ? String(u).replace(/^http:\/\//i, 'https://') : null);
const num = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const ent = (v: unknown) => (num(v) == null ? null : Math.round(num(v)!));
const pos = (v: unknown) => (num(v) != null && num(v)! > 0 ? num(v) : null);
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
function tituloAviso(p: J, max = 60) {
  const t = String(p.tituloPortal || p.titulo || '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length <= max
    ? t
    : t
        .slice(0, max + 1)
        .replace(/\s+\S*$/, '')
        .slice(0, max);
}
function telefono(n: unknown) {
  let d = String(n ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 9 && d.startsWith('9')) d = '56' + d;
  if (!d.startsWith('56') || d.length < 10) return null;
  return '+' + d;
}
/** «Av. Apoquindo 4500, Las Condes» → { calle: 'Av. Apoquindo', numero: '4500' } */
function calleNumero(dir: unknown) {
  const s = String(dir ?? '')
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim();
  const m = s.match(/^(.+?)\s+(?:n[°ºo.]*\s*|#\s*)?(\d+[A-Za-z]?)(?:\s.*)?$/i);
  return m ? { calle: m[1].replace(/[\s,#]+$/, ''), numero: m[2] } : { calle: s, numero: '' };
}
/** la clave de dirección para cruzar un aviso ajeno con su propiedad: «apoquindo|4500|lascondes» */
const claveDireccion = (calle: unknown, numero: unknown, comuna: unknown) => {
  const c = norm(String(calle ?? '').replace(/^(avenida|av\.?|calle|pasaje|psje\.?)\s+/i, ''));
  const n = String(numero ?? '').replace(/\D/g, '');
  return c && n ? `${c}|${n}|${norm(comuna)}` : '';
};

/** una propiedad tal como la usa la app (mismo formato que propiedadApp), desde la base */
function propiedadDeFila(p: Prisma.PropiedadGetPayload<{ include: { fotos: true } }>): J {
  const d = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
  return {
    id: p.id,
    codigo: p.codigo,
    titulo: p.titulo,
    tituloPortal: p.tituloPortal,
    tipo: p.tipo,
    venta: p.venta,
    arriendo: p.arriendo,
    precioVenta: p.precioVenta != null ? { valor: d(p.precioVenta), moneda: p.monedaVenta ?? 'UF' } : null,
    precioArriendo: p.precioArriendo != null ? { valor: d(p.precioArriendo), moneda: p.monedaArriendo ?? 'CLP' } : null,
    estadoVenta: p.estadoVenta,
    estadoArriendo: p.estadoArriendo,
    direccion: p.direccion ?? '',
    unidad: p.unidad ?? '',
    comuna: p.comuna ?? '',
    region: p.region ?? '',
    rol: p.rol ?? '',
    lat: p.lat,
    lng: p.lng,
    supTotal: d(p.supTotal),
    supUtil: d(p.supUtil),
    dormitorios: p.dormitorios,
    banos: p.banos,
    estacionamientos: p.estacionamientos,
    bodegas: p.bodegas,
    amoblado: p.amoblado,
    gastosComunes: d(p.gastosComunes),
    descripcion: p.descripcion ?? '',
    portalBarrio: p.portalBarrio,
    ficha: (p.ficha ?? {}) as J,
    portales: (p.portales ?? {}) as J,
    fotos: [...p.fotos]
      .sort((a, b) => Number(b.destacada) - Number(a.destacada) || a.orden - b.orden)
      .map((f) => f.url),
    archivada: p.archivada,
    origenSistema: p.origenSistema,
    origenId: p.origenId,
    origenDatos: (p.origenDatos ?? {}) as J,
  };
}

export interface Informe {
  inicio: string;
  fin?: string;
  motivo: string;
  portales: Record<
    string,
    {
      conectado: boolean;
      detectados?: number;
      vinculados?: number;
      error?: string | null;
      publicados: number;
      fallidos: number;
      cupoAgotado?: boolean;
    }
  >;
  publicados: { codigo: string; propiedadId: string; portal: string; op: Op; aviso?: string | null }[];
  pendientes: { codigo: string; propiedadId: string; portal: string; op: Op; faltan: string[] }[];
  sinPropiedad: { portal: string; id: string; titulo: string; referencia: string; url: string | null }[];
  error?: string | null;
}

@Injectable()
export class PublicacionAutoService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('PublicacionAuto');
  /** una vuelta a la vez por corredora; lo que llega mientras tanto se junta para la siguiente */
  private readonly enCurso = new Map<string, Promise<void>>();
  private readonly siguiente = new Map<string, { todo: boolean; ids: Set<string>; motivo: string }>();
  private readonly oyente = (e: EventoCartera) => void this.alEvento(e);
  private regiones: string[] | null = null;
  /** detalle de los avisos ajenos de Portal Inmobiliario, por «corredora:id» */
  private readonly detalles = new Map<string, { t: number; v: J }>();

  constructor(
    private readonly db: PrismaService,
    private readonly konver: KonverService,
    private readonly wechatia: WechatiaService,
    private readonly actividad: ActividadService,
  ) {}

  onModuleInit() {
    eventosCartera.on('cartera', this.oyente);
  }
  onModuleDestroy() {
    eventosCartera.off('cartera', this.oyente);
  }

  // ------------------------------------------------------------------ estado (colección privada de registros)
  async estado(
    corredoraId: string,
  ): Promise<{ activo: boolean; actualizado: string | null; ultimo: Informe | null; ultimaDeteccion: Informe | null }> {
    const r = await this.db.registro.findUnique({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: COLECCION, id: ID } },
      select: { datos: true },
    });
    const d = (r?.datos ?? {}) as J;
    return {
      activo: d.activo === true,
      actualizado: d.actualizado ?? null,
      ultimo: d.ultimo ?? null,
      ultimaDeteccion: d.ultimaDeteccion ?? null,
    };
  }
  private async guardarEstado(corredoraId: string, parcial: J) {
    const r = await this.db.registro.findUnique({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: COLECCION, id: ID } },
      select: { datos: true },
    });
    const datos = { ...((r?.datos ?? {}) as J), ...parcial };
    await this.db.registro.upsert({
      where: { corredoraId_coleccion_id: { corredoraId, coleccion: COLECCION, id: ID } },
      create: { corredoraId, coleccion: COLECCION, id: ID, datos: datos },
      update: { datos: datos, version: { increment: 1 } },
    });
  }
  /** activar o apagar (soporte); al activar, primero detecta lo publicado y después publica lo que falta */
  async activar(corredoraId: string, activo: boolean, quien: string) {
    await this.guardarEstado(corredoraId, { activo, actualizado: new Date().toISOString(), por: quien });
    if (activo) this.encolar(corredoraId, { todo: true, motivo: 'activación' });
    return this.estado(corredoraId);
  }

  // ------------------------------------------------------------------ disparadores
  private async alEvento(e: EventoCartera) {
    try {
      if (e.tipo === 'portales') {
        // siempre (aunque la publicación automática esté apagada): saber qué ya está publicado. Sin forzar, una vez cada 6 h
        const est = await this.estado(e.corredoraId);
        const ultima = est.ultimaDeteccion?.inicio ? Date.parse(est.ultimaDeteccion.inicio) : 0;
        if (this.enCurso.has(e.corredoraId) || (!e.forzar && Date.now() - ultima < 6 * 3600e3)) return;
        if (est.activo) this.encolar(e.corredoraId, { todo: true, motivo: 'cuenta de portales conectada' });
        else
          void this.detectarAhora(e.corredoraId, 'cuenta de portales conectada').catch((err: Error) =>
            this.log.warn(`Detección: ${err.message}`),
          );
        return;
      }
      if (!(await this.estado(e.corredoraId)).activo) return;
      if (e.tipo === 'cartera') this.encolar(e.corredoraId, { todo: true, motivo: `importación desde ${e.origen}` });
      else this.encolar(e.corredoraId, { ids: [e.propiedadId], motivo: 'propiedad creada o editada' });
    } catch (err) {
      this.log.warn(`No se pudo revisar la publicación automática: ${(err as Error).message}`);
    }
  }
  /** pide una vuelta (si ya hay una en curso, queda para después: nunca dos a la vez en la misma corredora) */
  encolar(corredoraId: string, o: { todo?: boolean; ids?: string[]; motivo: string }) {
    const s = this.siguiente.get(corredoraId) ?? { todo: false, ids: new Set<string>(), motivo: o.motivo };
    s.todo ||= !!o.todo;
    for (const id of o.ids ?? []) s.ids.add(id);
    s.motivo = o.motivo;
    this.siguiente.set(corredoraId, s);
    if (!this.enCurso.has(corredoraId)) void this.correr(corredoraId);
  }
  private async correr(corredoraId: string) {
    const p = (async () => {
      for (let s = this.siguiente.get(corredoraId); s; s = this.siguiente.get(corredoraId)) {
        this.siguiente.delete(corredoraId);
        try {
          if (!(await this.estado(corredoraId)).activo) continue;
          await this.vuelta(corredoraId, s.todo ? null : [...s.ids], s.motivo, true);
        } catch (e) {
          this.log.error(`Publicación automática de ${corredoraId}: ${(e as Error).message}`);
        }
      }
    })();
    this.enCurso.set(corredoraId, p);
    try {
      await p;
    } finally {
      this.enCurso.delete(corredoraId);
    }
  }
  /** soporte: detectar ahora (sin publicar), aunque la publicación automática esté apagada */
  async detectarAhora(corredoraId: string, motivo = 'detección pedida por soporte') {
    if (this.enCurso.has(corredoraId)) return (await this.estado(corredoraId)).ultimaDeteccion;
    const p = this.vuelta(corredoraId, null, motivo, false).then(() => undefined);
    this.enCurso.set(corredoraId, p);
    try {
      return await this.vuelta2(p, corredoraId);
    } finally {
      this.enCurso.delete(corredoraId);
    }
  }
  private async vuelta2(p: Promise<void>, corredoraId: string) {
    await p;
    return (await this.estado(corredoraId)).ultimaDeteccion;
  }
  /** soporte: publicar ahora lo que falte (solo si está activada) */
  async publicarAhora(corredoraId: string) {
    if (!(await this.estado(corredoraId)).activo)
      return { encolado: false, mensaje: 'La publicación automática está apagada en esta corredora.' };
    this.encolar(corredoraId, { todo: true, motivo: 'pedido por soporte' });
    return {
      encolado: true,
      mensaje: 'Se está publicando en segundo plano. Recarga en unos minutos para ver el informe.',
    };
  }

  // ------------------------------------------------------------------ KONVER
  private async kv(corredoraId: string, metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown) {
    const r = await this.konver.pedirCorredora(corredoraId, {
      metodo,
      ruta,
      ...(cuerpo !== undefined ? { cuerpo } : {}),
    });
    if (!r) throw new Error('La corredora no tiene la llave de KONVER.');
    if (r.status === 429) {
      await dormir(30_000); // 120 por minuto: se espera y se intenta una vez más
      const r2 = await this.konver.pedirCorredora(corredoraId, {
        metodo,
        ruta,
        ...(cuerpo !== undefined ? { cuerpo } : {}),
      });
      return r2 ?? r;
    }
    return r;
  }
  private motivo(c: unknown, status: number) {
    const d = ((c as J)?.detail ?? c) as J;
    if (Array.isArray(d))
      return d.map((x: J) => `${(x.loc || []).filter((k: string) => k !== 'body').join('.')}: ${x.msg}`).join(' · ');
    if (d && typeof d === 'object') {
      const det =
        d.detalle && typeof d.detalle === 'object'
          ? d.detalle.message ||
            d.detalle.mensaje ||
            (d.detalle.cause || []).map((x: J) => x.message || x).join(' · ') ||
            ''
          : d.detalle || '';
      return (
        [d.mensaje || d.message || d.error, Array.isArray(d.campos) ? d.campos.join(', ') : '', det]
          .filter(Boolean)
          .join(' · ') || `error ${status}`
      );
    }
    return typeof d === 'string' && d ? d : `error ${status}`;
  }
  private async region(corredoraId: string, nombre: string, comuna: string) {
    if (!this.regiones) {
      const r = await this.kv(corredoraId, 'GET', '/v1/ubicaciones/regiones').catch(() => null);
      if (r?.status === 200 && Array.isArray(r.cuerpo)) this.regiones = (r.cuerpo as J[]).map((x) => String(x.nombre));
    }
    const lista = this.regiones ?? [];
    const n = norm(String(nombre || '').replace(/regi[oó]n( de| del)?/i, ''));
    if (n && lista.length) {
      const r =
        lista.find((x) => norm(x) === n) ||
        lista.find((x) => n.includes(norm(x)) || norm(x).includes(n)) ||
        (/metropolitana|santiago|rm$/.test(n) ? lista.find((x) => /metropolitana/i.test(x)) : undefined);
      if (r) return r;
    }
    if (!nombre && comuna) return null;
    return nombre || null;
  }

  /** el cuerpo para KONVER + lo que falta (port de armar() de la app) */
  private async armar(
    corredoraId: string,
    p: J,
    op: Op,
    destino: 'portal_inmobiliario' | 'toctoc',
    cfg: J,
    wa: string | null,
  ) {
    const errores: string[] = [];
    const precio = op === 'venta' ? p.precioVenta : p.precioArriendo;
    if (!precio?.valor) errores.push(`precio de ${op}`);
    const moneda = MONEDAS.includes(precio?.moneda) ? precio.moneda : 'UF';
    const c: J = cfg.contacto || {};
    const tel = telefono(wa) || telefono(c.whatsapp) || telefono(c.telefono);
    if (!tel) errores.push('WhatsApp de contacto de la corredora');
    const { calle, numero } = calleNumero(p.direccion);
    if (!calle) errores.push('dirección');
    else if (!numero) errores.push('número en la dirección');
    if (!String(p.comuna || '').trim()) errores.push('comuna');
    const reg = await this.region(corredoraId, p.region, p.comuna);
    if (!reg) errores.push('región');
    const fotos: string[] = (p.fotos || []).filter((u: string) => /^https:\/\//.test(u)).slice(0, 30);
    if (!fotos.length) errores.push('al menos una foto');
    const titulo = tituloAviso(p, 60);
    if (titulo.length < 5) errores.push('título');
    const desc = [String(p.descripcion || '').trim(), `Código: ${p.codigo}`].filter(Boolean).join('\n\n');
    if (destino === 'toctoc') {
      if (p.lat == null || p.lng == null) errores.push('ubicación en el mapa (TOCTOC)');
      if (desc.length < 50) errores.push('descripción de 50 caracteres o más (TOCTOC)');
      const fotosTT = fotos.filter((u) => /\.(jpe?g|png)(\?|$)/i.test(u) && !/[()[\]{}%&+<>|'"]/.test(u.split('?')[0]));
      if (fotosTT.length < 3) errores.push('3 fotos .jpg o .png (TOCTOC)');
      if (moneda === 'USD') errores.push('precio en pesos o UF (TOCTOC)');
    }
    const f: J = p.ficha || {};
    let barrio: J | null = null;
    try {
      barrio = typeof p.portalBarrio === 'string' && p.portalBarrio.startsWith('{') ? JSON.parse(p.portalBarrio) : null;
    } catch {
      barrio = null;
    }
    const cuerpo: J = {
      referencia: referencia(p, op),
      operacion: op,
      tipo: TIPO[p.tipo] || 'otro',
      condicion: 'usado',
      titulo: titulo.length >= 5 ? titulo : titulo.padEnd(5, '.'),
      descripcion: desc,
      precio: { monto: num(precio?.valor) || 0, moneda },
      ubicacion: {
        region: reg || '',
        comuna: String(p.comuna || '').trim(),
        ...(barrio?.name || barrio?.nombre ? { barrio: barrio.name || barrio.nombre } : {}),
        calle: calle || '',
        numero: numero || '',
        ...(p.unidad ? { depto: String(p.unidad) } : {}),
        ...(ent(f.pisoUnidad) != null ? { piso: ent(f.pisoUnidad) } : {}),
        ...(p.lat != null && p.lng != null ? { latitud: Number(p.lat), longitud: Number(p.lng) } : {}),
      },
      superficie_total: pos(p.supTotal ?? p.supUtil),
      superficie_util: pos(p.supUtil ?? p.supTotal),
      superficie_terreno: TERRENO.includes(p.tipo) ? pos(p.supTotal) : pos(f.supTerreno),
      superficie_terraza: num(f.supTerraza),
      dormitorios: ent(p.dormitorios),
      banos: ent(p.banos),
      estacionamientos: ent(p.estacionamientos ?? (['casa', 'departamento', 'oficina'].includes(p.tipo) ? 0 : null)),
      bodegas: ent(p.bodegas),
      pisos: ent(f.pisos),
      ...(p.gastosComunes != null
        ? { gastos_comunes: { monto: Math.round(Number(p.gastosComunes)), moneda: 'CLP' } }
        : {}),
      ...(f.mascotas != null ? { admite_mascotas: !!f.mascotas } : {}),
      amoblado: !!p.amoblado,
      ...(f.parrilla != null || f.barbecue != null ? { parrilla: !!(f.parrilla || f.barbecue) } : {}),
      ...(f.piscina != null ? { piscina: !!f.piscina } : {}),
      ...(f.ascensores != null ? { ascensor: Number(f.ascensores) > 0 } : {}),
      ...(p.rol ? { rol: String(p.rol) } : {}),
      fotos,
      contacto: {
        nombre: c.nombre || null,
        telefono: tel || '',
        ...(telefono(c.telefono) && telefono(c.telefono) !== tel ? { telefono2: telefono(c.telefono) } : {}),
        email: c.email || null,
      },
      tipo_publicacion_ml: cfg.ml?.tipoAviso || 'silver',
      destinos: [destino],
    };
    for (const k of Object.keys(cuerpo)) if (cuerpo[k] === null) delete cuerpo[k];
    return { cuerpo, errores };
  }

  // ------------------------------------------------------------------ guardar en la propiedad
  private async guardarAviso(corredoraId: string, propId: string, portal: string, op: Op, datos: J, texto?: string) {
    const fila = await this.db.propiedad.findFirst({
      where: { id: propId, corredoraId, eliminadoEn: null },
      select: { portales: true },
    });
    if (!fila) return;
    const portales = { ...((fila.portales as J) ?? {}) };
    portales[portal] = { ...(portales[portal] || {}) };
    portales[portal][op] = { ...(portales[portal][op] || {}), ...datos, actualizado: new Date().toISOString() };
    await this.db.propiedad.update({
      where: { id: propId },
      data: { portales, version: { increment: 1 } },
    });
    if (texto)
      await this.actividad.registrar({
        corredoraId,
        entidadTipo: 'propiedad',
        entidadId: propId,
        texto,
        usuarioId: null,
      });
  }

  // ------------------------------------------------------------------ detectar lo que ya está publicado
  /** las claves con que se reconoce cada propiedad: código, id y código externo de Convecta, y dirección */
  private indice(props: J[]) {
    const porClave = new Map<string, J>();
    const porDir = new Map<string, J[]>();
    for (const p of props) {
      for (const k of [p.codigo, p.origenId, p.origenDatos?.idExterno])
        if (k != null && norm(k)) porClave.set(norm(k), p);
      const { calle, numero } = calleNumero(p.direccion);
      const kd = claveDireccion(calle, numero, p.comuna);
      if (kd) porDir.set(kd, [...(porDir.get(kd) ?? []), p]);
    }
    return { porClave, porDir };
  }
  private opDe(p: J, sufijo: string | null, texto: string, precio?: unknown): Op {
    if (sufijo === 'V') return 'venta';
    if (sufijo === 'A') return 'arriendo';
    if (/arriendo|alquiler|renta/i.test(texto)) return 'arriendo';
    if (/venta|vende/i.test(texto)) return 'venta';
    // por el precio del aviso: el que coincide con el de venta o con el de arriendo de la propiedad
    const pr = num(precio);
    if (pr != null && p.venta && p.arriendo) {
      if (pr === num(p.precioArriendo?.valor)) return 'arriendo';
      if (pr === num(p.precioVenta?.valor)) return 'venta';
    }
    return p.venta && !p.arriendo ? 'venta' : p.arriendo && !p.venta ? 'arriendo' : 'venta';
  }

  /** Portal Inmobiliario: todos los avisos activos y pausados de la cuenta → vinculados a su propiedad */
  private async detectarPI(corredoraId: string, props: J[], inf: Informe) {
    const avisos: J[] = [];
    for (const estado of ['active', 'paused']) {
      for (let offset = 0; offset < 3000; offset += 50) {
        const r = await this.kv(
          corredoraId,
          'GET',
          `/v1/portal-inmobiliario/propiedades?estado=${estado}&offset=${offset}&limit=50`,
        );
        if (r.status >= 400) throw new Error(this.motivo(r.cuerpo, r.status));
        const c = r.cuerpo as J;
        const l: J[] = Array.isArray(c) ? c : c?.propiedades || c?.resultados || c?.items || [];
        avisos.push(...l);
        if (l.length < 50) break;
      }
    }
    const ya = new Set<string>();
    for (const p of props)
      for (const op of OPS) if (p.portales?.pi?.[op]?.itemId) ya.add(String(p.portales.pi[op].itemId));
    const { porClave, porDir } = this.indice(props);
    let vinculados = 0;
    for (const a of avisos) {
      if (!a?.id || ya.has(String(a.id))) continue;
      const ref = String(a.referencia || '');
      const m = ref.match(/^(.*)-(V|A)$/);
      let p: J | undefined = porClave.get(norm(m ? m[1] : ref));
      let como = 'referencia';
      let detalle: J | null = null;
      if (!p) {
        // aviso de otro sistema: se mira el detalle (atributos y ubicación) para encontrar el código o la dirección
        // (se guarda 6 h: editar una propiedad no vuelve a pedir el detalle de cada aviso ajeno)
        const clave = `${corredoraId}:${String(a.id)}`;
        const enCache = this.detalles.get(clave);
        if (enCache && Date.now() - enCache.t < 6 * 3600e3) detalle = enCache.v;
        else {
          const r = await this.kv(
            corredoraId,
            'GET',
            `/v1/portal-inmobiliario/propiedades/${encodeURIComponent(String(a.id))}`,
          ).catch(() => null);
          detalle = r && r.status < 400 ? (r.cuerpo as J) : null;
          if (detalle) this.detalles.set(clave, { t: Date.now(), v: detalle });
        }
        const attrs: J[] = detalle?.atributos || detalle?.attributes || [];
        const valor = (id: string) =>
          attrs.find((x) => x.id === id)?.valor ?? attrs.find((x) => x.id === id)?.value_name ?? null;
        for (const k of [valor('PROPERTY_CODE'), detalle?.seller_custom_field, detalle?.codigo]) {
          if (k && porClave.get(norm(k))) {
            p = porClave.get(norm(k));
            como = 'código';
            break;
          }
        }
        if (!p) {
          const u: J = detalle?.ubicacion || detalle?.location || {};
          const cn = u.calle ? { calle: u.calle, numero: u.numero } : calleNumero(u.direccion || u.address_line || '');
          const kd = claveDireccion(cn.calle, cn.numero, u.comuna || u.city?.name || '');
          const cands = kd ? (porDir.get(kd) ?? []) : [];
          if (cands.length === 1) {
            p = cands[0];
            como = 'dirección';
          }
        }
      }
      if (!p) {
        if (inf.sinPropiedad.length < MAX_INFORME)
          inf.sinPropiedad.push({
            portal: 'pi',
            id: String(a.id),
            titulo: String(a.titulo || ''),
            referencia: ref,
            url: https(a.url),
          });
        continue;
      }
      const op = this.opDe(p, m ? m[2] : null, `${a.titulo || ''} ${detalle?.operacion || ''}`, a.precio);
      if (p.portales?.pi?.[op]?.itemId && p.portales.pi[op].status !== 'closed') continue; // esa operación ya tiene su aviso
      const datos = {
        itemId: String(a.id),
        permalink: https(a.url),
        status: a.estado || 'active',
        vinculado: true,
        coincidencia: como,
        publicado: a.creado || null,
        via: 'konver',
        ...(typeof a.en_portal_inmobiliario === 'boolean' ? { enPI: a.en_portal_inmobiliario } : {}),
      };
      await this.guardarAviso(
        corredoraId,
        p.id,
        'pi',
        op,
        datos,
        `Aviso existente de Portal Inmobiliario vinculado (${op}, por ${como}): ${a.id}`,
      );
      p.portales = { ...(p.portales || {}), pi: { ...(p.portales?.pi || {}), [op]: datos } };
      ya.add(String(a.id));
      vinculados++;
    }
    return { detectados: avisos.length, vinculados };
  }

  /** TOCTOC: las propiedades publicadas en la cuenta → vinculadas por referencia, código o dirección */
  private async detectarTT(corredoraId: string, props: J[], inf: Informe) {
    const r = await this.kv(corredoraId, 'GET', '/v1/toctoc/propiedades');
    if (r.status >= 400) throw new Error(this.motivo(r.cuerpo, r.status));
    const c = r.cuerpo as J;
    const avisos: J[] = Array.isArray(c) ? c : c?.propiedades || c?.resultados || c?.items || [];
    const { porClave, porDir } = this.indice(props);
    let vinculados = 0;
    for (const a of avisos) {
      const ref = String(a.referencia || a.codigo || a.id || '');
      const m = ref.match(/^(.*)-(V|A)$/);
      let p = porClave.get(norm(m ? m[1] : ref));
      let como = 'referencia';
      if (!p) {
        const u: J = a.ubicacion || {};
        const cn = u.calle ? { calle: u.calle, numero: u.numero } : calleNumero(u.direccion || a.direccion || '');
        const cands = porDir.get(claveDireccion(cn.calle, cn.numero, u.comuna || a.comuna || '')) ?? [];
        if (cands.length === 1) {
          p = cands[0];
          como = 'dirección';
        }
      }
      if (!p) {
        if (inf.sinPropiedad.length < MAX_INFORME)
          inf.sinPropiedad.push({
            portal: 'toctoc',
            id: ref,
            titulo: String(a.titulo || ''),
            referencia: ref,
            url: https(a.url),
          });
        continue;
      }
      const op = this.opDe(p, m ? m[2] : null, `${a.titulo || ''} ${a.operacion || ''}`, a.precio?.monto ?? a.precio);
      if (['active', 'publicada', 'en_feed'].includes(p.portales?.toctoc?.[op]?.status)) continue;
      const datos = {
        status: 'active',
        referencia: ref,
        url: https(a.url),
        vinculado: true,
        coincidencia: como,
        via: 'konver',
      };
      await this.guardarAviso(
        corredoraId,
        p.id,
        'toctoc',
        op,
        datos,
        `Aviso existente de TOCTOC vinculado (${op}, por ${como})`,
      );
      p.portales = { ...(p.portales || {}), toctoc: { ...(p.portales?.toctoc || {}), [op]: datos } };
      vinculados++;
    }
    return { detectados: avisos.length, vinculados };
  }

  // ------------------------------------------------------------------ la vuelta: detectar y (si corresponde) publicar
  async vuelta(corredoraId: string, ids: string[] | null, motivo: string, publicar: boolean): Promise<Informe> {
    const inf: Informe = {
      inicio: new Date().toISOString(),
      motivo,
      portales: {},
      publicados: [],
      pendientes: [],
      sinPropiedad: [],
    };
    try {
      const filas = await this.db.propiedad.findMany({
        where: { corredoraId, eliminadoEn: null, archivada: false },
        include: { fotos: true },
      });
      const props = filas.map(propiedadDeFila);
      const cfgFila = await this.db.registro.findUnique({
        where: { corredoraId_coleccion_id: { corredoraId, coleccion: 'corredora_config', id: 'corredora' } },
        select: { datos: true },
      });
      const cfg = (cfgFila?.datos ?? {}) as J;

      // ¿qué portales tiene conectados? (KONVER: Mercado Libre y TOCTOC)
      const cuenta = await this.kv(corredoraId, 'GET', '/v1/cuenta').catch(() => null);
      const kvOk = cuenta?.status === 200;
      const piOk = kvOk && !!(cuenta?.cuerpo as J)?.portal_inmobiliario?.conectado;
      const ttOk =
        kvOk && !!(cuenta?.cuerpo as J)?.toctoc?.conectado && (cuenta?.cuerpo as J)?.toctoc?.plan_activo !== false;
      inf.portales.pi = { conectado: piOk, publicados: 0, fallidos: 0 };
      inf.portales.toctoc = { conectado: ttOk, publicados: 0, fallidos: 0 };

      // 1) detectar lo que ya está publicado (si falla, ese portal no se publica en esta vuelta)
      if (piOk) {
        try {
          Object.assign(inf.portales.pi, await this.detectarPI(corredoraId, props, inf), { error: null });
        } catch (e) {
          inf.portales.pi.error = `No se pudo revisar lo publicado: ${(e as Error).message}`;
        }
      }
      if (ttOk) {
        try {
          Object.assign(inf.portales.toctoc, await this.detectarTT(corredoraId, props, inf), { error: null });
        } catch (e) {
          inf.portales.toctoc.error = `No se pudo revisar lo publicado: ${(e as Error).message}`;
        }
      }
      if (!publicar) {
        inf.fin = new Date().toISOString();
        await this.guardarEstado(corredoraId, { ultimaDeteccion: inf });
        return inf;
      }

      // 2) publicar lo que falta
      const feeds = FEEDS.filter((id) => cfg.portales?.[id]?.activo === true && !FEEDS_PAUSADOS.has(id));
      for (const id of feeds) inf.portales[id] = { conectado: true, publicados: 0, fallidos: 0 };
      const wa = await this.wechatia.numeroEmpresa(corredoraId).catch(() => null);
      const objetivo = ids ? props.filter((p) => ids.includes(p.id)) : props;
      const cupo = Number((cuenta?.cuerpo as J)?.cupo_propiedades_por_portal ?? NaN);
      const enPI = () =>
        props.reduce(
          (n, p) => n + OPS.filter((op) => ['active', 'paused'].includes(p.portales?.pi?.[op]?.status)).length,
          0,
        );

      for (const p of objetivo) {
        for (const op of OPS) {
          if (!(op === 'venta' ? p.venta : p.arriendo)) continue;
          const est = op === 'venta' ? p.estadoVenta : p.estadoArriendo;
          if (est && NO_DISPONIBLE.includes(est)) continue;

          // Portal Inmobiliario
          const aPI = p.portales?.pi?.[op];
          if (
            piOk &&
            !inf.portales.pi.error &&
            !inf.portales.pi.cupoAgotado &&
            !(aPI?.itemId && aPI.status !== 'closed')
          ) {
            if (Number.isFinite(cupo) && enPI() >= cupo) inf.portales.pi.cupoAgotado = true;
            else await this.publicarKonver(corredoraId, p, op, 'portal_inmobiliario', cfg, wa, inf);
          }
          // TOCTOC
          const aTT = p.portales?.toctoc?.[op];
          if (
            ttOk &&
            !inf.portales.toctoc.error &&
            !inf.portales.toctoc.cupoAgotado &&
            !['active', 'publicada', 'en_feed', 'pausada', 'retirada'].includes(aTT?.status)
          )
            await this.publicarKonver(corredoraId, p, op, 'toctoc', cfg, wa, inf);
          // feeds activos
          for (const id of feeds) {
            if (p.portales?.[id]?.[op]) continue; // ya está (o se retiró a mano): no se toca
            const precio = op === 'venta' ? p.precioVenta : p.precioArriendo;
            const faltan = [
              !precio?.valor && `precio de ${op}`,
              !p.comuna && 'comuna',
              !p.fotos.length && 'al menos una foto',
            ].filter(Boolean) as string[];
            if (faltan.length) {
              this.pendiente(inf, p, id, op, faltan);
              continue;
            }
            await this.guardarAviso(
              corredoraId,
              p.id,
              id,
              op,
              { status: 'en_feed', desde: new Date().toISOString(), auto: true },
              `Incluida en el feed de ${id} (${op}) automáticamente`,
            );
            inf.portales[id].publicados++;
            inf.publicados.push({ codigo: p.codigo, propiedadId: p.id, portal: id, op });
          }
        }
      }
    } catch (e) {
      inf.error = (e as Error).message;
    }
    inf.fin = new Date().toISOString();
    await this.guardarEstado(corredoraId, { ultimo: inf, ultimaDeteccion: inf });
    return inf;
  }

  private pendiente(inf: Informe, p: J, portal: string, op: Op, faltan: string[]) {
    if (inf.pendientes.length < MAX_INFORME)
      inf.pendientes.push({ codigo: p.codigo, propiedadId: p.id, portal, op, faltan });
  }

  private async publicarKonver(
    corredoraId: string,
    p: J,
    op: Op,
    destino: 'portal_inmobiliario' | 'toctoc',
    cfg: J,
    wa: string | null,
    inf: Informe,
  ) {
    const portal = destino === 'toctoc' ? 'toctoc' : 'pi';
    const a = await this.armar(corredoraId, p, op, destino, cfg, wa);
    if (a.errores.length) return this.pendiente(inf, p, portal, op, a.errores);
    // el validador oficial (no publica nada)
    const v = await this.kv(corredoraId, 'POST', '/v1/propiedades/validar', a.cuerpo).catch((e: Error) => ({
      status: 502,
      cuerpo: { detail: { mensaje: e.message } },
    }));
    const dv = (v.cuerpo as J)?.destinos?.[destino];
    if (v.status >= 400 && !(v.status === 422 && dv))
      return this.pendiente(inf, p, portal, op, [this.motivo(v.cuerpo, v.status)]);
    if (dv && dv.valido === false) return this.pendiente(inf, p, portal, op, [this.motivo({ detail: dv }, 422)]);
    // publicar
    const r = await this.kv(corredoraId, 'POST', '/v1/propiedades', a.cuerpo).catch((e: Error) => ({
      status: 502,
      cuerpo: { detail: { mensaje: e.message } },
    }));
    const d = (r.cuerpo as J)?.destinos?.[destino];
    if (!d?.publicado) {
      const motivo = d
        ? this.motivo({ detail: { error: d.error, campos: d.campos, detalle: d.detalle, http: d.http } }, r.status)
        : this.motivo(r.cuerpo, r.status);
      if (d?.error === 'cupo_alcanzado' || /paquete|payment_required|listing_type_id/.test(JSON.stringify(d ?? {})))
        inf.portales[portal].cupoAgotado = true;
      inf.portales[portal].fallidos++;
      await this.guardarAviso(corredoraId, p.id, portal, op, { error: motivo, intento: new Date().toISOString() });
      return this.pendiente(inf, p, portal, op, [`el portal lo rechazó: ${motivo}`]);
    }
    const ahora = new Date().toISOString();
    const datos =
      portal === 'pi'
        ? {
            itemId: String(d.id),
            permalink: https(d.url),
            status: d.estado || 'active',
            tipoAviso: d.tipo_publicacion || a.cuerpo.tipo_publicacion_ml,
            referencia: a.cuerpo.referencia,
            publicado: ahora,
            error: null,
            via: 'konver',
            auto: true,
            ...(typeof d.en_portal_inmobiliario === 'boolean' ? { enPI: d.en_portal_inmobiliario } : {}),
          }
        : {
            status: 'active',
            referencia: a.cuerpo.referencia,
            url: https(d.url),
            publicado: ahora,
            error: null,
            via: 'konver',
            auto: true,
          };
    await this.guardarAviso(
      corredoraId,
      p.id,
      portal,
      op,
      datos,
      `Publicada automáticamente en ${portal === 'pi' ? 'Portal Inmobiliario' : 'TOCTOC'} (${op})${portal === 'pi' ? `: ${d.id}` : ''}`,
    );
    p.portales = { ...(p.portales || {}), [portal]: { ...(p.portales?.[portal] || {}), [op]: datos } };
    inf.portales[portal].publicados++;
    inf.publicados.push({
      codigo: p.codigo,
      propiedadId: p.id,
      portal,
      op,
      aviso: portal === 'pi' ? String(d.id) : null,
    });
  }
}
