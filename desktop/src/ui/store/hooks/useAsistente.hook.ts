// Interfaz pública del Asistente legal para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useAsistenteStore } from '../zustand/asistente.store';

export function useAsistente() {
  return useAsistenteStore(useShallow((s) => ({
    estado: s.estado, billetera: s.billetera,
    asistenteEstado: s.asistenteEstado, asistenteBilletera: s.asistenteBilletera, asistenteConsentir: s.asistenteConsentir, asistenteCanjear: s.asistenteCanjear,
  })));
}

// Fuera de React (el controlador y el panel del editor)
export const asistenteEstado = () => useAsistenteStore.getState();
