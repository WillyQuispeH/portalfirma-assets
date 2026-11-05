// Datos de personas en Chile: RUT (módulo 11), correo y teléfono. Mismas reglas que src/renderer/app.js.
const limpiar = (r: string) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();

export function rutValido(r: string) {
  const c = limpiar(r); if (c.length < 2) return false;
  const cuerpo = c.slice(0, -1); let suma = 0; let mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += Number(cuerpo[i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const res = 11 - (suma % 11);
  return c.slice(-1) === (res === 11 ? '0' : res === 10 ? 'K' : String(res));
}
export function formatearRut(r: string) {
  const c = limpiar(r); if (c.length < 2) return r;
  return `${c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${c.slice(-1)}`;
}
export const correoValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
export const telefonoValido = (p: string) => String(p || '').replace(/\D/g, '').length >= 5;
export function normalizarTelefono(p: string) {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 9 && d.startsWith('9')) return '+56' + d; // celular chileno sin código
  return String(p).trim().startsWith('+') ? '+' + d : d.startsWith('56') ? '+' + d : d;
}
