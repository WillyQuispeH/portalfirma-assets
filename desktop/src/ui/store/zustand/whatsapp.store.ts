// Agente por WhatsApp: conectar el WhatsApp de la empresa (wechatia), vincular el celular del usuario con un
// código y decidir si este computador responde.
import { create } from 'zustand';
import { whatsappService } from '../services/whatsapp.service';
import type { IWaEstado } from '../interfaces/whatsapp.interface';

interface IWhatsAppState {
  estado: IWaEstado | null;
  waCargar: () => Promise<IWaEstado>;
  // cada acción devuelve null si resultó; si no, el error
  waConectar: (token: string, locationId: string) => Promise<string | null>;
  waVincular: (nombre: string, email: string) => Promise<string | null>;
  waDesvincular: () => Promise<string | null>;
  waConfigurar: (o: { activo?: boolean; numeroEmpresa?: string }) => Promise<string | null>;
  waRevisarVinculo: () => Promise<boolean>; // true si el celular quedó vinculado desde la última revisión
}

export const useWhatsAppStore = create<IWhatsAppState>((set, get) => {
  const accion = async (fn: () => Promise<unknown>) => {
    try { await fn(); await get().waCargar(); return null; } catch (e) { return (e as Error).message; }
  };
  return {
    estado: null,
    waCargar: async () => {
      const estado = await whatsappService.estado().catch(() => ({} as IWaEstado));
      set({ estado }); return estado;
    },
    waConectar: (token, locationId) => accion(() => whatsappService.conectar(token, locationId)),
    waVincular: (nombre, email) => accion(() => whatsappService.vincular(nombre, email)),
    waDesvincular: () => accion(() => whatsappService.desvincular()),
    waConfigurar: (o) => accion(() => whatsappService.configurar(o)),
    waRevisarVinculo: async () => {
      const x = await whatsappService.estado().catch(() => null);
      if (!x || x.codigo || !x.telefono) return false;
      set({ estado: x }); return true;
    },
  };
});
