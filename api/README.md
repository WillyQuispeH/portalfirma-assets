# API de PortalFirma Asset

Servicio NestJS + PostgreSQL (Prisma) con el login propio de Asset y, de a poco, todos los datos de la app.
La app de escritorio solo conoce la URL de esta API; las credenciales viven aquí, en `.env` / `.env.production`.

## Configuración

| Archivo | Para qué | ¿En git? |
|---|---|---|
| `.env` | Desarrollo: base `asset_dev` por túnel SSH | No |
| `.env.production` | Producción: base `asset_prod`, la API corre en el servidor | No |

Al arrancar, la API valida las variables (`src/config/env.ts`) y, si falta alguna, se detiene y dice cuál.
`JWT_SECRETO` es distinto en cada entorno: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

## Base de datos

PostgreSQL está en el servidor Linode y no se expone a internet. Las tablas van en el esquema `app` (no `public`):
lo fija `?schema=app` en `DATABASE_URL`. En desarrollo se llega por un túnel SSH:

```bash
yarn tunel            # deja el PostgreSQL del servidor en localhost:15432 (dejarlo abierto en otra terminal)
yarn db:migrar <nombre>   # crea y aplica una migración en asset_dev (tras editar prisma/schema.prisma)
yarn db:estado        # migraciones aplicadas / pendientes
yarn db:sembrar       # primera corredora y su administrador (variables SEMBRAR_* del .env)
yarn db:estudio       # Prisma Studio para mirar los datos
```

El túnel usa la clave `~/.ssh/id_ed25519`, que debe estar autorizada en el servidor. Usa una sola clave a propósito:
si SSH prueba varias, el servidor corta la conexión y fail2ban puede bloquear la IP.
`yarn db:migrar` no usa `prisma migrate dev`: ese comando crea una base temporal y `asset_user` no tiene permiso para
crear bases (a propósito). En cambio compara la base con el esquema y guarda el SQL en `prisma/migrations/` (va a git).

Los puertos 5432 y 5433 de este equipo ya los usan PostgreSQL locales; por eso el túnel va en el 15432.

Producción (solo aplica migraciones ya creadas y probadas en desarrollo; nunca `migrate dev`):

```bash
yarn db:migrar:prod
yarn db:estado:prod
yarn db:sembrar:prod
```

## Correr la API

```bash
yarn dev              # desarrollo: abre el túnel (si no está abierto) y levanta la API con recarga
yarn start:dev        # solo la API con recarga (con el túnel ya abierto)
yarn dev:panel        # la API con recarga, esperando el túnel de otro panel (lo usa start-dev.ps1 en la raíz)
yarn build && yarn start:prod   # producción (en el servidor)
yarn test             # pruebas unitarias
```

## Rutas (prefijo `/v1`)

| Ruta | Sesión | Qué hace |
|---|---|---|
| `GET /salud` | No | La API está arriba y llega a la base |
| `POST /auth/ingresar` | No | `{ email, clave, dispositivo? }` → `{ tokenAcceso, tokenRenovar, usuario }`. Máx. 5 intentos por minuto por IP |
| `POST /auth/renovar` | No | `{ tokenRenovar }` → tokens nuevos. El token se rota; reutilizar uno viejo cierra la sesión |
| `POST /auth/salir` | Sí | Cierra la sesión actual |
| `GET /auth/yo` | Sí | Usuario y corredora de la sesión |
| `GET /usuarios` | Admin | Usuarios de su corredora |
| `POST /usuarios` | Admin | Crea un usuario en su corredora |
| `GET /usuarios/equipo` | Sí | El equipo de la corredora (nombre, rol, contacto): captadores, dueños de leads y negocios |
| `PATCH /usuarios/:id`, `PUT /usuarios/:id/clave` | Admin | Editar (nombre, rol, teléfono, activo, wechatia) y asignar clave nueva |
| `/propiedades`, `/personas` | Sí | La cartera (lista por cursor y `?desde=` para sincronizar, CRUD, vínculos, captador, importar). Ver `test/cartera-e2e.js` |
| `GET /actividad`, `GET /actividad/:entidadId` | Sí | Historial, por páginas o de una propiedad, persona, negocio o evento |
| `POST /actividad/notas` | Sí | Una nota escrita a mano en el historial |
| `POST /actividad` | Sí | Entradas automáticas que registra la app (una o hasta 100): `{ entidadTipo, entidadId, texto, ref2?, tipo? }` |

La sesión va en `Authorization: Bearer <tokenAcceso>`. El token de acceso dura `JWT_DURACION` (15 min). El de
renovación dura `REFRESH_DIAS` y la app de escritorio lo guarda cifrado con `safeStorage`.
