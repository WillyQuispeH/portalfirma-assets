// Conversión entre la fila de la base y la propiedad como la usa la app de escritorio (precioVenta: { valor, moneda },
// vinculos, fotos como lista de urls…), y las reglas de privacidad de los datos del dueño.
import { Prisma } from '@prisma/client';
import type { Propiedad, PropiedadDocumento, PropiedadFoto, PropiedadPersona } from '@prisma/client';
import { normalizar } from '../comun/texto';
import type { UsuarioToken } from '../auth/usuario-actual';
import type { PropiedadEntrada } from './propiedades.esquemas';

export type PropiedadCompleta = Propiedad & {
  fotos: PropiedadFoto[];
  documentos: PropiedadDocumento[];
  vinculos: PropiedadPersona[];
};

export const INCLUIR = {
  fotos: { orderBy: { orden: 'asc' } },
  documentos: { orderBy: { creadoEn: 'desc' } },
  vinculos: { orderBy: { desde: 'asc' } },
} satisfies Prisma.PropiedadInclude;

/** Los datos del dueño en la ficha (propietarioNombre, propietarioRut…): solo para el captador y el administrador. */
const DEL_DUENO = /^propietario/;

export const puedeVerDueno = (u: UsuarioToken, p: { captadorId: string | null }) =>
  u.rol === 'ADMIN' || (!!p.captadorId && p.captadorId === u.sub);

const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));

export function propiedadApp(p: PropiedadCompleta, u: UsuarioToken) {
  const visible = puedeVerDueno(u, p);
  const ficha = (p.ficha ?? {}) as Record<string, unknown>;
  return {
    id: p.id,
    codigo: p.codigo,
    titulo: p.titulo,
    tipo: p.tipo,
    venta: p.venta,
    arriendo: p.arriendo,
    precioVenta: p.precioVenta != null ? { valor: num(p.precioVenta), moneda: p.monedaVenta ?? 'UF' } : null,
    precioArriendo:
      p.precioArriendo != null ? { valor: num(p.precioArriendo), moneda: p.monedaArriendo ?? 'CLP' } : null,
    estadoVenta: p.estadoVenta,
    estadoArriendo: p.estadoArriendo,
    direccion: p.direccion ?? '',
    unidad: p.unidad ?? '',
    comuna: p.comuna ?? '',
    region: p.region ?? '',
    rol: p.rol ?? '',
    lat: p.lat,
    lng: p.lng,
    placeId: p.placeId,
    supTotal: num(p.supTotal),
    supUtil: num(p.supUtil),
    dormitorios: p.dormitorios,
    banos: p.banos,
    estacionamientos: p.estacionamientos,
    bodegas: p.bodegas,
    amoblado: p.amoblado,
    gastosComunes: num(p.gastosComunes),
    descripcion: p.descripcion ?? '',
    notasInternas: p.notasInternas ?? '',
    tituloPortal: p.tituloPortal,
    portalBarrio: p.portalBarrio,
    etiquetas: p.etiquetas,
    ficha: visible ? ficha : Object.fromEntries(Object.entries(ficha).filter(([k]) => !DEL_DUENO.test(k))),
    portales: p.portales,
    leads: p.leadsPortal,
    fotos: p.fotos.map((f) => f.url),
    documentos: p.documentos.map((d) => ({
      id: d.id,
      nombre: d.nombre,
      tipo: d.tipo,
      size: d.tamano,
      fecha: d.creadoEn.toISOString(),
    })),
    vinculos: p.vinculos.map((v) => ({ personaId: v.personaId, rol: v.rol, desde: v.desde.toISOString() })),
    corredor: p.corredorOrigen,
    captadorId: p.captadorId,
    duenoVisible: visible,
    archivada: p.archivada,
    origen: p.origenSistema ? { sistema: p.origenSistema, id: p.origenId, ...((p.origenDatos as object) ?? {}) } : null,
    editados: p.editados,
    idLegado: p.idLegado,
    version: p.version,
    creado: p.creadoEn.toISOString(),
    actualizado: p.actualizadoEn.toISOString(),
    ...(p.eliminadoEn ? { eliminado: true } : {}),
  };
}

/** Columnas a partir de lo que mandó la app (solo lo que vino). La ficha se combina aparte (ver combinarFicha). */
export function columnas(o: PropiedadEntrada): Prisma.PropiedadUncheckedUpdateInput {
  const d: Prisma.PropiedadUncheckedUpdateInput = {};
  const directos = [
    'codigo',
    'titulo',
    'tipo',
    'venta',
    'arriendo',
    'estadoVenta',
    'estadoArriendo',
    'direccion',
    'unidad',
    'comuna',
    'region',
    'rol',
    'lat',
    'lng',
    'placeId',
    'supTotal',
    'supUtil',
    'dormitorios',
    'banos',
    'estacionamientos',
    'bodegas',
    'amoblado',
    'gastosComunes',
    'descripcion',
    'notasInternas',
    'tituloPortal',
    'portalBarrio',
    'etiquetas',
  ] as const;
  for (const k of directos) if (o[k] !== undefined) (d as Record<string, unknown>)[k] = o[k];
  if (o.etiquetas !== undefined) d.etiquetas = [...new Set(o.etiquetas)];
  if (o.precioVenta !== undefined) {
    d.precioVenta = o.precioVenta?.valor ?? null;
    d.monedaVenta = o.precioVenta?.moneda ?? null;
  }
  if (o.precioArriendo !== undefined) {
    d.precioArriendo = o.precioArriendo?.valor ?? null;
    d.monedaArriendo = o.precioArriendo?.moneda ?? null;
  }
  if (o.portales !== undefined) d.portales = o.portales as Prisma.InputJsonValue;
  if (o.leads !== undefined) d.leadsPortal = o.leads as Prisma.InputJsonValue;
  if (o.corredor !== undefined) d.corredorOrigen = (o.corredor ?? Prisma.DbNull) as Prisma.InputJsonValue;
  return d;
}

/** Los datos nuevos se suman a los que había; un dato en null o '' se borra. */
export function combinarFicha(previa: unknown, nueva: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...((previa as object) ?? {}) };
  for (const [k, v] of Object.entries(nueva)) {
    if (v === null || v === '') delete out[k];
    else out[k] = v;
  }
  return out;
}

/** Quita de lo que manda un corredor lo que toca al dueño de una propiedad que no captó. */
export function sinDatosDelDueno(o: PropiedadEntrada): PropiedadEntrada {
  const out = { ...o };
  delete out.captadorId;
  if (out.ficha) out.ficha = Object.fromEntries(Object.entries(out.ficha).filter(([k]) => !DEL_DUENO.test(k)));
  return out;
}

export const textoBusqueda = (p: {
  codigo: string;
  titulo: string;
  direccion?: string | null;
  unidad?: string | null;
  comuna?: string | null;
}) => normalizar(p.codigo, p.titulo, p.direccion, p.unidad, p.comuna);
