// El PDF de un documento que se va a enviar a firmar, con las firmas ya ubicadas: todas las hojas se ven una bajo otra (se recorren con
// la rueda) y cada firmante ya tiene su recuadro puesto en el PDF (en la hoja donde la IA encontró su línea de firma, si no, en la última);
// se arrastra a donde firma, también de una hoja a otra, como en Portalfirma. El color de cada recuadro es el del círculo de ese firmante en
// la lista del formulario (COLORES). Sin saber quién firma no hay qué ubicar: se ve el PDF solo.
// Dos formas de usarlo: con `plantilla`, las posiciones se guardan en el servidor (PUT /v1/firmas-posiciones/:plantilla) y el próximo envío
// de esa plantilla las usa (ventanas de los documentos de Asset); con `alCambiar`, las posiciones se entregan a quien lo usa y viajan con el
// envío (editor «Enviar a firmar»). Al cerrar se borran (null). Coordenadas: página desde 1 y esquina inferior izquierda del recuadro
// (170 × 90 puntos), con origen abajo a la izquierda, igual que Portalfirma. Un firmante pide ver su recuadro con el evento «pcf-ir» (índice).
// Los id (#pcfHoja, #pcfScroll, [data-pcf-hoja], [data-pcf-firma]) los usan las pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js no tiene tipos en la app */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as PointerEventR, type RefObject } from 'react';
import Boton from '../../ui/Boton';
import VisorPdf from './VisorPdf';
import { api } from '../../../utils/api';
import { cx } from '../../../utils/cx';

export interface IFirmanteDoc { nombre: string; rol?: string; /** la página donde está su línea de firma, si se sabe (desde 1) */ pagina?: number }
export interface IPos { pagina: number; x: number; y: number }

/** tamaño del recuadro de cada firma, en puntos del PDF */
const BW = 170;
const BH = 90;
const HUECO = 16;   // separación entre hojas, en px
const MARGEN = 6;   // aire alrededor de cada hoja dentro del visor, en px
export const COLORES = [
  { fondo: 'rgba(255, 107, 107, 0.35)', borde: '#E04F4F', claro: '#FF9A9A' },
  { fondo: 'rgba(69, 183, 209, 0.35)', borde: '#2E95B0', claro: '#7ED3E6' },
  { fondo: 'rgba(247, 180, 57, 0.35)', borde: '#C98A12', claro: '#FBCF72' },
  { fondo: 'rgba(82, 190, 128, 0.35)', borde: '#2F9B5F', claro: '#8FDDB1' },
  { fondo: 'rgba(187, 143, 206, 0.35)', borde: '#9262AE', claro: '#D3B3E3' },
  { fondo: 'rgba(133, 193, 226, 0.35)', borde: '#4F93BF', claro: '#A9D2EC' },
];
/** el degradado del círculo numerado de cada firmante: el mismo color de su recuadro en el PDF */
export const degradadoFirmante = (i: number) => `linear-gradient(135deg, ${COLORES[i % COLORES.length].claro}, ${COLORES[i % COLORES.length].borde})`;

const redondear = (n: number) => Math.round(n);
const entre = (n: number, a: number, b: number) => Math.max(a, Math.min(n, Math.max(a, b)));

export default function PdfConFirmas({ pdf, firmantes, plantilla, alCambiar, alto, paginaInicial, sinFirmas, posicionesIniciales }: { pdf: string; /** las firmas que ya estaban ubicadas (una por firmante) */ posicionesIniciales?: IPos[]; firmantes?: IFirmanteDoc[]; /** no mostrar los recuadros ni entregar posiciones (con una página de firmas extra no hay espacio en el documento); al volver se recuperan donde estaban */ sinFirmas?: boolean; plantilla?: string; alCambiar?: (pos: IPos[] | null) => void; /** la hoja con que abre (por defecto, la de la firma del primero) */ paginaInicial?: number; /** alto del visor (CSS); por defecto cabe dentro de una ventana */ alto?: string }) {
  const lista = useMemo(() => (firmantes || []).filter((f) => f && f.nombre), [firmantes]);
  const quitar = useCallback(() => { if (plantilla) api('firPosicionesQuitar', plantilla).catch(() => null); alCambiar?.(null); }, [plantilla, alCambiar]);
  // al cerrar la ventana las posiciones pendientes se borran (si ya se envió, no queda nada que borrar)
  useEffect(() => () => { quitar(); }, [quitar]);
  return lista.length ? <UbicadorFirmas pdf={pdf} firmantes={lista} plantilla={plantilla} alCambiar={alCambiar} alto={alto} paginaInicial={paginaInicial} sinFirmas={sinFirmas} posicionesIniciales={posicionesIniciales} /> : <VisorPdf base64={pdf} />;
}

