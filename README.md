# PortalFirma Asset 0.13.2

## Novedades de la 0.10: Postventa (MVP) con WhatsApp
- **Nueva pestaña Postventa.** Reúne los reclamos de propietarios, las unidades entregadas, la atención por WhatsApp y los contratistas.
- **Unidades:** se cargan desde una planilla Excel o CSV (hay plantilla) con proyecto, torre, número, propietario, RUT, celular, fecha de recepción municipal (DOM) e inscripción en el CBR.
- **Garantía legal calculada** (Ley 20.016, art. 18 LGUC):
  - estructura: 10 años desde la recepción DOM;
  - instalaciones y otros: 5 años desde la recepción DOM;
  - terminaciones: 3 años desde la inscripción en el CBR.
- **WhatsApp de cara al propietario** (vía wechatia, el mismo número de las visitas). El asistente:
  - reconoce al propietario por su celular o le pide el RUT;
  - pide la falla y las fotos, clasifica tipo y recinto, marca urgencias y crea el reclamo (PV-0001…) con su garantía;
  - responde «estado» y pide la nota del 1 al 5 al cierre.
  - Los mensajes comerciales no se contestan. Funciona mientras Asset está abierto (revisa cada minuto).
  - Usa una clave propia: la integración privada «PortalFirma Asset - Postventa» de wechatia (ver conversaciones, ver y editar mensajes, ver contactos), que se pega en Postventa › WhatsApp.
- **Reclamo guiado:** «¿Qué sigue?» lleva por Por revisar → Diagnóstico → Contratista → Reparación → Validación → Cerrado (o «No procede» con motivo). Avisa al propietario por WhatsApp en cada paso y envía la orden de trabajo al contratista.
- **Tablero:** reclamos abiertos, urgentes, por WhatsApp, días promedio al cierre y satisfacción.

## Novedades de la 0.9.4: visualización más ordenada
- Actividad en su propia pantalla, «Lo último» con 3 líneas a la vista, historial plegable, negocios por cliente con sus etapas, «¿Qué sigue?» guiado, chat que baja solo a la tarjeta nueva y etiquetas más amables (lila en vez de amarillo).

## Novedades de la 0.9.3: confirmar la visita por WhatsApp
- **Después de agendar una visita**, el chat ofrece «Confirmar por WhatsApp a Juan». El mensaje viene listo con el día, la hora, la dirección y quién recibe la visita. Se puede editar antes de enviarlo, y Asset abre WhatsApp con el mensaje.
- **La visita queda marcada como confirmada** y lo deja anotado en el historial. En el lienzo, cada próxima visita tiene su botón de WhatsApp, que muestra un ✓ cuando ya se confirmó. La agenda del día tiene el mismo botón.
- **Si la persona no tiene celular**, se escribe en la misma tarjeta y queda guardado en su ficha.
- **Aviso de visitas por confirmar:** las visitas de los próximos 3 días que todavía no se han confirmado aparecen como sugerencia en el estado de la propiedad.

## Novedades de la 0.9.2: calendario de reservas (wechatia)
- **El calendario está dentro de Agendar.** Con «Calendario de reservas», el corredor reserva la visita en el widget de wechatia sin salir de Asset. El widget se abre con el cliente y la propiedad elegidos, siempre que el calendario acepte esos datos.
- **Conexión:** en la misma tarjeta, «Conectar» pide el código del widget (se puede pegar el `<iframe…>` completo) y la clave de una integración privada de wechatia con lectura de calendarios y contactos. La clave queda cifrada.
- **«Listo, ya reservé».** Asset trae la reserva y la deja en la agenda como visita de esa propiedad, con su cliente y su negocio. El negocio pasa a «Visita» (hito) y se vuelve al estado de la propiedad.
- **Se mantiene al día.** Cada 5 minutos, y al abrir la Agenda, Asset trae las reservas nuevas (también las hechas fuera de Asset), las reprogramaciones y las cancelaciones.
- **Sin clave** se puede usar igual: después de reservar, se anota la hora en «Rápido en Asset».

