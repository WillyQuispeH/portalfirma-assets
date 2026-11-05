// Gestión documental › Editor PDF: el documento activo con su barra de herramientas, las miniaturas, el escenario
// con las páginas y el panel derecho. El escenario (#edStage) lo maneja el motor (utils/editor-pdf/motor.ts):
// React lo deja vacío y le avisa cuando aparece. Los id (#edBody hijo, #edCanvasWrap, #edPageNum, #edFind,
// #edBusy…) y las clases ed-* los usan las pruebas, la Ayuda y styles.css.
import { useEffect, useRef, useState } from 'react';
import Ic from './Ic';
import Barra, { Ib } from './Barra';
import Lateral from './Lateral';
import Panel, { PestanasPanel } from './Panel';
import { tocar, useEditor } from '../../../../store/hooks/useEditor.hook';
import { clamp, esGrande, fmtMB } from '../../../../utils/editor-pdf/comun';
import { scannedPages } from '../../../../utils/editor-pdf/bloques';
import * as M from '../../../../utils/editor-pdf/motor';
import { openDialog } from './controlador';
import { irAGestionDocumental } from '../../../../utils/app';
import type { IDocumento } from '../../../../store/interfaces/editor.interface';

// Panel derecho: ancho ajustable (se recuerda en este equipo)
const PANEL_MIN = 220, PANEL_MAX = 620;
const anchoGuardado = () => { try { return Number(localStorage.getItem('pf.panelW')) || 0; } catch { return 0; } };

function Vacio() {
  return <div className="dropzone ed-empty"><div className="drop-icon"><Ic n="upload" t={44} /></div><h2>PortalFirma Asset</h2>
    <p className="muted">Arrastra aquí PDF, Word, Excel o imágenes, o ábrelos desde el menú Archivo.</p>
    <div className="row" style={{ justifyContent: 'center' }}><button className="primary" id="edOpenBtn" onClick={() => openDialog()}>Abrir…</button><button className="secondary" id="edHomeBtn" onClick={irAGestionDocumental}>Ir al inicio</button></div></div>;
}

