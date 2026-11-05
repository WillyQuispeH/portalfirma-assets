// Partes comunes de Input y Select: etiqueta, texto de ayuda o error, y las clases de la caja.
import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';

// caja del campo: fondo hundido, borde inferior un poco más marcado y anillo lavanda al enfocar.
// tw:focus:* gana a la regla input:focus de styles.css (más específica que un selector de elemento).
export const CAJA = 'tw:block tw:w-full tw:m-0 tw:h-10 tw:py-0 tw:px-3 tw:text-sm tw:text-text tw:bg-field '
  + 'tw:rounded-[10px] tw:border tw:border-solid tw:border-edge tw:border-b-2 tw:border-b-edge-b '
  + 'tw:shadow-[inset_0_1px_2px_rgb(0_0_0/0.05)] tw:transition-[border-color,box-shadow] tw:duration-100 '
  + 'tw:placeholder:text-muted tw:focus:outline-none tw:focus:border-lav-edge tw:focus:ring-[3px] tw:focus:ring-lav/60 '
  + 'tw:disabled:opacity-60 tw:disabled:cursor-not-allowed';
export const CAJA_ERROR = 'tw:border-red-edge tw:focus:border-red-edge tw:focus:ring-red/50';

interface ICampoProps {
  id: string;
  etiqueta?: ReactNode;
  ayuda?: ReactNode; // texto bajo el campo (en letra monoespaciada si es una URL o un formato)
  error?: string | null;
  className?: string;
  children: ReactNode;
}

export default function Campo({ id, etiqueta, ayuda, error, className, children }: ICampoProps) {
  return (
    <div className={cx('tw:flex tw:flex-col tw:gap-1.5', className)}>
      {etiqueta && <label htmlFor={id} className="tw:block tw:m-0 tw:text-[13px] tw:font-semibold tw:text-text">{etiqueta}</label>}
      {children}
      {error
        ? <small id={`${id}-msj`} className="tw:text-xs tw:text-err" role="alert">{error}</small>
        : ayuda && <small id={`${id}-msj`} className="tw:text-xs tw:text-muted">{ayuda}</small>}
    </div>
  );
}