## Corrección 0.9.1
- **Agendar una visita es un hito.** El negocio de ese cliente pasa de «Interesado» a «Visita» y la tarea «Agendar la visita» queda hecha. El chat lo informa y ofrece «Dejarlo en «Interesado»» por si no corresponde. Lo mismo ocurre al generar una orden de visita.
- **Después de agendar, vuelves al flujo de la propiedad**, con su estado ya actualizado y la sugerencia de la orden de visita.
- **Las tarjetas del chat (Anotar, Agendar, Documento…) se pueden cerrar** con «Cancelar» o la X, sin dejar rastro.

## Novedades de la 0.9: la propiedad primero

- **Al elegir una propiedad se ve cómo está.** La tarjeta muestra la foto, el precio y el estado, y luego los negocios en curso: cliente, etapa, barra de avance, lo que falta y la próxima acción. También muestra lo último que pasó, las próximas visitas y los documentos en firma.
  - Las acciones son libres: Anotar, Documento, Agendar, Orden de visita, Nuevo negocio, Publicar y Ficha. Ningún flujo es obligatorio.
- **Anotar lo que pasó fuera de Asset** (una llamada, una visita, documentos recibidos, una oferta). La nota queda en el historial del negocio y Asset sugiere el siguiente paso, por ejemplo «Agendar visita 15/10 11:00 con Juan» o «Pasar a «Visita»». La sugerencia solo se aplica si el usuario la toca.
  - También funciona por chat: «hablé con Juan, mandó las liquidaciones».
- **Lienzo con el negocio:**
  - Las etapas se pueden tocar para avanzar o volver (pide confirmación y avisa si se salta etapas).
  - Las tareas de la etapa se marcan ahí mismo.
  - Una etapa con firma se puede marcar «Firmado fuera de Asset».
  - Si la propiedad tiene más de un negocio, cada uno tiene su pestaña.
- **Continuidad:**
  - Escribir solo el código («CV-5549») muestra la propiedad.
  - El chat vacío ofrece «Retomar» las propiedades recientes.
  - Al abrir una conversación anterior aparece el estado actual de su propiedad.
  - La ficha tiene el botón «Ver en el Agente».
- **Dirección inteligente al subir o editar una propiedad:**
  - Con una clave de Google Maps Platform (Places API (New) y facturación activas), sugiere direcciones mientras se escribe. Al elegir una, llena calle y número, comuna y región, y guarda latitud y longitud.
  - La clave se pega en el mismo formulario («Activar direcciones de Google») y queda cifrada en el computador.
  - Sin clave, el botón «Buscar» consulta OpenStreetMap (una búsqueda por clic, según su política de uso).
  - La ficha muestra «ver en el mapa». Las coordenadas van al feed de Chilepropiedades y quedan listas para la geolocalización.

## Corrección 0.8.2: «Portalfirma no devolvió el formulario de la plantilla»

- Portalfirma entrega algunos errores como texto (por ejemplo, «La propiedad no existe o no está asignada al usuario») sin marcarlos como error. Asset los tomaba como respuesta vacía y se detenía.
- Ahora los reconoce. Si con la propiedad no se puede pedir el formulario, lo pide sin ella y completa los datos con la ficha de Asset, avisándolo.
- Si igual falla, el mensaje muestra el texto exacto que devolvió Portalfirma.


## Corrección 0.8.1: orden de visita con la plantilla actual de Portalfirma

- La plantilla «Orden de visita» ahora exige la propiedad (código, comuna, corredor, dirección, dormitorios, foto, precio y tipo).
- Si la propiedad no está asignada al usuario de la sesión en Portalfirma («La propiedad no existe o no está asignada al usuario»), Asset pide el formulario sin ella y completa esos datos con la ficha. La confirmación lo avisa.
- Si falta algo (por ejemplo, la foto o el nombre del corredor), el mensaje dice exactamente qué y dónde completarlo.
- Lo mismo aplica a los demás documentos desde plantillas.


