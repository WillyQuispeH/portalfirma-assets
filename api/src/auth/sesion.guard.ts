// Todas las rutas piden sesión (token de acceso en «Authorization: Bearer …»), salvo las marcadas con @Publico().
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Rol } from '@prisma/client';
import { PUBLICO, ROLES, type PeticionConSesion, type UsuarioToken } from './usuario-actual';

@Injectable()
export class SesionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivo = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, objetivo)) return true;

    const req = ctx.switchToHttp().getRequest<PeticionConSesion>();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Inicia sesión');
    try {
      req.usuario = await this.jwt.verifyAsync<UsuarioToken>(token);
      // (verifyAsync ya revisa firma y vencimiento)
    } catch {
      throw new UnauthorizedException('La sesión venció');
    }

    const roles = this.reflector.getAllAndOverride<Rol[]>(ROLES, objetivo);
    if (roles?.length && !roles.includes(req.usuario.rol)) throw new ForbiddenException('No tienes permiso');
    return true;
  }
}
