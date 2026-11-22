// Partes comunes de Input, Select y Textarea: superficie filled (etiqueta adentro, borde inferior)
// y el texto de ayuda o error. Estados: reposo (gris), foco (azul), ok (verde + ✓), error (rojo),
// pendiente (amarillo) y resaltado (lila, valor propuesto por Asset).
//
// Altura: con etiqueta 56px (= Boton lg, en filas de formulario); sin etiqueta 40px (= Boton md / Tabs),
// para que en barras de filtros buscador, selects, pestañas y botones midan lo mismo.
import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';

/** superficie filled: fondo, radio en las 4 esquinas, borde inferior grueso; el foco lo pinta el focus-within */
export const SUPERFICIE = 'tw:group tw:relative tw:flex tw:items-center tw:gap-2 tw:px-3 tw:bg-gray-soft '
  + 'tw:rounded-control tw:border-0 tw:border-solid tw:border-b-2 tw:border-b-edge '
  + 'tw:transition-[background-color,border-color] tw:duration-150 '
  + 'tw:focus-within:bg-blue-soft tw:focus-within:border-b-brand';
export const SUPERFICIE_ERROR = 'tw:bg-red-soft tw:border-b-red-edge tw:focus-within:bg-red-soft tw:focus-within:border-b-red-edge';
export const SUPERFICIE_OK = 'tw:bg-green-soft tw:border-b-green-edge tw:focus-within:bg-green-soft tw:focus-within:border-b-green-edge';
export const SUPERFICIE_PENDIENTE = 'tw:border-b-yellow-edge tw:focus-within:border-b-yellow-edge';
export const SUPERFICIE_RESALTADA = 'tw:bg-lav-soft';

/** el control dentro de la superficie: sin caja propia (la superficie ya es la caja) */
export const CAJA = 'tw:block tw:w-full tw:m-0 tw:min-h-0 tw:h-auto tw:py-0 tw:px-0 tw:text-sm tw:leading-snug tw:text-text '
  + 'tw:bg-transparent tw:rounded-none tw:border-0 tw:shadow-none tw:outline-none tw:ring-0 '
  + 'tw:focus:outline-none tw:focus:ring-0 tw:focus:border-transparent '
  + 'tw:placeholder:text-muted tw:disabled:opacity-60 tw:disabled:cursor-not-allowed';

/** aliases: quien aplica el estado a la superficie (Input/Select/Textarea vía Campo) */
export const CAJA_ERROR = SUPERFICIE_ERROR;
export const CAJA_PENDIENTE = SUPERFICIE_PENDIENTE;
export const CAJA_RESALTADA = SUPERFICIE_RESALTADA;

/** caja filled compacta para un <input> suelto (p. ej. dentro de una línea de texto) */
export const CAJA_SUELTA = 'tw:m-0 tw:h-8 tw:px-2.5 tw:text-sm tw:text-text tw:bg-gray-soft tw:rounded-control '
  + 'tw:border-0 tw:border-solid tw:border-b-2 tw:border-b-edge tw:shadow-none tw:outline-none '
  + 'tw:transition-[background-color,border-color] tw:duration-150 '
  + 'tw:focus:bg-blue-soft tw:focus:border-b-brand tw:focus:outline-none tw:focus:ring-0 '
  + 'tw:placeholder:text-muted tw:disabled:opacity-60';

// una sola línea: el texto del label no se parte en dos filas
const ETIQUETA = 'tw:block tw:m-0 tw:mb-0.5 tw:text-[11px] tw:font-medium tw:leading-tight tw:whitespace-nowrap tw:text-muted tw:pointer-events-none';

function Ok() {
  return (
    <svg className="tw:flex-none tw:text-green-softink" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

interface ICampoProps {
  id: string;
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string | null;
  /** valor válido: fondo verde y ✓ */
  ok?: boolean;
  /** falta completarlo: borde amarillo (el contenedor lleva la clase «falta») */
  pendiente?: boolean;
  /** valor propuesto por Asset: fondo lila */
  resaltado?: boolean;
  /** a la izquierda del valor (ícono) */
  antes?: ReactNode;
  /** a la derecha del valor (sufijo, flecha del select…) */
  despues?: ReactNode;
  /** superficie más alta y alineada arriba (textarea) */
  multilinea?: boolean;
  className?: string;
  children: ReactNode;
}

export default function Campo({ id, etiqueta, ayuda, error, ok, pendiente, resaltado, antes, despues, multilinea, className, children }: ICampoProps) {
  const valido = !!ok && !error;
  const conEtiqueta = !!etiqueta;
  return (
    <div className={cx('tw:flex tw:flex-col tw:gap-1', className)}>
      <div data-campo data-ok={valido || undefined} data-error={error ? '' : undefined}
        className={cx(
          SUPERFICIE,
          multilinea ? 'tw:items-start tw:min-h-[6.5rem] tw:py-2.5'
            : conEtiqueta ? 'tw:min-h-14 tw:py-2'
            : 'tw:h-10 tw:py-0',
          error && SUPERFICIE_ERROR,
          valido && SUPERFICIE_OK,
          pendiente && !error && !valido && SUPERFICIE_PENDIENTE,
          resaltado && !error && !valido && SUPERFICIE_RESALTADA,
        )}>
        {antes && <span className={cx('tw:flex-none tw:text-muted', multilinea ? 'tw:mt-1' : 'tw:self-center')}>{antes}</span>}
        <div className="tw:min-w-0 tw:flex-1 tw:flex tw:flex-col tw:justify-center">
          {etiqueta && <label htmlFor={id} className={ETIQUETA}>{etiqueta}</label>}
          {children}
        </div>
        {valido && <span className={cx('tw:flex-none', multilinea ? 'tw:mt-1' : 'tw:self-center')}><Ok /></span>}
        {despues && <span className={cx('tw:flex-none tw:text-muted tw:group-focus-within:text-brand', multilinea ? 'tw:mt-1' : 'tw:self-center')}>{despues}</span>}
      </div>
      {error
        ? <small id={`${id}-msj`} className="tw:text-xs tw:text-err" role="alert">{error}</small>
        : ayuda && <small id={`${id}-msj`} className="tw:text-xs tw:text-muted">{ayuda}</small>}
    </div>
  );
}
