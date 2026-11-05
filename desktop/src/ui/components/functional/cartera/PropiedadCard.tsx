// Tarjeta de una propiedad en la Cartera. Usa las clases im-* de styles.css, que comparte con la ficha
// y otras pantallas; las pruebas e2e usan .im-card[data-id], .im-check y .im-capt.
import { useState } from 'react';
import Icono from '../../ui/Icono';
import { monto } from '../../../utils/formato';
import { ESTADO, TIPO } from './catalogos';
import { direccion } from './filtrar';
import type { ICaptacion, IPropiedad, TPropiedadEstado } from '../../../store/interfaces/propiedad.interface';

const num = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

function Estado({ estado, op }: { estado?: TPropiedadEstado; op: string }) {
  if (!estado) return null;
  const [t, c] = ESTADO[estado] || [estado, ''];
  return <span className={`im-st ${c}`}>{op && <i>{op}</i>}{t}</span>;
}

function Captacion({ c }: { c?: ICaptacion }) {
  if (!c) return null;
  if (c.completa) return <span className="im-capt ok" title="Captación completa"><Icono nombre="check" tam={12} /> Captación completa</span>;
  const primera = (c.falta[0] || '').toLowerCase();
  return (
    <span className={`im-capt ${c.actual?.e === 'fail' ? 'fail' : ''}`} title={`Falta: ${c.falta.join(', ')}`}>
      <span className="im-cbar"><i style={{ width: `${Math.round((c.ok / c.total) * 100)}%` }} /></span>
      Captación {c.ok}/{c.total} · falta {primera}{c.falta.length > 1 ? ` y ${c.falta.length - 1} más` : ''}
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
    <button className={`im-card${modoSeleccion ? ' im-selmode' : ''}${seleccionada ? ' im-sel' : ''}`} data-id={p.id} onClick={alTocar}>
      {modoSeleccion && <span className="im-check">{seleccionada && <Icono nombre="check" tam={14} />}</span>}
      <span className="im-ph">
        {foto && !sinFoto
          ? <img src={foto} alt="" loading="lazy" onError={() => setSinFoto(true)} />
          : <span className="im-noph"><Icono nombre="house" tam={34} /></span>}
        <span className="im-ops">
          {p.venta && <i>Venta</i>}
          {p.arriendo && <i>Arriendo</i>}
          {enPI && <i className="pi" title="Publicada en Portal Inmobiliario">PI</i>}
          {interesados && <i className="ld">Interesados</i>}
        </span>
      </span>
      <span className="im-cb">
        <small className="im-code">{p.codigo} · {TIPO[p.tipo] || p.tipo}</small>
        <strong>{p.titulo}</strong>
        <span className="im-addr"><Icono nombre="pin" tam={13} />{direccion(p) || 'Sin dirección'}</span>
        <span className="im-prices">
          {p.venta && p.precioVenta && <b>{monto(p.precioVenta.valor, p.precioVenta.moneda)}</b>}
          {p.arriendo && p.precioArriendo && <b>{monto(p.precioArriendo.valor, p.precioArriendo.moneda)}<small>/mes</small></b>}
        </span>
        <span className="im-specs">
          {p.dormitorios != null && <span><Icono nombre="bed" tam={14} />{p.dormitorios}</span>}
          {p.banos != null && <span><Icono nombre="bath" tam={14} />{p.banos}</span>}
          {!!p.estacionamientos && <span><Icono nombre="car" tam={14} />{p.estacionamientos}</span>}
          {!!sup && <span><Icono nombre="ruler" tam={14} />{num(sup)} m²</span>}
        </span>
        <span className="im-sts">
          {p.venta && <Estado estado={p.estadoVenta} op={p.arriendo ? 'V' : ''} />}
          {p.arriendo && <Estado estado={p.estadoArriendo} op={p.venta ? 'A' : ''} />}
        </span>
        <Captacion c={captacion} />
        {verCaptador && (
          <span className={`im-captby${p.captador ? '' : ' sin'}`}><Icono nombre="user" tam={11} /> {p.captador?.nombre || 'Sin captador'}</span>
        )}
      </span>
    </button>
  );
}
