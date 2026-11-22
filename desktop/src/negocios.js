// Negocios: el embudo de cada venta y arriendo, de punta a punta.
// Cada etapa tiene sus tareas y, cuando corresponde, el documento que debe quedar firmado con Portalfirma.
// Al firmarse ese documento la etapa se completa sola y el negocio avanza; la ficha de la propiedad
// cambia de estado (reservada, vendida, arrendada) y, si está publicada, el aviso del portal se ajusta.
//
// ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
// ║ LA LÓGICA DE NEGOCIO VIVE EN EL SERVIDOR (api/src/negocios/negocio-reglas.ts y negocio-acciones.ts).          ║
// ║ Con la cuenta de Asset (inmo.API) cada operación que CAMBIA un negocio (crear, mover, tarea, paso, cerrar,    ║
// ║ reabrir, nota, condiciones, próxima acción, firmas, pagos, factura, aceptación, aprobación del contrato y     ║
// ║ postarriendo) le pide el cambio al servidor (POST /v1/negocios/:id/acciones/…) y deja la copia local igual a  ║
// ║ lo que devolvió (el negocio entero y, si cambió de estado, la propiedad). El estado de la propiedad, los      ║
// ║ avisos y el avance al firmarse lo aplica el servidor: aquí no se repiten.                                     ║
// ║ El camino «local» (PF_MOCK=1: la demostración y casi todas las pruebas del escritorio, sin servidor) sigue    ║
// ║ aquí abajo como estaba: SOLO es la demo. No agregar reglas nuevas a este archivo: van al servidor.            ║
// ║ Lo que solo se MUESTRA (vista, documentos, siguiente, pendientes, comisionMonto…) sí se calcula aquí, y       ║
// ║ test/negocios-paridad-unit.js comprueba que coincida con las reglas del servidor.                             ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
const inmo = require('./inmo');

const ETAPAS = {
  venta: [
    { id: 'interes', t: 'Interesado', d: 'Primer contacto: consulta, lead del portal o referido.', tareas: ['Registrar al cliente con su RUT', 'Enviar la ficha de la propiedad'] },
    { id: 'visita', t: 'Visita', d: 'El cliente conoce la propiedad.', tareas: ['Agendar la visita', 'Registrar cómo le fue'] },
    { id: 'reserva', t: 'Oferta y reserva', d: 'Se acuerda el precio y el cliente reserva.', tareas: ['Acordar precio y condiciones', 'Recibir el dinero de la reserva'], firma: 'Oferta u orden de reserva', estado: 'reservada' },
    { id: 'promesa', t: 'Promesa', d: 'Compraventa prometida, con plazo para escriturar.', tareas: ['Estudio de títulos', 'Aprobación del crédito (si aplica)'], firma: 'Promesa de compraventa' },
    { id: 'escritura', t: 'Escritura', d: 'Firma de la escritura de compraventa en notaría.', tareas: ['Coordinar la notaría', 'Revisar el borrador de escritura'], firma: 'Escritura de compraventa' },
    { id: 'inscripcion', t: 'Inscripción', d: 'Inscripción en el Conservador de Bienes Raíces.', tareas: ['Ingresar al Conservador', 'Recibir el dominio vigente'] },
    { id: 'entrega', t: 'Entrega', d: 'Entrega material y cobro de la comisión.', tareas: ['Entregar llaves', 'Cobrar la comisión'], firma: 'Acta de entrega', estado: 'vendida', final: true },
  ],
  arriendo: [
    { id: 'interes', t: 'Interesado', d: 'Primer contacto: consulta, lead del portal o referido.', tareas: ['Registrar al cliente con su RUT', 'Enviar la ficha de la propiedad'] },
    { id: 'visita', t: 'Visita', d: 'El cliente conoce la propiedad.', tareas: ['Agendar la visita', 'Registrar cómo le fue'] },
    { id: 'reserva', t: 'Reserva', d: 'El cliente reserva mientras se evalúa.', tareas: ['Recibir el dinero de la reserva'], firma: 'Reserva de arriendo', estado: 'reservada' },
    { id: 'evaluacion', t: 'Evaluación', d: 'Antecedentes del arrendatario y del codeudor.', tareas: ['Liquidaciones de sueldo o renta', 'Informe comercial', 'Codeudor o seguro de arriendo'] },
    { id: 'contrato', t: 'Contrato', d: 'Firma del contrato de arriendo.', tareas: ['Recibir garantía y primer mes'], firma: 'Contrato de arriendo' },
    { id: 'entrega', t: 'Entrega', d: 'Entrega con inventario y cobro de la comisión.', tareas: ['Entregar llaves', 'Cobrar la comisión'], final: true },   // el acta de entrega es la firma «entrega_acta» (fuera del embudo): al firmarse la propiedad queda arrendada; el negocio lo cierra el cobro de la comisión
  ],
};
const now = () => new Date().toISOString();
const uid = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const err = (m) => new Error(m);
const etapas = (tipo) => ETAPAS[tipo] || ETAPAS.venta;
const etapa = (tipo, id) => etapas(tipo).find((e) => e.id === id);
// firmas que no son una etapa del embudo: firmarlas no mueve el negocio
const FIRMAS_FUERA = { oferta: { firma: 'Carta oferta' }, entrega_acta: { firma: 'Acta de entrega e inventario' } };
const lista = () => inmo.negocios();
const neg = (id) => { const n = lista().find((x) => x.id === id); if (!n) throw err('El negocio ya no existe.'); return n; };
let alCambiarPropiedad = async () => [];
let alActualizarPropiedad = async () => [];   // con el servidor: la propiedad ya cambió de estado allá; aquí se ajusta el aviso del portal (antes, después)
const configurar = (o) => { if (o.alCambiarPropiedad) alCambiarPropiedad = o.alCambiarPropiedad; if (o.alActualizarPropiedad) alActualizarPropiedad = o.alActualizarPropiedad; };
const clonar = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const aServidor = () => inmo.API;   // con la cuenta de Asset las operaciones las hace el servidor (ver arriba)

// ---------- con el servidor: una acción y la copia local igual a lo que devolvió ----------
// id null = crear. Devuelve { negocio (vista), mensajes (los avisos del servidor, más los del aviso del portal) }.
async function servidor(id, accion, cuerpo, ref = {}) {
  const n0 = id ? lista().find((x) => x.id === id) : null; const propId = n0?.propId || ref.propId || null;
  const antes = propId ? clonar(inmo.todas().find((p) => p.id === propId)) : null;
  const r = await inmo.accionNegocio(id, accion, cuerpo);
  const n = r.negocio; const mensajes = [...(r.avisos || [])];
  // el servidor aplicó el estado de la propiedad (reservada, vendida, arrendada…) y, al crear, vinculó al cliente: se trae la ficha
  if (n?.propId && (!id || mensajes.length)) {
    try {
      const p = await inmo.traerProp(n.propId);
      if (!id && n.clienteId) await inmo.recargarPer(n.clienteId).catch(() => null);
      if (antes && p && (p.estadoVenta !== antes.estadoVenta || p.estadoArriendo !== antes.estadoArriendo)) mensajes.push(...((await alActualizarPropiedad(antes, p)) || []));
    } catch (e) { console.warn('[negocios] ficha de la propiedad:', e.message); }
  }
  return { ...r, mensajes, negocio: n ? vista(neg(n.id)) : null };
}

