// Tarjeta de un negocio en el tablero (o en «Cerrados»). La caja usa las clases ng-* de styles.css; por dentro,
// el kit (Miniatura, Avatar y Badge). Las pruebas usan .ng-card[data-n] (y .vencida) y la arrastran entre columnas.
import { useState } from 'react';
import Avatar from '../../ui/Avatar';
import Badge from '../../ui/Badge';
import { Miniatura } from '../../ui/ItemLista';
import { monto } from '../../../utils/formato';
import type { INegocio } from '../../../store/interfaces/negocio.interface';
import type { TTono } from '../../ui/tonos';

const dias = (n = 0) => (n <= 0 ? 'hoy' : n === 1 ? 'hace 1 día' : `hace ${n} días`);

// el siguiente paso: listo (verde), falta una firma (amarillo) u otra cosa
const tonoSiguiente = (s: string): TTono => (/^Listo/.test(s) ? 'verde' : /firm/i.test(s) ? 'amarillo' : 'gris');

function Sello({ n }: { n: INegocio }) {
  const firma = n.etapaInfo?.firma; const f = n.firmas?.[n.etapa];
  if (!firma) return null;
  if (f?.estado === 'firmado') return <span title={`${firma} firmado`}><Badge tono="verde" icono="check">Firmado</Badge></span>;
  if (f?.operacion) return <span title={`Operación ${f.operacion}`}><Badge tono="amarillo" icono="sign">{f.total ? `${f.firmados}/${f.total}` : 'En firma'}</Badge></span>;
  return null;
}

interface INegocioCardProps {
  n: INegocio;
  alAbrir: () => void;
}

export default function NegocioCard({ n, alAbrir }: INegocioCardProps) {
  const [arrastrando, setArrastrando] = useState(false);
  const abierto = n.estado === 'abierto';
  const sig = n.siguiente;
  const pa = n.proximaAccion;

  return (
    <div className={`ng-card${n.vencida ? ' vencida' : ''}${arrastrando ? ' arrastre' : ''}`} draggable={abierto} data-n={n.id}
      onClick={alAbrir}
      onDragStart={(e) => { e.dataTransfer.setData('text/negocio', n.id); e.dataTransfer.effectAllowed = 'move'; setArrastrando(true); }}
      onDragEnd={() => setArrastrando(false)}>
      <div className="tw:flex tw:items-center tw:gap-2.5 tw:min-w-0">
        {n.prop && <Miniatura src={n.prop.foto} icono="house" tam={36} />}
        <span className="tw:flex tw:flex-col tw:min-w-0">
          <small className="tw:truncate tw:text-[11px] tw:text-muted">{n.prop?.codigo || ''}{n.prop?.comuna ? ` · ${n.prop.comuna}` : ''}</small>
          <b className="tw:truncate tw:text-[13px] tw:font-semibold">{n.prop?.titulo || 'Sin propiedad'}</b>
        </span>
      </div>
      <div className="tw:flex tw:items-center tw:gap-2 tw:min-w-0 tw:text-[12.5px]">
        <Avatar nombre={n.cliente?.nombre || '?'} tamano="sm" />
        <span className="tw:min-w-0 tw:truncate">{n.cliente?.nombre || 'Sin cliente'}</span>
        {n.valor && <b className="tw:ml-auto tw:whitespace-nowrap tw:font-semibold">{monto(n.valor.valor, n.valor.moneda)}</b>}
      </div>
      {(sig || pa?.texto) && (
        <div className="tw:flex tw:flex-col tw:items-start tw:gap-1">
          {sig && <Badge ajustar tono={tonoSiguiente(sig)}>{sig}</Badge>}
          {pa?.texto && (
            <Badge ajustar tono={n.vencida ? 'rojo' : 'gris'} icono="clock">
              {pa.texto}{pa.fecha ? ` · ${pa.fecha.slice(8, 10)}/${pa.fecha.slice(5, 7)}` : ''}
            </Badge>
          )}
        </div>
      )}
      <div className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:text-[11px] tw:text-muted">
        <span>{abierto ? `${dias(n.diasEnEtapa)} en esta etapa` : n.estado === 'ganado' ? 'Cerrado con éxito' : `Perdido: ${n.motivoPerdida || ''}`}</span>
        <Sello n={n} />
      </div>
    </div>
  );
}
