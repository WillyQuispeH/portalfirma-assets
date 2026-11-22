import { useEffect, useLayoutEffect, type CSSProperties, type ReactNode, type Ref } from 'react';
import CabeceraPagina from './CabeceraPagina';
import FooterPagina from './FooterPagina';
import type { IMiga } from './Migas';
import { cx } from '../../utils/cx';
import { abrirInicio } from '../../utils/app';

type TCabecera = Omit<Parameters<typeof CabeceraPagina>[0], 'className' | 'migas' | 'pegada'>;

export const MIGA_INICIO: IMiga = { texto: 'Inicio', icono: 'home', alTocar: abrirInicio };

/** Inicio › [volver] › pantalla actual. Si «volver» lleva a Inicio, esa miga es la de Inicio (con el id de volver). */
function rastroPorDefecto(volver: TCabecera['volver'], actual: string): IMiga[] {
  const inicio = volver?.texto === MIGA_INICIO.texto ? { ...MIGA_INICIO, id: volver.id } : MIGA_INICIO;
  const medio = volver && volver.texto !== MIGA_INICIO.texto ? [{ texto: volver.texto, alTocar: volver.alTocar, id: volver.id }] : [];
  return [inicio, ...medio, ...(actual ? [{ texto: actual }] : [])];
}

/** el ancho de la barra de desplazamiento vertical, para que la cabecera pegada llegue justo a los bordes (ver globals.css) */
function useAnchoBarra() {
  useLayoutEffect(() => {
    const medir = () => document.documentElement.style.setProperty('--ancho-barra', `${window.innerWidth - document.documentElement.clientWidth}px`);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(document.body);
    window.addEventListener('resize', medir);
    return () => { obs.disconnect(); window.removeEventListener('resize', medir); };
  }, []);
}

/** html[data-desplazada] mientras la ventana no está arriba del todo (la sombra de la cabecera fija, ver globals.css) */
function useDesplazada() {
  useEffect(() => {
    const marcar = () => document.documentElement.toggleAttribute('data-desplazada', window.scrollY > 0);
    marcar();
    window.addEventListener('scroll', marcar, { passive: true });
    return () => window.removeEventListener('scroll', marcar);
  }, []);
}

interface ILayoutProps extends Partial<TCabecera> {
  barra?: ReactNode;
  children?: ReactNode;
  tinte?: string;
  /** @deprecated el espacio entre bloques es siempre --ui-gap; se conserva por las pantallas que lo pasan */
  espacio?: 'normal' | 'compacto' | 'pantalla';
  id?: string;
  className?: string;
  contenidoClassName?: string;
  cabeceraClassName?: string;
  pieClassName?: string;
  /** componentes a la izquierda del pie (FooterPagina) */
  pieIzquierda?: ReactNode;
  /** botones / acciones a la derecha del pie, pegados al borde */
  pieAcciones?: ReactNode;
  fondo?: false | ReactNode;
  ref?: Ref<HTMLDivElement>;
  migas?: IMiga[] | false;
  miga?: string;
  altoCompleto?: boolean;
}

export default function Layout({
  barra, children, tinte, espacio: _espacio = 'normal', id, className, contenidoClassName, cabeceraClassName,
  pieClassName, pieIzquierda, pieAcciones, fondo, ref, titulo, migas, miga, volver, altoCompleto, ...cabecera
}: ILayoutProps) {
  useAnchoBarra();
  useDesplazada();
  const color = tinte ?? cabecera.ilustracion?.tinte ?? 'var(--brand)';
  const tintado: CSSProperties = {
    background: `radial-gradient(1100px 380px at 12% -8%, color-mix(in srgb, ${color} 7%, transparent), transparent 72%),`
      + ` radial-gradient(900px 340px at 100% 0%, color-mix(in srgb, ${color} 4%, transparent), transparent 70%), var(--bg)`,
  };
  const rastro = migas === false ? undefined : migas ?? rastroPorDefecto(volver, miga ?? (typeof titulo === 'string' ? titulo : ''));
  const conPie = pieIzquierda != null || pieAcciones != null;
  return (
    // entre la cabecera, la barra y el contenido, el mismo margen que a los costados y abajo (ver main:has(…) en globals.css)
    <div ref={ref} id={id} data-layout data-con-pie={conPie ? '' : undefined} data-alto-completo={altoCompleto ? '' : undefined}
      // alto completo: la ventana menos el menú principal (56px), el padding de arriba de main (20px), el margen de abajo y el pie
      className={cx(
        // altoCompleto: la altura la pone globals.css (.im-wrap[data-alto-completo]); sin overflow aquí para no cortar la cabecera
        'im-wrap tw:relative tw:flex tw:flex-col tw:gap-ui',
        className,
      )}>
      {/* el fondo general: fijo detrás de la pantalla; se va con ella cuando la vista se oculta */}
      {fondo === undefined
        ? <div aria-hidden data-layout-fondo className="tw:pointer-events-none tw:fixed tw:inset-0 tw:-z-10" style={tintado} />
        : fondo}
      {titulo != null && (
        <CabeceraPagina pegada migas={rastro} titulo={titulo} {...cabecera}
          // con la ventana quieta no hace falta que se pegue: relative (no static) por la ilustración en ::before
          className={cx(altoCompleto && 'tw:relative! tw:top-auto! tw:shrink-0', cabeceraClassName)} />
      )}
      {barra && <div data-layout-barra className={cx('tw:flex tw:flex-wrap tw:items-center tw:gap-ui', altoCompleto && 'tw:shrink-0')}>{barra}</div>}
      <div data-layout-contenido className={cx('tw:flex tw:min-w-0 tw:flex-col tw:gap-ui', altoCompleto && 'tw:min-h-0 tw:flex-1 tw:overflow-hidden tw:[&>*]:min-h-0', contenidoClassName)}>
        {children}
      </div>
      {conPie && (
        <FooterPagina pegada izquierda={pieIzquierda} acciones={pieAcciones} className={pieClassName} />
      )}
    </div>
  );
}
