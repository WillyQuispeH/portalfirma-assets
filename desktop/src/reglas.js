// Aprendizaje de reglas para detectar materias (trámites notariales).
//   1. Casos: cada vez que el cliente corrige la detección (cambia la materia, descarta un acto oculto o
//      agrega uno que faltaba) se guarda un caso, con los datos personales tachados (RUT, correos, teléfonos).
//   2. Propuestas: la IA revisa los casos en lote y propone reglas (expresiones regulares). Cada propuesta
//      se valida aquí: debe compilar y se prueba contra todos los casos guardados.
//   3. Aprobación: una persona de Portalfirma aprueba o descarta. Las aprobadas se ejecutan sin IA.
//   4. Publicación: las reglas aprobadas son de toda la plataforma.
// Con la cuenta de Asset todo vive en la API de Asset (/v1/reglas-notariales): cada corredora manda sus casos ya
// tachados y ve solo los suyos; las reglas aprobadas las leen todas; proponer, aprobar, activar y eliminar es del
// revisor de la plataforma (PLATAFORMA_REVISORES), que ve los casos de todas sin saber de quién son. Lo que este
// equipo tenía (casos.json y, si es revisor, sus reglas) se sube una vez al iniciar sesión.
// En modo de prueba (PF_MOCK) o sin sesión sigue todo en este computador, como antes.
// Rutas de la API pendientes:
//   GET  /notarial/reglas         → { version, actos: [...], materias: [...], excepciones: [...] }
//   POST /notarial/reglas/casos   { caso } → { ok }        (los casos de todos los clientes llegan a Portalfirma)
//   POST /notarial/reglas         { version, actos, materias, excepciones } → { ok }   (solo administradores)
const fs = require('fs'); const path = require('path');
const store = require('./store');
const API_LISTA = process.env.PF_NOTARIAL_API === '1';
const MAX_CASOS = 500;
const file = () => path.join(require('electron').app.getPath('userData'), 'reglas', 'casos.json');
let inmoMod = null; const inmo = () => (inmoMod ||= require('./inmo'));
const enApi = () => { try { return !!(inmo().API && inmo().usuario()); } catch { return false; } };
const asset = () => require('./asset');
/** los casos: de la corredora (o de todas, para el revisor) con la cuenta de Asset; si no, los de este equipo */
const casos = async () => (enApi() ? asset().llamar('GET', '/reglas-notariales/casos') : leer());

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
// Datos personales fuera: los casos solo sirven por su redacción, no por quién firma.
function tachar(s) {
  return String(s || '')
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK]\b/g, '[RUT]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[CORREO]')
    .replace(/(?:\+?56\s*)?(?:\(?\d\)?[\s-]*)?\d{4}[\s-]?\d{4}\b/g, '[TELÉFONO]');
}

function leer() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return []; } }
function escribir(l) { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(l, null, 1)); }

// Un caso por documento: si el cliente vuelve a enviar el mismo, se reemplaza.
async function agregarCaso(pfapi, c) {
  const texto = tachar(String(c.texto || '').slice(0, 6000));
  const caso = {
    id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), clave: String(c.clave || ''), creado: new Date().toISOString(),
    tramite: c.tramite, titulo: tachar(c.titulo || ''), materiaAuto: c.materiaAuto || null, materiaFinal: c.materiaFinal || null,
    confianza: c.confianza || null,
    descartados: (c.descartados || []).map((x) => ({ codigo: x.codigo || null, nombre: x.nombre, cita: tachar(x.cita || '') })),
    agregados: (c.agregados || []).map((x) => ({ codigo: x.codigo || null, nombre: x.nombre, frase: tachar(x.frase || '') })),
    texto,
  };
  if (enApi()) { await asset().llamar('POST', '/reglas-notariales/casos', { items: [caso] }); return { id: caso.id }; }
  const l = leer().filter((x) => !caso.clave || x.clave !== caso.clave);
  escribir([caso, ...l].slice(0, MAX_CASOS));
  if (API_LISTA) { try { await pfapi.call('POST', '/notarial/reglas/casos', { caso }); } catch {} }
  return { id: caso.id };
}
const listarCasos = () => casos();
async function borrarCaso(id) {
  if (enApi()) { await asset().llamar('DELETE', `/reglas-notariales/casos/${encodeURIComponent(id)}`); return true; }
  escribir(leer().filter((x) => x.id !== id)); return true;
}

