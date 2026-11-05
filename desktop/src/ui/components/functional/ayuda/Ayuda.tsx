// La Ayuda, siempre presente: el botón «?» flotante (#helpFab), el panel de ayuda y el recorrido guiado.
// La monta components/functional/ayuda/controlador.tsx en un contenedor propio dentro de body.
// Las clases help-fab, help-panel, tour… siguen en src/renderer/styles.css (body.help-open oculta el botón).
import PanelAyuda from './PanelAyuda';
import Recorrido from './Recorrido';
import { abrirPanel, cerrarPanel } from './acciones';
import { useAyuda } from '../../../store/hooks/useAyuda.hook';

// El SVG va suelto dentro del botón (sin el <span> de Icono): styles.css esconde todo span de .help-fab
// hasta pasar el mouse, para mostrar solo el ícono.
function BotonAyuda() {
  const { panelAbierto } = useAyuda();
  const svg = typeof window.icon === 'function' ? window.icon('help', 20) : '';
  return (
    <button id="helpFab" className="help-fab" title="Ayuda: guías, recorrido y soporte" onClick={() => (panelAbierto ? cerrarPanel() : abrirPanel())}
      dangerouslySetInnerHTML={{ __html: `${svg}<span>Ayuda</span>` }} />
  );
}

export default function Ayuda() {
  return (
    <>
      <BotonAyuda />
      <PanelAyuda />
      <Recorrido />
    </>
  );
}
