// Conversaciones del Agente. Cada una guarda lo que se ve en el chat (items) y lo que necesita el modelo para seguir
// (messages), con su título, el contexto que mostraba el lienzo y la fecha. Máximo 300.
//  · Con la cuenta de Asset viven en la base (/v1/agente/conversaciones, de cada usuario; el administrador puede
//    leerlas). En el equipo queda una copia por usuario (<inmo>/conversaciones-<usuario>.json) para abrirlas al
//    instante: cada cambio se marca y se sube a los 2 s; al iniciar sesión y cada 5 minutos se traen las que cambiaron
//    en otro equipo (lo que este equipo aún no subió no se pisa). Las que estaban solo en este equipo
//    (conversaciones.json de antes) se suben una vez.
//  · En modo de prueba (PF_MOCK) o sin sesión, todo queda en <inmo>/conversaciones.json como antes.
// La interfaz no cambia: listar, obtener, guardar, renombrar, fijar, borrar, nuevoId.
const fs = require('fs'); const path = require('path'); const { app } = require('electron');
const dir = () => { const d = process.env.PF_INMO_DIR || path.join(app.getPath('userData'), 'inmo'); fs.mkdirSync(d, { recursive: true }); return d; };
let inmoMod = null; const inmo = () => (inmoMod ||= require('./inmo'));
const asset = () => require('./asset');
/** id del usuario de Asset con sesión (null en modo de prueba o sin sesión) */
const usuarioId = () => { try { return inmo().API ? inmo().usuario()?.id || null : null; } catch { return null; } };
const fileLegado = () => path.join(dir(), 'conversaciones.json');
const file = () => { const u = usuarioId(); return u ? path.join(dir(), `conversaciones-${u}.json`) : fileLegado(); };
let cache = null; let cacheDe = null;
const now = () => new Date().toISOString();
const uid = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function db() {
  const f = file();
  if (!cache || cacheDe !== f) { try { cache = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { cache = { lista: [] }; } cache.lista ||= []; cache.sucias ||= []; cache.borradas ||= []; cacheDe = f; }
  return cache;
}
function save() { const f = file(); const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cache)); fs.renameSync(tmp, f); }
const err = (m) => new Error(m);
const una = (id) => { const c = db().lista.find((x) => x.id === id); if (!c) throw err('La conversación ya no existe.'); return c; };
const corto = (c) => ({ id: c.id, titulo: c.titulo, actualizado: c.actualizado, fijada: !!c.fijada, resumen: c.resumen || '', ctx: c.ctx || null, n: (c.items || []).filter((i) => i.k === 'user').length });

// ---------------------------------------------------------------- sincronización con la base
const enApi = () => !!usuarioId();
let reloj = null;
function marcar(id, borrada = false) {
  if (!enApi()) return;
  const d = db();
  if (borrada) { d.sucias = d.sucias.filter((x) => x !== id); if (!d.borradas.includes(id)) d.borradas.push(id); }
  else if (!d.sucias.includes(id)) d.sucias.push(id);
  clearTimeout(reloj); reloj = setTimeout(() => subir().catch(() => {}), 2000); reloj.unref?.();
}
const cuerpo = (c) => ({ titulo: c.titulo || '', fijada: !!c.fijada, tituloManual: !!c.tituloManual, resumen: c.resumen || '', ctx: c.ctx ?? null, items: c.items || [], messages: c.messages || [], ...(c.creado ? { creado: c.creado } : {}) });
let subiendo = null;
/** sube lo marcado; lo que falla queda marcado para el próximo intento */
function subir() {
  if (!enApi()) return Promise.resolve();
  return (subiendo ||= (async () => {
    const d = db(); const f = cacheDe;
    for (const id of [...d.borradas]) { await asset().llamar('DELETE', `/agente/conversaciones/${encodeURIComponent(id)}`); if (cacheDe !== f) return; d.borradas = d.borradas.filter((x) => x !== id); save(); }
    for (const id of [...d.sucias]) {
      const c = d.lista.find((x) => x.id === id);
      if (c) await asset().llamar('PUT', `/agente/conversaciones/${encodeURIComponent(id)}`, cuerpo(c));
      if (cacheDe !== f) return; d.sucias = d.sucias.filter((x) => x !== id); save();
    }
  })().finally(() => { subiendo = null; }));
}
// las que estaban solo en este equipo (antes de la cuenta de Asset): se suben una vez, de a lotes de hasta ~6 MB
async function subirLegado() {
  const f = fileLegado(); if (!fs.existsSync(f)) return null;
  let l = []; try { l = JSON.parse(fs.readFileSync(f, 'utf8')).lista || []; } catch {}
  let lote = []; let peso = 0; let n = 0;
  const enviar = async () => { if (!lote.length) return; const r = await asset().llamar('POST', '/agente/conversaciones/importar', { items: lote }); n += r.nuevos || 0; lote = []; peso = 0; };
  for (const c of l) { const x = { id: c.id, ...cuerpo(c) }; const p = JSON.stringify(x).length; if (lote.length && (peso + p > 6e6 || lote.length >= 50)) await enviar(); lote.push(x); peso += p; }
  await enviar();
  fs.renameSync(f, path.join(dir(), 'conversaciones.subidas.json'));
  return n ? `Se ${n === 1 ? 'subió 1 conversación' : `subieron ${n} conversaciones`} del Agente que estaban solo en este computador.` : null;
}
let trayendo = null; let traidoEn = 0;
/** trae lo que cambió en la base (otro equipo) */
function traer() {
  if (!enApi()) return Promise.resolve(0);
  return (trayendo ||= (async () => {
    await subir().catch(() => {});
    const d = db(); const f = cacheDe; let n = 0; let cursor = null; let marca = null;
    do {
      const q = new URLSearchParams({ limite: '50', ...(d.marca ? { desde: d.marca } : {}), ...(cursor ? { cursor } : {}) });
      const r = await asset().llamar('GET', '/agente/conversaciones?' + q);
      if (cacheDe !== f) return 0;
      marca ||= r.servidorEn;
      for (const x of r.items || []) {
        if (d.sucias.includes(x.id) || d.borradas.includes(x.id)) continue;
        const i = d.lista.findIndex((c) => c.id === x.id);
        if (x.eliminado) { if (i >= 0) { d.lista.splice(i, 1); n++; } continue; }
        const { version, n: _n, ...c } = x; c.creado = x.creado;
        if (i >= 0) d.lista[i] = c; else d.lista.push(c); n++;
      }
      cursor = r.siguiente;
    } while (cursor);
    // la marca se resta un minuto: lo guardado justo antes del corte vuelve, en vez de perderse
    if (marca) d.marca = new Date(new Date(marca).getTime() - 60e3).toISOString();
    save(); traidoEn = Date.now(); return n;
  })().finally(() => { trayendo = null; }));
}
// al iniciar sesión: primero lo que estaba solo en este equipo, después lo de la base
try {
  inmo().alCargar(async () => { if (!enApi()) return null; const t = await subirLegado().catch((e) => { console.warn('[conversaciones] sin subir:', e.message); return null; }); await traer().catch(() => {}); return t; });
  const ciclo = setInterval(() => { if (enApi()) traer().catch(() => {}); }, 5 * 60e3); ciclo.unref?.();
} catch {}

