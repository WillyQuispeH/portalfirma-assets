// Pestaña «Cartera». La página solo invoca su componente functional.
import Cartera from '../../components/functional/cartera/Cartera';
import type { IFiltrosCartera } from '../../store/hooks/useCartera.hook';

export default function CarteraPage({ filtros }: { filtros?: Partial<IFiltrosCartera> }) {
  return <Cartera filtros={filtros} />;
}
