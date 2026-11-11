// Etapas del negocio (0.15): cada operación se ve en 3 etapas con sus pasos, y cada paso en uno de cuatro estados:
//   ok (logrado) · pend (pendiente: te toca, o «esperando a» otro) · fail (no logrado: vencido o caído) · todo (por hacer).
//  1. Captación (de la propiedad): datos, mandato firmado, fotos, publicada.
//  2. Comercialización (del negocio): interesado, visita, orden de visita, negociación, carta oferta firmada.
//  3. Postventa (lo que viene después de la carta oferta; así lo llama The Living): venta; en un arriendo se llama Postarriendo.
// Los estados se deducen de lo que ya registra Asset (firmas, tareas, agenda, fotos, portales). El ejecutivo puede
// además marcar a mano un paso como logrado, no logrado o «esperando a…»; eso queda en n.pasos (o p.pasos).
const inmo = require('./inmo');

// 0.16.14 · la ficha se pide en 5 bloques (ficha-campos.js): cada bloque es un paso de la captación
const FC = require('./ficha-campos');
const CAPT = [
  { id: 'datos', t: 'Lo esencial', a: 'Completar lo esencial', tipo: 'ficha', bloque: 'esencial', pedir: (c) => `Completa lo esencial de ${c.codigo}` },
  { id: 'portal', t: 'Datos para los portales', a: 'Completar datos para portales', tipo: 'ficha', bloque: 'portal', pedir: (c) => `Completa los datos para portales de ${c.codigo}` },
  { id: 'legal', t: 'Propietario y datos legales', a: 'Completar propietario y datos legales', tipo: 'ficha', bloque: 'legal', pedir: (c) => `Completa el propietario y los datos legales de ${c.codigo}` },
  { id: 'mandato', t: 'Mandato firmado', a: 'Enviar mandato a firmar', tipo: 'agente', pedir: (c) => `Envía el mandato de ${c.codigo} a firmar con su propietario` },
  { id: 'equip', t: 'Equipamiento y terminaciones', a: 'Completar equipamiento', tipo: 'ficha', bloque: 'equip', pedir: (c) => `Completa el equipamiento y las terminaciones de ${c.codigo}` },
  { id: 'fotos', t: 'Fotos', a: 'Cargar fotos desde Drive', tipo: 'fotos' },
  { id: 'comovisitar', t: 'Visita y publicación', a: 'Completar cómo se visita', tipo: 'ficha', bloque: 'visita', pedir: (c) => `Completa cómo se visita ${c.codigo}` },
  { id: 'publicada', t: 'Publicada en portales', a: 'Publicar en portales', tipo: 'ficha' },
];
const COM = [
  { id: 'interesado', t: 'Interesado registrado', a: 'Crear el negocio', tipo: 'negocio' },
  { id: 'visita', t: 'Visita agendada', a: 'Agendar visita', tipo: 'agente', pedir: (c) => `Agenda una visita${c.cliente ? ' con ' + c.cliente : ''} en ${c.codigo}` },
  { id: 'orden', t: 'Orden de visita firmada', a: 'Enviar orden de visita', tipo: 'agente', pedir: (c) => `Hazme la orden de visita${c.cliente ? ' para ' + c.cliente : ''} en ${c.codigo}` },
  { id: 'negociacion', t: 'Negociación', a: 'Marcar como logrado', tipo: 'ok' },
  { id: 'carta', t: 'Carta oferta firmada', a: 'Enviar carta oferta a firmar', tipo: 'firma', etapa: 'reserva' },
];
const POST = {
  venta: [
    { id: 'reserva_pago', t: 'Reserva pagada', a: 'Marcar como logrado', tipo: 'ok', tarea: ['reserva', 1] },
    { id: 'financiamiento', t: 'Financiamiento aprobado', a: 'Marcar como logrado', tipo: 'ok', tarea: ['promesa', 1] },
    { id: 'titulos', t: 'Estudio de títulos', a: 'Marcar como logrado', tipo: 'ok', tarea: ['promesa', 0] },
    { id: 'promesa', t: 'Promesa firmada', a: 'Enviar promesa a firmar', tipo: 'firma', etapa: 'promesa' },
    { id: 'escritura', t: 'Escritura firmada', a: 'Enviar escritura a firmar', tipo: 'firma', etapa: 'escritura' },
    { id: 'inscripcion', t: 'Inscripción en el Conservador', a: 'Marcar como logrado', tipo: 'ok', tareas: ['inscripcion', [0, 1]] },
    { id: 'entrega', t: 'Entrega con acta', a: 'Enviar acta a firmar', tipo: 'firma', etapa: 'entrega' },
    { id: 'comision', t: 'Comisión cobrada', a: 'Marcar como logrado', tipo: 'ok', tarea: ['entrega', 1] },
    { id: 'cierre', t: 'Cierre de la operación', a: 'Cerrar con éxito', tipo: 'cerrar' },
  ],
  arriendo: [
    { id: 'garantia', t: 'Garantía o reserva pagada', a: 'Marcar como logrado', tipo: 'ok', tarea: ['reserva', 0] },
    { id: 'evaluacion', t: 'Evaluación del arrendatario', a: 'Solicitar documentación', tipo: 'evaluar', tareas: ['evaluacion', [0, 1, 2]] },
    { id: 'documentos', t: 'Revisión de documentos', a: 'Marcar como logrado', tipo: 'ok' },
    { id: 'contrato', t: 'Contrato de arriendo firmado', a: 'Enviar contrato a firmar', tipo: 'firma', etapa: 'contrato' },
    { id: 'entrega', t: 'Entrega con acta', a: 'Enviar acta a firmar', tipo: 'firma', etapa: 'entrega' },
    { id: 'comision', t: 'Comisión cobrada', a: 'Marcar como logrado', tipo: 'ok', tarea: ['entrega', 1] },
    { id: 'cierre', t: 'Cierre de la operación', a: 'Cerrar con éxito', tipo: 'cerrar' },
  ],
};
const NOMBRES = ['Captación', 'Comercialización', 'Postventa'];
const now = () => new Date().toISOString();
const hoy = () => require('./hora').hoy();
const fdm = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '');
const ORDEN_ETAPA = { venta: ['interes', 'visita', 'reserva', 'promesa', 'escritura', 'inscripcion', 'entrega'], arriendo: ['interes', 'visita', 'reserva', 'evaluacion', 'contrato', 'entrega'] };