function titulo(n) {
  const p = n.propId ? inmo.todas().find((x) => x.id === n.propId) : null; const c = n.clienteId ? inmo.personaPorId(n.clienteId) : null;
  return [p ? p.titulo : 'Sin propiedad', c ? c.nombre : null].filter(Boolean).join(' · ');
}
// Todos los documentos del negocio, en el orden del proceso, con su estado: los que van a firma de una etapa, la carta oferta y el
// acta de entrega (firmas «fuera del embudo»), la orden y el acta de visita (firmas de la propiedad ligadas a este negocio o a su cliente)
// y el texto del contrato en revisión. Los que aún no se arman salen como «pendiente».
function documentos(n, p) {
  const fdm = (f) => (f ? String(f).slice(0, 10) : null);
  const cli = n.clienteId ? inmo.personaPorId(n.clienteId) : null; const rutC = cli?.rut ? inmo.fmtRut(cli.rut) : null;
  const deVisita = (re) => { // la firma de la propiedad que es de ESTE negocio (o suelta, pero del mismo cliente)
    const suyas = (p?.firmas || []).filter((x) => re.test(x.plantilla || '') && ((x.negocioId === n.id) || (!x.negocioId && (x.firmantes || []).some((q) => (n.clienteId && q.personaId === n.clienteId) || (rutC && q.rut && inmo.fmtRut(q.rut) === rutC)))));
    return suyas.find((x) => x.estado === 'firmado') || suyas[0] || null;
  };
  const doc = (id, titulo, et, f, detalle) => ({ id, titulo, etapa: et || null, estado: f?.estado === 'firmado' ? 'firmado' : f?.operacion || f?.estado === 'en_firma' ? 'en_firma' : 'pendiente', operacion: f?.operacion || null, firmados: f?.firmados ?? null, total: f?.total ?? null, fecha: fdm(f?.firmado || f?.fecha), fuera: !!f?.fuera, detalle: detalle || null });
  const out = []; const usadas = new Set();
  const firma = (k, et) => { usadas.add(k); out.push(doc(k, (etapa(n.tipo, k) || FIRMAS_FUERA[k] || { firma: 'Documento' }).firma, et || etapa(n.tipo, k)?.t || null, n.firmas?.[k])); };
  out.push(doc('orden', 'Orden de visita', 'Visita', deVisita(/orden de visita/i)));
  out.push(doc('acta', 'Acta de visita', 'Visita', deVisita(/^acta de visita/i)));
  if (n.tipo === 'arriendo') {
    firma('oferta', 'Reserva'); firma('reserva');
    const k = n.ciclo?.contrato; const v = (k?.versiones || []).slice(-1)[0];
    if (v) { const fs = v.firmantes || []; const ap = k.aprobado || {}; const faltan = fs.filter((q) => !ap[q.personaId]); out.push({ id: 'contrato_texto', titulo: 'Contrato de arriendo (texto)', etapa: 'Contrato', estado: fs.length && !faltan.length ? 'aprobado' : 'revision', operacion: null, firmados: fs.length - faltan.length, total: fs.length, fecha: null, fuera: false, detalle: `Versión ${v.n}${fs.length ? (faltan.length ? ` · falta que aprueben ${faltan.map((q) => q.nombre).join(', ')}` : ' · aprobado por todos los firmantes') : ' · sin firmantes registrados'}` }); }
    firma('contrato'); firma('entrega_acta', 'Entrega');
  } else for (const e of etapas(n.tipo)) if (e.firma) firma(e.id);
  for (const [k, f] of Object.entries(n.firmas || {})) if (!usadas.has(k)) out.push(doc(k, (etapa(n.tipo, k) || FIRMAS_FUERA[k] || { firma: 'Documento' }).firma, etapa(n.tipo, k)?.t || null, f)); // cualquier otra firma ligada al negocio
  return out;
}
function vista(n) { // datos derivados para la interfaz
  const p = n.propId ? inmo.todas().find((x) => x.id === n.propId) : null; const c = n.clienteId ? inmo.personaPorId(n.clienteId) : null;
  const et = etapa(n.tipo, n.etapa); const ord = etapas(n.tipo).findIndex((e) => e.id === n.etapa);
  const pend = (et?.tareas || []).filter((_, i) => !n.tareas?.[n.etapa]?.[i]);
  const f = n.firmas?.[n.etapa];
  let siguiente = null;
  if (n.estado === 'abierto') {
    if (et?.firma && (!f || f.estado !== 'firmado')) siguiente = f?.operacion ? `Esperando firmas: ${et.firma.toLowerCase()}` : `Falta firmar: ${et.firma.toLowerCase()}`;
    else if (pend.length) siguiente = pend[0];
    else if (!et?.final) siguiente = `Listo para pasar a ${etapas(n.tipo)[ord + 1]?.t}`;
  }
  const comisionMonto = n.comision?.valor == null ? null : n.comision.tipo === '%' ? (n.valor?.valor || 0) * n.comision.valor / 100 : n.comision.valor;
  return { ...n, documentos: documentos(n, p), titulo: titulo(n), prop: p ? { id: p.id, codigo: p.codigo, titulo: p.titulo, comuna: p.comuna, foto: (p.fotos || [])[0] || null, propietarios: (p.vinculos || []).filter((v) => v.rol === 'propietario').map((v) => inmo.personaPorId(v.personaId)).filter(Boolean).map((x) => ({ id: x.id, nombre: x.nombre, rut: x.rut })) } : null,
    cliente: c ? { id: c.id, nombre: c.nombre, rut: c.rut, telefono: c.telefono, email: c.email } : null, etapaInfo: et, orden: ord, total: etapas(n.tipo).length, siguiente, pendientes: pend.length,
    diasEnEtapa: Math.floor((Date.now() - new Date(n.etapaDesde || n.creado).getTime()) / 864e5), comisionMonto,
    vencida: !!(n.estado === 'abierto' && n.proximaAccion?.fecha && n.proximaAccion.fecha < now().slice(0, 10)) };
}
function listar() { return { negocios: lista().map(vista), etapas: ETAPAS }; }
// con su historial (en la base, por eso async); ver(id) es la misma vista sin historial, sincrónica
async function obtener(id) { const v = vista(neg(id)); return { ...v, actividad: await inmo.actividadDe(id) }; }
const ver = (id) => vista(neg(id));

