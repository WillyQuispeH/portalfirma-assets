/* global $, api, esc, icon, toast, closeModal, ir, pf, liberar, cargar */
'use strict';
// «Hoy» y las etapas del negocio (0.15). Tres etapas (Captación · Comercialización · Postventa) con pasos
// logrados, pendientes («te toca» o «esperando a…») y no logrados. Estilo: vidrio sobre la foto del inicio
// desenfocada, y una «luz guía» que recorre el botón recomendado (y se mueve al botón donde está el mouse).
(() => {
const fdm = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '');
const hoyISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const venceTxt = (v) => (!v ? '' : v === hoyISO() ? 'Vence hoy' : v < hoyISO() ? `Venció el ${fdm(v)}` : `Plazo: ${fdm(v)}`);
const IC = {
  ok: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  pend: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  otro: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M7 4h10M7 20h10M8 4c0 4 8 4 8 8s-8 4-8 8M16 4c0 4-8 4-8 8"/></svg>',
  fail: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/></svg>',
  todo: '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="6"/></svg>',
};
const claseDe = (x) => (x.e === 'ok' ? 'ok' : x.e === 'fail' ? 'fail' : x.e === 'pend' ? (x.q === 'otro' ? 'otro' : 'pend') : 'todo');

// ---------- luz guía: el botón recomendado brilla; la luz sigue al mouse y vuelve al recomendado al salir ----------
function luz(root) {
  const def = () => root.querySelector('.luz[data-def]') || root.querySelector('.luz');
  const poner = (el) => { root.querySelectorAll('.luz.on').forEach((x) => x !== el && x.classList.remove('on')); el?.classList.add('on'); };
  poner(def());
  root.querySelectorAll('.luz').forEach((el) => { el.onmouseenter = () => poner(el); el.onmouseleave = () => poner(def()); el.onfocusin = () => poner(el); });
}

// ---------- ventana de trabajo: cada acción se hace en su propia ventana, sin pasar por el chat del Agente ----------
const V = { ov: null, body: null, alCerrar: null };
function ventana(titulo, sub, alCerrar) {
  cerrarVentana(true);
  const ov = document.createElement('div'); ov.className = 'vt-ov';
  ov.innerHTML = `<div class="vt gl-card" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><div class="vt-h"><div><b>${esc(titulo)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div><button class="gl vt-x" aria-label="Cerrar">${icon('x', 16)}</button></div><div class="vt-b"></div></div>`;
  document.body.appendChild(ov); V.ov = ov; V.body = ov.querySelector('.vt-b'); V.alCerrar = alCerrar || null;
  ov.querySelector('.vt-x').onclick = () => cerrarVentana(); ov.addEventListener('mousedown', (e) => { if (e.target === ov) cerrarVentana(); });
  return V.body;
}
function cerrarVentana(silencioso) { if (!V.ov) return; V.ov.remove(); V.ov = null; V.body = null; const f = V.alCerrar; V.alCerrar = null; if (!silencioso) f?.(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && V.ov && document.querySelector('#modal')?.classList.contains('hidden')) cerrarVentana(); });
// los flujos guiados (documentos, agendar…) dibujan tarjetas con Agente.tarjeta: si hay una ventana abierta, van ahí
function engancharAgente() {
  const A = window.Agente; if (!A || A.__vt) return; A.__vt = true;
  const t0 = A.tarjeta, d0 = A.decir, b0 = A.bajar, c0 = A.contexto;
  A.tarjeta = (node, o) => { if (V.body) { node.querySelector(':scope > .ga-x')?.remove(); V.body.appendChild(node); requestAnimationFrame(() => node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); return 0; } return t0(node, o); };
  A.decir = (...a) => (V.body ? undefined : d0(...a)); A.bajar = (...a) => (V.body ? undefined : b0?.(...a)); A.contexto = (...a) => (V.body ? undefined : c0?.(...a));
}
const propDe = (id) => window.Inmo._IM.data?.propiedades?.find((p) => p.id === id) || null;
async function documento(x, re, titulo, buscar) {
  const body = ventana(titulo, [x.codigo, x.titulo].filter(Boolean).join(' · '), x.alTerminar);
  body.innerHTML = '<div class="ga-load"><span class="spinner sm"></span>Buscando la plantilla…</div>';
  window.members(async () => {
    try {
      const l = await api('docPlantillas', { texto: buscar, propId: x.propId }); const t = re.map((r) => l.find((y) => r.test(y.nombre))).find(Boolean);
      body.innerHTML = '';
      if (t) await window.Gestion.usarPlantilla(x.propId, t.id, t.nombre);
      else await window.Gestion.docNuevo({ propId: x.propId, titulo, tipoDoc: 'libre', negocioId: x.negocioId || null });
    } catch (e) { body.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }, 'Para enviar documentos a firmar, inicia sesión con tu cuenta de Portalfirma.');
}

// Lo que el modal-13 agrega en los pasos con firma: documentos ya generados y el botón para enviarlos a firmar
function extraPaso(x, alTerminar) {
  const t = x.tipo; const id = x.pasoId || x.id;
  if (id === 'orden' && x.propId) {
    // la orden la arma Asset (plantilla HTML → PDF en el servidor): el corredor ve el PDF antes de enviarlo a firmar
    const enviar = async () => {
      const neg = x.negocioId ? await api('negObtener', x.negocioId).catch(() => null) : null;
      if (!neg?.clienteId) return toast('Primero vincula al ' + (neg?.tipo === 'venta' ? 'comprador' : 'arrendatario') + ' del negocio (paso «Interesado registrado»).', 5000);
      const vs = await api('agendaListar', { propId: x.propId, tipo: 'visita' }).catch(() => []);
      const v = vs.filter((e) => e.estado === 'programado' && e.negocioId === x.negocioId).sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')))[0];
      return window.Agenda.ordenVisita({ id: v?.id, prop: { id: x.propId }, personas: [{ id: neg.clienteId }], fecha: v?.fecha, hora: v?.hora, negocioId: x.negocioId, operacion: neg.tipo }, () => alTerminar?.());
    };
    const dd = docsDeFirma(x, /orden de visita/i, enviar, 'Ver la orden y enviarla a firmar');
    return { ...dd, etiquetaEnviar: dd.documentos.length ? 'Enviar una orden nueva' : 'Ver la orden y enviarla a firmar', alCambioDocs: alTerminar };
  }
  if (t === 'visita' && x.negocioId) { // modal-13: la visita del negocio (agendar, confirmar por WhatsApp, reprogramar, realizada, cancelada)
    const p = propDe(x.propId); const c = x.clienteId ? window.Inmo._IM.data?.personas?.find((q) => q.id === x.clienteId) : null;
    return { visita: { negocioId: x.negocioId, propId: x.propId, lugar: p ? [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ') : '', clienteId: x.clienteId || '', cliente: c?.nombre || '',
      alCambio: () => alTerminar?.() } };
  }
  if (t === 'cliente' && x.negocioId) { // modal-13: elegir al cliente (arrendatario o comprador) del negocio
    // solo quien puede ser el cliente: arrendatario (o comprador) e interesados; nunca el propietario de la propiedad ni proveedores
    const rol = x.clienteRol || 'arrendatario'; const dueños = new Set((propDe(x.propId)?.vinculos || []).filter((v) => v.rol === 'propietario').map((v) => v.personaId));
    const personas = [...(window.Inmo._IM.data?.personas || [])].filter((c) => (c.id === x.clienteId || !dueños.has(c.id) && (!(c.roles || []).length || c.roles.includes(rol) || c.roles.includes('interesado'))))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((c) => ({ id: c.id, texto: `${c.nombre}${c.rut ? ' · ' + c.rut : ''}` }));
    return { personas, rolCliente: rol, clienteActual: x.clienteId || '', alVincular: async (clienteId) => { await api('negGuardar', { id: x.negocioId, clienteId }); closeModal(); toast(`${rol === 'comprador' ? 'Comprador' : 'Arrendatario'} ${x.clienteId ? 'cambiado' : 'vinculado'}.`); alTerminar?.(); } };
  }
  if (t === 'acta' && x.negocioId) { const dd = docsDeFirma(x, /^acta de visita/i, null); return dd.documentos.length ? { documentos: dd.documentos, alCambioDocs: alTerminar } : {}; }   // el acta enviada a firmar: ver su PDF y revisar la firma
  if (t === 'post' && x.negocioId) return { post: { negocioId: x.negocioId, modo: id === 'reajustes' ? 'reajustes' : id === 'renovacion' ? 'renovacion' : 'devolucion', alCambio: () => alTerminar?.() } };   // modal-13: avisos del postarriendo
  if (t === 'revision' && x.negocioId) return { revision: { negocioId: x.negocioId, alCambio: () => alTerminar?.(), reabrir: () => window.Etapas.accion(x, alTerminar) } };   // modal-13: versiones, comentarios y aprobaciones del contrato
  if (t === 'pago' && x.negocioId) return { pagos: { negocioId: x.negocioId, modo: id === 'reserva_pago' ? 'reserva' : id === 'garantia_mes' ? 'garantia' : 'comision', alCambio: () => alTerminar?.() } };   // modal-13: pagos con monto, fecha y comprobante
  if (t === 'aceptacion' && x.negocioId) return { aceptacion: { negocioId: x.negocioId, alCambio: () => alTerminar?.() } };   // modal-13: la negociación con el propietario
  if (id === 'carta' && x.negocioId) { // la carta la arma Asset (plantilla HTML → PDF en el servidor): se ve el PDF antes de enviarlo a firmar
    const dd = docsDeFirma(x, /carta oferta/i, () => cartaOferta(x.negocioId, () => alTerminar?.()), 'Ver la carta y enviarla a firmar');
    return { ...dd, etiquetaEnviar: dd.documentos.length ? 'Enviar una carta nueva' : 'Ver la carta y enviarla a firmar', alCambioDocs: alTerminar };
  }
  if (id === 'contrato' && x.negocioId && x.tipo === 'firma') { // el contrato lo arma Asset (plantilla HTML → PDF en el servidor): se ve antes de enviarlo a firmar
    const dd = docsDeFirma(x, /contrato de arriendo/i, () => contratoArriendo(x.negocioId, () => alTerminar?.(), 'firma'), 'Enviar el contrato aprobado a firmar');
    return { ...dd, etiquetaEnviar: dd.documentos.length ? 'Enviar un contrato nuevo' : 'Enviar el contrato aprobado a firmar', alCambioDocs: alTerminar };
  }
  if (id === 'entrega' && x.negocioId && x.tipo === 'firma') { // el acta de entrega e inventario la arma Asset: se llena, se ve el PDF y se envía a firmar
    const dd = docsDeFirma(x, /acta de entrega/i, () => actaEntrega(x.negocioId, () => alTerminar?.()), 'Hacer el acta de entrega');
    return { ...dd, etiquetaEnviar: dd.documentos.length ? 'Enviar un acta nueva' : 'Hacer el acta de entrega', alCambioDocs: alTerminar };
  }
  if ((t === 'firma' || t === 'revisar') && x.etapaFirma && x.negocioId)
  { // modal-13: documentos generados + enviar a firmar (o revisar las firmas)
    const ng = accNegocio(x.negocioId);
    return { ...docsDeFirma(x, RE_DOC[id] || new RegExp((x.t || '').replace(/ firmad[oa]$/i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      () => (ng ? (t === 'revisar' ? ng.revisarFirmas() : ng.enviarFirma()) : window.Negocios.abrirNegocio(x.negocioId)), t === 'revisar' ? 'Revisar firmas' : 'Enviar a firmar'), alCambioDocs: alTerminar }; }
  return {};
}
// los propietarios de una propiedad como los usan las ventanas de los documentos (sus datos se completan ahí mismo)
const dueñosDe = (propId) => { const t = (x) => (x == null ? '' : String(x)); return (propDe(propId)?.vinculos || []).filter((v) => v.rol === 'propietario').map((v) => (window.Inmo._IM.data?.personas || []).find((q) => q.id === v.personaId)).filter(Boolean)
  .map((q) => ({ id: q.id, base: q, nombre: t(q.nombre), rut: t(q.rut), email: t(q.email), telefono: t(q.telefono), nacionalidad: t(q.nacionalidad) || 'chilena', estadoCivil: t(q.estadoCivil), profesion: t(q.profesion), direccion: t(q.direccion) })); };
// ---------- carta oferta: Asset arma el PDF (plantilla HTML en el servidor); el corredor lo ve, lo ajusta y lo envía a firmar ----------
// Lo editado se guarda en su origen (la persona del CRM y el negocio: monto, garantía, plazo, vigencia, condiciones) y el
// servidor arma el PDF con lo ya guardado. Al firmarse, el negocio avanza solo.
async function cartaOferta(negocioId, despues) {
  const n0 = await api('negObtener', negocioId).catch(() => null);
  if (!n0) return toast('No encontré el negocio.');
  if (!n0.cliente) return toast('Primero vincula al ' + (n0.tipo === 'venta' ? 'comprador' : 'arrendatario') + ' del negocio (paso «Interesado registrado»).', 5000);
  window.members(async () => {
    const pdfPromesa = api('cartaVistaPrevia', { negocioId }).then((r) => ({ pdf: r.pdf || '' })); pdfPromesa.catch(() => {});   // la ventana se abre ya: el documento se arma ahí mismo (o se trae, si ya existe) y la vista previa lo muestra al llegar
    const per = (IM.data.personas || []).find((x) => x.id === n0.cliente.id) || n0.cliente; const p = (IM.data.propiedades || []).find((x) => x.id === n0.prop?.id) || n0.prop || {};
    const o = n0.oferta || {}; const fmt = (x) => (x ? Number(x).toLocaleString('es-CL', { maximumFractionDigits: 2 }) : '');
    window.Ventanas.abrir('negocios.cartaOferta', {
      pdfPromesa, tipo: n0.tipo === 'venta' ? 'venta' : 'arriendo',
      datos: { nombre: per.nombre || '', rut: per.rut || '', email: per.email || '', telefono: per.telefono || '', nacionalidad: per.nacionalidad || 'chilena', estadoCivil: per.estadoCivil || '', profesion: per.profesion || '', direccion: per.direccion || '',
        monto: fmt(n0.valor?.valor), moneda: n0.valor?.moneda || 'UF', garantia: o.garantia || '', plazo: o.plazo || '', vigencia: o.vigencia || '3', condiciones: o.condiciones || '',
        piePct: o.piePct || '', promesaDias: o.promesaDias || '', escrituraDias: o.escrituraDias || '', seriedadUF: o.seriedadUF || '', comisionPct: o.comisionPct || '' },
      propietarios: dueñosDe(n0.prop?.id),
      propiedad: { codigo: p.codigo || '', titulo: p.titulo || '', direccion: [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ') },
      alGuardar: async (v) => {
        const CP = ['nombre', 'rut', 'email', 'telefono', 'nacionalidad', 'estadoCivil', 'profesion', 'direccion'];
        if (CP.some((k) => (v[k] || '') !== (per[k] || (k === 'nacionalidad' ? 'chilena' : '')))) { const cambios = Object.fromEntries(CP.map((k) => [k, v[k]])); await api('inmoPerGuardar', { ...per, ...cambios }); Object.assign(per, cambios); }
        await api('negGuardar', { id: negocioId, valor: { valor: Number(String(v.monto).replace(/\./g, '').replace(',', '.')), moneda: v.moneda }, oferta: { garantia: v.garantia, plazo: v.plazo, vigencia: v.vigencia, condiciones: v.condiciones, piePct: v.piePct, promesaDias: v.promesaDias, escrituraDias: v.escrituraDias, seriedadUF: v.seriedadUF, comisionPct: v.comisionPct } });
        const r = await api('cartaVistaPrevia', { negocioId });   // el servidor lee lo ya guardado
        try { await cargar(); } catch {}
        return { pdf: r.pdf || '' };
      },
      // si falla, la ventana muestra el error y sigue abierta
      alConfirmar: async (op) => { const r = await api('cartaEnviar', { negocioId, conPropietario: op?.conPropietario === true }); closeModal(); toast(`Carta oferta nº ${r.numero} enviada a firmar: operación ${r.operacion}.`, 5000); despues?.(r); },
    }, { clave: 'modal-125', ancho: true });
  }, 'Para enviar la carta oferta, inicia sesión con tu cuenta de Portalfirma.');
}
// ---------- mandato de arriendo: Asset arma el PDF (plantilla HTML en el servidor); se ve, se puede DESCARGAR sin firmar o enviar a firmar al propietario ----------
async function mandatoArriendo(propId, despues) {
  window.members(async () => {
    const pdfPromesa = api('mandatoVistaPrevia', { propiedadId: propId }).then((r) => ({ pdf: r.pdf || '' })); pdfPromesa.catch(() => {});   // la ventana se abre ya: el documento se arma ahí mismo (o se trae, si ya existe) y la vista previa lo muestra al llegar
    try { await cargar(); } catch {}   // la cartera al día: el propietario y la ficha pueden haber cambiado
    const p = propDe(propId) || {}; const f = p.ficha || {};
    const personas = IM.data.personas || [];
    const propietarios = (p.vinculos || []).filter((v) => v.rol === 'propietario').map((v) => personas.find((q) => q.id === v.personaId)).filter(Boolean);
    const t = (x) => (x == null ? '' : String(x));
    const datos = {
      propietarios: propietarios.map((q) => ({ id: q.id, base: q, nombre: t(q.nombre), rut: t(q.rut), email: t(q.email), telefono: t(q.telefono), nacionalidad: t(q.nacionalidad) || 'chilena', estadoCivil: t(q.estadoCivil), profesion: t(q.profesion), direccion: t(q.direccion) })),
      rol: t(p.rol), supTotal: t(p.supTotal), supUtil: t(p.supUtil), canon: t(p.precioArriendo?.valor), moneda: p.precioArriendo?.moneda || 'UF',
      publicar: f.publicarPortales !== false, exclusividad: !!f.exclusividad, mascotas: f.mascotas === true ? 'si' : f.mascotas === false ? 'no' : '', mesesGarantia: t(f.mesesGarantia), otras: t(f.condicionesMandato),
    };
    window.Ventanas.abrir('negocios.mandatoArriendo', {
      pdfPromesa, archivo: ('Mandato de arriendo ' + (p.codigo || '') + '.pdf').replace(/\s+\.pdf$/, '.pdf'),
      propiedad: { codigo: p.codigo || '', titulo: p.titulo || '', direccion: [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ') },
      datos,
      // guarda la propiedad (las personas ya las guardó la ventana) y pide el PDF de nuevo: el servidor lee lo ya guardado
      alGuardar: async (v) => {
        const n = (x) => (String(x).trim() === '' ? null : Number(String(x).replace(/\./g, '').replace(',', '.')));
        await api('inmoPropGuardar', { id: propId, rol: v.rol.trim(), supTotal: n(v.supTotal), supUtil: n(v.supUtil), precioArriendo: n(v.canon) ? { valor: n(v.canon), moneda: v.moneda } : null,
          ficha: { publicarPortales: v.publicar, exclusividad: v.exclusividad, ...(v.mascotas ? { mascotas: v.mascotas === 'si' } : {}), ...(v.mesesGarantia !== '' ? { mesesGarantia: n(v.mesesGarantia) } : {}), condicionesMandato: v.otras.trim() } });
        try { await cargar(); } catch {}
        return { pdf: (await api('mandatoVistaPrevia', { propiedadId: propId })).pdf || '' };
      },
      alEnviar: async () => { const r = await api('mandatoEnviar', { propiedadId: propId }); closeModal(); toast('Mandato de arriendo nº ' + r.numero + ' enviado a firmar: operación ' + r.operacion + '.', 5000); despues?.(r); },
    }, { clave: 'modal-129', ancho: true });
  }, 'Para armar el mandato, inicia sesión con tu cuenta de Portalfirma.');
}
// ---------- contrato de arriendo ----------
// Dos modos: 'borrador' (paso «Revisión del contrato»): se editan las condiciones, el servidor arma el PDF y se guarda como una VERSIÓN
// (su PDF queda en los archivos del negocio) para mandarla a revisión; 'firma' (paso «Contrato firmado»): se envía a firmar el PDF de la
// última versión, que ya aprobaron el propietario y el arrendatario. Sin esa aprobación no se puede enviar.
async function contratoArriendo(negocioId, despues, modo = 'borrador') {
  const n0 = await api('negObtener', negocioId).catch(() => null);
  if (!n0) return toast('No encontré el negocio.');
  if (!n0.cliente) return toast('Primero vincula al arrendatario del negocio (paso «Interesado registrado»).', 5000);
  const k = n0.ciclo?.contrato || {}; const ultima = (k.versiones || []).slice(-1)[0];
  const p = (IM.data.propiedades || []).find((x) => x.id === n0.prop?.id) || n0.prop || {};
  const propiedad = { codigo: p.codigo || '', titulo: p.titulo || '', direccion: [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ') };
  // los codeudores son los avales de la evaluación del arrendatario (no se escriben a mano)
  const ev = await api('evVer', negocioId).catch(() => null); const codeudores = (ev && !ev.vacia ? ev.personas || [] : []).filter((q) => q.rol === 'aval').map((q) => { const per = (IM.data.personas || []).find((z) => z.id === q.personaId) || {}; return { personaId: q.personaId, nombre: q.nombre || per.nombre || '', rut: per.rut || '' }; });
  const tipoProp = String(p.tipo || '').toLowerCase(); const usoDe = /oficina/.test(tipoProp) ? 'oficina' : /local|comercial/.test(tipoProp) ? 'comercial' : /bodega/.test(tipoProp) ? 'bodega' : /estacion/.test(tipoProp) ? 'estacionamiento' : 'habitacional';
  const persDe = (id, rol) => { const per = (IM.data.personas || []).find((z) => z.id === id) || {}; return { personaId: id, rol, nombre: per.nombre || '', rut: per.rut || '', email: per.email || '', telefono: per.telefono || '', nacionalidad: per.nacionalidad || 'chilena', estadoCivil: per.estadoCivil || '', profesion: per.profesion || '', direccion: per.direccion || '' }; };
  const dueños = (propDe(n0.prop?.id)?.vinculos || []).filter((v) => v.rol === 'propietario').map((v) => persDe(v.personaId, 'Arrendador'));
  const firmantes = [...dueños, persDe(n0.cliente.id, 'Arrendatario'), ...codeudores.filter((c) => c.personaId).map((c) => persDe(c.personaId, 'Codeudor'))];
  // guarda los datos de los firmantes que se editaron en la ventana (en la ficha de cada persona)
  const guardarFirmantes = async (nuevos) => { for (const q of nuevos) { const a = firmantes.find((z) => z.personaId === q.personaId); const CP = ['nombre', 'rut', 'email', 'telefono', 'nacionalidad', 'estadoCivil', 'profesion', 'direccion']; if (!a || CP.every((c) => (a[c] || '') === (q[c] || ''))) continue; const per = (IM.data.personas || []).find((z) => z.id === q.personaId); if (!per) continue; const cambios = Object.fromEntries(CP.map((c) => [c, c === 'nombre' ? (q.nombre || per.nombre) : q[c]])); await api('inmoPerGuardar', { ...per, ...cambios }); Object.assign(a, cambios); } try { await cargar(); } catch {} };
  const kd = k.datos || {}; const mesesGar = kd.garantiaMeses || (/\d+([.,]\d+)?/.exec(String(n0.oferta?.garantia || ''))?.[0] || '1').replace(',', '.'); const fmt = (x) => (x ? Number(x).toLocaleString('es-CL', { maximumFractionDigits: 2 }) : '');
  const datos = { inicio: kd.inicio || '', plazoMeses: String(kd.plazoMeses || ''), renta: fmt(n0.valor?.valor), moneda: n0.valor?.moneda || 'CLP', reajuste: kd.reajuste || 'ipc_anual', avisoDias: String(kd.avisoDias || '60'), diaPago: String(kd.diaPago || '5'), garantiaMeses: String(mesesGar), cuenta: kd.cuenta || p.ficha?.cuentaPago || '', uso: kd.uso || usoDe, clausulas: kd.clausulas || '' };
  if (modo === 'firma') { // el contrato APROBADO: el PDF de la última versión, aprobada por el propietario y el arrendatario
    if (!ultima) return toast('Primero arma el contrato y apruébalo en el paso «Revisión del contrato».', 6000);
    { const fsV = ultima.firmantes || []; const faltan = fsV.filter((q) => !k.aprobado?.[q.personaId]); if (!fsV.length || faltan.length) return toast(`Falta la aprobación de ${faltan.map((q) => q.nombre).join(', ') || 'los firmantes'} sobre la versión ${ultima.n}: se registra en el paso «Revisión del contrato».`, 6000); }
    if (!ultima.archivo) return toast(`La versión ${ultima.n} no tiene su PDF: guárdala con su archivo en el paso «Revisión del contrato».`, 6000);
    window.members(async () => {
      let pdfAprobado = ''; const pdfPromesa = api('contratoVersion', { negocioId, clave: ultima.archivo.clave }).then((r) => { pdfAprobado = r.pdf || ''; return { pdf: pdfAprobado }; }); pdfPromesa.catch(() => {});   // la ventana se abre ya: el documento se arma ahí mismo (o se trae, si ya existe) y la vista previa lo muestra al llegar
      const firma0 = { tipoFirma: k.firma?.tipoFirma === 'avanzada' ? 'avanzada' : 'simple', tramite: k.firma?.tramite === 'legalization' ? 'legalization' : 'none' };
      window.Ventanas.abrir('negocios.contratoArriendo', {
        modo: 'firma', versionN: ultima.n, pdfPromesa, firma: firma0, datos, propiedad, firmantes,
        alGuardar: async (_d, _f, nuevos) => { await guardarFirmantes(nuevos); return { pdf: pdfAprobado }; },
        alConfirmar: async (f) => { const r = await api('contratoEnviar', { negocioId, tipoFirma: f.tipoFirma, tramite: f.tramite }); try { const b = JSON.parse(JSON.stringify((await api('negObtener', negocioId)).ciclo || {})); b.contrato ||= {}; b.contrato.firma = { tipoFirma: f.tipoFirma, tramite: f.tramite }; await api('negGuardar', { id: negocioId, ciclo: b }); } catch {} closeModal(); toast(`Contrato de arriendo (versión ${r.version}) enviado a firmar: operación ${r.operacion}.`, 5000); despues?.(r); },
      }, { clave: 'modal-127', ancho: true });
    }, 'Para enviar el contrato, inicia sesión con tu cuenta de Portalfirma.');
    return;
  }
  window.members(async () => {
    const pdfPromesa = api('contratoVistaPrevia', { negocioId }).then((r) => ({ pdf: r.pdf || '' })); pdfPromesa.catch(() => {});   // la ventana se abre ya: el documento se arma ahí mismo (o se trae, si ya existe) y la vista previa lo muestra al llegar
    window.Ventanas.abrir('negocios.contratoArriendo', {
      modo: 'borrador', pdfPromesa, firma: { tipoFirma: 'simple', tramite: 'none' }, datos, propiedad, firmantes,
      alGuardar: async (d, _f, nuevos) => {
        await guardarFirmantes(nuevos);   // primero los datos de los firmantes: el servidor arma el PDF con lo ya guardado en sus fichas
        const base = JSON.parse(JSON.stringify((await api('negObtener', negocioId)).ciclo || {})); base.contrato ||= {};
        base.contrato.datos = { inicio: d.inicio, plazoMeses: Number(d.plazoMeses), reajuste: d.reajuste, avisoDias: Number(d.avisoDias) || 0, diaPago: Number(d.diaPago) || 5, garantiaMeses: Number(String(d.garantiaMeses).replace(',', '.')), uso: d.uso, cuenta: (d.cuenta || '').trim(), clausulas: d.clausulas.trim() };
        await api('negGuardar', { id: negocioId, ciclo: base, valor: { valor: Number(String(d.renta).replace(/\./g, '').replace(',', '.')), moneda: d.moneda } });
        const r = await api('contratoVistaPrevia', { negocioId });   // el servidor lee lo ya guardado
        try { await cargar(); } catch {}
        return { pdf: r.pdf || '' };
      },
      alGuardarVersion: async () => { const r = await api('contratoVersionGuardar', { negocioId, de: 'corredora', nota: ultima ? 'Condiciones actualizadas' : 'Borrador del contrato' }); closeModal(); toast(`Versión ${r.version} del contrato guardada. Ahora envíala al propietario y al arrendatario para su aprobación.`, 5000); despues?.(r); },
    }, { clave: 'modal-127', ancho: true });
  }, 'Para armar el contrato, inicia sesión con tu cuenta de Portalfirma.');
}
// ---------- acta de entrega e inventario: se llena en Asset y el servidor arma el PDF; al firmarse la propiedad queda «Arrendada» ----------
const INVENTARIO_BASE = ['Living-comedor', 'Cocina', 'Dormitorio principal', 'Baño', 'Pisos y muros', 'Ventanas y puertas'];
async function actaEntrega(negocioId, despues) {
  const n0 = await api('negObtener', negocioId).catch(() => null);
  if (!n0) return toast('No encontré el negocio.');
  if (!n0.cliente) return toast('Primero vincula al arrendatario del negocio (paso «Interesado registrado»).', 5000);
  window.members(async () => {
    const e = n0.ciclo?.entrega || {}; const p = (IM.data.propiedades || []).find((x) => x.id === n0.prop?.id) || n0.prop || {};
    const datos = {
      fecha: e.fecha || '', llaves: e.llaves || '', observaciones: e.observaciones || '',
      medidores: { luz: { numero: e.medidores?.luz?.numero || '', lectura: e.medidores?.luz?.lectura || '' }, agua: { numero: e.medidores?.agua?.numero || '', lectura: e.medidores?.agua?.lectura || '' }, gas: { numero: e.medidores?.gas?.numero || '', lectura: e.medidores?.gas?.lectura || '' } },
      inventario: (e.inventario?.length ? e.inventario : INVENTARIO_BASE.map((espacio) => ({ espacio, estado: 'bueno', nota: '' }))).map((i) => ({ espacio: i.espacio || '', estado: i.estado || 'bueno', nota: i.nota || '' })),
    };
    // sin datos guardados no hay PDF todavía: la ventana se abre para llenarlos; con datos, el PDF se arma ahí mismo
    const pdfPromesa = e.fecha && e.inventario?.length ? api('entregaVistaPrevia', { negocioId }).then((r) => ({ pdf: r.pdf || '' })) : undefined; pdfPromesa?.catch(() => {});   // la ventana se abre ya: el documento se arma ahí mismo (o se trae, si ya existe) y la vista previa lo muestra al llegar
    const firmantes = [...dueñosDe(n0.prop?.id).map((q) => ({ rol: 'Arrendador', nombre: q.nombre })), { rol: 'Arrendatario', nombre: n0.cliente.nombre }];
    window.Ventanas.abrir('negocios.actaEntrega', {
      pdfPromesa, datos, firmantes,
      propiedad: { codigo: p.codigo || '', titulo: p.titulo || '', direccion: [p.direccion, p.unidad ? 'depto. ' + p.unidad : '', p.comuna].filter(Boolean).join(', ') },
      alGuardar: async (d) => {
        const base = JSON.parse(JSON.stringify((await api('negObtener', negocioId)).ciclo || {}));
        base.entrega = { fecha: d.fecha, llaves: d.llaves.trim(), observaciones: d.observaciones.trim(), medidores: d.medidores, inventario: d.inventario.map((i) => ({ espacio: i.espacio.trim(), estado: i.estado, nota: i.nota.trim() })) };
        await api('negGuardar', { id: negocioId, ciclo: base });
        const r = await api('entregaVistaPrevia', { negocioId });   // el servidor lee lo ya guardado
        try { await cargar(); } catch {}
        return { pdf: r.pdf || '', firmantes: r.firmantes };
      },
      alConfirmar: async () => { const r = await api('entregaEnviar', { negocioId }); closeModal(); toast(`Acta de entrega nº ${r.numero} enviada a firmar: operación ${r.operacion}.`, 5000); despues?.(r); },
    }, { clave: 'modal-128', ancho: true });
  }, 'Para enviar el acta de entrega, inicia sesión con tu cuenta de Portalfirma.');
}
// ---------- acciones de un paso ----------
// acciones del negocio abierto en pantalla (las deja negocios.js); si no es ese negocio, se abre
const accNegocio = (negocioId) => { const NG = window.Negocios?._NG; return NG?.acc && NG.actual === negocioId ? NG.acc : null; };
const RE_DOC = { orden: /orden de visita/i, carta: /carta oferta|oferta/i, promesa: /promesa/i, escritura: /escritura/i, contrato: /contrato de arriendo/i, entrega: /acta/i };
// documentos ya generados de la propiedad que corresponden al paso (firmas y archivos) y cómo enviarlos a firmar
function docsDeFirma(x, re, enviar, etiqueta) {
  const p = propDe(x.propId); const L = [];
  (p?.firmas || []).filter((f) => re.test(f.plantilla || f.titulo || '') && (!f.negocioId || !x.negocioId || f.negocioId === x.negocioId)).forEach((f) =>
    L.push({ nombre: f.plantilla || f.titulo, estado: f.estado === 'firmado' ? 'Firmado' : f.operacion || f.estado === 'en_firma' ? 'En firma' : 'Generado', fecha: fdm((f.firmado || f.fecha || '').slice(0, 10)), operacion: f.operacion || null,
      firmantes: (f.firmantes || []).map((m) => `${m.nombre || m.email || ''}${m.firmado || m.estado === 'firmado' ? ' ✓' : ''}`).filter(Boolean) }));
  (p?.documentos || []).filter((d) => re.test(d.nombre || '')).forEach((d) => L.push({ nombre: d.nombre, estado: 'Generado', fecha: fdm((d.fecha || '').slice(0, 10)), operacion: null }));
  return { documentos: L, alEnviar: enviar, etiquetaEnviar: etiqueta };
}
async function accion(x, alTerminar) {
  const t = x.tipo; const id = x.pasoId || x.id; x.alTerminar = alTerminar; engancharAgente();
  if (x.negocioId) { try { await cargar(); } catch {} }   // la cartera al día: los documentos y firmas de cada paso salen de ahí (si no, un documento recién enviado aparece como «todavía no hay»)
  if ((t === 'visita' || t === 'aceptacion' || t === 'pago' || t === 'revision' || t === 'post') && x.negocioId) return menuPaso(x, alTerminar);   // modal-13: agendar, confirmar, reprogramar y marcar la visita, todo adentro
  if (x.accion === 'Reprogramar' || x.accion === 'Reintentar') return reprogramar(x, alTerminar);
  // 0.16.14 · los pasos de la ficha abren la ficha completa en su bloque
  const BLQ = { datos: 'esencial', portal: 'portal', legal: 'legal', equip: 'equip' };
  if (BLQ[id] && x.propId) return window.FichaBloques.abrir(x.propId, { bloque: BLQ[id], despues: alTerminar });
  if (id === 'comovisitar' && x.propId) return window.FichaBloques.abrir(x.propId, { bloque: 'visita', despues: alTerminar });
  if (id === 'mandato' && x.propId && (() => { const q = (IM.data.propiedades || []).find((y) => y.id === x.propId); return q && q.arriendo && !q.venta; })()) return mandatoArriendo(x.propId, alTerminar);   // propiedad solo de arriendo: mandato de Asset (la venta sigue con sus formatos)
  if (id === 'mandato' && x.propId) { const e = await api('fmtEstado').catch(() => null); const otro = () => documento(x, [/contrato de corretaje/i, /mandato/i, /^(?!.*visita).*corretaje/i], 'Mandato de corretaje', 'Contrato de corretaje');
    return e ? window.Formatos.abrir(x.propId, { hito: 'mandato', despues: alTerminar }, otro) : otro(); }
  if (id === 'mandato') return documento(x, [/contrato de corretaje/i, /mandato/i, /^(?!.*visita).*corretaje/i], 'Mandato de corretaje', 'Contrato de corretaje');
  if ((id === 'orden' && x.propId) || ((t === 'firma' || (t === 'revisar' && x.etapaFirma)) && x.negocioId)) { try { await cargar(); } catch {} return menuPaso(x, alTerminar); }   // con la cartera al día: la lista de documentos muestra lo último (p. ej. «Firmado») // modal-13: documentos generados + enviar a firmar
  if (id === 'visita') { ventana('Agendar visita', [x.codigo, x.titulo].filter(Boolean).join(' · '), alTerminar); const neg = x.negocioId ? (await api('negObtener', x.negocioId).catch(() => null)) : null; return window.Gestion.agendar({ tipo: 'visita', propId: x.propId, personaId: neg?.clienteId || undefined }); }
  if (id === 'fotos' && x.propId) return window.Fotos.drive(x.propId);
  if (id === 'publicada' && x.propId) return window.Publicaciones.publicar(x.propId);
  if (t === 'acta' && x.negocioId) return menuPaso(x, alTerminar); // modal-13: grabar la visita (o por WhatsApp), fotos y resumen
  if (t === 'cliente' && x.negocioId) return menuPaso(x, alTerminar); // modal-13: elegir el cliente del negocio
  if (t === 'evaluar' && x.negocioId) return menuPaso(x, alTerminar); // modal-13: solicitar los documentos por WhatsApp, ver lo adjuntado y decidir
  if (t === 'negocio') return window.Negocios.nuevo({ propId: x.propId });
  if (t === 'cerrar' && x.negocioId) { const ng = accNegocio(x.negocioId); return ng ? ng.ganar() : window.Negocios.abrirNegocio(x.negocioId); }
  if (['firma', 'cerrar', 'revisar', 'ver', 'ficha', 'agente'].includes(t)) return x.negocioId ? window.Negocios.abrirNegocio(x.negocioId) : x.propId && window.Inmo.abrirFicha(x.propId);
  if (t === 'ok') { await marcar(x, 'ok'); toast(`Logrado: ${x.paso || x.t}.`); return alTerminar?.(); }
}
const marcar = (x, estado, extra = {}) => api('etMarcar', { negocioId: x.negocioId || null, propId: x.negocioId ? null : x.propId, paso: x.pasoId || x.id, estado, ...extra });
// Las dos ventanas están en React (ventanas/inmo/Etapas.tsx); marcar el paso sigue aquí.
function reprogramar(x, alTerminar) {
  window.Ventanas.abrir('inmo.reprogramar', { titulo: `${x.accion === 'Reprogramar' ? 'Reprogramar' : 'Volver a intentar'}: ${x.paso || x.t}`, hoy: hoyISO(),
    alGuardar: async ({ vence, d }) => { await marcar(x, 'pend', { vence, d }); closeModal(); toast('Vuelve a quedar pendiente.'); alTerminar?.(); } }, { clave: 'modal-12' });
}
// menú de estados de un paso: logrado, no logrado, automático
function menuPaso(x, alTerminar, extra = extraPaso(x, alTerminar)) {
  // los pasos sin envío a firmar: el botón con la acción del paso (agendar, completar la ficha…) dentro de la misma ventana
  if (!extra.alEnviar && x.accion && !['ok', 'evaluar', 'acta', 'cliente', 'visita', 'aceptacion', 'pago', 'revision', 'post'].includes(x.tipo)) extra = { ...extra, accionTxt: x.accion, alAccion: () => { closeModal(); accion(x, alTerminar); } };
  const fin = async (estado, extra) => { await marcar(x, estado, extra); closeModal(); toast('Paso actualizado.'); alTerminar?.(); };
  window.Ventanas.abrir('inmo.menuPaso', { titulo: x.t, descripcion: x.tipo === 'acta' ? 'Graba el audio de la visita (aquí o por WhatsApp), suma fotos y obtén un resumen de lo que comentó el interesado y de lo que comentaste tú.' : x.d, manual: !!x.manual, evaluacionNegocioId: x.tipo === 'evaluar' ? x.negocioId : undefined, actaNegocioId: x.tipo === 'acta' ? x.negocioId : undefined, alActaCerrada: () => { closeModal(); alTerminar?.(); }, ...extra,
    alElegir: (e) => (e === 'ok' ? fin('ok') : fin(null)),
    alGuardar: (modo, texto) => fin('fail', { d: texto }) }, { clave: 'modal-13', ancho: x.tipo === 'evaluar' || x.tipo === 'acta' || x.tipo === 'visita' || x.tipo === 'aceptacion' || x.tipo === 'pago' || x.tipo === 'revision' || x.tipo === 'post' || !!extra.documentos });
}

// ---------- pantalla «Hoy» ----------
// Está en React: src/ui/components/functional/hoy/Hoy.tsx. Comparte #view-inicio con «La oficina», que
// antes de dibujar desmonta React (liberar, en inmo.js). Se vuelve a montar al abrirla, así está al día.
function abrir() {
  ir('inicio'); const v = $('#view-inicio');
  liberar(v); window.ReactUI.montar('Hoy', v);
}

// «Empezar algo nuevo»: una ventana con las tres etapas y una acción por línea
function nuevo() {
  engancharAgente();
  const body = ventana('Empezar algo nuevo', 'Elige por dónde partir');
  const G = [['1 · Captación', [['dictar', 'mic', 'Subir una propiedad dictando'], ['prop', 'house', 'Crear una propiedad con formulario']]],
    ['2 · Comercialización', [['lead', 'whatsapp', 'Importar un chat de WhatsApp (lead)'], ['visita', 'calendar', 'Agendar una visita'], ['negocio', 'briefcase', 'Abrir un negocio']]],
    ['3 · Postventa', [['firmas', 'listCheck', 'Ver documentos en firma'], ['negocios', 'flow', 'Ver todos los negocios']]]];
  body.innerHTML = `<div class="vt-nuevo">${G.map(([t, l]) => `<div><small>${t}</small>${l.map(([k, ic, tx]) => `<button class="gl" data-n="${k}">${icon(ic, 15)} ${tx}</button>`).join('')}</div>`).join('')}</div>`;
  body.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { const k = b.dataset.n; if (!['visita'].includes(k)) cerrarVentana(true);
    ({ dictar: () => window.Dictado.abrir(), prop: () => window.Inmo.formProp(), lead: () => window.Leads.abrir(), visita: () => { body.innerHTML = ''; window.Gestion.agendar({ tipo: 'visita' }); },
      negocio: () => window.Negocios.nuevo(), firmas: () => { window.show('ops'); window.Operaciones.open(); }, negocios: () => window.Negocios.abrir() })[k]?.(); }));
}

// ---------- bloque de etapas dentro de un negocio ----------
const estadoTxt = (x, c) => (c === 'ok' ? `Logrado${x.f ? ' · ' + fdm(x.f.slice(0, 10)) : ''}${x.d ? ' · ' + x.d : ''}` : c === 'fail' ? `No logrado · ${x.d || ''}` : c === 'otro' ? `Esperando a ${x.quien}${x.d ? ' · ' + x.d : ''}`
  : c === 'pend' ? `Pendiente${x.vence ? ' · ' + venceTxt(x.vence) : ''}${x.d ? ' · ' + x.d : ''}` : 'Por hacer');

// La ficha del negocio: una columna por etapa, todas a la vista. La etapa en curso va sobre gris con sus pasos en tarjetas
// y el paso actual destacado («Marcar logrado» y «Más opciones»); las demás muestran ETAPA_MAX pasos y «+N pasos más».
const ETAPA_MAX = 4;
function pasoCol(x, i, j, esA) {
  const c = claseDe(x); const k = `${i}.${j}`; const num = `<span class="et-num">${String(j + 1).padStart(2, '0')}</span>`;
  const go = `<button class="et-go" data-go="${k}">${esc(x.t)}</button>`;
  if (esA) {
    const hoy = hoyISO(); const plazo = x.vence ? (x.vence < hoy ? ['tarde', `Vencido ${fdm(x.vence)}`] : x.vence === hoy ? ['hoy', 'Vence hoy'] : ['', `Plazo ${fdm(x.vence)}`]) : null;
    // vencido: Asset lo pasa a no logrado y agrega «Venció el dd/mm.» al detalle; eso ya lo dice el plazo
    const d = x.vencido ? (x.d || '').replace(/(?:^| · )Venció el \d{2}\/\d{2}\.$/, '') : x.d;
    const sub = c === 'otro' ? `Esperando a ${x.quien}${d ? ' · ' + d : ''}` : c === 'fail' && !x.vencido ? `No logrado${d ? ' · ' + d : ''}` : d || x.accion || 'Por hacer';
    // el paso actual: una persona corriendo (en curso) en vez del número
    const run = `<span class="et-num et-run" aria-hidden="true">${icon('run', 20)}</span>`;
    return `<div class="et-p et-pa s-${x.vencido ? 'pend' : c}${c === 'fail' || plazo?.[0] === 'tarde' ? ' tarde' : ''}">
      <div class="et-pf">${run}<div class="et-pt">${go}<small>${esc(sub)}</small></div>${plazo ? `<i class="et-plazo ${plazo[0]}">${plazo[1]}</i>` : ''}</div>
      <div class="et-pacc"><button class="gl et-pm2" data-pm="${k}">Más opciones</button>${x.accion && c !== 'ok' ? `<button class="gl azul et-do" data-go="${k}">${esc(x.accion)}</button>` : `<button class="gl azul et-lg" data-lg="${k}">Marcar logrado</button>`}</div></div>`;   // a la derecha: el secundario primero y el principal al final
  }
  const chk = c === 'ok' ? `<span class="et-chk ok" title="Logrado">${IC.ok}</span>` : `<button class="et-chk" data-lg="${k}" title="Marcar logrado" aria-label="Marcar logrado: ${esc(x.t)}">${IC.ok}</button>`;
  return `<div class="et-p s-${c}">${num}<div class="et-pt">${go}<small>${esc(estadoTxt(x, c))}</small></div>${chk}</div>`;
}
function columnas(r, a, mas) {
  const iAct = r.etapas.findIndex((e) => e.actual);
  return `<div class="et et-cols">${r.etapas.map((e, i) => {
    const lugar = e.actual ? ' · en curso' : iAct >= 0 && i === iAct + 1 ? ' · siguiente' : e.completa ? ' · lograda' : '';
    const vis = e.actual || mas[i] ? e.pasos : e.pasos.slice(0, ETAPA_MAX); const resto = e.pasos.length - vis.length;
    const pct = e.total ? Math.round((100 * e.ok) / e.total) : 0;
    const boton = resto ? `<button class="et-mas" data-mas="${i}">+${resto} ${resto === 1 ? 'paso' : 'pasos'} más</button>` : !e.actual && mas[i] && e.pasos.length > ETAPA_MAX ? `<button class="et-mas" data-mas="${i}">Ver menos</button>` : '';
    return `<section class="et-col${e.actual ? ' act' : ''}${e.completa ? ' ok' : ''}" aria-label="Etapa ${i + 1}: ${esc(e.nombre)}">
      <header class="et-colh"><div><small>Etapa ${i + 1}${lugar}</small><b>${esc(e.nombre)}</b></div>
        <span class="et-anillo" style="--p:${pct}" role="img" aria-label="${e.ok} de ${e.total} pasos logrados"><i>${e.ok}/${e.total || '–'}</i></span></header>
      <div class="et-colps">${vis.map((x, j) => pasoCol(x, i, j, !!a && a.ei === i && a.pi === j)).join('')}${boton}</div>
    </section>`; }).join('')}</div>`;
}

// foco (la ficha del negocio): las etapas en columnas; sin foco, etapas plegables (la captación en la ficha de la propiedad)
async function bloque(host, { negocioId, propId, alCambiar, compacto = false, foco = false } = {}) {
  let r; try { r = await api('etPasos', { negocioId, propId }); } catch (e) { host.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  propId = propId || r.propId || undefined;   // en la ficha de un negocio solo se pasa el negocio: los documentos de cada paso se buscan en la propiedad del negocio
  if (negocioId && !propId) propId = (await api('negObtener', negocioId).catch(() => null))?.prop?.id || propId; // los pasos de un negocio necesitan su propiedad (orden de visita, documentos)
  if (!host.isConnected) return; // mientras tanto se cerró la ficha o el negocio (o React la volvió a dibujar)
  const clave = negocioId || propId; const a = r.actual; const abiertas = bloque._abiertas[clave] ||= {}; const mas = bloque._mas[clave] ||= {};
  const recargar = () => (alCambiar ? alCambiar() : bloque(host, { negocioId, propId }));
  const otraVez = () => bloque(host, { negocioId, propId, alCambiar, compacto, foco });
  const uno = r.etapas.length === 1; // la captación de una propiedad: una sola lista
  host.innerHTML = foco && !uno ? columnas(r, a, mas) : `<div class="et">
    ${a ? ''
      : compacto ? `<div class="gl-card et-next ok et-lista"><b>${IC.ok} ${uno ? 'Captación completa' : 'Todo logrado'}</b><small class="muted">Todos los pasos están logrados.</small></div>` : '<div class="gl-card et-next ok"><h3>Operación cerrada</h3><p>Todos los pasos están logrados.</p></div>'}
    ${r.etapas.map((e, i) => { const ab = abiertas[i] !== undefined ? abiertas[i] : (compacto ? false : e.actual); return `<section class="gl-card et-e"><button class="et-eh" data-tog="${i}" aria-expanded="${ab}"><span class="et-chev ${ab ? 'abierto' : ''}">›</span><b>${uno ? `Pasos de ${esc(e.nombre.toLowerCase())}` : `Etapa ${i + 1} · ${esc(e.nombre)}`}</b><span class="spacer"></span><i class="et-badge ${e.completa ? 'ok' : e.fail ? 'fail' : e.actual ? 'act' : ''}">${e.fail ? `No logrado · ${e.ok} de ${e.total}` : `${e.ok} de ${e.total} logrados`}</i></button>
      ${ab ? `<div class="et-ps">${e.pasos.map((x, j) => { const c = claseDe(x); const esA = a && a.ei === i && a.pi === j; return `<div class="et-p ${esA ? 'act' : ''} s-${c}"><span class="et-pi ${c}">${IC[c]}</span><div class="et-pt"><button class="et-go" data-go="${i}.${j}">${esc(x.t)}</button><small>${esc(estadoTxt(x, c))}</small></div>
        ${c === 'ok' ? '<i class="et-tag ok">Logrado</i>' : `<button class="gl azul small et-lg" data-lg="${i}.${j}">Logrado</button>`}<button class="ghost small et-pm" data-pm="${i}.${j}" aria-label="Más opciones de ${esc(x.t)}">⋮</button></div>`; }).join('')}</div>` : ''}</section>`; }).join('')}
  </div>`;
  host.querySelectorAll('[data-mas]').forEach((b) => (b.onclick = () => { const i = Number(b.dataset.mas); mas[i] = !mas[i]; otraVez(); }));
  host.querySelectorAll('[data-tog]').forEach((b) => (b.onclick = () => { const i = Number(b.dataset.tog); const e = r.etapas[i]; abiertas[i] = !(abiertas[i] !== undefined ? abiertas[i] : (compacto ? false : e.actual)); otraVez(); }));
  host.querySelectorAll('[data-pm]').forEach((b) => (b.onclick = async () => { const [i, j] = b.dataset.pm.split('.').map(Number); try { await cargar(); } catch {} menuPaso(paso(`${i}.${j}`), recargar); }));   // con la cartera al día: los documentos y firmas del paso salen de ahí
  const paso = (k) => { const [i, j] = k.split('.').map(Number); const y = r.etapas[i].pasos[j]; return { ...y, negocioId, propId, pasoId: y.id, paso: y.t }; };
  host.querySelectorAll('[data-go]').forEach((b) => (b.onclick = async () => { try { await cargar(); } catch {} menuPaso(paso(b.dataset.go), recargar); }));
  // toda la tarjeta del paso abre su detalle (no solo el título); los botones de adentro (logrado, más opciones) siguen con lo suyo
  host.querySelectorAll('.et-p').forEach((card) => { if (!card.querySelector('[data-go]')) return; card.onclick = (ev) => { if (!ev.target.closest('button, a')) card.querySelector('[data-go]').click(); }; });
  host.querySelectorAll('[data-lg]').forEach((b) => (b.onclick = async () => { const y = paso(b.dataset.lg); await marcar(y, 'ok'); toast(`Logrado: ${y.t}.`); recargar(); }));
  luz(host);
}
bloque._abiertas = {}; bloque._mas = {};

window.Hoy = { abrir, nuevo };
window.Ventana = { abrir: ventana, cerrar: cerrarVentana };
window.Etapas = { bloque, luz, accion, armarContrato: (negocioId, despues) => contratoArriendo(negocioId, despues, 'borrador') };   // armarContrato: lo usa el panel «Revisión del contrato»
})();
