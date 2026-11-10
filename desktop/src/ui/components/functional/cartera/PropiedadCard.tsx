// Tarjeta de una propiedad en la Cartera. Con el kit: borde táctil de Card, Badge e Icono.
// Las pruebas e2e usan .im-card[data-id], .im-noph, .im-check, .im-capt y .im-ops i.pi.
import { useState } from 'react';
import Icono from '../../ui/Icono';
import Badge from '../../ui/Badge';
import { monto } from '../../../utils/formato';
import { cx } from '../../../utils/cx';
import { ESTADO, TIPO, TONO_ESTADO } from './catalogos';
import { direccion } from './filtrar';
import type { ICaptacion, IPropiedad, TPropiedadEstado } from '../../../store/interfaces/propiedad.interface';

const num = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

function Estado({ estado, op }: { estado?: TPropiedadEstado; op: string }) {
  if (!estado) return null;
  const [t, c] = ESTADO[estado] || [estado, ''];
  return <Badge tono={TONO_ESTADO[c] ?? 'gris'} punto>{op && <span className="tw:opacity-60">{op}</span>}{t}</Badge>;
}

function Captacion({ c }: { c?: ICaptacion }) {
  if (!c) return null;
  if (c.completa) return <span className="im-capt ok tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:font-semibold tw:text-green-softink" title="Captación completa"><Icono nombre="check" tam={13} /> Captación completa</span>;
  const primera = (c.falta[0] || '').toLowerCase();
  const fallo = c.actual?.e === 'fail';
  return (
    <span className={cx('im-capt tw:flex tw:items-center tw:gap-2 tw:min-w-0 tw:text-xs tw:font-medium', fallo ? 'fail tw:text-red-softink' : 'tw:text-muted')} title={`Falta: ${c.falta.join(', ')}`}>
      <span className="tw:h-1.5 tw:w-12 tw:flex-none tw:overflow-hidden tw:rounded-full tw:bg-sunken">
        <i className={cx('tw:block tw:h-full tw:rounded-full', fallo ? 'tw:bg-red-edge' : 'tw:bg-yellow-edge')} style={{ width: `${Math.round((c.ok / c.total) * 100)}%` }} />
      </span>
      <span className="tw:truncate">Captación {c.ok}/{c.total} · falta {primera}{c.falta.length > 1 ? ` y ${c.falta.length - 1} más` : ''}</span>
    </span>
  );
}

interface IPropiedadCardProps {
  p: IPropiedad;
  captacion?: ICaptacion;
  verCaptador: boolean;
  modoSeleccion: boolean;
  seleccionada: boolean;
  alTocar: () => void;
}

