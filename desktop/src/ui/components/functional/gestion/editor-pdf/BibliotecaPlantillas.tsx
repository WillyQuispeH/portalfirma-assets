// «Mis plantillas» en el inicio de Gestión documental: llenar, editar, exportar o eliminar cada plantilla,
// e importar un documento de Google Drive para convertirlo en plantilla. Va dentro de una Card del kit
// (InicioGestion, #tplLibHost), con Boton, ItemLista y EstadoVacio.
// Ids y clases (#tplLib, #tplDrive, .tpl-item[data-file], [data-fill]…) los usan las pruebas, el menú y la Ayuda.
import { useEffect } from 'react';
import Icono from '../../../ui/Icono';
import Boton from '../../../ui/Boton';
import ItemLista from '../../../ui/ItemLista';
import EstadoVacio from '../../../ui/EstadoVacio';
import { usePlantillas } from '../../../../store/hooks/useEditor.hook';
import { borrarPlantilla, driveDialog, exportarPlantilla, openTemplateFile } from './plantillas';

const fmtD = (iso?: string) => { try { return iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : ''; } catch { return ''; } };

export default function BibliotecaPlantillas() {
  const { plantillas, editorPlantillas } = usePlantillas();
  useEffect(() => { editorPlantillas(); }, [editorPlantillas]);
  const lista = plantillas || [];
  return <>
    <header id="tplLib" className="tw:flex tw:flex-wrap tw:items-start tw:gap-3 tw:px-5 tw:py-4 tw:border-0 tw:border-b tw:border-solid tw:border-edge tw:scroll-mt-28">
      <div className="tw:min-w-0 tw:flex-1">
        <h3 className="tw:m-0 tw:inline-flex tw:items-center tw:gap-2 tw:text-[17px] tw:font-bold tw:leading-tight"><Icono nombre="template" tam={17} />Mis plantillas</h3>
        <p className="tw:m-0 tw:mt-1 tw:text-[13px] tw:text-muted">Abre un contrato y usa «Plantilla» para crear una.</p>
      </div>
      <Boton variante="secundario" tamano="sm" id="tplDrive" icono="drive" onClick={() => driveDialog()}>Importar de Google Drive</Boton>
    </header>
    <div className="tw:flex tw:flex-col tw:gap-0.5 tw:p-1.5">
      {lista.length ? lista.map((x) => (
        <ItemLista key={x.file} className="tpl-item tw:cursor-pointer tw:hover:bg-hover" data-file={x.file} onClick={() => openTemplateFile(x.file, 'fill')}
          media={<span className="tw:grid tw:place-items-center tw:w-9 tw:h-9 tw:rounded-xl tw:bg-lav-soft tw:text-lav-softink"><Icono nombre="template" tam={18} /></span>}
          titulo={x.name}
          detalle={<>{x.fields} campo(s){x.signers?.length ? ' · firmantes: ' + x.signers.join(', ') : ''}{x.updated ? ' · ' + fmtD(x.updated) : ''}</>}
          derecha={
            <span className="tw:flex tw:items-center tw:gap-1" onClick={(e) => e.stopPropagation()}>
              <Boton tamano="sm" data-fill onClick={() => openTemplateFile(x.file, 'fill')}>Llenar</Boton>
              <Boton variante="fantasma" tamano="sm" data-edit onClick={() => openTemplateFile(x.file, 'design')}>Editar</Boton>
              <Boton variante="fantasma" tamano="sm" data-exp title="Guardar una copia para compartir" onClick={() => exportarPlantilla(x.file)}>Exportar</Boton>
              <Boton variante="fantasma" tamano="sm" data-del icono="trash" title="Eliminar" aria-label="Eliminar" className="tw:enabled:hover:text-red-softink" onClick={() => borrarPlantilla(x.file, x.name, editorPlantillas)} />
            </span>
          } />
      )) : <EstadoVacio compacto className="recent-empty tw:px-3 tw:py-3" texto={<>Aún no tienes plantillas. Abre uno de tus contratos, presiona <strong>Plantilla</strong> y marca los datos que cambian.</>} />}
    </div>
  </>;
}
