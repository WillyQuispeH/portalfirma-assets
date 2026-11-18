// Visor de un PDF que ya está en memoria (base64), página por página, con pdf.js (index.html lo carga como pdfjsLib).
// Lo usa la ventana de la orden de visita: el corredor ve el documento TAL COMO se enviará a firmar. No usa <iframe>
// porque la política de seguridad de la app (CSP) no deja marcos con blob:.
// En plantillas (`ajustar="pagina"`) la hoja cabe entera; con `zoom` se amplía, se arrastra (pan) y el pager flota.
// El tamaño de ajuste se mide en un marco exterior estable: así el scrollbar interior no hace vibrar el scale.
import { useEffect, useRef, useState, type PointerEvent as PointerEventR } from 'react';
import Boton from '../../ui/Boton';
import { cx } from '../../../utils/cx';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_PASO = 0.25;

/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js no tiene tipos en la app */
export default function VisorPdf({
  base64, bytes, ajustar = 'ancho', flotante = false, sinCaja = false, zoom = false,
}: {
  base64?: string; bytes?: Uint8Array;
  /** ancho = llena el ancho (puede scrollear); pagina = la hoja cabe entera en la caja */
  ajustar?: 'ancho' | 'pagina';
  /** botones de página encima del PDF (abajo al centro) */
  flotante?: boolean;
  /** sin el fondo sunken ni el tope de altura del visor clásico */
  sinCaja?: boolean;
  /** botones − / + al lado del pager (factor sobre el ajuste base); con zoom>100% se arrastra el PDF */
  zoom?: boolean;
}) {
  const marco = useRef<HTMLDivElement>(null);  // tamaño estable (sin scrollbar)
  const caja = useRef<HTMLDivElement>(null);   // scrollea / se arrastra
  const centro = useRef<HTMLDivElement>(null); // mantiene el PDF centrado (también con zoom)
  const [pdf, setPdf] = useState<any>(null);
  const [pagina, setPagina] = useState(1);
  const [error, setError] = useState('');
  const [factor, setFactor] = useState(1);
  const [arrastrando, setArrastrando] = useState(false);
  const pan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const ultimoTam = useRef({ w: 0, h: 0 });
  const centrarScroll = useRef(false); // solo al cambiar zoom/página, no en cada resize

  useEffect(() => {
    let vivo = true; let doc: any = null;
    setPdf(null); setPagina(1); setFactor(1); setError('');
    (async () => {
      try {
        let datos = bytes ? new Uint8Array(bytes) : null;   // copia: pdf.js se queda con el buffer
        if (!datos) { const bin = atob(base64 || ''); datos = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) datos[i] = bin.charCodeAt(i); }
        doc = await (window as any).pdfjsLib.getDocument({ data: datos, isEvalSupported: false, standardFontDataUrl: 'vendor/standard_fonts/', cMapUrl: 'vendor/cmaps/', cMapPacked: true }).promise;
        if (vivo) setPdf(doc); else doc.destroy?.();
      } catch (e) { if (vivo) setError((e as Error).message || 'No se pudo abrir el PDF.'); }
    })();
    return () => { vivo = false; try { doc?.destroy?.(); } catch { /* ya cerrado */ } };
  }, [base64, bytes]);

  // dibuja midiendo el marco (no la caja con scroll): evita el temblor ancho↔scrollbar
  useEffect(() => {
    const outer = marco.current; const mid = centro.current; const box = caja.current;
    if (!pdf || !outer || !mid || !box) return;
    let vivo = true;
    ultimoTam.current = { w: 0, h: 0 }; // fuerza redibujo al cambiar página / zoom
    centrarScroll.current = factor > 1;
    const dibujar = async () => {
      const pad = sinCaja ? (factor > 1 ? 8 : 0) : 24;
      const wBox = Math.max(120, outer.clientWidth - pad);
      const hBox = Math.max(120, outer.clientHeight - pad);
      // ignora cambios de 1px (ruido / subpixel) que reencenderían el ciclo
      if (Math.abs(wBox - ultimoTam.current.w) < 2 && Math.abs(hBox - ultimoTam.current.h) < 2 && mid.querySelector('canvas')) return;
      ultimoTam.current = { w: wBox, h: hBox };

      const page = await pdf.getPage(pagina);
      const vp0 = page.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      // un pelín menos que el exacto evita pelear con el borde del contenedor
      const base = (ajustar === 'pagina'
        ? Math.min(wBox / vp0.width, hBox / vp0.height)
        : wBox / vp0.width) * 0.995;
      const scaleCss = base * factor;
      const vp = page.getViewport({ scale: scaleCss * dpr });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      c.style.width = `${Math.floor(vp0.width * scaleCss)}px`;
      c.style.height = `${Math.floor(vp0.height * scaleCss)}px`;
      c.style.display = 'block';
      c.draggable = false;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      if (!vivo) return;
      mid.replaceChildren(c);
      // al cambiar zoom: centra el scroll para que la hoja quede en el medio del viewport
      if (centrarScroll.current) {
        centrarScroll.current = false;
        requestAnimationFrame(() => {
          box.scrollLeft = Math.max(0, (box.scrollWidth - box.clientWidth) / 2);
          box.scrollTop = Math.max(0, (box.scrollHeight - box.clientHeight) / 2);
        });
      }
    };
    // si el PDF cambia o se cierra a medio dibujar, pdf.js cancela ese dibujo (RenderingCancelledException): se ignora
    const intentar = () => { dibujar().catch(() => { /* dibujo viejo cancelado */ }); };
    intentar();
    const obs = new ResizeObserver(intentar);
    obs.observe(outer);
    return () => { vivo = false; obs.disconnect(); };
  }, [pdf, pagina, ajustar, sinCaja, factor]);

  const puedePan = zoom && factor > 1;

  const alPointerDown = (e: PointerEventR<HTMLDivElement>) => {
    if (!puedePan || e.button !== 0) return;
    const el = caja.current; if (!el) return;
    // solo pan si hay algo que desplazar
    if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    setArrastrando(true);
  };
  const alPointerMove = (e: PointerEventR<HTMLDivElement>) => {
    const p = pan.current; const el = caja.current; if (!p || !el) return;
    el.scrollLeft = p.sl - (e.clientX - p.x);
    el.scrollTop = p.st - (e.clientY - p.y);
  };
  const alPointerUp = (e: PointerEventR<HTMLDivElement>) => {
    if (!pan.current) return;
    pan.current = null;
    setArrastrando(false);
    try { caja.current?.releasePointerCapture(e.pointerId); } catch { /* ya soltado */ }
  };

  const cambiarZoom = (dir: 1 | -1) => {
    setFactor((f) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, f + dir * ZOOM_PASO)) * 100) / 100);
  };

  const hayPaginas = pdf?.numPages > 1;
  const barra = pdf && (hayPaginas || zoom) && (
    <div
      className={cx(
        'tw:flex tw:items-center tw:justify-center tw:gap-ui tw:text-xs tw:text-muted',
        flotante && 'tw:absolute tw:bottom-3 tw:left-1/2 tw:-translate-x-1/2 tw:z-10 tw:rounded-control tw:border tw:border-solid tw:border-edge tw:bg-card/95 tw:px-2 tw:py-1 tw:shadow-md',
      )}
      id="ovPager"
    >
      {hayPaginas && (
        <>
          <Boton variante="secundario" tamano="sm" icono="chevL" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} />
          <span>Página {pagina} de {pdf.numPages}</span>
          <Boton variante="secundario" tamano="sm" icono="chevR" aria-label="Página siguiente" disabled={pagina >= pdf.numPages} onClick={() => setPagina((p) => p + 1)} />
        </>
      )}
      {zoom && (
        <>
          {hayPaginas && <span className="tw:mx-0.5 tw:h-4 tw:w-px tw:bg-edge" aria-hidden />}
          <Boton variante="secundario" tamano="sm" icono="zoomOut" aria-label="Alejar" disabled={factor <= ZOOM_MIN} onClick={() => cambiarZoom(-1)} />
          <button type="button" className="tw:m-0 tw:min-w-[3rem] tw:border-0 tw:bg-transparent tw:p-0 tw:font-[inherit] tw:text-xs tw:font-semibold tw:text-muted tw:cursor-pointer tw:hover:text-text"
            title="Restablecer zoom" aria-label={`Zoom ${Math.round(factor * 100)} por ciento. Clic para restablecer`}
            onClick={() => setFactor(1)}>
            {Math.round(factor * 100)}%
          </button>
          <Boton variante="secundario" tamano="sm" icono="zoomIn" aria-label="Acercar" disabled={factor >= ZOOM_MAX} onClick={() => cambiarZoom(1)} />
        </>
      )}
    </div>
  );

  const marcoCls = sinCaja
    ? 'tw:relative tw:min-h-0 tw:h-full tw:w-full tw:overflow-hidden'
    : 'tw:relative tw:min-h-[320px] tw:max-h-[58vh] tw:overflow-hidden tw:rounded-icono tw:bg-sunken';

  const cajaCls = cx(
    'tw:h-full tw:w-full tw:[&_canvas]:bg-white tw:[&_canvas]:shadow-md tw:[&_canvas]:select-none',
    sinCaja ? '' : 'tw:p-3 tw:[&_canvas]:rounded',
    puedePan
      ? cx('tw:overflow-auto tw:overscroll-contain tw:[scrollbar-gutter:stable]', arrastrando ? 'tw:cursor-grabbing' : 'tw:cursor-grab')
      : (ajustar === 'ancho' && !sinCaja ? 'tw:overflow-auto' : 'tw:overflow-hidden'),
  );

  return (
    <div className={cx('tw:relative tw:flex tw:min-h-0 tw:flex-col', sinCaja && 'tw:h-full tw:flex-1')}>
      <div ref={marco} className={marcoCls} id="ovPdfMarco">
        <div
          className={cajaCls}
          id="ovPdf"
          ref={caja}
          onPointerDown={alPointerDown}
          onPointerMove={alPointerMove}
          onPointerUp={alPointerUp}
          onPointerCancel={alPointerUp}
        >
          {/* min 100% del viewport: si la hoja es más chica, queda centrada; si es más grande, crece y se scrollea */}
          <div ref={centro} className="tw:grid tw:min-h-full tw:min-w-full tw:w-max tw:h-max tw:place-items-center">
            {error ? <p className="tw:m-0 tw:text-sm tw:text-muted">{error}</p> : !pdf && <div className="spinner" />}
          </div>
        </div>
      </div>
      {flotante ? barra : barra && <div className="tw:mt-2">{barra}</div>}
    </div>
  );
}

/** la vista previa mientras el documento se arma (la ventana ya está abierta y se puede editar) */
export function PdfCargando({ sinCaja = false }: { sinCaja?: boolean } = {}) {
  return (
    <div
      className={cx(
        'tw:grid tw:place-items-center tw:p-3',
        sinCaja ? 'tw:min-h-0 tw:h-full tw:w-full' : 'tw:min-h-[320px] tw:rounded-icono tw:bg-sunken',
      )}
      role="status"
    >
      <div className="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:text-sm tw:text-muted"><div className="spinner" />Preparando el documento…</div>
    </div>
  );
}
