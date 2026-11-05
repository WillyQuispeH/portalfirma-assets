// Un evento de la agenda: hora, tipo, datos, orden de visita y acciones (hecho, reprogramar, cancelar).
// Las clases ag-ev, ag-ord y los atributos data-* los usan las pruebas e2e y el recorrido de Aprende.
import { useState } from 'react';
import Icono from '../../ui/Icono';
import type { IEvento, IEventoCambios, TEventoTipo } from '../../../store/interfaces/evento.interface';

export const TIPOS: Record<TEventoTipo, [string, string]> = {
  visita: ['Visita', 'key'], reunion: ['Reunión', 'users'], firma: ['Firma', 'sign'],
  llamada: ['Llamada', 'phone'], tarea: ['Tarea', 'check'], otro: ['Evento', 'calendar'],
};

// color del ícono según el tipo
const COLOR_TIPO: Partial<Record<TEventoTipo, string>> = {
  visita: 'tw:bg-[color-mix(in_srgb,#ffe600_30%,var(--card))] tw:text-[#6b5b00] tw:dark:text-[#ffe066]',
  firma: 'tw:bg-ok-soft tw:text-ok',
  llamada: 'tw:bg-[color-mix(in_srgb,#6a2fe0_12%,var(--card))] tw:text-[#6a2fe0] tw:dark:text-[#b69cff]',
};

interface IEventoCardProps {
  evento: IEvento;
  alActualizar: (cambios: IEventoCambios, aviso: string) => Promise<boolean>;
  alPedirOrden: () => void;
}

export default function EventoCard({ evento: e, alActualizar, alPedirOrden }: IEventoCardProps) {
  const ic = (TIPOS[e.tipo] || TIPOS.otro)[1];
  const [reprogramando, setReprogramando] = useState(false);
  const [fecha, setFecha] = useState(e.fecha);
  const [hora, setHora] = useState(e.hora || '');
  const programado = e.estado === 'programado';
  const detalle = [e.prop?.codigo, e.lugar, e.personas.map((c) => c.nombre).join(', ')].filter(Boolean).join(' · ');

  const guardarFecha = async () => {
    if (await alActualizar({ fecha, hora }, 'Evento reprogramado.')) setReprogramando(false);
  };

  return (
    <div data-ev={e.id} className={`ag-ev tw:flex tw:items-center tw:gap-3.5 tw:bg-card tw:border tw:border-line tw:rounded-[14px] tw:px-3.5 tw:py-3 tw:mb-2 ${programado ? '' : 'tw:opacity-[.62]'}`}>
      <span className="tw:font-bold tw:text-[15px] tw:w-[52px] tw:text-center tw:text-text">{e.hora || '—'}</span>
      <span className={`tw:w-9 tw:h-9 tw:rounded-[10px] tw:grid tw:place-items-center tw:flex-none ${COLOR_TIPO[e.tipo] || 'tw:bg-brand-soft tw:text-brand'}`}>
        <Icono nombre={ic} tam={16} />
      </span>

      <span className="tw:flex-1 tw:flex tw:flex-col tw:gap-0.5 tw:min-w-0">
        <b className={e.estado === 'cancelado' ? 'tw:line-through' : ''}>{e.titulo}</b>
        {detalle && <small className="tw:text-muted">{detalle}</small>}
        {e.tipo === 'visita' && (e.orden?.operacion
          ? <i className="ag-ord ok"><Icono nombre="check" tam={12} /> Orden de visita · operación {e.orden.operacion}</i>
          : programado && <button className="ag-ord" data-orden={e.id} onClick={alPedirOrden}><Icono nombre="sign" tam={12} /> Generar orden de visita</button>)}
        {reprogramando && (
          <span className="ng-inl tw:mt-2 tw:items-center tw:gap-2 tw:self-start" data-reprogramar={e.id}>
            <input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} aria-label="Nueva fecha" className="tw:w-[170px] tw:flex-none" />
            <input type="time" value={hora} onChange={(ev) => setHora(ev.target.value)} aria-label="Nueva hora" className="tw:w-[120px] tw:flex-none" />
            <button className="primary small" onClick={guardarFecha}>Guardar</button>
            <button className="ghost small" onClick={() => { setReprogramando(false); setFecha(e.fecha); setHora(e.hora || ''); }}>Cancelar</button>
          </span>
        )}
      </span>

      <span className="tw:flex tw:gap-0.5">
        {programado ? (
          <>
            <button className="ghost small" data-hecho={e.id} title="Marcar como hecho" onClick={() => alActualizar({ estado: 'hecho' }, 'Marcado como hecho.')}><Icono nombre="check" tam={15} /></button>
            <button className="ghost small" data-repro={e.id} title="Reprogramar" onClick={() => setReprogramando((v) => !v)}><Icono nombre="clock" tam={15} /></button>
            <button className="ghost small" data-canc={e.id} title="Cancelar" onClick={() => alActualizar({ estado: 'cancelado' }, 'Evento cancelado.')}><Icono nombre="x" tam={15} /></button>
          </>
        ) : (
          <span className={`im-st ${e.estado === 'hecho' ? 'ok' : 'off'}`}>{e.estado === 'hecho' ? 'Hecho' : 'Cancelado'}</span>
        )}
      </span>
    </div>
  );
}
