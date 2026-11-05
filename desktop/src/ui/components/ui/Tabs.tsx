// Pestañas (role="tablist"): se recorren con las flechas, Inicio y Fin.
//   <Tabs opciones={[['reclamos', 'Reclamos', 4], ['unidades', 'Unidades']]} valor={tab} alCambiar={setTab} />
//   <Tabs variante="linea" … />       (subrayado, para separar secciones de una ficha)
// Cada opción: [valor, texto, cuenta?, icono?]. El contenido de cada pestaña lo dibuja quien la usa.
// `dato`: nombre de un atributo data-* con el valor de cada pestaña (p. ej. 'r' → data-r="interesado"), para las pruebas.
import { useRef, type KeyboardEvent } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';

export type TTabOpcion<T extends string> = [T, string, number?, string?];

interface ITabsProps<T extends string> {
  opciones: TTabOpcion<T>[];
  valor: T;
  alCambiar: (v: T) => void;
  variante?: 'segmentos' | 'linea';
  etiqueta?: string; // para lectores de pantalla
  id?: string;
  dato?: string;
  className?: string;
}

export default function Tabs<T extends string>({ opciones, valor, alCambiar, variante = 'segmentos', etiqueta, id, dato, className }: ITabsProps<T>) {
  const lista = useRef<HTMLDivElement>(null);

  const teclado = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = opciones.findIndex(([v]) => v === valor); let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % opciones.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + opciones.length) % opciones.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = opciones.length - 1;
    if (j < 0) return;
    e.preventDefault(); alCambiar(opciones[j][0]);
    lista.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[j]?.focus();
  };

  const segmentos = variante === 'segmentos';
  return (
    <div ref={lista} role="tablist" aria-label={etiqueta} id={id} onKeyDown={teclado}
      className={cx(segmentos
        ? 'tw:inline-flex tw:gap-1 tw:p-1 tw:rounded-xl tw:bg-sunken tw:border tw:border-solid tw:border-edge'
        : 'tw:flex tw:gap-5 tw:border-b tw:border-edge', className)}>
      {opciones.map(([v, texto, cuenta, icono]) => {
        const on = v === valor;
        return (
          <button key={v} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} data-tab={v} {...(dato ? { [`data-${dato}`]: v } : {})}
            onClick={() => alCambiar(v)}
            className={cx(
              'tw:inline-flex tw:items-center tw:gap-2 tw:m-0 tw:text-sm tw:font-semibold tw:cursor-pointer tw:whitespace-nowrap tw:transition-colors tw:duration-100',
              'tw:focus-visible:outline-2 tw:focus-visible:outline-offset-1 tw:focus-visible:outline-lav-edge',
              segmentos
                ? cx('tw:h-8 tw:px-3 tw:rounded-lg tw:border tw:border-solid',
                  on ? 'tw:bg-card tw:text-text tw:border-edge tw:border-b-2 tw:border-b-edge-b' : 'tw:bg-transparent tw:border-transparent tw:text-muted tw:hover:text-text')
                : cx('tw:h-10 tw:px-0.5 tw:rounded-none tw:bg-transparent tw:border-0 tw:border-b-2 tw:-mb-px',
                  on ? 'tw:border-lav-edge tw:text-text' : 'tw:border-transparent tw:text-muted tw:hover:text-text'),
            )}>
            {icono && <Icono nombre={icono} tam={15} />}
            {texto}
            {cuenta != null && (
              <span className={cx('tw:min-w-5 tw:h-5 tw:px-1.5 tw:rounded-full tw:text-[11px] tw:leading-5 tw:text-center',
                on ? 'tw:bg-lav-soft tw:text-lav-softink' : 'tw:bg-gray-soft tw:text-gray-softink')}>{cuenta}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
