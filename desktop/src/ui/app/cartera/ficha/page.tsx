// Cartera › ficha de la propiedad. La página solo invoca su componente functional.
import FichaPropiedad from '../../../components/functional/ficha/FichaPropiedad';

export default function FichaPropiedadPage({ id, vez }: { id: string; vez?: number }) {
  return <FichaPropiedad id={id} vez={vez} />;
}
