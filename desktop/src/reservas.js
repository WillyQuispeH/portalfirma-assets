// Calendario de reservas de wechatia (plataforma tipo GoHighLevel / LeadConnector).
// El corredor reserva la visita en el widget dentro de Asset; con la clave de la API, Asset trae las reservas a su agenda,
// las liga a la propiedad, el cliente y el negocio (hito «Visita») y sigue los cambios: reprogramaciones y cancelaciones.
const V2 = 'https://services.leadconnectorhq.com';
const V1 = 'https://rest.gohighlevel.com/v1';
const WIDGET = 'https://api.wechatia.com/widget/booking/';
const WIDGET_DEF = 'FAVeve4zF30S3J9Mv6od';
const FUENTE = 'wechatia';
const err = (m, code) => Object.assign(new Error(m), code ? { code } : {});
const dig = (t) => String(t || '').replace(/\D/g, '').slice(-9); // los 9 dígitos finales del celular chileno
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// fecha y hora locales de Chile para un instante
function local(t) {
  const d = new Date(typeof t === 'number' || /^\d+$/.test(String(t)) ? Number(t) : t); if (isNaN(d)) return { fecha: null, hora: null };
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (k) => f.find((x) => x.type === k)?.value; return { fecha: `${g('year')}-${g('month')}-${g('day')}`, hora: `${g('hour')}:${g('minute')}` };
}
const widgetId = (x) => { const s = String(x || '').trim(); const m = s.match(/widget\/booking\/([A-Za-z0-9_-]+)/) || s.match(/^([A-Za-z0-9_-]{12,40})$/); return m ? m[1] : null; };

