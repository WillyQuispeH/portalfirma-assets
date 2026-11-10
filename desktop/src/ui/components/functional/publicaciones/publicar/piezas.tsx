// Piezas que comparten los pasos del flujo «Publicar».
import type { ReactNode } from 'react';
import Icono from '../../../ui/Icono';
import { cx } from '../../../../utils/cx';
import { SUAVE, type TTono } from '../../../ui/tonos';
import type { TTipoAviso } from '../../../../store/interfaces/publicacion.interface';

// dos columnas en pantallas anchas, con las mismas proporciones que las fichas
export const COLUMNAS = 'tw:grid tw:gap-4 tw:lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] tw:items-start';

export const TIPO_AVISO: Record<TTipoAviso, string> = { silver: 'Plata', gold: 'Oro', gold_premium: 'Oro Premium' };

// sigla y color de cada portal
const LOGO: Record<string, [string, TTono]> = { pi: ['PI', 'amarillo'], chilepropiedades: ['CP', 'azul'], toctoc: ['TT', 'verde'], yapo: ['YA', 'durazno'] };

export function LogoPortal({ id, nombre }: { id: string; nombre: string }) {
  const [sigla, tono] = LOGO[id] || [nombre.slice(0, 2).toUpperCase(), 'gris' as TTono];
  return <span aria-hidden="true" className={cx('tw:grid tw:size-10 tw:flex-none tw:place-items-center tw:rounded-xl tw:text-[13px] tw:font-extrabold tw:tracking-tight', SUAVE[tono])}>{sigla}</span>;
}

// la fila de abajo de cada paso: a la izquierda «Volver» o un aviso, a la derecha la acción principal
export function PieNav({ izquierda, derecha }: { izquierda?: ReactNode; derecha: ReactNode }) {
  return (
    <div className="pb-nav tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
      <div className="tw:min-w-0 tw:flex-1">{izquierda}</div>
      <div className="tw:flex tw:flex-none tw:items-center tw:gap-2">{derecha}</div>
    </div>
  );
}

export function Aviso({ tono, icono, children }: { tono: TTono; icono: string; children: ReactNode }) {
  return (
    <p role={tono === 'rojo' ? 'alert' : undefined} className={cx('tw:m-0 tw:flex tw:items-start tw:gap-2 tw:rounded-xl tw:px-3 tw:py-2 tw:text-[13px]', SUAVE[tono])}>
      <span className="tw:mt-px tw:flex-none"><Icono nombre={icono} tam={15} /></span><span>{children}</span>
    </p>
  );
}
