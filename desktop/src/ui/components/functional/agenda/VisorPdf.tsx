// Visor de un PDF que ya está en memoria (base64), página por página, con pdf.js (index.html lo carga como pdfjsLib).
// Lo usa la ventana de la orden de visita: el corredor ve el documento TAL COMO se enviará a firmar. No usa <iframe>
// porque la política de seguridad de la app (CSP) no deja marcos con blob:.
import { useEffect, useRef, useState } from 'react';
import Boton from '../../ui/Boton';

/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js no tiene tipos en la app */
export default function VisorPdf({ base64, bytes }: { base64?: string; bytes?: Uint8Array }) {
  const caja = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [pagina, setPagina] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true; let doc: any = null;
    setPdf(null); setPagina(1); setError('');
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

  // dibuja la página en un canvas del ancho de la caja
  useEffect(() => {
    const box = caja.current; if (!pdf || !box) return; let vivo = true;
    (async () => {
      const page = await pdf.getPage(pagina); const w = Math.max(240, box.clientWidth - 24);
      const vp0 = page.getViewport({ scale: 1 }); const scale = (w / vp0.width) * (window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.style.width = w + 'px';
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      if (vivo) box.replaceChildren(c);
    })();
    return () => { vivo = false; };
  }, [pdf, pagina]);

  const caja0 = 'tw:grid tw:place-items-center tw:min-h-[320px] tw:max-h-[58vh] tw:overflow-auto tw:p-3 tw:rounded-icono tw:bg-sunken tw:[&_canvas]:max-w-full tw:[&_canvas]:rounded tw:[&_canvas]:bg-white tw:[&_canvas]:shadow-md';
  return (
    <div className="tw:flex tw:flex-col tw:gap-2">
      <div className={caja0} id="ovPdf" ref={caja}>{error ? <p className="tw:m-0 tw:text-sm tw:text-muted">{error}</p> : !pdf && <div className="spinner" />}</div>
      {pdf?.numPages > 1 && (
        <div className="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:text-xs tw:text-muted" id="ovPager">
          <Boton variante="secundario" tamano="sm" icono="chevL" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} />
          <span>Página {pagina} de {pdf.numPages}</span>
          <Boton variante="secundario" tamano="sm" icono="chevR" aria-label="Página siguiente" disabled={pagina >= pdf.numPages} onClick={() => setPagina((p) => p + 1)} />
        </div>
      )}
    </div>
  );
}
