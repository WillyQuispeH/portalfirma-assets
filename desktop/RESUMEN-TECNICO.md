# PortalFirma Asset: resumen técnico

Versión 0.16.28 (+ cartera en la base) · 4 de noviembre de 2026

## 1. Qué es

**PortalFirma Asset** es una aplicación de escritorio para **Windows y Mac**, pensada para corredoras de propiedades. Reúne en un mismo lugar:

- **Cartera de propiedades:** ficha por bloques, captación, fotos y documentos.
- **Personas:** el CRM de la corredora.
- **Negocios:** venta y arriendo, con etapas.
- **Leads:** WhatsApp, Instagram y correo.
- **Agenda.**
- **Publicación en Portal Inmobiliario.**
- **Formatos propios de la corredora,** enviados a firma con Portalfirma.
- **Gestión documental:** el editor de PDF heredado de PortalFirma Studio.
- **Un Agente con IA,** que también atiende por WhatsApp.

Datos técnicos:

- **Base:** Electron 33 (Chromium + Node.js 20).
- **Lenguaje:** JavaScript puro, sin frameworks ni compilación previa.
  - El proceso principal está en `src/*.js`: unas 9.500 líneas en 46 módulos.
  - La interfaz está en `src/renderer/*.js`: unas 12.300 líneas.
  - Cada módulo de la interfaz es un archivo autocontenido (IIFE) que expone su API en `window.<Modulo>`.
- **Persistencia:** la cartera (propiedades, personas, vínculos e historial) y los usuarios están en la base de Asset, a través de la API (`api/`, ver la sección 5). Lo demás (negocios, agenda, leads, configuración, archivos) sigue local, en un JSON por dominio en la carpeta de datos del usuario (sección 6).

## 2. Puesta en marcha en Windows

Requisitos:

- Node.js 20 LTS o superior;
- Yarn 1 (`npm install -g yarn`);
- Git (opcional);
- Windows 10 u 11 de 64 bits.

El repositorio tiene dos carpetas: `desktop/` (esta app) y `api/` (la API de Asset: NestJS + PostgreSQL, con su README).

**Login.** La app se abre con el ingreso a PortalFirma Asset (email y clave de la base de Asset, vía `api/`). Portalfirma
ya no es el login: es una conexión aparte («Conectar Portalfirma»), que solo se pide para firmar y para las plantillas.
Por eso, para usar la app en desarrollo tiene que estar corriendo la API. Lo más simple, desde la raíz del repositorio:

```powershell
.\start-dev.ps1              # una pestaña de Windows Terminal con paneles: túnel BD, api y desktop
.\start-dev.ps1 -Detener     # cierra todo (api, app y túnel)
.\start-dev.ps1 -SinTunel    # si el túnel ya está abierto en otra parte
.\start-dev.ps1 -Simular     # muestra lo que haría, sin levantar nada
```

Cada panel espera al anterior: la api espera al túnel (`yarn dev:panel`) y la app espera a la api (`yarn dev:api`,
con `tools/esperar-api.js`), así el ingreso no parte con «No se pudo conectar». O a mano:

```powershell
# terminal 1 (api/): túnel SSH a la base y la API en http://localhost:3000/v1
cd api; yarn dev

# terminal 2 (desktop/)
cd desktop
yarn install
yarn start                                  # abre la app
yarn dev                                    # desarrollo: compila src/ui (Vite) y reinicia la app al guardar cambios en src/ (nodemon)

# modo de prueba: sin cuenta, sin cobros, con datos de ejemplo
$env:PF_MOCK="1"; $env:PF_MOCK_LOGGED="1"; yarn dev
```

En `cmd.exe` se usa `set PF_MOCK=1 && set PF_MOCK_LOGGED=1 && yarn dev`.

**Credenciales.** El código no trae credenciales. Se entregan aparte, en la carpeta «credenciales», y se copian en `build/` antes de compilar (ver la sección 8). Sin ellas, la app abre igual con estas diferencias:
- **Sin la clave de IA:** el Agente pide que el administrador ponga una en Agente › ··· › Clave de IA.
- **Sin Drive:** la conexión con Google Drive no está disponible.

## 3. Pruebas

Las pruebas son de punta a punta con Playwright, y corren sobre Electron en modo de prueba (`PF_MOCK=1`). También hay unas pocas pruebas unitarias (`*-unit.js`).

```powershell
node test\acceso-e2e.js         # usuarios de Asset, permisos, captador y datos del propietario
node test\cartera-api-e2e.js    # SIN PF_MOCK: la cartera contra la API real (necesita la API corriendo)
node test\formatos-e2e.js       # mandatos y orden de visita con formato propio
node test\leads-e2e.js          # leads (chat de WhatsApp exportado)
node test\canales-unit.js       # unitaria, sin interfaz
```

En Windows se ejecutan directo con node. En Linux sin pantalla, con `xvfb-run -a node test/...`.

Conjunto recomendado después de un cambio, y que pasa en la 0.16.28:

- **Cartera y fichas:** `propiedades-e2e`, `etapas-e2e`, `negocios-e2e`, `gestion-e2e`, `formatos-e2e`, `acceso-e2e`, `cartera-e2e`, `ficha-propiedad-e2e`.
- **Contra la API real:** `cartera-api-e2e` (ver la sección 5).
- **Leads y canales:** `leads-e2e`, `gestor-leads-e2e`, `observador-e2e`, `instagram-e2e`.
- **WhatsApp y postventa:** `clientes-wa-e2e`, `whatsapp-envio-e2e`, `whatsapp-agente-e2e`, `postventa-e2e`.
- **Unitarias:** `leads-fusion-unit`, `canales-unit`.

Hay pruebas antiguas que fallan desde antes de la 0.16:
- `portal-e2e`, `operaciones-e2e` y `ops-api-e2e` buscan una pantalla de inicio que ya no existe.
- `confirmar-e2e`, `reservas-e2e`, `vista-e2e`, `propiedad-e2e` y `publicaciones-e2e` fallan por otros cambios de la interfaz.

Varias pruebas usan `test/fixtures/`. Del conjunto recomendado, solo `propiedades-e2e` usa una: el PDF `contrato_prueba.pdf`, que va en el paquete. Otras más antiguas necesitan además `foto.png`, `lector.pdf`, `contrato.docx` y otros archivos que se agregan aparte.

## 4. Arquitectura

```
Proceso principal (src/*.js)  ──IPC (ipcMain.handle / preload)──  Interfaz (src/renderer/*.js)
        │
        ├─ Portalfirma: MCP (src/portalfirma.js) y API de partners (src/pfapi.js)
        ├─ wechatia (LeadConnector/HighLevel API v2): WhatsApp, Instagram, correo, calendarios (src/reservas.js)
        ├─ OpenAI: Agente, lectura de documentos y de conversaciones (src/ai.js)
        ├─ Mercado Libre / Portal Inmobiliario (src/portales/, src/publicaciones.js)
        └─ Google Drive (src/gdrive.js) y Google Maps (src/direcciones.js)
```

- **IPC:** cada función de la interfaz llama a `api('nombre', …)`, que pasa por `window.pf.nombre` (`src/preload.js`) y llega a `handle('canal:accion', fn)` en `src/main.js`. Todas las respuestas tienen la forma `{ ok, data | error }`.
- **Herramientas del Agente:** están en `src/asset-tools.js` y algunas más en `main.js`. Cada una declara su `modo`:
  - `leer`;
  - `escribir`;
  - `confirmar`: pide confirmación antes de actuar, por ejemplo cuando cobra o envía.
  
  La guía de cuándo usar cada herramienta está en `src/herramientas-guia.js`.
- **Personajes del equipo virtual** (`src/personas.js`): Diego (seguimiento), Juanita (documentos), Pedro (captación) y Fernanda (atención a clientes por WhatsApp, en `src/cliente-agente.js`).

### Interfaz en React (migración gradual)

Las pantallas nuevas se escriben en React + TypeScript + Zustand y las actuales se migran de a una. Conviven con los módulos de siempre. La estructura sigue la guía de arquitectura frontend del equipo, adaptada a Electron: no hay Next.js ni HTTP, Vite compila y las llamadas van por IPC.

**Flujo:** página → componente functional → hook → store Zustand → service → `utils/api.ts` → `window.pf` (IPC) → proceso principal.

```
src/ui/
├── index.tsx                 # Puente: window.ReactUI.montar / desmontar / disponibles
├── global.d.ts               # Lo que src/renderer deja en window (api, icon, Negocios)
├── app/
│   ├── paginas.ts            # Registro de páginas montables
│   └── {pestaña}/page.tsx    # Una carpeta por pestaña del menú; solo invoca su functional
├── components/
│   ├── functional/{pantalla}/  # Componentes del dominio (+ su lógica de cálculo)
│   ├── layout/               # Header, menú, pie (cuando se migren)
│   └── ui/                   # Genéricos, sin hooks ni store (Icono, Kpi, Segmentos, Buscador)
├── store/
│   ├── hooks/                # use{Entidad}.hook.ts: lo único que usan los componentes
│   ├── interfaces/           # {entidad}.interface.ts (copiadas del proceso principal)
│   ├── services/             # {entidad}.service.ts: llamadas puras, sin manejo de errores
│   └── zustand/              # {entidad}.store.ts: estado; llama al service y guarda resultado o error
├── styles/globals.css        # Tailwind v4 (prefijo tw:) y los colores de la app
└── utils/
    ├── api.ts                # Instancia única de acceso al proceso principal: api() (reutiliza la de app.js)
    │                         # y apiSilenciosa() para tareas en segundo plano (no abre el inicio de sesión)
    ├── app.ts                # Puente con src/renderer: toast, Agente, formularios que aún no están en React
    ├── config.ts             # Único archivo que lee process.env
    ├── modal.tsx             # abrirModal(<Formulario />) / cerrarModal(): formularios en ventana hechos en React
    └── formato.ts            # Montos UF/CLP/USD y fechas
```

