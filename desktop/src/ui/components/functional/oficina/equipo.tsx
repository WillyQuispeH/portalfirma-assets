// El equipo de «La oficina» y los íconos de la pantalla (los mismos de src/renderer/oficina.js).
import type { TMiembro, TTareaEstado } from '../../../store/interfaces/oficina.interface';

export const IMG = 'img/oficina/';

export interface IMiembro { id: TMiembro; nombre: string; area: string; rol: string; color: string; suave: string; vista: string; verTxt: string }
export const EQUIPO: IMiembro[] = [
  { id: 'pedro', nombre: 'Pedro', area: 'Captación', rol: 'Carga de propiedades', color: '#e8780c', suave: '#ffe9d3', vista: 'cartera', verTxt: 'Ver la cartera' },
  { id: 'juanita', nombre: 'Juanita', area: 'Documentos', rol: 'Firmas y contratos', color: '#3b5bdb', suave: '#e3e9ff', vista: 'negocios', verTxt: 'Ver los negocios' },
  { id: 'diego', nombre: 'Diego', area: 'Seguimiento', rol: 'Ventas y arriendos', color: '#0b8a7d', suave: '#d9f3ef', vista: 'negocios', verTxt: 'Ver los negocios' },
  { id: 'fernanda', nombre: 'Fernanda', area: 'Leads', rol: 'Clientes nuevos', color: '#c2255c', suave: '#fbe1ea', vista: 'leads', verTxt: 'Ver los leads' },
];
export const POR = Object.fromEntries(EQUIPO.map((p) => [p.id, p])) as Record<TMiembro, IMiembro>;

// [símbolo, texto] de cada estado de tarea
export const ESTXT: Record<TTareaEstado, [string, string]> = { fail: ['!', 'No logrado'], pend: ['•', 'Te toca'], esp: ['…', 'Esperando'] };

const p = { 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const };
export const SvgX = () => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
export const SvgMas = () => <svg width="20" height="20" viewBox="0 0 20 20" {...p} strokeWidth="2"><path d="M10 4v12M4 10h12" /></svg>;
export const SvgFlecha = ({ abierto }: { abierto: boolean }) => <svg className={abierto ? 'abierto' : ''} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
export const SVG_LUZ = {
  dia: <svg width="18" height="18" viewBox="0 0 18 18" {...p} strokeWidth="1.8"><circle cx="9" cy="9" r="3.4" /><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" /></svg>,
  tarde: <svg width="18" height="18" viewBox="0 0 18 18" {...p} strokeWidth="1.8"><path d="M4.5 12a4.5 4.5 0 0 1 9 0M1.5 12h15M1.5 15h15M9 3v2.5M3.2 6.2l1.6 1.4M14.8 6.2l-1.6 1.4" /></svg>,
  noche: <svg width="18" height="18" viewBox="0 0 18 18" {...p} strokeWidth="1.8"><path d="M14.5 11.2A6 6 0 0 1 6.8 3.5a6 6 0 1 0 7.7 7.7z" /></svg>,
};
export const SvgWa = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .3-3.4-.7-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.2-1.5-1.2-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.6 2.1 1.1 1 2 1.3 2.3 1.4.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z" />
  </svg>
);
