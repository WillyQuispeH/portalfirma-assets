// Fila de una lista dentro de una tarjeta: imagen o ícono a la izquierda, título y detalle, y algo a la derecha
// (una etiqueta, un botón o una flecha). Si tiene alTocar, toda la fila es un botón.
//   <ItemLista media={<Miniatura src={foto} icono="house" />} titulo="Depto en Ñuñoa" detalle="Propietario · WE-045"
//     alTocar={() => abrir(id)} flecha />
//   <ItemLista media={<Icono nombre="sign" />} titulo="Mandato" detalle="12-10-2026" derecha={<Badge tono="verde">Firmado</Badge>} />
import { useState, type HTMLAttributes, type ReactNode } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';

interface IItemListaProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  titulo: ReactNode;
  detalle?: ReactNode;
  media?: ReactNode;
  derecha?: ReactNode;
  alTocar?: () => void;
  flecha?: boolean;
}

export default function ItemLista({ titulo, detalle, media, derecha, alTocar, flecha = false, className, ...resto }: IItemListaProps) {
  const contenido = <>
    {media && <span className="tw:flex-none">{media}</span>}
    <span className="tw:min-w-0 tw:flex-1 tw:text-left">
      <b className="tw:block tw:truncate tw:text-sm tw:font-semibold tw:text-text">{titulo}</b>
      {detalle && <small className="tw:block tw:truncate tw:mt-0.5 tw:text-xs tw:text-muted">{detalle}</small>}
    </span>
    {derecha && <span className="tw:flex-none tw:flex tw:items-center tw:gap-2">{derecha}</span>}
    {flecha && <span className="tw:flex-none tw:text-muted"><Icono nombre="chevR" tam={16} /></span>}
  </>;
  const clases = cx('tw:flex tw:items-center tw:gap-3 tw:w-full tw:m-0 tw:px-3 tw:py-2.5 tw:rounded-xl', className);
  return alTocar ? (
    <button type="button" onClick={alTocar} {...resto}
      className={cx(clases, 'tw:border-0 tw:bg-transparent tw:cursor-pointer tw:font-[inherit] tw:hover:bg-hover tw:focus-visible:outline-2 tw:focus-visible:outline-lav-edge')}>
      {contenido}
    </button>
  ) : <div {...resto} className={clases}>{contenido}</div>;
}

/** Miniatura cuadrada de una imagen; si no hay o no carga, muestra un ícono. */
export function Miniatura({ src, icono = 'image', tam = 48 }: { src?: string | null; icono?: string; tam?: number }) {
  const [rota, setRota] = useState(false);
  return (
    <span className="tw:grid tw:place-items-center tw:overflow-hidden tw:rounded-xl tw:bg-sunken tw:text-muted" style={{ width: tam, height: tam }}>
      {src && !rota ? <img src={src} alt="" loading="lazy" onError={() => setRota(true)} className="tw:w-full tw:h-full tw:object-cover" /> : <Icono nombre={icono} tam={Math.round(tam * 0.45)} />}
    </span>
  );
}
