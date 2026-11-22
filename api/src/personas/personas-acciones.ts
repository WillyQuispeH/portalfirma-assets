// Reglas de personas (CRM) que usan la app de escritorio y las herramientas de WhatsApp: crear una persona (RUT opcional pero, si se da,
// válido y único), encontrar o crear la persona de un contacto (lead o interesado de un portal) y dejar notas en el historial.
// Port de desktop/src/inmo.js (guardarPersona, personaDesdeLead). El corredor no ve los datos de dueños de propiedades que no captó
// (PersonasService.reservadas).
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActividadService, type EntidadTipo } from '../comun/actividad.service';
import { formatearRut, limpiarRut, rutValido } from '../comun/texto';
import type { UsuarioToken } from '../auth/usuario-actual';
import { PersonasService } from './personas.service';
import { ROLES } from './personas.esquemas';

export const emailValido = (e: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e ?? '').trim());
const ult9 = (t: unknown) => {
  const d = String(t ?? '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-9) : null;
};
/** un nombre que en realidad es un teléfono o un correo (todavía no se supo cómo se llama) */
const nombreFalso = (n: string) => !n || n === 'Interesado' || /^[+\d\s().-]+$/.test(n) || /@/.test(n);

export interface DatosPersona {
  nombre: string;
  rut?: string | null;
  email?: string | null;
  telefono?: string | null;
  roles?: string[];
  tipo?: 'natural' | 'juridica' | null;
  direccion?: string | null;
  estadoCivil?: string | null;
  profesion?: string | null;
  notas?: string | null;
}
export interface Contacto {
  nombre?: string | null;
  telefono?: string | null;
  email?: string | null;
  rut?: string | null;
  /** de dónde llegó, para el historial («Portal Inmobiliario», «Instagram»…) */
  origen?: string;
  leadId?: string | null;
  evento?: string | null;
}

@Injectable()
export class PersonasAccionesService {
  constructor(
    private readonly db: PrismaService,
    private readonly personas: PersonasService,
    private readonly actividad: ActividadService,
  ) {}

  /** crea una persona: el RUT es opcional; si se da debe ser válido y no estar ya en el CRM */
  async crear(u: UsuarioToken, o: DatosPersona) {
    const nombre = String(o.nombre ?? '').trim().replace(/\s+/g, ' ');
    if (!nombre) throw new BadRequestException('Indica el nombre o la razón social.');
    const rut = String(o.rut ?? '').trim();
    if (rut && !rutValido(rut)) throw new BadRequestException(`El RUT ${rut} no es válido (el dígito verificador no calza).`);
    const email = String(o.email ?? '').trim();
    if (email && !emailValido(email)) throw new BadRequestException(`El correo ${email} no es válido.`);
    if (rut) {
      const dup = await this.db.persona.findFirst({ where: { corredoraId: u.corredoraId, rut: limpiarRut(rut), eliminadoEn: null } });
      if (dup)
        throw new ConflictException({ message: `Ya existe ${dup.nombre} con ese RUT (${formatearRut(dup.rut)}).`, code: 'DUP_RUT', personaId: dup.id });
    }
    const roles = [...new Set((o.roles ?? []).filter((r): r is (typeof ROLES)[number] => (ROLES as readonly string[]).includes(r)))];
    return this.personas.crear(u, {
      nombre,
      rut: rut || null,
      email: email || null,
      telefono: o.telefono || null,
      roles,
      tipo: o.tipo ?? null,
      direccion: o.direccion || null,
      estadoCivil: o.estadoCivil || null,
      profesion: o.profesion || null,
      notas: o.notas ? String(o.notas).slice(0, 2000) : null,
    });
  }

  /**
   * La persona que corresponde a un contacto (por RUT, celular o correo) o, si no existe, una nueva con rol interesado; lo que llega
   * después se le agrega sin pisar lo que ya estaba. Nunca falla: devuelve null si no hay datos o algo sale mal.
   */
  async deContacto(u: UsuarioToken, c: Contacto): Promise<{ id: string; nombre: string; nueva: boolean } | null> {
    try {
      const t = ult9(c.telefono);
      const em = String(c.email ?? '').toLowerCase().trim();
      const nombre = String(c.nombre ?? '').trim();
      if (!nombre && !t && !em && !c.rut) return null;
      const base = { corredoraId: u.corredoraId, eliminadoEn: null };
      let p =
        (c.rut && rutValido(c.rut) ? await this.db.persona.findFirst({ where: { ...base, rut: limpiarRut(c.rut) } }) : null) ??
        (t
          ? await this.db
              .$queryRaw<{ id: string }[]>`SELECT id FROM personas WHERE corredora_id = ${u.corredoraId}::uuid AND eliminado_en IS NULL AND telefono IS NOT NULL AND right(regexp_replace(telefono, '\\D', '', 'g'), 9) = ${t} LIMIT 1`
              .then((r) => (r[0] ? this.db.persona.findUnique({ where: { id: r[0].id } }) : null))
          : null) ??
        (em && emailValido(em) ? await this.db.persona.findFirst({ where: { ...base, email: em } }) : null);
      if (!p) {
        const creada = (await this.personas.crear(u, {
          nombre: nombre || c.telefono || c.email || 'Interesado',
          rut: c.rut && rutValido(c.rut) ? c.rut : null,
          email: em && emailValido(em) ? em : null,
          telefono: c.telefono ? String(c.telefono).trim() : null,
          roles: ['interesado'],
          ...(c.leadId ? { extra: { leadId: c.leadId } } : {}),
        })) as { id: string; nombre: string };
        await this.actividad.registrar({
          corredoraId: u.corredoraId,
          entidadTipo: 'persona',
          entidadId: creada.id,
          texto: `Llegó como interesado por ${c.origen || 'un canal'}`,
          tipo: 'lead',
          ref2: c.leadId ?? null,
          usuarioId: u.sub,
        });
        if (c.evento)
          await this.actividad.registrar({ corredoraId: u.corredoraId, entidadTipo: 'persona', entidadId: creada.id, texto: c.evento, tipo: 'lead', ref2: c.leadId ?? null, usuarioId: u.sub });
        return { id: creada.id, nombre: creada.nombre, nueva: true };
      }
      // completar lo que falte (nunca pisa lo que ya estaba)
      const cambios: Prisma.PersonaUncheckedUpdateInput = {};
      const agregado: string[] = [];
      if (nombreFalso(p.nombre) && nombre && !/^[+\d\s().-]+$/.test(nombre)) {
        cambios.nombre = nombre;
        agregado.push('nombre');
      }
      if (!p.telefono && c.telefono) {
        cambios.telefono = String(c.telefono).trim();
        agregado.push('teléfono');
      }
      if (!p.email && em && emailValido(em)) {
        cambios.email = em;
        agregado.push('correo');
      }
      if (!p.roles.length) cambios.roles = ['interesado'];
      if (Object.keys(cambios).length) {
        p = await this.db.persona.update({ where: { id: p.id }, data: { ...cambios, version: { increment: 1 } } });
        if (agregado.length)
          await this.actividad.registrar({
            corredoraId: u.corredoraId,
            entidadTipo: 'persona',
            entidadId: p.id,
            texto: `Se agregó su ${agregado.join(', ')} (desde ${c.origen || 'un contacto'})`,
            tipo: 'lead',
            ref2: c.leadId ?? null,
            usuarioId: u.sub,
          });
      }
      if (c.evento)
        await this.actividad.registrar({ corredoraId: u.corredoraId, entidadTipo: 'persona', entidadId: p.id, texto: c.evento, tipo: 'lead', ref2: c.leadId ?? null, usuarioId: u.sub });
      return { id: p.id, nombre: p.nombre, nueva: false };
    } catch {
      return null;
    }
  }

  /** una nota en el historial de una propiedad, persona, negocio o evento */
  async nota(u: UsuarioToken, entidadTipo: EntidadTipo, entidadId: string, texto: string) {
    const t = String(texto ?? '').trim();
    if (!t) throw new BadRequestException('Escribe la nota.');
    await this.actividad.registrar({ corredoraId: u.corredoraId, entidadTipo, entidadId, texto: t.slice(0, 600), tipo: 'nota', usuarioId: u.sub });
    return { ok: true };
  }
}
