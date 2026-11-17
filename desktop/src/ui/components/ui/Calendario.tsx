// Calendario mensual (role="grid"): se ve el mes, se elige un día y cada día puede llevar marcas (puntos de color con la cantidad).
//   <Calendario valor={dia} alCambiar={setDia} marcas={{ '2026-11-12': { cantidad: 2, tono: 'amarillo' } }} minimo={hoy} />
// Las fechas van como 'AAAA-MM-DD' (día del calendario, sin hora ni zona: no se corre de día).
//   · valor / alCambiar: el día elegido. mes / alCambiarMes ('AAAA-MM'): opcionales, para controlar qué mes se ve
//     (si no se pasan, el calendario lleva su propio mes y arranca en el del día elegido o en el de hoy).
//   · marcas: por día, cuántas cosas hay y de qué color (hasta 3 puntos; con más, el número).
//   · minimo: los días anteriores no se pueden elegir. deshabilitado(dia): días que no se pueden elegir (p. ej. sin horarios libres).
// Teclado: flechas (±1 día, ±1 semana), Inicio/Fin (lunes/domingo de la semana), Re Pág/Av Pág (mes anterior/siguiente);
// Enter o Espacio eligen. Un solo día entra con Tab (el elegido, o el de hoy, o el primero del mes).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Boton from './Boton';
import { PUNTO, type TTono } from './tonos';
import { cx } from '../../utils/cx';

export interface IMarcaDia { cantidad: number; tono?: TTono }

interface ICalendarioProps {
  valor?: string | null;
  alCambiar: (dia: string) => void;
  marcas?: Record<string, IMarcaDia>;
  minimo?: string;
  deshabilitado?: (dia: string) => boolean;
  mes?: string;
  alCambiarMes?: (mes: string) => void;
  /** para lectores de pantalla */
  etiqueta?: string;
  id?: string;
  className?: string;
}

