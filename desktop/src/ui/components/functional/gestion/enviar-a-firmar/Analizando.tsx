// Gestión documental › Enviar a firmar, mientras se analiza el documento: en pantalla solo está la primera hoja del PDF real, que se está
// leyendo (una barra luminosa la recorre), centrada y sin textos encima. Al terminar, Revisar (EnviarAFirmar.tsx) la corre a la derecha
// con una animación y aparecen los datos a la izquierda. El id #workingTitle y la clase .esq-barrido los usan las pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js no tiene tipos en la app */
import { useEffect, useRef, useState } from 'react';
import Layout from '../../../ui/Layout';
import { envioOperacion, useEnvio } from '../../../../store/hooks/useEnvio.hook';

/** la primera hoja del documento (el PDF real, entera en el alto disponible) con una barra que la recorre: se está leyendo */
export function HojaLeyendo({ ruta, barrido = true }: { ruta?: string; /** la barra que la recorre (mientras se lee) */ barrido?: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [medida, setMedida] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!ruta) return undefined;
    let vivo = true; let doc: any = null; let pagina: any = null; let tarea: any = null; let v1: { width: number; height: number } | null = null;
    const pintar = async (anchoCaja: number, altoCaja: number) => {
      if (!pagina || !v1 || !lienzo.current || !vivo) return;
      try { tarea?.cancel(); } catch { /* ya cancelado */ }
      const esc = Math.min((altoCaja - 12) / v1.height, (anchoCaja - 12) / v1.width);   // el mismo aire que alrededor de las hojas del visor de firmas
      const dpr = window.devicePixelRatio || 1; const vp = pagina.getViewport({ scale: esc * dpr });
      const c = lienzo.current; c.width = vp.width; c.height = vp.height;
      setMedida({ w: Math.floor(v1.width * esc), h: Math.floor(v1.height * esc) });
      tarea = pagina.render({ canvasContext: c.getContext('2d'), viewport: vp });
      try { await tarea.promise; } catch { /* cancelado al redimensionar */ }
    };
    (async () => {
      try {
        const b64 = await envioOperacion.vistaPrevia(ruta); if (!b64 || !vivo) return;
        const bin = atob(b64); const datos = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) datos[i] = bin.charCodeAt(i);
        doc = await (window as any).pdfjsLib.getDocument({ data: datos, isEvalSupported: false, standardFontDataUrl: 'vendor/standard_fonts/', cMapUrl: 'vendor/cmaps/', cMapPacked: true }).promise;
        pagina = await doc.getPage(1); v1 = pagina.getViewport({ scale: 1 });
        const el = caja.current; if (!el || !vivo) return;
        await pintar(el.clientWidth, el.clientHeight);
      } catch { /* sin vista previa: queda la hoja en blanco con la barra */ }
    })();
    const el = caja.current;
    if (!el) return undefined;
    const obs = new ResizeObserver((ents) => {
      const { width, height } = ents[0]?.contentRect ?? {};
      if (!width || !height || !pagina) return;
      pintar(width, height);
    });
    obs.observe(el);
    return () => { vivo = false; obs.disconnect(); try { tarea?.cancel(); doc?.destroy?.(); } catch { /* ya cerrado */ } };
  }, [ruta]);
  return (
    <div ref={caja} role="status" aria-label="Leyendo el documento"
      className="tw:relative tw:flex tw:h-full tw:min-h-0 tw:w-full tw:flex-1 tw:items-center tw:justify-center tw:overflow-hidden">
      <div className="tw:relative tw:overflow-hidden tw:rounded-[4px] tw:bg-white tw:shadow-[0_2px_10px_rgb(16_24_64/.18)]"
        style={medida ? { width: medida.w, height: medida.h } : { aspectRatio: '612 / 792', height: '100%', maxWidth: '100%' }}>
        <canvas ref={lienzo} className="tw:block" style={{ width: '100%', height: '100%' }} />
        {barrido && <span aria-hidden="true" className="esq-barrido tw:pointer-events-none tw:absolute tw:inset-x-0 tw:h-[3px] tw:bg-lav-edge tw:shadow-[0_0_18px_6px_rgb(109_91_208/.35)]" />}
      </div>
    </div>
  );
}

export default function Analizando() {
  const { archivo } = useEnvio();
  return (
    <Layout altoCompleto migas={false} titulo={<span id="workingTitle">{archivo ? `Analizando ${archivo.name}…` : 'Analizando documento…'}</span>} ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }}
      sobretitulo={archivo ? <span className="file-chip">{archivo.name}</span> : undefined} subtitulo="Leyendo el documento y buscando quién firma…">
      <div className="envio-cols" data-solo>
        <div className="envio-der">
          <HojaLeyendo ruta={archivo?.path} />
        </div>
      </div>
    </Layout>
  );
}
