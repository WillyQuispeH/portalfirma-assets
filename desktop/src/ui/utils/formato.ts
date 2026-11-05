// Formatos compartidos (mismas reglas que precio() de src/renderer/inmo.js).
import type { TMoneda } from '../store/interfaces/negocio.interface';

const num = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

// monto(1234.5, 'UF') -> 'UF 1.234,5' · monto(500000, 'CLP') -> '$500.000'
export function monto(valor: number | null | undefined, moneda: TMoneda = 'UF'): string {
  if (valor == null) return '—';
  const v = Math.round(valor * 100) / 100;
  if (moneda === 'CLP') return '$' + num(v);
  if (moneda === 'USD') return 'US$ ' + num(v);
  return 'UF ' + num(v);
}

export type TPorMoneda = Partial<Record<TMoneda, number>>;

// { UF: 12.5, CLP: 300000 } -> 'UF 12,5 + $300.000'
export function montos(porMoneda: TPorMoneda): string {
  const e = (Object.entries(porMoneda) as [TMoneda, number][]).filter(([, v]) => v);
  return e.length ? e.map(([m, v]) => monto(v, m)).join(' + ') : '—';
}

export function fecha(iso?: string | null): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; }
}

// '03 nov 2026 · 14:05' (fecha y hora, como en el historial de la cartera)
export function fechaHora(iso?: string | null): string {
  if (!iso) return '';
  try { const d = new Date(iso); return fecha(iso) + ' · ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}
