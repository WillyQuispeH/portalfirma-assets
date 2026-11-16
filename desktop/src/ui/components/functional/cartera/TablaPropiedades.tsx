// Vista de tabla de la Cartera: una fila por propiedad, con columnas ordenables (Tabla del kit).
// En pantallas angostas se esconden primero Detalle, Captación y Captador.
// Las filas llevan .im-tabla tr[data-id] para las pruebas, como .im-card[data-id] en la grilla.
import { useState } from 'react';
import Tabla, { type IColumna, type IOrdenTabla } from '../../ui/Tabla';
import Badge from '../../ui/Badge';
import Avatar from '../../ui/Avatar';
import Icono from '../../ui/Icono';
import { monto } from '../../../utils/formato';
import { cx } from '../../../utils/cx';
import { ESTADO, TIPO } from './catalogos';
import { direccion } from './filtrar';
import { ChipPI, Estado, num, publicadaEnPI } from './PropiedadCard';
import type { ICaptacion, IPropiedad, TCaptaciones } from '../../../store/interfaces/propiedad.interface';

function Miniatura({ p }: { p: IPropiedad }) {
  const [sinFoto, setSinFoto] = useState(false);
  const foto = p.fotos?.[0];
  const interesados = (p.leads || []).some((l) => !l.visto);
  return (
    <span className="tw:relative tw:grid tw:h-12 tw:w-16 tw:flex-none tw:place-items-center tw:overflow-hidden tw:rounded-icono tw:bg-[linear-gradient(135deg,var(--ui-lav-soft),var(--ui-blue-soft))] tw:text-lav-softink">
      {foto && !sinFoto
        ? <img src={foto} alt="" loading="lazy" onError={() => setSinFoto(true)} className="tw:block tw:size-full tw:object-cover" />
        : <Icono nombre="house" tam={20} />}
      {interesados && (
        <span title="Interesados nuevos" className="tw:absolute tw:right-1 tw:top-1 tw:size-2.5 tw:rounded-full tw:border-2 tw:border-solid tw:border-card tw:bg-green-edge" />
      )}
    </span>
  );
}

function Precio({ p }: { p: IPropiedad }) {
  const venta = p.venta && p.precioVenta; const arriendo = p.arriendo && p.precioArriendo;
  if (!venta && !arriendo) return <span className="tw:text-muted">—</span>;
  return (
    <span className="tw:flex tw:flex-col tw:items-end tw:gap-0.5 tw:whitespace-nowrap">
      {venta && <b className="tw:text-[14.5px] tw:font-bold tw:tracking-tight">{monto(venta.valor, venta.moneda)}</b>}
      {arriendo && (
        <b className={cx('tw:tracking-tight', venta ? 'tw:text-[12.5px] tw:font-semibold tw:text-muted' : 'tw:text-[14.5px] tw:font-bold')}>
          {monto(arriendo.valor, arriendo.moneda)}<small className="tw:text-[11px] tw:font-normal tw:text-muted">/mes</small>
        </b>
      )}
    </span>
  );
}

function Detalle({ p }: { p: IPropiedad }) {
  const sup = p.supUtil || p.supTotal;
  const datos: [string, string, string | number][] = [];
  if (p.dormitorios != null) datos.push(['bed', 'Dormitorios', p.dormitorios]);
  if (p.banos != null) datos.push(['bath', 'Baños', p.banos]);
  if (p.estacionamientos) datos.push(['car', 'Estacionamientos', p.estacionamientos]);
  if (sup) datos.push(['ruler', 'Superficie', `${num(sup)} m²`]);
  if (!datos.length) return <span className="tw:text-muted">—</span>;
  return (
    <span className="tw:flex tw:items-center tw:gap-3 tw:whitespace-nowrap tw:text-[12.5px] tw:text-muted">
      {datos.map(([ic, t, v]) => <span key={ic} title={t} className="tw:inline-flex tw:items-center tw:gap-1"><Icono nombre={ic} tam={14} />{v}</span>)}
    </span>
  );
}

function Captacion({ c }: { c?: ICaptacion }) {
  if (!c) return <span className="tw:text-muted">—</span>;
  if (c.completa) return <span className="im-capt ok tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-semibold tw:text-green-softink"><Icono nombre="check" tam={13} />Completa</span>;
  const fallo = c.actual?.e === 'fail';
  return (
    <span className={cx('im-capt tw:flex tw:items-center tw:gap-2 tw:whitespace-nowrap tw:text-xs tw:font-semibold', fallo ? 'fail tw:text-red-softink' : 'tw:text-muted')}
      title={`Falta: ${c.falta.join(', ')}`}>
      <span className="tw:h-1.5 tw:w-14 tw:flex-none tw:overflow-hidden tw:rounded-full tw:bg-sunken">
        <i className={cx('tw:block tw:h-full tw:rounded-full', fallo ? 'tw:bg-red-edge' : 'tw:bg-yellow-edge')} style={{ width: `${Math.round((c.ok / c.total) * 100)}%` }} />
      </span>
      {c.ok}/{c.total}
    </span>
  );
}

const precioOrden = (p: IPropiedad) => {
  const m = (p.venta && p.precioVenta) || (p.arriendo && p.precioArriendo);
  return m ? `${m.moneda} ${m.valor}` : null; // agrupa por moneda y dentro ordena por valor
};