**Reglas** (las de la guía):
- La página solo invoca un componente functional.
- Los componentes `ui` no usan hooks, stores ni services.
- Los componentes usan el hook, nunca el store directo.
- Los services no manejan errores; eso lo hace el store.
- Todas las llamadas pasan por `utils/api.ts`.
- Las interfaces se copian del proceso principal (`src/negocios.js`, `src/permisos.js`, `src/equipo.js`…), que es la fuente de verdad. Si cambia allá, se actualiza aquí.
- **Nombres:** interfaces con prefijo `I` y tipos con `T`. Acciones del store con la entidad primero (`negocioGetAll`). Se exportan `use{Entidad}` y `use{Entidad}Store`.

**Cómo se integra:**
- Vite compila `src/ui/index.tsx` a `src/renderer/react/react-ui.js` y `react-ui.css`, que `index.html` carga como un script más. Esa carpeta no va en git: la generan `yarn build:ui`, `yarn start`, `yarn dev` y los `yarn dist:*`.
- No hay servidor de desarrollo: la app se abre desde el disco (`file://`) y la CSP solo permite scripts locales. En `yarn dev`, Vite recompila al guardar y nodemon reinicia la app.
- `yarn typecheck` revisa los tipos (`tsc --noEmit`). Vite compila TypeScript, pero no revisa tipos.
- **Estilos con Tailwind v4** (`@tailwindcss/vite`, configurado en `src/ui/styles/globals.css`). Convive con `src/renderer/styles.css`, que se carga en la misma ventana:
  - **Prefijo `tw:`** en todas las clases (`tw:flex`, `tw:gap-3`, `tw:hover:bg-card`), para no chocar con clases que ya existen en la app, como `hidden`, `small` o `active`.
  - **Sin Preflight** (el reset de Tailwind), que rompería las pantallas antiguas.
  - **Sin cascade layers:** una clase `tw:` y una de `styles.css` compiten por especificidad, como dos reglas normales.
  - **Solo revisa `src/ui`** para generar las clases.
  - **Modo oscuro:** `tw:dark:…` se aplica con el tema oscuro de la app (`html[data-theme="dark"]`).
  - **Colores de la app** conectados a las variables de `styles.css`, así el tema oscuro funciona solo: `tw:bg-card`, `tw:text-muted`, `tw:border-line`, `tw:text-brand`, `tw:text-ok`, `tw:text-err`.
  - Mientras una pantalla se migra, se pueden seguir usando las clases antiguas (`im-box`, `ng-kpi`…). Cuando ninguna pantalla las usa, se borran de `styles.css`. No se escriben `.css` nuevos por pantalla.
- **Pruebas:** `test/react-ui-e2e.js` (el puente) y una por pantalla. Antes de correrlas: `yarn build:ui`. Las demás e2e también necesitan el bundle compilado.

**Kit de componentes (`src/ui/components/ui`)**

Al crear o migrar una pantalla se usan estos componentes, en vez de las clases de `styles.css`:

| Componente | Para qué | Variantes y opciones |
|---|---|---|
| `Boton` | Acciones | `variante`: principal (lavanda), secundario, exito, peligro, fantasma · `tamano`: sm, md, lg · `icono`, `iconoDerecha`, `cargando`, `bloque` |
| `Input` | Texto, número, fecha… | `etiqueta`, `ayuda`, `error`, `icono` (izquierda), `sufijo` (p. ej. «UF») · acepta todo lo de `<input>` |
| `Select` | Elegir de una lista | `opciones` `[valor, texto][]` o `<option>` como hijos, `vacia` (primera opción con valor `''`), `etiqueta`, `ayuda`, `error` |
| `Badge` | Estado o categoría | `tono` (ver abajo) · `variante`: suave o tactil · `punto`, `icono` |
| `Card` | Agrupar contenido | `titulo`, `subtitulo`, `accion`, `pie`, `tono` (tarjeta de color), `relleno={false}` (para tablas) |
| `Estadistica` (en `Card.tsx`) | Un número destacado | `etiqueta`, `valor`, `variacion` (%: sube en verde, baja en rojo) |
| `Switch` | Encender/apagar | `activo`, `alCambiar`, `etiqueta`, `descripcion`, `deshabilitado` (role="switch", funciona con teclado) |
| `Tabla` | Datos en filas | `columnas` (`clave`, `titulo`, `alinear`, `ancho`, `render`), `filas`, `claveFila`, `alTocarFila` (también con Enter), `vacio`, `compacta` |
| `Tabs` | Pestañas | `opciones` `[valor, texto, cuenta?, icono?][]`, `valor`, `alCambiar` · `variante`: segmentos o linea · flechas, Inicio y Fin |

- **Estilo táctil** (inspirado en la referencia de diseño): los botones y las tarjetas tienen un borde inferior más grueso, y los botones «se hunden» al presionarlos. Las esquinas son redondeadas.
- **Tonos pastel:** gris, lavanda, verde, amarillo, durazno, azul y rojo (`components/ui/tonos.ts`). Los colores están en `styles/globals.css` (`--ui-*`), con su versión clara y su versión oscura. En Tailwind se usan como `tw:bg-lav`, `tw:border-lav-edge`, `tw:text-lav-ink` (texto sobre el relleno), `tw:bg-lav-soft` y `tw:text-lav-softink` (badges). También están `tw:bg-sunken`, `tw:bg-field`, `tw:border-edge`, `tw:border-b-edge-b` y `tw:bg-hover`.
- **Ojo al combinar Tailwind con `styles.css`:** como no hay Preflight, `tw:border-solid` pone estilo en **los cuatro lados**, y el navegador les da 3 px de grosor. Para una sola línea basta con `tw:border-b` (o `-t`, `-l`, `-r`), que define estilo y grosor solo de ese lado. Los elementos `button`, `input`, `select`, `label`, `td`, `th` y `h1`–`h3` tienen estilos globales en `styles.css`, y los componentes del kit los neutralizan con sus propias clases.
- `Kpi`, `Segmentos` y `Buscador` son anteriores al kit y usan clases de `styles.css`. Se reemplazarán por `Estadistica`, `Tabs` e `Input` al rediseñar las pantallas.

**Pantallas en React:**

