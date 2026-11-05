// Documentos inmobiliarios desde las plantillas de la cuenta (Notaría virtual de Portalfirma, template_manage_tools):
// lista las plantillas del rubro, arma el formulario prellenado con la propiedad, sus personas y los datos del corredor,
// genera el documento, lo envía a firmar y lo deja ligado a la propiedad (y al negocio). El seguimiento usa
// process_detail_get_by_operation, igual que «Mis operaciones».
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const err = (m) => new Error(m);
const hoy = () => require('./hora').hoy();
const precioTxt = (p) => (!p || p.valor == null ? '' : p.moneda === 'CLP' ? '$' + Number(p.valor).toLocaleString('es-CL') : `${p.moneda} ${Number(p.valor).toLocaleString('es-CL')}`);
const json = (r) => { if (r.isError) throw err('Portalfirma: ' + String(r.text).slice(0, 240)); try { return JSON.parse(r.text); } catch { return null; } };

// Búsquedas que cubren los documentos del rubro; se descartan vehículos y maquinaria
const CONSULTAS = ['contrato de arriendo de vivienda', 'promesa de compraventa bien raíz carta oferta', 'corretaje orden de visita acta de visita', 'acta de entrega y recepción de propiedad', 'poder mandato administración de propiedad arriendo'];
const FUERA = /veh[ií]culo|maquinaria|automotr/i;

// Rol de cada grupo firmante según su nombre en la plantilla
function rolDeGrupo(g) {
  const k = norm(g);
  if (/corredor|corredora|agente|inmobiliaria/.test(k)) return 'corredor';
  if (/codeudor|aval|fiador/.test(k)) return 'codeudor';
  if (/mandante|propietari|arrendador|vendedor|dueno|otorgante|promitente-vendedor/.test(k)) return 'propietario';
  if (/arrendatari|comprador|visitante|interesad|oferente|cliente|promitente-comprador|mandatari/.test(k)) return 'cliente';
  return null;
}
const ROL_TXT = { propietario: 'Propietario', cliente: 'Cliente', codeudor: 'Codeudor / aval', corredor: 'Corredor (tú)' };
// Campo de persona según el nombre de la variable
function campoPersona(v) {
  const k = norm(v.name + ' ' + v.label);
  if (/\brut\b|^rut/.test(k)) return 'rut';
  if (/correo|email|mail/.test(k)) return 'email';
  if (/telefono|fono|celular|movil/.test(k)) return 'telefono';
  if (/estado-civil|estado civil/.test(k)) return 'estadoCivil';
  if (/profesion|oficio/.test(k)) return 'profesion';
  if (/nacionalidad/.test(k)) return 'nacionalidad';
  if (/direcc|domicilio/.test(k)) return 'direccion';
  if (/razon|corredora|inmobiliaria/.test(k)) return 'razonSocial';
  if (/nombre/.test(k)) return 'nombre';
  return null;
}

