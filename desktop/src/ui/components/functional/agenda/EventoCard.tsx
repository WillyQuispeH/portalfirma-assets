// Un evento de la agenda: hora, tipo, datos, orden de visita y acciones (hecho, reprogramar, cancelar).
// Hecho con el kit (Boton, Badge, Input) sobre una caja táctil como Card.
// La clase ag-ev y los atributos data-ev, data-orden, data-orden-ok, data-hecho, data-repro, data-canc,
// data-reprogramar y data-estado los usan las pruebas e2e y el recorrido de Aprende.
import { useState } from 'react';
import Icono from '../../ui/Icono';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Input from '../../ui/Input';
import { cx } from '../../../utils/cx';
import { SUAVE, type TTono } from '../../ui/tonos';
import type { IEvento, IEventoCambios, TEventoTipo } from '../../../store/interfaces/evento.interface';

export const TIPOS: Record<TEventoTipo, [string, string]> = {
  visita: ['Visita', 'key'], reunion: ['Reunión', 'users'], firma: ['Firma', 'sign'],
  llamada: ['Llamada', 'phone'], tarea: ['Tarea', 'check'], otro: ['Evento', 'calendar'],
};

// color del ícono según el tipo
const TONO_TIPO: Partial<Record<TEventoTipo, TTono>> = { visita: 'amarillo', firma: 'verde', llamada: 'lavanda' };

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
  const [guardando, setGuardando] = useState(false);
  const programado = e.estado === 'programado';
  const detalle = [e.prop?.codigo, e.lugar, e.personas.map((c) => c.nombre).join(', ')].filter(Boolean).join(' · ');

  const guardarFecha = async () => {
    setGuardando(true);
    const ok = await alActualizar({ fecha, hora }, 'Evento reprogramado.');
    setGuardando(false);
    if (ok) setReprogramando(false);
  };

  return (
    <div data-ev={e.id} className={cx(
      'ag-ev tw:flex tw:items-center tw:gap-3.5 tw:mb-2 tw:px-3.5 tw:py-3 tw:rounded-2xl tw:bg-card',
      'tw:border tw:border-solid tw:border-edge tw:border-b-[3px] tw:border-b-edge-b',
      !programado && 'tw:opacity-[.62]',
    )}>
      <span className="tw:w-[52px] tw:flex-none tw:text-center tw:text-[15px] tw:font-bold tw:tabular-nums tw:text-text">{e.hora || '—'}</span>
      <span className={cx('tw:grid tw:place-items-center tw:flex-none tw:w-9 tw:h-9 tw:rounded-xl', SUAVE[TONO_TIPO[e.tipo] ?? 'azul'])}>
        <Icono nombre={ic} tam={16} />
      </span>

      <span className="tw:flex-1 tw:flex tw:flex-col tw:items-start tw:gap-0.5 tw:min-w-0">
        <b className={cx('tw:text-sm tw:font-semibold', e.estado === 'cancelado' && 'tw:line-through')}>{e.titulo}</b>
        {detalle && <small className="tw:text-xs tw:text-muted">{detalle}</small>}
        {e.tipo === 'visita' && (e.orden?.operacion
          ? <span data-orden-ok={e.id} className="tw:mt-1"><Badge tono="verde" icono="check">Orden de visita · operación {e.orden.operacion}</Badge></span>
          : programado && <Boton variante="secundario" tamano="sm" icono="sign" className="tw:mt-1" data-orden={e.id} onClick={alPedirOrden}>Generar orden de visita</Boton>)}
        {reprogramando && (
          <span className="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:mt-2" data-reprogramar={e.id}>
            <Input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} aria-label="Nueva fecha" clasesCampo="tw:w-[170px] tw:flex-none" />
            <Input type="time" value={hora} onChange={(ev) => setHora(ev.target.value)} aria-label="Nueva hora" clasesCampo="tw:w-[120px] tw:flex-none" />
            <Boton tamano="sm" cargando={guardando} onClick={guardarFecha}>Guardar</Boton>
            <Boton variante="fantasma" tamano="sm" onClick={() => { setReprogramando(false); setFecha(e.fecha); setHora(e.hora || ''); }}>Cancelar</Boton>
          </span>
        )}
      </span>

      <span className="tw:flex tw:flex-none tw:gap-0.5">
        {programado ? (
          <>
            <Boton variante="fantasma" tamano="sm" icono="check" data-hecho={e.id} title="Marcar como hecho" aria-label="Marcar como hecho" onClick={() => alActualizar({ estado: 'hecho' }, 'Marcado como hecho.')} />
            <Boton variante="fantasma" tamano="sm" icono="clock" data-repro={e.id} title="Reprogramar" aria-label="Reprogramar" aria-expanded={reprogramando} onClick={() => setReprogramando((v) => !v)} />
            <Boton variante="fantasma" tamano="sm" icono="x" data-canc={e.id} title="Cancelar" aria-label="Cancelar el evento" onClick={() => alActualizar({ estado: 'cancelado' }, 'Evento cancelado.')} />
          </>
        ) : (
          <span data-estado={e.estado}>
            <Badge tono={e.estado === 'hecho' ? 'verde' : 'gris'}>{e.estado === 'hecho' ? 'Hecho' : 'Cancelado'}</Badge>
          </span>
        )}
      </span>
    </div>
  );
}
