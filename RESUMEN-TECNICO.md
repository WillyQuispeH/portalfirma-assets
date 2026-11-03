# PortalFirma Asset: resumen técnico

Versión 0.16.28 · 3 de noviembre de 2026

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
- **Persistencia:** local, por computador. Hay un JSON por dominio en la carpeta de datos del usuario (ver la sección 6). No hay servidor propio.

## 2. Puesta en marcha en Windows

Requisitos:

- Node.js 20 LTS (incluye npm);
- Git (opcional);
- Windows 10 u 11 de 64 bits.

```powershell
# en la carpeta del código
npm install
npm start                                   # abre la app (cuenta real de Portalfirma)

# modo de prueba: sin cuenta, sin cobros, con datos de ejemplo
$env:PF_MOCK="1"; $env:PF_MOCK_LOGGED="1"; npm start
```

En `cmd.exe` se usa `set PF_MOCK=1 && set PF_MOCK_LOGGED=1 && npm start`.

**Credenciales.** El código no trae credenciales. Se entregan aparte, en la carpeta «credenciales», y se copian en `build/` antes de compilar (ver la sección 8). Sin ellas, la app abre igual con estas diferencias:
- **Sin la clave de IA:** el Agente pide que el administrador ponga una en Agente › ··· › Clave de IA.
- **Sin Drive:** la conexión con Google Drive no está disponible.

## 3. Pruebas

Las pruebas son de punta a punta con Playwright, y corren sobre Electron en modo de prueba (`PF_MOCK=1`). También hay unas pocas pruebas unitarias (`*-unit.js`).

```powershell
node test\acceso-e2e.js         # perfiles, captador y datos del propietario
node test\formatos-e2e.js       # mandatos y orden de visita con formato propio
node test\leads-e2e.js          # leads (chat de WhatsApp exportado)
node test\canales-unit.js       # unitaria, sin interfaz
```

En Windows se ejecutan directo con node. En Linux sin pantalla, con `xvfb-run -a node test/...`.

Conjunto recomendado después de un cambio, y que pasa en la 0.16.28:

- **Cartera y fichas:** `propiedades-e2e`, `etapas-e2e`, `negocios-e2e`, `gestion-e2e`, `formatos-e2e`, `acceso-e2e`.
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

### Módulos principales del proceso principal

| Módulo | Qué hace |
|---|---|
| `main.js` | Ventana, IPC, horarios, unión de todos los módulos y permisos (`SOLO_ADMIN`). |
| `inmo.js` | Cartera: propiedades, personas, vínculos e historial. |
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
| `acceso.js` y `corredores.js` | Perfiles (administrador o corredor), captador y datos del propietario reservados. |
| `ai.js` | Proveedor de IA (OpenAI), con la clave incluida o la que pone el administrador. |
| `hora.js` | Hora de Chile (America/Santiago) para todo lo que depende de la fecha. |
| `mock.js` | Simulación de Portalfirma para `PF_MOCK=1`. |

## 5. Perfiles y permisos (0.16.26 a 0.16.28)

- **Quién usa el equipo:** se elige por computador, como administrador o como un corredor de la lista, con una clave de administrador opcional. No hay cuentas por usuario mientras Portalfirma no ofrezca ese servicio.
- **Solo el administrador:**
  - formatos de documentos y corredores;
  - conexiones y claves;
  - configurar a Fernanda;
  - saldo;
  - eliminar o archivar;
  - reasignar;
  - importar.
  
  Se controla en `main.js` (`SOLO_ADMIN`, por canal IPC) y en las herramientas del Agente.
- **El corredor:** ve toda la cartera, pero solo sus leads y negocios. Los datos del propietario los ve solo en sus captaciones (`acceso.js`: `listar`, `limpiar`, `redactarProp`).
- **Límite:** es una restricción en la app, no un servidor. Los datos siguen guardados en el computador.

## 6. Datos locales

| Ruta (Windows) | Contenido |
|---|---|
| `%APPDATA%\PortalFirma Asset\portalfirma.json` | Configuración. Las claves van cifradas con `safeStorage` (DPAPI en Windows, Keychain en Mac; `store.js`). |
| `%APPDATA%\PortalFirma Asset\inmo\` | `datos.json` (propiedades, personas, negocios, eventos, actividad), `leads\` (índice, mensajes y medios), fotos y documentos de las propiedades. |
| `%APPDATA%\PortalFirma Asset\operaciones\` | PDF descargados de «Mis operaciones». |

Para pruebas, la carpeta de la cartera se cambia con `PF_INMO_DIR`, y la de los datos de Electron con `--user-data-dir`.

## 7. Variables de entorno útiles

| Variable | Uso |
|---|---|
| `PF_MOCK=1`, `PF_MOCK_LOGGED=1` | Modo de prueba: Portalfirma, wechatia, IA y Mercado Libre simulados, con la sesión iniciada. |
| `PF_INMO_DIR` | Carpeta de la cartera (pruebas). |
| `PF_TZ` | Zona horaria, por defecto `America/Santiago`. |
| `PF_AI_MANAGED=none` | Ignora la clave de IA incluida. |
| `PF_API_BASE`, `PF_API_CONFIG` | API de partners de Portalfirma (otra URL o configuración). |

## 8. Compilación

electron-builder; los scripts están en `package.json`.

```powershell
npm run dist:win        # instalador NSIS x64 en dist\  (en Windows no necesita nada más)
npm run dist:mac        # zip x64 + arm64 (en Windows no se puede; usar un Mac o Linux)
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
- **Cuentas multiusuario reales:** dependen de un servicio de Portalfirma. La protección de verdad de los datos del propietario llega con eso.
- **Módulo de documentos:** subir formatos desde la app (aprobado, por construir).
- **Otras funciones aprobadas:** revisión del contrato antes de firmar, Finanzas (facturación a 120 y 30 días, comisiones), exportar operaciones a Excel y firma con pasaporte.
- **Pruebas antiguas:** hay e2e que fallan porque buscan pantallas antiguas (sección 3).
