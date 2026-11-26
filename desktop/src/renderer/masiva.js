/* global pf, $, toast, closeModal, show, state, liberar */
'use strict';
// La carga masiva está en React: src/ui/components/functional/gestion/carga-masiva. Aquí quedan editar los
// firmantes de un documento, la confirmación del envío (saldo) y la cola en vivo
// (pf.onBulk), que se le pasa a React como evento «pf:bulk».
(() => {
const estado = () => window.__estadoMasiva?.() || { cola: { items: [] } };
function open(tab) {
  if (!window.isMember()) return window.members(() => open(tab), 'La carga masiva es exclusiva para clientes de Portalfirma. Inicia sesión con tu cuenta.');
  show('bulk'); const el = $('#view-bulk');
  liberar(el); window.ReactUI.montar('GestionCargaMasiva', el, { tab });
}
pf.onBulk((st) => window.dispatchEvent(new CustomEvent('pf:bulk', { detail: st })));

// ventanas en React: src/ui/components/functional/gestion/carga-masiva/Ventanas.tsx
function editSigners(it) {
  window.Ventanas.abrir('gestion.masivaFirmantes', {
    nombre: it.name, tipo: it.typeDocument || '', firmantes: it.signers || [], requeridos: it.required || {},
    alGuardar: async (rows) => { closeModal(); await pf.bulkUpdate(it.id, { signers: rows }); },
    alUsarEnTodos: async (rows) => { closeModal(); await pf.bulkApplySigners(rows); toast('Firmantes aplicados a todos los documentos listos.'); },
  }, { clave: 'modal-42' });
}
async function confirmarEnvio(ids, opts) {
  const ready = estado().cola.items.filter((x) => ids.includes(x.id));
  // la ventana se abre al tiro; el saldo al día se consulta mientras tanto (si tarda, dice «Consultando…»)
  const saldoPromesa = pf.balance().then((b) => (b.ok ? b.data : null)).catch(() => null);
  window.Ventanas.abrir('gestion.envioLote', {
    n: ready.length, saldo: state.session?.balance, saldoPromesa, tramite: null, deAUna: true,
    alEnviar: async () => {
      const r = await pf.bulkSend(ready.map((x) => x.id), { ...opts });
      if (!r.ok) return toast(r.error, 5000);
      const enviados = r.data.items.filter((x) => ready.some((y) => y.id === x.id) && x.status === 'sent');
      toast(`${enviados.length} de ${ready.length} documento(s) enviados a firmar.`, 5000);
      preguntarGuardarTipos(enviados, opts);
    },
  }, { clave: 'modal-43' });
}

// Al final del envío: por cada tipo de documento que la corredora no tenía configurado, una sola vez, «¿Guardas configuración por defecto?»
// con la firma y el trámite que se usaron. Después de enviar todo, nunca antes ni por cada documento.
const preguntados = new Set();
async function preguntarGuardarTipos(enviados, opts) {
  const tipos = new Map();
  for (const it of enviados) {
    const nombre = String(it.typeDocument || '').trim(); const k = nombre.toLowerCase();
    if (!nombre || it.tipoConocido || preguntados.has(k) || tipos.has(k)) continue;
    const t = it.signers?.[0]?.typeSign || opts?.typeSign; const tramite = it.tramite || opts?.protocolization;
    tipos.set(k, { nombre, tipoFirma: ['simple', 'avanzada', 'visada', 'enrolada'].includes(t) ? t : 'avanzada', tramite: tramite === 'legalization' || tramite === 'protocolization' ? 'legalization' : 'none' });
  }
  for (const [k, t] of tipos) {
    preguntados.add(k);
    await new Promise((fin) => window.Ventanas.abrir('gestion.guardarTipoDocumento', { ...t, alResponder: () => { closeModal(); fin(); } }, { clave: 'modal-157' }));
  }
}

window.Masiva = { open, editarFirmantes: editSigners, confirmarEnvio, get _bk() { return { st: estado().cola }; } };
})();