export default function PropiedadCard({ p, captacion, verCaptador, modoSeleccion, seleccionada, alTocar }: IPropiedadCardProps) {
  const [sinFoto, setSinFoto] = useState(false); // la foto no cargó (sin conexión o URL vencida)
  const foto = p.fotos?.[0];
  const enPI = (['venta', 'arriendo'] as const).some((o) => p.portales?.pi?.[o]?.status === 'active');
  const interesados = (p.leads || []).some((l) => !l.visto);
  const sup = p.supUtil || p.supTotal;

  return (
    <button type="button" data-id={p.id} onClick={alTocar} className={cx(
      'im-card tw:group tw:relative tw:flex tw:flex-col tw:items-stretch tw:justify-start tw:overflow-hidden tw:m-0 tw:p-0 tw:text-left tw:font-[inherit] tw:cursor-pointer',
      'tw:rounded-2xl tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b tw:bg-card tw:text-text',
      'tw:transition-[transform,box-shadow] tw:duration-200 tw:hover:-translate-y-0.5 tw:hover:shadow-[0_16px_32px_-14px_rgb(20_35_90/0.3)]',
      'tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-lav-edge',
      seleccionada && 'tw:outline-2 tw:outline-offset-2 tw:outline-lav-edge',
    )}>
      {modoSeleccion && (
        <span className={cx('im-check tw:absolute tw:right-2.5 tw:top-2.5 tw:z-[2] tw:grid tw:size-6 tw:place-items-center tw:rounded-lg tw:border-2 tw:border-solid tw:border-lav-edge',
          seleccionada ? 'tw:bg-lav-edge tw:text-white' : 'tw:bg-card tw:text-lav-edge')}>
          {seleccionada && <Icono nombre="check" tam={14} />}
        </span>
      )}
      <span className="tw:relative tw:grid tw:h-[168px] tw:flex-none tw:place-items-center tw:overflow-hidden tw:bg-[linear-gradient(135deg,var(--ui-lav-soft),var(--ui-blue-soft))]">
        {foto && !sinFoto
          ? <img src={foto} alt="" loading="lazy" onError={() => setSinFoto(true)} className="tw:block tw:size-full tw:object-cover tw:transition-transform tw:duration-300 tw:group-hover:scale-[1.03]" />
          : <span className="im-noph tw:text-lav-softink"><Icono nombre="house" tam={34} /></span>}
        <span className="im-ops tw:absolute tw:left-2.5 tw:top-2.5 tw:flex tw:flex-wrap tw:gap-1.5">
          {p.venta && <Badge tono="azul" variante="tactil">Venta</Badge>}
          {p.arriendo && <Badge tono="durazno" variante="tactil">Arriendo</Badge>}
          {enPI && <i className="pi tw:not-italic tw:inline-flex tw:h-6 tw:items-center tw:rounded-md tw:border tw:border-solid tw:border-b-2 tw:border-[#c9b400] tw:bg-[#ffe600] tw:px-2 tw:text-xs tw:font-extrabold tw:text-[#2d3277]"
            title="Publicada en Portal Inmobiliario">PI</i>}
          {interesados && <Badge tono="verde" variante="tactil" icono="users">Interesados</Badge>}
        </span>
      </span>
      <span className="tw:flex tw:flex-1 tw:flex-col tw:gap-1 tw:px-4 tw:pb-4 tw:pt-3">
        <small className="tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-wider tw:text-muted">{p.codigo} · {TIPO[p.tipo] || p.tipo}</small>
        <strong className="tw:line-clamp-2 tw:text-[15px] tw:font-bold tw:leading-snug">{p.titulo}</strong>
        <span className="tw:flex tw:min-w-0 tw:items-center tw:gap-1 tw:text-[12.5px] tw:text-muted">
          <Icono nombre="pin" tam={13} /><span className="tw:truncate">{direccion(p) || 'Sin dirección'}</span>
        </span>
        <span className="tw:mt-1.5 tw:flex tw:flex-wrap tw:items-baseline tw:gap-x-3 tw:gap-y-0.5">
          {p.venta && p.precioVenta && <b className="tw:text-[17px] tw:font-bold tw:tracking-tight">{monto(p.precioVenta.valor, p.precioVenta.moneda)}</b>}
          {p.arriendo && p.precioArriendo && <b className="tw:text-[17px] tw:font-bold tw:tracking-tight">{monto(p.precioArriendo.valor, p.precioArriendo.moneda)}<small className="tw:text-xs tw:font-normal tw:text-muted">/mes</small></b>}
        </span>
        <span className="tw:flex tw:flex-wrap tw:gap-x-3 tw:gap-y-1 tw:text-[12.5px] tw:text-muted">
          {p.dormitorios != null && <span className="tw:inline-flex tw:items-center tw:gap-1" title="Dormitorios"><Icono nombre="bed" tam={14} />{p.dormitorios}</span>}
          {p.banos != null && <span className="tw:inline-flex tw:items-center tw:gap-1" title="Baños"><Icono nombre="bath" tam={14} />{p.banos}</span>}
          {!!p.estacionamientos && <span className="tw:inline-flex tw:items-center tw:gap-1" title="Estacionamientos"><Icono nombre="car" tam={14} />{p.estacionamientos}</span>}
          {!!sup && <span className="tw:inline-flex tw:items-center tw:gap-1" title="Superficie"><Icono nombre="ruler" tam={14} />{num(sup)} m²</span>}
        </span>
        <span className="tw:mt-auto tw:flex tw:flex-col tw:gap-2 tw:pt-3">
          <span className="tw:flex tw:flex-wrap tw:gap-1.5 tw:border-0 tw:border-t tw:border-dashed tw:border-edge tw:pt-3">
            {p.venta && <Estado estado={p.estadoVenta} op={p.arriendo ? 'V' : ''} />}
            {p.arriendo && <Estado estado={p.estadoArriendo} op={p.venta ? 'A' : ''} />}
            {verCaptador && (p.captador
              ? <Badge tono="lavanda" icono="user">{p.captador.nombre}</Badge>
              : <Badge tono="amarillo" icono="user">Sin captador</Badge>)}
          </span>
          <Captacion c={captacion} />
        </span>
      </span>
    </button>
  );
}
