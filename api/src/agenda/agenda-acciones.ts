/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- los eventos guardan sus datos como JSON */
// Reglas de la agenda que antes vivían solo en la app (desktop/src/agenda.js), ahora UNA vez en el servidor: crear un evento
// (visita, reunión, firma, llamada, tarea) con sus valores por defecto, y reprogramarlo, marcarlo hecho o cancelarlo. El cruce de
// visitas (las de una propiedad o de un corredor no se sobreponen) lo aplica EventosService.guardar y sale como 400 con code CRUCE.
//  · POST  /v1/agenda/eventos       { tipo, fecha, hora?, … }  → crea (el id lo pone el servidor)
//  · PATCH /v1/agenda/eventos/:id   { fecha?, hora?, estado?, notas?, … } → reprograma, marca hecho o cancela
//  · GET   /v1/agenda/eventos?desde=&hasta=&tipo=&propiedadId=&personaId=  → con sus ids y datos
// El corredor ve y edita lo suyo; el administrador, todo.
import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import type { Evento, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActividadService } from '../comun/actividad.service';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { normalizar } from '../comun/texto';
import { EventosService, eventoEsquema } from './eventos';
import { esAdmin, esUuid, idDoc } from '../comun/asignados';

export const TIPOS_EVENTO: Record<string, string> = { visita: 'Visita', reunion: 'Reunión', firma: 'Firma', llamada: 'Llamada', tarea: 'Tarea', otro: 'Evento' };
const ESTADOS = ['programado', 'hecho', 'cancelado'] as const;
const fechaOk = (f: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(f ?? '')) && !isNaN(Date.parse(String(f)));
const horaOk = (h: unknown) => !h || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h));
const ahora = () => new Date().toISOString();
const nombreDia = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', timeZone: 'UTC' });
const sumar = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface NuevoEvento {
  tipo: string;
  fecha: string;
  hora?: string | null;
  duracion?: number | null;
  titulo?: string | null;
  propiedadId?: string | null;
  personaIds?: string[];
  negocioId?: string | null;
  lugar?: string | null;
  notas?: string | null;
  corredorId?: string | null;
  /** el día de la semana que dijo el usuario («el jueves 13»): se verifica que coincida con la fecha */
  diaSemana?: string | null;
}
export interface CambiosEvento {
  fecha?: string;
  hora?: string | null;
  estado?: (typeof ESTADOS)[number];
  notas?: string;
  titulo?: string;
  lugar?: string;
  duracion?: number;
}

@Injectable()
export class AgendaAccionesService {
  constructor(
    private readonly db: PrismaService,
    private readonly eventos: EventosService,
    private readonly actividad: ActividadService,
  ) {}

  /** «el jueves 13» cuando el 13 es viernes: no se agenda hasta que el usuario aclare cuál quiso (devuelve el motivo, o null si coincide) */
  revisarDia(fecha: string, diaSemana?: string | null, hoy = new Date().toISOString().slice(0, 10)) {
    if (!diaSemana || !fechaOk(fecha)) return null;
    if (normalizar(diaSemana) === normalizar(nombreDia(fecha))) return null;
    let otra = fecha;
    for (let i = 0; i < 8; i++) {
      const x = sumar(hoy, i);
      if (normalizar(nombreDia(x)) === normalizar(diaSemana)) {
        otra = x;
        break;
      }
    }
    return `El ${fecha} es ${nombreDia(fecha)}, no ${diaSemana}. NO agendes todavía: pregúntale al usuario si quiso el ${nombreDia(fecha)} ${fecha} o el ${diaSemana} ${otra}.`;
  }

