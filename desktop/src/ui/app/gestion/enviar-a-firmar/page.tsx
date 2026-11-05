// Gestión documental › Enviar a firmar. La página solo invoca su componente functional.
// Se monta una vez por pantalla (soltar, analizando, revisar, enviado), cada una en su sección de index.html.
import EnviarAFirmar, { type TPasoEnvio } from '../../../components/functional/gestion/enviar-a-firmar/EnviarAFirmar';

export default function GestionEnviarAFirmarPage({ paso }: { paso: TPasoEnvio }) {
  return <EnviarAFirmar paso={paso} />;
}
