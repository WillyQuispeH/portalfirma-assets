// Tabla de datos con columnas configurables, orden por columna, fila clicable y mensaje cuando está vacía.
//   <Tabla
//     columnas={[
//       { clave: 'pais', titulo: 'País', ordenar: (f) => f.pais },
//       { clave: 'clientes', titulo: 'Clientes', alinear: 'derecha', ordenar: (f) => f.clientes },
//       { clave: 'estado', titulo: 'Estado', render: (f) => <Badge tono="verde">{f.estado}</Badge> },
//     ]}
//     filas={paises} claveFila={(f) => f.id} alTocarFila={(f) => abrir(f.id)} vacio="Sin países todavía." />
// El orden vive dentro de la tabla; para recordarlo afuera se pasan `orden` y `alOrdenar`.
import { useMemo, useState, type ReactNode } from 'react';
import Icono from './Icono';
import { cx } from '../../utils/cx';

export interface IColumna<T> {
  clave: string;
  titulo: ReactNode;
  alinear?: 'izquierda' | 'centro' | 'derecha';
  ancho?: string; // p. ej. '120px' o '30%'
  render?: (fila: T) => ReactNode; // si no se da, muestra fila[clave]
  /** valor para ordenar por esta columna; sin él la columna no se ordena. Los vacíos van al final */
  ordenar?: (fila: T) => string | number | null | undefined;
  /** clases extra del encabezado y las celdas (p. ej. 'tw:max-xl:hidden' para esconderla en pantallas angostas) */
  className?: string;
}

export interface IOrdenTabla {
  clave: string;
  dir: 'asc' | 'desc';
}

interface ITablaProps<T> {
  columnas: IColumna<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
  alTocarFila?: (fila: T) => void;
  /** filas marcadas (elegidas o abiertas): fondo lavanda con franja a la izquierda */
  filaActiva?: (fila: T) => boolean;
  vacio?: ReactNode;
  compacta?: boolean;
  ordenInicial?: IOrdenTabla | null;
  orden?: IOrdenTabla | null;
  alOrdenar?: (orden: IOrdenTabla | null) => void;
  /** atributos extra de cada fila (p. ej. data-* para las pruebas o para identificarla) */
  atributosFila?: (fila: T) => Record<string, string>;
  className?: string;
}

const ALINEAR = { izquierda: 'tw:text-left', centro: 'tw:text-center', derecha: 'tw:text-right' };
const JUSTIFICAR = { izquierda: 'tw:justify-start', centro: 'tw:justify-center', derecha: 'tw:justify-end' };
const comparar = new Intl.Collator('es', { numeric: true, sensitivity: 'base' }).compare;

