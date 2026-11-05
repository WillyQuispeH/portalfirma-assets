// Panel derecho del editor: las pestañas (Edición · Asistente · Plantilla) y su contenido: formato del texto,
// modelos de texto, objetos y OCR; el diseño o el formulario de una plantilla; o el Asistente legal.
// Los botones no le quitan el foco al texto que se está escribiendo (onMouseDown → preventDefault).
import { useRef, useState } from 'react';
import Ic from './Ic';
import { DisenoPlantilla, LlenarPlantilla } from './Plantilla';
import PanelAsistente from '../asistente-legal/PanelAsistente';
import { aPlantilla } from './Barra';
import { useEditor, tocar } from '../../../../store/hooks/useEditor.hook';
import { CATEGORIAS, FAMILIAS, clamp } from '../../../../utils/editor-pdf/comun';
import { cssDe } from '../../../../utils/editor-pdf/fuentes';
import * as M from '../../../../utils/editor-pdf/motor';
import { exclusivo, ocrDialog } from './controlador';
import { close as cerrarAsistente, open as abrirAsistente } from '../asistente-legal/controlador';
import { esMiembro } from '../../../../utils/app';
import type { IDocumento } from '../../../../store/interfaces/editor.interface';

const sinFoco = (e: React.MouseEvent) => e.preventDefault();
export const modoPanel = (T: IDocumento) => (T.tpl?.mode === 'fill' ? 'fill' : T.ai?.open ? 'ai' : T.tpl?.mode === 'design' ? 'tpl' : 'edit');

// Pestañas del panel derecho: siempre se puede pasar de Edición a Asistente o a Plantilla y volver
export function PestanasPanel() {
  const { doc: T } = useEditor();
  const m = modoPanel(T);
  if (m === 'fill') return <div className="pnl-tabs hidden" id="edPanelTabs" />;
  const elegir = (k: string) => {
    if (k === 'edit') { if (T.ai?.open) cerrarAsistente(); else tocar(); }
    else if (k === 'ai') { if (!T.ai?.open) exclusivo(abrirAsistente, 'El asistente legal con IA es exclusivo para clientes de Portalfirma. Inicia sesión con tu cuenta para usarlo.'); }
    else aPlantilla();
  };
  return <div className="pnl-tabs" id="edPanelTabs">{([['edit', 'textEdit', 'Edición'], ['ai', 'sparkle', 'Asistente'], ['tpl', 'template', 'Plantilla']] as const).map(([k, ic, l]) =>
    <button key={k} data-pt={k} className={m === k ? 'on' : ''} onClick={() => elegir(k)}><Ic n={ic} t={14} /><span>{l}</span>{k === 'ai' && !esMiembro() ? <span className="lock-badge"><Ic n="lock" t={10} /></span> : null}</button>)}</div>;
}

export default function Panel() {
  const { doc: T } = useEditor();
  const m = modoPanel(T);
  if (m === 'fill') return <LlenarPlantilla />;
  if (m === 'ai') return <PanelAsistente />;
  return <>{m === 'tpl' ? <DisenoPlantilla /> : null}<Formato T={T} /></>;
}

const TIPS: Record<string, string> = { select: 'Clic en un objeto para moverlo o cambiar su tamaño; doble clic sobre un texto para editarlo. Arrastra en un espacio vacío para seleccionar un área: entran los objetos y las imágenes que queden completos dentro.', hand: 'Arrastra un texto, imagen o campo para moverlo, o arrastra la página para desplazarte. Atajo: mantén la barra espaciadora.', edittext: 'Haz clic en un párrafo para editarlo. Se usa una fuente equivalente a la detectada y el color de la tinta y del fondo de la página.', text: 'Dibuja en la página el recuadro del texto y escribe. Un clic solo crea un recuadro de ancho normal.', image: 'Haz clic donde quieras poner la imagen.', whiteout: 'Arrastra un rectángulo sobre lo que quieras cubrir. Se usa el color del fondo.' };
const INTERLINEADOS = [1, 1.15, 1.25, 1.5, 1.75, 2];

