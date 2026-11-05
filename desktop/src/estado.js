// Estado de una propiedad «de un vistazo» (lo primero que se ve al elegirla) y «Anotar lo que pasó»:
// notas de lo ocurrido fuera de Asset (llamadas, visitas, ofertas) que proponen el siguiente paso sin imponerlo.
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const primer = (n) => { const x = String(n || '').trim().split(/\s+/)[0] || ''; return x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : ''; };
const DIAS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const TIPO_NOTA = { llamada: 'Llamé', visita: 'Visitó la propiedad', documentos: 'Envió documentos', oferta: 'Hizo una oferta', otro: '' };

// «el jueves», «mañana», «14/10», «a las 11», «16:30» → fecha y hora
function fechaDe(t, hoy = new Date()) {
  const s = norm(t); let f = null;
  if (/pasado manana/.test(s)) f = new Date(hoy.getTime() + 2 * 864e5);
  else if (/\bmanana\b/.test(s)) f = new Date(hoy.getTime() + 864e5);
  else if (/\bhoy\b/.test(s)) f = hoy;
  else { const d = Object.keys(DIAS).find((k) => new RegExp(`\\b${k}\\b`).test(s)); if (d) { const n = (DIAS[d] - hoy.getDay() + 7) % 7 || 7; f = new Date(hoy.getTime() + n * 864e5); } }
  const m = s.match(/\b(\d{1,2})[/-](\d{1,2})\b/); if (!f && m) { f = new Date(hoy.getFullYear(), Number(m[2]) - 1, Number(m[1]), 12); if (f < new Date(hoy.getTime() - 864e5)) f.setFullYear(f.getFullYear() + 1); }
  const h = s.match(/a las (\d{1,2})(?:[:.](\d{2}))?/) || s.match(/\b(\d{1,2}):(\d{2})\b/);
  let hora = null; if (h) { let H = Number(h[1]); if (/\bpm\b|de la tarde/.test(s) && H < 12) H += 12; if (H <= 23) hora = `${String(H).padStart(2, '0')}:${h[2] || '00'}`; }
  return { fecha: f ? iso(f) : null, hora };
}

