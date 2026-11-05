// Llamadas al proceso principal del Asistente legal (ai:*). Sin manejo de errores: eso lo hace el store.
import { apiCruda } from '../../utils/api';
import type { IAsistenteEstado, IBilletera } from '../interfaces/asistente.interface';

export const asistenteService = {
  estado: () => apiCruda<IAsistenteEstado>('aiStatus'),
  billetera: () => apiCruda<IBilletera>('aiWallet'),
  configurar: (c: Record<string, unknown>) => apiCruda<IAsistenteEstado>('aiConfig', c),
  canjear: (codigo: string) => apiCruda<IBilletera>('aiRedeem', codigo),
};
