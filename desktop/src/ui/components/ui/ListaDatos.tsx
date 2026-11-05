// Lista de datos «etiqueta: valor» (una ficha). Los datos sin valor no se muestran.
//   <ListaDatos datos={[['Correo', p.email], ['Teléfono', p.telefono], ['Dirección', p.direccion]]} vacio="Sin datos de contacto." />
import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';

interface IListaDatosProps {
  datos: [ReactNode, ReactNode][];
  vacio?: ReactNode;
  className?: string;
}

const tieneValor = (v: ReactNode) => !(v === '' || v == null || v === false);

export default function ListaDatos({ datos, vacio, className }: IListaDatosProps) {
  const con = datos.filter(([, v]) => tieneValor(v));
  if (!con.length) return vacio ? <p className="tw:m-0 tw:text-[13px] tw:text-muted">{vacio}</p> : null;
  return (
    <dl className={cx('tw:m-0 tw:grid tw:grid-cols-[minmax(110px,max-content)_1fr] tw:gap-x-5 tw:gap-y-2.5 tw:text-sm', className)}>
      {con.map(([k, v], i) => (
        <div key={i} className="tw:contents">
          <dt className="tw:text-muted">{k}</dt>
          <dd className="tw:m-0 tw:min-w-0 tw:break-words tw:text-text">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
