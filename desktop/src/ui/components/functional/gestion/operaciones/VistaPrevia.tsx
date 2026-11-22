// Vista previa del documento de una operación, página por página (pdf.js, que carga index.html como pdfjsLib).
// El PDF viene SOLO del servicio oficial de archivos de Portalfirma (getById).
import { useEffect, useRef, useState } from 'react';
import Boton from '../../../ui/Boton';
import EstadoVacio from '../../../ui/EstadoVacio';
import { operacionArchivo } from '../../../../store/hooks/useOperacion.hook';
import { abrirUrl, configurarAccesoDocumentos } from '../../../../utils/app';
import type { TVersionDoc } from '../../../../store/interfaces/operacion.interface';

/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js no tiene tipos en la app */
export default function VistaPrevia({ op, version }: { op: number; /** original, signed o legalized; sin ella, la más avanzada */ version?: TVersionDoc }) {
  const caja = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [pagina, setPagina] = useState(1);
  const [problema, setProblema] = useState<{ sinAcceso: boolean; texto: string } | null>(null);
  const [intento, setIntento] = useState(0);
  const [tam, setTam] = useState({ w: 0, h: 0 });   // lo que mide la caja: la hoja se ajusta a su ancho y a su alto (sin desplazarse)

  useEffect(() => {
    let vivo = true; let doc: any = null;
    setPdf(null); setProblema(null); setPagina(1);
    operacionArchivo.ver(op, version).then(async (r) => {
      if (!vivo) return;
      if (!r.ok) return setProblema({ sinAcceso: r.code === 'NO_FILE_KEY', texto: r.error || '' });
      doc = await (window as any).pdfjsLib.getDocument({ data: r.data!.bytes, isEvalSupported: false, standardFontDataUrl: 'vendor/standard_fonts/', cMapUrl: 'vendor/cmaps/', cMapPacked: true }).promise;
      if (vivo) setPdf(doc); else doc.destroy?.();
    });
    return () => { vivo = false; try { doc?.destroy?.(); } catch { /* ya cerrado */ } };
  }, [op, version, intento]);

  // el tamaño de la caja
  useEffect(() => {
    const box = caja.current; if (!box) return undefined;
    const medir = () => setTam({ w: box.clientWidth, h: box.clientHeight });
    medir(); const o = new ResizeObserver(medir); o.observe(box); return () => o.disconnect();
  }, [pdf]);

  // dibuja la página entera en un canvas que cabe en el ancho y en el alto de la caja
  useEffect(() => {
    const box = caja.current; if (!pdf || !box || !tam.w || !tam.h) return; let vivo = true;
    (async () => {
      const page = await pdf.getPage(pagina); const vp0 = page.getViewport({ scale: 1 });
      const esc = Math.min((tam.w - 24) / vp0.width, (tam.h - 24) / vp0.height);
      const vp = page.getViewport({ scale: esc * (window.devicePixelRatio || 1) }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      c.style.width = Math.floor(vp0.width * esc) + 'px'; c.style.height = Math.floor(vp0.height * esc) + 'px';
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      if (vivo) box.replaceChildren(c);
    })();
    return () => { vivo = false; };
  }, [pdf, pagina, tam]);

  // fondo hundido del kit; el canvas de la página lo pone el efecto de arriba (#opdCanvas lo usan las pruebas)
  const caja0 = 'tw:grid tw:flex-1 tw:min-h-0 tw:place-items-center tw:overflow-hidden tw:p-3 tw:rounded-icono tw:bg-sunken tw:border tw:border-solid tw:border-edge tw:[&_canvas]:max-w-full tw:[&_canvas]:rounded tw:[&_canvas]:bg-white tw:[&_canvas]:shadow-md';
  if (problema) return (
    <div className={caja0} id="opdCanvas">
      {problema.sinAcceso
        ? <EstadoVacio icono="lock" titulo="Falta el acceso a los documentos" texto={problema.texto}
          accion={<Boton variante="secundario" tamano="sm" id="opdKey" icono="key" onClick={() => configurarAccesoDocumentos(() => setIntento((x) => x + 1))}>Configurar acceso</Boton>} />
        : <EstadoVacio icono="file" titulo="Vista previa no disponible" texto={problema.texto}
          accion={<Boton variante="secundario" tamano="sm" id="opdWeb" icono="link" onClick={() => abrirUrl('https://cliente.portalfirma.cl/')}>Ver en portalfirma.cl</Boton>} />}
    </div>
  );
  return (
    <div className="tw:flex tw:h-full tw:min-h-0 tw:flex-col tw:gap-2">
      <div className={caja0} id="opdCanvas" ref={caja}>{!pdf && <div className="spinner" />}</div>
      {pdf?.numPages > 1 && (
        <div className="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:text-xs tw:text-muted" id="opdPager">
          <Boton variante="secundario" tamano="sm" data-p="-1" icono="chevL" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} />
          <span>Página {pagina} de {pdf.numPages}</span>
          <Boton variante="secundario" tamano="sm" data-p="1" icono="chevR" aria-label="Página siguiente" disabled={pagina >= pdf.numPages} onClick={() => setPagina((p) => p + 1)} />
        </div>
      )}
    </div>
  );
}
