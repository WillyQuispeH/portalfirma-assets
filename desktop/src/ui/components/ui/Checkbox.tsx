// Casilla de verificación reutilizable (caja del kit + palomita), con etiqueta y descripción opcionales.
//   <Checkbox marcado={sel} alCambiar={setSel} etiqueta="Enviar a Ana" descripcion="+56 9 1234 5678" />
// Usa un <input type="checkbox"> real (accesible, con teclado); el aspecto lo da la caja de al lado.
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
    <div className={cx('tw:flex tw:items-start tw:gap-2.5', className)}>
      <span className="tw:relative tw:inline-flex tw:flex-none tw:mt-px">
        <input type="checkbox" id={idCb} checked={marcado} disabled={deshabilitado} onChange={(e) => alCambiar(e.target.checked)}
          aria-describedby={descripcion ? `${idCb}-desc` : undefined}
          className="tw:peer tw:absolute tw:inset-0 tw:m-0 tw:size-full tw:opacity-0 tw:cursor-pointer tw:disabled:cursor-default" />
        <span aria-hidden="true" className={cx(
          'tw:flex tw:items-center tw:justify-center tw:size-5 tw:rounded-md tw:border tw:border-solid tw:border-b-2 tw:transition-colors tw:duration-150',
          'tw:peer-focus-visible:outline-2 tw:peer-focus-visible:outline-offset-2 tw:peer-focus-visible:outline-lav-edge',
          marcado ? 'tw:bg-lav tw:border-lav-edge tw:text-white' : 'tw:bg-card tw:border-edge tw:border-b-edge-b',
          deshabilitado && 'tw:opacity-55',
        )}>
          {marcado && <Icono nombre="check" tam={13} />}
        </span>
      </span>
      {(etiqueta || descripcion) && (
        <div className="tw:min-w-0">
          {etiqueta && <label htmlFor={idCb} className={cx('tw:block tw:m-0 tw:text-sm tw:font-semibold tw:text-text', deshabilitado ? 'tw:opacity-70' : 'tw:cursor-pointer')}>{etiqueta}</label>}
          {descripcion && <small id={`${idCb}-desc`} className="tw:block tw:mt-0.5 tw:text-xs tw:text-muted">{descripcion}</small>}
        </div>
      )}
    </div>
  );
}
