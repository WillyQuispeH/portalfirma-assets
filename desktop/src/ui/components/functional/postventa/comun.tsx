// Piezas comunes de Postventa (mismas reglas que src/renderer/postventa.js).
import { abrirUrl } from '../../../utils/app';
import type { IPvMensaje } from '../../../store/interfaces/postventa.interface';

// '2026-03-15' -> '15/03/2026'
export const fmt = (f?: string | null) => (f ? f.split('-').reverse().join('/') : '—');

export function hora(f?: string | null): string {
  if (!f) return '';
  try { return new Date(f).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

// la conversación por WhatsApp como burbujas (con las fotos, que se abren en el navegador)
export function Burbujas({ mensajes }: { mensajes: IPvMensaje[] }) {
  return (
    <div className="pv-chat real">
      {mensajes.map((m, i) => (
        <p key={i} className={m.dir === 'out' ? 'out' : 'in'}>
          {String(m.texto || '').split('\n').map((l, j) => <span key={j}>{j > 0 && <br />}{l}</span>)}
          {(m.fotos || []).map((f) => <a key={f} href="#" onClick={(e) => { e.preventDefault(); abrirUrl(f); }}><img src={f} alt="" loading="lazy" /></a>)}
          {m.fecha && <small>{hora(m.fecha)}</small>}
        </p>
      ))}
    </div>
  );
}
