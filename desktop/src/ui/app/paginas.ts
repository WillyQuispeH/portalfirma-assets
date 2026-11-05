// Páginas en React que la interfaz actual puede montar: ReactUI.montar('<nombre>', el).
// Una carpeta por pestaña del menú (app/{pestaña}/page.tsx), como en la guía del equipo.
// En Asset no hay rutas por URL: cada pestaña se abre desde app.js (src/renderer).
import type { ComponentType } from 'react';
import ActividadPage from './actividad/page';
import AgendaPage from './agenda/page';
import ArriendosPage from './arriendos/page';
import CarteraPage from './cartera/page';
import FichaPropiedadPage from './cartera/ficha/page';
import FichaPersonaPage from './personas/ficha/page';
import FinanzasPage from './finanzas/page';
import GestionCargaMasivaPage from './gestion/carga-masiva/page';
import GestionEditorPdfPage from './gestion/editor-pdf/page';
import GestionEnviarAFirmarPage from './gestion/enviar-a-firmar/page';
import GestionExpedientesPage from './gestion/expedientes/page';
import GestionFirmasPresencialesPage from './gestion/firmas-presenciales/page';
import GestionInicioPage from './gestion/inicio/page';
import GestionOperacionesPage from './gestion/operaciones/page';
import GestionPlazosPage from './gestion/plazos/page';
import GestionFlujosPage from './gestion/flujos/page';
import GestionNotariaVirtualPage from './gestion/notaria-virtual/page';
import GestionRecientesPage from './gestion/recientes/page';
import HoyPage from './hoy/page';
import InicioSesionPage from './inicio-sesion/page';
import LeadsPage from './leads/page';
import NegociosPage from './negocios/page';
import OficinaPage from './oficina/page';
import PersonasPage from './personas/page';
import PostventaPage from './postventa/page';
import PublicacionesPage from './publicaciones/page';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada página define sus props
export const paginas: Record<string, ComponentType<any>> = {
  Actividad: ActividadPage, // desde Inicio: window.Actividad.abrir() en src/renderer/actividad.js
  Agenda: AgendaPage,
  Arriendos: ArriendosPage, // pestaña Arriendos: abrirArriendos() en src/renderer/app.js // pestaña Agenda: abrirAgenda() en src/renderer/agenda.js
  Cartera: CarteraPage,
  FichaPropiedad: FichaPropiedadPage, // { id, vez }: Inmo.abrirFicha(id) en src/renderer/inmo.js, en #view-cartera
  FichaPersona: FichaPersonaPage, // { id, vez }: Inmo.abrirPersona(id) en src/renderer/inmo.js, en #view-personas
  Finanzas: FinanzasPage, // pestaña Finanzas: abrirFinanzas() en src/renderer/app.js
  // Gestión documental: cada parte es una página propia (app/gestion/{parte})
  GestionCargaMasiva: GestionCargaMasivaPage, // Masiva.open() en src/renderer/masiva.js
  GestionEditorPdf: GestionEditorPdfPage, // window.editor.open() (components/functional/gestion/editor-pdf/controlador.tsx), en #edBody
  GestionEnviarAFirmar: GestionEnviarAFirmarPage, // { paso }: una por sección (#view-drop, -working, -review, -done), montadas al cargar app.js
  GestionExpedientes: GestionExpedientesPage, // Expedientes.open() en src/renderer/expedientes.js
  GestionFirmasPresenciales: GestionFirmasPresencialesPage, // Escrituras.open() en src/renderer/escrituras.js
  GestionInicio: GestionInicioPage,
  GestionOperaciones: GestionOperacionesPage,
  GestionPlazos: GestionPlazosPage, // Plazos.open() en src/renderer/plazos.js // Operaciones.open() en src/renderer/operaciones.js // studio.goHome() en src/renderer/home.js
  GestionFlujos: GestionFlujosPage, // Flujos.open() en src/renderer/flujos.js
  GestionNotariaVirtual: GestionNotariaVirtualPage, // window.openTemplates() en src/renderer/templates.js
  GestionRecientes: GestionRecientesPage, // Recientes.open() en src/renderer/home.js
  Hoy: HoyPage, // el inicio en lista: abrir() de window.Hoy en src/renderer/etapas.js
  InicioSesion: InicioSesionPage, // #view-login: app.js la monta al cargar; requireLogin() la muestra
  Leads: LeadsPage, // pestaña Leads: abrir() en src/renderer/leads.js
  Negocios: NegociosPage, // pestaña Negocios: abrirNegocios() en src/renderer/negocios.js
  Oficina: OficinaPage, // el inicio: abrir() de window.Oficina en src/renderer/oficina.js
  Personas: PersonasPage,
  Postventa: PostventaPage, // pestaña Postventa: abrir() en src/renderer/postventa.js
  Publicaciones: PublicacionesPage, // pestaña Publicaciones: abrir() en src/renderer/publicaciones.js // pestaña Personas: personas() en src/renderer/inmo.js
};
