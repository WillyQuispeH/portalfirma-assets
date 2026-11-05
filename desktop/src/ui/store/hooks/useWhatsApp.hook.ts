// Interfaz pública del Agente por WhatsApp para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useWhatsAppStore } from '../zustand/whatsapp.store';

export function useWhatsApp() {
  return useWhatsAppStore(useShallow((s) => ({
    estado: s.estado,
    waCargar: s.waCargar, waConectar: s.waConectar, waVincular: s.waVincular, waDesvincular: s.waDesvincular,
    waConfigurar: s.waConfigurar, waRevisarVinculo: s.waRevisarVinculo,
  })));
}

// Fuera de React (el controlador)
export const whatsappEstado = () => useWhatsAppStore.getState();
