/* global $, api, esc, icon, toast, ir, pf */
'use strict';
// «La oficina» (0.16): la pantalla de inicio. El equipo de Asset camina por una oficina vidriada y cada uno muestra
// lo suyo de hoy con datos reales: Pedro (Captación), Juanita (Documentos), Diego (Seguimiento) y Fernanda (Leads).
// Por WhatsApp se habla con cada uno escribiendo su nombre. La sala de reuniones son las firmas en curso y la mesa
// del frente es la tuya («Pedir algo»). La vista «Hoy» clásica sigue a un clic. Los personajes se dibujan en
// oficina-lienzo.js (un canvas); aquí quedan sus botones con el nombre, la nube y lo que están haciendo.
(() => {
const IMG = 'img/oficina/';
const EQ = [
  { id: 'pedro', nombre: 'Pedro', area: 'Captación', rol: 'Carga de propiedades', color: '#e8780c', suave: '#ffe9d3', vista: 'cartera', verTxt: 'Ver la cartera', ahora: 'Revisando tu cartera' },
  { id: 'juanita', nombre: 'Juanita', area: 'Documentos', rol: 'Firmas y contratos', color: '#3b5bdb', suave: '#e3e9ff', vista: 'negocios', verTxt: 'Ver los negocios', ahora: 'Preparando documentos' },
  { id: 'diego', nombre: 'Diego', area: 'Seguimiento', rol: 'Ventas y arriendos', color: '#0b8a7d', suave: '#d9f3ef', vista: 'negocios', verTxt: 'Ver los negocios', ahora: 'Revisando tus negocios' },
  { id: 'fernanda', nombre: 'Fernanda', area: 'Leads', rol: 'Clientes nuevos', color: '#c2255c', suave: '#fbe1ea', vista: 'leads', verTxt: 'Ver los leads', ahora: 'Leyendo chats nuevos' },
];
const POR = Object.fromEntries(EQ.map((p) => [p.id, p]));
const O = { sel: null, toca: false, luz: null, d: null, nombre: '' };
const porDefecto = () => { try { return pf.cfg?.().oficina === false ? 'clasica' : 'oficina'; } catch { return 'oficina'; } }; // en las pruebas automáticas parte en «Hoy»
const pref = { get: () => { try { return localStorage.getItem('pfInicio') || porDefecto(); } catch { return porDefecto(); } }, set: (v) => { try { localStorage.setItem('pfInicio', v); } catch {} } };
const luzAuto = () => { const h = new Date().getHours(); return h >= 7 && h < 17 ? 'dia' : h >= 17 && h < 20 ? 'tarde' : 'noche'; };
const ESTXT = { fail: ['!', 'No logrado'], pend: ['•', 'Te toca'], esp: ['…', 'Esperando'] };
const pendientes = (id) => (O.d?.tareas?.[id] || []).filter((x) => x.e !== 'esp');
const SVG = {
  x: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  mas: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 4v12M4 10h12"/></svg>',
  flecha: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  dia: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="9" r="3.4"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4"/></svg>',
  tarde: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4.5 12a4.5 4.5 0 0 1 9 0M1.5 12h15M1.5 15h15M9 3v2.5M3.2 6.2l1.6 1.4M14.8 6.2l-1.6 1.4"/></svg>',
  noche: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14.5 11.2A6 6 0 0 1 6.8 3.5a6 6 0 1 0 7.7 7.7z"/></svg>',
  wa: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .3-3.4-.7-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.2-1.5-1.2-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.6 2.1 1.1 1 2 1.3 2.3 1.4.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/></svg>',
};

function globos() { // solo lo urgente lleva nube (máximo dos), para no saturar la vista
  const out = {}; let n = 0;
  for (const p of EQ) { const f = (O.d.tareas[p.id] || []).find((x) => x.e === 'fail'); if (f && n < 2) { out[p.id] = { tit: 'No logrado', t: f.texto, c: '#a61b12' }; n++; } }
  if (!n) for (const p of EQ) { const f = (O.d.tareas[p.id] || []).find((x) => x.e === 'pend'); if (f) { out[p.id] = { tit: 'Te toca', t: f.texto, c: '#7a4f00' }; break; } }
  return out;
}
function personaje(p, g) {
  const n = pendientes(p.id).length; const acts = (window.OF_GEO?.acts?.[p.id] || []).map(([i, t]) => `<span class="of-act of-a${i}">${esc(t)}</span>`).join('');
  return `<button class="of-pj of-pj-${p.id}${O.sel === p.id ? ' sel' : ''}" data-p="${p.id}" aria-pressed="${O.sel === p.id}" aria-label="${esc(`${p.nombre}, ${p.area}${n ? `: ${n} pendientes` : ''}`)}">
    
    ${g ? `<span class="of-globo${p.id === 'diego' ? ' der' : ''}" style="--gc:${g.c}"><b>${esc(g.tit)}</b>${esc(g.t)}</span>` : ''}
    <span class="of-chip"><i style="background:${p.color}"></i>${esc(p.nombre)}${n ? `<em class="of-bur">${n}</em>` : ''}</span>${acts}</button>`;
}
function escena() {
  const G = window.OF_GEO || { zonas: {}, glow: {} }; const g = globos();
  const zona = (k, t, c) => (G.zonas[k] ? `<span class="of-zona" style="left:${G.zonas[k][0]}%;top:${G.zonas[k][1]}%"><i style="background:${c}"></i>${esc(t)}</span>` : '');
  const esc_ = (k, label, sel) => { const r = G.glow[k]; return r ? `<button class="of-esc${sel ? ' sel' : ''}" data-esc="${k}" aria-label="${esc(label)}" style="left:${r[0]}%;top:${r[1]}%;width:${r[2]}%;height:${r[3]}%"><img src="${IMG}glow_${k}.png" alt=""></button>` : ''; };
  const nf = (O.d.firmas || []).length;
  return `<div class="of-vista"><div class="of-escena"><img class="of-fondo" src="${IMG}fondo_${O.luz}.jpg" alt="La oficina: escritorios de captación, leads, documentos y seguimiento, un living, la sala de reuniones vidriada y tu mesa">${G.gab ? `<img class="of-gab" src="${IMG}gabinete_abierto.png" alt="" style="left:${G.gab[0]}%;top:${G.gab[1]}%;width:${G.gab[2]}%;height:${G.gab[3]}%">` : ''}<canvas class="of-lienzo" aria-hidden="true"></canvas>
    ${EQ.map((p) => zona(p.id, p.area, p.color)).join('')}${zona('sala', `Firmas en curso${nf ? ' · ' + nf : ''}`, '#3b5bdb')}${zona('mesa', 'Tu mesa', '#1b1f2a')}
    ${EQ.map((p) => esc_(p.id, `Escritorio de ${p.nombre} · ${p.area}`, O.sel === p.id)).join('')}${esc_('sala', 'Sala de reuniones: firmas en curso', O.sel === 'sala')}${esc_('mesa', 'Tu mesa: pedir algo', O.sel === 'yo')}
    ${['pedro', 'fernanda', 'juanita', 'diego'].map((id) => personaje(POR[id], g[id])).join('')}</div></div>`;
}
function cabecera() {
  const todas = EQ.flatMap((p) => pendientes(p.id).map((x) => ({ ...x, p }))).sort((a, b) => (a.e === 'fail' ? 0 : 1) - (b.e === 'fail' ? 0 : 1));
  const h = new Date().getHours(); const sal = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  const urg = todas.some((x) => x.e === 'fail');
  return `<div class="of-cab of-vidrio"><h1>${sal}${O.nombre ? ', ' + esc(O.nombre) : ''}</h1>
    <div class="of-cab-bt"><button class="of-pill" id="ofToca" aria-expanded="${O.toca}"><span class="dot" style="background:${urg ? '#d92d20' : todas.length ? '#f0a020' : '#12b76a'}"></span>${todas.length ? `Te toca hoy · ${todas.length}` : 'Todo al día'}${todas.length ? SVG.flecha.replace('<svg', `<svg class="${O.toca ? 'abierto' : ''}"`) : ''}</button>
    <button class="of-pill suave" id="ofClasica" title="Ver la lista «Hoy» de siempre">Vista lista</button></div>
    ${O.toca && todas.length ? todas.slice(0, 7).map((x) => `<button class="of-toca" data-p="${x.p.id}"><img src="${IMG}ava_${x.p.id}.png" alt=""><span style="flex:1;min-width:0">${esc(x.texto)}</span><span class="dot" style="background:${x.e === 'fail' ? '#d92d20' : '#f0a020'}"></span></button>`).join('') + (todas.length > 7 ? `<span class="of-vacio">y ${todas.length - 7} más: toca a tu equipo abajo</span>` : '') : ''}</div>`;
}
const waTxt = (p) => (O.d.wa?.activo ? `Por WhatsApp: escribe «<b>${esc(p.nombre)}</b>» al ${esc(O.d.wa.numeroEmpresa)} y te atiende ${p.nombre === 'Juanita' || p.nombre === 'Fernanda' ? 'ella' : 'él'}; tu conversación con cada uno no se mezcla.` : 'Vincula tu celular (Agente › WhatsApp) y podrás hablarle escribiendo su nombre.');
function panel() {
  if (!O.sel) return '';
  const cab = (img, tit, sub) => `<div class="of-ph">${img}<div style="flex:1;min-width:0"><div style="font-size:20px;font-weight:800">${esc(tit)}</div><div style="color:#4a5263">${esc(sub)}</div></div><button class="of-x" id="ofCerrar" aria-label="Cerrar">${SVG.x}</button></div>`;
  if (O.sel === 'sala') {
    const fs = O.d.firmas || [];
    return `<aside class="of-panel of-vidrio">${cab('', 'Firmas en curso', 'La sala de reuniones · las lleva Juanita')}
      ${fs.length ? fs.map((f, i) => `<div class="of-tar"><span class="ic esp">…</span><span class="tx"><b>${esc(f.texto)}</b><small>${esc([f.codigo, f.cliente, f.d].filter(Boolean).join(' · '))}</small></span><button data-firma="${i}">Ver</button></div>`).join('') : '<p class="of-vacio">No hay documentos esperando firmas. Cuando Juanita envíe uno, aparece aquí hasta que todos firmen.</p>'}</aside>`;
  }
  if (O.sel === 'yo') {
    return `<aside class="of-panel of-vidrio">${cab('', 'Tu mesa', 'Pide lo que necesites: el Agente lo deriva a quien corresponde')}
      <label class="of-lbl" for="ofPide">¿Qué necesitas?</label><textarea id="ofPide" class="of-campo" placeholder="Ej.: capté un depto en Ñuñoa, 2D 1B, 120 millones…"></textarea>
      <div class="of-bts"><button class="of-bt" id="ofPedir">Pedírselo al Agente</button></div>
      <p class="of-vacio">${O.d.wa?.activo ? `También desde el celular: escribe el nombre de quien necesitas (Pedro, Juanita, Diego o Fernanda) al ${esc(O.d.wa.numeroEmpresa)}.` : ''}</p></aside>`;
  }
  const p = POR[O.sel]; const ts = O.d.tareas[p.id] || []; const pr = ts[0];
  return `<aside class="of-panel of-vidrio${p.id === 'diego' ? ' izq' : ''}">${cab(`<img class="of-ava" src="${IMG}ava_${p.id}.png" alt="" style="background:${p.suave}">`, p.nombre, `${p.area} · ${p.rol}`)}
    <div class="of-ahora"><div class="of-lbl" style="color:${p.color};padding:0">Ahora</div><div style="font-weight:600;margin-top:2px">${esc(pr ? (pr.e === 'esp' ? `Esperando ${pr.quien ? 'a ' + pr.quien : 'a otros'}: ${pr.texto}` : pr.texto) : 'Todo al día por mi lado.')}</div></div>
    <div class="of-lbl">Hoy</div>
    ${ts.length ? ts.slice(0, 8).map((x, i) => `<div class="of-tar"><span class="ic ${x.e}">${ESTXT[x.e][0]}</span><span class="tx"><b style="font-weight:600">${esc(x.texto)}</b>${x.titulo || x.cliente || x.d ? `<small>${esc([x.titulo, x.cliente, x.e === 'fail' ? x.d : ''].filter(Boolean).join(' · '))}</small>` : ''}</span>${x.leadId ? `<button data-t="${i}">Abrir</button>` : x.accion && x.e !== 'esp' ? `<button class="${x.e === 'fail' ? 'rojo' : ''}" data-t="${i}">${esc(x.accion)}</button>` : `<span class="of-tag ${x.e}">${ESTXT[x.e][1]}</span>`}</div>`).join('') : '<p class="of-vacio">Nada pendiente en mi área. ¡Bien!</p>'}
    <div class="of-wa">${waTxt(p)}</div>
    <div class="of-bts">${O.d.wa?.numeroEmpresa ? `<button class="of-bt" id="ofWa">${SVG.wa} Escribirle por WhatsApp</button>` : ''}<button class="of-bt sec" id="ofVer">${esc(p.verTxt)}</button></div></aside>`;
}
function dock() {
  return `<nav class="of-dock" aria-label="Tu equipo">${EQ.map((p) => { const n = pendientes(p.id).length; return `<button class="of-dk${O.sel === p.id ? ' on' : ''}" data-p="${p.id}" aria-label="${esc(`${p.nombre}, ${p.area}${n ? `, ${n} pendientes` : ''}`)}"><img src="${IMG}ava_${p.id}.png" alt="" style="background:${p.suave}">${n ? `<span class="n" style="background:${p.color}">${n}</span>` : ''}<span>${esc(p.nombre)}</span></button>`; }).join('')}
    <button class="of-dk${O.sel === 'yo' ? ' on' : ''}" data-p="yo" aria-label="Tu mesa: pedir algo"><span class="ic">${SVG.mas}</span><span>Pedir algo</span></button>
    <span class="of-sep" aria-hidden="true"></span>
    <div class="of-luz" role="group" aria-label="Luz de la oficina">${['dia', 'tarde', 'noche'].map((l) => `<button class="${O.luz === l ? 'on' : ''}" data-luz="${l}" aria-label="${{ dia: 'Mañana', tarde: 'Tarde', noche: 'Noche' }[l]}" title="${{ dia: 'Mañana', tarde: 'Tarde', noche: 'Noche' }[l]}">${SVG[l]}</button>`).join('')}</div></nav>`;
}
function pintar() {
  const v = $('#view-inicio'); if (!O.d) return;
  v.innerHTML = `<div class="of l-${O.luz}">${escena()}${cabecera()}${panel()}${dock()}</div>`;
  window.OfLienzo?.montar(v.querySelector('.of-escena'), { luz: O.luz, sel: O.sel });
  const elegir = (id) => { O.sel = O.sel === id ? null : id; if (O.sel) O.toca = false; pintar(); };
  v.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => elegir(b.dataset.p)));
  v.querySelectorAll('[data-esc]').forEach((b) => (b.onclick = () => elegir({ sala: 'sala', mesa: 'yo' }[b.dataset.esc] || b.dataset.esc)));
  v.querySelectorAll('[data-luz]').forEach((b) => (b.onclick = () => { O.luz = b.dataset.luz; pintar(); }));
  $('#ofToca')?.addEventListener('click', () => { O.toca = !O.toca; pintar(); });
  $('#ofClasica')?.addEventListener('click', () => { pref.set('clasica'); window.Hoy.abrir(); });
  $('#ofCerrar')?.addEventListener('click', () => { O.sel = null; pintar(); });
  const p = POR[O.sel];
  if (p) {
    const ts = O.d.tareas[p.id] || [];
    v.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { const x = ts[Number(b.dataset.t)]; if (x.leadId) { document.querySelector('#nav [data-view="leads"]')?.click(); return window.Leads?.abrir(x.leadId); } window.Etapas.accion(x, () => abrir()); }));
    $('#ofWa')?.addEventListener('click', () => { const d = String(O.d.wa.numeroEmpresa).replace(/\D/g, ''); pf.openUrl(`https://wa.me/${d}?text=${encodeURIComponent(p.nombre)}`); });
    $('#ofVer')?.addEventListener('click', () => document.querySelector(`#nav [data-view="${p.vista}"]`)?.click());
  }
  v.querySelectorAll('[data-firma]').forEach((b) => (b.onclick = () => { const f = O.d.firmas[Number(b.dataset.firma)]; f.negocioId ? window.Negocios.abrirNegocio(f.negocioId) : f.propId && window.Inmo.abrirFicha(f.propId); }));
  $('#ofPedir')?.addEventListener('click', () => { const t = $('#ofPide').value.trim(); if (!t) return $('#ofPide').focus(); document.querySelector('#nav [data-view="agente"]')?.click(); setTimeout(() => window.Agente?.enviar(t), 60); });
}
async function abrir() {
  const tok = ir('inicio');
  let d; try { d = await api('ofDatos'); } catch (e) { $('#view-inicio').innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  if (tok !== window.Inmo._IM.tok) return;
  if (!O.nombre) { try { const u = await pf.apiUser?.(); O.nombre = (u?.ok && String(u.data?.namePerson || '').split(' ')[0]) || ''; } catch {} }
  O.d = d; O.luz ||= luzAuto(); pintar(); window.Ayuda?.onView?.('inicio');
}
window.Oficina = { abrir, pref, _O: O };
})();
