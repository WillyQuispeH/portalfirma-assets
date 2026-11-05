// Ícono de src/renderer/icons.js sin caja propia (display: contents): el SVG queda como hijo directo del botón,
// igual que en el editor antiguo, así los estilos de styles.css (.tool svg.i, .dtab svg.i…) siguen valiendo.
export default function Ic({ n, t = 16 }: { n: string; t?: number }) {
  const svg = typeof window.icon === 'function' ? window.icon(n, t) : '';
  return <span className="tw:contents" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}
