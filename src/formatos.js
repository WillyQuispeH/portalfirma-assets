// Formatos propios de la corredora (0.16.15). En vez de llenar plantillas en Portalfirma, Asset toma los documentos
// de la corredora (src/formatos/<paquete>.js), los llena con lo que ya sabe y los manda a firmar con Portalfirma.
//
// La idea es que desde WhatsApp baste con «envía el mandato de CV-6101»: cada variable sabe DE DÓNDE sale
// (ficha de la propiedad, propietario del CRM, datos de la empresa) y DÓNDE se guarda si falta. Así lo que se pide
// una vez queda guardado en su lugar y no se vuelve a pedir en el siguiente documento.
// Cada formato pertenece a un hito (paso de la etapa): el paso muestra si está listo para enviar o qué le falta.
'use strict';
const fs = require('fs');
const path = require('path');
const FC = require('./ficha-campos');
const FIR = require('./firmas');

const PAQUETES = { 'the-living': () => require('./formatos/the-living') };
const err = (m) => new Error(m);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hoyISO = () => require('./hora').hoy();
const vacio = (v) => v == null || String(v).trim() === '';
const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };
const fmtNum = (n) => (n == null ? '' : Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 }));
const siNo = (v) => { if (typeof v === 'boolean') return v; const t = norm(v); if (/^(si|s|sí|yes|true|1|x|acepta|se aceptan|con)/.test(t)) return true; if (/^(no|n|false|0|sin)/.test(t)) return false; return null; };
// «Christian Rolf Goldberger Garcés» → «Christian Goldberger» (etiquetas cortas)
const corto = (n) => { const w = String(n || '').trim().split(/\s+/); return w.length >= 4 ? `${w[0]} ${w[w.length - 2]}` : w.length === 3 ? `${w[0]} ${w[1]}` : w.join(' '); };
const CONSTRUIDO = ['casa', 'departamento', 'oficina', 'local_comercial', 'industrial', 'bodega'];
const VIV = ['casa', 'departamento'];
const UNIDAD_TXT = { departamento: 'depto.', oficina: 'oficina', local_comercial: 'local', bodega: 'bodega', estacionamiento: 'estacionamiento' };

