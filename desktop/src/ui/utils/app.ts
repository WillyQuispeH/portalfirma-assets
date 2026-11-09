// Puente con la interfaz actual (src/renderer). Lo que React usa de ella pasa por aquí,
// así queda en un solo lugar y es fácil de reemplazar cuando esas partes se migren.
import { createElement } from 'react';
import { VentanaConfirmar } from '../components/ui/Ventana';
import { abrirModal, cerrarModal } from './modal';
import type { IEvento } from '../store/interfaces/evento.interface';
import type { ILeadLista } from '../store/interfaces/lead.interface';
import type { IPvChat, IPvContratista } from '../store/interfaces/postventa.interface';

export const toast = (mensaje: string, ms?: number) => window.toast(mensaje, ms);
// muestra el resultado de una acción del store ({ mensaje } o { error })
export const avisar = (r: { mensaje?: string; error?: string }, ms = 5000) => { if (r.error) window.toast(r.error, ms); else if (r.mensaje) window.toast(r.mensaje, ms); };
// abre un enlace en el navegador del sistema (o mailto:, wa.me…)
export const abrirUrl = (url: string) => { window.pf.openUrl(url); };

// Navegación a pantallas que aún no están en React
export const abrirNegocio = (id: string) => window.Negocios?.abrirNegocio(id);
export const abrirFicha = (id: string) => window.Inmo.abrirFicha(id);
export const abrirPersona = (id: string) => window.Inmo.abrirPersona(id);
export const abrirInicio = () => window.Inmo.inicio();
export const abrirAgenda = () => window.Agenda.abrir();
export const abrirPlazos = () => window.Plazos.open(); // Plazos y vencimientos (Gestión documental)
export const abrirActividad = () => window.Actividad.abrir();
export const hayOficina = () => !!window.Oficina;
export const abrirOficina = () => { window.Oficina!.pref.set('oficina'); window.Oficina!.abrir(); };
// abre una pestaña del menú como si se tocara (cartera, negocios, leads, agente…)
export const abrirPestana = (vista: string) => (document.querySelector(`#nav [data-view="${vista}"]`) as HTMLElement | null)?.click();
export const abrirLead = (id: string) => { abrirPestana('leads'); window.Leads.abrir(id); };
// pasa a la pestaña del Agente y le envía el texto
export const enviarAlAgente = (texto: string) => { abrirPestana('agente'); setTimeout(() => window.Agente.enviar?.(texto), 60); };
// el inicio en vista de lista («Hoy») en vez de «La oficina»
export const verHoy = () => { window.Oficina?.pref.set('clasica'); window.Hoy.abrir(); };
// «La oficina»: la geometría de la escena (oficina-geo.js) y los personajes animados (oficina-lienzo.js)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- geometría generada por una herramienta
export const geometriaOficina = (): Record<string, any> => window.OF_GEO || { zonas: {}, glow: {} };
export const montarLienzoOficina = (escena: HTMLElement, o: { luz: string; sel: string | null }) => window.OfLienzo?.montar(escena, o);
// la Ayuda contextual (botón «?») según la pantalla
export const avisarAyuda = (vista: string) => window.Ayuda?.onView?.(vista);

// Etapas (src/renderer/etapas.js): la acción de un paso, «Empezar algo nuevo» y la «luz guía» de los botones .luz
export const accionPaso = (paso: object, alTerminar: () => void) => window.Etapas.accion(paso, alTerminar);
export const empezarAlgoNuevo = () => window.Hoy.nuevo();
export const luzGuia = (raiz: HTMLElement) => window.Etapas.luz(raiz);

// ¿Hay sesión de Portalfirma? (lo que necesita la cuenta, como revisar firmas)
export const esMiembro = () => !!window.isMember?.();
// «Nuevo negocio» (src/renderer/negocios.js): al crearlo abre su ficha.
export const nuevoNegocio = (pre: { tipo?: string; propId?: string } = {}) => window.Negocios?.nuevo(pre);