function crear({ inmo, negocios, pf, firmas = null }) {
  // 0.16.6 · las plantillas son de la cuenta con la que se inició sesión: el caché va por cuenta (nunca se mezclan)
  let cache = null;
  const cuenta = () => { try { return require('crypto').createHash('sha256').update(String(pf.accessToken?.() || '')).digest('hex').slice(0, 16); } catch { return ''; } };
  // listado propio de la cuenta (acción «list» del MCP, si el servidor ya la tiene); si no, null y se usa la búsqueda
  async function listarCuenta() {
    try { const r = await pf.callRaw('template_manage_tools', { action: 'list' }); if (r?.isError) return null; const j = json(r);
      const l = (Array.isArray(j) ? j : j?.data || j?.results || j?.templates || []); return Array.isArray(l) && l.length ? l.filter((t) => t.template_version_id && !FUERA.test(t.name + ' ' + (t.description || ''))) : null;
    } catch { return null; }
  }
  function limpiar() { cache = null; }
  async function buscar(q, k = 10) { const j = json(await pf.callRaw('template_manage_tools', { action: 'search', query: q, top_k: k })); return (Array.isArray(j) ? j : j?.results || []).filter((t) => t.template_version_id && !FUERA.test(t.name + ' ' + (t.description || ''))); }
  const corta = (t) => ({ id: t.template_version_id, nombre: String(t.name || '').trim(), descripcion: String(t.description || '').replace(/\s+/g, ' ').slice(0, 220) });

  function operacionDe(p, nombrePlantilla) {
    const n = norm(nombrePlantilla);
    if (/arriendo|arrendamiento|entrega y recepcion/.test(n)) return 'arriendo';
    if (/compraventa|promesa|carta oferta|venta/.test(n)) return 'venta';
    return p?.arriendo && !p?.venta ? 'arriendo' : p?.venta && !p?.arriendo ? 'venta' : p?.arriendo ? 'arriendo' : 'venta';
  }

  // Plantillas del rubro inmobiliario (o las que respondan a un texto), ordenadas para la propiedad
  async function plantillas({ texto, propId } = {}) {
    let l;
    if (texto && texto.trim().length > 1) l = await buscar(texto.trim(), 12);
    else {
      const yo = cuenta();
      if (!cache || cache.cuenta !== yo || Date.now() - cache.t > 10 * 60000) {
        let todas = await listarCuenta();
        if (!todas) {
          const rs = await Promise.all(CONSULTAS.map((q) => buscar(q, 10).catch(() => [])));
          const vistos = new Map(); for (const r of rs) for (const t of r) if (!vistos.has(t.template_version_id)) vistos.set(t.template_version_id, t);
          todas = [...vistos.values()];
        }
        cache = { t: Date.now(), cuenta: yo, l: todas };
      }
      l = cache.l;
    }
    const p = propId ? inmo.obtener(propId) : null; const ops = p ? ['venta', 'arriendo'].filter((o) => p[o]) : [];
    const puntaje = (t) => { const n = norm(t.name); let s = 0; if (ops.includes('arriendo') && /arriendo|entrega/.test(n)) s += 2; if (ops.includes('venta') && /compraventa|promesa|oferta/.test(n)) s += 2; if (/visita|corretaje/.test(n)) s += 1; if (p?.tipo === 'local_comercial' || p?.tipo === 'oficina') { if (/local|oficina|empresa/.test(n)) s += 2; } else if (/local comercial|empresa a empresa|estacionamiento o bodega|pieza/.test(n)) s -= 1; return s; };
    return (texto ? l : [...l].sort((a, b) => puntaje(b) - puntaje(a))).map(corta);
  }

  // Personas sugeridas para cada rol, según los vínculos de la propiedad y el negocio abierto
  function sugeridas(p, negocio) {
    const v = p?.vinculos || []; const por = (roles) => v.filter((x) => roles.includes(x.rol)).map((x) => x.personaId);
    return { propietario: por(['propietario'])[0] || null, cliente: negocio?.clienteId || por(['arrendatario', 'comprador'])[0] || por(['interesado']).slice(-1)[0] || null, codeudor: por(['codeudor'])[0] || null };
  }

  function valorInmueble(v, p, op) {
    const k = norm(v.name + ' ' + v.label);
    if (/fecha/.test(k)) return [hoy(), 'hoy'];
    if (!p) return [null];
    if (/corredor/.test(k)) { const c = { ...(inmo.config().contacto || {}), ...(inmo.config().corredor || {}) }; const pc = p.corredor || {};
      if (/mail|correo/.test(k)) return [pc.email || c.email || null, pc.email ? 'propiedad' : 'cuenta'];
      if (/telefono|fono|celular/.test(k)) return [pc.telefono || c.telefono || c.whatsapp || null, 'cuenta'];
      if (/nombre/.test(k)) return [pc.nombre || c.nombre || null, pc.nombre ? 'propiedad' : 'cuenta']; }
    if (v.kind === 'image' || v.input_type === 'image' || /imagen|foto/.test(k)) return [(p.fotos || []).find((u) => /^https:\/\//.test(u)) || null, 'propiedad'];
    if (/ciudad/.test(k)) return [inmo.config().ciudad || 'Santiago', 'cuenta'];
    if (/comuna/.test(k)) return [p.comuna, 'propiedad'];
    if (/region/.test(k)) return [p.region, 'propiedad'];
    if (/\brol\b|rol-de|avaluo/.test(k)) return [p.rol, 'propiedad'];
    if (/codigo/.test(k)) return [p.codigo, 'propiedad'];
    if (/tipo-de-gestion|operacion|gestion/.test(k)) return [op, 'propiedad'];
    if (/tipo-de-(inmueble|propiedad)|tipo de (inmueble|propiedad)|^tipo\b/.test(k)) return [String(p.tipo || '').replace(/_/g, ' '), 'propiedad'];
    if (/gastos-comunes|gastos comunes/.test(k)) return [p.gastosComunes ? '$' + Number(p.gastosComunes).toLocaleString('es-CL') : null, 'propiedad'];
    if (/canon|renta|arriendo-mensual|monto-del-arriendo/.test(k)) return [precioTxt(p.precioArriendo), 'propiedad'];
    if (/precio-venta|precio venta/.test(k)) return [precioTxt(p.precioVenta) || precioTxt(p.precioArriendo), 'propiedad'];
    if (/precio-arriendo|precio arriendo/.test(k)) return [precioTxt(p.precioArriendo) || precioTxt(p.precioVenta), 'propiedad'];
    if (/precio|valor-de-venta|valor/.test(k)) return [precioTxt(op === 'arriendo' ? p.precioArriendo : p.precioVenta) || precioTxt(p.precioVenta || p.precioArriendo), 'propiedad'];
    if (/superficie|m2|metros/.test(k)) return [p.supTotal || p.supUtil ? `${p.supTotal || p.supUtil} m²` : null, 'propiedad'];
    if (/dormitorio/.test(k)) return [p.dormitorios != null ? String(p.dormitorios) : null, 'propiedad'];
    if (/bano/.test(k)) return [p.banos != null ? String(p.banos) : null, 'propiedad'];
    if (/estacionamiento/.test(k)) return [p.estacionamientos != null ? String(p.estacionamientos) : null, 'propiedad'];
    if (/bodega/.test(k)) return [p.bodegas != null ? String(p.bodegas) : null, 'propiedad'];
    if (/direcc|domicilio|ubicacion/.test(k)) return [[p.direccion, p.unidad ? 'depto. ' + p.unidad : ''].filter(Boolean).join(', '), 'propiedad'];
    return [null];
  }

  // Pide el formulario de la plantilla. Con property_id, Portalfirma llena los datos de la propiedad; si la propiedad
  // no está asignada al usuario de la sesión (o no viene de Portalfirma), se pide sin ella y se llena con la ficha local.
  async function getForms(plantilla, p) {
    let pfId = p?.origen?.sistema === 'portalfirma' ? p.origen.id : null; let aviso = null;
    let r = await pf.callRaw('template_manage_tools', { action: 'get_forms', template_version_id: plantilla, ...(pfId ? { property_id: pfId } : {}) });
    if (pfId && (r.isError || !/^\s*[[{]/.test(r.text))) { // con la propiedad no resultó: se completa con la ficha de Asset
      aviso = /no existe|no est[aá] asignada|no asignada/i.test(r.text) ? 'La propiedad no está asignada a tu usuario en Portalfirma: sus datos se completaron con la ficha de Asset.' : `Portalfirma no entregó los datos de la propiedad${String(r.text || '').trim() ? ' («' + String(r.text).trim().slice(0, 120) + '»)' : ''}: se completaron con la ficha de Asset.`;
      pfId = null; r = await pf.callRaw('template_manage_tools', { action: 'get_forms', template_version_id: plantilla });
    }
    const f = json(r); if (!f?.groups) throw err(`Portalfirma no devolvió el formulario de la plantilla${String(r.text || '').trim() ? ': «' + String(r.text).trim().slice(0, 240) + '»' : ' (respuesta vacía)'}. Intenta de nuevo; si sigue, cierra y vuelve a iniciar sesión.`);
    return { f, pfId, aviso };
  }
  // Formulario prellenado: lo que se sabe va completo, lo que falta queda marcado
  async function formulario({ plantilla, propId, negocioId, personas = {} }) {
    if (!plantilla) throw err('Falta la plantilla.');
    const p = propId ? inmo.obtener(propId) : null;
    const neg = negocioId ? negocios.ver(negocioId) : p ? negocios.listar().negocios.find((n) => n.propId === p.id && n.estado === 'abierto') : null;
    const { f, pfId, aviso } = await getForms(plantilla, p);
    const op = operacionDe(p, f.name); const sug = sugeridas(p, neg); const corr = inmo.config().corredor || {};
    const grupos = f.groups.map((g) => {
      const tieneFirmante = g.type === 'signer' || (g.variables || []).some((v) => v.type === 'signer');
      const rol = tieneFirmante ? rolDeGrupo(g.group) : null;
      const pid = tieneFirmante && rol && rol !== 'corredor' ? (personas[g.group] !== undefined ? personas[g.group] : sug[rol]) : null;
      const per = pid ? inmo.personaPorId(pid) : null;
      const campos = (g.variables || []).map((v) => {
        let val = null; let fuente = null;
        if (tieneFirmante) { const c = campoPersona(v); if (rol === 'corredor') { val = corr[c] || null; fuente = val ? 'corredor' : null; } else if (per && c && per[c]) { val = c === 'nombre' ? per.nombre : per[c]; fuente = 'persona'; } else if (/fecha/.test(norm(v.name))) { val = hoy(); fuente = 'hoy'; } }
        else [val, fuente] = valorInmueble(v, p, op);
        return { id: v.id, etiqueta: v.kind === 'image' || v.input_type === 'image' ? 'Foto de la propiedad (dirección https)' : v.label, tipo: v.input_type || 'text', requerido: !!v.required, valor: val ? String(val) : '', fuente: val ? fuente : null, campoPersona: tieneFirmante ? campoPersona(v) : null };
      });
      return { grupo: g.group, titulo: g.group.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), firmante: tieneFirmante, rol, rolTxt: ROL_TXT[rol] || null, personaId: per?.id || null, campos };
    });
    const faltan = grupos.flatMap((g) => g.campos.filter((c) => c.requerido && !c.valor).map((c) => `${c.etiqueta} (${g.titulo})`));
    const personasLista = inmo.listar().personas.map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut, email: c.email, telefono: c.telefono, direccion: c.direccion, estadoCivil: c.estadoCivil, profesion: c.profesion, nacionalidad: c.nacionalidad,
      rolEnPropiedad: (p?.vinculos || []).find((v) => v.personaId === c.id)?.rol || null }));
    return { plantilla: { id: plantilla, nombre: f.name, descripcion: f.description || '' }, propiedad: p ? { id: p.id, codigo: p.codigo, titulo: p.titulo, deportal: !!pfId, pfId } : null, aviso, operacion: op,
      negocio: neg ? { id: neg.id, titulo: neg.titulo, etapa: neg.etapaInfo?.t, pideFirma: !!neg.etapaInfo?.firma } : null, grupos, faltan, personas: personasLista, corredor: corr };
  }

  // Revisa lo que se va a enviar (para la confirmación) sin enviar nada
  async function revisar({ plantilla, propId, negocioId, valores = {}, personas = {} }) {
    const f = await formulario({ plantilla, propId, negocioId, personas });
    const values = {}; const faltan = []; const firmantes = [];
    for (const g of f.grupos) {
      for (const c of g.campos) { const v = String(valores[c.id] ?? c.valor ?? '').trim(); if (v) values[c.id] = v; else if (c.requerido) faltan.push(`${c.etiqueta} (${g.titulo})`); }
      if (g.firmante) { const nombre = g.campos.find((c) => c.campoPersona === 'nombre'); const rut = g.campos.find((c) => c.campoPersona === 'rut'); const email = g.campos.find((c) => c.campoPersona === 'email');
        if (nombre) firmantes.push({ grupo: g.grupo, titulo: g.titulo, rol: g.rol, nombre: values[nombre.id] || '', rut: rut ? values[rut.id] || '' : '', email: email ? values[email.id] || '' : '', personaId: personas[g.grupo] ?? g.personaId }); }
    }
    for (const s of firmantes) if (s.rut && !inmo.validRut(s.rut)) faltan.push(`RUT válido de ${s.titulo} (${s.rut})`);
    return { f, values, faltan, firmantes };
  }

  async function generar(o) {
    const { f, values, faltan, firmantes } = await revisar(o);
    if (faltan.length) throw err('Faltan datos: ' + faltan.join(', ') + '.');
    const pfId = f.propiedad?.pfId || null; // el mismo criterio que get_forms (si se llenó con la ficha, va sin property_id)
    const r = await pf.callRaw('template_manage_tools', { action: 'send_sign', template_version_id: f.plantilla.id, values, ...(pfId ? { property_id: pfId } : {}) });
    if (r.isError) throw err('Portalfirma no generó el documento: ' + String(r.text).slice(0, 240));
    const op = require('./firmas').operacionDe(r.text);   // 0.16.16 · el número se lee de cualquier forma en que venga
    // personas: las nuevas entran al CRM; todas quedan vinculadas a la propiedad con su rol
    const ROLV = { propietario: 'propietario', codeudor: 'codeudor', cliente: f.operacion === 'venta' ? (/visita/i.test(f.plantilla.nombre) ? 'interesado' : 'comprador') : (/visita/i.test(f.plantilla.nombre) ? 'interesado' : 'arrendatario') };
    for (const s of firmantes) {
      if (s.rol === 'corredor') { const g = f.grupos.find((x) => x.grupo === s.grupo); const d = {}; for (const c of g.campos) if (c.campoPersona && values[c.id]) d[c.campoPersona] = values[c.id]; inmo.guardarConfig({ corredor: { ...(inmo.config().corredor || {}), ...d } }); continue; }
      let c = s.personaId ? inmo.personaPorId(s.personaId) : null;
      if (!c && s.rut && inmo.validRut(s.rut)) { c = inmo.listar().personas.find((x) => x.rut === inmo.fmtRut(s.rut)) || null;
        if (!c) { const g = f.grupos.find((x) => x.grupo === s.grupo); const d = { roles: [ROLV[s.rol] || 'interesado'] }; for (const k of g.campos) if (k.campoPersona && values[k.id]) d[k.campoPersona] = values[k.id]; try { c = await inmo.guardarPersona({ ...d, nombre: s.nombre, rut: s.rut }); } catch { c = null; } } }
      s.personaId = c?.id || null;
      if (c && f.propiedad && ROLV[s.rol]) { const p = inmo.obtener(f.propiedad.id); if (!(p.vinculos || []).some((v) => v.personaId === c.id)) try { await inmo.vincular(p.id, c.id, ROLV[s.rol]); } catch {} }
      if (c) inmo.registrar(c.id, `Firma «${f.plantilla.nombre}»${op ? ' · operación ' + op : ''}`, { ref2: f.propiedad?.id });
    }
    const doc = { operacion: op, plantilla: f.plantilla.nombre, plantillaId: f.plantilla.id, fecha: new Date().toISOString(), estado: 'en_firma', firmantes: firmantes.filter((s) => s.rol !== 'corredor' || s.nombre).map((s) => ({ nombre: s.nombre, rut: s.rut, rol: s.titulo, personaId: s.personaId || null })), negocioId: null };
    if (op) firmas?.registrar({ operacion: op, nombre: f.plantilla.nombre, propId: f.propiedad?.id || null, negocioId: o.negocioId || null, firmantes: doc.firmantes.map((x) => ({ ...x, alias: x.rol })), origen: 'plantilla' });
    let negMsg = null;
    if (o.negocioId && op) { const n = negocios.ver(o.negocioId); if (n?.etapaInfo?.firma) { negocios.vincularFirma(n.id, n.etapa, op); doc.negocioId = n.id; negMsg = `Quedó ligado a la etapa «${n.etapaInfo.t}» del negocio: cuando se firme, avanza solo.`; } }
    if (f.propiedad) inmo.agregarFirma(doc, [f.propiedad.id], `Documento «${f.plantilla.nombre}» enviado a firmar${op ? ' (operación ' + op + ')' : ''}`);
    else inmo.guardar();
    return { ok: true, operacion: op, plantilla: f.plantilla.nombre, propiedad: f.propiedad, firmantes: doc.firmantes, negocio: negMsg, mensaje: String(r.text).slice(0, 300) };
  }

  // Estado de la firma: quién firmó y quién falta (y lo actualiza en la propiedad)
  async function seguimiento(operacion) {
    if (firmas) { const r = await firmas.revisar(operacion); return { operacion: r.operacion, documento: r.documento, propiedad: r.propiedad?.codigo || null, estado: r.estado, estadoTxt: { firmado: 'Firmado por todos', pendiente_pago: 'Pendiente de pago', en_firma: 'En firma', anulado: 'Anulada' }[r.estado], firmados: r.firmados, total: r.total, legalizado: r.legalizado, firmantes: r.firmantes.map((x) => ({ nombre: x.nombre, calidad: x.calidad, firmo: x.firmo, email: x.email, telefono: x.telefono })), pendientes: r.pendientes, archivos: r.archivos }; }
    const op = Number(String(operacion).replace(/\D/g, '')); if (!op) throw err('Indica el número de operación.');
    const d = json(await pf.callRaw('process_detail_get_by_operation', { operation: op })) || {};
    const firm = (d.signatories || []).map((s) => ({ nombre: s.name, rut: s.rut, firmo: !!s.signed }));
    const listo = d.status === 'finalized' || (firm.length && firm.every((s) => s.firmo));
    const estado = listo ? 'firmado' : d.status === 'unPayed' ? 'pendiente_pago' : 'en_firma';
    { const x = inmo.firmaDeOperacion(op); if (x && x.estado !== estado) inmo.actualizarFirma(op, (y) => { y.estado = estado; }, estado === 'firmado' ? `«${x.plantilla}» firmado por todos (operación ${op})` : null); }
    return { operacion: op, estado, estadoTxt: { firmado: 'Firmado por todos', pendiente_pago: 'Pendiente de pago', en_firma: 'En firma' }[estado], firmados: firm.filter((s) => s.firmo).length, total: firm.length, firmantes: firm, archivos: (d.files || []).map((x) => x.fileName) };
  }

  return { limpiar, plantillas, formulario, revisar, generar, seguimiento, getForms, valorInmueble, ROL_TXT };
}

module.exports = { crear, rolDeGrupo, campoPersona };
