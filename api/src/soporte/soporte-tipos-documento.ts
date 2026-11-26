// Tipos de documento para soporte: /v1/soporte/tipos-documento. Ver y corregir el catálogo «Documentos» de CUALQUIER corredora (nombre,
// tipo de firma y trámite legal de cada tipo). Usa el mismo servicio que la app (TiposDocumentoService) como administrador de la corredora
// elegida. Solo entran los correos de PLATAFORMA_REVISORES; cada cambio queda en el log del servidor con «Soporte (correo)».
//  · GET    /soporte/tipos-documento?corredoraId=     la lista
//  · POST   /soporte/tipos-documento                  { corredoraId, nombre, tipoFirma, tramite, palabras? }
//  · PUT    /soporte/tipos-documento/:id              { corredoraId, nombre?, tipoFirma?, tramite?, palabras? }
//  · DELETE /soporte/tipos-documento/:id?corredoraId=
import { Body, Controller, Delete, Get, HttpCode, Injectable, Logger, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { TIPOS_FIRMA } from '../documentos/plantillas-doc';
import { TiposDocumentoService } from '../documentos/tipos-documento';
import { SoporteService } from './soporte';

const corredoraQ = z.object({ corredoraId: z.uuid() });
const idP = z.string().regex(/^[a-z0-9-]{2,60}$/, 'Tipo de documento no válido.');
const palabrasZ = z.array(z.string().trim().min(2).max(80)).max(12);
const crearB = z.object({ corredoraId: z.uuid(), nombre: z.string().trim().min(2).max(80), tipoFirma: z.enum(TIPOS_FIRMA), tramite: z.enum(['none', 'legalization']), palabras: palabrasZ.optional() });
const editarB = z.object({ corredoraId: z.uuid(), nombre: z.string().trim().min(2).max(80).optional(), tipoFirma: z.enum(TIPOS_FIRMA).optional(), tramite: z.enum(['none', 'legalization']).optional(), palabras: palabrasZ.optional() });

@Injectable()
export class SoporteTiposDocumentoService {
  private readonly log = new Logger('SoporteTiposDocumento');
  constructor(private readonly t: TiposDocumentoService) {}

  /** la misma persona de soporte, pero como administrador de la corredora cuyo catálogo se corrige */
  como(u: UsuarioToken, corredoraId: string): UsuarioToken {
    return { ...u, corredoraId, rol: 'ADMIN' };
  }
  anotar(quien: string, corredoraId: string, texto: string) {
    this.log.warn(`${quien} → tipos de documento (corredora ${corredoraId}): ${texto}`);
  }
  get servicio() {
    return this.t;
  }
}

@Controller('soporte/tipos-documento')
export class SoporteTiposDocumentoController {
  constructor(
    private readonly s: SoporteTiposDocumentoService,
    private readonly soporte: SoporteService,
  ) {}

  @Get()
  async lista(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(corredoraQ)) q: z.infer<typeof corredoraQ>) {
    await this.soporte.exigir(u);
    return { puedeEditar: true, items: await this.s.servicio.lista(q.corredoraId) };
  }

  @Post()
  @HttpCode(200)
  async crear(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(crearB)) b: z.infer<typeof crearB>) {
    const quien = await this.soporte.exigir(u);
    const r = await this.s.servicio.crear(this.s.como(u, b.corredoraId), { nombre: b.nombre, tipoFirma: b.tipoFirma, tramite: b.tramite, palabras: b.palabras });
    this.s.anotar(quien, b.corredoraId, `creó «${r.nombre}» (${r.tipoFirma} / ${r.tramite})`);
    return r;
  }

  @Put(':id')
  async editar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idP)) id: string, @Body(new ZodPipe(editarB)) b: z.infer<typeof editarB>) {
    const quien = await this.soporte.exigir(u);
    const { corredoraId, ...cambios } = b;
    const r = await this.s.servicio.actualizar(this.s.como(u, corredoraId), id, cambios);
    this.s.anotar(quien, corredoraId, `cambió «${r.nombre}» a ${r.tipoFirma} / ${r.tramite}`);
    return r;
  }

  @Delete(':id')
  async borrar(@UsuarioActual() u: UsuarioToken, @Param('id', new ZodPipe(idP)) id: string, @Query(new ZodPipe(corredoraQ)) q: z.infer<typeof corredoraQ>) {
    const quien = await this.soporte.exigir(u);
    const r = await this.s.servicio.borrar(this.s.como(u, q.corredoraId), id);
    this.s.anotar(quien, q.corredoraId, `borró el tipo «${id}»`);
    return r;
  }
}