| Pantalla | Página | Cómo se abre | Prueba |
|---|---|---|---|
| Gestión documental › Inicio | `app/gestion/inicio/page.tsx` → `components/functional/gestion/inicio/InicioGestion.tsx` | `studio.goHome()` en `src/renderer/home.js` | `gestion-inicio-e2e` |
| Gestión documental › Expedientes | `app/gestion/expedientes/page.tsx` → `components/functional/gestion/expedientes/Expedientes.tsx` | `Expedientes.open(id)` en `src/renderer/expedientes.js` | `expedientes-e2e` |
| Gestión documental › Mis operaciones | `app/gestion/operaciones/page.tsx` → `components/functional/gestion/operaciones/Operaciones.tsx` (+ `VistaPrevia`) | `Operaciones.open()` en `src/renderer/operaciones.js` | `operaciones-e2e` (parte de operaciones) |
| Gestión documental › Carga masiva | `app/gestion/carga-masiva/page.tsx` → `components/functional/gestion/carga-masiva/CargaMasiva.tsx` | `Masiva.open(tab)` en `src/renderer/masiva.js` | `operaciones-e2e` (parte de carga masiva) |
| Gestión documental › Plazos y vencimientos | `app/gestion/plazos/page.tsx` → `components/functional/gestion/plazos/Plazos.tsx` | `Plazos.open()` en `src/renderer/plazos.js` | `plazos-e2e` |
| Gestión documental › Flujos documentales | `app/gestion/flujos/page.tsx` → `components/functional/gestion/flujos/{Flujos,Pasos}.tsx` | `Flujos.open()` en `src/renderer/flujos.js` (tarjeta `data-act="flows"`) | `flujos-e2e` (23 comprobaciones) |
| Gestión documental › Notaría virtual | `app/gestion/notaria-virtual/page.tsx` → `components/functional/gestion/notaria-virtual/NotariaVirtual.tsx` | `window.openTemplates()` (lo instala el bundle: `notaria-virtual/controlador.tsx`) | `notaria-e2e` (nueva, 16 comprobaciones) |
| Gestión documental › Editor PDF | `app/gestion/editor-pdf/page.tsx` → `components/functional/gestion/editor-pdf/EditorPdf.tsx` (+ `Barra`, `Lateral`, `Panel`, `Plantilla`, `Pestanas`, `BibliotecaPlantillas`, `Modales`, `ModalesPlantilla`, `controlador.tsx`, `plantillas.tsx`) | `window.editor.open()` (lo llaman `studio.goEditor()`, app.js y el menú); se monta una vez en `#edBody`. Las pestañas de documentos tienen raíz propia en `#docTabs` | `editor30-e2e` (17), `reader-e2e` (26), `size-e2e` (5), `fonts-e2e` (2), `pdftext-unit` (16), `plantillas-e2e`, `detectar-e2e`, `asistente-e2e` |
| Gestión documental › Asistente legal (panel del editor) | `components/functional/gestion/asistente-legal/PanelAsistente.tsx` (+ `Modales`, `controlador.tsx`), sin página: es el modo «Asistente» del panel derecho del editor | `window.Asistente.open()` (lo instala el bundle) | `asistente-e2e`, `modelo-e2e` (10), `tokens-e2e` (13) |
| Gestión documental › Enviar a firmar | `app/gestion/enviar-a-firmar/page.tsx` (prop `paso`) → `components/functional/gestion/enviar-a-firmar/EnviarAFirmar.tsx` (+ `Firmantes`, `ConfirmarEnvio`, `DetalleOperacion`, `controlador.ts`) | app.js monta las cuatro pantallas al cargar (`#view-drop`, `-working`, `-review`, `-done`); se abren con `show(…)` como siempre | `test/firmar-e2e.js` (nueva), `notaria-e2e` (pantalla «Enviado») |
| Gestión documental › Firmas presenciales | `app/gestion/firmas-presenciales/page.tsx` → `components/functional/gestion/firmas-presenciales/FirmasPresenciales.tsx` (+ `Inicio`, `Trabajo`, `Revision`, `Lateral`, `Visor`, `DetalleTramite`, `Modales`, `controlador.tsx`) | `Escrituras.open(tramite)` en `src/renderer/escrituras.js` (tarjeta `data-act="escr"`) | `test/firmar-e2e.js`; `escrituras-e2e` y `reglas-e2e` necesitan los documentos reales de `PF_ESCR_FX` |
| Google Drive (ventana) | `components/functional/drive/Drive.tsx` (+ `controlador.tsx`), sin página: se instala al cargar el bundle como `window.Drive` | `Drive.open({ purpose })`, `Drive.cuenta()`, `Drive.cambiarCuenta()` desde Enviar a firmar, Expedientes, Plantillas, Plazos, el dictado y la cuenta | `test/firmar-e2e.js`, `drive-e2e`, `drive2-e2e`, `dictado-e2e` |
| Gestión documental › Recientes | `app/gestion/recientes/page.tsx` → `components/functional/gestion/recientes/Recientes.tsx` | `Recientes.open()` en `src/renderer/home.js` | `gestion-inicio-e2e` |
| Agente (chat) | `components/functional/agente/Agente.tsx` (+ `Mensaje`, `Conversaciones`) y `controlador.tsx` | Se instala al cargar el bundle (`instalarAgente()` en `index.tsx`), no es una página | `agente-chat-e2e`, `chat-e2e`, `agente-asset-e2e`, `whatsapp-agente-e2e`, `gestion-e2e` |
| Inicio: La oficina | `app/oficina/page.tsx` → `components/functional/oficina/Oficina.tsx` | `abrir()` en `src/renderer/oficina.js` | `oficina-e2e` |
| Inicio: Hoy (vista lista) | `app/hoy/page.tsx` → `components/functional/hoy/Hoy.tsx` | `abrir()` en `src/renderer/etapas.js` | `etapas-e2e`, `oficina-e2e` |
| Postventa | `app/postventa/page.tsx` → `components/functional/postventa/Postventa.tsx` (+ `Reclamos`, `WhatsApp`, `Asistente`, `Pestanas`) | `abrir(tab)` en `src/renderer/postventa.js` | `postventa-e2e` |
| Publicaciones (pestañas) | `app/publicaciones/page.tsx` → `components/functional/publicaciones/Publicaciones.tsx` (+ `Avisos`, `Interesados`, `Portales`) | `abrir(tab, filtro)` en `src/renderer/publicaciones.js` | `publicaciones-e2e` |
| Publicaciones › Publicar (asistente) | `app/publicaciones/publicar/page.tsx` → `components/functional/publicaciones/publicar/PublicarAviso.tsx` (+ `PasoCalidad`, `PasoPortales`, `PasoPublicar`) | `publicar(propId, op, paso)` en `src/renderer/publicaciones.js` | `publicaciones-e2e`, `ficha-propiedad-e2e` |
| Arriendos | `app/arriendos/page.tsx` → `components/functional/arriendos/Arriendos.tsx` | `abrirArriendos()` en `src/renderer/app.js` | `propiedades-e2e` |
| Negocios (tablero) | `app/negocios/page.tsx` → `components/functional/negocios/Negocios.tsx` (+ `NegocioCard`) | `abrirNegocios(opts)` en `src/renderer/negocios.js` | `test/negocios-tablero-e2e.js`, `negocios-e2e` (arrastre) |
| Negocios › detalle | `app/negocios/ficha/page.tsx` → `components/functional/negocios/FichaNegocio.tsx` | `abrirNegocio(id)` en `src/renderer/negocios.js` | `negocios-e2e`, `etapas-e2e`, `finanzas-e2e`, `actividad-e2e` |
| Leads (bandeja) | `app/leads/page.tsx` → `components/functional/leads/Leads.tsx` (+ `LeadItem`) | `abrir(id)` en `src/renderer/leads.js` | `leads-e2e`, `gestor-leads-e2e`, `instagram-e2e`, `observador-e2e` |
| Cartera (lista) | `app/cartera/page.tsx` → `components/functional/cartera/Cartera.tsx` (+ `PropiedadCard`, `BarraCaptador`) | `cartera(filtros)` en `src/renderer/inmo.js` | `test/cartera-e2e.js`, `acceso-e2e`, `propiedades-e2e` |
| Personas (lista) | `app/personas/page.tsx` → `components/functional/personas/Personas.tsx` | `personas()` en `src/renderer/inmo.js` | `test/cartera-e2e.js` |
| Cartera › ficha de la propiedad | `app/cartera/ficha/page.tsx` (`FichaPropiedad`, props `id`, `vez`) → `components/functional/ficha/FichaPropiedad.tsx` (+ `Resumen`, `Propietario`, `Paneles`, `Modales`, `comun`, `controlador.ts`) | `Inmo.abrirFicha(id)` en `src/renderer/inmo.js` (en `#view-cartera`) | `test/ficha-propiedad-e2e.js` (nueva, 27 comprobaciones), `propiedades-e2e`, `acceso-e2e`, `etapas-e2e`, `portal-e2e`, `negocios-e2e` |
| Personas › detalle de la persona | `app/personas/ficha/page.tsx` (`FichaPersona`, props `id`, `vez`) → `components/functional/persona/FichaPersona.tsx` | `Inmo.abrirPersona(id)` en `src/renderer/inmo.js` (en `#view-personas`) | `test/ficha-propiedad-e2e.js`, `propiedades-e2e`, `docgen-e2e` |
| Actividad (desde Inicio) | `app/actividad/page.tsx` → `components/functional/actividad/Actividad.tsx` (+ `ActividadItem.tsx`) | `window.Actividad.abrir()` en `src/renderer/actividad.js` | `test/actividad-e2e.js` |
| Agenda | `app/agenda/page.tsx` → `components/functional/agenda/Agenda.tsx` (+ `EventoCard.tsx`) | `abrirAgenda()` en `src/renderer/agenda.js` | `test/agenda-e2e.js` |
| Finanzas | `app/finanzas/page.tsx` → `components/functional/finanzas/Finanzas.tsx` | `abrirFinanzas()` en `app.js`: muestra `#view-finanzas` y vuelve a montar la página, así los datos siempre están al día | `test/finanzas-e2e.js` |
| Ayuda (botón «?», panel, recorridos guiados) | `components/functional/ayuda/Ayuda.tsx` (+ `PanelAyuda`, `Recorrido`, `guias.ts`, `acciones.ts`, `controlador.tsx`), sin página: se instala al cargar el bundle como `window.Ayuda` | `Ayuda.onView(vista)` desde `show()` de `app.js`; `Ayuda.open({ level })`, `startTour`, `endTour`, `close` desde el inicio documental, la cuenta y las pruebas | `ayuda-e2e`, `aprende-e2e`, `gestion-inicio-e2e`, `usuario-e2e` |
| Aprende a usarla | `app/aprende/page.tsx` → `components/functional/aprende/Aprende.tsx` (+ `lecciones.ts`, `controlador.tsx`) | `window.Aprende.abrir()` / `leccion(id)` (lo instala el bundle; monta la página en `#view-aprende` la primera vez) desde el inicio, la agenda y el panel de ayuda | `aprende-e2e` |
| Cuenta: botón y menú del usuario (arriba a la derecha) | `components/functional/cuenta/MenuUsuario.tsx` (+ `controlador.tsx`), sin página: el bundle lo monta con raíz propia en `#account` e instala `window.Usuario` | `Usuario.refresh()` desde `setAccount()` de `app.js`; el menú se abre con `#userBtn` | `test/cuenta-e2e.js` (nueva, 19 comprobaciones), `usuario-e2e` |
| Cuenta: «Conecta tu cuenta de Portalfirma» | `app/inicio-sesion/page.tsx` → `components/functional/cuenta/InicioSesion.tsx` | `app.js` la monta en `#view-login` al cargar; `requireLogin()` / `members()` la muestran con `show('login')` | `test/cuenta-e2e.js`, `clientes-e2e` |
| Cuenta: bienvenida y conexión directa (correo y contraseña, diagnóstico) | `components/functional/cuenta/Ventanas.tsx` (en el modal) | `welcome()` de `app.js` → `__cuenta.bienvenida()`; `ApiDiag.open()` / `ApiDiag.login(despues, motivo)` | `test/cuenta-e2e.js`, `apidiag-e2e`, `usuario-e2e`, `ops-api-e2e` |
| Usuarios de la corredora (ventana) | `components/functional/usuarios/Usuarios.tsx` (+ `controlador.tsx`), sin página: instala `window.Usuarios` | `Usuarios.abrir()` desde el menú de la cuenta (`data-um="usuarios"`), Leads (`#ldCorBtn`), la pestaña Propietario de la ficha y «Avisar al corredor» | `acceso-e2e`, `gestor-leads-e2e` |
| Agente por WhatsApp (ventana) | `components/functional/whatsapp/AgenteWhatsApp.tsx` (+ `controlador.tsx`), sin página: instala `window.WhatsAppAgente` | `WhatsAppAgente.abrir()` desde el menú del usuario y la pestaña Agente; `refrescar()` desde el controlador del Agente | `test/cuenta-e2e.js`, `whatsapp-agente-e2e` |
| Firmas presenciales › Reglas de detección (interno) | `components/functional/gestion/firmas-presenciales/Reglas.tsx` | Elemento «Reglas de detección» de la lista (`data-sel="reglas"`, solo administrador o modo de prueba) | `test/cuenta-e2e.js` (vacío); `reglas-e2e` necesita `PF_ESCR_FX` |

