// Negocios › detalle de un negocio. La página solo invoca su componente functional.
import FichaNegocio, { type IFichaNegocioProps } from '../../../components/functional/negocios/FichaNegocio';

export default function FichaNegocioPage(props: IFichaNegocioProps) {
  return <FichaNegocio {...props} />;
}