// Camino local (demo): aplica el cambio a la copia y, con la API, encola el PUT del documento completo (solo para lo que el servidor no tiene como acción)
function guardarLocal(o, { sinRegistro = false } = {}) {
  const tipo = o.tipo === 'arriendo' ? 'arriendo' : 'venta';
  const datos = {};
  // REGLA: todo negocio tiene una propiedad y un interesado; no se pueden quitar (solo cambiar por otra/otro)
  if (o.id && 'propId' in o && !o.propId) throw err('Todo negocio necesita una propiedad: no se puede quitar.');
  if (o.id && 'clienteId' in o && !o.clienteId) throw err(`Todo negocio necesita su ${tipo === 'venta' ? 'comprador' : 'arrendatario'}: no se puede quitar.`);
  if ('propId' in o) { if (o.propId) { const p = inmo.obtener(o.propId); if (!(tipo === 'venta' ? p.venta : p.arriendo)) throw err(`La propiedad no está en ${tipo}. Márcala en su ficha primero.`); } datos.propId = o.propId || null; }
  if ('clienteId' in o) datos.clienteId = o.clienteId || null;
  if ('valor' in o) datos.valor = o.valor && o.valor.valor !== '' && o.valor.valor != null ? { valor: Number(o.valor.valor), moneda: ['UF', 'CLP', 'USD'].includes(o.valor.moneda) ? o.valor.moneda : 'UF' } : null;
  if ('comision' in o) datos.comision = o.comision && o.comision.valor !== '' && o.comision.valor != null ? { tipo: o.comision.tipo === 'monto' ? 'monto' : '%', valor: Number(o.comision.valor) } : null;
  if ('oferta' in o) { const q = o.oferta || {}; datos.oferta = o.oferta ? { garantia: String(q.garantia || '').trim().slice(0, 120), plazo: String(q.plazo || '').trim().slice(0, 80), vigencia: String(q.vigencia || '').replace(/\D/g, '').slice(0, 3), condiciones: String(q.condiciones || '').trim().slice(0, 800), ...Object.fromEntries(['piePct', 'promesaDias', 'escrituraDias', 'seriedadUF', 'comisionPct'].filter((c) => String(q[c] ?? '').trim() !== '').map((c) => [c, String(q[c]).replace(',', '.').replace(/[^\d.]/g, '').slice(0, 8)])) } : null; }   // la carta oferta lee estos datos
  if ('aceptacion' in o) { // la negociación con el propietario: oferta, contraofertas y la respuesta final
    const T = ['oferta', 'contraoferta', 'aceptada', 'rechazada']; const txt = (v, m) => String(v || '').trim().slice(0, m);
    datos.aceptacion = o.aceptacion ? { rondas: (o.aceptacion.rondas || []).slice(-40).map((r) => ({ fecha: r.fecha || now(), tipo: T.includes(r.tipo) ? r.tipo : 'oferta', por: r.por === 'interesado' ? 'interesado' : 'propietario', monto: r.monto === '' || r.monto == null ? null : Number(r.monto) || null, moneda: ['UF', 'CLP', 'USD'].includes(r.moneda) ? r.moneda : 'UF', garantia: txt(r.garantia, 120), plazo: txt(r.plazo, 80), condiciones: txt(r.condiciones, 800), nota: txt(r.nota, 400) })) } : null;
  }
  if ('ciclo' in o) { if (o.ciclo && JSON.stringify(o.ciclo).length > 90000) throw err('Los datos del cierre del arriendo son demasiado grandes.'); datos.ciclo = o.ciclo ? JSON.parse(JSON.stringify(o.ciclo)) : null; }   // pagos, revisión del contrato, entrega y comisión del arriendo
  const dia = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  if ('cierreEstimado' in o) datos.cierreEstimado = dia(o.cierreEstimado); // día en que se espera cerrar (Panel de brokers: proyección del mes)
  if ('comisionPagada' in o) datos.comisionPagada = dia(o.comisionPagada?.fecha) ? { fecha: dia(o.comisionPagada.fecha) } : null; // venta: cuándo se pagó la comisión (en arriendo es n.ciclo.comision.pago)
  if ('proximaAccion' in o) datos.proximaAccion = o.proximaAccion?.texto ? { texto: String(o.proximaAccion.texto).trim().slice(0, 160), fecha: o.proximaAccion.fecha || null } : null;
  if ('corredor' in o) datos.corredor = String(o.corredor || '').trim();
  if ('corredorId' in o) datos.corredorId = o.corredorId || null;
  if (o.id) {
    const n = neg(o.id); const antes = n.proximaAccion?.texto; Object.assign(n, datos, { actualizado: now() });
    if ('proximaAccion' in o && datos.proximaAccion?.texto && datos.proximaAccion.texto !== antes) inmo.registrar(n.id, `Próxima acción: ${datos.proximaAccion.texto}${datos.proximaAccion.fecha ? ' (' + datos.proximaAccion.fecha + ')' : ''}`, { ref2: n.propId });
    else if (!sinRegistro && !('proximaAccion' in o)) inmo.registrar(n.id, 'Condiciones actualizadas', { ref2: n.propId });
    inmo.guardar(); return vista(n);
  }
  if (!datos.propId) throw err('Elige la propiedad del negocio.');
  if (!datos.clienteId) throw err(`Elige al ${tipo === 'venta' ? 'comprador' : 'arrendatario'}.`);
  const ini = etapas(tipo).some((e) => e.id === o.etapa) ? o.etapa : 'interes';
  // el código NG-001, NG-002… lo asigna el servidor al guardarlo (api/src/negocios/negocios.ts); sin cuenta de Asset (pruebas) se numera aquí
  const codigoLocal = inmo.API ? {} : { codigo: 'NG-' + String(lista().reduce((m, x) => Math.max(m, Number(/^NG-(\d+)$/.exec(x.codigo || '')?.[1]) || 0), 0) + 1).padStart(3, '0') };
  const n = { id: uid(), tipo, estado: 'abierto', etapa: ini, etapaDesde: now(), tareas: { interes: [true] }, firmas: {}, creado: now(), actualizado: now(), ...codigoLocal, ...datos }; // el cliente ya quedó registrado con su RUT
  lista().unshift(n);
  const p = inmo.obtener(n.propId); const c = inmo.personaPorId(n.clienteId);
  inmo.registrar(n.id, `Negocio de ${tipo} creado en etapa «${etapa(tipo, ini).t}»`, { ref2: n.propId });
  inmo.registrar(n.propId, `Nuevo negocio de ${tipo} con ${c?.nombre || 'cliente'}`, { ref2: n.id });
  // el cliente queda vinculado a la propiedad con su rol
  const rol = tipo === 'venta' ? 'comprador' : 'arrendatario';
  inmo.guardar();
  const vinculo = c && !(p.vinculos || []).some((v) => v.personaId === c.id && v.rol === rol) ? inmo.vincular(p.id, c.id, rol).catch(() => null) : Promise.resolve();
  return vinculo.then(() => aplicarEstado(n, null)).then(() => vista(n));
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const normValor = (v) => (v && v.valor !== '' && v.valor != null ? { valor: Number(v.valor), moneda: ['UF', 'CLP', 'USD'].includes(v.moneda) ? v.moneda : 'UF' } : null);
const normComision = (c) => (c && c.valor !== '' && c.valor != null ? { tipo: c.tipo === 'monto' ? 'monto' : '%', valor: Number(c.valor) } : null);
// Crear o cambiar datos de un negocio. Con el servidor: crear = acciones/crear; próxima acción = proxima-accion; valor, comisión, oferta, cierre
// estimado y comisión pagada = condiciones. Lo que el servidor aún no tiene como acción (propiedad o cliente del negocio, corredor, datos del
// contrato/entrega dentro de `ciclo`, y las rondas de `aceptacion` escritas a mano) sigue por el PUT del documento completo, con su versión.
const guardar = (o) => (aServidor() ? guardarServidor(o) : guardarLocal(o));
async function guardarServidor(o) {
  const tipo = o.tipo === 'arriendo' ? 'arriendo' : 'venta';
  if (!o.id) {
    if (!o.propId) throw err('Elige la propiedad del negocio.');
    if (!o.clienteId) throw err(`Elige al ${tipo === 'venta' ? 'comprador' : 'arrendatario'}.`);
    const cuerpo = { tipo, propiedadId: o.propId, clienteId: o.clienteId };
    if ('valor' in o) cuerpo.valor = normValor(o.valor);
    if ('comision' in o) cuerpo.comision = normComision(o.comision);
    if (o.etapa) cuerpo.etapa = o.etapa;
    if (o.proximaAccion?.texto) cuerpo.proximaAccion = { texto: String(o.proximaAccion.texto), fecha: DIA.test(o.proximaAccion.fecha || '') ? o.proximaAccion.fecha : null };
    if (o.corredorId) cuerpo.corredorId = o.corredorId;
    const r = await servidor(null, 'crear', cuerpo, { propId: o.propId });
    const resto = {}; for (const k of ['oferta', 'cierreEstimado', 'comisionPagada', 'aceptacion', 'ciclo']) if (k in o) resto[k] = o[k];
    return Object.keys(resto).length ? guardar({ id: r.negocio.id, ...resto }) : r.negocio;
  }
  const id = o.id; neg(id);
  if ('propId' in o && !o.propId) throw err('Todo negocio necesita una propiedad: no se puede quitar.');
  if ('clienteId' in o && !o.clienteId) throw err(`Todo negocio necesita su ${neg(id).tipo === 'venta' ? 'comprador' : 'arrendatario'}: no se puede quitar.`);
  if ('proximaAccion' in o) await servidor(id, 'proxima-accion', { texto: o.proximaAccion?.texto ? String(o.proximaAccion.texto) : '', fecha: DIA.test(o.proximaAccion?.fecha || '') ? o.proximaAccion.fecha : null });
  const cond = {};
  if ('valor' in o) cond.valor = normValor(o.valor);
  if ('comision' in o) cond.comision = normComision(o.comision);
  if ('oferta' in o) cond.oferta = o.oferta || null;
  if ('cierreEstimado' in o) cond.cierreEstimado = DIA.test(o.cierreEstimado || '') ? o.cierreEstimado : null;
  if ('comisionPagada' in o) cond.comisionPagada = DIA.test(o.comisionPagada?.fecha || '') ? { fecha: o.comisionPagada.fecha } : null;
  if (Object.keys(cond).length) await servidor(id, 'condiciones', cond);
  const resto = {}; for (const k of ['propId', 'clienteId', 'corredor', 'corredorId', 'aceptacion', 'ciclo']) if (k in o) resto[k] = o[k];
  if (Object.keys(resto).length) return guardarLocal({ id, ...resto }, { sinRegistro: true });
  return vista(neg(id));
}

// Estado comercial de la propiedad según la etapa más avanzada de sus negocios abiertos.
async function aplicarEstado(n, msgs) {
  const out = msgs || [];
  if (!n.propId) return out;
  const p = inmo.obtener(n.propId); const campo = n.tipo === 'venta' ? 'estadoVenta' : 'estadoArriendo';
  if (!(n.tipo === 'venta' ? p.venta : p.arriendo)) return out;
  let objetivo = null;
  const abiertos = lista().filter((x) => x.propId === n.propId && x.tipo === n.tipo && (x.estado === 'abierto' || x.estado === 'ganado'));
  for (const x of abiertos) {
    const idx = etapas(x.tipo).findIndex((e) => e.id === x.etapa);
    const marcas = etapas(x.tipo).slice(0, idx + 1).filter((e) => e.estado).map((e) => e.estado);
    if (x.estado === 'ganado' && x.tipo === 'venta') marcas.push('vendida');
    if (x.estado === 'ganado' && x.tipo === 'arriendo' || x.tipo === 'arriendo' && x.firmas?.entrega_acta?.estado === 'firmado') marcas.push('arrendada');
    const ult = marcas.pop(); if (ult && (!objetivo || rango(ult) > rango(objetivo))) objetivo = ult;
  }
  if (!objetivo && ['reservada'].includes(p[campo])) objetivo = 'disponible'; // se cayó el negocio: vuelve a estar disponible
  if (objetivo && p[campo] !== objetivo && !(p[campo] === 'no_disponible' && objetivo === 'disponible')) {
    const r = await alCambiarPropiedad(p.id, { [campo]: objetivo });
    inmo.registrar(n.id, `La propiedad quedó ${objetivo}`, { ref2: n.propId });
    out.push(`${p.codigo} quedó ${objetivo}.`, ...(r || []));
  }
  return out;
}
const rango = (e) => ({ disponible: 0, reservada: 1, arrendada: 2, vendida: 2 }[e] ?? 0);

async function mover(id, etapaId, motivo) {
  if (aServidor()) { neg(id); return servidor(id, 'mover', { etapa: etapaId, ...(motivo ? { motivo: String(motivo) } : {}) }); }
  const n = neg(id); if (n.estado !== 'abierto') throw err('El negocio está cerrado. Reábrelo para moverlo.');
  const e = etapa(n.tipo, etapaId); if (!e) throw err('Etapa no válida.');
  if (n.etapa === etapaId) return { negocio: vista(n), mensajes: [] };
  const desde = etapa(n.tipo, n.etapa); n.etapa = etapaId; n.etapaDesde = now(); n.actualizado = now();
  inmo.registrar(n.id, `${motivo || 'Movido'}: de «${desde.t}» a «${e.t}»`, { ref2: n.propId });
  inmo.guardar();
  const mensajes = await aplicarEstado(n);
  return { negocio: vista(n), mensajes };
}
// con el servidor devuelve una promesa (los llamadores usan await); en la demo, la vista
function tarea(id, etapaId, i, val) {
  if (aServidor()) { neg(id); return servidor(id, 'tarea', { etapa: etapaId, indice: Number(i), hecha: !!val }).then((r) => r.negocio); }
  const n = neg(id); n.tareas ||= {}; n.tareas[etapaId] ||= [];
  n.tareas[etapaId][i] = !!val; n.actualizado = now();
  const t = etapa(n.tipo, etapaId)?.tareas?.[i]; if (val && t) inmo.registrar(n.id, `Hecho: ${t}`, { ref2: n.propId });
  inmo.guardar(); return vista(n);
}
async function cerrar(id, resultado, motivo) {
  if (aServidor()) { neg(id); return servidor(id, 'cerrar', { resultado, ...(String(motivo || '').trim() ? { motivo: String(motivo).trim() } : {}) }); }
  const n = neg(id); if (!['ganado', 'perdido'].includes(resultado)) throw err('Resultado no válido.');
  if (resultado === 'perdido' && !String(motivo || '').trim()) throw err('Indica por qué se perdió el negocio.');
  n.estado = resultado; n.cierre = now(); n.motivoPerdida = resultado === 'perdido' ? String(motivo).trim() : null;
  if (resultado === 'ganado') n.etapa = etapas(n.tipo).at(-1).id;
  inmo.registrar(n.id, resultado === 'ganado' ? 'Negocio cerrado con éxito' : `Negocio perdido: ${n.motivoPerdida}`, { ref2: n.propId });
  inmo.registrar(n.propId, resultado === 'ganado' ? `Negocio de ${n.tipo} cerrado con éxito` : `Se cayó un negocio de ${n.tipo}: ${n.motivoPerdida}`, { ref2: n.id });
  inmo.guardar();
  const mensajes = await aplicarEstado(n);
  return { negocio: vista(n), mensajes };
}
async function reabrir(id) { if (aServidor()) { neg(id); return servidor(id, 'reabrir', {}); } const n = neg(id); n.estado = 'abierto'; n.cierre = null; n.motivoPerdida = null; n.etapaDesde = now(); inmo.registrar(n.id, 'Negocio reabierto', { ref2: n.propId }); inmo.guardar(); return { negocio: vista(n), mensajes: await aplicarEstado(n) }; }
function nota(id, texto) { if (aServidor()) { neg(id); if (!String(texto || '').trim()) throw err('Escribe la nota.'); return inmo.accionNegocio(id, 'nota', { texto: String(texto).trim() }).then(() => inmo.actividadDe(id)); } const n = neg(id); if (!String(texto || '').trim()) throw err('Escribe la nota.'); inmo.registrar(n.id, String(texto).trim(), { tipo: 'nota', ref2: n.propId }); inmo.guardar(); return inmo.actividadDe(n.id); }
function borrar(id) { const n = neg(id); const l = lista(); l.splice(l.indexOf(n), 1); inmo.registrar(n.propId, `Negocio de ${n.tipo} eliminado`); inmo.guardar(); return true; }

// ---------- firmas: cada etapa con documento queda ligada a su operación de Portalfirma ----------
// con el servidor devuelve una promesa (los llamadores usan await); en la demo, la vista
function vincularFirma(id, etapaId, operacion) {
  if (aServidor()) {
    neg(id); const op = Number(String(operacion).replace(/\D/g, '')); if (!op) throw err('Indica un número de operación válido.');
    return servidor(id, 'vincular-firma', { operacion: op, ...(etapaId ? { etapa: etapaId } : {}) }).then((r) => r.negocio);
  }
  const n = neg(id); const e = etapa(n.tipo, etapaId) || FIRMAS_FUERA[etapaId] || null; if (!e?.firma) throw err('Esta etapa no requiere firma.');
  const op = Number(String(operacion).replace(/\D/g, '')); if (!op) throw err('Indica un número de operación válido.');
  n.firmas ||= {}; n.firmas[etapaId] = { operacion: op, estado: 'en_firma', firmados: 0, total: 0, revisado: null };
  inmo.registrar(n.id, `${e.firma}: operación ${op} vinculada`, { ref2: n.propId }); inmo.guardar();
  return vista(n);
}
// Firmado fuera de Asset (en papel o en otra plataforma): la etapa queda cumplida igual
function firmaFuera(id, etapaId) {
  if (aServidor()) { neg(id); return servidor(id, 'firma-fuera', { etapa: etapaId }).then((r) => r.negocio); }
  const n = neg(id); const e = etapa(n.tipo, etapaId); if (!e?.firma) throw err('Esta etapa no requiere firma.');
  n.firmas ||= {}; n.firmas[etapaId] = { operacion: null, estado: 'firmado', fuera: true, firmado: now() }; n.actualizado = now();
  inmo.registrar(n.id, `${e.firma}: firmado fuera de Asset`, { ref2: n.propId }); inmo.guardar();
  return vista(n);
}
function quitarFirma(id, etapaId) { const n = neg(id); if (n.firmas) delete n.firmas[etapaId]; inmo.guardar(); return vista(n); }
// Consulta Portalfirma (API de integración) por las operaciones en firma; si quedó firmada completa la etapa y avanza.
async function revisarFirmas(pf, id) {
  // con el servidor: la revisión (y mover el negocio al firmarse) la hace él; «revisar ahora» se lo pide y se trae lo que cambió
  if (aServidor()) {
    const r = await require('./asset').llamar('POST', '/firmas/revisar', {}, 60000); try { await inmo.sincronizar(); } catch {}
    return { mensajes: r?.cambios || [], negocios: lista().map(vista) };
  }
  const ns = id ? [neg(id)] : lista().filter((n) => n.estado === 'abierto');
  const mensajes = [];
  for (const n of ns) for (const [etId, f] of Object.entries(n.firmas || {})) {
    if (!f?.operacion || f.estado === 'firmado') continue;
    let d; try { d = await require('./envio-api').detalleOperacion(f.operacion); } catch (e) { if (e.code === 'NEEDS_LOGIN' || /NEEDS_LOGIN/.test(e.message)) throw e; f.error = e.message; continue; }
    const sig = Array.isArray(d.signatories) ? d.signatories : Object.values(d.signatories || {}); f.firmados = sig.filter((s) => s.signed).length; f.total = sig.length; f.revisado = now(); f.error = null;
    if (d.status === 'finalized') {
      f.estado = 'firmado'; f.firmado = now(); const e = etapa(n.tipo, etId) || FIRMAS_FUERA[etId] || { firma: 'Documento' };   // «oferta» y «entrega_acta»: no son del embudo, no mueven el negocio
      inmo.registrar(n.id, `${e.firma} firmado (operación ${f.operacion})`, { ref2: n.propId });
      mensajes.push(`${titulo(n)}: ${e.firma.toLowerCase()} firmado.`);
      if (etId === 'entrega_acta') mensajes.push(...await aplicarEstado(n));   // la propiedad queda arrendada
      const lst = etapas(n.tipo); const idx = lst.findIndex((x) => x.id === etId);
      if (idx >= 0 && n.estado === 'abierto' && n.etapa === etId) { // la firma completa la etapa: el negocio avanza solo
        if (e.final) { const r = await cerrar(n.id, 'ganado'); mensajes.push(...r.mensajes); }
        else { const r = await mover(n.id, lst[idx + 1].id, 'Avanzó solo al firmarse el documento'); mensajes.push(...r.mensajes); }
      }
    }
  }
  inmo.guardar();
  return { mensajes, negocios: lista().map(vista) };
}

// Con la cuenta de Asset, la revisión de firmas la hace el servidor: cuando se firma el documento de la etapa actual,
// marca la firma con `avanzar` y le avisa al corredor a cargo; su app (al tomar el aviso, con el negocio ya
// sincronizado) mueve el negocio a la siguiente etapa, o lo cierra ganado si era la última.
async function avanzarPorFirma(id, etId) {
  // con el servidor: él ya movió el negocio (api/src/firmas/ronda.ts → NegocioAccionesService.avanzarPorFirma); aquí solo se trae lo nuevo y se avisa
  if (aServidor()) { try { await inmo.sincronizar(); } catch {} setTimeout(() => { inmo.sincronizar().catch(() => null); }, 4000).unref?.(); return { mensajes: [] }; }
  const n = lista().find((x) => x.id === id); const f = n?.firmas?.[etId];
  if (!f?.avanzar) return { mensajes: [] };
  delete f.avanzar;
  if (etId === 'entrega_acta') { const m = [`${titulo(n)}: acta de entrega firmada.`, ...await aplicarEstado(n)]; inmo.guardar(); return { mensajes: m }; }   // fuera del embudo: la propiedad queda arrendada y el negocio sigue abierto hasta cobrar la comisión
  if (n.estado !== 'abierto' || n.etapa !== etId || f.estado !== 'firmado') { inmo.guardar(); return { mensajes: [] }; }
  const e = etapa(n.tipo, etId); const lst = etapas(n.tipo); const idx = lst.findIndex((x) => x.id === etId);
  const mensajes = [`${titulo(n)}: ${(e?.firma || 'documento').toLowerCase()} firmado.`];
  if (e?.final || idx === lst.length - 1) { const r = await cerrar(n.id, 'ganado'); mensajes.push(...r.mensajes); }
  else { const r = await mover(n.id, lst[idx + 1].id, 'Avanzó solo al firmarse el documento'); mensajes.push(...r.mensajes); }
  return { mensajes };
}

// ---------- pagos, factura, aceptación, contrato y postarriendo ----------
// Con el servidor cada una es su acción (negocio-acciones.ts: pago, pago/quitar, factura, aceptacion, contrato/aprobar, postarriendo) y devuelve
// { negocio (vista), mensajes }. Lo que sigue al `if (aServidor())` de cada función es la demo local (PF_MOCK): las mismas cuentas, sin servidor.
const TIPO_PAGO = { reserva: 'Reserva', garantia: 'Garantía', primer_mes: 'Primer mes de arriendo', comision: 'Comisión', otro: 'Otro pago' };
const MEDIO_PAGO = { transferencia: 'Transferencia', deposito: 'Depósito', efectivo: 'Efectivo', cheque: 'Cheque', tarjeta: 'Tarjeta', otro: 'Otro medio' };
const montoTxt = (v, m) => `${m === 'UF' ? 'UF ' : m === 'USD' ? 'US$ ' : '$'}${Number(v).toLocaleString('es-CL')}`;
const fdmy = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');
const hoyDia = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const masDias = (f, dias) => { const x = new Date(f + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + dias); return x.toISOString().slice(0, 10); };
const cicloDe = (n) => JSON.parse(JSON.stringify(n.ciclo || {}));
// una acción del servidor que no cambia de etapa ni cierra: { negocio, mensajes }
const accion = (id, nombre, cuerpo) => { neg(id); return servidor(id, nombre, cuerpo); };
// el archivo de un comprobante que viene de la pantalla o de WhatsApp ({ nombre, mime, bytes }), para el servidor (base64)
const archivoApi = (a) => ({ nombre: String(a.nombre || 'comprobante').slice(0, 200), mime: a.mime || 'application/pdf', base64: Buffer.from(a.bytes).toString('base64') });

/** Marca a mano un paso del negocio (solo con el servidor; en la demo lo hace etapas.marcar). o: { paso, estado: ok | fail | pend | null (vuelve a lo automático), detalle?, quien?, vence? } */
async function paso(id, o) {
  if (!aServidor()) throw err('El paso se marca desde etapas.marcar en la demo.');
  const r = await accion(id, 'paso', { paso: o.paso, estado: o.estado == null ? 'auto' : o.estado, detalle: String(o.detalle || '').slice(0, 240), quien: String(o.quien || '').slice(0, 80), vence: DIA.test(o.vence || '') ? o.vence : null });
  return r;
}
/** Registra un pago con su comprobante. o: { tipo, monto, moneda, fecha, medio, nota?, referencia?, comprobante? | archivo?: { nombre, mime, bytes } } */
async function pago(id, o) {
  const n = neg(id); const arr = n.tipo === 'arriendo'; const monto = Number(o.monto);
  if (n.tipo === 'venta' && o.tipo !== 'otro') throw err('En una venta el comprobante se guarda como «otro»: no hay reserva, garantía ni primer mes.');
  if (!(monto > 0)) throw err('Escribe el monto.');
  if (!DIA.test(String(o.fecha || ''))) throw err('Indica la fecha del pago.');
  const medio = o.medio || 'transferencia';
  if (aServidor()) {
    const cuerpo = { tipo: o.tipo, monto, moneda: o.moneda || 'CLP', fecha: o.fecha, medio, nota: String(o.nota || ''), referencia: String(o.referencia || '') };
    if (o.archivo?.bytes?.length) cuerpo.archivo = archivoApi(o.archivo); else if (o.comprobante) cuerpo.comprobante = o.comprobante;
    return servidor(id, 'pago', cuerpo);
  }
  if (o.archivo) throw err('Los archivos se guardan solo con la cuenta de Asset.');
  const comprobante = o.comprobante || null;
  const nota = [o.referencia ? `Ref. ${o.referencia}` : '', medio === 'deposito' ? 'Depósito' : '', o.nota].filter(Boolean).join(' · ').slice(0, 240);
  const p = { monto, moneda: o.moneda || 'CLP', fecha: o.fecha, medio: medio === 'deposito' ? 'otro' : medio, nota, comprobante };
  const ciclo = cicloDe(n);
  const reemplazo = arr && !!{ reserva: ciclo.pagos?.reserva, garantia: ciclo.pagos?.garantia, primer_mes: ciclo.pagos?.primerMes, comision: ciclo.comision?.pago }[o.tipo];
  if (arr && o.tipo === 'reserva') ciclo.pagos = { ...(ciclo.pagos || {}), reserva: p };
  else if (arr && o.tipo === 'garantia') ciclo.pagos = { ...(ciclo.pagos || {}), garantia: p };
  else if (arr && o.tipo === 'primer_mes') ciclo.pagos = { ...(ciclo.pagos || {}), primerMes: p };
  else if (arr && o.tipo === 'comision') ciclo.comision = { ...(ciclo.comision || {}), pago: p };
  else ciclo.comprobantes = [...(ciclo.comprobantes || []), { tipo: 'otro', ...p, referencia: o.referencia || '' }].slice(-60);
  n.ciclo = ciclo; n.actualizado = now();
  inmo.registrar(n.id, `Pago registrado: ${TIPO_PAGO[o.tipo] || o.tipo} · ${montoTxt(monto, p.moneda)} (${MEDIO_PAGO[medio] || medio}, ${fdmy(o.fecha)})${comprobante ? ' · con comprobante' : ''}`, { ref2: n.propId }); inmo.guardar();
  const mensajes = [];
  if (arr && o.tipo === 'reserva' && n.estado === 'abierto' && etapas(n.tipo).findIndex((e) => e.id === n.etapa) < 2) {
    try { const m = await mover(id, 'reserva', 'Reserva pagada'); mensajes.push(...(m.mensajes || []), 'El negocio pasó a «Reserva».'); } catch { /* ya estaba más adelante */ }
  }
  if (arr && o.tipo === 'comision' && n.estado === 'abierto') {
    try { const c = await cerrar(id, 'ganado'); mensajes.push(...(c.mensajes || []), 'El negocio se cerró como ganado y parte el postarriendo.'); } catch (e) { mensajes.push('No pude cerrar el negocio: ' + e.message); }
  }
  return { negocio: vista(n), mensajes, reemplazo };
}
/** Borra el registro de un pago del arriendo (reserva | garantia | primer_mes | comision); el comprobante queda en los archivos del negocio */
async function quitarPago(id, tipo) {
  if (aServidor()) return accion(id, 'pago/quitar', { tipo });
  const n = neg(id); const ciclo = cicloDe(n); const clave = { reserva: 'reserva', garantia: 'garantia', primer_mes: 'primerMes' }[tipo];
  if (tipo === 'comision') { if (!ciclo.comision?.pago) throw err('No hay un pago de la comisión registrado.'); delete ciclo.comision.pago; }
  else { if (!clave || !ciclo.pagos?.[clave]) throw err('Ese pago no está registrado.'); delete ciclo.pagos[clave]; }
  n.ciclo = ciclo; n.actualizado = now(); inmo.registrar(n.id, `Pago eliminado: ${TIPO_PAGO[tipo]}`, { ref2: n.propId }); inmo.guardar();
  return { negocio: vista(n), mensajes: [] };
}
/** La factura de la comisión del arriendo: { numero?, fecha, monto, moneda } (y, solo en la demo, facturaFecha) */
async function factura(id, o) {
  const monto = Number(o.monto); if (!(monto > 0)) throw err('Escribe el monto de la comisión.');
  if (aServidor()) return accion(id, 'factura', { numero: String(o.numero || '').trim(), fecha: o.fecha, monto, moneda: o.moneda || 'CLP' });
  const n = neg(id); if (n.tipo !== 'arriendo') throw err('La factura de la comisión es de los negocios de arriendo.');
  const ciclo = cicloDe(n); const co = ciclo.comision || {};
  const entrega = String(n.firmas?.entrega_acta?.firmado || '').slice(0, 10) || ciclo.entrega?.fecha || hoyDia();
  ciclo.comision = { ...co, facturaFecha: co.facturaFecha || o.facturaFecha || masDias(entrega, 30), corredor: n.corredor || '', factura: { numero: String(o.numero || '').trim(), fecha: o.fecha, monto, moneda: o.moneda || 'CLP' } };
  n.ciclo = ciclo; n.actualizado = now();
  inmo.registrar(n.id, `Factura de la comisión registrada${o.numero ? ' nº ' + o.numero : ''} · ${montoTxt(monto, o.moneda || 'CLP')}`, { ref2: n.propId }); inmo.guardar();
  return { negocio: vista(n), mensajes: [] };
}
async function quitarFactura(id) {
  if (aServidor()) return accion(id, 'factura/quitar', {});
  const n = neg(id); const ciclo = cicloDe(n); if (!ciclo.comision?.factura) throw err('No hay una factura registrada.');
  delete ciclo.comision.factura; n.ciclo = ciclo; n.actualizado = now(); inmo.registrar(n.id, 'Factura de la comisión eliminada', { ref2: n.propId }); inmo.guardar();
  return { negocio: vista(n), mensajes: [] };
}

/** La negociación con el propietario. o: { accion: acepta | contraoferta | rechaza | oferta, monto?, moneda?, garantia?, plazo?, condiciones?, nota? } */
async function aceptacion(id, o) {
  const txt = (v, m) => String(v || '').trim().slice(0, m);
  if (aServidor()) return accion(id, 'aceptacion', { accion: o.accion, ...(Number(o.monto) > 0 ? { monto: Number(o.monto) } : {}), ...(o.moneda ? { moneda: o.moneda } : {}), garantia: txt(o.garantia, 120), plazo: txt(o.plazo, 80), condiciones: txt(o.condiciones, 800), nota: txt(o.nota, 400) });
  const n = neg(id); const rondas = n.aceptacion?.rondas || []; const ultima = rondas[rondas.length - 1];
  const final = ultima?.tipo === 'aceptada' || ultima?.tipo === 'rechazada'; const esperaInteresado = ultima?.tipo === 'contraoferta';
  const conMonto = [...rondas].reverse().find((r) => r.tipo !== 'rechazada' && r.monto);
  const vig = conMonto ? { monto: conMonto.monto, moneda: conMonto.moneda || 'UF', garantia: conMonto.garantia || '', plazo: conMonto.plazo || '', condiciones: conMonto.condiciones || '' }
    : { monto: n.valor?.valor || null, moneda: n.valor?.moneda || 'UF', garantia: n.oferta?.garantia || '', plazo: n.oferta?.plazo || '', condiciones: n.oferta?.condiciones || '' };
  const nueva = o.accion === 'contraoferta' || o.accion === 'oferta';
  if (final && o.accion !== 'oferta') throw err(`La negociación ya terminó (${ultima.tipo}). Para retomarla registra una nueva oferta del interesado.`);
  if (esperaInteresado && o.accion === 'contraoferta') throw err('Hay una contraoferta del propietario: ahora responde el interesado (acepta, hace otra oferta o desiste).');
  if (nueva && !(Number(o.monto) > 0)) throw err(`Escribe el monto de la ${o.accion === 'oferta' ? 'oferta' : 'contraoferta'}.`);
  if (o.accion === 'rechaza' && !txt(o.nota, 400)) throw err('Escribe el motivo.');
  const por = esperaInteresado ? 'interesado' : 'propietario'; const base = { fecha: now(), nota: txt(o.nota, 400) };
  const cond = { monto: Number(o.monto), moneda: o.moneda || vig.moneda, garantia: txt(o.garantia, 120), plazo: txt(o.plazo, 80), condiciones: txt(o.condiciones, 800) };
  const ronda = o.accion === 'acepta' ? { ...base, tipo: 'aceptada', por, monto: vig.monto, moneda: vig.moneda, garantia: vig.garantia, plazo: vig.plazo, condiciones: vig.condiciones }
    : o.accion === 'rechaza' ? { ...base, tipo: 'rechazada', por } : o.accion === 'contraoferta' ? { ...base, tipo: 'contraoferta', por: 'propietario', ...cond } : { ...base, tipo: 'oferta', por: 'interesado', ...cond };
  const datos = { aceptacion: { rondas: [...rondas, ronda] } };
  if (o.accion === 'acepta') { datos.valor = { valor: vig.monto, moneda: vig.moneda }; datos.oferta = { garantia: vig.garantia, plazo: vig.plazo, vigencia: n.oferta?.vigencia || '', condiciones: vig.condiciones }; }
  const v = guardarLocal({ id, ...datos }, { sinRegistro: true });
  const que = { acepta: 'aceptada', rechaza: 'rechazada', contraoferta: 'contraoferta', oferta: 'oferta del interesado' }[o.accion];
  inmo.registrar(n.id, `Negociación: ${que}${nueva ? ' · ' + montoTxt(o.monto, cond.moneda) : ''}${o.nota ? ' · ' + o.nota : ''}`, { ref2: n.propId }); inmo.guardar();
  return { negocio: v, mensajes: [] };
}

/** Aprobación del texto de la última versión del contrato. o: { personaId? | todos?, aprobado? (por defecto sí) } */
async function contratoAprobar(id, o) {
  const aprobado = o.aprobado !== false;
  if (aServidor()) return accion(id, 'contrato/aprobar', { ...(o.todos ? { todos: true } : { personaId: String(o.personaId || '') }), aprobado });
  const n = neg(id); const ciclo = cicloDe(n); const k = ciclo.contrato; const v = (k?.versiones || []).slice(-1)[0];
  if (!v) throw err('Todavía no hay una versión del contrato para revisar.');
  const fs = v.firmantes || []; if (!fs.length) throw err('La versión del contrato no tiene firmantes registrados.');
  const quienes = o.todos ? fs : fs.filter((q) => q.personaId === o.personaId); if (!quienes.length) throw err('Indica quién aprueba.');
  const a = { ...(k.aprobado || {}) }; for (const q of quienes) { if (aprobado) a[q.personaId] = now(); else delete a[q.personaId]; }
  k.aprobado = a; n.ciclo = ciclo; n.actualizado = now();
  inmo.registrar(n.id, aprobado ? `Contrato V${v.n}: aprobado por ${quienes.map((q) => q.nombre).join(', ')}` : `Contrato V${v.n}: se quitó la aprobación de ${quienes.map((q) => q.nombre).join(', ')}`, { ref2: n.propId }); inmo.guardar();
  return { negocio: vista(n), mensajes: [] };
}

/** El postarriendo. o: { tipo: reajuste | renovacion | devolucion | quitar_renovacion | quitar_devolucion, … } (los campos de cada uno, como en negocio-acciones.ts) */
async function postarriendo(id, o) {
  if (aServidor()) {
    const cuerpo = { ...o }; delete cuerpo.archivo;
    if (o.tipo === 'devolucion' && o.archivo?.bytes?.length) cuerpo.archivo = archivoApi(o.archivo);
    return accion(id, 'postarriendo', cuerpo);
  }
  const n = neg(id); if (n.tipo !== 'arriendo') throw err('El postarriendo es de los negocios de arriendo.');
  if (!n.ciclo?.contrato?.datos?.inicio || !n.ciclo?.contrato?.datos?.plazoMeses) throw err('Faltan las condiciones del contrato (inicio y plazo): se llenan en el paso «Contrato firmado».');
  const ciclo = cicloDe(n); ciclo.postarriendo ||= {}; const post = ciclo.postarriendo; let texto = '';
  if (o.tipo === 'reajuste') {
    const renta = post.rentaActual || n.valor?.valor || 0; const nueva = Number(o.rentaNueva) || Math.round(renta * (1 + Number(o.ipc) / 100));
    post.reajustes = [...(post.reajustes || []), { desde: o.desde, ipc: Number(o.ipc), rentaAntes: renta, rentaNueva: nueva, registrado: now() }]; post.rentaActual = nueva;
    texto = `Reajuste registrado desde el ${fdmy(o.desde)}: IPC ${String(o.ipc).replace('.', ',')}% · renta ${montoTxt(renta, n.valor?.moneda)} → ${montoTxt(nueva, n.valor?.moneda)}`;
  } else if (o.tipo === 'renovacion') {
    if (o.decision === 'renovar' && !(Number(o.meses) >= 1)) throw err('Indica por cuántos meses se renueva.');
    post.renovacion = { decision: o.decision, meses: o.decision === 'renovar' ? Number(o.meses) : 0, nota: String(o.nota || '').trim(), fecha: now() };
    texto = o.decision === 'renovar' ? `Renovación registrada por ${o.meses} meses` : 'Término del contrato registrado: no se renueva';
  } else if (o.tipo === 'devolucion') {
    const garantia = ciclo.pagos?.garantia; if (!garantia) throw err('Primero registra la garantía recibida (paso «Garantía y primer mes recibidos»).');
    const desc = Number(o.descuento) || 0;
    if (desc > garantia.monto) throw err('El descuento no puede ser mayor que la garantía.');
    if (desc > 0 && !String(o.motivo || '').trim()) throw err('Escribe el motivo del descuento.');
    if (o.archivo) throw err('Los archivos se guardan solo con la cuenta de Asset.');
    const devuelto = Math.max(0, garantia.monto - desc);
    post.devolucion = { fechaRecepcion: o.fechaRecepcion, conforme: o.conforme !== false, descuento: desc, motivo: String(o.motivo || '').trim(), devuelto, moneda: garantia.moneda, fechaDevolucion: o.fechaDevolucion, comprobante: o.comprobante || null };
    texto = `Garantía devuelta: ${montoTxt(devuelto, garantia.moneda)} el ${fdmy(o.fechaDevolucion)}${desc ? ` (descuento ${montoTxt(desc, garantia.moneda)}: ${o.motivo})` : ''}`;
  } else if (o.tipo === 'quitar_renovacion') { if (!post.renovacion) throw err('No hay una decisión de renovación registrada.'); delete post.renovacion; texto = 'Decisión de renovación quitada'; }
  else if (o.tipo === 'quitar_devolucion') { if (!post.devolucion) throw err('No hay una devolución registrada.'); delete post.devolucion; texto = 'Registro de la devolución de la garantía eliminado'; }
  else throw err('Acción no válida.');
  n.ciclo = ciclo; n.actualizado = now(); inmo.registrar(n.id, texto, { ref2: n.propId }); inmo.guardar();
  return { negocio: vista(n), mensajes: [] };
}

// guarda solo los datos del ciclo del arriendo (sin dejar «Condiciones actualizadas» en el historial): lo usan los avisos por WhatsApp
function guardarCiclo(id, ciclo) { const n = neg(id); n.ciclo = JSON.parse(JSON.stringify(ciclo || {})); n.actualizado = now(); inmo.guardar(); }
module.exports = { ETAPAS, guardarCiclo, configurar, listar, obtener, ver, guardar, mover, tarea, cerrar, reabrir, nota, borrar, vincularFirma, quitarFirma, firmaFuera, revisarFirmas, avanzarPorFirma, paso, pago, quitarPago, factura, quitarFactura, aceptacion, contratoAprobar, postarriendo };
