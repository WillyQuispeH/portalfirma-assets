// Piezas comunes de Postventa (mismas reglas que src/renderer/postventa.js).
import { abrirUrl } from '../../../utils/app';
import type { IPvMensaje } from '../../../store/interfaces/postventa.interface';

// borde de una Card del kit para las cajas que conservan su estilo de styles.css (react-ui.css va después y gana)
export const BORDE_CARD = 'tw:rounded-2xl tw:border-edge tw:border-b-[3px] tw:border-b-edge-b';

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
