// Qué puede ver y hacer quien usa la app: el usuario de la sesión de Asset (ADMIN o CORREDOR de su corredora).
// Reemplaza a los perfiles por equipo de 0.16.26 («este equipo lo usa…», con clave de administrador local).
//  · Toda la cartera es visible para todos los usuarios de la corredora (para ofrecerla a sus clientes).
//  · Los datos del PROPIETARIO (ficha propietario*, la persona dueña, sus documentos) solo los ve quien captó la
//    propiedad y el administrador. Con la API, eso ya lo aplica el servidor; aquí se aplica igual sobre la copia local
//    (así vale también en modo de prueba y en lo que arma el Agente).
//  · Leads y negocios: el corredor ve los suyos (corredorId = id de su usuario); el administrador, todos.
//  · Lo que solo hace el administrador (SOLO) se revisa por canal IPC en main.js y en las herramientas del Agente.
'use strict';
const err = (m, code) => Object.assign(new Error(m), code ? { code } : {});
const OCULTO = 'Reservado al captador';
const CAMPOS_DUENO = /^propietario/;

const SOLO = { conexiones: 'Conectar o cambiar cuentas y claves', fernanda: 'Configurar a Fernanda (la asistente de clientes)', saldo: 'Cargar saldo de Portalfirma', finanzas: 'Ver las finanzas y comisiones de todos',
  borrar: 'Eliminar o archivar', reasignar: 'Reasignar captaciones o leads entre corredores', importar: 'Importar la cartera o exportar datos', documentos: 'Subir o configurar los formatos de documentos', usuarios: 'Agregar o editar usuarios' };

function crear({ inmo, equipo, usuario }) {
  // usuario(): { id, nombre, rol: 'ADMIN' | 'CORREDOR' } de la sesión, o null sin sesión
  const esAdmin = () => usuario()?.rol === 'ADMIN';
  const yoId = () => usuario()?.id || null;
  const puede = (p) => !!p && (esAdmin() || (!!p.captadorId && p.captadorId === yoId()));
  function estado() {
    const u = usuario();
    return { rol: esAdmin() ? 'admin' : 'corredor', usuarioId: u?.id || null, corredorId: esAdmin() ? null : u?.id || null, nombre: u?.nombre || '', esAdmin: esAdmin(), soloAdmin: Object.keys(SOLO),
      corredores: equipo.activos().map((x) => ({ id: x.id, nombre: x.nombre })) };
  }
  const permiso = (cat) => { if (!esAdmin()) throw err(`${SOLO[cat] || 'Esto'} lo hace el administrador.`, 'PERMISO'); };
  const soloAdmin = (que = 'Esto') => { if (!esAdmin()) throw err(`${que} lo hace el administrador.`, 'PERMISO'); };
  // leads y negocios: el corredor ve los suyos; el administrador, todos
  const mio = (x) => esAdmin() || (!!x?.corredorId && x.corredorId === yoId());
  const corredorActual = () => (esAdmin() ? null : yoId());
  const exigir = (p, que = 'los datos del propietario') => { if (!puede(p)) throw err(`No tienes acceso a ${que} de ${p?.codigo || 'esta propiedad'}: los ve ${p?.captadorId ? (equipo.nombre(p.captadorId) || 'el corredor que la captó') : 'el administrador (la propiedad aún no tiene captador asignado)'}.`, 'PERMISO'); };

  // personas cuyos datos no puede ver este usuario: dueños de propiedades ajenas que no tienen otro vínculo con las suyas
  function reservadas() {
    if (esAdmin()) return new Set();
    const visibles = new Set(); const duenos = new Set();
    for (const p of inmo.todas()) for (const v of p.vinculos || []) { if (v.rol === 'propietario' && !puede(p)) duenos.add(v.personaId); else visibles.add(v.personaId); }
    for (const id of visibles) duenos.delete(id);
    for (const c of inmo.listar().personas) if (c.reservado) duenos.add(c.id); // la API ya las manda reservadas
    return duenos;
  }
  const redactarPersona = (c) => ({ ...c, nombre: 'Propietario (reservado)', rut: '', email: '', telefono: '', direccion: '', estadoCivil: '', profesion: '', notas: '', reservado: true });
  function redactarProp(p) {
    const capt = p.captadorId ? equipo.porId(p.captadorId) : null;
    const base = { ...p, captador: p.captadorId ? { id: p.captadorId, nombre: capt?.nombre || 'Otro usuario' } : null, duenoVisible: puede(p) };
    if (base.duenoVisible) return base;
    return { ...base, ficha: Object.fromEntries(Object.entries(p.ficha || {}).filter(([k]) => !CAMPOS_DUENO.test(k))) };
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
    const per = inmo.listar().personas.filter((c) => r.has(c.id) && !c.reservado); const textos = new Set(per.flatMap((c) => [c.nombre, c.rut, c.email, c.telefono]).filter((s) => s && String(s).length > 3));
    const walk = (v) => {
      if (Array.isArray(v)) return v.map((y) => walk(y));
      if (v && typeof v === 'object') { if (v.id && r.has(v.id)) return redactarPersona(v); const o = {}; for (const [kk, vv] of Object.entries(v)) o[kk] = CAMPOS_DUENO.test(kk) && typeof vv !== 'object' ? OCULTO : walk(vv); return o; }
      if (typeof v === 'string') { let s = v; for (const t of textos) if (s.includes(t)) s = s.split(t).join(OCULTO); return s; }
      return v;
    };
    return walk(x);
  }
  // el captador es un usuario de la corredora; asignarlo lo hace el administrador
  async function asignarCaptador(propId, usuarioId) {
    soloAdmin('Asignar quién captó una propiedad');
    if (usuarioId && !equipo.porId(usuarioId)) throw err('Ese usuario no es de tu corredora.');
    return redactarProp(await inmo.asignarCaptador(propId, usuarioId || null));
  }
  async function asignarVarios(ids = [], usuarioId) {
    soloAdmin('Asignar quién captó las propiedades');
    if (usuarioId && !equipo.porId(usuarioId)) throw err('Ese usuario no es de tu corredora.');
    return inmo.asignarVarios(ids, usuarioId || null);
  }
  return { SOLO, permiso, verLead: mio, verNegocio: mio, corredorActual, esAdmin, estado, puede, exigir, soloAdmin, reservadas, personaVisible, redactarProp, redactarPersona, listar, filtrarGuardado, limpiar, asignarCaptador, asignarVarios, OCULTO };
}
module.exports = { crear, SOLO };
