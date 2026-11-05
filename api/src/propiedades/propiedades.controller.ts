import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';
import { PropiedadesService } from './propiedades.service';
import {
  archivarEsquema,
  captadorEsquema,
  importarEsquema,
  listarEsquema,
  propiedadEsquema,
  vinculoEsquema,
  type ImportarEntrada,
  type ListarPropiedades,
  type PropiedadEntrada,
  type VinculoEntrada,
} from './propiedades.esquemas';

const variosEsquema = z.object({ ids: z.array(z.uuid()).min(1).max(500), captadorId: z.uuid().nullable() });

@Controller('propiedades')
export class PropiedadesController {
  constructor(private readonly propiedades: PropiedadesService) {}

  /** GET /v1/propiedades?q=&tipo=&comuna=&operacion=&estado=&captador=&archivadas=&desde=&cursor=&limite= */
  @Get()
  listar(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(listarEsquema)) f: ListarPropiedades) {
    return this.propiedades.listar(u, f);
  }

  @Get('resumen')
  resumen(@UsuarioActual() u: UsuarioToken) {
    return this.propiedades.resumen(u);
  }

  @Get(':id')
  obtener(@UsuarioActual() u: UsuarioToken, @Param('id', ParseUUIDPipe) id: string) {
    return this.propiedades.obtener(u, id);
  }

  @Post()
  crear(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(propiedadEsquema)) o: PropiedadEntrada) {
    return this.propiedades.crear(u, o);
  }

  @Patch(':id')
  actualizar(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(propiedadEsquema)) o: PropiedadEntrada,
  ) {
    return this.propiedades.actualizar(u, id, o);
  }

  @Put(':id/archivada')
  archivar(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(archivarEsquema)) b: { archivada: boolean },
  ) {
    return this.propiedades.archivar(u, id, b.archivada);
  }

  @Delete(':id')
  eliminar(@UsuarioActual() u: UsuarioToken, @Param('id', ParseUUIDPipe) id: string) {
    return this.propiedades.eliminar(u, id);
  }

  @Put(':id/captador')
  captador(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(captadorEsquema)) b: { captadorId: string | null },
  ) {
    return this.propiedades.asignarCaptador(u, id, b.captadorId);
  }

  @Post('captador')
  captadorVarios(
    @UsuarioActual() u: UsuarioToken,
    @Body(new ZodPipe(variosEsquema)) b: { ids: string[]; captadorId: string | null },
  ) {
    return this.propiedades.asignarVarios(u, b.ids, b.captadorId);
  }

  @Post(':id/vinculos')
  vincular(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(vinculoEsquema)) v: VinculoEntrada,
  ) {
    return this.propiedades.vincular(u, id, v);
  }

  @Delete(':id/vinculos')
  desvincular(
    @UsuarioActual() u: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(vinculoEsquema)) v: VinculoEntrada,
  ) {
    return this.propiedades.desvincular(u, id, v);
  }

  /** POST /v1/propiedades/importar — { sistema, items: [{ origenId, datos, propietario? }] } por tandas de hasta 100 */
  @Post('importar')
  importar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(importarEsquema)) b: ImportarEntrada) {
    return this.propiedades.importar(u, b);
  }
}
