// Campo de texto filled (etiqueta adentro, borde inferior) con ayuda o error, e ícono o sufijo opcionales.
//   <Input etiqueta="Nombre de la tienda" placeholder="Mi tienda" ayuda="https://…" />
//   <Input etiqueta="Precio" sufijo="UF" type="number" error="Ingresa un número" />
//   <Input etiqueta="Titular" ok value="John Doe" />
// Acepta todos los atributos de <input> (value, onChange, type, placeholder, disabled…).
import { useId, type Ref, type InputHTMLAttributes, type ReactNode } from 'react';
import Campo, { CAJA } from './Campo';
import Icono from './Icono';
import { cx } from '../../utils/cx';

interface IInputProps extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string | null;
  /** valor válido: fondo verde y ✓ */
  ok?: boolean;
  /** falta completarlo: borde amarillo (el contenedor lleva la clase «falta») */
  pendiente?: boolean;
  ref?: Ref<HTMLInputElement>;
  /** valor propuesto por Asset: fondo lila */
  resaltado?: boolean;
  icono?: string; // a la izquierda, dentro de la caja
  sufijo?: ReactNode; // a la derecha, dentro de la caja (p. ej. «UF», «%»)
  clasesCampo?: string; // del contenedor (para el ancho, márgenes…)
}

export default function Input({ etiqueta, ayuda, error, ok, pendiente, resaltado, icono, sufijo, clasesCampo, className, id, ...resto }: IInputProps) {
  const auto = useId(); const idCampo = id || auto;
  return (
    <Campo id={idCampo} etiqueta={etiqueta} ayuda={ayuda} error={error} ok={ok} pendiente={pendiente} resaltado={resaltado}
      className={cx(pendiente && 'falta', clasesCampo)}
      antes={icono ? <Icono nombre={icono} tam={15} /> : undefined}
      despues={sufijo == null ? undefined
        : typeof sufijo === 'string' || typeof sufijo === 'number'
          ? <span className="tw:text-[13px] tw:font-semibold tw:text-muted">{sufijo}</span>
          : sufijo}>
      <input id={idCampo} aria-invalid={!!error || undefined} aria-describedby={error || ayuda ? `${idCampo}-msj` : undefined}
        className={cx(CAJA, className)} {...resto} />
    </Campo>
  );
}
