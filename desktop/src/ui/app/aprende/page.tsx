// «Aprende a usarla» (en #view-aprende). La página solo invoca su componente functional.
// La monta components/functional/aprende/controlador.tsx al abrirla (window.Aprende.abrir / leccion).
import Aprende from '../../components/functional/aprende/Aprende';

export default function AprendePage() {
  return <Aprende />;
}
