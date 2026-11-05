// Agente Portalfirma: conversa con el usuario y usa TODAS las herramientas del MCP de Portalfirma
// (las que publique el servidor, incluidas las que se agreguen en el futuro) a través de la sesión OAuth de Studio.
//
// Reglas de seguridad (se cumplen aquí, no dependen del modelo):
//  · Las consultas corren solas. Lo que cobra, envía o notifica espera la confirmación del usuario en Studio.
//  · La clave del certificado CDS y el código SMS/WhatsApp nunca pasan por el modelo: el usuario los escribe en
//    un campo protegido de la tarjeta de confirmación y Studio los entrega directo a Portalfirma. No se guardan.
//  · Los documentos no viajan al modelo: el usuario los adjunta y Studio los sube con ingest_document_tools.
//  · Cada acción queda en el registro de actividad (sin datos sensibles).
const store = require('./store');

const MAX_STEPS = 14; const MAX_RESULT = 14000;
const SECRETS = ['clave_certificado', 'segundo_factor'];
// Herramientas (o acciones) de solo lectura: corren sin preguntar
const READ_TOOLS = new Set(['get_partner_session', 'search_document_content', 'extract_signers_document_tools', 'process_detail_get_by_operation', 'operation_get_operation_by_rut', 'operation_get_operation_by_phone', 'property_manage_tools']);
const READ_ACTIONS = { wallet_manage_balance_tools: ['get_balance'], template_manage_tools: ['search', 'get_forms'], sign_documents_cds_massive_tools: ['list_pending'] };
const NO_CONFIRM = new Set(['ingest_document_tools']); // subir un documento adjuntado por el usuario no cobra ni envía

function needsConfirm(name, args, tool) {
  if (READ_TOOLS.has(name) || NO_CONFIRM.has(name)) return false;
  if (READ_ACTIONS[name]) return !READ_ACTIONS[name].includes(args.action);
  return !(tool?.annotations?.readOnlyHint === true); // herramienta nueva: se confirma salvo que el servidor diga que es de lectura
}
const secretsFor = (name, args) => (name === 'sign_documents_cds_massive_tools' ? (args.action === 'sign_documents' ? SECRETS : args.action === 'request_sign_code' ? ['clave_certificado'] : []) : []);

