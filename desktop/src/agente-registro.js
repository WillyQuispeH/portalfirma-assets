// Registro de lo que hizo el Agente (cada herramienta que cambió algo, o que el usuario canceló).
// En el equipo queda una copia de las últimas 300 (store › agentLog) para mostrarlas al instante. Con la cuenta de
// Asset, además, cada acción se manda a la base (/v1/agente/registro) en lotes cada 5 s: así queda qué hizo el Agente
// y por orden de quién, y el administrador lo puede revisar. Lo que no se pudo mandar espera en store › agentLogPend.
// Lo que el equipo tenía de antes se sube una vez al iniciar sesión.
const store = require('./store');
let inmoMod = null; const inmo = () => (inmoMod ||= require('./inmo'));
const enApi = () => { try { return !!(inmo().API && inmo().usuario()); } catch { return false; } };
const PEND_MAX = 2000;
let reloj = null; let enviando = null;

function registrar(e, canal = 'app') {
  const x = { t: new Date().toISOString(), ...e };
  const l = store.get('agentLog') || []; l.unshift(x); store.set('agentLog', l.slice(0, 300));
  if (!inmo().API) return;
  const p = store.get('agentLogPend') || []; p.push({ t: x.t, canal, tool: String(e.tool || 'desconocida').slice(0, 120), action: e.action ? String(e.action).slice(0, 120) : null, ok: e.ok !== false, resumen: String(e.resumen || '').slice(0, 500) });
  store.set('agentLogPend', p.slice(-PEND_MAX));
  if (!reloj) { reloj = setTimeout(() => { reloj = null; enviar().catch(() => {}); }, 5000); reloj.unref?.(); }
}
function enviar() {
  if (!enApi()) return Promise.resolve();
  return (enviando ||= (async () => {
    for (;;) {
      const p = store.get('agentLogPend') || []; if (!p.length) return;
      const lote = p.slice(0, 300);
      await require('./asset').llamar('POST', '/agente/registro', { items: lote });
      store.set('agentLogPend', (store.get('agentLogPend') || []).slice(lote.length));
    }
  })().finally(() => { enviando = null; }));
}
const recientes = (n = 100) => (store.get('agentLog') || []).slice(0, n);
/** el registro de otro usuario de la corredora (administrador) */
const deUsuario = (usuarioId, limite = 100) => require('./asset').llamar('GET', `/agente/registro?usuarioId=${encodeURIComponent(usuarioId)}&limite=${limite}`);

try {
  inmo().alCargar(async () => {
    if (!enApi()) return null;
    if (!store.get('agentLogSubido')) {
      const viejo = (store.get('agentLog') || []).slice().reverse().map((x) => ({ t: x.t, canal: 'app', tool: String(x.tool || 'desconocida').slice(0, 120), action: x.action || null, ok: x.ok !== false, resumen: String(x.resumen || '').slice(0, 500) }));
      store.set('agentLogPend', [...viejo, ...(store.get('agentLogPend') || [])].slice(-PEND_MAX)); store.set('agentLogSubido', new Date().toISOString());
    }
    await enviar().catch(() => {});
    return null;
  });
  const ciclo = setInterval(() => { if (enApi() && (store.get('agentLogPend') || []).length) enviar().catch(() => {}); }, 60e3); ciclo.unref?.();
} catch {}

module.exports = { registrar, enviar, recientes, deUsuario };
