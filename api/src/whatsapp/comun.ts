/* eslint-disable @typescript-eslint/no-base-to-string -- los valores llegan sin tipo (JSON de la app o de wechatia) */
// Utilidades de los asistentes de WhatsApp del servidor: teléfonos, texto y la hora de Chile (lo mismo que hace la app
// en desktop/src/hora.js: los asistentes deben saber qué día y hora es en Chile, no en UTC).

/** últimos 9 dígitos de un celular (así se reconoce a la misma persona aunque venga con +56 o sin él); null si es corto */
export const telNorm = (t: unknown) => {
  const d = String(t ?? '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-9) : null;
};
/** sin tildes, minúsculas y sin espacios en los extremos */
export const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
/** huella de un texto enviado: para reconocerlo después en la conversación de wechatia */
export const huella = (t: unknown) => norm(t).replace(/\s+/g, ' ').slice(0, 120);

const TZ = 'America/Santiago';
function partes(d = new Date()) {
  const o: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d))
    o[p.type] = p.value;
  return {
    fecha: `${o.year}-${o.month}-${o.day}`,
    hora: `${o.hour === '24' ? '00' : o.hour}:${o.minute}`,
    seg: o.second,
  };
}
/** AAAA-MM-DD de hoy en Chile */
export const hoy = () => partes().fecha;
/** HH:MM de ahora en Chile */
export const ahora = () => partes().hora;
/** hora local de Chile «AAAA-MM-DDTHH:MM:SS» (como guardan la fecha los mensajes de los leads) */
export const horaChile = (d = new Date()) => {
  const p = partes(d);
  return `${p.fecha}T${p.hora}:${p.seg}`;
};
/** AAAA-MM-DD + n días (calendario) */
export const sumarDias = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const diaSemana = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', timeZone: 'UTC' });
export const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
/** HH:MM de un instante, en Chile */
export const horaDe = (d: Date) => partes(d).hora;
/** la línea de fecha y hora para los prompts */
export const contexto = () => {
  const f = hoy();
  const m = sumarDias(f, 1);
  return `Hoy es ${diaSemana(f)} ${f} y son las ${ahora()} (hora de Chile). Mañana es ${diaSemana(m)} ${m}.`;
};
/** «DD/MM» de AAAA-MM-DD */
export const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/** Las asistentes que atienden a los clientes por WhatsApp (no son del equipo del ejecutivo de la app). */
export const ATENCION = {
  sofia: { id: 'sofia', nombre: 'Sofía', area: 'Atención de leads' },
  tomas: { id: 'tomas', nombre: 'Tomás', area: 'Atención de clientes' },
} as const;
/** Los personajes del equipo del ejecutivo (desktop/src/personas.js), para firmar los avisos que le llegan. */
const EQUIPO: Record<string, { nombre: string; area: string }> = {
  pedro: { nombre: 'Pedro', area: 'Captación' },
  juanita: { nombre: 'Juanita', area: 'Documentos' },
  diego: { nombre: 'Diego', area: 'Seguimiento' },
  fernanda: { nombre: 'Fernanda', area: 'Leads' },
};
/** «*Sofía* · Atención de leads» */
export const firma = (id: string | null | undefined) => {
  const p = (id && (EQUIPO[id] || (ATENCION as Record<string, { nombre: string; area: string }>)[id])) || null;
  return p ? `*${p.nombre}* · ${p.area}` : '';
};

export const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
