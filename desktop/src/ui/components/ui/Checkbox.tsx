// Casilla filled del kit (misma familia visual que Input/Select: fondo, radio y borde inferior).
//   <Checkbox marcado={sel} alCambiar={setSel} etiqueta="En venta" />
// Usa un <input type="checkbox"> real (accesible, con teclado); el aspecto lo da la pastilla.
import { useId, type ReactNode } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';

interface ICheckboxProps {
  marcado: boolean;
  alCambiar: (marcado: boolean) => void;
  etiqueta?: ReactNode;
  descripcion?: ReactNode;
  deshabilitado?: boolean;
  id?: string;
  className?: string;
}

export default function Checkbox({ marcado, alCambiar, etiqueta, descripcion, deshabilitado = false, id, className }: ICheckboxProps) {
  const auto = useId(); const idCb = id || auto;
  return (
    <div className={cx('tw:inline-flex tw:flex-col tw:gap-1', className)}>
      <label htmlFor={idCb}
        className={cx(
          'tw:relative tw:inline-flex tw:items-center tw:gap-2.5 tw:m-0 tw:min-h-10 tw:px-3 tw:rounded-control',
          'tw:border-0 tw:border-solid tw:border-b-2 tw:select-none tw:transition-[background-color,border-color] tw:duration-150',
          'tw:has-[:focus-visible]:outline-2 tw:has-[:focus-visible]:outline-offset-2 tw:has-[:focus-visible]:outline-lav-edge',
          marcado
            ? 'tw:bg-lav-soft tw:border-b-lav-edge tw:text-lav-softink'
            : 'tw:bg-gray-soft tw:border-b-edge tw:text-text tw:hover:bg-hover',
          deshabilitado ? 'tw:opacity-55 tw:cursor-default' : 'tw:cursor-pointer',
        )}>
        <input type="checkbox" id={idCb} checked={marcado} disabled={deshabilitado} onChange={(e) => alCambiar(e.target.checked)}
          aria-describedby={descripcion ? `${idCb}-desc` : undefined}
          className="tw:peer tw:sr-only" />
        <span aria-hidden="true" className={cx(
          'tw:grid tw:flex-none tw:place-items-center tw:size-[18px] tw:rounded-[6px] tw:border tw:border-solid tw:border-b-2 tw:transition-colors tw:duration-150',
          marcado ? 'tw:bg-lav tw:border-lav-edge tw:text-white' : 'tw:bg-card tw:border-edge tw:border-b-edge-b tw:text-transparent',
        )}>
          <Icono nombre="check" tam={12} />
        </span>
        {etiqueta && <span className="tw:text-sm tw:font-semibold tw:leading-none">{etiqueta}</span>}
      </label>
      {descripcion && <small id={`${idCb}-desc`} className="tw:text-xs tw:text-muted">{descripcion}</small>}
    </div>
  );
}
