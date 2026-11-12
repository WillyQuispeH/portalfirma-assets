/* global $, toast, closeModal, api, members, ir, IM, fecha, formPersona, cargar, liberar */
'use strict';
// Negocios: tablero por etapas (venta y arriendo), ficha del negocio con tareas, firmas y próxima acción.
// Pensado para usarse sin capacitación: arrastrar una tarjeta mueve el negocio; cada etapa dice qué falta.

const NG = { tipo: 'venta', datos: null, actual: null }; // la ficha y «Nuevo negocio»; los filtros del tablero están en el store de React
const ngHoy = () => new Date().toISOString().slice(0, 10);

async function ngCargar() { NG.datos = await api('negListar'); return NG.datos; }

// ---------- tablero ----------
// Está en React: src/ui/components/functional/negocios/Negocios.tsx (filtros, arrastrar y revisión de firmas).
// Se vuelve a montar al abrirlo (liberar, en inmo.js), así los datos siempre están al día. La ficha del negocio
// usa el mismo contenedor.
async function abrirNegocios(opts = {}) {
  NG.actual = null; ir('negocios');
  const el = $('#view-negocios'); liberar(el); window.ReactUI.montar('Negocios', el, { tipo: opts.tipo });
  try { await ngCargar(); } catch {} // NG.datos (etapas) para la ficha y «Nuevo negocio»
}
async function ngMover(id, etapa, alVolver) {
  try { const r = await api('negMover', id, etapa); toast([`Negocio en «${r.negocio.etapaInfo.t}».`, ...r.mensajes].join(' '), 4500); await ngCargar(); alVolver ? alVolver() : abrirNegocios(); }
  catch (e) { toast(e.message, 5000); }
}