// ---------- catálogo de variables ----------
// de(x): valor crudo · txt(v,x): cómo se escribe · aplica(x) · donde: dónde se guarda si falta · k: cómo se lee lo que dicen
// x = { p, dueno, empresa, rep, op }
const ficha = (id) => (x) => FC.valor(x.p, FC.POR_ID[id]);
const VARS = {
  hoy: { t: 'Fecha', de: () => hoyISO(), txt: (v) => v.split('-').reverse().join('/'), auto: true },
  duenoNombre: { t: 'Nombre completo o razón social del propietario', de: (x) => x.dueno?.nombre || x.p.ficha?.propietarioNombre, donde: { persona: 'nombre', ficha: 'propietarioNombre' }, k: 'texto' },
  duenoRut: { t: 'RUT o Rol Único Tributario del propietario', de: (x) => x.dueno?.rut || x.p.ficha?.propietarioRut, donde: { persona: 'rut', ficha: 'propietarioRut' }, k: 'rut' },
  duenoTelefono: { t: 'Celular del propietario', de: (x) => x.dueno?.telefono || x.p.ficha?.propietarioCelular, donde: { persona: 'telefono', ficha: 'propietarioCelular' }, k: 'tel' },
  duenoEmail: { t: 'Correo del propietario', de: (x) => x.dueno?.email || x.p.ficha?.propietarioEmail, donde: { persona: 'email', ficha: 'propietarioEmail' }, k: 'email' },
  ubicacion: { t: 'Dirección (calle y número)', de: (x) => x.p.direccion, txt: (v, x) => [v, x.p.unidad ? `${UNIDAD_TXT[x.p.tipo] || 'unidad'} ${x.p.unidad}` : ''].filter(Boolean).join(', '), donde: { plano: 'direccion' }, k: 'texto',
    extra: (x) => (UNIDAD_TXT[x.p.tipo] && x.p.tipo !== 'estacionamiento' && !x.p.unidad ? `N° de ${UNIDAD_TXT[x.p.tipo].replace('.', '')}` : null) },
  comuna: { t: 'Comuna', de: (x) => x.p.comuna, donde: { plano: 'comuna' }, k: 'texto' },
  supTotal: { t: 'Superficie total (m²)', de: (x) => x.p.supTotal ?? (x.p.supUtil != null && x.p.ficha?.supTerraza != null ? Number(x.p.supUtil) + Number(x.p.ficha.supTerraza) : x.p.tipo === 'departamento' || x.p.tipo === 'oficina' ? x.p.supUtil : null), txt: (v) => fmtNum(v), donde: { plano: 'supTotal' }, k: 'num' },
  supUtil: { t: 'Superficie útil (m²)', de: (x) => x.p.supUtil, txt: (v) => fmtNum(v), aplica: (x) => CONSTRUIDO.includes(x.p.tipo), noAplica: '—', donde: { plano: 'supUtil' }, k: 'num' },
  rol: { t: 'Rol (manzana-predio)', de: (x) => x.p.rol, donde: { plano: 'rol' }, k: 'texto' },
  precioVenta: { t: 'Precio de venta', de: (x) => x.p.precioVenta?.valor, txt: (v, x) => (x.p.precioVenta?.moneda === 'UF' ? fmtNum(v) : `${x.p.precioVenta?.moneda === 'CLP' ? '$' : x.p.precioVenta?.moneda + ' '}${fmtNum(v)}`), donde: { precio: 'precioVenta' }, k: 'num' },
  precioArriendo: { t: 'Canon de arriendo', de: (x) => x.p.precioArriendo?.valor, txt: (v, x) => (x.p.precioArriendo?.moneda === 'UF' ? fmtNum(v) : `${x.p.precioArriendo?.moneda === 'CLP' ? '$' : x.p.precioArriendo?.moneda + ' '}${fmtNum(v)}`), donde: { precio: 'precioArriendo' }, k: 'num' },
  exclusividad: { t: '¿Con exclusividad?', de: ficha('exclusividad'), donde: { ficha: 'exclusividad' }, k: 'bool' },
  publicar: { t: '¿Publicar en portales y redes?', de: (x) => x.p.ficha?.publicarPortales ?? true, porDefecto: true, donde: { ficha: 'publicarPortales' }, k: 'bool' },
  mascotas: { t: '¿Se aceptan mascotas?', de: ficha('mascotas'), aplica: (x) => VIV.includes(x.p.tipo), noAplica: 'No aplica', donde: { ficha: 'mascotas' }, k: 'bool' },
  mesesGarantia: { t: 'Meses de garantía que se pedirán', de: (x) => x.p.ficha?.mesesGarantia, txt: (v) => fmtNum(v), donde: { ficha: 'mesesGarantia' }, k: 'num' },
  // representante de la empresa que firma (su correo y celular se piden una vez y quedan en la configuración)
  repEmail: { t: 'Correo del representante', de: (x) => x.rep?.email, donde: { rep: 'email' }, k: 'email', firma: true },
  repTelefono: { t: 'Celular del representante', de: (x) => x.rep?.telefono, donde: { rep: 'telefono' }, k: 'tel', firma: true },
  // 0.16.17 · orden de visita: el visitante (persona del CRM), el ejecutivo que muestra y la operación
  visitNombre: { t: 'Nombre completo o razón social del visitante', de: (x) => x.visit?.nombre, donde: { visit: 'nombre' }, k: 'texto' },
  visitRut: { t: 'RUT del visitante', de: (x) => x.visit?.rut, donde: { visit: 'rut' }, k: 'rut' },
  visitEmail: { t: 'Correo del visitante', de: (x) => x.visit?.email, donde: { visit: 'email' }, k: 'email' },
  visitTelefono: { t: 'Celular del visitante', de: (x) => x.visit?.telefono, donde: { visit: 'telefono' }, k: 'tel' },
  ejecNombre: { t: 'Tu nombre (ejecutivo que muestra la propiedad)', de: (x) => x.ejec?.nombre, donde: { ejec: 'nombre' }, k: 'texto' },
  ejecEmail: { t: 'Tu correo (ejecutivo)', de: (x) => x.ejec?.email, donde: { ejec: 'email' }, k: 'email' },
  ejecTelefono: { t: 'Tu celular (ejecutivo)', de: (x) => x.ejec?.telefono || x.ejec?.whatsapp, donde: { ejec: 'telefono' }, k: 'tel' },
  operacion: { t: '¿Venta o arriendo?', de: (x) => x.op, txt: (v) => (v === 'venta' ? 'Venta' : 'Arriendo'), donde: { op: true }, k: 'op' },
  precioOp: { t: 'Precio de la propiedad', de: (x) => (x.op ? x.p[x.op === 'venta' ? 'precioVenta' : 'precioArriendo']?.valor : null), aplica: (x) => !!x.op,
    txt: (v, x) => { const m = x.p[x.op === 'venta' ? 'precioVenta' : 'precioArriendo']?.moneda; return m === 'UF' ? `UF ${fmtNum(v)}` : m === 'USD' ? `USD ${fmtNum(v)}` : `$ ${fmtNum(v)}`; }, donde: { precioOp: true }, k: 'num' },
};

