// Etiqueta corta de estado o categoría.
//   <Badge tono="verde">Disponible</Badge>
//   <Badge tono="amarillo" punto>Por revisar</Badge>
//   <Badge tono="azul" variante="tactil" icono="check">Firmado</Badge>
import type { ReactNode } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';
import { PUNTO, RELLENO, SUAVE, type TTono } from './tonos';

interface IBadgeProps {
  tono?: TTono;
  variante?: 'suave' | 'tactil'; // tactil: relleno con borde inferior, para destacar
  punto?: boolean;
  icono?: string;
  className?: string;
  children: ReactNode;
}

export default function Badge({ tono = 'gris', variante = 'suave', punto = false, icono, className, children }: IBadgeProps) {
  return (
    <span className={cx(
      'tw:inline-flex tw:items-center tw:gap-1.5 tw:h-6 tw:px-2.5 tw:rounded-full tw:text-xs tw:font-semibold tw:whitespace-nowrap tw:align-middle',
      variante === 'tactil' ? cx(RELLENO[tono], 'tw:rounded-md tw:border tw:border-solid tw:border-b-2') : SUAVE[tono],
      className,
    )}>
      {punto && <span className={cx('tw:size-1.5 tw:rounded-full', PUNTO[tono])} aria-hidden="true" />}
      {icono && <Icono nombre={icono} tam={12} />}
      {children}
    </span>
  );
}
