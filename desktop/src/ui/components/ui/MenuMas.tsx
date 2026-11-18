// Botón «⋯» con un menú de acciones (role="menu"). Lo usa CabeceraPagina para las acciones que no caben a la vista.
//   <MenuMas opciones={[{ id: 'imDict', texto: 'Dictar', icono: 'mic', alTocar: dictar }]} />
// Teclado: Enter/Espacio/↓ abre; ↑ ↓ Inicio Fin recorren; Escape o Tab cierran (el foco vuelve al botón).
// El menú va en un portal con posición fija: así no lo recorta la cabecera (overflow-hidden) ni queda bajo el contenido.
// Se ancla al botón y se voltea (izquierda/derecha, arriba/abajo) si no cabe en el viewport.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Boton from './Boton';
import Icono from './Icono';
import { cx } from '../../utils/cx';

export interface IOpcionMenu {
  texto: ReactNode;
  alTocar?: (e: MouseEvent<HTMLButtonElement>) => void;
  icono?: string;
  /** id del botón (lo buscan las pruebas, los recorridos y styles.css) */
  id?: string;
  title?: string;
  disabled?: boolean;
}

interface IMenuMasProps {
  opciones: IOpcionMenu[];
  /** para lectores de pantalla y el globo del botón */
  etiqueta?: string;
  /** id del botón «⋯» */
  id?: string;
  /** contenido del botón (por defecto, el ícono «⋯») */
  contenido?: ReactNode;
  className?: string;
  /** el tamaño del botón «⋯» (el de Boton) */
  tamano?: 'sm' | 'md';
}

const MARGEN = 8;

export default function MenuMas({ opciones, etiqueta = 'Más acciones', id, contenido, className, tamano = 'md' }: IMenuMasProps) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, origen: 'top-right' as 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' });
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const conIconos = opciones.some((o) => o.icono); // las que no tienen ícono dejan su espacio: los textos quedan alineados

  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    .filter((el) => el.offsetParent !== null); // los que styles.css oculta (p. ej. según el perfil) no cuentan
  const cerrar = (devolverFoco = true) => { setAbierto(false); if (devolverFoco) boton.current?.focus(); };

  const ubicar = () => {
    if (!boton.current) return;
    const r = boton.current.getBoundingClientRect();
    const mw = menu.current?.offsetWidth || 220;
    const mh = menu.current?.offsetHeight || 0;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    // por defecto: borde derecho del menú = borde derecho del botón (abre hacia la izquierda)
    let left = r.right - mw;
    let anclaX: 'right' | 'left' = 'right';
    if (left < MARGEN) {
      // no cabe a la izquierda → alinear al borde izquierdo del botón
      left = r.left;
      anclaX = 'left';
    }
    if (left + mw > vw - MARGEN) left = Math.max(MARGEN, vw - mw - MARGEN);
    if (left < MARGEN) left = MARGEN;

    let top = r.bottom + 6;
    let anclaY: 'top' | 'bottom' = 'top';
    if (mh > 0 && top + mh > vh - MARGEN && r.top - 6 - mh >= MARGEN) {
      top = r.top - 6 - mh;
      anclaY = 'bottom';
    } else if (mh > 0 && top + mh > vh - MARGEN) {
      top = Math.max(MARGEN, vh - mh - MARGEN);
    }

    setPos({
      top,
      left,
      origen: `${anclaY}-${anclaX}` as typeof pos.origen,
    });
  };

  useLayoutEffect(() => {
    if (!abierto) return;
    ubicar();
    // segunda pasada cuando el menú ya midió su ancho/alto reales
    const idFrame = requestAnimationFrame(ubicar);
    items()[0]?.focus();
    return () => cancelAnimationFrame(idFrame);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !boton.current?.contains(t)) cerrar(false);
    };
    // con scroll (incl. contenedores anidados) o al cambiar la ventana, el menú sigue al botón
    document.addEventListener('pointerdown', fuera);
    window.addEventListener('scroll', ubicar, true);
    window.addEventListener('resize', ubicar);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      window.removeEventListener('scroll', ubicar, true);
      window.removeEventListener('resize', ubicar);
    };
  }, [abierto]);

  const tecladoBoton = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' && !abierto) { e.preventDefault(); setAbierto(true); }
  };
  const tecladoMenu = (e: KeyboardEvent<HTMLDivElement>) => {
    const lista = items(); const i = lista.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); return; }
    if (e.key === 'Tab') { cerrar(false); return; }
    let j = -1;
    if (e.key === 'ArrowDown') j = (i + 1) % lista.length;
    else if (e.key === 'ArrowUp') j = (i - 1 + lista.length) % lista.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = lista.length - 1;
    if (j < 0) return;
    e.preventDefault(); lista[j]?.focus();
  };

  return (
    <>
      <Boton ref={boton} id={id} variante="secundario" tamano={tamano} data-mas aria-label={etiqueta} title={etiqueta} aria-haspopup="menu" aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)} onKeyDown={tecladoBoton} className={cx(tamano === 'sm' ? 'tw:w-8' : 'tw:w-10', 'tw:px-0', className)}>
        {contenido ?? <Icono nombre="dots" tam={tamano === 'sm' ? 16 : 18} />}
      </Boton>
      {abierto && createPortal(
        <div ref={menu} role="menu" data-menu-mas aria-label={etiqueta} onKeyDown={tecladoMenu} style={{ top: pos.top, left: pos.left }}
          className={cx(
            'tw:fixed tw:z-[90] tw:min-w-[220px] tw:max-w-[320px] tw:p-1.5 tw:rounded-card tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:shadow-[0_16px_40px_-12px_rgb(16_24_64/.28)] tw:animate-[menu-entra_.16s_cubic-bezier(.25,1,.5,1)]',
            pos.origen === 'top-right' && 'tw:origin-top-right',
            pos.origen === 'top-left' && 'tw:origin-top-left',
            pos.origen === 'bottom-right' && 'tw:origin-bottom-right',
            pos.origen === 'bottom-left' && 'tw:origin-bottom-left',
          )}>
          {opciones.map((o, k) => (
            <button key={o.id ?? k} type="button" role="menuitem" id={o.id} title={o.title} disabled={o.disabled} tabIndex={-1}
              onClick={(e) => { cerrar(); o.alTocar?.(e); }}
              className="tw:flex tw:w-full tw:items-center tw:gap-2.5 tw:m-0 tw:h-9 tw:px-2.5 tw:rounded-control tw:border-0 tw:bg-transparent tw:text-left tw:text-sm tw:font-medium tw:text-text tw:cursor-pointer tw:hover:bg-hover tw:focus-visible:bg-hover tw:focus-visible:outline-none tw:disabled:cursor-default tw:disabled:opacity-55">
              {o.icono ? <span className="tw:text-muted"><Icono nombre={o.icono} tam={16} /></span> : conIconos && <span className="tw:w-4 tw:shrink-0" />}
              <span className="tw:truncate">{o.texto}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
