# Portalfirma Desktop: especificación v0.1

App de escritorio (Mac primero, Windows después) para arrastrar un PDF o DOCX y enviarlo a firmar, visar o legalizar con Portalfirma, usando la misma conexión que usa el conector de Portalfirma en Claude.

## 1. Conexión con Portalfirma (la misma del conector)

| Elemento | Valor |
|---|---|
| Servidor de herramientas (MCP, HTTP) | `https://mcp.portalfirma.cl/api/mcp` |
| Servidor de inicio de sesión | `https://integracion.portalfirma.cl` |
| Autorizar / token / registro | `/oauth/authorize` · `/oauth/token` · `/oauth/register` |
| Flujo | OAuth 2.1 Authorization Code + PKCE (S256), cliente público (sin secreto) |
| Alcance | `mcp` |
| Registro de la app | Dinámico (RFC 7591). Probado: acepta `http://127.0.0.1:47821/callback` (201 Created) |
| Renovación | `refresh_token` |

En la app, el navegador del sistema abre la página de Portalfirma, el usuario ingresa y Portalfirma vuelve a `127.0.0.1:47821`. Los tokens quedan cifrados en el Llavero (Mac) o en DPAPI (Windows). No se guardan contraseñas.

## 2. Todo lo que hace el conector, y cómo lo usa la app

| # | Herramienta del conector | Qué hace | Uso en la app v0.1 |
|---|---|---|---|
| 1 | `get_partner_session` | Empresa y usuario de la sesión (entity_id, user_id, person_id) | Al iniciar sesión |
| 2 | `wallet_manage_balance_tools` `get_balance` / `add_amount_flow` | Saldo de la billetera / recarga por Flow | Saldo en la barra superior (recarga lista en el backend de la app, falta el botón) |
| 3 | `ingest_document_tools` | Sube el PDF o DOCX en base64 (máx. ~20 MB), devuelve `document_id` | Al soltar el archivo |
| 4 | `extract_signers_document_tools` | Detecta firmantes (nombre, RUT, rol), tipo de documento, resumen, `document_config_id`, `type_sign`, `notarial_procedure`, `required_fields`, `missing_fields`, `ask_type_sign` | Llena la pantalla de revisión |
| 5 | `send_to_sign_document_tools` | Crea la operación y cobra. Requiere `document_id`, `signatories[]`, `email` del pagador; opcional `document_config_id`, `protocolization`, `code` | Botón "Enviar a firmar" (con confirmación) |
| 6 | `process_detail_get_by_operation` | Estado, firmantes (firmó o no), enlace de firma por firmante, archivos `signed.pdf` / `original.pdf` | Pantalla de resultado y "Mis operaciones" |
| 7 | `operation_manage_signing_tools` | Reenviar, enviar enlace por correo o WhatsApp, editar firmante, cambiar tipo de firma, quitar firmante, liberar turno | Correo, WhatsApp, Reenviar a todos |
| 8 | `operation_get_operation_by_rut` / `_by_phone` | Buscar operaciones por RUT del firmante o teléfono del usuario | Disponible en el backend de la app, falta la pantalla |
| 9 | `template_manage_tools` | Plantillas notariales: buscar, formulario, generar PDF y enviar | Fuera de la v0.1 |
| 10 | `sign_documents_cds_massive_tools` | Firma masiva con CDS (clave del certificado + código SMS/WhatsApp) | Fuera de la v0.1 |
| 11 | `search_document_content` | Búsqueda semántica en un documento subido | Fuera de la v0.1 |
| 12 | `property_manage_tools` | Propiedades (Convecta) para llenar plantillas | Fuera de la v0.1 |

## 3. Reglas de negocio (las mismas que sigo con el conector)

1. **Si hay tipo de documento** (`document_config_id`), la firma y el trámite notarial vienen de ese tipo. No se pregunta y no se envía `typeSign`.
2. **Si no hay tipo de documento**, el usuario elige:
   - el tipo de firma: `avanzada`, `simple`, `visada` o `enrolada`, para todos o por firmante;
   - el trámite notarial: `none`, `legalization` o `protocolization`.
3. Solo se piden al usuario los campos que faltan (`missing_fields`), según `required_fields`.
4. **RUT** válido (módulo 11), formato `12.345.678-9`.
5. **Alias** = rol real en el documento (arrendador, comprador…), nunca "Firmante" genérico.
6. **Orden de firma** = orden de la lista. El usuario puede reordenar.
7. **Teléfono**: al menos 5 dígitos. Un celular chileno de 9 dígitos se normaliza a `+56…`.
8. **Correo del pagador** obligatorio. Código de descuento opcional.
9. **Confirmación explícita** antes de enviar, porque se cobra de la billetera.

Respuesta real de `extract_signers` (probada el 2 de octubre de 2026):

```json
{ "typeDocument": "Contrato de prestación de servicios", "summary": "…",
  "firmantes": [{ "fullName": "JUAN PEREZ SOTO", "rut": "11.111.111-1", "email": "", "phone": "", "alias": "prestador" }],
  "document_config_id": null, "type_sign": null, "notarial_procedure": null,
  "required_fields": { "rut": true, "alias": true, "name": true, "email": true, "phone": true },
  "missing_fields": [{ "index": 0, "alias": "prestador", "fields": ["email", "phone"] }], "ask_type_sign": true }
```

## 4. Flujo de la app

1. Iniciar sesión, una vez; la sesión se renueva sola.
2. Arrastrar el PDF o DOCX a la ventana o al ícono del Dock, o usar "Abrir con… Portalfirma".
3. Subir el documento y detectar los firmantes (pasos 3 y 4 de la tabla).
4. Revisar: tipo de documento, resumen, firma, trámite, firmantes, pagador.
5. Confirmar y enviar (paso 5).
6. Resultado: número de operación, enlaces de firma (copiar, correo, WhatsApp) y seguimiento (pasos 6 y 7).

## 5. Pendientes para producción

- **Firma y notarización de Apple** (cuenta Apple Developer, US$99 al año) para que el Mac no muestre advertencia. Hoy la app tiene una firma local (ad-hoc).
- **Windows**: `npm run dist:win` en un PC con Windows, o en CI. Para que Windows no muestre advertencia, conviene un certificado de firma de código.
- **Respuesta de `send_to_sign`**: la app busca el número de operación en `operation`, `operationNumber` o cualquier campo "operation". Hay que confirmar con el equipo el formato exacto.
- **Actualizaciones automáticas** (electron-updater) y un botón de recarga de saldo.
- **Puerto 47821** fijo para volver del inicio de sesión. Si está ocupado, la app avisa.

## 6. Código

- `src/portalfirma.js`: inicio de sesión y llamadas a las herramientas.
- `src/main.js`: ventana, archivos, Dock, validaciones.
- `src/renderer/`: interfaz.
- `src/mock.js`: modo demostración (`PF_MOCK=1 npm start`).

Para construir:

```
npm install
npm start
npm run dist:mac
npm run dist:win
```

El primer comando instala dependencias, el segundo abre la app en desarrollo, y los dos últimos generan los instaladores de Mac (`dist/*.zip`) y de Windows (`dist/*.exe`).
