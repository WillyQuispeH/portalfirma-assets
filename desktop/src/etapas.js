// Etapas del negocio (0.15): cada operación se ve en 3 etapas con sus pasos, y cada paso en uno de cuatro estados:
//   ok (logrado) · pend (pendiente: te toca, o esperando a otro —eso lo deduce Asset: firmas, confirmaciones—) · fail (no logrado: vencido o caído) · todo (por hacer).
//  1. Captación (de la propiedad): datos, mandato firmado, fotos, publicada.
//  2. Comercialización (del negocio): interesado, visita y orden de visita (un solo paso), acta de visita, negociación, carta oferta firmada.
//  3. Postventa (lo que viene después de la carta oferta; así lo llama The Living): venta; en un arriendo se llama Postarriendo.
// Los estados se deducen de lo que ya registra Asset (firmas, tareas, agenda, fotos, portales). El ejecutivo puede
// además marcar a mano un paso como logrado o no logrado (o volver a lo automático); eso queda en n.pasos (o p.pasos).
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
  { id: 'visita', t: 'Visita y orden de visita', a: 'Agendar visita', tipo: 'agente', pedir: (c) => `Agenda una visita${c.cliente ? ' con ' + c.cliente : ''} en ${c.codigo}` },   // la orden se genera y firma en la puerta, el día de la visita: mismo paso
  { id: 'acta', t: 'Acta de visita', a: 'Hacer el acta de visita', tipo: 'acta' },
  { id: 'negociacion', t: 'Negociación', a: 'Marcar como logrado', tipo: 'ok' },
  { id: 'carta', t: 'Carta oferta', a: 'Enviar carta oferta a firmar', tipo: 'firma', etapa: 'reserva' },
];
const POST = {
  venta: [
    { id: 'reserva_pago', t: 'Reserva pagada', a: 'Marcar como logrado', tipo: 'ok', tarea: ['reserva', 1] },
    { id: 'financiamiento', t: 'Financiamiento aprobado', a: 'Marcar como logrado', tipo: 'ok', tarea: ['promesa', 1] },
    { id: 'titulos', t: 'Estudio de títulos', a: 'Marcar como logrado', tipo: 'ok', tarea: ['promesa', 0] },
    { id: 'promesa', t: 'Promesa firmada', a: 'Enviar promesa a firmar', tipo: 'firma', etapa: 'promesa' },
    { id: 'escritura', t: 'Escritura firmada', a: 'Preparar borrador de escritura', tipo: 'firma', etapa: 'escritura' },
    { id: 'inscripcion', t: 'Inscripción en el Conservador', a: 'Marcar como logrado', tipo: 'ok', tareas: ['inscripcion', [0, 1]] },
    { id: 'entrega', t: 'Entrega con acta', a: 'Enviar acta a firmar', tipo: 'firma', etapa: 'entrega' },
    { id: 'comision', t: 'Comisión cobrada', a: 'Marcar como logrado', tipo: 'ok', tarea: ['entrega', 1] },
    { id: 'cierre', t: 'Cierre de la operación', a: 'Cerrar con éxito', tipo: 'cerrar' },
  ],
};
// ARRIENDO · 3 etapas (0.18.10): 1 Comercialización, 2 Cierre del arriendo y 3 Postarriendo. Los pasos de la etapa 3 los avisa Asset
// cuando corresponden (reajuste, renovación, devolución de la garantía): no son «el siguiente paso» mientras no toquen.
const COM_ARR = [
  { id: 'interesado', t: 'Interesado registrado', a: 'Crear el negocio', tipo: 'negocio' },
  { id: 'visita', t: 'Visita y orden de visita', a: 'Agendar visita', tipo: 'agente', pedir: (c) => `Agenda una visita${c.cliente ? ' con ' + c.cliente : ''} en ${c.codigo}` },   // la orden se genera y firma en la puerta, el día de la visita: mismo paso
  { id: 'acta', t: 'Acta de visita', a: 'Hacer el acta de visita', tipo: 'acta' },
  { id: 'carta', t: 'Carta oferta', a: 'Enviar carta oferta a firmar', tipo: 'firma', etapa: 'oferta' },   // 'oferta' no es una etapa del embudo: firmarla no mueve el negocio
  { id: 'aceptacion', t: 'Aceptación del propietario', a: 'Registrar la respuesta', tipo: 'aceptacion' },
];
const CIERRE_ARR = [
  { id: 'reserva_pago', t: 'Reserva pagada', a: 'Registrar el pago', tipo: 'pago', tarea: ['reserva', 0] },
  { id: 'evaluacion', t: 'Evaluación del arrendatario', a: 'Solicitar documentación', tipo: 'evaluar', tareas: ['evaluacion', [0, 1, 2]] },
  { id: 'revision', t: 'Revisión del contrato', a: 'Armar y revisar el contrato', tipo: 'revision' },
  { id: 'contrato', t: 'Contrato firmado', a: 'Enviar contrato a firmar', tipo: 'firma', etapa: 'contrato' },
  { id: 'garantia_mes', t: 'Garantía y primer mes recibidos', a: 'Registrar los pagos', tipo: 'pago', tarea: ['contrato', 0] },
  { id: 'entrega', t: 'Entrega con acta e inventario', a: 'Hacer el acta de entrega', tipo: 'firma', etapa: 'entrega_acta' },   // fuera del embudo: al firmarse la propiedad queda «Arrendada»
  { id: 'comision', t: 'Comisión facturada y cobrada', a: 'Facturar y registrar el pago', tipo: 'pago', tarea: ['entrega', 1] },
];
const POSTARR = [
  { id: 'reajustes', t: 'Reajustes', a: 'Registrar el reajuste', tipo: 'post' },
  { id: 'renovacion', t: 'Renovación o término', a: 'Decidir la renovación', tipo: 'post' },
  { id: 'devolucion', t: 'Devolución de la garantía', a: 'Registrar la devolución', tipo: 'post' },
];
const NOMBRES = ['Captación', 'Comercialización', 'Postventa'];
const NOMBRES_ARR = ['Captación', 'Comercialización', 'Cierre del arriendo', 'Postarriendo'];
const IDS_ETAPA = ['captacion', 'comercializacion', 'postventa'];
const IDS_ETAPA_ARR = ['captacion', 'comercializacion', 'cierre', 'postarriendo'];
const now = () => new Date().toISOString();
const hoy = () => require('./hora').hoy();
const fdm = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '');
const ORDEN_ETAPA = { venta: ['interes', 'visita', 'reserva', 'promesa', 'escritura', 'inscripcion', 'entrega'], arriendo: ['interes', 'visita', 'reserva', 'evaluacion', 'contrato', 'entrega'] };