  async crear(u: UsuarioToken, o: NuevoEvento) {
    const tipo = TIPOS_EVENTO[o.tipo] ? o.tipo : 'otro';
    if (!fechaOk(o.fecha)) throw new BadRequestException('Indica la fecha del evento (AAAA-MM-DD).');
    if (!horaOk(o.hora)) throw new BadRequestException('La hora debe ser HH:MM, por ejemplo 15:30.');
    const motivoDia = this.revisarDia(o.fecha, o.diaSemana);
    if (motivoDia) throw new BadRequestException({ message: motivoDia, code: 'DIA_SEMANA' });
    const base = { corredoraId: u.corredoraId };
    const p = o.propiedadId
      ? await this.db.propiedad.findFirst({ where: { ...base, id: o.propiedadId, eliminadoEn: null }, select: { id: true, codigo: true, titulo: true, direccion: true, unidad: true, comuna: true } })
      : null;
    if (o.propiedadId && !p) throw new NotFoundException('No encontré esa propiedad.');
    if (tipo === 'visita' && !p) throw new BadRequestException('Una visita necesita la propiedad.');
    const ids = [...new Set((o.personaIds ?? []).filter(esUuid))];
    const personas = ids.length ? await this.db.persona.findMany({ where: { ...base, id: { in: ids }, eliminadoEn: null }, select: { id: true, nombre: true } }) : [];
    const lugarDe = p ? [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ') : '';
    const titulo =
      String(o.titulo ?? '').trim().slice(0, 120) ||
      [TIPOS_EVENTO[tipo], p ? `${p.codigo} ${p.titulo || ''}`.trim() : null, personas[0]?.nombre ?? null].filter(Boolean).join(' · ').slice(0, 120);
    const id = 'v' + Date.now().toString(36) + randomBytes(2).toString('hex');
    const entrada = eventoEsquema.parse({
      tipo,
      estado: 'programado',
      fecha: o.fecha,
      hora: o.hora || null,
      propId: p?.id ?? null,
      negocioId: o.negocioId || null,
      personaIds: personas.map((c) => c.id),
      ...(o.corredorId ? { corredorId: o.corredorId } : {}),
      titulo,
      duracion: Number(o.duracion) || (tipo === 'visita' ? 45 : 30),
      lugar: String(o.lugar || lugarDe).slice(0, 200),
      notas: String(o.notas ?? '').slice(0, 1000),
      orden: null,
      creado: ahora(),
      actualizado: ahora(),
    });
    const e = await this.eventos.guardar(u, id, entrada); // aquí se revisa el cruce de visitas (400 CRUCE)
    const cuando = `${o.fecha}${o.hora ? ' ' + o.hora : ''}`;
    const texto = `${TIPOS_EVENTO[tipo]} agendada para ${cuando}`;
    await this.actividad.registrar([
      { corredoraId: u.corredoraId, entidadTipo: 'evento', entidadId: id, texto, ref2: p?.id ?? null, usuarioId: u.sub },
      ...(p ? [{ corredoraId: u.corredoraId, entidadTipo: 'propiedad' as const, entidadId: p.id, texto: `${texto}${personas.length ? ' con ' + personas.map((c) => c.nombre).join(', ') : ''}`, ref2: id, usuarioId: u.sub }] : []),
      ...personas.map((c) => ({ corredoraId: u.corredoraId, entidadTipo: 'persona' as const, entidadId: c.id, texto: `${texto}${p ? ' en ' + p.codigo : ''}`, ref2: id, usuarioId: u.sub })),
    ]);
    return e;
  }

  /** reprograma, marca como hecho o cancela un evento (si cambia el horario de una visita se revisa el cruce otra vez) */
  async actualizar(u: UsuarioToken, id: string, c: CambiosEvento) {
    const e = (await this.eventos.obtener(u, id)) as Record<string, unknown> & { version: number; tipo: string; fecha: string; hora: string | null; propId: string | null };
    if (c.fecha !== undefined && !fechaOk(c.fecha)) throw new BadRequestException('Fecha no válida (AAAA-MM-DD).');
    if (c.hora !== undefined && !horaOk(c.hora)) throw new BadRequestException('Hora no válida (HH:MM).');
    if (c.estado !== undefined && !ESTADOS.includes(c.estado)) throw new BadRequestException('Estado no válido.');
    const nuevo: Record<string, unknown> = { ...e };
    if (c.fecha !== undefined) nuevo.fecha = c.fecha;
    if (c.hora !== undefined) nuevo.hora = c.hora || null;
    for (const k of ['titulo', 'notas', 'lugar'] as const) if (c[k] !== undefined) nuevo[k] = String(c[k] ?? '').slice(0, k === 'notas' ? 1000 : 200);
    if (c.duracion !== undefined) nuevo.duracion = Number(c.duracion) || e.duracion;
    if (c.estado !== undefined) nuevo.estado = c.estado;
    // otro día u hora: la confirmación anterior ya no vale
    if (e.confirmacion && (nuevo.fecha !== e.fecha || nuevo.hora !== e.hora)) delete nuevo.confirmacion;
    nuevo.actualizado = ahora();
    const guardado = await this.eventos.guardar(u, id, eventoEsquema.parse({ ...nuevo, version: e.version }));
    const tipoTxt = TIPOS_EVENTO[e.tipo] || 'Evento';
    const texto = c.estado && c.estado !== 'programado' ? `${tipoTxt} ${c.estado === 'hecho' ? 'realizada' : 'cancelada'}` : `${tipoTxt} reprogramada para ${nuevo.fecha}${nuevo.hora ? ' ' + nuevo.hora : ''}`;
    await this.actividad.registrar([
      { corredoraId: u.corredoraId, entidadTipo: 'evento', entidadId: id, texto, ref2: e.propId, usuarioId: u.sub },
      ...(e.propId ? [{ corredoraId: u.corredoraId, entidadTipo: 'propiedad' as const, entidadId: e.propId, texto, ref2: id, usuarioId: u.sub }] : []),
    ]);
    return guardado;
  }

  /** eventos con sus ids, para elegir cuál reprogramar o cerrar */
  async listar(u: UsuarioToken, f: { desde?: string; hasta?: string; tipo?: string; propiedadId?: string; personaId?: string; estado?: string; incluirCancelados?: boolean; texto?: string; limite?: number }) {
    const where: Prisma.EventoWhereInput = {
      corredoraId: u.corredoraId,
      eliminadoEn: null,
      ...(esAdmin(u) ? {} : { corredorId: u.sub }),
      ...(f.desde || f.hasta ? { fecha: { ...(f.desde ? { gte: new Date(f.desde + 'T00:00:00Z') } : {}), ...(f.hasta ? { lte: new Date(f.hasta + 'T00:00:00Z') } : {}) } } : {}),
      ...(f.tipo ? { tipo: f.tipo } : {}),
      ...(f.estado ? { estado: f.estado } : f.incluirCancelados ? {} : { estado: { not: 'cancelado' } }),
      ...(f.propiedadId ? { propiedadId: f.propiedadId } : {}),
      ...(f.personaId ? { personaIds: { has: f.personaId } } : {}),
    };
    const filas = await this.db.evento.findMany({ where, orderBy: [{ fecha: 'asc' }, { hora: 'asc' }], take: 200 });
    const props = await this.db.propiedad.findMany({ where: { id: { in: filas.map((x) => x.propiedadId).filter((x): x is string => !!x) } }, select: { id: true, codigo: true } });
    const pers = await this.db.persona.findMany({ where: { id: { in: [...new Set(filas.flatMap((x) => x.personaIds))].filter(esUuid) } }, select: { id: true, nombre: true } });
    const q = normalizar(f.texto ?? '');
    const salida = filas
      .map((e: Evento) => {
        const d = (e.datos ?? {}) as Record<string, any>;
        return {
          id: e.id,
          tipo: e.tipo,
          estado: e.estado,
          fecha: e.fecha.toISOString().slice(0, 10),
          hora: e.hora,
          titulo: String(d.titulo ?? ''),
          lugar: String(d.lugar ?? ''),
          duracion: Number(d.duracion) || null,
          propiedad: props.find((x) => x.id === e.propiedadId)?.codigo ?? null,
          personas: e.personaIds.map((id) => pers.find((x) => x.id === id)?.nombre).filter((x): x is string => !!x),
          ordenDeVisita: d.orden?.operacion ?? null,
          negocioId: e.negocioId,
        };
      })
      .filter((e) => !q || normalizar(`${e.titulo} ${e.lugar} ${e.propiedad} ${e.personas.join(' ')}`).includes(q));
    return { total: salida.length, eventos: salida.slice(0, f.limite ?? 30) };
  }
}

const nuevoEsquema = z.object({
  tipo: z.enum(['visita', 'reunion', 'firma', 'llamada', 'tarea', 'otro']),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha AAAA-MM-DD'),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'hora HH:MM').nullish(),
  duracion: z.number().int().min(5).max(1440).nullish(),
  titulo: z.string().max(120).nullish(),
  propiedadId: z.uuid().nullish(),
  personaIds: z.array(z.uuid()).max(20).optional(),
  negocioId: idDoc.nullish(),
  lugar: z.string().max(200).nullish(),
  notas: z.string().max(1000).nullish(),
  corredorId: z.uuid().nullish(),
  diaSemana: z.string().max(20).nullish(),
});
const cambiosEsquema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  estado: z.enum(ESTADOS).optional(),
  notas: z.string().max(1000).optional(),
  titulo: z.string().max(120).optional(),
  lugar: z.string().max(200).optional(),
  duracion: z.number().int().min(5).max(1440).optional(),
});
const listarEsquema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tipo: z.enum(['visita', 'reunion', 'firma', 'llamada', 'tarea', 'otro']).optional(),
  estado: z.enum(ESTADOS).optional(),
  propiedadId: z.uuid().optional(),
  personaId: z.uuid().optional(),
  incluirCancelados: z.stringbool().optional(),
});

@Controller('agenda/eventos')
export class AgendaAccionesController {
  constructor(private readonly s: AgendaAccionesService) {}

  @Get()
  listar(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listarEsquema)) q: z.infer<typeof listarEsquema>) {
    return this.s.listar(u, q);
  }

  @Post()
  crear(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(nuevoEsquema)) b: z.infer<typeof nuevoEsquema>) {
    return this.s.crear(u, b);
  }

  @Patch(':id')
  actualizar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idDoc)) id: string, @Body(new ZodPipe(cambiosEsquema)) b: z.infer<typeof cambiosEsquema>) {
    return this.s.actualizar(u, id, b);
  }
}
