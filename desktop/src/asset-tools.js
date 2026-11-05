const FC = require('./ficha-campos');
// Herramientas propias de PortalFirma Asset para el Agente: todo lo que se hace con botones también se puede pedir
// por chat (propiedades, personas, negocios, agenda, órdenes de visita, portales y navegación).
// Modos: «leer» corre solo · «escribir» corre solo y queda en el historial (cambios locales y reversibles)
//        «confirmar» espera el OK del usuario (cobra, publica afuera o no se puede deshacer).
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const cleanRut = (r) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
const err = (m) => new Error(m);
const hoy = () => require('./hora').hoy();   // 0.16.19 · fecha de Chile (no UTC)
const precioTxt = (p) => (!p || p.valor == null ? null : p.moneda === 'CLP' ? '$' + Number(p.valor).toLocaleString('es-CL') : `${p.moneda} ${Number(p.valor).toLocaleString('es-CL')}`);
const S = (props, req = []) => ({ type: 'object', properties: props, required: req });
const str = (d) => ({ type: 'string', description: d }); const num = (d) => ({ type: 'number', description: d }); const bool = (d) => ({ type: 'boolean', description: d });
const en = (vals, d) => ({ type: 'string', enum: vals, description: d });
const REF_PROP = str('Propiedad: id, código (ej. CV-5514) o texto de búsqueda (dirección, comuna, título).');
const REF_PER = str('Persona: id, RUT o nombre.');
const REF_NEG = str('Negocio: id, o el código de la propiedad / nombre del cliente.');
const TIPOS_PROP = ['casa', 'departamento', 'oficina', 'sitio', 'local_comercial', 'industrial', 'agricola', 'parcela', 'estacionamiento', 'terreno_construccion', 'bodega'];
const ROLES = ['propietario', 'arrendatario', 'comprador', 'codeudor', 'interesado', 'proveedor'];
const CAMPOS_PROP = {
  titulo: str('Título de la ficha'), tipo: en(TIPOS_PROP, 'Tipo de propiedad'), venta: bool('¿Está en venta?'), arriendo: bool('¿Está en arriendo?'),
  precio_venta: num('Precio de venta'), moneda_venta: en(['UF', 'CLP', 'USD'], 'Moneda del precio de venta (por defecto UF)'),
  precio_arriendo: num('Arriendo mensual'), moneda_arriendo: en(['UF', 'CLP', 'USD'], 'Moneda del arriendo (por defecto CLP)'),
  direccion: str('Calle y número'), unidad: str('Depto. o unidad'), comuna: str('Comuna'), region: str('Región'), rol: str('Rol SII'),
  sup_total: num('Superficie total m²'), sup_util: num('Superficie útil m²'), dormitorios: num('Dormitorios'), banos: num('Baños'),
  estacionamientos: num('Estacionamientos'), bodegas: num('Bodegas'), gastos_comunes: num('Gastos comunes en pesos'), amoblado: bool('Amoblada'),
  descripcion: str('Descripción pública'), notas_internas: str('Notas internas'),
};
function aFicha(a) {
  const o = {}; const map = { titulo: 'titulo', tipo: 'tipo', venta: 'venta', arriendo: 'arriendo', direccion: 'direccion', unidad: 'unidad', comuna: 'comuna', region: 'region', rol: 'rol', sup_total: 'supTotal', sup_util: 'supUtil', dormitorios: 'dormitorios', banos: 'banos', estacionamientos: 'estacionamientos', bodegas: 'bodegas', gastos_comunes: 'gastosComunes', amoblado: 'amoblado', descripcion: 'descripcion', notas_internas: 'notasInternas' };
  for (const [k, v] of Object.entries(map)) if (a[k] !== undefined && a[k] !== null) o[v] = a[k];
  if (a.precio_venta != null) o.precioVenta = { valor: a.precio_venta, moneda: a.moneda_venta || 'UF' };
  if (a.precio_arriendo != null) o.precioArriendo = { valor: a.precio_arriendo, moneda: a.moneda_arriendo || 'CLP' };
  return o;
}

