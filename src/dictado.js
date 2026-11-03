// Dictar una propiedad (0.12): el broker graba un audio (o pega texto) durante la captación; Asset lo transcribe,
// llena la ficha, avisa qué falta y qué le pareció dudoso, y acepta correcciones dictadas («no, son 92 metros»).
// La propiedad se crea solo cuando el broker confirma el resumen.
const TIPOS = ['casa', 'departamento', 'oficina', 'sitio', 'local_comercial', 'industrial', 'agricola', 'parcela', 'estacionamiento', 'terreno_construccion', 'bodega'];
const err = (m) => new Error(m);
const FC = require('./ficha-campos');
const num = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : null; };
const precio = (p) => { if (!p || typeof p !== 'object') return null; const v = num(p.valor); if (v == null || v <= 0) return null; const m = ['UF', 'CLP', 'USD'].includes(String(p.moneda).toUpperCase()) ? String(p.moneda).toUpperCase() : v < 50000 ? 'UF' : 'CLP'; return { valor: v, moneda: m }; };

// Estilo base de la descripción del aviso (punto de partida; se puede ajustar por empresa con config.estiloDescripcion)
const ESTILO = `redacción profesional de corredora de propiedades, en tercera persona, tono sobrio y cálido, español neutro de Chile.
2 o 3 párrafos breves: (1) qué es y dónde está en términos generales (tipo, comuna o sector, superficie); (2) distribución y terminaciones (dormitorios, baños, cocina, pisos, orientación, luz); (3) equipamiento, espacios comunes y entorno, solo si se mencionaron.
NO incluyas precios, montos, gastos comunes, número de la dirección ni depto, datos del propietario ni condiciones del negocio: eso va en sus campos.
Sin jerga ni coloquialismos (nada de «lucas», «depto», «bacán»), sin signos de exclamación, sin emojis, sin superlativos exagerados. No inventes nada que no se haya dicho.`;
const SISTEMA0 = `Eres el asistente de un corredor de propiedades en Chile. El corredor dicta (a veces mal o desordenado) los datos de una propiedad que está captando.
Devuelve SOLO un JSON con esta forma (usa null si no lo dijo; no inventes nada):
{"tipo": uno de ${TIPOS.join('|')} o null, "venta": true|false|null, "arriendo": true|false|null,
 "precioVenta": {"valor": número, "moneda": "UF"|"CLP"|"USD"} o null, "precioArriendo": {"valor": número, "moneda": "UF"|"CLP"|"USD"} o null,
 "direccion": "calle y número" o null, "unidad": "depto/casa/oficina, ej. 26B" o null, "comuna": string o null, "region": string o null,
 "dormitorios": número o null, "banos": número o null, "estacionamientos": número o null, "bodegas": número o null,
 "supUtil": m² útiles o null, "supTotal": m² totales o null, "gastosComunes": pesos o null, "amoblado": true|false|null, "rol": string o null,
 "piso": número o null, "antiguedad": años o null, "orientacion": string o null, "caracteristicas": ["frases cortas: piscina, piso flotante, cocina amplia…"],
 "ficha": {solo los datos de la LISTA DE FICHA que se mencionaron, con su id: número, true/false o el texto de la opción más parecida; lo que tiene la propiedad (piscina, quincho, porcelanato, conserje…) va como true en su id; si dice que NO tiene algo, false},
 "titulo": "título del aviso (máx. 60 caracteres), ej.: Departamento 3D2B en Lo Barnechea", "descripcion": "descripción profesional para el aviso (ver ESTILO)",
 "dudas": ["contradicciones o datos poco claros, en una frase cada una"]}
Reglas: «lucas» o «mil» = miles de pesos (850 lucas = 850000 CLP). Montos chicos con UF son UF. Si el corredor se corrige («cuatro dormitorios… no, tres»), usa lo último y anótalo en dudas.
«Arriendo»/«se arrienda» → arriendo true; «venta»/«se vende» → venta true. Números dichos en palabras pásalos a cifras.
ESTILO de la descripción: \${ESTILO}
IMPORTANTE: en departamentos, oficinas, locales, bodegas y estacionamientos el número de la unidad («depto 504», «oficina 1203») va en "unidad", nunca dentro de "direccion".
LISTA DE FICHA (id: dato [opciones]):
${FC.guiaIA()}`;