// Número de página, tamaño y la búsqueda (⌘F)
function BarraPagina({ T }: { T: IDocumento }) {
  const [pn, setPn] = useState<string | null>(null); // lo que se escribe en el número de página (mientras tiene el foco)
  const v1 = T.vp1[T.current];
  const f = T.find;
  const fq = useRef<HTMLInputElement>(null); const timer = useRef(0);
  const cuenta = !f || !f.q ? '' : f.matches.length ? `${f.idx + 1} de ${f.matches.length}${f.searching ? '…' : ''}` : f.searching ? 'Buscando…' : 'Sin resultados';
  return <div className="ed-pagebar">
    <Ib id="edPrev" ic="chevL" title="Página anterior (←)" onClick={() => M.goto(T.current - 1)} />
    <input id="edPageNum" className="pagenum" title="Ir a la página" value={pn ?? String(T.current + 1)}
      onFocus={(e) => { setPn(String(T.current + 1)); e.target.select(); }} onBlur={() => setPn(null)} onChange={(e) => setPn(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') { const n = parseInt(pn || '', 10); if (n >= 1 && n <= T.count) M.goto(n - 1); e.currentTarget.blur(); } if (e.key === 'Escape') e.currentTarget.blur(); }} />
    <span id="edPageCount" className="muted">{v1 ? `de ${T.count}` : ''}</span>
    <Ib id="edNext" ic="chevR" title="Página siguiente (→)" onClick={() => M.goto(T.current + 1)} />
    <span className="muted small" id="edPageSize">{v1 ? `${Math.round(v1.width / 72 * 25.4)} × ${Math.round(v1.height / 72 * 25.4)} mm` + (esGrande(v1) ? ' · formato grande' : '') : ''}</span>
    <span className="muted small" id="edSize">{T.bytes ? `${T.count} pág. · ${fmtMB(T.bytes.length)}${T.dirty ? ' · sin guardar' : ''}` : ''}</span>
    <div className={'ed-find' + (T.findOpen ? '' : ' hidden')} id="edFind"><Ic n="search" t={15} />
      <input id="edFindQ" key={T.id} ref={fq} placeholder="Buscar en el documento" spellCheck={false} defaultValue={f?.q || ''}
        onInput={(e) => { const q = e.currentTarget.value; clearTimeout(timer.current); timer.current = window.setTimeout(() => M.runFind(q), 220); }}
        onKeyDown={(e) => { const q = e.currentTarget.value; if (e.key === 'Enter') { e.preventDefault(); if (M.ed().find?.q !== q) { clearTimeout(timer.current); M.runFind(q); } else M.findStep(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { e.preventDefault(); M.closeFind(); } }} />
      <span id="edFindCount" className={'muted small' + (f && f.q && !f.matches.length && !f.searching ? ' none' : '')}>{cuenta}</span>
      <Ib id="edFindPrev" ic="chevU" title="Anterior (⇧⌘G)" onClick={() => M.findStep(-1)} /><Ib id="edFindNext" ic="chevD" title="Siguiente (⌘G)" onClick={() => M.findStep(1)} /><Ib id="edFindX" ic="x" title="Cerrar (Esc)" onClick={M.closeFind} /></div>
  </div>;
}

export default function EditorPdf() {
  const { doc: T, ocupado } = useEditor();
  const [ancho, setAncho] = useState(anchoGuardado);
  const wrap = useRef<HTMLDivElement>(null);
  // al volver a la vista del editor, el aviso de «trabajando» flotante se oculta
  useEffect(() => { M.globalBusy(); });
  const ocupadoUi = <div className={'ed-busy' + (ocupado ? '' : ' hidden')} id="edBusy"><div className="spinner" /><span>{ocupado?.msg || ''}</span><div className={'ed-progress' + (ocupado?.pct == null ? ' hidden' : '')}><i style={{ width: Math.round((ocupado?.pct || 0) * 100) + '%' }} /></div></div>;
  if (!T.bytes) return <>{<Vacio />}{ocupadoUi}</>;
  const arrastrarBorde = (e: React.MouseEvent) => {
    e.preventDefault(); const der = document.getElementById('edPanelWrap')!.getBoundingClientRect().right; document.body.classList.add('resizing');
    let w = 0;
    const mv = (ev: MouseEvent) => { w = clamp(Math.round(der - ev.clientX), PANEL_MIN, PANEL_MAX); setAncho(w); };
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); document.body.classList.remove('resizing'); try { if (w) localStorage.setItem('pf.panelW', String(w)); } catch { /* sin almacenamiento */ } if (M.ed().pdf) M.renderPage(); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  const anchoOriginal = () => { try { localStorage.removeItem('pf.panelW'); } catch { /* sin almacenamiento */ } setAncho(0); setTimeout(() => { if (M.ed().pdf) M.renderPage(); }, 0); };
  return <>
    <Barra />
    <div className="ed-wrap" ref={wrap} style={ancho ? { gridTemplateColumns: `minmax(0,1fr) ${clamp(ancho, PANEL_MIN, PANEL_MAX)}px` } : undefined}>
      <div className="ed-main">
        <Lateral />
        <section className="ed-view" id="edCanvasWrap" onScroll={M.alDesplazar}>
          <BarraPagina T={T} />
          <div id="edNotice">{T.notice ? <div className="ed-banner"><span>{T.notice}</span><button className="ibtn" id="edNoticeX" onClick={() => { T.notice = null; tocar(); }}><Ic n="x" t={14} /></button></div> : null}</div>
          <div id="edBanner">{T.scanned ? <div className="ed-banner"><span>Esta página es una imagen (fotocopia o escaneo). Reconoce el texto para poder buscarlo y editarlo.</span>
            <span className="row-tight"><button className="secondary small" data-ocr="page" onClick={() => M.recognize([T.current])}>Reconocer esta página</button> <button className="glass-red" data-ocr="all" onClick={async () => M.recognize(await scannedPages(T))}><Ic n="scanText" t={16} /><span>Reconocer todo</span></button></span></div> : null}</div>
          <div id="edStage" ref={M.montarEscenario} />
        </section>
      </div>
      <aside className="ed-panel-wrap" id="edPanelWrap"><div className="ed-resizer" id="edResizer" title="Arrastra para cambiar el ancho del panel" onMouseDown={arrastrarBorde} onDoubleClick={anchoOriginal} /><PestanasPanel /><div className="ed-panel" id="edPanel"><Panel /></div></aside>
    </div>
    <button className="reading-exit" id="edReadExit" title="Salir de pantalla completa (Esc)" onClick={() => M.reading(false)}><Ic n="minimize" t={18} /><span>Salir</span></button>
    {ocupadoUi}
  </>;
}
