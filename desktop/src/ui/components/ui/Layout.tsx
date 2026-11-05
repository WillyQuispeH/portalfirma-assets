// Layout de una pantalla de la app: todas se arman igual.
//   1. el fondo general (una capa fija detrás de todo, con un tinte suave de la marca o del color de la pantalla);
//   2. la cabecera (CabeceraPagina: título, texto de apoyo, ilustración, «volver» y acciones a la derecha);
//   3. una barra opcional bajo la cabecera (buscador, pestañas, filtros);
//   4. el contenido, con el mismo espaciado vertical entre bloques en todas las pantallas.
//
//   <Layout titulo="Personas" subtitulo="12 en tu CRM" ilustracion={{ imagen: 'img/formas/personas.svg', tinte: '#6a2fe0' }}
//     acciones={<Boton icono="plus">Nueva persona</Boton>}
//     barra={<><Buscador kit … /><Tabs … /></>}>
//     <Tabla … />
//   </Layout>
//
// Con `fondo={false}` la pantalla pone su propio fondo (p. ej. Hoy, con su foto); con `ref`, se engancha el contenedor.
// Sin `titulo` no hay cabecera (para pantallas que la arman a su manera, p. ej. un tablero que ocupa todo).
// El ancho lo sigue decidiendo la app (main y las clases de body: wide, inmo-on…): el layout llena su contenedor.
import type { CSSProperties, ReactNode, Ref } from 'react';
import CabeceraPagina from './CabeceraPagina';
import { cx } from '../../utils/cx';

type TCabecera = Omit<Parameters<typeof CabeceraPagina>[0], 'className'>;

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
}

export default function Layout({ barra, children, tinte, espacio = 'normal', id, className, contenidoClassName, cabeceraClassName, fondo, ref, titulo, ...cabecera }: ILayoutProps) {
  const color = tinte ?? cabecera.ilustracion?.tinte ?? 'var(--brand)';
  const tintado: CSSProperties = {
    background: `radial-gradient(1100px 380px at 12% -8%, color-mix(in srgb, ${color} 7%, transparent), transparent 72%),`
      + ` radial-gradient(900px 340px at 100% 0%, color-mix(in srgb, ${color} 4%, transparent), transparent 70%), var(--bg)`,
  };
  const gap = espacio === 'compacto' ? 'tw:gap-3' : 'tw:gap-5';
  return (
    <div ref={ref} id={id} data-layout className={cx('im-wrap tw:relative tw:flex tw:flex-col', gap, className)}>
      {/* el fondo general: fijo detrás de la pantalla; se va con ella cuando la vista se oculta */}
      {fondo === undefined
        ? <div aria-hidden data-layout-fondo className="tw:pointer-events-none tw:fixed tw:inset-0 tw:-z-10" style={tintado} />
        : fondo}
      {titulo != null && <CabeceraPagina titulo={titulo} {...cabecera} className={cx('tw:mb-0', cabeceraClassName)} />}
      {barra && <div data-layout-barra className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">{barra}</div>}
      <div data-layout-contenido className={cx('tw:flex tw:min-w-0 tw:flex-col', espacio === 'compacto' ? 'tw:gap-3' : 'tw:gap-4', contenidoClassName)}>
        {children}
      </div>
    </div>
  );
}
