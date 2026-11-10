// Guía de herramientas del Agente (0.12.1): una sola fuente que dice, para cada herramienta, su dominio,
// CUÁNDO usarla y para qué NO (y cuál usar en su lugar). Se agrega a la descripción que ve el modelo, arma la tabla
// de ruteo del prompt y genera el catálogo (docs/herramientas-agente.md) para conectar cada una a WhatsApp.
// canal: 'chat-y-whatsapp' = sirve tal cual por WhatsApp; 'solo-app' = necesita la pantalla (botones, selector de archivos…).
const GUIA = {
  // ---------------- consultas ----------------
  asset_resumen: { dominio: 'CONSULTAS', cuando: 'el usuario pregunta qué tiene hoy, cómo va su día o pide un resumen general', no: 'una propiedad puntual (asset_estado_propiedad)', canal: 'chat-y-whatsapp' },
  asset_buscar_propiedades: { dominio: 'PROPIEDADES', cuando: 'hay que encontrar propiedades por texto o filtros (comuna, tipo, precio, operación)', no: 'ver el detalle de una ya identificada (asset_ver_propiedad)', canal: 'chat-y-whatsapp' },
  asset_ver_propiedad: { dominio: 'PROPIEDADES', cuando: 'se necesita la ficha completa de una propiedad (datos, personas, documentos, portal)', no: 'saber «cómo va» comercialmente (asset_estado_propiedad)', canal: 'chat-y-whatsapp' },
  asset_estado_propiedad: { dominio: 'PROPIEDADES', cuando: 'preguntan cómo va una propiedad: negocios, etapa, lo último que pasó y próximas visitas', no: 'ver o editar datos de la ficha', canal: 'chat-y-whatsapp' },
  asset_buscar_personas: { dominio: 'PERSONAS', cuando: 'hay que encontrar a alguien del CRM por nombre, RUT o correo', no: 'crear una persona nueva (asset_crear_persona)', canal: 'chat-y-whatsapp' },
  asset_ver_persona: { dominio: 'PERSONAS', cuando: 'se necesitan los datos de una persona, sus propiedades, negocios y eventos', canal: 'chat-y-whatsapp' },
  asset_listar_negocios: { dominio: 'NEGOCIOS', cuando: 'preguntan por los negocios abiertos, atrasados o de un tipo', canal: 'chat-y-whatsapp' },
  asset_ver_negocio: { dominio: 'NEGOCIOS', cuando: 'se necesita el detalle de un negocio (etapas, tareas, firmas, historial)', canal: 'chat-y-whatsapp' },
  asset_agenda: { dominio: 'AGENDA', cuando: 'preguntan qué hay agendado en un rango de fechas', no: 'agendar algo nuevo (asset_crear_evento)', canal: 'chat-y-whatsapp' },
  asset_interesados: { dominio: 'PORTALES', cuando: 'preguntan por interesados llegados desde los portales', canal: 'chat-y-whatsapp' },
  asset_bandeja_interesados: { dominio: 'PORTALES', cuando: 'quieren la bandeja de interesados de todos los portales por estado', canal: 'chat-y-whatsapp' },
  asset_rendimiento_avisos: { dominio: 'PORTALES', cuando: 'preguntan cómo van los avisos (visitas, contactos, calidad, recomendaciones)', canal: 'chat-y-whatsapp' },
  // ---------------- propiedades ----------------
  asset_dictar_propiedad: { dominio: 'PROPIEDADES', cuando: 'el usuario quiere SUBIR, CAPTAR o CREAR una propiedad y la describe (o dicta, o pega una descripción): «capté un depto en…», «sube esta propiedad: …»', no: 'cambiar una propiedad que ya existe (asset_actualizar_propiedad)', canal: 'chat-y-whatsapp' },
  asset_crear_propiedad: { dominio: 'PROPIEDADES', cuando: 'SOLO para guardar una propiedad cuyos datos el usuario ya revisó y confirmó (después de asset_dictar_propiedad, por WhatsApp)', no: 'subir o captar una propiedad nueva desde una descripción (asset_dictar_propiedad)', canal: 'chat-y-whatsapp' },
  asset_actualizar_propiedad: { dominio: 'PROPIEDADES', cuando: 'cambian datos de una propiedad existente: precio, metros, descripción, dirección…', no: 'cambiar si está disponible, reservada, vendida o arrendada (asset_cambiar_estado)', canal: 'chat-y-whatsapp' },
  asset_cambiar_estado: { dominio: 'PROPIEDADES', cuando: 'una propiedad pasa a disponible, reservada, vendida, arrendada o no disponible', no: 'mover la etapa de un negocio (asset_mover_negocio)', canal: 'chat-y-whatsapp' },
  asset_fotos_drive: { dominio: 'PROPIEDADES', cuando: 'quieren cargar las fotos de una propiedad desde Google Drive', canal: 'solo-app' },
  asset_anotar: { dominio: 'PROPIEDADES', cuando: 'el usuario CUENTA algo que pasó con una propiedad o cliente: llamó, visitó, ofertó, mandó documentos', no: 'agendar algo a futuro (asset_crear_evento) ni dejar una nota interna sin hecho (asset_nota)', canal: 'chat-y-whatsapp' },
  asset_nota: { dominio: 'PERSONAS', cuando: 'piden dejar una nota interna en una persona o un negocio («anota que prefiere que lo llamen en la tarde»)', no: 'contar algo que pasó con una propiedad (asset_anotar)', canal: 'chat-y-whatsapp' },
  // ---------------- personas ----------------
  asset_crear_persona: { dominio: 'PERSONAS', cuando: 'hay que agregar una persona nueva al CRM (necesita el nombre; el RUT es opcional)', no: 'un interesado que llegó por un portal, Instagram o un referido (asset_crear_lead) ni buscar a alguien que puede existir (asset_buscar_personas primero)', canal: 'chat-y-whatsapp' },
  asset_vincular_persona: { dominio: 'PERSONAS', cuando: 'una persona del CRM pasa a ser propietario, arrendatario, comprador, codeudor o interesado de una propiedad', canal: 'chat-y-whatsapp' },
  // ---------------- negocios ----------------
  asset_crear_negocio: { dominio: 'NEGOCIOS', cuando: 'empieza un negocio de venta o arriendo entre una propiedad y un cliente', canal: 'chat-y-whatsapp' },
  asset_mover_negocio: { dominio: 'NEGOCIOS', cuando: 'piden pasar un negocio a otra etapa (visita, reserva, evaluación, contrato, entrega…)', no: 'cambiar el estado comercial de la propiedad (asset_cambiar_estado)', canal: 'chat-y-whatsapp' },
  asset_tarea_negocio: { dominio: 'NEGOCIOS', cuando: 'marcan o desmarcan una tarea de la etapa actual del negocio', canal: 'chat-y-whatsapp' },
  asset_proxima_accion: { dominio: 'NEGOCIOS', cuando: 'definen qué hay que hacer después en un negocio y para cuándo', canal: 'chat-y-whatsapp' },
  asset_vincular_firma: { dominio: 'NEGOCIOS', cuando: 'ligan una operación de firma ya existente a la etapa actual de un negocio', canal: 'chat-y-whatsapp' },
  asset_cerrar_negocio: { dominio: 'NEGOCIOS', cuando: 'un negocio se gana o se pierde', canal: 'chat-y-whatsapp' },
  // ---------------- agenda ----------------
  asset_crear_evento: { dominio: 'AGENDA', cuando: 'piden agendar o coordinar una visita, reunión, firma, llamada o tarea (solo calendario, sin documentos)', no: 'la ORDEN de visita, que es un documento a firmar (asset_orden_visita)', canal: 'chat-y-whatsapp' },
  asset_actualizar_evento: { dominio: 'AGENDA', cuando: 'reprograman, cancelan o marcan como hecho un evento', canal: 'chat-y-whatsapp' },
  // ---------------- documentos y firma ----------------
  asset_crear_lead: { dominio: 'LEADS', cuando: 'piden registrar o anotar un lead o interesado nuevo (llegó por Instagram, un portal, un referido o el teléfono), aunque no tenga RUT; no le escribe al cliente', no: 'alguien que ya es cliente u operación del CRM (asset_crear_persona) o un lead que ya existe (asset_interesados)', canal: 'chat-y-whatsapp' },
  asset_revisar_orden_visita: { dominio: 'DOCUMENTOS', cuando: 'piden PREPARAR, dejar lista o revisar la orden de visita ANTES de enviarla (no envía, no cobra, no agenda)', no: 'piden enviarla o mandarla a firmar (asset_orden_visita)', canal: 'chat-y-whatsapp' },
  asset_orden_visita: { dominio: 'DOCUMENTOS', cuando: 'piden explícitamente la ORDEN DE VISITA (el documento que firma el visitante; cobra)', no: 'solo agendar la visita (asset_crear_evento)', canal: 'chat-y-whatsapp' },
  asset_preparar_formato: { dominio: 'DOCUMENTOS', cuando: 'piden el MANDATO (de venta o de arriendo) de una propiedad y la cuenta tiene formatos propios: revisa qué ya está y qué falta', no: 'otros documentos (asset_buscar_documento) ni la orden de visita (asset_orden_visita)', canal: 'chat-y-whatsapp' },
  asset_enviar_formato: { dominio: 'DOCUMENTOS', cuando: 'el mandato ya está completo (asset_preparar_formato sin faltantes) y el usuario quiere enviarlo a firmar', canal: 'chat-y-whatsapp' },
  asset_firmas_pendientes: { dominio: 'FIRMAS', cuando: 'preguntan qué falta por firmar, quién no ha firmado, o hay que hacer seguimiento de las firmas en curso', no: 'una operación puntual ya conocida (asset_seguimiento_firma)', canal: 'chat-y-whatsapp' },
  asset_reenviar_firma: { dominio: 'FIRMAS', cuando: 'hay que mandar de nuevo el enlace de firma a alguien que no ha firmado (lo envía Portalfirma)', no: 'corregir un correo o celular malo (asset_corregir_firmante)', canal: 'chat-y-whatsapp' },
  asset_corregir_firmante: { dominio: 'FIRMAS', cuando: 'a un firmante no le llegó el enlace porque su correo o celular estaba malo: se corrige en Portalfirma y en el CRM y se reenvía', canal: 'chat-y-whatsapp' },
  asset_coordinar_visita: { dominio: 'AGENDA', cuando: 'piden CONTACTAR a alguien para que agende una visita («escríbele a Juan para que agende», «coordina la visita con Ana»): le escribe por WhatsApp y Sofía (la asistente de leads) le ofrece horarios y la agenda', no: 'agendar con día y hora ya definidos (asset_crear_evento)', canal: 'chat-y-whatsapp' },
  asset_buscar_documento: { dominio: 'DOCUMENTOS', cuando: 'piden cualquier otro documento por su nombre (contrato, comprobante, recibo, acta, carta, mandato…): busca la plantilla y, si no hay, ofrece crearlo', no: 'la orden de visita (asset_orden_visita)', canal: 'chat-y-whatsapp' },
  asset_plantillas: { dominio: 'DOCUMENTOS', cuando: 'quieren ver la lista de plantillas disponibles', no: 'pedir un documento por su nombre (asset_buscar_documento)', canal: 'chat-y-whatsapp' },
  asset_formulario_documento: { dominio: 'DOCUMENTOS', cuando: 'ya se eligió una plantilla y hay que ver qué datos tiene y cuáles faltan', canal: 'chat-y-whatsapp' },
  asset_generar_documento: { dominio: 'DOCUMENTOS', cuando: 'el formulario de la plantilla está completo y hay que generarlo y enviarlo a firmar (cobra)', canal: 'chat-y-whatsapp' },
  asset_seguimiento_firma: { dominio: 'FIRMAS', cuando: 'preguntan cómo va una firma o quién falta: con el número de operación o con la propiedad', canal: 'chat-y-whatsapp' },
  // ---------------- portales y app ----------------
  asset_publicar_portal: { dominio: 'PORTALES', cuando: 'piden publicar una propiedad en Portal Inmobiliario', canal: 'chat-y-whatsapp' },
  asset_aviso_portal: { dominio: 'PORTALES', cuando: 'piden pausar, reactivar, actualizar o finalizar un aviso ya publicado', canal: 'chat-y-whatsapp' },
  asset_sincronizar_portal: { dominio: 'PORTALES', cuando: 'piden traer el estado de los avisos o los interesados nuevos del portal', canal: 'chat-y-whatsapp' },
  asset_abrir: { dominio: 'APP', cuando: 'el usuario pide ABRIR o VER una pantalla de la app', no: 'responder una pregunta (usa la consulta que corresponda)', canal: 'solo-app' },
  // ---------------- Portalfirma (firma electrónica) ----------------
  ingest_document_tools: { dominio: 'FIRMAS', cuando: 'el usuario ADJUNTÓ un archivo para enviarlo a firmar', no: 'documentos de una propiedad (asset_buscar_documento)', canal: 'solo-app' },
  extract_signers_document_tools: { dominio: 'FIRMAS', cuando: 'después de subir un adjunto, para detectar sus firmantes', canal: 'solo-app' },
  send_to_sign_document_tools: { dominio: 'FIRMAS', cuando: 'enviar a firmar un ADJUNTO ya subido (cobra)', no: 'documentos de plantillas o creados por Asset (asset_generar_documento / asset_buscar_documento)', canal: 'solo-app' },
  search_document_content: { dominio: 'FIRMAS', cuando: 'buscar texto dentro de un adjunto ya subido', canal: 'solo-app' },
  process_detail_get_by_operation: { dominio: 'FIRMAS', cuando: 'piden el detalle técnico de una operación', no: 'saber quién falta por firmar en documentos de propiedades (asset_seguimiento_firma)', canal: 'chat-y-whatsapp' },
  operation_get_operation_by_rut: { dominio: 'FIRMAS', cuando: 'buscar operaciones de firma por RUT en un rango de fechas', canal: 'chat-y-whatsapp' },
  operation_get_operation_by_phone: { dominio: 'FIRMAS', cuando: 'buscar operaciones de firma por teléfono en un rango de fechas', canal: 'chat-y-whatsapp' },
  operation_manage_signing_tools: { dominio: 'FIRMAS', cuando: 'reenviar el enlace de firma, corregir datos de un firmante o cambiar el tipo de firma', canal: 'chat-y-whatsapp' },
  sign_documents_cds_massive_tools: { dominio: 'FIRMAS', cuando: 'firmar documentos pendientes con certificado CDS (la clave la pide la app)', canal: 'solo-app' },
  wallet_manage_balance_tools: { dominio: 'CUENTA', cuando: 'preguntan el saldo o quieren recargar', canal: 'chat-y-whatsapp' },
  get_partner_session: { dominio: 'CUENTA', cuando: 'se necesitan los datos de la empresa de la sesión', canal: 'chat-y-whatsapp' },
};
// Herramientas de Portalfirma que en Asset duplican una propia: no se muestran al modelo (confundían al agente)
const OCULTAS_EN_ASSET = new Set(['property_manage_tools', 'template_manage_tools']);

