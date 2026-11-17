// Elegir día, hora y duración de una visita: el calendario con los días que ya tienen visitas y, del día elegido, los horarios
// libres (los que se cruzan con otra visita de la propiedad o del corredor salen tachados). Lo usa el paso «Visita agendada» del
// negocio; la pestaña «Visitas» de la propiedad arma lo mismo con su propio diseño.
//   <SelectorHorario propId={p} valor={{ fecha, hora, duracion }} alCambiar={setV} ignorar={idDeLaVisitaQueSeReprograma} />
// Los id y data-* (#shCal, #shHorarios, [data-hora], #shDur) los usan las pruebas.
import { useEffect, useMemo, useState } from 'react';
import Calendario, { type IMarcaDia } from '../../ui/Calendario';
import Select from '../../ui/Select';
import { cx } from '../../../utils/cx';
import { eventoService } from '../../../store/services/evento.service';
import { usePerfil } from '../../../store/hooks/usePerfil.hook';
import { DURACIONES, DUR_VISITA, aHora, aMin, calcularHorarios, hoyLocal, tituloHorario } from './horarios';
import type { IEvento } from '../../../store/interfaces/evento.interface';

export interface IHorarioElegido { fecha: string; hora: string; duracion: string }

interface ISelectorHorarioProps {
  propId: string;
  valor: IHorarioElegido;
  alCambiar: (v: IHorarioElegido) => void;
  /** la visita que se está reprogramando: no cuenta como ocupada */
  ignorar?: string | null;
}

export default function SelectorHorario({ propId, valor, alCambiar, ignorar }: ISelectorHorarioProps) {
  const { perfil } = usePerfil(); const yo = perfil?.usuarioId || null;
  const hoy = hoyLocal();
  const [todas, setTodas] = useState<IEvento[]>([]);
  useEffect(() => { eventoService.getAll({ tipo: 'visita' }).then(setTodas).catch(() => setTodas([])); }, []);

  const activas = useMemo(() => todas.filter((e) => e.id !== ignorar), [todas, ignorar]);
  const esDeLaPropiedad = (e: IEvento) => e.propId === propId || e.prop?.id === propId;
  const delDia = useMemo(() => activas.filter((e) => e.fecha === valor.fecha && esDeLaPropiedad(e)), [activas, valor.fecha, propId]); // eslint-disable-line react-hooks/exhaustive-deps
  const mias = useMemo(() => (!yo ? [] : activas.filter((e) => e.fecha === valor.fecha && !esDeLaPropiedad(e) && (e.corredorId === undefined || e.corredorId === yo))), [activas, valor.fecha, propId, yo]); // eslint-disable-line react-hooks/exhaustive-deps
  const marcas = useMemo(() => {
    const m: Record<string, IMarcaDia> = {};
    for (const e of activas) {
      if (e.estado === 'cancelado' || !esDeLaPropiedad(e)) continue;
      const x = m[e.fecha] ||= { cantidad: 0, tono: 'verde' }; x.cantidad++; if (e.estado === 'programado') x.tono = 'amarillo';
    }
    return m;
  }, [activas, propId]); // eslint-disable-line react-hooks/exhaustive-deps
  const dur = Number(valor.duracion) || DUR_VISITA;
  const horarios = useMemo(() => calcularHorarios({ delDia, mias, dia: valor.fecha, hoy, dur }), [delDia, mias, valor.fecha, hoy, dur]);
  const libres = horarios.filter((x) => x.estado === 'libre').length;

  // si al cambiar el día o la duración la hora elegida ya no cabe, se desmarca
  useEffect(() => { if (valor.hora && horarios.find((x) => x.h === valor.hora)?.estado !== 'libre') alCambiar({ ...valor, hora: '' }); }, [horarios]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="tw:grid tw:gap-4 tw:sm:grid-cols-[minmax(250px,300px)_minmax(0,1fr)] tw:items-start">
      <Calendario id="shCal" valor={valor.fecha} alCambiar={(d) => alCambiar({ ...valor, fecha: d, hora: '' })} marcas={marcas} minimo={hoy} etiqueta="Día de la visita" />
      <div className="tw:flex tw:flex-col tw:gap-2.5">
        <Select etiqueta="Duración" id="shDur" opciones={DURACIONES} value={valor.duracion} onChange={(e) => alCambiar({ ...valor, duracion: e.target.value })} />
        <div id="shHorarios" role="group" aria-label="Horarios del día" className="tw:grid tw:grid-cols-[repeat(auto-fill,minmax(64px,1fr))] tw:gap-1.5">
          {horarios.map((hz) => (
            <button key={hz.h} type="button" data-hora={hz.h} data-estado={hz.estado} disabled={hz.estado !== 'libre'} aria-pressed={valor.hora === hz.h}
              title={tituloHorario(hz)} onClick={() => alCambiar({ ...valor, hora: hz.h })}
              className={cx('tw:m-0 tw:h-8 tw:font-[inherit] tw:text-[13px] tw:font-semibold tw:tabular-nums tw:rounded-control tw:border tw:border-solid tw:cursor-pointer tw:transition-colors tw:duration-100',
                'tw:focus-visible:outline-2 tw:focus-visible:outline-offset-1 tw:focus-visible:outline-lav-edge tw:disabled:cursor-default',
                valor.hora === hz.h ? 'tw:bg-lav tw:border-lav-edge tw:text-lav-ink tw:border-b-2'
                  : hz.estado === 'libre' ? 'tw:bg-card tw:border-edge tw:text-text tw:hover:bg-hover'
                    : 'tw:bg-sunken tw:border-transparent tw:text-muted tw:opacity-55 tw:line-through')}>{hz.h}</button>
          ))}
        </div>
        <p className="tw:m-0 tw:text-xs tw:text-muted" aria-live="polite">
          {valor.hora ? `Visita de ${valor.hora} a ${aHora(aMin(valor.hora) + dur)}.` : libres ? `${libres} ${libres === 1 ? 'horario libre' : 'horarios libres'}: elige uno.` : 'No quedan horarios libres este día: elige otro.'}
        </p>
      </div>
    </div>
  );
}
