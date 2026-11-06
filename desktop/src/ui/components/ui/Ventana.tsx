// Las tres partes de una ventana que se abre con abrirModal (utils/modal.tsx): encabezado, cuerpo y pie. Se ven igual
// que el Modal del kit (encabezado y pie un tono más oscuro, solo el cuerpo se desplaza, X para cerrar) y conservan el
// contenedor de siempre (#modalCard) y los id de los botones (#mOk, #mCancel…), que usan las pruebas.
// El diseño está en styles.css (.mdl-cab, .mdl-cuerpo, .mdl-pie): es el mismo que arma app.js para las ventanas antiguas.
//
//   abrirModal(<MiVentana />, { clave: 'modal-23' });
//   function MiVentana() {
//     return <>                                   ← las tres partes van sueltas (fragmento), sin un div que las envuelva
//       <VentanaCabecera titulo="Google Drive" descripcion="Conectado como ana@gmail.com" icono="drive" />
//       <VentanaCuerpo>…</VentanaCuerpo>
//       <VentanaPie>
//         <Boton variante="fantasma" className="tw:mr-auto" onClick={…}>Desconectar</Boton>   (a la izquierda)
//         <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cerrar</Boton>
//         <Boton id="mOk" onClick={…}>Cambiar cuenta</Boton>
//       </VentanaPie>
//     </>;
//   }
//
// La X (y Esc) hacen lo mismo que el botón #mCancel, si hay uno: así quien espera la respuesta se entera. Si no, cierra.
import type { ReactNode } from 'react';
import Icono from './Icono';
import Boton from './Boton';
import { SUAVE, type TTono } from './tonos';
import { cx } from '../../utils/cx';
import { cerrarVentana } from '../../utils/modal';

interface IVentanaCabeceraProps {
  titulo: ReactNode;
  descripcion?: ReactNode;
  /** ícono de src/renderer/icons.js, en una pastilla a la izquierda del título */
  icono?: string;
  tonoIcono?: TTono;
  /** false: sin X (p. ej. mientras algo corre y no se puede interrumpir) */
  cerrable?: boolean;
  /** qué hace la X (por defecto, lo mismo que #mCancel, o cerrar) */
  onCerrar?: () => void;
  className?: string;
}

export function VentanaCabecera({ titulo, descripcion, icono, tonoIcono = 'lavanda', cerrable = true, onCerrar, className }: IVentanaCabeceraProps) {
  return (
    <header className={cx('mdl-cab', className)}>
      {icono && (
        <span className={cx('tw:flex-none tw:grid tw:place-items-center tw:w-10 tw:h-10 tw:rounded-xl', SUAVE[tonoIcono])}>
          <Icono nombre={icono} tam={19} />
        </span>
      )}
      <div className="tw:min-w-0 tw:flex-1 tw:pt-1">
        <h2 className="tw:m-0 tw:text-[18px] tw:font-bold tw:leading-snug">{titulo}</h2>
        {descripcion && <p className="tw:mt-1 tw:mb-0 tw:text-[13.5px] tw:leading-relaxed tw:text-muted">{descripcion}</p>}
      </div>
      {cerrable && (
        <button type="button" className="mdl-x" aria-label="Cerrar" onClick={onCerrar ?? cerrarVentana}>
          <Icono nombre="x" tam={16} />
        </button>
      )}
    </header>
  );
}

/** lo que se desplaza; sinRelleno: para listas o tablas que llegan al borde */
export function VentanaCuerpo({ children, sinRelleno = false, className }: { children?: ReactNode; sinRelleno?: boolean; className?: string }) {
  return <div className={cx('mdl-cuerpo', sinRelleno && 'tw:p-0', className)}>{children}</div>;
}

/** los botones, a la derecha; un botón con className="tw:mr-auto" queda a la izquierda */
export function VentanaPie({ children, className }: { children?: ReactNode; className?: string }) {
  return <footer className={cx('mdl-pie tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-2', className)}>{children}</footer>;
}

/** Pregunta de sí o no en el modal de la app (la usa confirmar() de utils/app.ts). En `texto` y `nota`, lo que va
 *  entre ** se muestra en negrita. Botones #mCancel y #mOk (los usan las pruebas); la X y Esc responden «no». */
export function VentanaConfirmar({ titulo, texto, nota, boton, peligro = false, alResponder }: {
  titulo: string; texto: string; nota?: string; boton: string; peligro?: boolean; alResponder: (si: boolean) => void;
}) {
  const negritas = (t: string) => t.split(/\*\*(.+?)\*\*/).map((parte, i) => (i % 2 ? <b key={i}>{parte}</b> : parte));
  return <>
    <VentanaCabecera titulo={titulo} icono={peligro ? 'alert' : 'help'} tonoIcono={peligro ? 'rojo' : 'lavanda'} onCerrar={() => alResponder(false)} />
    <VentanaCuerpo>
      <p className="tw:m-0 tw:leading-relaxed">{negritas(texto)}</p>
      {nota && <p className="tw:mt-2 tw:mb-0 tw:text-[12.5px] tw:text-muted tw:leading-relaxed">{negritas(nota)}</p>}
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={() => alResponder(false)}>Cancelar</Boton>
      <Boton id="mOk" variante={peligro ? 'peligro' : 'principal'} onClick={() => alResponder(true)}>{boton}</Boton>
    </VentanaPie>
  </>;
}
