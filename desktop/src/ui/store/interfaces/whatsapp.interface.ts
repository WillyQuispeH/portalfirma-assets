// Agente por WhatsApp. Fuente de verdad: wa:estado en src/main.js
// (estado() de src/whatsapp-agente.js + estadoWa() de src/reservas.js).
export interface IWaEstado {
  // WhatsApp de la empresa (wechatia)
  conectado?: boolean;
  propia?: boolean; // con la clave de la integración privada
  locationId?: string;
  /** el número de WhatsApp de la corredora («+56 9 …») que guardó su administrador */
  numero?: string | null;
  // celular del usuario
  telefono?: string | null;
  codigo?: string | null; // código para vincular, mientras se espera el mensaje
  numeroEmpresa?: string;
  vinculado?: unknown;
  /** recibe por WhatsApp el recordatorio de sus visitas (apagado por defecto; lo envía el servidor) */
  recordatoriosVisita?: boolean;
  // este computador responde
  activo?: boolean;
}
