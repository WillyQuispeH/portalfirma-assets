// Agenda: visitas, reuniones, firmas, llamadas y tareas, agrupadas por día.
//
// «Nuevo evento» y «Generar orden de visita» siguen en src/renderer/agenda.js (los usan
// también Publicaciones, el Agente y el Lienzo); se llaman por utils/app.ts.
// Los id agNew, agAsk, agRango y agTipo los usa el recorrido de Aprende (components/functional/aprende/lecciones.ts).
import { useEffect, useMemo } from 'react';
import { useEvento, type TEventoRango } from '../../../store/hooks/useEvento.hook';
import { nuevoEvento, ordenVisita, pedirAlAgente, toast } from '../../../utils/app';
import Icono from '../../ui/Icono';
import Segmentos from '../../ui/Segmentos';
import EventoCard, { TIPOS } from './EventoCard';
import { hoyISO, tituloDia } from './fechas';
import type { IEvento, IEventoCambios, TEventoTipo } from '../../../store/interfaces/evento.interface';

const RANGOS: [TEventoRango, string][] = [['14', 'Próximos 14 días'], ['31', 'Próximo mes'], ['todo', 'Todo']];
const FILTRO_TIPOS: [TEventoTipo | '', string][] = [['', 'Todo'], ...(Object.entries(TIPOS) as [TEventoTipo, [string, string]][]).map(([k, [t]]) => [k, t] as [TEventoTipo, string])];

export default function Agenda() {
  const { eventos, rango, tipo, cargado, error, eventoGetAll, eventoSetRango, eventoSetTipo, eventoUpdate, eventoSincronizar } = useEvento();

  useEffect(() => { eventoSincronizar(); eventoGetAll(); }, [eventoSincronizar, eventoGetAll]);

  const dias = useMemo(() => {
    const m = new Map<string, IEvento[]>();
    for (const e of eventos) m.set(e.fecha, [...(m.get(e.fecha) || []), e]);
    return [...m.entries()];
  }, [eventos]);
  const hoy = hoyISO();

  const actualizar = async (id: string, cambios: IEventoCambios, aviso: string) => {
    const error = await eventoUpdate(id, cambios);
    toast(error || aviso, error ? 5000 : undefined);
    return !error;
  };

  return (
    <div className="im-wrap">
      <div className="im-head fx-agenda">
        <div>
          <h1>Agenda</h1>
          <p className="muted">Visitas, reuniones, firmas y llamadas. También puedes pedírselo al Agente: «agenda una visita mañana a las 11 en CV-5514 con Ana».</p>
        </div>
        <div className="row">
          <button className="secondary" id="agAsk" onClick={() => pedirAlAgente('Agenda una visita ')}><Icono nombre="sparkle" tam={15} /> Pedírselo al Agente</button>
          <button className="primary" id="agNew" onClick={() => nuevoEvento(eventoGetAll)}><Icono nombre="plus" tam={15} /> Nuevo evento</button>
        </div>
      </div>

      <div className="im-bar">
        <Segmentos id="agRango" dato="r" etiqueta="Rango" opciones={RANGOS} valor={rango} alCambiar={eventoSetRango} />
        <Segmentos id="agTipo" dato="t" etiqueta="Tipo de evento" opciones={FILTRO_TIPOS} valor={tipo} alCambiar={eventoSetTipo} />
      </div>

      {error && <p className="error">No se pudo leer la agenda: {error}</p>}

      {cargado && (dias.length ? dias.map(([dia, lista]) => (
        <section key={dia} className="tw:mb-[18px]" data-dia={dia}>
          <h3 className={`tw:capitalize tw:mt-0 tw:mb-2 tw:ml-1 tw:text-[13px] ${dia === hoy ? 'tw:text-brand' : 'tw:text-muted'}`}>{tituloDia(dia)}</h3>
          {lista.map((e) => (
            <EventoCard key={e.id} evento={e}
              alActualizar={(c, aviso) => actualizar(e.id, c, aviso)}
              alPedirOrden={() => ordenVisita(e, eventoGetAll)} />
          ))}
        </section>
      )) : (
        <div className="im-empty sm">
          <span className="im-eic"><Icono nombre="calendar" tam={30} /></span>
          <p>No hay eventos en este rango. Crea uno o pídeselo al Agente.</p>
        </div>
      ))}
    </div>
  );
}
