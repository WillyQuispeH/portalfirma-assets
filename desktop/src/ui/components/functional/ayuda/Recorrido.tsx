// Recorrido guiado: oscurece la pantalla, deja a la vista la parte que se explica (.tour-hole) y muestra el globo.
// Las clases tour, tour-tip, tour-n y los data-tour (next, prev, skip) los usan las pruebas (ayuda-e2e, aprende-e2e).
// Teclado (en el controlador): → o Enter avanza, ← retrocede, Esc lo termina.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useAyuda } from '../../../store/hooks/useAyuda.hook';

const ANCHO_GLOBO = 300;

export default function Recorrido() {
  const { recorrido, ayudaSiguiente, ayudaAnterior, ayudaTerminarRecorrido } = useAyuda();
  const hueco = useRef<HTMLDivElement>(null);
  const globo = useRef<HTMLDivElement>(null);

  // ubica el hueco sobre el elemento y el globo debajo (o arriba, o al lado si no cabe)
  const ubicar = () => {
    if (!recorrido || !hueco.current || !globo.current) return;
    const r = recorrido.pasos[recorrido.i].el.getBoundingClientRect(); const pad = 6;
    Object.assign(hueco.current.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const alto = globo.current.offsetHeight || 150; const W = innerWidth, H = innerHeight;
    let x = r.left, y = r.bottom + 14;
    if (y + alto > H - 10) y = r.top - alto - 14;
    if (y < 10) { y = Math.min(H - alto - 10, Math.max(10, r.top)); x = r.right + 14 > W - ANCHO_GLOBO ? r.left - ANCHO_GLOBO - 14 : r.right + 14; }
    globo.current.style.left = Math.max(10, Math.min(W - ANCHO_GLOBO - 10, x)) + 'px';
    globo.current.style.top = Math.max(10, y) + 'px';
  };

  useLayoutEffect(() => {
    if (!recorrido) return;
    recorrido.pasos[recorrido.i].el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    ubicar();
  });
  useEffect(() => {
    if (!recorrido) return undefined;
    window.addEventListener('resize', ubicar);
    return () => window.removeEventListener('resize', ubicar);
  });

  if (!recorrido) return null;
  const { i, pasos } = recorrido; const paso = pasos[i]; const n = pasos.length;
  return (
    <div className="tour">
      <div className="tour-hole" ref={hueco} />
      <div className="tour-tip" role="dialog" ref={globo}>
        <div className="tour-n">{i + 1} de {n}</div>
        <h4>{paso.t}</h4>
        <p>{paso.d}</p>
        <div className="tour-acts">
          <button className="ghost small" data-tour="skip" onClick={ayudaTerminarRecorrido}>Saltar recorrido</button>
          <span>
            {i > 0 && <button className="secondary small" data-tour="prev" onClick={ayudaAnterior}>Anterior</button>}
            <button className="primary small" data-tour="next" onClick={ayudaSiguiente}>{i === n - 1 ? 'Listo' : 'Siguiente'}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
