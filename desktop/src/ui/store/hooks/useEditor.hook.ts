// Interfaz pública del editor PDF para los componentes (no importan el store directo).
import { flushSync } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore, nuevoDocumento } from '../zustand/editor.store';
import { editorService } from '../services/editor.service';

// El documento activo, las pestañas y el aviso de «trabajando». `v` cambia con cada edición: los componentes que
// leen el documento (mutable) lo usan para volver a dibujarse.
export function useEditor() {
  return useEditorStore(useShallow((s) => ({ doc: s.doc, pestanas: s.pestanas, v: s.v, ocupado: s.ocupado })));
}

// «Mis plantillas» (la biblioteca del inicio)
export function usePlantillas() {
  return useEditorStore(useShallow((s) => ({ plantillas: s.plantillas, editorPlantillas: s.editorPlantillas })));
}

// Fuera de React (el motor, los controladores y window.editor)
export const editorEstado = () => useEditorStore.getState();
export { nuevoDocumento };

// Aplica el cambio en pantalla de inmediato: el motor busca enseguida lo que React dibuja (#edStage, #edLayer…).
// Nunca se llama mientras React dibuja (solo desde eventos y tareas asíncronas).
export function ahora(fn: () => void) {
  try { flushSync(fn); } catch { fn(); }
}
export const tocar = () => useEditorStore.getState().editorTocar();
export const tocarAhora = () => ahora(() => useEditorStore.getState().editorTocar());

// Archivos y llamadas al proceso principal
export const editorArchivos = editorService;