Gestión documental: cada parte es un componente independiente, con su página en `app/gestion/{parte}`, dentro de `components/functional/gestion/`. Las partes son `inicio`, `recientes`, `expedientes`, `operaciones`, `carga-masiva`, `plazos`, `flujos`, `notaria-virtual`, `firmas-presenciales`, `enviar-a-firmar`, `asistente-legal` y `editor-pdf`. Las piezas comunes van en `gestion/comun` (tipo de archivo, tamaño, fecha, ícono). Migradas hasta ahora: **inicio**, **recientes**, **expedientes**, **operaciones**, **carga-masiva**, **plazos**, **flujos**, **notaria-virtual**, **enviar-a-firmar**, **firmas-presenciales**, **editor-pdf** y **asistente-legal** (todas). En cada una, el código antiguo se quedó con los formularios en ventana y con lo que comparte con otras partes:
- **Expedientes:** nuevo expediente, más opciones, traer desde Drive y las acciones sobre los archivos marcados.
- **Operaciones:** el teléfono de la cuenta, el código de acceso a los documentos y el error del archivo.
- **Carga masiva:** editar firmantes y la confirmación del envío.

Esos módulos le avisan a React con eventos: `pf:expedientes`, `pf:operaciones`, `pf:bulk` y `pf:plazos`. Plazos está entero en React, incluido su motor de lectura (`plazo.store.ts`). Sus cálculos están en `utils/plazos.ts`, y el texto del PDF se lee con `utils/pdf.ts`. Las reglas (`PlazosReglas`) y la IA (`Asistente`) se usan por el puente `utils/app.ts`. Flujos (`flujo.store.ts`, reglas en `utils/flujos.ts`) tiene en React el inicio con recetas y ejecuciones, el asistente de 5 pasos y el seguimiento de la ejecución. En `flujos.js` quedan la «Muestra» (dibuja el PDF con pdf.js en el modal), la confirmación del envío (saldo y correo del pagador) y el archivo soltado en la ventana, que llega a React con el evento `pf:flujos-nomina`. Notaría virtual (`notaria.store.ts`, reglas en `utils/notaria.ts`, RUT y teléfono en `utils/rut.ts`) tiene en React el catálogo y el formulario con su validación. La confirmación del envío (saldo de la sesión y la pantalla «Enviado») también está en React (`notaria-virtual/controlador.tsx`, que instala `window.openTemplates` y `window.Notaria`); `templates.js` se borró. `notarial.js` (motor de escrituras) no es de esta pantalla: va con Firmas presenciales. `tpl-e2e` sigue rota porque usa pestañas que ya no existen; la reemplaza `notaria-e2e`. Las pruebas que leen el estado interno (`Operaciones._ops`, `Masiva._bk`, `Plazos._p`, `Flujos._fl`) lo siguen viendo: los módulos antiguos lo leen del store de React.

**Formularios en ventana en React** (`utils/modal.tsx`): `abrirModal(<Componente />)` dibuja dentro del mismo `#modal`/`#modalCard` de la app, así se ven igual y las pruebas los encuentran en el mismo lugar (`#mOk`, `#modalCard`…). `modal(html)` y `closeModal()` de `app.js` llaman a `ReactUI.liberarModal()` antes de escribir o al cerrar: el contenedor nunca tiene dos dueños. Los usan Enviar a firmar (confirmar), Drive (todas sus ventanas) y Firmas presenciales (notaría, pago, editar, agregar acto, leer con IA, descartar).

Enviar a firmar (`envio.store.ts`, reglas en `utils/envio.ts`): las cuatro pantallas comparten el estado y cada una se monta en su sección, porque muchos módulos siguen abriendo una con `show('drop')`, `show('review')`… `startAnalysis(archivo, firmantes?)` y `showDone(r)` siguen existiendo en `app.js` (los usan el editor, Drive, Expedientes, Negocios, la Notaría virtual y las pruebas) y llaman a `window.__envio`. Los firmantes de una plantilla llenada en el editor ahora llegan como segundo argumento de `startAnalysis` (antes, `state.prefillSigners`). El arrastre de archivos sobre la ventana sigue en `app.js`; el borde resaltado de la zona de soltar ahora sale de `body.dragging`. Se borró `#view-ops` antiguo de `index.html` (Mis operaciones ya estaba en React) y su código en `app.js` (`renderDetail`, `loadHistory`, `openOp`): el detalle de la operación recién enviada está en `DetalleOperacion.tsx`. `drive.js` se borró: Drive está entero en React (`drive.store.ts`).

Firmas presenciales (`escritura.store.ts`, reglas en `utils/escrituras.ts`, PDF en `utils/escrituras-pdf.ts`): está todo en React, incluidos el armado de la escritura y de la carátula con pdf-lib, la lectura con IA de PDF y fotos y los formularios. Sigue fuera, porque no es de la pantalla, el motor notarial (`notarial.js` y `materias.js`, que también corren en Node para las pruebas). El panel de reglas de detección ya está en React (`Reglas.tsx`, ver «La cuenta…» más abajo). `escrituras.js` quedó con la API de siempre: `Escrituras.open`, `dropFiles`, `_escrituraPdf`, `_caratulaPdf` y `_s`, que ahora es el estado del store con los mismos nombres de campos. Los estilos de Firmas presenciales, Google Drive y los firmantes de Enviar a firmar ya están en `tw:` (se borraron las reglas `es-*`, `drv-*` y `signer*` de `styles.css`); las clases compartidas de Firmas presenciales están en `firmas-presenciales/estilos.ts`. Quedan en `globals.css`, como CSS, la raíz `.es` (variables `--es-line`, `--es-soft`, `--es-r` y el estilo de títulos, botones y campos dentro de la pantalla) y `#modalCard:has(.drv)` (ancho de la ventana de Drive). Las clases `es-layout`, `es-list`, `es-item`/`on`, `es-card`, `es-dh`, `es-work`, `es-wr`, `es-track`, `es-tk`/`on`, `es-seg2`, `es-alerts`, `es-hid`, `es-sw`, `es-line`, `es-ficha`, `es-file-b`, `es-page`, `drv`, `drv-item`, `drv-nm`, `drv-scope`, `drv-crumbs` y `signer` quedan solo como marcadores para las pruebas.

Asistente legal (`asistente.store.ts`, ventanas en `components/functional/asistente/Ventanas.tsx`): está en React lo que no depende del editor: el aviso antes de usar IA (`ensureConsent`), los tokens (comprar por WhatsApp o activar un código) y «Redactar con el asistente». El estado del proveedor y la billetera de tokens viven solo en el store; `asistente.js` los lee y actualiza por `window.__asistente`, y su `window.Asistente` de siempre (`ensureConsent`, `tokensDialog`, `draftDialog`, `status`, `wallet`) llama a React. El panel de revisión ya está en React, con el editor (ver «Editor PDF» más abajo); `asistente.js` se borró. Prueba: `tokens-e2e` (se corrigió el número de soporte y el registro de enlaces en modo de prueba, `global.__abiertos`), `modelo-e2e`. `aidoc-e2e` ya fallaba: lee un `test/out-g0.pdf` que la prueba no genera.

Ayuda y Aprende (`ayuda.store.ts`, `aprende.store.ts`, buscador en `utils/ayuda.ts`): están enteros en React y se borraron `ayuda.js` y `aprende.js`. `window.Ayuda` y `window.Aprende` los instala el bundle con la misma API (`onView`, `open`, `close`, `startTour`, `endTour`, `search`, `GUIDES`, `TOURS`; `abrir`, `leccion`, `LECCIONES`), así `app.js`, `inmo.js`, `negocios.js`, `agenda.js`, `usuario.js` y las pruebas no cambiaron. El botón y el panel se dibujan en `#ayudaRaiz` (dentro de `body`) al terminar de cargar la página, porque `icons.js` se carga después de `react-ui.js`. Las guías de cada lección y sus recorridos se suman a los de la Ayuda en `ayuda/guias.ts` (antes `aprende.js` los agregaba a `window.Ayuda`); van primero y en orden inverso, como antes, porque el orden desempata el buscador. Los selectores de los recorridos (`#imQ`, `#ngNew`, `#agNew`, `.ng-steps`…) apuntan a otras pantallas: no se deben cambiar allá. Se mantienen los id y clases de siempre (`#helpFab`, `#helpPanel.open`, `#hpQ`, `#hpRes`, `#hpAprende`, `.tour-tip`, `[data-tour]`, `.ap-card`, `#apVivo`…) y lo guardado en el equipo (`pf.tour.<pantalla>`, `pf.aprende.<id>`). Los estilos siguen en `styles.css` (`help-*`, `hp-*`, `hg`, `tour*`, `ap-*`).

La cuenta, el Agente por WhatsApp y las reglas de detección (`cuenta.store.ts`, `whatsapp.store.ts`, `regla.store.ts`): están en React y se borraron `usuario.js`, `apidiag.js`, `whatsapp.js` y `reglas-panel.js`. El bundle instala `window.Usuario` (`refresh`, `close`, `_u`), `window.ApiDiag` (`open`, `login`) y `window.WhatsAppAgente` (`abrir`, `refrescar`) con la misma API. `Usuario._u` lee del store, y `_u.user = …` (lo hacen las pruebas) fija el usuario. **La sesión sigue en `app.js`**: `state.session`, `setAccount`, `toLoggedIn`, `toLoggedOut`, `requireLogin`, `members`, `isMember` y `api()`. La usan muchos módulos, y moverla era riesgoso sin ganar nada. `app.js` solo delega la interfaz: `requireLogin` fija el motivo con `__cuenta.motivo()`, `toLoggedOut(msg)` el aviso con `__cuenta.aviso()`, y `welcome()` llama a `__cuenta.bienvenida()`. React lee la sesión con `window.sesionActual()` y «Volver al editor» la olvida con `window.cancelarInicioSesion()`. De `#account` se quitaron `#balance` y `#logoutBtn`: el menú del usuario los ocultaba siempre. `refreshBalance()` sigue y actualiza `state.session.balance`. `body.guest` lo fija `setAccount()` solo con la sesión del conector, y React lo corrige con la conexión directa después de cada refresco. Reglas de detección se dibuja dentro de `#esBody` y, al cambiar una regla, recarga el motor con `escrituraRecargarReglas`; ya no existe `window.ReglasPanel`. Pruebas: `apidiag`, `usuario` y `ops-api` necesitan `PF_FILE_ID=957902342` (sin `build/portalfirma/api.json` falla el inicio con correo). En `usuario-e2e` se corrigió el texto esperado de la versión («PortalFirma Asset», antes «Studio»).