// ---------------------------------------------------------------- reglas
const vacio = () => ({ version: null, actos: [], materias: [], excepciones: [], propuestas: [] });
const local = () => ({ ...vacio(), ...(store.get('reglasNotariales') || {}) });
const guardarLocal = (r) => { store.set('reglasNotariales', r); return r; };
// con la cuenta de Asset: las reglas de la plataforma (completas para el revisor; si no, solo las aprobadas). Quedan
// copiadas en este equipo para cuando no haya conexión.
async function remoto() { const r = await asset().llamar('GET', '/reglas-notariales'); guardarLocal(r); return { ...vacio(), ...r }; }
const cargar = async () => (enApi() ? remoto() : local());
async function guardarR(R) {
  if (!enApi()) return guardarLocal(R);
  const { docVersion, ...reglas } = R;
  try { return guardarLocal(await asset().llamar('PUT', '/reglas-notariales', { version: docVersion || 0, reglas })); }
  catch (e) { if (e.status === 409) throw new Error('Otra persona cambió las reglas recién: vuelve a abrir esta pantalla.'); throw e; }
}
async function obtener(pfapi) {
  if (enApi()) { try { return await remoto(); } catch { return local(); } }
  const r = local();
  if (API_LISTA) {
    try { const s = await pfapi.call('GET', '/notarial/reglas'); if (s && (s.actos || s.materias)) { Object.assign(r, { version: s.version, actos: s.actos || [], materias: s.materias || [], excepciones: s.excepciones || [] }); guardarLocal(r); } } catch {}
  }
  return r;
}

function compilar(src) {
  if (!src || String(src).length > 400) return { error: 'Expresión vacía o demasiado larga.' };
  try { const re = new RegExp(String(src)); if (re.test('')) return { error: 'La expresión coincide con un texto vacío.' }; if (re.test('a b c d e f g h i j')) return { error: 'La expresión es demasiado general.' }; return { re }; } catch (e) { return { error: 'No compila: ' + e.message }; }
}
// Prueba una regla contra los casos guardados.
//   positivos: casos donde el cliente dijo que la regla debía actuar (agregó ese acto / eligió esa materia / descartó ese acto)
//   aciertos: positivos donde la regla coincide · otros: casos no positivos donde también coincide (posibles falsos positivos)
function evaluar(r, casos = leer()) {
  const c = compilar(r.patron); if (c.error) return { error: c.error };
  const iguala = (a, b) => a && b && fold(a) === fold(b);
  const pos = (k) => r.tipo === 'acto' ? (k.agregados || []).some((a) => iguala(a.codigo, r.codigo) || iguala(a.nombre, r.nombre))
    : r.tipo === 'materia' ? k.materiaFinal === r.materia && k.materiaAuto !== r.materia
      : (k.descartados || []).some((a) => iguala(a.codigo, r.acto) || iguala(a.nombre, r.acto));
  const campo = (k) => r.tipo === 'materia' ? fold(r.campo === 'cuerpo' ? String(k.texto).slice(0, 1500) : k.titulo)
    : r.tipo === 'excepcion' ? fold((k.descartados || []).filter((a) => iguala(a.codigo, r.acto) || iguala(a.nombre, r.acto)).map((a) => a.cita).join(' ')) : fold(k.texto);
  const out = { positivos: 0, aciertos: [], otros: [], total: casos.length };
  for (const k of casos) {
    const p = pos(k); const hit = c.re.test(campo(k)); if (p) out.positivos++;
    if (hit && p) out.aciertos.push(k.id); else if (hit) out.otros.push(k.id);
  }
  return out;
}
const limpiar = (p) => ({
  tipo: ['acto', 'materia', 'excepcion'].includes(p.tipo) ? p.tipo : 'acto', nombre: String(p.nombre || p.acto || p.materia || '').slice(0, 80), codigo: p.codigo || null,
  materia: p.materia || null, acto: p.acto || null, campo: p.campo === 'cuerpo' ? 'cuerpo' : 'titulo', patron: String(p.patron || ''), incluido: p.incluido || null,
  principal: !!p.principal, explicacion: String(p.explicacion || '').slice(0, 300), casos: Array.isArray(p.casos) ? p.casos.slice(0, 50) : [],
});