// Abre el Agente con el texto ya escrito (pide iniciar sesión si hace falta).
export function pedirAlAgente(texto: string) {
  window.members(() => {
    window.Agente.open();
    const q = document.getElementById('agQ') as HTMLTextAreaElement | null;
    if (q) { q.value = texto; q.focus(); }
  }, 'El Agente trabaja con tu cuenta de Portalfirma. Inicia sesión para usarlo.');
}

// Formularios y pantallas de src/renderer/inmo.js que aún no están en React
export const nuevaPropiedad = () => window.Inmo.formProp();
export const nuevaPersona = () => window.Inmo.formPersona();
export const importarCartera = () => window.Inmo.importar();
export const abrirPortales = () => window.Inmo.portales();
export async function dictarPropiedad() { await window.Agente.open(); window.Dictado.abrir(); }

// Pide confirmar en una ventana del kit (VentanaConfirmar: botones #mOk y #mCancel). En `texto` y `nota`, lo que va
// entre ** se muestra en negrita. `peligro`: botón rojo (borrar, eliminar…).
export function confirmar({ titulo, texto, nota = '', boton, clave, peligro = false }: { titulo: string; texto: string; nota?: string; boton: string; clave?: string; peligro?: boolean }): Promise<boolean> {
  return new Promise((resolver) => {
    const fin = (si: boolean) => { cerrarModal(); resolver(si); };
    abrirModal(createElement(VentanaConfirmar, { titulo, texto, nota, boton, peligro, alResponder: fin }), { clave });
  });
}

// Leads (src/renderer/leads.js): la conversación y la ficha del lead, y los asistentes de importación
export const mostrarLead = (sel: string | null, datos: ILeadLista, filtro: string) => window.Leads.mostrar(sel, datos, filtro);
export const leadsCuentas = () => window.Leads.cuentas();
export const leadsComoExportar = () => window.Leads.comoExportar();
export const leadsComoInstagram = () => window.Leads.comoInstagram();
export const leadsImportar = (ruta: string, canal?: string) => window.Leads.importarRuta(ruta, canal);
// ruta en disco de un archivo elegido con <input type="file"> (preload: webUtils.getPathForFile)
export const rutaDe = (archivo: File) => (window.pf.pathForFile as unknown as (f: File) => string)(archivo);

// Publicaciones (src/renderer/publicaciones.js): el flujo «Publicar» y sus formularios
export const elegirParaPublicar = () => window.Publicaciones.elegir();
export const publicarPropiedad = (propId: string, op?: string, paso?: 1 | 2) => window.Publicaciones.publicar(propId, op, paso);
export const ajustarPrecioAviso = (propId: string, op: string) => window.Publicaciones.ajustarPrecio(propId, op);
export const agregarInteresado = () => window.Publicaciones.agregarInteresado();
export const editarContactoAvisos = (contacto: object) => window.Publicaciones.contacto(contacto);
// «Agendar visita» con un interesado: el formulario de la agenda, con la persona del CRM si ya existe
export const agendarVisitaInteresado = (interesado: object, despues: () => void) => window.Publicaciones.agendarVisita(interesado, despues);
export const conectarPortalInmobiliario = () => window.Inmo.portales();

// Postventa (src/renderer/postventa.js): el detalle del reclamo (en #pvDet) y los formularios
export const mostrarReclamo = (id: string | null) => window.Postventa.mostrar(id);
export const verConversacion = (chat: IPvChat) => window.Postventa.verChat(chat);
export const nuevoReclamo = () => window.Postventa.nuevo();
export const nuevoContratista = (): Promise<IPvContratista | null> => window.Postventa.formContratista();

// Agente: los formularios en ventana siguen en src/renderer/agente.js (window.AgenteModales)
export const adjuntarAlAgente = () => window.AgenteModales.adjuntar();
export const verHerramientasAgente = () => window.AgenteModales.herramientas();
export const verActividadAgente = () => window.AgenteModales.actividad();
export const claveIA = () => window.AgenteModales.claveIA();
export const renombrarConversacion = (c: object) => window.AgenteModales.renombrar(c);
export const borrarConversacion = (c: object) => window.AgenteModales.borrar(c);
export const abrirAgenteWhatsApp = () => window.WhatsAppAgente?.abrir();
// cómo está hoy una propiedad (la tarjeta del flujo guiado, src/renderer/gestion.js)
export const estadoPropiedad = (propId: string) => window.Gestion.estado(propId);

