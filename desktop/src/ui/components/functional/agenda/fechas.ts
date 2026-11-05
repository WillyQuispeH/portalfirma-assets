// Fechas de la agenda (mismas reglas que la agenda anterior: el día se toma con toISOString).
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const hoyISO = () => iso(new Date());

// '2026-11-04' -> 'Mañana · miércoles, 4 de noviembre'
export function tituloDia(f: string): string {
  const d = new Date(f + 'T12:00:00');
  const hoy = hoyISO(); const manana = iso(new Date(Date.now() + 864e5));
  const t = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  return (f === hoy ? 'Hoy · ' : f === manana ? 'Mañana · ' : '') + t;
}
