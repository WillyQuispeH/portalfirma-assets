# Publicaciones en portales: qué hace Asset y qué falta de Portalfirma

Revisado el 13 de octubre de 2026 en la documentación de cada portal.

## Cómo publica Asset en cada portal

| Portal | Vía | Estado en Asset | Qué falta |
| --- | --- | --- | --- |
| Portal Inmobiliario (Mercado Libre) | API oficial (`POST /items` con `CMG_SITE=POI`) | Listo: publica, actualiza, pausa, trae interesados, visitas (`/items/{id}/visits/time_window`) y vistas del teléfono (`/items/{id}/contacts/phone_views/time_window`) | Registrar la app de Portalfirma en Mercado Libre (ver PORTAL-INMOBILIARIO.md) |
| Chilepropiedades | Feed XML que el portal lee una vez al día + API de seguimiento | Listo: arma el feed con el formato oficial y lee estado, estadísticas e interesados con el TOKEN | 1) Que Portalfirma publique el feed en una dirección HTTPS. 2) Escribir a integraciones@chilepropiedades.cl (Asset deja el correo listo). 3) Pegar en Asset el TOKEN que entregan. |
| TOCTOC | Acuerdo comercial (integración con software de corredoras) | Listo para entregar el mismo feed | Acuerdo con su área comercial (toctoc.com/empresas) |
| Yapo | Acuerdo comercial | Listo para entregar el mismo feed | Acuerdo con su equipo comercial |

Chilepropiedades acepta JSON, XML, XLS o XLSX, por HTTP(S) o FTP, y dice que un feed hecho para otro portal puede servir. La integración es gratis si la aprueban; los avisos sincronizados dependen del plan (A: 30 avisos por $3.990 al mes; D: 10.000 avisos por $15.990 al mes). Fuente: chilepropiedades.cl/integraciones, /integraciones/crear-feed, /integraciones/api-documentacion y /planes-publicar-propiedad.

## Lo que necesita construir Portalfirma (backend)

Asset es una app de escritorio: no puede dejar un archivo disponible en internet. El feed lo debe servir la web de Portalfirma.

1. **Recibir el feed desde Asset**: `PUT /asset/feeds/{portal}` con el XML en el cuerpo (`portal` = `chilepropiedades`, `toctoc` o `yapo`), autenticado con la sesión de la corredora.
2. **Servirlo por HTTPS**: por ejemplo `https://feeds.portalfirma.cl/{cuenta}/{portal}.xml`, sin autenticación (lo lee el robot del portal), con `Content-Type: application/xml`.
3. **Fotos públicas**: el feed solo lleva fotos con dirección `https://`. Las que vienen de Portalfirma o Convecta ya cumplen. Si una foto cambia, debe tener un nombre nuevo, porque Chilepropiedades no vuelve a descargar un archivo con el mismo nombre.
4. **Actualizar el feed** cada vez que cambie un aviso, o al menos una vez al día antes de la madrugada, que es cuando lo lee Chilepropiedades.

Mientras no exista el endpoint, Asset permite exportar el feed como archivo («Portales» → «Exportar feed»).

## Formato del feed (resumen del oficial de Chilepropiedades)

Un `<listing>` por propiedad y operación. `referenceId` = código de la propiedad + `-V` (venta) o `-A` (arriendo), porque cada aviso lleva un solo precio.

- Obligatorios: `referenceId`, `propertyType`, `commune`, `prices/price` (número, con `currency` CLF/CLP/USD y `operation` Venta/Arriendo).
- `propertyType`: Bodega, Casa, Departamento, Estacionamiento, Estudio, Galpón, Hotel, Local Comercial, Loft, Oficina, Parcela, Sitio, Terreno, Terreno Agricola, Terreno Forestal, Terreno Industrial…
- Opcionales que Asset envía: `contact` (nombre, correo, teléfonos con `whatsapp="true|false"`, `agencyName`), `address`, `title` (el portal guarda 65 caracteres), `description`, `communityFeesPrice` (CLP), `coordinates`, `bedrooms`, `bathrooms`, `floorArea` y `usableFloorArea` (`unit="m2"`), `parkingLots`, `furnished`, `featured`, `pictures/picture/url`.

## API de seguimiento de Chilepropiedades

Encabezado `Authorization: <TOKEN>`.

- `GET /api-integraciones/mensajes?fromID=` → interesados. Asset los suma a la bandeja y guarda el último id.
- `GET /api-integraciones/estadisticas` → `pageViews`, `contactRevealed`, `contactEmails`, `whatsAppButtonClicked` (acumulado desde la publicación).
- `GET /api-integraciones/estado-publicacion` → Publicada, Borrada, Vencida… con las URL del aviso.
- `GET /api-integraciones/estado-agentes` → cuentas bajo la integración (Asset aún no lo usa).
