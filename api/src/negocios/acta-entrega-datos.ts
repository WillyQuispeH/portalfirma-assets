/* eslint-disable @typescript-eslint/no-base-to-string -- los datos llegan sin tipo (JSON guardado por la app) */
// Los datos del ACTA DE ENTREGA E INVENTARIO (n.datos.ciclo.entrega) y cómo se convierten en las variables de la plantilla
// (src/documentos/plantillas/acta-entrega.html). Sin dependencias de Nest ni de la base: lo usa el servicio y la prueba.
//
// Modelo guardado (todo opcional; la app lo escribe con negGuardar):
//   fecha               'AAAA-MM-DD' de la entrega
//   entregadoPor        { nombre, rut }  quien entrega en representación de la corredora (sin nombre: el usuario que genera)
//   accesos             [{ nombre, cantidad }]  llaves, controles y chips (modelo: puerta principal, control portón, llave portón…)
//   llaves              texto libre sobre llaves (el formato antiguo solo tenía este campo)
//   estacionamientos    texto («E-12 y E-13»)   bodega  texto
//   gastosComunesDesde  'AAAA-MM-DD' desde cuándo los gastos comunes son del arrendatario (sin dato: la fecha de entrega)
//   aspectos            [texto]  aspectos generales marcados («Grifería completa funcionando»…)
//   medidores           { luz, agua (agua fría), aguaCaliente, gas, calefaccion: { numero, lectura } }
//   inventario          [{ espacio, estado, nota, items?: [{ nombre, cantidad, estado, nota }], fotos?: [{ clave, nombre }] }]
//                        — el formato ANTIGUO era solo [{ espacio, estado, nota }] y se sigue leyendo igual (un espacio sin ítems)
//   observaciones       texto
// Estados: bueno · regular · malo · na (no aplica). Los ítems «no aplica» no salen en el PDF.

export const ESTADO: Record<string, string> = { bueno: 'Bueno', regular: 'Regular', malo: 'Malo', na: 'No aplica' };
export const MEDIDORES: [string, string][] = [
  ['luz', 'Electricidad'],
  ['agua', 'Agua fría'],
  ['aguaCaliente', 'Agua caliente'],
  ['gas', 'Gas'],
  ['calefaccion', 'Calefacción'],
];
/** cuántas fotos entran al PDF (por espacio y en total): el documento debe pesar poco */
export const FOTOS_POR_ESPACIO = 6;
export const FOTOS_TOTAL = 40;

export interface FotoEntrega {
  clave?: string;
  nombre?: string;
}
export interface ItemEntrega {
  nombre?: string;
  cantidad?: string | number;
  estado?: string;
  nota?: string;
}
export interface EspacioEntrega {
  espacio?: string;
  estado?: string;
  nota?: string;
  items?: ItemEntrega[];
  fotos?: FotoEntrega[];
}
export interface EntregaDatos {
  fecha?: string;
  entregadoPor?: { nombre?: string; rut?: string };
  accesos?: { nombre?: string; cantidad?: string | number }[];
  llaves?: string;
  estacionamientos?: string;
  bodega?: string;
  gastosComunesDesde?: string;
  aspectos?: string[];
  observaciones?: string;
  medidores?: Record<string, { numero?: string; lectura?: string } | undefined>;
  inventario?: EspacioEntrega[];
}

const t = (v: unknown) => String(v ?? '').trim();
const esFecha = (f: unknown): f is string => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f);
export const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** los espacios con nombre (formato nuevo o antiguo) */
export const espaciosDe = (k: EntregaDatos) =>
  (Array.isArray(k.inventario) ? k.inventario : []).filter((i) => t(i?.espacio));

/** las fotos que entran al PDF, en orden, respetando los límites */
export function fotosParaPdf(k: EntregaDatos): string[] {
  const claves: string[] = [];
  for (const e of espaciosDe(k))
    for (const f of (Array.isArray(e.fotos) ? e.fotos : []).slice(0, FOTOS_POR_ESPACIO))
      if (t(f?.clave) && claves.length < FOTOS_TOTAL) claves.push(t(f.clave));
  return claves;
}

/** lo que falta para poder armar el acta (vacío si está todo) */
export function faltaEnEntrega(k: EntregaDatos): string {
  if (!esFecha(k.fecha)) return 'Falta la fecha de entrega.';
  if (!espaciosDe(k).length) return 'El inventario está vacío: agrega al menos un espacio.';
  return '';
}

