/* global */
'use strict';
// «La oficina» (0.16.14): el equipo se dibuja en un solo canvas desde un atlas de cuadros recortados (renders 3D).
// Antes eran nueve capas con imágenes enormes por personaje animadas con CSS, y eso se sentía pesado. Aquí un solo
// reloj mueve a los cuatro: posición por el recorrido (con arranque y frenado suaves), la vista según hacia dónde
// caminan, la acción de cada parada y el cajón abierto del archivador de Juanita. Los botones (nombre, nube,
// etiqueta de lo que hace) siguen siendo HTML y solo se reubican.
(() => {
const G = () => window.OF_GEO || {};
const S = { t0: performance.now(), base: 0, vel: 1, pausa: {}, desc: {}, imgs: {}, raf: 0, hover: null };
const ahora = () => S.base + (performance.now() - S.t0) / 1000 * S.vel;
// para el escenario de pruebas: velocidad (0 detiene) y saltar a un segundo del recorrido
function reloj({ vel, t } = {}) { S.base = t ?? ahora(); S.t0 = performance.now(); if (vel != null) S.vel = vel; return S.base; }
const reducido = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const SOMBRA = { dia: .34, tarde: .28, noche: .14 };
const FILTRO = { dia: 'none', tarde: 'sepia(.12) brightness(.96)', noche: 'brightness(.8) saturate(.9)' };

function tiempo(id) { const A = G().anim[id]; const T = S.pausa[id] ?? ahora(); return T + A.off - (S.desc[id] || 0); }
function pausar(id, si) {
  if (si && S.pausa[id] == null) S.pausa[id] = ahora();
  if (!si && S.pausa[id] != null) { S.desc[id] = (S.desc[id] || 0) + ahora() - S.pausa[id]; S.pausa[id] = null; }
}
// recorrido con velocidad trapezoidal: arranca y frena en `ta` segundos
function avance(t, T, ta = 0.35) {
  const v = 1 / Math.max(T - ta, 0.01);
  if (t < ta) return 0.5 * v / ta * t * t;
  if (t > T - ta) return 1 - 0.5 * v / ta * (T - t) * (T - t);
  return v * (t - ta / 2);
}
function estado(id, tl) {
  const A = G().anim[id]; const tt = ((tl % A.cyc) + A.cyc) % A.cyc;
  const s = A.seg.find((x) => tt >= x.a && tt < x.a + x.d) || A.seg[A.seg.length - 1];
  if (s.t === 's') return { x: s.p[0], y: s.p[1], h: s.p[2], s: s.p.slice(3, 5), vista: s.acc ? 'acc' : 'idle', u: (tt - s.a) / s.d, parada: s.n, tl };
  const f = avance(tt - s.a, s.d); const P = s.pts; let i = 0;
  while (i < P.length - 2 && P[i + 1][3] < f) i++;
  const a = P[i], b = P[i + 1]; const k = b[3] > a[3] ? (f - a[3]) / (b[3] - a[3]) : 0;
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, h: a[2] + (b[2] - a[2]) * k, s: [a[4] + (b[4] - a[4]) * k, a[5] + (b[5] - a[5]) * k], vista: s.v[i], parada: null, tl };
}
function cuadro(id, e) {
  const at = G().atlas[id]; const fs = at.v[e.vista] || at.v.idle;
  let i = 0;
  if (e.vista === 'acc') i = Math.min(fs.length - 1, Math.floor(e.u * fs.length));
  else if (e.vista !== 'idle') i = Math.floor(e.tl * at.fps) % fs.length;
  return fs[(i + fs.length) % fs.length];
}
function imagen(url) {
  const v = S.imgs[url];
  if (!v || (v.complete && !v.naturalWidth && v.dataset.err)) { const im = new Image(); im.decoding = 'async'; im.onerror = () => { im.dataset.err = '1'; }; im.src = 'img/oficina/' + url; S.imgs[url] = im; }
  return S.imgs[url];
}

function montar(escena, { luz = 'dia', sel = null } = {}) {
  cancelAnimationFrame(S.raf);
  const cv = escena.querySelector('.of-lienzo'); if (!cv || !G().anim) return;
  const ctx = cv.getContext('2d'); const ids = Object.keys(G().anim);
  ids.forEach((id) => pausar(id, sel === id));
  ids.forEach((id) => G().atlas[id].pages.forEach((u) => { const im = imagen(u); if (!im.complete) im.addEventListener('load', () => dibujar(true), { once: true }); }));
  const bots = Object.fromEntries(ids.map((id) => [id, escena.querySelector(`.of-pj-${id}`)]));
  ids.forEach((id) => { const b = bots[id]; if (!b) return; b.onmouseenter = () => (S.hover = id); b.onmouseleave = () => (S.hover = S.hover === id ? null : S.hover); });
  const gab = escena.querySelector('.of-gab'); const VG = G().gabVentana || [0.26, 0.76];
  let W = 0, H = 0, dpr = 1, ultimo = 0; const quieto = reducido();
  function medir() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = escena.clientWidth; H = escena.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  function dibujar(forzar) {
    if (!cv.isConnected) return;
    if (cv.width !== Math.round(escena.clientWidth * Math.min(window.devicePixelRatio || 1, 2))) medir();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const es = ids.map((id) => [id, estado(id, quieto ? G().anim[id].off : tiempo(id))]).sort((a, b) => a[1].y - b[1].y);
    for (const [id, e] of es) {
      const at = G().atlas[id]; const X = e.x / 100 * W, Y = e.y / 100 * H, alto = e.h / 100 * H, sc = alto / at.alto;
      // sombra en el piso
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, alto * 0.24); g.addColorStop(0, 'rgba(45,30,15,.38)'); g.addColorStop(1, 'rgba(45,30,15,0)');
      ctx.save(); ctx.translate(X, Y); ctx.scale(1, 0.17); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, alto * 0.24, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      const f = cuadro(id, e); const im = imagen(at.pages[f[0]]);
      if (im.complete && im.naturalWidth && e.s) {  // sombra del cuerpo sobre el piso, hacia donde la proyecta el sol del fondo
        ctx.save(); ctx.globalAlpha = SOMBRA[luz] ?? .22; ctx.filter = 'brightness(0) blur(2px)';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.transform(1, 0, -e.s[0], -e.s[1] * 0.999, X, Y);
        ctx.drawImage(im, f[1], f[2], f[3], f[4], f[5] * sc, f[6] * sc, f[3] * sc, f[4] * sc); ctx.restore();
      }
      if (im.complete && im.naturalWidth) {
        ctx.save(); ctx.filter = FILTRO[luz] || 'none';
        if (sel === id || S.hover === id) { ctx.shadowColor = 'rgba(255,255,255,.95)'; ctx.shadowBlur = 10; }
        ctx.drawImage(im, f[1], f[2], f[3], f[4], X + f[5] * sc, Y + f[6] * sc, f[3] * sc, f[4] * sc); ctx.restore();
      }
      const b = bots[id];
      if (b) {
        b.style.left = e.x.toFixed(2) + '%'; b.style.top = e.y.toFixed(2) + '%'; b.style.height = e.h.toFixed(2) + '%'; b.style.zIndex = String(100 + Math.round(e.y * 5));
        b.querySelectorAll('.of-act').forEach((a) => a.classList.toggle('on', e.parada != null && a.classList.contains('of-a' + e.parada)));
      }
      if (id === 'juanita' && gab) gab.classList.toggle('on', e.vista === 'acc' && e.u > VG[0] && e.u < VG[1]);
    }
    if (forzar) return;
  }
  function bucle(ts) {
    if (!cv.isConnected) return;
    S.raf = requestAnimationFrame(bucle);
    if (!document.hidden && ts - ultimo > 1000 / 30) { ultimo = ts; try { dibujar(); } catch (er) { if (!S.avisado) { S.avisado = true; console.warn('oficina:', er); } } }
  }
  cv.addEventListener('contextrestored', () => { medir(); dibujar(); });
  medir(); dibujar();
  if (!quieto) S.raf = requestAnimationFrame(bucle);
  else window.addEventListener('resize', () => cv.isConnected && dibujar(), { passive: true });
}
window.OfLienzo = { montar, reloj, ahora, imagen, cuadroDe: (id, vista, i) => G().atlas[id].v[vista][i], pausado: (id) => S.pausa[id] != null, estado: (id) => estado(id, tiempo(id)) };
})();
