// Postventa Asset (MVP): proyectos y unidades entregadas, reclamos con garantía legal calculada (Ley 20.016, art. 18 LGUC:
// estructura 10 años y instalaciones 5 desde la recepción municipal; terminaciones 3 desde la inscripción en el CBR),
// y atención por WhatsApp (vía wechatia) con un asistente que identifica al propietario, pide la falla y las fotos y crea el reclamo.
const fs = require('fs');
const path = require('path');

const err = (m, code) => Object.assign(new Error(m), code ? { code } : {});
const now = () => new Date().toISOString();
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const dig = (t) => String(t || '').replace(/\D/g, '').slice(-9);
const cleanRut = (r) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
const primer = (n) => { const x = String(n || '').trim().split(/\s+/)[0] || ''; return x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : ''; };

const ESTADOS = [
  ['recibido', 'Recibido'], ['triage', 'Por revisar'], ['visita', 'Visita de diagnóstico'], ['orden', 'Orden al contratista'],
  ['reparacion', 'En reparación'], ['validacion', 'Por validar'], ['cerrado', 'Cerrado'], ['no_procede', 'No procede'],
];
const ESTADO_TXT = Object.fromEntries(ESTADOS);
const TIPOS = { terminacion: ['Terminaciones', 3, 'cbr'], instalacion: ['Instalaciones', 5, 'dom'], estructura: ['Estructura', 10, 'dom'], otro: ['Otro', 5, 'dom'] };

// ---------- clasificación automática (reglas; la persona confirma) ----------
const RECINTOS = [['bano', 'Baño', /bano|ducha|tina|wc|inodoro|lavamanos/], ['cocina', 'Cocina', /cocina|lavaplatos|encimera|campana|horno/], ['dormitorio', 'Dormitorio', /dormitorio|pieza|habitacion|closet/],
  ['living', 'Living-comedor', /living|comedor|estar/], ['terraza', 'Terraza', /terraza|balcon/], ['logia', 'Logia', /logia|lavadero|calefont|termo/], ['bodega', 'Bodega', /bodega/], ['estacionamiento', 'Estacionamiento', /estacionamiento/]];
const REGLAS = [
  ['estructura', /grieta (en|de) (la )?(losa|viga|muro estructural|pilar|columna)|fisura estructural|estructura|losa|viga|pilar|asentamiento/],
  ['instalacion', /filtra|gotea|goteo|humedad|cañeria|caneria|agua|desague|desagüe|alcantarill|tapad|electric|enchufe|interruptor|luz|automatico|tablero|gas|calefont|termo|presion/],
  ['terminacion', /pintura|ceramic|porcelanato|piso|flotante|alfombra|puerta|chapa|bisagra|ventana|vidrio|sello|silicona|mueble|cajon|closet|zocalo|guardapolvo|quincalleria|grieta|fisura|desprend|mancha|rayad/],
];
const URGENTE = /filtracion activa|se esta filtrando|inunda|sin agua|sin luz|olor a gas|fuga de gas|cortocircuito|chispa/;
function clasificar(texto) {
  const t = norm(texto);
  const tipo = (REGLAS.find(([, re]) => re.test(t)) || ['otro'])[0];
  const r = RECINTOS.find(([, , re]) => re.test(t));
  return { tipo, recinto: r ? r[1] : null, urgente: URGENTE.test(t) || (/filtra|gotea|inunda/.test(t) && /ahora|activa|todavia|sigue/.test(t)) };
}
function garantia(unidad, tipo, hoy = new Date()) {
  const [, anos, base] = TIPOS[tipo] || TIPOS.otro;
  const desde = base === 'cbr' ? unidad?.inscripcionCBR : unidad?.recepcionDOM;
  if (!desde) return { anos, base, desde: null, vence: null, vigente: null, txt: `${anos} años (falta la fecha de ${base === 'cbr' ? 'inscripción en el CBR' : 'recepción municipal'})` };
  const v = new Date(desde + 'T12:00'); v.setFullYear(v.getFullYear() + anos); const vence = v.toISOString().slice(0, 10);
  const vigente = hoy.toISOString().slice(0, 10) <= vence;
  return { anos, base, desde, vence, vigente, txt: vigente ? `vigente hasta ${vence.split('-').reverse().join('/')}` : `vencida el ${vence.split('-').reverse().join('/')}` };
}

