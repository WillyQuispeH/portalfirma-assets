// Textos de la bandeja de Leads (mismas reglas que src/renderer/leads.js).
import type { ILead, ILeadBusqueda } from '../../../store/interfaces/lead.interface';
import type { TTono } from '../../ui/tonos';

export const TONO_ESTADO: Record<string, TTono> = { nuevo: 'azul', contactado: 'amarillo', visita: 'lavanda', negociando: 'durazno', ganado: 'verde', perdido: 'rojo' };

export const FILTROS: [string, string][] = [['abiertos', 'Abiertos'], ['nuevo', 'Nuevos'], ['seguimiento', 'Por seguir'], ['visita', 'Con visita'], ['ganado', 'Ganados'], ['perdido', 'Perdidos'], ['todos', 'Todos']];
const TIPOS: Record<string, string> = { departamento: 'Departamento', casa: 'Casa', oficina: 'Oficina', local_comercial: 'Local', parcela: 'Parcela', terreno_construccion: 'Terreno', bodega: 'Bodega', estacionamiento: 'Estacionamiento' };

export const nombreDe = (l: ILead) => l.nombre || l.telefono || l.chatCon || 'Sin nombre';

// iniciales para el avatar ('#' si el nombre es un teléfono)
export function iniciales(s: string): string {
  if (/^[+\d\s().-]+$/.test(s.trim())) return '#';
  return s.replace(/[^\p{L}\d ]/gu, '').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '#';
}

// '14:32' (hoy), 'ayer', '03/11' o '03/11/25' (otro año)
export function fechaCorta(f?: string): string {
  if (!f) return '';
  const d = new Date(f); const hoy = new Date(); const ayer = new Date(Date.now() - 864e5);
  if (d.toDateString() === hoy.toDateString()) return f.slice(11, 16);
  if (d.toDateString() === ayer.toDateString()) return 'ayer';
  return `${f.slice(8, 10)}/${f.slice(5, 7)}${f.slice(0, 4) !== String(hoy.getFullYear()) ? '/' + f.slice(2, 4) : ''}`;
}

const pesos = (p: ILeadBusqueda['presupuesto']) => (!p ? '' : p.moneda === 'UF' ? `UF ${Number(p.valor).toLocaleString('es-CL')}` : `$${Number(p.valor).toLocaleString('es-CL')}`);

// 'Arriendo · departamento · 2D · 1B · Ñuñoa, Providencia · hasta $700.000'
export function busquedaTxt(b: ILeadBusqueda = {}): string {
  return [
    b.operacion && (b.operacion === 'arriendo' ? 'Arriendo' : 'Compra'),
    b.tipo && (TIPOS[b.tipo] || b.tipo).toLowerCase(),
    b.dormitorios != null && `${b.dormitorios}D`,
    b.banos != null && `${b.banos}B`,
    (b.comunas || []).length && b.comunas!.join(', '),
    b.presupuesto && 'hasta ' + pesos(b.presupuesto),
  ].filter(Boolean).join(' · ');
}
