// Esqueleto de carga: la silueta de lo que todavía no llega (con un brillo que pasa), en vez de «Cargando…».
// Se arma con la misma forma que el contenido real, para que al llegar los datos nada salte de lugar.
//   <Esqueleto ancho="60%" />                       una línea de texto (alto de texto chico)
//   <Esqueleto ancho={120} alto={14} />             una línea más alta (un título)
//   <Esqueleto forma="circulo" ancho={36} />        punto, avatar redondo
//   <Esqueleto forma="icono" ancho={36} />          cuadrito de ícono o avatar del kit
//   <Esqueleto forma="control" alto={36} />         campo, botón (ancho completo por defecto)
//   <Esqueleto forma="bloque" alto={120} />         imagen, burbuja, tarjeta
//   <EsqueletoTexto lineas={3} />                   párrafo: la última línea más corta
//   <EsqueletoZona etiqueta="Cargando conversaciones">…</EsqueletoZona>   avisa a los lectores de pantalla
// El brillo va sincronizado entre todas las piezas (ver .ui-esqueleto en globals.css) y se apaga con «reducir movimiento».
import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../../utils/cx';

type TMedida = number | string;
type TForma = 'linea' | 'circulo' | 'icono' | 'control' | 'bloque';

const FORMA: Record<TForma, string> = {
  linea: 'tw:rounded-full',
  circulo: 'tw:rounded-full',
  icono: 'tw:rounded-icono',
  control: 'tw:rounded-control',
  bloque: 'tw:rounded-card',
};
const ALTO: Record<TForma, TMedida | undefined> = { linea: 10, circulo: undefined, icono: undefined, control: 36, bloque: 80 };

const px = (m: TMedida | undefined) => (typeof m === 'number' ? `${m}px` : m);

interface IEsqueletoProps {
  forma?: TForma;
  ancho?: TMedida;
  alto?: TMedida;
  className?: string;
  style?: CSSProperties;
}

export default function Esqueleto({ forma = 'linea', ancho, alto, className, style }: IEsqueletoProps) {
  const cuadrado = forma === 'circulo' || forma === 'icono';
  const a = ancho ?? (cuadrado ? 36 : '100%');
  return (
    <span aria-hidden="true" className={cx('ui-esqueleto tw:block tw:flex-none', FORMA[forma], className)}
      style={{ width: px(a), height: px(alto ?? (cuadrado ? a : ALTO[forma])), ...style }} />
  );
}

/** un párrafo: líneas de ancho completo y la última más corta */
export function EsqueletoTexto({ lineas = 3, ultima = '60%', alto = 10, className }: { lineas?: number; ultima?: TMedida; alto?: TMedida; className?: string }) {
  return (
    <span aria-hidden="true" className={cx('tw:flex tw:flex-col tw:gap-2', className)}>
      {Array.from({ length: lineas }, (_, i) => <Esqueleto key={i} alto={alto} ancho={i === lineas - 1 && lineas > 1 ? ultima : '100%'} />)}
    </span>
  );
}

/** el contenedor de un esqueleto: dice «cargando» a los lectores de pantalla (las piezas van ocultas) */
export function EsqueletoZona({ etiqueta = 'Cargando', className, children }: { etiqueta?: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={etiqueta} className={className}>
      {children}
    </div>
  );
}
