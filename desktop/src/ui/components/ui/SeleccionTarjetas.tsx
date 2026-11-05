// Elegir una o varias opciones con tarjetas táctiles (ícono, título y descripción). La elegida se marca con el
// borde y el check; con el teclado se recorre con Tab y se elige con Espacio o Enter.
//   <SeleccionTarjetas etiqueta="Roles" valor={roles} alCambiar={setRoles} opciones={[
//     { valor: 'propietario', titulo: 'Propietario', descripcion: 'Dueño de una propiedad', icono: 'key' },
//     { valor: 'interesado', titulo: 'Interesado', descripcion: 'Busca comprar o arrendar', icono: 'search' },
//   ]} />
//   <SeleccionTarjetas unica valor={[tipo]} alCambiar={([t]) => setTipo(t)} … />   (una sola: radio)
// Cada tarjeta lleva data-opcion con su valor (para las pruebas).
import { useId, type ReactNode } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';

export interface IOpcionTarjeta<T extends string> {
  valor: T;
  titulo: ReactNode;
  descripcion?: ReactNode;
  icono?: string;
}

interface ISeleccionTarjetasProps<T extends string> {
  opciones: IOpcionTarjeta<T>[];
  valor: T[];
  alCambiar: (v: T[]) => void;
  /** una sola opción (como radio); por defecto, varias */
  unica?: boolean;
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  /** columnas en pantallas anchas (en angostas, una o dos) */
  columnas?: 2 | 3 | 4;
  id?: string;
  className?: string;
}

const COLUMNAS = { 2: 'tw:sm:grid-cols-2', 3: 'tw:sm:grid-cols-2 tw:lg:grid-cols-3', 4: 'tw:sm:grid-cols-2 tw:lg:grid-cols-4' };

export default function SeleccionTarjetas<T extends string>({
  opciones, valor, alCambiar, unica = false, etiqueta, ayuda, columnas = 3, id, className,
}: ISeleccionTarjetasProps<T>) {
  const auto = useId(); const base = id || auto;
  const elegir = (k: T) => {
    if (unica) return alCambiar([k]);
    alCambiar(valor.includes(k) ? valor.filter((x) => x !== k) : [...valor, k]);
  };
  return (
    <div className={className}>
      {(etiqueta || ayuda) && (
        <div className="tw:flex tw:items-baseline tw:justify-between tw:gap-3 tw:mb-2">
          {etiqueta && <span id={`${base}-et`} className="tw:text-[13px] tw:font-semibold tw:text-text">{etiqueta}</span>}
          {ayuda && <span className="tw:text-xs tw:text-muted">{ayuda}</span>}
        </div>
      )}
      <div id={id} role={unica ? 'radiogroup' : 'group'} aria-labelledby={etiqueta ? `${base}-et` : undefined}
        className={cx('tw:grid tw:grid-cols-1 tw:gap-2.5', COLUMNAS[columnas])}>
        {opciones.map((o) => {
          const on = valor.includes(o.valor);
          return (
            <button key={o.valor} type="button" data-opcion={o.valor}
              {...(unica ? { role: 'radio', 'aria-checked': on } : { 'aria-pressed': on })}
              onClick={() => elegir(o.valor)}
              className={cx(
                'tw:group tw:relative tw:flex tw:items-start tw:gap-3 tw:m-0 tw:p-3 tw:pr-9 tw:text-left tw:rounded-xl tw:cursor-pointer tw:font-[inherit]',
                'tw:border tw:border-solid tw:border-b-[3px] tw:transition-[transform,background-color,border-color] tw:duration-100',
                'tw:active:translate-y-px tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-lav-edge',
                on ? 'tw:bg-lav-soft tw:border-lav-edge' : 'tw:bg-card tw:border-edge tw:border-b-edge-b tw:hover:bg-sunken',
              )}>
              {o.icono && (
                <span className={cx('tw:flex-none tw:grid tw:place-items-center tw:w-9 tw:h-9 tw:rounded-lg tw:transition-colors',
                  on ? 'tw:bg-lav tw:text-lav-ink' : 'tw:bg-sunken tw:text-muted tw:group-hover:text-text')}>
                  <Icono nombre={o.icono} tam={17} />
                </span>
              )}
              <span className="tw:min-w-0 tw:pt-0.5">
                <b className={cx('tw:block tw:text-sm tw:font-semibold', on ? 'tw:text-lav-softink' : 'tw:text-text')}>{o.titulo}</b>
                {o.descripcion && <small className={cx('tw:block tw:mt-0.5 tw:text-xs tw:leading-snug', on ? 'tw:text-lav-softink tw:opacity-85' : 'tw:text-muted')}>{o.descripcion}</small>}
              </span>
              {/* el check (o el círculo vacío) arriba a la derecha */}
              <span aria-hidden="true" className={cx('tw:absolute tw:top-3 tw:right-3 tw:grid tw:place-items-center tw:w-5 tw:h-5 tw:rounded-full tw:border tw:border-solid',
                on ? 'tw:boton-brand tw:text-white' : 'tw:bg-card tw:border-edge-b')}>
                {on && <Icono nombre="check" tam={12} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