**Bug encontrado, sin corregir** (fuera de la migración): en la carga masiva, Portalfirma propone a veces un rol genérico para un firmante («cliente»). La app lo da por bueno, pero el envío lo rechaza («Alias no puede ser un placeholder»). Por eso falla el envío en `operaciones-e2e`. El arreglo sería que `src/bulk.js` trate `cliente`, `firmante`, `parte` y `persona` como un rol faltante.

Editor PDF y Asistente legal (`editor.store.ts`, motor en `utils/editor-pdf/`, reglas del asistente en `utils/asistente-legal.ts`): se borraron `editor.js`, `plantillas.js`, `pdftext.js`, `asistente.js` y `templates.js`, y sus `<script>` de `index.html`. No queda ningún puente en `src/renderer`: el bundle instala `window.editor`, `window.Plantillas` y `window.Asistente` con la API de siempre (la usan `app.js`, `home.js`, el menú nativo, Expedientes, Flujos, el Agente, el dictado, Firmas presenciales y las pruebas).
- **Estado:** cada pestaña es un documento (`IDocumento`, en `editor.interface.ts`) con los objetos de pdf.js, los bytes y las ediciones. Es un objeto **mutable**, como antes: el store guarda las pestañas y la activa (`doc`), y el motor avisa con `tocar()` (sube `v`) para que React vuelva a leerlo. Así `window.editor._state` sigue siendo el documento activo y las pruebas pueden leerlo y cambiarlo (`_state.selected = new Set(…)`). El aviso de «trabajando» (`ocupado`) y «Mis plantillas» (`plantillas`) también están en el store. Los cambios que el motor necesita ver en pantalla de inmediato (el escenario recién dibujado, el aviso de «trabajando») usan `flushSync` (`ahora()` / `tocarAhora()` en `useEditor.hook.ts`); nunca se llaman mientras React dibuja.
- **Motor (`utils/editor-pdf/`), sin React:** `motor.ts` dibuja las páginas en `#edStage` (desplazamiento continuo, capa de texto, enlaces, resaltado de la búsqueda), maneja la capa de objetos (arrastres, cambio de tamaño, selección de área, edición en el lugar con `contenteditable`), los atajos de teclado y el formato del texto. React deja `#edStage` vacío y le avisa cuando aparece (`ref={montarEscenario}`): ahí no puede haber dos dueños, y el `contenteditable` perdería el cursor si React lo volviera a dibujar. `bloques.ts` detecta párrafos (texto digital) y hace el OCR; `hornear.ts` pasa los objetos al PDF; `compresion.ts` recomprime imágenes; `fuentes.ts` reconoce e incrusta fuentes; `pdftext.ts` es el borrado real de texto; `plantillas.ts`, las reglas de los campos. Las bibliotecas que carga `index.html` después del bundle (pdf.js, pdf-lib, fontkit, Tesseract, `fonts.js`, `icons.js`) se leen de `window` al usarlas (`comun.ts`). El *worker* de pdf.js, que antes configuraba `editor.js` al cargar, se configura al terminar de cargar la página (lo usan también Flujos, Plazos, Operaciones y Firmas presenciales).
- **React:** barra, miniaturas y marcadores, barra de página y búsqueda, avisos, el panel derecho (Formato, modelos de texto, objetos, OCR; diseño y formulario de la plantilla; Asistente) y todas las ventanas (`Modales.tsx`, `ModalesPlantilla.tsx`, `asistente-legal/Modales.tsx`). Se mantienen los id y clases (`#edBody`, `#edStage`, `#edLayer`, `#edCanvas`, `#edBusy`, `#pfSize`, `#tplConv`, `.ed-*`, `.tpl-*`, `.ai-*`, `.tk-*`…). Los íconos van con `Ic` (sin caja propia: `display: contents`) para que valgan los estilos de `styles.css`. Los botones del panel no le quitan el foco al texto (`onMouseDown` → `preventDefault`) y el tamaño escrito a mano no se pisa mientras se escribe.
- **Pruebas:** `pdftext-unit` ahora transpila `utils/editor-pdf/pdftext.ts` con `typescript` (y pone `pdf-lib` en `globalThis.PDFLib`). `size-e2e` leía la función global `currentFmt()` de `editor.js`: ahora usa `window.editor._currentFmt()`. Se generaron los archivos que faltaban en `test/fixtures` (`lector.pdf` con `make-reader-fixture.js` y `add-outline.js`, `foto.png`, `fotocopia.pdf` y `fuentes.pdf`): con ellos pasan `reader-e2e`, `editor30-e2e`, `size-e2e` y `fonts-e2e`, igual que con el código anterior. `plantillas-e2e`, `detectar-e2e` y `asistente-e2e` siguen fallando en el mismo punto que antes porque `contrato_prueba.pdf` es otro (una sola línea) y porque `pdftotext` en Windows escribe en Latin-1 (falta `-enc UTF-8`); con un contrato de varias líneas y `-enc UTF-8` pasan enteras (plantillas: diseño, guardar, llenar, generar y «Mis plantillas»; detectar con IA; revisar, aplicar, preguntar y redactar). `editor-e2e`, `e2e`, `tpl-e2e` y `word-send-e2e` siguen rotas desde antes (buscan `#loginBtn` o pestañas que ya no existen).

**Archivos de ejemplo agregados:** `test/fixtures/contrato.docx` (un Word mínimo con un contrato) y `test/1-login.png`. Faltaban, y varias pruebas los usan. Las acciones del inicio siguen en `homeAction()` de `home.js` (`studio.accion`), igual que el menú nativo. La biblioteca de plantillas (`#tplLibHost`) es `BibliotecaPlantillas.tsx` (del editor), dentro del inicio. Cuando la lista de recientes cambia, `home.js` lo avisa a React con el evento `pf:recientes`.

**Pruebas de Gestión documental:** las de esta sección esperaban `.hub-card` al arrancar, porque se escribieron cuando la app abría en Gestión documental. Ahora abren primero Gestión documental (`studio.goHome()`). Corridas sobre el código original y sobre el actual, fallan en el mismo punto. Siguen rotas por razones que no tienen que ver con la migración: `studio`, `escrituras`, `expedientes` (le falta un archivo en `test/fixtures`), `operaciones`, `ops-api`, `plazos`, `plazos-pf-fail`, `tpl`, `plantillas`, `reglas`, `drive` y `aidoc`. Pasan `ayuda`, `flujos` y `filekey`. Con `yarn dev` abierto, compilar reinicia su Electron (nodemon), y eso puede cortar una prueba que esté corriendo: hay que volver a correrla. **Ojo:** no se pueden correr dos copias de la app al mismo tiempo, porque la app permite una sola instancia y la segunda se cierra al arrancar.

Agente: el chat está en React, con `agente.store.ts`. Su lógica (enviar, eventos del proceso principal, acciones, «Siguiente paso», conversaciones guardadas, adjuntos) y la API `window.Agente`, que usan las demás pantallas, están en `components/functional/agente/controlador.tsx`, que se instala al cargar el bundle. Detalles importantes:
- **Raíz propia:** el chat se monta una sola vez en `#agDrawer`. Ese contenedor se mueve entre el panel lateral (`body`) y la pestaña Agente (`#view-agente`), y React sigue funcionando porque no maneja el contenedor en sí.
- **Cambios inmediatos:** se aplican con `flushSync`, porque varias pantallas buscan `#agQ`, `#agBody` o la tarjeta recién puesta justo después de llamar a la API.
- **Tarjetas de los flujos guiados (`agente/tarjetas/`):** «Gestionar una propiedad» (elegir, estado, anotar), documentos (plantillas, formulario, revisar y enviar, resultado, firmas), agendar (en Asset o en el calendario de reservas), confirmar por WhatsApp y el documento a medida. `gestion.tsx` instala `window.Gestion`. Cada tarjeta es un `div.ga` con su propia raíz de React (`montar()` en `comun.tsx`), que se entrega a `Agente.tarjeta(node)`: así el chat la vuelve a poner con su estado (`NodoAjeno`) y `etapas.js` puede llevarla a su ventana. Por eso las tarjetas llaman siempre a `window.Agente` (nunca a funciones importadas del controlador): `etapas.js` reemplaza `tarjeta`, `decir`, `bajar` y `contexto` mientras su ventana está abierta. Al terminar, `useTarjeta().terminar()` la deja como línea (`ga hecha`) con `data-resumen`, que es lo que se guarda en la conversación.
- **Dictado (`agente/dictado/`):** `window.Dictado` (captura, ficha dictada, corregir dictando) y `window.Fotos` (fotos desde Drive). `Grabadora.tsx` tiene la grabación compartida (`useGrabadora`) por el botón de las tarjetas y el micrófono `#agMic` del cuadro del chat.
- **Lienzo (`agente/lienzo/`):** el contenido de `#agCanvas`. `controlador.ts` trae los datos (tu día, propiedad, negocio, agenda, operación) a `useLienzo` e instala `window.Lienzo { mostrar, refrescar, actual }`; `Lienzo.tsx` los dibuja con el kit.
- **La caja `#agQ` no es controlada:** otras pantallas le escriben directo y llaman a `q.oninput()`.
- **Formularios en ventana:** adjuntar, herramientas, actividad, renombrar, borrar y clave de IA están en `agente/modales.ts` (`window.AgenteModales`); las ventanas, en `VentanasAntiguas.tsx`. Con la cuenta de Asset, «Clave de IA» explica que la IA la pone Portalfirma desde el servidor.
- **Diseño: todo con los componentes de `components/ui`.** El chat (cabecera con `MenuMas`, mensajes, `Badge` de herramientas, confirmaciones en `Card` amarillo con `Input`, «Siguiente paso» con `Boton`), las conversaciones (`Boton`, `Buscador`, `EstadoVacio`), cada tarjeta (`Tarjeta` en `tarjetas/comun.tsx` = `Card` con cerrar y pie; campos `Input`/`Select`/`Textarea`, `Tabs`, `ItemLista`/`Miniatura`, `LineaTiempo`, `Avatar`) y el lienzo (`Card`, `ItemLista`, `Badge`, `LineaTiempo`). Para esto el kit sumó: `pendiente` (falta el dato: borde amarillo y clase `falta` en el contenedor) y `resaltado` (lo propuso Asset: fondo lila) en `Input`/`Select`/`Textarea`, `ref` en esos tres, e `id`/`contenido` en `MenuMas` (cuyo menú ahora va en `z-[90]`, sobre el panel del Agente).
- **Estilos antiguos:** se quitaron las reglas `ag-*`, `ga-*`, `lz-*` y `dc-*` de `styles.css`, salvo el posicionamiento del panel y la pantalla completa (`.ag`, `.ag-full`, `.ag-side`, `.ag-canvas`, `.lz-off`), `.ga` (sangría) y las clases que comparten otras pantallas (`ga-load`, `ga-ph`, `ga-inl`, `lz-det`; `lz-hist` quedó solo para Postventa, `.pv-hist .lz-hist`). Ojo: una regla antigua más específica que una utilidad `tw:` le gana; al migrar, hay que quitarla. Las clases y los `data-*` siguen en el marcado porque las usan las pruebas.
- **La app parte con el Agente a pantalla completa.** Al cambiar de pantalla pasa a panel y se cierra, salvo que se haya pedido acoplar.

