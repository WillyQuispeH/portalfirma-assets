// Tarjeta: superficie con borde táctil, título opcional, acción y pie.
//   <Card titulo="Últimos pagos" subtitulo="2 clientes" accion={<Boton …/>}>…</Card>
//   <Card tono="verde" titulo="Comisiones">…</Card>           (de color, con franja a la izquierda)
//   <Card relleno={false}>…<Tabla/></Card>                      (sin padding, para tablas)
import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';
import type { TTono } from './tonos';

// franja de color y fondo de las tarjetas con tono
const TONO: Record<TTono, string> = {
  gris: 'tw:bg-gray tw:border-gray-edge',
  lavanda: 'tw:bg-lav tw:border-lav-edge tw:text-lav-ink',
  verde: 'tw:bg-green tw:border-green-edge tw:text-green-ink',
  amarillo: 'tw:bg-yellow tw:border-yellow-edge tw:text-yellow-ink',
  durazno: 'tw:bg-peach tw:border-peach-edge tw:text-peach-ink',
  azul: 'tw:bg-blue tw:border-blue-edge tw:text-blue-ink',
  rojo: 'tw:bg-red tw:border-red-edge tw:text-red-ink',
};

interface ICardProps {
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  accion?: ReactNode; // a la derecha del título
  pie?: ReactNode;
  tono?: TTono;
  relleno?: boolean; // padding interno (false para tablas que llegan al borde)
  className?: string;
  children?: ReactNode;
}

export default function Card({ titulo, subtitulo, accion, pie, tono, relleno = true, className, children }: ICardProps) {
  const cabecera = titulo || subtitulo || accion;
  return (
    <section className={cx(
      'tw:rounded-2xl tw:border tw:border-solid tw:border-b-[3px] tw:overflow-hidden',
      tono ? TONO[tono] : 'tw:bg-card tw:border-edge tw:border-b-edge-b tw:text-text',
      className,
    )}>
      {cabecera && (
        <header className={cx('tw:flex tw:items-start tw:gap-3', relleno ? 'tw:px-5 tw:pt-4' : 'tw:px-5 tw:py-4 tw:border-b tw:border-edge')}>
          <div className="tw:min-w-0 tw:flex-1">
            {titulo && <h3 className="tw:m-0 tw:text-[17px] tw:font-bold tw:leading-tight">{titulo}</h3>}
            {subtitulo && <p className={cx('tw:mt-1 tw:mb-0 tw:text-[13px]', tono ? 'tw:opacity-75' : 'tw:text-muted')}>{subtitulo}</p>}
          </div>
          {accion && <div className="tw:flex-none">{accion}</div>}
        </header>
      )}
      <div className={relleno ? cx('tw:px-5 tw:pb-5', cabecera ? 'tw:pt-3' : 'tw:pt-5') : ''}>{children}</div>
      {pie && <footer className="tw:px-5 tw:py-3 tw:border-t tw:border-edge tw:bg-sunken tw:text-[13px]">{pie}</footer>}
    </section>
  );
}

// Indicador con variación, para la cabecera de un panel.
//   <Estadistica etiqueta="Clientes" valor="253" variacion={-3.3} />
export function Estadistica({ etiqueta, valor, variacion, className }: { etiqueta: ReactNode; valor: ReactNode; variacion?: number; className?: string }) {
  const sube = (variacion ?? 0) >= 0;
  return (
    <div className={cx('tw:rounded-2xl tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:px-5 tw:py-4', className)}>
      <div className="tw:flex tw:items-center tw:justify-between tw:gap-2">
        <span className="tw:text-[13px] tw:text-muted">{etiqueta}</span>
        {variacion != null && (
          <span className={cx('tw:inline-flex tw:items-center tw:gap-0.5 tw:text-xs tw:font-semibold', sube ? 'tw:text-green-softink' : 'tw:text-red-softink')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              {sube ? <path d="M7 17 17 7M8 7h9v9" /> : <path d="M7 7l10 10M17 8v9H8" />}
            </svg>
            {Math.abs(variacion).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%
          </span>
        )}
      </div>
      <div className="tw:mt-1.5 tw:text-[26px] tw:font-bold tw:leading-tight tw:tracking-tight">{valor}</div>
    </div>
  );
}
