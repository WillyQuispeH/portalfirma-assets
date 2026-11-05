// Actividad: todo lo que pasó en la cartera, agrupado por día, con búsqueda, filtros y «Ver más».
// Los id acQ, acCl, acLista y acCont y la clase ac-dia los usa test/vista-e2e.js.
import { Fragment, useEffect } from 'react';
import { useActividad } from '../../../store/hooks/useActividad.hook';
import { abrirAgenda, abrirFicha, abrirInicio, abrirNegocio, abrirPersona } from '../../../utils/app';
import Buscador from '../../ui/Buscador';
import Icono from '../../ui/Icono';
import ActividadItem from './ActividadItem';
import { tituloDia } from './fechas';
import type { IActividadItem, TActividadFiltro } from '../../../store/interfaces/actividad.interface';

const FILTROS: [TActividadFiltro, string][] = [['', 'Todo'], ['propiedad', 'Propiedades'], ['negocio', 'Negocios'], ['persona', 'Personas'], ['agenda', 'Agenda'], ['nota', 'Notas']];

function abrir(a: IActividadItem) {
  if (!a.ir) return;
  if (a.clase === 'propiedad') abrirFicha(a.ir);
  else if (a.clase === 'persona') abrirPersona(a.ir);
  else if (a.clase === 'negocio') abrirNegocio(a.ir);
  else if (a.clase === 'agenda') abrirAgenda();
}

export default function Actividad() {
  const { q, clase, items, total, cargado, cargando, error, hayMas, actividadGetPage, actividadSetQ, actividadSetClase } = useActividad();
  useEffect(() => { actividadGetPage(true); }, [actividadGetPage]);

  let diaAnterior = '';

  return (
    <div className="im-wrap tw:max-w-[920px]">
      <div className="tw:flex tw:items-center tw:gap-3.5 tw:mb-3.5">
        <button className="ghost tw:w-auto tw:m-0" id="acVolver" onClick={abrirInicio}><Icono nombre="chevL" tam={16} /> Inicio</button>
        <div>
          <h1 className="tw:m-0 tw:text-2xl">Actividad</h1>
          <small className="tw:text-muted" id="acCont">{total ? `${total} ${total === 1 ? 'movimiento' : 'movimientos'}` : ''}</small>
        </div>
      </div>

      <div className="tw:flex tw:flex-wrap tw:gap-2.5 tw:items-center tw:mb-3">
        <Buscador id="acQ" clase="ac-q" valor={q} alCambiar={actividadSetQ} espera={220} placeholder="Buscar por propiedad, cliente o acción" />
        <div className="ga-chips" id="acCl">
          {FILTROS.map(([k, t]) => <button key={k} data-c={k} className={clase === k ? 'on' : ''} onClick={() => actividadSetClase(k)}>{t}</button>)}
        </div>
      </div>

      {error && <p className="error">No se pudo leer la actividad: {error}</p>}

      <div className="im-box tw:pt-1.5 tw:px-3.5 tw:pb-3.5">
        <div id="acLista">
          {cargado && (items.length ? items.map((a) => {
            const dia = tituloDia(a.fecha); const nuevoDia = dia !== diaAnterior; diaAnterior = dia;
            return (
              <Fragment key={a.id}>
                {nuevoDia && <h4 className="ac-dia tw:mt-3.5 tw:mb-1.5 tw:text-[11px] tw:uppercase tw:tracking-[.05em] tw:text-muted">{dia}</h4>}
                <ActividadItem item={a} alAbrir={() => abrir(a)} />
              </Fragment>
            );
          }) : (
            <p className="muted tw:py-5 tw:px-1.5">{q || clase ? 'Nada coincide con el filtro.' : 'Aún no hay actividad.'}</p>
          ))}
        </div>
        {hayMas && (
          <button className="secondary tw:block tw:w-auto tw:mt-3 tw:mx-auto" id="acMas" disabled={cargando} onClick={() => actividadGetPage(false)}>Ver más</button>
        )}
      </div>
    </div>
  );
}
