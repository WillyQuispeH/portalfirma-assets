// Tarjeta de indicador (usa las clases .ng-kpi de styles.css).
//   <Kpi icono="check" valor={3} texto="cerrados este mes" tono="verde" />   (ícono de color; por defecto, el de la marca)
import type { ReactNode } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';
import { SUAVE, type TTono } from './tonos';

interface IKpiProps {
  icono: string;
  valor: ReactNode;
  texto: string;
  alerta?: boolean;
  tono?: TTono;
}

export default function Kpi({ icono, valor, texto, alerta = false, tono }: IKpiProps) {
  return (
    <div className={`ng-kpi ${alerta ? 'bad' : ''}`}>
      <span className={cx('im-kic', !alerta && tono && SUAVE[tono])}><Icono nombre={icono} tam={18} /></span>
      <b>{valor}</b><span>{texto}</span>
    </div>
  );
}