const TIPOS_FIRMA = { simple: 'Firma electrónica simple (FES)', avanzada: 'Firma electrónica avanzada (FEA)', visada: 'Visada por Portalfirma', enrolada: 'FEA enrolada' };
const TRAMITES = { none: 'Solo firma electrónica', legalization: 'Legalizada ante notario', protocolization: 'Protocolizada' };

function crear({ inmo, pf, renderPdf, dir, cambiarPropiedad, firmas = null, negocios = null, mock = false, pagador: pagadorDe = () => '' }) {
  const conf = () => inmo.config().formatos || {};
  function paquete() { const id = conf().paquete; return id && PAQUETES[id] ? PAQUETES[id]() : null; }
  const empresa = () => { const P = paquete(); if (!P) return null; const c = conf().empresa || {};
    const reps = {}; for (const [k, r] of Object.entries(P.EMPRESA.representantes)) reps[k] = { ...r, ...(c.representantes?.[k] || {}) };
    return { ...P.EMPRESA, ...c, representantes: reps }; };
  const opsDe = (p) => [p.venta && 'venta', p.arriendo && 'arriendo'].filter(Boolean);
  const dueno = (p) => FC.propietario(p);
  function formato(id) { const f = paquete()?.FORMATOS.find((x) => x.id === id); if (!f) throw err(`No existe el formato «${id}».`); return f; }
  // formatos de un hito para una propiedad (p. ej. los dos mandatos si va en venta y en arriendo)
  const deHito = (p, hito) => (paquete()?.FORMATOS || []).filter((f) => f.hito === hito && (!f.op || opsDe(p).includes(f.op)));

  // o: { personaId (visitante), op (venta/arriendo), otras (más propiedades en la orden de visita) }
  const ejecutivo = () => ({ ...(inmo.config().contacto || {}), ...(inmo.config().corredor || {}) });
  function opDe(f, p, o = {}) {
    if (f.op) return f.op; if (o.op === 'venta' || o.op === 'arriendo') return o.op;
    if (negocios && o.personaId) { const n = negocios.listar().negocios.find((x) => x.propId === p.id && x.clienteId === o.personaId && x.estado === 'abierto'); if (n) return n.tipo; }
    const ops = opsDe(p); return ops.length === 1 ? ops[0] : null;
  }
  function contexto(f, p, o = {}) { const e = empresa(); return { p, dueno: dueno(p), empresa: e, rep: e.representantes[f.rep] || {}, op: opDe(f, p, o), visit: o.personaId ? inmo.personaPorId(o.personaId) : null, ejec: ejecutivo() }; }
  // los datos de un formato para una propiedad: valor, texto y si falta (más los del firmante de la empresa)
  function datos(f, p, o = {}) {
    const x = contexto(f, p, o); const ids = [...f.usa, ...(f.firmantes.some((s) => s.rol === 'representante') ? ['repEmail', 'repTelefono'] : [])];
    const out = [];
    for (const id of ids) {
      const V = VARS[id]; if (!V) continue; const aplica = V.aplica ? V.aplica(x) : true;
      const v = aplica ? V.de(x) : null; const falta = aplica && !V.porDefecto && (V.k === 'bool' ? v == null : vacio(v));
      out.push({ id: V.firma ? `${id}_${f.rep}` : id, t: id.startsWith('rep') ? `${V.t.replace(' del representante', '')} de ${corto(x.rep.nombre) || 'el representante'} (representante)` : V.t, ayuda: id.startsWith('rep') ? x.rep.nombre : null, valor: v ?? null, aplica, falta, auto: !!V.auto, porDefecto: !!V.porDefecto && x.p.ficha?.publicarPortales == null,
        txt: !aplica ? V.noAplica || '' : v == null ? '' : V.k === 'bool' ? (v ? 'Sí' : 'No') : V.txt ? V.txt(v, x) : String(v), firma: !!V.firma });
      const ex = V.extra?.(x); if (ex) out.push({ id: 'unidad', t: ex, valor: null, aplica: true, falta: true, txt: '' });
    }
    if (!dueno(p) && out.some((d) => d.id === 'duenoRut' && !d.falta) && !inmo.validRut(out.find((d) => d.id === 'duenoRut').valor)) Object.assign(out.find((d) => d.id === 'duenoRut'), { falta: true, t: 'RUT válido del propietario' });
    // 0.16.16 · que el enlace de firma llegue: correo y celular de cada firmante revisados (y que no se repitan entre ellos)
    for (const d of out) if (!d.falta && d.valor && /Email|Telefono/.test(d.id)) {
      const r = /Email/.test(d.id) ? FIR.correo(d.valor) : FIR.celular(d.valor);
      if (!r.ok) Object.assign(d, { falta: true, motivo: `${d.valor}: ${r.motivo}`, sugerencia: r.sugerencia || null });
    }
    const de = out.find((d) => d.id === 'duenoEmail'); const re = out.find((d) => /^repEmail/.test(d.id));
    if (de && re && !de.falta && !re.falta && String(de.valor).toLowerCase() === String(re.valor).toLowerCase()) Object.assign(de, { falta: true, motivo: `${de.valor} es el mismo correo del representante: el enlace del propietario le llegaría a él` });
    return out;
  }
  function preparar({ formatoId, propId, personaId = null, op = null, otras = [] }) {
    const p = inmo.obtener(propId); if (!p) throw err('No encontré la propiedad.');
    const f = formato(formatoId); const o = { personaId, op, otras }; const d = datos(f, p, o);
    for (const id of otras || []) { const q = inmo.obtener(id); if (!q) continue; for (const x of datos(f, q, o).filter((y) => y.falta && !/^(visit|ejec)/.test(y.id))) d.push({ ...x, id: `${x.id}@${q.id}`, t: `${x.t} (${q.codigo})` }); }
    return { formato: { id: f.id, titulo: f.titulo, descripcion: f.descripcion, hito: f.hito, op: f.op }, propiedad: { id: p.id, codigo: p.codigo, titulo: p.titulo },
      datos: d.filter((x) => !x.firma).map((x) => (/^precio/.test(x.id) && x.txt && p[x.id]?.moneda === 'UF' ? { ...x, txt: 'UF ' + x.txt } : x)), faltan: d.filter((x) => x.falta).map((x) => ({ id: x.id, t: x.t, motivo: x.motivo || null, ayuda: x.ayuda || null, sugerencia: x.sugerencia || null })), listo: !d.some((x) => x.falta),
      firmantes: firmantes(f, p, o).map((s) => ({ titulo: s.titulo, calidad: s.alias, nombre: s.nombre, rut: s.rut, email: s.email, telefono: s.telefono })), op: contexto(f, p, o).op, personaId,
      empresa: esEmpresa(p), firma: firmaDe(f), tiposFirma: TIPOS_FIRMA, tramites: TRAMITES };
  }
  // tipo de firma y trámite de cada formato: lo del paquete, o lo que eligió la cuenta
  function firmaDe(f) { const c = conf().firma?.[f.id] || {}; const tipo = c.tipo || f.firma?.tipo || 'simple'; const tramite = c.tramite || f.firma?.tramite || 'none';
    return { tipo, tramite, tipoTxt: TIPOS_FIRMA[tipo], tramiteTxt: TRAMITES[tramite] }; }
  const esEmpresa = (p) => { const d = dueno(p); return d ? inmo.esEmpresa(d) : inmo.esEmpresa({ nombre: p.ficha?.propietarioNombre, rut: p.ficha?.propietarioRut }); };
  // estado de un hito para el panel de etapas: { formatos:[{id,titulo,faltan,listo}] } o null si no hay formatos propios
  function estadoHito(p, hito) { if (!paquete() || hito === 'orden') return null; const fs_ = deHito(p, hito); if (!fs_.length) return null;
    return fs_.map((f) => { const d = datos(f, p); return { id: f.id, titulo: f.titulo, op: f.op, faltan: d.filter((x) => x.falta).map((x) => x.motivo ? `${x.t} (${x.motivo})` : x.t), listo: !d.some((x) => x.falta) }; }); }

  // ---------- completar: cada dato vuelve a su lugar (ficha, propietario o empresa) ----------
  function leer(V, raw) {
    if (V.k === 'bool') { const b = siNo(raw); if (b == null) throw err(`«${V.t}»: responde sí o no.`); return b; }
    if (V.k === 'num') { const n = num(raw); if (n == null) throw err(`«${V.t}»: debe ser un número.`); return n; }
    const s = String(raw ?? '').trim(); if (!s) return null;
    if (V.k === 'rut' && !inmo.validRut(s)) throw err(`El RUT «${s}» no es válido.`);
    if (V.k === 'email') { const c = FIR.correo(s); if (!c.ok) throw err(`El correo «${s}»: ${c.motivo}`); return c.valor; }
    if (V.k === 'tel') { const t = FIR.celular(s); if (!t.ok) throw err(`El celular «${s}» ${t.motivo}.`); return t.valor; }
    return V.k === 'rut' ? inmo.fmtRut(s) : s;
  }
  async function completar({ propId, formatoId, valores = {}, personaId = null, op = null, otras = [] }) {
    const p0 = inmo.obtener(propId); if (!p0) throw err('No encontré la propiedad.'); const f = formatoId ? formato(formatoId) : null;
    // datos de otras propiedades de la orden de visita: «id@propiedad»
    const porProp = {}; for (const [k, v] of Object.entries(valores || {})) { const [id, pid] = k.split('@'); (porProp[pid || p0.id] ||= {})[id] = v; }
    const guardado = []; const vis = {}; const ej = {};
    for (const [pid, vals] of Object.entries(porProp)) {
    const p = inmo.obtener(pid); if (!p) continue;
    const plano = {}; const fi = {}; const per = {}; const rep = {};
    for (const [id, raw] of Object.entries(vals)) {
      if (raw == null || raw === '') continue;
      if (id === 'operacion') { const t = norm(raw); op = /arri/.test(t) ? 'arriendo' : /vent|compr/.test(t) ? 'venta' : op; guardado.push('Operación'); continue; }
      if (id === 'precioOp') { const k = (op || opDe(f || {}, p, { personaId, op })) === 'venta' ? 'precioVenta' : 'precioArriendo'; const n = num(raw); if (n == null) throw err('El precio debe ser un número.'); plano[k] = { ...(p[k] || {}), valor: n, moneda: p[k]?.moneda || (k === 'precioVenta' ? 'UF' : 'CLP') }; guardado.push('Precio'); continue; }
      if (id === 'unidad') { plano.unidad = String(raw).trim(); guardado.push('N° de unidad'); continue; }
      const [base, repK] = id.split('_'); const V = VARS[base]; if (!V || !V.donde) continue; const v = leer(V, raw); const d = V.donde;
      if (d.persona && dueno(p)) per[d.persona] = v; else if (d.ficha) fi[d.ficha] = v;
      else if (d.plano) plano[d.plano] = v;
      else if (d.precio) plano[d.precio] = { ...(p[d.precio] || {}), valor: v, moneda: p[d.precio]?.moneda || (d.precio === 'precioVenta' ? 'UF' : 'CLP') };
      else if (d.rep) { const k = repK || (f || deHito(p, 'mandato')[0])?.rep; if (k) (rep[k] ||= {})[d.rep] = v; }
      else if (d.visit) vis[d.visit] = v;
      else if (d.ejec) ej[d.ejec] = v;
      guardado.push(V.t);
    }
    if (Object.keys(per).length) { const c = dueno(p); inmo.guardarPersona({ ...c, ...per }); }
    if (Object.keys(rep).length) configurar({ representantes: rep });
    if (Object.keys(plano).length || Object.keys(fi).length) await cambiarPropiedad(p.id, { ...plano, ...(Object.keys(fi).length ? { ficha: fi } : {}) });
    }
    if (Object.keys(vis).length) { const c = personaId ? inmo.personaPorId(personaId) : null; if (!c) throw err('Indica primero quién es el visitante.'); inmo.guardarPersona({ ...c, ...vis }); }
    if (Object.keys(ej).length) inmo.guardarConfig({ corredor: { ...(inmo.config().corredor || {}), ...ej } });
    return { guardado, op, ...(f ? preparar({ formatoId: f.id, propId: p0.id, personaId, op, otras }) : {}) };
  }

  // ---------- documento ----------
  function firmantes(f, p, o = {}) {
    const x = contexto(f, p, o); const d = dueno(p);
    return f.firmantes.map((s) => (s.rol === 'visitante' ? { ...s, personaId: x.visit?.id || null, nombre: x.visit?.nombre || '', rut: x.visit?.rut || '', email: x.visit?.email || '', telefono: x.visit?.telefono || '' }
      : s.rol === 'propietario'
      ? { ...s, personaId: d?.id || null, nombre: d?.nombre || p.ficha?.propietarioNombre || '', rut: d?.rut || p.ficha?.propietarioRut || '', email: d?.email || p.ficha?.propietarioEmail || '', telefono: d?.telefono || p.ficha?.propietarioCelular || '' }
      : { ...s, personaId: null, nombre: x.rep.nombre || '', rut: x.rep.rut || '', email: x.rep.email || '', telefono: x.rep.telefono || '' }));
  }
  // fotos para el PDF: la primera de cada propiedad, embebida (si no hay o no carga, queda en blanco)
  async function fotoData(u) {
    if (!u) return '';
    try {
      if (/^pffoto:\/\/f\//.test(u)) { const r = decodeURIComponent(u.replace(/^pffoto:\/\/f\//, '')); const fp = path.resolve(dir(), 'fotos', r); if (!fp.startsWith(path.resolve(dir(), 'fotos'))) return ''; return 'data:image/jpeg;base64,' + fs.readFileSync(fp).toString('base64'); }
      if (/^data:image\//.test(u)) return u;
      if (/^https:\/\//.test(u) && !mock) { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 6000); const r = await fetch(u, { signal: ac.signal }); clearTimeout(t); if (!r.ok) return ''; const b = Buffer.from(await r.arrayBuffer()); return `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${b.toString('base64')}`; }
    } catch {}
    return '';
  }
  // valor de la UF del día (para mostrar el equivalente en pesos); si no se puede, no se muestra
  let UF = null;
  async function ufHoy() {
    if (UF && UF.f === hoyISO()) return UF.v; if (mock) return 39500;
    try { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 5000); const r = await fetch('https://mindicador.cl/api/uf', { signal: ac.signal }); clearTimeout(t); const j = await r.json(); const v = Number(j?.serie?.[0]?.valor); if (v > 1000) { UF = { f: hoyISO(), v }; return v; } } catch {}
    return null;
  }
  const TIPO_TXT = { casa: 'Casa', departamento: 'Departamento', oficina: 'Oficina', sitio: 'Sitio', local_comercial: 'Local comercial', industrial: 'Industrial', agricola: 'Agrícola', parcela: 'Parcela', estacionamiento: 'Estacionamiento', terreno_construccion: 'Terreno', bodega: 'Bodega' };
  async function fichaOV(p, op, uf) {
    const k = op === 'venta' ? 'precioVenta' : 'precioArriendo'; const pr = p[k] || {}; const fi = p.ficha || {};
    const precio = pr.valor == null ? '' : pr.moneda === 'UF' ? `UF ${fmtNum(pr.valor)}` : pr.moneda === 'USD' ? `USD ${fmtNum(pr.valor)}` : `$ ${fmtNum(pr.valor)}`;
    const clp = pr.moneda === 'UF' && uf && pr.valor ? `$ ${Math.round(pr.valor * uf).toLocaleString('es-CL')}` : '';
    const sector = p.sector || fi.sector || '';
    const r = [];
    if (p.dormitorios != null) r.push(['Dormitorios', esc(p.dormitorios)]); if (p.banos != null) r.push(['Baños', esc(p.banos)]);
    if (p.supUtil != null) r.push(['Sup. útil', `${fmtNum(p.supUtil)} m²`]); if (p.supTotal != null && p.tipo !== 'departamento') r.push(['Sup. total', `${fmtNum(p.supTotal)} m²`]);
    if (fi.enCondominio || fi.condominioCerrado) r.push(['En condominio', '✔']); if (fi.orientacion) r.push(['Orientación', esc(fi.orientacion)]);
    if (fi.piscina) r.push(['Piscina', '✔']); if (p.estacionamientos) r.push(['Estacionamientos', esc(p.estacionamientos)]);
    if (p.gastosComunes) r.push(['GGCC', `$ ${fmtNum(p.gastosComunes)}`]);
    const desc = String(p.descripcion || '').replace(/\s+/g, ' ').trim();
    return { foto: await fotoData((p.fotos || [])[0]), tipo: esc(TIPO_TXT[p.tipo] || p.tipo || ''), direccion: esc([p.direccion, p.unidad ? `${UNIDAD_TXT[p.tipo] || 'unidad'} ${p.unidad}` : '', p.comuna].filter(Boolean).join(', ') + (sector ? ` (${sector})` : '')),
      codigo: esc(p.codigo || ''), opTxt: op === 'venta' ? 'Venta' : 'Arriendo', precio: esc(precio), clp: esc(clp), rasgos: r.slice(0, 6), desc: esc(desc.length > 260 ? desc.slice(0, 257).replace(/\s\S*$/, '') + ' ...' : desc) };
  }
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']; const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fechaLarga = (d = new Date()) => `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  async function html(f, p, o = {}) {
    if (f.hito === 'orden') {
      const x = contexto(f, p, o); const uf = await ufHoy(); const props = [p, ...(o.otras || []).map((id) => inmo.obtener(id)).filter(Boolean)];
      return f.html({ numero: o.numero || (conf().ovNumero || 1), fecha: fechaLarga(), visit: { nombre: esc(x.visit?.nombre), rut: esc(x.visit?.rut), email: esc(x.visit?.email), telefono: esc(x.visit?.telefono) },
        ejec: { nombre: esc(x.ejec.nombre), email: esc(x.ejec.email), telefono: esc(x.ejec.telefono || x.ejec.whatsapp) }, props: await Promise.all(props.map((q) => fichaOV(q, opDe(f, q, o) || x.op, uf))) }, empresa());
    }
    const x = contexto(f, p, o); const v = {};
    for (const d of datos(f, p, o)) v[d.id] = d.id === 'publicar' || d.id === 'exclusividad' ? !!d.valor : esc(d.txt);
    v.trato = esEmpresa(p) ? '' : f.op === 'arriendo' ? 'Don/Doña' : 'Don';   // empresa: va la razón social sola
    v.mascotasTxt = VIV.includes(p.tipo) ? (x.p.ficha?.mascotas == null ? '' : x.p.ficha.mascotas ? 'Sí' : 'No') : 'No aplica';
    v.etiquetaPrecioVenta = p.precioVenta?.moneda && p.precioVenta.moneda !== 'UF' ? 'Precio Referencial' : 'Precio Referencial (UF)';
    v.etiquetaPrecioArriendo = p.precioArriendo?.moneda && p.precioArriendo.moneda !== 'UF' ? 'Canon Arriendo Referencial' : 'Canon Arriendo Referencial (UF)';
    const e = { ...x.empresa, rep: { nombre: esc(x.rep.nombre), rut: esc(x.rep.rut) } };
    return f.html(v, e);
  }
  const carpeta = () => { const d = path.join(dir(), 'documentos'); fs.mkdirSync(d, { recursive: true }); return d; };
  const archivo = (f, p, borrador) => path.join(carpeta(), `${p.codigo} - ${f.titulo}${borrador ? ' (borrador)' : ''} - ${hoyISO()}-${Date.now().toString(36).slice(-4)}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
  const cabecera = (f) => (f.sinCabecera ? '' : paquete().CABECERA);
  async function vistaPrevia({ formatoId, propId, personaId = null, op = null, otras = [] }) { const f = formato(formatoId); const p = inmo.obtener(propId); const a = archivo(f, p, true); fs.writeFileSync(a, await renderPdf(await html(f, p, { personaId, op, otras }), { cabecera: cabecera(f) })); return a; }

  async function enviar({ formatoId, propId, email, personaId = null, op: opIn = null, otras = [] }) {
    const f = formato(formatoId); const p = inmo.obtener(propId); if (!p) throw err('No encontré la propiedad.');
    const o = { personaId, op: opIn, otras }; const pr = preparar({ formatoId, propId, ...o });
    if (!pr.listo) throw err('Faltan datos: ' + pr.faltan.map((x) => (x.motivo ? `${x.t} (${x.motivo})` : x.t)).join(', ') + '.');
    const esOrden = f.hito === 'orden'; if (esOrden) o.numero = conf().ovNumero || 1;
    const fir = firmantes(f, p, o); const a = archivo(f, p); const bytes = await renderPdf(await html(f, p, o), { cabecera: cabecera(f) }); fs.writeFileSync(a, bytes);
    const ing = await pf.ingest(Buffer.from(bytes).toString('base64'), path.basename(a));
    const docId = ing?.document_id || ing?.fileId || ing?.id; if (!docId) throw err('Portalfirma no recibió el PDF' + (ing?.message ? ': ' + ing.message : '.'));
    const pagador = String(email || pagadorDe() || inmo.config().corredor?.email || inmo.config().contacto?.email || '').trim(); if (!pagador) throw err('Falta el correo de tu cuenta de Portalfirma.');
    const fm = firmaDe(f);
    // propietario empresa: firman personas; Portalfirma las identifica en el documento (su representante) — Asset no las arma
    let sig = fir;
    if (!esOrden && esEmpresa(p)) {
      let ex = null; try { ex = await pf.extractSigners(docId); } catch {}
      const rep = fir.find((s) => s.rol === 'representante'); const otros = (ex?.firmantes || ex?.signatories || []).filter((x) => x.rut && inmo.fmtRut(x.rut) !== inmo.fmtRut(rep?.rut || '') && inmo.fmtRut(x.rut) !== inmo.fmtRut(fir[0].rut));
      if (!otros.length) throw err(`El propietario es una empresa (${fir[0].nombre}). Portalfirma no identificó en el documento a la persona que firma por ella: envíalo desde Portalfirma («Enviar a firmar»), donde se indica el representante.`);
      const dd = fir.find((s) => s.rol === 'propietario');
      sig = [...otros.map((x) => ({ ...dd, rut: x.rut, nombre: x.fullName || x.nombre, email: x.email || dd.email, telefono: x.phone || dd.telefono, alias: dd.alias })), ...fir.filter((s) => s.rol !== 'propietario')];
    }
    const r = await pf.sendToSign({ document_id: docId, email: pagador, protocolization: fm.tramite, signatories: sig.map((s) => ({ rut: inmo.fmtRut(s.rut), fullName: s.nombre, email: s.email, phone: s.telefono, alias: s.alias, typeSign: fm.tipo })) });
    const op = FIR.operacionDe(r); const msg = typeof r?.message === 'string' ? r.message : '';
    if (op == null) throw err(/status code (\d+)/.test(msg) ? `Portalfirma no pudo crear la operación (error ${/status code (\d+)/.exec(msg)[1]}). Revisa «Mis operaciones» antes de reintentar.` : msg || 'Portalfirma no devolvió el número de operación.');
    if (esOrden) inmo.guardarConfig({ formatos: { ...conf(), ovNumero: o.numero + 1 } });
    const doc = { operacion: op, plantilla: f.titulo, plantillaId: null, origen: 'formato', formato: f.id, hito: f.hito, op: f.op || pr.op, numero: o.numero || null, archivo: a, fecha: new Date().toISOString(), estado: 'en_firma',
      tipoFirma: fm.tipo, tramite: fm.tramite,
      firmantes: sig.map((s) => ({ nombre: s.nombre, rut: inmo.fmtRut(s.rut), rol: s.alias, titulo: s.titulo, personaId: s.personaId || null, email: s.email, telefono: s.telefono, firmo: false })), negocioId: null };
    firmas?.registrar({ operacion: op, nombre: esOrden ? `${f.titulo} nº ${o.numero}` : f.titulo, propId: p.id, firmantes: sig.map((s) => ({ nombre: s.nombre, rut: s.rut, alias: s.alias, email: s.email, telefono: s.telefono })), origen: 'formato', tipoFirma: fm.tipo, tramite: fm.tramite });
    for (const q of [p, ...(o.otras || []).map((id) => inmo.obtener(id)).filter(Boolean)]) inmo.parchear(q.id, (pp) => { pp.firmas ||= []; pp.firmas.unshift({ ...doc }); pp.firmas.length = Math.min(pp.firmas.length, 100); }, `«${f.titulo}»${esOrden ? ' nº ' + o.numero : ''} enviado a firmar (operación ${op})`);
    const d = esOrden ? (personaId ? inmo.personaPorId(personaId) : null) : dueno(p); if (d) inmo.registrar(d.id, `Firma «${f.titulo}» · operación ${op}`, { ref2: p.id });
    return { ok: true, operacion: op, documento: f.titulo, numero: o.numero || null, archivo: a, propiedad: { id: p.id, codigo: p.codigo }, firmantes: doc.firmantes, pago: r?.payment || null };
  }

  function configurar(o = {}) {
    const c = conf(); const n = { ...c };
    if (o.paquete !== undefined) n.paquete = o.paquete && PAQUETES[o.paquete] ? o.paquete : null;
    if (o.representantes) { const e = c.empresa || {}; const reps = { ...(e.representantes || {}) };
      for (const [k, r] of Object.entries(o.representantes)) { const x = {}; if (r.email != null) x.email = String(r.email).trim(); if (r.telefono != null) x.telefono = String(r.telefono).trim();
        if (x.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email)) throw err(`El correo «${x.email}» no es válido.`); reps[k] = { ...(reps[k] || {}), ...x }; }
      n.empresa = { ...e, representantes: reps }; }
    if (o.firma) { n.firma = { ...(c.firma || {}) }; for (const [id, x] of Object.entries(o.firma)) n.firma[id] = { ...(n.firma[id] || {}), ...(x.tipo && TIPOS_FIRMA[x.tipo] ? { tipo: x.tipo } : {}), ...(x.tramite && TRAMITES[x.tramite] ? { tramite: x.tramite } : {}) }; }
    inmo.guardarConfig({ formatos: n }); return estado();
  }
  function estado() { const P = paquete(); return { paquete: P ? P.id : null, nombre: P?.nombre || null, disponibles: Object.keys(PAQUETES).map((k) => ({ id: k, nombre: PAQUETES[k]().nombre })),
    empresa: P ? empresa() : null, formatos: P ? P.FORMATOS.map((f) => ({ id: f.id, titulo: f.titulo, hito: f.hito, op: f.op, descripcion: f.descripcion, firma: firmaDe(f) })) : [], tiposFirma: TIPOS_FIRMA, tramites: TRAMITES }; }

  return { activo: () => !!paquete(), estado, configurar, deHito: (p, h) => deHito(p, h).map((f) => ({ id: f.id, titulo: f.titulo, op: f.op })), estadoHito, preparar, completar, vistaPrevia, enviar, html: (id, propId, o = {}) => html(formato(id), inmo.obtener(propId), o || {}), tiene: (id) => !!paquete()?.FORMATOS.some((f) => f.id === id), VARS };
}

module.exports = { crear, VARS };
