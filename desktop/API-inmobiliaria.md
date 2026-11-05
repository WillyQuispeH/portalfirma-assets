# PortalFirma Asset: API que debe exponer el backend

Versión 0.1. La app trabaja hoy con una base local y lee la cartera con `property_manage_tools`, que solo tiene `search`, `get` y `districts`. Para sincronizar en ambos sentidos, el backend debe exponer lo siguiente, ya sea como acciones nuevas de las tools del MCP o como REST con el mismo token OAuth.

Todas las rutas quedan en el contexto de la sesión (`entity_id` + `user_id`). Las respuestas siguen el formato JSON actual.

## 1. Propiedades: `property_manage_tools`

| Acción | Entrada | Salida |
|---|---|---|
| `create` | Campos de la ficha (ver abajo) | `{ id, code }` |
| `update` | `id_property` + solo los campos que cambian | Ficha completa |
| `set_status` | `id_property`, `estado_sale` / `estado_rent` (`disponible`, `reservada`, `vendida`, `arrendada`, `no_disponible`) | Ficha completa |
| `archive` | `id_property`, `archived: true/false` | `{ ok }` |
| `photos_add` / `photos_remove` / `photos_order` | `id_property`, archivo base64 o url, `sort_order`, `is_featured` | `photoItems` |
| `search` | Agregar el filtro `updated_since` (ISO) | Igual que hoy, más `updated_at` |

Campos de la ficha, con los mismos nombres que ya devuelve `get`:

- **Datos:** `title`, `tipo`, `sale`, `rent`, `price_sale`, `currency_sale`, `price_rent`, `currency_rent`.
- **Ubicación:** `address`, `street`, `street_number`, `unit`, `letter`, `district_id`, `role`.
- **Características:** `total_surface`, `built_surface`, `bedrooms`, `bathrooms`, `parkings`, `warehouses`, `amoblado`.
- **Textos:** `observations`.
- **Nuevos:** `common_expenses` (gastos comunes) y `internal_notes`.

## 2. Personas: `person_manage_tools` (nueva)

| Acción | Entrada | Salida |
|---|---|---|
| `search` | `search_term` (nombre, RUT o correo), `role`, `page` | Lista paginada |
| `get` | `id_person` o `rut` | Persona con sus vínculos |
| `upsert` | `rut` (llave única por entidad), `name`, `type` (`natural` o `juridica`), `email`, `phone`, `address`, `civil_status`, `profession`, `nationality`, `roles[]`, `notes` | Persona |
| `link` / `unlink` | `id_property`, `id_person`, `role` (`propietario`, `arrendatario`, `comprador`, `codeudor`, `interesado`, `proveedor`) | Vínculos de la propiedad |

Reglas:

- El RUT es único por entidad y se valida con el módulo 11.
- Los `owner_*` actuales de la propiedad pasan a ser un vínculo con rol `propietario`.

## 3. Actividad y documentos

| Acción | Uso |
|---|---|
| `activity_add` / `activity_list` | Notas e hitos por propiedad o persona: `{ ref_type, ref_id, text, kind }` |
| `property_documents` | Lista de documentos asociados: operaciones firmadas con su `property_id` (plantillas) y archivos subidos con `ingest_document_tools`, con `folder_id` por propiedad |

## 4. Sincronización

- Cada registro lleva `updated_at`. La app envía sus cambios locales y luego pide `updated_since`.
- Si hay conflicto, gana el último cambio, salvo en los campos que la app marcó como editados localmente: en esos se pregunta al usuario.
- Los ids locales (`p…`, `c…`) se reemplazan por los uuid del backend. La app guarda la correspondencia.

## 5. Etapas siguientes (adelanto)

| Etapa | Recursos |
|---|---|
| Negocios | `deal_manage_tools`: embudo y hitos. Cada hito referencia la `operation` de firma que lo cierra |
| Arriendos | `lease_manage_tools`: contrato, canon, reajuste, cuotas, pagos (Flow de la corredora o transferencia) y liquidaciones |
| Finanzas | DTE mediante el proveedor elegido y asientos contables por cada cobro, pago y liquidación |