function crear({ dir, wa = null, ia = null, mock = false, inmo = null }) {
  const file = () => path.join(dir(), 'postventa.json');
  let db = null;
  // Con la cuenta de Asset, postventa vive en la base: colecciones pv_* (vía inmo.registros, sincronizadas) y el folio
  // lo da el servidor. Las conversaciones (chats) son un mapa por id para este módulo y una lista en la base.
  const enApi = () => !!inmo?.API;
  const chatsMapa = {};
  function DApi() {
    const L = (c) => inmo.registros(c);
    const cfgL = L('pv_config'); let cfg = cfgL.find((x) => x.id === 'config'); if (!cfg) { cfg = { id: 'config', auto: false }; cfgL.push(cfg); }
    const lc = L('pv_chats'); const ids = new Set(lc.map((c) => c.id));
    for (const [id, c] of Object.entries(chatsMapa)) if (!ids.has(id)) { if (c.__baja) delete chatsMapa[id]; else lc.push(c); } // nuevas conversaciones → a la lista
    for (const id of Object.keys(chatsMapa)) if (!lc.some((c) => c.id === id)) delete chatsMapa[id];
    for (const c of lc) chatsMapa[c.id] = c;
    return { proyectos: L('pv_proyectos'), unidades: L('pv_unidades'), reclamos: L('pv_reclamos'), contratistas: L('pv_contratistas'), chats: chatsMapa, config: cfg, folio: 0 };
  }
  const D = () => { if (enApi()) return DApi(); if (!db) { try { db = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { db = {}; } db.proyectos ||= []; db.unidades ||= []; db.reclamos ||= []; db.contratistas ||= []; db.chats ||= {}; db.config ||= { auto: false }; db.folio ||= 0; } return db; };
  const save = () => { if (enApi()) { D(); inmo.guardar(); return; } fs.writeFileSync(file(), JSON.stringify(D(), null, 1)); };
  // lo que este equipo tenía en postventa.json se sube una vez al iniciar sesión (queda postventa.respaldo.json)
  if (inmo?.alCargar) inmo.alCargar(async () => {
    if (!enApi() || !fs.existsSync(file())) return null;
    let d; try { d = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return null; }
    const api = (...a) => require('./asset').llamar(...a);
    const lotes = { pv_proyectos: d.proyectos || [], pv_unidades: d.unidades || [], pv_reclamos: d.reclamos || [], pv_contratistas: d.contratistas || [],
      pv_chats: Object.values(d.chats || {}), pv_config: d.config ? [{ ...d.config, id: 'config' }] : [] };
    let n = 0;
    for (const [c, l] of Object.entries(lotes)) for (let i = 0; i < l.length; i += 200) n += (await api('POST', `/registros/${c}/importar`, { items: l.slice(i, i + 200) })).nuevos || 0;
    if (d.folio) await inmo.folio('PV', d.folio - 1); // la serie sigue después del último folio de este equipo
    fs.renameSync(file(), file().replace(/\.json$/, '.respaldo.json'));
    const r = (d.reclamos || []).length;
    return n ? `Se subió al servidor la postventa de este computador${r ? ` (${r} ${r === 1 ? 'reclamo' : 'reclamos'})` : ''}.` : null;
  });
  const unidad = (id) => D().unidades.find((u) => u.id === id) || null;
  const proyecto = (id) => D().proyectos.find((p) => p.id === id) || null;
  const nomUnidad = (u) => { if (!u) return 'Sin unidad'; const p = proyecto(u.proyectoId); return `${p?.nombre || 'Proyecto'} · ${u.torre ? 'Torre ' + u.torre + ' · ' : ''}${u.numero}`; };
  const rec = (id) => { const r = D().reclamos.find((x) => x.id === id); if (!r) throw err('El reclamo ya no existe.'); return r; };
  const log = (r, texto, quien = 'Asset') => { r.historial.unshift({ fecha: now(), texto, quien }); r.actualizado = now(); };

  // ---------- proyectos y unidades (carga masiva) ----------
  // filas: [{proyecto, torre, piso, numero, tipologia, propietario, rut, telefono, email, recepcionDOM, inscripcionCBR, entrega}]
  const fecha = (v) => { if (v == null || v === '') return null; if (typeof v === 'number') { const d = new Date(Math.round(v - 25569) * 864e5); return d.toISOString().slice(0, 10); }
    const s = String(v).trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return null; };
  function importarFilas(filas) {
    const d = D(); let nuevas = 0, actualizadas = 0, omitidas = 0; const errores = [];
    filas.forEach((f0, i) => {
      if (Object.values(f0).some((v) => /^\s*ejemplo\b/i.test(String(v)))) { omitidas++; return; } // fila de ejemplo de la plantilla
      const f = Object.fromEntries(Object.entries(f0).map(([k, v]) => [norm(k).replace(/[^a-z]/g, ''), v]));
      const g = (...ks) => { for (const k of ks) if (f[k] != null && String(f[k]).trim() !== '') return String(f[k]).trim(); return ''; };
      const pn = g('proyecto', 'edificio', 'condominio'); const num = g('numero', 'unidad', 'depto', 'departamento', 'casa');
      if (!pn || !num) { errores.push(`Fila ${i + 2}: falta el proyecto o el número de unidad.`); return; }
      let p = d.proyectos.find((x) => norm(x.nombre) === norm(pn)); if (!p) { p = { id: uid('pj'), nombre: pn, creado: now() }; d.proyectos.push(p); }
      const torre = g('torre', 'block', 'bloque'); let u = d.unidades.find((x) => x.proyectoId === p.id && norm(x.numero) === norm(num) && norm(x.torre) === norm(torre));
      const datos = { torre, piso: g('piso'), numero: num, tipologia: g('tipologia', 'tipo', 'modelo'), propietario: { nombre: g('propietario', 'nombre', 'cliente'), rut: g('rut'), telefono: g('telefono', 'celular', 'fono', 'whatsapp'), email: g('email', 'correo', 'mail') },
        recepcionDOM: fecha(f0[Object.keys(f0).find((k) => /recep/i.test(k))] ?? '') || null, inscripcionCBR: fecha(f0[Object.keys(f0).find((k) => /inscrip|cbr|conservador/i.test(k))] ?? '') || null, entrega: fecha(f0[Object.keys(f0).find((k) => /entrega/i.test(k))] ?? '') || null };
      if (u) { Object.assign(u, datos, { actualizado: now() }); actualizadas++; } else { u = { id: uid('u'), proyectoId: p.id, ...datos, creado: now() }; d.unidades.push(u); nuevas++; }
    });
    save(); return { nuevas, actualizadas, omitidas, errores, proyectos: d.proyectos.length, unidades: d.unidades.length };
  }
  function importarArchivo(ruta) {
    const XLSX = require('xlsx'); const wb = XLSX.readFile(ruta, { cellDates: false, raw: /\.csv$/i.test(ruta) });
    const hoja = wb.Sheets[wb.SheetNames.find((n) => /unidad/i.test(n)) || wb.SheetNames[0]];
    let filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });
    // planilla con todo escrito en la primera columna separado por comas (la plantilla CSV abierta en Excel)
    const cols = filas.length ? Object.keys(filas[0]) : [];
    if (cols.length === 1 && /,/.test(cols[0])) {
      const heads = cols[0].split(',').map((x) => x.trim()); const malas = []; filas = [];
      XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' }).slice(1).forEach((row, i) => { const linea = String(row[0] || '').trim(); if (!linea) return; const v = linea.split(',').map((x) => x.trim());
        if (v.length !== heads.length) { malas.push(i + 2); return; } filas.push(Object.fromEntries(heads.map((h, j) => [h, v[j]]))); });
      if (malas.length) throw err(`La planilla tiene todos los datos en una sola columna, separados por comas, y ${malas.length === 1 ? 'la fila ' + malas[0] + ' tiene' : 'las filas ' + malas.join(', ') + ' tienen'} más o menos datos que columnas (por ejemplo, una dirección con comas). Descarga la plantilla nueva en Excel (un dato por celda) y vuelve a copiar los datos.`, 'UNA_COLUMNA');
    }
    if (!filas.length) throw err('La planilla está vacía.');
    return importarFilas(filas);
  }
  // plantilla Excel: una columna por dato, fechas como fechas, una hoja con instrucciones
  const COLS = [['Proyecto', 'Nombre del edificio o condominio. Ej.: Edificio Los Aromos', 26, 'Ejemplo · Edificio Los Aromos'], ['Torre', 'Torre o block (opcional)', 8, 'A'], ['Piso', 'Opcional', 6, 5],
    ['Número', 'Número de la unidad (depto o casa)', 10, '502'], ['Tipología', 'Opcional. Ej.: 3D2B', 11, '3D2B'], ['Propietario', 'Nombre completo', 26, 'Ana Rojas Vera'], ['RUT', 'Con guion. Ej.: 12.345.678-5', 14, '12.345.678-5'],
    ['Celular', 'El que usa en WhatsApp. Ej.: +56 9 5555 1111. Con él lo reconoce el asistente', 18, '+56 9 5555 1111'], ['Email', 'Opcional', 24, 'ana@correo.cl'],
    ['Recepción DOM', 'Fecha del certificado de recepción definitiva municipal: desde ella corren 10 años (estructura) y 5 (instalaciones)', 15, '2025-03-10'],
    ['Inscripción CBR', 'Fecha de inscripción en el Conservador de Bienes Raíces: desde ella corren 3 años (terminaciones)', 15, '2025-06-02'], ['Entrega', 'Fecha de entrega al propietario (opcional)', 12, '2025-06-15']];
  function plantillaXLSX() {
    const XLSX = require('xlsx'); const wb = XLSX.utils.book_new();
    const serial = (iso) => Math.round(Date.UTC(...iso.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0))) / 864e5 + 25569);
    const fila = COLS.map(([, , , v], i) => (i >= 9 ? serial(v) : v));
    const ws = XLSX.utils.aoa_to_sheet([COLS.map((c) => c[0]), fila]);
    for (let r = 1; r <= 400; r++) for (const c of [9, 10, 11]) { const ref = XLSX.utils.encode_cell({ r, c }); if (ws[ref]) { ws[ref].t = 'n'; ws[ref].z = 'dd/mm/yyyy'; } }
    ws['!cols'] = COLS.map((c) => ({ wch: c[2] })); ws['!autofilter'] = { ref: `A1:L1` };
    XLSX.utils.book_append_sheet(wb, ws, 'Unidades');
    const ins = XLSX.utils.aoa_to_sheet([['Cómo completar la planilla'], [''], ['Un dato por celda y una unidad por fila. La fila que empieza con «Ejemplo» no se importa: puedes borrarla o dejarla.'], ['Las fechas pueden ir como fecha de Excel o escritas así: 10/03/2025.'], [''], ['Columna', 'Qué va'], ...COLS.map((c) => [c[0], c[1]])]);
    ins['!cols'] = [{ wch: 18 }, { wch: 110 }]; XLSX.utils.book_append_sheet(wb, ins, 'Instrucciones');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
  function plantillaCSV() { return 'proyecto,torre,piso,numero,tipologia,propietario,rut,telefono,email,recepcion_dom,inscripcion_cbr,entrega\nEdificio Los Aromos,A,5,502,3D2B,Ana Rojas Vera,12.345.678-5,+56 9 5555 1111,ana@correo.cl,2025-03-10,2025-06-02,2025-06-15\n'; }

  // ---------- reclamos ----------
  const vista = (r) => { const u = unidad(r.unidadId);
    return { ...r, estadoTxt: ESTADO_TXT[r.estado], unidad: u ? { id: u.id, nombre: nomUnidad(u), propietario: u.propietario, recepcionDOM: u.recepcionDOM, inscripcionCBR: u.inscripcionCBR } : null,
      items: r.items.map((it) => ({ ...it, tipoTxt: TIPOS[it.tipo]?.[0] || 'Otro', garantia: garantia(u, it.tipo) })),
      conversacion: r.chatId ? (D().chats[r.chatId]?.mensajes || []) : [], dias: Math.floor((Date.now() - new Date(r.creado).getTime()) / 864e5) }; };
  async function crearReclamo({ unidadId = null, items = [], canal = 'manual', contacto = null, chatId = null }) {
    const n = enApi() ? await inmo.folio('PV') : (D().folio += 1); const d = D();
    const r = { id: uid('r'), folio: `PV-${String(n).padStart(4, '0')}`, unidadId, canal, contacto, chatId, estado: 'triage', urgente: items.some((i) => i.urgente || clasificar(i.descripcion).urgente),
      items: items.map((i) => { const c = clasificar(i.descripcion); return { id: uid('i'), descripcion: i.descripcion, recinto: i.recinto || c.recinto, tipo: i.tipo || c.tipo, fotos: i.fotos || [], auto: true }; }),
      visitas: [], contratista: null, historial: [], creado: now(), actualizado: now() };
    log(r, `Reclamo recibido por ${canal === 'whatsapp' ? 'WhatsApp' : 'Asset'}`); d.reclamos.unshift(r); save(); return vista(r);
  }
  function listar({ estado, q, proyectoId } = {}) {
    const t = norm(q); return D().reclamos.filter((r) => (!estado || (estado === 'abiertos' ? !['cerrado', 'no_procede'].includes(r.estado) : r.estado === estado))
      && (!proyectoId || unidad(r.unidadId)?.proyectoId === proyectoId)
      && (!t || norm(`${r.folio} ${nomUnidad(unidad(r.unidadId))} ${unidad(r.unidadId)?.propietario?.nombre || r.contacto?.nombre || ''} ${r.items.map((i) => i.descripcion).join(' ')}`).includes(t))).map(vista);
  }
  function editarItem(id, itemId, o) { const r = rec(id); const it = r.items.find((x) => x.id === itemId); if (!it) throw err('Ítem no encontrado.');
    for (const k of ['tipo', 'recinto', 'descripcion']) if (o[k] !== undefined) it[k] = o[k]; it.auto = false; log(r, `Clasificación confirmada: ${TIPOS[it.tipo]?.[0]}${it.recinto ? ' · ' + it.recinto : ''}`); save(); return vista(r); }
  function asignarUnidad(id, unidadId) { const r = rec(id); r.unidadId = unidadId; log(r, `Unidad asignada: ${nomUnidad(unidad(unidadId))}`); save(); return vista(r); }

  // avisos al propietario por WhatsApp en cada cambio importante (si el reclamo vino por WhatsApp o la unidad tiene celular)
  async function avisar(r, texto) {
    if (!wa) return false; const u = unidad(r.unidadId); const contactId = r.contacto?.contactId || null;
    try { if (contactId) { texto = (await pulir(texto)).texto; await wa.enviar(contactId, texto); const ch = r.chatId && D().chats[r.chatId]; if (ch) { (ch.mensajes ||= []).push({ dir: 'out', texto, fecha: now() }); ch.actualizado = now(); } log(r, `WhatsApp al propietario: «${texto.slice(0, 120)}${texto.length > 120 ? '…' : ''}»`); save(); return true; } } catch (e) { log(r, `No se pudo enviar el WhatsApp: ${e.message}`); save(); }
    return !!u && false;
  }
  async function mover(id, estado, { motivo, visita, contratista, nota } = {}) {
    const r = rec(id); if (!ESTADO_TXT[estado]) throw err('Estado no válido.');
    const nombre = primer(unidad(r.unidadId)?.propietario?.nombre || r.contacto?.nombre);
    let aviso = null; const V = voz(); const f = (x) => x.split('-').reverse().join('/');
    if (estado === 'no_procede') { if (!String(motivo || '').trim()) throw err('Indica el motivo.'); r.motivo = String(motivo).trim(); aviso = V.noProcede(nombre, r.folio, r.motivo); }
    if (estado === 'visita') { if (!visita?.fecha) throw err('Indica la fecha de la visita.'); r.visitas.push({ ...visita, tipo: 'diagnostico', creado: now() }); aviso = V.visita(nombre, r.folio, f(visita.fecha), visita.hora); }
    if (estado === 'orden') { if (!contratista) throw err('Indica el contratista.'); r.contratista = contratista; }
    if (estado === 'reparacion' && visita?.fecha) { r.visitas.push({ ...visita, tipo: 'trabajo', creado: now() }); aviso = V.trabajo(nombre, r.folio, f(visita.fecha), visita.hora); }
    if (estado === 'cerrado') { r.cierre = now(); aviso = V.cierre(nombre, r.folio); r.encuesta = { pendiente: true }; }
    const antes = r.estado; r.estado = estado; log(r, `${ESTADO_TXT[antes]} → ${ESTADO_TXT[estado]}${motivo ? ': ' + motivo : ''}${contratista ? ' · ' + contratista.nombre : ''}${nota ? ' · ' + nota : ''}`);
    save(); if (aviso) await avisar(r, aviso); return vista(rec(id));
  }
  // orden para el contratista: texto listo para WhatsApp (su celular)
  function ordenContratista(id) {
    const r = vista(rec(id)); const c = r.contratista; if (!c) throw err('Asigna primero el contratista.');
    const u = unidad(r.unidadId); const p = u?.propietario || {};
    const txt = `Orden de trabajo ${r.folio} · ${r.unidad?.nombre || ''}\n${r.items.map((i, n) => `${n + 1}. ${i.tipoTxt}${i.recinto ? ' · ' + i.recinto : ''}: ${i.descripcion}`).join('\n')}\nPropietario: ${p.nombre || ''} ${p.telefono || ''}\nAl terminar, envía fotos del antes y después respondiendo este mensaje.`;
    const tel = String(c.telefono || '').replace(/\D/g, ''); const t2 = tel.length === 9 ? '56' + tel : tel;
    return { texto: txt, whatsapp: t2 ? `https://wa.me/${t2}?text=${encodeURIComponent(txt)}` : null };
  }
  function contratistas() { return D().contratistas; }
  function guardarContratista(o) { const d = D(); if (!String(o.nombre || '').trim()) throw err('Indica el nombre.'); let c = o.id && d.contratistas.find((x) => x.id === o.id); if (!c) { c = { id: uid('ct') }; d.contratistas.push(c); } Object.assign(c, { nombre: o.nombre.trim(), especialidad: o.especialidad || '', telefono: o.telefono || '' }); save(); return c; }

  function tablero() {
    const rs = D().reclamos; const ab = rs.filter((r) => !['cerrado', 'no_procede'].includes(r.estado));
    const cerr = rs.filter((r) => r.estado === 'cerrado' && r.cierre); const prom = cerr.length ? Math.round(cerr.reduce((s, r) => s + (new Date(r.cierre) - new Date(r.creado)) / 864e5, 0) / cerr.length * 10) / 10 : null;
    const porEstado = ESTADOS.map(([k, t]) => ({ k, t, n: rs.filter((r) => r.estado === k).length }));
    const porTipo = Object.entries(TIPOS).map(([k, [t]]) => ({ k, t, n: rs.reduce((s, r) => s + r.items.filter((i) => i.tipo === k).length, 0) }));
    const notas = rs.filter((r) => r.encuesta?.nota).map((r) => r.encuesta.nota);
    return { total: rs.length, abiertos: ab.length, urgentes: ab.filter((r) => r.urgente).length, whatsapp: rs.filter((r) => r.canal === 'whatsapp').length, cierrePromedioDias: prom, porEstado, porTipo, satisfaccion: notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length * 10) / 10 : null,
      proyectos: D().proyectos.length, unidades: D().unidades.length };
  }

  // ---------- asistente de WhatsApp ----------
  const PALABRAS_PV = /postventa|post venta|garantia|reclamo|falla|filtra|gotea|humedad|grieta|fisura|se rompio|no funciona|desprend|mancha|problema en mi (depto|departamento|casa)|reparacion/;
  const porTelefono = (tel) => D().unidades.filter((u) => dig(u.propietario?.telefono) && dig(u.propietario.telefono) === dig(tel));
  const porRut = (rut) => D().unidades.filter((u) => cleanRut(u.propietario?.rut) && cleanRut(u.propietario.rut) === cleanRut(rut));
  const listaUnidades = (us) => us.map((u, i) => `${i + 1}. ${nomUnidad(u)}`).join('\n');
  // responde UN mensaje entrante del propietario; devuelve el texto a enviar (o null si no es de postventa)
  // ---------- cómo habla el asistente (se configura en Postventa › Asistente) ----------
  const PERSONA = { nombre: '', empresa: '', trato: 'tu', tono: 'neutro', emojis: false, largo: 'normal', horario: '', firma: '', instrucciones: '' };
  const persona = (o) => { const p = { ...PERSONA, ...(D().config.persona || {}), ...(o || {}) }; for (const k of ['nombre', 'empresa', 'horario', 'firma', 'instrucciones']) p[k] = String(p[k] || '').trim(); return p; };
  function voz(p = persona()) {
    const u = p.trato === 'usted'; const T = (tu, ud) => (u ? ud : tu); const breve = p.largo === 'breve'; const E = (x) => (p.emojis ? ' ' + x : '');
    const cap = (x) => x[0].toUpperCase() + x.slice(1);
    const momento = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'; };
    const abre = (n, resto) => (p.tono === 'formal' ? `${momento()}${n ? ', ' + n : ''}. ${cap(resto)}` : p.tono === 'cercano' ? `¡Hola${n ? ' ' + n : ''}!${E('👋')} ${cap(resto)}` : `Hola${n ? ' ' + n : ''}, ${resto}`);
    const soy = `soy ${p.nombre ? p.nombre + ', ' : 'el '}asistente de postventa${p.empresa ? ' de ' + p.empresa : ''}`;
    const gracias = p.tono === 'formal' ? 'Muchas gracias' : 'Gracias';
    const perfecto = { formal: 'Muy bien.', cercano: '¡Perfecto!' }[p.tono] || 'Perfecto.';
    const fotos = T('¿Puedes enviarme 1 a 3 fotos de la falla? Si no tienes, escribe «sin fotos».', '¿Puede enviarme 1 a 3 fotos de la falla? Si no tiene, escriba «sin fotos».') + E('📸');
    const cuenta = T('Cuéntame qué falla encontraste y en qué recinto', 'Cuénteme qué falla encontró y en qué recinto') + (breve ? '.' : ' (baño, cocina, dormitorio…).');
    const firma = (t) => t + (p.firma ? `\n\n${p.firma}` : '');
    const hora = (h) => (h ? ' a las ' + h : '');
    return {
      estado: (lineas) => (lineas.length ? `${T('Tus', 'Sus')} solicitudes:\n${lineas.join('\n')}` : T('No tienes solicitudes abiertas. Si quieres reportar algo, cuéntame qué pasó.', 'No tiene solicitudes abiertas. Si quiere reportar algo, cuénteme qué pasó.')),
      encuesta: (n, folio) => `¡${gracias}! Registramos ${T('tu', 'su')} nota ${n}/5 para ${folio}.${E('🙏')}`,
      hola: (n, unidad, conDesc) => abre(n, `${soy}. ${T('Veo tu unidad', 'Veo su unidad')} ${unidad}.`) + `\n${conDesc ? `${T('Recibí tu descripción.', 'Recibí su descripción.')} ${fotos}` : cuenta}`,
      holaElegir: (n, lista) => abre(n, `${soy}. ${T('¿Sobre cuál de tus unidades es la solicitud?', '¿Sobre cuál de sus unidades es la solicitud?')}`) + `\n${lista}\n${T('Responde', 'Responda')} con el número.`,
      holaRut: () => abre('', `${soy}. ${T('Para encontrar tu vivienda, ¿me indicas el RUT del propietario?', 'Para encontrar su vivienda, ¿me indica el RUT del propietario?')}`),
      rutNoFotos: () => `No encontré ese RUT en nuestras entregas. Igual registraremos ${T('tu', 'su')} solicitud y un ejecutivo la revisará. ${T('¿Puedes', '¿Puede')} enviarme 1 a 3 fotos y el proyecto y número de ${T('tu', 'su')} departamento? Si no ${T('tienes', 'tiene')} fotos, ${T('escribe', 'escriba')} «sin fotos».`,
      rutNoDesc: () => `No encontré ese RUT en nuestras entregas. Igual registraremos ${T('tu', 'su')} solicitud y un ejecutivo la revisará: ${T('cuéntame qué falla encontraste', 'cuénteme qué falla encontró')}, en qué proyecto y número de departamento.`,
      rutOtra: () => `No encontré ese RUT. ${T('Revísalo y escríbelo', 'Revíselo y escríbalo')} de nuevo (por ejemplo 12.345.678-5).`,
      rutOk: (n, unidad, conDesc) => `${gracias} ${n}. Encontré ${T('tu', 'su')} unidad ${unidad}. ${conDesc ? `Ya tengo ${T('tu', 'su')} descripción. ${fotos}` : cuenta}`,
      rutVarias: (lista) => `Encontré estas unidades a ${T('tu', 'su')} nombre:\n${lista}\n¿Sobre cuál es la solicitud? ${T('Responde', 'Responda')} con el número.`,
      elegirMal: () => `${T('Responde', 'Responda')} con el número de la lista, por favor.`,
      elegirOk: (conDesc) => `${perfecto} ${conDesc ? fotos : cuenta}`,
      describirCorto: () => `${T('Cuéntame', 'Cuénteme')} con un poco más de detalle qué pasó, por favor.`,
      describirConFotos: () => `¡${gracias}! Recibí las fotos. ${T('¿Quieres', '¿Quiere')} agregar algo más? Si no, ${T('escribe', 'escriba')} «listo».`,
      describirPideFotos: () => `${gracias}. ${fotos}`,
      fotosRecibidas: () => `Recibí las fotos. ¿Algo más? Si no, ${T('escribe', 'escriba')} «listo».`,
      fotosAnotado: () => `Anotado. ${T('¿Puedes', '¿Puede')} enviarme 1 a 3 fotos? Si no ${T('tienes', 'tiene')}, ${T('escribe', 'escriba')} «sin fotos».`,
      registrado: ({ folio, unidad, tipo, garantia: g, urgente }) => firma(`${p.tono === 'formal' ? 'Hemos registrado' : p.tono === 'cercano' ? '¡Listo! Registré' : 'Listo, registré'} ${T('tu', 'su')} solicitud ${folio}${unidad && !breve ? ' para ' + unidad : ''}.${E('✅')}\nTipo: ${tipo}${g ? ` (garantía ${g})` : ''}.\n${urgente ? 'La marcamos como urgente. ' : ''}${breve
        ? `${T('Te', 'Le')} escribiremos por aquí para agendar la visita. ${T('Escribe', 'Escriba')} «estado» para ver cómo va.`
        : `Un ejecutivo la revisará y ${T('te', 'le')} escribiremos por aquí para agendar la visita. Para saber cómo va, ${T('escribe', 'escriba')} «estado».`}${p.horario ? `\nHorario de atención: ${p.horario.replace(/\.$/, '')}.` : ''}`),
      noProcede: (n, folio, motivo) => firma(abre(n, `revisamos ${T('tu', 'su')} solicitud ${folio}. No corresponde a la garantía por el siguiente motivo: ${motivo}. Si ${T('tienes dudas, responde', 'tiene dudas, responda')} este mensaje.`)),
      visita: (n, folio, fecha, h) => firma(abre(n, `agendamos la visita de diagnóstico de ${T('tu', 'su')} solicitud ${folio} para el ${fecha}${hora(h)}.`) + E('📅') + (breve ? '' : ` Si no ${T('puedes, responde', 'puede, responda')} este mensaje y la reagendamos.`)),
      trabajo: (n, folio, fecha, h) => firma(abre(n, `el trabajo de ${T('tu', 'su')} solicitud ${folio} quedó agendado para el ${fecha}${hora(h)}.`) + E('🛠️')),
      cierre: (n, folio) => firma(abre(n, `cerramos ${T('tu', 'su')} solicitud ${folio}. ¿Quedó todo bien? ${T('Respóndenos', 'Respóndanos')} con una nota del 1 al 5 (5 = muy bien).`) + E('⭐')),
    };
  }
  // instrucciones propias: la IA reescribe el mensaje con el estilo pedido, sin tocar los datos.
  // Si cambia un folio, fecha, hora, número de lista o palabra clave («listo», «sin fotos»…), o tarda más de 6 s, se envía el texto normal.
  const DATOS = /PV-\d+|\d{1,2}\/\d{1,2}\/\d{4}|\b\d{1,2}:\d{2}\b|«[^»]+»|\b\d\/5\b|^\d+\. .+$/gm;
  const sinEsp = (x) => String(x).replace(/\s+/g, ' ').trim();
  async function pulir(texto, p = persona()) {
    if (!ia || !p.instrucciones || !texto) return { texto, ia: false };
    try {
      const sys = `Eres ${p.nombre || 'el asistente'} de postventa${p.empresa ? ' de ' + p.empresa : ''} y escribes por WhatsApp a propietarios de viviendas nuevas. Reescribe el mensaje que te paso siguiendo estas instrucciones del equipo:\n"""${p.instrucciones.slice(0, 1500)}"""\nReglas obligatorias: trata a la persona de ${p.trato === 'usted' ? 'usted' : 'tú'}; conserva EXACTAMENTE los folios (PV-…), fechas, horas, notas, las listas numeradas y las palabras entre «»; no agregues información, promesas, plazos ni datos que no estén en el mensaje; no quites preguntas ni pedidos; máximo ${Math.max(300, texto.length * 2)} caracteres. Responde solo con el mensaje final.`;
      const out = String(await Promise.race([ia({ system: sys, user: texto }), new Promise((_, rej) => setTimeout(() => rej(err('tiempo')), 6000))]) || '').trim();
      const faltan = (texto.match(DATOS) || []).filter((x) => !sinEsp(out).includes(sinEsp(x)));
      if (!out || faltan.length || out.length > Math.max(400, texto.length * 2.5)) return { texto, ia: false, descartado: faltan.length ? 'cambió datos: ' + faltan.join(', ') : 'respuesta no válida' };
      return { texto: out, ia: true };
    } catch (e) { return { texto, ia: false, descartado: e.message }; }
  }
  // vista previa de una conversación con la configuración (guardada o la que se está editando)
  function muestra(o) {
    const p = persona(o); const V = voz(p);
    const reg = V.registrado({ folio: 'PV-0012', unidad: 'Edificio Los Aromos · Torre A · 502', tipo: 'Instalaciones · Baño', garantia: 'vigente hasta 10/03/2030', urgente: true });
    return { persona: p, mensajes: [{ dir: 'in', texto: 'Hola, se está filtrando el baño, gotea bajo el lavamanos' }, { dir: 'out', texto: V.hola('Ana', 'Edificio Los Aromos · Torre A · 502', true) }, { dir: 'in', texto: '', fotos: 1 },
      { dir: 'out', texto: V.fotosRecibidas() }, { dir: 'in', texto: 'listo' }, { dir: 'out', texto: reg, clave: 'registrado' }, { dir: 'out', texto: V.visita('Ana', 'PV-0012', '21/10/2026', '10:30'), aviso: true }] };
  }
  async function probarEstilo(o) { const p = persona(o); const m = muestra(p).mensajes.find((x) => x.clave === 'registrado').texto; const r = await pulir(m, p); return { antes: m, ...r }; }

  async function responder(chat, msg) {
    const V = voz();
    const t = norm(msg.body); const fotos = msg.attachments || [];
    const s = chat.paso || 'nuevo';
    if (/^estado\b|como va|mi solicitud/.test(t) && chat.unidadId) {
      const rs = D().reclamos.filter((r) => r.unidadId === chat.unidadId).slice(0, 3);
      return V.estado(rs.map((r) => `• ${r.folio}: ${ESTADO_TXT[r.estado]}`));
    }
    // encuesta pendiente: una nota del 1 al 5
    const enc = D().reclamos.find((r) => r.chatId === chat.id && r.encuesta?.pendiente);
    if (enc && /^[1-5]$/.test(t)) { enc.encuesta = { nota: Number(t), fecha: now() }; log(enc, `Encuesta: ${t}/5`, 'Propietario'); save(); return V.encuesta(t, enc.folio); }
    if (s === 'nuevo' || s === 'listo') {
      let us = porTelefono(chat.telefono); if (!us.length && chat.unidadId && unidad(chat.unidadId)) us = [unidad(chat.unidadId)]; // ya se identificó antes (por RUT)
      if (!us.length && !PALABRAS_PV.test(t)) return null; // no es postventa: lo atiende el equipo comercial
      chat.borrador = { texto: PALABRAS_PV.test(t) && t.length > 25 ? msg.body : '', fotos: [...fotos] };
      if (us.length === 1) { chat.unidadId = us[0].id; chat.paso = chat.borrador.texto ? 'fotos' : 'describir'; return V.hola(primer(us[0].propietario?.nombre), nomUnidad(us[0]), !!chat.borrador.texto); }
      if (us.length > 1) { chat.opciones = us.map((u) => u.id); chat.paso = 'elegir'; return V.holaElegir(primer(us[0].propietario?.nombre), listaUnidades(us)); }
      chat.paso = 'rut'; return V.holaRut();
    }
    if (s === 'rut') {
      const us = porRut(msg.body);
      if (!us.length) { chat.intentos = (chat.intentos || 0) + 1; if (chat.intentos >= 2) { chat.paso = chat.borrador?.texto ? 'fotos' : 'describir'; chat.unidadId = null; return chat.paso === 'fotos' ? V.rutNoFotos() : V.rutNoDesc(); } return V.rutOtra(); }
      if (us.length === 1) { chat.unidadId = us[0].id; chat.paso = chat.borrador?.texto ? 'fotos' : 'describir'; return V.rutOk(primer(us[0].propietario?.nombre), nomUnidad(us[0]), chat.paso === 'fotos'); }
      chat.opciones = us.map((u) => u.id); chat.paso = 'elegir'; return V.rutVarias(listaUnidades(us));
    }
    if (s === 'elegir') { const n = Number(t.replace(/\D/g, '')); const id = chat.opciones?.[n - 1]; if (!id) return V.elegirMal();
      chat.unidadId = id; chat.paso = chat.borrador?.texto ? 'fotos' : 'describir'; return V.elegirOk(chat.paso === 'fotos'); }
    if (s === 'describir') { if (fotos.length) chat.borrador.fotos.push(...fotos); if (t.length < 4 && !fotos.length) return V.describirCorto();
      if (t) chat.borrador.texto = [chat.borrador.texto, msg.body].filter(Boolean).join('. ');
      chat.paso = 'fotos'; return chat.borrador.fotos.length ? V.describirConFotos() : V.describirPideFotos(); }
    if (s === 'fotos') {
      if (fotos.length) { chat.borrador.fotos.push(...fotos); if (!/listo|eso es todo|nada mas|enviar/.test(t)) return V.fotosRecibidas(); }
      else if (!/sin fotos|no tengo|listo|eso es todo|nada mas|no$/.test(t)) { chat.borrador.texto = [chat.borrador.texto, msg.body].filter(Boolean).join('. '); return V.fotosAnotado(); }
      // crear el reclamo
      const c = clasificar(chat.borrador.texto); const u = unidad(chat.unidadId);
      const r = await crearReclamo({ unidadId: chat.unidadId, canal: 'whatsapp', chatId: chat.id, contacto: { contactId: chat.contactId, nombre: chat.nombre, telefono: chat.telefono },
        items: [{ descripcion: chat.borrador.texto, recinto: c.recinto, tipo: c.tipo, fotos: chat.borrador.fotos, urgente: c.urgente }] });
      chat.paso = 'listo'; chat.borrador = null; chat.ultimoReclamo = r.id;
      const g = r.items[0].garantia;
      return V.registrado({ folio: r.folio, unidad: u ? nomUnidad(u) : '', tipo: `${r.items[0].tipoTxt}${r.items[0].recinto ? ' · ' + r.items[0].recinto : ''}`, garantia: g.vigente === true ? g.txt : '', urgente: c.urgente });
    }
    return null;
  }
  // revisa las conversaciones de WhatsApp y responde los mensajes nuevos (si la respuesta automática está activa)
  // una revisión a la vez (la automática y «Revisar ahora» no pueden responder dos veces el mismo mensaje)
  let revisando = null;
  async function revisarWhatsApp(o = {}) { while (revisando) await revisando.catch(() => {}); revisando = revisar1(o); try { return await revisando; } finally { revisando = null; } }
  async function revisar1({ forzar = false, excluir = [] } = {}) {
    if (!wa) throw err('WhatsApp no disponible.'); const d = D(); if (!d.config.auto && !forzar) return { activo: false, procesados: 0 };
    // con la base compartida, responde solo el equipo que activó la respuesta automática (no dos a la vez)
    if (enApi() && !forzar && !esteEquipo(d.config)) return { activo: false, procesados: 0, otroEquipo: d.config.revisaEquipo || null };
    const convs = await wa.conversaciones(); let procesados = 0, enviados = 0; const nuevos = [];
    const fuera = new Set(excluir.map(dig).filter(Boolean)); // el celular del ejecutivo (Agente por WhatsApp) no es un cliente de postventa
    for (const c of convs) {
      if (fuera.has(dig(c.phone))) continue;
      const chat = (d.chats[c.id] ||= { id: c.id, contactId: c.contactId, telefono: c.phone || '', nombre: c.fullName || c.contactName || '', paso: 'nuevo', ultimo: null, desde: now() });
      chat.contactId = c.contactId || chat.contactId; chat.telefono = c.phone || chat.telefono; chat.nombre = c.fullName || chat.nombre;
      // solo se leen los mensajes de las conversaciones que cambiaron desde la última revisión
      const marca = c.lastMessageDate ?? c.dateUpdated ?? null; if (marca != null && chat.marca === marca && !forzar) continue;
      const msgs = await wa.mensajes(c.id); chat.marca = marca; const ix = chat.ultimo ? msgs.findIndex((m) => m.id === chat.ultimo) : -1;
      const pend = (ix >= 0 ? msgs.slice(ix + 1) : msgs.filter((m) => new Date(m.dateAdded) >= new Date(chat.desde))).filter((m) => m.direction === 'inbound');
      for (const m of pend) {
        procesados++; chat.ultimo = m.id; const resp = await responder(chat, m);
        if (resp || chat.pv) { // solo se guarda la conversación de postventa (las comerciales no)
          chat.pv = true; chat.actualizado = now(); (chat.mensajes ||= []).push({ dir: 'in', texto: m.body || '', fotos: m.attachments || [], fecha: m.dateAdded || now() });
          if (resp) { const pr = await pulir(resp); await wa.enviar(chat.contactId, pr.texto); enviados++; chat.mensajes.push({ dir: 'out', texto: pr.texto, fecha: now(), ...(pr.ia ? { ia: true } : {}) }); }
          chat.mensajes = chat.mensajes.slice(-60);
        }
        if (chat.ultimoReclamo && !nuevos.includes(chat.ultimoReclamo) && chat.paso === 'listo') nuevos.push(chat.ultimoReclamo);
      }
      if (msgs.length) chat.ultimo = msgs.at(-1).id;
    }
    d.config.ultimaRevision = now(); save();
    return { activo: true, procesados, enviados, nuevos };
  }
  // cada cuánto revisar: rápido si alguien está conversando con el asistente (últimos 20 min)
  const ritmo = () => (Object.values(D().chats).some((c) => c.pv && !['nuevo', 'listo'].includes(c.paso) && Date.now() - new Date(c.actualizado || 0) < 20 * 6e4) ? 4000 : 10000);
  const config = () => ({ ...D().config, persona: persona(), ...(enApi() ? { enEsteEquipo: esteEquipo(D().config) } : {}) });
  // quién hace la revisión automática (con la API): el usuario y el equipo que la activaron
  const equipoActual = () => ({ revisaUsuarioId: inmo?.usuario?.()?.id || null, revisaEquipo: require('os').hostname().slice(0, 80) });
  const esteEquipo = (c) => { const e = equipoActual(); return !c.revisaUsuarioId || (c.revisaUsuarioId === e.revisaUsuarioId && c.revisaEquipo === e.revisaEquipo); };
  function configurar(o) { const c = D().config; const { persona: pz, ...resto } = o || {}; if (enApi() && resto.auto && !c.auto) Object.assign(c, equipoActual()); Object.assign(c, resto);
    if (pz) { const p = { ...(c.persona || {}) }; for (const k of Object.keys(PERSONA)) if (pz[k] !== undefined) p[k] = typeof PERSONA[k] === 'boolean' ? !!pz[k] : String(pz[k]).slice(0, k === 'instrucciones' ? 1500 : 120);
      if (!['tu', 'usted'].includes(p.trato)) p.trato = 'tu'; if (!['cercano', 'neutro', 'formal'].includes(p.tono)) p.tono = 'neutro'; if (!['breve', 'normal'].includes(p.largo)) p.largo = 'normal'; c.persona = p; }
    save(); return config(); }
  const PASO = { nuevo: 'Recién escribe', rut: 'Pidiendo el RUT', elegir: 'Eligiendo la unidad', describir: 'Describiendo la falla', fotos: 'Enviando fotos', listo: 'Solicitud registrada' };
  // conversaciones de postventa (las comerciales no se muestran), la más reciente primero
  const chats = () => Object.values(D().chats).filter((c) => c.pv).sort((a, b) => String(b.actualizado || '').localeCompare(String(a.actualizado || '')))
    .map((c) => { const r = c.ultimoReclamo ? D().reclamos.find((x) => x.id === c.ultimoReclamo) : null; const u = unidad(c.unidadId);
      return { id: c.id, nombre: c.nombre, telefono: c.telefono, paso: c.paso, pasoTxt: PASO[c.paso] || c.paso, enCurso: !['nuevo', 'listo'].includes(c.paso), unidad: u ? nomUnidad(u) : null, reclamo: r ? { id: r.id, folio: r.folio } : null, actualizado: c.actualizado, mensajes: c.mensajes || [], ultimo: (c.mensajes || []).at(-1) || null, ultimoIn: [...(c.mensajes || [])].reverse().find((m) => m.dir === 'in' && (m.texto || m.fotos?.length)) || null }; });

  return { ESTADOS, TIPOS, clasificar, garantia, importarFilas, importarArchivo, plantillaCSV, plantillaXLSX, proyectos: () => D().proyectos, unidades: (pid) => D().unidades.filter((u) => !pid || u.proyectoId === pid).map((u) => ({ ...u, nombre: nomUnidad(u) })),
    crearReclamo, listar, obtener: (id) => vista(rec(id)), editarItem, asignarUnidad, mover, ordenContratista, contratistas, guardarContratista, tablero, responder, revisarWhatsApp, ritmo, muestra, probarEstilo, config, configurar, chats, _reset: () => { db = null; } };
}