export interface EntradaActa {
  numero: number;
  /** 'AAAA-MM-DD' de hoy */
  hoy: string;
  /** los datos de datosCorredora() (nombre, rut, domicilio, logo…) */
  corredora: { nombre: string };
  duenos: { nombre: string; rut: string }[];
  arrendatario: { nombre: string; rut: string };
  propiedad: {
    codigo: string;
    tipo?: string | null;
    direccion?: string | null;
    unidad?: string | null;
    comuna?: string | null;
    estacionamientos?: number | null;
    bodegas?: number | null;
  };
  /** el usuario que genera el acta (si no se indicó quién entrega) */
  usuario: { nombre: string };
  entrega: EntregaDatos;
  /** clave de R2 → imagen ya lista para el PDF (data URL); las que falten no salen */
  imagenes?: Map<string, string>;
}

/** las variables de la plantilla acta-entrega.html */
export function varsActaEntrega(x: EntradaActa) {
  const k = x.entrega ?? {};
  const fecha = esFecha(k.fecha) ? k.fecha : x.hoy;
  const p = x.propiedad;
  const direccion = [p.direccion, p.unidad ? `depto. ${p.unidad}` : '', p.comuna].filter(Boolean).join(', ');
  const tipo = mayus(t(p.tipo).replace(/_/g, ' ')) || 'Inmueble';
  const accesos = (Array.isArray(k.accesos) ? k.accesos : [])
    .filter((a) => t(a?.nombre) && t(a?.cantidad) && t(a?.cantidad) !== '0')
    .map((a) => ({ nombre: t(a.nombre), cantidad: t(a.cantidad) }));
  const llaves = t(k.llaves);
  const medidores = MEDIDORES.flatMap(([id, nombre]) => {
    const m = k.medidores?.[id];
    return m && (t(m.numero) || t(m.lectura))
      ? [{ nombre, numero: t(m.numero) || '—', lectura: t(m.lectura) || '—' }]
      : [];
  });
  const imagenes = x.imagenes ?? new Map<string, string>();
  const permitidas = new Set(fotosParaPdf(k));
  const inventario = espaciosDe(k).map((e) => {
    const items = (Array.isArray(e.items) ? e.items : [])
      .filter((i) => t(i?.nombre) && i.estado !== 'na')
      .map((i) => ({
        nombre: t(i.nombre),
        cantidad: t(i.cantidad) || '—',
        estado: ESTADO[t(i.estado)] ?? 'Bueno',
        nota: t(i.nota),
      }));
    const fotos = (Array.isArray(e.fotos) ? e.fotos : [])
      .filter((f) => permitidas.has(t(f?.clave)) && imagenes.has(t(f.clave)))
      .map((f) => ({ src: imagenes.get(t(f.clave)) as string }));
    return {
      espacio: t(e.espacio),
      estadoEspacio: ESTADO[t(e.estado)] ?? 'Bueno',
      notaEspacio: t(e.nota),
      hayItems: items.length > 0,
      items,
      fotos,
    };
  });
  const conFotos = inventario.filter((e) => e.fotos.length).map((e) => ({ espacio: e.espacio, fotos: e.fotos }));
  const estacionamientos =
    t(k.estacionamientos) || (p.estacionamientos ? `${p.estacionamientos} (número no indicado)` : '');
  const bodega = t(k.bodega) || (p.bodegas ? `${p.bodegas} (número no indicado)` : '');
  const entregaNombre = t(k.entregadoPor?.nombre) || x.usuario.nombre;
  const aspectos = (Array.isArray(k.aspectos) ? k.aspectos : []).map((a) => ({ texto: t(a) })).filter((a) => a.texto);
  return {
    numero: x.numero.toLocaleString('es-CL'),
    ciudad: t(p.comuna) || 'Santiago',
    fechaEmision: fechaLarga(x.hoy),
    fechaEntrega: fechaLarga(fecha),
    corredora: x.corredora,
    entrega: { nombre: entregaNombre, rut: t(k.entregadoPor?.rut) },
    arrendador: x.duenos.map((d) => `${d.nombre}${d.rut ? `, RUT ${d.rut}` : ''}`).join(', y '),
    arrendatario: x.arrendatario,
    propiedad: {
      codigo: p.codigo,
      tipo,
      tipoMin: tipo.toLowerCase(),
      direccion,
      estacionamientos,
      bodega,
    },
    hayAccesos: accesos.length > 0 || !!llaves,
    hayListaAccesos: accesos.length > 0,
    accesos,
    llaves,
    hayMedidores: medidores.length > 0,
    medidores,
    gastosComunesDesde: fechaLarga(esFecha(k.gastosComunesDesde) ? k.gastosComunesDesde : fecha),
    hayAspectos: aspectos.length > 0,
    aspectos,
    inventario,
    hayFotos: conFotos.length > 0,
    conFotos,
    observaciones: t(k.observaciones),
  };
}
