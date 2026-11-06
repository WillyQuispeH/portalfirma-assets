// 0.16.16 · Control del flujo de firma de lo que se envía desde Asset.
//  · Lee el número de operación de cualquier respuesta de Portalfirma (antes cada ruta lo buscaba distinto y a veces
//    se perdía: el agente no podía seguir la firma).
//  · Registra cada envío en «Mis operaciones» con su propiedad, negocio, documento y firmantes (con su calidad).
//  · Sigue solo cada operación en firma: quién firmó, quién falta, cuándo quedó lista o legalizada; avisa al ejecutivo.
//  · Revisa correo y celular de cada firmante ANTES de enviar (para que el enlace de Portalfirma llegue) y permite
//    corregir el dato de un firmante y reenviarle el enlace. Los enlaces los envía Portalfirma, no Asset.
//  · Con la cuenta de Asset, el registro vive en la base (tabla firmas, vía inmo: agregarFirma, actualizarFirma,
//    todasLasFirmas, registrarEnvio): toda la corredora ve qué está en firma. La ronda la hace el equipo de quien
//    envió (la consulta a Portalfirma va con su cuenta) y lo que encuentra queda en la base para todos.
'use strict';
const store = require('./store');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const err = (m) => new Error(m);

// ---------- número de operación ----------
function buscar(obj, re, d = 0) {
  if (!obj || typeof obj !== 'object' || d > 6) return undefined;
  for (const [k, v] of Object.entries(obj)) if (re.test(k) && (typeof v === 'number' || /^\d{2,}$/.test(String(v)))) return Number(v);
  for (const v of Object.values(obj)) { const x = buscar(v, re, d + 1); if (x !== undefined) return x; }
}
function operacionDe(r) {
  if (r == null) return null;
  if (typeof r === 'number') return r;
  if (typeof r === 'string') { try { return operacionDe(JSON.parse(r)); } catch {} const m = r.match(/operaci[oó]n\D{0,12}(\d{3,})/i) || r.match(/operation\D{0,12}(\d{3,})/i); return m ? Number(m[1]) : null; }
  const v = r.operation ?? r.operacion ?? r.operationNumber ?? r.numberOperation ?? r.data?.operation ?? buscar(r, /^(operation|operacion|operationNumber|numberOperation|operation_number|nro_operacion)$/i) ?? buscar(r, /operation|operaci/i);
  if (v != null && Number(v)) return Number(v);
  if (typeof r.message === 'string' || typeof r.text === 'string') return operacionDe(r.message || r.text);
  return null;
}

// ---------- calidades en que firma una persona (alias que va a Portalfirma) ----------
const CALIDADES = ['arrendador', 'arrendatario', 'codeudor', 'aval', 'fiador', 'mandante', 'mandatario', 'corredor', 'propietario', 'vendedor', 'comprador', 'promitente vendedor', 'promitente comprador', 'oferente', 'visitante', 'pagador', 'receptor', 'representante', 'testigo'];
const calidad = (a) => { const t = norm(a); return CALIDADES.find((c) => norm(c) === t) || String(a || '').trim().toLowerCase(); };

