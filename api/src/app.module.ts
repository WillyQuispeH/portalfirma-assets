import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { archivoEnv, validarEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsuariosController } from './usuarios/usuarios.controller';
import { SaludController } from './salud/salud.controller';
import { ActividadModule } from './comun/actividad.service';
import { ActividadController } from './comun/actividad.controller';
import { PersonasController } from './personas/personas.controller';
import { PersonasService } from './personas/personas.service';
import { PropiedadesController } from './propiedades/propiedades.controller';
import { PropiedadesService } from './propiedades/propiedades.service';
import { ArchivosModule } from './archivos/archivos';
import { NegociosController, NegociosService } from './negocios/negocios';
import { EventosController, EventosService } from './agenda/eventos';
import { LeadsController, LeadsService } from './leads/leads';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: archivoEnv(), validate: validarEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    ActividadModule,
    ArchivosModule,
  ],
  controllers: [
    UsuariosController,
    SaludController,
    PropiedadesController,
    PersonasController,
    ActividadController,
    NegociosController,
    EventosController,
    LeadsController,
  ],
  // el límite de intentos va antes que la sesión: un login fallido también cuenta
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    PropiedadesService,
    PersonasService,
    NegociosService,
    EventosService,
    LeadsService,
  ],
})
export class AppModule {}
