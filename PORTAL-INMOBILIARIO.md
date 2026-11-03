# Portal Inmobiliario en PortalFirma Asset

Integración con la API oficial de Inmuebles de Mercado Libre Chile. La documentación de developers.mercadolibre.cl se revisó el 12/10/2026.

## Cómo funciona

| Acción en la app | Lo que hace en Mercado Libre |
|---|---|
| **Portales → Conectar cuenta** | Abre una ventana con la autorización de Mercado Libre (OAuth con PKCE). La corredora entra con su cuenta y autoriza a PortalFirma. El token se guarda cifrado y se renueva solo: dura 6 horas y el refresh token es de un solo uso |
| **Ficha → Publicar** | Revisa la ficha y luego hace `POST /items` |
| **Editar la ficha** | Si cambia el precio, las fotos, el título o la descripción, hace `PUT /items/{id}` y `PUT /items/{id}/description` |
| **Estado de la ficha** | Reservada, vendida, arrendada o no disponible pausa el aviso. Volver a «disponible» lo reactiva |
| **Pausar, reactivar, finalizar** | `PUT /items/{id}` con `status`. Un aviso finalizado no se reactiva: hay que publicarlo de nuevo |
| **Sincronizar avisos e interesados** | `GET /items?ids=` para los estados y `GET /vis/users/{id}/leads/buyers` para los interesados |
| **Vincular avisos existentes** | Lista los avisos activos de la cuenta y los asocia a las fichas por código (`PROPERTY_CODE`, `seller_custom_field` o el id externo de Convecta). Así no se duplican |

### Revisión antes de publicar (`POST /items`)

- **Categoría:** se resuelve por tipo y operación con la API de categorías. Por ejemplo, Departamentos › Venta › Propiedades usadas = `MLC157522`.
- **Comuna:** se valida con `classified_locations` (región, comuna y barrio opcional).
- **Atributos obligatorios de la categoría:** superficie total, superficie útil, dormitorios, baños y estacionamientos.
- **Fotos:** al menos 1. Para la mejor calidad del aviso se recomiendan 12 en casas, departamentos, oficinas y parcelas.
- **Precio y moneda:** UF se envía como `CLF`.
- **Título:** máximo 60 caracteres. Se puede escribir un título especial para el portal.
- **WhatsApp:** obligatorio desde el 01/10/2026, en `seller_contact.country_code2` y `phone2`, solo dígitos.
- **Paquete:** se consulta si a la corredora le quedan publicaciones.

### Lo que se envía en el aviso

- El atributo `CMG_SITE = "POI"`, que hace que el aviso aparezca también en Portal Inmobiliario.
- El código de la ficha, en `PROPERTY_CODE` y en `seller_custom_field`.

### Interesados

Los interesados llegan por WhatsApp, preguntas, llamadas, solicitudes de visita o cotizaciones, y quedan en la ficha:

- Si traen RUT, entran al CRM como «interesado» vinculado a la propiedad.
- Si no traen RUT, se agregan al CRM con un clic.

## Lo que debe hacer PortalFirma una sola vez

1. **Crear la aplicación.** Con la cuenta de empresa de PortalFirma en Mercado Libre, entra en developers.mercadolibre.cl → Mis aplicaciones → Crear aplicación y completa:
   - **Nombre:** PortalFirma Asset. Agrega logo y descripción.
   - **Redirect URI:** `https://www.portalfirma.cl/mercadolibre/callback`. Mercado Libre exige HTTPS, pero esa página no necesita existir ni se toca el sitio de portalfirma.cl: la app lee el código de autorización antes de cargarla.
   - **PKCE:** activado.
   - **Scopes:** lectura, escritura y `offline_access`.
   - **Permisos funcionales:** publicación y sincronización de ítems, usuarios y comunicaciones (leads y visitas de inmuebles).
   - **Notificaciones:** no se usan. La app consulta al sincronizar.
2. **Guardar las credenciales.** Copia el Client ID y el Client Secret en `build/mercadolibre/app.json`, con el formato de `app.ejemplo.json`. Al compilar, el archivo queda dentro del instalador, igual que las credenciales de Google.
3. **Probar con un usuario de prueba de Mercado Libre.** Un paquete contratado con un usuario de prueba no tiene costo.

## Lo que hace cada corredora

1. Activar su cuenta de Mercado Libre como inmobiliaria. Se pide con el formulario de Mercado Libre.
2. Contratar un paquete de publicación. Lo paga la corredora.
3. En la app, entrar a Portales:
   - Guardar los datos de contacto del aviso. El WhatsApp es obligatorio.
   - Conectar su cuenta.

## Primer cliente: corredora que viene de Convecta

Sus propiedades ya están en Portalfirma gracias a la sincronización con Convecta: 7 en la cuenta actual, con códigos CV-xxxx, fotos, rol y corredor asignado.

1. Desde el Inicio o la Cartera, usar **Importar desde Portalfirma**. Las propiedades que Convecta marca como inactivas llegan archivadas.
2. **Completar los propietarios.** Convecta no envía los datos del dueño (llegan vacíos), así que hay que vincularlos en cada ficha. Son necesarios para firmar el mandato.
3. Entrar a **Portales**, guardar el contacto y conectar la misma cuenta de Mercado Libre que hoy usa Convecta.
4. **Antes de publicar nada**, usar **Vincular avisos existentes** para asociar los avisos que Convecta ya publicó a sus fichas.
5. Desactivar en Convecta la publicación en Portal Inmobiliario, para que los dos sistemas no editen los mismos avisos.
6. Desde ese momento, los cambios se hacen en la ficha y el aviso se actualiza solo.

En los datos actuales hay detalles que conviene revisar:

- Superficies que vienen vacías: en CV-5461, la superficie del terreno solo aparece en la descripción.
- Propiedades marcadas como no amobladas, aunque la descripción dice «amoblada».
- Títulos genéricos, como «Casa en Osorno». Se puede escribir un título especial para el portal al publicar.

## Pruebas

`xvfb-run -a node test/portal-e2e.js` hace 24 verificaciones contra una API de Mercado Libre simulada (`src/portales/mercadolibre-mock.js`). Esa simulación usa los ids reales de categorías y comunas, y aplica las validaciones de la API real (CMG_SITE, WhatsApp, fotos, título).
