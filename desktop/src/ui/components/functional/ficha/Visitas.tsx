// Pestaña «Visitas» de la ficha de la propiedad: el calendario con sus visitas, los horarios libres del día elegido para agendar
// una nueva y la lista de todas las visitas. Una propiedad puede tener muchas visitas, y cada visita puede ir ligada a uno de
// sus negocios (una propiedad puede estar en varios).
// REGLA: las visitas no se pueden sobreponer, ni las de una misma propiedad ni las de un mismo corredor (no puede estar en dos
// visitas a la vez). Aquí los horarios que se cruzan salen bloqueados; la regla de verdad está en src/agenda.js (conflicto), que también
// la aplican el Agente y Sofía por WhatsApp, y en el servidor (api/src/agenda/eventos.ts).
// Hecha con el kit: Calendario, Card, Tabs, Select, Input, Boton, Badge y EventoCard (para marcar hecha, reprogramar y cancelar).
// Los id y data-* (#viCal, #viHorarios, [data-hora], #viDur, #viPersona, #viNegocio, #viNotas, #viAgendar, #viLista, [data-vi])
// los usan las pruebas.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../../ui/Card';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Select from '../../ui/Select';
import Input from '../../ui/Input';
import Tabs, { type TTabOpcion } from '../../ui/Tabs';
import Calendario, { type IMarcaDia } from '../../ui/Calendario';
import EstadoVacio from '../../ui/EstadoVacio';
import { ErrorVentana } from '../negocios/VentanasAntiguas';
import EventoCard from '../agenda/EventoCard';
import { tituloDia } from '../agenda/fechas';
import { DURACIONES, DUR_VISITA, aHora, aMin, calcularHorarios, hoyLocal, finDe as fin, tituloHorario } from '../agenda/horarios';
import { useFicha } from '../../../store/hooks/useFicha.hook';
import { usePerfil } from '../../../store/hooks/usePerfil.hook';
import { eventoService } from '../../../store/services/evento.service';
import { ordenVisita, toast } from '../../../utils/app';
import { cx } from '../../../utils/cx';
import type { IEvento, IEventoCambios } from '../../../store/interfaces/evento.interface';
import type { IPropiedad } from '../../../store/interfaces/propiedad.interface';

const mayus = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

type TFiltro = 'proximas' | 'pasadas' | 'todas';
const FILTROS: TTabOpcion<TFiltro>[] = [['proximas', 'Próximas'], ['pasadas', 'Realizadas y canceladas'], ['todas', 'Todas']];

