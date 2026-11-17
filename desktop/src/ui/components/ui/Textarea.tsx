// Texto largo filled (etiqueta adentro, borde inferior), con ayuda o error (como Input).
//   <Textarea etiqueta="Notas" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
import { useId, type Ref, type ReactNode, type TextareaHTMLAttributes } from 'react';
import Campo, { CAJA } from './Campo';
import { cx } from '../../utils/cx';

interface ITextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string | null;
  /** valor válido: fondo verde y ✓ */
  ok?: boolean;
  /** falta completarlo: borde amarillo (el contenedor lleva la clase «falta») */
  pendiente?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
  /** valor propuesto por Asset: fondo lila */
  resaltado?: boolean;
  clasesCampo?: string;
}

export default function Textarea({ etiqueta, ayuda, error, ok, pendiente, resaltado, clasesCampo, className, id, rows = 3, ...resto }: ITextareaProps) {
  const auto = useId(); const idCampo = id || auto;
  return (
    <Campo id={idCampo} etiqueta={etiqueta} ayuda={ayuda} error={error} ok={ok} pendiente={pendiente} resaltado={resaltado}
      multilinea className={cx(pendiente && 'falta', clasesCampo)}>
      <textarea id={idCampo} rows={rows} aria-invalid={!!error || undefined} aria-describedby={error || ayuda ? `${idCampo}-msj` : undefined}
        className={cx(CAJA, 'tw:font-[inherit] tw:leading-relaxed tw:resize-y', className)} {...resto} />
    </Campo>
  );
}
