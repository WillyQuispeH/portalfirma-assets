// Agenda de PortalFirma Asset: visitas, reuniones, firmas, llamadas y tareas con fecha y hora,
// ligadas a una propiedad, a personas y a un negocio. Se guardan en la base local (inmo).
const inmo = require('./inmo');

const TIPOS = { visita: 'Visita', reunion: 'Reunión', firma: 'Firma', llamada: 'Llamada', tarea: 'Tarea', otro: 'Evento' };
const ESTADOS = ['programado', 'hecho', 'cancelado'];
const now = () => new Date().toISOString();
const uid = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const err = (m) => new Error(m);
const lista = () => inmo.eventos();
const ev = (id) => { const e = lista().find((x) => x.id === id); if (!e) throw err('El evento ya no existe.'); return e; };
const fechaOk = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || '')) && !isNaN(Date.parse(f));
const porExt = (fuente, id) => lista().find((e) => e.ext?.fuente === fuente && e.ext?.id === id) || null;
const horaOk = (h) => !h || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h));

function vista(e) {
  const p = e.propId ? inmo.todas().find((x) => x.id === e.propId) : null;
  return { ...e, tipoTxt: TIPOS[e.tipo] || 'Evento', prop: p ? { id: p.id, codigo: p.codigo, titulo: p.titulo, direccion: p.direccion, comuna: p.comuna } : null,
    personas: (e.personaIds || []).map((id) => inmo.personaPorId(id)).filter(Boolean).map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut, telefono: c.telefono, email: c.email })) };
}
function listar({ desde, hasta, tipo, estado, propId, personaId, negocioId } = {}) {
  return lista().filter((e) => (!desde || e.fecha >= desde) && (!hasta || e.fecha <= hasta) && (!tipo || e.tipo === tipo) && (!estado || e.estado === estado)
    && (!propId || e.propId === propId) && (!personaId || (e.personaIds || []).includes(personaId)) && (!negocioId || e.negocioId === negocioId))
    .sort((a, b) => (a.fecha + (a.hora || '99')).localeCompare(b.fecha + (b.hora || '99'))).map(vista);
}
function titulo(o, p, personas) {
  const t = TIPOS[o.tipo] || 'Evento';
  return [t, p ? p.codigo + ' ' + (p.titulo || '') : null, personas[0]?.nombre || null].filter(Boolean).join(' · ').slice(0, 120);
}
function crear(o) {
  const tipo = TIPOS[o.tipo] ? o.tipo : 'otro';
  if (!fechaOk(o.fecha)) throw err('Indica la fecha del evento (AAAA-MM-DD).');
  if (!horaOk(o.hora)) throw err('La hora debe ser HH:MM, por ejemplo 15:30.');
  const p = o.propId ? inmo.obtener(o.propId) : null;
  const personas = [...new Set(o.personaIds || [])].map((id) => inmo.personaPorId(id)).filter(Boolean);
  if (tipo === 'visita' && !p) throw err('Una visita necesita la propiedad.');
  const e = { id: uid(), tipo, titulo: String(o.titulo || '').trim().slice(0, 120) || titulo({ tipo }, p, personas), fecha: o.fecha, hora: o.hora || null, duracion: Number(o.duracion) || (tipo === 'visita' ? 45 : 30),
    propId: p?.id || null, personaIds: personas.map((c) => c.id), negocioId: o.negocioId || null, lugar: String(o.lugar || (p ? [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ') : '')).slice(0, 200),
    notas: String(o.notas || '').slice(0, 1000), estado: 'programado', orden: null, ext: o.ext || null, creado: now(), actualizado: now() };
  lista().push(e);
  const cuando = `${e.fecha}${e.hora ? ' ' + e.hora : ''}`;
  inmo.registrar(e.id, `${TIPOS[tipo]} agendada para ${cuando}`, { ref2: e.propId });
  if (e.propId) inmo.registrar(e.propId, `${TIPOS[tipo]} agendada para ${cuando}${personas.length ? ' con ' + personas.map((c) => c.nombre).join(', ') : ''}`, { ref2: e.id });
  for (const c of personas) inmo.registrar(c.id, `${TIPOS[tipo]} agendada para ${cuando}${p ? ' en ' + p.codigo : ''}`, { ref2: e.id });
  inmo.guardar(); return vista(e);
}
function actualizar(id, o) {
  const e = ev(id);
  if ('fecha' in o) { if (!fechaOk(o.fecha)) throw err('Fecha no válida (AAAA-MM-DD).'); e.fecha = o.fecha; }
  if ('hora' in o) { if (!horaOk(o.hora)) throw err('Hora no válida (HH:MM).'); e.hora = o.hora || null; }
  for (const k of ['titulo', 'notas', 'lugar']) if (k in o) e[k] = String(o[k] || '').slice(0, k === 'notas' ? 1000 : 200);
  if ('duracion' in o) e.duracion = Number(o.duracion) || e.duracion;
  if ('estado' in o) { if (!ESTADOS.includes(o.estado)) throw err('Estado no válido.'); e.estado = o.estado; }
  if ('orden' in o) e.orden = o.orden;
  e.actualizado = now();
  const txt = 'estado' in o && o.estado !== 'programado' ? `${TIPOS[e.tipo]} ${o.estado === 'hecho' ? 'realizada' : 'cancelada'}` : `${TIPOS[e.tipo]} reprogramada para ${e.fecha}${e.hora ? ' ' + e.hora : ''}`;
  inmo.registrar(e.id, txt, { ref2: e.propId }); if (e.propId) inmo.registrar(e.propId, txt, { ref2: e.id });
  inmo.guardar(); return vista(e);
}
function marcarConfirmacion(id, o) { const e = ev(id); e.confirmacion = { via: o.via || 'whatsapp', a: o.a || null, fecha: now() }; e.actualizado = now(); inmo.registrar(e.id, o.texto, { ref2: e.propId }); if (e.propId) inmo.registrar(e.propId, o.texto, { ref2: e.id }); inmo.guardar(); return vista(e); }
function ligarNegocio(id, negocioId) { const e = ev(id); e.negocioId = negocioId || null; e.actualizado = now(); inmo.guardar(); return vista(e); }
function borrar(id) { const l = lista(); const e = ev(id); l.splice(l.indexOf(e), 1); if (e.propId) inmo.registrar(e.propId, `${TIPOS[e.tipo]} del ${e.fecha} eliminada`); inmo.guardar(); return true; }
function obtener(id) { return { ...vista(ev(id)), actividad: inmo.actividadDe(id) }; }

module.exports = { TIPOS, listar, crear, actualizar, borrar, obtener, ligarNegocio, marcarConfirmacion, porExt: (f, id) => { const e = porExt(f, id); return e ? vista(e) : null; } };
