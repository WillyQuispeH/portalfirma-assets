// Campo de texto con etiqueta, ayuda o error, e ícono o sufijo opcionales.
//   <Input etiqueta="Nombre de la tienda" placeholder="Mi tienda" ayuda="https://…" />
//   <Input etiqueta="Precio" sufijo="UF" type="number" error="Ingresa un número" />
// Acepta todos los atributos de <input> (value, onChange, type, placeholder, disabled…).
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import Campo, { CAJA, CAJA_ERROR } from './Campo';
import Icono from './Icono';
import { cx } from '../../utils/cx';

interface IInputProps extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string | null;
  icono?: string; // a la izquierda, dentro de la caja
  sufijo?: ReactNode; // a la derecha, dentro de la caja (p. ej. «UF», «%»)
  clasesCampo?: string; // del contenedor (para el ancho, márgenes…)
}

export default function Input({ etiqueta, ayuda, error, icono, sufijo, clasesCampo, className, id, ...resto }: IInputProps) {
  const auto = useId(); const idCampo = id || auto;
  return (
    <Campo id={idCampo} etiqueta={etiqueta} ayuda={ayuda} error={error} className={clasesCampo}>
      <div className="tw:relative">
        {icono && <span className="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-muted tw:pointer-events-none tw:flex"><Icono nombre={icono} tam={15} /></span>}
        <input id={idCampo} aria-invalid={!!error || undefined} aria-describedby={error || ayuda ? `${idCampo}-msj` : undefined}
          className={cx(CAJA, error && CAJA_ERROR, icono && 'tw:pl-9', sufijo ? 'tw:pr-12' : '', className)} {...resto} />
        {sufijo && <span className="tw:absolute tw:right-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-[13px] tw:font-semibold tw:text-muted tw:pointer-events-none">{sufijo}</span>}
      </div>
    </Campo>
  );
}