export default function Visitas({ p }: { p: IPropiedad }) {
  const { negocios, personas, fichaRecargar, tab, version } = useFicha();
  const { perfil } = usePerfil(); const yo = perfil?.usuarioId || null;
  const hoy = hoyLocal();
  const [todas, setTodas] = useState<IEvento[]>([]); // todas las visitas que ve este usuario (para saber cuándo está ocupado él)
  const [cargado, setCargado] = useState(false);
  const [dia, setDia] = useState(hoy);
  const [hora, setHora] = useState('');
  const [dur, setDur] = useState(String(DUR_VISITA));
  const [personaId, setPersonaId] = useState('');
  const [negocioId, setNegocioId] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState<TFiltro>('proximas');

  const cargar = useCallback(async () => {
    try { setTodas(await eventoService.getAll({ tipo: 'visita' })); setError(''); }
    catch (e) { setError(mensaje(e)); }
    setCargado(true);
  }, [p.id]);
  useEffect(() => { setCargado(false); cargar(); }, [cargar]);
  // la pestaña siempre está montada (se oculta): al volver a verla se piden de nuevo, por si se agendó desde otro lado (Agenda, Agente, WhatsApp)
  useEffect(() => { if (tab === 'visitas') cargar(); }, [tab, version, cargar]);

  const visitas = useMemo(() => todas.filter((e) => e.propId === p.id || e.prop?.id === p.id), [todas, p.id]);
  // las del corredor en cualquier propiedad ese día (las sin corredor todavía son de quien las creó aquí)
  const mias = useMemo(() => !yo ? [] : todas.filter((e) => e.fecha === dia && e.propId !== p.id && e.prop?.id !== p.id && (e.corredorId === undefined || e.corredorId === yo)), [todas, dia, p.id, yo]);
  const delDia = useMemo(() => visitas.filter((e) => e.fecha === dia).sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99')), [visitas, dia]);
  const marcas = useMemo(() => {
    const m: Record<string, IMarcaDia> = {};
    for (const e of visitas) {
      if (e.estado === 'cancelado') continue;
      const x = m[e.fecha] ||= { cantidad: 0, tono: 'verde' };
      x.cantidad++; if (e.estado === 'programado') x.tono = 'amarillo';
    }
    return m;
  }, [visitas]);

  // horarios del día elegido: libres, ocupados por otra visita, o ya pasados (si el día es hoy)
  const horarios = useMemo(() => calcularHorarios({ delDia, mias, dia, hoy, dur: Number(dur) || DUR_VISITA }), [delDia, mias, dia, dur, hoy]);
  const libres = horarios.filter((x) => x.estado === 'libre').length;
  // si al cambiar el día o la duración la hora elegida ya no cabe, se desmarca
  useEffect(() => { if (hora && horarios.find((x) => x.h === hora)?.estado !== 'libre') setHora(''); }, [horarios, hora]);

  // personas: primero los clientes de los negocios de la propiedad, luego el resto de la cartera
  const clientes = useMemo(() => {
    const ids = new Set(negocios.map((n) => n.cliente?.id).filter(Boolean) as string[]);
    const nombre = (x: { nombre?: string }) => x.nombre || '';
    const arriba = personas.filter((x) => ids.has(x.id)); const resto = personas.filter((x) => !ids.has(x.id)).sort((a, b) => nombre(a).localeCompare(nombre(b))).slice(0, 300);
    // lista plana (el Select del kit no tiene grupos): primero los clientes de los negocios de esta propiedad, luego el resto
    return [...arriba.map((c): [string, string] => [c.id, `${c.nombre} · con negocio aquí`]), ...resto.map((c): [string, string] => [c.id, nombre(c)])];
  }, [negocios, personas]);
  const abiertos = negocios.filter((n) => n.estado === 'abierto');

  // al elegir un negocio, la persona del negocio queda elegida (si no se había elegido otra)
  const elegirNegocio = (id: string) => { setNegocioId(id); const c = negocios.find((n) => n.id === id)?.cliente?.id; if (c && !personaId) setPersonaId(c); };

  const agendar = async () => {
    if (!hora) return setError('Elige un horario libre del día.');
    setGuardando(true); setError('');
    try {
      await eventoService.crear({ tipo: 'visita', fecha: dia, hora, duracion: Number(dur) || DUR_VISITA, propId: p.id, personaIds: personaId ? [personaId] : [], negocioId: negocioId || undefined, notas: notas.trim() || undefined });
      toast(`Visita agendada: ${tituloDia(dia).replace(/^(Hoy|Mañana) · /, '')} a las ${hora}.`);
      setHora(''); setNotas(''); await cargar(); fichaRecargar();
    } catch (e) { setError(mensaje(e)); await cargar(); }   // si se cruzó con otra (agendada desde otro lado), se recarga y el horario sale bloqueado
    setGuardando(false);
  };

  const actualizar = async (id: string, cambios: IEventoCambios, aviso: string) => {
    try { await eventoService.update(id, cambios); toast(aviso); await cargar(); fichaRecargar(); return true; }
    catch (e) { toast(mensaje(e), 5000); return false; }
  };

  const lista = useMemo(() => {
    const todas = [...visitas].sort((a, b) => (a.fecha + (a.hora || '99')).localeCompare(b.fecha + (b.hora || '99')));
    if (filtro === 'todas') return todas;
    const prox = (e: IEvento) => e.estado === 'programado' && e.fecha >= hoy;
    return filtro === 'proximas' ? todas.filter(prox) : todas.filter((e) => !prox(e)).reverse();
  }, [visitas, filtro, hoy]);
  const nProximas = visitas.filter((e) => e.estado === 'programado' && e.fecha >= hoy).length;
  const nombreDia = tituloDia(dia);

  return (
    <div className="tw:flex tw:flex-col tw:gap-4" data-vi-panel>
      <div className="tw:grid tw:gap-4 tw:lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] tw:items-start">
        <Card titulo="Calendario" subtitulo={nProximas ? `${nProximas} ${nProximas === 1 ? 'visita próxima' : 'visitas próximas'}` : 'Sin visitas próximas'}>
          <Calendario id="viCal" valor={dia} alCambiar={(d) => { setDia(d); setError(''); }} marcas={marcas} minimo={hoy} etiqueta="Visitas de la propiedad" />
          <p className="tw:m-0 tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:text-xs tw:text-muted">
            <span className="tw:inline-flex tw:items-center tw:gap-1.5"><i className="tw:block tw:size-2 tw:rounded-full tw:bg-yellow-edge" /> Programada</span>
            <span className="tw:inline-flex tw:items-center tw:gap-1.5"><i className="tw:block tw:size-2 tw:rounded-full tw:bg-green-edge" /> Realizada</span>
          </p>
        </Card>

        <Card titulo={mayus(nombreDia)} subtitulo={delDia.filter((e) => e.estado !== 'cancelado').length ? 'Las visitas no se pueden sobreponer' : 'Elige un horario libre para agendar'}>
          {delDia.length > 0 && (
            <ul className="tw:m-0 tw:mb-3 tw:flex tw:list-none tw:flex-col tw:gap-1.5 tw:p-0" data-vi-dia>
              {delDia.map((e) => (
                <li key={e.id} data-vi={e.id} className={cx('tw:flex tw:items-center tw:gap-3 tw:rounded-control tw:bg-sunken tw:px-3 tw:py-2 tw:text-[13px]', e.estado === 'cancelado' && 'tw:opacity-60')}>
                  <b className="tw:tabular-nums">{e.hora ? `${e.hora}–${aHora(fin(e))}` : 'Sin hora'}</b>
                  <span className={cx('tw:min-w-0 tw:flex-1 tw:truncate', e.estado === 'cancelado' && 'tw:line-through')}>{e.personas.map((c) => c.nombre).join(', ') || 'Sin persona'}</span>
                  <Badge tono={e.estado === 'programado' ? 'amarillo' : e.estado === 'hecho' ? 'verde' : 'gris'}>{e.estado === 'programado' ? 'Programada' : e.estado === 'hecho' ? 'Realizada' : 'Cancelada'}</Badge>
                </li>
              ))}
            </ul>
          )}

          <div id="viHorarios" role="group" aria-label={`Horarios del ${nombreDia}`} className="tw:grid tw:grid-cols-[repeat(auto-fill,minmax(74px,1fr))] tw:gap-1.5">
            {horarios.map(({ h, estado, con }) => (
              <button key={h} type="button" data-hora={h} data-estado={estado} disabled={estado !== 'libre'} aria-pressed={hora === h}
                title={tituloHorario({ h, estado, con })}
                onClick={() => { setHora(h); setError(''); }}
                className={cx('tw:m-0 tw:h-9 tw:font-[inherit] tw:text-[13px] tw:font-semibold tw:tabular-nums tw:rounded-control tw:border tw:border-solid tw:cursor-pointer tw:transition-colors tw:duration-100',
                  'tw:focus-visible:outline-2 tw:focus-visible:outline-offset-1 tw:focus-visible:outline-lav-edge tw:disabled:cursor-default',
                  hora === h ? 'tw:bg-lav tw:border-lav-edge tw:text-lav-ink tw:border-b-2'
                    : estado === 'libre' ? 'tw:bg-card tw:border-edge tw:text-text tw:hover:bg-hover'
                      : 'tw:bg-sunken tw:border-transparent tw:text-muted tw:opacity-55 tw:line-through')}>{h}</button>
            ))}
          </div>
          <p className="tw:m-0 tw:mt-2 tw:text-xs tw:text-muted" aria-live="polite">{libres ? `${libres} ${libres === 1 ? 'horario libre' : 'horarios libres'}` : 'No quedan horarios libres este día: elige otro.'}{horarios.some((x) => x.estado === 'tuyo') && ' Los tachados con otra visita tuya en otra propiedad también están ocupados.'}</p>

          <div className="tw:mt-4 tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <Select etiqueta="Duración" id="viDur" opciones={DURACIONES} value={dur} onChange={(e) => setDur(e.target.value)} />
            <Select etiqueta={<>Negocio <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="viNegocio" vacia="Ninguno" value={negocioId} onChange={(e) => elegirNegocio(e.target.value)}
              opciones={abiertos.map((n): [string, string] => [n.id, `${n.cliente?.nombre || 'Sin cliente'} · ${n.tipo === 'venta' ? 'Venta' : 'Arriendo'}`])} />
            <Select etiqueta={<>Persona <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="viPersona" vacia="Sin persona" value={personaId} onChange={(e) => setPersonaId(e.target.value)} opciones={clientes} />
            <Input etiqueta={<>Notas <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="viNotas" autoComplete="off" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>

          <ErrorVentana id="viErr" texto={error} />
          <div className="tw:mt-4 tw:flex tw:items-center tw:justify-end tw:gap-3">
            {hora && <span className="tw:mr-auto tw:text-[13px] tw:text-muted">{hora}–{aHora(aMin(hora) + (Number(dur) || DUR_VISITA))}</span>}
            <Boton id="viAgendar" icono="calendar" cargando={guardando} disabled={!hora} onClick={agendar}>Agendar visita</Boton>
          </div>
        </Card>
      </div>

      <Card titulo="Visitas de la propiedad" subtitulo="Marca las hechas, reprograma o cancela desde aquí"
        accion={<Tabs id="viFiltro" etiqueta="Qué visitas ver" opciones={FILTROS} valor={filtro} alCambiar={setFiltro} />}>
        <div id="viLista">
          {!cargado ? <EstadoVacio compacto texto="Cargando…" />
            : lista.length ? lista.map((e) => (
              <div key={e.id}>
                <p className="tw:m-0 tw:mb-1 tw:ml-1 tw:text-xs tw:text-muted">{mayus(tituloDia(e.fecha))}{e.negocioId && negocios.find((n) => n.id === e.negocioId) ? ` · ${negocios.find((n) => n.id === e.negocioId)?.cliente?.nombre || 'Negocio'}` : ''}</p>
                <EventoCard evento={e} alActualizar={(c, aviso) => actualizar(e.id, c, aviso)} alPedirOrden={() => ordenVisita(e, cargar)} />
              </div>
            ))
              : <EstadoVacio compacto texto={filtro === 'proximas' ? 'No hay visitas próximas. Elige un día en el calendario y agenda una.' : 'No hay visitas en esta lista.'} />}
        </div>
      </Card>
    </div>
  );
}
