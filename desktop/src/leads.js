// Leads (0.14): las conversaciones de WhatsApp de los brokers con sus clientes, guardadas y ordenadas.
//  · Entrada principal: el chat EXPORTADO desde WhatsApp («Exportar chat», .txt o .zip con fotos y audios).
//    Se reconoce por su formato (fecha, hora, nombre: mensaje), no por lo que diga el texto, así que no se
//    confunde con otros archivos. Llega arrastrado a Asset o enviado por WhatsApp al número de la empresa.
//  · Cada lead es una ficha propia (la persona y su conversación), no algo dentro de una propiedad: un cliente
//    pregunta por varias propiedades o por ninguna en particular («busco 2D en Ñuñoa»).
//  · La IA lee la conversación y deja la búsqueda (operación, tipo, comunas, presupuesto, dormitorios…), un
//    resumen, el estado sugerido y la próxima acción. Volver a importar el mismo chat agrega solo lo nuevo.
//  · Con la cuenta de Asset (API), cada lead vive en la base y su conversación en la tabla lead_mensajes; las fotos
//    y audios van a R2. En este computador queda una copia: <inmo>/leads/<id>.json (mensajes) y <inmo>/leads/<id>/
//    (fotos y audios recibidos aquí, servidos a la pantalla como pffoto://l/<id>/<archivo>). Ver «con la API de Asset».
//  · En modo de prueba (PF_MOCK) todo vive en este computador: además, <inmo>/leads/indice.json con los leads.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');

const ESTADOS = [['nuevo', 'Nuevo'], ['contactado', 'Contactado'], ['visita', 'Visita agendada'], ['negociando', 'Negociando'], ['ganado', 'Ganado'], ['perdido', 'Perdido']];
const ORIGENES = { chat: 'Chat exportado', whatsapp: 'WhatsApp de la empresa', instagram: 'Instagram', facebook: 'Facebook Messenger', email: 'Correo', portal: 'Portal', web: 'Sitio web', referido: 'Referido', otro: 'Otro' };
const now = () => new Date().toISOString();
const uid = () => 'ld' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const dig = (t) => String(t || '').replace(/\D/g, '');
const err = (m, code) => Object.assign(new Error(m), code ? { code } : {});
const esTelefono = (s) => { const d = dig(s); return d.length >= 8 && d.length <= 15 && /^[+\d\s().-]+$/.test(String(s).trim()); };

// ---------- lectura del chat exportado ----------
// iOS:     [16/10/26, 12:24:05] Nombre: texto          (adjuntos: ‎<adjunto: 00000012-PHOTO-….jpg>)
// Android: 16/10/26, 12:24 - Nombre: texto             (adjuntos: IMG-20261016-WA0003.jpg (archivo adjunto))
// También en inglés, con a. m./p. m. o AM/PM, y años de 2 o 4 cifras.
const HORA = String.raw`(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?|AM|PM)?`;
const RE_IOS = new RegExp(String.raw`^\[${HORA}\]\s+(.*)$`, 'i');
const RE_AND = new RegExp(String.raw`^${HORA}\s+[-–]\s+(.*)$`, 'i');
const RE_ADJ_IOS = /<(?:adjunto|attached|archivo adjunto|anexo):\s*([^>]+)>/i;
const RE_ADJ_AND = /^(.+?\.[a-z0-9]{2,5})\s+\((?:archivo adjunto|file attached|arquivo anexado)\)/i;
const RE_OMITIDO = /^<?(multimedia omitido|media omitted|imagen omitida|image omitted|audio omitido|audio omitted|video omitido|video omitted|sticker omitido|sticker omitted|documento omitido|document omitted|gif omitido|gif omitted)>?$/i;
const RE_SISTEMA = /cifrados de extremo a extremo|end-to-end encrypted|creó el grupo|created group|te añadió|added you|cambió el asunto|changed the subject|cambió su número|changed their phone|mensajes temporales|disappearing messages|security code changed|código de seguridad/i;
const tipoArchivo = (f) => (/\.(jpe?g|png|webp|heic|gif)$/i.test(f) ? 'imagen' : /\.(opus|ogg|m4a|mp3|aac|amr|wav)$/i.test(f) ? 'audio' : /\.(mp4|mov|3gp)$/i.test(f) ? 'video' : /\.vcf$/i.test(f) ? 'contacto' : 'documento');

