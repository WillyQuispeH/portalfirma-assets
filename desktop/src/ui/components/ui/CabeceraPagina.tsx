// Cabecera de una pantalla: título, texto de apoyo y acciones a la derecha; opcionalmente, «volver» arriba.
//   <CabeceraPagina titulo="Personas" subtitulo="12 en tu CRM" acciones={<Boton icono="plus">Nueva persona</Boton>} />
//   <CabeceraPagina volver={{ texto: 'Personas', alTocar: abrirPersonas, id: 'pBack' }} titulo="Ana Rojas" … />
//   <CabeceraPagina antes={<Avatar nombre="Ana Rojas" tamano="xl" />} sobretitulo="Persona natural · RUT …" … />
//   <CabeceraPagina ilustracion={{ imagen: 'img/formas/personas.svg', tinte: '#6a2fe0' }} … />   (banner con ilustración)
//   <CabeceraPagina pegada migas={[…]} … />   (franja a todo el ancho, fija bajo el menú principal, con migas de pan arriba
//                                               y las acciones a la derecha; así la usa Layout)
// Acciones: a la vista van como mucho dos Boton (el principal siempre); los demás, en el menú «⋯» (MenuMas), con su id.
import { Children, Fragment, isValidElement, useLayoutEffect, useRef, type ComponentProps, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import Boton from './Boton';
import Icono from './Icono';
import MenuMas, { type IOpcionMenu } from './MenuMas';
import Migas, { type IMiga } from './Migas';
import { cx } from '../../utils/cx';

const BOTONES_A_LA_VISTA = 2;
type TBoton = ReactElement<ComponentProps<typeof Boton>>;

/** las acciones en una lista plana (se abren los fragmentos <>…</>) */
function aplanar(nodo: ReactNode): ReactNode[] {
  return Children.toArray(nodo).flatMap((n) => (isValidElement<{ children?: ReactNode }>(n) && n.type === Fragment ? aplanar(n.props.children) : [n]));
}

/** lo que queda a la vista (en su orden) y los Boton que van al menú. Lo que no es Boton (badges, inputs ocultos) queda a la vista. */
function repartir(acciones: ReactNode): { vista: ReactNode[]; menu: IOpcionMenu[] } {
  const todo = aplanar(acciones);
  const botones = todo.filter((n): n is TBoton => isValidElement(n) && n.type === Boton);
  if (botones.length <= BOTONES_A_LA_VISTA) return { vista: todo, menu: [] };
  const principal = botones.find((b) => (b.props.variante ?? 'principal') === 'principal') ?? botones[0];
  const quedan = new Set<TBoton>([principal, ...botones.filter((b) => b !== principal).slice(0, BOTONES_A_LA_VISTA - 1)]);
  return {
    vista: todo.filter((n) => !botones.includes(n as TBoton) || quedan.has(n as TBoton)),
    menu: botones.filter((b) => !quedan.has(b)).map(({ props: p }) => ({
      id: p.id, texto: p.children, icono: p.icono, title: p.title, disabled: p.disabled || p.cargando, alTocar: p.onClick,
    })),
  };
}

interface ICabeceraPaginaProps {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** texto chico sobre el título (tipo, código…) */
  sobretitulo?: ReactNode;
  /** a la izquierda del título (un avatar, una foto) */
  antes?: ReactNode;
  acciones?: ReactNode;
  volver?: { texto: string; alTocar: () => void; id?: string };
  /** banner con una ilustración a la derecha (las de src/renderer/img/formas) y un tinte de color de fondo */
  ilustracion?: { imagen: string; tinte?: string };
  /** migas de pan sobre el título (dónde estás y cómo volver) */
  migas?: IMiga[];
  /** franja a todo el ancho, pegada al menú principal y a los costados de la ventana (ver .ui-cabecera-pegada en globals.css) */
  pegada?: boolean;
  className?: string;
}

/**
 * Pegada: lo que hay sobre el título (las migas) se va con el scroll y quedan fijos el título y las acciones.
 * --cab-oculta: cuánto sube la cabecera antes de fijarse; --cab-visible (en html): su alto ya fija, para el scroll-padding.
 */
function useFijada(activa: boolean) {
  const cabecera = useRef<HTMLElement>(null);
  const fila = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const cab = cabecera.current, f = fila.current;
    if (!activa || !cab || !f) return;
    const medir = () => {
      if (!cab.offsetHeight) return; // la vista está oculta
      const oculta = Math.max(0, f.offsetTop - parseFloat(getComputedStyle(cab).paddingTop));
      cab.style.setProperty('--cab-oculta', `${oculta}px`);
      document.documentElement.style.setProperty('--cab-visible', `${cab.offsetHeight - oculta}px`);
    };
    const obs = new ResizeObserver(medir);
    obs.observe(cab);
    return () => obs.disconnect();
  }, [activa]);
  return { cabecera, fila };
}

