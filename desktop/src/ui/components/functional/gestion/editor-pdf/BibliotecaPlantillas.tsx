// «Mis plantillas» en el inicio de Gestión documental: llenar, editar, exportar o eliminar cada plantilla,
// e importar un documento de Google Drive para convertirlo en plantilla.
// Ids y clases (#tplLib, #tplDrive, .tpl-item, [data-fill]…) los usan las pruebas, el menú y la Ayuda.
import { useEffect } from 'react';
import Ic from './Ic';
import { usePlantillas } from '../../../../store/hooks/useEditor.hook';
import { borrarPlantilla, driveDialog, exportarPlantilla, openTemplateFile } from './plantillas';

const fmtD = (iso?: string) => { try { return iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : ''; } catch { return ''; } };

export default function BibliotecaPlantillas() {
  const { plantillas, editorPlantillas } = usePlantillas();
  useEffect(() => { editorPlantillas(); }, [editorPlantillas]);
  const lista = plantillas || [];
  return <>
    <div className="recent-head" id="tplLib"><h3>Mis plantillas</h3><span className="muted small">Abre un contrato y usa «Plantilla» para crear una</span><button className="secondary small with-ic" id="tplDrive" onClick={driveDialog}><Ic n="drive" t={15} /><span>Importar de Google Drive</span></button></div>
    <div className="recent-list tpl-lib">{lista.length ? lista.map((x) => <div key={x.file} className="recent-item tpl-item" data-file={x.file} onClick={() => openTemplateFile(x.file, 'fill')}>
      <span className="fi tpl"><Ic n="template" t={18} /></span><span><div className="nm">{x.name}</div><div className="pt">{x.fields} campo(s){x.signers?.length ? ' · firmantes: ' + x.signers.join(', ') : ''}</div></span>
      <span className="muted small">{fmtD(x.updated)}</span>
      <span className="tpl-acts" onClick={(e) => e.stopPropagation()}>
        <button className="primary small" data-fill onClick={() => openTemplateFile(x.file, 'fill')}>Llenar</button>
        <button className="ghost small" data-edit onClick={() => openTemplateFile(x.file, 'design')}>Editar</button>
        <button className="ghost small" data-exp title="Guardar una copia para compartir" onClick={() => exportarPlantilla(x.file)}>Exportar</button>
        <button className="ibtn danger" data-del title="Eliminar" onClick={() => borrarPlantilla(x.file, x.name, editorPlantillas)}><Ic n="trash" t={15} /></button></span></div>)
      : <div className="recent-empty">Aún no tienes plantillas. Abre uno de tus contratos, presiona <strong>Plantilla</strong> y marca los datos que cambian.</div>}</div>
  </>;
}
