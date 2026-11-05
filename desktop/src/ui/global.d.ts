// Lo que la interfaz actual (src/renderer, scripts sueltos) deja en window y React usa.
// Desde los componentes se usa a través de utils/app.ts y utils/api.ts, no directo.
export {};

interface IRespuestaPf { ok: boolean; data?: unknown; error?: string }

declare global {
  interface Window {
    api: (fn: string, ...args: unknown[]) => Promise<unknown>; // src/renderer/app.js
    pf: Record<string, (...args: unknown[]) => Promise<IRespuestaPf>>; // src/preload.js
    toast: (mensaje: string, ms?: number) => void; // src/renderer/app.js
    members: (fn: () => void, motivo: string) => void; // src/renderer/app.js
    icon: (nombre: string, tam?: number, cls?: string) => string; // src/renderer/icons.js
    Negocios?: { abrirNegocio: (id: string) => void; nuevo: (pre: object) => void }; // src/renderer/negocios.js
    isMember?: () => boolean; // src/renderer/app.js
    Agente: { open: () => void | Promise<void>; enviar?: (texto: string) => void; vista?: () => void; close?: () => void }; // la instala components/functional/agente/controlador.tsx
    Inmo: { // src/renderer/inmo.js
      inicio: () => void; abrirFicha: (id: string) => void; abrirPersona: (id: string) => void;
      formProp: (p?: object) => void; formPersona: (c?: object | null, opt?: { rol?: string; pre?: object; despues?: (c: { id: string }) => void }) => void;
      importar: () => void; portales: () => void; cartera: () => void; personas: () => void;
      publicarPI: (p: object, op: string) => void; cargar: () => Promise<void>;
    };
    Dictado: { abrir: () => void }; // src/renderer/dictado.js
    AgenteModales: { adjuntar: () => void; herramientas: () => void; actividad: () => void; claveIA: () => void; renombrar: (c: object) => void; borrar: (c: object) => void }; // src/renderer/agente.js
    WhatsAppAgente?: { abrir: () => void; refrescar: () => void }; // la instala components/functional/whatsapp/controlador.tsx
    Usuarios?: { abrir: () => void }; // la instala components/functional/usuarios/controlador.tsx
    Gestion: { estado: (propId: string, o?: object) => void; documento: (propId: string) => void; firmas: (propId: string) => void; operaciones: (n: number) => void }; // src/renderer/gestion.js
    Plazos: { open: () => void; afterAdd?: (r: unknown) => void }; // src/renderer/plazos.js
    Flujos: { open: () => void; muestra: (pedido: object, n: number) => void; confirmarEnvio: (ids: string[], opciones: object) => void }; // src/renderer/flujos.js
    studio: { accion: (k: string) => void; abrirReciente: (ruta: string) => void; goEditor: () => void; goHome?: () => void; whatsapp: (texto: string) => void }; // src/renderer/home.js
    Recientes: { open: () => void }; // src/renderer/home.js
    Expedientes: { open: () => void; saveCurrent: () => void; addPaths: (rutas: string[], mensaje: string) => void; createDialog: () => void; mas: (e: object) => void; desdeDrive: (e: object) => void; accion: (que: string, archivos: object[], e: object) => void; elegido: (id: string | null) => void }; // src/renderer/expedientes.js
    Operaciones: { open: () => Promise<void>; select: (n: number) => void }; // src/renderer/operaciones.js
    OperacionesModales: { telefono: (cambiar?: boolean) => void; acceso: (despues?: () => void) => void; errorArchivo: (r: object) => void; iniciarSesion: () => void }; // src/renderer/operaciones.js
    ApiDiag: { open: () => Promise<void>; login: (despues?: () => void, motivo?: string) => void }; // la instala components/functional/cuenta/controlador.tsx
    Masiva?: { open: (paso?: string) => void; editarFirmantes: (doc: object) => void; confirmarEnvio: (ids: string[], opciones: object) => void }; // src/renderer/masiva.js
    show: (vista: string) => void; // src/renderer/app.js
    editor: { openDialog: (nueva: boolean) => void; openPaths: (rutas: string[], nueva: boolean) => void; openEach: (rutas: string[]) => void; tabCount: () => number }; // la instala components/functional/gestion/editor-pdf/controlador.tsx
    PlazosReglas: { extraer: (texto: string) => import('./store/interfaces/plazo.interface').IContratoPlazo[] }; // src/renderer/plazos-reglas.js
    Asistente: { ensureConsent: () => Promise<boolean>; SYSTEM: string; ask: (o: object) => Promise<string>; parseJson: (t: string) => unknown; draft: (q: string, o: object) => Promise<void>; _paintTokens?: () => void }; // la instala components/functional/gestion/asistente-legal/controlador.tsx
    // Asistente legal: estado de la IA, billetera y ventanas (lo instala components/functional/asistente/controlador.tsx)
    __asistente: { consentimiento: () => Promise<boolean>; tokens: (motivo?: string) => Promise<void>; redactar: (inicial?: string) => void; estado: (refrescar?: boolean) => Promise<object>; billetera: (refrescar?: boolean) => Promise<object>; estadoActual: () => object | null; billeteraActual: () => object | null; fijarEstado: (e: object) => void; fijarBilletera: (b: object) => void };
    Drive: { open: (o?: { purpose?: any }) => Promise<void>; cambiarCuenta: () => Promise<object | undefined>; cuenta: () => Promise<void> }; // eslint-disable-line @typescript-eslint/no-explicit-any -- components/functional/drive/controlador.tsx
    Postventa: { // src/renderer/postventa.js
      mostrar: (id: string | null) => void; verChat: (chat: object) => void; nuevo: () => void;
      formContratista: () => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- devuelve el contratista creado o null
    };
    Actividad: { abrir: () => void }; // src/renderer/actividad.js
    Oficina?: { abrir: () => void; pref: { get: () => string; set: (v: string) => void } }; // src/renderer/oficina.js
    Ayuda?: { onView: (vista: string) => void; open: (o?: { level?: string | null }) => void; close: () => void; startTour: (pantalla: string) => void; endTour: () => void; search: (q: string) => object[]; GUIDES: object[]; TOURS: Record<string, string[][]> }; // la instala components/functional/ayuda/controlador.tsx
    Etapas: { accion: (paso: object, alTerminar?: () => void) => void; luz: (raiz: HTMLElement) => void; bloque: (host: HTMLElement, o: { propId?: string; negocioId?: string; alCambiar?: () => void; compacto?: boolean }) => void }; // src/renderer/etapas.js
    Hoy: { abrir: () => void; nuevo: () => void }; // src/renderer/etapas.js
    Publicaciones: { // src/renderer/publicaciones.js
      elegir: () => void; publicar: (propId: string, op?: string, paso?: number) => void;
      ajustarPrecio: (propId: string, op: string) => void; agregarInteresado: () => void;
      contacto: (c: object) => void; agendarVisita: (interesado: object, despues: () => void) => void;
    };
    OF_GEO?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- src/renderer/oficina-geo.js
    OfLienzo?: { montar: (escena: HTMLElement, o: { luz: string; sel: string | null }) => void }; // src/renderer/oficina-lienzo.js
    Leads: { // src/renderer/leads.js
      abrir: (id?: string) => void;
      mostrar: (sel: string | null, datos: object, filtro: string) => void;
      cuentas: () => void; comoExportar: () => void; comoInstagram: () => void;
      importarRuta: (ruta: string, canal?: string) => void;
    };
    // Enviar a firmar, Google Drive y Firmas presenciales (los instala el bundle: components/functional/*/controlador)
    __envio: { analizar: (archivo: object, prellenar?: object[] | null) => Promise<void>; listo: (r: object) => void; hayAnalisis: () => boolean };
    __escrituras: { abrir: (tramite?: any) => Promise<void>; soltar: (rutas: string[]) => Promise<void>; estado: () => object; escrituraPdf: (blocks: any[]) => Promise<object>; caratulaPdf: (d: any, adj?: any[]) => Promise<Uint8Array> }; // eslint-disable-line @typescript-eslint/no-explicit-any -- motor notarial
    __expCtx?: { id: string; file: string } | null; // src/renderer/expedientes.js: el envío a firmar queda en el historial del expediente
    Escrituras: { open: (tramite?: string) => Promise<void> }; // src/renderer/escrituras.js
    saldoSesion?: () => number | null | undefined; // src/renderer/app.js
    refreshBalance?: () => void; // src/renderer/app.js
    Usuario?: { refresh: () => Promise<void>; close: () => void; _u: { user: import('./store/interfaces/cuenta.interface').IUsuarioPf | null; readonly amount: number | null; readonly tokens: number | null; readonly drive: string | null } }; // la instala components/functional/cuenta/controlador.tsx
    Plantillas: { importFromDrive: (archivo: object) => void }; // la instala components/functional/gestion/editor-pdf/plantillas.tsx
    modal: (html: string) => void; // src/renderer/app.js
    closeModal: () => void; // src/renderer/app.js
    Agenda: { // src/renderer/agenda.js
      abrir: () => void;
      nuevo: (pre: object, despues?: () => void) => void;
      ordenVisita: (e: object, despues?: () => void) => void;
    };
  }
}

