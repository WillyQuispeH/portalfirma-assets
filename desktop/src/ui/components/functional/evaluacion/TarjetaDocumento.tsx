// Un documento que mandó el arrendatario o un aval por WhatsApp, en una card:
//  · izquierda: vista previa (imagen, o la primera página si es PDF); al pasar el mouse se agranda, y al hacer clic se abre en un modal;
//  · derecha: el tipo (que el corredor puede cambiar) y el resumen que leyó la IA, con el alto máximo de la vista previa; si no cabe,
//    «…ver más» abre el mismo modal.
// El documento NUNCA saca al corredor de la app: el proceso principal lo baja del servidor y llega aquí en base64 (evaluacionService.archivoBytes).
// Los data-* ([data-ev-archivo-fila], [data-ev-clase], [data-ev-resumen], [data-ev-miniatura], [data-ev-vermas]) los usan las pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js no tiene tipos en la app */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Badge from '../../ui/Badge';
import Boton from '../../ui/Boton';
import Card from '../../ui/Card';
import Select from '../../ui/Select';
import Modal from '../../ui/Modal';
import VisorPdf from '../agenda/VisorPdf';
import { evaluacionService } from '../../../store/services/evaluacion.service';
import type { IEvalArchivo } from '../../../store/interfaces/evaluacion.interface';

export interface IDocumentoBajado { base64: string; tipo: string; nombre: string; /** imagen lista para mostrar (la imagen misma, o la 1.ª página del PDF) */ vista: string }
const cache = new Map<string, Promise<IDocumentoBajado>>();

/** baja el documento (una sola vez por archivo) y arma su vista previa */
function bajar(negocioId: string, personaId: string, n: number): Promise<IDocumentoBajado> {
  const k = `${negocioId}|${personaId}|${n}`;
  let p = cache.get(k);
  if (!p) {
    p = (async () => {
      const d = await evaluacionService.archivoBytes(negocioId, personaId, n);
      let vista = '';
      if (d.tipo === 'application/pdf') {
        try {
          const bin = atob(d.base64); const datos = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) datos[i] = bin.charCodeAt(i);
          const doc = await (window as any).pdfjsLib.getDocument({ data: datos, isEvalSupported: false, standardFontDataUrl: 'vendor/standard_fonts/', cMapUrl: 'vendor/cmaps/', cMapPacked: true }).promise;
          const page = await doc.getPage(1); const vp0 = page.getViewport({ scale: 1 }); const vp = page.getViewport({ scale: 520 / vp0.width });
          const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          vista = c.toDataURL('image/jpeg', 0.82); doc.destroy?.();
        } catch { vista = ''; }
      } else vista = `data:${d.tipo};base64,${d.base64}`;
      return { ...d, vista };
    })();
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return p;
}
export function useDocumento(negocioId: string, personaId: string, n: number) {
  const [doc, setDoc] = useState<IDocumentoBajado | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let vivo = true; setDoc(null); setError('');
    bajar(negocioId, personaId, n).then((d) => vivo && setDoc(d)).catch((e) => vivo && setError(e instanceof Error ? e.message : String(e)));
    return () => { vivo = false; };
  }, [negocioId, personaId, n]);
  return { doc, error };
}

const ALTO = 136;   // alto de la vista previa (y tope del alto del resumen)
const ANCHO_GRANDE = 340;

/** la vista previa agrandada, junto al puntero (fixed: no la recorta el desplazamiento de la ventana) */
function VistaAmpliada({ src, ancla }: { src: string; ancla: DOMRect }) {
  const alto = Math.min(window.innerHeight - 24, 460);
  const aDerecha = ancla.right + 12 + ANCHO_GRANDE <= window.innerWidth;
  const left = aDerecha ? ancla.right + 12 : Math.max(8, ancla.left - 12 - ANCHO_GRANDE);
  const top = Math.min(Math.max(8, ancla.top - 20), window.innerHeight - alto - 8);
  return createPortal(
    <div data-ev-ampliada className="tw:fixed tw:z-[90] tw:pointer-events-none tw:rounded-card tw:border tw:border-solid tw:border-edge tw:bg-white tw:shadow-xl tw:p-1.5" style={{ left, top, width: ANCHO_GRANDE }}>
      <img src={src} alt="" className="tw:block tw:w-full tw:rounded tw:object-contain" style={{ maxHeight: alto }} />
    </div>,
    document.body,
  );
}

