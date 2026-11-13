// Llamadas al proceso principal para los usuarios de la corredora (src/equipo.js). Sin manejo de errores: eso lo hace el store.
import { api } from '../../utils/api';
import type { IAccionAgente, IConversacion, IConversacionResumen, IUsuario, IUsuarioCambios, IUsuarioNuevo } from '../interfaces/usuario.interface';

export const usuarioService = {
  equipo: () => api<IUsuario[]>('usrEquipo'),
  listar: () => api<IUsuario[]>('usrListar'),
  crear: (o: IUsuarioNuevo) => api<IUsuario>('usrCrear', o),
  editar: (id: string, o: IUsuarioCambios) => api<IUsuario>('usrEditar', id, o),
  clave: (id: string, clave: string) => api<boolean>('usrClave', id, clave),
  // el Agente de otro usuario (solo el administrador; solo lectura)
  conversaciones: (usuarioId: string) => api<IConversacionResumen[]>('convDeUsuario', usuarioId),
  conversacion: (usuarioId: string, id: string) => api<IConversacion>('convAbrirDe', usuarioId, id),
  registroAgente: (usuarioId: string) => api<IAccionAgente[]>('agentLogDe', usuarioId),
};
