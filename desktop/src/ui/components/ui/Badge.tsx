// Etiqueta corta de estado o categoría.
//   <Badge tono="verde">Disponible</Badge>
//   <Badge tono="amarillo" punto>Por revisar</Badge>
//   <Badge tono="azul" variante="tactil" icono="check">Firmado</Badge>
//   <Badge tono="amarillo" ajustar>Esperando firmas: promesa de compraventa</Badge>   (texto largo en poco espacio)
import type { ReactNode } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';
import { PUNTO, RELLENO, SUAVE, type TTono } from './tonos';

interface IBadgeProps {
  tono?: TTono;
  variante?: 'suave' | 'tactil'; // tactil: relleno con borde inferior, para destacar
  punto?: boolean;
  icono?: string;
  /** el texto puede ocupar varias líneas (textos largos en una tarjeta angosta) */
  ajustar?: boolean;
  className?: string;
  children: ReactNode;
}

export default function Badge({ tono = 'gris', variante = 'suave', punto = false, icono, ajustar = false, className, children }: IBadgeProps) {
  return (
    <span className={cx(
      'tw:inline-flex tw:items-center tw:gap-1.5 tw:px-2.5 tw:text-xs tw:font-semibold tw:align-middle',
      ajustar ? 'tw:min-h-6 tw:py-1 tw:leading-tight tw:text-left' : 'tw:h-6 tw:whitespace-nowrap',
      variante === 'tactil' ? cx(RELLENO[tono], 'tw:rounded-md tw:border tw:border-solid tw:border-b-2') : cx(SUAVE[tono], ajustar ? 'tw:rounded-lg' : 'tw:rounded-full'),
      className,
    )}>
      {punto && <span className={cx('tw:size-1.5 tw:rounded-full', PUNTO[tono])} aria-hidden="true" />}
      {icono && <Icono nombre={icono} tam={12} />}
      {children}
    </span>
  );
}
