import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Rol } from '@prisma/client';
import type { Request } from 'express';

/** Lo que viaja en el token de acceso. */
export interface UsuarioToken {
  sub: string;
  corredoraId: string;
  rol: Rol;
  sid: string;
}

/** La petición HTTP con el usuario que dejó SesionGuard. */
export type PeticionConSesion = Request & { usuario?: UsuarioToken };

/** @UsuarioActual() en un parámetro del controlador: el usuario de la sesión. */
export const UsuarioActual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UsuarioToken =>
    ctx.switchToHttp().getRequest<PeticionConSesion>().usuario as UsuarioToken,
);

/** @Publico() en una ruta: no pide sesión. */
export const PUBLICO = 'publico';
export const Publico = () => SetMetadata(PUBLICO, true);

/** @Roles('ADMIN') en una ruta: solo esos roles. */
export const ROLES = 'roles';
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES, roles);