// ---------- revisión de contacto (para que el enlace de firma llegue) ----------
const TYPOS = { 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.cl': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.con': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'homail.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'outllok.com': 'outlook.com', 'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'icloud.co': 'icloud.com', 'iclod.com': 'icloud.com' };
function celular(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('56')) d = d.slice(2);
  if (d.length === 8 && !d.startsWith('9')) return { ok: false, motivo: 'parece un teléfono fijo (el enlace por WhatsApp o SMS necesita un celular)' };
  if (d.length === 8) d = '9' + d;
  if (d.length !== 9 || !d.startsWith('9')) return String(t || '').trim().startsWith('+') && !String(t).trim().startsWith('+56') && String(t).replace(/\D/g, '').length >= 8
    ? { ok: true, valor: '+' + String(t).replace(/\D/g, ''), extranjero: true } : { ok: false, motivo: 'no es un celular chileno válido (+56 9 y 8 dígitos)' };
  if (/^9(\d)\1{7}$/.test(d) || d === '912345678') return { ok: false, motivo: 'parece un número de ejemplo' };
  return { ok: true, valor: '+56' + d };
}
function correo(e) {
  const s = String(e || '').trim().toLowerCase();
  if (!s) return { ok: false, motivo: 'falta el correo' };
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s)) return { ok: false, motivo: 'no es un correo válido' };
  const dom = s.split('@')[1];
  if (TYPOS[dom]) return { ok: false, motivo: `¿quisiste decir @${TYPOS[dom]}?`, sugerencia: s.replace(/@.*/, '@' + TYPOS[dom]) };
  if (/\.(con|cpm|comm|cl\.|om)$/.test(dom)) return { ok: false, motivo: 'el final del correo parece mal escrito' };
  if (/^(test|prueba|ejemplo|example|correo|mail|noreply|no-reply|asdf)@/.test(s) || /(example|ejemplo|test)\.(com|cl)$/.test(dom)) return { ok: false, motivo: 'parece un correo de ejemplo' };
  return { ok: true, valor: s };
}
// revisa los firmantes; devuelve problemas por firmante (vacío = todo bien) y los repetidos entre firmantes
function revisarFirmantes(firmantes = []) {
  const out = []; const visto = { e: {}, t: {} };
  for (const f of firmantes) {
    const q = []; const c = correo(f.email); const t = celular(f.telefono);
    if (!c.ok) q.push(`correo: ${c.motivo}`);
    if (!t.ok) q.push(`celular: ${t.motivo}`);
    const ke = c.valor; const kt = t.valor;
    if (ke) { if (visto.e[ke]) q.push(`el mismo correo que ${visto.e[ke]}: el enlace le llegaría a la persona equivocada`); else visto.e[ke] = f.nombre || 'otro firmante'; }
    if (kt) { if (visto.t[kt]) q.push(`el mismo celular que ${visto.t[kt]}`); else visto.t[kt] = f.nombre || 'otro firmante'; }
    if (q.length) out.push({ nombre: f.nombre, calidad: f.alias || f.titulo, problemas: q, sugerencia: c.sugerencia || null });
  }
  return out;
}