function Formato({ T }: { T: IDocumento }) {
  const f = M.currentFmt(); const o = f.target;
  const F = FAMILIAS();
  const sel = T.sel ? M.findOv(T.sel) : undefined;
  // El tamaño escrito a mano no se pisa mientras se escribe; se aplica con Enter o al salir
  const [tam, setTam] = useState<string | null>(null); const tamRef = useRef<string | null>(null);
  const fijarTam = (v: string | null) => { tamRef.current = v; setTam(v); };
  const setSize = (v: number) => { if (!(v > 0)) return; M.restoreRange(); M.applyFmt('size', clamp(Math.round(v * 10) / 10, 4, 300)); };
  const aplicarTam = () => { const v = tamRef.current; fijarTam(null); if (v != null) setSize(Number(String(v).replace(',', '.'))); };
  const lhConocido = INTERLINEADOS.some((v) => Math.abs(v - f.lh) < 0.06);
  const lhSel = INTERLINEADOS.find((v) => Math.abs(v - f.lh) < 0.06) ?? f.lh;
  return <>
    <div className="sec"><h4>Formato</h4>
      <div className="prow"><select id="pfFam" title={`${Object.keys(F).length} fuentes`} value={f.family} onChange={(e) => { M.restoreRange(); M.applyFmt('family', e.target.value); }}>
        {Object.entries(CATEGORIAS()).map(([c, cl]) => <optgroup key={c} label={cl}>{Object.values(F).filter((v) => v.cat === c).map((v) => <option key={v.key} value={v.key}>{v.label}{v.real.length === 1 ? ' (solo normal)' : !v.real.includes('Italic') ? ' (sin cursiva)' : !v.real.includes('Bold') ? ' (sin negrita)' : ''}</option>)}</optgroup>)}
      </select></div>
      <div className="fam-preview" id="pfPreview" style={{ fontFamily: `'${cssDe(f.family)}'` }}>Señor Pérez · 123 <b>Negrita</b> <i>Cursiva</i></div>
      {o?.detected ? <div className="detected">Fuente detectada: {o.detected}{o.source === 'ocr' ? ' (reconocida por OCR)' : ''}</div> : null}
      <div className="prow"><button className="fbtn fixed" id="pfSizeDown" title="Achicar (−0,5 pt)" onMouseDown={sinFoco} onClick={() => setSize((M.currentFmt().size || 11) - 0.5)}><Ic n="zoomOut" t={15} /></button>
        <input type="number" id="pfSize" min="4" max="300" step="any" title="Tamaño en puntos: escribe el valor y presiona Enter" value={tam ?? String(f.size)}
          onFocus={() => fijarTam(String(f.size))} onChange={(e) => fijarTam(e.target.value)} onBlur={aplicarTam}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aplicarTam(); } }} />
        <button className="fbtn fixed" id="pfSizeUp" title="Agrandar (+0,5 pt)" onMouseDown={sinFoco} onClick={() => setSize((M.currentFmt().size || 11) + 0.5)}><Ic n="zoomIn" t={15} /></button>
        <input type="color" id="pfColor" className="fixed" title="Color" value={f.color} onChange={(e) => { M.restoreRange(); M.applyFmt('color', e.target.value); }} /></div>
      <div className="prow">{([['bold', <b key="b">N</b>, 'Negrita'], ['italic', <i key="i">K</i>, 'Cursiva'], ['underline', <u key="u">S</u>, 'Subrayado']] as const).map(([k, l, t]) =>
        <button key={k} className={'fbtn' + (f[k] ? ' on' : '')} id={'pf-' + k} data-cmd={k} title={t} onMouseDown={sinFoco} onClick={() => M.applyFmt(k)}>{l}</button>)}
        <button className="fbtn" data-cmd="superscript" title="Superíndice" onMouseDown={sinFoco} onClick={() => M.applyFmt('superscript')}>x²</button><button className="fbtn" data-cmd="subscript" title="Subíndice" onMouseDown={sinFoco} onClick={() => M.applyFmt('subscript')}>x₂</button></div>
      <div className="prow">{([['left', 'alignLeft', 'Izquierda'], ['center', 'alignCenter', 'Centrar'], ['right', 'alignRight', 'Derecha'], ['justify', 'alignJustify', 'Justificar']] as const).map(([k, l, t]) =>
        <button key={k} className={'fbtn' + (f.align === k ? ' on' : '')} data-align={k} title={t} onMouseDown={sinFoco} onClick={() => M.applyFmt('align', k)}><Ic n={l} t={16} /></button>)}</div>
      <div className="prow"><span className="fixed muted">Interlineado</span><select id="pfLh" value={String(lhSel)} onChange={(e) => M.applyFmt('lh', Number(e.target.value))}>{INTERLINEADOS.map((v) => <option key={v} value={String(v)}>{v}</option>)}{lhConocido ? null : <option value={String(f.lh)}>{f.lh}</option>}</select></div>
      <p className="hint">{o ? (T.editing === o.id ? 'Selecciona palabras para cambiar solo esas, o aplica al párrafo completo sin selección.' : 'Doble clic para editar el texto.') : 'Estos valores se usan para el próximo texto que agregues.'}</p>
      {o?.cover && o.transparent ? <p className="hint">El texto original se borró del PDF: no queda oculto debajo y el fondo de la página se mantiene.</p>
        : o?.cover && o.source === 'pdf' ? <p className="hint">Parte del texto original no se pudo borrar y queda tapado. Si debe desaparecer por completo, usa <strong>Aplanar</strong> en la barra de páginas.</p> : null}
    </div>
    <div className="sec"><h4>Agregar texto con formato</h4>
      <div className="tp-grid">{M.TEXT_PRESETS.map((t) => <button key={t.key} className="tp" data-preset={t.key} title={'Insertar: ' + t.label} onMouseDown={sinFoco} onClick={() => M.insertPreset(t.key)}><span className="tp-demo" dangerouslySetInnerHTML={{ __html: t.demo }} /><small>{t.label}</small></button>)}</div>
      <p className="hint">Se inserta en la página con un texto de ejemplo: empieza a escribir y se reemplaza.</p>
    </div>
    <div className="sec"><h4>Objetos</h4>
      {sel ? <button className="secondary pbtn" id="pfDel" onMouseDown={sinFoco} onClick={() => M.removeOv(T.sel!)}>Quitar objeto seleccionado</button>
        : T.multi.length > 1 ? <button className="secondary pbtn" id="pfDel" onMouseDown={sinFoco} onClick={() => M.removeOv(T.multi)}>Quitar los {T.multi.length} objetos seleccionados</button> : null}
      <p className="hint">{TIPS[T.tool] || ''}</p>
    </div>
    <div className="sec"><h4>Documentos escaneados</h4>
      <button className="primary pbtn with-ic" id="pfOcr" onMouseDown={sinFoco} onClick={ocrDialog}><Ic n="scanText" t={17} /><span>Reconocer texto (OCR)…</span></button>
      <p className="hint">Para fotocopias y escaneos: el texto se vuelve buscable y editable, y la app imita el tono del papel al reescribir.</p>
    </div>
  </>;
}