// Texto humano de cada acción (tarjeta de confirmación y registro)
const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
function describe(name, a) {
  const firm = (l) => (l || []).map((s) => `${s.fullName || s.rut}${s.alias ? ` (${s.alias})` : ''}${s.email ? ' · ' + s.email : ''}${s.phone ? ' · ' + s.phone : ''}`);
  switch (name) {
    case 'send_to_sign_document_tools': return { titulo: 'Enviar el documento a firmar', detalle: [`Pagador: ${a.email || '—'}`, `Trámite: ${a.document_config_id ? 'según el tipo de documento' : ({ none: 'sin trámite notarial', legalization: 'legalización', protocolization: 'protocolización' }[a.protocolization] || '—')}`, ...(a.code ? [`Código de descuento: ${a.code}`] : []), 'Firmantes (en este orden):', ...firm(a.signatories)], aviso: 'Se crea la operación, se genera el cobro y los firmantes reciben el enlace.' };
    case 'template_manage_tools': return { titulo: 'Generar el documento desde la plantilla y enviarlo a firmar', detalle: Object.entries(a.values || {}).slice(0, 30).map(([k, v]) => `${k}: ${v}`), aviso: 'Se cobra del saldo de la cuenta y se envía a los firmantes.' };
    case 'wallet_manage_balance_tools': return { titulo: `Recargar saldo por ${clp(a.amount)}`, detalle: [`Correo: ${a.email || '—'}`], aviso: 'Se genera un enlace de pago en Flow; el cobro ocurre solo si pagas.' };
    case 'operation_manage_signing_tools': return a.action === 'resend_signatory_to_sign' ? { titulo: 'Reenviar el enlace de firma', detalle: [`Contrato: ${a.contract_id}`, `Firmante: ${a.contractSignatoryId}`], aviso: 'El firmante recibe un nuevo correo.' }
      : a.action === 'update_signatory_data' ? { titulo: 'Cambiar el correo del firmante', detalle: [`Persona: ${a.person_id}`, `Nuevo correo: ${a.email}`] }
        : { titulo: `Cambiar el tipo de firma a «${a.typeSign}»`, detalle: [`Contrato: ${a.contract_id}`, `Firmante: ${a.contractSignatoryId}`] };
    case 'sign_documents_cds_massive_tools': return a.action === 'request_sign_code' ? { titulo: 'Pedir el código para firmar con el certificado', detalle: [`RUT: ${a.rut}`, `Operaciones: ${(a.operations || []).join(', ')}`], aviso: 'Se valida tu certificado y llega un código por SMS o WhatsApp.' }
      : { titulo: `Firmar ${(a.operations || []).length} operaciones con tu certificado`, detalle: [`RUT: ${a.rut}`, `Operaciones: ${(a.operations || []).join(', ')}`], aviso: 'La firma es definitiva y puede descontar saldo según la tarifa.' };
    default: return { titulo: `Ejecutar «${name}»`, detalle: Object.entries(a).filter(([k]) => !SECRETS.includes(k)).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`) };
  }
}

// Esquemas para el modelo: sin campos secretos y con la subida de documentos por nombre de adjunto
function forModel(t) {
  const p = JSON.parse(JSON.stringify(t.inputSchema || { type: 'object', properties: {} })); delete p.$schema;
  let description = t.description || '';
  if (t.name === 'ingest_document_tools') {
    return { name: t.name, description: 'Sube a Portalfirma un documento que el usuario adjuntó en Studio (PDF o Word) y devuelve su id (fileId) para extraer firmantes, buscar en él o enviarlo a firmar. Indica el nombre exacto del adjunto.', parameters: { type: 'object', properties: { archivo: { type: 'string', description: 'Nombre exacto del archivo adjunto.' }, ...(p.properties?.folder_id ? { folder_id: p.properties.folder_id } : {}) }, required: ['archivo'] } };
  }
  if (p.properties) for (const k of SECRETS) if (p.properties[k]) { delete p.properties[k]; p.required = (p.required || []).filter((x) => x !== k); description += ` La clave del certificado y el código SMS NO los envías tú: Studio se los pide al usuario en un campo protegido al confirmar.`; }
  return { name: t.name, description: description.slice(0, 1000), parameters: p };
}

const guia = require('./herramientas-guia');
function systemPrompt(ctx) {
  const H = require('./hora');
  return `Eres el Agente de PortalFirma Asset, el asistente del ejecutivo inmobiliario. Con las herramientas puedes hacer todo lo que la app hace con botones: cartera (asset_*), personas, negocios, agenda, órdenes de visita, Portal Inmobiliario y navegación, además de la firma electrónica de Portalfirma (subir documentos, firmantes, enviar a firmar, operaciones, plantillas, saldo, firma con certificado).
${H.contexto()} Escribe en español de Chile, breve y concreto. Fechas en AAAA-MM-DD y horas HH:MM al llamar herramientas («mañana», «el jueves» se calculan desde hoy).
Reglas:
- Haz las cosas, no expliques cómo hacerlas: si piden crear, agendar, mover o publicar, usa la herramienta. Encadena pasos (buscar → crear → agendar) sin pedir permiso para cada uno.
- Usa datos reales: busca antes de suponer. Nunca inventes ids, RUT, precios ni operaciones. Si una búsqueda devuelve varias opciones, pregunta cuál.
- Para propiedades, personas y negocios puedes pasar el código (CV-5514), el nombre o el RUT: las herramientas los resuelven.
- Si falta un dato obligatorio (por ejemplo, el RUT del visitante), pregúntalo en una sola pregunta.
- Si el usuario cuenta algo que pasó (una llamada, una visita, una oferta), usa asset_anotar: queda en el historial y la app le muestra botones con el siguiente paso. No agendes ni muevas etapas por tu cuenta en ese caso.
- Si pregunta cómo va una propiedad, usa asset_estado_propiedad.
- Datos del propietario: solo los ve el corredor que captó la propiedad y el administrador. Si una herramienta responde que no hay acceso o muestra «Reservado al captador», dilo tal cual y sugiere pedírselo al captador; nunca intentes obtenerlos de otra forma.
- Agendar ≠ documento: «agenda/coordina una visita» = asset_crear_evento (solo calendario). asset_orden_visita SOLO si piden la orden de visita (documento que cobra). Nunca generes un documento que no pidieron.
- Orden de visita: usa asset_orden_visita. Si la cuenta tiene formatos propios, sale con el formato de la corredora y los datos de la ficha y del CRM; si falta algo (correo o celular del visitante, venta o arriendo…) te lo dice: pide solo eso y vuelve a llamarla. Puede incluir varias propiedades (otras_propiedades). Firma solo el visitante; cobra del saldo y, si hay fecha, agenda la visita.
- Firmas: cada documento enviado queda con su número de operación y Asset lo sigue solo. Para saber cómo va usa asset_firmas_pendientes o asset_seguimiento_firma (con la operación o con la propiedad); nunca le pidas el número al usuario si puedes buscarlo. Los enlaces los envía Portalfirma: si alguien no ha firmado, ofrece reenviarlo (asset_reenviar_firma); si su correo o celular estaba malo, pide el dato correcto y usa asset_corregir_firmante. Nombra siempre a cada firmante con su calidad (arrendador, arrendatario, codeudor, mandante…).
- Mandato (de venta o de arriendo): si la cuenta tiene formatos propios, usa asset_preparar_formato → pide SOLO lo que falta, en una lista corta, y vuelve a llamarla con esos «datos» (quedan guardados) → cuando no falte nada, resume y asset_enviar_formato. Si responde que no hay formatos propios, sigue con asset_buscar_documento.
- Otros documentos (contratos de arriendo, promesas, corretaje, mandatos, actas de entrega, comprobantes…): primero asset_buscar_documento; si el usuario elige una plantilla → asset_formulario_documento (se llena solo con la ficha, las personas y los datos del corredor) → pide SOLO lo que falta, en una lista corta → asset_generar_documento con esos valores. Nunca inventes datos de un contrato (comisión, plazo, garantía): pregúntalos.
- Seguimiento de firmas: asset_seguimiento_firma; si el usuario quiere verlo en el panel, asset_abrir con pantalla «operaciones» y el número.
- Lo que cobra, publica afuera o no se puede deshacer pide confirmación al usuario en la app: arma la llamada completa. Si la cancela, no la repitas sin que te lo pida.
- Tras crear o cambiar algo, confirma en una línea qué quedó hecho (la app muestra el resultado al lado y propone el siguiente paso con botones). Usa asset_abrir solo si el usuario pide abrir una pantalla.
- Documentos: no lees archivos del computador; el usuario los adjunta y usas ingest_document_tools con el nombre del adjunto.${ctx.adjuntos.length ? ` Adjuntos: ${ctx.adjuntos.map((a) => `«${a.name}»${a.fileId ? ` (fileId ${a.fileId})` : ''}`).join(', ')}.` : ''}
- Operaciones de firma: rangos de fechas de máximo 366 días (por defecto, últimos 90 días).
- Firma con certificado CDS: nunca pidas la clave ni el código por el chat; la app los pide en un campo protegido.
- Muestra los enlaces de pago o de firma tal como vienen.${ctx.asset ? '\n' + guia.RUTEO : ''}${ctx.canal === 'whatsapp' ? `
CANAL WHATSAPP: el usuario te escribe desde su celular (texto o notas de voz transcritas). Responde corto (máximo 5 líneas), sin tablas ni títulos, sin markdown salvo *negrita*. No menciones botones, pantallas ni el lienzo. Lo que cobra o envía se confirma respondiendo SÍ o NO: arma la llamada completa y el sistema le pregunta. Si algo solo se puede hacer en la app (adjuntar archivos, fotos de Drive, firma con certificado), dilo en una línea.` : ''}${ctx.email ? `\n- El correo del usuario (pagador por defecto) es ${ctx.email}.` : ''}${ctx.persona || ''}`;
}

// ---------------------------------------------------------------- sesión de conversación
function crear({ pf, ai, emit, canal = 'app', filtro = null }) {
  const S = { messages: [], adjuntos: [], tools: null, pend: new Map(), busy: false, locales: [] };
  const log = (e) => { const l = store.get('agentLog') || []; l.unshift({ t: new Date().toISOString(), ...e }); store.set('agentLog', l.slice(0, 300)); };
  async function herramientas() { if (!S.tools) { try { S.tools = await pf.listTools(); } catch (e) { if (!S.locales.length) throw e; return []; } } return S.tools; } // sin sesión, quedan las de Asset
  const local = (name) => S.locales.find((t) => t.name === name);
  // Lo que el lienzo debe mostrar después de una acción (la firma, el negocio, la propiedad o el día de la agenda)
  function contextoDe(out, ef) {
    if (!out || typeof out !== 'object') return null;
    if (out.operacion && (out.firmantes || out.visitante)) return { tipo: 'operacion', op: out.operacion, propId: out.propiedad?.id || null };
    if (out.negocio?.id) return { tipo: 'negocio', id: out.negocio.id };
    if (out.propiedad?.id) return { tipo: 'propiedad', id: out.propiedad.id };
    if (out.evento?.fecha) return { tipo: 'agenda', fecha: out.evento.fecha, eventoId: out.evento.id };
    if (ef?.navegar?.id && ['propiedad', 'negocio'].includes(ef.navegar.pantalla)) return { tipo: ef.navegar.pantalla, id: ef.navegar.id };
    return null;
  }
  // Herramientas propias de Asset (propiedades, personas, negocios, agenda, órdenes de visita, portales, navegación)
  async function ejecutarLocal(t, args, id) {
    emit({ type: 'tool', id, name: t.name, args, estado: 'corriendo' });
    try {
      if (t.modo === 'confirmar') {
        let d; try { d = await t.preparar(args); } catch (e) { emit({ type: 'tool', id, name: t.name, estado: 'error', resumen: e.message.slice(0, 240) }); return { content: JSON.stringify({ error: e.message }) }; }
        emit({ type: 'confirm', id, name: t.name, args: Object.fromEntries(Object.entries(args).filter(([k]) => !k.startsWith('__'))), ...d, secretos: [] });
        const r = await esperar(id);
        if (!r.ok) { log({ tool: t.name, ok: false, resumen: 'Cancelado por el usuario' }); emit({ type: 'tool', id, name: t.name, estado: 'cancelado' }); return { content: JSON.stringify({ cancelado: true, mensaje: 'El usuario canceló esta acción.' }) }; }
      }
      const out = await t.run(args); const ef = out?.efectos; if (out) delete out.efectos;
      if (ef?.datos) emit({ type: 'datos', que: ef.datos });
      if (ef?.tarjeta) emit({ type: 'tarjeta', ...ef.tarjeta }); // la app muestra una tarjeta propia (p. ej. la ficha dictada para confirmar)
      if (ef?.navegar) emit({ type: 'navegar', ...ef.navegar, explicito: t.name === 'asset_abrir' });
      const cx = ef?.contexto || contextoDe(out, ef); if (cx) emit({ type: 'contexto', ...cx });
      if (Array.isArray(out?.sugerencias) && out.sugerencias.length) { S.sug = out.sugerencias; emit({ type: 'sugerencias', lista: out.sugerencias }); } // el siguiente paso, como botones
      if (t.modo !== 'leer') log({ tool: t.name, ok: true, resumen: t.description.split('.')[0] });
      S.usadas?.push(t.name);
      emit({ type: 'tool', id, name: t.name, estado: 'ok', resumen: '' });
      const txt = JSON.stringify(out ?? { ok: true });
      return { content: txt.length > MAX_RESULT ? txt.slice(0, MAX_RESULT) + '…' : txt };
    } catch (e) {
      emit({ type: 'tool', id, name: t.name, estado: 'error', resumen: e.message.slice(0, 240) });
      return { content: JSON.stringify({ error: e.message }) };
    }
  }
  function esperar(id) { return new Promise((resolve) => S.pend.set(id, resolve)); }
  function responder(id, r) { const f = S.pend.get(id); if (!f) return false; S.pend.delete(id); f(r || { ok: false }); return true; }

  async function ejecutar(tc, toolsByName) {
    const name = tc.function.name; let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
    if (local(name)) return ejecutarLocal(local(name), args, tc.id || ('t' + Date.now()));
    const tool = toolsByName[name];
    if (!tool) return { content: JSON.stringify({ error: `La herramienta «${name}» no existe.` }) };
    for (const k of SECRETS) delete args[k]; // aunque el modelo los mande, no se usan
    const id = tc.id || ('t' + Date.now());
    emit({ type: 'tool', id, name, args, estado: 'corriendo' });
    // subida del adjunto: Studio pone los bytes
    if (name === 'ingest_document_tools') {
      const a = S.adjuntos.find((x) => x.name === args.archivo) || (S.adjuntos.length === 1 ? S.adjuntos[0] : null);
      if (!a) { emit({ type: 'tool', id, name, estado: 'error', resumen: 'No hay un adjunto con ese nombre' }); return { content: JSON.stringify({ error: `No hay un adjunto llamado «${args.archivo}». Pide al usuario que lo adjunte.` }) }; }
      const real = { source: 'base64', base64: Buffer.from(a.bytes).toString('base64'), filename: a.name, ...(args.folder_id ? { folder_id: args.folder_id } : {}) };
      const r = await pf.callRaw(name, real);
      try { const j = JSON.parse(r.text); a.fileId = j.fileId || j.document_id || a.fileId; } catch {}
      log({ tool: name, ok: !r.isError, resumen: `Subió «${a.name}»` });
      emit({ type: 'tool', id, name, estado: r.isError ? 'error' : 'ok', resumen: r.isError ? r.text.slice(0, 200) : `Subido: ${a.name}` });
      return { content: r.text.slice(0, MAX_RESULT) };
    }
    let secretos = {};
    // no se le pide confirmar al usuario una acción a medio armar (p. ej. «Cambiar el tipo de firma a undefined»): vuelve al modelo
    if (needsConfirm(name, args, tool)) {
      const falta = (tool.inputSchema?.required || []).filter((k) => !SECRETS.includes(k) && (args[k] === undefined || args[k] === null || args[k] === ''));
      if (falta.length || /undefined/.test(JSON.stringify(describe(name, args)))) { emit({ type: 'tool', id, name, estado: 'error', resumen: 'Faltan datos' }); return { content: JSON.stringify({ error: `Faltan datos para «${name}»${falta.length ? ': ' + falta.join(', ') : ''}. Búscalos con las herramientas de consulta (p. ej. el contrato y el firmante con asset_seguimiento_firma) o pregúntalos al usuario; no pidas confirmar una acción incompleta.` }) }; }
    }
    if (needsConfirm(name, args, tool)) {
      const pide = secretsFor(name, args);
      emit({ type: 'confirm', id, name, args, ...describe(name, args), secretos: pide });
      const r = await esperar(id);
      if (!r.ok) { log({ tool: name, action: args.action, ok: false, resumen: 'Cancelado por el usuario' }); emit({ type: 'tool', id, name, estado: 'cancelado' }); return { content: JSON.stringify({ cancelado: true, mensaje: 'El usuario canceló esta acción.' }) }; }
      for (const k of pide) { if (!r.secretos?.[k]) { emit({ type: 'tool', id, name, estado: 'cancelado' }); return { content: JSON.stringify({ cancelado: true, mensaje: 'Faltó un dato protegido.' }) }; } secretos[k] = String(r.secretos[k]); }
    }
    const res = await pf.callRaw(name, { ...args, ...secretos });
    let text = res.text; for (const v of Object.values(secretos)) if (v) text = text.split(v).join('••••'); secretos = null;
    const d = describe(name, args);
    log({ tool: name, action: args.action, ok: !res.isError, resumen: res.isError ? 'Error: ' + text.slice(0, 160) : (needsConfirm(name, args, tool) ? d.titulo : 'Consulta') });
    emit({ type: 'tool', id, name, estado: res.isError ? 'error' : 'ok', resumen: res.isError ? text.slice(0, 240) : '' , url: (text.match(/https:\/\/[^\s"']+/) || [])[0] || null });
    return { content: text.length > MAX_RESULT ? text.slice(0, MAX_RESULT) + '\n…(resultado recortado)' : text };
  }

  async function enviar(texto, ctx = {}) {
    if (S.busy) throw new Error('El agente todavía está trabajando en el mensaje anterior.');
    S.busy = true; S.sug = null; S.usadas = [];
    try {
      ai.agentCheck();
      const all = await herramientas(); const byName = Object.fromEntries(all.map((t) => [t.name, t]));
      const ok = (n) => !filtro || filtro(n); // por WhatsApp no van las que necesitan la pantalla
      const mcp = (S.locales.length ? all.filter((t) => !guia.OCULTAS_EN_ASSET.has(t.name)) : all).filter((t) => ok(t.name)); // las de Portalfirma que duplican una de Asset no se muestran
      const tools = [...S.locales.filter((t) => ok(t.name)).map((t) => ({ name: t.name, description: guia.describir(t.name, t.description), parameters: t.parameters })), ...mcp.map(forModel).map((t) => ({ ...t, description: guia.describir(t.name, t.description) }))];
      const nuevos = S.adjuntos.filter((a) => !a.anunciado); nuevos.forEach((a) => (a.anunciado = true));
      S.messages.push({ role: 'user', content: String(texto) + (nuevos.length ? `\n(Adjunto: ${nuevos.map((a) => `«${a.name}»`).join(', ')})` : '') });
      let final = '';
      for (let i = 0; i < MAX_STEPS; i++) {
        const r = await ai.toolChat({ system: systemPrompt({ adjuntos: S.adjuntos, email: ctx.email, asset: S.locales.length > 0, canal, persona: ctx.persona || '' }), messages: S.messages, tools });
        const calls = (r.tool_calls || []).slice(0, 6);
        S.messages.push({ role: 'assistant', content: r.content || '', ...(calls.length ? { tool_calls: calls } : {}) });
        if (r.content && calls.length) emit({ type: 'nota', text: r.content });
        if (!calls.length) { final = r.content || ''; break; }
        for (const tc of calls) { const out = await ejecutar(tc, byName); S.messages.push({ role: 'tool', tool_call_id: tc.id, content: out.content }); }
        if (i === MAX_STEPS - 1) final = 'Me detuve porque la tarea necesitaba demasiados pasos. Dime cómo seguir.';
      }
      // la conversación no crece sin límite: se conservan los últimos ~40 mensajes, sin cortar una llamada de su resultado
      if (S.messages.length > 60) { let k = S.messages.length - 40; while (k < S.messages.length && S.messages[k].role !== 'user') k++; S.messages = S.messages.slice(k); }
      const tokens = ai.agentCharge();
      return { text: final, tokens, sugerencias: S.sug || null, herramientas: S.usadas || [] };
    } finally { S.busy = false; for (const [id] of S.pend) responder(id, { ok: false }); }
  }
  return {
    enviar, responder,
    adjuntar(name, bytes) { if (bytes.length > 20 * 1024 * 1024) throw new Error('El archivo supera los 20 MB que acepta Portalfirma.'); if (!/\.(pdf|docx?)$/i.test(name)) throw new Error('Adjunta un PDF o un Word.'); S.adjuntos = S.adjuntos.filter((a) => a.name !== name); S.adjuntos.push({ name, bytes: Buffer.from(bytes) }); return S.adjuntos.map((a) => ({ name: a.name, size: a.bytes.length, subido: !!a.fileId })); },
    quitar(name) { S.adjuntos = S.adjuntos.filter((a) => a.name !== name); return S.adjuntos.map((a) => ({ name: a.name, size: a.bytes.length, subido: !!a.fileId })); },
    reiniciar() { S.messages = []; S.adjuntos = []; S.tools = null; return true; },
    mensajes() { return S.messages.slice(); },
    restaurar(m) { if (S.busy) throw new Error('Espera a que el agente termine.'); S.messages = Array.isArray(m) ? m.slice() : []; S.adjuntos = []; return true; },
    async herramientas() { return [...S.locales.map((t) => ({ name: t.name, description: t.description, lectura: t.modo !== 'confirmar', asset: true })), ...(await herramientas()).map((t) => ({ name: t.name, description: t.description, lectura: !needsConfirm(t.name, {}, t) || !!READ_ACTIONS[t.name] }))]; },
    registrarLocales(l) { S.locales = l; },
    catalogo: async () => guia.catalogo(S.locales, await herramientas().catch(() => [])),
    // Los botones de la app usan las mismas herramientas que el agente (una sola lógica)
    async prepararLocal(name, args) { const t = local(name); if (!t) throw new Error('Herramienta desconocida: ' + name); return t.preparar ? t.preparar(args) : null; },
    async ejecutarLocal(name, args) { const t = local(name); if (!t) throw new Error('Herramienta desconocida: ' + name); if (t.preparar && !args.__orden) await t.preparar(args); const out = await t.run(args); if (out) delete out.efectos; if (t.modo !== 'leer') log({ tool: name, ok: true, resumen: t.description.split('.')[0] + ' (desde la app)' }); return out; },
    actividad: () => (store.get('agentLog') || []).slice(0, 100),
    _estado: () => S,
  };
}

module.exports = { crear, systemPrompt, needsConfirm, forModel, describe, _secretsFor: secretsFor };
