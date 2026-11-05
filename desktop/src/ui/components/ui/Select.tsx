// Lista desplegable (el <select> del sistema, con la caja del kit y flechas arriba/abajo).
//   <Select etiqueta="País" opciones={[['cl', 'Chile'], ['ar', 'Argentina']]} value={pais} onChange={(e) => setPais(e.target.value)} />
//   <Select etiqueta="Tipo"><option value="">Todos</option>…</Select>     (o con las opciones como hijos)
import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import Campo, { CAJA, CAJA_ERROR } from './Campo';
import { cx } from '../../utils/cx';

interface ISelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string | null;
  opciones?: [string, string][]; // [valor, texto]
  vacia?: string; // primera opción con valor '' (p. ej. «Todos»)
  clasesCampo?: string;
}

export default function Select({ etiqueta, ayuda, error, opciones, vacia, clasesCampo, className, id, children, ...resto }: ISelectProps) {
  const auto = useId(); const idCampo = id || auto;
  return (
    <Campo id={idCampo} etiqueta={etiqueta} ayuda={ayuda} error={error} className={clasesCampo}>
      <div className="tw:relative">
        <select id={idCampo} aria-invalid={!!error || undefined} aria-describedby={error || ayuda ? `${idCampo}-msj` : undefined}
          className={cx(CAJA, error && CAJA_ERROR, 'tw:appearance-none tw:pr-9 tw:cursor-pointer', className)} {...resto}>
          {vacia !== undefined && <option value="">{vacia}</option>}
          {opciones?.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          {children}
        </select>
        <svg className="tw:absolute tw:right-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-muted tw:pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m7 9 5-5 5 5M7 15l5 5 5-5" />
        </svg>
      </div>
    </Campo>
  );
}
