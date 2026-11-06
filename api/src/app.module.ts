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
import { FirmasController, FirmasService } from './firmas/firmas';
import { AgenteController, AgenteService } from './agente/agente';
import { ReglasNotarialesController, ReglasNotarialesService } from './plataforma/reglas-notariales';
import { CifradoService } from './conexiones/cifrado';
import { ConexionesController, ConexionesService } from './conexiones/conexiones';
import { PortalfirmaOAuth } from './conexiones/portalfirma.oauth';
import { PortalfirmaController, PortalfirmaService } from './conexiones/portalfirma';
import { ContadoresController, RegistrosController, RegistrosService } from './registros/registros';
import { WechatiaController, WechatiaService } from './whatsapp/wechatia';
import { ProgramadosController, ProgramadosService } from './whatsapp/programados';
import { AvisosController, AvisosService } from './avisos/avisos';
import { FirmasRondaController, FirmasRondaService } from './firmas/ronda';
import { IaService } from './whatsapp/ia';
import { EnviadosController, EnviadosService } from './whatsapp/enviados';
import { EjecutivoController, EjecutivoService } from './whatsapp/ejecutivo';
import { LeadsWaService } from './whatsapp/leads-wa';
import { ClientesService } from './whatsapp/clientes';
import { PostventaWaService } from './whatsapp/postventa';
import { ObservadorController, ObservadorService } from './whatsapp/observador';
import { LectorController, LectorService } from './whatsapp/lector';

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
    FirmasController,
    RegistrosController,
    ContadoresController,
    ConexionesController,
    PortalfirmaController,
    AgenteController,
    ReglasNotarialesController,
    WechatiaController,
    ProgramadosController,
    AvisosController,
    FirmasRondaController,
    EnviadosController,
    EjecutivoController,
    ObservadorController,
    LectorController,
  ],
  // el límite de intentos va antes que la sesión: un login fallido también cuenta
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    PropiedadesService,
    PersonasService,
    NegociosService,
    EventosService,
    LeadsService,
    FirmasService,
    RegistrosService,
    CifradoService,
    PortalfirmaOAuth,
    ConexionesService,
    PortalfirmaService,
    AgenteService,
    ReglasNotarialesService,
    WechatiaService,
    ProgramadosService,
    AvisosService,
    FirmasRondaService,
    IaService,
    EnviadosService,
    EjecutivoService,
    LeadsWaService,
    ClientesService,
    PostventaWaService,
    ObservadorService,
    LectorService,
  ],
})
export class AppModule {}
