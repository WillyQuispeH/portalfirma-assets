// Tarjeta de un negocio en el tablero (o en «Cerrados»). Usa las clases ng-* de styles.css;
// las pruebas usan .ng-card[data-n] y la arrastran entre columnas.
import { useState } from 'react';
import Icono from '../../ui/Icono';
import { monto } from '../../../utils/formato';
import type { INegocio } from '../../../store/interfaces/negocio.interface';

const dias = (n = 0) => (n <= 0 ? 'hoy' : n === 1 ? 'hace 1 día' : `hace ${n} días`);
const inicial = (s?: string) => String(s || '?').trim()[0] || '?';

function Sello({ n }: { n: INegocio }) {
  const firma = n.etapaInfo?.firma; const f = n.firmas?.[n.etapa];
  if (!firma) return null;
  if (f?.estado === 'firmado') return <span className="ng-firma ok" title={`${firma} firmado`}><Icono nombre="check" tam={12} /> Firmado</span>;
  if (f?.operacion) return <span className="ng-firma" title={`Operación ${f.operacion}`}><Icono nombre="sign" tam={12} /> {f.total ? `${f.firmados}/${f.total}` : 'En firma'}</span>;
  return null;
}

interface INegocioCardProps {
  n: INegocio;
  alAbrir: () => void;
}

export default function NegocioCard({ n, alAbrir }: INegocioCardProps) {
  const [arrastrando, setArrastrando] = useState(false);
  const [sinFoto, setSinFoto] = useState(false);
  const abierto = n.estado === 'abierto';
  const sig = n.siguiente;
  const pa = n.proximaAccion;

  return (
    <div className={`ng-card${n.vencida ? ' vencida' : ''}${arrastrando ? ' arrastre' : ''}`} draggable={abierto} data-n={n.id}
      onClick={alAbrir}
      onDragStart={(e) => { e.dataTransfer.setData('text/negocio', n.id); e.dataTransfer.effectAllowed = 'move'; setArrastrando(true); }}
      onDragEnd={() => setArrastrando(false)}>
      <div className="ng-ct">
        <span className="ng-th">
          {n.prop && (n.prop.foto && !sinFoto
            ? <img src={n.prop.foto} alt="" loading="lazy" onError={() => setSinFoto(true)} />
            : <span className="im-noph"><Icono nombre="house" tam={34} /></span>)}
        </span>
        <span className="ng-cti">
          <small>{n.prop?.codigo || ''}{n.prop?.comuna ? ` · ${n.prop.comuna}` : ''}</small>
          <b>{n.prop?.titulo || 'Sin propiedad'}</b>
        </span>
      </div>
      <div className="ng-cl">
        <span className="im-av sm">{inicial(n.cliente?.nombre)}</span>
        <span>{n.cliente?.nombre || 'Sin cliente'}</span>
        {n.valor && <b>{monto(n.valor.valor, n.valor.moneda)}</b>}
      </div>
      {(sig || pa?.texto) && (
        <div className="ng-cf">
          {sig && <span className={`ng-chip ${/^Listo/.test(sig) ? 'ok' : /firm/i.test(sig) ? 'sig' : ''}`}>{sig}</span>}
          {pa?.texto && (
            <span className={`ng-chip ${n.vencida ? 'bad' : ''}`}>
              <Icono nombre="clock" tam={12} /> {pa.texto}{pa.fecha ? ` · ${pa.fecha.slice(8, 10)}/${pa.fecha.slice(5, 7)}` : ''}
            </span>
          )}
        </div>
      )}
      <div className="ng-cm">
        <span>{abierto ? `${dias(n.diasEnEtapa)} en esta etapa` : n.estado === 'ganado' ? 'Cerrado con éxito' : `Perdido: ${n.motivoPerdida || ''}`}</span>
        <Sello n={n} />
      </div>
    </div>
  );
}