/** una hoja del PDF: se dibuja cuando se acerca a la zona visible */
function Hoja({ doc, n, w, h, escala, raiz }: { doc: any; n: number; w: number; h: number; escala: number; raiz: RefObject<HTMLDivElement | null> }) {
  const caja = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [cerca, setCerca] = useState(false);
  useEffect(() => {
    const el = caja.current; if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setCerca(true); return undefined; }
    const o = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setCerca(true); }, { root: raiz.current, rootMargin: '600px 0px' });
    o.observe(el);
    return () => o.disconnect();
  }, [raiz]);
  // la hoja se vuelve a dibujar cuando la escala se asienta (mientras el visor cambia de tamaño se estira la imagen que ya hay)
  const [escalaDibujo, setEscalaDibujo] = useState(escala);
  useEffect(() => { const t = setTimeout(() => setEscalaDibujo(escala), 160); return () => clearTimeout(t); }, [escala]);
  useEffect(() => {
    if (!cerca || !lienzo.current) return undefined;
    const c = lienzo.current; let tarea: any = null; let vivo = true;
    (async () => {
      const page = await doc.getPage(n);
      const dpr = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale: escalaDibujo * dpr });
      if (!vivo) return;
      c.width = vp.width; c.height = vp.height;
      tarea = page.render({ canvasContext: c.getContext('2d'), viewport: vp });
      await tarea.promise;
    })().catch(() => { /* dibujo cancelado al cambiar de tamaño */ });
    return () => { vivo = false; try { tarea?.cancel(); } catch { /* ya terminó */ } };
  }, [cerca, doc, n, escalaDibujo]);
  return (
    <div ref={caja} data-pcf-hoja={n} className="tw:relative tw:bg-white tw:shadow-[0_2px_10px_rgb(16_24_64/.18)]" style={{ width: Math.floor(w * escala), height: Math.floor(h * escala) }}>
      <canvas ref={lienzo} className="tw:block" style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

function UbicadorFirmas({ pdf, firmantes, plantilla, alCambiar, alto, paginaInicial, sinFirmas, posicionesIniciales }: { sinFirmas?: boolean; posicionesIniciales?: IPos[]; pdf: string; firmantes: IFirmanteDoc[]; plantilla?: string; alCambiar?: (pos: IPos[] | null) => void; alto?: string; paginaInicial?: number }) {
  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState('');
  const [paginas, setPaginas] = useState<{ w: number; h: number }[]>([]);
  const [actual, setActual] = useState(1);
  const [pos, setPos] = useState<IPos[]>([]);
  const [vista, setVista] = useState({ w: 520, h: 640 });   // lo que mide el visor por dentro
  const scroll = useRef<HTMLDivElement>(null);
  const contenido = useRef<HTMLDivElement>(null);
  const alInicio = useRef<number | null>(null);   // la hoja a la que se baja al abrir (la del primer firmante)
  const arrastre = useRef<{ i: number; dx: number; dy: number; x: number; y: number; vel: number; reloj: any } | null>(null);

  // abre el PDF y mide el tamaño de cada hoja (en puntos)
  useEffect(() => {
    let vivo = true; let d: any = null;
    setDoc(null); setError('');
    (async () => {
      try {
        const bin = atob(pdf || ''); const datos = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) datos[i] = bin.charCodeAt(i);
        d = await (window as any).pdfjsLib.getDocument({ data: datos, isEvalSupported: false, standardFontDataUrl: 'vendor/standard_fonts/', cMapUrl: 'vendor/cmaps/', cMapPacked: true }).promise;
        const tam: { w: number; h: number }[] = [];
        for (let n = 1; n <= d.numPages; n++) { const v = (await d.getPage(n)).getViewport({ scale: 1 }); tam.push({ w: v.width, h: v.height }); }
        if (!vivo) return;
        const ult = tam.length;
        const hojaDe = (f?: IFirmanteDoc) => (f?.pagina && f.pagina >= 1 && f.pagina <= ult ? f.pagina : ult);   // donde está su firma, si se sabe; si no, la última
        // todos los recuadros ya puestos: en la hoja de cada firma (de a dos por fila), o donde estaban si el PDF solo se actualizó
        setPos((previas) => firmantes.map((f, i) => {
          const p = previas[i] ?? (posicionesIniciales?.length === firmantes.length ? posicionesIniciales[i] : undefined);
          if (p) return { ...p, pagina: Math.min(p.pagina, ult) };
          const pg = hojaDe(f);
          const antes = firmantes.slice(0, i).filter((g) => hojaDe(g) === pg).length;
          return { pagina: pg, x: 60 + (antes % 2) * 250, y: 70 + Math.floor(antes / 2) * 110 };
        }));
        if (alInicio.current === null) alInicio.current = paginaInicial && paginaInicial >= 1 && paginaInicial <= ult ? paginaInicial : hojaDe(firmantes[0]);
        setDoc(d); setPaginas(tam);
      } catch (e) { if (vivo) setError((e as Error).message || 'No se pudo abrir el PDF.'); }
    })();
    return () => { vivo = false; try { d?.destroy?.(); } catch { /* ya cerrado */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia el PDF
  }, [pdf]);

  // si cambia la cantidad de firmantes (se agrega o se quita uno), los recuadros se ajustan: se conservan los de siempre y el nuevo aparece en la hoja que se ve
  const actualRef = useRef(1); actualRef.current = actual;
  useEffect(() => {
    if (!paginas.length) return;
    setPos((l) => {
      if (l.length === firmantes.length) return l;
      const aqui = Math.min(actualRef.current, paginas.length);
      return firmantes.map((_, i) => l[i] ?? { pagina: aqui, x: 60 + (i % 2) * 250, y: 70 + Math.floor(i / 2) * 110 });
    });
  }, [firmantes.length, paginas.length]); // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando cambia la cantidad

  // el tamaño del visor: cada hoja se ve ENTERA (cabe en el ancho y en el alto), centrada
  useEffect(() => {
    const el = scroll.current; if (!el) return undefined;
    const medir = () => setVista({ w: Math.max(240, el.clientWidth), h: Math.max(240, el.clientHeight) });
    medir();
    const o = new ResizeObserver(medir); o.observe(el);
    return () => o.disconnect();
  }, []);

  // la escala de cada hoja (la mayor con que se ve entera), su posición vertical y su margen izquierdo para quedar centrada
  const geo = useMemo(() => {
    let y = 0;
    return paginas.map((p) => {
      const esc = Math.min((vista.w - 2 * MARGEN) / p.w, (vista.h - 2 * MARGEN) / p.h);
      const h = Math.floor(p.h * esc); const w = Math.floor(p.w * esc);
      const g = { esc, top: y, h, left: Math.floor((vista.w - w) / 2) }; y += h + HUECO; return g;
    });
  }, [paginas, vista]);
  const alturaTotal = geo.length ? geo[geo.length - 1].top + geo[geo.length - 1].h : 0;

  // deja la hoja n en el centro del visor
  const centrar = (n: number, suave = false) => {
    const g = geo[n - 1]; const el = scroll.current; if (!g || !el) return;
    el.scrollTo({ top: Math.max(0, g.top - (el.clientHeight - g.h) / 2), behavior: suave ? 'smooth' : 'auto' }); setActual(n);
  };

  // al abrir se baja a la hoja donde está la firma del primero
  useEffect(() => {
    if (!geo.length || alInicio.current === null || !scroll.current) return;
    const n = Math.min(alInicio.current, geo.length); alInicio.current = null;
    centrar(n);
  }, [geo]);

  // la hoja que se ve al medio del visor
  const alDesplazar = () => {
    const el = scroll.current; if (!el || !geo.length) return;
    const m = el.scrollTop + el.clientHeight / 2; let n = 1;
    for (let k = 0; k < geo.length; k++) if (m >= geo[k].top) n = k + 1;
    setActual((a) => (a === n ? a : n));
  };

  // cada cambio de posición se guarda en el servidor (con una pausa corta para no mandar uno por píxel)
  useEffect(() => {
    if (!pos.length) return undefined;
    const lista = pos.map((p) => ({ pagina: p.pagina, x: redondear(p.x), y: redondear(p.y) }));
    if (alCambiar && pos.length === firmantes.length) alCambiar(sinFirmas ? null : lista);   // el editor se las lleva con el envío (sin firmas en el PDF, no lleva ninguna)
    if (!plantilla) return undefined;
    const t = setTimeout(() => { api('firPosiciones', plantilla, lista).catch(() => null); }, 250);
    return () => clearTimeout(t);
  }, [pos, plantilla, sinFirmas]); // eslint-disable-line react-hooks/exhaustive-deps -- alCambiar y la cantidad de firmantes no deben repetir el aviso

  // coloca el recuadro que se arrastra donde está el puntero: la hoja es la que queda bajo su centro, de cualquiera del documento
  const colocar = () => {
    const a = arrastre.current; const cont = contenido.current; if (!a || !cont || !geo.length) return;
    const r = cont.getBoundingClientRect();
    const izq = a.x - a.dx - r.left; const arriba = a.y - a.dy - r.top;   // esquina superior izquierda del recuadro, dentro del visor
    setPos((l) => l.map((p, k) => {
      if (k !== a.i) return p;
      const centro = arriba + (BH * geo[p.pagina - 1].esc) / 2;
      let n = 0;
      for (let q = 0; q < geo.length; q++) if (centro >= geo[q].top - HUECO / 2) n = q;
      const g = geo[n]; const pg = paginas[n];
      return { pagina: n + 1, x: entre((izq - g.left) / g.esc, 0, pg.w - BW), y: entre(pg.h - (arriba - g.top) / g.esc - BH, 0, pg.h - BH) };
    }));
  };
  const alBajar = (e: PointerEventR<HTMLDivElement>, i: number) => {
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    const b = e.currentTarget.getBoundingClientRect();
    const a = { i, dx: e.clientX - b.left, dy: e.clientY - b.top, x: e.clientX, y: e.clientY, vel: 0, reloj: null as any };
    // al llegar al borde del visor, este se desplaza solo para poder llevar la firma a otra hoja
    a.reloj = setInterval(() => { const el = scroll.current; if (!el || !a.vel) return; el.scrollTop += a.vel; colocar(); }, 16);
    arrastre.current = a;
  };
  const alMover = (e: PointerEventR<HTMLDivElement>) => {
    const a = arrastre.current; const el = scroll.current; if (!a || !el) return;
    a.x = e.clientX; a.y = e.clientY;
    const r = el.getBoundingClientRect();
    a.vel = a.y < r.top + 40 ? -Math.min(24, (r.top + 40 - a.y) / 3 + 2) : a.y > r.bottom - 40 ? Math.min(24, (a.y - (r.bottom - 40)) / 3 + 2) : 0;
    colocar();
  };
  const alSoltar = () => { if (arrastre.current) clearInterval(arrastre.current.reloj); arrastre.current = null; };
  useEffect(() => () => { if (arrastre.current) clearInterval(arrastre.current.reloj); }, []);

  // lleva la vista a la hoja del recuadro de un firmante
  const ir = (i: number) => { const p = pos[i]; if (p) centrar(p.pagina, true); };

  // el orden de los firmantes cambió (se arrastró uno o se quitó): su recuadro se va con su persona
  useEffect(() => {
    const oo = (e: Event) => {
      const d = (e as CustomEvent).detail as { tipo: 'mover'; de: number; a: number } | { tipo: 'quitar'; i: number };
      setPos((l) => {
        const n = [...l];
        if (d.tipo === 'quitar') { n.splice(d.i, 1); return n; }
        const [x] = n.splice(d.de, 1); if (x) n.splice(d.a, 0, x); return n;
      });
    };
    window.addEventListener('pcf-orden', oo);
    return () => window.removeEventListener('pcf-orden', oo);
  }, []);

  // el círculo de un firmante en la lista del formulario pide ver su recuadro
  useEffect(() => {
    const oir = (e: Event) => ir(Number((e as CustomEvent).detail));
    window.addEventListener('pcf-ir', oir);
    return () => window.removeEventListener('pcf-ir', oir);
  });

  if (error) return <p className="tw:m-0 tw:text-[13px] tw:text-red-softink" role="alert">{error}</p>;
  const listo = !!doc && geo.length > 0 && pos.length === firmantes.length;

  const llenar = alto === '100%';
  return (
    <div className={cx('tw:flex tw:min-h-0 tw:flex-col tw:gap-2', llenar && 'tw:h-full tw:flex-1')}>
      <div className={cx('tw:relative tw:min-h-0', llenar && 'tw:flex-1')}>
        <div id="pcfScroll" ref={scroll} onScroll={alDesplazar} className={cx('tw:relative tw:overflow-y-auto tw:overflow-x-hidden', llenar && 'tw:h-full')}
          style={llenar ? { minHeight: 320, scrollSnapType: 'y proximity' } : { height: alto || 'calc(100vh - 400px)', minHeight: 320, scrollSnapType: 'y proximity' }}>
          {!listo ? <div className="tw:grid tw:h-full tw:place-items-center"><div className="spinner" /></div> : (
            <div ref={contenido} className="tw:relative" style={{ width: vista.w, height: alturaTotal }}>
              {paginas.map((p, k) => (
                <div key={k} className="tw:absolute" style={{ top: geo[k].top, left: geo[k].left, scrollSnapAlign: 'center' }}>
                  <Hoja doc={doc} n={k + 1} w={p.w} h={p.h} escala={geo[k].esc} raiz={scroll} />
                </div>
              ))}
              {!sinFirmas && pos.map((p, i) => {
                const g = geo[p.pagina - 1]; const pg = paginas[p.pagina - 1]; if (!g || !pg) return null;
                const c = COLORES[i % COLORES.length];
                return (
                  <div key={i} data-pcf-firma={i} data-pcf-pagina={p.pagina} role="button" tabIndex={0} aria-label={`Firma de ${firmantes[i].nombre}: arrástrala al lugar donde firma`}
                    onPointerDown={(e) => alBajar(e, i)} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar}
                    className="tw:absolute tw:z-10 tw:flex tw:cursor-grab tw:touch-none tw:select-none tw:flex-col tw:justify-between tw:overflow-hidden tw:rounded-[6px] tw:p-1 active:tw:cursor-grabbing"
                    style={{ left: g.left + p.x * g.esc, top: g.top + (pg.h - p.y - BH) * g.esc, width: BW * g.esc, height: BH * g.esc, background: c.fondo, border: `2px solid ${c.borde}` }}>
                    <span className="tw:inline-grid tw:size-5 tw:place-items-center tw:rounded-full tw:text-[11px] tw:font-bold tw:text-white" style={{ background: degradadoFirmante(i) }}>{i + 1}</span>
                    <span className="tw:truncate tw:text-[11px] tw:font-semibold" style={{ fontSize: Math.max(9, 11 * g.esc), color: c.borde }}>{firmantes[i].nombre}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {listo && paginas.length > 1 && (
          <div className="tw:pointer-events-none tw:absolute tw:inset-x-0 tw:bottom-2 tw:flex tw:justify-center">
            <span id="pcfHoja" className="tw:pointer-events-auto tw:flex tw:items-center tw:gap-1 tw:rounded-control tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:p-1 tw:text-[12.5px] tw:font-semibold tw:shadow-[0_4px_12px_rgb(16_24_64/.2)]">
              <Boton variante="fantasma" tamano="sm" icono="chevL" aria-label="Hoja anterior" title="Hoja anterior" disabled={actual <= 1} onClick={() => centrar(actual - 1, true)} />
              <span className="tw:min-w-[84px] tw:text-center">Hoja {actual} de {paginas.length}</span>
              <Boton variante="fantasma" tamano="sm" icono="chevR" aria-label="Hoja siguiente" title="Hoja siguiente" disabled={actual >= paginas.length} onClick={() => centrar(actual + 1, true)} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