## Novedades de la 0.8: Publicaciones (parte comercial)

Nueva pestaña **Publicaciones**, separada del resto de la gestión. Se sube la propiedad, se pulsa **Publicar** (en la ficha, en el lienzo del Agente o en Publicaciones) y empieza el flujo:

1. **Calidad del aviso**: puntaje de 0 a 100 con lo que falta (fotos, título, descripción, superficie, gastos comunes, WhatsApp de contacto) y un botón para arreglar cada punto. **Redactar con IA** escribe el título (60 caracteres) y la descripción usando solo los datos de la ficha.
2. **Portales**: Portal Inmobiliario (API; elige el tipo de aviso según el paquete disponible), Chilepropiedades (feed diario; destacado opcional), TOCTOC y Yapo (cuando haya acuerdo comercial).
3. **Publicar**: resultado por portal. Lo que espera una integración sale solo cuando se activa.

Después:

- **Avisos**: visitas, contactos e interesados por aviso, calidad y alertas con recomendación (precio por m² frente a la cartera de la misma comuna, días sin contactos, muchas visitas y pocos contactos, poca visibilidad). «Ajustar precio» con −3%, −5% u −8%.
- **Interesados**: bandeja única de todos los portales (nuevos, contactados, con visita, descartados), respuesta por WhatsApp o correo lista para enviar, «Agendar visita» y carga manual para TOCTOC o Yapo.
- **Portales**: estado de cada conexión, contacto de los avisos, feed XML (formato oficial de Chilepropiedades), TOKEN de seguimiento y «Solicitar integración» con el correo listo.

El Agente también responde «¿cómo van mis avisos?» y abre el flujo de publicación. Lo que debe construir Portalfirma para los feeds está en PUBLICACIONES.md.


## Novedades de la 0.7: el Agente al centro

- **Asset abre en el Agente** (con sesión iniciada). Tres columnas:
  - Izquierda: **conversaciones guardadas** en el computador. Se pueden abrir, renombrar, fijar, buscar y eliminar. Cada una recuerda lo que mostraba el lienzo.
  - Centro: el chat.
  - Derecha: el **lienzo en vivo**. Muestra «Tu día» (agenda, negocios que necesitan algo, documentos en firma), la propiedad, el negocio con sus etapas, la agenda de un día o el seguimiento de una firma. Se actualiza solo con cada acción, del chat o de un botón, y sus botones hacen la acción al toque (por ejemplo, «Pasar a Visita»).
- **Siguiente paso:** después de cada acción, botones con lo que normalmente sigue. Por ejemplo, tras crear un negocio aparecen «Agendar una visita», «Generar un documento» y «Ver el negocio».
- **Botones fijos:** «Agendar una visita» abre su propia tarjeta (tipo, propiedad, persona, día y hora) y solo agenda: nunca genera documentos. La orden de visita sale solo cuando se pide.
- El agente ya no confunde agendar con generar la orden de visita: las herramientas y las instrucciones lo separan.
- Lo que hace el chat ya no saca al usuario de la conversación: el resultado aparece en el lienzo.
- Negocios: el tablero abre en la pestaña (venta o arriendo) del último negocio movido y se actualiza al instante.
- La orden de visita queda en «Documentos en firma» de la propiedad.


## Novedades de la 0.6: Agente a pantalla completa y «Gestionar una propiedad»

