// Lista desplegable filled (etiqueta adentro, borde inferior) con menú propio del kit (no el <select> nativo).
//   <Select etiqueta="País" opciones={[['cl', 'Chile'], ['ar', 'Argentina']]} value={pais} onChange={(e) => setPais(e.target.value)} />
//   <Select etiqueta="Tipo"><option value="">Todos</option>…</Select>
// El <select> nativo queda oculto (mismas pruebas e2e: selectOption / inputValue) y el menú va en un portal.
import {
  Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState,
  type ChangeEvent, type KeyboardEvent, type ReactElement, type ReactNode, type Ref, type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import Campo, { CAJA } from './Campo';
import { cx } from '../../utils/cx';

type TOpcion = [string, string];

interface ISelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string | null;
  /** valor válido: fondo verde y ✓ */
  ok?: boolean;
  /** falta completarlo: borde amarillo (el contenedor lleva la clase «falta») */
  pendiente?: boolean;
  ref?: Ref<HTMLSelectElement>;
  /** valor propuesto por Asset: fondo lila */
  resaltado?: boolean;
  opciones?: TOpcion[];
  vacia?: string; // primera opción con valor '' (p. ej. «Todos»)
  clasesCampo?: string;
}

function textoDe(nodo: ReactNode): string {
  if (nodo == null || typeof nodo === 'boolean') return '';
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoDe).join('');
  if (isValidElement<{ children?: ReactNode }>(nodo)) return textoDe(nodo.props.children);
  return '';
}

/** opciones del prop, la vacía y las <option> hijas (en ese orden, sin duplicar valor) */
function reunir(opciones: TOpcion[] | undefined, vacia: string | undefined, children: ReactNode): TOpcion[] {
  const out: TOpcion[] = [];
  const visto = new Set<string>();
  const add = (v: string, t: string) => { if (visto.has(v)) return; visto.add(v); out.push([v, t]); };
  if (vacia !== undefined) add('', vacia);
  for (const [v, t] of opciones || []) add(v, t);
  // las <option> dentro de un <optgroup> también cuentan (se listan en orden, sin el título del grupo)
  const recorrer = (hijos: ReactNode) => Children.forEach(hijos, (n) => {
    if (!isValidElement(n)) return;
    if (n.type === 'optgroup') return recorrer((n as ReactElement<{ children?: ReactNode }>).props.children);
    if (n.type !== 'option') return;
    const p = (n as ReactElement<{ value?: string | number; children?: ReactNode }>).props;
    add(String(p.value ?? ''), textoDe(p.children));
  });
  recorrer(children);
  return out;
}

