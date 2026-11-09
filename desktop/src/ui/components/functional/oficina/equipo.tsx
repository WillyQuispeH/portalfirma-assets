// El equipo de «La oficina» (los mismos de src/renderer/oficina.js). Los íconos son los del kit (Icono).
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
