// Lo que la app manda al crear, editar, listar e importar propiedades (mismos nombres que usa la app de escritorio).
import { z } from 'zod';
import { ROLES } from '../personas/personas.esquemas';

export const TIPOS = [
  'casa',
  'departamento',
  'oficina',
  'sitio',
  'local_comercial',
  'industrial',
  'agricola',
  'parcela',
  'estacionamiento',
  'terreno_construccion',
  'bodega',
] as const;
export const ESTADOS = ['disponible', 'reservada', 'vendida', 'arrendada', 'no_disponible'] as const;
export const MONEDAS = ['UF', 'CLP', 'USD'] as const;

// '' y null valen «sin dato»; los números pueden venir como texto desde un formulario
const vacio = (v: unknown) => (v === '' || v === undefined ? null : v);
const numero = z.preprocess(vacio, z.coerce.number().finite().nullable()).optional();
const entero = z.preprocess(vacio, z.coerce.number().int().min(0).max(10_000).nullable()).optional();
const txt = (max: number) => z.preprocess(vacio, z.string().max(max).nullable()).optional();
const precio = z
  .object({ valor: z.coerce.number().finite().min(0), moneda: z.enum(MONEDAS).catch('UF') })
  .nullable()
  .optional();

export const propiedadEsquema = z.object({
  codigo: txt(40),
  titulo: z.string().trim().max(160).optional(),
  tipo: z.enum(TIPOS).catch('casa').optional(),
  venta: z.boolean().optional(),
  arriendo: z.boolean().optional(),
  precioVenta: precio,
  precioArriendo: precio,
  estadoVenta: z.enum(ESTADOS).nullable().catch('disponible').optional(),
  estadoArriendo: z.enum(ESTADOS).nullable().catch('disponible').optional(),
  direccion: txt(300),
  unidad: txt(40),
  comuna: txt(80),
  region: txt(80),
  rol: txt(40),
  lat: z.preprocess(vacio, z.coerce.number().min(-90).max(90).nullable().catch(null)).optional(),
  lng: z.preprocess(vacio, z.coerce.number().min(-180).max(180).nullable().catch(null)).optional(),
  placeId: txt(300),
  supTotal: numero,
  supUtil: numero,
  dormitorios: entero,
  banos: entero,
  estacionamientos: entero,
  bodegas: entero,
  amoblado: z.boolean().optional(),
  gastosComunes: numero,
  descripcion: txt(20_000),
  notasInternas: txt(5_000),
  tituloPortal: txt(160),
  portalBarrio: txt(120),
  etiquetas: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  /** se combina con la que había: los datos nuevos se suman; un dato en null se borra */
  ficha: z.record(z.string(), z.unknown()).optional(),
  portales: z.record(z.string(), z.unknown()).optional(),
  leads: z.array(z.record(z.string(), z.unknown())).max(300).optional(),
  /** urls https de las fotos, en orden (la primera es la destacada) */
  fotos: z
    .array(
      z
        .string()
        .max(2000)
        .regex(/^https?:\/\//, 'las fotos deben ser direcciones https'),
    )
    .max(60)
    .optional(),
  corredor: z.record(z.string(), z.unknown()).nullable().optional(),
  captadorId: z.uuid().nullable().optional(),
  idLegado: txt(80),
  version: z.number().int().positive().optional(),
});
export type PropiedadEntrada = z.infer<typeof propiedadEsquema>;

export const listarEsquema = z.object({
  q: z.string().max(100).optional(),
  tipo: z.enum(TIPOS).optional(),
  comuna: z.string().max(80).optional(),
  operacion: z.enum(['venta', 'arriendo']).optional(),
  estado: z.enum(ESTADOS).optional(),
  /** «yo», «sin» (sin captador) o el id de un usuario */
  captador: z.union([z.literal('yo'), z.literal('sin'), z.uuid()]).optional(),
  archivadas: z.enum(['no', 'si', 'todas']).default('no'),
  /** sincronización: solo lo que cambió después de esta fecha (incluye eliminadas y archivadas) */
  desde: z.iso.datetime().optional(),
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(500).default(100),
});
export type ListarPropiedades = z.infer<typeof listarEsquema>;

export const vinculoEsquema = z.object({ personaId: z.uuid(), rol: z.enum(ROLES) });
export type VinculoEntrada = z.infer<typeof vinculoEsquema>;

export const captadorEsquema = z.object({ captadorId: z.uuid().nullable() });
export const archivarEsquema = z.object({ archivada: z.boolean() });

/** Importación desde otro sistema (Portalfirma…): por tandas de hasta 100. */
export const importarEsquema = z.object({
  sistema: z.string().trim().min(1).max(40),
  items: z
    .array(
      z.object({
        origenId: z.string().trim().min(1).max(80),
        origenDatos: z.record(z.string(), z.unknown()).optional(),
        datos: propiedadEsquema,
        propietario: z
          .object({
            nombre: z.string().max(200),
            rut: z.string().max(20),
            email: z.string().max(200).nullish(),
            telefono: z.string().max(40).nullish(),
          })
          .nullish(),
      }),
    )
    .min(1)
    .max(100),
});
export type ImportarEntrada = z.infer<typeof importarEsquema>;