async function proponer({ actos, materias }) {
  const lista = await casos(); if (!lista.length) { const e = new Error('Todavía no hay casos corregidos para analizar.'); e.code = 'SIN_CASOS'; throw e; }
  const ai = require('./ai');
  const muestra = lista.slice(0, 80).map((k) => ({ id: k.id, tramite: k.tramite, titulo: k.titulo, materiaAuto: k.materiaAuto, materiaFinal: k.materiaFinal, descartados: k.descartados, agregados: k.agregados, extracto: String(k.texto).slice(0, 1800) }));
  const r = await ai.proponerReglas({ casos: muestra, actos, materias });
  const R = await cargar(); const nuevas = [];
  for (const p0 of r.propuestas) {
    const p = limpiar(p0); const ev = evaluar(p, lista);
    nuevas.push({ ...p, id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), estado: ev.error ? 'invalida' : 'propuesta', prueba: ev, creado: new Date().toISOString() });
  }
  R.propuestas = [...nuevas, ...R.propuestas.filter((x) => x.estado === 'propuesta')].slice(0, 100);
  await guardarR(R);
  return { propuestas: nuevas, uso: r._uso };
}

async function probar(p) { return evaluar(limpiar(p), await casos()); }

// Aprobar: pasa a reglas activas (con el patrón que dejó la persona) · descartar: se elimina la propuesta.
async function decidir({ id, accion, patron }) {
  const R = await cargar(); const p = R.propuestas.find((x) => x.id === id); if (!p) throw new Error('La propuesta ya no existe.');
  R.propuestas = R.propuestas.filter((x) => x.id !== id);
  if (accion === 'aprobar') {
    const q = { ...p, patron: patron != null ? String(patron) : p.patron }; const ev = evaluar(q, await casos()); if (ev.error) throw new Error(ev.error);
    const regla = { id: 'r' + Date.now().toString(36), activo: true, aprobada: new Date().toISOString(), patron: q.patron, explicacion: q.explicacion, prueba: ev };
    if (q.tipo === 'acto') R.actos.push({ ...regla, nombre: q.nombre, codigo: q.codigo, incluido: q.incluido, principal: q.principal });
    else if (q.tipo === 'materia') R.materias.push({ ...regla, materia: q.materia, campo: q.campo });
    else R.excepciones.push({ ...regla, acto: q.acto });
    R.version = new Date().toISOString().slice(0, 10) + (enApi() ? '' : '-local');
  }
  return guardarR(R);
}
async function activar({ id, activo }) {
  const R = await cargar(); for (const k of ['actos', 'materias', 'excepciones']) R[k].forEach((x) => { if (x.id === id) x.activo = !!activo; });
  return guardarR(R);
}
async function eliminar(id) { const R = await cargar(); for (const k of ['actos', 'materias', 'excepciones']) R[k] = R[k].filter((x) => x.id !== id); return guardarR(R); }
const permisos = async () => (enApi() ? asset().llamar('GET', '/reglas-notariales/permisos') : { revisor: true });
// lo que este equipo tenía: los casos se suben (de a 50); si quien entra es revisor, también sus reglas aprobadas
try {
  inmo().alCargar(async () => {
    if (!enApi()) return null;
    let n = 0;
    if (fs.existsSync(file())) {
      const l = leer();
      for (let i = 0; i < l.length; i += 50) n += (await asset().llamar('POST', '/reglas-notariales/casos', { items: l.slice(i, i + 50) })).guardados || 0;
      fs.renameSync(file(), file().replace(/\.json$/, '.subidos.json'));
    }
    const loc = local();
    if (!store.get('reglasSubidas') && ['actos', 'materias', 'excepciones'].some((k) => loc[k].length) && (await permisos()).revisor) {
      const R = await remoto(); const ids = new Set(['actos', 'materias', 'excepciones'].flatMap((k) => R[k].map((x) => x.id)));
      for (const k of ['actos', 'materias', 'excepciones']) R[k].push(...loc[k].filter((x) => !ids.has(x.id)));
      await guardarR(R); store.set('reglasSubidas', new Date().toISOString());
    }
    return n ? `Se ${n === 1 ? 'subió 1 caso' : `subieron ${n} casos`} de reglas notariales que estaban solo en este computador.` : null;
  });
} catch {}
// Lo que Portalfirma publica a todas las apps
async function exportar() { const R = await cargar(); const strip = (x) => { const { prueba, ...y } = x; return y; }; return { version: R.version, actos: R.actos.map(strip), materias: R.materias.map(strip), excepciones: R.excepciones.map(strip) }; }

module.exports = { agregarCaso, listarCasos, borrarCaso, obtener, proponer, probar, decidir, activar, eliminar, exportar, permisos, _tachar: tachar, _evaluar: evaluar };
