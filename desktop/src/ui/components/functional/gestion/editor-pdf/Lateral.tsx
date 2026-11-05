// Columna izquierda del editor: miniaturas de las páginas (ir, elegir varias, arrastrar para reordenar, rotar,
// insertar, extraer, dividir, aplanar, eliminar) y los marcadores (índice) del PDF.
/* eslint-disable @typescript-eslint/no-explicit-any -- marcadores de pdf.js */
import { useEffect, useRef, useState } from 'react';
import Ic from './Ic';
import { Ib } from './Barra';
import { tocar, useEditor } from '../../../../store/hooks/useEditor.hook';
import * as M from '../../../../utils/editor-pdf/motor';
import { deletePages, extractToFile, flattenPages, insertBlank, movePage, rotate, splitDialog } from './controlador';
import type { IDocumento } from '../../../../store/interfaces/editor.interface';

// Una miniatura: se dibuja cuando aparece en la columna
function Miniatura({ T, i, raiz, clase, alClic }: { T: IDocumento; i: number; raiz: HTMLElement | null; clase: string; alClic: (e: React.MouseEvent) => void }) {
  const caja = useRef<HTMLDivElement>(null); const lienzo = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = caja.current; if (!el) return;
    let vivo = true;
    const dibujar = async () => {
      if (!T.pdf || i >= T.count) return;
      let page; try { page = await T.pdf.getPage(i + 1); } catch { return; }
      if (!vivo) return;
      const v = page.getViewport({ scale: 1 }); const s = 110 / Math.max(v.width, v.height); const vp = page.getViewport({ scale: s * 2 });
      const c = lienzo.current; if (!c) return;
      c.width = vp.width; c.height = vp.height; c.style.width = vp.width / 2 + 'px'; c.style.height = vp.height / 2 + 'px';
      try { await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; } catch { /* página ilegible */ }
    };
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { io.disconnect(); dibujar(); } }), { root: raiz });
    io.observe(el);
    return () => { vivo = false; io.disconnect(); };
  }, [T, T.rev, i, raiz]);
  return <div ref={caja} className={'ed-thumb' + clase} data-i={i} draggable onClick={alClic}><canvas ref={lienzo} /><span>{i + 1}</span></div>;
}

