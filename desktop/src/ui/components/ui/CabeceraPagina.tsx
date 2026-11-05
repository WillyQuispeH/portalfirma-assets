// Cabecera de una pantalla: título, texto de apoyo y acciones a la derecha; opcionalmente, «volver» arriba.
//   <CabeceraPagina titulo="Personas" subtitulo="12 en tu CRM" acciones={<Boton icono="plus">Nueva persona</Boton>} />
//   <CabeceraPagina volver={{ texto: 'Personas', alTocar: abrirPersonas, id: 'pBack' }} titulo="Ana Rojas" … />
//   <CabeceraPagina antes={<Avatar nombre="Ana Rojas" tamano="xl" />} sobretitulo="Persona natural · RUT …" … />
//   <CabeceraPagina ilustracion={{ imagen: 'img/formas/personas.svg', tinte: '#6a2fe0' }} … />   (banner con ilustración)
import type { CSSProperties, ReactNode } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';

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
  className?: string;
}

export default function CabeceraPagina({ titulo, subtitulo, sobretitulo, antes, acciones, volver, ilustracion, className }: ICabeceraPaginaProps) {
  const banner: CSSProperties | undefined = ilustracion && {
    backgroundImage: `url(${ilustracion.imagen}), linear-gradient(120deg, var(--card) 38%, color-mix(in srgb, ${ilustracion.tinte ?? 'var(--brand)'} 10%, var(--card)))`,
    backgroundPosition: 'right 2% bottom -6px, 0 0',
    backgroundSize: 'auto 112%, 100% 100%',
    backgroundRepeat: 'no-repeat',
  };
  return (
    <header data-cabecera style={banner}
      className={cx('tw:mb-5', ilustracion && 'tw:relative tw:overflow-hidden tw:flex tw:flex-col tw:justify-center tw:min-h-[168px] tw:px-7 tw:py-6 tw:rounded-[20px] tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b', className)}>
      {volver && (
        <button type="button" id={volver.id} onClick={volver.alTocar}
          className="tw:inline-flex tw:items-center tw:gap-1 tw:mb-3 tw:-ml-1 tw:px-1.5 tw:py-1 tw:rounded-lg tw:border-0 tw:bg-transparent tw:text-[13px] tw:font-semibold tw:text-muted tw:cursor-pointer tw:hover:text-text tw:hover:bg-hover">
          <Icono nombre="chevL" tam={15} /> {volver.texto}
        </button>
      )}
      <div className={ilustracion ? 'tw:relative tw:flex tw:flex-col tw:items-start tw:gap-3.5' : 'tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-3'}>
        {antes}
        <div className={cx('tw:min-w-0', ilustracion ? 'tw:max-w-[52%]' : 'tw:flex-1')}>
          {sobretitulo && <div className="tw:mb-0.5 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-muted">{sobretitulo}</div>}
          <h1 className="tw:m-0 tw:text-[26px] tw:font-bold tw:leading-tight tw:tracking-tight">{titulo}</h1>
          {subtitulo && <div className="tw:mt-1 tw:text-sm tw:text-muted">{subtitulo}</div>}
        </div>
        {acciones && <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">{acciones}</div>}
      </div>
    </header>
  );
}
