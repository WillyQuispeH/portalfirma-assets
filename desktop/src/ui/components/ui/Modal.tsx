// Ventana modal del kit: superficie táctil (borde inferior grueso, como Card y Boton), con título, descripción,
// ícono, cuerpo con desplazamiento propio y pie para las acciones. Controlada: se muestra mientras `abierto`.
//
//   const [ver, setVer] = useState(false);
//   <Modal abierto={ver} onCerrar={() => setVer(false)} titulo="Nuevo usuario" descripcion="Entrará con su correo."
//     icono="users" pie={<><Boton variante="secundario" onClick={() => setVer(false)}>Cancelar</Boton>
//                          <Boton type="submit" form="frmUsuario">Guardar</Boton></>}>
//     <form id="frmUsuario" onSubmit={…}>…</form>
//   </Modal>
//
//   <ModalConfirmar abierto={…} onCerrar={…} titulo="¿Eliminar la propiedad?" mensaje="No se puede deshacer."
//     textoConfirmar="Eliminar" peligro onConfirmar={async () => { … }} />
//
// Accesible: role="dialog" con aria-modal y su título; Esc y el fondo lo cierran (se puede desactivar); el foco
// queda dentro mientras está abierto y vuelve a donde estaba al cerrar; la página de atrás no se desplaza.
// Se dibuja en <body> (portal), por encima de la app y por debajo de la pantalla de ingreso.
// Es independiente del modal antiguo de la app (#modal, utils/modal.tsx), que siguen usando las pantallas migradas.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icono from './Icono';
import Boton from './Boton';
import { cx } from '../../utils/cx';
import { SUAVE, type TTono } from './tonos';

export type TModalTamano = 'sm' | 'md' | 'lg' | 'xl';

interface IModalProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo?: ReactNode;
  descripcion?: ReactNode;
  icono?: string; // nombre de src/renderer/icons.js, en una pastilla junto al título
  tonoIcono?: TTono;
  /** acciones al pie (a la derecha), normalmente botones */
  pie?: ReactNode;
  tamano?: TModalTamano;
  /** false: ni Esc ni el fondo lo cierran (p. ej. mientras se guarda) */
  cerrable?: boolean;
  /** el fondo no lo cierra, pero Esc y la X sí (formularios largos, para no perder lo escrito por un clic) */
  fondoNoCierra?: boolean;
  /** sin padding en el cuerpo (tablas o listas que llegan al borde) */
  sinRelleno?: boolean;
  id?: string;
  className?: string;
  children?: ReactNode;
}

const ANCHO: Record<TModalTamano, string> = {
  sm: 'tw:max-w-[400px]',
  md: 'tw:max-w-[540px]',
  lg: 'tw:max-w-[760px]',
  xl: 'tw:max-w-[1000px]',
};

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// varios modales abiertos a la vez: solo el de más arriba responde a Esc y al Tab
const pila: string[] = [];

