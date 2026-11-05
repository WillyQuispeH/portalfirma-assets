// Actividad: todo lo que pasó en la cartera, agrupado por día, con búsqueda, filtros y «Ver más».
// Hecha con el kit: CabeceraPagina (con «volver» al inicio), Buscador, Tabs, Card, EstadoVacio y Boton.
// Los id acVolver, acQ, acCl (data-c en cada filtro), acLista, acCont y acMas y la clase ac-dia los usan
// test/actividad-e2e.js y test/vista-e2e.js.
import { Fragment, useEffect } from 'react';
import { useActividad } from '../../../store/hooks/useActividad.hook';
import { abrirAgenda, abrirFicha, abrirInicio, abrirNegocio, abrirPersona } from '../../../utils/app';
import Buscador from '../../ui/Buscador';
import CabeceraPagina from '../../ui/CabeceraPagina';
import Tabs, { type TTabOpcion } from '../../ui/Tabs';
import Card from '../../ui/Card';
import EstadoVacio from '../../ui/EstadoVacio';
import Boton from '../../ui/Boton';
import ActividadItem from './ActividadItem';
import { tituloDia } from './fechas';
import type { IActividadItem, TActividadFiltro } from '../../../store/interfaces/actividad.interface';

const FILTROS: TTabOpcion<TActividadFiltro>[] = [['', 'Todo'], ['propiedad', 'Propiedades'], ['negocio', 'Negocios'], ['persona', 'Personas'], ['agenda', 'Agenda'], ['nota', 'Notas']];

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
      <CabeceraPagina
        volver={{ texto: 'Inicio', alTocar: abrirInicio, id: 'acVolver' }}
        titulo="Actividad"
        subtitulo={<span id="acCont">{total ? `${total} ${total === 1 ? 'movimiento' : 'movimientos'}` : ''}</span>}
      />

      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:mb-4">
        <Buscador kit id="acQ" valor={q} alCambiar={actividadSetQ} espera={220} placeholder="Buscar por propiedad, cliente o acción" />
        <Tabs id="acCl" dato="c" etiqueta="Filtrar por" opciones={FILTROS} valor={clase} alCambiar={actividadSetClase} className="tw:max-w-full tw:overflow-x-auto" />
      </div>

      {error && <p role="alert" className="tw:text-red-softink">No se pudo leer la actividad: {error}</p>}

      <Card>
        <div id="acLista" className="tw:-mx-3 tw:-mt-2">
          {cargado && (items.length ? items.map((a) => {
            const dia = tituloDia(a.fecha); const nuevoDia = dia !== diaAnterior; diaAnterior = dia;
            return (
              <Fragment key={a.id}>
                {nuevoDia && <h4 className="ac-dia tw:mt-3.5 tw:mb-1.5 tw:mx-3 tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-[.05em] tw:text-muted">{dia}</h4>}
                <ActividadItem item={a} alAbrir={() => abrir(a)} />
              </Fragment>
            );
          }) : (
            <EstadoVacio icono="clock" texto={q || clase ? 'Nada coincide con el filtro.' : 'Aún no hay actividad.'} />
          ))}
        </div>
        {hayMas && (
          <div className="tw:flex tw:justify-center tw:mt-3">
            <Boton id="acMas" variante="secundario" cargando={cargando} onClick={() => actividadGetPage(false)}>Ver más</Boton>
          </div>
        )}
      </Card>
    </div>
  );
}