function Miniaturas({ T }: { T: IDocumento }) {
  const host = useRef<HTMLDivElement>(null);
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null);
  useEffect(() => setRaiz(host.current), []);
  const [drop, setDrop] = useState<number | null>(null);
  const desde = useRef<number | null>(null);
  // la miniatura de la página actual queda a la vista
  useEffect(() => { host.current?.querySelector(`.ed-thumb[data-i="${T.current}"]`)?.scrollIntoView({ block: 'nearest' }); }, [T.current, T.id]);
  const clic = (i: number) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) { if (T.selected.has(i)) T.selected.delete(i); else T.selected.add(i); }
    else if (e.shiftKey) { const a = Math.min(i, T.current), b = Math.max(i, T.current); for (let k = a; k <= b; k++) T.selected.add(k); }
    else { T.selected.clear(); M.goto(i); }
    tocar();
  };
  const thumbDe = (e: React.DragEvent) => (e.target as HTMLElement).closest('.ed-thumb') as HTMLElement | null;
  return <div className="ed-thumbs" id="edThumbs" ref={host}
    onDragStart={(e) => { const t = thumbDe(e); if (t) { desde.current = Number(t.dataset.i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-pf-page', String(desde.current)); } }}
    onDragOver={(e) => { if (desde.current == null) return; e.preventDefault(); e.stopPropagation(); const t = thumbDe(e); setDrop(t ? Number(t.dataset.i) : null); }}
    onDrop={(e) => {
      if (desde.current == null) return; e.preventDefault(); e.stopPropagation();
      const t = thumbDe(e); const to = t ? Number(t.dataset.i) + (e.nativeEvent.offsetY > t.clientHeight / 2 ? 1 : 0) : T.count;
      const from = desde.current; desde.current = null; setDrop(null); movePage(from, to);
    }}
    onDragEnd={() => { desde.current = null; setDrop(null); }}>
    {Array.from({ length: T.count }, (_, i) => <Miniatura key={`${T.id}-${T.rev}-${i}`} T={T} i={i} raiz={raiz}
      clase={(i === T.current ? ' current' : '') + (T.selected.has(i) ? ' sel' : '') + (drop === i ? ' drop' : '')} alClic={clic(i)} />)}
  </div>;
}

// Marcadores (índice del PDF)
function Marcadores({ T }: { T: IDocumento }) {
  useEffect(() => {
    if (T.outline !== undefined) return;
    (async () => { try { T.outline = (await T.pdf.getOutline()) || []; } catch { T.outline = []; } tocar(); })();
  }, [T, T.outline]);
  if (T.outline === undefined) return <p className="muted small" style={{ padding: 10 }}>Cargando…</p>;
  if (!T.outline.length) return <div className="ol-empty"><Ic n="bookmark" t={28} /><p>Este documento no tiene marcadores.</p><p className="muted small">Los PDF exportados desde Word con títulos suelen traer un índice aquí.</p></div>;
  const ir = (o: any) => (e: React.MouseEvent) => { e.preventDefault(); if (o.dest) M.gotoDest(o.dest); else if (o.url) M.openLink(o.url); };
  const arbol = (items: any[], depth: number): React.ReactNode => items.map((o, n) => {
    const label = <a href="#" className={'ol-item' + (o.bold ? ' b' : '') + (o.italic ? ' it' : '')} title={o.title} onClick={ir(o)}>{o.title || '(sin título)'}</a>;
    return o.items?.length ? <details key={n} open={depth < 1}><summary>{label}</summary><div className="ol-kids">{arbol(o.items, depth + 1)}</div></details> : <div key={n} className="ol-leaf">{label}</div>;
  });
  return <div className="ol">{arbol(T.outline, 0)}</div>;
}

export default function Lateral() {
  const { doc: T } = useEditor();
  const lado = (s: 'pages' | 'outline') => { T.side = s; tocar(); };
  const n = T.selected.size;
  return <aside className="ed-side">
    <div className="side-tabs"><button data-side="pages" className={T.side === 'pages' ? 'on' : ''} title="Miniaturas de páginas" onClick={() => lado('pages')}><Ic n="pages" t={15} /><span>Páginas</span></button><button data-side="outline" className={T.side === 'outline' ? 'on' : ''} title="Marcadores e índice del documento" onClick={() => lado('outline')}><Ic n="bookmark" t={15} /><span>Marcadores</span></button></div>
    <div className={'side-pages' + (T.side !== 'pages' ? ' hidden' : '')}>
      <div className="ed-pageops">
        <Ib id="edRotL" ic="rotateL" title="Rotar a la izquierda" onClick={() => rotate(-90)} /><Ib id="edRotR" ic="rotateR" title="Rotar a la derecha" onClick={() => rotate(90)} /><Ib id="edIns" ic="filePlus" title="Insertar página en blanco después" onClick={insertBlank} />
        <Ib id="edExt" ic="fileOut" title="Extraer: guardar las páginas seleccionadas como PDF" onClick={extractToFile} /><Ib id="edSplit" ic="scissors" title="Dividir en varios PDF" onClick={splitDialog} /><Ib id="edFlat" ic="layers" title="Aplanar: convertir la página en imagen (elimina texto tapado)" onClick={flattenPages} />
        <Ib id="edDel" ic="trash" title={n > 1 ? `Eliminar ${n} páginas seleccionadas` : 'Eliminar páginas seleccionadas'} cls="danger" onClick={deletePages} />
      </div>
      <p className="muted small ed-hint">Clic: ir · ⌘/Ctrl+clic: seleccionar varias · arrastra para reordenar</p>
      <Miniaturas T={T} />
    </div>
    <div className={'side-outline' + (T.side !== 'outline' ? ' hidden' : '')} id="edOutline">{T.side === 'outline' ? <Marcadores T={T} /> : null}</div>
  </aside>;
}
