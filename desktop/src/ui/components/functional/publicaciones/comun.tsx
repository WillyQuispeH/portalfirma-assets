// Piezas comunes de Publicaciones (mismas reglas que src/renderer/publicaciones.js).
import type { CSSProperties } from 'react';
import Icono from '../../ui/Icono';

// estado del aviso en cada portal: [texto, clase de .im-st]
const ST: Record<string, [string, string]> = {
  active: ['Activo', 'ok'], publicada: ['Publicado', 'ok'], en_feed: ['En el feed', 'wait'], pendiente: ['En espera', 'res'],
  paused: ['Pausado', 'res'], under_review: ['En revisión', 'wait'], closed: ['Finalizado', ''], retirada: ['Retirado', ''], vencida: ['Vencido', 'bad'],
};
// borde de una Card del kit para las tarjetas que conservan su grilla de styles.css (react-ui.css va después y gana)
export const BORDE_CARD = 'tw:rounded-2xl tw:border-edge tw:border-b-[3px] tw:border-b-edge-b';

export const VIA = { api: 'API', feed: 'Feed diario', acuerdo: 'Acuerdo comercial' };

export const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('es-CL'));

export function hace(iso?: string | null): string {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  return m < 60 ? `hace ${Math.max(m, 1)} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`;
}

export function Estado({ s }: { s?: string }) {
  const [t, c] = ST[s || ''] || [s || '—', ''];
  return <i className={`im-st ${c}`}>{t}</i>;
}

// anillo de calidad del aviso (0 a 100), con el color según el puntaje
export function Anillo({ n }: { n: number }) {
  const c = n >= 85 ? '#16a34a' : n >= 65 ? '#4f6ef0' : n >= 40 ? '#d97706' : '#dc2626';
  return <span className="pb-ring" style={{ '--p': n, '--c': c } as CSSProperties}><b>{n}</b></span>;
}

// foto de la propiedad; si no hay o no carga, el ícono
export function Foto({ url, alFallar, fallo }: { url?: string | null; alFallar: () => void; fallo: boolean }) {
  return url && !fallo
    ? <img src={url} alt="" loading="lazy" onError={alFallar} />
    : <span className="ga-noph"><Icono nombre="house" tam={20} /></span>;
}
