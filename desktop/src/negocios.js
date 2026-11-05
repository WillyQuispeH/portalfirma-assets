// Negocios: el embudo de cada venta y arriendo, de punta a punta.
// Cada etapa tiene sus tareas y, cuando corresponde, el documento que debe quedar firmado con Portalfirma.
// Al firmarse ese documento la etapa se completa sola y el negocio avanza; la ficha de la propiedad
// cambia de estado (reservada, vendida, arrendada) y, si está publicada, el aviso del portal se ajusta.
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
    { id: 'contrato', t: 'Contrato', d: 'Firma del contrato de arriendo.', tareas: ['Recibir garantía y primer mes'], firma: 'Contrato de arriendo', estado: 'arrendada' },
    { id: 'entrega', t: 'Entrega', d: 'Entrega con inventario y cobro de la comisión.', tareas: ['Entregar llaves', 'Cobrar la comisión'], firma: 'Acta de entrega e inventario', final: true },
  ],
};
const now = () => new Date().toISOString();
const uid = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const err = (m) => new Error(m);
const etapas = (tipo) => ETAPAS[tipo] || ETAPAS.venta;
const etapa = (tipo, id) => etapas(tipo).find((e) => e.id === id);
const lista = () => inmo.negocios();
const neg = (id) => { const n = lista().find((x) => x.id === id); if (!n) throw err('El negocio ya no existe.'); return n; };
let alCambiarPropiedad = async () => [];
const configurar = (o) => { if (o.alCambiarPropiedad) alCambiarPropiedad = o.alCambiarPropiedad; };

function titulo(n) {
  const p = n.propId ? inmo.todas().find((x) => x.id === n.propId) : null; const c = n.clienteId ? inmo.personaPorId(n.clienteId) : null;
  return [p ? p.titulo : 'Sin propiedad', c ? c.nombre : null].filter(Boolean).join(' · ');
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
  return { ...n, titulo: titulo(n), prop: p ? { id: p.id, codigo: p.codigo, titulo: p.titulo, comuna: p.comuna, foto: (p.fotos || [])[0] || null, propietarios: (p.vinculos || []).filter((v) => v.rol === 'propietario').map((v) => inmo.personaPorId(v.personaId)).filter(Boolean).map((x) => ({ id: x.id, nombre: x.nombre, rut: x.rut })) } : null,
    cliente: c ? { id: c.id, nombre: c.nombre, rut: c.rut, telefono: c.telefono, email: c.email } : null, etapaInfo: et, orden: ord, total: etapas(n.tipo).length, siguiente, pendientes: pend.length,
    diasEnEtapa: Math.floor((Date.now() - new Date(n.etapaDesde || n.creado).getTime()) / 864e5), comisionMonto,
    vencida: !!(n.estado === 'abierto' && n.proximaAccion?.fecha && n.proximaAccion.fecha < now().slice(0, 10)) };
}
function listar() { return { negocios: lista().map(vista), etapas: ETAPAS }; }
// con su historial (en la base, por eso async); ver(id) es la misma vista sin historial, sincrónica
async function obtener(id) { const v = vista(neg(id)); return { ...v, actividad: await inmo.actividadDe(id) }; }
const ver = (id) => vista(neg(id));

