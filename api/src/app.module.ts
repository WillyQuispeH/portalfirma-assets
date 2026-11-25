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
import { KonverController, KonverService } from './conexiones/konver';
import { CorredoraDocController, CorredoraDocService } from './documentos/corredora-doc';
import { PlantillasDocController, PlantillasDocService } from './documentos/plantillas-doc';
import { DominioIaController, DominioIaService } from './propiedades/dominio-ia';
import { FeedsController } from './propiedades/feeds';
import { ArchivosModule } from './archivos/archivos';
import { NegociosController, NegociosService } from './negocios/negocios';
import { NegocioAccionesController, NegocioAccionesService } from './negocios/negocio-acciones';
import { EventosController, EventosService } from './agenda/eventos';
import { LeadsController, LeadsService } from './leads/leads';
import { FirmasController, FirmasService } from './firmas/firmas';
import { AgenteController, AgenteService } from './agente/agente';
import { ReglasNotarialesController, ReglasNotarialesService } from './plataforma/reglas-notariales';
import { CifradoService } from './conexiones/cifrado';
import { ConexionesController, ConexionesService } from './conexiones/conexiones';
import { PortalfirmaOAuth } from './conexiones/portalfirma.oauth';
import { PortalfirmaController, PortalfirmaService } from './conexiones/portalfirma';
import { PortalfirmaApiController, PortalfirmaApiService } from './conexiones/portalfirma-api';
import { FotoController, FotoService } from './usuarios/foto';
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
import { EnvioFirmaService, EnvioPdfController, PosicionesFirmaController } from './documentos/envio-firma';
import { ExtraerFirmantesController, ExtraerFirmantesService } from './documentos/extraer-firmantes';
import { LeerComprobanteController, LeerComprobanteService } from './documentos/leer-comprobante';
import { CartaOfertaController, CartaOfertaService } from './negocios/carta-oferta';
import { ContratoArriendoController, ContratoArriendoService } from './negocios/contrato-arriendo';
import { MandatoArriendoController, MandatoArriendoService } from './negocios/mandato-arriendo';
import { MandatoVentaController, MandatoVentaService } from './negocios/mandato-venta';
import { EscrituraCompraventaController, EscrituraCompraventaService } from './negocios/escritura-compraventa';
import { PromesaCompraventaController, PromesaCompraventaService } from './negocios/promesa-compraventa';
import { ActaEntregaController, ActaEntregaService } from './negocios/acta-entrega';
import { ActaPdfController, ActaPdfService } from './whatsapp/acta-pdf';
import { AyudasHerramientas } from './whatsapp/herramientas/ayudas';
import { HerramientasRegistro } from './whatsapp/herramientas/registro';
import { HerramientasNegocios } from './whatsapp/herramientas/negocios';
import { HerramientasPropiedades } from './whatsapp/herramientas/propiedades';
import { HerramientasDocumentos } from './whatsapp/herramientas/documentos';
import { HerramientasFirmas } from './whatsapp/herramientas/documentos-firmas';
import { LeadsWaService } from './whatsapp/leads-wa';
import { AvisoLeadController, AvisoLeadService } from './whatsapp/aviso-lead';
import { AvisoFirmaService } from './whatsapp/aviso-firma';
import { EnlacesCortosController, EnlacesCortosService } from './archivos/enlaces-cortos';
import { ClientesService } from './whatsapp/clientes';
import { PostventaWaService } from './whatsapp/postventa';
import { ObservadorController, ObservadorService } from './whatsapp/observador';
import { EvaluacionController, EvaluacionService } from './whatsapp/evaluacion';
import { ConfirmacionVisitaController, ConfirmacionVisitaService } from './whatsapp/confirmacion-visita';
import { RecordatorioVisitaService } from './whatsapp/recordatorio-visita';
import { SoporteController, SoporteService } from './soporte/soporte';
import { IncidenciasController, IncidenciasService } from './soporte/incidencias';
import { SoporteWaController, SoporteWaService } from './soporte/soporte-wa';
import { SoportePersonasController, SoportePersonasService } from './soporte/soporte-personas';
import { SoporteNegociosController, SoporteNegociosService } from './soporte/soporte-negocios';
import { SoportePlantillasController, SoportePlantillasService } from './soporte/soporte-plantillas';
import { SoporteDocumentosController, SoporteDocumentosService } from './soporte/soporte-documentos';
import { SoportePropiedadesController, SoportePropiedadesService } from './soporte/soporte-propiedades';
import { SoporteIntegracionesController, SoporteIntegracionesService } from './soporte/soporte-integraciones';
import { PublicacionAutoService } from './conexiones/publicacion-auto';
import { DocumentoRevisionService } from './whatsapp/documento-revision';
import { RevisionContratoWaService } from './whatsapp/revision-contrato';
import { ActaVisitaController, ActaVisitaService } from './whatsapp/acta-visita';
import { LectorController, LectorService } from './whatsapp/lector';
import { AsistentesConfigController, AsistentesConfigService } from './whatsapp/asistentes-config';
import { LeadsEnvioController, PuenteService } from './whatsapp/puente';
import { DictadoService } from './propiedades/dictado';
import { PropiedadesAccionesController, PropiedadesAccionesService } from './propiedades/propiedades-acciones';
import { PersonasAccionesService } from './personas/personas-acciones';
import { AgendaAccionesController, AgendaAccionesService } from './agenda/agenda-acciones';
import { LeadsAccionesController, LeadsAccionesService } from './leads/leads-acciones';
import { AnalisisLeadService } from './leads/analisis-lead';
import { CorredorPerfilController, CorredorPerfilService } from './usuarios/corredor-perfil';
import { PortalInmobiliarioController, PortalInmobiliarioService } from './conexiones/portal-inmobiliario';

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
    KonverController,
    PortalfirmaApiController,
    FotoController,
    PosicionesFirmaController,
    EnvioPdfController,
    ExtraerFirmantesController,
    LeerComprobanteController,
    UsuariosController,
    SaludController,
    PropiedadesController,
    FeedsController,
    PersonasController,
    ActividadController,
    NegociosController,
    NegocioAccionesController,
    EventosController,
    LeadsController,
    AvisoLeadController,
    EnlacesCortosController,
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
    ActaPdfController,
    ConfirmacionVisitaController,
    SoporteController,
    IncidenciasController,
    SoporteWaController,
    SoportePersonasController,
    SoporteNegociosController,
    SoportePlantillasController,
    SoporteDocumentosController,
    SoportePropiedadesController,
    SoporteIntegracionesController,
    ActaVisitaController,
    PropiedadesAccionesController,
    AgendaAccionesController,
    LeadsAccionesController,
    CorredorPerfilController,
    PortalInmobiliarioController,
  ],
  // el límite de intentos va antes que la sesión: un login fallido también cuenta
  providers: [
    { provide: APP_GUARD, useClass: LimiteGuard },
    PropiedadesService,
    ConvectaService,
    KonverService,
    CorredoraDocService,
    PlantillasDocService,
    DominioIaService,
    PersonasService,
    NegociosService,
    NegocioAccionesService,
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
    PortalfirmaApiService,
    FotoService,
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
    ExtraerFirmantesService,
    LeerComprobanteService,
    CartaOfertaService,
    ContratoArriendoService,
    MandatoArriendoService,
    MandatoVentaService,
    EscrituraCompraventaService,
    PromesaCompraventaService,
    ActaEntregaService,
    ActaPdfService,
    AyudasHerramientas,
    HerramientasRegistro,
    HerramientasNegocios,
    HerramientasPropiedades,
    HerramientasDocumentos,
    HerramientasFirmas,
    TranscripcionService,
    FirmasRondaService,
    IaService,
    EnviadosService,
    EjecutivoService,
    LeadsWaService,
    AvisoLeadService,
    AvisoFirmaService,
    EnlacesCortosService,
    ClientesService,
    PostventaWaService,
    ObservadorService,
    LectorService,
    AsistentesConfigService,
    PuenteService,
    EvaluacionService,
    ConfirmacionVisitaService,
    RecordatorioVisitaService,
    SoporteService,
    IncidenciasService,
    SoporteWaService,
    SoportePersonasService,
    SoporteNegociosService,
    SoportePlantillasService,
    SoporteDocumentosService,
    SoportePropiedadesService,
    SoporteIntegracionesService,
    PublicacionAutoService,
    DocumentoRevisionService,
    RevisionContratoWaService,
    ActaVisitaService,
    DictadoService,
    PropiedadesAccionesService,
    PersonasAccionesService,
    AgendaAccionesService,
    LeadsAccionesService,
    AnalisisLeadService,
    CorredorPerfilService,
    PortalInmobiliarioService,
  ],
})
export class AppModule {}