function crear({ inmo, negocios, agenda }) {
  const etapasDe = (tipo) => negocios.ETAPAS[tipo] || [];
  const negociosDe = (propId) => negocios.listar().negocios.filter((n) => n.propId === propId && n.estado === 'abierto');
  const corto = (n) => ({ etapas: etapasDe(n.tipo).map((e) => ({ id: e.id, t: e.t })), id: n.id, tipo: n.tipo, cliente: n.cliente?.nombre || null, clienteId: n.clienteId || null, etapa: n.etapa, etapaTxt: n.etapaInfo?.t, orden: n.orden, total: n.total, siguiente: n.siguiente, proximaAccion: n.proximaAccion || null, vencida: !!n.vencida });

  function sugerencias(p, negs, eventos) {
    const out = []; const add = (label, accion) => { if (out.length < 3 && !out.some((x) => x.label === label)) out.push({ label, accion }); };
    for (const n of negs) {
      const et = n.etapaInfo || {}; const f = n.firmas?.[n.etapa]; const sig = etapasDe(n.tipo)[n.orden + 1];
      if (n.vencida && n.proximaAccion?.texto) add(`Retomar: ${n.proximaAccion.texto}`, { tipo: 'negocio', negocioId: n.id });
      const vis = eventos.find((e) => e.tipo === 'visita' && !e.orden?.operacion && (!n.clienteId || (e.personas || []).some((c) => c.id === n.clienteId)));
      if (vis) add(`Orden de visita para el ${vis.fecha.slice(8)}/${vis.fecha.slice(5, 7)}${n.cliente ? ' con ' + primer(n.cliente.nombre) : ''}`, { tipo: 'orden', eventoId: vis.id });
      if (['interes', 'visita'].includes(n.etapa) && !eventos.some((e) => e.tipo === 'visita' && (!n.clienteId || (e.personas || []).some((c) => c.id === n.clienteId)))) add(`Agendar visita con ${primer(n.cliente?.nombre) || 'el cliente'}`, { tipo: 'agendar', propId: p.id, personaId: n.clienteId, negocioId: n.id });
      if (et.firma && (!f || f.estado !== 'firmado') && !f?.operacion) add(`Generar ${et.firma.toLowerCase()}`, { tipo: 'documento', propId: p.id, negocioId: n.id });
      if (sig && (!n.siguiente || /^Listo para pasar/.test(n.siguiente))) add(`Pasar a «${sig.t}»`, { tipo: 'mover', negocioId: n.id, etapa: sig.id });
    }
    for (const e of eventos.filter((x) => x.tipo === 'visita' && !x.orden?.operacion)) { const quien = primer((e.personas || [])[0]?.nombre); add(`Orden de visita para el ${e.fecha.slice(8)}/${e.fecha.slice(5, 7)}${quien ? ' con ' + quien : ''}`, { tipo: 'orden', eventoId: e.id }); }
    const pronto = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    for (const e of eventos.filter((x) => x.tipo === 'visita' && !x.confirmacion && x.fecha <= pronto && (x.personas || []).some((c) => c.telefono))) add(`Confirmar por WhatsApp la visita del ${e.fecha.slice(8)}/${e.fecha.slice(5, 7)}`, { tipo: 'confirmar', eventoId: e.id });
    if (!negs.length) {
      const nuevos = (p.leads || []).filter((l) => !l.visto).length;
      if (nuevos) add(`Responder ${nuevos} ${nuevos === 1 ? 'interesado' : 'interesados'}`, { tipo: 'interesados' });
      add('Crear un negocio', { tipo: 'negocioNuevo', propId: p.id });
    }
    const publicada = Object.values(p.portales || {}).some((x) => Object.values(x || {}).some((a) => ['active', 'en_feed', 'publicada', 'pendiente'].includes(a?.status)));
    if (!publicada && ((p.venta && p.estadoVenta === 'disponible') || (p.arriendo && p.estadoArriendo === 'disponible'))) add('Publicar en portales', { tipo: 'publicar', propId: p.id });
    return out;
  }

  async function estado(propId) {
    const p = inmo.obtener(propId); const negs = negociosDe(p.id);
    const eventos = agenda.listar({ propId: p.id, desde: iso(new Date()) }).filter((e) => e.estado === 'programado');
    const act = await inmo.actividadDe(p.id); const min = (f) => String(f || '').slice(0, 16);
    // la misma acción queda en la propiedad y en su negocio: se muestra una vez (la más completa)
    const historial = act.filter((a, i) => !act.some((b, j) => j !== i && min(b.fecha) === min(a.fecha) && b.texto !== a.texto && String(b.texto).startsWith(a.texto)) && act.findIndex((b) => min(b.fecha) === min(a.fecha) && b.texto === a.texto) === i)
      .slice(0, 12).map((a) => ({ fecha: a.fecha, texto: a.texto, nota: a.tipo === 'nota' }));
    return {
      prop: { id: p.id, codigo: p.codigo, titulo: p.titulo, tipo: p.tipo, direccion: [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', '), rol: p.rol || null, foto: (p.fotos || [])[0] || null,
        venta: p.venta ? { precio: p.precioVenta, estado: p.estadoVenta } : null, arriendo: p.arriendo ? { precio: p.precioArriendo, estado: p.estadoArriendo } : null,
        personas: (p.vinculos || []).map((v) => ({ rol: v.rol, c: inmo.personaPorId(v.personaId) })).filter((v) => v.c).slice(0, 4).map((v) => ({ id: v.c.id, nombre: v.c.nombre, rol: v.rol })) },
      negocios: negs.map(corto), ultimo: historial.slice(0, 3), historial, totalProximos: eventos.length, proximos: eventos.slice(0, 8).map((e) => ({ id: e.id, tipo: e.tipo, tipoTxt: e.tipoTxt, fecha: e.fecha, hora: e.hora, titulo: e.titulo, personas: (e.personas || []).map((c) => c.nombre).filter(Boolean), orden: e.orden?.operacion || null, confirmada: !!e.confirmacion })),
      firmas: (p.firmas || []).filter((f) => f.estado !== 'firmado').slice(0, 3).map((f) => ({ plantilla: f.plantilla, operacion: f.operacion, estado: f.estado })),
      sugerencias: sugerencias(p, negs, eventos),
    };
  }

  // Anotar lo que pasó fuera de Asset: queda en el historial y se proponen pasos (nada cambia sin un toque)
  async function anotar(propId, { tipo = 'otro', texto = '', negocioId } = {}) {
    const p = inmo.obtener(propId); const negs = negociosDe(p.id);
    const n = negocioId ? negs.find((x) => x.id === negocioId) || negocios.ver(negocioId) : negs.length === 1 ? negs[0] : null;
    const linea = [TIPO_NOTA[tipo] || '', String(texto || '').trim()].filter(Boolean).join(': ');
    if (!linea) throw new Error('Escribe qué pasó.');
    if (n) await negocios.nota(n.id, linea); else await inmo.nota(p.id, linea);
    const s = norm(`${texto} ${tipo}`); const { fecha, hora } = fechaDe(texto); const out = [];
    const add = (label, accion) => { if (!out.some((x) => x.label === label)) out.push({ label, accion }); };
    const et = n ? etapasDe(n.tipo) : []; const idx = n ? et.findIndex((e) => e.id === n.etapa) : -1;
    const moverA = (id) => { const i = et.findIndex((e) => e.id === id); if (n && i > idx) add(`Pasar a «${et[i].t}»`, { tipo: 'mover', negocioId: n.id, etapa: id }); };
    const quiereVisitar = /visitar|ver la (propiedad|casa|depto|departamento)|coordinar (una )?visita|agendar/.test(s);
    if (quiereVisitar || (fecha && tipo === 'llamada')) add(`Agendar visita${fecha ? ' ' + fecha.slice(8) + '/' + fecha.slice(5, 7) : ''}${hora ? ' ' + hora : ''}${n?.cliente ? ' con ' + primer(n.cliente.nombre) : ''}`, { tipo: 'agendar', propId: p.id, personaId: n?.clienteId || null, negocioId: n?.id || null, fecha, hora });
    if (quiereVisitar && n?.etapa === 'interes') moverA('visita');
    if (tipo === 'visita' || /visito|ya vio|fue a ver|vimos la/.test(s)) { const sig = et[idx + 1]; if (n && ['interes', 'visita'].includes(n.etapa) && sig) add(`Pasar a «${sig.t}»`, { tipo: 'mover', negocioId: n.id, etapa: sig.id }); }
    if (tipo === 'oferta' || /oferta|reserv/.test(s)) { moverA('reserva'); if (p) add('Generar el documento de reserva', { tipo: 'documento', propId: p.id, negocioId: n?.id || null }); }
    if (/promesa/.test(s)) moverA('promesa');
    if (/escritura/.test(s)) moverA('escritura');
    if (tipo === 'documentos' || /document|liquidacion|antecedente|contrato de trabajo/.test(s)) { if (n?.tipo === 'arriendo') moverA('evaluacion'); else if (n) { const sig = et[idx + 1]; if (sig) add(`Pasar a «${sig.t}»`, { tipo: 'mover', negocioId: n.id, etapa: sig.id }); } }
    if (!n && /interes|quiere (arrendar|comprar)|busca/.test(s)) add('Crear un negocio', { tipo: 'negocioNuevo', propId: p.id });
    return { anotado: linea, negocio: n ? { id: n.id, cliente: n.cliente?.nombre || null } : null, sugerencias: out.slice(0, 3) };
  }

  // Agendar una visita es un hito: el negocio de ese cliente pasa a «Visita» y la tarea «Agendar la visita» queda hecha.
  // Devuelve qué cambió, para mostrarlo con la opción de deshacer.
  async function alAgendar(ev) {
    if (!ev || ev.tipo !== 'visita' || !ev.propId) return null;
    const negs = negociosDe(ev.propId); const ids = ev.personaIds || (ev.personas || []).map((c) => c.id);
    let n = ev.negocioId ? negs.find((x) => x.id === ev.negocioId) : negs.find((x) => x.clienteId && ids.includes(x.clienteId));
    if (!n && !ids.length && negs.length === 1) n = negs[0];
    if (!n) return null;
    if (!ev.negocioId && agenda.ligarNegocio) agenda.ligarNegocio(ev.id, n.id);
    const antes = n.etapa; let movido = false;
    if (antes === 'interes') { await negocios.mover(n.id, 'visita', 'Visita agendada'); movido = true; }
    if (['interes', 'visita'].includes(antes)) { const et = etapasDe(n.tipo).find((e) => e.id === 'visita'); const i = (et?.tareas || []).findIndex((t) => /agendar/i.test(t)); if (i >= 0) negocios.tarea(n.id, 'visita', i, true); }
    return { negocioId: n.id, cliente: n.cliente?.nombre || null, antes, etapa: movido ? 'visita' : antes, movido };
  }

  // Confirmación de la visita por WhatsApp: mensaje listo con día, hora, dirección y quién la recibe.
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const telWa = (t) => { let d = String(t || '').replace(/\D/g, ''); if (!d) return null; if (d.length === 8) d = '569' + d; else if (d.length === 9) d = '56' + d; return d.length >= 10 ? d : null; };
  function confirmacion(eventoId, personaId) {
    const e = agenda.obtener(eventoId); const p = e.propId ? inmo.obtener(e.propId) : null;
    const ps = (e.personas || []).map((c) => inmo.personaPorId(c.id)).filter(Boolean);
    const c = (personaId && ps.find((x) => x.id === personaId)) || ps.find((x) => telWa(x.telefono)) || ps[0] || null;
    const d = new Date(e.fecha + 'T12:00'); const dia = `${SEM[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
    const cfg = inmo.config() || {}; const corredor = cfg.contacto?.nombre || cfg.corredor?.nombre || '';
    const dir = p ? [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ') : (e.lugar || '');
    const texto = `Hola${c ? ' ' + primer(c.nombre) : ''}, te confirmo la ${e.tipo === 'visita' ? 'visita' : 'reunión'}${p ? ` a ${p.titulo} (código ${p.codigo})` : ''} el ${dia}${e.hora ? ' a las ' + e.hora : ''}${dir ? `, en ${dir}` : ''}.${corredor ? ` Te recibe ${corredor}.` : ''} Si necesitas cambiar la hora, respóndeme por aquí. ¡Nos vemos!`;
    const tel = c ? telWa(c.telefono) : null;
    return { texto, persona: c ? { id: c.id, nombre: c.nombre, telefono: c.telefono || '' } : null, whatsapp: tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : null, enviada: e.confirmacion || null };
  }
  // se abrió WhatsApp con el mensaje: queda en el historial de la visita y de la propiedad
  function confirmada(eventoId, personaId, texto, { via = 'whatsapp' } = {}) {
    const r = confirmacion(eventoId, personaId); if (texto && String(texto).trim()) { r.texto = String(texto).trim().slice(0, 1500); const tel = r.whatsapp?.match(/wa\.me\/(\d+)/)?.[1]; if (tel) r.whatsapp = `https://wa.me/${tel}?text=${encodeURIComponent(r.texto)}`; } if (!r.whatsapp) throw new Error('Esta persona no tiene un celular válido.');
    agenda.marcarConfirmacion(eventoId, { via, a: r.persona?.id, texto: `Confirmación de la visita ${via === 'wechatia' ? 'enviada automáticamente por WhatsApp' : 'enviada por WhatsApp'} a ${r.persona?.nombre || 'el cliente'}` });
    return r;
  }

  // texto final y celular, sin registrar nada (para el envío automático: se registra solo si sale bien)
  function preparar(eventoId, personaId, texto) { const r = confirmacion(eventoId, personaId); if (texto && String(texto).trim()) r.texto = String(texto).trim().slice(0, 1500); if (!r.whatsapp) throw new Error('Esta persona no tiene un celular válido.'); r.telefono = r.whatsapp.match(/wa\.me\/(\d+)/)?.[1]; return r; }
  return { estado, anotar, alAgendar, confirmacion, confirmada, preparar, fechaDe };
}

module.exports = { crear, fechaDe };
