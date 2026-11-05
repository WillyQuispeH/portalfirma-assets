// Interfaz pública de la cuenta de Asset para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useAccesoStore } from '../zustand/acceso.store';

export function useAcceso() {
  return useAccesoStore(useShallow((s) => ({
    estado: s.estado, usuario: s.usuario, error: s.error, enviando: s.enviando,
    accesoIngresar: s.accesoIngresar, accesoSalir: s.accesoSalir, accesoRestaurar: s.accesoRestaurar,
  })));
}

// Fuera de React (el controlador y app.js)
export const accesoEstado = () => useAccesoStore.getState();
export const alCambiarAcceso = useAccesoStore.subscribe;
