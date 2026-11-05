// Un lead en la bandeja. Usa las clases ld-* de styles.css; las pruebas usan #ldItems .ld-it.
import { busquedaTxt, fechaCorta, iniciales, nombreDe } from './formato';
import type { ILead } from '../../../store/interfaces/lead.interface';

interface ILeadItemProps {
  l: ILead;
  elegido: boolean;
  verCorredor: boolean;
  alElegir: () => void;
}

export default function LeadItem({ l, elegido, verCorredor, alElegir }: ILeadItemProps) {
  const nombre = nombreDe(l);
  const busca = busquedaTxt(l.busqueda);
  return (
    <button className={`ld-it ${elegido ? 'on' : ''}`} data-id={l.id} onClick={alElegir}>
      <span className={`ld-av${l.ig ? ' ig' : ''}`}>{iniciales(nombre)}</span>
      <span className="ld-it-b">
        <span className="ld-it-r1"><b>{nombre}</b><small>{fechaCorta(l.ultimo?.fecha)}</small></span>
        <span className="ld-it-r2">
          <span className="ld-prev">{l.ultimo?.de === 'broker' && <><i>Tú:</i> </>}{l.ultimo?.texto || ''}</span>
          {!!l.noLeidos && !elegido && <i className="ld-nl">{l.noLeidos > 99 ? '99+' : l.noLeidos}</i>}
        </span>
        <span className="ld-it-r3">
          <i className={`ld-e ${l.estado}`}>{l.estadoTxt}</i>
          {verCorredor && <i className={`ld-co${l.corredor ? '' : ' sin'}`}>{l.corredor?.nombre || 'Sin corredor'}</i>}
          {l.sinRespuesta ? <i className="ld-al">Sin respuesta</i> : l.vencida ? <i className="ld-al">Acción vencida</i> : null}
          {busca && <small>{busca}</small>}
        </span>
      </span>
    </button>
  );
}
