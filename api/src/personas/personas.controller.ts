import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import { PersonasService } from './personas.service';
import {
  listarEsquema,
  personaEsquema,
  personaParcial,
  type ListarPersonas,
  type PersonaEntrada,
  type PersonaParcial,
} from './personas.esquemas';

@Controller('personas')
export class PersonasController {
  constructor(private readonly personas: PersonasService) {}

  /** GET /v1/personas?q=&desde=&cursor=&limite= */
  @Get()
  listar(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listarEsquema)) f: ListarPersonas) {
    return this.personas.listar(u, f);
  }

  @Get(':id')
  obtener(@UsuarioActual() u: UsuarioToken, @Param('id', ParseUUIDPipe) id: string) {
    return this.personas.obtener(u, id);
  }

  @Post()
  crear(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(personaEsquema)) o: PersonaEntrada) {
    return this.personas.crear(u, o);
  }

  @Patch(':id')
  actualizar(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(personaParcial)) o: PersonaParcial,
  ) {
    return this.personas.actualizar(u, id, o);
  }

  @Delete(':id')
  eliminar(@UsuarioActual() u: UsuarioToken, @Param('id', ParseUUIDPipe) id: string) {
    return this.personas.eliminar(u, id);
  }
}
