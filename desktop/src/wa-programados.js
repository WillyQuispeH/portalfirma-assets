// WhatsApp programados con la cuenta de Asset: los envía el servidor a su hora (/v1/whatsapp/programados), aunque la
// app esté cerrada, con la clave de wechatia de la corredora guardada en el servidor (/v1/whatsapp/conexion).
// Este módulo:
//  · programa (POST) y, antes, se asegura de que la corredora tenga la clave en el servidor: si no la tiene y este
//    equipo sí, la sube (también cuando se cambia la clave en el equipo y al iniciar sesión);
//  · sube una vez los que estaban programados solo en este equipo (store › waProgramados);
//  · cada 30 s trae los que cambiaron y, por cada resultado, hace lo que solo la app sabe (anotarlo en el lead,
//    marcar el mensaje como propio para que el asistente no lo confunda con uno escrito a mano, avisar al ejecutivo):
//    eso lo hace `alResultado` (main.js). El aviso se toma en el servidor (POST …/avisado): una sola vez aunque haya
//    dos equipos abiertos; si la app estaba cerrada, se avisa al abrirla.
// En modo de prueba (PF_MOCK) o sin sesión, main.js sigue con la lista local de antes.
const store = require('./store');
let inmoMod = null; const inmo = () => (inmoMod ||= require('./inmo'));
const asset = () => require('./asset');
const FINALES = ['enviado', 'no_entregado', 'fallido'];

function crear({ credenciales, alResultado, plantillaDe = () => null }) {
  /** id del usuario de Asset con sesión (null en modo de prueba o sin sesión) */
  const usuarioId = () => { try { return inmo().API ? inmo().usuario()?.id || null : null; } catch { return null; } };
  const enApi = () => !!usuarioId();
  /** «AAAA-MM-DD HH:MM» (hora de este equipo) → instante ISO */
  const iso = (c) => new Date(String(c).replace(' ', 'T') + ':00').toISOString();

  // ---------------------------------------------------------------- la clave de wechatia en el servidor
  let estadoClave = null; let estadoEn = 0;
  /** sube la clave de este equipo (si la hay). forzar: aunque el servidor ya tenga una (solo la acepta del administrador) */
  async function subirClave({ forzar = false } = {}) {
    if (!enApi()) return null;
    const c = credenciales(); if (!c?.token || !c?.locationId) return estado(true);
    const e = await estado(true);
    if (e.conectado && !forzar) return e;
    if (!e.puedeConectar) return e;
    try { estadoClave = await asset().llamar('PUT', '/whatsapp/conexion', { token: c.token, locationId: c.locationId }); estadoEn = Date.now(); }
    catch (err) { console.warn('[programados] la clave de wechatia no se subió:', err.message); }
    return estadoClave;
  }
  async function estado(fresco = false) {
    if (!fresco && estadoClave && Date.now() - estadoEn < 5 * 60_000) return estadoClave;
    estadoClave = await asset().llamar('GET', '/whatsapp/conexion'); estadoEn = Date.now(); return estadoClave;
  }
  /** ¿puede el servidor enviar? (si falta y este equipo tiene la clave, la sube) */
  async function listo() {
    let e = await estado().catch(() => null);
    if (!e?.conectado) e = await subirClave().catch(() => null);
    return !!e?.conectado;
  }

  // ---------------------------------------------------------------- programar
  async function programar(it) {
    if (!(await listo())) throw new Error('El WhatsApp de la empresa no está conectado en el servidor de Asset: conéctalo en Agente › WhatsApp (clave de wechatia) para poder programar mensajes.');
    return asset().llamar('POST', '/whatsapp/programados', {
      id: it.id, telefono: it.telefono, nombre: it.nombre || '', personaId: it.personaId || null, texto: it.texto, cuando: iso(it.cuando), plantilla: it.plantilla || null,
    });
  }

  /** los que estaban programados solo en este equipo se suben una vez (y salen del equipo) */
  async function subirLocales() {
    const l = store.get('waProgramados') || []; const pend = l.filter((x) => x.estado === 'programado');
    if (!pend.length) return null;
    const items = pend.map((x) => ({ id: /^[\w-]{6,64}$/.test(x.id) ? x.id : 'wp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), telefono: x.telefono, nombre: x.nombre || '', personaId: x.personaId || null, texto: x.texto, cuando: iso(x.cuando), plantilla: plantillaDe(x) }));
    for (let i = 0; i < items.length; i += 200) await asset().llamar('POST', '/whatsapp/programados/importar', { items: items.slice(i, i + 200) });
    store.set('waProgramados', l.filter((x) => x.estado !== 'programado'));
    return null;
  }

  // ---------------------------------------------------------------- resultados
  let marca = null; let deUsuario = null; let trayendo = false;
  async function traer() {
    const u = usuarioId(); if (!u || trayendo) return;
    trayendo = true;
    try {
      if (u !== deUsuario) { marca = null; deUsuario = u; }
      let cursor = null; let nueva = null;
      do {
        const q = new URLSearchParams(); if (marca) q.set('desde', marca); if (cursor) q.set('cursor', cursor);
        const r = await asset().llamar('GET', '/whatsapp/programados' + (q.size ? '?' + q : ''));
        nueva ||= r.servidorEn;
        for (const x of r.items) await resultado(x); // si falla, la marca no avanza y se reintenta en la próxima vuelta
        cursor = r.siguiente;
      } while (cursor);
      marca = nueva;
    } finally { trayendo = false; }
  }
  async function resultado(x) {
    if (x.avisado || !FINALES.includes(x.estado)) return;
    const { tomado } = await asset().llamar('POST', `/whatsapp/programados/${encodeURIComponent(x.id)}/avisado`);
    if (tomado) { try { alResultado(x); } catch (e) { console.warn('[programados] aviso:', e.message); } }
  }

  return { enApi, programar, subirLocales, subirClave, listo, traer };
}

module.exports = { crear };