const SISTEMA = SISTEMA0;
// red de seguridad: frases de la descripción que hablan de plata o usan jerga se quitan aunque la IA las escriba
const PLATA = /\$\s?\d|\d\s?(lucas|mil pesos|millones)|\blucas\b|\bUF\s?\d|\d\s?UF\b|gastos? comunes|precio|valor de (arriendo|venta)|canon|arriendo de \d|se vende en \d/i;
function limpiarDescripcion(t) {
  const frase = (f) => { if (!PLATA.test(f)) return f; const fin = /[.!?]$/.test(f) ? f.slice(-1) : ''; const partes = f.replace(/[.!?]$/, '').split(/,\s*|\s+y\s+(?=(?:por|a|con|en)\s)/).filter((c) => !PLATA.test(c));
    const r = partes.join(', ').trim(); return r && r.split(/\s+/).length >= 4 ? r + (fin || '.') : ''; };
  const ps = String(t || '').split(/\n+/).map((p) => p.split(/(?<=[.!?])\s+/).map(frase).filter(Boolean).join(' ').trim()).filter(Boolean);
  return ps.join('\n\n').replace(/\bdepto\.?\b/gi, 'departamento').replace(/!+/g, '.').trim();
}
function crear({ ai, estilo = () => '' }) {
  // qué falta para que la ficha quede lista para publicar
  function faltan(o) {
    // 0.16.14 · lo CLAVE de los bloques «esencial» y «portales» según el tipo (ej. el N° de depto en un departamento)
    const pseudo = { ...o, ficha: o.ficha || {}, vinculos: [] };
    const av = FC.avance(pseudo); const clave = [...av[0].faltanClave, ...av[1].faltanClave].filter((t) => !/propietario/i.test(t));
    if (clave.length || o.tipo) return clave.map((t) => ({ id: (FC.CAMPOS.find((c) => c.t === t) || {}).id || t, t }));
    const f = [];
    if (!o.tipo) f.push(['tipo', 'Tipo de propiedad']);
    if (!o.venta && !o.arriendo) f.push(['operacion', 'Si es venta o arriendo']);
    if (o.venta && !o.precioVenta) f.push(['precioVenta', 'Precio de venta']);
    if (o.arriendo && !o.precioArriendo) f.push(['precioArriendo', 'Precio de arriendo']);
    if (!o.direccion) f.push(['direccion', 'Dirección']);
    if (!o.comuna) f.push(['comuna', 'Comuna']);
    if (['casa', 'departamento'].includes(o.tipo) || !o.tipo) { if (o.dormitorios == null) f.push(['dormitorios', 'Dormitorios']); if (o.banos == null) f.push(['banos', 'Baños']); }
    if (o.supUtil == null && o.supTotal == null) f.push(['supUtil', 'Metros cuadrados']);
    return f.map(([id, t]) => ({ id, t }));
  }
  // normaliza lo que devuelve la IA a los campos de la ficha
  function normalizar(j) {
    const o = {};
    o.tipo = TIPOS.includes(j.tipo) ? j.tipo : null;
    o.venta = j.venta === true; o.arriendo = j.arriendo === true;
    o.precioVenta = precio(j.precioVenta); o.precioArriendo = precio(j.precioArriendo);
    if (o.precioVenta && !j.venta && j.venta !== false) o.venta = true; if (o.precioArriendo && !j.arriendo && j.arriendo !== false) o.arriendo = true;
    for (const k of ['direccion', 'unidad', 'comuna', 'region', 'rol', 'orientacion']) o[k] = j[k] ? String(j[k]).trim().slice(0, 120) : null;
    for (const k of ['dormitorios', 'banos', 'estacionamientos', 'bodegas', 'supUtil', 'supTotal', 'gastosComunes', 'piso', 'antiguedad']) o[k] = num(j[k]);
    o.amoblado = j.amoblado === true ? true : j.amoblado === false ? false : null;
    o.caracteristicas = [...new Set((Array.isArray(j.caracteristicas) ? j.caracteristicas : []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 15);
    o.titulo = String(j.titulo || '').trim().replace(/\bdepto\.?\b/gi, 'Departamento').slice(0, 60); o.descripcion = limpiarDescripcion(j.descripcion).slice(0, 3000);
    o.dudas = (Array.isArray(j.dudas) ? j.dudas : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
    o.ficha = FC.limpiarFicha(j.ficha && typeof j.ficha === 'object' ? j.ficha : {});
    if (o.piso != null && o.ficha.pisoUnidad == null) o.ficha.pisoUnidad = o.piso;
    if (o.orientacion && !o.ficha.orientacion) o.ficha = FC.limpiarFicha({ orientacion: o.orientacion }, o.ficha);
    if (o.antiguedad != null && o.ficha.anio == null) o.ficha.anio = new Date().getFullYear() - o.antiguedad;
    return o;
  }
  // texto dictado (y lo que ya se tenía) → ficha
  async function extraer({ texto, previo = null }) {
    const t = String(texto || '').trim(); if (t.length < 8) throw err('Cuéntame un poco más de la propiedad.');
    const user = `DICTAR_PROPIEDAD\n${previo ? `Ya tienes estos datos; actualiza SOLO lo que el nuevo dictado corrige o agrega y devuelve el objeto completo.\nPREVIO (JSON):\n${JSON.stringify(previo)}\n` : ''}DICTADO:\n${t.slice(0, 6000)}`;
    const extra = String(estilo() || '').trim();
    const r = await ai.chat({ system: SISTEMA + (extra ? `\nIndicaciones de la empresa para la descripción: ${extra.slice(0, 800)}` : ''), messages: [{ role: 'user', content: user }], json: true, action: 'dictar' });
    let j = null; try { j = JSON.parse(String(r.text).replace(/^```(json)?|```$/g, '').trim()); } catch {}
    if (!j || typeof j !== 'object') throw err('No pude entender el dictado. Intenta de nuevo o escríbelo.');
    const o = normalizar(j);
    return { campos: o, faltan: faltan(o), dudas: o.dudas, tokens: r.tokens };
  }
  async function transcribir(o) { return ai.transcribir(o); }

  // 0.16.14 · completar la ficha de una propiedad YA creada con lo que el corredor cuenta (audio o WhatsApp):
  // devuelve solo lo que dijo, listo para guardar (datos de siempre + p.ficha)
  async function completar({ texto, p }) {
    const t = String(texto || '').trim(); if (t.length < 3) throw err('Cuéntame qué datos quieres agregar.');
    const sys = `Eres el asistente de un corredor de propiedades en Chile. Completa la ficha de una propiedad que ya existe (${p.tipo || 'propiedad'}${p.comuna ? ' en ' + p.comuna : ''}) con lo que el corredor dice ahora.
Devuelve SOLO un JSON: {"plano": {...}, "ficha": {...}, "dudas": ["..."]}. No inventes ni repitas lo que no dijo.
"plano" acepta: dormitorios, banos, estacionamientos, bodegas, supUtil, supTotal, gastosComunes (pesos), amoblado (true/false), unidad (N° de depto/oficina/local), direccion, comuna, rol, precioVenta/precioArriendo ({valor, moneda}).
"ficha" acepta los id de esta lista (número, true/false o la opción más parecida). Lo que la propiedad TIENE va true; lo que dice que NO tiene, false:
${FC.guiaIA(p)}`;
    const r = await ai.chat({ system: sys, messages: [{ role: 'user', content: `COMPLETAR_FICHA\n${t.slice(0, 6000)}` }], json: true, action: 'dictar' });
    let j = null; try { j = JSON.parse(String(r.text).replace(/^```(json)?|```$/g, '').trim()); } catch {}
    if (!j || typeof j !== 'object') throw err('No pude entender esos datos. Intenta de nuevo.');
    const pl = j.plano || {}; const plano = {};
    for (const k of ['dormitorios', 'banos', 'estacionamientos', 'bodegas', 'supUtil', 'supTotal', 'gastosComunes']) if (pl[k] != null) { const n = num(pl[k]); if (n != null) plano[k] = n; }
    for (const k of ['unidad', 'direccion', 'comuna', 'rol']) if (pl[k]) plano[k] = String(pl[k]).trim().slice(0, 120);
    if (typeof pl.amoblado === 'boolean') plano.amoblado = pl.amoblado;
    for (const k of ['precioVenta', 'precioArriendo']) { const v = precio(pl[k]); if (v) plano[k] = v; }
    const ficha = FC.limpiarFicha(j.ficha && typeof j.ficha === 'object' ? j.ficha : {});
    return { plano, ficha, dudas: (Array.isArray(j.dudas) ? j.dudas : []).map(String).slice(0, 5), tokens: r.tokens };
  }

  // ficha final para guardar (lo que no tiene campo propio queda en la descripción y en las notas internas)
  function aFicha(o) {
    const extra = [o.piso != null ? `piso ${o.piso}` : '', o.antiguedad != null ? `${o.antiguedad} años de antigüedad` : '', o.orientacion ? `orientación ${o.orientacion}` : ''].filter(Boolean);
    return { titulo: o.titulo || [o.tipo ? o.tipo[0].toUpperCase() + o.tipo.slice(1).replace(/_/g, ' ') : 'Propiedad', o.comuna ? 'en ' + o.comuna : ''].filter(Boolean).join(' '),
      tipo: o.tipo || 'departamento', venta: !!o.venta, arriendo: !!o.arriendo, precioVenta: o.venta ? o.precioVenta : null, precioArriendo: o.arriendo ? o.precioArriendo : null,
      estadoVenta: o.venta ? 'disponible' : null, estadoArriendo: o.arriendo ? 'disponible' : null,
      direccion: o.direccion || '', unidad: o.unidad || '', comuna: o.comuna || '', region: o.region || '', rol: o.rol || '',
      dormitorios: o.dormitorios, banos: o.banos, estacionamientos: o.estacionamientos, bodegas: o.bodegas, supUtil: o.supUtil, supTotal: o.supTotal, gastosComunes: o.gastosComunes, amoblado: !!o.amoblado,
      descripcion: o.descripcion || '', etiquetas: o.caracteristicas || [], ficha: o.ficha || {}, notasInternas: ['Creada dictando en Asset.', extra.length ? 'Además: ' + extra.join(', ') + '.' : ''].filter(Boolean).join(' '),
      ...(o.lat != null ? { lat: o.lat, lng: o.lng, placeId: o.placeId } : {}) };
  }
  return { extraer, transcribir, faltan, normalizar, aFicha, limpiarDescripcion, completar };
}

module.exports = { crear, limpiarDescripcion, ESTILO };
