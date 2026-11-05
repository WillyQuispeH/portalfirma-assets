// Selección múltiple con fichas que se prenden y apagan (aria-pressed): roles, etiquetas, filtros.
//   <Chips etiqueta="Roles" opciones={[['propietario', 'Propietario'], ['interesado', 'Interesado']]}
//     valor={roles} alCambiar={setRoles} />
import { useId, type ReactNode } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';

interface IChipsProps<T extends string> {
  opciones: [T, string][];
  valor: T[];
  alCambiar: (v: T[]) => void;
  etiqueta?: ReactNode;
  id?: string;
  className?: string;
}

export default function Chips<T extends string>({ opciones, valor, alCambiar, etiqueta, id, className }: IChipsProps<T>) {
  const auto = useId(); const idEt = `${id || auto}-et`;
  const alternar = (k: T) => alCambiar(valor.includes(k) ? valor.filter((x) => x !== k) : [...valor, k]);
  return (
    <div className={className}>
      {etiqueta && <span id={idEt} className="tw:block tw:mb-1.5 tw:text-[13px] tw:font-semibold tw:text-text">{etiqueta}</span>}
      <div id={id} role="group" aria-labelledby={etiqueta ? idEt : undefined} className="tw:flex tw:flex-wrap tw:gap-2">
        {opciones.map(([k, t]) => {
          const on = valor.includes(k);
          return (
            <button key={k} type="button" aria-pressed={on} data-chip={k} onClick={() => alternar(k)}
              className={cx(
                'tw:inline-flex tw:items-center tw:gap-1.5 tw:h-8 tw:m-0 tw:px-3 tw:rounded-full tw:text-[13px] tw:font-semibold tw:cursor-pointer',
                'tw:border tw:border-solid tw:transition-colors tw:duration-100 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-1 tw:focus-visible:outline-lav-edge',
                on ? 'tw:bg-lav-soft tw:text-lav-softink tw:border-lav-edge' : 'tw:bg-card tw:text-muted tw:border-edge tw:hover:text-text tw:hover:bg-hover',
              )}>
              {on && <Icono nombre="check" tam={13} />}
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}