function guardar(o) {
  const tipo = o.tipo === 'arriendo' ? 'arriendo' : 'venta';
  const datos = {};
  if ('propId' in o) { if (o.propId) { const p = inmo.obtener(o.propId); if (!(tipo === 'venta' ? p.venta : p.arriendo)) throw err(`La propiedad no está en ${tipo}. Márcala en su ficha primero.`); } datos.propId = o.propId || null; }
  if ('clienteId' in o) datos.clienteId = o.clienteId || null;
  if ('valor' in o) datos.valor = o.valor && o.valor.valor !== '' && o.valor.valor != null ? { valor: Number(o.valor.valor), moneda: ['UF', 'CLP', 'USD'].includes(o.valor.moneda) ? o.valor.moneda : 'UF' } : null;
  if ('comision' in o) datos.comision = o.comision && o.comision.valor !== '' && o.comision.valor != null ? { tipo: o.comision.tipo === 'monto' ? 'monto' : '%', valor: Number(o.comision.valor) } : null;
  if ('proximaAccion' in o) datos.proximaAccion = o.proximaAccion?.texto ? { texto: String(o.proximaAccion.texto).trim().slice(0, 160), fecha: o.proximaAccion.fecha || null } : null;
  if ('corredor' in o) datos.corredor = String(o.corredor || '').trim();
  if ('corredorId' in o) datos.corredorId = o.corredorId || null;
  if (o.id) {
    const n = neg(o.id); const antes = n.proximaAccion?.texto; Object.assign(n, datos, { actualizado: now() });
    if ('proximaAccion' in o && datos.proximaAccion?.texto && datos.proximaAccion.texto !== antes) inmo.registrar(n.id, `Próxima acción: ${datos.proximaAccion.texto}${datos.proximaAccion.fecha ? ' (' + datos.proximaAccion.fecha + ')' : ''}`, { ref2: n.propId });
    else if (!('proximaAccion' in o)) inmo.registrar(n.id, 'Condiciones actualizadas', { ref2: n.propId });
    inmo.guardar(); return vista(n);
  }
  if (!datos.propId) throw err('Elige la propiedad del negocio.');
  if (!datos.clienteId) throw err(`Elige al ${tipo === 'venta' ? 'comprador' : 'arrendatario'}.`);
  const ini = etapas(tipo).some((e) => e.id === o.etapa) ? o.etapa : 'interes';
  const n = { id: uid(), tipo, estado: 'abierto', etapa: ini, etapaDesde: now(), tareas: { interes: [true] }, firmas: {}, creado: now(), actualizado: now(), ...datos }; // el cliente ya quedó registrado con su RUT
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
    if (x.estado === 'ganado' && x.tipo === 'arriendo') marcas.push('arrendada');
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
  const n = neg(id); if (n.estado !== 'abierto') throw err('El negocio está cerrado. Reábrelo para moverlo.');
  const e = etapa(n.tipo, etapaId); if (!e) throw err('Etapa no válida.');
  if (n.etapa === etapaId) return { negocio: vista(n), mensajes: [] };
  const desde = etapa(n.tipo, n.etapa); n.etapa = etapaId; n.etapaDesde = now(); n.actualizado = now();
  inmo.registrar(n.id, `${motivo || 'Movido'}: de «${desde.t}» a «${e.t}»`, { ref2: n.propId });
  inmo.guardar();
  const mensajes = await aplicarEstado(n);
  return { negocio: vista(n), mensajes };
}
function tarea(id, etapaId, i, val) {
  const n = neg(id); n.tareas ||= {}; n.tareas[etapaId] ||= [];
  n.tareas[etapaId][i] = !!val; n.actualizado = now();
  const t = etapa(n.tipo, etapaId)?.tareas?.[i]; if (val && t) inmo.registrar(n.id, `Hecho: ${t}`, { ref2: n.propId });
  inmo.guardar(); return vista(n);
}
async function cerrar(id, resultado, motivo) {
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
async function reabrir(id) { const n = neg(id); n.estado = 'abierto'; n.cierre = null; n.motivoPerdida = null; n.etapaDesde = now(); inmo.registrar(n.id, 'Negocio reabierto', { ref2: n.propId }); inmo.guardar(); return { negocio: vista(n), mensajes: await aplicarEstado(n) }; }
function nota(id, texto) { const n = neg(id); if (!String(texto || '').trim()) throw err('Escribe la nota.'); inmo.registrar(n.id, String(texto).trim(), { tipo: 'nota', ref2: n.propId }); inmo.guardar(); return inmo.actividadDe(n.id); }
function borrar(id) { const n = neg(id); const l = lista(); l.splice(l.indexOf(n), 1); inmo.registrar(n.propId, `Negocio de ${n.tipo} eliminado`); inmo.guardar(); return true; }

// ---------- firmas: cada etapa con documento queda ligada a su operación de Portalfirma ----------
function vincularFirma(id, etapaId, operacion) {
  const n = neg(id); const e = etapa(n.tipo, etapaId); if (!e?.firma) throw err('Esta etapa no requiere firma.');
  const op = Number(String(operacion).replace(/\D/g, '')); if (!op) throw err('Indica un número de operación válido.');
  n.firmas ||= {}; n.firmas[etapaId] = { operacion: op, estado: 'en_firma', firmados: 0, total: 0, revisado: null };
  inmo.registrar(n.id, `${e.firma}: operación ${op} vinculada`, { ref2: n.propId }); inmo.guardar();
  return vista(n);
}
// Firmado fuera de Asset (en papel o en otra plataforma): la etapa queda cumplida igual
function firmaFuera(id, etapaId) {
  const n = neg(id); const e = etapa(n.tipo, etapaId); if (!e?.firma) throw err('Esta etapa no requiere firma.');
  n.firmas ||= {}; n.firmas[etapaId] = { operacion: null, estado: 'firmado', fuera: true, firmado: now() }; n.actualizado = now();
  inmo.registrar(n.id, `${e.firma}: firmado fuera de Asset`, { ref2: n.propId }); inmo.guardar();
  return vista(n);
}
function quitarFirma(id, etapaId) { const n = neg(id); if (n.firmas) delete n.firmas[etapaId]; inmo.guardar(); return vista(n); }
// Consulta Portalfirma por las operaciones en firma; si quedó firmada completa la etapa y avanza.
async function revisarFirmas(pf, id) {
  const ns = id ? [neg(id)] : lista().filter((n) => n.estado === 'abierto');
  const mensajes = [];
  for (const n of ns) for (const [etId, f] of Object.entries(n.firmas || {})) {
    if (!f?.operacion || f.estado === 'firmado') continue;
    let d; try { d = await pf.processDetail(f.operacion); } catch (e) { if (e.code === 'NEEDS_LOGIN' || /NEEDS_LOGIN/.test(e.message)) throw e; f.error = e.message; continue; }
    const sig = d.signatories || []; f.firmados = sig.filter((s) => s.signed).length; f.total = sig.length; f.revisado = now(); f.error = null;
    if (d.status === 'finalized') {
      f.estado = 'firmado'; f.firmado = now(); const e = etapa(n.tipo, etId);
      inmo.registrar(n.id, `${e.firma} firmado (operación ${f.operacion})`, { ref2: n.propId });
      mensajes.push(`${titulo(n)}: ${e.firma.toLowerCase()} firmado.`);
      const lst = etapas(n.tipo); const idx = lst.findIndex((x) => x.id === etId);
      if (n.estado === 'abierto' && n.etapa === etId) { // la firma completa la etapa: el negocio avanza solo
        if (e.final) { const r = await cerrar(n.id, 'ganado'); mensajes.push(...r.mensajes); }
        else { const r = await mover(n.id, lst[idx + 1].id, 'Avanzó solo al firmarse el documento'); mensajes.push(...r.mensajes); }
      }
    }
  }
  inmo.guardar();
  return { mensajes, negocios: lista().map(vista) };
}

module.exports = { ETAPAS, configurar, listar, obtener, ver, guardar, mover, tarea, cerrar, reabrir, nota, borrar, vincularFirma, quitarFirma, firmaFuera, revisarFirmas };
