const H = require('./hora');
// 0.16.8 · Atención de clientes por WhatsApp. Cuando una persona del CRM le escribe al número de la empresa, la atiende
// Diego como «asistente del corredor»: responde dudas de SUS propiedades (con los datos de la ficha), ayuda con la
// firma y, para agendar, reprogramar o cancelar una visita o reunión, SOLO toma el recado y se lo pasa al corredor.
// Nunca confirma fechas ni ve datos de otros clientes: sus herramientas están limitadas a esa persona.
//  · Se enciende y apaga desde el equipo («activa la atención de clientes»). Por defecto está apagada.
//  · Si el corredor le escribe al cliente a mano desde wechatia, el asistente se calla 12 h con ese cliente.
const now = () => new Date().toISOString();
const dig = (t) => String(t || '').replace(/\D/g, '').slice(-9);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const PAUSA_H = 3;   // 0.16.20 · si el corredor escribe a mano, el asistente se calla 3 h (antes 12) y se lo avisa

function crear({ store, inmo, agenda, docs = null, leads = null, ai, wa, avisarCorredor = async () => false, emitUI = () => {}, mock = false }) {
  const cfg = () => ({ activo: true, ...(store.get('waClientesCfg') || {}) });   // 0.16.20 · encendida por defecto: el asistente atiende solo
  const hilos = () => store.get('waClientes') || {};
  const guardarHilo = (k, h) => { const all = hilos(); all[k] = h; store.set('waClientes', all); };
  // 0.16.20 · las pausas puestas por mensajes que en realidad mandó Asset (no el corredor) se levantan una vez
  if (store.get('waClientesMigr2') !== '0.16.20') { const all = hilos(); for (const h of Object.values(all)) delete h.pausaHasta; store.set('waClientesMigr2', '0.16.20'); store.set('waClientes', all); store.set('waClientesCfg', { ...(store.get('waClientesCfg') || {}), activo: true }); }
  if (store.get('waClientesMigr') !== '0.16.12') { const all = hilos(); for (const h of Object.values(all)) { delete h.pausaHasta; } store.set('waClientes', all); store.set('waClientesMigr', '0.16.12'); }
  const corredor = () => { const c = inmo.config(); return { nombre: c.corredor?.nombre || c.nombre || 'tu corredor', email: c.corredor?.email || '' }; };

  // ¿es una persona del CRM? (por los últimos 9 dígitos del celular)
  // 0.16.9 · también los leads (pantalla Leads): a ellos los atiende Fernanda y la conversación queda en su lead
  function personaDe(phone) {
    const d = dig(phone); if (d.length < 8) return null;
    const per = (inmo.listar().personas || []).find((p) => dig(p.telefono) === d) || null;
    const l = leads?.porTelefono ? leads.porTelefono(phone) : null;
    if (!per && !l) return null;
    const base = per ? { ...per } : { id: l.personaId || null, nombre: l.nombre || l.chatCon || l.telefono, telefono: l.telefono, rut: l.rut || '' };
    return l ? { ...base, leadId: l.id, lead: l } : base;
  }
  const quien = (per) => (per.leadId ? { id: 'fernanda', nombre: 'Fernanda' } : { id: 'diego', nombre: 'Diego' });

  // ---------- lo que el asistente puede saber de ESTE cliente ----------
  const PUB = ['codigo', 'titulo', 'tipo', 'direccion', 'unidad', 'comuna', 'supTotal', 'supUtil', 'dormitorios', 'banos', 'estacionamientos', 'bodegas', 'amoblado', 'gastosComunes'];
  const precio = (p) => (p && p.valor != null ? `${p.moneda === 'CLP' ? '$' : ''}${Number(p.valor).toLocaleString('es-CL')}${p.moneda && p.moneda !== 'CLP' ? ' ' + p.moneda : ''}` : null);
  // 0.16.14 · el interesado suele escribir con el link o el código del aviso (Portal Inmobiliario: MLC-1234567890),
  // no con el código interno de la ficha: aquí se reconoce cualquiera de esas formas
  const todas = () => (inmo.todas ? inmo.todas() : inmo.listar().propiedades).filter((p) => !p.archivada);
  const soloDig = (x) => String(x || '').replace(/\D/g, '');
  function avisosDe(p) { const out = []; for (const por of Object.values(p.portales || {})) for (const a of Object.values(por || {})) if (a && typeof a === 'object') out.push(a); return out; }
  function propPorRef(ref) {
    const r = String(ref || '').trim(); if (!r) return null; const c = norm(r); const ps = todas();
    const exacta = ps.find((p) => norm(p.codigo) === c || p.id === r); if (exacta) return exacta;
    const ml = r.match(/MLC-?\s?(\d{6,})/i);
    if (ml) { const n = ml[1]; const p = ps.find((x) => avisosDe(x).some((a) => soloDig(a.itemId) === n || soloDig(String(a.permalink || '').match(/MLC-?(\d{6,})/i)?.[1]) === n)); if (p) return p; }
    const url = r.match(/https?:\/\/\S+/i)?.[0];
    if (url) { const u = url.replace(/[?#].*$/, '').replace(/\/$/, ''); const p = ps.find((x) => avisosDe(x).some((a) => [a.permalink, a.url].some((v) => v && String(v).replace(/[?#].*$/, '').replace(/\/$/, '') === u))); if (p) return p; }
    const cod = r.match(/\b[A-Z]{1,4}-?\d{2,6}\b/i)?.[0]; if (cod) { const p = ps.find((x) => norm(x.codigo) === norm(cod) || norm(String(x.codigo).replace('-', '')) === norm(cod.replace('-', ''))); if (p) return p; }
    return null;
  }
  // lo que el cliente nombra en su mensaje (link, código del portal o de la ficha)
  function refsEnTexto(t) { const out = []; const s = String(t || '');
    for (const m of s.matchAll(/https?:\/\/\S+|MLC-?\s?\d{6,}|\b[A-Z]{1,4}-?\d{3,6}\b/gi)) { const p = propPorRef(m[0]); if (p && !out.includes(p)) out.push(p); }
    return out; }
  const mapa = (p) => (p.lat != null && p.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}${p.placeId ? '&query_place_id=' + encodeURIComponent(p.placeId) : ''}`
    : p.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.direccion, p.comuna, 'Chile'].filter(Boolean).join(', '))}` : null);
  function infoCliente(per) {
    const props = (inmo.todas ? inmo.todas() : inmo.listar().propiedades).filter((p) => !p.archivada && (((per.id && (p.vinculos || []).some((v) => v.personaId === per.id))) || (per.lead?.propiedades || []).includes(p.id)));
    const propiedades = props.map((p) => {
      const o = Object.fromEntries(PUB.filter((k) => p[k] != null && p[k] !== '').map((k) => [k, p[k]]));
      const rol = (p.vinculos || []).filter((v) => v.personaId === per.id).map((v) => v.rol);
      if (p.venta) o.venta = { precio: precio(p.precioVenta), estado: p.estadoVenta || null };
      if (p.arriendo) o.arriendo = { precio: precio(p.precioArriendo), estado: p.estadoArriendo || null };
      if (p.descripcion) o.descripcion = String(p.descripcion).slice(0, 700);
      const mp = mapa(p); if (mp) o.mapa = mp;
      return { ...o, suRol: rol };
    });
    let visitas = [];
    if (per.id) try { const hoy = H.hoy(); visitas = agenda.listar({ personaId: per.id }).filter((e) => e.fecha >= hoy && e.estado !== 'cancelado').slice(0, 5).map((e) => ({ fecha: e.fecha, hora: e.hora, tipo: e.tipo, propiedad: props.find((p) => p.id === e.propId)?.titulo || props.find((p) => p.id === e.propId)?.direccion || null, estado: e.estado })); } catch {}
    const firmas = [];
    for (const p of props) for (const f of (p.firmas || []).slice(0, 10)) if ((f.firmantes || []).some((s) => (per.id && s.personaId === per.id) || (s.rut && per.rut && dig(s.rut) === dig(per.rut)))) firmas.push({ documento: f.plantilla, operacion: f.operacion, fecha: String(f.fecha || '').slice(0, 10), estado: f.estado });
    const enl = per.id ? (store.get('enlacesFirma') || {})[per.id] || null : null;
    const busca = per.lead?.busqueda && Object.keys(per.lead.busqueda).length ? per.lead.busqueda : null;
    return { cliente: { nombre: per.nombre, ...(busca ? { loQueBusca: busca } : {}) }, corredor: corredor().nombre, propiedades, visitasAgendadas: visitas, documentosEnFirma: firmas.slice(0, 6), ultimoEnlaceDeFirma: enl };
  }

  const TOOLS = [
    { name: 'cliente_info', description: 'Datos de ESTE cliente: sus propiedades (ficha pública: dirección, precio, gastos comunes, superficie, dormitorios, baños, estado), sus visitas agendadas, sus documentos en firma y el último enlace de firma que se le envió. Úsala antes de responder cualquier dato.', parameters: { type: 'object', properties: {} } },
    { name: 'cliente_estado_firma', description: 'Revisa en Portalfirma si un documento de ESTE cliente ya fue firmado (solo operaciones que aparecen en cliente_info).', parameters: { type: 'object', properties: { operacion: { type: 'string' } }, required: ['operacion'] } },
    { name: 'cliente_recado', description: 'Le pasa un recado al corredor por WhatsApp y lo deja anotado en el CRM. Úsala para TODO lo que no puedes resolver tú: agendar, reprogramar o cancelar una visita o reunión, problemas con la firma, negociar precio, dudas legales o cualquier otra cosa. Incluye lo que pide y su disponibilidad.', parameters: { type: 'object', properties: { tipo: { type: 'string', enum: ['agendar_visita', 'agendar_reunion', 'reprogramar', 'cancelar', 'firma', 'consulta', 'otro'] }, detalle: { type: 'string', description: 'Qué necesita, en una o dos frases, con la propiedad si aplica' }, disponibilidad: { type: 'string', description: 'Días y horarios que dio el cliente, si los dio' } }, required: ['tipo', 'detalle'] } },
  ];

  // 0.16.10 · Fernanda con los leads: toma sus datos, busca propiedades, ofrece horarios libres y agenda (o cambia) visitas
  const TOOLS_LEAD = [
    { name: 'lead_guardar_datos', description: 'Guarda en el lead lo que el interesado te contó: nombre completo, RUT, correo y qué busca. Úsala apenas te dé un dato nuevo.', parameters: { type: 'object', properties: { nombre: { type: 'string' }, rut: { type: 'string' }, email: { type: 'string' }, operacion: { type: 'string', enum: ['arriendo', 'venta'] }, tipo: { type: 'string', description: 'departamento, casa, oficina…' }, comunas: { type: 'array', items: { type: 'string' } }, dormitorios: { type: 'number' }, banos: { type: 'number' }, presupuesto: { type: 'number', description: 'Monto' }, moneda: { type: 'string', enum: ['CLP', 'UF'] }, cuando: { type: 'string', description: 'Para cuándo lo necesita' }, estacionamiento: { type: 'boolean' }, mascotas: { type: 'boolean' } } } },
    { name: 'lead_buscar_propiedades', description: 'Busca en la cartera propiedades disponibles que calcen con lo que busca el interesado (datos públicos de la ficha). Devuelve el código para agendar.', parameters: { type: 'object', properties: { operacion: { type: 'string', enum: ['arriendo', 'venta'] }, comuna: { type: 'string' }, dormitorios: { type: 'number' }, presupuesto: { type: 'number' }, texto: { type: 'string', description: 'Dirección, código o palabras de la ficha' } } } },
    { name: 'lead_horarios', description: 'Horarios libres de la agenda del corredor para una visita en los próximos días (no choca con otros eventos).', parameters: { type: 'object', properties: { desde: { type: 'string', description: 'AAAA-MM-DD; por defecto mañana' }, dias: { type: 'number', description: 'Cuántos días mirar (máx. 10)' } } } },
    { name: 'lead_agendar_visita', description: 'Agenda la visita del interesado a una propiedad en la agenda del corredor. Úsala SOLO cuando el interesado ya eligió propiedad, día y hora.', parameters: { type: 'object', properties: { propiedad: { type: 'string', description: 'Código de la ficha (de cliente_info o lead_buscar_propiedades), o el código o link del aviso del portal que mandó el cliente' }, fecha: { type: 'string', description: 'AAAA-MM-DD' }, hora: { type: 'string', description: 'HH:MM' } }, required: ['propiedad', 'fecha', 'hora'] } },
    { name: 'lead_cambiar_visita', description: 'Reprograma o cancela una visita YA agendada de este interesado (las que aparecen en cliente_info).', parameters: { type: 'object', properties: { fecha_actual: { type: 'string', description: 'AAAA-MM-DD de la visita que se cambia' }, cancelar: { type: 'boolean' }, fecha: { type: 'string' }, hora: { type: 'string' } }, required: ['fecha_actual'] } },
  ];
  const HORA_INI = 9, HORA_FIN = 19;
  const hoyISO = (d = new Date()) => H.fechaDe(d);
  const propPorCodigo = (cod) => propPorRef(cod);
  const libre = (fecha, hora, sinId = null) => { const [h, m] = hora.split(':').map(Number); const t = h * 60 + m;
    return !agenda.listar({ desde: fecha, hasta: fecha }).some((e) => e.id !== sinId && e.estado !== 'cancelado' && e.hora && (() => { const [eh, em] = e.hora.split(':').map(Number); const ei = eh * 60 + em; return t < ei + (e.duracion || 45) && ei < t + 45; })()); };
  async function personaDelLead(per) {
    if (per.id) return per.id;
    const l = leads.porTelefono(per.telefono); if (!l?.rut) return null;
    try { const p = await inmo.guardarPersona({ nombre: l.nombre || per.nombre, rut: l.rut, email: l.email || '', telefono: l.telefono, roles: ['interesado'] }); leads.actualizar(l.id, { personaId: p.id }); per.id = p.id; return p.id; } catch (e) {
      if (e.code === 'DUP_RUT') { const x = (inmo.listar().personas || []).find((q) => dig(q.rut) === dig(l.rut)); if (x) { leads.actualizar(l.id, { personaId: x.id }); per.id = x.id; return x.id; } } return null; }
  }
  async function ejecutarLead(per, name, a, ctx) {
    const l = leads.porTelefono(per.telefono); if (!l) return { error: 'Este interesado ya no está en Leads.' };
    if (name === 'lead_guardar_datos') {
      const c = {}; for (const k of ['nombre', 'rut', 'email']) if (a[k]) c[k] = String(a[k]).trim();
      const b = {}; for (const k of ['operacion', 'tipo', 'comunas', 'dormitorios', 'banos', 'cuando', 'estacionamiento', 'mascotas']) if (a[k] != null && a[k] !== '') b[k] = a[k];
      if (a.presupuesto) b.presupuesto = { valor: Number(a.presupuesto), moneda: a.moneda || (Number(a.presupuesto) < 100000 ? 'UF' : 'CLP') };
      if (Object.keys(b).length) c.busqueda = b;
      if (c.rut && inmo.validRut && !inmo.validRut(c.rut)) return { error: 'Ese RUT no es válido: pídele que lo revise.' };
      try { leads.actualizar(l.id, c); } catch (e) { return { error: e.message }; }
      if (c.nombre) per.nombre = c.nombre; ctx.datos = true;
      return { ok: true, guardado: Object.keys(c) };
    }
    if (name === 'lead_buscar_propiedades') {
      const t = norm(a.texto); const props = (inmo.todas ? inmo.todas() : inmo.listar().propiedades).filter((p) => !p.archivada
        && (!a.operacion || p[a.operacion]) && (!a.comuna || norm(p.comuna).includes(norm(a.comuna))) && (!a.dormitorios || Number(p.dormitorios || 0) >= a.dormitorios)
        && (!a.presupuesto || (() => { const pr = a.operacion === 'venta' ? p.precioVenta : p.precioArriendo || p.precioVenta; return !pr?.valor || pr.valor <= a.presupuesto * 1.1; })())
        && (!t || norm([p.codigo, p.titulo, p.direccion, p.comuna, p.descripcion].join(' ')).includes(t)));
      return { propiedades: props.slice(0, 6).map((p) => ({ codigo: p.codigo, titulo: p.titulo, direccion: p.direccion, comuna: p.comuna, dormitorios: p.dormitorios, banos: p.banos, gastosComunes: p.gastosComunes, arriendo: p.arriendo ? precio(p.precioArriendo) : null, venta: p.venta ? precio(p.precioVenta) : null })), total: props.length };
    }
    if (name === 'lead_horarios') {
      // 0.16.19 · en hora de Chile: desde hoy (si queda tiempo) o desde la fecha pedida; nunca horas que ya pasaron
      const out = []; const hoy = H.hoy(); const f0 = a.desde && /^\d{4}-\d{2}-\d{2}$/.test(a.desde) && a.desde >= hoy ? a.desde : H.sumarDias(hoy, 1); const dias = Math.min(10, Math.max(1, a.dias || 5));
      const [ah, am] = H.ahora().split(':').map(Number); const minHoy = ah * 60 + am + 120;   // hoy, con al menos 2 h de aviso
      for (let i = 0; i < dias && out.length < 12; i++) { const f = H.sumarDias(f0, i); const dw = new Date(`${f}T12:00:00Z`).getUTCDay(); if (dw === 0) continue; const libres = [];
        for (let h = HORA_INI; h < (dw === 6 ? 14 : HORA_FIN); h++) { const hh = String(h).padStart(2, '0') + ':00'; if (f === hoy && h * 60 < minHoy) continue; if (libre(f, hh)) libres.push(hh); }
        if (libres.length) out.push({ fecha: f, dia: H.fechaLarga(f), horas: libres.slice(0, 6) }); }
      return { horarios: out, nota: 'Ofrece 2 o 3 opciones, no la lista entera.' };
    }
    if (name === 'lead_agendar_visita') {
      const p = propPorCodigo(a.propiedad); if (!p) return { error: 'No encontré esa propiedad: usa el código de cliente_info o lead_buscar_propiedades.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha || '') || !/^\d{2}:\d{2}$/.test(a.hora || '')) return { error: 'Fecha AAAA-MM-DD y hora HH:MM.' };
      if (a.fecha < H.hoy() || (a.fecha === H.hoy() && a.hora <= H.ahora())) return { error: 'Ese día u hora ya pasó (hora de Chile): ofrece otro con lead_horarios.' };
      if (!libre(a.fecha, a.hora)) return { error: 'Ese horario ya está ocupado en la agenda: ofrece otro con lead_horarios.' };
      const pid = await personaDelLead(per);
      const e = agenda.crear({ tipo: 'visita', fecha: a.fecha, hora: a.hora, propId: p.id, personaIds: pid ? [pid] : [], notas: `Agendada por Fernanda por WhatsApp con ${per.nombre} (${per.telefono})`, ext: { fuente: 'lead', id: l.id } });
      if (pid) { try { if (!(p.vinculos || []).some((v) => v.personaId === pid)) await inmo.vincular(p.id, pid, 'interesado'); } catch {} }
      leads.actualizar(l.id, { estado: 'visita', propiedades: [...new Set([...(l.propiedades || []), p.id])], proximaAccion: { texto: `Visita ${p.codigo} el ${a.fecha.slice(8, 10)}/${a.fecha.slice(5, 7)} ${a.hora}`, fecha: a.fecha } });
      ctx.visita = { codigo: p.codigo, fecha: a.fecha, hora: a.hora };
      const falta = [!l.rut && 'RUT', !l.email && 'correo'].filter(Boolean);
      await avisarCorredor(`📅 *Visita agendada por Fernanda*\n${per.nombre} (${per.telefono}) · ${p.codigo} ${p.titulo || ''}\n${a.fecha.slice(8, 10)}/${a.fecha.slice(5, 7)} a las ${a.hora}${falta.length ? `\nAún le falta: ${falta.join(' y ')} (para la orden de visita).` : `\nTiene RUT y correo: si quieres la orden de visita, pídesela a Juanita.`}`, 'fernanda').catch(() => {});
      return { ok: true, agendada: { propiedad: p.codigo, direccion: [[p.direccion, p.unidad].filter(Boolean).join(' '), p.comuna].filter(Boolean).join(', '), mapa: mapa(p), fecha: a.fecha, hora: a.hora }, ...(falta.length ? { pedir: `Pídele ${falta.join(' y ')} para preparar la orden de visita.` } : {}) };
    }
    if (name === 'lead_cambiar_visita') {
      const vs = agenda.listar({ desde: a.fecha_actual, hasta: a.fecha_actual, tipo: 'visita' }).filter((e) => e.estado !== 'cancelado' && ((e.ext?.fuente === 'lead' && e.ext.id === l.id) || (per.id && (e.personaIds || []).includes(per.id))));
      const e = vs[0]; if (!e) return { error: 'No encontré una visita de este interesado ese día.' };
      if (a.cancelar) { agenda.actualizar(e.id, { estado: 'cancelado' }); await avisarCorredor(`❌ ${per.nombre} canceló la visita del ${e.fecha.slice(8, 10)}/${e.fecha.slice(5, 7)} ${e.hora || ''} (${e.prop?.codigo || ''}).`, 'fernanda').catch(() => {}); return { ok: true, cancelada: true }; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha || '') || !/^\d{2}:\d{2}$/.test(a.hora || '')) return { error: 'Para reprogramar necesito fecha y hora nuevas.' };
      if (!libre(a.fecha, a.hora, e.id)) return { error: 'Ese horario está ocupado: ofrece otro con lead_horarios.' };
      agenda.actualizar(e.id, { fecha: a.fecha, hora: a.hora });
      await avisarCorredor(`🔁 Fernanda reprogramó la visita de ${per.nombre} (${e.prop?.codigo || ''}): ahora ${a.fecha.slice(8, 10)}/${a.fecha.slice(5, 7)} a las ${a.hora}.`, 'fernanda').catch(() => {});
      return { ok: true, reprogramada: { fecha: a.fecha, hora: a.hora } };
    }
    return null;
  }

  function sistema(per, primera) {
    const c = corredor().nombre; const yo = quien(per).nombre;
    return `Eres ${yo}, asistente virtual de ${c}, corredor de propiedades que trabaja con PortalFirma. Atiendes por WhatsApp a ${per.nombre}, cliente de ${c}.
- ${H.contexto()} Usa siempre esta fecha y hora para «hoy», «mañana» o «el jueves»; nunca ofrezcas horarios que ya pasaron.
- Escribe en español de Chile, cercano, breve (2 a 4 líneas), sin firmas ni encabezados.${primera ? `\n- Es el primer mensaje de esta conversación: preséntate en una línea («Hola ${String(per.nombre || '').split(' ')[0]}, soy ${yo}, asistente de ${c}»).` : ''}
- Antes de dar cualquier dato, usa cliente_info. Responde SOLO con lo que entrega: nunca inventes precios, fechas, direcciones ni plazos. Si un dato no está, dilo y ofrece consultarlo con ${c} (cliente_recado).
- Solo hablas de las propiedades, visitas y documentos de este cliente.${per.leadId ? ' Es un interesado (lead): si busca algo y no hay una propiedad que calce, pregunta qué busca (comuna, dormitorios, presupuesto) y pásaselo a ' + c + ' con cliente_recado.' : ''} Nunca entregues datos de otras personas ni notas internas.
${per.leadId ? `- Es un INTERESADO (lead) y tú llevas todo lo suyo. Tu objetivo: conocer qué busca y agendarle una visita.
  · Toma sus datos de a poco y guárdalos con lead_guardar_datos: qué busca (operación, comuna, dormitorios, presupuesto, para cuándo), nombre completo, y antes o después de agendar, RUT y correo (se usan para la orden de visita). Máximo una o dos preguntas por mensaje.
  · Si pregunta por una propiedad, usa cliente_info; si busca otra cosa, lead_buscar_propiedades. Si su mensaje trae el link o el código del aviso (por ejemplo MLC-1234567890), ya viene identificada en la nota interna: no le pidas el código de nuevo.
  · Si el corredor te pidió coordinar una visita (la conversación la inició él y ya hay una propiedad en cliente_info), al responder ofrécele de inmediato 2 o 3 horarios de lead_horarios para esa propiedad.
  · Para visitar: ofrece 2 o 3 horarios de lead_horarios, y cuando elija, agéndala con lead_agendar_visita y confírmale día, hora, dirección y el link de Google Maps (campo mapa) para que llegue sin problemas. Si quiere cambiarla o cancelarla, usa lead_cambiar_visita.
  · Negociación de precio, condiciones del contrato o dudas legales: cliente_recado.` : '- Visitas y reuniones: NO puedes agendar, confirmar, reprogramar ni cancelar. Pregunta qué necesita y su disponibilidad (días y horarios) en una sola pregunta, luego usa cliente_recado y dile que ${c} le confirmará. Nunca digas que quedó agendado.'}
- Firma: el enlace para firmar le llega por correo desde Portalfirma (y a veces por este WhatsApp). Si lo pide y hay ultimoEnlaceDeFirma, compártelo. Puedes revisar si ya firmó con cliente_estado_firma. Si tiene un problema o dudas del contrato, usa cliente_recado.
- Precio, negociación, dudas legales o cualquier otro tema: cliente_recado y dile que ${c} lo contactará.
- Si te preguntan si eres una persona, di con naturalidad que eres el asistente virtual de ${c}.`;
  }

  async function ejecutar(per, name, a, ctx) {
    if (per.leadId && name.startsWith('lead_')) return (await ejecutarLead(per, name, a, ctx)) || { error: 'Herramienta desconocida' };
    if (name === 'cliente_info') return infoCliente(per);
    if (name === 'cliente_estado_firma') {
      const info = infoCliente(per); const op = String(a.operacion || '').replace(/\D/g, '');
      if (!info.documentosEnFirma.some((f) => String(f.operacion) === op)) return { error: 'Esa operación no es de este cliente.' };
      if (!docs) return { error: 'No puedo revisar la firma ahora.' };
      const r = await docs.seguimiento(op); const yo = (r.firmantes || []).find((s) => (per.rut && dig(s.rut) === dig(per.rut)) || norm(s.nombre) === norm(per.nombre));
      return { documento: info.documentosEnFirma.find((f) => String(f.operacion) === op)?.documento, estado: r.estadoTxt, firmados: `${r.firmados} de ${r.total}`, esteClienteFirmo: yo ? yo.firmo : null };
    }
    if (name === 'cliente_recado') {
      const TIP = { agendar_visita: 'Quiere agendar una visita', agendar_reunion: 'Quiere agendar una reunión', reprogramar: 'Quiere reprogramar', cancelar: 'Quiere cancelar', firma: 'Tema de firma', consulta: 'Consulta', otro: 'Recado' };
      const t = `📩 *Recado de ${per.nombre}* (${per.telefono})\n${TIP[a.tipo] || 'Recado'}: ${String(a.detalle || '').slice(0, 400)}${a.disponibilidad ? `\nDisponibilidad: ${String(a.disponibilidad).slice(0, 200)}` : ''}\n(Lo atendió ${quien(per).nombre} por WhatsApp${per.leadId ? '; la conversación está en Leads, donde puedes tomarla' : ''}.)`;
      try { if (per.id) inmo.registrar(per.id, `WhatsApp · ${TIP[a.tipo] || 'Recado'}: ${String(a.detalle || '').slice(0, 200)}${a.disponibilidad ? ' · Disponibilidad: ' + a.disponibilidad : ''}`); inmo.guardar(); } catch {}
      const ok = await avisarCorredor(t, quien(per).id).catch(() => false);
      ctx.recados.push(a.tipo); emitUI({ type: 'aviso', texto: `Recado de ${per.nombre}: ${String(a.detalle || '').slice(0, 140)}` });
      return { ok: true, avisado: !!ok, instruccion: `Dile al cliente que le pasaste el recado a ${corredor().nombre} y que le confirmará. No prometas fecha ni hora.` };
    }
    return { error: 'Herramienta desconocida' };
  }

  // modelo de prueba (PF_MOCK): reglas simples, sin IA
  async function chatMock({ messages }, per = {}) {
    const last = messages[messages.length - 1];
    if (per.leadId) {
      if (last.role === 'tool') { const r = JSON.parse(last.content);
        if (r.horarios) return { content: r.horarios.length ? `Tengo el ${r.horarios[0].dia} a las ${r.horarios[0].horas[0]} o ${r.horarios[0].horas[1] || r.horarios[0].horas[0]}. ¿Cuál te acomoda?` : 'Esta semana no tengo horarios.', tool_calls: [] };
        if (r.agendada) return { content: `Listo, quedó tu visita a ${r.agendada.direccion} el ${r.agendada.fecha} a las ${r.agendada.hora}.${r.pedir ? ' ' + r.pedir : ''}`, tool_calls: [] };
        if (r.guardado) return { content: 'Gracias, lo anoté.', tool_calls: [] };
        if (r.error) return { content: 'Uy: ' + r.error, tool_calls: [] }; }
      else { const t = norm(last.content); const hh = t.match(/\b(\d{1,2}):00\b/); const rut = last.content.match(/\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]/);
        if (rut) return { content: '', tool_calls: [{ id: 'l3', function: { name: 'lead_guardar_datos', arguments: JSON.stringify({ rut: rut[0], email: (last.content.match(/\S+@\S+/) || [])[0] || '' }) } }] };
        if (hh) { const f = (t.match(/(\d{4}-\d{2}-\d{2})/) || [])[1]; return { content: '', tool_calls: [{ id: 'l2', function: { name: 'lead_agendar_visita', arguments: JSON.stringify({ propiedad: (t.match(/\b(pf-\d+|cv-\d+)\b/) || [])[1] || '', fecha: f, hora: hh[1].padStart(2, '0') + ':00' }) } }] }; }
        if (/visita|ver la|agend/.test(t)) return { content: '', tool_calls: [{ id: 'l1', function: { name: 'lead_horarios', arguments: '{}' } }] }; }
    }
    if (last.role === 'tool') { const r = JSON.parse(last.content); if (r.instruccion) return { content: 'Perfecto, le paso tu disponibilidad a tu corredor y te confirma.', tool_calls: [] }; if (r.propiedades) { const p = r.propiedades[0]; return { content: p ? `La propiedad de ${p.direccion} tiene gastos comunes de $${Number(p.gastosComunes || 0).toLocaleString('es-CL')}.` : 'No tengo propiedades tuyas registradas.', tool_calls: [] }; } return { content: 'Listo.', tool_calls: [] }; }
    const t = norm(last.content);
    if (/visita|reuni|agend|cambiar|cancel/.test(t)) return { content: '', tool_calls: [{ id: 'm1', function: { name: 'cliente_recado', arguments: JSON.stringify({ tipo: /cancel/.test(t) ? 'cancelar' : 'agendar_visita', detalle: last.content, disponibilidad: (t.match(/(lunes|martes|miercoles|jueves|viernes|sabado|domingo)[^.]*/) || [])[0] || '' }) } }] };
    return { content: '', tool_calls: [{ id: 'm2', function: { name: 'cliente_info', arguments: '{}' } }] };
  }

  async function responder(per, h, texto) {
    const ctx = { recados: [] }; const primera = !h.mensajes.length || Date.now() - new Date(h.ultimo || 0).getTime() > 24 * 36e5;
    // si el cliente manda el link o el código del aviso, la propiedad queda identificada para la conversación
    const nombradas = refsEnTexto(texto);
    if (nombradas.length && per.leadId) try { const l = leads.obtener ? leads.obtener(per.leadId, { marcarLeido: false }) : null; if (l) leads.actualizar(l.id, { propiedades: [...new Set([...(l.propiedades || []), ...nombradas.map((p) => p.id)])] }); if (per.lead) per.lead.propiedades = [...new Set([...(per.lead.propiedades || []), ...nombradas.map((p) => p.id)])]; } catch {}
    const nota = nombradas.length ? `\n\n[Nota interna, no la repitas tal cual: el cliente se refiere a ${nombradas.map((p) => `la propiedad ${p.codigo} (${[p.titulo, [p.direccion, p.comuna].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}${p.venta ? ' · venta ' + (precio(p.precioVenta) || '') : ''}${p.arriendo ? ' · arriendo ' + (precio(p.precioArriendo) || '') : ''})`).join('; ')}. Para agendar usa el código ${nombradas[0].codigo}.]` : '';
    const msgs = [...h.mensajes.slice(-16), { role: 'user', content: texto + nota }];
    const chat = mock ? (o) => chatMock(o, per) : (o) => ai.toolChat(o);
    let final = '';
    for (let i = 0; i < 5; i++) {
      const r = await chat({ system: sistema(per, primera), messages: msgs, tools: per.leadId ? [...TOOLS, ...TOOLS_LEAD] : TOOLS });
      const calls = r.tool_calls || [];
      if (!calls.length) { final = String(r.content || '').trim(); break; }
      msgs.push({ role: 'assistant', content: r.content || '', tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: c.function })) });
      for (const c of calls) { let a = {}; try { a = JSON.parse(c.function.arguments || '{}'); } catch {} let out; try { out = await ejecutar(per, c.function.name, a, ctx); } catch (e) { out = { error: e.message }; } msgs.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out).slice(0, 6000) }); }
    }
    if (!final) final = `Gracias por escribir. Le paso tu mensaje a ${corredor().nombre} y te contacta.`;
    // historial corto: solo lo conversado (sin las llamadas a herramientas)
    h.mensajes = [...h.mensajes, { role: 'user', content: texto }, { role: 'assistant', content: final }].slice(-20);
    return { texto: final, recados: ctx.recados };
  }

  // un mensaje entrante de una persona del CRM (cv = conversación de wechatia, msgs = sus últimos mensajes)
  async function manejar(cv, m, per, msgs = []) {
    if (!per.leadId && !cfg().activo) return false;
    const k = dig(cv.phone); const h = { mensajes: [], enviados: [], pausaHasta: null, ...(hilos()[k] || {}), personaId: per.id };
    const yo = quien(per); const avisar = (t) => avisarCorredor(t, yo.id).catch(() => false);
    const lg = (de, texto) => { if (per.leadId && leads?.registrarWa) try { leads.registrarWa(per.leadId, { de, texto }); } catch {} };
    // ¿el corredor le está escribiendo a mano? (un mensaje saliente que no mandó Asset, posterior a lo último del asistente)
    const propios = new Set([...(h.enviados || []), ...((store.get('waPropios') || {})[k] || [])]);
    const ids = new Set(store.get('waPropiosIds') || []); const tPl = (store.get('waPlantillaEnv') || {})[k.slice(-9)] || 0;
    const deAsset = (x) => ids.has(String(x.id)) || (tPl && Math.abs(new Date(x.dateAdded).getTime() - tPl) < 10 * 6e4);
    const manuales = msgs.filter((x) => x.direction === 'outbound' && !deAsset(x) && !propios.has(norm(x.body).slice(0, 120)) && !/template|plantilla/i.test(String(x.tipo || '')) && !/workflow|automation|campaign|api/i.test(String(x.source || '')) && !/te saluda .* de portalfirma\. te escribo por|te recordamos tu visita a la propiedad|tienes un documento pendiente de firma|de portalfirma\. te escribo por tu interes|te confirmamos tu visita a la propiedad/.test(norm(x.body)) && new Date(x.dateAdded) > new Date(h.ultimo || h.visto || 0) && (x.userId || /^(app|manual|mobile)/i.test(String(x.source || ''))));
    if (manuales.length) { h.pausaHasta = new Date(Date.now() + PAUSA_H * 36e5).toISOString(); for (const x of manuales) lg('broker', x.body); h.visto = manuales.at(-1).dateAdded; }
    const texto = String(m.body || '').trim();
    if (texto) lg('cliente', texto); else if ((m.attachments || []).length) lg('cliente', '📎 Envió un archivo (míralo en wechatia)');
    // el corredor tomó la conversación (desde Leads o escribiendo a mano): solo se registra
    const tomada = per.leadId && (leads?.porTelefono?.(cv.phone)?.atiende === 'corredor');
    if (!tomada && h.pausaHasta && new Date(h.pausaHasta) > new Date()) { guardarHilo(k, h); if (texto) await avisar(`💬 ${per.nombre} te escribió: «${texto.slice(0, 200)}»
(${quien(per).nombre} está en pausa en esta conversación hasta las ${new Date(h.pausaHasta).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: H.TZ() })} porque le escribiste tú. Respóndele, o en Leads pulsa «Reanudar» para que siga ${quien(per).nombre}.)`); return false; }
    if (tomada || (h.pausaHasta && new Date(h.pausaHasta) > new Date())) { guardarHilo(k, h); if (tomada && texto) await avisar(`💬 ${per.nombre} te escribió: «${texto.slice(0, 200)}»
(La conversación es tuya: respóndele desde Leads o WhatsApp.)`); return false; }
    if (!texto) {
      if ((m.attachments || []).length) { const t = `Recibí tu archivo. Se lo paso a ${corredor().nombre}.`; await wa.enviar(cv.contactId, t); lg('agente', t); h.enviados = [...(h.enviados || []), norm(t).slice(0, 120)].slice(-30); guardarHilo(k, h); await avisar(`📎 ${per.nombre} (${per.telefono}) mandó un archivo por WhatsApp. Míralo en la conversación de wechatia.`); }
      return true;
    }
    const nuevo = !h.ultimo || Date.now() - new Date(h.ultimo).getTime() > 6 * 36e5;
    const r = await responder(per, h, texto);
    await wa.enviar(cv.contactId, r.texto.slice(0, 3000)); lg('agente', r.texto);
    h.enviados = [...(h.enviados || []), norm(r.texto).slice(0, 120)].slice(-30); h.ultimo = now();
    guardarHilo(k, h);
    try { if (per.id) { inmo.registrar(per.id, `WhatsApp · ${per.nombre}: «${texto.slice(0, 140)}» → ${yo.nombre}: «${r.texto.slice(0, 140)}»`); inmo.guardar(); } } catch {}
    if (nuevo && !r.recados.length) await avisar(`💬 ${per.nombre} escribió por WhatsApp: «${texto.slice(0, 160)}»\nLe respondí: «${r.texto.slice(0, 200)}»${per.leadId ? '\n(Puedes seguir la conversación y tomarla en Leads.)' : ''}`);
    emitUI({ type: 'whatsapp', que: 'cliente', personaId: per.id });
    return true;
  }

  return {
    personaDe, manejar, infoCliente, propPorRef, refsEnTexto, mapa,
    // a quién se atiende: los leads siempre (los lleva Fernanda); el resto del CRM, si la atención de clientes está activa
    atiende: (phone) => { const per = personaDe(phone); return per && (per.leadId || cfg().activo) ? per : null; },
    // desde cuándo mirar una conversación nueva: desde el último envío de Asset a ese número (si no, ahora)
    // todo lo que Asset le envía a un número (pedido por el corredor, plantillas, el propio asistente): así no se confunde
    // con un mensaje escrito a mano y el asistente sabe qué se le dijo al cliente
    marcarEnvio: (phone, texto = '') => { const k = dig(phone); const m = store.get('waUltEnvio') || {}; m[k] = now(); store.set('waUltEnvio', m);
      if (texto) { const pr = store.get('waPropios') || {}; pr[k] = [...(pr[k] || []), norm(texto).slice(0, 120)].slice(-40); store.set('waPropios', pr);
        const h = { mensajes: [], ...(hilos()[k] || {}) }; h.mensajes = [...(h.mensajes || []), { role: 'assistant', content: String(texto).slice(0, 1500) }].slice(-20); guardarHilo(k, h); } },
    desdePara: (phone) => (store.get('waUltEnvio') || {})[dig(phone)] || null,
    estado: () => ({ activo: !!cfg().activo, conversaciones: Object.keys(hilos()).length }),
    pausa: (phone) => { const h = hilos()[dig(phone)]; return h?.pausaHasta && new Date(h.pausaHasta) > new Date() ? h.pausaHasta : null; },
    reanudar: (phone) => { const k = dig(phone); const h = hilos()[k]; if (h) { delete h.pausaHasta; guardarHilo(k, h); } return true; },
    configurar: ({ activo }) => { store.set('waClientesCfg', { ...cfg(), activo: !!activo, desde: activo ? now() : cfg().desde || null }); return { activo: !!activo }; },
    activo: () => !!cfg().activo,
    desde: () => cfg().desde || null,
    // el corredor retoma con un cliente («deja que yo le respondo a Juan»): se calla 12 h
    pausar: (per, horas = PAUSA_H) => { const k = dig(per.telefono); const h = { mensajes: [], ...(hilos()[k] || {}) }; h.pausaHasta = new Date(Date.now() + horas * 36e5).toISOString(); guardarHilo(k, h); return h.pausaHasta; },
  };
}

module.exports = { crear };