// ---------- nuevo negocio ----------
function nuevoNegocio(pre = {}) {
  const tipo = pre.tipo || NG.tipo || 'venta';
  const props = IM.data.propiedades.filter((p) => !p.archivada && (tipo === 'venta' ? p.venta : p.arriendo));
  const pers = [...IM.data.personas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const p0 = props.find((p) => p.id === pre.propId) || null;
  const et = (NG.datos?.etapas || {})[tipo] || [];
  const vez = (NG.vez = (NG.vez || 0) + 1); // cada llamada parte el formulario de nuevo, como cuando se volvía a dibujar
  window.Ventanas.abrir('negocios.nuevo', {
    vez, tipo, hoy: ngHoy(), propId: p0?.id || '', clienteId: pers.some((c) => c.id === pre.clienteId) ? pre.clienteId : '', etapa: pre.etapa || '',
    etapas: et.map((e) => ({ id: e.id, t: e.t })),
    propiedades: props.map((p) => ({ id: p.id, texto: `${p.codigo} · ${p.titulo.slice(0, 46)}`, precio: (tipo === 'venta' ? p.precioVenta : p.precioArriendo) || null })),
    personas: pers.map((c) => ({ id: c.id, texto: `${c.nombre} · ${c.rut}` })),
    alCambiarTipo: (leido) => nuevoNegocio(leido),
    alCrearPersona: (guardado) => formPersona(null, { rol: tipo === 'venta' ? 'comprador' : 'arrendatario', despues: async (c) => { await cargar(); nuevoNegocio({ ...guardado, clienteId: c.id }); } }),
    // si falla, la ventana muestra el error (antes, #nnErr)
    alGuardar: async (o) => { const n = await api('negGuardar', o); closeModal(); toast('Negocio creado.'); NG.tipo = n.tipo; await cargar(); abrirNegocio(n.id); },
  }, { clave: 'modal-44', ancho: true });
}

// ---------- ficha del negocio ----------
// Está en React: src/ui/components/functional/negocios/FichaNegocio.tsx, en el mismo contenedor del tablero.
// Aquí se lee el negocio y quedan sus acciones (API y ventanas); cada recarga la vuelve a montar con los datos al día.
async function abrirNegocio(id) {
  NG.actual = id; const tok = ir('negocios');
  let n; try { n = await api('negObtener', id); } catch (e) { toast(e.message, 4000); return abrirNegocios(); }
  NG.tipo = n.tipo; await ngCargar(); if (tok !== IM.tok) return; // siempre al día y en la pestaña de su tipo (venta/arriendo)
  const et = NG.datos.etapas[n.tipo]; const e = n.etapaInfo; const f = n.firmas?.[n.etapa] || null; const sig = et[n.orden + 1];
  const recargar = () => abrirNegocio(id);
  const alDia = async () => { await ngCargar(); recargar(); };
  const intentar = (fn, ms = 5000) => async (...a) => { try { await fn(...a); } catch (er) { toast(er.message, ms); } };
  const revisarYVolver = async () => { try { const r = await api('negFirmasRevisar', id); if (r.mensajes.length) toast(r.mensajes.join(' '), 6000); } catch (er) { toast(er.message, 5000); } await alDia(); };
  const acc = {
    volver: () => abrirNegocios(),
    pasos: (el) => window.Etapas?.bloque(el, { negocioId: id, alCambiar: alDia }),
    mover: (etapa) => ngMover(id, etapa, recargar),
    tarea: async (i, hecha) => { await api('negTarea', id, n.etapa, i, hecha); recargar(); },
    siguiente: () => {
      if (e.firma && f?.estado !== 'firmado') {
        window.Ventanas.abrir('negocios.pasarSinFirma', { firma: e.firma, siguiente: sig.t, alConfirmar: () => { closeModal(); ngMover(id, sig.id, recargar); } }, { clave: 'modal-45' }); return;
      }
      ngMover(id, sig.id, recargar);
    },
    ganar: intentar(async () => { const r = await api('negCerrar', id, 'ganado'); toast(['¡Negocio cerrado!', ...r.mensajes].join(' '), 5000); await alDia(); }),
    perder: () => window.Ventanas.abrir('negocios.perdido', {
      alGuardar: intentar(async (m) => { const r = await api('negCerrar', id, 'perdido', m); closeModal(); toast(['Negocio marcado como perdido.', ...r.mensajes].join(' '), 5000); await alDia(); }, 4000),
    }, { clave: 'modal-46' }),
    reabrir: async () => { const r = await api('negReabrir', id); toast(['Negocio reabierto.', ...r.mensajes].join(' '), 4000); await alDia(); },
    eliminar: () => window.Ventanas.abrir('negocios.eliminar', { alConfirmar: async () => { closeModal(); await api('negBorrar', id); toast('Negocio eliminado.'); abrirNegocios(); } }, { clave: 'modal-47' }),
    corredor: intentar(async (c) => { await api('negCorredor', id, c || null); toast('Negocio reasignado. Queda en su historial.'); }),
    proximaAccion: async (texto, fecha) => { await api('negGuardar', { id, proximaAccion: { texto, fecha } }); toast('Próxima acción guardada.'); await alDia(); },
    nota: async (t) => { await api('negNota', id, t); recargar(); },
    condiciones: async (c) => { await api('negGuardar', { id, valor: { valor: c.valor, moneda: c.moneda }, comision: { tipo: c.tipoComision, valor: c.comision } }); toast('Condiciones guardadas.'); await alDia(); },
    enviarFirma: () => enviarDocumento(n),
    vincularFirma: () => window.Ventanas.abrir('negocios.vincularFirma', {
      firma: e.firma,
      // si falla, la ventana muestra el error (antes, #vfErr)
      alGuardar: async (op) => { await api('negFirmaVincular', id, n.etapa, op); closeModal(); toast('Firma vinculada. Revisando su estado…'); await revisarYVolver(); },
    }, { clave: 'modal-48' }),
    revisarFirmas: () => members(revisarYVolver, 'Para revisar las firmas, inicia sesión con tu cuenta de Portalfirma.'),
    verOperacion: async () => { const { show } = window; show('ops'); await window.Operaciones.open(); window.Operaciones.select(Number(f.operacion)); },
    quitarFirma: async () => { await api('negFirmaQuitar', id, n.etapa); recargar(); },
  };
  NG.acc = acc; // etapas.js usa enviarFirma, revisarFirmas y ganar desde los pasos
  NG.vezFicha = (NG.vezFicha || 0) + 1;
  window.ReactUI.montar('FichaNegocio', $('#view-negocios'), { n, etapas: et, corredores: window.PERFIL?.esAdmin ? window.PERFIL.corredores || [] : null, vez: NG.vezFicha, acc });
}
// Enviar el documento de la etapa: desde los documentos de la propiedad o un archivo. La operación queda ligada sola.
function enviarDocumento(n) {
  const p = IM.data.propiedades.find((x) => x.id === n.prop?.id); const docs = (p?.documentos || []).filter((d) => /\.(pdf|docx?)$/i.test(d.nombre));
  const ctx = () => { window.__negCtx = { id: n.id, etapa: n.etapa }; };
  window.Ventanas.abrir('negocios.enviarDocumento', {
    firma: n.etapaInfo.firma, codigo: n.prop?.codigo || '',
    documentos: docs.map((d) => ({ id: d.id, nombre: d.nombre, fecha: fecha(d.fecha) })),
    alElegirDocumento: (docId) => members(async () => { closeModal(); ctx(); await api('inmoDocAbrir', p.id, docId); toast('Revisa el documento y pulsa «Enviar a firmar». La operación quedará ligada al negocio.', 6000); }, 'Para enviar a firmar, inicia sesión con tu cuenta de Portalfirma.'),
    alElegirArchivo: () => members(() => { closeModal(); ctx(); window.show('drop'); toast('Elige o arrastra el documento. La operación quedará ligada al negocio.', 5000); }, 'Para enviar a firmar, inicia sesión con tu cuenta de Portalfirma.'),
    alUsarNotaria: () => members(() => { closeModal(); ctx(); window.show('tpl'); window.openTemplates?.(); toast('Al enviar la plantilla, la operación quedará ligada al negocio.', 5000); }, 'Para usar la Notaría virtual, inicia sesión con tu cuenta de Portalfirma.'),
  }, { clave: 'modal-49' });
}
// La pantalla de envío avisa cuando se crea la operación
window.addEventListener('pf-operacion', (ev) => {
  const c = window.__negCtx; window.__negCtx = null; const op = ev.detail?.operation;
  if (!c || op == null) return;
  api('negFirmaVincular', c.id, c.etapa, op).then(() => toast(`Operación ${op} ligada al negocio. Cuando se firme, avanzará solo.`, 6000)).catch((e) => toast(e.message, 5000));
});

window.Negocios = { abrir: abrirNegocios, nuevo: nuevoNegocio, abrirNegocio, _NG: NG, cargar: ngCargar };