// conexión a WhatsApp a través de wechatia (API de conversaciones)
const OTRO_CANAL = /INSTAGRAM|FACEBOOK|EMAIL|GMB|LIVE_CHAT|TIKTOK|WEBCHAT|REVIEW/i;
function whatsappWechatia(res) {
  return {
    // 0.16.22 · solo WhatsApp: las de Instagram, Facebook o correo las lee el observador de Leads (nadie las responde)
    async conversaciones() { const j = await res.api('GET', `/conversations/search?locationId=${encodeURIComponent(res.locationId() || '')}&sortBy=last_message_date&sort=desc&limit=30`); return (j.conversations || []).filter((c) => c.phone || !OTRO_CANAL.test(String(c.lastMessageType || c.type || ''))); }, // 0.16.28 · con teléfono se mira igual (los mensajes de otros canales se filtran abajo)
    async mensajes(convId) { const j = await res.api('GET', `/conversations/${convId}/messages?limit=30`); const l = (j.messages?.messages || j.messages || []).filter((m) => !OTRO_CANAL.test(String(m.messageType || m.type || ''))); return [...l].sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded)).map((m) => ({ id: m.id, direction: m.direction, body: m.body || '', attachments: m.attachments || [], dateAdded: m.dateAdded, userId: m.userId || null, source: m.source || m.meta?.source || null, tipo: m.messageType || m.type || null })); },
    // con la cuenta de Asset, por el servidor (queda como envío de Asset y no se usa la clave local)
    async enviar(contactId, texto) { const srv = require('./wa-servidor'); if (srv.enApi()) return srv.contacto({ contactId, texto }); return res.api('POST', '/conversations/messages', { body: { type: 'WhatsApp', contactId, message: texto } }); },
  };
}

module.exports = { crear, whatsappWechatia, clasificar, garantia, TIPOS };