// Gestión documental (src/renderer/home.js): las acciones del inicio, abrir documentos y la biblioteca de plantillas
export const accionGestion = (k: string) => window.studio.accion(k);
export const abrirRecientes = () => window.Recientes.open();
export const abrirReciente = (ruta: string) => window.studio.abrirReciente(ruta);
export const abrirDocumento = () => window.editor.openDialog(true);
export const abrirDrive = (proposito = 'sign') => window.Drive.open({ purpose: proposito });
export const abrirAyudaNivel = (nivel: string) => window.Ayuda?.open?.({ level: nivel });

// Expedientes (src/renderer/expedientes.js): formularios, Drive y las acciones sobre los archivos marcados
export const nuevoExpediente = () => window.Expedientes.createDialog();
export const masOpcionesExpediente = (e: object) => window.Expedientes.mas(e);
export const desdeDriveExpediente = (e: object) => window.Expedientes.desdeDrive(e);
export const accionExpediente = (que: string, archivos: object[], e: object) => window.Expedientes.accion(que, archivos, e);
export const elegirExpedienteLegado = (id: string | null) => window.Expedientes.elegido(id);
// abrir una operación en «Mis operaciones»
export const abrirOperaciones = () => { window.show('ops'); window.Operaciones.open(); };
export const verOperacion = (n: number) => { window.show('ops'); window.Operaciones.open().then(() => window.Operaciones.select(n)); };

// Mis operaciones (src/renderer/operaciones.js): teléfono de la cuenta, acceso a los documentos y errores del archivo
export const pedirTelefonoOperaciones = (cambiar = false) => window.OperacionesModales.telefono(cambiar);
export const configurarAccesoDocumentos = (despues?: () => void) => window.OperacionesModales.acceso(despues);
export const errorArchivoOperacion = (r: { error?: string; code?: string }) => window.OperacionesModales.errorArchivo(r);
export const iniciarSesionOperaciones = () => window.OperacionesModales.iniciarSesion();
export const abrirCuentaPortalfirma = () => window.ApiDiag.open();
export const abrirCarga = (paso?: string) => window.Masiva?.open(paso);
// Flujos documentales (src/renderer/flujos.js): la muestra de un documento (dibuja el PDF) y la confirmación del envío
export const muestraFlujo = (pedido: object, n: number) => window.Flujos.muestra(pedido, n);
export const confirmarEnvioFlujo = (ids: string[], opciones: object) => window.Flujos.confirmarEnvio(ids, opciones);
export const abrirEnEditor = (ruta: string) => window.editor.openPaths([ruta], true);

// Carga masiva (src/renderer/masiva.js): editar los firmantes de un documento y confirmar el envío (saldo y pagador)
export const editarFirmantesMasiva = (doc: object) => window.Masiva!.editarFirmantes(doc);
export const confirmarEnvioMasivo = (ids: string[], opciones: object) => window.Masiva!.confirmarEnvio(ids, opciones);

// Plazos: las reglas de lectura del informe básico (src/renderer/plazos-reglas.js)
export const extraerPlazos = (texto: string) => window.PlazosReglas.extraer(texto);
// El Asistente legal con IA (components/functional/gestion/asistente-legal, window.Asistente): consentimiento, preguntas y redactar un documento
export const ia = {
  consentimiento: () => window.Asistente.ensureConsent(),
  sistema: () => window.Asistente.SYSTEM,
  preguntar: (o: object) => window.Asistente.ask(o),
  leerJson: (t: string) => window.Asistente.parseJson(t),
  // redacta y abre el documento en el editor; true si se abrió una pestaña nueva
  redactar: async (pedido: string) => { const antes = window.editor.tabCount(); await window.Asistente.draft(pedido, { models: false }); return window.editor.tabCount() > antes; },
};

// Formularios de src/renderer/agenda.js que también usan Publicaciones, el Agente y el Lienzo.
export const nuevoEvento = (despues: () => void) => window.Agenda.nuevo({}, despues);
export const ordenVisita = (e: IEvento, despues: () => void) => window.Agenda.ordenVisita(e, despues);