export default function Select({
  etiqueta, ayuda, error, ok, pendiente, resaltado, opciones, vacia, clasesCampo, className, id, children,
  value, defaultValue, disabled, name, onChange, onBlur, ref, 'aria-label': ariaLabel, ...resto
}: ISelectProps) {
  const auto = useId(); const idCampo = id || auto;
  const listaId = `${idCampo}-lista`;
  const nativo = useRef<HTMLSelectElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxH: 280, origen: 'top' as 'top' | 'bottom' });
  const [interno, setInterno] = useState(String(defaultValue ?? ''));
  const controlado = value !== undefined;
  const actual = String(controlado ? value : interno);
  const items = reunir(opciones, vacia, children);
  const elegido = items.find(([v]) => v === actual)?.[1] ?? (actual || 'Elegir…');

  // ref externo → el <select> nativo (formularios / pruebas)
  useEffect(() => {
    if (!ref) return;
    if (typeof ref === 'function') ref(nativo.current);
    else ref.current = nativo.current;
  });

  const elegir = (v: string) => {
    if (!controlado) setInterno(v);
    if (nativo.current) nativo.current.value = v;
    onChange?.({ target: nativo.current ?? { value: v, name: name || '' } } as ChangeEvent<HTMLSelectElement>);
    setAbierto(false);
    disparador.current?.focus();
  };

  /** debajo del disparador; si no cabe (pie fijo, borde de ventana), abre hacia arriba */
  const ubicar = () => {
    const caja = disparador.current?.closest('[data-campo]') as HTMLElement | null;
    const r = (caja || disparador.current)?.getBoundingClientRect();
    if (!r) return;
    const gap = 6;
    const margen = 8;
    const pie = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pie-alto')) || 0;
    const suelo = window.innerHeight - pie - margen;
    const techo = margen;
    const abajo = Math.max(0, suelo - (r.bottom + gap));
    const arriba = Math.max(0, r.top - gap - techo);
    const preferido = Math.min(280, Math.round(window.innerHeight * 0.5));
    const mh = menu.current?.offsetHeight || preferido;
    const width = Math.max(r.width, 160);
    let top = r.bottom + gap;
    let maxH = preferido;
    let origen: 'top' | 'bottom' = 'top';
    if (mh > abajo && arriba > abajo) {
      maxH = Math.min(preferido, Math.floor(arriba));
      top = r.top - gap - Math.min(mh, maxH);
      origen = 'bottom';
    } else {
      maxH = Math.min(preferido, Math.floor(abajo));
      if (top + Math.min(mh, maxH) > suelo) top = Math.max(techo, suelo - Math.min(mh, maxH));
    }
    setPos({ top, left: r.left, width, maxH: Math.max(120, maxH), origen });
  };

  useLayoutEffect(() => {
    if (!abierto) return;
    ubicar();
    // segunda pasada: ya medimos el alto real del menú (con las opciones pintadas)
    const id = requestAnimationFrame(ubicar);
    const sel = menu.current?.querySelector<HTMLElement>('[aria-selected="true"]')
      || menu.current?.querySelector<HTMLElement>('[role="option"]');
    sel?.focus();
    return () => cancelAnimationFrame(id);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !disparador.current?.contains(t) && !disparador.current?.closest('[data-campo]')?.contains(t)) {
        setAbierto(false);
      }
    };
    document.addEventListener('pointerdown', fuera);
    window.addEventListener('scroll', ubicar, true);
    window.addEventListener('resize', ubicar);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      window.removeEventListener('scroll', ubicar, true);
      window.removeEventListener('resize', ubicar);
    };
  }, [abierto]);

  const tecladoDisparo = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); setAbierto(true);
    }
  };
  const tecladoMenu = (e: KeyboardEvent<HTMLDivElement>) => {
    const lista = [...(menu.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const i = lista.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); setAbierto(false); disparador.current?.focus(); return; }
    if (e.key === 'Tab') { setAbierto(false); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const v = lista[i]?.dataset.value; if (v != null) elegir(v);
      return;
    }
    let j = -1;
    if (e.key === 'ArrowDown') j = (i + 1) % lista.length;
    else if (e.key === 'ArrowUp') j = (i - 1 + lista.length) % lista.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = lista.length - 1;
    if (j < 0) return;
    e.preventDefault(); lista[j]?.focus();
  };

  return (
    <Campo id={idCampo} etiqueta={etiqueta} ayuda={ayuda} error={error} ok={ok} pendiente={pendiente} resaltado={resaltado}
      className={cx(pendiente && 'falta', clasesCampo)}>
      {/* disparador visible: valor + flecha; toda la superficie filled abre el menú */}
      <button ref={disparador} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={abierto}
        aria-controls={abierto ? listaId : undefined} aria-invalid={!!error || undefined}
        aria-describedby={error || ayuda ? `${idCampo}-msj` : undefined}
        aria-label={ariaLabel || (typeof etiqueta === 'string' ? etiqueta : undefined)}
        onClick={() => !disabled && setAbierto((a) => !a)} onKeyDown={tecladoDisparo} onBlur={onBlur as never}
        className={cx(CAJA, 'tw:flex tw:items-center tw:gap-1.5 tw:w-full tw:min-w-0 tw:text-left tw:cursor-pointer', className)}>
        <span className={cx('tw:block tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap', !actual && 'tw:text-muted')}>{elegido}</span>
        <svg className={cx('tw:ml-auto tw:flex-none tw:shrink-0 tw:text-muted tw:transition-transform tw:duration-150', abierto && 'tw:rotate-180 tw:text-brand')} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {/* nativo oculto: selectOption / inputValue de las pruebas y envío de formularios */}
      <select ref={nativo} id={idCampo} tabIndex={-1} aria-hidden="true" name={name} disabled={disabled}
        className="tw:sr-only" aria-label={ariaLabel} {...resto} value={actual}
        onChange={(e) => { if (!controlado) setInterno(e.target.value); onChange?.(e); }}
        onFocus={() => { if (!disabled) setAbierto(true); }}>
        {items.map(([v, t]) => <option key={v || '__vacia'} value={v}>{t}</option>)}
      </select>

      {abierto && createPortal(
        <div ref={menu} id={listaId} role="listbox" data-menu-select aria-label={typeof etiqueta === 'string' ? etiqueta : undefined}
          onKeyDown={tecladoMenu}
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
          className={cx(
            'tw:fixed tw:z-[1600] tw:overflow-y-auto tw:p-1.5 tw:rounded-card tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:shadow-[0_16px_40px_-12px_rgb(16_24_64/.28)] tw:animate-[menu-entra_.16s_cubic-bezier(.25,1,.5,1)] tw:motion-reduce:animate-none',
            pos.origen === 'bottom' ? 'tw:origin-bottom' : 'tw:origin-top',
          )}>
          {items.map(([v, t]) => {
            const on = v === actual;
            return (
              <button key={v || '__vacia'} type="button" role="option" aria-selected={on} data-value={v} tabIndex={-1}
                onClick={() => elegir(v)}
                className={cx(
                  'tw:flex tw:w-full tw:items-center tw:gap-2.5 tw:m-0 tw:min-h-9 tw:px-2.5 tw:py-1.5 tw:rounded-control tw:border-0 tw:text-left tw:text-sm tw:cursor-pointer tw:transition-colors tw:duration-100',
                  'tw:focus-visible:outline-none',
                  on ? 'tw:bg-lav-soft tw:text-lav-softink tw:font-semibold' : 'tw:bg-transparent tw:text-text tw:font-medium tw:hover:bg-hover tw:focus-visible:bg-hover',
                )}>
                <span className="tw:min-w-0 tw:flex-1 tw:truncate">{t}</span>
                {on && (
                  <svg className="tw:flex-none tw:text-lav-softink" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </Campo>
  );
}
