// Tarjeta de indicador (usa las clases .ng-kpi de styles.css).
import type { ReactNode } from 'react';
import Icono from './Icono';

interface IKpiProps {
  icono: string;
  valor: ReactNode;
  texto: string;
  alerta?: boolean;
}

export default function Kpi({ icono, valor, texto, alerta = false }: IKpiProps) {
  return (
    <div className={`ng-kpi ${alerta ? 'bad' : ''}`}>
      <span className="im-kic"><Icono nombre={icono} tam={18} /></span>
      <b>{valor}</b><span>{texto}</span>
    </div>
  );
}
