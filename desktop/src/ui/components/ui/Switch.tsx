// Interruptor de encendido/apagado (role="switch", se usa con teclado: Espacio o Enter).
//   <Switch activo={auto} alCambiar={setAuto} etiqueta="Responder solo" descripcion="Fernanda atiende por WhatsApp" />
import { useId, type ReactNode } from 'react';
import { cx } from '../../utils/cx';

interface ISwitchProps {
  activo: boolean;
  alCambiar: (activo: boolean) => void;
  etiqueta?: ReactNode;
  descripcion?: ReactNode;
  deshabilitado?: boolean;
  id?: string;
  className?: string;
}

export default function Switch({ activo, alCambiar, etiqueta, descripcion, deshabilitado = false, id, className }: ISwitchProps) {
  const auto = useId(); const idSw = id || auto;
  const boton = (
    <button type="button" role="switch" id={idSw} aria-checked={activo} disabled={deshabilitado}
      aria-describedby={descripcion ? `${idSw}-desc` : undefined}
      onClick={() => alCambiar(!activo)}
      className={cx(
        'tw:relative tw:inline-flex tw:flex-none tw:items-center tw:w-11 tw:h-[26px] tw:m-0 tw:p-0 tw:rounded-full tw:cursor-pointer',
        'tw:border tw:border-solid tw:border-b-2 tw:transition-colors tw:duration-150',
        'tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-lav-edge',
        'tw:disabled:opacity-55 tw:disabled:cursor-default',
        activo ? 'tw:bg-lav tw:border-lav-edge' : 'tw:bg-sunken tw:border-edge tw:border-b-edge-b',
      )}>
      <span aria-hidden="true" className={cx(
        'tw:absolute tw:top-[2px] tw:size-[18px] tw:rounded-full tw:bg-card tw:border tw:border-solid tw:border-edge-b',
        'tw:shadow-[0_1px_2px_rgb(0_0_0/0.15)] tw:transition-[left] tw:duration-150',
        activo ? 'tw:left-[21px] tw:border-lav-edge' : 'tw:left-[2px]',
      )} />
    </button>
  );
  if (!etiqueta && !descripcion) return <span className={className}>{boton}</span>;
  return (
    <div className={cx('tw:flex tw:items-start tw:gap-3', className)}>
      {boton}
      <div className="tw:min-w-0">
        {etiqueta && <label htmlFor={idSw} className="tw:block tw:m-0 tw:text-sm tw:font-semibold tw:text-text tw:cursor-pointer">{etiqueta}</label>}
        {descripcion && <small id={`${idSw}-desc`} className="tw:block tw:mt-0.5 tw:text-xs tw:text-muted">{descripcion}</small>}
      </div>
    </div>
  );
}
