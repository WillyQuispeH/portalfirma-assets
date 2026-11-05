// Lo que la app manda al crear o editar una persona (mismos nombres que usa la app de escritorio).
import { z } from 'zod';

export const ROLES = ['propietario', 'arrendatario', 'comprador', 'codeudor', 'interesado', 'proveedor'] as const;

const opc = (max: number) => z.string().max(max).nullish();

export const personaEsquema = z.object({
  nombre: z.string().trim().min(1, 'indica el nombre o la razón social').max(200),
  rut: opc(20),
  tipo: z.enum(['natural', 'juridica']).nullish(),
  email: z.union([z.literal(''), z.email('el correo no es válido')]).nullish(),
  telefono: opc(40),
  direccion: opc(300),
  estadoCivil: opc(60),
  profesion: opc(120),
  nacionalidad: opc(60),
  roles: z.array(z.enum(ROLES)).max(6).nullish(),
  notas: opc(2000),
  /** datos sin columna propia (lo que la app guarde de más: leadId, corredor del lead…) */
  extra: z.record(z.string(), z.unknown()).nullish(),
  idLegado: opc(80),
  version: z.number().int().positive().optional(),
});
export type PersonaEntrada = z.infer<typeof personaEsquema>;
export const personaParcial = personaEsquema.partial().extend({ version: z.number().int().positive().optional() });
export type PersonaParcial = z.infer<typeof personaParcial>;

export const listarEsquema = z.object({
  q: z.string().max(100).optional(),
  /** sincronización: solo lo que cambió después de esta fecha (incluye las eliminadas, con `eliminado: true`) */
  desde: z.iso.datetime().optional(),
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(500).default(200),
});
export type ListarPersonas = z.infer<typeof listarEsquema>;
