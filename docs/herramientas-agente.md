# Herramientas del Agente de PortalFirma Asset

Generado desde `src/herramientas-guia.js`. «Canal» indica si la herramienta sirve tal cual por WhatsApp o necesita la pantalla de la app.

## Propiedades

| Herramienta | Modo | Usar cuando | No usar para | Canal |
|---|---|---|---|---|
| `asset_buscar_propiedades` | leer | hay que encontrar propiedades por texto o filtros (comuna, tipo, precio, operación) | ver el detalle de una ya identificada (asset_ver_propiedad) | chat-y-whatsapp |
| `asset_ver_propiedad` | leer | se necesita la ficha completa de una propiedad (datos, personas, documentos, portal) | saber «cómo va» comercialmente (asset_estado_propiedad) | chat-y-whatsapp |
| `asset_dictar_propiedad` | leer | el usuario quiere SUBIR, CAPTAR o CREAR una propiedad y la describe (o dicta, o pega una descripción): «capté un depto en…», «sube esta propiedad: …» | cambiar una propiedad que ya existe (asset_actualizar_propiedad) | chat-y-whatsapp |
| `asset_fotos_drive` | leer | quieren cargar las fotos de una propiedad desde Google Drive | — | solo-app |
| `asset_crear_propiedad` | escribir | SOLO para guardar una propiedad cuyos datos el usuario ya revisó y confirmó (después de asset_dictar_propiedad, por WhatsApp) | subir o captar una propiedad nueva desde una descripción (asset_dictar_propiedad) | chat-y-whatsapp |
| `asset_actualizar_propiedad` | escribir | cambian datos de una propiedad existente: precio, metros, descripción, dirección… | cambiar si está disponible, reservada, vendida o arrendada (asset_cambiar_estado) | chat-y-whatsapp |
| `asset_cambiar_estado` | escribir | una propiedad pasa a disponible, reservada, vendida, arrendada o no disponible | mover la etapa de un negocio (asset_mover_negocio) | chat-y-whatsapp |
| `asset_estado_propiedad` | leer | preguntan cómo va una propiedad: negocios, etapa, lo último que pasó y próximas visitas | ver o editar datos de la ficha | chat-y-whatsapp |
| `asset_anotar` | escribir | el usuario CUENTA algo que pasó con una propiedad o cliente: llamó, visitó, ofertó, mandó documentos | agendar algo a futuro (asset_crear_evento) ni dejar una nota interna sin hecho (asset_nota) | chat-y-whatsapp |

## Personas

| Herramienta | Modo | Usar cuando | No usar para | Canal |
|---|---|---|---|---|
| `asset_buscar_personas` | leer | hay que encontrar a alguien del CRM por nombre, RUT o correo | crear una persona nueva (asset_crear_persona) | chat-y-whatsapp |
| `asset_ver_persona` | leer | se necesitan los datos de una persona, sus propiedades, negocios y eventos | — | chat-y-whatsapp |
| `asset_crear_persona` | escribir | hay que agregar una persona nueva al CRM (necesita nombre y RUT) | buscar a alguien que puede existir (asset_buscar_personas primero) | chat-y-whatsapp |
| `asset_vincular_persona` | escribir | una persona del CRM pasa a ser propietario, arrendatario, comprador, codeudor o interesado de una propiedad | — | chat-y-whatsapp |
| `asset_nota` | escribir | piden dejar una nota interna en una persona o un negocio («anota que prefiere que lo llamen en la tarde») | contar algo que pasó con una propiedad (asset_anotar) | chat-y-whatsapp |

## Negocios

| Herramienta | Modo | Usar cuando | No usar para | Canal |
|---|---|---|---|---|
| `asset_listar_negocios` | leer | preguntan por los negocios abiertos, atrasados o de un tipo | — | chat-y-whatsapp |
| `asset_ver_negocio` | leer | se necesita el detalle de un negocio (etapas, tareas, firmas, historial) | — | chat-y-whatsapp |
| `asset_crear_negocio` | escribir | empieza un negocio de venta o arriendo entre una propiedad y un cliente | — | chat-y-whatsapp |
| `asset_mover_negocio` | escribir | piden pasar un negocio a otra etapa (visita, reserva, evaluación, contrato, entrega…) | cambiar el estado comercial de la propiedad (asset_cambiar_estado) | chat-y-whatsapp |
| `asset_tarea_negocio` | escribir | marcan o desmarcan una tarea de la etapa actual del negocio | — | chat-y-whatsapp |
| `asset_proxima_accion` | escribir | definen qué hay que hacer después en un negocio y para cuándo | — | chat-y-whatsapp |
| `asset_vincular_firma` | escribir | ligan una operación de firma ya existente a la etapa actual de un negocio | — | chat-y-whatsapp |
| `asset_cerrar_negocio` | confirmar | un negocio se gana o se pierde | — | chat-y-whatsapp |

## Agenda

| Herramienta | Modo | Usar cuando | No usar para | Canal |
|---|---|---|---|---|
| `asset_agenda` | leer | preguntan qué hay agendado en un rango de fechas | agendar algo nuevo (asset_crear_evento) | chat-y-whatsapp |
| `asset_crear_evento` | escribir | piden agendar o coordinar una visita, reunión, firma, llamada o tarea (solo calendario, sin documentos) | la ORDEN de visita, que es un documento a firmar (asset_orden_visita) | chat-y-whatsapp |
| `asset_actualizar_evento` | escribir | reprograman, cancelan o marcan como hecho un evento | — | chat-y-whatsapp |

## Documentos

