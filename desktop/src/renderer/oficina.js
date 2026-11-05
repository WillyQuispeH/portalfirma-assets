/* global $, ir, pf, liberar */
'use strict';
// «La oficina» (0.16): la pantalla de inicio. El equipo de Asset camina por una oficina vidriada y cada uno muestra
// lo suyo de hoy con datos reales: Pedro (Captación), Juanita (Documentos), Diego (Seguimiento) y Fernanda (Leads).
// Por WhatsApp se habla con cada uno escribiendo su nombre. La sala de reuniones son las firmas en curso y la mesa
// del frente es la tuya («Pedir algo»). La vista «Hoy» clásica sigue a un clic. Los personajes se dibujan en
// oficina-lienzo.js (un canvas); sus botones con el nombre y la nube, en React.
(() => {
// La pantalla está en React: src/ui/components/functional/oficina/Oficina.tsx. Aquí queda la preferencia
// («La oficina» o la lista «Hoy») y el montaje. Comparte #view-inicio con «Hoy» (también React).
const porDefecto = () => { try { return pf.cfg?.().oficina === false ? 'clasica' : 'oficina'; } catch { return 'oficina'; } }; // en las pruebas automáticas parte en «Hoy»
const pref = { get: () => { try { return localStorage.getItem('pfInicio') || porDefecto(); } catch { return porDefecto(); } }, set: (v) => { try { localStorage.setItem('pfInicio', v); } catch {} } };
function abrir() {
  ir('inicio'); const v = $('#view-inicio');
  liberar(v); window.ReactUI.montar('Oficina', v);
}
window.Oficina = { abrir, pref };
})();