function crear({ agenda = null, formatos = null } = {}) {
  const firmaProp = (p, re) => { const fs = (p?.firmas || []).filter((f) => re.test(f.plantilla || '')); return fs.find((f) => f.estado === 'firmado') || fs[0] || null; };
  const publicada = (p) => !!p && (p.publicada || Object.values(p.portales || {}).some((x) => Object.values(x || {}).some((a) => a && a.status === 'active')));
  // las visitas de ESTE negocio: las ligadas a él, o (viejas, sin negocio) las de su cliente en la misma propiedad
  const visitas = (p, n) => { try { return agenda && p ? agenda.listar({ propId: p.id, tipo: 'visita' }).filter((e) => (n?.id && e.negocioId === n.id) || (!e.negocioId && n?.clienteId && (e.personaIds || []).includes(n.clienteId))) : []; } catch { return []; } };

  // la firma de ESTE negocio (ligada a él, o suelta pero del mismo cliente), la firmada primero
  const firmaNeg = (p, n, re) => {
    const cli = n?.clienteId ? inmo.personaPorId(n.clienteId) : null; const rutC = cli?.rut ? inmo.fmtRut(cli.rut) : null;
    const suyas = (p?.firmas || []).filter((x) => re.test(x.plantilla || '') && ((n?.id && x.negocioId === n.id) || (!x.negocioId && (x.firmantes || []).some((s) => (n?.clienteId && s.personaId === n.clienteId) || (rutC && s.rut && inmo.fmtRut(s.rut) === rutC)))));
    return suyas.find((x) => x.estado === 'firmado') || suyas[0] || null;
  };

  // estado automático de un paso según lo que ya hay en Asset → { e, f, d, q, quien } o null (sin evidencia)
  function auto(def, p, n) {
    const tarea = (et, i) => !!n?.tareas?.[et]?.[i];
    const ord = n ? ORDEN_ETAPA[n.tipo]?.indexOf(n.etapa) ?? -1 : -1; const pasado = (et) => n && (n.estado === 'ganado' || ((ORDEN_ETAPA[n.tipo] || []).indexOf(et) >= 0 && ord > (ORDEN_ETAPA[n.tipo] || []).indexOf(et)));
    switch (def.id) {
      case 'datos': case 'portal': case 'legal': case 'equip': case 'comovisitar': {
        if (!p) return null; const b = FC.avance(p).find((x) => x.id === def.bloque);
        if (def.bloque === 'equip') return b.completos > 0 ? { e: 'ok', d: `${b.completos} de ${b.total} datos` } : null;   // no tiene claves: basta con haberlo recorrido
        if (b.listo) return { e: 'ok', f: def.id === 'datos' ? p.creado : null };
        return { e: 'pend', q: 'tu', d: `Falta: ${b.faltanClave.slice(0, 5).join(', ')}${b.faltanClave.length > 5 ? ` y ${b.faltanClave.length - 5} más` : ''}.` };
      }
      case 'mandato': {
        // mandato de arriendo o de venta que armó Asset (api/mandato-arriendo.ts y mandato-venta.ts): si ya se envió o se firmó, el paso
        // lo sigue (con o sin formatos propios). Basta uno de los tipos que tiene la propiedad (firmado gana sobre enviado).
        const reA = p?.venta && p?.arriendo ? /mandato de (arriendo|venta) n/i : p?.venta ? /mandato de venta n/i : /mandato de arriendo n/i;
        const fa = p ? firmaProp(p, reA) : null;
        if (fa) return fa.estado === 'firmado' ? { e: 'ok', f: fa.firmado || fa.fecha } : { e: 'pend', q: 'otro', quien: 'la firma del propietario', d: `${/venta/i.test(fa.plantilla || '') ? 'Mandato de venta' : 'Mandato de arriendo'} enviado a firmar el ${fdm(fa.fecha)}${fa.operacion ? ' · operación ' + fa.operacion : ''}.` };
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
      case 'visita': { // visita y orden de visita (un solo paso): se agenda y, ya en la puerta, se genera la orden y se envía a firmar
        // orden firmada → logrado; enviada → esperando la firma del visitante; sin orden: el estado de la visita en la agenda
        const fo = firmaNeg(p, n, /orden de visita/i);
        if (fo?.estado === 'firmado') return { e: 'ok', f: fo.firmado || fo.fecha, d: `Orden de visita firmada${fo.operacion ? ' · operación ' + fo.operacion : ''}` };
        if (fo) return { e: 'pend', q: 'otro', quien: 'la firma del visitante', d: `Orden de visita enviada el ${fdm(fo.fecha)}${fo.operacion ? ' · operación ' + fo.operacion : ''}.` };
        const vs = visitas(p, n); const h = hoy(); const ah = require('./hora').ahora(); const cuando = (e) => `${fdm(e.fecha)}${e.hora ? ' a las ' + e.hora : ''}`;
        const hecha = vs.filter((e) => e.estado === 'hecho').pop();
        if (hecha || tarea('visita', 1) || pasado('visita')) return { e: 'ok', f: hecha ? hecha.fecha : null, d: hecha ? `Visita realizada el ${cuando(hecha)}${pasado('visita') ? '' : ' · sin orden de visita'}` : '' };
        const prog = vs.filter((e) => e.estado === 'programado');
        const futura = prog.find((e) => e.fecha > h || (e.fecha === h && (e.hora || '23:59') >= ah));
        if (futura) {
          const c = futura.confirmacion;   // 'enviada' | 'confirmada' | 'cambio' (las confirmaciones manuales antiguas no traen estado)
          if (c?.estado === 'cambio') return { e: 'fail', d: `${c.nombre || 'El cliente'} pidió cambiar la visita del ${cuando(futura)}${c.respuesta ? ': «' + c.respuesta + '»' : ''}. Reprográmala.` };
          const conf = c?.estado === 'confirmada' ? ` · confirmada por ${c.nombre || 'el cliente'}` : c?.estado === 'enviada' ? ' · confirmación enviada por WhatsApp' : ' · sin confirmar';
          // el día de la visita te toca: en la puerta se genera la orden y se envía a firmar
          if (futura.fecha === h) return { e: 'pend', q: 'tu', vence: futura.fecha, d: `Visita hoy${futura.hora ? ' a las ' + futura.hora : ''}${conf} · en la puerta, genera la orden de visita y envíala a firmar.` };
          if (c?.estado === 'confirmada') return { e: 'pend', q: 'otro', quien: 'el día de la visita', vence: futura.fecha, d: `Visita del ${cuando(futura)}${conf}` };
          return { e: 'pend', q: 'otro', quien: c?.estado === 'enviada' ? `la respuesta de ${c.nombre || 'el cliente'}` : 'la confirmación', vence: futura.fecha, d: `Visita agendada el ${cuando(futura)}${conf}` };
        }
        if (prog.length) return { e: 'fail', d: `La visita del ${cuando(prog[prog.length - 1])} ya pasó: márcala como realizada o reprográmala.` };
        if (vs.length) return { e: 'fail', d: `La visita del ${cuando(vs[vs.length - 1])} se canceló.` };
        return null; }
      case 'acta': { // (el acta de visita ya no se firma: el paso se logra al cerrarla, lo marca el servidor; esto solo respeta lo firmado antes)
        const f = firmaNeg(p, n, /^acta de visita/i);
        if (!f) return null;   // el acta sin firma: la deja pendiente el servidor al cerrarla
        return f.estado === 'firmado' ? { e: 'ok', f: f.firmado || f.fecha, d: `Firmada${f.operacion ? ' · operación ' + f.operacion : ''}` } : { e: 'pend', q: 'otro', quien: 'la firma del visitante', d: `Enviada el ${fdm(f.fecha)}${f.operacion ? ' · operación ' + f.operacion : ''}.` }; }
      case 'negociacion': return tarea('reserva', 0) && n.tipo === 'venta' || pasado('visita') && n?.firmas?.reserva ? { e: 'ok' } : null;
      case 'aceptacion': { // la última ronda de la negociación: aceptada → logrado; rechazada → no logrado; contraoferta → falta la respuesta del interesado
        const rs = n?.aceptacion?.rondas || []; const u = rs[rs.length - 1]; if (!u) return null;
        if (u.tipo === 'aceptada') return { e: 'ok', f: u.fecha, d: 'Aceptada con las condiciones finales.' };
        if (u.tipo === 'rechazada') return { e: 'fail', d: `${u.por === 'interesado' ? 'El interesado desistió' : 'El propietario rechazó la oferta'}${u.nota ? ': ' + u.nota : ''}.` };
        if (u.tipo === 'contraoferta') return { e: 'pend', q: 'tu', d: 'El propietario hizo una contraoferta: falta la respuesta del interesado.' };
        return { e: 'pend', q: 'otro', quien: 'la respuesta del propietario', d: 'Oferta presentada al propietario.' }; }
      case 'reserva_pago': case 'garantia_mes': case 'comision': { // arriendo: pagos que se registran con monto, fecha y comprobante (n.ciclo: ojo, n.cierre es el registro del cierre ganado/perdido)
        if (n?.tipo !== 'arriendo') break;
        const c = n.ciclo || {}; const pg = c.pagos || {}; const mf = (x) => `${x.moneda === 'UF' ? 'UF ' : x.moneda === 'USD' ? 'US$ ' : '$'}${Number(x.monto).toLocaleString('es-CL')}`;
        if (def.id === 'reserva_pago') return pg.reserva ? { e: 'ok', f: pg.reserva.fecha, d: `Pagada el ${fdm(pg.reserva.fecha)} · ${mf(pg.reserva)}` } : null;
        if (def.id === 'garantia_mes') { if (pg.garantia && pg.primerMes) return { e: 'ok', f: [pg.garantia.fecha, pg.primerMes.fecha].sort().pop(), d: 'Garantía y primer mes recibidos' }; if (pg.garantia || pg.primerMes) return { e: 'pend', q: 'tu', d: `Falta registrar ${pg.garantia ? 'el primer mes' : 'la garantía'}.` }; return null; }
        const co = c.comision || {}; if (co.pago) return { e: 'ok', f: co.pago.fecha, d: `Cobrada el ${fdm(co.pago.fecha)} · ${mf(co.pago)}` };
        if (co.factura) return { e: 'pend', q: 'otro', quien: 'el pago de la comisión', d: `Factura ${co.factura.numero ? 'nº ' + co.factura.numero + ' ' : ''}emitida el ${fdm(co.factura.fecha)}.` };
        return co.facturaFecha ? { e: 'pend', q: 'tu', vence: co.facturaFecha, d: `Facturar la comisión el ${fdm(co.facturaFecha)}.` } : null; }
      case 'reajustes': case 'renovacion': case 'devolucion': { // postarriendo: avisos que salen de las condiciones del contrato (n.ciclo.contrato.datos) y de lo registrado en n.ciclo.postarriendo
        if (n?.tipo !== 'arriendo') break;
        const k = n.ciclo?.contrato?.datos; const po = n.ciclo?.postarriendo || {}; if (!k?.inicio || !k.plazoMeses) return null;
        const mas = (f, m, d = 0) => { const x = new Date(f + 'T12:00:00'); x.setMonth(x.getMonth() + m); x.setDate(x.getDate() + d); return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
        const extra = po.renovacion?.decision === 'renovar' ? Number(po.renovacion.meses) || 0 : 0; const termino = mas(k.inicio, Number(k.plazoMeses) + extra); const limite = mas(termino, 0, -(Number(k.avisoDias) || 0));
        const h = hoy(); const en30 = mas(h, 0, 30); const estado = (vence, d) => vence < h ? { e: 'fail', q: 'tu', vence, d: d + ' · vencido' } : vence <= en30 ? { e: 'pend', q: 'tu', vence, d } : { e: 'todo', vence, d };
        if (def.id === 'reajustes') {
          const per = { ipc_semestral: 6, ipc_anual: 12 }[k.reajuste] || 0; if (!per) return { e: 'ok', d: 'El contrato no se reajusta por IPC.' };
          const rs = po.reajustes || []; const prox = mas(rs.length ? rs[rs.length - 1].desde : k.inicio, per);
          if (prox >= termino) return rs.length ? { e: 'ok', f: rs[rs.length - 1].registrado, d: `${rs.length} reajuste${rs.length === 1 ? '' : 's'} aplicado${rs.length === 1 ? '' : 's'}; no quedan en el plazo.` } : { e: 'ok', d: 'No hay reajustes dentro del plazo.' };
          return estado(prox, `Reajuste por IPC el ${fdm(prox)}${rs.length ? ' · ' + rs.length + ' aplicado' + (rs.length === 1 ? '' : 's') : ''}.`); }
        if (def.id === 'renovacion') {
          if (po.renovacion) return { e: 'ok', f: po.renovacion.fecha, d: po.renovacion.decision === 'renovar' ? `Renovado por ${po.renovacion.meses} meses (hasta el ${fdm(termino)}).` : 'Término del contrato acordado.' };
          return estado(limite, `El contrato termina el ${fdm(termino)}: avisar hasta el ${fdm(limite)}.`); }
        if (po.devolucion) return { e: 'ok', f: po.devolucion.fechaDevolucion, d: `Garantía devuelta el ${fdm(po.devolucion.fechaDevolucion)}.` };
        if (po.renovacion?.decision === 'termino' || h >= termino) return estado(mas(termino, 0, 30), `Devolver la garantía (el contrato termina el ${fdm(termino)}).`);
        return { e: 'todo', d: `Al término del contrato (${fdm(termino)}).` }; }
      case 'revision': { // arriendo: el texto del contrato lo aprueba CADA firmante (propietarios, arrendatario y codeudores): n.ciclo.contrato
        const k = n?.ciclo?.contrato; const v = (k?.versiones || []).slice(-1)[0]; if (!v) return null; const fs = v.firmantes || []; const ap = k.aprobado || {};
        const faltan = fs.filter((q) => !ap[q.personaId]);
        if (fs.length && !faltan.length) return { e: 'ok', f: fs.map((q) => ap[q.personaId]).sort().pop(), d: `Texto final aprobado (V${v.n}) por todos los firmantes.` };
        return { e: 'pend', q: 'tu', d: fs.length ? `V${v.n}: falta que aprueben ${faltan.map((q) => q.nombre).join(', ')}.` : `V${v.n}: sin firmantes registrados.` }; }
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
    const defs = ambito === 'captacion' ? [[CAPT, 0]] : tipo === 'arriendo' ? [[COM_ARR, 1], [CIERRE_ARR, 2], [POSTARR, 3, true]] : [[COM, 1], [POST.venta, 2]];   // el 3.º: los avisa Asset
    const etapas = defs.map(([lista, k, aviso]) => ({ id: (tipo === 'arriendo' ? IDS_ETAPA_ARR : IDS_ETAPA)[k], nombre: (tipo === 'arriendo' ? NOMBRES_ARR : NOMBRES)[k], aviso: !!aviso, pasos: lista.map((def) => {
      const a = auto(def, p, n); const m = manual[def.id];
      let x = { id: def.id, t: def.t, e: 'todo', f: null, d: '', q: 'tu', quien: '', vence: null, accion: def.a, tipo: def.tipo, etapaFirma: def.etapa || null, pedir: def.pedir ? def.pedir(ctx) : null, manual: !!m };
      if (def.id === 'visita' && n) Object.assign(x, { accion: 'Agendar visita', tipo: 'visita', clienteId: n.clienteId || '' });   // se agenda, confirma y reprograma dentro del modal del paso
    if (def.id === 'interesado' && n) Object.assign(x, { accion: n.clienteId ? (tipo === 'venta' ? 'Cambiar comprador' : 'Cambiar arrendatario') : (tipo === 'venta' ? 'Vincular comprador' : 'Vincular arrendatario'), tipo: 'cliente', clienteRol: tipo === 'venta' ? 'comprador' : 'arrendatario', clienteId: n.clienteId || '' });   // el negocio ya existe: falta el cliente, no otro negocio
      if (a?.e === 'ok') Object.assign(x, a, { e: 'ok' });
      else if (m?.e) Object.assign(x, { e: m.e, f: m.f || null, d: m.d || '', q: m.quien ? 'otro' : 'tu', quien: m.quien || '', vence: m.vence || null });
      else if (a) Object.assign(x, a);
      if (x.e === 'ok' && !a && m?.f) x.f = m.f;
      return x;
    }) }));
    // el actual: el primer paso no logrado; los anteriores sin evidencia quedan como «saltados» (logrados si hay pasos posteriores logrados)
    const plano = etapas.flatMap((e, ei) => (e.aviso ? [] : e.pasos.map((x, pi) => ({ x, ei, pi }))));
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
      if (actual.e === 'pend' && actual.q === 'otro' && actual.id === 'visita') sig.x.accion = actual.accion = 'Ver visita';   // conserva su modal (confirmar, reprogramar, marcar realizada)
      else if (actual.e === 'pend' && actual.q === 'otro') { sig.x.accion = actual.accion = actual.tipo === 'firma' ? 'Revisar firmas' : 'Ver detalle'; sig.x.tipo = actual.tipo = actual.tipo === 'firma' ? 'revisar' : 'ver'; }
    }
    for (const e of etapas) { e.ok = e.pasos.filter((x) => x.e === 'ok').length; e.total = e.pasos.length; e.fail = e.pasos.some((x) => x.e === 'fail'); e.completa = e.ok === e.total; e.actual = !!actual && etapas.indexOf(e) === actual.ei; }
    return { tipo, ambito, etapas, actual, cerrado: !actual, ctx, propId: p?.id || null };   // propId: el de la propiedad del negocio (la ficha del negocio no lo trae y sus documentos se buscan por propiedad)
  }

  // marcar a mano: estado 'ok' | 'fail' | 'pend' | null (volver a lo automático); quien = «esperando a…»; vence = fecha límite
  // (el cálculo de los pasos es solo para MOSTRAR: la regla vive en el servidor, api/src/negocios/negocio-reglas.ts; negocios-paridad-unit.js las compara)
  function marcar({ negocioId, propId, paso, estado, d = '', quien = '', vence = null }) {
    const ok = ['ok', 'fail', 'pend', null].includes(estado); if (!ok) throw new Error('Estado no válido.');
    const tgt = negocioId ? inmo.negocios().find((x) => x.id === negocioId) : inmo.todas().find((x) => x.id === propId);
    if (!tgt) throw new Error(negocioId ? 'El negocio ya no existe.' : 'La propiedad ya no existe.');
    const def = [...CAPT, ...COM, ...POST.venta, ...COM_ARR, ...CIERRE_ARR, ...POSTARR].find((x) => x.id === paso); if (!def) throw new Error('Paso desconocido.');
    // con la cuenta de Asset la marca de un paso del NEGOCIO la hace el servidor (POST …/acciones/paso); devuelve una promesa. La captación (pasos de la propiedad) sigue aquí.
    if (negocioId && inmo.API) return require('./negocios').paso(negocioId, { paso, estado, detalle: String(d || ''), quien: String(quien || ''), vence }).then(() => true);
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
      if (a) items.push({ ...base, paso: a.t, pasoId: a.id, d: a.d, vence: a.vence, quien: a.quien, accion: a.accion, tipo: a.tipo, etapaFirma: a.etapaFirma, pedir: a.pedir, clienteId: a.clienteId, clienteRol: a.clienteRol, clase: a.e === 'fail' ? 'atencion' : a.q === 'otro' ? 'esperando' : 'tetoca', hoy: a.vence === hoy() });
    };
    for (const n of negs) { const p = props.find((x) => x.id === n.propId); const c = n.clienteId ? inmo.personaPorId(n.clienteId) : null;
      add({ negocioId: n.id, propId: p?.id || null, codigo: p?.codigo || '', titulo: p?.titulo || 'Negocio', cliente: c?.nombre || '', op: n.tipo === 'venta' ? 'Venta' : 'Arriendo' }, pasos({ n, p })); }
    // el postarriendo: los avisos (reajuste, renovación o término, devolución de la garantía) de los arriendos ya ganados entran a «Hoy» cuando tocan o vencieron
    for (const n of inmo.negocios().filter((x) => x.estado === 'ganado' && x.tipo === 'arriendo')) {
      const p = props.find((x) => x.id === n.propId); const c = n.clienteId ? inmo.personaPorId(n.clienteId) : null; const r = pasos({ n, p });
      const segs = r.etapas.map((e) => ({ ok: e.ok, total: e.total, pct: Math.round((e.ok / e.total) * 100), completa: e.completa, fail: e.fail, actual: e.aviso && e.pasos.some((y) => y.e === 'pend' || y.e === 'fail') }));
      for (const e of r.etapas.filter((y) => y.aviso)) for (const a of e.pasos.filter((y) => y.e === 'pend' || y.e === 'fail')) {
        items.push({ negocioId: n.id, propId: p?.id || null, codigo: p?.codigo || '', titulo: p?.titulo || 'Negocio', cliente: c?.nombre || '', op: 'Arriendo', etapa: 'Etapa 4 · Postarriendo', segs, paso: a.t, pasoId: a.id, d: a.d, vence: a.vence, quien: a.quien, accion: a.accion, tipo: a.tipo, clase: a.e === 'fail' ? 'atencion' : a.q === 'otro' ? 'esperando' : 'tetoca', hoy: a.vence === hoy(), aviso: true });
      }
    }
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

module.exports = { crear, CAPT, COM, POST, COM_ARR, CIERRE_ARR, POSTARR };
