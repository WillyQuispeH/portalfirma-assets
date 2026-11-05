// «Conecta tu cuenta de Portalfirma» (#view-login). La página solo invoca su componente functional.
// app.js la monta al cargar; requireLogin() la muestra con show('login').
import InicioSesion from '../../components/functional/cuenta/InicioSesion';

export default function InicioSesionPage() {
  return <InicioSesion />;
}
