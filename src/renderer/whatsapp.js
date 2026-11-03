/* global $, api, esc, icon, toast, modal, closeModal, pf */
'use strict';
// Agente por WhatsApp (0.13): conectar el WhatsApp de la empresa (wechatia), vincular el celular del usuario con un
// código y decidir si este computador responde. Lo hecho por WhatsApp queda en la conversación «WhatsApp» del Agente.
(() => {
const W = { t: null };
const fmtTel = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 11 ? `+${d.slice(0, 2)} ${d.slice(2, 3)} ${d.slice(3, 7)} ${d.slice(7)}` : t || ''; };

async function abrir() {
  modal(`<div class="wa-ag" id="waAg"><div class="ga-load"><span class="spinner sm"></span>Cargando…</div></div>`);
  document.getElementById('modalCard')?.classList.add('im-wide');
  await pintar();
}
async function pintar() {
  const box = $('#waAg'); if (!box) { clearInterval(W.t); return; }
  const e = await api('waEstado').catch(() => ({}));
  const paso1 = e.conectado;
  box.innerHTML = `<h2>${icon('whatsapp', 20)} Agente por WhatsApp</h2>
    <p class="muted">Habla con tu equipo desde el celular, por texto o notas de voz. Escribe el nombre de quien necesitas y te atiende: <b>Pedro</b> (Captación), <b>Juanita</b> (Documentos), <b>Diego</b> (Seguimiento) o <b>Fernanda</b> (Leads). Cada uno guarda su propia conversación, así puedes cambiar de uno a otro sin perder el hilo. Todo queda aquí, en la conversación <b>WhatsApp</b> del Agente.</p>
    <div class="wa-paso ${paso1 ? 'ok' : ''}"><span class="wa-n">${paso1 ? icon('check', 14) : '1'}</span><div><b>WhatsApp de la empresa</b>
      ${paso1 ? `<small>Conectado a wechatia${e.propia ? ' con la clave de la integración' : ''}.</small>` : `<small>Pega la clave de la integración privada de wechatia (ver conversaciones, ver y editar mensajes, ver y editar contactos).</small>
      <div class="wa-f"><input id="waKey" type="password" autocomplete="off" spellcheck="false" placeholder="Clave (pit-…)" /><input id="waLoc" value="${esc(e.locationId || '')}" placeholder="Cuenta de wechatia (location)" spellcheck="false" /><button class="primary small" id="waKeyOk">Conectar</button></div><p class="error" id="waKeyErr"></p>`}</div></div>
    <div class="wa-paso ${e.telefono ? 'ok' : ''} ${paso1 ? '' : 'off'}"><span class="wa-n">${e.telefono ? icon('check', 14) : '2'}</span><div><b>Tu celular</b>
      ${e.telefono ? `<small>Vinculado: <b>${esc(fmtTel(e.telefono))}</b>. Solo los mensajes de este celular los atiende tu Asset.</small><div class="wa-f"><button class="ghost small" id="waDes">Desvincular</button></div>`
        : e.codigo ? `<small>Desde tu celular, envía este mensaje por WhatsApp al número de la empresa <b>${esc(e.numeroEmpresa)}</b>:</small>
          <div class="wa-cod"><b>${esc(e.codigo)}</b><button class="secondary small" id="waCopy">Copiar</button></div><p class="muted small"><span class="spinner sm"></span> Esperando tu mensaje… (se revisa cada pocos segundos)</p>`
        : `<small>Asset te da un código; lo envías desde tu celular y queda vinculado a tu cuenta.</small><div class="wa-f"><button class="primary small" id="waVin" ${paso1 ? '' : 'disabled'}>Vincular mi celular</button></div>`}</div></div>
    <div class="wa-paso ${e.activo ? 'ok' : ''} ${e.telefono ? '' : 'off'}"><span class="wa-n">${e.activo ? icon('check', 14) : '3'}</span><div><b>Responder desde este computador</b>
      <label class="pv-sw"><input type="checkbox" id="waAct" ${e.activo ? 'checked' : ''} ${e.telefono ? '' : 'disabled'} /><span><b>${e.activo ? 'Activo' : 'En pausa'}</b><small>Funciona mientras Asset esté abierto aquí. Actívalo en un solo computador.</small></span></label></div></div>
    <details class="lz-det"><summary>Más opciones</summary><label class="wa-num"><span>Número de WhatsApp de la empresa</span><input id="waNum" value="${esc(e.numeroEmpresa || '')}" /></label></details>
    <div class="actions"><button class="secondary" id="mCancel">Cerrar</button></div>`;
  const q = (s) => box.querySelector(s);
  q('#mCancel').onclick = () => { clearInterval(W.t); document.getElementById('modalCard')?.classList.remove('im-wide'); closeModal(); };
  q('#waKeyOk')?.addEventListener('click', async (ev) => { const k = q('#waKey').value.trim(); if (!k) { q('#waKeyErr').textContent = 'Pega la clave.'; return; } ev.target.disabled = true;
    try { await api('pvClaveWa', { token: k, locationId: q('#waLoc').value.trim() }); toast('WhatsApp de la empresa conectado.'); pintar(); } catch (er) { ev.target.disabled = false; q('#waKeyErr').textContent = er.message; } });
  q('#waVin')?.addEventListener('click', async () => { const u = await pf.apiUser?.().catch?.(() => null); const user = u?.ok ? u.data : null;
    try { await api('waVincular', { nombre: user?.namePerson || '', email: user?.email || '' }); pintar(); } catch (er) { toast(er.message, 6000); } });
  q('#waCopy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(e.codigo); toast('Código copiado.'); } catch {} });
  q('#waDes')?.addEventListener('click', async () => { await api('waDesvincular'); toast('Celular desvinculado.'); pintar(); });
  q('#waAct')?.addEventListener('change', async (ev) => { await api('waConfigurar', { activo: ev.target.checked }); toast(ev.target.checked ? 'El Agente responde tu WhatsApp desde este computador.' : 'Agente por WhatsApp en pausa.'); pintar(); });
  q('#waNum')?.addEventListener('change', async (ev) => { await api('waConfigurar', { numeroEmpresa: ev.target.value }); pintar(); });
  clearInterval(W.t); if (e.codigo) W.t = setInterval(async () => { const x = await api('waEstado').catch(() => null); if (!$('#waAg')) return clearInterval(W.t); if (x && !x.codigo && x.telefono) { clearInterval(W.t); toast('Celular vinculado.'); pintar(); } }, 2000);
}
window.WhatsAppAgente = { abrir, refrescar: () => { if ($('#waAg')) pintar(); } };
})();
