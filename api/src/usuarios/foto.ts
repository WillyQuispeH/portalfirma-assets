// La foto de cada usuario (la que se ve en su avatar de la app): una imagen pequeña en data URL, guardada en registros
// (colección «perfil_foto», un registro por usuario con su id).
//  · GET    /v1/perfil/foto           la propia;
//  · PUT    /v1/perfil/foto { foto }  cambiarla (png, jpg o webp; la app la reduce a 256 px);
//  · DELETE /v1/perfil/foto           quitarla;
//  · GET    /v1/perfil/fotos          las de todos los usuarios de la corredora ({ [usuarioId]: foto }), para mostrar el equipo.
import { BadRequestException, Body, Controller, Delete, Get, Injectable, Put } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';

const COLECCION = 'perfil_foto';
/** una foto de 256 × 256 pesa ~20 KB: este tope (bajo el límite de 100 KB del cuerpo de las peticiones) deja pasar imágenes algo más grandes sin permitir cualquier cosa */
const MAX = 90_000;
const fotoEsquema = z.object({ foto: z.string().max(MAX).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'La foto debe ser una imagen png, jpg o webp.') });

@Injectable()
export class FotoService {
  constructor(private readonly db: PrismaService) {}

  private donde = (u: UsuarioToken) => ({ corredoraId_coleccion_id: { corredoraId: u.corredoraId, coleccion: COLECCION, id: u.sub } });

  async ver(u: UsuarioToken) {
    const r = await this.db.registro.findUnique({ where: this.donde(u) });
    const foto = (r?.datos as { foto?: string } | undefined)?.foto;
    return { foto: r && !r.eliminadoEn && foto ? foto : null };
  }

  async guardar(u: UsuarioToken, foto: string) {
    if (foto.length > MAX) throw new BadRequestException('La foto es muy pesada.');
    await this.db.registro.upsert({
      where: this.donde(u),
      create: { corredoraId: u.corredoraId, coleccion: COLECCION, id: u.sub, usuarioId: u.sub, creadoPorId: u.sub, datos: { foto } },
      update: { datos: { foto }, eliminadoEn: null, version: { increment: 1 } },
    });
    return { foto };
  }

  async quitar(u: UsuarioToken) {
    await this.db.registro.deleteMany({ where: { corredoraId: u.corredoraId, coleccion: COLECCION, id: u.sub } });
    return { foto: null };
  }

  async todas(u: UsuarioToken) {
    const l = await this.db.registro.findMany({ where: { corredoraId: u.corredoraId, coleccion: COLECCION, eliminadoEn: null }, select: { id: true, datos: true } });
    const out: Record<string, string> = {};
    for (const r of l) {
      const f = (r.datos as { foto?: string } | null)?.foto;
      if (f) out[r.id] = f;
    }
    return out;
  }
}

@Controller('perfil')
export class FotoController {
  constructor(private readonly s: FotoService) {}

  @Get('foto')
  ver(@UsuarioActual() u: UsuarioToken) {
    return this.s.ver(u);
  }

  @Put('foto')
  guardar(@UsuarioActual() u: UsuarioToken, @Body(new ZodPipe(fotoEsquema)) b: z.infer<typeof fotoEsquema>) {
    return this.s.guardar(u, b.foto);
  }

  @Delete('foto')
  quitar(@UsuarioActual() u: UsuarioToken) {
    return this.s.quitar(u);
  }

  @Get('fotos')
  todas(@UsuarioActual() u: UsuarioToken) {
    return this.s.todas(u);
  }
}