export default function CabeceraPagina({ titulo, subtitulo, sobretitulo, antes, acciones, volver, ilustracion, migas, pegada, className }: ICabeceraPaginaProps) {
  const refs = useFijada(!!pegada);
  const botones = repartir(acciones);
  const degradado = ilustracion && `linear-gradient(120deg, var(--cab-fondo, var(--card)) 38%, color-mix(in srgb, ${ilustracion.tinte ?? 'var(--brand)'} 10%, var(--cab-fondo, var(--card))))`;
  // pegada, la ilustración va en una capa aparte (::before en globals.css), difuminada detrás del contenido
  const banner: CSSProperties | undefined = !ilustracion ? undefined : pegada
    // la URL va absoluta: en una variable, una ruta relativa se resolvería contra react-ui.css y no contra la página
    ? { backgroundImage: degradado, '--cab-ilustracion': `url(${new URL(ilustracion.imagen, document.baseURI).href})` } as CSSProperties
    : {
      backgroundImage: `url(${ilustracion.imagen}), ${degradado}`,
      backgroundPosition: 'right 2% bottom -6px, 0 0',
      backgroundSize: 'auto 112%, 100% 100%',
      backgroundRepeat: 'no-repeat',
    };
  const fila = pegada
    ? 'tw:flex tw:flex-wrap tw:items-center tw:gap-x-6 tw:gap-y-3'
    : ilustracion ? 'tw:relative tw:flex tw:flex-col tw:items-start tw:gap-3.5' : 'tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-3';
  return (
    <header ref={refs.cabecera} data-cabecera data-ilustracion={pegada && ilustracion ? '' : undefined} style={banner}
      className={cx(
        !pegada && 'tw:mb-5',
        pegada && 'ui-cabecera-pegada',
        ilustracion && 'tw:overflow-hidden tw:flex tw:flex-col tw:justify-center',
        ilustracion && !pegada && 'tw:relative tw:min-h-[168px] tw:px-7 tw:py-6 tw:rounded-[20px] tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b',
        className,
      )}>
      {migas && <Migas migas={migas} className="tw:mb-2.5" />}
      {volver && (
        <button type="button" id={volver.id} onClick={volver.alTocar}
          className="tw:inline-flex tw:items-center tw:gap-1 tw:mb-3 tw:-ml-1 tw:px-1.5 tw:py-1 tw:rounded-lg tw:border-0 tw:bg-transparent tw:text-[13px] tw:font-semibold tw:text-muted tw:cursor-pointer tw:hover:text-text tw:hover:bg-hover">
          <Icono nombre="chevL" tam={15} /> {volver.texto}
        </button>
      )}
      <div ref={refs.fila} className={fila}>
        {antes}
        <div className={cx('tw:min-w-0', (pegada || !ilustracion) && 'tw:flex-1', ilustracion && !pegada && 'tw:max-w-[52%]')}>
          {sobretitulo && <div className="tw:mb-0.5 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-muted">{sobretitulo}</div>}
          <h1>{titulo}</h1>
          {subtitulo && <div className={cx('tw:mt-1 tw:text-sm tw:text-muted', pegada && 'tw:text-pretty')}>{subtitulo}</div>}
        </div>
        {acciones && (
          <div className={cx('tw:flex tw:flex-wrap tw:items-center tw:gap-2', pegada && 'tw:ml-auto')}>
            {botones.vista}
            {botones.menu.length > 0 && <MenuMas opciones={botones.menu} />}
          </div>
        )}
      </div>
    </header>
  );
}
