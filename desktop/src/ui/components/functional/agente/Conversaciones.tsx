// Las conversaciones guardadas del Agente (columna izquierda a pantalla completa): nueva, buscar, abrir,
// fijar, renombrar y borrar. Con el kit: Boton, Buscador y EstadoVacio.
// Los id agNewC, agConvQ, agConvs, las clases ag-ci/ag-cit y data-c, data-abrir, data-fijar, data-ren y data-del
// los usan las pruebas.
import { Fragment } from 'react';
import Boton from '../../ui/Boton';
import Buscador from '../../ui/Buscador';
import EstadoVacio from '../../ui/EstadoVacio';
import { cx } from '../../../utils/cx';
import { useAgente } from '../../../store/hooks/useAgente.hook';
import { borrarConversacion, renombrarConversacion } from '../../../utils/app';
import { abrirConv, buscarConvs, fijarConv, nueva } from './controlador';
import type { IConversacion } from '../../../store/interfaces/agente.interface';

const grupo = (c: IConversacion) => {
  if (c.fijada) return 'Fijadas';
  const t = Date.now() - new Date(c.actualizado).getTime();
  return t < 864e5 && new Date(c.actualizado).toDateString() === new Date().toDateString() ? 'Hoy' : t < 7 * 864e5 ? 'Esta semana' : 'Anteriores';
};
function cuando(iso: string) {
  const d = new Date(iso); const h = new Date();
  const dd = Math.floor((new Date(h.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  return dd <= 0 ? d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : dd === 1 ? 'Ayer' : dd < 7 ? `Hace ${dd} días` : d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}
const ACCION = 'tw:h-7 tw:w-7 tw:px-0';

export default function Conversaciones() {
  const { convs, conv, q } = useAgente();
  let g0 = '';
  return (
    <div className="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:min-h-0">
      <Boton id="agNewC" className="ag-newc" icono="plus" bloque onClick={nueva}>Nueva conversación</Boton>
      <Buscador kit id="agConvQ" className="tw:w-full" valor={q} alCambiar={buscarConvs} espera={200} placeholder="Buscar conversaciones" />
      <div className="ag-cl tw:flex-1 tw:min-h-0 tw:overflow-y-auto tw:flex tw:flex-col tw:gap-0.5 tw:-mx-1 tw:px-1" id="agConvs">
        {convs.length ? convs.map((c) => {
          const g = grupo(c); const titulo = g !== g0; g0 = g; const on = conv?.id === c.id;
          return (
            <Fragment key={c.id}>
              {titulo && <h5 className="tw:mt-3 tw:mb-1 tw:mx-2 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-muted">{g}</h5>}
              <div className={cx('ag-ci tw:group tw:relative tw:flex tw:items-center tw:rounded-xl', on ? 'on tw:bg-lav-soft' : 'tw:hover:bg-hover')} data-c={c.id}>
                <button type="button" className="ag-cit tw:flex-1 tw:min-w-0 tw:m-0 tw:px-3 tw:py-2 tw:text-left tw:border-0 tw:bg-transparent tw:cursor-pointer tw:font-[inherit]" data-abrir onClick={() => abrirConv(c.id)}>
                  <b className={cx('tw:block tw:truncate tw:text-[13.5px] tw:font-semibold', on ? 'tw:text-lav-softink' : 'tw:text-text')}>{c.titulo || 'Conversación'}</b>
                  <small className="tw:block tw:truncate tw:text-xs tw:text-muted">{cuando(c.actualizado)}{c.resumen ? ' · ' + c.resumen : ''}</small>
                </button>
                <span className="ag-cia tw:absolute tw:right-1 tw:top-1/2 tw:-translate-y-1/2 tw:hidden tw:group-hover:flex tw:group-focus-within:flex tw:items-center tw:gap-0.5 tw:p-0.5 tw:rounded-lg tw:bg-card tw:shadow-sm">
                  <Boton variante="fantasma" tamano="sm" className={cx(ACCION, c.fijada && 'on tw:text-brand')} data-fijar title={c.fijada ? 'Quitar de fijadas' : 'Fijar arriba'} aria-label={c.fijada ? 'Quitar de fijadas' : 'Fijar arriba'} icono="bookmark" onClick={() => fijarConv(c.id, !c.fijada)} />
                  <Boton variante="fantasma" tamano="sm" className={ACCION} data-ren title="Cambiar nombre" aria-label="Cambiar nombre" icono="edit" onClick={() => renombrarConversacion(c)} />
                  <Boton variante="fantasma" tamano="sm" className={cx(ACCION, 'tw:hover:text-err')} data-del title="Eliminar" aria-label="Eliminar" icono="trash" onClick={() => borrarConversacion(c)} />
                </span>
              </div>
            </Fragment>
          );
        }) : <EstadoVacio compacto className="ag-cvac tw:px-2" texto={q ? 'Sin resultados.' : 'Aquí quedan tus conversaciones para retomarlas cuando quieras.'} />}
      </div>
    </div>
  );
}
