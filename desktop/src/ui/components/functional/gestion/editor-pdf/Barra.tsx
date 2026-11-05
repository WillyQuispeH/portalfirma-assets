// Barra de herramientas del editor: archivo, herramientas de edición, reconocer texto, zoom y las acciones de la
// derecha (soporte, asistente, expediente, plantilla, enviar a firmar). Los id y data-tool los usan las pruebas y la Ayuda.
import Ic from './Ic';
import { useEditor } from '../../../../store/hooks/useEditor.hook';
import * as M from '../../../../utils/editor-pdf/motor';
import { agregarArchivos, compress, exclusivo, exportDialog, numberPages, ocrDialog, openDialog, printDoc, save, sendToSign, watermark } from './controlador';
import { enterDesign } from './plantillas';
import { close as cerrarAsistente, open as abrirAsistente } from '../asistente-legal/controlador';
import { guardarEnExpediente, soporteWhatsAppGeneral, toast } from '../../../../utils/app';
import type { THerramienta } from '../../../../store/interfaces/editor.interface';

const TOOLS: [THerramienta, string, string, string][] = [
  ['select', 'pointer', 'Seleccionar', 'Seleccionar (V): clic en un objeto, o arrastra en un espacio vacío para elegir un área. Sobre el texto del PDF: seleccionar y copiar'],
  ['hand', 'hand', 'Mover', 'Mano (H o mantén la barra espaciadora): mueve textos, imágenes y campos, o arrastra la página para desplazarte'],
  ['edittext', 'textEdit', 'Editar texto', 'Editar el texto del PDF (detecta párrafos y fuente) · ⌘E'],
  ['text', 'textAdd', 'Agregar texto', 'Dibuja el recuadro y escribe dentro · ⌘T'],
  ['image', 'image', 'Imagen', 'Agregar imagen o logo'],
  ['whiteout', 'eraser', 'Tapar', 'Cubrir un área con el color del fondo'],
];
export const Ib = ({ id, ic, title, cls = '', onClick, disabled }: { id: string; ic: string; title: string; cls?: string; onClick?: () => void; disabled?: boolean }) =>
  <button className={'ibtn ' + cls} id={id} title={title} onClick={onClick} disabled={disabled}><Ic n={ic} t={18} /></button>;

// «Plantilla»: pasa al diseño de plantilla (o vuelve a él)
export function aPlantilla() {
  const T = M.ed();
  if (T.ai?.open) T.ai.open = false;
  if (!T.tpl) enterDesign(); else { M.syncDocState(); const p = document.getElementById('edPanel'); if (p) p.scrollTop = 0; }
}

export default function Barra() {
  const { doc: T } = useEditor();
  const motivoIA = 'El asistente legal con IA es exclusivo para clientes de Portalfirma. Inicia sesión con tu cuenta para usarlo.';
  return <div className="ed-toolbar">
    <div className="tg"><Ib id="edOpen" ic="folderOpen" title="Abrir (⌘O)" onClick={() => openDialog()} /><Ib id="edSave" ic="save" title="Guardar (⌘S)" cls={T.dirty ? 'dirty' : ''} onClick={() => save()} />
      <Ib id="edPrint" ic="print" title="Imprimir (⌘P)" onClick={printDoc} /><Ib id="edSearch" ic="search" title="Buscar texto (⌘F)" onClick={() => (T.findOpen ? M.closeFind() : M.find())} />
      <Ib id="edAdd" ic="files" title="Combinar: agregar archivos al final" onClick={agregarArchivos} /></div>
    <div className="tg tools">{TOOLS.map(([k, ic, l, t]) => <button key={k} className={'tool' + (T.tool === k ? ' active' : '')} data-tool={k} title={t} onClick={() => M.setTool(k)}><Ic n={ic} t={17} /><span>{l}</span></button>)}</div>
    <div className="tg"><button className="primary small with-ic" id="edOcr" title="Reconocer texto en páginas escaneadas o fotocopias (⇧⌘R)" onClick={ocrDialog}><Ic n="scanText" t={17} /><span>Reconocer texto</span></button>
      <Ib id="edCmp" ic="compress" title="Comprimir PDF" onClick={compress} /><Ib id="edNum" ic="hash" title="Numerar páginas" onClick={numberPages} /><Ib id="edWm" ic="droplet" title="Marca de agua" onClick={watermark} /><Ib id="edExp" ic="export" title="Exportar a Word, imágenes o texto" onClick={() => exportDialog()} /></div>
    <div className="tg"><Ib id="edUndo" ic="undo" title="Deshacer (⌘Z)" disabled={!T.undo.length} onClick={M.undo} /><Ib id="edZoomOut" ic="zoomOut" title="Alejar (⌘−)" onClick={() => M.zoom(-1)} />
      <span className="zoom-pct" id="edZoomPct" title="Tamaño ajustado (⌘0)" onClick={() => M.zoom(0)}>{Math.round((T.scales[T.current] || 1) * 100)}%</span>
      <Ib id="edZoomIn" ic="zoomIn" title="Acercar (⌘+)" onClick={() => M.zoom(1)} /><Ib id="edFull" ic="maximize" title="Pantalla completa (modo lectura)" onClick={() => M.reading()} /></div>
    <div className="tg right">
      <button className="secondary small with-ic wa-btn" id="edWa" title="Escribir a soporte de Portalfirma por WhatsApp" onClick={soporteWhatsAppGeneral}><Ic n="whatsapp" t={16} /><span>Soporte</span></button>
      <button className="secondary small with-ic ai-btn" id="edAi" data-member="" title="Asistente legal con IA: revisa, corrige y redacta" onClick={() => (T.ai?.open ? cerrarAsistente() : exclusivo(abrirAsistente, motivoIA))}><Ic n="sparkle" t={16} /><span>Asistente</span><span className="lock-badge"><Ic n="lock" t={11} /></span></button>
      <button className="secondary small with-ic" id="edCase" title="Guardar este documento en un expediente (carpeta del caso)" onClick={() => (T.bytes ? guardarEnExpediente() : toast('Abre un documento primero.'))}><Ic n="folderOpen" t={16} /><span>Expediente</span></button>
      <button className="secondary small with-ic" id="edTpl" title="Convertir este documento en una plantilla con campos" onClick={aPlantilla}><Ic n="template" t={16} /><span>Plantilla</span></button>
      <button className="primary small with-ic" id="edSend" data-member="" onClick={() => exclusivo(sendToSign)}><Ic n="sign" t={16} /><span>Enviar a firmar</span><span className="lock-badge"><Ic n="lock" t={11} /></span></button>
    </div>
  </div>;
}
