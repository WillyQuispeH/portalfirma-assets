// Plantillas de documentos para soporte: /v1/soporte/plantillas. Ver y corregir las plantillas de CUALQUIER corredora: sus cláusulas
// (versión propia), cómo se firma (tipo de firma y legalización notarial), la aprobación legal, volver a una versión anterior y el
// PDF de muestra. Usa el mismo servicio que la app (PlantillasDocService) como administrador de la corredora elegida, así valida igual
// los textos y guarda la misma versión. Solo entran los correos de PLATAFORMA_REVISORES; cada cambio lleva «Soporte (correo)» en la
// nota de la versión y queda en el log del servidor.
//  · GET  /soporte/plantillas?corredoraId=                         la lista con su estado y su firma
//  · GET  /soporte/plantillas/:nombre?corredoraId=                 cláusulas, versiones, firma y aprobación
//  · PUT  /soporte/plantillas/:nombre                              { corredoraId, bloques, nota? } → nueva versión
//  · PUT  /soporte/plantillas/:nombre/firma                        { corredoraId, tipoFirma, tramite }
//  · POST /soporte/plantillas/:nombre/aprobar                      { corredoraId, revisor, nota? }
//  · POST /soporte/plantillas/:nombre/restaurar                    { corredoraId, version } (0 = la base)
//  · POST /soporte/plantillas/:nombre/vista-previa                 { corredoraId, bloques? } → { pdf: base64 }
import { Body, Controller, Get, HttpCode, Injectable, Logger, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { PlantillasDocService, TIPOS_FIRMA } from '../documentos/plantillas-doc';
import { SoporteService } from './soporte';

const corredoraQ = z.object({ corredoraId: z.uuid() });
const nombreP = z.string().regex(/^[a-z0-9-]{3,60}$/, 'Plantilla no válida.');
const bloquesZ = z.record(z.string().max(60), z.string().max(20_000));
const guardarB = z.object({ corredoraId: z.uuid(), bloques: bloquesZ, nota: z.string().trim().max(450).optional() });
const firmaB = z.object({ corredoraId: z.uuid(), tipoFirma: z.enum(TIPOS_FIRMA), tramite: z.enum(['none', 'legalization']) });
const aprobarB = z.object({
  corredoraId: z.uuid(),
  revisor: z.string().trim().min(2, 'Escribe quién revisó la plantilla (nombre del abogado o notario).').max(160),
  nota: z.string().trim().max(450).optional(),
});
const restaurarB = z.object({ corredoraId: z.uuid(), version: z.number().int().min(0) });
const previaB = z.object({ corredoraId: z.uuid(), bloques: bloquesZ.optional() });

@Injectable()
export class SoportePlantillasService {
  private readonly log = new Logger('SoportePlantillas');
  constructor(private readonly p: PlantillasDocService) {}

  /** la misma persona de soporte, pero como administrador de la corredora cuyas plantillas se corrigen */
  como(u: UsuarioToken, corredoraId: string): UsuarioToken {
    return { ...u, corredoraId, rol: 'ADMIN' };
  }
  anotar(quien: string, corredoraId: string, nombre: string, texto: string) {
    this.log.warn(`${quien} → plantilla ${nombre} (corredora ${corredoraId}): ${texto}`);
  }
  nota = (quien: string, nota?: string) => `Soporte (${quien})${nota ? `: ${nota}` : ''}`;
  get servicio() {
    return this.p;
  }
}

@Controller('soporte/plantillas')
export class SoportePlantillasController {
  constructor(
    private readonly s: SoportePlantillasService,
    private readonly soporte: SoporteService,
  ) {}

  @Get()
  async lista(@UsuarioActual() u: UsuarioToken, @Query(new ZodPipe(corredoraQ)) q: z.infer<typeof corredoraQ>) {
    await this.soporte.exigir(u);
    return this.s.servicio.lista(this.s.como(u, q.corredoraId));
  }

  @Get(':nombre')
  async detalle(@UsuarioActual() u: UsuarioToken, @Param('nombre', new ZodPipe(nombreP)) nombre: string, @Query(new ZodPipe(corredoraQ)) q: z.infer<typeof corredoraQ>) {
    await this.soporte.exigir(u);
    return this.s.servicio.detalle(this.s.como(u, q.corredoraId), nombre);
  }

  @Put(':nombre')
  async guardar(@UsuarioActual() u: UsuarioToken, @Param('nombre', new ZodPipe(nombreP)) nombre: string, @Body(new ZodPipe(guardarB)) b: z.infer<typeof guardarB>) {
    const quien = await this.soporte.exigir(u);
    const r = await this.s.servicio.guardar(this.s.como(u, b.corredoraId), nombre, { bloques: b.bloques, nota: this.s.nota(quien, b.nota) });
    this.s.anotar(quien, b.corredoraId, nombre, `guardó la versión ${r.version}`);
    return r;
  }

  @Put(':nombre/firma')
  async firma(@UsuarioActual() u: UsuarioToken, @Param('nombre', new ZodPipe(nombreP)) nombre: string, @Body(new ZodPipe(firmaB)) b: z.infer<typeof firmaB>) {
    const quien = await this.soporte.exigir(u);
    const r = await this.s.servicio.guardarFirma(this.s.como(u, b.corredoraId), nombre, { tipoFirma: b.tipoFirma, tramite: b.tramite });
    this.s.anotar(quien, b.corredoraId, nombre, `cambió la firma a ${b.tipoFirma} / ${b.tramite}`);
    return r;
  }

  @Post(':nombre/aprobar')
  @HttpCode(200)
  async aprobar(@UsuarioActual() u: UsuarioToken, @Param('nombre', new ZodPipe(nombreP)) nombre: string, @Body(new ZodPipe(aprobarB)) b: z.infer<typeof aprobarB>) {
    const quien = await this.soporte.exigir(u);
    const r = await this.s.servicio.aprobar(this.s.como(u, b.corredoraId), nombre, { revisor: b.revisor, nota: this.s.nota(quien, b.nota) });
    this.s.anotar(quien, b.corredoraId, nombre, `registró la aprobación de «${b.revisor}»`);
    return r;
  }

  @Post(':nombre/restaurar')
  @HttpCode(200)
  async restaurar(@UsuarioActual() u: UsuarioToken, @Param('nombre', new ZodPipe(nombreP)) nombre: string, @Body(new ZodPipe(restaurarB)) b: z.infer<typeof restaurarB>) {
    const quien = await this.soporte.exigir(u);
    const r = await this.s.servicio.restaurar(this.s.como(u, b.corredoraId), nombre, b.version);
    this.s.anotar(quien, b.corredoraId, nombre, `volvió a la versión ${b.version}`);
    return r;
  }

  @Post(':nombre/vista-previa')
  @HttpCode(200)
  async vistaPrevia(@UsuarioActual() u: UsuarioToken, @Param('nombre', new ZodPipe(nombreP)) nombre: string, @Body(new ZodPipe(previaB)) b: z.infer<typeof previaB>) {
    await this.soporte.exigir(u);
    return this.s.servicio.vistaPrevia(this.s.como(u, b.corredoraId), nombre, b.bloques);
  }
}
