/* global $, api, closeModal, toast */
'use strict';
// 0.16.15 · Formatos propios de la corredora en la app: el paso «Mandato firmado» abre esta ventana. Muestra lo que
// ya va en el documento (sacado de la ficha, el propietario y la empresa), pide solo lo que falta y lo envía a firmar.
(() => {
const F = { propId: null, hito: 'mandato', lista: [], i: 0, r: null, despues: null, ver: false, personaId: null, op: null, nombre: '', html: null, err: '', fallo: '', v: 0 };
const ctx = () => ({ propId: F.propId, personaId: F.personaId, op: F.op });

// Las ventanas son de React: src/ui/components/functional/ventanas/gestion/Formatos.tsx. Aquí queda lo que se pide al
// servidor; cada vez que algo cambia, la ventana se vuelve a abrir con los datos nuevos (F).
const abierta = () => !$('#modal').classList.contains('hidden') && $('#modalCard').dataset.clave === 'modal-25';
function vista() {
  const l = F.lista;
  window.Ventanas.abrir('gestion.formatos', {
    titulo: l.length > 1 ? 'Mandatos' : l[0].titulo, paquete: F.nombre, lista: l, i: F.i, r: F.r, version: F.v, ver: F.ver, html: F.html,
    err: F.err, fallo: F.fallo, bloqueado: !!(window.PERFIL && !window.PERFIL.esAdmin),
    alTab: (i) => { F.i = i; pintar(); },
    alGuardar: guardar,
    alFirma: (tipo, tramite) => api('fmtConfigurar', { firma: { [F.lista[F.i].id]: { tipo, tramite } } }).then(() => toast('Tipo de firma guardado para este documento.')).catch((e) => toast(e.message, 4000)),
    alVer: () => { F.ver = !F.ver; pintar(); },
    alEnviar: enviar,
    alCerrar: () => { closeModal(); F.despues?.(); },
  }, { clave: 'modal-25', ancho: true });
}
async function pintar() {
  const f = F.lista[F.i]; const r = await api('fmtPreparar', { formatoId: f.id, ...ctx() }); if (r.op) F.op = r.op;
  const html = F.ver ? await api('fmtHtml', f.id, F.propId, { personaId: F.personaId, op: F.op }) : null;
  if (!abierta()) return; // la cerraron mientras tanto
  Object.assign(F, { r, html, v: F.v + 1 }); vista();
}
async function guardar(entrada) {
  const valores = {}; for (const [k, x] of Object.entries(entrada || {})) if (String(x).trim()) valores[k] = x;
  if (!Object.keys(valores).length) { F.err = 'Completa al menos un dato.'; vista(); return false; }
  try { const r = await api('fmtCompletar', { ...ctx(), formatoId: F.lista[F.i].id, valores }); if (r.op) F.op = r.op; F.err = ''; if (r.guardado.length) toast('Guardado: ' + r.guardado.join(', ') + '.'); await pintar(); return true; }
  catch (e) { F.err = e.message; vista(); return false; }
}
async function enviar(entrada) {
  const r = F.r; if (!r?.listo) return;
  if (r.faltan.length) { if (!(await guardar(entrada))) return; if (!F.r.listo) return; }
  confirmar(r);
}
function confirmar(r, estado = {}) {
  window.Ventanas.abrir('gestion.formatosConfirmar', {
    titulo: r.formato.titulo, codigo: r.propiedad.codigo, tipo: r.firma.tipoTxt, tramite: r.firma.tramiteTxt, firmantes: r.firmantes, ...estado,
    alVolver: () => abrir(F.propId, { hito: F.hito, despues: F.despues, i: F.i, personaId: F.personaId, op: F.op }),
    alEnviar: () => window.members(async () => {
      confirmar(r, { enviando: true });
      try { const x = await api('fmtEnviar', { formatoId: r.formato.id, ...ctx() }); closeModal(); toast(`${x.numero ? 'Orden de visita nº ' + x.numero + ' enviada' : 'Enviado'} a firmar · operación ${x.operacion}.`, 5000); F.despues?.(); }
      catch (e) { confirmar(r, { error: e.message }); }
    }, 'Para enviar documentos a firmar, inicia sesión con tu cuenta de Portalfirma.'),
  }, { clave: 'modal-23', ancho: true });
}
// sin formatos propios activos: se ofrecen los de la corredora o seguir con las plantillas de Portalfirma
async function activar(propId, o, otro) {
  const e = await api('fmtEstado');
  window.Ventanas.abrir('gestion.formatosActivar', {
    disponibles: e.disponibles,
    alUsarOtro: () => { closeModal(); otro?.(); },
    alActivar: async (paquete) => { await api('fmtConfigurar', { paquete }); abrir(propId, o, otro); },
  }, { clave: 'modal-24' });
}
async function abrir(propId, { hito = 'mandato', despues = null, i = 0, personaId = null, op = null } = {}, otro = null) {
  const e = await api('fmtEstado'); if (!e.paquete) return activar(propId, { hito, despues, personaId, op }, otro);
  const l = await api('fmtDeHito', propId, hito);
  if (!l.length) { if (otro) return otro(); toast('Marca en la ficha si la propiedad va en venta o en arriendo.'); return; }
  if (hito === 'orden' && !personaId) { toast('Primero crea el negocio con el interesado: la orden de visita va a su nombre.', 5000); return; }
  Object.assign(F, { propId, hito, lista: l, i: Math.min(i, l.length - 1), despues, ver: false, personaId, op, nombre: e.nombre, r: null, html: null, err: '', fallo: '' });
  vista();
  try { await pintar(); } catch (er) { if (abierta()) { F.fallo = er.message; vista(); } }
}
window.Formatos = { abrir };
})();
