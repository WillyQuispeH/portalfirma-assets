// Vista previa del documento de una operación, página por página (pdf.js, que carga index.html como pdfjsLib).
// El PDF viene SOLO del servicio oficial de archivos de Portalfirma (getById).
import { useEffect, useRef, useState } from 'react';
import Icono from '../../../ui/Icono';
import { operacionArchivo } from '../../../../store/hooks/useOperacion.hook';
import { abrirUrl, configurarAccesoDocumentos } from '../../../../utils/app';

/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js no tiene tipos en la app */
export default function VistaPrevia({ op }: { op: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [pagina, setPagina] = useState(1);
  const [problema, setProblema] = useState<{ sinAcceso: boolean; texto: string } | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true; let doc: any = null;
    setPdf(null); setProblema(null); setPagina(1);
    operacionArchivo.ver(op).then(async (r) => {
      if (!vivo) return;
      if (!r.ok) return setProblema({ sinAcceso: r.code === 'NO_FILE_KEY', texto: r.error || '' });
      doc = await (window as any).pdfjsLib.getDocument({ data: r.data!.bytes, isEvalSupported: false, standardFontDataUrl: 'vendor/standard_fonts/', cMapUrl: 'vendor/cmaps/', cMapPacked: true }).promise;
      if (vivo) setPdf(doc); else doc.destroy?.();
    });
    return () => { vivo = false; try { doc?.destroy?.(); } catch { /* ya cerrado */ } };
  }, [op, intento]);

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

  if (problema) return (
    <div className="opd-canvas" id="opdCanvas">
      <div className="opd-nofile"><Icono nombre="file" tam={30} />
        {problema.sinAcceso
          ? <><p><b>Falta el acceso a los documentos</b><br /><small>{problema.texto}</small></p><button className="secondary small" id="opdKey" onClick={() => configurarAccesoDocumentos(() => setIntento((x) => x + 1))}>Configurar acceso</button></>
          : <><p><b>Vista previa no disponible</b><br /><small>{problema.texto}</small></p><button className="secondary small" id="opdWeb" onClick={() => abrirUrl('https://cliente.portalfirma.cl/')}>Ver en portalfirma.cl</button></>}
      </div>
    </div>
  );
  return (
    <>
      {/* el canvas de la página lo pone el efecto de arriba */}
      <div className="opd-canvas" id="opdCanvas" ref={caja}>{!pdf && <div className="spinner" />}</div>
      <div className="opd-pager" id="opdPager">
        {pdf?.numPages > 1 && <>
          <button className="ibtn" data-p="-1" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}><Icono nombre="chevL" tam={15} /></button>
          <span>Página {pagina} de {pdf.numPages}</span>
          <button className="ibtn" data-p="1" disabled={pagina >= pdf.numPages} onClick={() => setPagina((p) => p + 1)}><Icono nombre="chevR" tam={15} /></button>
        </>}
      </div>
    </>
  );
}
