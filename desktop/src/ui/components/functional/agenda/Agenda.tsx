// Agenda: visitas, reuniones, firmas, llamadas y tareas, agrupadas por día.
// Hecha con el kit: CabeceraPagina, Boton, Tabs, Card y EstadoVacio; cada evento, EventoCard.
//
// «Nuevo evento» y «Generar orden de visita» siguen en src/renderer/agenda.js (los usan
// también Publicaciones, el Agente y el Lienzo); se llaman por utils/app.ts.
// Los id agNew, agAsk, agRango y agTipo los usa el recorrido de Aprende (components/functional/aprende/lecciones.ts);
// las pruebas, además, [data-dia] con su h3.
import { useEffect, useMemo } from 'react';
import { useEvento, type TEventoRango } from '../../../store/hooks/useEvento.hook';
import { nuevoEvento, ordenVisita, pedirAlAgente, toast } from '../../../utils/app';
import CabeceraPagina from '../../ui/CabeceraPagina';
import Boton from '../../ui/Boton';
import Tabs, { type TTabOpcion } from '../../ui/Tabs';
import Card from '../../ui/Card';
import EstadoVacio from '../../ui/EstadoVacio';
import EventoCard, { TIPOS } from './EventoCard';
import { hoyISO, tituloDia } from './fechas';
import type { IEvento, IEventoCambios, TEventoTipo } from '../../../store/interfaces/evento.interface';

const RANGOS: TTabOpcion<TEventoRango>[] = [['14', 'Próximos 14 días'], ['31', 'Próximo mes'], ['todo', 'Todo']];
const FILTRO_TIPOS: TTabOpcion<TEventoTipo | ''>[] = [['', 'Todo'], ...(Object.entries(TIPOS) as [TEventoTipo, [string, string]][]).map(([k, [t]]): TTabOpcion<TEventoTipo> => [k, t])];

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
      <CabeceraPagina
        titulo="Agenda"
        ilustracion={{ imagen: 'img/formas/agenda.svg', tinte: '#13804b' }}
        subtitulo="Visitas, reuniones, firmas y llamadas. También puedes pedírselo al Agente: «agenda una visita mañana a las 11 en CV-5514 con Ana»."
        acciones={<>
          <Boton id="agAsk" variante="secundario" icono="sparkle" onClick={() => pedirAlAgente('Agenda una visita ')}>Pedírselo al Agente</Boton>
          <Boton id="agNew" icono="plus" onClick={() => nuevoEvento(eventoGetAll)}>Nuevo evento</Boton>
        </>}
      />

      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:mb-4">
        <Tabs id="agRango" dato="r" etiqueta="Rango" opciones={RANGOS} valor={rango} alCambiar={eventoSetRango} />
        <Tabs id="agTipo" dato="t" etiqueta="Tipo de evento" opciones={FILTRO_TIPOS} valor={tipo} alCambiar={eventoSetTipo} className="tw:max-w-full tw:overflow-x-auto" />
      </div>

      {error && <p role="alert" className="tw:text-red-softink">No se pudo leer la agenda: {error}</p>}

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
        <Card>
          <EstadoVacio icono="calendar" texto="No hay eventos en este rango. Crea uno o pídeselo al Agente." />
        </Card>
      ))}
    </div>
  );
}
