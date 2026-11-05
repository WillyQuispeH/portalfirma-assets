// Paginación por cursor (keyset): rápida aunque haya cientos de miles de filas, a diferencia de OFFSET.
// El cursor es «fecha|id» en base64url, opaco para quien lo recibe.

export const crearCursor = (fecha: Date, id: string) =>
  Buffer.from(`${fecha.toISOString()}|${id}`).toString('base64url');

export function leerCursor(c?: string): { fecha: Date; id: string } | null {
  if (!c) return null;
  try {
    const [f, id] = Buffer.from(c, 'base64url').toString().split('|');
    const fecha = new Date(f);
    return isNaN(fecha.getTime()) || !id ? null : { fecha, id };
  } catch {
    return null;
  }
}
