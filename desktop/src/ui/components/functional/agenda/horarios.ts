// Horarios de las visitas: qué horas se ofrecen y cuáles están ocupadas. Lo usan la pestaña «Visitas» de la propiedad y el paso
// «Visita agendada» del negocio. La regla de verdad (las visitas no se sobreponen, ni en una propiedad ni para un corredor) está en
// src/agenda.js y en el servidor; esto solo bloquea los horarios a la vista para no ofrecer lo que se va a rechazar.
import type { IEvento } from '../../../store/interfaces/evento.interface';

export const DUR_VISITA = 45; // minutos, si no se dijo otra cosa (igual que src/agenda.js)
export const DESDE = 8 * 60; export const HASTA = 21 * 60; export const PASO = 30; // se ofrece de 08:00 a 21:00, cada 30 minutos
export const DURACIONES: [string, string][] = [['30', '30 minutos'], ['45', '45 minutos'], ['60', '1 hora'], ['90', '1 hora y media'], ['120', '2 horas']];

/** hoy en la fecha del computador (AAAA-MM-DD): fechas.ts usa UTC, que de noche ya es mañana, y aquí se compara con la hora local */
export const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const aMin = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
export const aHora = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const finDe = (e: IEvento) => (e.hora ? aMin(e.hora) + (e.duracion || DUR_VISITA) : 0);
/** ocupa horario: tiene hora y no está cancelada */
export const ocupa = (e: IEvento) => e.estado !== 'cancelado' && !!e.hora;
/** la hora de inicio `ini` con `dur` minutos se cruza con alguna de las visitas */
export const cruza = (visitas: IEvento[], ini: number, dur: number) => visitas.find((e) => ocupa(e) && ini < finDe(e) && aMin(e.hora as string) < ini + dur) || null;

export type TEstadoHorario = 'libre' | 'ocupado' | 'tuyo' | 'pasado';
export interface IHorario { h: string; estado: TEstadoHorario; con?: IEvento }

/**
 * Los horarios de un día: libres, ocupados por otra visita de la propiedad, ocupados por otra visita del corredor en otra
 * propiedad ('tuyo') o ya pasados (si el día es hoy).
 */
export function calcularHorarios(o: { delDia: IEvento[]; mias: IEvento[]; dia: string; hoy: string; dur: number }): IHorario[] {
  const ahora = new Date(); const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const lista: IHorario[] = [];
  for (let m = DESDE; m < HASTA; m += PASO) {
    const otra = cruza(o.mias, m, o.dur);
    lista.push({ h: aHora(m), estado: o.dia === o.hoy && m <= minAhora ? 'pasado' : cruza(o.delDia, m, o.dur) ? 'ocupado' : otra ? 'tuyo' : 'libre', con: otra || undefined });
  }
  return lista;
}

export const tituloHorario = ({ estado, con }: IHorario) => estado === 'ocupado' ? 'Se cruza con otra visita de esta propiedad'
  : estado === 'tuyo' ? `Ya tienes otra visita a esa hora${con?.prop ? ` (${con.prop.codigo})` : ''}` : estado === 'pasado' ? 'Ya pasó' : undefined;