const p2 = (n: number) => String(n).padStart(2, '0');
const aIso = (a: number, m: number, d: number) => `${a}-${p2(m)}-${p2(d)}`; // m: 1 a 12
const hoyIso = () => { const d = new Date(); return aIso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
/** suma días a una fecha 'AAAA-MM-DD' (al mediodía UTC: sin saltos por horario de verano) */
export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return aIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
const sumarMes = (mes: string, n: number) => {
  const [a, m] = mes.split('-').map(Number); const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${p2((t % 12) + 1)}`;
};
/** 0 = lunes … 6 = domingo */
const diaSemana = (dia: string) => (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7;

const SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const nombreMes = (mes: string) => mayus(new Date(`${mes}-01T12:00:00Z`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
const nombreDia = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export default function Calendario({ valor, alCambiar, marcas, minimo, deshabilitado, mes: mesControlado, alCambiarMes, etiqueta = 'Calendario', id, className }: ICalendarioProps) {
  const hoy = hoyIso();
  const [mesPropio, setMesPropio] = useState((valor || hoy).slice(0, 7));
  const mes = mesControlado ?? mesPropio;
  const irAMes = (m: string) => { if (mesControlado === undefined) setMesPropio(m); alCambiarMes?.(m); };
  const rejilla = useRef<HTMLDivElement>(null);
  const foco = useRef<string | null>(null); // día al que hay que llevar el foco cuando termine de dibujarse el mes

  // las 6 semanas que cubren el mes, desde el lunes anterior al día 1
  const dias = useMemo(() => {
    const primero = `${mes}-01`; const inicio = sumarDias(primero, -diaSemana(primero));
    return Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  }, [mes]);
  const filas = dias.slice(35).some((d) => d.slice(0, 7) === mes) ? 6 : 5;

  const bloqueado = (d: string) => (!!minimo && d < minimo) || !!deshabilitado?.(d);
  // el único día que entra con Tab: el elegido, si se ve; si no, hoy, si se ve; si no, el primero del mes que se pueda elegir
  const entrada = (() => {
    if (valor && valor.slice(0, 7) === mes && !bloqueado(valor)) return valor;
    if (hoy.slice(0, 7) === mes && !bloqueado(hoy)) return hoy;
    return dias.find((d) => d.slice(0, 7) === mes && !bloqueado(d)) || `${mes}-01`;
  })();

  useEffect(() => {
    if (!foco.current) return;
    rejilla.current?.querySelector<HTMLButtonElement>(`[data-dia="${foco.current}"]`)?.focus();
    foco.current = null;
  }, [mes]);

  const mover = (destino: string) => {
    foco.current = destino;
    if (destino.slice(0, 7) !== mes) irAMes(destino.slice(0, 7));
    else { rejilla.current?.querySelector<HTMLButtonElement>(`[data-dia="${destino}"]`)?.focus(); foco.current = null; }
  };
  const teclado = (e: KeyboardEvent<HTMLButtonElement>, d: string) => {
    const dif: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in dif) { e.preventDefault(); mover(sumarDias(d, dif[e.key])); }
    else if (e.key === 'Home') { e.preventDefault(); mover(sumarDias(d, -diaSemana(d))); }
    else if (e.key === 'End') { e.preventDefault(); mover(sumarDias(d, 6 - diaSemana(d))); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault(); const m = sumarMes(d.slice(0, 7), e.key === 'PageUp' ? -1 : 1);
      mover(`${m}-${p2(Math.min(Number(d.slice(8)), 28))}`);
    }
  };

  return (
    <div id={id} className={cx('tw:flex tw:flex-col tw:gap-2', className)}>
      <div className="tw:flex tw:items-center tw:gap-1">
        <b className="tw:flex-1 tw:min-w-0 tw:truncate tw:text-[15px] tw:font-bold" aria-live="polite">{nombreMes(mes)}</b>
        <Boton variante="fantasma" tamano="sm" icono="chevL" aria-label="Mes anterior" title="Mes anterior" data-cal-prev onClick={() => irAMes(sumarMes(mes, -1))} />
        <Boton variante="fantasma" tamano="sm" data-cal-hoy disabled={mes === hoy.slice(0, 7) && valor === hoy} onClick={() => { irAMes(hoy.slice(0, 7)); if (!bloqueado(hoy)) alCambiar(hoy); }}>Hoy</Boton>
        <Boton variante="fantasma" tamano="sm" icono="chevR" aria-label="Mes siguiente" title="Mes siguiente" data-cal-sig onClick={() => irAMes(sumarMes(mes, 1))} />
      </div>

      <div ref={rejilla} role="grid" aria-label={`${etiqueta}: ${nombreMes(mes)}`}>
        <div role="row" className="tw:grid tw:grid-cols-7 tw:gap-1 tw:mb-1">
          {SEMANA.map((s) => <span key={s} role="columnheader" className="tw:text-center tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-wide tw:text-muted">{s}</span>)}
        </div>
        <div className="tw:grid tw:grid-cols-7 tw:gap-1">
          {dias.slice(0, filas * 7).map((d) => {
            const delMes = d.slice(0, 7) === mes; const elegido = d === valor; const esHoy = d === hoy; const bloq = bloqueado(d);
            const marca = marcas?.[d]; const n = marca?.cantidad || 0;
            return (
              <button key={d} type="button" role="gridcell" data-dia={d} data-hoy={esHoy || undefined} data-marcas={n || undefined}
                tabIndex={d === entrada ? 0 : -1} disabled={bloq} aria-selected={elegido} aria-current={esHoy ? 'date' : undefined}
                aria-label={`${nombreDia(d)}${n ? `, ${n} ${n === 1 ? 'visita' : 'visitas'}` : ''}${bloq ? ', no disponible' : ''}`}
                onClick={() => alCambiar(d)} onKeyDown={(e) => teclado(e, d)}
                className={cx(
                  'tw:relative tw:m-0 tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-0.5 tw:h-11 tw:p-0 tw:font-[inherit] tw:text-[13px] tw:font-semibold tw:tabular-nums',
                  'tw:rounded-control tw:border tw:border-solid tw:cursor-pointer tw:transition-colors tw:duration-100',
                  'tw:focus-visible:outline-2 tw:focus-visible:outline-offset-1 tw:focus-visible:outline-lav-edge',
                  'tw:disabled:cursor-default tw:disabled:opacity-40',
                  elegido ? 'tw:bg-lav tw:border-lav-edge tw:text-lav-ink tw:border-b-2'
                    : cx('tw:bg-transparent tw:enabled:hover:bg-hover', esHoy ? 'tw:border-lav-edge' : 'tw:border-transparent', delMes ? 'tw:text-text' : 'tw:text-muted tw:opacity-60'),
                )}>
                <span>{Number(d.slice(8))}</span>
                <span aria-hidden="true" className="tw:flex tw:h-1.5 tw:items-center tw:gap-0.5">
                  {n > 0 && (n <= 3
                    ? Array.from({ length: n }, (_, i) => <i key={i} className={cx('tw:block tw:size-1.5 tw:rounded-full', PUNTO[marca?.tono || 'lavanda'])} />)
                    : <><i className={cx('tw:block tw:size-1.5 tw:rounded-full', PUNTO[marca?.tono || 'lavanda'])} /><small className="tw:text-[9px] tw:font-bold tw:leading-none">{n}</small></>)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
