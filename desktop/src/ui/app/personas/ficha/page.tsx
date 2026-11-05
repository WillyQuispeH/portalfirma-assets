// Personas › detalle de la persona. La página solo invoca su componente functional.
import FichaPersona from '../../../components/functional/persona/FichaPersona';

export default function FichaPersonaPage({ id, vez }: { id: string; vez?: number }) {
  return <FichaPersona id={id} vez={vez} />;
}