Inicio: «La oficina» y «Hoy» comparten `#view-inicio` y están en React. La oficina anima a los personajes con `OfLienzo.montar()` (`oficina-lienzo.js`), que dibuja en el `<canvas>` y mueve los botones `.of-pj` con estilos en línea que React no maneja. Por eso se vuelve a llamar después de cada cambio. La preferencia (oficina o lista) sigue en `oficina.js`. Siguen en `etapas.js` la acción de cada paso (`Etapas.accion`), «Empezar algo nuevo» y la luz guía (`Etapas.luz`), que React engancha después de cada cambio. El Inicio clásico de `inmo.js` ya no se muestra (`inicio()` siempre elige La oficina u Hoy), pero también llama a `liberar()` por si acaso.

Postventa: están en React el encabezado, las cinco pestañas y la lista de reclamos. El detalle del reclamo con su «¿Qué sigue?» sigue en `postventa.js`, dentro de `#pvDet`, que React deja vacío. Funciona como Leads: React avisa qué reclamo mostrar (`Postventa.mostrar`) y `postventa.js` pide recargar con el evento `pf:postventa`. Igual que antes, el reclamo elegido se sigue mostrando aunque salga de la lista (por ejemplo, recién cerrado). **Regla:** el código antiguo que escribe en un contenedor después de un `await` debe revisar que el contenedor siga en la página (`isConnected`), porque mientras tanto React pudo cambiar de pestaña.

Publicaciones: las tres pestañas están en React (Avisos con rendimiento y recomendaciones, la bandeja de Interesados y Portales), con `publicacion.store.ts`. El asistente «Publicar» (calidad del aviso, portales, publicar) también está en React (`PublicarAviso`, con `publicar.store.ts` y `usePublicar`), ordenado como las fichas: cabecera, pasos y dos columnas. `publicar(propId, op, paso)` en `publicaciones.js` solo valida la propiedad y la monta en `#view-publicaciones` con `liberar()`; «Más portales» la abre en el paso 2. Siguen en `publicaciones.js` los formularios (ajustar precio, agregar interesado, contacto de los avisos, elegir propiedad), que React llama por `utils/app.ts`. Arriendos es la etapa 3, todavía en construcción: muestra lo que vendrá y lleva a «Plazos y vencimientos». Con ella desapareció el aviso genérico `pronto()` de `inmo.js` y su vista `#view-pronto`.

Negocios: el tablero está en React. Incluye las columnas por etapa con arrastrar y soltar, el resumen, la búsqueda, Abiertos y Cerrados, y la revisión de firmas en segundo plano. Usa el mismo `negocio.store.ts` que Finanzas. La ficha del negocio también está en React (`FichaNegocio`, ordenada como la ficha de la propiedad: cabecera, franja, etapas y dos columnas). `abrirNegocio(id)` en `negocios.js` lee el negocio, la monta en el mismo `#view-negocios` y le pasa sus acciones (API y ventanas); cada recarga sube `vez` para que los formularios vuelvan a lo guardado. Los pasos de `etapas.js` se dibujan en `#ngEt` desde un `useEffect`, como la captación de la ficha. «Nuevo negocio» sigue en `negocios.js`, que conserva `NG.datos`. El tablero sigue la misma regla `liberar()` que Cartera.

Leads: la bandeja está en React (encabezado, KPIs, filtros y lista). La conversación y la ficha del lead siguen en `leads.js`, dentro de `#ldChat` y `#ldFicha`. React deja esos dos contenedores vacíos y nunca dibuja dentro de ellos. El puente funciona en los dos sentidos:
- **React → `leads.js`:** `Leads.mostrar(sel, datos, filtro)` sincroniza `LD` y dibuja el detalle.
- **`leads.js` → React:** `lista()` dispara el evento `pf:leads`, con el elegido y el filtro si cambiaron (por ejemplo al importar), y React recarga la lista.

Cartera y Personas: las listas están en React y comparten `cartera.store.ts`, porque `inmoListar` trae propiedades y personas juntas. Ahí quedan también los filtros de cada lista y la selección de «Asignar captador». Siguen en `inmo.js` Portales y los formularios (nueva propiedad o persona, importar, dictar), y React los llama por `utils/app.ts`. La ficha, la persona y Portales se dibujan en el mismo contenedor que la lista. Por eso, antes de escribir HTML ahí, `inmo.js` llama a `liberar(host)`, que desmonta React. **Regla para las próximas migraciones:** si el código antiguo escribe `innerHTML` en un contenedor donde React monta algo, antes debe llamar a `ReactUI.desmontar()`. Tampoco hay que usar en React clases que el código antiguo modifica en el DOM. Por ejemplo, `.im-img`: `inmo.js` reemplaza esas fotos cuando no cargan, y por eso la tarjeta usa `onError` con estado propio.

Ficha de la propiedad y detalle de la persona: están en React (`ficha.store.ts`, `persona.store.ts`; la propiedad y las personas salen de `cartera.store.ts`). La ficha dibuja las seis pestañas y oculta con `.hidden` las que no están elegidas, como antes, porque las pruebas y Aprende buscan sus elementos aunque no se vean. La pestaña elegida queda en el store, por propiedad, y `Inmo.fichaTab(k)` la cambia por `window.__ficha` (`ficha/controlador.ts`). Pasaron a React «Vincular persona», «Finalizar aviso» y «Eliminar persona» (`ficha/Modales.tsx`, con los mismos id `#vRol`, `#vQ`, `#vList`, `#vNew`, `#mOk`). Siguen en `inmo.js`, porque también los usan otras pantallas o el Agente:
- `formProp` («Datos básicos»), `formPersona` (editar o crear, también «Agregar al CRM» un interesado y «Crear persona nueva» al vincular) y `equipo` (lo usa Leads).
- `publicarModal`, ahora también como `Inmo.publicarPI(p, op)`, la pantalla Portales y «Vincular avisos existentes».
- `dropFiles`, para los archivos soltados sobre la ficha (`app.js`).
- `IM`, `cargar()`, `ir()` y los helpers (`dirTxt`, `foto`, `fecha`…), que leen como globales `negocios.js` y `agenda.js` (las tarjetas del Agente las leen por `window.Inmo._IM` y `window.cargar`).

Cuando un formulario de `inmo.js` termina, llama a `abrirFicha`/`renderFicha`/`abrirPersona` como siempre: si la ficha ya está montada no se desmonta, solo sube la prop `vez` y React recarga (así no salta el scroll). Después de un cambio hecho en React, el store también llama a `Inmo.cargar()` para que `IM.data` siga al día. Dentro de la ficha, React deja vacío `#fCapt`, donde `Etapas.bloque` dibuja la captación, y lo vuelve a dibujar en el mismo nodo en cada recarga. `Etapas.bloque` ahora revisa `host.isConnected` después de su `await`: sin eso fallaba al salir de la ficha mientras cargaba. «Ficha completa» (`ficha-bloques.js`), «Publicar» (`publicaciones.js`), las fotos desde Drive (`window.Fotos`) y el Agente (`window.Gestion`) se llaman por `utils/app.ts`. Los estilos siguen siendo las clases `im-*` de `styles.css`.

Actividad muestra todo lo que pasó en la cartera, agrupado por día, con búsqueda (se lanza al dejar de escribir), filtros y «Ver más» (páginas de 60). La búsqueda y el filtro quedan en `actividad.store.ts`, que descarta respuestas que llegan fuera de orden. Tocar un movimiento abre la propiedad, persona, negocio o agenda.

Agenda muestra los eventos agrupados por día, con filtros de rango y tipo, que quedan guardados en `evento.store.ts`. Los eventos se marcan como hechos, se reprograman (formulario dentro del mismo evento) o se cancelan. «Nuevo evento» y «Generar orden de visita» siguen en `src/renderer/agenda.js`, porque también los usan Publicaciones, el Agente y el Lienzo. React los llama por `utils/app.ts`. Los id `agNew`, `agAsk`, `agRango` y `agTipo` los usa el recorrido de Aprende, y las clases `ag-ev` y `ag-ord`, las pruebas.

Finanzas muestra las comisiones de los negocios (`negListar`): las ganadas y perdidas del período, las que están en curso, el detalle por corredor (solo el administrador) y los negocios que aún no tienen comisión. El proceso principal ya filtra por perfil, así que el corredor ve solo sus negocios. La facturación (boletas y facturas) queda para la etapa 4. Bajo 1600 px de ancho, `styles.css` oculta las pestañas Arriendos y Finanzas.