export function TarjetaDocumento({ negocioId, personaId, a, opciones, bloqueado, alCambiarClase, alAbrir }: {
  negocioId: string; personaId: string; a: IEvalArchivo; opciones: [string, string][]; bloqueado: boolean;
  alCambiarClase: (clase: string) => void; alAbrir: () => void;
}) {
  const { doc, error } = useDocumento(negocioId, personaId, a.n);
  const [ancla, setAncla] = useState<DOMRect | null>(null);
  const resumen = useRef<HTMLParagraphElement>(null);
  const [recortado, setRecortado] = useState(false);
  const texto = a.legible ? (a.resumen || 'Sin resumen.') : 'No se lee bien: se le pidió de nuevo.';
  const alertas = a.alertas.length ? ` ⚠ ${a.alertas.join(' · ')}` : '';
  useLayoutEffect(() => { const e = resumen.current; if (e) setRecortado(e.scrollHeight > e.clientHeight + 1); }, [texto, alertas]);

  return (
    <Card relleno={false} className="tw:shrink-0">
      <div data-ev-archivo-fila={a.n} className="tw:flex tw:gap-3 tw:p-3">
        <button type="button" data-ev-miniatura={a.n} aria-label="Abrir el documento" onClick={alAbrir}
          onMouseEnter={(e) => doc?.vista && setAncla(e.currentTarget.getBoundingClientRect())} onMouseLeave={() => setAncla(null)}
          className="tw:flex-none tw:grid tw:place-items-center tw:w-28 tw:rounded-control tw:border tw:border-solid tw:border-edge tw:bg-sunken tw:p-0 tw:overflow-hidden tw:cursor-zoom-in" style={{ height: ALTO }}>
          {doc?.vista ? <img src={doc.vista} alt="" className="tw:w-full tw:h-full tw:object-cover tw:object-top" />
            : error ? <span className="tw:px-2 tw:text-[11px] tw:text-muted">No se pudo cargar</span>
              : doc ? <span className="tw:px-2 tw:text-[11px] tw:text-muted">PDF</span> : <div className="spinner" />}
        </button>
        {ancla && doc?.vista && <VistaAmpliada src={doc.vista} ancla={ancla} />}

        <div className="tw:min-w-0 tw:flex-1 tw:flex tw:flex-col tw:gap-1.5" style={{ maxHeight: ALTO }}>
          <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap">
            <div className="tw:min-w-0 tw:flex-1 tw:max-w-64">
              <Select aria-label={`Tipo del documento ${a.n}`} data-ev-clase={a.n} opciones={opciones} value={a.clase} disabled={bloqueado} onChange={(e) => alCambiarClase(e.target.value)} />
            </div>
            {a.claseManual && <Badge tono="gris">Asignado por ti</Badge>}
          </div>
          <p ref={resumen} data-ev-resumen={a.n} className="tw:m-0 tw:min-h-0 tw:flex-1 tw:overflow-hidden tw:text-[13px] tw:leading-snug tw:text-muted">{texto}{alertas}</p>
          {recortado && <div className="tw:flex-none"><button type="button" data-ev-vermas={a.n} onClick={alAbrir} className="tw:bg-transparent tw:border-0 tw:p-0 tw:text-[13px] tw:font-semibold tw:text-lav-ink tw:underline tw:cursor-pointer">…ver más</button></div>}
        </div>
      </div>
    </Card>
  );
}

/** el documento completo en un modal (por encima de la ventana de la evaluación): PDF página por página, o la imagen */
export function VisorDocumento({ negocioId, personaId, n, titulo, resumen, alCerrar }: {
  negocioId: string; personaId: string; n: number; titulo: string; resumen: string; alCerrar: () => void;
}) {
  const { doc, error } = useDocumento(negocioId, personaId, n);
  return (
    <Modal abierto onCerrar={alCerrar} titulo={titulo} icono="file" tamano="xl" clave="modal-129"
      pie={<Boton id="evVisorCerrar" variante="secundario" onClick={alCerrar}>Cerrar</Boton>}>
      <div id="evVisor" className="tw:flex tw:flex-col tw:gap-3">
        {error ? <p className="tw:m-0 tw:text-sm tw:text-muted">{error}</p>
          : !doc ? <div className="tw:grid tw:place-items-center tw:min-h-[240px]"><div className="spinner" /></div>
            : doc.tipo === 'application/pdf' ? <VisorPdf base64={doc.base64} />
              : <div className="tw:grid tw:place-items-center tw:rounded-icono tw:bg-sunken tw:p-3"><img src={doc.vista} alt={titulo} className="tw:max-w-full tw:max-h-[62vh] tw:object-contain tw:rounded" /></div>}
        {resumen && <p data-ev-visor-resumen className="tw:m-0 tw:text-[13px] tw:text-muted tw:whitespace-pre-line"><b className="tw:text-text">Lo que Asset leyó: </b>{resumen}</p>}
      </div>
    </Modal>
  );
}
