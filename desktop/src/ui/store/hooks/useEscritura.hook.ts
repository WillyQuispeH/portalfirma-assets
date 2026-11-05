// Interfaz pública de Firmas presenciales para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useEscrituraStore } from '../zustand/escritura.store';
import { escrituraService } from '../services/escritura.service';

// Todo el estado: la pantalla deriva casi todo (precio, faltantes, observaciones) del trámite completo
export function useEscritura() {
  return useEscrituraStore(useShallow((s) => s));
}

// Fuera de React (el controlador, los formularios en ventana y las pruebas por window.Escrituras._s)
export const escrituraEstado = () => useEscrituraStore.getState();
// Archivos: elegir con el diálogo del sistema, leer los soltados, bajar los de un trámite enviado, guardar el Word
export const escrituraArchivos = {
  elegirMinuta: escrituraService.elegirMinuta,
  elegirPrivados: escrituraService.elegirPrivados,
  leerMinutas: escrituraService.leerMinutas,
  leerPrivados: escrituraService.leerPrivados,
  deTramite: escrituraService.archivo,
  guardarWord: escrituraService.guardarWord,
  temporal: escrituraService.temporal,
  recargar: escrituraService.recargar,
};
