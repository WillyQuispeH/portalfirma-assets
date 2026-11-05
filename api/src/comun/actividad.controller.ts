// GET /v1/actividad — todo, por páginas · GET /v1/actividad/:entidadId — lo de una propiedad, persona, negocio…
// POST /v1/actividad/notas — una nota escrita a mano en el historial de algo.
// POST /v1/actividad — entradas automáticas que registra la app (envíos, WhatsApp, leads, negocios…), de a una o varias.
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ActividadService } from './actividad.service';
import { ZodPipe } from './zod.pipe';

const paginaEsquema = z.object({
  antesDe: z.string().regex(/^\d+$/).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(60),
});
const ENTIDADES = ['propiedad', 'persona', 'negocio', 'evento', 'otro'] as const;
const notaEsquema = z.object({
  entidadTipo: z.enum(ENTIDADES),
  entidadId: z.string().min(1).max(80),
  texto: z.string().trim().min(1, 'escribe la nota').max(600),
});
const entradaEsquema = z.object({
  entidadTipo: z.enum(ENTIDADES),
  entidadId: z.string().min(1).max(80),
  texto: z.string().trim().min(1).max(600),
  ref2: z.string().max(80).nullish(),
  /** nota | lead | null (automática) */
  tipo: z.enum(['nota', 'lead']).nullish(),
});
const registrarEsquema = z.union([entradaEsquema, z.array(entradaEsquema).min(1).max(100)]);

@Controller('actividad')
export class ActividadController {
  constructor(private readonly actividad: ActividadService) {}

  @Get()
  todas(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(paginaEsquema)) q: z.infer<typeof paginaEsquema>) {
    return this.actividad.todas(u.corredoraId, q);
  }

  @Get(':entidadId')
  de(@UsuarioActual() u: UsuarioToken, @Param('entidadId') entidadId: string) {
    return this.actividad.de(u.corredoraId, entidadId);
  }

  @Post()
  async registrar(
    @UsuarioActual() u: UsuarioToken,
    @Body(new ZodPipe(registrarEsquema)) b: z.infer<typeof registrarEsquema>,
  ) {
    const lista = Array.isArray(b) ? b : [b];
    await this.actividad.registrar(
      lista.map((a) => ({
        corredoraId: u.corredoraId,
        entidadTipo: a.entidadTipo,
        entidadId: a.entidadId,
        texto: a.texto,
        ref2: a.ref2 ?? null,
        tipo: a.tipo ?? null,
        usuarioId: u.sub,
      })),
    );
    return { registradas: lista.length };
  }

  @Post('notas')
  async nota(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(notaEsquema)) n: z.infer<typeof notaEsquema>) {
    await this.actividad.registrar({
      corredoraId: u.corredoraId,
      entidadTipo: n.entidadTipo,
      entidadId: n.entidadId,
      texto: n.texto,
      tipo: 'nota',
      usuarioId: u.sub,
    });
    return this.actividad.de(u.corredoraId, n.entidadId);
  }
}
