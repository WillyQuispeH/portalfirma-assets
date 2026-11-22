// Pie de una pantalla: componentes a la izquierda y acciones (botones) a la derecha.
//   <FooterPagina izquierda={<span>3 cambios sin guardar</span>} acciones={<Boton>Guardar</Boton>} />
//   <FooterPagina pegada … />   (franja a todo el ancho, fija al fondo de la ventana; así la usa Layout)
// Layout reserva su altura con --pie-alto para que el contenido no quede tapado.
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cx } from '../../utils/cx';

interface IFooterPaginaProps {
  /** a la izquierda (texto, estado, info…) */
  izquierda?: ReactNode;
  /** a la derecha, pegado al borde (botones, acciones) */
  acciones?: ReactNode;
  /** franja a todo el ancho, fija al fondo de la ventana (ver .ui-pie-pegado en globals.css) */
  pegada?: boolean;
  className?: string;
}

/** mide el alto del pie y lo deja en --pie-alto (en el Layout y en html) para el padding y el scroll */
function useAltoPie(activa: boolean) {
  const pie = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = pie.current;
    if (!activa || !el) return;
    const medir = () => {
      if (!el.offsetHeight) return; // la vista está oculta
      const alto = `${el.offsetHeight}px`;
      const layout = el.closest('[data-layout]') as HTMLElement | null;
      layout?.style.setProperty('--pie-alto', alto);
      document.documentElement.style.setProperty('--pie-alto', alto);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => {
      obs.disconnect();
      const layout = el.closest('[data-layout]') as HTMLElement | null;
      layout?.style.removeProperty('--pie-alto');
      document.documentElement.style.removeProperty('--pie-alto');
    };
  }, [activa]);
  return pie;
}

export default function FooterPagina({ izquierda, acciones, pegada, className }: IFooterPaginaProps) {
  const ref = useAltoPie(!!pegada);
  if (izquierda == null && acciones == null) return null;
  return (
    <footer ref={ref} data-pie
      className={cx(
        'tw:flex tw:flex-wrap tw:items-center tw:gap-ui',
        pegada && 'ui-pie-pegado',
        !pegada && 'tw:mt-ui tw:rounded-card tw:border tw:border-solid tw:border-edge tw:border-t-[3px] tw:border-t-edge-b tw:bg-card tw:px-4 tw:py-3',
        className,
      )}>
      {izquierda != null && <div className="tw:min-w-0 tw:flex-1 tw:flex tw:flex-wrap tw:items-center tw:gap-ui">{izquierda}</div>}
      {acciones != null && (
        <div className={cx('tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-ui', izquierda == null && 'tw:ml-auto tw:w-full')}>
          {acciones}
        </div>
      )}
    </footer>
  );
}