function crear({ inmo, negocios, agenda, ml, pf, cambiarPropiedad, docs, pubs, est, docgen, dictado, formatos = null, firmas = null, acceso = null }) {
  const negsVisibles = () => negocios.listar().negocios.filter((n) => !acceso || acceso.verNegocio(n)); // 0.16.27 · el corredor ve sus negocios
  // ---------- resolución de referencias (el modelo puede decir «CV-5514», «la casa de Colina» o «Ana Rojas») ----------
  const varias = (tipo, l, f) => err(`Hay ${l.length} ${tipo} que coinciden: ${l.slice(0, 6).map(f).join(' | ')}. Pregunta al usuario cuál.`);
  function prop(ref) {
    if (!ref) throw err('Falta indicar la propiedad.');
    const all = inmo.todas().filter((p) => !p.archivada); const r = norm(ref);
    let l = all.filter((p) => p.id === ref || norm(p.codigo) === r);
    if (!l.length) { const tok = r.split(/\s+/).filter((t) => t.length > 1); l = all.filter((p) => { const h = norm([p.codigo, p.titulo, p.direccion, p.unidad, p.comuna, p.rol, p.tipo].join(' ')); return tok.every((t) => h.includes(t)); }); }
    if (!l.length) throw err(`No encontré una propiedad que coincida con «${ref}».`);
    if (l.length > 1) throw varias('propiedades', l, (p) => `${p.codigo} ${p.titulo} (${p.comuna || 's/comuna'})`);
    return l[0];
  }
  function persona(ref, { opcional } = {}) {
    if (!ref) { if (opcional) return null; throw err('Falta indicar la persona.'); }
    const all = inmo.listar().personas; const r = norm(ref); const rr = cleanRut(ref);
    let l = all.filter((c) => c.id === ref || (rr.length > 6 && cleanRut(c.rut) === rr));
    if (!l.length) { const tok = r.split(/\s+/).filter((t) => t.length > 1); l = all.filter((c) => tok.every((t) => norm(c.nombre + ' ' + c.email).includes(t))); }
    if (!l.length) { if (opcional) return null; throw err(`No encontré a «${ref}» en el CRM. Puedes crearla con asset_crear_persona (necesita nombre y RUT).`); }
    if (l.length > 1) throw varias('personas', l, (c) => `${c.nombre} ${c.rut}`);
    return l[0];
  }
  function negocio(ref) {
    if (!ref) throw err('Falta indicar el negocio.');
    const all = negsVisibles(); const r = norm(ref);
    let l = all.filter((n) => n.id === ref);
    if (!l.length) { const tok = r.split(/\s+/).filter((t) => t.length > 1); l = all.filter((n) => tok.every((t) => norm([n.titulo, n.prop?.codigo, n.cliente?.nombre, n.cliente?.rut, n.tipo].join(' ')).includes(t))); }
    if (l.length > 1) { const ab = l.filter((n) => n.estado === 'abierto'); if (ab.length === 1) l = ab; }
    if (!l.length) throw err(`No encontré un negocio que coincida con «${ref}».`);
    if (l.length > 1) throw varias('negocios', l, (n) => `${n.id} ${n.tipo} ${n.titulo} (${n.etapaInfo?.t})`);
    return l[0];
  }
  const resumenProp = (p) => ({ id: p.id, codigo: p.codigo, titulo: p.titulo, tipo: p.tipo, comuna: p.comuna, direccion: [p.direccion, p.unidad].filter(Boolean).join(' '), venta: p.venta ? { precio: precioTxt(p.precioVenta), estado: p.estadoVenta } : null, arriendo: p.arriendo ? { precio: precioTxt(p.precioArriendo), estado: p.estadoArriendo } : null, enPortal: ['venta', 'arriendo'].filter((o) => p.portales?.pi?.[o]?.status === 'active') });
  const resumenNeg = (n) => ({ id: n.id, tipo: n.tipo, estado: n.estado, etapa: n.etapaInfo?.t, propiedad: n.prop?.codigo + ' ' + (n.prop?.titulo || ''), cliente: n.cliente?.nombre, valor: precioTxt(n.valor), falta: n.siguiente, proximaAccion: n.proximaAccion, vencida: n.vencida });
  const resumenEv = (e) => ({ id: e.id, tipo: e.tipoTxt, titulo: e.titulo, fecha: e.fecha, hora: e.hora, estado: e.estado, lugar: e.lugar, propiedad: e.prop ? e.prop.codigo : null, personas: e.personas.map((c) => c.nombre), ordenDeVisita: e.orden?.operacion || null });
  const datos = (que) => ({ efectos: { datos: que } });
  const argsDoc = (a) => ({ plantilla: a.plantilla, propId: a.propiedad ? prop(a.propiedad).id : null, negocioId: a.negocio ? negocio(a.negocio).id : null, valores: a.valores || {},
    personas: Object.fromEntries(Object.entries(a.personas || {}).map(([g, r]) => [g, r ? persona(r).id : null])) });

  // ---------- orden de visita (plantilla «Orden de visita» de la Notaría virtual de Portalfirma) ----------
  async function plantillaOrden() {
    const r = await pf.callRaw('template_manage_tools', { action: 'search', query: 'Orden de visita', top_k: 5 });
    if (r.isError) throw err('Portalfirma: ' + r.text.slice(0, 200));
    let l = []; try { const j = JSON.parse(r.text); l = Array.isArray(j) ? j : j.results || []; } catch {}
    const t = l.find((x) => /^orden de visita/i.test(x.name || '')) || l.find((x) => /visita/i.test(x.name || ''));
    if (!t) throw err('No encontré la plantilla «Orden de visita» en la Notaría virtual de la cuenta.');
    return t;
  }
  // nombre y correo del corredor para los documentos: si el usuario los da en la conversación, quedan guardados en la cuenta
  function guardarCorredor(a) {
    const nom = String(a.corredor_nombre || '').trim(), em = String(a.corredor_email || '').trim();
    if (!nom && !em) return;
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw err(`El correo del corredor «${em}» no es válido.`);
    inmo.guardarConfig({ corredor: { ...(inmo.config().corredor || {}), ...(nom ? { nombre: nom } : {}), ...(em ? { email: em } : {}) } });
  }
  async function prepararOrden(a) {
    guardarCorredor(a);
    const p = prop(a.propiedad);
    let c = persona(a.visitante, { opcional: true }); let nueva = null;
    if (!c) {
      if (!a.visitante || !a.rut) throw err('Para la orden de visita necesito el nombre y el RUT del visitante (o una persona del CRM).');
      if (!inmo.validRut(a.rut)) throw err(`El RUT ${a.rut} no es válido.`);
      nueva = { nombre: a.visitante, rut: a.rut, email: a.email || '', telefono: a.telefono || '', roles: ['interesado'] };
    }
    const vis = c || nueva; const fecha = a.fecha || hoy();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw err('La fecha debe ir como AAAA-MM-DD.');
    const t = await plantillaOrden();
    const { f: form, pfId, aviso } = await docs.getForms(t.template_version_id, p); const values = {}; const faltan = [];
    const op = p.arriendo && !p.venta ? 'arriendo' : 'venta';
    for (const g of form.groups || []) for (const v of g.variables || []) {
      const k = norm(v.name + ' ' + v.label); let val = null;
      if (/fecha/.test(k)) val = fecha;
      else if (g.type === 'signer') val = /rut/.test(k) ? inmo.fmtRut(vis.rut) : /correo|email|mail/.test(k) ? (vis.email || a.email || '') : /telefono|fono|celular/.test(k) ? (vis.telefono || a.telefono || '') : /nombre/.test(k) ? vis.nombre : null;
      else val = docs.valorInmueble(v, p, op)[0];
      if (val) values[v.id] = String(val); else if (v.required) faltan.push(v.kind === 'image' || v.input_type === 'image' ? 'una foto de la propiedad' : /corredor/.test(k) ? `${v.label.toLowerCase()} (pídeselo al usuario y pásalo en corredor_nombre / corredor_email: queda guardado en la cuenta)` : `${v.label.toLowerCase()} de la propiedad`);
    }
    if (faltan.length) throw err(`Para la orden de visita faltan: ${faltan.join(', ')}.${aviso ? ' ' + aviso : ''} Completa la ficha y vuelve a intentarlo.`);
    return { p, c, nueva, fecha, t, pfId, values, aviso };
  }

  // 0.16.17 · orden de visita con el formato propio de la corredora (si la cuenta lo tiene): sale de la ficha y del CRM
  const usaFormatoOrden = () => !!(formatos?.activo() && formatos.tiene('orden_visita'));
  async function visitanteDe(a) {
    let c = persona(a.visitante, { opcional: true });
    if (!c) {
      if (!a.visitante || !a.rut) throw err('Para la orden de visita necesito el nombre completo y el RUT del visitante (o una persona del CRM).');
      if (!inmo.validRut(a.rut)) throw err(`El RUT ${a.rut} no es válido.`);
      c = await inmo.guardarPersona({ nombre: a.visitante, rut: a.rut, email: '', telefono: '', roles: ['interesado'] });
    }
    return c;
  }
  async function datosOrden(a) {
    guardarCorredor(a);
    const p = prop(a.propiedad); const otras = (a.otras_propiedades || []).map((r) => prop(r)).filter((q) => q.id !== p.id).map((q) => q.id);
    const c = await visitanteDe(a);
    const val = {}; if (a.email) val.visitEmail = a.email; if (a.telefono) val.visitTelefono = a.telefono;
    const base = { formatoId: 'orden_visita', propId: p.id, personaId: c.id, op: a.operacion || null, otras };
    const r = Object.keys(val).length ? await formatos.completar({ ...base, valores: val }) : formatos.preparar(base);
    return { p, c, r, base: { ...base, op: r.op || base.op } };
  }
  async function prepararOrdenPropia(a) {
    const { p, c, r } = await datosOrden(a);
    if (!r.listo) throw err(`Para la orden de visita falta: ${r.faltan.map((x) => (x.motivo ? `${x.t} (${x.motivo})` : x.t)).join('; ')}. Pídeselo al usuario: el correo y el celular del visitante van en «email» y «telefono», la operación en «operacion», tus datos en corredor_nombre / corredor_email; lo de la propiedad con asset_completar_ficha.`);
    const fecha = a.fecha || null;
    return { titulo: 'Generar la orden de visita y enviarla a firmar', detalle: [`Propiedad: ${p.codigo} · ${p.titulo}`, ...(a.otras_propiedades || []).map((x) => `También: ${x}`), `Visitante: ${c.nombre} · ${inmo.fmtRut(c.rut)} · ${c.email}`, `Operación: ${r.op === 'venta' ? 'venta' : 'arriendo'}`, ...(fecha ? [`Visita: ${fecha}${a.hora ? ' ' + a.hora : ''}`] : []), `Formato: The Living · ${r.firma.tipoTxt}`], aviso: 'Se cobra del saldo de Portalfirma y el visitante recibe su enlace para firmar.' };
  }
  async function enviarOrdenPropia(a) {
    const { p, c, base } = await datosOrden(a);
    const r = await formatos.enviar(base);
    for (const id of [p.id, ...(base.otras || [])]) { const q = inmo.obtener(id); if (q && !(q.vinculos || []).some((v) => v.personaId === c.id)) try { await inmo.vincular(q.id, c.id, 'interesado'); } catch {} }
    let ev = null;
    if (a.fecha && /^\d{4}-\d{2}-\d{2}$/.test(a.fecha)) {
      const ex = agenda.listar({ propId: p.id, personaId: c.id, tipo: 'visita', estado: 'programado' }).find((e) => e.fecha === a.fecha);
      const e = ex ? agenda.actualizar(ex.id, { orden: { operacion: r.operacion }, ...(a.hora ? { hora: a.hora } : {}) }) : agenda.crear({ tipo: 'visita', fecha: a.fecha, hora: a.hora, propId: p.id, personaIds: [c.id], notas: `Orden de visita nº ${r.numero}: operación ${r.operacion}` });
      if (!ex) agenda.actualizar(e.id, { orden: { operacion: r.operacion } });
      if (est) await est.alAgendar(e).catch(() => null); ev = resumenEv(agenda.ver(e.id));
    }
    return { ok: true, operacion: r.operacion, numero: r.numero, visitante: c.nombre, evento: ev, efectos: { datos: 'agenda' } };
  }

  const T = [
    // ======================= consultas =======================
    { name: 'asset_resumen', modo: 'leer', description: 'Resumen del día: cartera, negocios abiertos, acciones vencidas, firmas pendientes, agenda de hoy y mañana, interesados nuevos.', parameters: S({}),
      run: async () => { const r = await inmo.resumen(); const ng = negsVisibles().filter((n) => n.estado === 'abierto'); const m = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
        return { propiedades: r.propiedades, venta: r.venta, arriendo: r.arriendo, personas: r.personas, sinPropietario: r.sinPropietario, conInteresadosNuevos: r.conLeads, enPortalInmobiliario: r.enPortal,
          negociosAbiertos: ng.length, accionesVencidas: ng.filter((n) => n.vencida).map(resumenNeg), esperandoFirmas: ng.filter((n) => n.firmas?.[n.etapa]?.operacion && n.firmas[n.etapa].estado !== 'firmado').map(resumenNeg),
          agendaHoyYManana: agenda.listar({ desde: hoy(), hasta: m, estado: 'programado' }).map(resumenEv) }; } },
    { name: 'asset_buscar_propiedades', modo: 'leer', description: 'Busca en la cartera por texto y filtros. Devuelve id, código, precios y estados.', parameters: S({ texto: str('Texto libre: código, dirección, comuna, título, rol o nombre/RUT del propietario'), operacion: en(['venta', 'arriendo']), tipo: en(TIPOS_PROP), estado: en(['disponible', 'reservada', 'vendida', 'arrendada', 'no_disponible']), comuna: str('Comuna'), limite: num('Máximo de resultados (10 por defecto)') }),
      run: async (a) => { const per = inmo.listar().personas; const tok = norm(a.texto).split(/\s+/).filter((t) => t.length > 1);
        const l = inmo.todas().filter((p) => !p.archivada && (!a.operacion || p[a.operacion]) && (!a.tipo || p.tipo === a.tipo) && (!a.comuna || norm(p.comuna).includes(norm(a.comuna)))
          && (!a.estado || p.estadoVenta === a.estado || p.estadoArriendo === a.estado)
          && (!tok.length || tok.every((t) => norm([p.codigo, p.titulo, p.direccion, p.comuna, p.rol, ...(p.vinculos || []).map((v) => { const c = per.find((x) => x.id === v.personaId); return c ? c.nombre + ' ' + c.rut : ''; })].join(' ')).includes(t))));
        return { total: l.length, propiedades: l.slice(0, a.limite || 10).map(resumenProp) }; } },
    { name: 'asset_ver_propiedad', modo: 'leer', description: 'Ficha completa de una propiedad: datos, personas vinculadas, documentos, negocios, aviso en portal, interesados y últimas actividades.', parameters: S({ propiedad: REF_PROP }, ['propiedad']),
      run: async (a) => { const p = prop(a.propiedad); const per = inmo.listar().personas;
        return { ...resumenProp(p), rol: p.rol, superficies: { total: p.supTotal, util: p.supUtil }, dormitorios: p.dormitorios, banos: p.banos, estacionamientos: p.estacionamientos, bodegas: p.bodegas, gastosComunes: p.gastosComunes, amoblado: p.amoblado, descripcion: String(p.descripcion || '').slice(0, 600), fotos: (p.fotos || []).length,
          personas: (p.vinculos || []).map((v) => { const c = per.find((x) => x.id === v.personaId); return c && { id: c.id, nombre: c.nombre, rut: c.rut, rol: v.rol, telefono: c.telefono, email: c.email }; }).filter(Boolean),
          documentos: (p.documentos || []).map((d) => d.nombre), negocios: negsVisibles().filter((n) => n.propId === p.id).map(resumenNeg), aviso: p.portales?.pi || null,
          interesados: (p.leads || []).slice(0, 8).map((l) => ({ nombre: l.nombre, canal: l.canalTxt, fecha: l.fecha, rut: l.rut, telefono: l.telefono })), proximosEventos: agenda.listar({ propId: p.id, desde: hoy() }).map(resumenEv), actividad: (await inmo.actividadDe(p.id)).slice(0, 8).map((x) => `${x.fecha.slice(0, 10)} ${x.texto}`) }; } },
    { name: 'asset_buscar_personas', modo: 'leer', description: 'Busca personas del CRM por nombre, RUT o correo, y por rol.', parameters: S({ texto: str('Nombre, RUT o correo'), rol: en(ROLES) }),
      run: async (a) => { const tok = norm(a.texto).split(/\s+/).filter((t) => t.length > 1); const rr = cleanRut(a.texto);
        const l = inmo.listar().personas.filter((c) => (!a.rol || c.roles.includes(a.rol)) && (!tok.length || (rr.length > 6 && cleanRut(c.rut).includes(rr)) || tok.every((t) => norm(c.nombre + ' ' + c.email).includes(t))));
        return { total: l.length, personas: l.slice(0, 15).map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut, roles: c.roles, telefono: c.telefono, email: c.email })) }; } },
    { name: 'asset_ver_persona', modo: 'leer', description: 'Datos de una persona, sus propiedades, negocios y próximos eventos.', parameters: S({ persona: REF_PER }, ['persona']),
      run: async (a) => { const c = persona(a.persona);
        return { ...c, propiedades: inmo.todas().flatMap((p) => (p.vinculos || []).filter((v) => v.personaId === c.id).map((v) => ({ codigo: p.codigo, titulo: p.titulo, rol: v.rol }))), negocios: negsVisibles().filter((n) => n.clienteId === c.id).map(resumenNeg), proximosEventos: agenda.listar({ personaId: c.id, desde: hoy() }).map(resumenEv) }; } },
    { name: 'asset_listar_negocios', modo: 'leer', description: 'Lista negocios (ventas y arriendos) con su etapa, lo que falta y la próxima acción.', parameters: S({ tipo: en(['venta', 'arriendo']), estado: en(['abierto', 'ganado', 'perdido']), texto: str('Filtrar por propiedad o cliente'), solo_vencidos: bool('Solo con la próxima acción vencida') }),
      run: async (a) => { const tok = norm(a.texto).split(/\s+/).filter((t) => t.length > 1);
        const l = negsVisibles().filter((n) => (!a.tipo || n.tipo === a.tipo) && (!a.estado ? n.estado === 'abierto' : n.estado === a.estado) && (!a.solo_vencidos || n.vencida) && (!tok.length || tok.every((t) => norm([n.titulo, n.prop?.codigo, n.cliente?.nombre].join(' ')).includes(t))));
        return { total: l.length, negocios: l.slice(0, 20).map(resumenNeg) }; } },
    { name: 'asset_ver_negocio', modo: 'leer', description: 'Detalle de un negocio: etapas, tareas pendientes, firmas, condiciones e historial.', parameters: S({ negocio: REF_NEG }, ['negocio']),
      run: async (a) => { const n = await negocios.obtener(negocio(a.negocio).id); const et = negocios.ETAPAS[n.tipo];
        return { ...resumenNeg(n), etapas: et.map((e) => e.t), tareasPendientes: (n.etapaInfo.tareas || []).filter((_, i) => !n.tareas?.[n.etapa]?.[i]), firmaDeLaEtapa: n.etapaInfo.firma || null, firmas: n.firmas, comision: n.comision, comisionEstimada: n.comisionMonto, actividad: (n.actividad || []).slice(0, 8).map((x) => `${x.fecha.slice(0, 10)} ${x.texto}`) }; } },
    { name: 'asset_agenda', modo: 'leer', description: 'Eventos de la agenda (visitas, reuniones, firmas, llamadas, tareas) en un rango de fechas.', parameters: S({ desde: str('AAAA-MM-DD (por defecto hoy)'), hasta: str('AAAA-MM-DD (por defecto en 14 días)'), tipo: en(['visita', 'reunion', 'firma', 'llamada', 'tarea', 'otro']), propiedad: REF_PROP, persona: REF_PER, incluir_cancelados: bool('Incluir cancelados') }),
      run: async (a) => { const l = agenda.listar({ desde: a.desde || hoy(), hasta: a.hasta || require('./hora').sumarDias(hoy(), 14), tipo: a.tipo, propId: a.propiedad ? prop(a.propiedad).id : undefined, personaId: a.persona ? persona(a.persona).id : undefined }).filter((e) => a.incluir_cancelados || e.estado !== 'cancelado');
        return { total: l.length, eventos: l.map(resumenEv) }; } },
    { name: 'asset_interesados', modo: 'leer', description: 'Interesados que llegaron desde los portales (WhatsApp, preguntas, visitas solicitadas).', parameters: S({ propiedad: REF_PROP, solo_nuevos: bool('Solo los no revisados') }),
      run: async (a) => { const ps = a.propiedad ? [prop(a.propiedad)] : inmo.todas(); const l = ps.flatMap((p) => (p.leads || []).filter((x) => !a.solo_nuevos || !x.visto).map((x) => ({ propiedad: p.codigo, nombre: x.nombre, canal: x.canalTxt, fecha: x.fecha, rut: x.rut, telefono: x.telefono, email: x.email })));
        return { total: l.length, interesados: l.slice(0, 30) }; } },

    // ======================= propiedades y personas =======================
    { name: 'asset_dictar_propiedad', modo: 'leer', description: 'Llena la ficha de una propiedad nueva a partir de lo que el usuario describió o dictó (tipo, operación, precio, dirección, dormitorios, baños, metros…) y la muestra en la app para que la revise y confirme. Pasa en «texto» la descripción TAL CUAL la escribió el usuario. No crea la propiedad: la crea el usuario al confirmar.', parameters: S({ texto: str('La descripción de la propiedad, tal cual la escribió o dictó el usuario') }, ['texto']),
      run: async (a) => { const r = await dictado.extraer({ texto: a.texto });
        return { campos: r.campos, faltan: r.faltan.map((x) => x.t), dudas: r.dudas, indicacion: `La ficha quedó lista en la app para revisar. ${r.faltan.length ? 'Dile en una línea qué falta (' + r.faltan.map((x) => x.t.toLowerCase()).join(', ') + ') y' : 'Dile en una línea'} que la revise y pulse «Crear propiedad». No la crees tú.`, efectos: { tarjeta: { tipo: 'dictado', r, texto: a.texto } } }; } },
    { name: 'asset_fotos_drive', modo: 'leer', description: 'Prepara la carga de fotos de una propiedad desde Google Drive: la app abre el selector de Google en la carpeta de la propiedad para elegirlas.', parameters: S({ propiedad: REF_PROP }, ['propiedad']),
      run: async (a) => { const p = prop(a.propiedad); return { propiedad: { id: p.id, codigo: p.codigo }, indicacion: 'Dile que pulse el botón para elegir las fotos en Google Drive.', sugerencias: [{ label: `Elegir fotos de ${p.codigo} en Drive`, accion: { tipo: 'fotosDrive', propId: p.id } }] }; } },
    { name: 'asset_crear_propiedad', modo: 'escribir', description: 'Guarda una propiedad nueva con datos ya confirmados por el usuario. Mínimo: título, tipo y si va en venta y/o arriendo. Puede vincular al propietario.', parameters: S({ ...CAMPOS_PROP, propietario: REF_PER }, ['titulo', 'tipo']),
      run: async (a) => { const o = aFicha(a); if (o.venta == null && o.arriendo == null) { o.venta = !!o.precioVenta || !o.precioArriendo; o.arriendo = !!o.precioArriendo; }
        const p = await inmo.guardarPropiedad(o); let prop2 = null; if (a.propietario) { const c = persona(a.propietario); await inmo.vincular(p.id, c.id, 'propietario'); prop2 = c.nombre; }
        return { ok: true, propiedad: resumenProp(inmo.obtener(p.id)), propietario: prop2, ...{ efectos: { datos: 'propiedades', navegar: { pantalla: 'propiedad', id: p.id } } } }; } },
    { name: 'asset_actualizar_propiedad', modo: 'escribir', description: 'Cambia datos de una propiedad (precio, superficies, descripción…). Si está publicada en Portal Inmobiliario, el aviso se actualiza solo.', parameters: S({ propiedad: REF_PROP, ...CAMPOS_PROP }, ['propiedad']),
      run: async (a) => { const p = prop(a.propiedad); const { propiedad, ...resto } = a; const o = aFicha(resto); if (!Object.keys(o).length) throw err('No indicaste qué cambiar.');
        if (o.precioVenta && !resto.moneda_venta) o.precioVenta.moneda = p.precioVenta?.moneda || 'UF'; if (o.precioArriendo && !resto.moneda_arriendo) o.precioArriendo.moneda = p.precioArriendo?.moneda || 'CLP';
        const msgs = await cambiarPropiedad(p.id, o); return { ok: true, propiedad: resumenProp(inmo.obtener(p.id)), portal: msgs, ...datos('propiedades') }; } },
    // 0.16.14 · la ficha completa por bloques (ficha-campos.js): qué falta y completar con lo que cuenta el corredor
    { name: 'asset_ficha_pendiente', modo: 'leer', description: 'Qué le falta a la ficha de una propiedad, por bloques (lo esencial, datos para portales, propietario y legal, equipamiento, visita y publicación), y qué hay que pedir ahora. Úsala antes de pedirle datos de una propiedad al corredor.', parameters: S({ propiedad: REF_PROP }, ['propiedad']),
      run: async (a) => { const p = prop(a.propiedad); const sg = FC.siguiente(p);
        return { propiedad: { id: p.id, codigo: p.codigo, tipo: p.tipo }, bloques: sg.av.map((b) => ({ bloque: b.t, listo: b.listo, faltaClave: b.faltanClave, faltaOpcional: b.faltan.slice(0, 8), avance: `${b.completos}/${b.total}` })), pedirAhora: sg.pedir,
          indicacion: sg.bloque ? `Pídele SOLO lo de «${sg.bloque.t}», todo en un mensaje y en lista corta: ${sg.pedir.join(', ')}. Lo marcado como clave no puede quedar fuera.${sg.bloque.id === 'equip' ? ' Para el equipamiento pregúntale qué tiene la propiedad (lo que no diga queda en No).' : ''}` : 'La ficha tiene todo lo clave. Si quiere, puede agregar equipamiento (qué tiene la propiedad).' }; } },
    { name: 'asset_completar_ficha', modo: 'escribir', description: 'Completa la ficha de una propiedad YA creada con lo que el corredor cuenta o dicta (cualquier dato: N° de depto, piso, orientación, año, mascotas, rol, forma de visitar, lo que tiene: piscina, quincho, conserje…). Pasa en «texto» lo que dijo TAL CUAL. Devuelve lo guardado y lo que sigue faltando.', parameters: S({ propiedad: REF_PROP, texto: str('Lo que dijo el corredor, tal cual') }, ['propiedad', 'texto']),
      run: async (a) => { const p = prop(a.propiedad); const r = await dictado.completar({ texto: a.texto, p });
        const o = { ...r.plano, ...(Object.keys(r.ficha).length ? { ficha: r.ficha } : {}) }; if (!Object.keys(o).length) return { ok: false, indicacion: 'No encontré datos de la ficha en lo que dijo. Pregúntale de nuevo.' };
        const msgs = await cambiarPropiedad(p.id, o); const q = inmo.obtener(p.id); const sg = FC.siguiente(q);
        const guardado = [...Object.keys(r.plano), ...Object.keys(r.ficha)].map((k) => FC.POR_ID[k]?.t || k);
        return { ok: true, guardado, dudas: r.dudas, portal: msgs, sigueFaltando: sg.bloque ? { bloque: sg.bloque.t, pedir: sg.pedir } : null, ...datos('propiedades') }; } },
    { name: 'asset_cambiar_estado', modo: 'escribir', description: 'Cambia el estado comercial (disponible, reservada, vendida, arrendada, no_disponible). Pausa o reactiva el aviso del portal solo.', parameters: S({ propiedad: REF_PROP, operacion: en(['venta', 'arriendo']), estado: en(['disponible', 'reservada', 'vendida', 'arrendada', 'no_disponible']) }, ['propiedad', 'operacion', 'estado']),
      run: async (a) => { const p = prop(a.propiedad); if (!p[a.operacion]) throw err(`${p.codigo} no está en ${a.operacion}.`); const msgs = await cambiarPropiedad(p.id, { [a.operacion === 'venta' ? 'estadoVenta' : 'estadoArriendo']: a.estado }); return { ok: true, propiedad: resumenProp(inmo.obtener(p.id)), portal: msgs, ...datos('propiedades') }; } },
    { name: 'asset_crear_persona', modo: 'escribir', description: 'Agrega una persona al CRM (RUT único). Opcionalmente la vincula a una propiedad con su rol.', parameters: S({ nombre: str('Nombre o razón social'), rut: str('RUT'), email: str('Correo'), telefono: str('Teléfono'), roles: { type: 'array', items: en(ROLES) }, tipo: en(['natural', 'juridica']), direccion: str('Dirección'), estado_civil: str('Estado civil'), profesion: str('Profesión'), notas: str('Notas'), propiedad: REF_PROP, rol_en_propiedad: en(ROLES) }, ['nombre', 'rut']),
      run: async (a) => { const c = await inmo.guardarPersona({ nombre: a.nombre, rut: a.rut, email: a.email, telefono: a.telefono, roles: a.roles || (a.rol_en_propiedad ? [a.rol_en_propiedad] : []), tipo: a.tipo, direccion: a.direccion, estadoCivil: a.estado_civil, profesion: a.profesion, notas: a.notas });
        let p = null; if (a.propiedad) { p = prop(a.propiedad); await inmo.vincular(p.id, c.id, a.rol_en_propiedad || 'interesado'); }
        return { ok: true, persona: { id: c.id, nombre: c.nombre, rut: c.rut }, vinculadaA: p?.codigo || null, ...datos('personas') }; } },
    { name: 'asset_vincular_persona', modo: 'escribir', description: 'Vincula una persona del CRM a una propiedad con un rol (propietario, arrendatario, comprador, codeudor, interesado).', parameters: S({ propiedad: REF_PROP, persona: REF_PER, rol: en(ROLES) }, ['propiedad', 'persona', 'rol']),
      run: async (a) => { const p = prop(a.propiedad); const c = persona(a.persona); await inmo.vincular(p.id, c.id, a.rol); return { ok: true, texto: `${c.nombre} vinculado a ${p.codigo} como ${a.rol}`, ...datos('propiedades') }; } },
    { name: 'asset_nota', modo: 'escribir', description: 'Agrega una nota al historial de una propiedad, una persona o un negocio.', parameters: S({ propiedad: REF_PROP, persona: REF_PER, negocio: REF_NEG, texto: str('La nota') }, ['texto']),
      run: async (a) => { const id = a.negocio ? negocio(a.negocio).id : a.propiedad ? prop(a.propiedad).id : a.persona ? persona(a.persona).id : null; if (!id) throw err('Indica dónde va la nota (propiedad, persona o negocio).');
        if (a.negocio) await negocios.nota(id, a.texto); else await inmo.nota(id, a.texto); return { ok: true, ...datos('todo') }; } },

    // ======================= negocios =======================
    { name: 'asset_crear_negocio', modo: 'escribir', description: 'Crea un negocio de venta o arriendo para una propiedad y un cliente del CRM. Comisión por defecto: 2% venta, 50% arriendo.', parameters: S({ tipo: en(['venta', 'arriendo']), propiedad: REF_PROP, cliente: REF_PER, precio: num('Precio o arriendo acordado (por defecto, el de la ficha)'), moneda: en(['UF', 'CLP', 'USD']), comision: num('Comisión'), comision_tipo: en(['%', 'monto']), etapa: en(['interes', 'visita', 'reserva', 'promesa', 'escritura', 'inscripcion', 'evaluacion', 'contrato', 'entrega']), proxima_accion: str('Próxima acción'), fecha_accion: str('AAAA-MM-DD') }, ['tipo', 'propiedad', 'cliente']),
      run: async (a) => { const p = prop(a.propiedad); const c = persona(a.cliente); const pr = a.tipo === 'venta' ? p.precioVenta : p.precioArriendo;
        const n = await negocios.guardar({ tipo: a.tipo, propId: p.id, clienteId: c.id, etapa: a.etapa, valor: a.precio != null ? { valor: a.precio, moneda: a.moneda || pr?.moneda || 'UF' } : pr, comision: { tipo: a.comision_tipo || '%', valor: a.comision ?? (a.tipo === 'venta' ? 2 : 50) }, proximaAccion: a.proxima_accion ? { texto: a.proxima_accion, fecha: a.fecha_accion || null } : null });
        return { ok: true, negocio: resumenNeg(n), efectos: { datos: 'negocios', navegar: { pantalla: 'negocio', id: n.id } } }; } },
    { name: 'asset_mover_negocio', modo: 'escribir', description: 'Mueve un negocio a otra etapa. La propiedad cambia de estado sola (reserva → reservada).', parameters: S({ negocio: REF_NEG, etapa: en(['interes', 'visita', 'reserva', 'promesa', 'escritura', 'inscripcion', 'evaluacion', 'contrato', 'entrega']) }, ['negocio', 'etapa']),
      run: async (a) => { const n = negocio(a.negocio); const r = await negocios.mover(n.id, a.etapa); return { ok: true, negocio: resumenNeg(r.negocio), efectos: { datos: 'negocios' }, avisos: r.mensajes }; } },
    { name: 'asset_tarea_negocio', modo: 'escribir', description: 'Marca o desmarca una tarea de la etapa actual del negocio (por su texto o número, desde 1).', parameters: S({ negocio: REF_NEG, tarea: str('Texto o número de la tarea'), hecha: bool('true = hecha') }, ['negocio', 'tarea']),
      run: async (a) => { const n = negocio(a.negocio); const ts = n.etapaInfo.tareas || []; let i = Number(a.tarea) - 1; if (!(i >= 0 && i < ts.length)) i = ts.findIndex((t) => norm(t).includes(norm(a.tarea)));
        if (i < 0) throw err(`La etapa «${n.etapaInfo.t}» tiene estas tareas: ${ts.join(' | ')}.`); const r = negocios.tarea(n.id, n.etapa, i, a.hecha !== false); return { ok: true, negocio: resumenNeg(r), ...datos('negocios') }; } },
    { name: 'asset_proxima_accion', modo: 'escribir', description: 'Define la próxima acción de un negocio, con fecha.', parameters: S({ negocio: REF_NEG, texto: str('Qué hay que hacer'), fecha: str('AAAA-MM-DD') }, ['negocio', 'texto']),
      run: async (a) => { const n = negocio(a.negocio); const r = await negocios.guardar({ id: n.id, proximaAccion: { texto: a.texto, fecha: a.fecha || null } }); return { ok: true, negocio: resumenNeg(r), ...datos('negocios') }; } },
    { name: 'asset_vincular_firma', modo: 'escribir', description: 'Liga la operación de firma de Portalfirma a la etapa actual del negocio; al quedar firmada, el negocio avanza solo.', parameters: S({ negocio: REF_NEG, operacion: num('Número de operación') }, ['negocio', 'operacion']),
      run: async (a) => { const n = negocio(a.negocio); negocios.vincularFirma(n.id, n.etapa, a.operacion); const r = await negocios.revisarFirmas(pf, n.id); return { ok: true, avisos: r.mensajes, negocio: resumenNeg(negocios.obtener(n.id)), ...datos('negocios') }; } },
    { name: 'asset_cerrar_negocio', modo: 'confirmar', description: 'Cierra un negocio como ganado o perdido (pide motivo si se perdió). Cambia el estado de la propiedad.', parameters: S({ negocio: REF_NEG, resultado: en(['ganado', 'perdido']), motivo: str('Motivo si se perdió') }, ['negocio', 'resultado']),
      preparar: async (a) => { const n = negocio(a.negocio); if (a.resultado === 'perdido' && !a.motivo) throw err('Pregunta al usuario por qué se perdió el negocio.'); return { titulo: a.resultado === 'ganado' ? 'Cerrar el negocio con éxito' : 'Marcar el negocio como perdido', detalle: [`${n.tipo}: ${n.titulo}`, `Etapa: ${n.etapaInfo.t}`, ...(a.motivo ? [`Motivo: ${a.motivo}`] : [])], aviso: a.resultado === 'ganado' ? `La propiedad queda ${n.tipo === 'venta' ? 'vendida' : 'arrendada'} y su aviso se pausa.` : 'Si la propiedad estaba reservada por este negocio, vuelve a quedar disponible.' }; },
      run: async (a) => { const n = negocio(a.negocio); const r = await negocios.cerrar(n.id, a.resultado, a.motivo); return { ok: true, negocio: resumenNeg(r.negocio), avisos: r.mensajes, ...datos('negocios') }; } },

    // ======================= agenda y órdenes de visita =======================
    { name: 'asset_crear_evento', modo: 'escribir', description: 'Agenda en el calendario una visita, reunión, firma, llamada o tarea, con fecha y hora, ligada a propiedad, personas y negocio. SOLO agenda: no genera documentos ni cobra. Úsala siempre que pidan «agendar», «coordinar» o «programar» una visita.', parameters: S({ tipo: en(['visita', 'reunion', 'firma', 'llamada', 'tarea', 'otro']), fecha: str('AAAA-MM-DD'), hora: str('HH:MM (24 h)'), duracion: num('Minutos'), titulo: str('Título (opcional)'), propiedad: REF_PROP, personas: { type: 'array', items: { type: 'string' }, description: 'Personas: ids, RUT o nombres' }, negocio: REF_NEG, lugar: str('Lugar (por defecto, la dirección de la propiedad)'), notas: str('Notas') }, ['tipo', 'fecha']),
      run: async (a) => { const p = a.propiedad ? prop(a.propiedad) : null; const ps = (a.personas || []).map((x) => persona(x)); const n = a.negocio ? negocio(a.negocio) : null;
        const e = agenda.crear({ tipo: a.tipo, fecha: a.fecha, hora: a.hora, duracion: a.duracion, titulo: a.titulo, propId: p?.id || n?.propId, personaIds: ps.map((c) => c.id).concat(n?.clienteId && !a.personas?.length ? [n.clienteId] : []), negocioId: n?.id, lugar: a.lugar, notas: a.notas });
        const hito = est ? await est.alAgendar(e) : null; // agendar la visita = hito del negocio (pasa a «Visita»)
        return { ok: true, evento: resumenEv(e), ...(hito ? { negocio: hito } : {}), efectos: { datos: hito ? 'negocios' : 'agenda' } }; } },
    { name: 'asset_actualizar_evento', modo: 'escribir', description: 'Reprograma, marca como hecho o cancela un evento de la agenda.', parameters: S({ evento: str('Id del evento (de asset_agenda)'), fecha: str('AAAA-MM-DD'), hora: str('HH:MM'), estado: en(['programado', 'hecho', 'cancelado']), notas: str('Notas') }, ['evento']),
      run: async (a) => { const { evento, ...o } = a; const e = agenda.actualizar(evento, Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))); return { ok: true, evento: resumenEv(e), ...datos('agenda') }; } },
    { name: 'asset_orden_visita', modo: 'confirmar', description: 'SOLO cuando el usuario pide explícitamente la ORDEN de visita (el documento que firma el visitante). Genera la «Orden de visita» de la Notaría virtual con los datos de la propiedad y del visitante, la envía a firmar (cobra del saldo) y agenda la visita. Si el visitante no está en el CRM, pasa nombre y RUT.', parameters: S({ propiedad: REF_PROP, visitante: str('Persona del CRM (id, RUT o nombre) o nombre completo si es nueva'), rut: str('RUT del visitante si es nuevo'), email: str('Correo del visitante'), telefono: str('Teléfono del visitante'), fecha: str('Fecha de la visita AAAA-MM-DD'), hora: str('Hora HH:MM'), corredor_nombre: str('Nombre del corredor (si falta en la cuenta; queda guardado)'), corredor_email: str('Correo del corredor (si falta en la cuenta; queda guardado)'), operacion: en(['venta', 'arriendo'], 'Venta o arriendo (si la propiedad va en ambas y no hay negocio con el visitante)'), otras_propiedades: { type: 'array', items: { type: 'string' }, description: 'Otras propiedades que el visitante verá (van en la misma orden)' } }, ['propiedad', 'visitante']),
      preparar: async (a) => { if (usaFormatoOrden()) return prepararOrdenPropia(a); const x = await prepararOrden(a); a.__orden = x; return { titulo: 'Generar la orden de visita y enviarla a firmar', detalle: [`Propiedad: ${x.p.codigo} · ${x.p.titulo}`, `Dirección: ${[x.p.direccion, x.p.unidad, x.p.comuna].filter(Boolean).join(', ')}`, `Visitante: ${(x.c || x.nueva).nombre} · ${inmo.fmtRut((x.c || x.nueva).rut)}${x.nueva ? ' (se agrega al CRM)' : ''}`, `Fecha de la visita: ${x.fecha}${a.hora ? ' ' + a.hora : ''}`, `Plantilla: ${x.t.name}`], aviso: `${x.aviso ? x.aviso + ' ' : ''}Se cobra del saldo de Portalfirma y el visitante recibe el enlace para firmar. La visita queda en la agenda.` }; },
      run: async (a) => { if (usaFormatoOrden()) return enviarOrdenPropia(a); const x = a.__orden || await prepararOrden(a); const c = x.c || await inmo.guardarPersona(x.nueva);
        const r = await pf.callRaw('template_manage_tools', { action: 'send_sign', template_version_id: x.t.template_version_id, values: x.values, ...(x.pfId ? { property_id: x.pfId } : {}) });
        if (r.isError) throw err('Portalfirma no generó la orden: ' + r.text.slice(0, 240));
        const op = require('./firmas').operacionDe(r.text);
        const ex = agenda.listar({ propId: x.p.id, personaId: c.id, tipo: 'visita', estado: 'programado' }).find((e) => e.fecha === x.fecha);
        const e = ex ? agenda.actualizar(ex.id, { orden: { operacion: op }, ...(a.hora ? { hora: a.hora } : {}) }) : agenda.crear({ tipo: 'visita', fecha: x.fecha, hora: a.hora, propId: x.p.id, personaIds: [c.id], notas: op ? `Orden de visita: operación ${op}` : '' });
        if (!ex && op) agenda.actualizar(e.id, { orden: { operacion: op } });
        if (est) await est.alAgendar(e).catch(() => null); // la visita (con o sin orden) es un hito del negocio
        if (!(x.p.vinculos || []).some((v) => v.personaId === c.id)) await inmo.vincular(x.p.id, c.id, 'interesado');
        if (op) firmas?.registrar({ operacion: op, nombre: 'Orden de visita', propId: x.p.id, firmantes: [{ nombre: c.nombre, rut: c.rut, alias: 'visitante', email: c.email, telefono: c.telefono }], origen: 'plantilla' });
        inmo.parchear(x.p.id, (pp) => { pp.firmas ||= []; pp.firmas.unshift({ operacion: op, plantilla: 'Orden de visita', plantillaId: x.t.template_version_id, fecha: new Date().toISOString(), estado: 'en_firma', firmantes: [{ nombre: c.nombre, rut: c.rut, rol: 'Visitante', personaId: c.id }], negocioId: null }); pp.firmas.length = Math.min(pp.firmas.length, 100); }, `Orden de visita enviada a firmar a ${c.nombre}${op ? ' (operación ' + op + ')' : ''}`);
        return { ok: true, operacion: op, visitante: c.nombre, evento: resumenEv(agenda.ver(e.id)), mensaje: String(r.text).slice(0, 300), efectos: { datos: 'agenda' } }; } },


    // ======================= formatos propios de la corredora (0.16.15) =======================
    { name: 'asset_preparar_formato', modo: 'escribir', description: 'Documentos con los FORMATOS PROPIOS de la corredora (hoy: el mandato de venta y el de arriendo). Revisa qué datos ya tiene Asset (ficha, propietario, empresa) y devuelve SOLO lo que falta. Si el usuario te da datos que faltaban, pásalos en «datos» y quedan guardados en su lugar (no se vuelven a pedir). Úsala antes de asset_enviar_formato.', parameters: S({ propiedad: REF_PROP, documento: en(['mandato'], 'Qué documento (por ahora: mandato)'), operacion: en(['venta', 'arriendo'], 'Si la propiedad va en venta y arriendo, cuál mandato (sin esto, revisa ambos)'), datos: { type: 'object', description: 'Datos que faltaban, por id (los ids que devolvió «faltan»): p. ej. {"duenoEmail":"ana@mail.cl","rol":"123-45","exclusividad":"no","mesesGarantia":"1","unidad":"504"}', additionalProperties: { type: 'string' } }, tipo_firma: en(['simple', 'avanzada', 'visada', 'enrolada'], 'Solo si el usuario pide cambiar el tipo de firma de este documento (queda para los próximos)'), tramite: en(['none', 'legalization', 'protocolization'], 'Solo si pide legalizarlo o protocolizarlo') }, ['propiedad']),
      run: async (a) => { if (!formatos?.activo()) throw err('La cuenta no tiene formatos propios activos: usa asset_buscar_documento con el nombre del documento.');
        const p = prop(a.propiedad); let fs_ = formatos.deHito(p, a.documento || 'mandato'); if (a.operacion) fs_ = fs_.filter((f) => f.op === a.operacion);
        if (!fs_.length) throw err(`${p.codigo} no tiene un mandato para ${a.operacion || 'su operación'} (¿está marcada en venta o arriendo?).`);
        let guardado = []; if (a.datos && Object.keys(a.datos).length) guardado = (await formatos.completar({ propId: p.id, formatoId: fs_[0].id, valores: a.datos })).guardado;
        if (a.tipo_firma || a.tramite) formatos.configurar({ firma: Object.fromEntries(fs_.map((f) => [f.id, { tipo: a.tipo_firma, tramite: a.tramite }])) });
        const r = fs_.map((f) => formatos.preparar({ formatoId: f.id, propId: p.id }));
        const faltan = [...new Map(r.flatMap((x) => x.faltan).map((x) => [x.id, x])).values()];
        return { propiedad: p.codigo, guardado, documentos: r.map((x) => ({ formato: x.formato.id, titulo: x.formato.titulo, listo: x.listo, firma: `${x.firma.tipoTxt} · ${x.firma.tramiteTxt}`, datos: x.datos.filter((d) => d.aplica && !d.auto).map((d) => `${d.t}: ${d.txt || '—'}${d.porDefecto ? ' (por defecto)' : ''}`), firman: x.firmantes.map((s) => `${s.titulo} (${s.calidad}): ${s.nombre}`) })), faltan,
          indicacion: faltan.length ? `Pide SOLO esto, en una lista corta: ${faltan.map((x) => (x.motivo ? `${x.t} (${x.motivo})` : x.t)).join('; ')}. Cuando responda, vuelve a llamar con «datos».` : 'Está todo: muestra en pocas líneas los datos que van en el documento y pregunta si lo envía a firmar (se cobra del saldo). Si dice que sí, asset_enviar_formato.', ...datos('propiedades') }; } },
    { name: 'asset_enviar_formato', modo: 'confirmar', description: 'Envía a firmar con Portalfirma un documento de los formatos propios (mandato de venta o de arriendo) ya completo según asset_preparar_formato. Cobra del saldo; firman el propietario y el representante de la corredora.', parameters: S({ propiedad: REF_PROP, formato: en(['mandato_venta', 'mandato_arriendo'], 'Formato a enviar') }, ['propiedad', 'formato']),
      preparar: async (a) => { if (!formatos?.activo()) throw err('La cuenta no tiene formatos propios activos.'); const p = prop(a.propiedad); const r = formatos.preparar({ formatoId: a.formato, propId: p.id });
        if (!r.listo) throw err('Faltan datos: ' + r.faltan.map((x) => x.t).join(', ') + '. Pídeselos al usuario (asset_preparar_formato).');
        return { titulo: `Enviar «${r.formato.titulo}» a firmar`, detalle: [`Propiedad: ${p.codigo} · ${p.titulo}`, ...r.firmantes.map((s) => `${s.titulo}: ${s.nombre} · ${s.rut}`)], aviso: 'Se cobra del saldo de Portalfirma y cada firmante recibe su enlace para firmar.' }; },
      run: async (a) => { const p = prop(a.propiedad); const r = await formatos.enviar({ formatoId: a.formato, propId: p.id }); return { ...r, ...datos('propiedades') }; } },

    // ======================= documentos (plantillas de la cuenta) =======================
    { name: 'asset_configurar_corredor', modo: 'escribir', description: 'Guarda el nombre y el correo del corredor (el usuario) que van en las órdenes de visita, contratos y demás documentos. Úsala cuando un documento diga que falta el corredor y el usuario te dé esos datos.', parameters: S({ corredor_nombre: str('Nombre completo del corredor'), corredor_email: str('Correo del corredor'), corredor_telefono: str('Teléfono (opcional)') }, []),
      run: async (a) => { guardarCorredor(a); if (a.corredor_telefono) inmo.guardarConfig({ corredor: { ...(inmo.config().corredor || {}), telefono: String(a.corredor_telefono).trim() } }); return { ok: true, corredor: inmo.config().corredor }; } },
    { name: 'asset_plantillas', modo: 'leer', description: 'Lista las plantillas de documentos de la cuenta (Notaría virtual) útiles para el rubro inmobiliario: arriendo, compraventa, promesa, corretaje, orden y acta de visita, acta de entrega, mandatos. Con «texto» busca una en particular. Con «propiedad» las ordena según la operación.', parameters: S({ texto: str('Qué documento se busca (opcional)'), propiedad: REF_PROP }),
      run: async (a) => ({ plantillas: await docs.plantillas({ texto: a.texto, propId: a.propiedad ? prop(a.propiedad).id : null }) }) },
    { name: 'asset_buscar_documento', modo: 'leer', description: 'Úsala SIEMPRE que el usuario pida un documento por su nombre (comprobante de pago de la reserva, recibo, carta, acta, declaración…). Busca si la cuenta tiene una plantilla con ese nombre; si no, muestra las parecidas y ofrece crearlo con Asset (PDF con los datos de la propiedad y la persona, enviado a firmar). Después de llamarla, NO generes nada: el usuario elige con los botones.', parameters: S({ documento: str('Nombre del documento pedido, tal como lo dijo'), propiedad: REF_PROP, persona: str('Cliente o firmante (id, RUT o nombre), opcional') }, ['documento']),
      run: async (a) => { const p = a.propiedad ? prop(a.propiedad) : null; const c = a.persona ? persona(a.persona, { opcional: true }) : null;
        const r = await docgen.buscar({ texto: a.documento, propId: p?.id || null });
        const base = { propId: p?.id || null, personaId: c?.id || null };
        const sug = [...(r.coincide ? [{ label: `Usar la plantilla «${r.coincide.nombre}»`, accion: { tipo: 'plantilla', ...base, plantillaId: r.coincide.id, nombre: r.coincide.nombre } }] : []),
          { label: `Crear «${r.titulo}» con Asset`, accion: { tipo: 'docNuevo', ...base, titulo: r.titulo, tipoDoc: r.tipo } },
          ...r.parecidas.slice(0, 2).map((t) => ({ label: `Usar «${t.nombre}»`, accion: { tipo: 'plantilla', ...base, plantillaId: t.id, nombre: t.nombre } }))];
        return { pedido: r.pedido, hayPlantilla: !!r.coincide, plantilla: r.coincide?.nombre || null, parecidas: r.parecidas.map((t) => t.nombre), crear: { titulo: r.titulo, como: r.tipoTxt },
          indicacion: r.coincide ? 'Hay una plantilla con ese nombre: díselo y que elija en los botones.' : `No hay una plantilla «${r.titulo}» en la cuenta${r.parecidas.length ? '; menciona las parecidas' : ''}. Ofrece crearlo con Asset (botón). No lo generes tú.`, sugerencias: sug }; } },
    { name: 'asset_formulario_documento', modo: 'leer', description: 'Arma el formulario de una plantilla prellenado con la propiedad, las personas vinculadas (propietario, arrendatario/comprador, codeudor) y los datos del corredor. Devuelve los campos y lo que falta: pídeselo al usuario antes de generar.', parameters: S({ plantilla: str('template_version_id de asset_plantillas'), propiedad: REF_PROP, negocio: REF_NEG, personas: { type: 'object', description: 'Opcional: grupo firmante → persona del CRM (id, RUT o nombre), p. ej. {"arrendatario":"Ana Rojas"}', additionalProperties: { type: 'string' } } }, ['plantilla']),
      run: async (a) => { const f = await docs.formulario(argsDoc(a)); return { plantilla: f.plantilla.nombre, propiedad: f.propiedad?.codigo || null, operacion: f.operacion, negocio: f.negocio, faltan: f.faltan,
        grupos: f.grupos.map((g) => ({ grupo: g.grupo, rol: g.rolTxt, persona: g.personaId ? inmo.personaPorId(g.personaId)?.nombre : null, campos: g.campos.map((c) => ({ id: c.id, etiqueta: c.etiqueta, valor: c.valor || null, requerido: c.requerido })) })) }; } },
    { name: 'asset_generar_documento', modo: 'confirmar', description: 'Genera el documento desde la plantilla con los datos de la propiedad y las personas, lo envía a firmar (cobra del saldo) y lo deja en la ficha de la propiedad (y en el negocio, si su etapa pide firma). «valores» lleva solo los campos que faltaban o que el usuario quiere cambiar (id del campo → valor).', parameters: S({ plantilla: str('template_version_id'), propiedad: REF_PROP, negocio: REF_NEG, personas: { type: 'object', description: 'grupo firmante → persona del CRM', additionalProperties: { type: 'string' } }, valores: { type: 'object', description: 'id del campo → valor', additionalProperties: { type: 'string' } } }, ['plantilla']),
      preparar: async (a) => { const o = argsDoc(a); const r = await docs.revisar(o); if (r.faltan.length) throw err('Faltan datos: ' + r.faltan.join(', ') + '. Pídeselos al usuario.');
        return { titulo: `Generar «${r.f.plantilla.nombre}» y enviarlo a firmar`, detalle: [...(r.f.propiedad ? [`Propiedad: ${r.f.propiedad.codigo} · ${r.f.propiedad.titulo}`] : []), ...r.firmantes.map((s) => `${s.titulo}: ${s.nombre}${s.rut ? ' · ' + s.rut : ''}`), ...(r.f.negocio?.pideFirma && o.negocioId ? [`Negocio: ${r.f.negocio.titulo} (${r.f.negocio.etapa})`] : [])], aviso: 'Se cobra del saldo de Portalfirma y cada firmante recibe su enlace para firmar.' }; },
      run: async (a) => { const r = await docs.generar(argsDoc(a)); return { ...r, efectos: { datos: 'propiedades' } }; } },
    { name: 'asset_seguimiento_firma', modo: 'leer', description: 'Estado de la firma de una operación: quién firmó, quién falta (con su calidad: arrendador, mandante…), su correo y celular, y si está legalizada. Actualiza la ficha y el negocio. Si no sabes el número, pasa la propiedad y revisa todas sus firmas en curso.', parameters: S({ operacion: num('Número de operación'), propiedad: REF_PROP }),
      run: async (a) => { if (a.operacion) return docs.seguimiento(a.operacion); if (!firmas) throw err('Indica el número de operación.');
        const p = prop(a.propiedad); const l = firmas.pendientes({ propId: p.id }); if (!l.length) return { propiedad: p.codigo, enFirma: [], indicacion: 'No hay documentos en firma en esta propiedad.' };
        const out = []; for (const x of l) out.push(await docs.seguimiento(x.operacion)); return { propiedad: p.codigo, enFirma: out, ...datos('propiedades') }; } },
    { name: 'asset_firmas_pendientes', modo: 'leer', description: 'Todos los documentos enviados a firmar desde Asset que siguen en curso: operación, documento, propiedad, quién falta (con su calidad) y hace cuántos días. Úsala cuando pregunten «qué falta por firmar», «quién no ha firmado» o para hacer seguimiento.', parameters: S({ propiedad: REF_PROP }),
      run: async (a) => { if (!firmas) return { pendientes: [] }; const p = a.propiedad ? prop(a.propiedad) : null; const l = firmas.pendientes({ propId: p?.id || null });
        return { pendientes: l, atrasadas: l.filter((x) => x.atrasada).length, indicacion: l.some((x) => x.atrasada) ? 'Hay firmas de hace 3 días o más: ofrece reenviar el enlace (asset_reenviar_firma) o revisar si el correo o el celular del firmante está bien (asset_corregir_firmante).' : '' }; } },
    { name: 'asset_reenviar_firma', modo: 'confirmar', description: 'Reenvía por correo o WhatsApp el enlace de firma de Portalfirma a un firmante que aún no firma. El enlace lo envía Portalfirma.', parameters: S({ operacion: num('Número de operación'), firmante: str('Nombre, RUT o calidad del firmante (p. ej. «arrendatario»)'), via: en(['correo', 'whatsapp'], 'Por dónde (por defecto correo)') }, ['operacion', 'firmante']),
      preparar: async (a) => ({ titulo: `Reenviar el enlace de firma (operación ${a.operacion})`, detalle: [`Firmante: ${a.firmante}`, `Por ${a.via === 'whatsapp' ? 'WhatsApp' : 'correo'}`], aviso: 'Portalfirma le envía de nuevo su enlace para firmar.' }),
      run: async (a) => firmas.reenviar({ operacion: a.operacion, firmante: a.firmante, via: a.via === 'whatsapp' ? 'whatsapp' : 'correo' }) },
    { name: 'asset_corregir_firmante', modo: 'confirmar', description: 'Cuando el enlace de firma no le llegó a alguien porque su correo o celular estaba malo: corrige el dato del firmante en la operación de Portalfirma, le reenvía el enlace y corrige también la persona en el CRM.', parameters: S({ operacion: num('Número de operación'), firmante: str('Nombre, RUT o calidad del firmante'), email: str('Correo correcto'), telefono: str('Celular correcto') }, ['operacion', 'firmante']),
      preparar: async (a) => { const c = a.email ? firmas.correo(a.email) : null; const t = a.telefono ? firmas.celular(a.telefono) : null;
        if (c && !c.ok) throw err(`El correo ${a.email}: ${c.motivo}`); if (t && !t.ok) throw err(`El celular ${a.telefono} ${t.motivo}.`); if (!c && !t) throw err('Pide el correo o el celular correcto.');
        return { titulo: `Corregir el contacto de ${a.firmante} (operación ${a.operacion})`, detalle: [...(c ? [`Correo: ${c.valor}`] : []), ...(t ? [`Celular: ${t.valor}`] : [])], aviso: 'Se corrige en Portalfirma y en el CRM, y Portalfirma le reenvía su enlace para firmar.' }; },
      run: async (a) => ({ ...(await firmas.corregir({ operacion: a.operacion, firmante: a.firmante, email: a.email || null, telefono: a.telefono || null })), ...datos('personas') }) },

    // ======================= portales =======================
    { name: 'asset_publicar_portal', modo: 'confirmar', description: 'Publica la propiedad en Portal Inmobiliario (Mercado Libre). Antes revisa la ficha; si falta algo, devuelve qué.', parameters: S({ propiedad: REF_PROP, operacion: en(['venta', 'arriendo']), titulo_portal: str('Título para el aviso, máx. 60 caracteres') }, ['propiedad', 'operacion']),
      preparar: async (a) => { const p = prop(a.propiedad); const r = await ml.revisar(p.id, a.operacion, a.titulo_portal ? { tituloPortal: a.titulo_portal } : {}); if (r.errores.length) throw err('No se puede publicar todavía: ' + r.errores.join(' ')); return { titulo: 'Publicar en Portal Inmobiliario', detalle: [`${p.codigo} · ${a.operacion}`, `Título: ${a.titulo_portal || r.titulo}`, `Categoría: ${r.categoria.ruta.join(' › ')}`, `Fotos: ${r.fotos}`, ...r.avisos], aviso: `Usa una publicación del paquete «${r.tipoAviso}» (quedan ${r.paquete ?? '—'}).` }; },
      run: async (a) => { const p = prop(a.propiedad); const q = await ml.publicar(p.id, a.operacion, a.titulo_portal ? { tituloPortal: a.titulo_portal } : {}); return { ok: true, aviso: q.portales.pi[a.operacion], ...datos('propiedades') }; } },
    { name: 'asset_aviso_portal', modo: 'confirmar', description: 'Pausa, reactiva, actualiza o finaliza el aviso de Portal Inmobiliario de una propiedad.', parameters: S({ propiedad: REF_PROP, operacion: en(['venta', 'arriendo']), accion: en(['pausar', 'reactivar', 'actualizar', 'finalizar']) }, ['propiedad', 'operacion', 'accion']),
      preparar: async (a) => { const p = prop(a.propiedad); if (!p.portales?.pi?.[a.operacion]?.itemId) throw err(`${p.codigo} no tiene aviso de ${a.operacion} en Portal Inmobiliario.`); return { titulo: `${a.accion[0].toUpperCase() + a.accion.slice(1)} el aviso de Portal Inmobiliario`, detalle: [`${p.codigo} · ${a.operacion} · ${p.portales.pi[a.operacion].itemId}`], aviso: a.accion === 'finalizar' ? 'Un aviso finalizado no se puede reactivar.' : '' }; },
      run: async (a) => { const p = prop(a.propiedad); const st = { pausar: 'paused', reactivar: 'active', finalizar: 'closed' }[a.accion]; const q = st ? await ml.cambiarEstado(p.id, a.operacion, st) : await ml.actualizar(p.id, a.operacion); return { ok: true, aviso: q.portales.pi[a.operacion], ...datos('propiedades') }; } },
    { name: 'asset_sincronizar_portal', modo: 'leer', description: 'Trae de Portal Inmobiliario el estado de los avisos y los interesados nuevos.', parameters: S({}),
      run: async () => ({ ...(await ml.sincronizar()), ...datos('propiedades') }) },

    // ======================= estado y notas de lo que pasó =======================
    { name: 'asset_estado_propiedad', modo: 'leer', description: 'Cómo está una propiedad de un vistazo: estado comercial, negocios en curso con su etapa y lo que falta, lo último que pasó, próximas visitas y sugerencias de qué sigue. Úsala cuando pregunten por una propiedad o cómo va.', parameters: S({ propiedad: REF_PROP }, ['propiedad']),
      run: async (a) => { const p = prop(a.propiedad); const r = await est.estado(p.id); return { ...r, historial: undefined, efectos: { contexto: { tipo: 'propiedad', id: p.id } } }; } },
    { name: 'asset_anotar', modo: 'escribir', description: 'Anota algo que pasó fuera de Asset (una llamada, una visita, una oferta, documentos recibidos) en el historial de la propiedad y su negocio, y devuelve sugerencias del siguiente paso que la app muestra como botones. No agenda ni mueve nada por sí sola: usa esta herramienta cuando el usuario cuente lo que pasó.', parameters: S({ propiedad: REF_PROP, texto: str('Lo que pasó, en palabras del usuario'), tipo: en(['llamada', 'visita', 'documentos', 'oferta', 'otro']), negocio: REF_NEG }, ['propiedad', 'texto']),
      run: async (a) => { const p = prop(a.propiedad); const r = await est.anotar(p.id, { tipo: a.tipo || 'otro', texto: a.texto, negocioId: a.negocio ? negocio(a.negocio).id : undefined }); return { ...r, efectos: { datos: 'propiedades', contexto: { tipo: 'propiedad', id: p.id } } }; } },

    // ======================= publicaciones =======================
    { name: 'asset_rendimiento_avisos', modo: 'leer', description: 'Cómo van los avisos en los portales: visitas, contactos, interesados, calidad y recomendaciones de precio o de aviso por propiedad. Para publicar, abre el flujo con asset_abrir pantalla «publicar» y la propiedad.', parameters: S({ propiedad: REF_PROP }),
      run: async (a) => { const d = pubs.panel(); const id = a.propiedad ? prop(a.propiedad).id : null; const l = d.avisos.filter((f) => !id || f.propId === id);
        return { totales: d.totales, avisos: l.slice(0, 15).map((f) => ({ codigo: f.codigo, op: f.op, portales: f.portales.map((x) => `${x.nombre}: ${x.status}`), visitas: f.visitas, contactos: f.contactos, interesados: f.interesados, calidad: f.calidad, recomendaciones: f.recomendaciones.map((r) => r.t + ' ' + r.accion) })), sinPublicar: d.sinPublicar.slice(0, 10).map((x) => x.codigo) }; } },
    { name: 'asset_bandeja_interesados', modo: 'leer', description: 'Bandeja de interesados de todos los portales (nuevos, contactados, en visita). Para responder, el usuario usa la bandeja de Publicaciones.', parameters: S({ estado: en(['nuevo', 'contactado', 'visita', 'descartado']) }),
      run: async (a) => { const r = pubs.interesados({ estado: a.estado }); return { cuenta: r.cuenta, interesados: r.interesados.slice(0, 15).map((x) => ({ nombre: x.nombre, portal: x.portal, propiedad: x.codigo, estado: x.estado, fecha: x.fecha, telefono: x.telefono })) }; } },

    // ======================= navegación =======================
    { name: 'asset_abrir', modo: 'leer', description: 'Abre una pantalla de la app para el usuario: inicio, cartera, propiedad, personas, persona, negocios, negocio, agenda, portales, aprende o documental (firma y PDF).', parameters: S({ pantalla: en(['inicio', 'cartera', 'propiedad', 'personas', 'persona', 'negocios', 'negocio', 'agenda', 'portales', 'aprende', 'documental', 'operaciones', 'publicaciones', 'publicar']), ref: str('Para propiedad, persona o negocio: id, código o nombre; para operaciones, el número de operación') }, ['pantalla']),
      run: async (a) => { const id = a.pantalla === 'propiedad' ? prop(a.ref).id : a.pantalla === 'persona' ? persona(a.ref).id : a.pantalla === 'negocio' ? negocio(a.ref).id : a.pantalla === 'publicar' ? prop(a.ref).id : a.pantalla === 'operaciones' ? (Number(String(a.ref || '').replace(/\D/g, '')) || null) : null; return { ok: true, efectos: { navegar: { pantalla: a.pantalla, id } } }; } },
  ];
  return T;
}

module.exports = { crear };
