// Texto largo con la caja del kit, etiqueta y ayuda o error (como Input).
//   <Textarea etiqueta="Notas" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';
import Campo, { CAJA, CAJA_ERROR } from './Campo';
import { cx } from '../../utils/cx';

interface ITextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string | null;
  clasesCampo?: string;
}

export default function Textarea({ etiqueta, ayuda, error, clasesCampo, className, id, rows = 3, ...resto }: ITextareaProps) {
  const auto = useId(); const idCampo = id || auto;
  return (
    <Campo id={idCampo} etiqueta={etiqueta} ayuda={ayuda} error={error} className={clasesCampo}>
      <textarea id={idCampo} rows={rows} aria-invalid={!!error || undefined} aria-describedby={error || ayuda ? `${idCampo}-msj` : undefined}
        className={cx(CAJA, 'tw:h-auto tw:py-2.5 tw:leading-relaxed tw:resize-y', error && CAJA_ERROR, className)} {...resto} />
    </Campo>
  );
}
