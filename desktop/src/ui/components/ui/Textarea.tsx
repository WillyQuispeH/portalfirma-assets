// Texto largo con la caja del kit, etiqueta y ayuda o error (como Input).
//   <Textarea etiqueta="Notas" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
import { useId, type Ref, type ReactNode, type TextareaHTMLAttributes } from 'react';
import Campo, { CAJA, CAJA_ERROR, CAJA_PENDIENTE, CAJA_RESALTADA } from './Campo';
import { cx } from '../../utils/cx';

interface ITextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string | null;
  /** falta completarlo: borde amarillo (el contenedor lleva la clase «falta») */
  pendiente?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
  /** valor propuesto por Asset: fondo lila */
  resaltado?: boolean;
  clasesCampo?: string;
}

export default function Textarea({ etiqueta, ayuda, error, pendiente, resaltado, clasesCampo, className, id, rows = 3, ...resto }: ITextareaProps) {
  const auto = useId(); const idCampo = id || auto;
  return (
    <Campo id={idCampo} etiqueta={etiqueta} ayuda={ayuda} error={error} className={cx(pendiente && 'falta', clasesCampo)}>
      <textarea id={idCampo} rows={rows} aria-invalid={!!error || undefined} aria-describedby={error || ayuda ? `${idCampo}-msj` : undefined}
        className={cx(CAJA, 'tw:h-auto tw:py-2.5 tw:font-[inherit] tw:leading-relaxed tw:resize-y', error && CAJA_ERROR, pendiente && !error && CAJA_PENDIENTE, resaltado && CAJA_RESALTADA, className)} {...resto} />
    </Campo>
  );
}