function nombreDelChat(nombreArchivo) {
  const b = path.basename(String(nombreArchivo || '')).replace(/\.(zip|txt)$/i, '').replace(/\s*\(\d+\)$/, '');
  const m = b.match(/^(?:Chat de WhatsApp con|Chat de WhatsApp -|WhatsApp Chat with|WhatsApp Chat -|Conversa do WhatsApp com)\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
function parsear(texto, { nombreArchivo = '' } = {}) {
  const lineas = String(texto || '').replace(/^﻿/, '').replace(/[  ]/g, ' ').replace(/\r\n?/g, '\n').split('\n');
  const crudos = []; let estilo = null;
  for (const l0 of lineas) {
    const l = l0.replace(/^[‎‏]+/, '');
    const m = RE_IOS.exec(l) || RE_AND.exec(l);
    if (m) { estilo ||= RE_IOS.test(l) ? 'ios' : 'android'; crudos.push({ p: m.slice(1, 8), resto: m[8] }); }
    else if (crudos.length) crudos[crudos.length - 1].resto += '\n' + l0;
  }
  if (crudos.length < 2) return null; // no es un chat exportado de WhatsApp
  // ¿día/mes o mes/día? si algún «segundo número» pasa de 12, el orden es mes/día
  const mesDia = crudos.some((c) => Number(c.p[1]) > 12) && !crudos.some((c) => Number(c.p[0]) > 12);
  const mensajes = []; const cuenta = new Map();
  for (const c of crudos) {
    let [a, b, y, h, mi, s, ap] = c.p; const d = mesDia ? b : a; const mo = mesDia ? a : b;
    y = Number(y) < 100 ? 2000 + Number(y) : Number(y); h = Number(h);
    if (ap) { const pm = /^p/i.test(ap); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
    const fecha = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${mi}:${String(s || '00').padStart(2, '0')}`;
    const i = c.resto.indexOf(': ');
    if (i <= 0 || i > 60) { mensajes.push({ fecha, autor: null, texto: c.resto.trim(), tipo: 'sistema' }); continue; }
    const autor = c.resto.slice(0, i).replace(/^[‎‏~\s]+/, '').trim(); let tx = c.resto.slice(i + 2).replace(/^[‎‏]+/, '');
    if (RE_SISTEMA.test(tx) && mensajes.length < 3) { mensajes.push({ fecha, autor: null, texto: tx.trim(), tipo: 'sistema' }); continue; }
    const m = { fecha, autor, texto: '', tipo: 'texto' };
    const adj = RE_ADJ_IOS.exec(tx) || RE_ADJ_AND.exec(tx.trim());
    if (adj) { m.archivo = adj[1].trim(); m.tipo = tipoArchivo(m.archivo); tx = tx.replace(adj[0], '').replace(/^[‎\s]+/, ''); }
    else if (RE_OMITIDO.test(tx.trim())) { m.tipo = 'omitido'; m.omitido = tx.trim().replace(/[<>]/g, ''); tx = ''; }
    m.texto = tx.replace(/[‎‏]/g, '').trim();
    mensajes.push(m); cuenta.set(autor, (cuenta.get(autor) || 0) + 1);
  }
  const participantes = [...cuenta.entries()].map(([nombre, n]) => ({ nombre, n })).sort((x, y2) => y2.n - x.n);
  return { estilo, mensajes, participantes, chatCon: nombreDelChat(nombreArchivo) };
}

// un archivo (txt o zip) → { texto, nombre, medios: Map(nombre → bytes) }
async function leerExportacion({ ruta, bytes, nombre }) {
  if (ruta) { bytes = fs.readFileSync(ruta); nombre ||= path.basename(ruta); }
  if (!bytes || !bytes.length) throw err('El archivo está vacío.');
  const buf = Buffer.from(bytes); const esZip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (!esZip) return { texto: buf.toString('utf8'), nombre: nombre || 'chat.txt', medios: new Map() };
  const JSZip = require('jszip'); const z = await JSZip.loadAsync(buf);
  const archivos = Object.values(z.files).filter((f) => !f.dir && !/(^|\/)(__MACOSX|\.)/.test(f.name));
  const txt = archivos.find((f) => /(^|\/)_chat\.txt$/i.test(f.name)) || archivos.find((f) => /\.txt$/i.test(f.name));
  if (!txt) throw err('El .zip no trae una conversación de WhatsApp (falta el archivo .txt).', 'NO_CHAT');
  const medios = new Map();
  for (const f of archivos) if (f !== txt && f.name.split('/').pop().length < 120) medios.set(f.name.split('/').pop(), () => f.async('nodebuffer'));
  const nombreTxt = txt.name.split('/').pop();
  return { texto: await txt.async('string'), nombre: nombreDelChat(nombreTxt) ? nombreTxt : (nombre || nombreTxt), medios };
}

function crear({ dir, ai, inmo = null, broker = () => ({ nombre: '' }), emit = () => {}, corredores = () => [] }) {
  const base = () => { const d = typeof dir === 'function' ? dir() : dir; fs.mkdirSync(d, { recursive: true }); return d; };
  const fIndice = () => path.join(base(), 'indice.json');
  const fMsgs = (id) => path.join(base(), id + '.json');
  const dMedia = (id) => { const d = path.join(base(), id); fs.mkdirSync(d, { recursive: true }); return d; };
  let cache = null;
  const pareceId = (x) => /^[a-z0-9]{12,}$/i.test(String(x || '').trim()) && /\d/.test(x) && /[a-z]/i.test(x); // id de wechatia, no un nombre
  const enApi = () => !!inmo?.API && typeof inmo.leadsLista === 'function';
  const db = () => {
    if (cache) return cache;
    let f = {}; try { f = JSON.parse(fs.readFileSync(fIndice(), 'utf8')); } catch {}
    // con la API, los leads son la copia sincronizada; los del índice local (de antes) esperan a subirse
    if (enApi()) { cache = { ...f, leads: inmo.leadsLista(), legado: f.leads || [] }; return cache; }
    cache = { leads: [], ...f };
    for (const l of cache.leads) { if (pareceId(l.nombre)) l.nombre = ''; if (pareceId(l.chatCon)) l.chatCon = l.telefono || ''; } return cache; };
  const escribir = (f, o) => { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, f); };
  const save = () => {
    if (!enApi()) return escribir(fIndice(), db());
    const { leads, legado, ...resto } = db(); escribir(fIndice(), { ...resto, ...(legado?.length ? { leads: legado } : {}) }); // índice de wechatia, consentimientos
    inmo.guardar(); // los leads que cambiaron, a la API
  };
  const lead = (id) => { const l = db().leads.find((x) => x.id === id); if (!l) throw err('Ese lead ya no existe.'); return l; };
  const mensajesDe = (id) => leerConv(id).mensajes;
  const clave = (m) => crypto.createHash('sha1').update(`${m.fecha}|${m.autor}|${m.texto.slice(0, 200)}|${m.archivo || ''}`).digest('hex').slice(0, 16);
  const pendientes = new Map(); // análisis previos a importar (token → chat leído)
  // ---------- 0.16.23 · gestor de leads: persona siempre guardada, corredor dueño e historial ----------
  const corredorDe = (l) => { const c = l.corredorId ? corredores().find((x) => x.id === l.corredorId) : null; return c ? { id: c.id, nombre: c.nombre } : null; };
  function evento(l, texto, tipo = 'info') { l.historial = [...(l.historial || []), { fecha: now(), texto: String(texto).slice(0, 300), tipo }].slice(-200); }
  // la persona del lead vive en la cartera (en la base de Asset): se crea o completa en segundo plano y, cuando
  // vuelve, el lead queda ligado a ella
  async function syncAhora(l, ev = null) {
    if (!inmo?.personaDesdeLead) return false;
    try { const p = await inmo.personaDesdeLead({ ...l, origenTxt: ORIGENES[l.origen] || l.origen, corredor: corredorDe(l) }, { evento: ev });
      if (!p || l.personaId === p.id || !db().leads.includes(l)) return false;
      if (!l.personaId) evento(l, `Quedó guardado en Personas como ${p.nombre}`, 'persona'); l.personaId = p.id; save(); emit({ type: 'datos', que: 'leads', id: l.id }); return true;
    } catch { return false; }
  }
  function sync(l, ev = null) { syncAhora(l, ev); }
  function asignar(id, corredorId, por = 'manual') {
    const l = lead(id); const antes = corredorDe(l); if ((l.corredorId || null) === (corredorId || null)) return vista(l);
    if (corredorId && !corredores().some((c) => c.id === corredorId)) throw err('Ese corredor no existe.');
    l.corredorId = corredorId || null; const c = corredorDe(l);
    const t = c ? `${antes ? `Pasó de ${antes.nombre} a ${c.nombre}` : `Asignado a ${c.nombre}`}${por === 'wechatia' ? ' (según wechatia)' : ''}` : `Quedó sin corredor${antes ? ` (era de ${antes.nombre})` : ''}`;
    evento(l, t, 'dueno'); l.actualizado = now(); sync(l, t); save(); emit({ type: 'datos', que: 'leads', id }); return vista(l);
  }
  function registrarEvento(id, texto, tipo = 'info') { const l = lead(id); evento(l, texto, tipo); sync(l, texto); l.actualizado = now(); save(); emit({ type: 'datos', que: 'leads', id }); return vista(l); }
  // leads anteriores a 0.16.23: quedan como persona
  async function sincronizarTodos() { let n = 0; for (const l of [...db().leads]) if (!l.personaId || !inmo?.personaPorId?.(l.personaId)) { if (await syncAhora(l)) n++; } return n; }

  // ---------- con la API de Asset ----------
  // Los leads viven en la base (inmo.leadsLista(): la copia sincronizada; save() → inmo.guardar() encola lo que cambió).
  // La conversación queda en <id>.json como copia local: { mensajes, sv: { k: huella de lo que tiene el servidor },
  // desde: marca para traer solo lo nuevo }. Lo que cambia aquí se encola (inmo.encolarMensajes) y enviarMensajes lo
  // manda, subiendo antes a R2 las fotos y audios que aún están solo en este equipo.
  const api = (...a) => require('./asset').llamar(...a);
  const enc = encodeURIComponent;
  const estable = (v) => (Array.isArray(v) ? v.map(estable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined && v[k] !== null).map((k) => [k, estable(v[k])])) : v);
  const huella = (m) => crypto.createHash('sha1').update(JSON.stringify(estable({ ...m, url: undefined, actualizado: undefined }))).digest('hex').slice(0, 16);
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', opus: 'audio/ogg', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', amr: 'audio/amr', wav: 'audio/wav', mp4: 'video/mp4', mov: 'video/quicktime', '3gp': 'video/3gpp', pdf: 'application/pdf', vcf: 'text/vcard' };
  const mimeDe = (f) => MIME[path.extname(String(f)).slice(1).toLowerCase()] || 'application/octet-stream';
  const ARCH_MAX = 25 * 1024 * 1024;
  function leerConv(id) { try { const c = JSON.parse(fs.readFileSync(fMsgs(id), 'utf8')); return { mensajes: c.mensajes || [], sv: c.sv || {}, desde: c.desde || null }; } catch { return { mensajes: [], sv: {}, desde: null }; } }
  // guarda la conversación; con la API, encola los mensajes nuevos o cambiados
  function guardarMsgs(id, mensajes) {
    const c = leerConv(id); escribir(fMsgs(id), { mensajes, sv: c.sv, desde: c.desde });
    if (enApi()) inmo.encolarMensajes(id, mensajes.filter((m) => m.k && c.sv[m.k] !== huella(m)).map((m) => m.k));
  }
  async function enviarMensajes(id, ks) {
    const set = new Set(ks); const sel = leerConv(id).mensajes.filter((m) => set.has(m.k)); if (!sel.length) return;
    // fotos y audios que están solo en este equipo → R2
    const subir = sel.filter((m) => m.media && !m.mediaUrl).map((m) => { const f = path.join(base(), id, m.media); let st = null; try { st = fs.statSync(f); } catch {} return st && st.size > 0 && st.size <= ARCH_MAX ? { m, f } : null; }).filter(Boolean);
    for (let i = 0; i < subir.length; i += 50) {
      const t = subir.slice(i, i + 50).map((x) => ({ ...x, buf: fs.readFileSync(x.f), tipo: mimeDe(x.f) }));
      const { subidas } = await api('POST', `/leads/${enc(id)}/archivos/subidas`, { archivos: t.map((x) => ({ tipo: x.tipo, tamano: x.buf.length })) });
      for (const [j, x] of t.entries()) { await inmo.subirR2(subidas[j].subida, x.buf, x.tipo); x.m.mediaUrl = subidas[j].url; }
    }
    const limpio = (m) => { const o = {}; for (const [k, v] of Object.entries(m)) if (v !== undefined && k !== 'url') o[k] = v; if (o.autor) o.autor = String(o.autor).slice(0, 200); if (o.texto) o.texto = String(o.texto).slice(0, 20000); return o; };
    for (let i = 0; i < sel.length; i += 500) await api('POST', `/leads/${enc(id)}/mensajes`, { items: sel.slice(i, i + 500).map(limpio) });
    // queda como enviado (sobre lo último del archivo: pudo cambiar mientras se enviaba)
    const c = leerConv(id); const env = new Map(sel.map((m) => [m.k, m])); const otraVez = [];
    for (const m of c.mensajes) { const e = env.get(m.k); if (!e) continue; if (e.mediaUrl && !m.mediaUrl) m.mediaUrl = e.mediaUrl; c.sv[m.k] = huella(e); if (huella(m) !== c.sv[m.k]) otraVez.push(m.k); }
    escribir(fMsgs(id), c);
    if (otraVez.length) inmo.encolarMensajes(id, otraVez);
  }
  /** Trae de la base los mensajes nuevos o cambiados (p. ej. los que recibió otro equipo). Devuelve cuántos. */
  async function traerMensajes(id) {
    if (!enApi() || !db().leads.some((l) => l.id === id)) return 0;
    let c = leerConv(id); const llegados = []; let cursor = null; let marca = null;
    do {
      const r = await api('GET', `/leads/${enc(id)}/mensajes?limite=1000${c.desde ? '&desde=' + enc(c.desde) : ''}${cursor ? '&cursor=' + enc(cursor) : ''}`);
      marca ||= r.servidorEn; llegados.push(...(r.items || [])); cursor = r.siguiente;
    } while (cursor);
    c = leerConv(id); const porK = new Map(c.mensajes.map((m) => [m.k, m])); let n = 0;
    for (const { actualizado, ...s } of llegados) {
      const loc = porK.get(s.k);
      if (loc && c.sv[s.k] !== huella(loc)) continue; // cambio local que aún no se envía: gana el local
      const m = Object.fromEntries(Object.entries({ ...s, ...(loc?.media ? { media: loc.media } : {}) }).filter(([, v]) => v !== null));
      if (!loc || huella(loc) !== huella(m)) n++;
      porK.set(s.k, m); c.sv[s.k] = huella(m);
    }
    const desde = marca ? new Date(new Date(marca).getTime() - 5000).toISOString() : c.desde;
    escribir(fMsgs(id), { mensajes: [...porK.values()].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))), sv: c.sv, desde });
    return n;
  }
  // los leads del índice local de antes (indice.json › leads) se suben una vez; sus conversaciones van a la cola
  async function subirLocales() {
    if (!enApi()) return null; const d = db(); const viejos = d.legado || []; if (!viejos.length) return null;
    const mapeo = {}; const rechazados = []; let nuevos = 0;
    for (let i = 0; i < viejos.length; i += 100) {
      const r = await api('POST', '/leads/importar', { items: viejos.slice(i, i + 100) });
      Object.assign(mapeo, r.mapeo || {}); rechazados.push(...(r.rechazados || [])); nuevos += r.nuevos || 0;
    }
    const malos = new Set(rechazados.map((x) => x.id));
    for (const x of viejos) {
      if (malos.has(x.id)) continue;
      const dest = mapeo[x.id] || x.id; if (dest !== x.id) moverConv(x.id, dest);
      const c = leerConv(dest); c.sv = {}; escribir(fMsgs(dest), c); // todo se manda (el servidor no duplica por k)
      inmo.encolarMensajes(dest, c.mensajes.map((m) => m.k).filter(Boolean));
    }
    escribir(path.join(base(), 'indice.respaldo.json'), { fecha: now(), leads: viejos, rechazados });
    d.legado = []; save();
    const unidos = Object.keys(mapeo).length;
    return nuevos || unidos ? `Se subieron al servidor ${nuevos} ${nuevos === 1 ? 'lead' : 'leads'} que estaban solo en este computador${unidos ? ` (${unidos} ya existían y se juntaron con su conversación)` : ''}.${rechazados.length ? ` ${rechazados.length} no se pudieron subir (quedaron respaldados).` : ''}` : null;
  }
  // la conversación (y sus archivos) de un lead pasa a otro id
  function moverConv(de, a) {
    const ca = leerConv(a); const cd = leerConv(de); const ya = new Set(ca.mensajes.map((m) => m.k));
    escribir(fMsgs(a), { ...ca, mensajes: [...ca.mensajes, ...cd.mensajes.filter((m) => !ya.has(m.k))].sort((x, y) => String(x.fecha).localeCompare(String(y.fecha))) });
    fs.rmSync(fMsgs(de), { force: true });
    const md = path.join(base(), de); if (fs.existsSync(md)) { for (const f of fs.readdirSync(md)) { try { fs.renameSync(path.join(md, f), path.join(dMedia(a), f)); } catch {} } fs.rmSync(md, { recursive: true, force: true }); }
  }
  // el servidor rechazó un lead nuevo porque el cliente ya tiene uno (lo recibió otro equipo): se juntan aquí
  async function alDuplicado(idLocal, dup) {
    const d = db(); const local = d.leads.find((x) => x.id === idLocal); if (!local) return;
    if (dup.visible && d.leads.some((x) => x.id === dup.id)) { fusionar(dup.id, idLocal); }
    else { d.leads.splice(d.leads.indexOf(local), 1); fs.rmSync(fMsgs(idLocal), { force: true }); save(); } // es de otro corredor
    emit({ type: 'datos', que: 'leads' });
  }
  if (inmo?.configurar) inmo.configurar({ leads: { subirLocales, enviarMensajes, alDuplicado } });

  // 1) analizar: lee el archivo y muestra qué trae, sin guardar nada
  async function analizar(o = {}) {
    const ex = await leerExportacion(o);
    const c = parsear(ex.texto, { nombreArchivo: ex.nombre });
    if (!c) throw err('Este archivo no parece un chat exportado de WhatsApp. En el chat: ⋮ o el nombre del contacto › Exportar chat.', 'NO_CHAT');
    const yo = norm(o.miNombre || broker().nombre); const con = norm(c.chatCon);
    let cliente = c.participantes.find((p) => con && norm(p.nombre) === con)?.nombre
      || (yo && c.participantes.length === 2 ? c.participantes.find((p) => !norm(p.nombre).includes(yo.split(' ')[0]))?.nombre : null)
      || c.chatCon || null;
    if (!cliente && c.participantes.length === 1) cliente = c.participantes[0].nombre;
    const reales = c.mensajes.filter((m) => m.tipo !== 'sistema');
    const medios = {}; for (const m of reales) if (m.tipo !== 'texto') medios[m.tipo] = (medios[m.tipo] || 0) + 1;
    const existente = buscarExistente({ nombre: cliente, telefono: esTelefono(cliente) ? cliente : '' });
    let nuevos = reales.length; if (existente) { const ya = new Set(mensajesDe(existente.id).map((m) => m.k)); nuevos = reales.filter((m) => !ya.has(clave(m))).length; }
    const token = crypto.randomBytes(9).toString('hex'); pendientes.set(token, { c, ex, t: Date.now() });
    for (const [k, v] of pendientes) if (Date.now() - v.t > 30 * 6e4) pendientes.delete(k);
    return { token, chatCon: c.chatCon, participantes: c.participantes, cliente, telefono: esTelefono(cliente) ? cliente : '', total: reales.length, desde: reales[0]?.fecha || null, hasta: reales.at(-1)?.fecha || null, medios, conArchivos: ex.medios.size > 0,
      existente: existente ? { id: existente.id, nombre: existente.nombre, nuevos } : null };
  }
  function buscarExistente({ nombre, telefono }) {
    const t = dig(telefono).slice(-9);
    return db().leads.find((l) => (t && dig(l.telefono).slice(-9) === t) || (nombre && norm(l.chatCon || l.nombre) === norm(nombre))) || null;
  }

  // 2) importar: guarda (o completa) el lead con sus mensajes, fotos y audios, y lo analiza con IA
  async function importar({ token, cliente, telefono = '', origen = 'chat', brokerNombre, transcribir = true, analizarIA = true } = {}) {
    const p = pendientes.get(token); if (!p) throw err('El análisis del archivo expiró. Vuelve a cargarlo.');
    const { c, ex } = p; if (!cliente || !c.participantes.some((x) => x.nombre === cliente)) throw err('Indica quién es el cliente en la conversación.');
    const tel = telefono || (esTelefono(cliente) ? cliente : '');
    let l = buscarExistente({ nombre: cliente, telefono: tel }); const nuevo = !l;
    if (!l) {
      l = { id: uid(), nombre: esTelefono(cliente) ? '' : cliente, chatCon: cliente, telefono: tel, email: '', rut: '', origen, broker: brokerNombre || broker().nombre || '', estado: 'nuevo', busqueda: {}, resumen: '', propiedades: [], links: [],
        proximaAccion: null, personaId: null, notas: '', creado: now(), actualizado: now(), mensajes: 0, ultimo: null, noLeidos: 0, importaciones: [] };
      db().leads.unshift(l);
    }
    if (tel && !l.telefono) l.telefono = tel;
    const previos = mensajesDe(l.id); const ya = new Set(previos.map((m) => m.k)); const agregados = [];
    for (const m0 of c.mensajes) {
      if (m0.tipo === 'sistema') continue;
      const m = { ...m0, k: clave(m0), de: m0.autor === cliente ? 'cliente' : 'broker' }; if (ya.has(m.k)) continue; ya.add(m.k);
      if (m.archivo && ex.medios.has(m.archivo)) { // guardar la foto o el audio que vino en el .zip
        try { const b = await ex.medios.get(m.archivo)(); const nombreSeg = m.archivo.replace(/[^\w.-]+/g, '_'); fs.writeFileSync(path.join(dMedia(l.id), nombreSeg), b); m.media = nombreSeg; } catch {}
      }
      agregados.push(m);
    }
    // audios: transcribir (hasta 25 por importación)
    if (transcribir && ai?.transcribir) {
      let n = 0;
      for (const m of agregados) {
        if (m.tipo !== 'audio' || !m.media || n >= 25) continue; n++;
        try { const bytes = fs.readFileSync(path.join(dMedia(l.id), m.media)); const r = await ai.transcribir({ bytes, mime: /m4a|mp4/.test(m.media) ? 'audio/mp4' : 'audio/ogg' }); m.transcripcion = r.texto; } catch (e) { m.transcripcion = null; m.errorTx = String(e.message).slice(0, 120); }
      }
    }
    const todos = [...previos, ...agregados].sort((a, b) => a.fecha.localeCompare(b.fecha));
    guardarMsgs(l.id, todos);
    l.mensajes = todos.length; const u = todos.at(-1); l.ultimo = u ? { fecha: u.fecha, de: u.de, texto: resumenMsg(u) } : null;
    l.links = [...new Set([...(l.links || []), ...todos.flatMap((m) => String(m.texto).match(/https?:\/\/[^\s<>()]+/g) || [])])].slice(0, 40);
    l.noLeidos = (l.noLeidos || 0) + agregados.length; l.actualizado = now();
    l.importaciones = [...(l.importaciones || []), { fecha: now(), nuevos: agregados.length, archivo: ex.nombre }].slice(-20);
    if (inmo) vincularPropiedades(l);
    if (nuevo) evento(l, `Llegó por ${ORIGENES[origen] || origen} (chat importado)`, 'canal'); sync(l);
    save();
    let ia = null;
    if (analizarIA && agregados.length) { try { ia = await analizarConIA(l.id); } catch (e) { ia = { error: e.message, code: e.code }; } }
    pendientes.delete(token); emit({ type: 'datos', que: 'leads' });
    return { lead: vista(lead(l.id)), nuevo, agregados: agregados.length, ia };
  }
  // ---------- 0.16.21 · historial de Instagram (archivo de «Descargar tu información») ----------
  const IG = require('./instagram-import');
  async function analizarInstagram(o = {}) {
    const z = await IG.abrirZip(o); if (!z) throw err('Sube el archivo .zip que entrega Instagram, tal como se descarga.', 'NO_IG');
    const t = IG.esInstagram(z);
    if (t === 'html') throw err('La descarga viene en formato HTML. Pídela de nuevo en Instagram eligiendo el formato JSON.', 'IG_HTML');
    if (!t) throw err('Este .zip no es una descarga de Instagram.', 'NO_IG');
    const d = await IG.leer(z);
    const token = crypto.randomBytes(9).toString('hex'); pendientes.set(token, { ig: d, z, nombre: o.ruta ? path.basename(o.ruta) : (o.nombre || 'instagram.zip'), t: Date.now() });
    const conv = d.hilos.filter((h) => h.mensajes.length).map((h) => { const ex = db().leads.find((l) => l.ig?.hilo === h.id);
      const nuevos = ex ? (() => { const ya = new Set(mensajesDe(ex.id).map((m) => m.k)); return h.mensajes.filter((m) => !ya.has(clave(m))).length; })() : h.mensajes.length;
      return { id: h.id, cliente: h.cliente, usuario: h.usuario, grupo: h.grupo, solicitud: h.carpeta === 'message_requests', participantes: h.participantes, total: h.mensajes.length, delCliente: h.delCliente, desde: h.desde, hasta: h.hasta,
        fotos: h.mensajes.filter((m) => m.tipo === 'imagen').length, existente: ex ? { id: ex.id, nombre: ex.nombre, nuevos } : null }; });
    return { tipo: 'instagram', token, dueno: d.dueno, conversaciones: conv };
  }
  async function importarInstagram({ token, hilos = [], dueno, cuenta = '', autorizadoPor = '', autorizado = false, analizarIA = true, brokerNombre } = {}) {
    const p = pendientes.get(token); if (!p?.ig) throw err('El análisis del archivo expiró. Vuelve a cargarlo.');
    if (!autorizado) throw err('Confirma que eres el dueño de la cuenta o que tienes su autorización para importar sus mensajes.');
    const yo = dueno || p.ig.dueno; if (!yo) throw err('Indica cuál es la cuenta de Instagram de la corredora en la conversación.');
    const elegir = new Set(hilos); const sel = p.ig.hilos.filter((h) => elegir.has(h.id) && h.mensajes.length);
    if (!sel.length) throw err('Elige al menos una conversación.');
    const res = [];
    for (const h of sel) {
      let l = db().leads.find((x) => x.ig?.hilo === h.id); const nuevo = !l;
      if (!l) {
        l = { id: uid(), nombre: h.grupo ? '' : h.cliente, chatCon: h.cliente, telefono: '', email: '', rut: '', origen: 'instagram', broker: brokerNombre || broker().nombre || '', estado: 'nuevo', busqueda: {}, resumen: '', propiedades: [], links: [],
          proximaAccion: null, personaId: null, notas: '', creado: now(), actualizado: now(), mensajes: 0, ultimo: null, noLeidos: 0, importaciones: [], ig: { hilo: h.id, usuario: h.usuario, cuenta: cuenta || yo } };
        db().leads.unshift(l);
      }
      const previos = mensajesDe(l.id); const ya = new Set(previos.map((m) => m.k)); const agregados = [];
      for (const m0 of h.mensajes) {
        const { uri, ...resto } = m0; const m = { ...resto, k: clave(m0), de: m0.autor === yo ? 'broker' : 'cliente', ig: true }; if (ya.has(m.k)) continue; ya.add(m.k);
        if (uri && m.tipo !== 'texto') { const f = IG.archivoDe(p.z, h, uri);
          if (f) { try { const nombreSeg = path.basename(f.name).replace(/[^\w.-]+/g, '_'); fs.writeFileSync(path.join(dMedia(l.id), nombreSeg), await f.async('nodebuffer')); m.media = nombreSeg; } catch {} }
          else if (!m.texto) m.tipo = m.tipo === 'imagen' || m.tipo === 'audio' ? m.tipo : 'omitido'; }
        agregados.push(m);
      }
      const todos = [...previos, ...agregados].sort((a, b) => a.fecha.localeCompare(b.fecha));
      guardarMsgs(l.id, todos);
      l.mensajes = todos.length; const u = todos.at(-1); l.ultimo = u ? { fecha: u.fecha, de: u.de, texto: resumenMsg(u) } : null;
      l.links = [...new Set([...(l.links || []), ...todos.flatMap((m) => String(m.texto).match(/https?:\/\/[^\s<>()]+/g) || [])])].slice(0, 40);
      l.noLeidos = (l.noLeidos || 0) + agregados.length; l.actualizado = now();
      l.importaciones = [...(l.importaciones || []), { fecha: now(), nuevos: agregados.length, archivo: p.nombre, canal: 'instagram' }].slice(-20);
      if (inmo) vincularPropiedades(l);
      if (nuevo) evento(l, `Llegó por Instagram${h.usuario ? ' (@' + h.usuario + ')' : ''} · historial importado`, 'canal'); sync(l);
      res.push({ id: l.id, nuevo, agregados: agregados.length, delCliente: agregados.some((m) => m.de === 'cliente') });
    }
    // quién autorizó y cuándo (queda en el registro de Leads)
    const d = db(); d.consentimientos = [...(d.consentimientos || []), { canal: 'instagram', cuenta: cuenta || yo, autorizadoPor: String(autorizadoPor || brokerNombre || broker().nombre || '').slice(0, 120), fecha: now(), archivo: p.nombre, conversaciones: res.length }].slice(-100);
    save(); pendientes.delete(token);
    let analizados = 0; const errores = [];
    if (analizarIA) for (const r of res) { if (!r.agregados || !r.delCliente) continue; try { await analizarConIA(r.id); analizados++; } catch (e) { errores.push(e.message); if (e.code === 'NO_TOKENS' || /saldo|token/i.test(e.message)) break; } }
    emit({ type: 'datos', que: 'leads' });
    return { nuevos: res.filter((r) => r.nuevo).length, actualizados: res.filter((r) => !r.nuevo && r.agregados).length, mensajes: res.reduce((a, r) => a + r.agregados, 0), analizados, errores: [...new Set(errores)].slice(0, 3), primero: res[0]?.id || null };
  }
  // ---------- 0.16.22 · observador en vivo (wechatia): Instagram, Facebook y correo, solo lectura ----------
  // Una conversación de wechatia = un lead. Si la persona ya está (mismo teléfono o correo), se suma a su lead.
  function registrarCanal({ canal, convId, contactId = '', nombre = '', email = '', telefono = '', usuario = '', mensajes = [] }) {
    const d = db(); const t = dig(telefono).slice(-9); const em = String(email || '').toLowerCase().trim();
    // 0.16.24 · la misma persona puede llegar con otra conversación: wechatia une contactos (p. ej. cuando el cliente da un
    // teléfono que ya existía) y mueve allá los mensajes. Se reconoce por los mensajes ya vistos, el contacto, el teléfono o
    // el correo; si eso junta dos leads, se fusionan en el más antiguo.
    const idx = (d.wcIdx ||= {});
    const cand = [d.leads.find((x) => (x.canales || []).some((c) => c.conv === convId)),
      ...mensajes.map((m) => idx['wc' + m.id]).filter(Boolean).map((id) => d.leads.find((x) => x.id === id)),
      contactId && d.leads.find((x) => (x.canales || []).some((c) => c.contactId === contactId)),
      t.length >= 8 && d.leads.find((x) => dig(x.telefono).slice(-9) === t),
      em && d.leads.find((x) => String(x.email || '').toLowerCase() === em)].filter(Boolean);
    const unicos = [...new Set(cand)].sort(antes);
    let l = unicos[0] || null; for (const otro of unicos.slice(1)) fusionar(l.id, otro.id);
    const nuevo = !l;
    if (!l) {
      l = { id: uid(), nombre: String(nombre || '').trim(), chatCon: String(nombre || usuario || email || telefono || '').trim(), telefono: String(telefono || '').trim(), email: em, rut: '', origen: ORIGENES[canal] ? canal : 'otro', broker: broker().nombre || '', estado: 'nuevo', busqueda: {}, resumen: '', propiedades: [], links: [],
        proximaAccion: null, personaId: null, notas: '', creado: now(), actualizado: now(), mensajes: 0, ultimo: null, noLeidos: 0, importaciones: [] };
      d.leads.unshift(l);
    }
    l.canales ||= []; if (!l.canales.some((c) => c.conv === convId)) { l.canales.push({ canal, conv: convId, contactId, usuario: usuario || '' }); evento(l, nuevo ? `Llegó por ${ORIGENES[canal] || canal}${usuario ? ' (@' + usuario + ')' : ''}` : `También escribe por ${ORIGENES[canal] || canal}`, 'canal'); }
    if (canal === 'instagram' && !l.ig) l.ig = { usuario: usuario || '', cuenta: 'wechatia' };
    if (!l.nombre && nombre) l.nombre = String(nombre).trim(); if (!l.telefono && telefono) l.telefono = String(telefono).trim(); if (!l.email && em) l.email = em;
    const previos = mensajesDe(l.id); const ya = new Set(previos.map((m) => m.k)); const agregados = [];
    for (const m0 of mensajes) {
      const k = 'wc' + m0.id; idx[k] = l.id; if (ya.has(k)) continue; ya.add(k);
      agregados.push({ fecha: m0.fecha, autor: m0.de === 'cliente' ? (l.nombre || l.chatCon || 'Cliente') : (m0.autor || 'Corredora'), texto: String(m0.texto || '').slice(0, 6000), tipo: 'texto', de: m0.de, k, canal, ...(m0.asunto ? { asunto: m0.asunto } : {}) });
    }
    if (!agregados.length && !nuevo) { if (!l.personaId) { sync(l); save(); } return { id: l.id, nuevo, agregados: 0, delCliente: false }; }
    const todos = [...previos, ...agregados].sort((a, b) => a.fecha.localeCompare(b.fecha));
    guardarMsgs(l.id, todos);
    l.mensajes = todos.length; const u = todos.at(-1); l.ultimo = u ? { fecha: u.fecha, de: u.de === 'cliente' ? 'cliente' : 'broker', texto: resumenMsg(u) } : null;
    l.links = [...new Set([...(l.links || []), ...agregados.flatMap((m) => String(m.texto).match(/https?:\/\/[^\s<>()]+/g) || [])])].slice(0, 40);
    l.noLeidos = (l.noLeidos || 0) + agregados.filter((m) => m.de === 'cliente').length; l.actualizado = now();
    if (inmo && agregados.length) vincularPropiedades(l);
    sync(l); save(); emit({ type: 'datos', que: 'leads', id: l.id });
    return { id: l.id, nuevo, agregados: agregados.length, delCliente: agregados.some((m) => m.de === 'cliente') };
  }
  // el más antiguo primero (a igual hora, el que está más abajo en la lista: los nuevos se agregan arriba)
  const antes = (a, b) => String(a.creado).localeCompare(String(b.creado)) || db().leads.indexOf(b) - db().leads.indexOf(a);
  // une el lead «origen» en «destino»: mensajes, canales, datos que falten e historial; el origen desaparece
  function fusionar(destId, origenId) {
    if (destId === origenId) return; const d = db(); const a = lead(destId); const b = d.leads.find((x) => x.id === origenId); if (!b) return;
    const ma = mensajesDe(a.id); const ya = new Set(ma.map((m) => m.k)); const todos = [...ma, ...mensajesDe(b.id).filter((m) => !ya.has(m.k))].sort((x, y) => x.fecha.localeCompare(y.fecha));
    guardarMsgs(a.id, todos); a.mensajes = todos.length; const u = todos.at(-1); a.ultimo = u ? { fecha: u.fecha, de: u.de === 'cliente' ? 'cliente' : 'broker', texto: resumenMsg(u) } : a.ultimo;
    for (const k of ['nombre', 'telefono', 'email', 'rut', 'perfil', 'resumen', 'corredorId']) if (!a[k] && b[k]) a[k] = b[k];
    a.canales = [...(a.canales || []), ...(b.canales || []).filter((c) => !(a.canales || []).some((x) => x.conv === c.conv))];
    a.ig ||= b.ig; a.links = [...new Set([...(a.links || []), ...(b.links || [])])].slice(0, 40); a.propiedades = [...new Set([...(a.propiedades || []), ...(b.propiedades || [])])];
    a.historial = [...(a.historial || []), ...(b.historial || [])].sort((x, y) => x.fecha.localeCompare(y.fecha)).slice(-200);
    a.noLeidos = (a.noLeidos || 0) + (b.noLeidos || 0); if (b.wa) { a.wa = true; a.atiende ||= b.atiende; }
    for (const k of Object.keys(d.wcIdx || {})) if (d.wcIdx[k] === b.id) d.wcIdx[k] = a.id;
    evento(a, `Se unió con la conversación de ${b.nombre || b.chatCon || 'otro contacto'} (era la misma persona)`, 'canal');
    // la persona que se creó solo por el lead duplicado se quita (si no está vinculada a nada)
    if (b.personaId && b.personaId !== a.personaId && inmo?.personaPorId) { try { const p = inmo.personaPorId(b.personaId); if (p && p.leadId === b.id) { if (!a.personaId) a.personaId = p.id, p.leadId = a.id; else inmo.borrarPersona(p.id).catch(() => {}); } } catch {} }
    d.leads.splice(d.leads.indexOf(b), 1); try { fs.rmSync(fMsgs(b.id), { force: true }); const mb = path.join(base(), b.id); if (fs.existsSync(mb)) { for (const f of fs.readdirSync(mb)) fs.renameSync(path.join(mb, f), path.join(dMedia(a.id), f)); fs.rmSync(mb, { recursive: true, force: true }); } } catch {}
    a.actualizado = now(); sync(a); save();
  }
  // leads duplicados de antes de 0.16.24 (mismos mensajes de wechatia en dos leads): se fusionan
  function repararDuplicados() {
    const d = db(); const idx = (d.wcIdx = {}); let n = 0; // el índice se rehace desde los mensajes
    for (const l of [...d.leads].sort(antes)) {
      if (!d.leads.includes(l)) continue;
      for (const m of mensajesDe(l.id)) { if (!/^wc/.test(m.k || '')) continue; const otro = idx[m.k]; if (otro && otro !== l.id && d.leads.some((x) => x.id === otro)) { const [a, b] = [d.leads.find((x) => x.id === otro), l].sort(antes); fusionar(a.id, b.id); n++; break; } idx[m.k] = l.id; }
    }
    save(); if (n) emit({ type: 'datos', que: 'leads' }); return n;
  }
  function consentir(c) { const d = db(); d.consentimientos = [...(d.consentimientos || []), { fecha: now(), ...c }].slice(-100); save(); }
  const consentimientos = () => (db().consentimientos || []).slice().reverse();
  const resumenMsg = (m) => (m.texto ? m.texto.slice(0, 140) : m.tipo === 'audio' ? '🎤 Audio' + (m.transcripcion ? ': ' + m.transcripcion.slice(0, 100) : '') : m.tipo === 'imagen' ? '📷 Foto' : m.tipo === 'video' ? '🎬 Video' : m.tipo === 'omitido' ? '(archivo no incluido)' : '📎 ' + (m.archivo || 'Archivo'));

  // propiedades de la cartera que aparecen en la conversación (por link publicado o por código)
  function vincularPropiedades(l) {
    try {
      const todas = inmo.todas(); const txt = mensajesDe(l.id).map((m) => m.texto).join('\n'); const ids = new Set(l.propiedades || []);
      for (const p of todas) {
        const urls = Object.values(p.portales || {}).flatMap((x) => Object.values(x || {}).map((a) => a?.permalink || a?.url)).filter(Boolean);
        if (urls.some((u) => txt.includes(u)) || (p.codigo && new RegExp(`\\b${p.codigo}\\b`, 'i').test(txt))) ids.add(p.id);
      }
      for (const id of ids) if (!(l.propiedades || []).includes(id)) { try { inmo.registrar(id, `Lead por WhatsApp: ${l.nombre || l.telefono || 'contacto'} preguntó por esta propiedad`, { tipo: 'lead', ref2: l.id }); } catch {} }
      l.propiedades = [...ids]; inmo.guardar?.();
    } catch {}
  }

  // IA: búsqueda, resumen, estado y próxima acción, a partir de la conversación
  const SISTEMA = `Eres el asistente de una corredora de propiedades en Chile. Lees la conversación (WhatsApp, Instagram o correo) entre un broker y un cliente (lead) y devuelves SOLO un JSON:
{"resumen": "1 o 2 frases: qué busca y en qué quedaron", "busqueda": {"operacion": "arriendo"|"venta"|null, "tipo": "departamento"|"casa"|"oficina"|"local_comercial"|"parcela"|"terreno_construccion"|"bodega"|"estacionamiento"|null, "comunas": [..], "presupuesto": {"valor": número, "moneda": "CLP"|"UF"} o null, "dormitorios": número o null, "banos": número o null, "estacionamiento": true|false|null, "mascotas": true|false|null, "plazo": "cuándo lo necesita" o null, "otros": ["requisitos cortos"]},
 "email": string o null, "rut": string o null, "telefono": "celular que el cliente haya dado" o null, "perfil": "quién es: para quién busca, familia o socios, trabajo o giro, motivo y urgencia, forma de pago (contado, crédito, subsidio), lo que se sepa; 1 a 3 frases" o null, "estadoSugerido": "nuevo"|"contactado"|"visita"|"negociando"|"ganado"|"perdido", "proximaAccion": {"texto": "acción concreta para el broker", "fecha": "YYYY-MM-DD" o null}}
Reglas: «lucas» = miles de pesos (290 lucas = 290000 CLP). Usa solo lo que dice la conversación; si no se dijo, null. Si el cliente cambió de idea, usa lo último. «visita» si quedaron de ir a ver una propiedad; «perdido» si dijo que ya no busca o encontró otra.`;
  async function analizarConIA(id) {
    const l = lead(id); try { await traerMensajes(id); } catch {} const ms = mensajesDe(id);
    const lineas = ms.map((m) => `[${m.fecha.slice(8, 10)}/${m.fecha.slice(5, 7)} ${m.fecha.slice(11, 16)}] ${m.de === 'cliente' ? 'Cliente' : 'Broker'}: ${(m.texto || (m.transcripcion ? '(audio) ' + m.transcripcion : '(' + m.tipo + ')')).replace(/\s*\n\s*/g, ' ')}`);
    let conv = lineas.join('\n'); if (conv.length > 14000) conv = '…\n' + conv.slice(-14000);
    const r = await ai.chat({ system: SISTEMA, messages: [{ role: 'user', content: `EXTRAER_LEAD\nHoy: ${now().slice(0, 10)}\nCONVERSACION:\n${conv}` }], json: true, action: 'lead' });
    let j = null; try { j = JSON.parse(String(r.text).replace(/^```(json)?|```$/g, '').trim()); } catch {}
    if (!j || typeof j !== 'object') throw err('No pude leer la conversación con IA. Intenta de nuevo.');
    const b = j.busqueda || {}; const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    l.busqueda = { operacion: ['arriendo', 'venta'].includes(b.operacion) ? b.operacion : null, tipo: b.tipo || null, comunas: (Array.isArray(b.comunas) ? b.comunas : []).map(String).filter(Boolean).slice(0, 8),
      presupuesto: b.presupuesto && num(b.presupuesto.valor) ? { valor: num(b.presupuesto.valor), moneda: b.presupuesto.moneda === 'UF' ? 'UF' : 'CLP' } : null,
      dormitorios: num(b.dormitorios), banos: num(b.banos), estacionamiento: typeof b.estacionamiento === 'boolean' ? b.estacionamiento : null, mascotas: typeof b.mascotas === 'boolean' ? b.mascotas : null,
      plazo: b.plazo ? String(b.plazo).slice(0, 80) : null, otros: (Array.isArray(b.otros) ? b.otros : []).map(String).slice(0, 8) };
    l.resumen = String(j.resumen || '').slice(0, 400);
    if (j.email && !l.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(j.email)) l.email = j.email;
    if (j.rut && !l.rut) l.rut = String(j.rut).slice(0, 14);
    if (j.telefono && !l.telefono && esTelefono(j.telefono)) l.telefono = String(j.telefono).trim().slice(0, 20);
    if (j.perfil) l.perfil = String(j.perfil).slice(0, 500);
    sync(l);
    const est = ESTADOS.map((e) => e[0]); if (l.estado === 'nuevo' && est.includes(j.estadoSugerido) && j.estadoSugerido !== 'nuevo') l.estado = j.estadoSugerido;
    if (j.proximaAccion?.texto && !l.proximaAccion?.manual) l.proximaAccion = { texto: String(j.proximaAccion.texto).slice(0, 160), fecha: /^\d{4}-\d{2}-\d{2}$/.test(j.proximaAccion.fecha || '') ? j.proximaAccion.fecha : null };
    l.analizado = now(); l.actualizado = now(); save(); emit({ type: 'datos', que: 'leads' });
    return { ok: true, tokens: r.tokens };
  }

  // ---------- lectura y edición ----------
  const vista = (l) => ({ ...l, corredor: corredorDe(l), estadoTxt: (ESTADOS.find((e) => e[0] === l.estado) || [])[1] || l.estado, origenTxt: ORIGENES[l.origen] || l.origen,
    vencida: !!(l.proximaAccion?.fecha && l.proximaAccion.fecha < now().slice(0, 10) && !['ganado', 'perdido'].includes(l.estado)),
    sinRespuesta: !!(l.ultimo?.de === 'cliente' && !['ganado', 'perdido'].includes(l.estado) && Date.now() - new Date(l.ultimo.fecha).getTime() > 24 * 36e5) });
  function listar({ estado, origen, q, broker: br, soloDe } = {}) {
    const t = norm(q); const todos = db().leads.map(vista).filter((x) => soloDe === undefined || x.corredorId === soloDe);
    const l = todos.filter((x) => (!estado || (estado === 'abiertos' ? !['ganado', 'perdido'].includes(x.estado) : estado === 'seguimiento' ? x.vencida || x.sinRespuesta : x.estado === estado))
      && (!origen || x.origen === origen) && (!br || (br === '_sin' ? !x.corredorId : x.corredorId === br || x.broker === br))
      && (!t || norm([x.nombre, x.chatCon, x.telefono, x.email, x.resumen, x.perfil, x.ig?.usuario, (x.busqueda?.comunas || []).join(' '), x.ultimo?.texto].join(' ')).includes(t)));
    l.sort((a, b) => String(b.ultimo?.fecha || b.actualizado).localeCompare(String(a.ultimo?.fecha || a.actualizado)));
    const cuenta = Object.fromEntries(ESTADOS.map(([k]) => [k, 0])); for (const x of todos) cuenta[x.estado] = (cuenta[x.estado] || 0) + 1;
    const semana = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    return { leads: l, cuenta, estados: ESTADOS, origenes: ORIGENES, brokers: [...new Set(todos.map((x) => x.broker).filter(Boolean))], corredores: corredores().map((c) => ({ id: c.id, nombre: c.nombre })), sinCorredor: todos.filter((x) => !x.corredorId && !['ganado', 'perdido'].includes(x.estado)).length,
      kpis: { nuevos: cuenta.nuevo, seguimiento: todos.filter((x) => x.vencida || x.sinRespuesta).length, visitas: todos.filter((x) => x.estado === 'visita' && (!x.proximaAccion?.fecha || x.proximaAccion.fecha <= semana)).length, abiertos: todos.filter((x) => !['ganado', 'perdido'].includes(x.estado)).length } };
  }
  function obtener(id, { marcarLeido = true } = {}) {
    const l = lead(id); if (marcarLeido && l.noLeidos) { l.noLeidos = 0; save(); }
    const props = inmo ? (l.propiedades || []).map((pid) => { try { const p = inmo.todas().find((x) => x.id === pid); return p ? { id: p.id, codigo: p.codigo, titulo: p.titulo, comuna: p.comuna, foto: (p.fotos || [])[0] || null } : null; } catch { return null; } }).filter(Boolean) : [];
    return { ...vista(l), propiedadesInfo: props, mensajesLista: mensajesDe(id).map((m) => ({ ...m, url: m.media && fs.existsSync(path.join(base(), id, m.media)) ? `pffoto://l/${encodeURIComponent(id)}/${encodeURIComponent(m.media)}` : m.mediaUrl || null })) };
  }
  function actualizar(id, c = {}) {
    const l = lead(id); const antes = l.estado;
    if (c.estado !== undefined) { if (!ESTADOS.some((e) => e[0] === c.estado)) throw err('Estado no válido.'); l.estado = c.estado; if (c.estado === 'perdido') l.motivoPerdida = String(c.motivo || l.motivoPerdida || '').slice(0, 200); }
    for (const k of ['nombre', 'telefono', 'email', 'rut', 'notas', 'broker']) if (c[k] !== undefined) l[k] = String(c[k] || '').trim().slice(0, k === 'notas' ? 2000 : 120);
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email)) throw err('El correo no es válido.');
    if (c.busqueda) l.busqueda = { ...(l.busqueda || {}), ...c.busqueda };
    if (c.proximaAccion !== undefined) l.proximaAccion = c.proximaAccion && c.proximaAccion.texto ? { texto: String(c.proximaAccion.texto).slice(0, 160), fecha: c.proximaAccion.fecha || null, manual: true } : null;
    if (c.personaId !== undefined) l.personaId = c.personaId || null;
    if (c.propiedades) l.propiedades = [...new Set(c.propiedades)];
    if (['nombre', 'telefono', 'email', 'rut'].some((k) => c[k] !== undefined)) sync(l);
    l.actualizado = now(); save(); emit({ type: 'datos', que: 'leads' });
    if (inmo && c.estado && c.estado !== antes) for (const pid of l.propiedades || []) { try { inmo.registrar(pid, `Lead ${l.nombre || l.telefono}: ${vista(l).estadoTxt}`, { tipo: 'lead', ref2: l.id }); } catch {} }
    if (inmo && c.estado && c.estado !== antes) inmo.guardar?.();
    return vista(l);
  }
  function borrar(id) {
    const d = db(); const i = d.leads.findIndex((x) => x.id === id); if (i < 0) return false; d.leads.splice(i, 1); save();
    try { fs.rmSync(fMsgs(id), { force: true }); fs.rmSync(path.join(base(), id), { recursive: true, force: true }); } catch {}
    emit({ type: 'datos', que: 'leads' }); return true;
  }
  // 0.16.9 · WhatsApp en vivo: lo que conversan Fernanda (asistente) o el corredor con el lead por el número de la empresa
  // queda en su conversación. «atiende» = 'agente' (Fernanda responde) o 'corredor' (el corredor tomó la conversación).
  const fechaLocal = (d = new Date()) => { const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; };
  function porTelefono(telefono) { const t = dig(telefono).slice(-9); return t.length >= 8 ? db().leads.find((l) => dig(l.telefono).slice(-9) === t) || null : null; }
  function registrarWa(idOTel, { de, texto, autor = '', fallido = null }) {
    const l = db().leads.find((x) => x.id === idOTel) || porTelefono(idOTel); if (!l || !String(texto || '').trim()) return null;
    const m = { fecha: fechaLocal(), autor: autor || (de === 'cliente' ? (l.nombre || l.chatCon || l.telefono) : de === 'agente' ? 'Fernanda (asistente)' : broker().nombre || 'Tú'), texto: String(texto).slice(0, 4000), tipo: 'texto', de, wa: true, ...(fallido ? { fallido: String(fallido).slice(0, 300) } : {}) };
    m.k = clave(m); const todos = [...mensajesDe(l.id), m];
    guardarMsgs(l.id, todos);
    l.mensajes = todos.length; l.ultimo = { fecha: m.fecha, de: de === 'cliente' ? 'cliente' : 'broker', texto: resumenMsg(m) }; l.wa = true; l.atiende ||= 'agente';
    if (de === 'cliente') l.noLeidos = (l.noLeidos || 0) + 1;
    l.actualizado = now(); save(); emit({ type: 'datos', que: 'leads', id: l.id });
    return l.id;
  }
  // un contacto nuevo al que Asset (Fernanda) le escribió por WhatsApp: queda como lead para seguir la conversación
  function crearDesdeWa({ nombre = '', telefono, personaId = null, origen = 'whatsapp' }) {
    const ya = porTelefono(telefono); if (ya) return ya;
    if (dig(telefono).length < 8) throw err('El celular no es válido.');
    const l = { id: uid(), nombre: String(nombre || '').trim(), chatCon: String(nombre || telefono).trim(), telefono: String(telefono).trim(), email: '', rut: '', origen: ORIGENES[origen] ? origen : Object.keys(ORIGENES)[0], broker: broker().nombre || '', estado: 'nuevo', busqueda: {}, resumen: '', propiedades: [], links: [],
      proximaAccion: null, personaId, notas: '', creado: now(), actualizado: now(), mensajes: 0, ultimo: null, noLeidos: 0, importaciones: [], wa: true, atiende: 'agente' };
    db().leads.unshift(l); evento(l, 'Llegó por WhatsApp de la empresa', 'canal'); sync(l); save(); emit({ type: 'datos', que: 'leads', id: l.id }); return l;
  }
  function atencion(id, quien) { const l = lead(id); if (!['agente', 'corredor'].includes(quien)) throw err('Valor no válido.'); l.atiende = quien; l.wa = true; l.actualizado = now(); save(); emit({ type: 'datos', que: 'leads', id }); return vista(l); }
  const mediaDir = () => base();
  // 0.16.18 · WhatsApp rechazó un mensaje que ya figuraba como enviado: queda marcado «No entregado»
  function marcarFallido(telefono, texto, motivo = '') { const l = porTelefono(telefono); if (!l) return false; const ms = mensajesDe(l.id); const t = String(texto || '').trim().slice(0, 200);
    const m = [...ms].reverse().find((x) => x.de !== 'cliente' && String(x.texto || '').trim().slice(0, 200) === t && !x.fallido); if (!m) return false;
    m.fallido = String(motivo || 'WhatsApp no lo entregó').slice(0, 300); guardarMsgs(l.id, ms); emit({ type: 'datos', que: 'leads', id: l.id }); return true; }
  // ¿la persona escribió en las últimas 24 h? (lo que Asset tiene registrado de la conversación)
  function escribioEn24(telefono) { const l = porTelefono(telefono); if (!l) return false; const lim = Date.now() - 24 * 36e5;
    return mensajesDe(l.id).some((m) => m.de === 'cliente' && new Date(String(m.fecha).replace(' ', 'T')).getTime() > lim); }
  return { traerMensajes, subirLocales, fusionar, repararDuplicados, asignar, registrarEvento, sincronizarTodos, registrarCanal, consentir, analizarInstagram, importarInstagram, consentimientos, marcarFallido, escribioEn24, porTelefono, registrarWa, atencion, crearDesdeWa, analizar, importar, analizarConIA, listar, obtener, actualizar, borrar, mediaDir, ESTADOS, ORIGENES, _db: db };
}

module.exports = { crear, parsear, leerExportacion, nombreDelChat, ESTADOS };
