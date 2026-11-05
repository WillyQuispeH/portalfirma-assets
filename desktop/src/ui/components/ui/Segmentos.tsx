// Grupo de botones para elegir una opción (usa .im-seg de styles.css).
interface ISegmentosProps<T extends string> {
  opciones: [T, string][];
  valor: T;
  alCambiar: (v: T) => void;
  etiqueta: string;
  id?: string;
  dato?: string; // nombre de un atributo data-* con el valor de cada botón (p. ej. 'op' → data-op="venta")
}

export default function Segmentos<T extends string>({ opciones, valor, alCambiar, etiqueta, id, dato }: ISegmentosProps<T>) {
  return (
    <div className="im-seg" id={id} role="group" aria-label={etiqueta}>
      {opciones.map(([k, t]) => (
        <button key={k} {...(dato ? { [`data-${dato}`]: k } : {})} className={valor === k ? 'on' : ''} onClick={() => alCambiar(k)}>{t}</button>
      ))}
    </div>
  );
}