function describir(name, original) {
  const g = GUIA[name]; if (!g) return original;
  const base = String(original || '').trim().replace(/\s+/g, ' ');
  return `[${g.dominio}] ${base} USAR cuando ${g.cuando}.${g.no ? ` NO usar para ${g.no}.` : ''}`.slice(0, 1000);
}
// tabla de ruteo para el prompt: los casos que el agente confundía
const RUTEO = `Cómo elegir la herramienta (en caso de duda, esta tabla manda):
- Describe una propiedad para subirla o captarla («capté un depto…», «sube esta propiedad…», un texto largo con dormitorios, metros, precio) → asset_dictar_propiedad. NUNCA asset_crear_propiedad directo.
- Cambia datos de una propiedad que ya existe → asset_actualizar_propiedad. Cambia si está disponible/reservada/vendida/arrendada → asset_cambiar_estado.
- Cuenta algo que YA pasó (llamó, visitó, ofertó) → asset_anotar. Nota interna sobre una persona o negocio → asset_nota.
- Agendar/coordinar una visita → asset_crear_evento. La ORDEN de visita (documento): «prepárala / déjala lista / para revisarla» → asset_revisar_orden_visita (no envía); «envíala / mándala a firmar» → asset_orden_visita (envía y cobra). Nunca ambos si no lo piden.
- Registrar un lead o interesado nuevo (Instagram, portal, referido), aunque no tenga RUT → asset_crear_lead. El RUT nunca es obligatorio para un lead.
- Cualquier otro documento por su nombre → asset_buscar_documento (y el usuario elige con los botones).
- Pregunta cómo va una propiedad → asset_estado_propiedad. Qué tengo hoy → asset_resumen. Quién falta por firmar → asset_seguimiento_firma.
- Fotos desde Google Drive → asset_fotos_drive.
- Un archivo ADJUNTO para firmar → ingest_document_tools → extract_signers_document_tools → send_to_sign_document_tools.`;

