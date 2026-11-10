// Un lead en la bandeja. Con el kit: Avatar y Badge. Las pruebas usan #ldItems .ld-it (y el nombre del corredor en el texto).
import Avatar from '../../ui/Avatar';
import Badge from '../../ui/Badge';
import Icono from '../../ui/Icono';
import { SUAVE } from '../../ui/tonos';
import { cx } from '../../../utils/cx';
import { TONO_ESTADO, busquedaTxt, fechaCorta, iniciales, nombreDe } from './formato';
import type { ILead } from '../../../store/interfaces/lead.interface';

interface ILeadItemProps {
  l: ILead;
  elegido: boolean;
  verCorredor: boolean;
  alElegir: () => void;
}

// más chicas que el Badge normal (h-6, text-xs) para que quepan tres en la columna
const CHICO = 'tw:h-5! tw:px-2! tw:text-[11px]!';

export default function LeadItem({ l, elegido, verCorredor, alElegir }: ILeadItemProps) {
  const nombre = nombreDe(l);
  const busca = busquedaTxt(l.busqueda);
  const alerta = l.sinRespuesta ? 'Sin respuesta' : l.vencida ? 'Acción vencida' : '';
  return (
    <button type="button" data-id={l.id} onClick={alElegir} className={cx(
      'ld-it tw:flex tw:w-full tw:items-start tw:justify-start tw:gap-2.5 tw:m-0 tw:px-3 tw:py-3 tw:text-left tw:font-[inherit] tw:text-text tw:cursor-pointer tw:rounded-none',
      'tw:border-0 tw:border-b tw:border-solid tw:border-edge tw:transition-colors tw:duration-100',
      'tw:focus-visible:outline-2 tw:focus-visible:-outline-offset-2 tw:focus-visible:outline-lav-edge',
      elegido ? 'on tw:bg-lav-soft' : 'tw:bg-transparent tw:hover:bg-hover',
    )}>
      {iniciales(nombre) === '#'
        ? <span aria-hidden="true" className={cx('tw:grid tw:size-9 tw:flex-none tw:place-items-center tw:rounded-xl', SUAVE.gris)}><Icono nombre="phone" tam={16} /></span>
        : <Avatar nombre={nombre} tono={l.ig ? 'durazno' : undefined} />}
      <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
        <span className="tw:flex tw:items-center tw:gap-2">
          <b className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[13.5px] tw:font-semibold">{nombre}</b>
          <small className={cx('tw:flex-none tw:text-[11px] tw:tabular-nums', l.noLeidos && !elegido ? 'tw:font-semibold tw:text-green-softink' : 'tw:text-muted')}>{fechaCorta(l.ultimo?.fecha)}</small>
        </span>
        <span className="tw:flex tw:items-center tw:gap-2">
          <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[12.5px] tw:text-muted">
            {l.ultimo?.de === 'broker' && <span className="tw:font-semibold tw:text-text">Tú: </span>}{l.ultimo?.texto || ''}
          </span>
          {!!l.noLeidos && !elegido && (
            <i className="tw:not-italic tw:flex-none tw:min-w-5 tw:h-5 tw:px-1.5 tw:rounded-full tw:bg-green-edge tw:text-white tw:text-[11px] tw:font-bold tw:leading-5 tw:text-center">
              {l.noLeidos > 99 ? '99+' : l.noLeidos}
            </i>
          )}
        </span>
        <span className="tw:mt-0.5 tw:flex tw:flex-wrap tw:items-center tw:gap-1">
          <Badge tono={TONO_ESTADO[l.estado] ?? 'gris'} punto className={CHICO}>{l.estadoTxt}</Badge>
          {verCorredor && (l.corredor
            ? <Badge tono="gris" icono="user" className={CHICO}>{l.corredor.nombre}</Badge>
            : <Badge tono="amarillo" icono="user" className={CHICO}>Sin corredor</Badge>)}
          {alerta && <Badge tono="rojo" icono="alert" className={CHICO}>{alerta}</Badge>}
        </span>
        {busca && <small className="tw:truncate tw:text-[11.5px] tw:text-muted">{busca}</small>}
      </span>
    </button>
  );
}
