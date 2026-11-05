// Un movimiento de la Actividad. Las clases ac-it y data-clase las usa test/vista-e2e.js.
import Icono from '../../ui/Icono';
import { hora } from './fechas';
import type { IActividadItem, TActividadClase } from '../../../store/interfaces/actividad.interface';

const ICONO: Record<TActividadClase, string> = { propiedad: 'house', negocio: 'briefcase', persona: 'user', agenda: 'calendar', otro: 'clock' };

// color del ícono según a qué se refiere
const COLOR: Partial<Record<TActividadClase, string>> = {
  propiedad: 'tw:bg-brand-soft tw:text-brand',
  negocio: 'tw:bg-[var(--warn-soft)] tw:text-[var(--hint)]',
  agenda: 'tw:bg-[#e8f6ee] tw:text-[#178a48] tw:dark:bg-ok-soft tw:dark:text-ok',
  persona: 'tw:bg-[#f0ecff] tw:text-[#6a4bd6] tw:dark:bg-[#2a2350] tw:dark:text-[#b9a6ff]',
};

interface IActividadItemProps {
  item: IActividadItem;
  alAbrir: () => void;
}

export default function ActividadItem({ item: a, alAbrir }: IActividadItemProps) {
  return (
    <button
      className="ac-it tw:w-full tw:m-0 tw:flex tw:items-center tw:gap-3 tw:px-2 tw:py-[9px] tw:rounded-[10px] tw:border-0 tw:bg-transparent tw:text-left tw:text-text tw:cursor-pointer tw:hover:bg-bg"
      data-clase={a.clase} data-ir={a.ir || ''} onClick={alAbrir}>
      <span className={`tw:w-7 tw:h-7 tw:flex-none tw:grid tw:place-items-center tw:rounded-[9px] ${COLOR[a.clase] || 'tw:bg-bg tw:text-muted'}`}>
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