// Vite reemplaza process.env.NODE_ENV al compilar (vite.config.mjs). Solo lo lee utils/config.ts.
declare global {
  const process: { env: { NODE_ENV?: string } };
}

// Ficha de la propiedad y detalle de la persona (components/functional/ficha y persona)
declare global {
  interface Window {
    FichaBloques: { abrir: (propId: string, o?: { bloque?: string; despues?: () => void }) => void }; // src/renderer/ficha-bloques.js
    Fotos: { drive: (propId: string) => Promise<unknown> }; // src/renderer/dictado.js
    __ficha: { tab: (propId: string, tab: string) => void }; // lo instala components/functional/ficha/controlador.ts
  }
}

// Ayuda (botón «?») y Aprende: los instalan components/functional/ayuda y aprende (controlador.tsx)
declare global {
  interface Window {
    ir?: (vista: string) => number; // src/renderer/inmo.js: muestra la vista y marca la pestaña del menú
    Aprende: { abrir: () => void; leccion: (id: string) => void; LECCIONES: import('./store/interfaces/aprende.interface').ILeccion[] };
  }
}

// Cuenta de Portalfirma (components/functional/cuenta): la sesión del conector sigue en src/renderer/app.js
declare global {
  interface Window {
    sesionActual?: () => object | null; // state.session de app.js
    toLoggedIn: (sesion: object | null) => void; // app.js: guarda la sesión y sigue con lo pedido
    toLoggedOut: (mensaje?: string) => void; // app.js
    requireLogin: (fn: () => void, motivo?: string, pestana?: string) => void; // app.js
    cancelarInicioSesion?: () => void; // app.js: olvida lo pedido («Volver al editor»)
    Tema?: { get: () => string; set: (t: string) => Promise<void> }; // src/renderer/tema.js
    // lo que app.js le pide a la pantalla «Conecta tu cuenta de Portalfirma» (#view-login)
    __cuenta: { motivo: (t?: string) => void; aviso: (t?: string) => void };
    // Nueva / Editar persona en React (components/functional/personas/controlador.tsx); lo usa Inmo.formPersona
    __formPersona: (c?: object | null, opt?: { rol?: string; pre?: object; despues?: (c: { id: string }) => void }) => void;
    // la cuenta de Asset (components/functional/acceso/controlador.tsx)
    __acceso: {
      esperar: () => Promise<void>;
      usuario: () => import('./store/interfaces/acceso.interface').IUsuarioAsset | null;
      salir: () => Promise<void>;
      vencido: (aviso?: string) => void;
    };
  }
}
