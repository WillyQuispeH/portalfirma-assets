// Fechas de la Actividad (mismas reglas que la pantalla anterior).

// 'Hoy', 'Ayer' o 'Lunes, 3 de noviembre' (con la fecha local)
export function tituloDia(iso: string): string {
  const d = new Date(iso); const h = new Date();
  const dias = Math.floor((new Date(h.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  const t = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  return t[0].toUpperCase() + t.slice(1);
}

export const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
