// Color de cada etapa del tablero (la variable --c de .ng-col y .ng-card en styles.css). Sigue el degradado de la
// marca (azul → violeta) y pasa por rosa y naranjo; la etapa final siempre es verde. Ventas y Arriendos comparten
// las primeras etapas, así que comparten sus colores.
import type { CSSProperties } from 'react';
import type { IEtapa, TNegocioEstado } from '../../../store/interfaces/negocio.interface';

const RAMPA = ['#2f8fe8', '#4a5cf0', '#7c4dff', '#c043d8', '#ec4f86', '#f5803a'];
const VERDE = '#1fa856';
const GRIS = '#8a93a6';

export const colorEtapa = (etapa: IEtapa, i: number): string => (etapa.final ? VERDE : RAMPA[i % RAMPA.length]);

/** el color de un negocio cerrado: ganado en verde, perdido en gris */
export const colorCerrado = (estado: TNegocioEstado): string => (estado === 'ganado' ? VERDE : GRIS);

export const conColor = (c: string) => ({ '--c': c }) as CSSProperties;
