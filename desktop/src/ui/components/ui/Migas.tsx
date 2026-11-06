// Migas de pan: dónde estás y cómo volver. Cada miga con `alTocar` es un enlace; la última es la pantalla actual.
//   <Migas migas={[{ texto: 'Inicio', icono: 'home', alTocar: abrirInicio }, { texto: 'Personas', alTocar: abrirPersonas, id: 'pBack' }, { texto: 'Ana Rojas' }]} />
import { Fragment } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';

export interface IMiga {
  texto: string;
  alTocar?: () => void;
  /** ícono antes del texto (los de src/renderer/icons.js) */
  icono?: string;
  /** id del enlace (lo buscan las pruebas: pBack, fBack…) */
  id?: string;
}

export default function Migas({ migas, className }: { migas: IMiga[]; className?: string }) {
  if (!migas.length) return null;
  return (
    <nav aria-label="Estás en" data-migas className={cx('tw:min-w-0', className)}>
      <ol className="tw:m-0 tw:flex tw:flex-wrap tw:items-center tw:gap-1 tw:p-0 tw:list-none tw:text-[13px]">
        {migas.map((m, i) => {
          const ultima = i === migas.length - 1;
          const contenido = <>{m.icono && <Icono nombre={m.icono} tam={14} />}<span className="tw:truncate">{m.texto}</span></>;
          return (
            <Fragment key={i}>
              {i > 0 && <li aria-hidden className="tw:inline-flex tw:text-muted tw:opacity-60"><Icono nombre="chevR" tam={13} /></li>}
              <li className="tw:inline-flex tw:min-w-0 tw:max-w-[320px]">
                {m.alTocar && !ultima
                  ? (
                    <button type="button" id={m.id} onClick={m.alTocar}
                      className="tw:inline-flex tw:min-w-0 tw:items-center tw:gap-1 tw:-mx-1 tw:px-1 tw:py-0.5 tw:rounded-md tw:border-0 tw:bg-transparent tw:font-semibold tw:text-muted tw:cursor-pointer tw:hover:text-brand tw:hover:bg-hover">
                      {contenido}
                    </button>
                  )
                  : (
                    <span id={m.id} aria-current={ultima ? 'page' : undefined}
                      className={cx('tw:inline-flex tw:min-w-0 tw:items-center tw:gap-1', ultima ? 'tw:font-semibold tw:text-text' : 'tw:text-muted')}>
                      {contenido}
                    </span>
                  )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
