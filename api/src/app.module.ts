import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LimiteGuard } from './comun/limite.guard';
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
import { ConvectaController, ConvectaService } from './propiedades/convecta';
import { CorredoraDocController, CorredoraDocService } from './documentos/corredora-doc';
import { PlantillasDocController, PlantillasDocService } from './documentos/plantillas-doc';
import { DominioIaController, DominioIaService } from './propiedades/dominio-ia';
import { FeedsController } from './propiedades/feeds';
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
import { MercadoLibreOAuth } from './conexiones/mercadolibre.oauth';
import { GoogleEmpresaOAuth, GoogleOAuth } from './conexiones/google.oauth';
import { GoogleService } from './conexiones/google';
import { MercadoLibreController, MercadoLibreService } from './conexiones/mercadolibre';
import { ContadoresController, RegistrosController, RegistrosService } from './registros/registros';
import { CanalesController, WechatiaController, WechatiaService } from './whatsapp/wechatia';
import { ProgramadosController, ProgramadosService } from './whatsapp/programados';
import { AvisosController, AvisosService } from './avisos/avisos';
import { FirmasRondaController, FirmasRondaService } from './firmas/ronda';
import { IaService } from './whatsapp/ia';
import { IaAppController } from './ia/ia-app';
import { TranscripcionService } from './ia/transcripcion';
import { EnviadosController, EnviadosService } from './whatsapp/enviados';
import { EjecutivoController, EjecutivoService } from './whatsapp/ejecutivo';
import { EquipoService } from './whatsapp/equipo';
import { FotosWaService } from './whatsapp/fotos-wa';
import { OrdenVisitaController, OrdenVisitaService } from './whatsapp/orden-visita';
import { PdfService } from './documentos/pdf.service';
import { EnvioFirmaService } from './documentos/envio-firma';
import { CartaOfertaController, CartaOfertaService } from './negocios/carta-oferta';
import { ContratoArriendoController, ContratoArriendoService } from './negocios/contrato-arriendo';
import { MandatoArriendoController, MandatoArriendoService } from './negocios/mandato-arriendo';
import { MandatoVentaController, MandatoVentaService } from './negocios/mandato-venta';
import { EscrituraCompraventaController, EscrituraCompraventaService } from './negocios/escritura-compraventa';
import { PromesaCompraventaController, PromesaCompraventaService } from './negocios/promesa-compraventa';
import { ActaEntregaController, ActaEntregaService } from './negocios/acta-entrega';
import { ActaFirmaController, ActaFirmaService } from './whatsapp/acta-firma';
import { LeadsWaService } from './whatsapp/leads-wa';
import { AvisoLeadController, AvisoLeadService } from './whatsapp/aviso-lead';
import { ClientesService } from './whatsapp/clientes';
import { PostventaWaService } from './whatsapp/postventa';
import { ObservadorController, ObservadorService } from './whatsapp/observador';
import { EvaluacionController, EvaluacionService } from './whatsapp/evaluacion';
import { ConfirmacionVisitaController, ConfirmacionVisitaService } from './whatsapp/confirmacion-visita';
import { DocumentoRevisionService } from './whatsapp/documento-revision';
import { ActaVisitaController, ActaVisitaService } from './whatsapp/acta-visita';
import { LectorController, LectorService } from './whatsapp/lector';
import { AsistentesConfigController, AsistentesConfigService } from './whatsapp/asistentes-config';
import { LeadsEnvioController, PuenteService } from './whatsapp/puente';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: archivoEnv(), validate: validarEnv }),
    // por usuario (LimiteGuard): una app abierta pide avisos cada 3 s + sincronización; 300/min deja holgura
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuthModule,
    ActividadModule,
    ArchivosModule,
  ],
  controllers: [
    DominioIaController,
    PlantillasDocController,
    CorredoraDocController,
    ConvectaController,
    UsuariosController,
    SaludController,
    PropiedadesController,
    FeedsController,
    PersonasController,
    ActividadController,
    NegociosController,
    EventosController,
    LeadsController,
    AvisoLeadController,
    LeadsEnvioController,
    FirmasController,
    RegistrosController,
    ContadoresController,
    ConexionesController,
    PortalfirmaController,
    MercadoLibreController,
    AgenteController,
    ReglasNotarialesController,
    WechatiaController,
    CanalesController,
    IaAppController,
    ProgramadosController,
    AvisosController,
    FirmasRondaController,
    EnviadosController,
    EjecutivoController,
    ObservadorController,
    LectorController,
    AsistentesConfigController,
    EvaluacionController,
    OrdenVisitaController,
    CartaOfertaController,
    ContratoArriendoController,
    MandatoArriendoController,
    MandatoVentaController,
    EscrituraCompraventaController,
    PromesaCompraventaController,
    ActaEntregaController,
    ActaFirmaController,
    ConfirmacionVisitaController,
    ActaVisitaController,
  ],
  // el límite de intentos va antes que la sesión: un login fallido también cuenta
  providers: [
    { provide: APP_GUARD, useClass: LimiteGuard },
    PropiedadesService,
    ConvectaService,
    CorredoraDocService,
    PlantillasDocService,
    DominioIaService,
    PersonasService,
    NegociosService,
    EventosService,
    LeadsService,
    FirmasService,
    RegistrosService,
    CifradoService,
    PortalfirmaOAuth,
    MercadoLibreOAuth,
    GoogleOAuth,
    GoogleEmpresaOAuth,
    GoogleService,
    ConexionesService,
    PortalfirmaService,
    MercadoLibreService,
    AgenteService,
    ReglasNotarialesService,
    WechatiaService,
    ProgramadosService,
    AvisosService,
    EquipoService,
    FotosWaService,
    OrdenVisitaService,
    PdfService,
    EnvioFirmaService,
    CartaOfertaService,
    ContratoArriendoService,
    MandatoArriendoService,
    MandatoVentaService,
    EscrituraCompraventaService,
    PromesaCompraventaService,
    ActaEntregaService,
    ActaFirmaService,
    TranscripcionService,
    FirmasRondaService,
    IaService,
    EnviadosService,
    EjecutivoService,
    LeadsWaService,
    AvisoLeadService,
    ClientesService,
    PostventaWaService,
    ObservadorService,
    LectorService,
    AsistentesConfigService,
    PuenteService,
    EvaluacionService,
    ConfirmacionVisitaService,
    DocumentoRevisionService,
    ActaVisitaService,
  ],
})
export class AppModule {}