export default function Tabla<T>({
  columnas, filas, claveFila, alTocarFila, filaActiva, vacio = 'No hay datos.', compacta = false,
  ordenInicial = null, orden: ordenFijo, alOrdenar, atributosFila, className,
}: ITablaProps<T>) {
  const [ordenPropio, setOrdenPropio] = useState<IOrdenTabla | null>(ordenInicial);
  const orden = ordenFijo !== undefined ? ordenFijo : ordenPropio;

  // asc → desc → sin orden
  const alternar = (clave: string) => {
    const nuevo: IOrdenTabla | null = orden?.clave !== clave ? { clave, dir: 'asc' } : orden.dir === 'asc' ? { clave, dir: 'desc' } : null;
    setOrdenPropio(nuevo); alOrdenar?.(nuevo);
  };

  const ordenadas = useMemo(() => {
    const valor = orden && columnas.find((c) => c.clave === orden.clave)?.ordenar;
    if (!orden || !valor) return filas;
    const signo = orden.dir === 'asc' ? 1 : -1;
    return [...filas].sort((a, b) => {
      const x = valor(a); const y = valor(b);
      const vx = x == null || x === ''; const vy = y == null || y === '';
      if (vx || vy) return vx === vy ? 0 : vx ? 1 : -1;
      return signo * (typeof x === 'number' && typeof y === 'number' ? x - y : comparar(String(x), String(y)));
    });
  }, [filas, columnas, orden]);

  const y = compacta ? 'tw:py-2' : 'tw:py-3';
  const lados = 'tw:px-3 tw:first:pl-5 tw:last:pr-5';
  return (
    <div className={cx('tw:w-full tw:overflow-x-auto', className)}>
      <table className="ui-tabla tw:w-full tw:border-collapse tw:border-spacing-0 tw:text-sm">
        <thead>
          <tr>
            {columnas.map((c) => {
              const al = c.alinear || 'izquierda';
              const activa = orden?.clave === c.clave;
              return (
                <th key={c.clave} scope="col" style={c.ancho ? { width: c.ancho } : undefined}
                  aria-sort={activa ? (orden!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cx(lados, compacta ? 'tw:h-9' : 'tw:h-10', ALINEAR[al],
                    'tw:py-0 tw:bg-sunken tw:border-0 tw:border-b tw:border-solid tw:border-edge tw:whitespace-nowrap',
                    'tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-[0.06em] tw:text-muted', c.className)}>
                  {c.ordenar ? (
                    <button type="button" onClick={() => alternar(c.clave)} title="Ordenar"
                      className={cx('tw:group tw:inline-flex tw:w-full tw:items-center tw:gap-1 tw:m-0 tw:p-0 tw:border-0 tw:bg-transparent tw:cursor-pointer',
                        'tw:font-[inherit] tw:text-[length:inherit] tw:uppercase tw:tracking-[inherit] tw:rounded-icono',
                        'tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-lav-edge',
                        JUSTIFICAR[al], al === 'derecha' && 'tw:flex-row-reverse', activa ? 'tw:text-text' : 'tw:text-muted tw:hover:text-text')}>
                      {c.titulo}
                      <span className={cx('tw:inline-flex tw:transition-opacity tw:duration-150', activa ? 'tw:opacity-100 tw:text-lav-softink' : 'tw:opacity-0 tw:group-hover:opacity-60')}>
                        <Icono nombre={activa && orden!.dir === 'desc' ? 'chevD' : 'chevU'} tam={13} />
                      </span>
                    </button>
                  ) : c.titulo}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.length ? ordenadas.map((f) => {
            const activa = filaActiva?.(f);
            return (
              <tr key={claveFila(f)} data-fila={claveFila(f)} {...atributosFila?.(f)} aria-selected={filaActiva ? !!activa : undefined}
                onClick={alTocarFila ? () => alTocarFila(f) : undefined}
                onKeyDown={alTocarFila ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alTocarFila(f); } } : undefined}
                tabIndex={alTocarFila ? 0 : undefined}
                className={cx('tw:border-0 tw:border-b tw:border-solid tw:border-edge tw:last:border-b-0 tw:transition-colors tw:duration-100',
                  activa && 'tw:bg-lav-soft tw:[&>td:first-child]:shadow-[inset_3px_0_0_var(--ui-lav-edge)]',
                  alTocarFila && cx('tw:cursor-pointer tw:focus-visible:outline-2 tw:focus-visible:-outline-offset-2 tw:focus-visible:outline-lav-edge',
                    !activa && 'tw:hover:bg-hover tw:hover:[&>td:first-child]:shadow-[inset_3px_0_0_var(--ui-lav-edge)]'))}>
                {columnas.map((c) => (
                  <td key={c.clave} className={cx(lados, y, ALINEAR[c.alinear || 'izquierda'], c.alinear === 'derecha' && 'tw:tabular-nums',
                    'tw:align-middle tw:border-0 tw:text-sm tw:text-text', c.className)}>
                    {c.render ? c.render(f) : String((f as Record<string, unknown>)[c.clave] ?? '')}
                  </td>
                ))}
              </tr>
            );
          }) : (
            <tr><td colSpan={columnas.length} className="tw:px-5 tw:py-8 tw:text-center tw:text-muted tw:border-0">{vacio}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