// ---------------------------------------------------------------- lo de siempre
function listar(q) {
  if (enApi() && Date.now() - traidoEn > 60e3) traer().catch(() => {}); // en segundo plano; la próxima vez ya está
  const t = String(q || '').toLowerCase().trim();
  return db().lista.filter((c) => !t || [c.titulo, c.resumen, ...(c.items || []).filter((i) => i.text).map((i) => i.text)].join(' ').toLowerCase().includes(t))
    .sort((a, b) => (b.fijada ? 1 : 0) - (a.fijada ? 1 : 0) || String(b.actualizado).localeCompare(String(a.actualizado))).map(corto);
}
function obtener(id) { const c = una(id); return { ...corto(c), items: c.items || [], messages: c.messages || [] }; }
// Guarda (o crea) la conversación. El título se pone solo con el primer pedido, salvo que el usuario lo haya cambiado.
function guardar(id, { items, messages, ctx, titulo } = {}) {
  const d = db(); let c = id ? d.lista.find((x) => x.id === id) : null;
  if (!c) { c = { id: id || uid(), titulo: '', creado: now() }; d.lista.unshift(c); }
  if (items) { c.items = items.slice(-400); const u = items.find((i) => i.k === 'user'); const b = [...items].reverse().find((i) => i.k === 'bot' || i.k === 'hecho');
    if (!c.tituloManual && u && !c.titulo) c.titulo = String(titulo || u.text).replace(/\s+/g, ' ').trim().slice(0, 60);
    c.resumen = String(b?.text || '').replace(/\s+/g, ' ').slice(0, 120); }
  if (titulo && !c.tituloManual && !c.titulo) c.titulo = titulo.slice(0, 60);
  if (messages) c.messages = messages.slice(-60);
  if (ctx !== undefined) c.ctx = ctx;
  c.actualizado = now();
  if (d.lista.length > 300) {
    d.lista.sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
    for (const x of d.lista.splice(300)) marcar(x.id, true);
  }
  marcar(c.id); save(); return corto(c);
}
function renombrar(id, titulo) { const c = una(id); const t = String(titulo || '').trim(); if (!t) throw err('Escribe un nombre.'); c.titulo = t.slice(0, 80); c.tituloManual = true; marcar(id); save(); return corto(c); }
function fijar(id, v) { const c = una(id); c.fijada = !!v; marcar(id); save(); return corto(c); }
function borrar(id) { const d = db(); d.lista = d.lista.filter((x) => x.id !== id); marcar(id, true); save(); return true; }

// ---------------------------------------------------------------- el administrador lee las de otro usuario (solo lectura)
async function deUsuario(usuario) {
  const out = []; let cursor = null;
  do { const r = await asset().llamar('GET', `/agente/conversaciones?usuarioId=${encodeURIComponent(usuario)}&limite=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`); out.push(...(r.items || []).filter((x) => !x.eliminado)); cursor = r.siguiente; } while (cursor);
  return out.sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
}
const abrirDe = (usuario, id) => asset().llamar('GET', `/agente/conversaciones/${encodeURIComponent(id)}?usuarioId=${encodeURIComponent(usuario)}`);

module.exports = { listar, obtener, guardar, renombrar, fijar, borrar, nuevoId: uid, traer, subir, deUsuario, abrirDe };
