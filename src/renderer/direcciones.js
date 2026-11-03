/* global pf, api, esc, icon, toast */
'use strict';
// Campo de dirección inteligente: con la clave de Google sugiere mientras escribes (Places API) y llena calle y número,
// comuna, región y las coordenadas. Sin clave, «Buscar» consulta OpenStreetMap una vez. La clave se activa aquí mismo.
(() => {
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const mapa = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

// conectar(input, { inicial: {lat,lng,placeId}, alElegir(d) }) → { valor(): {lat,lng,placeId} }
function conectar(input, { inicial = {}, alElegir } = {}) {
  const box = document.createElement('div'); box.className = 'dr'; input.parentNode.insertBefore(box, input); box.appendChild(input);
  input.setAttribute('autocomplete', 'off'); input.spellcheck = false;
  box.insertAdjacentHTML('beforeend', `<button type="button" class="dr-bus ghost small hidden" title="Buscar la dirección">${icon('search', 14)}<span>Buscar</span></button><div class="dr-l hidden"></div><div class="dr-pie"></div>`);
  const lista = box.querySelector('.dr-l'); const pie = box.querySelector('.dr-pie'); const bus = box.querySelector('.dr-bus');
  const S = { google: false, sesion: uuid(), geo: inicial.lat != null ? { lat: inicial.lat, lng: inicial.lng, placeId: inicial.placeId || null } : null, texto: input.value, items: [], i: -1, tok: 0 };

  const pintarPie = (extra = '') => {
    pie.innerHTML = (S.geo ? `<span class="dr-ok">${icon('pin', 12)} Ubicación guardada <a href="#" data-mapa>ver en el mapa</a></span>` : '')
      + (S.google ? `<span class="dr-g">${icon('sparkle', 11)} Direcciones de Google</span>` : `<a href="#" data-activar>${icon('sparkle', 11)} Activar direcciones de Google</a>`) + extra;
    pie.querySelector('[data-mapa]')?.addEventListener('click', (e) => { e.preventDefault(); pf.openUrl(mapa(S.geo.lat, S.geo.lng)); });
    pie.querySelector('[data-activar]')?.addEventListener('click', (e) => { e.preventDefault(); activar(); });
    bus.classList.toggle('hidden', S.google);
  };
  const cerrarLista = () => { lista.classList.add('hidden'); lista.innerHTML = ''; S.items = []; S.i = -1; };
  const mostrar = (items, tipo) => {
    S.items = items; S.i = -1; S.tipo = tipo;
    if (!items.length) { lista.innerHTML = '<p class="dr-vac">Sin resultados. Revisa la calle y el número, o escríbela tal cual.</p>'; lista.classList.remove('hidden'); return; }
    lista.innerHTML = items.map((x, i) => `<button type="button" data-i="${i}">${icon('pin', 13)}<span><b>${esc(x.principal || x.direccion)}</b><small>${esc(x.secundario || [x.comuna, x.region].filter(Boolean).join(', '))}</small></span></button>`).join('')
      + (tipo === 'google' ? '<small class="dr-attr">Google</small>' : '<small class="dr-attr">© OpenStreetMap</small>');
    lista.classList.remove('hidden');
    lista.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); elegir(Number(b.dataset.i)); }));
  };
  async function elegir(i) {
    const x = S.items[i]; if (!x) return; cerrarLista();
    try {
      const d = S.tipo === 'google' ? await api('dirDetalle', x.placeId, S.sesion) : x; S.sesion = uuid();
      input.value = d.direccion; S.texto = d.direccion; S.geo = d.lat != null ? { lat: d.lat, lng: d.lng, placeId: d.placeId || null } : null;
      alElegir?.(d); pintarPie();
    } catch (e) { toast(e.message, 5000); }
  }
  input.addEventListener('input', () => {
    if (input.value !== S.texto && S.geo) { S.geo = null; pintarPie(); } // cambió la dirección: las coordenadas ya no corresponden
    if (!S.google) return;
    clearTimeout(S.t); const t = input.value.trim(); if (t.length < 3) return cerrarLista();
    S.t = setTimeout(async () => { const my = ++S.tok; try { const l = await api('dirSugerir', t, S.sesion); if (my === S.tok && document.activeElement === input) mostrar(l, 'google'); } catch (e) { if (e.message) pintarPie(`<span class="dr-err">${esc(e.message)}</span>`); } }, 260);
  });
  input.addEventListener('keydown', (e) => {
    if (lista.classList.contains('hidden') || !S.items.length) { if (e.key === 'Enter' && !S.google) { e.preventDefault(); bus.click(); } return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); S.i = (S.i + (e.key === 'ArrowDown' ? 1 : -1) + S.items.length) % S.items.length; lista.querySelectorAll('[data-i]').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === S.i)); }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(S.i < 0 ? 0 : S.i); } else if (e.key === 'Escape') { e.stopPropagation(); cerrarLista(); }
  });
  input.addEventListener('blur', () => setTimeout(cerrarLista, 150));
  bus.onclick = async () => { bus.disabled = true; try { mostrar(await api('dirBuscar', input.value), 'osm'); input.focus(); } catch (e) { pintarPie(`<span class="dr-err">${esc(e.message)}</span>`); } finally { bus.disabled = false; } };

  function activar() {
    pintarPie(`<span class="dr-act"><input type="password" placeholder="Pega la clave de Google Maps (AIza…)" autocomplete="off" spellcheck="false" /><button type="button" class="primary small" data-ok>Activar</button>
      <small>Una clave de Google Cloud con la «Places API (New)» y facturación activas. Queda cifrada en este computador.</small></span>`);
    const k = pie.querySelector('.dr-act input'); k.focus();
    const ok = async () => { const b = pie.querySelector('[data-ok]'); b.disabled = true; try { const r = await api('dirConfigurar', k.value); k.value = ''; S.google = r.google; pintarPie(); toast('Direcciones de Google activadas.'); input.focus(); } catch (e) { b.disabled = false; pie.querySelector('.dr-act small').textContent = e.message; pie.querySelector('.dr-act small').classList.add('dr-err'); } };
    pie.querySelector('[data-ok]').onclick = ok; k.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } };
  }

  api('dirEstado').then((r) => { S.google = r.google; pintarPie(); }).catch(() => pintarPie());
  pintarPie();
  return { valor: () => (S.geo ? { ...S.geo } : { lat: null, lng: null, placeId: null }) };
}

// para Configuración: quitar o cambiar la clave
async function quitarClave() { await api('dirConfigurar', ''); toast('Direcciones de Google desactivadas.'); }

window.Direcciones = { conectar, quitarClave };
})();
