import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SesionGuard } from './sesion.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (c: ConfigService<Env, true>) => ({
        secret: c.get('JWT_SECRETO', { infer: true }),
        // expiresIn acepta «15m», «1h»…: el tipo de la librería es más estricto que string
        signOptions: { expiresIn: c.get<string>('JWT_DURACION') as unknown as number },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: SesionGuard }],
  exports: [AuthService],
})
export class AuthModule {}
