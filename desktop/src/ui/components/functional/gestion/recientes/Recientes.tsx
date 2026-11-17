// Recientes: los documentos abiertos o guardados en este computador, con búsqueda, tipo, páginas de 20,
// mostrar en la carpeta, quitar de la lista y borrar la lista. Los id rc* los usan las pruebas.
import { useEffect } from 'react';
import Buscador from '../../../ui/Buscador';
import { mostrarEnCarpeta, useReciente, type TTipoArchivo } from '../../../../store/hooks/useReciente.hook';
import { abrirDocumento, abrirReciente, confirmar } from '../../../../utils/app';
import { IconoArchivo, carpetaDe, fechaCorta, tamano, tipoArchivo } from '../comun/archivos';

import Boton from '../../../ui/Boton';
import Layout from '../../../ui/Layout';
const POR_PAGINA = 20;
const TIPOS: [TTipoArchivo, string][] = [['', 'Todos'], ['pdf', 'PDF'], ['doc', 'Word'], ['xls', 'Excel'], ['img', 'Imágenes']];

export default function Recientes() {
  const { lista: todos, q, tipo, pagina, recientesGetAll, recientesSetFiltros, recienteQuitar, recientesQuitarFaltantes, recientesBorrarTodo } = useReciente();

  useEffect(() => {
    recientesGetAll();
    const recargar = () => recientesGetAll();
    window.addEventListener('pf:recientes', recargar);
    return () => window.removeEventListener('pf:recientes', recargar);
  }, [recientesGetAll]);

  const t = q.toLowerCase();
  const lista = todos.filter((x) => (!t || `${x.name} ${x.path}`.toLowerCase().includes(t)) && (!tipo || tipoArchivo(x.name)[1] === tipo));
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA)); const pag = Math.min(Math.max(1, pagina), paginas);
  const desde = (pag - 1) * POR_PAGINA; const trozo = lista.slice(desde, desde + POR_PAGINA);
  const faltan = todos.filter((x) => !x.exists).length;
  const nums: (number | '…')[] = [];
  for (let i = 1; i <= paginas; i++) if (i === 1 || i === paginas || Math.abs(i - pag) <= 2) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  const ir = (p: number) => { recientesSetFiltros({ pagina: p }); document.getElementById('view-recientes')?.scrollIntoView({ block: 'start' }); };
  const borrar = async () => { if (await confirmar({ clave: 'modal-119', titulo: '¿Borrar la lista de recientes?', texto: 'Solo se borra la lista; tus archivos no se eliminan.', boton: 'Borrar lista', peligro: true })) recientesBorrarTodo(); };

  return (
    <Layout titulo="Recientes" ilustracion={{ imagen: 'img/formas/etapa.svg', tinte: '#6d5bd0' }}
      subtitulo={`${todos.length} ${todos.length === 1 ? 'documento' : 'documentos'} abiertos o guardados en este computador`}
      acciones={<>
        {faltan > 0 && <Boton variante="fantasma" id="rcMiss" onClick={recientesQuitarFaltantes}>Quitar los {faltan} que no existen</Boton>}
        {todos.length > 0 && <Boton variante="fantasma" id="rcClear" onClick={borrar}>Borrar lista</Boton>}
        <Boton icono="folderOpen" id="rcOpen" onClick={abrirDocumento}>Abrir documento…</Boton>
      </>}
      barra={(
        <div className="rec-bar">
          <Buscador id="rcQ" clase="ops-search" valor={q} alCambiar={(v) => recientesSetFiltros({ q: v })} espera={120} placeholder="Buscar por nombre o carpeta…" />
          <div className="rec-seg">{TIPOS.map(([k, x]) => <button key={k} data-tipo={k} className={tipo === k ? 'on' : ''} onClick={() => recientesSetFiltros({ tipo: k })}>{x}</button>)}</div>
        </div>
      )}>
      <div className="rec-card">
        {trozo.length ? (
          <>
            <div className="rec-th"><span /><span>Nombre</span><span>Tamaño</span><span>Última vez</span><span /></div>
            {trozo.map((x) => (
              <div key={x.path} className={`rec-row ${x.exists ? '' : 'miss'}`} data-path={x.path} title={x.path} onClick={() => abrirReciente(x.path)}>
                <IconoArchivo nombre={x.name} />
                <span className="rc-tx"><b>{x.name}</b><small>{carpetaDe(x.path)}{!x.exists && <> · <b className="tw:text-err tw:font-semibold">no encontrado</b></>}</small></span>
                <span className="muted small">{tamano(x.size)}</span><span className="muted small">{fechaCorta(x.date)}</span>
                <span className="rec-act" onClick={(e) => e.stopPropagation()}>
                  {x.exists && <Boton variante="fantasma" tamano="sm" icono="folder" data-folder title="Mostrar en la carpeta" onClick={() => mostrarEnCarpeta(x.path)} />}
                  <Boton variante="fantasma" tamano="sm" icono="x" data-rm title="Quitar de la lista" onClick={() => recienteQuitar(x.path)} />
                </span>
              </div>
            ))}
          </>
        ) : <div className="recent-empty">{todos.length ? 'Ningún documento coincide con la búsqueda.' : 'Aquí aparecerán los documentos que abras o guardes.'}</div>}
      </div>
      {lista.length > POR_PAGINA && (
        <div className="rec-pag">
          <span className="muted small">Mostrando {desde + 1}–{desde + trozo.length} de {lista.length}</span>
          <div className="rec-pg">
            <Boton variante="fantasma" tamano="sm" icono="chevL" data-pg={pag - 1} disabled={pag === 1} onClick={() => ir(pag - 1)}>Anterior</Boton>
            {nums.map((x, i) => (x === '…' ? <span key={`s${i}`} className="muted">…</span> : <button key={x} className={`ghost small ${x === pag ? 'on' : ''}`} data-pg={x} onClick={() => ir(x)}>{x}</button>))}
            <Boton variante="fantasma" tamano="sm" iconoDerecha="chevR" data-pg={pag + 1} disabled={pag === paginas} onClick={() => ir(pag + 1)}>Siguiente</Boton>
          </div>
        </div>
      )}
    </Layout>
  );
}
