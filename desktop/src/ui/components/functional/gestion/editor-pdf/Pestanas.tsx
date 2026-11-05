// Pestañas de los documentos abiertos (en el encabezado, #docTabs): cambiar, cerrar (clic en la x o con el botón
// del medio) y abrir otro. La activa se marca solo cuando se ve el editor. Clases .dtab, .x y #dtabNew: pruebas y estilos.
import Ic from './Ic';
import { useEditor } from '../../../../store/hooks/useEditor.hook';
import { closeTab, openDialog, switchTab } from './controlador';

export default function Pestanas() {
  const { pestanas, doc } = useEditor();
  const enEditor = !document.getElementById('view-editor')?.classList.contains('hidden');
  return <>
    {pestanas.map((t) => <div key={t.id} className={'dtab' + (t === doc && enEditor ? ' active' : '')} data-tab={t.id} title={t.path || t.name}
      onClick={() => switchTab(t)} onAuxClick={(e) => { if (e.button === 1) closeTab(t); }}>
      <Ic n="file" t={14} /><span className="nm">{t.name}</span>{t.dirty ? <i className="dot" title="Cambios sin guardar" /> : null}
      <button className="x" data-close={t.id} title="Cerrar (⌘W)" onClick={(e) => { e.stopPropagation(); closeTab(t); }}><Ic n="x" t={12} /></button></div>)}
    <button className="dtab-new" id="dtabNew" title="Abrir documento (⌘O)" onClick={() => openDialog(true)}><Ic n="plus" t={15} /></button>
  </>;
}
