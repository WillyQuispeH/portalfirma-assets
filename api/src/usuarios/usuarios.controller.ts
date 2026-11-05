// Usuarios de la corredora (reemplazan a los «corredores» que la app guardaba en cada equipo).
//  · GET /usuarios/equipo — todos: nombre, rol y contacto del equipo (para mostrar captadores y asignar leads).
//  · GET, POST, PATCH /usuarios y PUT /usuarios/:id/clave — solo el administrador, dentro de su corredora.
//  · PUT /usuarios/yo/clave — cada uno cambia su propia clave.
// Desactivar a alguien o cambiarle la clave cierra sus sesiones abiertas.
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Prisma, type Usuario } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { hashClave, verificarClave } from '../auth/clave';
import { usuarioPublico } from '../auth/auth.service';
import { Roles, UsuarioActual, type UsuarioToken } from '../auth/usuario-actual';
import { ZodPipe } from '../comun/zod.pipe';

const clave = z.string().min(8, 'la clave debe tener al menos 8 caracteres').max(200);
const telefono = z.string().trim().max(40).nullish();
const crearEsquema = z.object({
  email: z.email('email inválido'),
  nombre: z.string().trim().min(2).max(120),
  clave,
  rol: z.enum(['ADMIN', 'CORREDOR']).optional(),
  telefono,
});
const editarEsquema = z.object({
  nombre: z.string().trim().min(2).max(120).optional(),
  rol: z.enum(['ADMIN', 'CORREDOR']).optional(),
  activo: z.boolean().optional(),
  telefono,
  wechatiaId: z.string().trim().max(80).nullish(),
  wechatiaNombre: z.string().trim().max(120).nullish(),
});
const claveEsquema = z.object({ clave });
const miClaveEsquema = z.object({ actual: z.string().min(1).max(200), nueva: clave });

const detalle = (u: Usuario) => ({
  ...usuarioPublico(u),
  activo: u.activo,
  telefono: u.telefono ?? '',
  wechatiaId: u.wechatiaId,
  wechatiaNombre: u.wechatiaNombre,
  ultimoIngreso: u.ultimoIngreso,
});

@Controller('usuarios')
@Roles('ADMIN')
export class UsuariosController {
  constructor(private readonly db: PrismaService) {}

  private async deMiCorredora(yo: UsuarioToken, id: string) {
    const u = await this.db.usuario.findFirst({ where: { id, corredoraId: yo.corredoraId } });
    if (!u) throw new NotFoundException('Ese usuario no existe.');
    return u;
  }

  private cerrarSesiones(usuarioId: string) {
    return this.db.sesion.updateMany({ where: { usuarioId, revocadaEn: null }, data: { revocadaEn: new Date() } });
  }

  @Get('equipo')
  @Roles('ADMIN', 'CORREDOR')
  async equipo(@UsuarioActual() yo: UsuarioToken) {
    const us = await this.db.usuario.findMany({ where: { corredoraId: yo.corredoraId }, orderBy: { nombre: 'asc' } });
    return us.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      telefono: u.telefono ?? '',
      activo: u.activo,
      wechatiaId: u.wechatiaId,
    }));
  }

  @Get()
  async listar(@UsuarioActual() yo: UsuarioToken) {
    const us = await this.db.usuario.findMany({ where: { corredoraId: yo.corredoraId }, orderBy: { nombre: 'asc' } });
    return us.map(detalle);
  }

  @Post()
  async crear(@UsuarioActual() yo: UsuarioToken, @Body(new ZodPipe(crearEsquema)) b: z.infer<typeof crearEsquema>) {
    try {
      const u = await this.db.usuario.create({
        data: {
          corredoraId: yo.corredoraId,
          email: b.email.trim().toLowerCase(),
          nombre: b.nombre,
          hashClave: await hashClave(b.clave),
          rol: b.rol ?? 'CORREDOR',
          telefono: b.telefono || null,
        },
      });
      return detalle(u);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException('Ya existe un usuario con ese email');
      throw e;
    }
  }

  @Patch(':id')
  async editar(
    @UsuarioActual() yo: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(editarEsquema)) b: z.infer<typeof editarEsquema>,
  ) {
    await this.deMiCorredora(yo, id);
    // que el administrador no se quite el acceso a sí mismo (quedaría la corredora sin nadie que administre)
    if (id === yo.sub && (b.activo === false || b.rol === 'CORREDOR'))
      throw new BadRequestException('No puedes desactivarte ni quitarte el rol de administrador.');
    const u = await this.db.usuario.update({
      where: { id },
      data: {
        ...(b.nombre !== undefined ? { nombre: b.nombre } : {}),
        ...(b.rol !== undefined ? { rol: b.rol } : {}),
        ...(b.activo !== undefined ? { activo: b.activo } : {}),
        ...(b.telefono !== undefined ? { telefono: b.telefono || null } : {}),
        ...(b.wechatiaId !== undefined ? { wechatiaId: b.wechatiaId || null } : {}),
        ...(b.wechatiaNombre !== undefined ? { wechatiaNombre: b.wechatiaNombre || null } : {}),
      },
    });
    if (b.activo === false) await this.cerrarSesiones(id);
    return detalle(u);
  }

  @Put(':id/clave')
  @HttpCode(204)
  async asignarClave(
    @UsuarioActual() yo: UsuarioToken,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(claveEsquema)) b: z.infer<typeof claveEsquema>,
  ) {
    await this.deMiCorredora(yo, id);
    await this.db.usuario.update({ where: { id }, data: { hashClave: await hashClave(b.clave) } });
    await this.cerrarSesiones(id);
  }

  @Put('yo/clave')
  @Roles('ADMIN', 'CORREDOR')
  @HttpCode(204)
  async miClave(
    @UsuarioActual() yo: UsuarioToken,
    @Body(new ZodPipe(miClaveEsquema)) b: z.infer<typeof miClaveEsquema>,
  ) {
    const u = await this.db.usuario.findUniqueOrThrow({ where: { id: yo.sub } });
    if (!(await verificarClave(u.hashClave, b.actual)))
      throw new BadRequestException('La clave actual no es correcta.');
    await this.db.usuario.update({ where: { id: yo.sub }, data: { hashClave: await hashClave(b.nueva) } });
    // cierra las demás sesiones (la de este equipo sigue)
    await this.db.sesion.updateMany({
      where: { usuarioId: yo.sub, revocadaEn: null, id: { not: yo.sid } },
      data: { revocadaEn: new Date() },
    });
  }
}
