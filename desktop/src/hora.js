// 0.16.19 · Hora de Chile para todo lo que «sabe» qué día y hora es (agentes, agenda, horarios libres). Antes se usaba la
// fecha UTC (toISOString), que en Chile cambia de día a las 21:00, y los agentes no sabían la hora: proponían horarios
// que ya habían pasado o calculaban «mañana» mal.
'use strict';
const TZ = () => process.env.PF_TZ || 'America/Santiago';
function partes(d = new Date()) {
  const o = {}; for (const p of new Intl.DateTimeFormat('en-CA', { timeZone: TZ(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)) o[p.type] = p.value;
  return { fecha: `${o.year}-${o.month}-${o.day}`, hora: `${o.hour === '24' ? '00' : o.hour}:${o.minute}` };
}
const hoy = () => partes().fecha;
const ahora = () => partes().hora;
const fechaDe = (d) => partes(d instanceof Date ? d : new Date(d)).fecha;
// AAAA-MM-DD + n días (calendario, sin problemas de horario de verano)
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaSemana = (f) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', timeZone: 'UTC' });
const fechaLarga = (f) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
// línea para los prompts de los agentes
const contexto = () => { const f = hoy(); return `Hoy es ${diaSemana(f)} ${f} y son las ${ahora()} (hora de Chile). Mañana es ${diaSemana(sumarDias(f, 1))} ${sumarDias(f, 1)}.`; };
module.exports = { TZ, partes, hoy, ahora, fechaDe, sumarDias, diaSemana, fechaLarga, contexto };