function crear({ inmo, pf, negocios = null, aviso = () => {}, alDetalle = () => {} }) {
  // ---------- registro en «Mis operaciones» ----------
  function registrar({ operacion, nombre, propId = null, negocioId = null, firmantes = [], origen = 'asset', tipoFirma = null, tramite = null }) {
    const op = Number(operacion); if (!op) return null;
    const e = { operation: op, name: nombre, date: new Date().toISOString(), propId, negocioId, origen, tipoFirma, tramite,
      firmantes: firmantes.map((f) => ({ nombre: f.nombre, rut: f.rut, calidad: calidad(f.alias || f.calidad || f.rol), email: f.email || '', telefono: f.telefono || '' })) };
    if (inmo.registrarEnvio) { inmo.registrarEnvio(e); return e; }
    const h = store.get('history') || []; const i = h.findIndex((x) => Number(x.operation) === op);
    if (i >= 0) h[i] = { ...h[i], ...e }; else h.unshift(e);
    store.set('history', h.slice(0, 500)); return e;
  }
  const meta = (op) => (inmo.historialEnvios ? inmo.historialEnvios() : store.get('history') || []).find((x) => Number(x.operation) === Number(op)) || null;

  // ---------- documentos en firma (los de la cartera) ----------
  // cada firma con su (primera) propiedad: { p, f }
  function conPropiedad(f) { const ids = f.propIds || []; return { p: ids.length ? inmo.todas().find((x) => ids.includes(x.id)) || null : null, f }; }
  function enFirmaTodas() {
    if (inmo.todasLasFirmas) return inmo.todasLasFirmas().filter((f) => f.operacion).map(conPropiedad);
    const out = []; for (const p of inmo.todas()) for (const f of p.firmas || []) if (f.operacion) out.push({ p, f }); return out;
  }
  const enFirma = () => enFirmaTodas().filter(({ f }) => !['firmado', 'anulado', 'rechazado'].includes(f.estado));
  // la ronda revisa lo que envió este usuario (con la API; la consulta a Portalfirma va con su cuenta)
  const mia = (f) => !inmo.API || !f.enviadoPorId || f.enviadoPorId === inmo.usuario?.()?.id;
  const dias = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  // detalle de Portalfirma → estado normalizado
  function leerDetalle(d, previo) {
    const sig = (d?.signatories || []).map((s) => ({ nombre: [s.name, s.paternalLastName, s.maternalLastName].filter(Boolean).join(' ') || s.fullName || '', rut: s.rut || '', email: s.email || '', telefono: s.phone || '', firmo: !!s.signed,
      personId: s.personId || s.person_id || null, firmanteId: s.contractSignatoryId || s.id || null, entidadId: s.contractEntityPersonId || null, calidad: s.alias || null, url: s.url || null }));
    const firmados = sig.filter((s) => s.firmo).length;
    const legal = !!(d?.legalized || d?.protocolizationNumber && d.protocolizationNumber !== 'none' && d?.status === 'finalized');
    const estado = d?.status === 'unPayed' ? 'pendiente_pago' : sig.length && firmados === sig.length || d?.status === 'finalized' ? 'firmado' : /cancel|anul|reject|rechaz/i.test(String(d?.status)) ? 'anulado' : 'en_firma';
    // calidades: las que mandó Asset (por RUT) si Portalfirma no las informa
    const m = previo?.firmantes || [];
    for (const s of sig) if (!s.calidad) s.calidad = (m.find((x) => x.rut && inmo.fmtRut(x.rut) === inmo.fmtRut(s.rut)) || {}).calidad || (m.find((x) => x.rol && x.rut === s.rut) || {}).rol || null;
    return { estado, firmados, total: sig.length, firmantes: sig, legalizado: legal, tramite: d?.protocolizationNumber || 'none', archivos: (d?.files || []).map((x) => x.fileName) };
  }
  async function detalle(op) {
    const r = await pf.callRaw('process_detail_get_by_operation', { operation: Number(op) });
    let d = null; try { d = JSON.parse(r.text); } catch {}
    if (r.isError || !d) throw err('Portalfirma no entregó el detalle de la operación ' + op + (r.text ? ': ' + String(r.text).slice(0, 160) : '.'));
    try { alDetalle(Number(op), d); } catch {}
    return d;
  }

  // revisa una operación y actualiza la ficha (y el negocio): devuelve el estado y lo que cambió
  async function revisar(op) {
    op = Number(String(op).replace(/\D/g, '')); if (!op) throw err('Indica el número de operación.');
    const loc = enFirmaTodas().find((x) => Number(x.f.operacion) === op) || null;
    const x = leerDetalle(await detalle(op), loc?.f || meta(op));
    const cambios = [];
    if (loc) {
      const antes = loc.f; const yaFirmaron = new Set((antes.firmantes || []).filter((s) => s.firmo).map((s) => inmo.fmtRut(s.rut)));
      for (const s of x.firmantes) if (s.firmo && !yaFirmaron.has(inmo.fmtRut(s.rut))) cambios.push(`${s.nombre || 'Un firmante'}${s.calidad ? ` (${s.calidad})` : ''} firmó «${antes.plantilla}»`);
      if (x.estado === 'firmado' && antes.estado !== 'firmado') cambios.push(`«${antes.plantilla}» quedó firmado por todos`);
      if (x.legalizado && !antes.legalizado) cambios.push(`«${antes.plantilla}» quedó legalizado`);
      inmo.actualizarFirma(op, (f) => {
        const prevF = f.firmantes || [];
        f.firmantes = x.firmantes.map((s) => ({ ...(prevF.find((y) => y.rut && inmo.fmtRut(y.rut) === inmo.fmtRut(s.rut)) || {}), nombre: s.nombre || undefined, rut: s.rut ? inmo.fmtRut(s.rut) : '', rol: s.calidad || prevF.find((y) => inmo.fmtRut(y.rut) === inmo.fmtRut(s.rut))?.rol || '', firmo: s.firmo, email: s.email, telefono: s.telefono }));
        if (x.estado === 'firmado' && f.estado !== 'firmado') f.firmado = new Date().toISOString();
        f.estado = x.estado; f.legalizado = x.legalizado; f.revisado = new Date().toISOString();
      }, cambios.length ? cambios.join(' · ') + ` (operación ${op})` : null);
      if (x.estado === 'firmado' && negocios && loc.f.negocioId) await negocios.revisarFirmas(pf, loc.f.negocioId).catch(() => null);   // el negocio avanza solo
    }
    return { operacion: op, ...x, documento: loc?.f.plantilla || meta(op)?.name || null, propiedad: loc?.p ? { id: loc.p.id, codigo: loc.p.codigo } : null, cambios,
      pendientes: x.firmantes.filter((s) => !s.firmo).map((s) => ({ nombre: s.nombre, calidad: s.calidad, email: s.email, telefono: s.telefono })),
      diasEnFirma: loc ? dias(loc.f.fecha) : null };
  }

  // ronda automática: revisa lo que está en firma (de a uno, sin apuro) y avisa los cambios al ejecutivo
  let corriendo = false;
  async function ronda() {
    // con la cuenta de Asset la revisa el servidor (para toda la corredora): «revisar ahora» se lo pide; los cambios
    // llegan por la sincronización y los avisos (avisos.js)
    if (inmo.API) { const r = await require('./asset').llamar('POST', '/firmas/revisar'); try { await inmo.sincronizar?.(); } catch {} return r.cambios || []; }
    if (corriendo) return []; corriendo = true; const avisos = [];
    try {
      for (const { f } of enFirma().filter(({ f }) => mia(f))) {
        if (f.revisado && Date.now() - new Date(f.revisado).getTime() < 4 * 60 * 1000) continue;
        try { const r = await revisar(f.operacion); if (r.cambios.length) { avisos.push(...r.cambios); aviso(r); } } catch (e) { if (e.code === 'NEEDS_LOGIN') break; }
      }
      // las firmas ligadas a etapas de negocios (carta oferta, promesa…) también se revisan solas
      if (negocios) for (const n of negocios.listar().negocios.filter((x) => x.estado === 'abierto' && Object.values(x.firmas || {}).some((y) => y.operacion && y.estado !== 'firmado'))) {
        try { const r = await negocios.revisarFirmas(pf, n.id); if (r?.mensajes?.length) { avisos.push(...r.mensajes); aviso({ cambios: r.mensajes, negocioId: n.id }); } } catch (e) { if (e.code === 'NEEDS_LOGIN') break; }
      }
    } finally { corriendo = false; }
    return avisos;
  }
  // lista para el agente y para «Hoy»: qué está en firma, quién falta y hace cuántos días
  function pendientes({ propId = null } = {}) {
    return enFirma().filter((x) => x.p && (!propId || x.p.id === propId)).map(({ p, f }) => ({ operacion: f.operacion, documento: f.plantilla, propiedad: p.codigo, estado: f.estado, dias: dias(f.fecha),
      firmados: (f.firmantes || []).filter((s) => s.firmo).length, total: (f.firmantes || []).length,
      faltan: (f.firmantes || []).filter((s) => !s.firmo).map((s) => `${s.nombre}${s.rol ? ' (' + s.rol + ')' : ''}`),
      atrasada: dias(f.fecha) >= 3 && (f.firmantes || []).some((s) => !s.firmo) }));
  }

  // ---------- reenviar el enlace y corregir el dato de un firmante ----------
  async function firmanteDe(op, ref) {
    const d = await detalle(op); const x = leerDetalle(d, meta(op)); const r = norm(ref); const rr = String(ref || '').replace(/[^0-9kK]/g, '').toUpperCase();
    const l = x.firmantes.filter((s) => (rr.length > 6 && String(s.rut).replace(/[^0-9kK]/g, '').toUpperCase() === rr) || norm(s.nombre).includes(r) || (s.calidad && norm(s.calidad) === r));
    if (!l.length) throw err(`En la operación ${op} no hay un firmante «${ref}». Firmantes: ${x.firmantes.map((s) => s.nombre + (s.calidad ? ' (' + s.calidad + ')' : '')).join(', ')}.`);
    if (l.length > 1) throw err(`Hay ${l.length} firmantes que coinciden con «${ref}»: ${l.map((s) => s.nombre).join(', ')}. ¿Cuál?`);
    return { s: l[0], d };
  }
  async function reenviar({ operacion, firmante, via = 'correo' }) {
    const { s } = await firmanteDe(operacion, firmante); if (s.firmo) throw err(`${s.nombre} ya firmó.`);
    if (via === 'whatsapp') { if (!celular(s.telefono).ok && !s.personId) throw err(`${s.nombre} no tiene un celular válido en la operación: corrígelo primero.`); await pf.manage({ action: 'send_signature_link_by_whatsapp', operation: Number(operacion), personId: s.personId }); }
    else { const c = correo(s.email); if (!c.ok) throw err(`El correo de ${s.nombre} (${s.email || 'sin correo'}) ${c.motivo}: corrígelo primero.`); await pf.manage({ action: 'send_signature_link_by_email', email: s.email, name: s.nombre, link: String(s.url || '').trim(), operation: Number(operacion) }); }
    return { ok: true, operacion: Number(operacion), firmante: s.nombre, via, a: via === 'whatsapp' ? s.telefono : s.email };
  }
  async function corregir({ operacion, firmante, email = null, telefono = null, reenviarLink = true }) {
    const { s, d } = await firmanteDe(operacion, firmante); if (s.firmo) throw err(`${s.nombre} ya firmó: no hace falta corregir.`);
    const c = email ? correo(email) : null; if (c && !c.ok) throw err(`El correo nuevo ${c.motivo}.`);
    const t = telefono ? celular(telefono) : null; if (t && !t.ok) throw err(`El celular nuevo ${t.motivo}.`);
    if (!c && !t) throw err('Indica el correo o el celular correcto.');
    await pf.manage({ action: 'update_signatory_data', contract_id: d.contractId || d.contract_id || '', contractSignatoryId: s.firmanteId || '', contractEntityPersonId: s.entidadId || '', person_id: s.personId || '', ...(c ? { email: c.valor } : {}), ...(t ? { phone: t.valor } : {}) });
    // el CRM queda corregido también
    const per = inmo.listar().personas.find((x) => x.rut && s.rut && inmo.fmtRut(x.rut) === inmo.fmtRut(s.rut));
    if (per) try { await inmo.guardarPersona({ ...per, ...(c ? { email: c.valor } : {}), ...(t ? { telefono: t.valor } : {}) }); inmo.registrar(per.id, `Dato de contacto corregido en la operación ${operacion}`); } catch {}
    let r = null; if (reenviarLink) { try { await pf.manage({ action: 'resend_signatory_to_sign', contract_id: d.contractId || d.contract_id || '', contractSignatoryId: s.firmanteId || '', person_id: s.personId || '' }); r = 'reenviado'; } catch (e) { r = 'no se pudo reenviar: ' + e.message; } }
    return { ok: true, operacion: Number(operacion), firmante: s.nombre, email: c?.valor || null, telefono: t?.valor || null, enlace: r, crm: !!per };
  }

  return { operacionDe, registrar, meta, revisar, ronda, pendientes, reenviar, corregir, revisarFirmantes, correo, celular, CALIDADES, calidad };
}

module.exports = { crear, operacionDe, revisarFirmantes, correo, celular, CALIDADES, calidad };
