import { useEffect, useLayoutEffect, type CSSProperties, type ReactNode, type Ref } from 'react';
import CabeceraPagina from './CabeceraPagina';
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
  /** bajo la cabecera: buscador, pestañas, filtros */
  barra?: ReactNode;
  children?: ReactNode;
  /** color del tinte del fondo general (por defecto, el de la ilustración o el de la marca) */
  tinte?: string;
  /** espacio entre los bloques del contenido */
  espacio?: 'normal' | 'compacto';
  id?: string;
  className?: string;
  /** clases del contenedor del contenido (p. ej. una grilla) */
  contenidoClassName?: string;
  /** clases de la cabecera (p. ej. una clase que buscan las pruebas o el recorrido de Aprende) */
  cabeceraClassName?: string;
  /** el fondo general: false = sin fondo (la pantalla pone el suyo), o un nodo propio que reemplaza al tinte */
  fondo?: false | ReactNode;
  /** referencia al contenedor de la pantalla (p. ej. para la luz guía de etapas.js) */
  ref?: Ref<HTMLDivElement>;
  /** migas de pan (la última es la pantalla actual); false = sin migas. Por defecto: Inicio › [volver] › título */
  migas?: IMiga[] | false;
  /** texto de la última miga cuando el título no es texto (por defecto, el título) */
  miga?: string;
}

export default function Layout({ barra, children, tinte, espacio = 'normal', id, className, contenidoClassName, cabeceraClassName, fondo, ref, titulo, migas, miga, volver, ...cabecera }: ILayoutProps) {
  useAnchoBarra();
  useDesplazada();
  const color = tinte ?? cabecera.ilustracion?.tinte ?? 'var(--brand)';
  const tintado: CSSProperties = {
    background: `radial-gradient(1100px 380px at 12% -8%, color-mix(in srgb, ${color} 7%, transparent), transparent 72%),`
      + ` radial-gradient(900px 340px at 100% 0%, color-mix(in srgb, ${color} 4%, transparent), transparent 70%), var(--bg)`,
  };
  const rastro = migas === false ? undefined : migas ?? rastroPorDefecto(volver, miga ?? (typeof titulo === 'string' ? titulo : ''));
  const gap = espacio === 'compacto' ? 'tw:gap-3' : 'tw:gap-5';
  // bajo la cabecera, el mismo aire que a los costados: 24px (padding de main 20px + .im-wrap 4px) = gap + este margen
  const bajoCabecera = espacio === 'compacto' ? 'tw:mb-3' : 'tw:mb-1';
  return (
    <div ref={ref} id={id} data-layout className={cx('im-wrap tw:relative tw:flex tw:flex-col', gap, className)}>
      {/* el fondo general: fijo detrás de la pantalla; se va con ella cuando la vista se oculta */}
      {fondo === undefined
        ? <div aria-hidden data-layout-fondo className="tw:pointer-events-none tw:fixed tw:inset-0 tw:-z-10" style={tintado} />
        : fondo}
      {titulo != null && <CabeceraPagina pegada migas={rastro} titulo={titulo} {...cabecera} className={cx(bajoCabecera, cabeceraClassName)} />}
      {barra && <div data-layout-barra className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">{barra}</div>}
      <div data-layout-contenido className={cx('tw:flex tw:min-w-0 tw:flex-col', espacio === 'compacto' ? 'tw:gap-3' : 'tw:gap-4', contenidoClassName)}>
        {children}
      </div>
    </div>
  );
}
