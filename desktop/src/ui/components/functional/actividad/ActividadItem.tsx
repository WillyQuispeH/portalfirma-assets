// Un movimiento de la Actividad (fila de lista, con los tonos del kit). La clase ac-it y data-clase/data-ir los usan
// test/actividad-e2e.js y test/vista-e2e.js.
import Icono from '../../ui/Icono';
import { SUAVE, type TTono } from '../../ui/tonos';
import { cx } from '../../../utils/cx';
import { hora } from './fechas';
import type { IActividadItem, TActividadClase } from '../../../store/interfaces/actividad.interface';

const ICONO: Record<TActividadClase, string> = { propiedad: 'house', negocio: 'briefcase', persona: 'user', agenda: 'calendar', otro: 'clock' };

// color del ícono según a qué se refiere (tonos del kit)
const TONO: Record<TActividadClase, TTono> = { propiedad: 'azul', negocio: 'amarillo', agenda: 'verde', persona: 'lavanda', otro: 'gris' };

interface IActividadItemProps {
  item: IActividadItem;
  alAbrir: () => void;
}

export default function ActividadItem({ item: a, alAbrir }: IActividadItemProps) {
  return (
    <button
      className="ac-it tw:w-full tw:m-0 tw:flex tw:items-center tw:gap-3 tw:px-3 tw:py-2 tw:rounded-xl tw:border-0 tw:bg-transparent tw:text-left tw:text-text tw:font-[inherit] tw:cursor-pointer tw:hover:bg-hover tw:focus-visible:outline-2 tw:focus-visible:outline-lav-edge"
      data-clase={a.clase} data-ir={a.ir || ''} onClick={alAbrir}>
      <span className={cx('tw:w-8 tw:h-8 tw:flex-none tw:grid tw:place-items-center tw:rounded-[10px]', SUAVE[TONO[a.clase] ?? 'gris'])}>
        <Icono nombre={a.nota ? 'edit' : ICONO[a.clase] || 'clock'} tam={14} />
      </span>
      <span className="tw:min-w-0 tw:flex tw:flex-col">
        <b className={`tw:text-[13.5px] ${a.nota ? 'tw:font-semibold' : 'tw:font-medium'}`}>{a.texto}</b>
        {a.nombre && <small className="tw:text-muted tw:text-xs tw:truncate">{a.nombre}</small>}
      </span>
      <time className="tw:ml-auto tw:text-muted tw:text-xs tw:flex-none">{hora(a.fecha)}</time>
    </button>
  );
}
