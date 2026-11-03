// 0.16.26 · Quién usa este equipo y qué puede ver.
//  · Toda la cartera es visible para todos los corredores (para ofrecerla a sus clientes).
//  · Los datos del PROPIETARIO (nombre, RUT, contacto, notas y los documentos que firma) solo los ve el corredor que
//    captó la propiedad y el administrador. Una propiedad sin captador asignado: solo el administrador.
//  · Mientras no existan cuentas por usuario en Portalfirma, esto se configura por computador («este equipo lo usa…»),
//    con una clave opcional para volver a modo administrador. Oculta los datos en la pantalla y en el Agente; no
//    reemplaza la protección de un servidor con cuentas propias.
'use strict';
const crypto = require('crypto');
const err = (m, code) => Object.assign(new Error(m), code ? { code: code } : {});
const hash = (s) => crypto.createHash('sha256').update('pfasset|' + String(s)).digest('hex');
const OCULTO = 'Reservado al captador';
const CAMPOS_DUENO = /^propietario/;

function crear({ store, inmo, corredores }) {
  const usuario = () => { const u = store.get('equipoUsuario') || { rol: 'admin' }; if (u.rol === 'corredor' && !corredores.lista().some((c) => c.id === u.corredorId)) return { rol: 'admin' }; return u; };
  const esAdmin = () => usuario().rol === 'admin';
  const corredorDe = (id) => corredores.lista().find((c) => c.id === id) || null;
  const puede = (p) => !!p && (esAdmin() || (!!p.captadorId && p.captadorId === usuario().corredorId));
  function estado() {
    const u = usuario(); const c = u.rol === 'corredor' ? corredorDe(u.corredorId) : null;
    return { rol: u.rol, corredorId: c?.id || null, nombre: c ? c.nombre : 'Administrador', esAdmin: u.rol === 'admin', soloAdmin: Object.keys(SOLO), pin: !!store.get('equipoPin'), corredores: corredores.lista().map((x) => ({ id: x.id, nombre: x.nombre })) };
  }
  function usar({ rol, corredorId = null, pin = '' } = {}) {
    if (rol === 'admin') { if (!esAdmin() && store.get('equipoPin') && hash(pin) !== store.get('equipoPin')) throw err('La clave de administrador no es correcta.', 'PIN'); store.set('equipoUsuario', { rol: 'admin' }); }
    else { if (!corredorDe(corredorId)) throw err('Elige un corredor de la lista.'); if (!esAdmin() && usuario().corredorId !== corredorId && store.get('equipoPin') && hash(pin) !== store.get('equipoPin')) throw err('Para cambiar de corredor se necesita la clave de administrador.', 'PIN');
      store.set('equipoUsuario', { rol: 'corredor', corredorId }); }
    return estado();
  }
  function fijarPin({ pin = '', actual = '' } = {}) {
    if (!esAdmin()) throw err('Solo el administrador puede cambiar la clave.');
    if (store.get('equipoPin') && hash(actual) !== store.get('equipoPin')) throw err('La clave actual no es correcta.', 'PIN');
    const p = String(pin || '').trim(); if (p && !/^\d{4,8}$/.test(p)) throw err('La clave debe tener entre 4 y 8 números.');
    store.set('equipoPin', p ? hash(p) : null); return estado();
  }
  // 0.16.27 · perfiles: lo que solo hace el administrador
  const SOLO = { conexiones: 'Conectar o cambiar cuentas y claves', fernanda: 'Configurar a Fernanda (la asistente de clientes)', saldo: 'Cargar saldo de Portalfirma', finanzas: 'Ver las finanzas y comisiones de todos',
    borrar: 'Eliminar o archivar', reasignar: 'Reasignar captaciones o leads entre corredores', importar: 'Importar la cartera o exportar datos', documentos: 'Subir o configurar los formatos de documentos', corredores: 'Agregar o editar corredores' };
  const permiso = (cat) => { if (!esAdmin()) throw err(`${SOLO[cat] || 'Esto'} lo hace el administrador.`, 'PERMISO'); };
  // leads y negocios: el corredor ve los suyos; el administrador, todos
  const mio = (x) => esAdmin() || (!!x?.corredorId && x.corredorId === usuario().corredorId);
  const verLead = mio; const verNegocio = mio;
  const corredorActual = () => (esAdmin() ? null : usuario().corredorId);
  const soloAdmin = (que = 'Esto') => { if (!esAdmin()) throw err(`${que} lo hace el administrador.`, 'PERMISO'); };
  const exigir = (p, que = 'los datos del propietario') => { if (!puede(p)) throw err(`No tienes acceso a ${que} de ${p?.codigo || 'esta propiedad'}: los ve ${p?.captadorId ? (corredorDe(p.captadorId)?.nombre || 'el corredor que la captó') : 'el administrador (la propiedad aún no tiene captador asignado)'}.`, 'PERMISO'); };

  // personas cuyos datos no puede ver este usuario: dueños de propiedades ajenas que no tienen otro vínculo con las suyas
  function reservadas() {
    if (esAdmin()) return new Set();
    const props = inmo.todas(); const visibles = new Set(); const duenos = new Set();
    for (const p of props) for (const v of p.vinculos || []) { if (v.rol === 'propietario' && !puede(p)) duenos.add(v.personaId); else visibles.add(v.personaId); }
    for (const id of visibles) duenos.delete(id);
    return duenos;
  }
  const redactarPersona = (c) => ({ ...c, nombre: 'Propietario (reservado)', rut: '', email: '', telefono: '', direccion: '', estadoCivil: '', profesion: '', notas: '', reservado: true });
  function redactarProp(p) {
    const capt = p.captadorId ? corredorDe(p.captadorId) : null; const base = { ...p, captador: capt ? { id: capt.id, nombre: capt.nombre } : null, duenoVisible: puede(p) };
    if (base.duenoVisible) return base;
    const ficha = Object.fromEntries(Object.entries(p.ficha || {}).filter(([k]) => !CAMPOS_DUENO.test(k)));
    return { ...base, ficha };
  }
  function listar(d) { const r = reservadas(); return { ...d, propiedades: d.propiedades.map(redactarProp), personas: d.personas.map((c) => (r.has(c.id) ? redactarPersona(c) : c)) }; }
  const personaVisible = (id) => !reservadas().has(id);
  // lo que el corredor guarda en una propiedad ajena no toca los datos del dueño
  function filtrarGuardado(o) {
    if (!o?.id) return o; const p = inmo.obtener(o.id); if (puede(p)) return o;
    const out = { ...o }; delete out.captadorId; if (out.ficha) out.ficha = Object.fromEntries(Object.entries(out.ficha).filter(([k]) => !CAMPOS_DUENO.test(k))); return out;
  }
  // resultados del Agente: los datos de dueños reservados se reemplazan
  function limpiar(x) {
    if (esAdmin()) return x; const r = reservadas(); if (!r.size) return x;
    const per = inmo.listar().personas.filter((c) => r.has(c.id)); const textos = new Set(per.flatMap((c) => [c.nombre, c.rut, c.email, c.telefono]).filter((s) => s && String(s).length > 3));
    const walk = (v) => {
      if (Array.isArray(v)) return v.map((y) => walk(y));
      if (v && typeof v === 'object') { if (v.id && r.has(v.id)) return redactarPersona(v); const o = {}; for (const [kk, vv] of Object.entries(v)) o[kk] = CAMPOS_DUENO.test(kk) && typeof vv !== 'object' ? OCULTO : walk(vv); return o; }
      if (typeof v === 'string') { let s = v; for (const t of textos) if (s.includes(t)) s = s.split(t).join(OCULTO); return s; }
      return v;
    };
    return walk(x);
  }
  function asignarCaptador(propId, corredorId) {
    soloAdmin('Asignar quién captó una propiedad'); const p = inmo.obtener(propId); const c = corredorId ? corredorDe(corredorId) : null;
    if (corredorId && !c) throw err('Ese corredor no existe.');
    if ((p.captadorId || null) === (c?.id || null)) return redactarProp(p);
    const antes = p.captadorId ? corredorDe(p.captadorId)?.nombre || 'otro corredor' : null;
    inmo.parchear(propId, (pp) => { pp.captadorId = c ? c.id : null; }, c ? (antes ? `Captador: pasó de ${antes} a ${c.nombre}` : `Captada por ${c.nombre}`) : `Quedó sin captador${antes ? ` (era ${antes})` : ''}`);
    return redactarProp(inmo.obtener(propId));
  }
  // 0.16.27 · asignar el captador a varias propiedades de una vez (la cartera importada llega sin captador)
  function asignarVarios(ids = [], corredorId) {
    soloAdmin('Asignar quién captó las propiedades'); if (!Array.isArray(ids) || !ids.length) throw err('Elige al menos una propiedad.');
    if (corredorId && !corredorDe(corredorId)) throw err('Ese corredor no existe.');
    let n = 0; for (const id of ids) { const p = inmo.obtener(id); if ((p.captadorId || null) !== (corredorId || null)) { asignarCaptador(id, corredorId); n++; } }
    return { cambiadas: n, total: ids.length };
  }
  // una propiedad nueva creada por un corredor queda como captación suya
  function alCrear(p) { const u = usuario(); if (u.rol === 'corredor' && p && !p.captadorId) { inmo.parchear(p.id, (pp) => { pp.captadorId = u.corredorId; }, `Captada por ${corredorDe(u.corredorId)?.nombre || 'el corredor'}`); return inmo.obtener(p.id); } return p; }
  return { SOLO, permiso, verLead, verNegocio, corredorActual, usuario, esAdmin, estado, usar, fijarPin, puede, exigir, soloAdmin, reservadas, personaVisible, redactarProp, redactarPersona, listar, filtrarGuardado, limpiar, asignarCaptador, asignarVarios, alCrear, OCULTO };
}
module.exports = { crear };
