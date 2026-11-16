// Leads mientras carga: la silueta de la lista de chats, la conversación y la ficha (Esqueleto del kit), con las mismas
// medidas que LeadItem, LeadDetalle y FichaLead para que al llegar los datos nada salte de lugar.
// Las columnas llevan las clases .ld-chat / .ld-ficha (la grilla y las asas de Leads las usan) pero no sus id.
import Esqueleto, { EsqueletoZona } from '../../ui/Esqueleto';
import { cx } from '../../../utils/cx';

const COLUMNA = 'tw:rounded-card tw:border-edge tw:border-b-[3px] tw:border-b-edge-b';
const BORDE_ABAJO = 'tw:border-0 tw:border-b tw:border-solid tw:border-edge';

// anchos fijos que varían de fila en fila (al azar cambiarían en cada dibujo)
const FILAS = [[46, 78, 64], [58, 70, 58], [40, 84, 70], [52, 62, 64], [36, 74, 58], [62, 66, 70], [44, 80, 64], [54, 58, 58]];

export function EsqueletoLista({ filas = 8 }: { filas?: number }) {
  return (
    <EsqueletoZona etiqueta="Cargando conversaciones">
      {FILAS.slice(0, filas).map(([nombre, mensaje, estado], i) => (
        <div key={i} className={cx('tw:flex tw:items-start tw:gap-2.5 tw:px-3 tw:py-3', BORDE_ABAJO)}>
          <Esqueleto forma="icono" ancho={36} />
          <div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-2 tw:pt-0.5">
            <div className="tw:flex tw:items-center tw:gap-2">
              <Esqueleto ancho={`${nombre}%`} alto={12} />
              <Esqueleto ancho={30} alto={8} className="tw:ml-auto" />
            </div>
            <Esqueleto ancho={`${mensaje}%`} alto={9} />
            <div className="tw:flex tw:gap-1">
              <Esqueleto ancho={estado} alto={18} />
              <Esqueleto ancho={74} alto={18} />
            </div>
          </div>
        </div>
      ))}
    </EsqueletoZona>
  );
}

// la conversación: de quién es cada burbuja (cliente a la izquierda, tú a la derecha), su ancho y su alto
const BURBUJAS: ['in' | 'out', string, number][] = [
  ['in', '52%', 40], ['out', '38%', 40], ['out', '58%', 64], ['in', '30%', 40], ['in', '64%', 82], ['out', '44%', 40], ['in', '48%', 58],
];

export function EsqueletoChat() {
  return (
    <EsqueletoZona etiqueta="Cargando la conversación" className={cx('ld-chat', COLUMNA)}>
      <div className={cx('tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-2.5 tw:bg-card', BORDE_ABAJO)}>
        <Esqueleto forma="icono" ancho={36} />
        <div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-2">
          <Esqueleto ancho={150} alto={12} />
          <Esqueleto ancho={210} alto={8} />
        </div>
        <Esqueleto forma="control" ancho={104} alto={32} />
      </div>
      <div className="tw:flex tw:flex-1 tw:flex-col tw:gap-2 tw:overflow-hidden tw:px-5 tw:py-4 tw:bg-sunken">
        <Esqueleto forma="control" ancho={128} alto={22} className="tw:my-2 tw:self-center" />
        {BURBUJAS.map(([lado, ancho, alto], i) => (
          <Esqueleto key={i} forma="bloque" ancho={ancho} alto={alto} className={lado === 'out' ? 'tw:self-end' : 'tw:self-start'} />
        ))}
      </div>
      <div className="tw:flex tw:items-end tw:gap-2 tw:px-3 tw:py-2.5 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:bg-card">
        <Esqueleto forma="control" alto={40} className="tw:flex-1" />
        <Esqueleto forma="control" ancho={92} alto={40} />
      </div>
    </EsqueletoZona>
  );
}

const Campo = ({ etiqueta = 64, className }: { etiqueta?: number; className?: string }) => (
  <div className={cx('tw:flex tw:flex-col tw:gap-1.5', className)}>
    <Esqueleto ancho={etiqueta} alto={8} />
    <Esqueleto forma="control" alto={36} />
  </div>
);

export function EsqueletoFicha() {
  return (
    <EsqueletoZona etiqueta="Cargando la ficha" className={cx('ld-ficha', COLUMNA)}>
      <div className={cx('tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2.5 tw:bg-card', BORDE_ABAJO)}>
        <Esqueleto ancho={44} alto={12} />
        <Esqueleto forma="icono" ancho={28} className="tw:ml-auto" />
        <Esqueleto forma="icono" ancho={28} />
      </div>
      <div className="tw:flex tw:flex-col tw:gap-3 tw:px-4 tw:pt-3 tw:pb-5">
        <div className="tw:flex tw:items-end tw:gap-2">
          <Campo etiqueta={58} className="tw:flex-1" />
          <Esqueleto forma="control" ancho={36} alto={36} />
        </div>
        <Campo etiqueta={44} />
        <Esqueleto forma="bloque" alto={92} />
        <div className="tw:flex tw:flex-col tw:gap-2">
          <Esqueleto ancho={40} alto={8} />
          <Esqueleto ancho="100%" alto={9} />
          <Esqueleto ancho="70%" alto={9} />
        </div>
        <Esqueleto forma="bloque" alto={78} />
        <Esqueleto ancho={84} alto={8} className="tw:mt-1" />
        <div className="tw:grid tw:grid-cols-2 tw:gap-x-2 tw:gap-y-2.5">
          <Campo etiqueta={62} />
          <Campo etiqueta={30} />
          <Campo etiqueta={56} className="tw:col-span-2" />
          <Campo etiqueta={70} className="tw:col-span-2" />
        </div>
      </div>
    </EsqueletoZona>
  );
}