function crear({ agenda = null, formatos = null } = {}) {
  const firmaProp = (p, re) => { const fs = (p?.firmas || []).filter((f) => re.test(f.plantilla || '')); return fs.find((f) => f.estado === 'firmado') || fs[0] || null; };
  const publicada = (p) => !!p && (p.publicada || Object.values(p.portales || {}).some((x) => Object.values(x || {}).some((a) => a && a.status === 'active')));
  const visitas = (p, n) => { try { return agenda ? agenda.listar({ propId: p?.id, tipo: 'visita' }).filter((e) => !n?.clienteId || !(e.personaIds || []).length || e.personaIds.includes(n.clienteId) || e.negocioId === n.id) : []; } catch { return []; } };

  // estado automático de un paso según lo que ya hay en Asset → { e, f, d, q, quien } o null (sin evidencia)
  function auto(def, p, n) {
    const tarea = (et, i) => !!n?.tareas?.[et]?.[i];
    const ord = n ? ORDEN_ETAPA[n.tipo]?.indexOf(n.etapa) ?? -1 : -1; const pasado = (et) => n && (n.estado === 'ganado' || ord > (ORDEN_ETAPA[n.tipo] || []).indexOf(et));
    switch (def.id) {
      case 'datos': case 'portal': case 'legal': case 'equip': case 'comovisitar': {
        if (!p) return null; const b = FC.avance(p).find((x) => x.id === def.bloque);
        if (def.bloque === 'equip') return b.completos > 0 ? { e: 'ok', d: `${b.completos} de ${b.total} datos` } : null;   // no tiene claves: basta con haberlo recorrido
        if (b.listo) return { e: 'ok', f: def.id === 'datos' ? p.creado : null };
        return { e: 'pend', q: 'tu', d: `Falta: ${b.faltanClave.slice(0, 5).join(', ')}${b.faltanClave.length > 5 ? ` y ${b.faltanClave.length - 5} más` : ''}.` };
      }
      case 'mandato': {
        // 0.16.15 · con formatos propios: un mandato por operación (venta y/o arriendo); el paso dice qué falta o si está listo
        const fh = p && formatos?.activo() ? formatos.estadoHito(p, 'mandato') : null;
        if (fh) {
          const st = fh.map((m) => ({ ...m, f: firmaProp(p, new RegExp(m.titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) || (p.firmas || []).find((x) => x.formato === m.id) || null }));
          if (st.every((m) => m.f?.estado === 'firmado')) return { e: 'ok', f: st.map((m) => m.f.firmado || m.f.fecha).sort().pop() };
          const sin = st.filter((m) => !m.f); const env = st.filter((m) => m.f && m.f.estado !== 'firmado');
          if (!sin.length) return { e: 'pend', q: 'otro', quien: 'la firma del propietario', d: env.map((m) => `${m.titulo}: enviado el ${fdm(m.f.fecha)}${m.f.operacion ? ' · operación ' + m.f.operacion : ''}`).join(' · ') + '.' };
          const falta = [...new Set(sin.flatMap((m) => m.faltan))];
          return { e: 'pend', q: 'tu', d: falta.length ? `Para el mandato falta: ${falta.slice(0, 5).join(', ')}${falta.length > 5 ? ` y ${falta.length - 5} más` : ''}.` : `Listo para enviar: ${sin.map((m) => m.titulo.toLowerCase()).join(' y ')}, con los datos de la ficha.` };
        }
        const f = firmaProp(p, /mandato|corretaje/i); return !f ? null : f.estado === 'firmado' ? { e: 'ok', f: f.firmado || f.fecha } : { e: 'pend', q: 'otro', quien: 'la firma del propietario', d: `Enviado a firmar el ${fdm(f.fecha)}${f.operacion ? ' · operación ' + f.operacion : ''}.` }; }
      case 'fotos': return (p?.fotos || []).length ? { e: 'ok', f: null, d: `${p.fotos.length} fotos` } : null;
      case 'publicada': return publicada(p) ? { e: 'ok' } : null;
      case 'interesado': return n?.clienteId ? { e: 'ok', f: n.creado } : null;
      case 'visita': { const v = visitas(p, n); return v.length || tarea('visita', 0) || pasado('visita') ? { e: 'ok', f: v[0] ? v[0].fecha : null, d: v[0] ? `Visita del ${fdm(v[0].fecha)}${v[0].hora ? ' a las ' + v[0].hora : ''}` : '' } : null; }
      case 'orden': { const f = firmaProp(p, /orden de visita/i); return !f ? (pasado('reserva') ? { e: 'ok' } : null) : f.estado === 'firmado' ? { e: 'ok', f: f.firmado || f.fecha } : { e: 'pend', q: 'otro', quien: 'la firma del visitante', d: `Enviada el ${fdm(f.fecha)}${f.operacion ? ' · operación ' + f.operacion : ''}.` }; }
      case 'negociacion': return tarea('reserva', 0) && n.tipo === 'venta' || pasado('visita') && n?.firmas?.reserva ? { e: 'ok' } : null;
      case 'cierre': return n?.estado === 'ganado' ? { e: 'ok', f: n.cierre?.fecha || n.actualizado } : null;
      default: break;
    }
    if (def.tipo === 'firma' && n) { const f = n.firmas?.[def.etapa]; if (f?.estado === 'firmado') return { e: 'ok', f: f.firmado }; if (f?.operacion) return { e: 'pend', q: 'otro', quien: 'las firmas', d: `Operación ${f.operacion}${f.total ? ` · ${f.firmados} de ${f.total} firmas` : ''}.` }; if (pasado(def.etapa)) return { e: 'ok' }; return null; }
    if (def.tarea && n) return tarea(...def.tarea) ? { e: 'ok' } : null;
    if (def.tareas && n) return def.tareas[1].every((i) => tarea(def.tareas[0], i)) ? { e: 'ok' } : null;
    return null;
  }

  // los pasos de un negocio (o de una propiedad sin negocio), con su estado y el «actual»
  // 0.16.11 · dos recorridos independientes: la CAPTACIÓN es de la propiedad (se ve en Cartera) y el NEGOCIO es del
  // interesado (comercialización y postventa). ambito: 'captacion' | 'negocio' (por defecto: negocio si hay n).
  function pasos({ n = null, p = null, ambito = null } = {}) {
    ambito = ambito || (n ? 'negocio' : 'captacion');
    if (n && !p && n.propId) p = inmo.todas().find((x) => x.id === n.propId) || null;
    const tipo = n?.tipo || (p?.venta ? 'venta' : 'arriendo');
    const cliente = n?.clienteId ? inmo.personaPorId(n.clienteId)?.nombre : null;
    const ctx = { codigo: p?.codigo || '', cliente };
    const manual = { ...(p?.pasos || {}), ...(n?.pasos || {}) };
    let actual = null;
    const defs = ambito === 'captacion' ? [[CAPT, 0]] : [[COM, 1], [POST[tipo] || POST.venta, 2]];
    const etapas = defs.map(([lista, k]) => ({ id: ['captacion', 'comercializacion', 'postventa'][k], nombre: k === 2 && tipo === 'arriendo' ? 'Postarriendo' : NOMBRES[k], pasos: lista.map((def) => {
      const a = auto(def, p, n); const m = manual[def.id];
      let x = { id: def.id, t: def.t, e: 'todo', f: null, d: '', q: 'tu', quien: '', vence: null, accion: def.a, tipo: def.tipo, etapaFirma: def.etapa || null, pedir: def.pedir ? def.pedir(ctx) : null, manual: !!m };
      if (a?.e === 'ok') Object.assign(x, a, { e: 'ok' });
      else if (m?.e) Object.assign(x, { e: m.e, f: m.f || null, d: m.d || '', q: m.quien ? 'otro' : 'tu', quien: m.quien || '', vence: m.vence || null });
      else if (a) Object.assign(x, a);
      if (x.e === 'ok' && !a && m?.f) x.f = m.f;
      return x;
    }) }));
    // el actual: el primer paso no logrado; los anteriores sin evidencia quedan como «saltados» (logrados si hay pasos posteriores logrados)
    const plano = etapas.flatMap((e, ei) => e.pasos.map((x, pi) => ({ x, ei, pi })));
    let ultimoOk = -1; plano.forEach((y, i) => { if (y.x.e === 'ok') ultimoOk = i; });
    // en la captación cada paso es independiente (puede haber fotos sin mandato): no se da nada por cumplido
    if (ambito !== 'captacion') plano.forEach((y, i) => { if (i < ultimoOk && y.x.e === 'todo') { y.x.e = 'ok'; y.x.d = y.x.d || 'Sin registro (se dio por cumplido)'; y.x.implicito = true; } });
    const sig = plano.find((y) => y.x.e !== 'ok');
    if (sig) {
      actual = { ...sig.x, ei: sig.ei, pi: sig.pi, etapa: etapas[sig.ei].nombre };
      if (sig.x.e === 'todo') { sig.x.e = 'pend'; actual.e = 'pend'; }
      if (n && actual.e === 'pend' && actual.q === 'tu' && !actual.vence && n.proximaAccion?.fecha) { sig.x.vence = actual.vence = n.proximaAccion.fecha; if (n.proximaAccion.texto && !sig.x.d) sig.x.d = actual.d = n.proximaAccion.texto; }
      if (actual.e === 'pend' && actual.q === 'tu' && actual.vence && actual.vence < hoy()) { sig.x.e = actual.e = 'fail'; sig.x.d = actual.d = `${actual.d ? actual.d + ' · ' : ''}Venció el ${fdm(actual.vence)}.`; actual.vencido = sig.x.vencido = true; }
      if (n?.estado === 'perdido') { sig.x.e = actual.e = 'fail'; sig.x.d = actual.d = 'Negocio perdido' + (n.motivoPerdida ? ': ' + n.motivoPerdida : '') + '.'; actual.perdido = true; }
      if (actual.e === 'fail' && !actual.perdido) sig.x.accion = actual.accion = actual.vencido || actual.id === 'visita' ? 'Reprogramar' : 'Reintentar';
      if (actual.e === 'pend' && actual.q === 'otro') { sig.x.accion = actual.accion = actual.tipo === 'firma' ? 'Revisar firmas' : 'Ver detalle'; sig.x.tipo = actual.tipo = actual.tipo === 'firma' ? 'revisar' : 'ver'; }
    }
    for (const e of etapas) { e.ok = e.pasos.filter((x) => x.e === 'ok').length; e.total = e.pasos.length; e.fail = e.pasos.some((x) => x.e === 'fail'); e.completa = e.ok === e.total; e.actual = !!actual && etapas.indexOf(e) === actual.ei; }
    return { tipo, ambito, etapas, actual, cerrado: !actual, ctx };
  }

  // marcar a mano: estado 'ok' | 'fail' | 'pend' | null (volver a lo automático); quien = «esperando a…»; vence = fecha límite
  function marcar({ negocioId, propId, paso, estado, d = '', quien = '', vence = null }) {
    const ok = ['ok', 'fail', 'pend', null].includes(estado); if (!ok) throw new Error('Estado no válido.');
    const tgt = negocioId ? inmo.negocios().find((x) => x.id === negocioId) : inmo.todas().find((x) => x.id === propId);
    if (!tgt) throw new Error(negocioId ? 'El negocio ya no existe.' : 'La propiedad ya no existe.');
    const def = [...CAPT, ...COM, ...POST.venta, ...POST.arriendo].find((x) => x.id === paso); if (!def) throw new Error('Paso desconocido.');
    tgt.pasos ||= {};
    if (estado == null) delete tgt.pasos[paso];
    else tgt.pasos[paso] = { e: estado, f: estado === 'ok' ? now() : null, d: String(d || '').slice(0, 240), quien: String(quien || '').slice(0, 80), vence: /^\d{4}-\d{2}-\d{2}$/.test(vence || '') ? vence : null };
    if (negocioId && estado === 'ok') { // las tareas que el paso representa quedan marcadas
      if (def.tarea) { tgt.tareas ||= {}; tgt.tareas[def.tarea[0]] ||= []; tgt.tareas[def.tarea[0]][def.tarea[1]] = true; }
      if (def.tareas) { tgt.tareas ||= {}; tgt.tareas[def.tareas[0]] ||= []; for (const i of def.tareas[1]) tgt.tareas[def.tareas[0]][i] = true; }
    }
    if (negocioId && estado === 'pend' && vence) tgt.proximaAccion = { texto: d || def.t, fecha: vence };
    tgt.actualizado = now();
    const txt = estado === 'ok' ? `Paso logrado: ${def.t}` : estado === 'fail' ? `Paso no logrado: ${def.t}${d ? ' · ' + d : ''}` : estado === 'pend' ? `${def.t}: ${quien ? 'esperando a ' + quien : 'pendiente'}${vence ? ' (plazo ' + fdm(vence) + ')' : ''}` : `${def.t}: vuelve a lo automático`;
    inmo.registrar(negocioId || propId, txt, negocioId && tgt.propId ? { ref2: tgt.propId } : {}); inmo.guardar();
    return true;
  }

  // la pantalla «Hoy»: qué necesita atención, qué te toca, qué espera a otros, y tus negocios con su avance
  function resumenHoy() {
    const props = inmo.todas().filter((p) => !p.archivada); const negs = inmo.negocios().filter((n) => n.estado === 'abierto' || n.estado === 'perdido' && false);
    const conNeg = new Set(negs.map((n) => n.propId));
    const items = []; const lista = []; let logrados = 0; const semana = new Date(Date.now() - 7 * 864e5).toISOString();
    const add = (o, r) => {
      for (const e of r.etapas) for (const x of e.pasos) if (x.e === 'ok' && x.f && !x.implicito && x.f >= semana) logrados++;
      const a = r.actual; const segs = r.etapas.map((e) => ({ ok: e.ok, total: e.total, pct: Math.round((e.ok / e.total) * 100), completa: e.completa, fail: e.fail, actual: e.actual }));
      const base = { ...o, etapa: a ? (o.captacion ? `Captación · ${a.t}` : `Etapa ${a.ei + 1} · ${a.etapa}`) : 'Cerrado', segs };
      lista.push({ ...base, estado: !a ? 'cerrado' : a.e === 'fail' ? 'atencion' : a.q === 'otro' ? 'esperando' : 'tetoca' });
      if (a) items.push({ ...base, paso: a.t, pasoId: a.id, d: a.d, vence: a.vence, quien: a.quien, accion: a.accion, tipo: a.tipo, etapaFirma: a.etapaFirma, pedir: a.pedir, clase: a.e === 'fail' ? 'atencion' : a.q === 'otro' ? 'esperando' : 'tetoca', hoy: a.vence === hoy() });
    };
    for (const n of negs) { const p = props.find((x) => x.id === n.propId); const c = n.clienteId ? inmo.personaPorId(n.clienteId) : null;
      add({ negocioId: n.id, propId: p?.id || null, codigo: p?.codigo || '', titulo: p?.titulo || 'Negocio', cliente: c?.nombre || '', op: n.tipo === 'venta' ? 'Venta' : 'Arriendo' }, pasos({ n, p })); }
    for (const p of props) { const r = pasos({ p, ambito: 'captacion' }); if (!r.actual) continue; // la captación va aparte del negocio: solo las que no la completan
      add({ negocioId: null, propId: p.id, codigo: p.codigo, titulo: p.titulo, cliente: '', op: `Captación · ${p.venta && p.arriendo ? 'venta y arriendo' : p.venta ? 'venta' : 'arriendo'}`, captacion: true }, r); }
    const orden = (x) => (x.vence || '9999') + x.codigo;
    const atencion = items.filter((x) => x.clase === 'atencion').sort((a, b) => orden(a).localeCompare(orden(b)));
    const tetoca = items.filter((x) => x.clase === 'tetoca').sort((a, b) => orden(a).localeCompare(orden(b)));
    const esperando = items.filter((x) => x.clase === 'esperando');
    const peso = { atencion: 0, tetoca: 1, esperando: 2, cerrado: 3 };
    lista.sort((a, b) => peso[a.estado] - peso[b.estado] || a.codigo.localeCompare(b.codigo));
    return { atencion, tetoca, esperando, negocios: lista, kpis: { logrados, pendientes: tetoca.length + esperando.length, noLogrados: atencion.length }, hoy: hoy() };
  }

  return { pasos, marcar, resumenHoy, NOMBRES };
}

module.exports = { crear, CAPT, COM, POST };
