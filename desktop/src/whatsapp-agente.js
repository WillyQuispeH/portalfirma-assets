// Agente por WhatsApp (0.13): el ejecutivo le escribe (o le manda notas de voz) al número de WhatsApp de la empresa
// (wechatia) y SU Asset le responde y trabaja con SU cartera y SU sesión de Portalfirma.
//  · Vinculación: Asset muestra un código («ASSET 4821»); el usuario lo envía desde su celular al número de la empresa.
//    Ese celular queda ligado a esta cuenta. Cada Asset atiende SOLO los mensajes de su celular vinculado: varios
//    ejecutivos comparten el mismo número de empresa sin pisarse, y los mensajes de clientes no se tocan.
//  · Todo queda en este computador: lo hecho por WhatsApp aparece en la cartera, la agenda, los negocios y en la
//    conversación «WhatsApp» del Agente.
//  · Lo que cobra o envía se confirma respondiendo SÍ/NO. Una propiedad dictada se muestra resumida y se guarda con «CREAR».
//  · Con la cuenta de Asset (0.17), el SERVIDOR lee el WhatsApp de la empresa, vincula el celular con el código y le
//    entrega a este Asset lo que escribe (cola); aquí se atiende con el Agente y se responde a través del servidor. Si
//    este Asset está cerrado, el servidor guarda los mensajes y le avisa al ejecutivo. Sin cuenta (PF_MOCK), como antes.
const guia = require('./herramientas-guia');
const P = require('./personas');
const now = () => new Date().toISOString();
const dig = (t) => String(t || '').replace(/\D/g, '').slice(-9);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const CONV_ID = 'whatsapp';
const SI = /^(s[ií]|si+|confirmo|confirmar|dale|ok|ya|de acuerdo|hazlo|env[ií]a(lo)?)\b/;
const NO = /^(no|cancela(r)?|mejor no|detente|para)\b/;