function crear({ store, inmo, agenda, est, mock = false, fetchFn = (...a) => fetch(...a) }) {
  const token = () => store.getSecret('wechatiaToken') || null;
  const cfg = () => store.get('wechatia') || {};
  const esV1 = (t) => /^eyJ/.test(t || ''); // las claves antiguas de ubicación (v1) son JWT; las nuevas son «pit-…»

  async function http(url, { version, tk = token() } = {}) {
    if (mock) return mockHttp(url);
    const r = await fetchFn(url, { headers: { Authorization: `Bearer ${tk}`, Accept: 'application/json', ...(version ? { Version: version } : {}) }, signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) throw err('wechatia rechazó la clave (o no tiene permiso para calendarios y contactos). Revísala en Configuración > Integraciones privadas.', 'CLAVE');
    if (!r.ok) { throw err(`wechatia: ${Array.isArray(j.message) ? j.message.join(' ') : j.message || j.msg || 'HTTP ' + r.status}`); }
    return j;
  }
  // ---------- simulación para pruebas (PF_MOCK) ----------
  function mockHttp(url) {
    const M = (global.__resMock ||= { eventos: [], contactos: {} });
    if (/\/calendars\/events/.test(url)) return { events: M.eventos };
    if (/\/calendars\/[^/?]+$/.test(url.split('?')[0])) return { calendar: { id: cfg().widget || WIDGET_DEF, name: 'Visita', locationId: 'loc-demo' } };
    const c = url.match(/\/contacts\/([^/?]+)/); if (c) return { contact: M.contactos[c[1]] || {} };
    return {};
  }

  // API general de wechatia (conversaciones de WhatsApp para la postventa): GET/POST con la misma clave
  // 0.16.20 · todo lo que Asset envía por WhatsApp queda anotado (id del mensaje): así el asistente no lo confunde con
  // un mensaje escrito a mano por el corredor (eso lo pausaba 12 horas y dejaba de responder)
  const anotarPropio = (id) => { if (!id) return; const l = store.get('waPropiosIds') || []; l.push(String(id)); store.set('waPropiosIds', l.slice(-400)); };
  async function api(method, path, opts = {}) { const r = await api0(method, path, opts); if (method === 'POST' && path === '/conversations/messages') anotarPropio(r?.messageId || r?.id || r?.message?.id); return r; }
  async function api0(method, path, opts = {}) { const { body, version = '2021-04-15' } = opts;
    if (mock) { try { return mockApi(method, path, body); } catch (e) { if (e.code === 'CLAVE' && opts.permiso) throw err(opts.permiso, 'CLAVE'); throw e; } }
    const tk = opts.tk || store.getSecret('wechatiaWaToken') || token(); if (!tk) throw err('Pega la clave de WhatsApp en Postventa › WhatsApp (o conecta wechatia en Agendar › Calendario de reservas).', 'SIN_CLAVE');
    const r = await fetchFn(V2 + path, { method, headers: { Authorization: `Bearer ${tk}`, Accept: 'application/json', 'Content-Type': 'application/json', Version: version }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) throw err(opts.permiso || 'wechatia rechazó la clave para conversaciones. Agrega a la integración privada los permisos de conversaciones y mensajes (ver y enviar).', 'CLAVE');
    if (!r.ok) { if (opts.raw) return { _status: r.status, ...j }; throw err(`wechatia: ${Array.isArray(j.message) ? j.message.join(' ') : j.message || j.msg || 'HTTP ' + r.status}`); }
    return j;
  }
  // simulación de WhatsApp: global.__waMock = { convs:[{id, contactId, phone, fullName}], msgs:{[convId]:[{id, direction, body, attachments, dateAdded}]}, enviados:[] }
  function mockApi(method, path, body) {
    const W = (global.__waMock ||= { convs: [], msgs: {}, enviados: [] });
    W.contactos ||= [];
    if (/^\/contacts/.test(path) && W.sinPermisoContactos && method === 'POST') throw err('sin permiso', 'CLAVE');
    if (method === 'GET' && /^\/contacts\/search\/duplicate/.test(path)) { const n = decodeURIComponent(path.match(/number=([^&]+)/)?.[1] || '').replace(/\D/g, ''); const c = [...W.convs.map((x) => ({ id: x.contactId, phone: x.phone })), ...W.contactos].find((x) => String(x.phone || '').replace(/\D/g, '') === n); return { contact: c || null }; }
    if (method === 'POST' && path === '/contacts/') { const c = { id: 'kn' + (W.contactos.length + 1), phone: body.phone, name: body.name }; W.contactos.push(c); return { contact: c }; }
    W.plantillas ||= []; W.citas ||= [];
    const ca = path.match(/^\/calendars\/(?:events\/)?appointments\/([^/?]+)(\/notes)?$/); if (ca && (method === 'PUT' || method === 'POST')) { if (W.sinPermisoCitas) throw err('sin permiso', 'CLAVE'); W.citas.push({ id: ca[1], method, nota: !!ca[2], body }); return { id: ca[1] }; }
    if (method === 'GET' && /^\/locations\/[^/]+\/customFields/.test(path)) { if (W.sinPermisoCampos) throw err('sin permiso', 'CLAVE'); return { customFields: ['remitente', 'motivo', 'propiedad', 'fecha', 'hora', 'documento', 'enlace'].map((k) => ({ id: 'cf_' + k, fieldKey: 'contact.asset_' + k, name: 'Asset ' + k })) }; }
    const pc = path.match(/^\/contacts\/([^/?]+)$/); if (method === 'PUT' && pc) { W.plantillas.push({ contactId: pc[1], campos: body.customFields }); return { contact: { id: pc[1] } }; }
    const pt = path.match(/^\/contacts\/([^/?]+)\/tags$/); if (method === 'POST' && pt) { const u = [...W.plantillas].reverse().find((x) => x.contactId === pt[1]); if (u) u.tags = body.tags; return { tags: body.tags }; }
    const mm = path.match(/^\/conversations\/messages\/([^/?]+)$/); if (method === 'GET' && mm) return { message: W.fallarDetalle ? { id: mm[1], status: 'failed', meta: { error: W.fallarDetalle } } : W.fallar24h ? { id: mm[1], status: 'failed', meta: { error: 'Message failed to send because more than 24 hours have passed since the customer last replied to this number.' } } : { id: mm[1], status: 'delivered' } };
    if (method === 'GET' && /^\/users\//.test(path)) return { users: W.usuarios || [] };
    if (method === 'GET' && /^\/conversations\/search/.test(path)) return { conversations: W.convs.map((c) => ({ ...c, lastMessageDate: Date.now() })) };
    const m = path.match(/^\/conversations\/([^/?]+)\/messages/); if (method === 'GET' && m) return { messages: { messages: [...(W.msgs[m[1]] || [])].reverse() } };
    if (method === 'POST' && path === '/conversations/messages') { const c = W.convs.find((x) => x.contactId === body.contactId); const msg = { id: 'out' + (W.enviados.length + 1), direction: 'outbound', body: body.message, dateAdded: new Date().toISOString(), userId: 'u-integracion' }; /* como wechatia: lo enviado por la API lleva el usuario de la integración */ W.enviados.push({ ...body }); if (c) (W.msgs[c.id] ||= []).push(msg); return { messageId: msg.id }; }
    return {};
  }
  const locationId = () => cfg().locationId || null;
  // WhatsApp directo desde Asset por la cuenta de wechatia: busca (o crea) el contacto por su celular, envía y revisa la entrega.
  // WhatsApp solo deja escribir texto libre si la persona escribió en las últimas 24 h; si no, Meta exige una plantilla aprobada.
  // ¿la persona le escribió al número de la empresa en las últimas 24 h? (si no, WhatsApp rechaza el texto libre)
  // estado de un mensaje ya enviado (para revisar después si Meta lo rechazó)
  async function estadoMensaje(messageId) { try { const m = (await api('GET', `/conversations/messages/${messageId}`)).message || {}; return { estado: String(m.status || '').toLowerCase(), detalle: String(m.meta?.error || m.error || m.errorMessage || '') }; } catch { return null; } }
  async function ventana24(contactId) {
    try {
      const j = await api('GET', `/conversations/search?locationId=${encodeURIComponent(locationId() || '')}&contactId=${encodeURIComponent(contactId)}`);
      const c = (j.conversations || []).find((x) => x.contactId === contactId); if (!c) return false;
      const ms = (await api('GET', `/conversations/${c.id}/messages?limit=30`)).messages?.messages || [];
      const lim = Date.now() - 24 * 36e5 + 5 * 6e4; // 5 min de margen
      return ms.some((m) => m.direction === 'inbound' && new Date(m.dateAdded).getTime() > lim);
    } catch { return null; } // no se pudo saber: se intenta igual
  }
  async function contacto(telefono, nombre) {
    const loc = locationId(); if (!loc) throw err('Falta conectar el WhatsApp de wechatia (Postventa › WhatsApp: clave y cuenta).', 'SIN_CLAVE');
    let d = String(telefono || '').replace(/\D/g, ''); if (d.length === 8) d = '569' + d; else if (d.length === 9) d = '56' + d; if (d.length < 10) throw err('El celular no es válido.');
    const e164 = '+' + d; const PERM = 'La clave de wechatia no tiene permiso para ver o crear contactos. En wechatia › Configuración › Integraciones Privado › «PortalFirma Asset - Postventa», agrega «Ver contactos» y «Editar contactos».';
    const dup = await api('GET', `/contacts/search/duplicate?locationId=${encodeURIComponent(loc)}&number=${encodeURIComponent(e164)}`, { version: '2021-07-28', permiso: PERM });
    let contactId = dup.contact?.id || null; let creado = false;
    if (!contactId) {
      const [first, ...rest] = String(nombre || '').trim().split(/\s+/);
      const c = await api('POST', '/contacts/', { version: '2021-07-28', permiso: PERM, raw: true, body: { locationId: loc, phone: e164, ...(first ? { firstName: first, lastName: rest.join(' ') || undefined, name: String(nombre).trim() } : {}), source: 'PortalFirma Asset' } });
      contactId = c.contact?.id || c.meta?.contactId || c.contactId || null; creado = !!c.contact?.id;
      if (!contactId) throw err(`wechatia no pudo crear el contacto: ${c.message || 'error ' + (c._status || '')}`);
    }
    return { contactId, creado, loc };
  }
  // 0.16.18 · no repetir: el mismo texto al mismo número dentro de 15 minutos no se vuelve a mandar (antes un error
  // hacía que el agente reintentara y la persona recibía el mismo mensaje varias veces)
  const recientes = new Map();
  const claveEnvio = (tel, tx) => String(tel || '').replace(/\D/g, '').slice(-9) + '|' + String(tx || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 300);
  async function enviarWhatsApp({ telefono, nombre, texto, esperar = mock ? 0 : 4000, revisar24 = false, entranteLocal = null }) {
    const kE = claveEnvio(telefono, texto); const prev = recientes.get(kE);
    if (prev && Date.now() - prev.t < 15 * 6e4) { if (prev.error) throw prev.error; return { ...prev.r, duplicado: true }; }
    const { contactId, creado } = await contacto(telefono, nombre);
    // ventana de 24 h: si wechatia no la pudo confirmar, se mira lo que Asset tiene registrado; sin evidencia de que escribió, se trata como cerrada
    let v24 = revisar24 ? await ventana24(contactId) : true; if (v24 === null) v24 = !!(entranteLocal && entranteLocal());
    if (revisar24 && v24 === false) { const e = err('Fuera de la ventana de 24 horas de WhatsApp: esa persona no le ha escrito al número de la empresa en las últimas 24 h, y en ese caso WhatsApp no deja enviar texto libre (solo plantillas aprobadas por Meta).'); e.code = 'FUERA_24H'; throw e; }
    const env = await api('POST', '/conversations/messages', { body: { type: 'WhatsApp', contactId, message: texto }, permiso: 'La clave de wechatia no tiene permiso para enviar mensajes. Agrega «Editar mensajes de conversaciones» a la integración privada.' });
    const messageId = env.messageId || env.id || null; let estado = 'enviado'; let detalle = '';
    if (messageId && esperar >= 0) {
      // Meta puede rechazarlo unos segundos después: se revisa varias veces hasta que quede entregado o fallido
      for (let i = 0; i < (revisar24 && !mock ? 4 : 1); i++) {
        await new Promise((r) => setTimeout(r, esperar));
        try { const m = (await api('GET', `/conversations/messages/${messageId}`)).message || {}; const st = String(m.status || '').toLowerCase();
          if (['failed', 'undelivered', 'error'].includes(st)) { estado = 'fallido'; detalle = String(m.meta?.error || m.error || m.errorMessage || m.meta?.errorMessage || ''); break; }
          if (st) estado = st; if (['delivered', 'read'].includes(st)) break; } catch {}
      }
    }
    if (estado === 'fallido') {
      const v24 = /24|window|session|template|plantilla|re-engagement|131047|470/i.test(detalle) || !detalle;
      const eF = err(v24 ? 'WhatsApp no entregó el mensaje: la persona no ha escrito a tu número en las últimas 24 horas y, en ese caso, WhatsApp solo permite enviar una plantilla aprobada por Meta. Envíalo esta vez desde tu WhatsApp; cuando Meta apruebe la plantilla «confirmacion_visita», la confirmación de las citas saldrá sola desde wechatia.' : `WhatsApp no entregó el mensaje: ${detalle}`, v24 ? 'FUERA_24H' : 'NO_ENTREGADO');
      recientes.set(kE, { t: Date.now(), error: eF }); throw eF;
    }
    const res = { contactId, creado, messageId, conversationId: env.conversationId || null, estado }; recientes.set(kE, { t: Date.now(), r: res });
    return res;
  }
  // 0.16.5 · Plantillas aprobadas por Meta (fuera de las 24 h): Asset llena los campos «asset_*» del contacto y le pone la
  // etiqueta de la plantilla; un flujo de wechatia («etiqueta añadida» → enviar plantilla → quitar etiqueta) la envía.
  let mapaCampos = null;
  async function camposIds(loc) {
    if (mapaCampos) return mapaCampos;
    try { const j = await api('GET', `/locations/${encodeURIComponent(loc)}/customFields?model=contact`, { version: '2021-07-28' });
      mapaCampos = Object.fromEntries((j.customFields || []).map((f) => [String(f.fieldKey || '').replace(/^contact\./, ''), f.id]));
    } catch { mapaCampos = {}; } // sin permiso para leer campos: se usa la clave del campo
    return mapaCampos;
  }
  async function enviarPlantilla({ telefono, nombre, etiqueta, campos }) {
    const { contactId, loc } = await contacto(telefono, nombre);
    const ids = await camposIds(loc);
    const customFields = Object.entries(campos).filter(([, v]) => v != null && String(v).trim()).map(([k, v]) => (ids['asset_' + k] ? { id: ids['asset_' + k], field_value: String(v).trim() } : { key: 'asset_' + k, field_value: String(v).trim() }));
    const PERM = 'La clave de wechatia no tiene permiso para editar contactos. Agrega «Editar contactos» a la integración privada «PortalFirma Asset - Postventa».';
    await api('PUT', `/contacts/${contactId}`, { version: '2021-07-28', permiso: PERM, body: { customFields } });
    // si la etiqueta quedó puesta de un envío anterior, se quita primero para que el flujo vuelva a dispararse
    try { await api('DELETE', `/contacts/${contactId}/tags`, { version: '2021-07-28', body: { tags: [etiqueta] } }); } catch {}
    await api('POST', `/contacts/${contactId}/tags`, { version: '2021-07-28', permiso: PERM, body: { tags: [etiqueta] } });
    { const k = String(telefono || '').replace(/\D/g, '').slice(-9); const m = store.get('waPlantillaEnv') || {}; m[k] = Date.now(); store.set('waPlantillaEnv', m); }   // la plantilla la envía wechatia en segundos: no es un mensaje «a mano»
    return { contactId, etiqueta };
  }
  // clave propia de WhatsApp (integración «Postventa»): se prueba leyendo una conversación antes de guardarla
  const estadoWa = () => ({ propia: !!store.getSecret('wechatiaWaToken'), conectado: !!(store.getSecret('wechatiaWaToken') || token()), locationId: locationId() });
  async function configurarWa({ token: tk, locationId: loc } = {}) {
    tk = String(tk || '').trim(); const c = { ...cfg() };
    if (loc) c.locationId = String(loc).trim();
    if (!tk) { store.setSecret('wechatiaWaToken', undefined); store.set('wechatia', c); return estadoWa(); }
    if (tk.length < 20) throw err('Esa clave es muy corta. Copia la clave completa de la integración.');
    if (!c.locationId) throw err('Falta el identificador de la cuenta de wechatia (aparece en la dirección: …/location/XXXX/…).');
    await api('GET', `/conversations/search?locationId=${encodeURIComponent(c.locationId)}&limit=1`, { tk });
    store.setSecret('wechatiaWaToken', tk); store.set('wechatia', c); return estadoWa();
  }

  const estado = () => ({ widget: cfg().widget || WIDGET_DEF, url: WIDGET + (cfg().widget || WIDGET_DEF), conectado: !!token(), calendario: cfg().calendario || null, ultima: cfg().ultima || null });

  async function configurar({ widget, token: tk } = {}) {
    const c = { ...cfg() };
    if (widget !== undefined) { const id = widgetId(widget); if (!id) throw err('No encontré el calendario en ese código. Pega el código del widget o su dirección (…/widget/booking/…).'); c.widget = id; }
    if (tk !== undefined) {
      tk = String(tk || '').trim();
      if (!tk) { store.setSecret('wechatiaToken', undefined); delete c.locationId; delete c.calendario; }
      else {
        if (tk.length < 20) throw err('Esa clave es muy corta. Copia la clave completa de la integración privada.');
        const cal = esV1(tk) ? null : await http(`${V2}/calendars/${c.widget || WIDGET_DEF}`, { version: '2021-04-15', tk });
        if (!esV1(tk) && !cal?.calendar?.locationId) throw err('La clave funciona, pero no encontré el calendario de ese widget en la cuenta.');
        if (cal) { c.locationId = cal.calendar.locationId; c.calendario = cal.calendar.name || null; }
        store.setSecret('wechatiaToken', tk);
      }
    }
    store.set('wechatia', c); return estado();
  }

  // reservas del calendario entre dos instantes, normalizadas
  async function reservas(desde, hasta) {
    const c = cfg(); const tk = token(); const cal = c.widget || WIDGET_DEF;
    if (!tk) throw err('Conecta el calendario de reservas con la clave de wechatia.', 'SIN_CLAVE');
    let lista;
    if (esV1(tk) && !mock) {
      const j = await http(`${V1}/appointments/?calendarId=${cal}&startDate=${desde}&endDate=${hasta}&includeAll=true`);
      lista = (j.appointments || []).map((a) => ({ id: a.id, inicio: a.startTime, estado: a.appointmentStatus || a.status, titulo: a.title || '', creado: a.createdAt || a.dateAdded || null, contactoId: a.contactId || a.contact?.id || null,
        contacto: a.contact ? { nombre: a.contact.name || [a.contact.firstName, a.contact.lastName].filter(Boolean).join(' '), email: a.contact.email || '', telefono: a.contact.phone || '' } : null }));
    } else {
      const j = await http(`${V2}/calendars/events?locationId=${encodeURIComponent(c.locationId || '')}&calendarId=${cal}&startTime=${desde}&endTime=${hasta}`, { version: '2021-04-15' });
      lista = (j.events || []).map((a) => ({ id: a.id, inicio: a.startTime, estado: a.appointmentStatus || a.status, titulo: a.title || '', creado: a.dateAdded || a.createdAt || null, contactoId: a.contactId || null, contacto: null }));
    }
    for (const r of lista) if (!r.contacto && r.contactoId) {
      try { const j = await http(`${V2}/contacts/${r.contactoId}`, { version: '2021-07-28' }); const k = j.contact || {}; r.contacto = { nombre: k.name || [k.firstName, k.lastName].filter(Boolean).join(' '), email: k.email || '', telefono: k.phone || '' }; } catch { r.contacto = null; }
    }
    return lista.map((r) => ({ ...r, ...local(r.inicio), cancelada: /cancel|invalid|noshow|no_show/i.test(String(r.estado || '')) }));
  }

  const personaDe = (k) => { if (!k) return null; const ps = inmo.listar().personas; const t = dig(k.telefono); const e = norm(k.email);
    return ps.find((p) => (t && dig(p.telefono) === t) || (e && norm(p.email) === e)) || null; };

  const dirProp = (p) => [p.direccion, p.unidad ? (/^\d/.test(p.unidad) ? 'depto ' + p.unidad : p.unidad) : '', p.comuna].filter(Boolean).join(', ');
  // escribe la dirección de la propiedad en la cita (dirección, título y una nota): es lo que lee la confirmación por WhatsApp
  async function anotarCita(citaId, prop) {
    const dir = dirProp(prop); if (!dir) return { ok: false, error: 'la propiedad no tiene dirección' };
    const PERM = 'La clave de wechatia no tiene permiso para editar citas. En wechatia › Configuración › Integraciones Privado › «PortalFirma Asset - Postventa», agrega «Editar eventos de calendario» (calendars/events.write).';
    const base = { address: dir, title: `Visita · ${dir}`.slice(0, 120) };
    let r = await api('PUT', `/calendars/events/appointments/${citaId}`, { permiso: PERM, raw: true, body: { ...base, notes: dir } });
    if (r && r._status) r = await api('PUT', `/calendars/events/appointments/${citaId}`, { permiso: PERM, raw: true, body: base }); // si no acepta «notes»
    if (r && r._status) return { ok: false, error: r.message || 'HTTP ' + r._status };
    let nota = true; try { await api('POST', `/calendars/appointments/${citaId}/notes`, { permiso: PERM, body: { body: dir } }); } catch { nota = false; }
    return { ok: true, direccion: dir, nota };
  }
  // Trae las reservas y las refleja en la agenda. `pendiente` = la que el corredor acaba de hacer desde una propiedad.
  async function sincronizar(pendiente = null) {
    const ahora = Date.now(); const lista = await reservas(ahora - 7 * 864e5, ahora + 120 * 864e5);
    const out = { nuevas: 0, actualizadas: 0, canceladas: 0, vinculada: null, hito: null };
    // la reserva recién hecha: la más nueva creada desde que se abrió el widget, o la del contacto de ese cliente
    let elegida = null;
    if (pendiente?.propId) {
      const cli = pendiente.personaId ? inmo.personaPorId(pendiente.personaId) : null;
      const cand = lista.filter((r) => !r.cancelada && !agenda.porExt(FUENTE, r.id));
      const desde = (pendiente.desde || ahora) - 2 * 6e4;
      elegida = cand.filter((r) => cli && personaDe(r.contacto)?.id === cli.id).pop()
        || cand.filter((r) => r.creado && new Date(r.creado).getTime() >= desde).sort((a, b) => new Date(a.creado) - new Date(b.creado)).pop() || null;
    }
    for (const r of lista) {
      const ya = agenda.porExt(FUENTE, r.id);
      if (ya) {
        if (r.cancelada && ya.estado === 'programado') { agenda.actualizar(ya.id, { estado: 'cancelado' }); out.canceladas++; }
        else if (!r.cancelada && r.fecha && (ya.fecha !== r.fecha || ya.hora !== r.hora)) { agenda.actualizar(ya.id, { fecha: r.fecha, hora: r.hora }); out.actualizadas++; }
        continue;
      }
      if (r.cancelada || !r.fecha) continue;
      const quien = personaDe(r.contacto); const contactoTxt = r.contacto ? [r.contacto.nombre, r.contacto.telefono, r.contacto.email].filter(Boolean).join(' · ') : '';
      if (r === elegida) {
        const ids = [...new Set([pendiente.personaId, quien?.id].filter(Boolean))];
        const e = agenda.crear({ tipo: 'visita', fecha: r.fecha, hora: r.hora, duracion: 60, propId: pendiente.propId, personaIds: ids, negocioId: pendiente.negocioId || null, notas: `Reservada en el calendario de wechatia${contactoTxt ? ' · ' + contactoTxt : ''}`, ext: { fuente: FUENTE, id: r.id } });
        out.vinculada = e; out.hito = est ? await est.alAgendar(e).catch(() => null) : null;
        // 0.16.5 · la dirección queda en la cita de wechatia: la plantilla «confirmacion_visita» la toma de ahí
        const prop = inmo.listar().propiedades.find((x) => x.id === pendiente.propId);
        if (prop) out.cita = await anotarCita(r.id, prop).catch((er) => ({ ok: false, error: er.message, permiso: er.code === 'CLAVE' }));
      } else {
        agenda.crear({ tipo: 'otro', fecha: r.fecha, hora: r.hora, duracion: 60, titulo: `Reserva: ${r.titulo || r.contacto?.nombre || 'calendario de visitas'}`.slice(0, 120), personaIds: quien ? [quien.id] : [],
          notas: `Reservada en el calendario de wechatia${contactoTxt ? ' · ' + contactoTxt : ''}`, ext: { fuente: FUENTE, id: r.id } });
      }
      out.nuevas++;
    }
    store.set('wechatia', { ...cfg(), ultima: new Date().toISOString() });
    return out;
  }

  return { estado, configurar, reservas, sincronizar, api, locationId, estadoWa, configurarWa, enviarWhatsApp, enviarPlantilla, estadoMensaje, WIDGET };
}

module.exports = { crear, widgetId, local };