// Enviar a firmar (components/functional/gestion/enviar-a-firmar): lo que sigue en app.js y en otros módulos
export const mostrarVista = (vista: string) => window.show(vista); // show('drop' | 'working' | 'review' | 'done' | …)
export const irAlEditor = () => window.studio.goEditor();
export const saldoSesion = (): number | null | undefined => window.saldoSesion?.(); // el saldo de la sesión de Portalfirma
export const refrescarSaldo = () => window.refreshBalance?.();
// enviado desde un expediente: queda en su historial
export const registrarEnExpediente = (id: string, entrada: object) => { window.pf.expLog(id, entrada); };
export const pedirSesion = (fn: () => void, motivo: string) => window.members(fn, motivo);
// Editor PDF (components/functional/gestion/editor-pdf): enviar el documento a firmar, la pantalla «Enviado»
// (también la usa la Notaría virtual) y guardarlo en un expediente (src/renderer/expedientes.js)
export const enviarArchivoAFirmar = (archivo: object, firmantes: object[] | null) => window.__envio.analizar(archivo, firmantes);
export const mostrarEnviado = (r: object) => window.__envio.listo(r);
export const guardarEnExpediente = () => window.Expedientes.saveCurrent();
export const soporteWhatsApp = (texto: string) => window.studio.whatsapp(texto);

// Google Drive (components/functional/drive): qué se hace con lo elegido
export const abrirEnEditorVarios = (rutas: string[]) => { window.studio.goEditor(); window.editor.openEach(rutas); };
export const agregarAExpediente = (rutas: string[], mensaje: string) => window.Expedientes.addPaths(rutas, mensaje);
export async function agregarAPlazos(rutas: string[]) { const r = await window.pf.plazosAdd(rutas); window.Plazos.open(); setTimeout(() => window.Plazos.afterAdd?.(r), 300); }
export const importarPlantillaDrive = (archivo: object) => window.Plantillas.importFromDrive(archivo);
export async function cargaMasivaConArchivos(rutas: string[]) { await window.pf.bulkAdd(rutas); window.Masiva?.open('load'); }

// Firmas presenciales (components/functional/gestion/firmas-presenciales)
export const esUsuarioAdmin = () => window.Usuario?._u?.user?.role === 'admin';
// Inicio de sesión con correo y contraseña de Portalfirma (components/functional/cuenta, window.ApiDiag); al terminar sigue con `despues`
export const iniciarSesionPortalfirma = (despues: () => void, motivo: string) => window.ApiDiag.login(despues, motivo);

// Asistente legal (components/functional/asistente): «Redactar» abre el documento en el editor
export const pintarTokensEditor = () => window.Asistente._paintTokens?.(); // el saldo de tokens en el panel abierto
export const redactarBorrador = (pedido: string) => window.Asistente.draft(pedido, {});

// Ficha de la propiedad y detalle de la persona (components/functional/ficha y persona).
// Siguen en src/renderer/inmo.js los formularios que también usan otras pantallas (propiedad, persona y
// publicar en Portal Inmobiliario) y la lista de cada pestaña.
export const abrirCartera = () => window.Inmo.cartera();
export const abrirPersonas = () => window.Inmo.personas();
// IM.data del código antiguo (lo leen la agenda, los negocios, el Agente…) al día después de un cambio
export const refrescarCarteraLegado = () => (window.Inmo?.cargar ? window.Inmo.cargar().catch(() => {}) : Promise.resolve());
// al guardar, inmo.js vuelve a abrir la ficha o la persona (y React las recarga)
export const editarPropiedad = (p: object) => window.Inmo.formProp(p);
export const editarPersona = (c: object) => window.Inmo.formPersona(c);
export const crearPersona = (opt: { rol?: string; pre?: object; despues: (c: { id: string }) => void }) => window.Inmo.formPersona(null, opt);
export const publicarEnPortalInmobiliario = (p: object, op: string) => window.Inmo.publicarPI(p, op);
export const fichaCompleta = (propId: string, despues: () => void) => window.FichaBloques.abrir(propId, { despues });
export const fotosDesdeDrive = (propId: string) => window.Fotos.drive(propId);
// la captación de la propiedad (src/renderer/etapas.js) dibuja en su propio contenedor
export const bloqueCaptacion = (host: HTMLElement, propId: string, alCambiar: () => void) => window.Etapas.bloque(host, { propId, alCambiar, compacto: true });
export const nuevoNegocioDe = (pre: { tipo: string; propId: string; clienteId?: string }) => window.Negocios?.nuevo(pre);
// Agente y flujo guiado (src/renderer/gestion.js): estado de la propiedad, generar un documento y seguimiento de firmas
export const verPropiedadEnAgente = (propId: string, codigo: string) => window.members(async () => { await window.Agente.vista?.(); window.Gestion.estado(propId, { usuario: `¿Cómo va ${codigo}?` }); }, 'El Agente trabaja con tu cuenta de Portalfirma. Inicia sesión para usarlo.');
export const generarDocumentoPropiedad = (propId: string) => window.members(() => window.Gestion.documento(propId), 'Para generar documentos desde tus plantillas, inicia sesión con tu cuenta de Portalfirma.');
export const seguimientoFirmas = (propId: string) => window.Gestion.firmas(propId);
export const operacionEnAgente = (n: number) => window.Gestion.operaciones(n);

