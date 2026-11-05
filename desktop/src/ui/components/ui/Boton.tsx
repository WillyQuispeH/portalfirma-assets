// Botón táctil: borde inferior grueso que se hunde al presionar. Relleno y borde degradados (utilidades boton-* de
// styles/globals.css: dos fondos en capas, así el degradado llega también al borde inferior).
//   <Boton>Guardar</Boton>                                  principal (degradado de marca: azul → violeta)
//   <Boton variante="secundario" icono="plus">Nuevo</Boton>
//   <Boton variante="peligro" cargando>Eliminando…</Boton>
// Acepta todos los atributos de <button> (onClick, type, disabled, id, title…).
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';

export type TBotonVariante = 'principal' | 'secundario' | 'fantasma' | 'peligro' | 'exito';
export type TBotonTamano = 'sm' | 'md' | 'lg';

interface IBotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: TBotonVariante;
  tamano?: TBotonTamano;
  icono?: string; // nombre de src/renderer/icons.js, a la izquierda
  iconoDerecha?: string;
  cargando?: boolean;
  bloque?: boolean; // ancho completo
  children?: ReactNode;
}

const BASE = 'tw:relative tw:inline-flex tw:items-center tw:justify-center tw:gap-2 tw:m-0 tw:font-semibold tw:leading-none tw:whitespace-nowrap '
  + 'tw:rounded-[10px] tw:border tw:border-solid tw:select-none tw:cursor-pointer tw:transition-[transform,filter,border-width] tw:duration-100 '
  + 'tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-lav-edge '
  + 'tw:disabled:cursor-default tw:disabled:opacity-55';

// las variantes táctiles tienen borde inferior de 3px que pasa a 1px (y baja 2px) al presionar
const TACTIL = 'tw:border-b-[3px] tw:enabled:active:border-b tw:enabled:active:translate-y-[2px]';

const VARIANTE: Record<TBotonVariante, string> = {
  principal: `${TACTIL} tw:boton-brand tw:text-white tw:enabled:hover:brightness-[1.06]`,
  secundario: `${TACTIL} tw:boton-card tw:text-text tw:enabled:hover:brightness-[0.97]`,
  peligro: `${TACTIL} tw:boton-red tw:text-red-ink tw:enabled:hover:brightness-[1.05]`,
  exito: `${TACTIL} tw:boton-green tw:text-green-ink tw:enabled:hover:brightness-[1.05]`,
  fantasma: 'tw:bg-transparent tw:border-transparent tw:text-muted tw:enabled:hover:bg-hover tw:enabled:hover:text-text',
};

const TAMANO: Record<TBotonTamano, string> = {
  sm: 'tw:h-8 tw:px-3 tw:text-[12.5px]',
  md: 'tw:h-10 tw:px-4 tw:text-sm',
  lg: 'tw:h-12 tw:px-5 tw:text-[15px]',
};
const TAM_ICONO: Record<TBotonTamano, number> = { sm: 14, md: 16, lg: 18 };

function Giro({ tam }: { tam: number }) {
  return (
    <svg className="tw:animate-spin" width={tam} height={tam} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function Boton({ variante = 'principal', tamano = 'md', icono, iconoDerecha, cargando = false, bloque = false, className, children, disabled, type = 'button', ...resto }: IBotonProps) {
  const t = TAM_ICONO[tamano];
  return (
    <button type={type} disabled={disabled || cargando} aria-busy={cargando || undefined}
      className={cx(BASE, VARIANTE[variante], TAMANO[tamano], bloque && 'tw:w-full', className)} {...resto}>
      {cargando ? <Giro tam={t} /> : icono && <Icono nombre={icono} tam={t} />}
      {children}
      {iconoDerecha && !cargando && <Icono nombre={iconoDerecha} tam={t} />}
    </button>
  );
}
