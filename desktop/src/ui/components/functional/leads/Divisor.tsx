// Asa entre dos columnas de Leads: arrastrándola cambia el ancho de la lista (lado «lista») o de la ficha (lado «ficha»).
// Es una columna más de la grilla .ld-cols (8px, ver styles.css). El ancho va en las variables --ld-lista / --ld-ficha
// de .ld-cols, sin pasar por React (no se vuelve a dibujar la bandeja en cada movimiento), y queda en localStorage.
// Doble clic: el ancho de siempre. Con el teclado: flechas izquierda y derecha.
import { useLayoutEffect, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react';

type TLado = 'lista' | 'ficha';
const LLAVE = 'pf.leads.anchos';
const MINIMO = 240;
const CHAT_MINIMO = 360;
const PASO_TECLA = 24;

const leer = (): Partial<Record<TLado, number>> => { try { return JSON.parse(localStorage.getItem(LLAVE) || '{}'); } catch { return {}; } };
const guardar = (lado: TLado, px: number | undefined) => {
  try { localStorage.setItem(LLAVE, JSON.stringify({ ...leer(), [lado]: px })); } catch { /* sin almacenamiento */ }
};
const columna = (cols: HTMLElement, lado: TLado) => cols.querySelector<HTMLElement>(lado === 'lista' ? ':scope > .ld-lista' : ':scope > .ld-ficha');

/** pone en .ld-cols los anchos guardados (Leads lo usa una vez, al montar) */
export function useAnchosGuardados(cols: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const el = cols.current; if (!el) return;
    const a = leer();
    (['lista', 'ficha'] as TLado[]).forEach((l) => { if (a[l]) el.style.setProperty(`--ld-${l}`, `${a[l]}px`); });
  }, [cols]);
}

function fijar(cols: HTMLElement, lado: TLado, px: number) {
  const otro = columna(cols, lado === 'lista' ? 'ficha' : 'lista')?.offsetWidth ?? 0;
  const maximo = cols.clientWidth - otro - CHAT_MINIMO - 16;
  const ancho = Math.round(Math.max(MINIMO, Math.min(px, maximo)));
  cols.style.setProperty(`--ld-${lado}`, `${ancho}px`);
  return ancho;
}

export default function Divisor({ lado }: { lado: TLado }) {
  const titulo = lado === 'lista' ? 'Arrastra para cambiar el ancho de la lista' : 'Arrastra para cambiar el ancho de la ficha';

  const empezar = (e: PointerEvent<HTMLDivElement>) => {
    const asa = e.currentTarget; const cols = asa.parentElement; const col = cols && columna(cols, lado);
    if (!cols || !col) return;
    e.preventDefault();
    asa.setPointerCapture(e.pointerId);
    const x0 = e.clientX; const ancho0 = col.offsetWidth; let ancho = ancho0;
    document.body.style.cursor = 'col-resize';
    const mover = (ev: globalThis.PointerEvent) => { const dx = ev.clientX - x0; ancho = fijar(cols, lado, lado === 'lista' ? ancho0 + dx : ancho0 - dx); };
    const soltar = () => {
      asa.removeEventListener('pointermove', mover); asa.removeEventListener('pointerup', soltar); asa.removeEventListener('pointercancel', soltar);
      document.body.style.cursor = '';
      guardar(lado, ancho);
    };
    asa.addEventListener('pointermove', mover); asa.addEventListener('pointerup', soltar); asa.addEventListener('pointercancel', soltar);
  };

  const reiniciar = (e: MouseEvent<HTMLDivElement>) => {
    e.currentTarget.parentElement?.style.removeProperty(`--ld-${lado}`);
    guardar(lado, undefined);
  };

  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const cols = e.currentTarget.parentElement; const col = cols && columna(cols, lado);
    if (!cols || !col || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const crece = (e.key === 'ArrowRight') === (lado === 'lista');
    guardar(lado, fijar(cols, lado, col.offsetWidth + (crece ? PASO_TECLA : -PASO_TECLA)));
  };

  return (
    <div role="separator" aria-orientation="vertical" aria-label={titulo} title={`${titulo} (doble clic: ancho normal)`} tabIndex={0}
      data-lado={lado} onPointerDown={empezar} onDoubleClick={reiniciar} onKeyDown={teclas}
      // en ventanas angostas las columnas se apilan (ver .ld-cols en styles.css) y no hay qué arrastrar
      className="ld-div tw:group tw:flex tw:max-[1181px]:hidden tw:cursor-col-resize tw:touch-none tw:select-none tw:items-center tw:justify-center tw:outline-none">
      <span className="tw:h-10 tw:w-[3px] tw:rounded-full tw:bg-edge tw:transition-colors tw:duration-150 tw:group-hover:bg-lav-edge tw:group-focus-visible:bg-lav-edge tw:group-active:bg-brand" />
    </div>
  );
}