**0.18.5 (2026-11-11):**
- La evaluación del arrendatario vive en el modal-13 del paso (ya no hay modal-125): elegir a quién pedirle los documentos (arrendatario y/o avales), registrar un aval con nombre, RUT y celular (queda en Personas como codeudor), ver lo adjuntado de cada uno con su resumen, el porcentaje global y decidir. `solicitar` del servidor acepta `titular: false` (solo avales).

**0.18.4 (2026-11-11):**
- Evaluación del arrendatario y de N avales por WhatsApp (paso «Evaluación del arrendatario» de un arriendo, `modal-125`): «Solicitar documentación» manda la plantilla `solicitar_documentacion_` (campos `asset_nombre`, `asset_remitente`, `asset_propiedad`); el servidor (`api/src/whatsapp/evaluacion.ts`) recibe los archivos, los lee con IA, arma un puntaje de 100 por persona (60 % arrendatario y 40 % avales) y avisa al corredor, que decide aprobar o rechazar. Se guarda en la colección `evaluaciones`.
- La etapa después de la carta oferta se llama «Postarriendo» en los arriendos (antes siempre «Postventa»).

**0.18.3 (2026-11-10):**
- Equipo por WhatsApp: «Subir fotos» en la ficha, lead sin RUT (`asset_crear_lead`), `asset_revisar_orden_visita`, propietario dictado, verificación del día de la semana y transcripción afinada.
- Leads: pasan de «Nuevo» a «Contactado» cuando el corredor toma la conversación o responde (`leads.js: contactado`); no retroceden. El servidor deja los leads nuevos a cargo del administrador y con su persona en el CRM.
- Cambios de diseño: ficha de negocio, publicar desde la app, Cartera, ficha de propiedad, Leads y KPI.

**0.18.2 (2026-11-10):**
- Con la IA del servidor de Asset ya no se cobra la billetera local de tokens (`ai.js`: `costOf`, `agentCheck`, `agentCharge`); al acabarse los 5 de bienvenida, el equipo por WhatsApp respondía «No te quedan tokens».
- Conectar Portalfirma desde Configuración › Integraciones vuelve a Integraciones al terminar (antes quedaba en «Conecta tu cuenta»).
- `yarn dev` guarda sus datos en «PortalFirma Asset (desarrollo)» (no comparte la sesión con el Asset instalado).

**0.18.1 (2026-11-10):**
- Sin sesión de Asset la app ya no lee ni envía WhatsApp por su cuenta (`WA_LOCAL` en `main.js`, solo con `PF_MOCK`): antes volvía al modo antiguo y respondía en paralelo con el servidor, sin clave de IA («Falta la clave de API del asistente»).
- Al conectar wechatia (`pv:claveWa`) se espera a que el servidor tenga la clave y se relee la conexión: la pantalla muestra «conectado» de inmediato.
- Servidor: el equipo del ejecutivo reconoce el nombre del personaje en cualquier parte del mensaje («mis documentos Juanita»). La API corre en Docker (`docker-compose.yml`, `api/Dockerfile`; desplegar con `bash api/scripts/desplegar.sh`).

**0.18.0 (2026-11-09):**
- Con el kit: Mis operaciones, el inicio de Gestión documental (con color por función, sin barra del Agente), la vista lista de Hoy (con «Vista oficina» para volver) y La oficina (escena a pantalla completa, equipo arriba). Leads aprovecha el alto de la ventana: los filtros de la lista llevan su número (sin tarjetas arriba).
- Cabeceras: como mucho 2 botones a la vista y el resto en «⋯» (CabeceraPagina lo hace solo con `Boton`). El título de la cabecera usa el color del tema (en oscuro era negro).
- **Configuración** (menú del usuario, `components/functional/configuracion`, en `#view-integraciones`): pestañas General (tema y luz de la oficina, que salieron del menú), WhatsApp (tu celular vinculado: verlo, cambiarlo con un código o desvincularlo; el administrador además enciende o apaga a Sofía, Tomás y la postventa) e Integraciones. `window.abrirConfiguracion(pestaña)`.
- Usuarios de la corredora: quién tiene su celular vinculado (`wa:equipo`) y «Pedir que vincule» (aviso `wa_pedir_vinculo`).
- Mis operaciones ya no pide el correo y la contraseña si la corredora tiene Portalfirma conectado: busca por el teléfono de la cuenta de Asset (`sync.js`).
- La barra de menú nativa (Archivo, Edición…) queda oculta en Windows (`autoHideMenuBar`; aparece con Alt).
- Servidor (`api/src/whatsapp`): interruptor de Sofía (`wa_ajustes.leads_activo`); un número que nadie conoce se vuelve lead y lo atiende Sofía; con su Asset cerrado, el equipo del ejecutivo (Pedro, Juanita, Diego, Fernanda) responde desde el servidor (`equipo.ts`), y lo que necesita el computador queda en la cola para cuando abra Asset.

**Migrar otra pantalla:**
1. Interfaces, service, store y hook de su entidad en `store/`.
2. Componente en `components/functional/{pantalla}/`.
3. `app/{pestaña}/page.tsx`, registrada en `app/paginas.ts`.
4. Una `<section class="view">` en `index.html`.
5. La ruta en el `onclick` de las pestañas de `app.js` (más la vista en las listas de `show()`).
6. Su prueba e2e.
7. Los estilos de la pantalla antigua se pasan a clases `tw:` y se borran de `styles.css`, salvo los que todavía usan otras pantallas. Antes de borrar, se revisa con `grep` en `src/renderer`.
8. Se mantienen los id y clases que usan otros módulos, el recorrido de Aprende y las pruebas.

### Módulos principales del proceso principal

| Módulo | Qué hace |
|---|---|
| `main.js` | Ventana, IPC, horarios, unión de todos los módulos y permisos (`SOLO_ADMIN`). |
| `inmo.js` | Cartera: propiedades, personas, vínculos e historial. Repositorio con copia en memoria, sincronizada con la API (o el JSON local en modo de prueba). |
| `ficha-campos.js` | Campos de la ficha por bloques: esencial, portales, propietario y legal. |
| `etapas.js` | Pasos de la captación y de los negocios («¿qué sigue?»). |
| `negocios.js` | Negocios de venta y arriendo, con etapas, tareas y firmas por etapa. |
| `formatos.js` y `formatos/the-living.js` | Formatos propios (mandatos y orden de visita): variables, HTML→PDF y envío a firma. |
| `firmas.js` | Número de operación, seguimiento automático, reenvío y corrección de firmantes. |
| `sync.js` | «Mis operaciones», sincronizado con Portalfirma. |
| `leads.js` | Leads: importar chats de WhatsApp o el historial de Instagram, lectura con IA, fusión de duplicados y persona automática. |
| `observador.js` | Leads «en vivo» desde wechatia (Instagram, Facebook, correo). Solo lee, no responde. |
| `cliente-agente.js` y `whatsapp-agente.js` | Fernanda (clientes) y el Agente por WhatsApp del ejecutivo. |
| `reservas.js` | Cliente de la API de wechatia: contactos, conversaciones, calendario y plantillas. |
| `asset.js` | Cuenta de Asset: ingreso, tokens y `llamar(metodo, ruta, cuerpo)` a la API (con renovación del token). En `PF_MOCK`, un simulado sin servidor (también de `/usuarios`). |
| `permisos.js` | Qué puede ver y hacer el usuario de la sesión (ADMIN o CORREDOR): `SOLO`, leads y negocios propios, datos del propietario reservados. |
| `equipo.js` | Los usuarios de la corredora (`/v1/usuarios`): la lista para captadores y leads, y su administración. |
| `ai.js` | Proveedor de IA (OpenAI), con la clave incluida o la que pone el administrador. |
| `hora.js` | Hora de Chile (America/Santiago) para todo lo que depende de la fecha. |
| `mock.js` | Simulación de Portalfirma para `PF_MOCK=1`. |

## 5. Cartera en la base, usuarios y permisos

### La cartera vive en la base de Asset

Propiedades, personas, sus vínculos y el historial (actividad) se guardan en PostgreSQL, a través de la API
(`/v1/propiedades`, `/v1/personas`, `/v1/actividad`; ver `api/README.md`). Ya no están en `datos.json`.

**Repositorio (`src/inmo.js`).** La interfaz del módulo es la misma de siempre, así los 13 módulos que lo leen no cambiaron:
- **Copia en memoria.** Al iniciar sesión de Asset (`asset:restaurar` / `asset:ingresar` en `main.js` → `inmo.iniciar(usuario)`)
  se cargan todas las propiedades (incluidas las archivadas) y personas de la corredora, por páginas de 500 con cursor.
  `todas()`, `obtener()`, `personaPorId()`, `listar()`… leen esa copia de forma sincrónica.
- **Sincronización por cambios.** `GET ?desde=<marca>` trae solo lo que cambió (también lo eliminado, con `eliminado: true`).
  La marca es el `servidorEn` de la respuesta, con 5 s de margen (repetir es inocuo). Se sincroniza al volver a la ventana
  (`focus`), cada minuto y después de importar o asignar captadores. Si alguien pasa a ser captador de una propiedad, se
  vuelve a pedir a su propietario (el servidor ahora se lo muestra).
- **Escrituras.** `guardarPropiedad`, `guardarPersona`, `borrarPersona`, `vincular`, `desvincular`, `archivarPropiedad`,
  `asignarCaptador`, `asignarVarios`, `nota`, `importarPF`, `personaDesdeLead`, `actividadDe`, `actividadTodas` y
  `resumen` son **async** (en los dos modos): esperan a la API y lanzan su error (`DUP_RUT`, `EN_USO`, 409 de versión…).
  Sus llamadores se ajustaron con `await` (`main.js`, `asset-tools.js`, `cliente-agente.js`, `docgen.js`, `documentos.js`,
  `firmas.js`, `formatos.js`, `whatsapp-agente.js`, `estado.js`, `negocios.js`). `negocios.obtener` y `agenda.obtener`
  también son async (traen el historial de la base); `negocios.ver(id)` y `agenda.ver(id)` son la vista sin historial.