function catalogo(locales, mcp = []) {
  const filas = [...locales.map((t) => ({ name: t.name, modo: t.modo, d: t.description })), ...mcp.filter((t) => !OCULTAS_EN_ASSET.has(t.name)).map((t) => ({ name: t.name, modo: 'portalfirma', d: t.description }))];
  const por = {}; for (const f of filas) { const g = GUIA[f.name] || { dominio: 'OTRAS', cuando: '—', canal: '—' }; (por[g.dominio] ||= []).push({ ...f, g }); }
  const orden = ['PROPIEDADES', 'PERSONAS', 'NEGOCIOS', 'AGENDA', 'DOCUMENTOS', 'FIRMAS', 'PORTALES', 'CONSULTAS', 'CUENTA', 'APP', 'OTRAS'];
  let md = '# Herramientas del Agente de PortalFirma Asset\n\nGenerado desde `src/herramientas-guia.js`. «Canal» indica si la herramienta sirve tal cual por WhatsApp o necesita la pantalla de la app.\n';
  for (const d of orden) { if (!por[d]) continue; md += `\n## ${d[0] + d.slice(1).toLowerCase()}\n\n| Herramienta | Modo | Usar cuando | No usar para | Canal |\n|---|---|---|---|---|\n`;
    for (const f of por[d]) md += `| \`${f.name}\` | ${f.modo} | ${f.g.cuando} | ${f.g.no || '—'} | ${f.g.canal} |\n`; }
  return md + '\n' + RUTEO.replace(/^/gm, '') + '\n';
}

module.exports = { GUIA, OCULTAS_EN_ASSET, describir, RUTEO, catalogo };
