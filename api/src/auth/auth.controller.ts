import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { IngresarDto, RenovarDto } from './dto/ingresar.dto';
import { Publico, UsuarioActual, type UsuarioToken } from './usuario-actual';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /v1/auth/ingresar — máximo 5 intentos por minuto por IP. */
  @Publico()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('ingresar')
  @HttpCode(200)
  ingresar(@Body() dto: IngresarDto, @Ip() ip: string) {
    return this.auth.ingresar(dto.email, dto.clave, { dispositivo: dto.dispositivo, ip });
  }

  @Publico()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('renovar')
  @HttpCode(200)
  renovar(@Body() dto: RenovarDto) {
    return this.auth.renovar(dto.tokenRenovar);
  }

  @Post('salir')
  @HttpCode(204)
  async salir(@UsuarioActual() u: UsuarioToken) {
    await this.auth.salir(u.sid);
  }

  @Get('yo')
  yo(@UsuarioActual() u: UsuarioToken) {
    return this.auth.yo(u.sub);
  }
}
