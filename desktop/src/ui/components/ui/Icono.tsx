// Ícono de src/renderer/icons.js (window.icon devuelve el SVG como texto).
// El SVG es fijo y propio de la app, por eso se puede insertar como HTML.
interface IIconoProps {
  nombre: string;
  tam?: number;
}

export default function Icono({ nombre, tam = 16 }: IIconoProps) {
  const svg = typeof window.icon === 'function' ? window.icon(nombre, tam) : '';
  return <span className="tw:inline-flex tw:align-middle" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}
