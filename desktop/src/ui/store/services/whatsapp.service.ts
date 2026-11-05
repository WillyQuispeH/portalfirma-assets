// Llamadas al proceso principal del Agente por WhatsApp. Sin manejo de errores: eso lo hace el store.
import { api } from '../../utils/api';
import type { IWaEstado } from '../interfaces/whatsapp.interface';

export const whatsappService = {
  estado: () => api<IWaEstado>('waEstado'),
  conectar: (token: string, locationId: string) => api('pvClaveWa', { token, locationId }),
  vincular: (nombre: string, email: string) => api('waVincular', { nombre, email }),
  desvincular: () => api('waDesvincular'),
  configurar: (o: { activo?: boolean; numeroEmpresa?: string }) => api('waConfigurar', o),
};
