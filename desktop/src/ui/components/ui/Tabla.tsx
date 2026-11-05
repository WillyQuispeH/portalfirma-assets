// Tabla de datos con columnas configurables, fila clicable y mensaje cuando está vacía.
//   <Tabla
//     columnas={[
//       { clave: 'pais', titulo: 'País' },
//       { clave: 'clientes', titulo: 'Clientes', alinear: 'derecha' },
//       { clave: 'estado', titulo: 'Estado', render: (f) => <Badge tono="verde">{f.estado}</Badge> },
//     ]}
//     filas={paises} claveFila={(f) => f.id} alTocarFila={(f) => abrir(f.id)} vacio="Sin países todavía." />
import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';

export interface IColumna<T> {
  clave: string;
  titulo: ReactNode;
  alinear?: 'izquierda' | 'centro' | 'derecha';
  ancho?: string; // p. ej. '120px' o '30%'
  render?: (fila: T) => ReactNode; // si no se da, muestra fila[clave]
}

interface ITablaProps<T> {
  columnas: IColumna<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
  alTocarFila?: (fila: T) => void;
  vacio?: ReactNode;
  compacta?: boolean;
  /** atributos extra de cada fila (p. ej. data-* para las pruebas o para identificarla) */
  atributosFila?: (fila: T) => Record<string, string>;
  className?: string;
}

const ALINEAR = { izquierda: 'tw:text-left', centro: 'tw:text-center', derecha: 'tw:text-right' };

export default function Tabla<T>({ columnas, filas, claveFila, alTocarFila, vacio = 'No hay datos.', compacta = false, atributosFila, className }: ITablaProps<T>) {
  const celda = compacta ? 'tw:px-4 tw:py-2' : 'tw:px-5 tw:py-3';
  return (
    <div className={cx('tw:w-full tw:overflow-x-auto', className)}>
      <table className="tw:w-full tw:border-collapse tw:text-sm">
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.clave} scope="col" style={c.ancho ? { width: c.ancho } : undefined}
                className={cx(celda, ALINEAR[c.alinear || 'izquierda'], 'tw:font-medium tw:text-[13px] tw:text-muted tw:bg-sunken tw:border-0 tw:border-b tw:border-edge tw:whitespace-nowrap')}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length ? filas.map((f) => (
            <tr key={claveFila(f)} data-fila={claveFila(f)} {...atributosFila?.(f)}
              onClick={alTocarFila ? () => alTocarFila(f) : undefined}
              onKeyDown={alTocarFila ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alTocarFila(f); } } : undefined}
              tabIndex={alTocarFila ? 0 : undefined}
              className={cx('tw:border-b tw:border-edge tw:last:border-b-0',
                alTocarFila && 'tw:cursor-pointer tw:hover:bg-hover tw:focus-visible:outline-2 tw:focus-visible:-outline-offset-2 tw:focus-visible:outline-lav-edge')}>
              {columnas.map((c) => (
                <td key={c.clave} className={cx(celda, ALINEAR[c.alinear || 'izquierda'], 'tw:align-middle tw:border-0 tw:text-sm')}>
                  {c.render ? c.render(f) : String((f as Record<string, unknown>)[c.clave] ?? '')}
                </td>
              ))}
            </tr>
          )) : (
            <tr><td colSpan={columnas.length} className="tw:px-5 tw:py-8 tw:text-center tw:text-muted tw:border-0">{vacio}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