// Ayuda y Aprende (components/functional/ayuda y aprende)
// cambia de vista como las pestañas de inmo.js (ir): muestra la sección y marca la pestaña del menú
export const irAVista = (vista: string) => { if (typeof window.ir === 'function') window.ir(vista); else window.show(vista); };
// la configuración del proceso principal apaga los recorridos automáticos (PF_NO_TOURS, o en modo de prueba sin PF_TOURS)
let configAyuda: { noTours?: boolean } | null = null;
export const sinRecorridos = () => {
  if (!configAyuda) { try { configAyuda = (window.pf.cfg as unknown as () => { noTours?: boolean })() || {}; } catch { configAyuda = {}; } }
  return !!configAyuda.noTours;
};
// las pantallas que abre «Verlo en vivo» (y esperan a que se dibujen)
export const abrirCarteraCompleta = () => (window.Inmo.cartera as unknown as (f: object) => Promise<void>)({ especial: '', op: 'todas' });
export const abrirTableroNegocios = () => (window.Negocios as unknown as { abrir: () => Promise<void> }).abrir();
export const abrirGestionDocumental = () => (window.studio as unknown as { goHome: () => void }).goHome();

// Cuenta de Portalfirma (components/functional/cuenta): la sesión del conector sigue en app.js (state.session,
// requireLogin, toLoggedIn, toLoggedOut), porque la usan muchos módulos.
export const sesionPortalfirma = () => (window.sesionActual?.() ?? null) as import('../store/interfaces/cuenta.interface').ISesionPf | null;
export const sesionIniciada = (sesion: object | null) => window.toLoggedIn(sesion); // guarda la sesión y sigue con lo pedido
export const sesionCerrada = () => window.toLoggedOut();
export const pedirInicioSesion = (fn: () => void, motivo: string) => window.requireLogin(fn, motivo);
export const cancelarInicioSesion = () => window.cancelarInicioSesion?.(); // «Volver al editor»: olvida lo que se había pedido
export const irAGestionDocumental = () => window.studio?.goHome?.();
export const abrirExpedientes = () => window.Expedientes.open();
export const verCuentaDrive = () => window.Drive.cuenta();
export const soporteWhatsAppGeneral = () => (window.studio.whatsapp as (texto?: string) => void)(); // con el texto de siempre
export const versionApp = () => String((window.pf.cfg as unknown as () => { version?: string } | undefined)?.()?.version || '');
// La Ayuda (src/renderer/ayuda.js): el panel y el recorrido de la pantalla que se ve
export const abrirAyuda = () => window.Ayuda?.open?.({});
export function recorridoDePantalla() {
  const v = [...document.querySelectorAll('.view')].find((x) => !x.classList.contains('hidden'))?.id?.replace('view-', '') || 'home';
  window.Ayuda?.startTour(v);
}
// Apariencia (src/renderer/tema.js)
export const temaActual = () => window.Tema?.get() || 'system';
export const cambiarTema = (t: string) => window.Tema?.set(t);