| Herramienta | Modo | Usar cuando | No usar para | Canal |
|---|---|---|---|---|
| `asset_orden_visita` | confirmar | piden explícitamente la ORDEN DE VISITA (el documento que firma el visitante; cobra) | solo agendar la visita (asset_crear_evento) | chat-y-whatsapp |
| `asset_plantillas` | leer | quieren ver la lista de plantillas disponibles | pedir un documento por su nombre (asset_buscar_documento) | chat-y-whatsapp |
| `asset_buscar_documento` | leer | piden cualquier otro documento por su nombre (contrato, comprobante, recibo, acta, carta, mandato…): busca la plantilla y, si no hay, ofrece crearlo | la orden de visita (asset_orden_visita) | chat-y-whatsapp |
| `asset_formulario_documento` | leer | ya se eligió una plantilla y hay que ver qué datos tiene y cuáles faltan | — | chat-y-whatsapp |
| `asset_generar_documento` | confirmar | el formulario de la plantilla está completo y hay que generarlo y enviarlo a firmar (cobra) | — | chat-y-whatsapp |

## Firmas

| Herramienta | Modo | Usar cuando | No usar para | Canal |
|---|---|---|---|---|
| `asset_seguimiento_firma` | leer | preguntan cómo va una firma o quién falta, con el número de operación | — | chat-y-whatsapp |
| `ingest_document_tools` | portalfirma | el usuario ADJUNTÓ un archivo para enviarlo a firmar | documentos de una propiedad (asset_buscar_documento) | solo-app |
| `search_document_content` | portalfirma | buscar texto dentro de un adjunto ya subido | — | solo-app |
| `extract_signers_document_tools` | portalfirma | después de subir un adjunto, para detectar sus firmantes | — | solo-app |
| `send_to_sign_document_tools` | portalfirma | enviar a firmar un ADJUNTO ya subido (cobra) | documentos de plantillas o creados por Asset (asset_generar_documento / asset_buscar_documento) | solo-app |
| `process_detail_get_by_operation` | portalfirma | piden el detalle técnico de una operación | saber quién falta por firmar en documentos de propiedades (asset_seguimiento_firma) | chat-y-whatsapp |
| `operation_get_operation_by_rut` | portalfirma | buscar operaciones de firma por RUT en un rango de fechas | — | chat-y-whatsapp |
| `operation_get_operation_by_phone` | portalfirma | buscar operaciones de firma por teléfono en un rango de fechas | — | chat-y-whatsapp |
| `operation_manage_signing_tools` | portalfirma | reenviar el enlace de firma, corregir datos de un firmante o cambiar el tipo de firma | — | chat-y-whatsapp |
| `sign_documents_cds_massive_tools` | portalfirma | firmar documentos pendientes con certificado CDS (la clave la pide la app) | — | solo-app |

## Portales

| Herramienta | Modo | Usar cuando | No usar para | Canal |
|---|---|---|---|---|
| `asset_interesados` | leer | preguntan por interesados llegados desde los portales | — | chat-y-whatsapp |
| `asset_publicar_portal` | confirmar | piden publicar una propiedad en Portal Inmobiliario | — | chat-y-whatsapp |
| `asset_aviso_portal` | confirmar | piden pausar, reactivar, actualizar o finalizar un aviso ya publicado | — | chat-y-whatsapp |
| `asset_sincronizar_portal` | leer | piden traer el estado de los avisos o los interesados nuevos del portal | — | chat-y-whatsapp |
| `asset_rendimiento_avisos` | leer | preguntan cómo van los avisos (visitas, contactos, calidad, recomendaciones) | — | chat-y-whatsapp |
| `asset_bandeja_interesados` | leer | quieren la bandeja de interesados de todos los portales por estado | — | chat-y-whatsapp |

## Consultas

| Herramienta | Modo | Usar cuando | No usar para | Canal |
|---|---|---|---|---|
| `asset_resumen` | leer | el usuario pregunta qué tiene hoy, cómo va su día o pide un resumen general | una propiedad puntual (asset_estado_propiedad) | chat-y-whatsapp |

## Cuenta

| Herramienta | Modo | Usar cuando | No usar para | Canal |
|---|---|---|---|---|
| `get_partner_session` | portalfirma | se necesitan los datos de la empresa de la sesión | — | chat-y-whatsapp |
| `wallet_manage_balance_tools` | portalfirma | preguntan el saldo o quieren recargar | — | chat-y-whatsapp |

## App

| Herramienta | Modo | Usar cuando | No usar para | Canal |
|---|---|---|---|---|
| `asset_abrir` | leer | el usuario pide ABRIR o VER una pantalla de la app | responder una pregunta (usa la consulta que corresponda) | solo-app |

Cómo elegir la herramienta (en caso de duda, esta tabla manda):
- Describe una propiedad para subirla o captarla («capté un depto…», «sube esta propiedad…», un texto largo con dormitorios, metros, precio) → asset_dictar_propiedad. NUNCA asset_crear_propiedad directo.
- Cambia datos de una propiedad que ya existe → asset_actualizar_propiedad. Cambia si está disponible/reservada/vendida/arrendada → asset_cambiar_estado.
- Cuenta algo que YA pasó (llamó, visitó, ofertó) → asset_anotar. Nota interna sobre una persona o negocio → asset_nota.
- Agendar/coordinar una visita → asset_crear_evento. La ORDEN de visita (documento) → asset_orden_visita. Nunca ambos si no lo piden.
- Cualquier otro documento por su nombre → asset_buscar_documento (y el usuario elige con los botones).
- Pregunta cómo va una propiedad → asset_estado_propiedad. Qué tengo hoy → asset_resumen. Quién falta por firmar → asset_seguimiento_firma.
- Fotos desde Google Drive → asset_fotos_drive.
- Un archivo ADJUNTO para firmar → ingest_document_tools → extract_signers_document_tools → send_to_sign_document_tools.