interface ITablaPropiedadesProps {
  lista: IPropiedad[];
  captaciones: TCaptaciones;
  verCaptador: boolean;
  seleccion: string[] | null;
  orden: IOrdenTabla | null;
  alOrdenar: (o: IOrdenTabla | null) => void;
  alTocar: (p: IPropiedad) => void;
}

export default function TablaPropiedades({ lista, captaciones, verCaptador, seleccion, orden, alOrdenar, alTocar }: ITablaPropiedadesProps) {
  const columnas: IColumna<IPropiedad>[] = [
    ...(seleccion ? [{
      clave: 'sel', titulo: <span className="tw:sr-only">Elegida</span>, ancho: '44px',
      render: (p: IPropiedad) => {
        const on = seleccion.includes(p.id);
        return (
          <span className={cx('im-check tw:grid tw:size-5 tw:place-items-center tw:rounded-icono tw:border-2 tw:border-solid tw:border-lav-edge',
            on ? 'tw:bg-lav-edge tw:text-white' : 'tw:bg-card tw:text-lav-edge')}>
            {on && <Icono nombre="check" tam={13} />}
          </span>
        );
      },
    }] : []),
    {
      clave: 'propiedad', titulo: 'Propiedad', ordenar: (p) => p.titulo,
      render: (p) => (
        <span className="tw:flex tw:min-w-[260px] tw:items-center tw:gap-3">
          <Miniatura p={p} />
          <span className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
            <small className="tw:text-[10.5px] tw:font-semibold tw:uppercase tw:tracking-wider tw:text-muted">{p.codigo} · {TIPO[p.tipo] || p.tipo}</small>
            <strong className="tw:line-clamp-1 tw:text-[14px] tw:font-bold tw:leading-snug">{p.titulo}</strong>
            <span className="tw:flex tw:min-w-0 tw:items-center tw:gap-1 tw:text-[12px] tw:text-muted">
              <Icono nombre="pin" tam={12} /><span className="tw:truncate">{direccion(p) || 'Sin dirección'}</span>
            </span>
          </span>
        </span>
      ),
    },
    {
      clave: 'operacion', titulo: 'Operación', ancho: '1%',
      ordenar: (p) => (p.venta && p.arriendo ? 'c' : p.venta ? 'a' : p.arriendo ? 'b' : null),
      render: (p) => (
        <span className="im-ops tw:flex tw:flex-wrap tw:items-center tw:gap-1">
          {p.venta && <Badge tono="azul">Venta</Badge>}
          {p.arriendo && <Badge tono="durazno">Arriendo</Badge>}
          {publicadaEnPI(p) && <ChipPI chico />}
        </span>
      ),
    },
    { clave: 'precio', titulo: 'Precio', alinear: 'derecha', ancho: '1%', ordenar: precioOrden, render: (p) => <Precio p={p} /> },
    { clave: 'detalle', titulo: 'Detalle', ancho: '1%', ordenar: (p) => p.supUtil || p.supTotal || null, render: (p) => <Detalle p={p} />, className: 'tw:max-[1280px]:hidden' },
    {
      clave: 'estado', titulo: 'Estado', ancho: '1%',
      ordenar: (p) => { const e = (p.venta && p.estadoVenta) || (p.arriendo && p.estadoArriendo); return e ? ESTADO[e]?.[0] : null; },
      render: (p) => (
        <span className="tw:flex tw:flex-col tw:items-start tw:gap-1">
          {p.venta && <Estado estado={p.estadoVenta} op={p.arriendo ? 'V' : ''} />}
          {p.arriendo && <Estado estado={p.estadoArriendo} op={p.venta ? 'A' : ''} />}
        </span>
      ),
    },
    ...(verCaptador ? [{
      clave: 'captador', titulo: 'Captador', ancho: '1%', className: 'tw:max-[1100px]:hidden',
      ordenar: (p: IPropiedad) => p.captador?.nombre,
      render: (p: IPropiedad) => (p.captador
        ? <span className="tw:flex tw:items-center tw:gap-2 tw:whitespace-nowrap tw:font-medium"><Avatar nombre={p.captador.nombre} tamano="sm" />{p.captador.nombre}</span>
        : <Badge tono="amarillo" icono="user">Sin captador</Badge>),
    }] : []),
    {
      clave: 'captacion', titulo: 'Captación', ancho: '1%', className: 'tw:max-[1180px]:hidden',
      ordenar: (p) => { const c = captaciones[p.id]; return c ? c.ok / c.total : null; },
      render: (p) => <Captacion c={captaciones[p.id]} />,
    },
    {
      clave: 'ir', titulo: <span className="tw:sr-only">Abrir</span>, ancho: '36px', alinear: 'derecha',
      render: () => <span className="tw:inline-flex tw:text-muted tw:opacity-50"><Icono nombre="chevR" tam={16} /></span>,
    },
  ];

  return (
    <Tabla className="im-tabla" columnas={columnas} filas={lista} claveFila={(p) => p.id} alTocarFila={alTocar}
      filaActiva={seleccion ? (p) => seleccion.includes(p.id) : undefined}
      orden={orden} alOrdenar={alOrdenar}
      atributosFila={(p) => ({ 'data-id': p.id })} />
  );
}
