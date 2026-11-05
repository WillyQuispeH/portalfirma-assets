// Mensaje para una lista o sección sin datos: ícono, título, texto y una acción opcional.
//   <EstadoVacio icono="users" titulo="Aún no hay personas" texto="Se crean al importar propiedades…"
//     accion={<Boton icono="plus">Nueva persona</Boton>} />
//   <EstadoVacio compacto texto="No está vinculada a ninguna propiedad." />   (dentro de una tarjeta)
import type { ReactNode } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';

interface IEstadoVacioProps {
  icono?: string;
  titulo?: ReactNode;
  texto?: ReactNode;
  accion?: ReactNode;
  compacto?: boolean;
  className?: string;
}

export default function EstadoVacio({ icono, titulo, texto, accion, compacto = false, className }: IEstadoVacioProps) {
  if (compacto) return <p className={cx('tw:m-0 tw:py-1 tw:text-[13px] tw:text-muted', className)}>{texto ?? titulo}</p>;
  return (
    <div className={cx('tw:flex tw:flex-col tw:items-center tw:text-center tw:gap-2 tw:px-6 tw:py-10', className)}>
      {icono && (
        <span className="tw:grid tw:place-items-center tw:w-14 tw:h-14 tw:mb-1 tw:rounded-2xl tw:bg-lav-soft tw:text-lav-softink">
          <Icono nombre={icono} tam={26} />
        </span>
      )}
      {titulo && <h3 className="tw:m-0 tw:text-base tw:font-bold tw:text-text">{titulo}</h3>}
      {texto && <p className="tw:m-0 tw:max-w-[440px] tw:text-sm tw:leading-relaxed tw:text-muted">{texto}</p>}
      {accion && <div className="tw:mt-2">{accion}</div>}
    </div>
  );
}
