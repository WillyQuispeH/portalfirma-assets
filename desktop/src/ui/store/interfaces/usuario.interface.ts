// Usuarios de la corredora (equipo). Fuente de verdad: GET /v1/usuarios y /v1/usuarios/equipo de la API de Asset,
// a través de src/equipo.js (canales usr:*). Si cambian allá, se actualizan aquí.
import type { RolAsset } from './acceso.interface';

export interface IUsuario {
  id: string;
  email: string;
  nombre: string;
  rol: RolAsset;
  activo: boolean;
  telefono: string;
  wechatiaId: string | null;
  wechatiaNombre: string | null;
  ultimoIngreso?: string | null; // solo en la lista del administrador
}

export interface IUsuarioNuevo {
  nombre: string;
  email: string;
  telefono: string;
  rol: RolAsset;
  clave: string;
}

export interface IUsuarioCambios {
  nombre?: string;
  rol?: RolAsset;
  activo?: boolean;
  telefono?: string;
  wechatiaId?: string | null;
  wechatiaNombre?: string | null;
}

export interface IUsuarioWechatia { id: string; nombre: string; email: string; telefono: string }
export interface IWechatiaUsuarios { usuarios: IUsuarioWechatia[]; error?: string; vinculados?: number }

// Conversaciones y acciones del Agente de un usuario (el administrador las lee: /v1/agente, src/conversaciones.js)
export interface IConversacionResumen { id: string; titulo: string; fijada: boolean; resumen: string; actualizado: string; n: number }
export interface IConversacion extends IConversacionResumen { items: { k?: string; text?: string }[] }
export interface IAccionAgente { t: string; canal: 'app' | 'whatsapp'; tool: string; action: string | null; ok: boolean; resumen: string }