- **`parchear(id, fn, texto)` y `registrar()` siguen sincrónicos:** aplican el cambio a la copia y lo encolan. La cola
  está serializada (una escritura a la vez, en orden) y manda la **diferencia** contra lo último que mandó el servidor,
  con su `version`. Sin conexión o con un 5xx reintenta (2 s, 4 s… hasta 1 min); un 409 (otra persona la cambió) o un
  rechazo recarga esa propiedad y avisa en pantalla. El historial se manda por tandas (`POST /v1/actividad`, hasta 100).
  Lo pendiente queda en `inmo/cola-api.json` (por usuario) y se retoma al volver a entrar.
- **Lo que llega del servidor se combina campo a campo** con lo local que aún no se envía (no lo pisa); la ficha, clave a
  clave. Al cerrar sesión se manda lo pendiente (hasta 4 s) y se vacía la copia.
- **Lo que la API aún no guarda** de una propiedad (las firmas enviadas `firmas`, los documentos y las fotos guardados
  en este computador) queda en `datos.json › extrasProp` por id de propiedad y se suma a la copia. Las fotos que no son
  `https` no van a la API.
- **Importar desde Portalfirma** (`importarPF`) lee igual que antes (`property_manage_tools`) y manda las propiedades a
  `POST /v1/propiedades/importar` (sistema `portalfirma`, `origenId` = id en Portalfirma, datos con `desdePF`, propietario
  con RUT válido), por tandas de 100, y sincroniza. Las inactivas en Portalfirma quedan archivadas (solo las nuevas).
- **La persona de cada lead** se crea o completa en la base en segundo plano (`personaDesdeLead`, de a una para no
  duplicar); `leads.js` la liga al lead cuando vuelve. Al entrar, `leads.sincronizarTodos()` pasa a la base las personas
  de los leads que aún no tienen una (en un equipo con leads antiguos, eso crea esas personas en la base la primera vez).

**Qué sigue local (otra fase):** negocios, eventos de la agenda, configuración, leads (`inmo/leads/`), la última
importación y los archivos. Si un negocio o evento apunta a un id del JSON antiguo, al cargar la copia se pasa al de la
base (`remapearLegado`: por `idLegado`, el origen de la importación, el código de la propiedad o el RUT de la persona;
queda en `datos.json › remapeo`). Lo que no se encuentra queda como «Sin propiedad». El historial antiguo de
`datos.json › actividad` no se migra; el de negocios y agenda ahora también va a la base (`entidadTipo` negocio/evento).

### Usuarios de Asset (reemplazan los perfiles por equipo)

Se borraron `acceso.js` («este equipo lo usa…», clave de administrador local) y `corredores.js` (lista local de
corredores). Quién usa la app es el usuario de la sesión de Asset (`asset.yo()`: id, rol `ADMIN` o `CORREDOR`, corredora):
- **`permisos.js`:** `SOLO_ADMIN` de `main.js` (por canal IPC: conexiones, Fernanda, saldo, borrar o archivar, reasignar,
  importar, formatos y **usuarios**) usa el rol del usuario. Leads y negocios: el corredor ve los suyos (`corredorId` =
  **id de su usuario**). Los datos del propietario solo los ve el captador y el administrador: con la API ya los oculta el
  servidor; `permisos.js` lo aplica también sobre la copia (modo de prueba, Agente). `accEstado` devuelve el perfil
  (`rol`, `usuarioId`, `corredorId`, `nombre`, `esAdmin`, `corredores` = usuarios activos).
- **`equipo.js`:** el equipo es `GET /v1/usuarios/equipo` (lo leen todos; copia en memoria para el captador, el dueño de
  un lead o de un negocio y el aviso por WhatsApp). El captador de una propiedad es un usuario (`PUT /propiedades/:id/captador`).
  Vincular con wechatia se guarda en el usuario (`PATCH /v1/usuarios/:id { wechatiaId, wechatiaNombre }`, solo ADMIN);
  «Traer usuarios de wechatia» vincula solos a los que tienen el mismo correo.
- **Pantalla «Usuarios de la corredora»** (React, `components/functional/usuarios/Usuarios.tsx` + `controlador.tsx`,
  store `usuario.store.ts`): se abre desde el menú de la cuenta (`data-um="usuarios"`), Leads › Usuarios (`#ldCorBtn`) y la
  ficha (pestaña Propietario). El administrador lista, agrega (con clave inicial), edita nombre, rol, teléfono y si está
  activo, asigna una clave nueva y elige el usuario de wechatia. El corredor ve el equipo, sin editar. Canales IPC:
  `usrEquipo`, `usrListar`, `usrCrear`, `usrEditar`, `usrClave`, `usrWechatia`. Se quitaron `accUsar`, `accPin`,
  `corListar`, `corGuardar`, `corBorrar`, `corUsuarios`, `Inmo.equipo` y `Leads.gestorCorredores`.

### Modo de prueba

Con `PF_MOCK=1` la cartera usa el JSON local de siempre (`PF_INMO_DIR`), con la misma interfaz async. El usuario
simulado (`src/asset.js`) es `ADMIN`; con `PF_MOCK_ROL=corredor` es `CORREDOR`. El simulado también responde las rutas de
`/usuarios`: los usuarios que crea el administrador entran con su correo y clave (`assetIngresar`), así una prueba cambia
de usuario sin servidor (ver `test/acceso-e2e.js`).

### Prueba contra la API real

`node test/cartera-api-e2e.js` abre la app **sin** `PF_MOCK` contra `http://localhost:3000/v1` (`PF_ASSET_API`), entra
con `SEMBRAR_ADMIN_*` de `api/.env` (no los imprime) y revisa: la cartera de la base, editar una propiedad desde
«Datos básicos», un cambio encolado (interesado de un portal, con su persona y vínculo), la sincronización al volver a
la ventana, crear y vincular una persona, el historial e importar desde Portalfirma (simulado en el proceso principal).
Al final borra de verdad lo que creó y devuelve la propiedad editada a como estaba (con `@prisma/client` de `api/`).

## 6. Datos locales

| Ruta (Windows) | Contenido |
|---|---|
| `%APPDATA%\PortalFirma Asset\portalfirma.json` | Configuración. Las claves van cifradas con `safeStorage` (DPAPI en Windows, Keychain en Mac; `store.js`). |
| `%APPDATA%\PortalFirma Asset\inmo\` | `datos.json` (negocios, eventos, configuración, `extrasProp`, `remapeo`; en modo de prueba también propiedades, personas y actividad), `cola-api.json` (escrituras pendientes hacia la API), `leads\` (índice, mensajes y medios), fotos y documentos de las propiedades. |
| `%APPDATA%\PortalFirma Asset\operaciones\` | PDF descargados de «Mis operaciones». |

Para pruebas, la carpeta de la cartera se cambia con `PF_INMO_DIR`, y la de los datos de Electron con `--user-data-dir`.

## 7. Variables de entorno útiles

| Variable | Uso |
|---|---|
| `PF_MOCK=1`, `PF_MOCK_LOGGED=1` | Modo de prueba: Portalfirma, wechatia, IA y Mercado Libre simulados, con Portalfirma conectado. La cuenta de Asset entra sola (sin API). |
| `PF_MOCK_ASSET_LOGIN=1` | Con `PF_MOCK`: muestra el ingreso a Asset (cualquier email, clave `demo1234`). Lo usa test/acceso-asset-e2e.js. |
| `PF_MOCK_ROL=corredor` | Con `PF_MOCK`: el usuario simulado de Asset entra como CORREDOR (por defecto ADMIN). |
| `PF_ASSET_API` | URL de la API de Asset (por defecto `http://localhost:3000/v1` sin empaquetar). La de producción va en src/asset.js. |
| `PF_INMO_DIR` | Carpeta de la cartera (pruebas). |
| `PF_TZ` | Zona horaria, por defecto `America/Santiago`. |
| `PF_AI_MANAGED=none` | Ignora la clave de IA incluida. |
| `PF_API_BASE`, `PF_API_CONFIG` | API de partners de Portalfirma (otra URL o configuración). |

## 8. Compilación

electron-builder; los scripts están en `package.json`.

```powershell
yarn dist:win            # instalador NSIS x64 en dist\  (en Windows no necesita nada más)
yarn dist:mac            # zip x64 + arm64 (en Windows no se puede; usar un Mac o Linux)
```

Antes de compilar hay que copiar las credenciales en `build/`, con la carpeta «credenciales» que va aparte:
- `build/ia/clave.bin`: clave de IA ofuscada. Se genera con `node tools/ia/incluir-clave.js <archivo-con-la-clave> openai [modelo]`.
- `build/google/oauth.json`: cliente OAuth de Google Drive.
- `build/portalfirma/api.json`: clave `id` de la API de partners.

Las entregas hechas hasta ahora se armaron en Linux con `tools/release/release.sh`:
- **Windows:** instalador NSIS con wine, partido en piezas con un `.bat` que las une y verifica el SHA-256.
- **Mac:** `.pkg` único para Apple Silicon e Intel, armado con xar y bomutils, con firma *ad-hoc* (`rcodesign`) y partido en piezas.

Las piezas existen solo porque el canal de entrega estaba limitado a unos 20 MB por archivo. Para distribuir a clientes conviene:
- firmar con un certificado de Apple Developer y uno de firma de código de Windows;
- publicar en una tienda o un servidor de actualizaciones (electron-updater).

## 9. Pendientes conocidos

- **Clave de IA:** la clave incluida en esta entrega (termina en «ZukA») fue rechazada por OpenAI el 3-nov. Hay que generar una nueva (sección 8) o ponerla en la app (Agente › ··· › Clave de IA).
- **Siguiente fase de la base:** negocios, agenda, leads y archivos (fotos y documentos) siguen locales; las firmas enviadas de cada propiedad (`firmas`) también.
- **Módulo de documentos:** subir formatos desde la app (aprobado, por construir).
- **Otras funciones aprobadas:** revisión del contrato antes de firmar, Finanzas (facturación a 120 y 30 días, comisiones), exportar operaciones a Excel y firma con pasaporte.
- **Pruebas antiguas:** hay e2e que fallan porque buscan pantallas antiguas (sección 3).
