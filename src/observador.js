// 0.16.22 · Observador de Leads (en vivo, solo lectura): cada pocos minutos lee en wechatia las conversaciones de
// Instagram, Facebook Messenger y correo, y las anota en Leads (una por persona) con su historial; la IA deja el perfil,
// qué busca y los datos de contacto. Nunca responde ni envía nada por esos canales.
'use strict';
const H = require('./hora');
const { fechaLocal } = require('./instagram-import');

const CANALES = { instagram: { re: /INSTAGRAM/i, t: 'Instagram' }, facebook: { re: /FACEBOOK/i, t: 'Facebook Messenger' }, email: { re: /EMAIL/i, t: 'Correo' } };
const canalDe = (tipo) => Object.keys(CANALES).find((k) => CANALES[k].re.test(String(tipo || ''))) || null;
const limpiarHtml = (s) => String(s || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
// en un correo, lo citado de mensajes anteriores no se repite
const sinCita = (t) => String(t).split(/\n(?:El .{5,80} escribió:|On .{5,80} wrote:|-----Original Message-----|De: .+\nEnviado:)/)[0].trim();

function crear({ res, leads, store, emit = () => {}, ai = true, corredores = null }) {
  const cfg = () => ({ activo: false, canales: { instagram: true, facebook: true, email: true }, ia: true, diasInicio: 30, ...(store.get('observador') || {}) });
  const est = () => store.get('observadorEstado') || { conv: {}, ultima: null, error: null, leads: 0 };
  const guardarEst = (e) => store.set('observadorEstado', e);
  let corriendo = null;

  async function revisar({ forzar = false } = {}) {
    if (corriendo) return corriendo;
    corriendo = ronda(forzar).finally(() => { corriendo = null; });
    return corriendo;
  }
  async function ronda(forzar) {
    const c = cfg(); const e = est(); e.conv ||= {};
    if (!c.activo && !forzar) return { activo: false };
    const resumen = { revisadas: 0, nuevos: 0, mensajes: 0, analizados: 0 };
    try {
      const j = await res.api('GET', `/conversations/search?locationId=${encodeURIComponent(res.locationId() || '')}&sortBy=last_message_date&sort=desc&limit=50`);
      const desde = Date.now() - (c.diasInicio || 30) * 864e5;
      const todas = (j.conversations || []).map((x) => ({ ...x, canal: canalDe(x.lastMessageType || x.type) }));
      const convs = todas.filter((x) => x.canal && c.canales[x.canal]);
      // 0.16.23 · dueño del lead = «Propietario» del contacto en wechatia (si cambia allá, se actualiza aquí y queda en el historial)
      e.duenos ||= {};
      const dueno = (cv, leadId) => { const u = cv.assignedTo || null; if (!corredores || !leadId || e.duenos[cv.id] === u) return; e.duenos[cv.id] = u; const co = corredores.porWechatia(u); if (co) { try { leads.asignar(leadId, co.id, 'wechatia'); } catch {} } };
      for (const cv of todas) if (!cv.canal && cv.assignedTo && cv.phone) { const l = leads.porTelefono(cv.phone); if (l) dueno(cv, l.id); } // WhatsApp: solo el dueño
      const paraIA = [];
      for (const cv of convs) {
        const marca = cv.lastMessageDate ?? cv.dateUpdated ?? null; const prev = e.conv[cv.id];
        const tm = Number.isFinite(Number(marca)) ? Number(marca) : Date.parse(marca);
        if (!prev && tm && tm < desde) continue; // conversaciones antiguas: no se traen al activar
        if (prev && prev.marca === marca && !forzar) { dueno(cv, prev.lead); continue; }
        resumen.revisadas++;
        const mj = await res.api('GET', `/conversations/${cv.id}/messages?limit=100`);
        const lista = (mj.messages?.messages || mj.messages || []).filter((m) => m && m.id);
        const mensajes = lista.filter((m) => canalDe(m.messageType || m.type) || !m.messageType).map((m) => {
          let texto = m.body || ''; let asunto = '';
          if (cv.canal === 'email') { asunto = m.meta?.email?.subject || m.subject || ''; texto = sinCita(limpiarHtml(texto)); }
          const adj = (m.attachments || []).map((a) => (typeof a === 'string' ? a : a?.url)).filter(Boolean);
          if (adj.length) texto = [texto, ...adj.map((u) => '📎 ' + u)].filter(Boolean).join('\n');
          return { id: m.id, fecha: fechaLocal(new Date(m.dateAdded || Date.now()).getTime()), de: m.direction === 'inbound' ? 'cliente' : 'broker', texto: (asunto && cv.canal === 'email' ? `[${asunto}] ` : '') + texto, asunto };
        }).filter((m) => m.texto.trim());
        const r = leads.registrarCanal({ canal: cv.canal, convId: cv.id, contactId: cv.contactId || '', nombre: cv.fullName || cv.contactName || '', email: cv.email || '', telefono: cv.phone || '', usuario: cv.canal === 'instagram' ? (cv.instagramUsername || cv.username || '') : '', mensajes });
        e.conv[cv.id] = { marca, lead: r.id, canal: cv.canal }; dueno(cv, r.id);
        if (r.nuevo) resumen.nuevos++; resumen.mensajes += r.agregados;
        if (r.delCliente && !paraIA.includes(r.id)) paraIA.push(r.id);
      }
      // IA: perfil, búsqueda y contacto (hasta 5 por ronda, para no gastar de más)
      if (c.ia && ai) for (const id of paraIA.slice(0, 5)) { try { await leads.analizarConIA(id); resumen.analizados++; } catch (er) { if (/saldo|token/i.test(er.message)) break; } }
      e.ultima = new Date().toISOString(); e.error = null; e.leads = new Set(Object.values(e.conv).map((x) => x.lead)).size; e.ultimo = resumen;
    } catch (er) {
      e.error = er.code === 'SIN_CLAVE' ? 'Falta conectar wechatia: pega la clave de la integración privada en Postventa › WhatsApp.' : /permiso|403|401|CLAVE/i.test(er.message + (er.code || '')) ? 'La clave de wechatia no tiene permiso para ver conversaciones. Agrega «Ver conversaciones» y «Ver mensajes de conversaciones» a la integración privada.' : er.message;
    }
    guardarEst(e); if (resumen.mensajes) emit({ type: 'datos', que: 'leads' });
    return { activo: c.activo, ...resumen, error: e.error };
  }
  function estado() { const c = cfg(); const e = est(); const por = {}; for (const x of Object.values(e.conv || {})) por[x.canal] = (por[x.canal] || 0) + 1;
    return { ...c, ultima: e.ultima || null, error: e.error || null, leads: e.leads || 0, porCanal: por, ultimo: e.ultimo || null, canalesTxt: Object.fromEntries(Object.entries(CANALES).map(([k, v]) => [k, v.t])) }; }
  function configurar(o = {}) {
    const c = cfg(); const antes = c.activo;
    if (o.activo !== undefined) c.activo = !!o.activo;
    if (o.canales) for (const k of Object.keys(CANALES)) if (o.canales[k] !== undefined) c.canales[k] = !!o.canales[k];
    if (o.ia !== undefined) c.ia = !!o.ia;
    if (o.diasInicio) c.diasInicio = Math.max(1, Math.min(365, Number(o.diasInicio) || 30));
    if (c.activo && !antes) { if (!o.autorizado) throw Object.assign(new Error('Confirma que la corredora autoriza leer y guardar estas conversaciones.'), { code: 'AUT' });
      leads.consentir({ canal: 'wechatia', cuenta: Object.keys(CANALES).filter((k) => c.canales[k]).map((k) => CANALES[k].t).join(', '), autorizadoPor: String(o.autorizadoPor || '').slice(0, 120), conversaciones: 0 }); }
    store.set('observador', c); return estado();
  }
  return { revisar, estado, configurar, canalDe, CANALES };
}
module.exports = { crear, canalDe, limpiarHtml, sinCita };
