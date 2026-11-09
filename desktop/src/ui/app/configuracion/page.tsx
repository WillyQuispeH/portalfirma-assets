// Pantalla «Configuración» (desde el menú del usuario), con pestañas. La página solo invoca su componente functional.
import Configuracion, { type TPestanaConfig } from '../../components/functional/configuracion/Configuracion';

export default function ConfiguracionPage({ pestana }: { pestana?: TPestanaConfig }) {
  return <Configuracion pestana={pestana} />;
}