- Pestaña **Agente**: conversación al estilo Claude/Gemini, con saludo, cuadro de texto grande, acciones rápidas y sugerencias. El mismo chat se puede tener como panel al lado de cualquier pantalla (botón de la barra superior) y pasar de uno a otro sin perder la conversación.
- Acciones rápidas: Gestionar una propiedad, Generar un documento, Agendar una visita, Subir una propiedad, Seguimiento de firmas y ¿Qué tengo hoy?
- **Gestionar una propiedad** (tarjetas dentro del chat):
  1. Elegir la propiedad por código, dirección, comuna o propietario.
  2. Qué hacer: documento, orden de visita, visita, negocio, documentos en firma, ficha o portal.
  3. Qué documento: las plantillas de la cuenta en la Notaría virtual (contratos de arriendo, promesas, corretaje, mandatos, actas…), ordenadas según la propiedad.
  4. Formulario prellenado con la ficha, las personas vinculadas (propietario, arrendatario/comprador, codeudor) y los datos del corredor (se recuerdan). Lo que falta queda marcado.
  5. Revisar → confirmar el cobro → enviar a firmar. El documento queda en la ficha («Documentos en firma») y, si corresponde, en el negocio.
  6. Seguimiento: estado de cada firmante, «Preguntar al Agente» o «Seguir en Operaciones», que abre el panel de Operaciones con el chat acoplado al lado.
- Ficha: botón **Generar documento** y recuadro **Documentos en firma**.
- Agente: nuevas herramientas `asset_plantillas`, `asset_formulario_documento`, `asset_generar_documento` (pide confirmar) y `asset_seguimiento_firma`: 32 de Asset + las del MCP.
- Casita junto a «Asset» en la barra superior.


## Novedades de la 0.5: Agente Asset multipropósito

El ejecutivo puede hacer todo por chat, sin depender de botones (los botones siguen ahí):

- **Propiedades:** crear, editar, cambiar precio o estado («marca la casa de Chicureo como vendida»), buscar.
- **Personas:** crear, vincular como propietario/interesado/arrendatario, notas.
- **Negocios:** crear, mover de etapa, tareas, próxima acción, cerrar (pide confirmar), vincular firmas.
- **Agenda (nuevo panel):** visitas, reuniones, firmas, llamadas y tareas con fecha y hora.
- **Orden de visita:** usa la plantilla real «Orden de visita» de Portalfirma (template_manage_tools), la completa con la propiedad, el visitante y la fecha, y la envía a firmar. Pide confirmar porque descuenta saldo.
- **Portal Inmobiliario:** publicar, pausar o reactivar avisos y traer interesados (pide confirmar al publicar).
- **Navegación:** «abre la ficha de CV-9001».
- Además, las 13 herramientas MCP de Portalfirma (firma, plantillas, operaciones, saldo…): 41 herramientas en total.

Solo pide confirmación lo que cobra, publica o no se puede deshacer. Cada acción queda en el registro de actividad.

**Modelo:** el GPT «mini» más reciente disponible en la cuenta, con razonamiento mínimo (`reasoning_effort: minimal`, con respaldo a `low`). Es el más económico que maneja bien 41 herramientas y acciones encadenadas; «nano» es más barato pero falla al elegir herramientas y completar pasos. Se puede forzar otro con la clave `agentModel` de la configuración o la variable `PF_AGENT_MODEL`.


## Novedades de la 0.3: Negocios

- **Tablero por etapas.**
  - Venta: interesado, visita, oferta y reserva, promesa, escritura, inscripción y entrega.
  - Arriendo: interesado, visita, reserva, evaluación, contrato y entrega.
  - Se arrastra una tarjeta para moverla. Cada tarjeta muestra lo que falta y la próxima acción.
- **Ficha del negocio:** cada etapa tiene su lista de tareas y el documento que debe quedar firmado. Además, próxima acción con fecha, condiciones con la comisión estimada, personas e historial.
- **Firmas:** la etapa queda ligada a su operación de Portalfirma, ya sea enviada desde el negocio (documento de la ficha, archivo o Notaría virtual) o vinculada por número. Cuando la operación queda firmada, el negocio avanza solo.
- **La propiedad sigue al negocio:** pasa a reservada en la reserva, a vendida o arrendada al cerrar, y vuelve a disponible si el negocio se pierde. Si está publicada en Portal Inmobiliario, el aviso se pausa o se reactiva solo.
- **Inicio:** muestra los negocios abiertos y avisa cuáles tienen acciones vencidas, cuáles esperan firmas y cuáles están listos para avanzar. La ficha de cada propiedad lista sus negocios.
- **Pruebas:** `test/negocios-e2e.js`, con 22 verificaciones.

