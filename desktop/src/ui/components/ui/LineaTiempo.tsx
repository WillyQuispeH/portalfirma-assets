// Historial en línea de tiempo: lo más reciente arriba; las entradas destacadas (notas escritas a mano) resaltan.
//   <LineaTiempo items={actividad.map((a) => ({ texto: a.texto, fecha: fechaHora(a.fecha), destacado: a.tipo === 'nota' }))} />
// Cada <li> lleva data-nota si está destacado (lo usan las pruebas).
import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';

export interface IItemLinea {
  texto: ReactNode;
  fecha?: ReactNode;
  destacado?: boolean;
}

interface ILineaTiempoProps {
  items: IItemLinea[];
  vacio?: ReactNode;
  className?: string;
}

export default function LineaTiempo({ items, vacio = 'Sin movimientos todavía.', className }: ILineaTiempoProps) {
  if (!items.length) return <p className="tw:m-0 tw:text-[13px] tw:text-muted">{vacio}</p>;
  return (
    <ul data-historial className={cx('tw:m-0 tw:p-0 tw:list-none', className)}>
      {items.map((a, i) => (
        <li key={i} {...(a.destacado ? { 'data-nota': '' } : {})} className="tw:relative tw:flex tw:gap-3 tw:pb-3.5 tw:last:pb-0">
          {/* punto y línea que une con el siguiente */}
          <span className="tw:relative tw:flex-none tw:w-3 tw:flex tw:justify-center">
            <span className={cx('tw:mt-1.5 tw:w-2.5 tw:h-2.5 tw:rounded-full tw:border-2 tw:border-solid', a.destacado ? 'tw:bg-lav tw:border-lav-edge' : 'tw:bg-card tw:border-edge-b')} />
            {i < items.length - 1 && <span className="tw:absolute tw:top-5 tw:-bottom-1.5 tw:w-px tw:bg-edge" />}
          </span>
          <span className={cx('tw:min-w-0 tw:flex-1 tw:text-sm tw:leading-snug', a.destacado && 'tw:px-3 tw:py-2 tw:-mt-1 tw:rounded-xl tw:bg-lav-soft tw:text-lav-ink')}>
            {a.texto}
            {a.fecha && <small className={cx('tw:block tw:mt-0.5 tw:text-xs', a.destacado ? 'tw:text-lav-softink' : 'tw:text-muted')}>{a.fecha}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}
