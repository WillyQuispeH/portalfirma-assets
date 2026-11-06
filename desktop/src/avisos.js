// Avisos del servidor (/v1/avisos): lo que los procesos de la API le quieren decir a este usuario, p. ej. la revisión
// de firmas («X firmó la promesa»). Cada 30 s (y al iniciar sesión) se traen los pendientes y se toman en el servidor:
// un aviso se toma una sola vez, aunque el usuario tenga dos equipos abiertos; si la app estaba cerrada, llegan al
// abrirla. Cada tipo tiene su manejador (main.js); los de un tipo sin manejador se muestran tal cual.
// En modo de prueba (PF_MOCK) o sin sesión no hace nada.
let inmoMod = null; const inmo = () => (inmoMod ||= require('./inmo'));
const asset = () => require('./asset');

function crear({ manejadores = {}, mostrar = () => {} }) {
  const enApi = () => { try { return !!(inmo().API && inmo().usuario()?.id); } catch { return false; } };
  let trayendo = false;
  async function traer() {
    if (!enApi() || trayendo) return 0;
    trayendo = true;
    try {
      const { items } = await asset().llamar('GET', '/avisos');
      if (!items.length) return 0;
      const { tomados } = await asset().llamar('POST', '/avisos/tomar', { ids: items.map((a) => a.id) });
      const mios = items.filter((a) => tomados.includes(a.id));
      for (const a of mios) {
        try { const h = manejadores[a.tipo]; if (h) await h(a); else mostrar(a.texto); }
        catch (e) { console.warn(`[avisos] ${a.tipo}:`, e.message); mostrar(a.texto); }
      }
      return mios.length;
    } finally { trayendo = false; }
  }
  return { traer };
}

module.exports = { crear };