## Versión 0.2.0

App de escritorio para inmobiliarias y corredoras boutique. Reúne la cartera, el CRM, los negocios y los arriendos, y cada documento termina firmado con PortalFirma.

Está construida sobre el código de PortalFirma Studio. Lo inmobiliario es lo principal; las herramientas de Studio quedan en «Gestión documental».

## Novedades de la 0.2: Portal Inmobiliario

- **Portales:** la corredora conecta su cuenta de Mercado Libre y configura el contacto que aparece en los avisos (el WhatsApp es obligatorio).
- **Ficha:** se puede publicar, actualizar, pausar, reactivar y finalizar el aviso. Antes de publicar, la app revisa la categoría, la comuna, los atributos, las fotos, el paquete y el título.
- **Sincronía con la ficha:** el aviso se actualiza solo cuando cambia el precio, las fotos o la descripción. Si la propiedad pasa a reservada, vendida o arrendada, el aviso se pausa.
- **Interesados del portal:** llegan a la ficha y al CRM.
- **Migración desde Convecta:** «Vincular avisos existentes» asocia los avisos que ya están publicados, sin duplicarlos.
- **Importación desde Convecta:** reintenta las propiedades que fallan, archiva las inactivas y limpia el HTML de las descripciones.
- **Configuración:** ver `PORTAL-INMOBILIARIO.md`. Pruebas: `test/portal-e2e.js`.

## Qué incluye la 0.1 (etapas 0 y 1)

- **Inicio:** indicadores de la cartera, propiedades que requieren atención (sin propietario, reservadas, sin fotos), actividad reciente, atajos y el Agente PortalFirma.
- **Cartera:**
  - Fichas de propiedad con búsqueda (incluye el RUT del propietario) y filtros por operación, tipo, estado y comuna.
  - Galería, características, comercialización con cambio de estado, personas vinculadas, documentos (arrastrar y soltar, se abren en el editor para enviarlos a firmar) e historial con notas.
  - «Importar desde Portalfirma» lee la tool `property_manage_tools` del MCP, incluidas las propiedades sincronizadas desde Convecta. Los datos editados en la app se respetan al volver a importar.
- **Personas:** CRM con un RUT único validado. Roles: propietario, arrendatario, comprador, codeudor, interesado y proveedor. Cada persona tiene sus propiedades e historial. No se puede borrar una persona que está vinculada.
- **Negocios, Arriendos y Finanzas:** pantallas de las etapas 2 a 4, con acceso a lo que ya existe en Gestión documental.
- **Gestión documental:** todo Studio (editor PDF, envío a firma, Notaría virtual, firmas presenciales, plazos, expedientes, flujos, carga masiva, Drive y agente).

## Datos

- Todo se guarda en local, en `userData/inmo/datos.json` (escritura atómica). Los documentos de cada propiedad van en `userData/inmo/documentos/<id>/`.
- La API que debe exponer el backend para sincronizar está en `API-inmobiliaria.md`.

## Código

- `src/inmo.js`: base local, validaciones, vínculos, documentos e importación desde el MCP.
- `src/renderer/inmo.js`: Inicio, Cartera, ficha, Personas y formularios.
- IPC: `inmo:*` en `src/main.js`, con su puente en `src/preload.js` (`pf.inmo*`).
- Prueba: `xvfb-run -a node test/propiedades-e2e.js` (35 verificaciones, modo `PF_MOCK=1` con una cartera ficticia).

## Familia de productos

Propiedades y Studio comparten el núcleo de firma y gestión documental:

- inicio de sesión MCP
- firma, Notaría virtual y firmas presenciales
- editor PDF
- agente
- Drive
- instaladores

Por ahora el núcleo está copiado en cada app. El siguiente paso técnico es extraerlo a un paquete común (`@portalfirma/nucleo`) para que una corrección llegue a todas las apps a la vez.
