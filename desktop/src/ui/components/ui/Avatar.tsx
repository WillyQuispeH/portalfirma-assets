// Avatar con las iniciales de un nombre. El color sale del nombre (siempre el mismo para la misma persona).
//   <Avatar nombre="María González" />            <Avatar nombre="Inmobiliaria Sur SpA" tamano="xl" />
import { cx } from '../../utils/cx';
import { SUAVE, type TTono } from './tonos';

export type TAvatarTamano = 'sm' | 'md' | 'lg' | 'xl';

const TAMANO: Record<TAvatarTamano, string> = {
  sm: 'tw:w-7 tw:h-7 tw:text-[11px] tw:rounded-lg',
  md: 'tw:w-9 tw:h-9 tw:text-[13px] tw:rounded-xl',
  lg: 'tw:w-12 tw:h-12 tw:text-base tw:rounded-2xl',
  xl: 'tw:w-16 tw:h-16 tw:text-[22px] tw:rounded-[20px]',
};
const TONOS: TTono[] = ['lavanda', 'azul', 'verde', 'durazno', 'amarillo', 'rojo'];

/** «María José González» → «MG»; «Inmobiliaria Sur SpA» → «IS». */
export const iniciales = (nombre: string) => {
  const p = String(nombre || '').trim().split(/\s+/).filter((x) => /^[\p{L}\d]/u.test(x));
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length > 2 ? 2 : 1][0] : '')).toUpperCase();
};

const tonoDe = (nombre: string) => {
  let h = 0;
  for (const c of String(nombre)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONOS[h % TONOS.length];
};

interface IAvatarProps {
  nombre: string;
  tamano?: TAvatarTamano;
  tono?: TTono; // si no se da, sale del nombre
  className?: string;
}

export default function Avatar({ nombre, tamano = 'md', tono, className }: IAvatarProps) {
  return (
    <span aria-hidden="true" className={cx('tw:inline-grid tw:flex-none tw:place-items-center tw:font-bold tw:tracking-tight tw:select-none', TAMANO[tamano], SUAVE[tono ?? tonoDe(nombre)], className)}>
      {iniciales(nombre)}
    </span>
  );
}
