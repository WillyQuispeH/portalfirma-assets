// Llamadas al proceso principal del Agente. Devuelven la respuesta tal cual ({ ok, data, error, code }):
// quien llama decide (la conversación muestra los errores dentro del chat, no como aviso).
import { apiCruda } from '../../utils/api';
import type { IAdjunto, IConversacion, IAgenteItem, IRespuestaAgente, TContexto } from '../interfaces/agente.interface';

export const agenteService = {
  enviar: (texto: string) => apiCruda<IRespuestaAgente>('agentSend', texto),
  confirmar: (id: string, o: { ok: boolean; secretos: Record<string, string> }) => apiCruda<unknown>('agentConfirm', id, o),
  adjuntar: (nombre: string, bytes: unknown) => apiCruda<IAdjunto[]>('agentAttach', nombre, bytes),
  quitarAdjunto: (nombre: string) => apiCruda<IAdjunto[]>('agentUnattach', nombre),
  elegirArchivo: () => apiCruda<IAdjunto[] | null>('agentPick'),
  conversaciones: (q: string) => apiCruda<IConversacion[]>('convListar', q),
  abrir: (id: string) => apiCruda<{ titulo?: string; items?: IAgenteItem[]; ctx?: TContexto }>('convAbrir', id),
  guardar: (id: string, o: { items: IAgenteItem[]; ctx: TContexto }) => apiCruda<{ titulo?: string }>('convGuardar', id, o),
  fijar: (id: string, fijada: boolean) => apiCruda<unknown>('convFijar', id, fijada),
  nueva: () => apiCruda<unknown>('convNueva'),
};
