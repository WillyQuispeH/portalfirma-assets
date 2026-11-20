// Publicaciones de PortalFirma Asset: un solo flujo «Publicar» para llevar una propiedad a los portales,
// separado del resto de la gestión (negocios, agenda, documentos).
//   · Calidad del aviso: puntaje y lista de lo que falta, con redacción del título y la descripción por IA.
//   · Portales: Portal Inmobiliario y TOCTOC por API (KONVER, portales/konver.js; en modo de prueba, Mercado Libre simulado); Chilepropiedades por feed XML (especificación
//     oficial revisada el 13/10/2026: chilepropiedades.cl/integraciones/crear-feed) y su API de seguimiento
//     (/api-integraciones: mensajes, estadísticas y estado); TOCTOC y Yapo por acuerdo comercial (mismo feed).
//   · Rendimiento: visitas, contactos e interesados por aviso, con recomendaciones de precio y de aviso.
//   · Interesados: bandeja única de todos los portales, con estado y respuesta por WhatsApp.
const inmo = require('./inmo');
const err = (m, code) => Object.assign(new Error(m), code ? { code } : {});
const MOCK = process.env.PF_MOCK === '1';
const hoy = () => new Date().toISOString();
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const xmlEsc = (s) => String(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>');
const cd = (s) => `<![CDATA[ ${xmlEsc(s)} ]]>`;

// pausados: por ahora solo se publica en Portal Inmobiliario (orden del usuario 2026-11-19); se reactivan quitándolos de aquí
const PAUSADOS = new Set(['chilepropiedades', 'broku']);
const PORTALES = {
  pi: { id: 'pi', nombre: 'Portal Inmobiliario', via: 'api', detalle: 'Publica tus avisos desde Asset; también se ven en Mercado Libre y usan el paquete de publicaciones de tu cuenta.', maxTitulo: 60 },
  chilepropiedades: { id: 'chilepropiedades', nombre: 'Chilepropiedades', via: 'feed', detalle: 'Actualiza los avisos una vez al día. La integración es gratis si la aprueban; el número de avisos depende del plan.', maxTitulo: 65, correo: 'integraciones@chilepropiedades.cl' },
  broku: { id: 'broku', nombre: 'Broku', via: 'feed', enTramite: true, detalle: 'Portal con mapa de precios. Estamos coordinando la conexión; cuando esté lista, podrás publicar desde aquí.', maxTitulo: 70, correo: null },
  toctoc: { id: 'toctoc', nombre: 'TOCTOC', via: 'acuerdo', detalle: 'Para publicar hace falta un acuerdo comercial con TOCTOC. Cuando esté firmado, lo activamos en Asset.', maxTitulo: 70 },
  yapo: { id: 'yapo', nombre: 'Yapo', via: 'acuerdo', detalle: 'Para publicar hace falta un acuerdo con su equipo comercial. Cuando esté listo, lo activamos en Asset.', maxTitulo: 70 },
};
// TOCTOC por API (KONVER): se conecta con las llaves que entrega TOCTOC a las corredoras con plan activo
const TOCTOC_API = { via: 'api', detalle: 'Publica, actualiza y retira tus avisos desde Asset. Exige ubicación en el mapa, 3 fotos y una descripción de 50 caracteres o más.' };
const TIPO_FEED = { casa: 'Casa', departamento: 'Departamento', oficina: 'Oficina', sitio: 'Sitio', local_comercial: 'Local Comercial', industrial: 'Terreno Industrial', agricola: 'Terreno Agricola', parcela: 'Parcela', estacionamiento: 'Estacionamiento', terreno_construccion: 'Terreno', bodega: 'Bodega' };
const MONEDA_FEED = { UF: 'CLF', CLP: 'CLP', USD: 'USD' };
const VIVIENDA = ['casa', 'departamento', 'parcela'];
// Lo que se puede hacer con el aviso de una propiedad en un portal (el mismo CRUD para todos; cada portal lo resuelve a su manera)
const ACCIONES = ['publicar', 'actualizar', 'pausar', 'reactivar', 'retirar', 'eliminar'];

function crear({ ml, ai, cambiarPropiedad }) {
  const cfg = () => inmo.config().portales || {};
  const cfgPortal = (id) => cfg()[id] || {};
  function guardarCfg(id, cambios) { const c = { ...cfg(), [id]: { ...cfgPortal(id), ...cambios } }; inmo.guardarConfig({ portales: c }); return c[id]; }
  const aviso = (p, portal, op) => p.portales?.[portal]?.[op] || null;
  function guardarAviso(propId, portal, op, datos, texto) {
    return inmo.parchear(propId, (p) => { p.portales ||= {}; p.portales[portal] ||= {}; p.portales[portal][op] = { ...(p.portales[portal][op] || {}), ...datos, actualizado: hoy() }; }, texto);
  }

  // ---------- portales y su estado de conexión ----------
  const ttApi = () => typeof ml.toctocPublicar === 'function'; // TOCTOC por KONVER (fuera del modo de prueba)
  const def = (id) => (id === 'toctoc' && ttApi() ? { ...PORTALES.toctoc, ...TOCTOC_API } : PORTALES[id]);
  function catalogo() {
    const piOk = ml.tokensOk();
    return Object.keys(PORTALES).map(def).map((x) => {
      if (x.id === 'toctoc' && x.via === 'api') { const ok = ml.toctocOk(); return { ...x, listo: ok, estado: ok ? 'Cuenta conectada' : 'Falta conectar la cuenta', token: false, feedUrl: null, desde: null, acciones: ACCIONES }; }
      if (PAUSADOS.has(x.id)) return { ...x, listo: false, pausado: true, estado: 'Desactivado por ahora', token: false, feedUrl: null, desde: null, acciones: ACCIONES };
      const c = cfgPortal(x.id);
      const listo = x.id === 'pi' ? piOk : !!c.activo;
      const estado = x.id === 'pi' ? (piOk ? 'Cuenta conectada' : 'Falta conectar la cuenta') : c.activo ? (x.via === 'feed' ? (c.token ? 'Feed activo · seguimiento conectado' : 'Feed activo') : 'Integración activa') : x.enTramite ? 'Integración en trámite' : x.via === 'feed' ? 'Falta activar la integración' : 'Requiere acuerdo comercial';
      return { ...x, listo, estado, token: !!c.token, feedUrl: c.feedUrl || null, desde: c.desde || null, acciones: ACCIONES };
    });
  }
  function configurar(id, cambios) {
    if (!PORTALES[id] || id === 'pi') throw err('Portal no válido.'); if (PAUSADOS.has(id)) throw err(`${PORTALES[id].nombre} está desactivado por ahora.`);
    const ok = {}; if ('activo' in cambios) ok.activo = !!cambios.activo; if ('token' in cambios) ok.token = String(cambios.token || '').trim() || null; if ('feedUrl' in cambios) ok.feedUrl = String(cambios.feedUrl || '').trim() || null; if ('nota' in cambios) ok.nota = String(cambios.nota || '').slice(0, 300);
    if (ok.activo && !cfgPortal(id).desde) ok.desde = hoy();
    guardarCfg(id, ok);
    if (ok.activo) for (const p of inmo.todas()) for (const op of ['venta', 'arriendo']) if (aviso(p, id, op)?.status === 'pendiente') guardarAviso(p.id, id, op, { status: 'en_feed', desde: hoy() }, `Integración con ${PORTALES[id].nombre} activa: la publicación pasa al feed (${op})`); // lo que esperaba la integración, sale return catalogo().find((x) => x.id === id);
  }

  // ---------- calidad del aviso ----------
  function calidad(propId, op) {
    const p = inmo.obtener(propId); op = op || (p.arriendo && !p.venta ? 'arriendo' : 'venta');
    const fotos = (p.fotos || []).filter((u) => /^https:\/\//.test(u)).length;
    const titulo = String(p.tituloPortal || p.titulo || '').trim(); const desc = String(p.descripcion || '').trim();
    const precio = op === 'venta' ? p.precioVenta : p.precioArriendo; const viv = VIVIENDA.includes(p.tipo) || p.tipo === 'oficina';
    const contacto = inmo.config().contacto || {};
    const items = [
      { id: 'precio', t: 'Precio', ok: !!precio?.valor, peso: 15, falta: `Falta el precio de ${op}.`, arreglo: 'ficha' },
      { id: 'direccion', t: 'Dirección y comuna', ok: !!(String(p.direccion || '').trim() && String(p.comuna || '').trim()), peso: 10, falta: 'Falta la dirección o la comuna.', arreglo: 'ficha' },
      { id: 'fotos', t: 'Fotos', ok: fotos >= 8, parcial: fotos >= 1 && fotos < 8, peso: 25, falta: fotos ? `Tiene ${fotos} ${fotos === 1 ? 'foto' : 'fotos'}; los avisos con 8 o más reciben muchas más visitas.` : 'Sin fotos: ningún portal publica sin al menos una.', arreglo: 'fotos' },
      { id: 'titulo', t: 'Título', ok: titulo.length >= 25 && titulo.length <= 60, parcial: titulo.length > 0, peso: 10, falta: !titulo ? 'Falta el título.' : titulo.length > 60 ? `El título tiene ${titulo.length} caracteres; Portal Inmobiliario acepta 60.` : 'El título es muy corto: di tipo, lo mejor y la ubicación.', arreglo: 'ia' },
      { id: 'descripcion', t: 'Descripción', ok: desc.length >= 300, parcial: desc.length >= 80, peso: 15, falta: desc ? `La descripción tiene ${desc.length} caracteres; con 300 o más se explica mejor la propiedad.` : 'Sin descripción.', arreglo: 'ia' },
      { id: 'superficie', t: 'Superficie', ok: !!(p.supTotal || p.supUtil), peso: 10, falta: 'Falta la superficie en m².', arreglo: 'ficha' },
      ...(viv ? [{ id: 'programa', t: 'Dormitorios y baños', ok: p.dormitorios != null && p.banos != null, peso: 5, falta: 'Faltan dormitorios o baños.', arreglo: 'ficha' }] : []),
      ...(['departamento', 'oficina'].includes(p.tipo) ? [{ id: 'gc', t: 'Gastos comunes', ok: p.gastosComunes != null, peso: 5, falta: 'Faltan los gastos comunes.', arreglo: 'ficha' }] : []),
      { id: 'contacto', t: 'WhatsApp de contacto', ok: !!String(contacto.whatsapp || '').trim(), peso: 5, falta: 'Configura el WhatsApp de la corredora (Portal Inmobiliario lo exige).', arreglo: 'contacto' },
    ];
    const total = items.reduce((s, x) => s + x.peso, 0);
    const pts = items.reduce((s, x) => s + (x.ok ? x.peso : x.parcial ? x.peso / 2 : 0), 0);
    const puntaje = Math.round(pts / total * 100);
    const bloquea = items.filter((x) => !x.ok && ['precio', 'direccion'].includes(x.id) || (x.id === 'fotos' && !fotos)).map((x) => x.falta);
    return { op, puntaje, nivel: puntaje >= 85 ? 'Excelente' : puntaje >= 65 ? 'Bueno' : puntaje >= 40 ? 'Mejorable' : 'Incompleto', items, bloquea, titulo, descripcion: desc, fotos };
  }

  // Redacción del aviso con IA (título por portal y descripción). No inventa: solo usa los datos de la ficha.
  async function redactar(propId, op) {
    const p = inmo.obtener(propId); op = op || (p.arriendo && !p.venta ? 'arriendo' : 'venta');
    const precio = op === 'venta' ? p.precioVenta : p.precioArriendo;
    const datos = { tipo: p.tipo, operacion: op, comuna: p.comuna, direccion: p.direccion ? 'sí (no la publiques completa)' : 'no', precio: precio ? `${precio.moneda} ${precio.valor}` : null, superficieTotal: p.supTotal, superficieUtil: p.supUtil, dormitorios: p.dormitorios, banos: p.banos, estacionamientos: p.estacionamientos, bodegas: p.bodegas, gastosComunes: p.gastosComunes, amoblado: p.amoblado, descripcionActual: String(p.descripcion || '').slice(0, 2500), tituloActual: p.tituloPortal || p.titulo };
    const r = await ai.chat({ action: 'draft', json: true, system: 'Eres redactor de avisos inmobiliarios en Chile. Escribes en español de Chile, claro y atractivo, sin exagerar ni inventar. Solo usas los datos entregados.', messages: [{ role: 'user', content: `REDACTAR_AVISO\nDatos de la propiedad (JSON):\n${JSON.stringify(datos)}\nDevuelve JSON {"titulo": "máximo 60 caracteres: tipo, lo mejor y la comuna", "descripcion": "350 a 900 caracteres, párrafos cortos: qué es, lo mejor, espacios, entorno y llamado a coordinar visita; sin datos que no estén", "destacados": ["3 a 5 frases cortas"]}` }] });
    let j = r.json || null; if (!j) { try { j = JSON.parse(String(r.text || r.content || '').replace(/^```json|```$/g, '')); } catch { j = null; } }
    if (!j?.titulo) throw err('La IA no devolvió un texto válido. Intenta de nuevo.');
    return { titulo: String(j.titulo).trim().slice(0, 60), descripcion: String(j.descripcion || '').trim(), destacados: (j.destacados || []).slice(0, 5), tokens: r.tokens };
  }
  async function guardarTextos(propId, { tituloPortal, descripcion }) { // por cambiarPropiedad: si ya hay avisos en Portal Inmobiliario, se actualizan solos
    const cambios = {}; if (tituloPortal !== undefined) cambios.tituloPortal = String(tituloPortal).trim().slice(0, 60); if (descripcion !== undefined) cambios.descripcion = String(descripcion).trim();
    const avisos = await cambiarPropiedad(propId, cambios); return { propiedad: inmo.obtener(propId), avisos };
  }

  // ---------- publicar en varios portales ----------
  async function publicar(propId, op, portales, opciones = {}) {
    const p = inmo.obtener(propId); if (!(op === 'venta' ? p.venta : p.arriendo)) throw err(`La propiedad no está marcada en ${op}.`);
    const q = calidad(propId, op); if (q.bloquea.length) throw err('No se puede publicar todavía: ' + q.bloquea.join(' '));
    const out = [];
    for (const id of portales) {
      const P = def(id); if (!P) continue;
      if (PAUSADOS.has(id)) { out.push({ portal: id, ok: false, error: `${P.nombre} está desactivado por ahora.` }); continue; }
      try {
        if (P.via === 'api' && id === 'toctoc') { const p1 = await ml.toctocPublicar(propId, op); const a = aviso(p1 || inmo.obtener(propId), 'toctoc', op); out.push({ portal: id, ok: true, estado: 'Publicado', url: a?.url || null }); continue; }
        if (id === 'pi') { await ml.publicar(propId, op, { tipoAviso: opciones.tipoAviso }); const a = aviso(inmo.obtener(propId), 'pi', op); out.push({ portal: id, ok: true, estado: a?.status === 'active' ? 'Publicado' : 'Enviado', url: a?.permalink || null }); continue; }
        const c = cfgPortal(id);
        if (!c.activo) { guardarAviso(propId, id, op, { status: 'pendiente', solicitado: hoy() }, `Publicación en ${P.nombre} (${op}) en espera: falta activar la integración`); out.push({ portal: id, ok: true, estado: 'En espera de la integración', espera: true }); continue; }
        guardarAviso(propId, id, op, { status: 'en_feed', desde: aviso(p, id, op)?.desde || hoy(), destacado: !!opciones.destacado?.[id] }, `Incluida en el feed de ${P.nombre} (${op})`);
        out.push({ portal: id, ok: true, estado: 'En el feed: el portal la publica en su próxima lectura' });
      } catch (e) { out.push({ portal: id, ok: false, error: e.message }); }
    }
    return { resultados: out, propiedad: { id: p.id, codigo: p.codigo } };
  }
  async function retirar(propId, op, portal) {
    if (portal === 'pi') { await ml.cambiarEstado(propId, op, 'paused', 'retirada desde Publicaciones'); return true; }
    if (portal === 'toctoc' && ttApi()) { await ml.toctocRetirar(propId, op, 'retirada'); return true; }
    guardarAviso(propId, portal, op, { status: 'retirada', retirada: hoy() }, `Retirada de ${PORTALES[portal]?.nombre || portal} (${op})`); return true;
  }

  // ---------- CRUD del aviso en cada portal: publicar, actualizar, pausar, reactivar, retirar y eliminar ----------
  // Portal Inmobiliario: por su API (publicar y actualizar la ficha; pausar, reactivar y finalizar el aviso; eliminarlo).
  // Los portales de feed (Chilepropiedades, Broku, TOCTOC, Yapo) leen el feed que sirve la API: publicar = entrar al feed,
  // pausar o retirar = salir de él, reactivar = volver a entrar. El aviso sigue en Asset hasta eliminarlo.
  const EN_FEED = ['en_feed', 'publicada'];
  async function accion(propId, op, portal, que) {
    const P = PORTALES[portal]; if (!P) throw err('Portal no válido.');
    if (!ACCIONES.includes(que)) throw err('Acción no válida.');
    if (op !== 'venta' && op !== 'arriendo') throw err('Indica si es venta o arriendo.');
    const p = inmo.obtener(propId); const a = aviso(p, portal, op);
    if (que !== 'publicar' && !a) throw err(`Esta propiedad no tiene aviso en ${P.nombre}.`);
    let mensaje = '';
    if (portal === 'pi') {
      if (que === 'publicar') { await ml.publicar(propId, op, {}); mensaje = 'Publicado en Portal Inmobiliario.'; }
      else if (que === 'actualizar') { await ml.actualizar(propId, op); mensaje = 'Aviso actualizado en Portal Inmobiliario.'; }
      else if (que === 'pausar') { await ml.cambiarEstado(propId, op, 'paused'); mensaje = 'Aviso pausado: ya no se ve en Portal Inmobiliario.'; }
      else if (que === 'reactivar') { await ml.cambiarEstado(propId, op, 'active'); mensaje = 'Aviso reactivado.'; }
      else if (que === 'retirar') { await ml.cambiarEstado(propId, op, 'closed', 'finalizado desde Publicaciones'); mensaje = 'Aviso finalizado en Portal Inmobiliario.'; }
      else { const r = await ml.eliminar(propId, op); mensaje = r.borrado ? 'Aviso eliminado de Portal Inmobiliario.' : 'Aviso finalizado y quitado de Asset.'; }
    } else if (portal === 'toctoc' && ttApi()) {
      const en = ['active', 'publicada', 'en_feed'].includes(a?.status);
      if (que === 'publicar' || que === 'actualizar' || que === 'reactivar') {
        if (que === 'actualizar' && !en) throw err('El aviso no está publicado en TOCTOC: reactívalo primero.');
        await ml.toctocPublicar(propId, op); mensaje = que === 'actualizar' ? 'Aviso actualizado en TOCTOC.' : 'Publicado en TOCTOC.';
      } else if (que === 'pausar' || que === 'retirar') {
        if (!en) throw err('El aviso ya no está publicado en TOCTOC.');
        await ml.toctocRetirar(propId, op, que === 'pausar' ? 'pausada' : 'retirada'); mensaje = que === 'pausar' ? 'Aviso pausado: ya no se ve en TOCTOC.' : 'Aviso retirado de TOCTOC.';
      } else {
        if (en) await ml.toctocRetirar(propId, op, 'retirada');
        inmo.parchear(propId, (q) => { if (q.portales?.toctoc) { delete q.portales.toctoc[op]; if (!Object.keys(q.portales.toctoc).length) delete q.portales.toctoc; } }, `Aviso de TOCTOC eliminado (${op})`);
        mensaje = 'Aviso retirado de TOCTOC y quitado de Asset.';
      }
    } else if (que === 'publicar') {
      const r = await publicar(propId, op, [portal], {}); const x = r.resultados[0]; if (!x?.ok) throw err(x?.error || `No se pudo publicar en ${P.nombre}.`); mensaje = x.estado;
    } else if (que === 'actualizar') {
      if (!EN_FEED.includes(a.status)) throw err(`El aviso está ${a.status === 'pausada' ? 'pausado' : 'fuera del feed'}: reactívalo primero.`);
      guardarAviso(propId, portal, op, { cambio: hoy() }, `Aviso de ${P.nombre} marcado como actualizado (${op})`); mensaje = `El feed ya trae los datos de hoy; ${P.nombre} los toma en su próxima lectura.`;
    } else if (que === 'pausar') {
      if (!EN_FEED.includes(a.status)) throw err('Solo se puede pausar un aviso que está en el feed.');
      guardarAviso(propId, portal, op, { status: 'pausada', pausada: hoy() }, `Aviso de ${P.nombre} pausado (${op})`); mensaje = `Sale del feed: ${P.nombre} lo quita en su próxima lectura.`;
    } else if (que === 'reactivar') {
      if (EN_FEED.includes(a.status)) throw err('El aviso ya está en el feed.');
      const r = await publicar(propId, op, [portal], {}); const x = r.resultados[0]; if (!x?.ok) throw err(x?.error || 'No se pudo reactivar.'); mensaje = x.estado;
    } else if (que === 'retirar') {
      guardarAviso(propId, portal, op, { status: 'retirada', retirada: hoy() }, `Aviso de ${P.nombre} retirado (${op})`); mensaje = `Retirado: ${P.nombre} lo quita en su próxima lectura del feed.`;
    } else {
      inmo.parchear(propId, (q) => { if (q.portales?.[portal]) { delete q.portales[portal][op]; if (!Object.keys(q.portales[portal]).length) delete q.portales[portal]; } }, `Aviso de ${P.nombre} eliminado de Asset (${op})`);
      mensaje = 'Aviso eliminado de Asset. Si sigue visible en el portal, retíralo antes desde su lado.';
    }
    return { ok: true, mensaje, estado: aviso(inmo.obtener(propId), portal, op)?.status || null };
  }

  // Direcciones públicas de los feeds (las sirve la API con una clave secreta por corredora; solo las ve el administrador)
  async function feedsServidor(rotar = false) {
    if (MOCK) { const feeds = {}; for (const id of Object.keys(PORTALES)) if (id !== 'pi') feeds[id] = { url: `https://api.prueba.test/v1/feeds/clave-de-prueba/${id}.xml`, avisos: feed(id).avisos }; return { feeds }; }
    return require('./asset').llamar(rotar ? 'POST' : 'GET', rotar ? '/portales/feeds/rotar' : '/portales/feeds', rotar ? {} : undefined);
  }

  // ---------- feed XML (formato de Chilepropiedades; también sirve para TOCTOC y Yapo) ----------
  function feed(portal) {
    const c = inmo.config().contacto || {}; const lista = [];
    for (const p of inmo.todas().filter((x) => !x.archivada)) for (const op of ['venta', 'arriendo']) {
      const a = aviso(p, portal, op); if (!a || !['en_feed', 'publicada'].includes(a.status)) continue;
      const precio = op === 'venta' ? p.precioVenta : p.precioArriendo; if (!precio?.valor || !TIPO_FEED[p.tipo] || !p.comuna) continue;
      const fotos = (p.fotos || []).filter((u) => /^https:\/\//.test(u));
      const area = (tag, v) => (v != null ? `<${tag} unit="m2">${cd(v)}</${tag}>` : '');
      lista.push(`<listing>
<referenceId>${cd(`${p.codigo}-${op === 'venta' ? 'V' : 'A'}`)}</referenceId>
<contact><name>${cd(c.nombre || '')}</name><email>${cd(c.email || '')}</email><phones>${c.whatsapp ? `<phone whatsapp="true">${cd(c.whatsapp)}</phone>` : ''}${c.telefono && c.telefono !== c.whatsapp ? `<phone whatsapp="false">${cd(c.telefono)}</phone>` : ''}</phones><agencyName>${cd(c.nombre || '')}</agencyName></contact>
<address>${cd([p.direccion].filter(Boolean).join(''))}</address><commune>${cd(p.comuna)}</commune>
<title>${cd(String(p.tituloPortal || p.titulo || '').slice(0, 65))}</title><description>${cd(p.descripcion || '')}</description>
<prices><price currency="${MONEDA_FEED[precio.moneda] || 'CLF'}" operation="${op === 'venta' ? 'Venta' : 'Arriendo'}">${cd(precio.valor)}</price></prices>
${p.gastosComunes != null ? `<communityFeesPrice>${cd(Math.round(p.gastosComunes))}</communityFeesPrice>` : ''}<propertyType>${cd(TIPO_FEED[p.tipo])}</propertyType>
${p.lat != null && p.lng != null ? `<coordinates><latitude>${cd(p.lat)}</latitude><longitude>${cd(p.lng)}</longitude></coordinates>` : ''}${p.dormitorios != null ? `<bedrooms>${cd(p.dormitorios)}</bedrooms>` : ''}${p.banos != null ? `<bathrooms>${cd(p.banos)}</bathrooms>` : ''}
${area('floorArea', p.supTotal)}${area('usableFloorArea', p.supUtil)}${p.estacionamientos != null ? `<parkingLots>${cd(p.estacionamientos)}</parkingLots>` : ''}<furnished>${cd(p.amoblado ? 'true' : 'false')}</furnished><featured>${cd(a.destacado ? 'true' : 'false')}</featured>
<pictures>${fotos.map((u) => `<picture><url>${cd(u)}</url></picture>`).join('')}</pictures>
</listing>`);
    }
    return { xml: `<?xml version="1.0" encoding="UTF-8"?>\n<listings>\n${lista.join('\n')}\n</listings>\n`, avisos: lista.length };
  }

  // ---------- Chilepropiedades: API de seguimiento (requiere el TOKEN que entrega el portal) ----------
  const CP = 'https://chilepropiedades.cl/api-integraciones';
  async function cpGet(ruta, params = {}) {
    const t = cfgPortal('chilepropiedades').token; if (!t) throw err('Falta el TOKEN de Chilepropiedades.');
    if (MOCK) return cpMock(ruta, params);
    const u = new URL(CP + ruta); for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
    const r = await fetch(u, { headers: { Authorization: t } }); if (!r.ok) throw err(`Chilepropiedades respondió ${r.status}.`);
    return r.json();
  }
  function cpMock(ruta) {
    const refs = []; for (const p of inmo.todas()) for (const op of ['venta', 'arriendo']) if (aviso(p, 'chilepropiedades', op)?.status) refs.push(`${p.codigo}-${op === 'venta' ? 'V' : 'A'}`);
    if (ruta === '/estado-publicacion') return refs.map((r, i) => ({ publicationState: 'Publicada', externalID: r, shortURL: `https://chilepropiedades.cl/ver-publicacion/${7000000 + i}` }));
    if (ruta === '/estadisticas') return refs.map((r, i) => ({ id: i, pageViews: 40 + i * 13, contactRevealed: 2 + i, contactEmails: 1, whatsAppButtonClicked: i % 2, externalID: r }));
    if (ruta === '/mensajes') return refs.slice(0, 1).map((r) => ({ id: 74924890, body: `Hola, estoy interesado en el aviso (Código ${r}). ¿Se puede visitar?`, emailFrom: 'interesada@correo.cl', nameFrom: 'Carla Muñoz', phoneFrom: '+56 9 7777 1234', creationDate: Date.now() - 3600e3, externalID: r }));
    return [];
  }
  const porRef = (ref) => { const m = String(ref || '').match(/^(.*)-(V|A)$/); if (!m) return null; const p = inmo.todas().find((x) => x.codigo === m[1]); return p ? { p, op: m[2] === 'V' ? 'venta' : 'arriendo' } : null; };
  async function sincronizarCP() {
    const out = { estados: 0, leads: 0 }; const c = cfgPortal('chilepropiedades'); if (!c.activo || !c.token) return out;
    const [est, stats, msgs] = await Promise.all([cpGet('/estado-publicacion'), cpGet('/estadisticas'), cpGet('/mensajes', { fromID: c.ultimoMensaje || undefined })]);
    const ESTADO = { Publicada: 'publicada', Borrada: 'retirada', Vencida: 'vencida' };
    for (const e of est || []) { const x = porRef(e.externalID); if (!x) continue; const s = ESTADO[e.publicationState] || norm(e.publicationState); const a = aviso(x.p, 'chilepropiedades', x.op); if (a && a.status !== 'retirada' && (a.status !== s || !a.url)) { guardarAviso(x.p.id, 'chilepropiedades', x.op, { status: s, url: e.longURL || e.shortURL || a.url }, a.status !== s ? `Chilepropiedades informa: ${e.publicationState} (${x.op})` : undefined); out.estados++; } }
    for (const s of stats || []) { const x = porRef(s.externalID); if (!x) continue; guardarAviso(x.p.id, 'chilepropiedades', x.op, { stats: { visitas: s.pageViews || 0, contactos: (s.contactRevealed || 0) + (s.contactEmails || 0) + (s.whatsAppButtonClicked || 0), acumulado: true, al: hoy() } }); }
    let maxId = c.ultimoMensaje || 0;
    for (const m of msgs || []) { maxId = Math.max(maxId, Number(m.id) || 0); const x = porRef(m.externalID); if (!x) continue; if (inmo.registrarLead(x.p.id, { id: 'cp-' + m.id, portal: 'Chilepropiedades', canal: 'email', canalTxt: 'correo', nombre: m.nameFrom, email: m.emailFrom, telefono: m.phoneFrom, mensaje: m.body, fecha: new Date(m.creationDate || Date.now()).toISOString(), op: x.op, visto: false })) out.leads++; }
    guardarCfg('chilepropiedades', { ultimoMensaje: maxId, ultimaSync: hoy() }); inmo.guardar();
    return out;
  }
  async function sincronizar() {
    const r = { pi: null, chilepropiedades: null, errores: [] };
    if (await ml.conectada() || (ttApi() && ml.toctocOk())) { try { r.pi = await ml.sincronizar(); await metricasPI(); } catch (e) { r.errores.push('Portal Inmobiliario: ' + e.message); } }
    try { r.chilepropiedades = await sincronizarCP(); } catch (e) { r.errores.push('Chilepropiedades: ' + e.message); }
    inmo.guardarConfig({ publicacionesSync: hoy() });
    return r;
  }
  async function metricasPI() {
    for (const p of inmo.todas()) for (const op of ['venta', 'arriendo']) {
      const a = aviso(p, 'pi', op); if (!a?.itemId || a.status === 'closed') continue;
      const m = await ml.metricas(a.itemId, 30).catch(() => null); if (!m) continue;
      const leads = (p.leads || []).filter((l) => l.itemId === a.itemId).length;
      guardarAviso(p.id, 'pi', op, { stats: { visitas: m.visitas, contactos: (m.telefonos || 0) + leads, telefonos: m.telefonos, serie: m.serie, dias: 30, al: hoy() } });
    }
  }

  // ---------- rendimiento y precio ----------
  function precioM2(p, op) { const pr = op === 'venta' ? p.precioVenta : p.precioArriendo; const m2 = p.supUtil || p.supTotal; return pr?.valor && m2 ? { v: pr.valor / m2, moneda: pr.moneda } : null; }
  function comparables(p, op) {
    const yo = precioM2(p, op); if (!yo) return null;
    const pares = inmo.todas().filter((x) => x.id !== p.id && !x.archivada && x.tipo === p.tipo && norm(x.comuna) === norm(p.comuna) && (op === 'venta' ? x.venta : x.arriendo)).map((x) => precioM2(x, op)).filter((x) => x && x.moneda === yo.moneda).map((x) => x.v).sort((a, b) => a - b);
    if (pares.length < 2) return { n: pares.length, yo: yo.v, moneda: yo.moneda };
    const med = pares[Math.floor(pares.length / 2)];
    return { n: pares.length, yo: yo.v, mediana: med, dif: Math.round((yo.v / med - 1) * 100), moneda: yo.moneda };
  }
  function recomendar(p, op, filas, comp) {
    const r = []; const dias = Math.max(...filas.map((f) => f.dias || 0), 0);
    const vis = filas.reduce((s, f) => s + (f.stats?.visitas || 0), 0); const con = filas.reduce((s, f) => s + (f.stats?.contactos || 0), 0) + filas.reduce((s, f) => s + (f.leads || 0), 0);
    if (comp?.dif != null && comp.dif >= 12) r.push({ tipo: 'precio', grave: comp.dif >= 20, t: `El m² está ${comp.dif}% sobre la mediana de ${comp.n} propiedades parecidas de tu cartera en ${p.comuna}.`, accion: `Evalúa bajar a ${Math.round((op === 'venta' ? p.precioVenta : p.precioArriendo).valor * (1 - Math.min(comp.dif, 15) / 100) * 100) / 100} ${(op === 'venta' ? p.precioVenta : p.precioArriendo).moneda}.` });
    if (dias >= 21 && con === 0) r.push({ tipo: 'precio', grave: true, t: `${dias} días publicada sin contactos.`, accion: 'Baja el precio entre 3% y 5% o renueva fotos y título.' });
    else if (vis >= 80 && con / Math.max(vis, 1) < 0.01) r.push({ tipo: 'aviso', t: `${vis} visitas y solo ${con} contactos: la gente mira pero no escribe.`, accion: 'Revisa precio, primera foto y que la descripción responda lo básico (gastos comunes, estacionamiento, mascotas).' });
    if (dias >= 7 && vis < 20) r.push({ tipo: 'visibilidad', t: `Pocas visitas (${vis}) en ${dias} días.`, accion: 'Destaca el aviso o mejora el título con lo mejor de la propiedad.' });
    const q = calidad(p.id, op); if (q.puntaje < 70) r.push({ tipo: 'calidad', t: `Calidad del aviso ${q.puntaje}/100.`, accion: q.items.filter((x) => !x.ok).slice(0, 2).map((x) => x.falta).join(' ') });
    return r;
  }
  function panel() {
    const filas = [];
    for (const p of inmo.todas().filter((x) => !x.archivada)) for (const op of ['venta', 'arriendo']) {
      if (!(op === 'venta' ? p.venta : p.arriendo)) continue;
      const portales = Object.keys(PORTALES).map((id) => { const a = aviso(p, id, op); if (!a || (id === 'pi' && !a.itemId)) return null;
        const desde = a.publicado || a.desde || a.solicitado || null; const dias = desde ? Math.floor((Date.now() - new Date(desde)) / 864e5) : 0;
        const leads = (p.leads || []).filter((l) => (id === 'pi' ? l.itemId === a.itemId : norm(l.portal) === norm(PORTALES[id].nombre) && (!l.op || l.op === op))).length;
        return { portal: id, nombre: id === 'pi' && a.enPI === false ? 'Mercado Libre' : id === 'pi' && a.enPI ? 'Mercado Libre + Portal Inmobiliario' : PORTALES[id].nombre, status: a.status, url: a.permalink || a.url || null, dias, stats: a.stats || null, leads, error: a.error || null }; }).filter(Boolean);
      if (!portales.length) continue;
      const comp = comparables(p, op);
      filas.push({ propId: p.id, codigo: p.codigo, titulo: p.titulo, comuna: p.comuna, foto: (p.fotos || [])[0] || null, op, precio: op === 'venta' ? p.precioVenta : p.precioArriendo, estado: op === 'venta' ? p.estadoVenta : p.estadoArriendo,
        portales, visitas: portales.reduce((s, x) => s + (x.stats?.visitas || 0), 0), contactos: portales.reduce((s, x) => s + (x.stats?.contactos || 0), 0), interesados: (p.leads || []).filter((l) => !l.op || l.op === op).length,
        nuevos: (p.leads || []).filter((l) => !l.visto && (!l.op || l.op === op)).length, calidad: calidad(p.id, op).puntaje, comparables: comp, recomendaciones: recomendar(p, op, portales, comp) });
    }
    const sinPublicar = inmo.todas().filter((p) => !p.archivada && ((p.venta && p.estadoVenta === 'disponible') || (p.arriendo && p.estadoArriendo === 'disponible')) && !filas.some((f) => f.propId === p.id)).map((p) => ({ propId: p.id, codigo: p.codigo, titulo: p.titulo, comuna: p.comuna, calidad: calidad(p.id).puntaje }));
    return { avisos: filas, sinPublicar, totales: { avisos: filas.length, visitas: filas.reduce((s, f) => s + f.visitas, 0), contactos: filas.reduce((s, f) => s + f.contactos, 0), nuevos: filas.reduce((s, f) => s + f.nuevos, 0), alertas: filas.filter((f) => f.recomendaciones.some((r) => r.grave)).length }, sync: inmo.config().publicacionesSync || null };
  }

  // ---------- interesados (bandeja única) ----------
  const ESTADOS_L = ['nuevo', 'contactado', 'visita', 'descartado'];
  function interesados({ estado, portal, q } = {}) {
    const l = [];
    for (const p of inmo.todas()) for (const x of p.leads || []) {
      const e = x.estado || (x.visto ? 'contactado' : 'nuevo');
      if (estado && e !== estado) continue; if (portal && norm(x.portal) !== norm(portal)) continue;
      if (q && !norm([x.nombre, x.email, x.telefono, p.codigo, p.titulo, x.mensaje].join(' ')).includes(norm(q))) continue;
      l.push({ ...x, estado: e, propId: p.id, codigo: p.codigo, titulo: p.titulo, comuna: p.comuna });
    }
    l.sort((a, b) => String(b.fecha || b.recibido).localeCompare(String(a.fecha || a.recibido)));
    const cuenta = Object.fromEntries(ESTADOS_L.map((s) => [s, 0])); for (const p of inmo.todas()) for (const x of p.leads || []) cuenta[x.estado || (x.visto ? 'contactado' : 'nuevo')]++;
    return { interesados: l.slice(0, 300), cuenta };
  }
  function actualizarInteresado(propId, leadId, cambios) {
    let lead = null;
    inmo.parchear(propId, (p) => { lead = (p.leads || []).find((x) => x.id === leadId); if (!lead) throw err('El interesado ya no está.'); if (cambios.estado) { if (!ESTADOS_L.includes(cambios.estado)) throw err('Estado no válido.'); lead.estado = cambios.estado; lead.visto = true; } if ('nota' in cambios) lead.nota = String(cambios.nota || '').slice(0, 500); if (cambios.personaId) lead.personaId = cambios.personaId; if (cambios.contactado) { lead.contactado = hoy(); lead.estado = lead.estado === 'nuevo' || !lead.estado ? 'contactado' : lead.estado; lead.visto = true; } },
      cambios.estado ? `Interesado ${lead?.nombre || ''}: ${cambios.estado}` : undefined);
    return lead;
  }
  function agregarInteresado(propId, o) {
    const nombre = String(o.nombre || '').trim(); if (!nombre) throw err('Indica el nombre del interesado.');
    const id = 'm-' + Date.now().toString(36);
    inmo.registrarLead(propId, { id, portal: PORTALES[o.portal]?.nombre || String(o.portal || 'Otro'), canal: o.canal || 'manual', canalTxt: o.canal || 'ingresado a mano', nombre, email: String(o.email || '').trim(), telefono: String(o.telefono || '').trim(), rut: o.rut || null, mensaje: String(o.mensaje || '').slice(0, 1000), fecha: hoy(), op: o.op || null, visto: false });
    inmo.guardar(); return id;
  }
  function respuesta(propId, leadId) {
    const p = inmo.obtener(propId); const l = (p.leads || []).find((x) => x.id === leadId); if (!l) throw err('El interesado ya no está.');
    const c = inmo.config().contacto || {}; const n = String(l.nombre || '').trim().split(/\s+/)[0] || '';
    const texto = `Hola${n ? ' ' + n[0].toUpperCase() + n.slice(1).toLowerCase() : ''}, ${c.nombre ? `te escribo de ${c.nombre}` : 'te escribo'} por tu interés en ${p.titulo} (código ${p.codigo})${p.comuna ? ' en ' + p.comuna : ''}. ¿Te acomoda coordinar una visita esta semana? Cuéntame qué día y horario te sirven.`;
    const tel = String(l.telefono || '').replace(/\D/g, ''); const wa = tel ? `https://wa.me/${tel.length === 9 ? '56' + tel : tel}?text=${encodeURIComponent(texto)}` : null;
    return { texto, whatsapp: wa, email: l.email || null };
  }

  return { PORTALES, catalogo, configurar, calidad, redactar, guardarTextos, publicar, retirar, accion, feedsServidor, ACCIONES, feed, sincronizar, panel, interesados, actualizarInteresado, agregarInteresado, respuesta };
}

module.exports = { crear, PORTALES };
