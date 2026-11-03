// Conversaciones del Agente guardadas en el computador (junto a la cartera: <inmo>/conversaciones.json).
// Cada una guarda lo que se ve en el chat (items) y lo que necesita el modelo para seguir (messages),
// con su título, el contexto que mostraba el lienzo y la fecha. Escritura atómica, máximo 300.
const fs = require('fs'); const path = require('path'); const { app } = require('electron');
const dir = () => { const d = process.env.PF_INMO_DIR || path.join(app.getPath('userData'), 'inmo'); fs.mkdirSync(d, { recursive: true }); return d; };
const file = () => path.join(dir(), 'conversaciones.json');
let cache = null;
const now = () => new Date().toISOString();
const uid = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function db() { if (!cache) { try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { cache = { lista: [] }; } } return cache; }
function save() { const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cache)); fs.renameSync(tmp, file()); }
const err = (m) => new Error(m);
const una = (id) => { const c = db().lista.find((x) => x.id === id); if (!c) throw err('La conversación ya no existe.'); return c; };
const corto = (c) => ({ id: c.id, titulo: c.titulo, actualizado: c.actualizado, fijada: !!c.fijada, resumen: c.resumen || '', ctx: c.ctx || null, n: (c.items || []).filter((i) => i.k === 'user').length });

function listar(q) {
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
  if (d.lista.length > 300) d.lista = d.lista.sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado))).slice(0, 300);
  save(); return corto(c);
}
function renombrar(id, titulo) { const c = una(id); const t = String(titulo || '').trim(); if (!t) throw err('Escribe un nombre.'); c.titulo = t.slice(0, 80); c.tituloManual = true; save(); return corto(c); }
function fijar(id, v) { const c = una(id); c.fijada = !!v; save(); return corto(c); }
function borrar(id) { const d = db(); d.lista = d.lista.filter((x) => x.id !== id); save(); return true; }

module.exports = { listar, obtener, guardar, renombrar, fijar, borrar, nuevoId: uid };