function crear({ store, wa, crearAgente, locales, dictado, inmo, convs, leads = null, ai, emitUI = () => {}, fetchFn = (...a) => fetch(...a), mock = false, equipoHoy = null, clientes = null, servidor = null }) {
  const srvOn = () => !!servidor?.enApi?.();
  const cfg = () => ({ activo: false, telefono: null, codigo: null, numeroEmpresa: '+56 9 4497 5958', ...(store.get('waAgente') || {}) });
  const setCfg = (o) => { const c = { ...cfg(), ...o }; store.set('waAgente', c); return c; };
  // SIN MEMORIA DE MENSAJES EN EL COMPUTADOR (2026-11-12): lo que se habló por WhatsApp vive en el servidor (asistentes por celular,
  // cola y registro). Aquí, con una cuenta de Asset, nada se guarda en disco ni se lee WhatsApp directo: antes un equipo con la
  // memoria local de otro día volvió a procesar mensajes viejos y mandó decenas de mensajes de más. Solo PF_MOCK (pruebas) persiste.
  const persiste = !!mock;
  if (!persiste) for (const k of ['waAgenteVistos', 'waHilos', 'waPersona', 'waPropiosIds', 'waClientes']) { try { if (store.get(k) !== undefined) store.set(k, undefined); } catch { /* sin acceso */ } }
  if (!persiste) { try { const a = store.get('waAgente'); if (a && (a.telefono || a.codigo || a.activo || a.contactId || a.vinculado)) store.set('waAgente', { ...(a.nombre ? { nombre: a.nombre } : {}), ...(a.email ? { email: a.email } : {}) }); } catch { /* sin acceso */ } }
  const S = { vistos: persiste ? store.get('waAgenteVistos') || {} : {}, busy: false, pend: null, ficha: null, lead: null, cola: [], ultimaActividad: 0, contactId: null, items: null,
    persona: persiste ? store.get('waPersona') || null : null, espera: null, agentes: {} };

  // 0.16 · el equipo: cada personaje (Pedro, Juanita, Diego, Fernanda) es un agente con su propia conversación, así
  // cambiar de personaje no pierde lo que se venía hablando con el anterior. Mismas herramientas de Asset, menos las
  // que necesitan la pantalla.
  const filtro = (n) => (guia.GUIA[n]?.canal || 'chat-y-whatsapp') !== 'solo-app' && !guia.OCULTAS_EN_ASSET.has(n);
  const desdeUser = (m) => { const l = Array.isArray(m) ? m.slice(-30) : []; const i = l.findIndex((x) => x.role === 'user'); return i < 0 ? [] : l.slice(i); };
  function agenteDe(id) {
    if (!S.agentes[id]) {
      const a = crearAgente({ canal: 'whatsapp', filtro, emit: (e) => evento(e, id) }); a.registrarLocales(locales);
      if (persiste) { try { a.restaurar(desdeUser((store.get('waHilos') || {})[id])); } catch {} }
      S.agentes[id] = a;
    }
    return S.agentes[id];
  }
  const guardarHilos = () => { if (!persiste) return; try { store.set('waHilos', Object.fromEntries(Object.entries(S.agentes).map(([k, a]) => [k, desdeUser(a.mensajes())]))); } catch {} };
  const setPersona = (id) => { S.persona = id; if (persiste) store.set('waPersona', id); emitUI({ type: 'whatsapp', que: 'persona', persona: id }); };

  // ---------- conversación «WhatsApp» visible en el Agente de la app ----------
  function items() { if (!S.items) { try { S.items = convs.obtener(CONV_ID).items || []; } catch { S.items = []; } } return S.items; }
  function registrar(k, text) { items().push({ k, text: String(text).slice(0, 4000), wa: true, t: now(), ...(S.persona ? { p: S.persona } : {}) }); try { convs.guardar(CONV_ID, { items: items(), messages: S.persona ? agenteDe(S.persona).mensajes() : [], titulo: 'WhatsApp · tu celular' }); convs.fijar(CONV_ID, true); } catch {} emitUI({ type: 'whatsapp', que: 'conversacion' }); }
  // cada respuesta va firmada por el personaje que habla («*Pedro* · Captación»); el menú y los avisos del sistema, sin firma
  async function enviar(texto, { sinFirma = false } = {}) {
    let t = String(texto || '').trim(); if (!t) return; if (S.persona && !sinFirma) t = `${P.firma(S.persona)}\n${t}`;
    if (srvOn()) { await servidor.ejecutivo.responder(t); registrar('bot', t); return; } // con la cuenta de Asset, por el servidor
    if (!S.contactId) return; await wa.enviar(S.contactId, t.slice(0, 3500)); registrar('bot', t);
  }

  // un aviso al celular del ejecutivo (también si aún no escribe en esta sesión: se usa el contacto guardado)
  async function avisarCorredor(t, como = null) {
    if (srvOn()) { if (!servidor.ejecutivo.estado().activo) return false; await enviar(como ? `${P.firma(como)}\n${t}` : t, { sinFirma: !!como }); return true; }
    const c = cfg(); if (!c.activo) return false; if (!S.contactId && c.contactId) S.contactId = c.contactId; if (!S.contactId) return false; await enviar(como ? `${P.firma(como)}\n${t}` : t, { sinFirma: !!como }); return true; }
  // ---------- eventos del agente → mensajes de WhatsApp ----------
  function evento(e, pid) {
    if (e.type === 'confirm') {
      if ((e.secretos || []).length) { setTimeout(() => agenteDe(pid).responder(e.id, { ok: false }), 0); enviar('Eso necesita la clave del certificado: hazlo desde la app.'); return; }
      S.pend = { id: e.id, desde: Date.now(), persona: pid };
      enviar(`*${e.titulo || 'Confirmar'}*\n${(e.detalle || []).map((d) => '• ' + d).join('\n')}${e.aviso ? '\n' + e.aviso : ''}\n\nResponde *SÍ* para confirmar o *NO* para cancelar.`);
    } else if (e.type === 'tarjeta' && e.tipo === 'dictado') { S.ficha = { campos: e.r.campos, texto: e.texto, persona: pid }; S.fichaEnviada = false; }
    else if (e.type === 'datos') emitUI({ type: 'datos', que: e.que });
  }

  // resumen de una propiedad dictada, para WhatsApp
  function resumenFicha(c) {
    const op = [c.venta && 'venta', c.arriendo && 'arriendo'].filter(Boolean).join(' y ');
    const pr = (p) => (p ? (p.moneda === 'CLP' ? '$' + Number(p.valor).toLocaleString('es-CL') : `${p.moneda} ${Number(p.valor).toLocaleString('es-CL')}`) : '');
    const f = dictado.faltan(c);
    const l = [`*${c.titulo || 'Propiedad nueva'}*`, [c.tipo, op].filter(Boolean).join(' en '), [c.direccion, c.unidad ? 'depto. ' + c.unidad : '', c.comuna].filter(Boolean).join(', '),
      [c.dormitorios != null && `${c.dormitorios}D`, c.banos != null && `${c.banos}B`, c.supUtil != null && `${c.supUtil} m² útiles`, c.supTotal != null && `${c.supTotal} m² totales`].filter(Boolean).join(' · '),
      [c.precioVenta && 'Venta ' + pr(c.precioVenta), c.precioArriendo && 'Arriendo ' + pr(c.precioArriendo), c.gastosComunes && 'GC $' + Number(c.gastosComunes).toLocaleString('es-CL')].filter(Boolean).join(' · '),
      (c.caracteristicas || []).length ? 'Incluye: ' + c.caracteristicas.join(', ') : '',
      c.propietario ? 'Propietario: ' + [c.propietario.nombre, c.propietario.rut, c.propietario.telefono, c.propietario.email].filter(Boolean).join(' · ') : ''].filter(Boolean);
    return `${l.join('\n')}${f.length ? `\n\nMe falta: ${f.map((x) => x.t.toLowerCase()).join(', ')}.` : ''}${(c.dudas || []).length ? '\nOjo: ' + c.dudas.join(' ') : ''}${dictado.avisos(c).map((x) => '\n⚠️ ' + x).join('')}\n\nResponde *CREAR* para guardarla, o dime qué corregir o agregar.`;
  }
  async function crearDesdeFicha() {
    const c = S.ficha.campos; const f = dictado.faltan(c).filter((x) => ['tipo', 'operacion', 'direccion'].includes(x.id));
    if (f.length) return enviar(`Para crearla necesito al menos: ${f.map((x) => x.t.toLowerCase()).join(', ')}.`);
    const p = await inmo.guardarPropiedad(dictado.aFicha(c)); inmo.registrar(p.id, 'Propiedad creada dictando por WhatsApp');
    const pr = await dictado.registrarPropietario(inmo, p.id, c.propietario); inmo.guardar(); S.ficha = null;
    emitUI({ type: 'datos', que: 'propiedades' });
    const dueno = !pr ? '' : pr.ok ? `\nPropietario: *${pr.nombre}*${pr.rut ? ' (' + pr.rut + ')' : ''} quedó registrado y vinculado.` : `\n⚠️ No pude registrar al propietario${pr.nombre ? ' ' + pr.nombre : ''}: ${pr.motivo}. La propiedad quedó creada sin propietario; dime el dato corregido y lo agrego.`;
    return enviar(`Listo: *${p.codigo}* · ${p.titulo} quedó en tu cartera.${dueno}\nPara las fotos, mándamelas por aquí con el código *${p.codigo}* en el mensaje, o súbelas en Asset desde la ficha.`);
  }

  // ---------- un mensaje del celular vinculado ----------
  async function texto(m) {
    const t = String(m.body || '').trim();
    const aud = (m.attachments || []).find((u) => /\.(ogg|opus|mp3|m4a|amr|aac|wav|webm)(\?|$)/i.test(u) || /audio/i.test(u));
    if (!aud) return t;
    try {
      const r = mock && /^mock:/.test(aud) ? { ok: true, arrayBuffer: async () => new Uint8Array(4000).buffer, headers: { get: () => 'audio/ogg' } } : await fetchFn(aud);
      if (!r.ok) throw new Error('no se pudo descargar el audio');
      const bytes = new Uint8Array(await r.arrayBuffer()); const mime = r.headers.get('content-type') || 'audio/ogg';
      const tr = await ai.transcribir({ bytes, mime }); registrar('user', `(audio) ${tr.texto}`); return { texto: tr.texto, audio: true, avisos: tr.avisos || [] };
    } catch (e) { await enviar('No pude escuchar el audio (' + e.message + '). ¿Me lo escribes?'); return null; }
  }
  // ---------- chat exportado de WhatsApp → lead (0.14) ----------
  const ES_CHAT = /\.(zip|txt)(\?|$)/i;
  async function bajar(url) {
    if (mock && /^mock:/.test(url)) { const x = global.__waChat || {}; return { bytes: Buffer.from(x.bytes || ''), nombre: x.nombre || 'chat.txt' }; }
    const r = await fetchFn(url); if (!r.ok) throw new Error('no se pudo descargar el archivo');
    const cd = r.headers.get('content-disposition') || ''; const fn = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd);
    let nombre = fn ? decodeURIComponent(fn[1]) : ''; if (!nombre) { try { nombre = decodeURIComponent(new URL(url).pathname.split('/').pop()); } catch { nombre = 'chat'; } }
    return { bytes: Buffer.from(await r.arrayBuffer()), nombre };
  }
  const fmtF = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '');
  function resumenLead(a) {
    const med = Object.entries(a.medios || {}).filter(([k]) => ['imagen', 'audio'].includes(k)).map(([k, n]) => `${n} ${k === 'imagen' ? (n > 1 ? 'fotos' : 'foto') : n > 1 ? 'audios' : 'audio'}`).join(', ');
    const otros = a.participantes.length > 1 ? `\nSi el cliente no es ${a.cliente || 'ese'}, responde con el número: ${a.participantes.map((p, i) => `${i + 1}) ${p.nombre}`).join(' · ')}` : '';
    return `*Chat de WhatsApp${a.cliente ? ' con ' + a.cliente : ''}*\n${a.total} mensajes, del ${fmtF(a.desde)} al ${fmtF(a.hasta)}${med ? ' · ' + med : ''}.${a.existente ? `\nYa lo tenías: agrego solo ${a.existente.nuevos} mensajes nuevos.` : ''}${!a.telefono && !a.existente ? '\nNo trae su número: mándamelo si lo tienes.' : ''}${otros}\n\nResponde *SÍ* para registrarlo como lead o *NO* para descartarlo.`;
  }
  async function chatExportado(url, m = {}) {
    if (!leads) return enviar('Recibí un archivo, pero esta versión de Asset no registra leads.');
    if (S.persona !== 'fernanda') setPersona('fernanda'); // los chats de clientes los ve Fernanda (Leads)
    try {
      const f = await bajar(url); if (!/\.(txt|zip)$/i.test(f.nombre) && /\.(txt|zip)\b/i.test(String(m.body || ''))) f.nombre = String(m.body).trim().split('\n')[0].slice(0, 120); // el nombre del archivo a veces viene como texto del mensaje
      const a = await leads.analizar({ bytes: f.bytes, nombre: f.nombre, miNombre: cfg().nombre || '' });
      if (!a.cliente) a.cliente = a.participantes.find((p) => !String(p.nombre).toLowerCase().includes(String(cfg().nombre || '~').toLowerCase().split(' ')[0]))?.nombre || a.participantes[0]?.nombre;
      S.lead = { a, telefono: a.telefono || '' }; registrar('user', `(chat exportado) ${f.nombre}`);
      return enviar(resumenLead(a));
    } catch (e) { registrar('user', '(archivo)'); return enviar(e.code === 'NO_CHAT' ? 'Recibí un archivo, pero no es un chat exportado de WhatsApp. Para registrar un lead: en el chat con el cliente › Exportar chat › envíamelo aquí.' : 'No pude leer el archivo: ' + String(e.message).slice(0, 160)); }
  }
  async function confirmarLead(tx) {
    const n = norm(tx); const L = S.lead; const solo = n.replace(/[\s+().-]/g, '');
    if (/^\d$/.test(solo) && L.a.participantes[Number(solo) - 1]) { L.a.cliente = L.a.participantes[Number(solo) - 1].nombre; return enviar(`Ok, el cliente es *${L.a.cliente}*. Responde *SÍ* para registrarlo.`); }
    if (/^\d{8,12}$/.test(solo)) { L.telefono = tx.trim(); return enviar(`Anoté su teléfono: ${L.telefono}. Responde *SÍ* para registrarlo.`); }
    if (NO.test(n)) { S.lead = null; return enviar('Ok, no lo registré.'); }
    if (!SI.test(n)) { S.lead = null; return false; } // otra cosa: se descarta el chat pendiente y sigue como mensaje normal
    S.lead = null;
    try {
      const r = await leads.importar({ token: L.a.token, cliente: L.a.cliente, telefono: L.telefono, origen: 'chat', brokerNombre: cfg().nombre || '', transcribir: true });
      const l = r.lead; const b = l.busqueda || {};
      const bq = [b.operacion && (b.operacion === 'arriendo' ? 'arriendo' : 'compra'), b.tipo, b.dormitorios != null && b.dormitorios + 'D', b.banos != null && b.banos + 'B', (b.comunas || []).join(', '), b.presupuesto && (b.presupuesto.moneda === 'UF' ? 'UF ' : '$') + Number(b.presupuesto.valor).toLocaleString('es-CL')].filter(Boolean).join(' · ');
      emitUI({ type: 'datos', que: 'leads' });
      return enviar(`Listo: *${l.nombre || l.telefono || l.chatCon}* quedó en tus Leads${r.nuevo ? '' : ` (${r.agregados} mensajes nuevos)`}.${bq ? '\nBusca: ' + bq : ''}${l.resumen ? '\n' + l.resumen : ''}${l.proximaAccion?.texto ? '\nPróxima acción: ' + l.proximaAccion.texto : ''}${r.ia?.error ? '\n(No pude analizarlo con IA: ' + r.ia.error + ')' : ''}`);
    } catch (e) { return enviar('No pude registrarlo: ' + String(e.message).slice(0, 160)); }
  }
  async function manejar(m) {
    S.ultimaActividad = Date.now();
    // un documento adjunto (no audio, foto ni video): puede ser el chat exportado aunque la URL no diga .txt/.zip
    const MEDIA = /\.(ogg|opus|mp3|m4a|amr|aac|wav|webm|jpe?g|png|webp|heic|gif|mp4|mov|3gp)(\?|$)/i;
    const doc = (m.attachments || []).find((u) => ES_CHAT.test(u) || (mock && /^mock:chat/.test(u))) || (m.attachments || []).find((u) => !MEDIA.test(u) && !/audio|image|video/i.test(u) && !(mock && /^mock:/.test(u)));
    if (doc) return chatExportado(doc, m);
    if (!(m.attachments || []).length && /^\s*(chat de whatsapp|whatsapp chat)[^\n]*\.(zip|txt)\s*$/i.test(String(m.body || ''))) { registrar('user', m.body); return enviar('Me llegó solo el nombre del archivo, no el archivo. Prueba exportando el chat con *Sin archivos* (queda un .txt) y envíamelo de nuevo. Si lo exportaste con fotos y audios (.zip), mejor arrástralo a Asset › Leads en el computador.'); }
    let tx = await texto(m); if (tx == null) return; let audio = false; let avisosAudio = []; if (typeof tx === 'object') { audio = true; avisosAudio = tx.avisos || []; tx = tx.texto; }
    if (!tx) return; if (!audio) registrar('user', tx);
    // lo que se entendió del audio (para que lo corrija si el ruido jugó una mala pasada) y los datos que no cuadraron
    if (audio) { await enviar(`🎙️ Entendí: «${tx.slice(0, 1200)}»${avisosAudio.map((a) => `\n⚠️ ${a}`).join('')}`, { sinFirma: true }); if (avisosAudio.length) tx += `\n\n[Aviso de la transcripción del audio: ${avisosAudio.join(' ')} No guardes ese dato sin que lo confirme.]`; }
    const n = norm(tx);
    const cambia = P.detectar(tx) || P.ES_MENU.test(n);
    if (!cambia) {
      if (S.lead && S.persona === 'fernanda' && (await confirmarLead(tx)) !== false) return;
      if (S.pend) { const { id, persona } = S.pend; if (SI.test(n)) { S.pend = null; agenteDe(persona).responder(id, { ok: true }); return; } S.pend = null; agenteDe(persona).responder(id, { ok: false }); if (NO.test(n)) return enviar('Cancelado.'); }
      if (S.ficha && S.persona === (S.ficha.persona || 'pedro') && !S.busy) {
        if (/^(crear|crea|cr[eé]ala|guardar|gu[aá]rdala|listo|s[ií])\b/.test(n)) return crearDesdeFicha();
        if (NO.test(n)) { S.ficha = null; return enviar('Ok, la descarté.'); }
        try { const r = await dictado.extraer({ texto: tx, previo: S.ficha.campos }); S.ficha.campos = { ...r.campos, dudas: r.dudas }; return enviar(resumenFicha(S.ficha.campos)); } catch (e) { return enviar(e.message); }
      }
    } else if (S.pend) { const { id, persona } = S.pend; S.pend = null; agenteDe(persona).responder(id, { ok: false }); } // cambiar de personaje cancela lo que esperaba un SÍ
    if (S.busy) { S.cola.push(tx); return enviar('Sigo con lo anterior; enseguida veo esto.'); }
    return rutear(tx);
  }
  // ---------- con quién habla: el nombre activa al personaje; sin personaje, se deduce por el tema o se pregunta ----------
  function retoma(id) {
    if (id === 'pedro' && S.ficha) return 'Tenemos pendiente la propiedad que me dictaste: responde *CREAR* para guardarla o dime qué corregir.';
    if (id === 'fernanda' && S.lead) return `Tenemos pendiente el chat${S.lead.a.cliente ? ' de ' + S.lead.a.cliente : ''}: responde *SÍ* para registrarlo como lead.`;
    if ((S.agentes[id] || null)?.mensajes().length || (persiste && ((store.get('waHilos') || {})[id] || []).length)) return 'Sigo con lo que estábamos viendo; cuéntame.';
    return '';
  }
  // al pasarle la conversación a otro personaje, se le cuenta lo último que se habló (códigos, nombres, lo pedido)
  function conContexto(tx) {
    const ult = items().filter((x) => x.k === 'user' || x.k === 'bot').slice(-8, -1).map((x) => `${x.k === 'user' ? 'Usuario' : 'Equipo'}: ${String(x.text).replace(/\n+/g, ' ').slice(0, 300)}`);
    return ult.length ? `[Contexto: lo último que habló el usuario con el equipo]\n${ult.join('\n')}\n[Lo que pide ahora]\n${tx}` : tx;
  }
  async function rutear(tx) {
    const n = norm(tx);
    if (P.ES_MENU.test(n)) return enviar(P.menu(), { sinFirma: true });
    // «mi nombre es Jero»: se recuerda para que el equipo lo trate por su nombre
    const mn = /^(?:mi nombre es|me llamo|llamame|dime)\s+([a-zñ]{2,20})\b/.exec(n); if (mn) setCfg({ apodo: mn[1][0].toUpperCase() + mn[1].slice(1) });
    const d = P.detectar(tx); let cambio = false;
    const pasa = !d && P.traspaso(tx);
    if (pasa && pasa !== S.persona) { // «pidámosle a Juanita»: Juanita retoma lo que se venía pidiendo
      setPersona(pasa); S.espera = null;
      correr(conContexto(`${tx}\n(El usuario te pasó a ti este pedido: retoma desde el contexto lo que estaba pidiendo y hazlo; no le vuelvas a preguntar lo que ya dijo.)`)); return;
    }
    if (d) {
      const antes = S.persona; setPersona(d.id);
      if (!d.resto) {
        if (S.espera) { const t = S.espera; S.espera = null; correr(t); return; } // lo que había pedido antes de elegir a quién
        if (antes && antes !== d.id && S.pregunta) { S.pregunta = false; correr(conContexto('(El usuario te pasó a ti lo que estaba haciendo con tu compañero: retómalo desde el contexto y hazlo.)')); return; }
        return enviar(P.saludo(d.id, { retoma: antes === d.id ? '' : retoma(d.id) }));
      }
      tx = d.resto; S.espera = null; cambio = antes !== d.id;
    } else if (S.persona && S.pregunta) {
      // 0.16.4 · si el que atiende te acaba de pedir un dato, tu respuesta es para él: no cambia de personaje
    } else {
      // 0.16.3 · cada uno toma lo suyo: «necesito una orden de visita» lo toma Juanita sin que la nombres
      const c = P.clasificar(tx, S.persona);
      if (!S.persona && !c) { S.espera = tx; return enviar(P.menu('Para ayudarte, ¿con quién de tu equipo quieres hablar?'), { sinFirma: true }); }
      if (c && c !== S.persona) { cambio = !!S.persona; setPersona(c); }
      S.espera = null;
    }
    if (S.ficha && S.persona === (S.ficha.persona || 'pedro')) return manejarFicha(tx);
    correr(cambio ? conContexto(tx) : tx); // sin esperar: el agente puede quedar esperando un SÍ que llega en el próximo mensaje
  }
  async function manejarFicha(tx) {
    const n = norm(tx);
    if (/^(crear|crea|cr[eé]ala|guardar|gu[aá]rdala|listo|s[ií])\b/.test(n)) return crearDesdeFicha();
    if (NO.test(n)) { S.ficha = null; return enviar('Ok, la descarté.'); }
    try { const r = await dictado.extraer({ texto: tx, previo: S.ficha.campos }); S.ficha.campos = { ...r.campos, dudas: r.dudas }; return enviar(resumenFicha(S.ficha.campos)); } catch (e) { return enviar(e.message); }
  }
  async function correr(tx) {
    S.busy = true; const pid = S.persona || 'diego';
    try {
      let tareas = null; try { tareas = equipoHoy ? equipoHoy().tareas[pid] || [] : null; } catch {}
      const quien = cfg().apodo ? `\nEl usuario (el corredor dueño de esta cuenta) se llama ${cfg().apodo}; trátalo por su nombre.` : '';
      const r = await agenteDe(pid).enviar(tx, { email: cfg().email || '', persona: P.prompt(pid, tareas) + quien });
      S.pregunta = !!r.text && /\?\s*$|p[aá]same|me falta|me faltan|dime |conf[ií]rma|resp[oó]nde|necesito (el|la|los|las|tu|su)/i.test(String(r.text).slice(-400));
      if (S.ficha && !S.fichaEnviada) { S.fichaEnviada = true; await enviar(resumenFicha({ ...S.ficha.campos })); }
      else if (r.text) await enviar(r.text);
    } catch (e) { await enviar(e.code === 'NO_TOKENS' ? 'No te quedan tokens del asistente. Recarga desde la app.' : 'No pude hacerlo: ' + String(e.message).slice(0, 200)); }
    finally { S.busy = false; guardarHilos(); const sig = S.cola.shift(); if (sig) rutear(sig); }
  }

  // ---------- revisar WhatsApp: vinculación por código y mensajes del celular vinculado ----------
  let revisando = null;
  // con cuenta de Asset: lo entrega el servidor. Sin cuenta o con la sesión vencida NO se lee WhatsApp directo desde aquí (solo PF_MOCK, para pruebas)
  async function revisar() { if (revisando) return revisando; if (!srvOn() && !mock) return { procesados: 0 }; revisando = (srvOn() ? revisarServidor() : revisar1()).finally(() => { revisando = null; }); return revisando; }
  // con la cuenta de Asset: lo que el servidor guardó del celular vinculado (y si recién se vinculó)
  async function revisarServidor() {
    const antes = !!servidor.ejecutivo.estado().activo;
    const items = await servidor.ejecutivo.entrantes(); const e = servidor.ejecutivo.estado();
    if (e.activo && !antes) { registrar('hecho', `Celular ${e.telefono || ''} vinculado`); emitUI({ type: 'whatsapp', que: 'vinculado' }); }
    for (const m of items) { S.contactId = 'servidor'; try { await manejar(m); } catch (er) { console.warn('[wa]', er.message); } }
    return { procesados: items.length };
  }
  async function revisar1() {
    const c = cfg(); if (!c.activo && !c.codigo) return { procesados: 0 };
    const convsWa = await wa.conversaciones(); let procesados = 0;
    for (const cv of convsWa) {
      const mio = c.telefono && dig(cv.phone) === dig(c.telefono);
      // 0.16.8 · además del celular vinculado, las personas del CRM (si la atención de clientes está activa)
      // 0.16.10 · los leads los atiende siempre Fernanda; el resto del CRM, si la atención de clientes está activa
      const cli = !mio && c.activo && clientes ? clientes.atiende(cv.phone) : null;
      if (!mio && !c.codigo && !cli) continue; // solo interesa el celular vinculado (o encontrar el código de vinculación)
      // conversación nueva de un cliente: se mira desde el último mensaje que Asset le mandó (así su respuesta no se pierde)
      const desdeCli = cli ? clientes.desdePara(cv.phone) : null;
      const v = (S.vistos[cv.id] ||= { ultimo: null, desde: desdeCli && desdeCli < now() ? desdeCli : now() });
      const marca = cv.lastMessageDate ?? cv.dateUpdated ?? null; if (marca != null && v.marca === marca) continue;
      const msgs = await wa.mensajes(cv.id); v.marca = marca;
      const ix = v.ultimo ? msgs.findIndex((x) => x.id === v.ultimo) : -1;
      const nuevos = (ix >= 0 ? msgs.slice(ix + 1) : msgs.filter((x) => new Date(x.dateAdded) >= new Date(v.desde))).filter((x) => x.direction === 'inbound');
      if (msgs.length) v.ultimo = msgs.at(-1).id;
      for (const m of nuevos) {
        if (c.codigo && norm(m.body).replace(/\s+/g, '').includes(norm(c.codigo).replace(/\s+/g, ''))) {
          setCfg({ telefono: cv.phone, codigo: null, activo: true, vinculado: now() }); S.contactId = cv.contactId;
          await wa.enviar(cv.contactId, `Listo, este celular quedó conectado a PortalFirma Asset${c.nombre ? ' de ' + c.nombre : ''}.\n\n${P.menu('Tu equipo:')}\nTambién puedes mandar audios.`);
          registrar('hecho', `Celular ${cv.phone} vinculado`); emitUI({ type: 'whatsapp', que: 'vinculado' }); procesados++; continue;
        }
        if (cfg().activo && cfg().telefono && dig(cv.phone) === dig(cfg().telefono)) { S.contactId = cv.contactId; if (cfg().contactId !== cv.contactId) setCfg({ contactId: cv.contactId }); procesados++; await manejar(m); }
      }
      // cliente del CRM: los mensajes que llegaron juntos se responden en una sola vuelta
      if (cli && nuevos.length && !(c.codigo && nuevos.some((m) => norm(m.body).replace(/\s+/g, '').includes(norm(c.codigo).replace(/\s+/g, ''))))) {
        const junto = { id: nuevos.at(-1).id, body: nuevos.map((m) => m.body).filter(Boolean).join('\n'), attachments: nuevos.flatMap((m) => m.attachments || []), dateAdded: nuevos.at(-1).dateAdded };
        try { if (await clientes.manejar(cv, junto, cli, msgs)) procesados++; } catch (e) { try { await avisarCorredor(`No pude responderle a ${cli.nombre} por WhatsApp: ${String(e.message).slice(0, 160)}`); } catch {} }
      }
    }
    if (persiste) store.set('waAgenteVistos', S.vistos);
    return { procesados };
  }
  // ritmo: rápido si hay una conversación activa (últimos 10 min) o algo pendiente
  const ritmo = () => (srvOn() ? (servidor.ejecutivo.estado().activo || servidor.ejecutivo.estado().codigo ? 3000 : 15000) : S.busy || S.pend || S.ficha || S.lead || Date.now() - S.ultimaActividad < 10 * 6e4 || cfg().codigo ? 3000 : 8000);

  return {
    estado: () => {
      if (srvOn()) { const e = servidor.ejecutivo.estado(); return { activo: !!e.activo, telefono: e.telefono, codigo: e.codigo, numeroEmpresa: e.numeroEmpresa, vinculado: e.vinculado || null, ocupado: S.busy, pendiente: !!(S.pend || S.ficha || S.lead), persona: S.persona, enServidor: true }; }
      const c = cfg(); return { activo: !!c.activo, telefono: c.telefono, codigo: c.codigo, numeroEmpresa: c.numeroEmpresa, vinculado: c.vinculado || null, ocupado: S.busy, pendiente: !!(S.pend || S.ficha || S.lead), persona: S.persona }; },
    vincular: ({ nombre, email } = {}) => {
      if (srvOn()) { setCfg({ nombre: nombre || '', email: email || cfg().email || '' }); return servidor.ejecutivo.vincular({ ...(nombre ? { nombre } : {}), ...(email ? { email } : {}) }); }
      const codigo = 'ASSET ' + String(1000 + Math.floor(Math.random() * 9000)); setCfg({ codigo, nombre: nombre || '', email: email || cfg().email || '' }); for (const k of Object.keys(S.vistos)) S.vistos[k].desde = now(); return { codigo, numeroEmpresa: cfg().numeroEmpresa }; },
    desvincular: () => {
      if (srvOn()) { S.pend = null; S.ficha = null; S.espera = null; setPersona(null); return servidor.ejecutivo.desvincular(); }
      setCfg({ telefono: null, codigo: null, activo: false, vinculado: null }); S.pend = null; S.ficha = null; S.espera = null; setPersona(null); return true; },
    configurar: (o = {}) => {
      if (srvOn()) { if (o.email) setCfg({ email: o.email }); return servidor.ejecutivo.configurar({ ...(o.activo !== undefined ? { activo: !!o.activo } : {}), ...(o.email ? { email: String(o.email) } : {}), ...(o.numeroEmpresa ? { numeroEmpresa: String(o.numeroEmpresa) } : {}) }); }
      const x = {}; if (o.activo !== undefined) x.activo = !!o.activo && !!cfg().telefono; if (o.numeroEmpresa) x.numeroEmpresa = String(o.numeroEmpresa).slice(0, 30); if (o.email) x.email = o.email; setCfg(x); return cfg(); },
    revisar, ritmo, _S: S,
    // un aviso al celular del ejecutivo (p. ej. «le envié el recordatorio a…»), firmado por quien esté activo
    avisar: (t) => avisarCorredor(t),
    avisarComo: (id, t) => avisarCorredor(t, id),
  };
}

module.exports = { crear };
