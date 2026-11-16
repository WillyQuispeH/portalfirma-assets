// La Ayuda: el panel de ayuda y el recorrido guiado. Se abre desde el menú de la cuenta («Ayuda y guías») y desde
// los botones de ayuda de cada pantalla (window.Ayuda.open).
// La monta components/functional/ayuda/controlador.tsx en un contenedor propio dentro de body.
// Las clases help-panel, tour… siguen en src/renderer/styles.css.
import PanelAyuda from './PanelAyuda';
import Recorrido from './Recorrido';

export default function Ayuda() {
  return (
    <>
      <PanelAyuda />
      <Recorrido />
    </>
  );
}
