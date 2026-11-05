'use strict';
// Apariencia: Claro, Oscuro o Sistema. Se aplica como <html data-theme="…"> antes de pintar (sin parpadeo).
(() => {
  const mq = matchMedia('(prefers-color-scheme: dark)'); let pref = 'system';
  try { pref = localStorage.getItem('pf.tema') || 'system'; } catch {}
  const aplicar = () => { document.documentElement.dataset.theme = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref; };
  aplicar(); mq.addEventListener?.('change', aplicar);
  window.Tema = {
    get: () => pref,
    async set(t) { if (!['light', 'dark', 'system'].includes(t)) return; pref = t; try { localStorage.setItem('pf.tema', t); } catch {} aplicar(); try { await window.pf?.temaSet?.(t); } catch {} },
  };
})();