export default function Modal({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  icono,
  tonoIcono = 'lavanda',
  pie,
  tamano = 'md',
  cerrable = true,
  fondoNoCierra = false,
  sinRelleno = false,
  id,
  className,
  children,
}: IModalProps) {
  const uid = useId();
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  const puedeCerrar = useRef(cerrable);
  puedeCerrar.current = cerrable;

  useEffect(() => {
    if (!abierto) return;
    const antes = document.activeElement as HTMLElement | null;
    pila.push(uid);
    // la página de atrás no se desplaza mientras está abierto
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // foco: el primer campo o botón del cuerpo; si no hay, la caja
    requestAnimationFrame(() => {
      const c = caja.current; if (!c) return;
      const primero = c.querySelector('[data-modal-cuerpo]')?.querySelector<HTMLElement>(ENFOCABLES) ?? c.querySelector<HTMLElement>(ENFOCABLES);
      (primero ?? c).focus();
    });
    const tecla = (e: KeyboardEvent) => {
      if (pila[pila.length - 1] !== uid) return;
      if (e.key === 'Escape' && puedeCerrar.current) { e.stopPropagation(); cerrar.current(); return; }
      if (e.key !== 'Tab' || !caja.current) return;
      // el Tab da la vuelta dentro del modal
      const f = [...caja.current.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((x) => x.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const [a, z] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('keydown', tecla, true);
      const i = pila.lastIndexOf(uid); if (i >= 0) pila.splice(i, 1);
      if (!pila.length) document.body.style.overflow = overflow;
      if (antes?.isConnected) antes.focus();
    };
  }, [abierto, uid]);

  if (!abierto) return null;
  const tituloId = titulo ? `${uid}-t` : undefined;
  const descId = descripcion ? `${uid}-d` : undefined;

  return createPortal(
    <div
      className="tw:fixed tw:inset-0 tw:z-[1500] tw:grid tw:place-items-center tw:p-4 tw:bg-[rgba(12,16,32,.42)] tw:backdrop-blur-[3px] tw:animate-[modal-fondo_.16s_ease-out] tw:motion-reduce:animate-none"
      onMouseDown={(e) => { if (e.target === e.currentTarget && cerrable && !fondoNoCierra) onCerrar(); }}
    >
      <div
        ref={caja}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descId}
        tabIndex={-1}
        className={cx(
          'tw:relative tw:flex tw:flex-col tw:w-full tw:max-h-[min(88vh,900px)] tw:outline-none',
          'tw:rounded-2xl tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:text-text',
          'tw:shadow-[0_24px_60px_-20px_rgba(16,24,64,.35)] tw:animate-[modal-entra_.18s_ease-out] tw:motion-reduce:animate-none',
          ANCHO[tamano],
          className,
        )}
      >
        {(titulo || descripcion || icono) && (
          <header className="tw:flex tw:items-start tw:gap-3 tw:px-6 tw:pt-5 tw:pb-3">
            {icono && (
              <span className={cx('tw:flex-none tw:grid tw:place-items-center tw:w-10 tw:h-10 tw:rounded-xl', SUAVE[tonoIcono])}>
                <Icono nombre={icono} tam={19} />
              </span>
            )}
            <div className="tw:min-w-0 tw:flex-1 tw:pt-0.5">
              {titulo && <h2 id={tituloId} className="tw:m-0 tw:text-[18px] tw:font-bold tw:leading-snug">{titulo}</h2>}
              {descripcion && <p id={descId} className="tw:mt-1 tw:mb-0 tw:text-[13.5px] tw:leading-relaxed tw:text-muted">{descripcion}</p>}
            </div>
            {cerrable && (
              <button
                type="button"
                aria-label="Cerrar"
                onClick={onCerrar}
                className="tw:flex-none tw:-mr-2 tw:-mt-1 tw:grid tw:place-items-center tw:w-8 tw:h-8 tw:p-0 tw:rounded-lg tw:border-0 tw:bg-transparent tw:text-muted tw:cursor-pointer tw:hover:bg-hover tw:hover:text-text"
              >
                <Icono nombre="x" tam={16} />
              </button>
            )}
          </header>
        )}
        {children != null && children !== false && (
          <div data-modal-cuerpo className={cx('tw:flex-1 tw:min-h-0 tw:overflow-y-auto', !sinRelleno && 'tw:px-6 tw:pb-5', !sinRelleno && !(titulo || descripcion || icono) && 'tw:pt-5')}>
            {children}
          </div>
        )}
        {pie && (
          <footer className="tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-2 tw:px-6 tw:py-4 tw:border-t tw:border-solid tw:border-x-0 tw:border-b-0 tw:border-edge tw:bg-sunken tw:rounded-b-[14px]">
            {pie}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface IModalConfirmarProps {
  abierto: boolean;
  onCerrar: () => void;
  /** puede ser async: mientras corre, el botón muestra que está trabajando y el modal no se cierra */
  onConfirmar: () => unknown | Promise<unknown>;
  titulo: ReactNode;
  mensaje?: ReactNode;
  textoConfirmar?: string;
  textoCancelar?: string;
  peligro?: boolean;
  icono?: string;
  /** id de los botones (para pruebas o atajos) */
  idConfirmar?: string;
  idCancelar?: string;
}

/** Pregunta de sí o no. Si onConfirmar lanza un error, el modal queda abierto y lo muestra. */
export function ModalConfirmar({
  abierto,
  onCerrar,
  onConfirmar,
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  peligro = false,
  icono,
  idConfirmar,
  idCancelar,
}: IModalConfirmarProps) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (abierto) setError(''); }, [abierto]);
  const confirmar = async () => {
    setOcupado(true); setError('');
    try { await onConfirmar(); onCerrar(); }
    catch (e) { setError((e as Error)?.message || 'No se pudo completar.'); }
    finally { setOcupado(false); }
  };
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={titulo}
      descripcion={mensaje}
      icono={icono ?? (peligro ? 'alert' : undefined)}
      tonoIcono={peligro ? 'rojo' : 'lavanda'}
      tamano="sm"
      cerrable={!ocupado}
      pie={<>
        <Boton id={idCancelar} variante="secundario" onClick={onCerrar} disabled={ocupado}>{textoCancelar}</Boton>
        <Boton id={idConfirmar} variante={peligro ? 'peligro' : 'principal'} onClick={confirmar} cargando={ocupado}>{textoConfirmar}</Boton>
      </>}
    >
      {error ? <p role="alert" className="tw:m-0 tw:text-[13px] tw:text-red-softink">{error}</p> : null}
    </Modal>
  );
}
