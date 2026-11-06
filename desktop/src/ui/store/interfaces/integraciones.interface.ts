// Pantalla Integraciones: el estado de cada servicio conectado a Asset.
// Fuentes: wa:estado y wa:canales (src/main.js, src/wa-servidor.js), ml:estado (src/portales/mercadolibre.js),
// gdrive:status (src/gdrive.js), dir:estado (src/direcciones.js) y ai:status (src/ai.js).
import type { IDriveEstado } from './drive.interface';
import type { IWaEstado } from './whatsapp.interface';

/** un canal de la subcuenta de wechatia */
export interface ICanal {
  id: string; // whatsapp | instagram | facebook | correo | chat
  nombre: string;
  enUso: boolean; // hay conversaciones recientes por este canal
  ultimo: string | null; // fecha del último mensaje por este canal
  conectar: string | null; // la página del panel de wechatia donde se conecta
}

export interface ICanales {
  conectado: boolean;
  local?: boolean; // sin la cuenta de Asset (o en modo de prueba): no se puede saber qué canales se usan
  error: string | null;
  panel: string | null;
  canales: ICanal[];
}

export interface IMlEstado {
  configurada: boolean; // la app trae su registro en Mercado Libre
  conectada: boolean;
  cuenta: { id: string; nickname: string; email: string } | null;
}

export interface IIaEstado {
  managed: boolean; // asistente incluido (la clave la pone Portalfirma)
  hasKey: boolean;
  propia: boolean; // clave propia que reemplaza a la incluida
  provider: string;
}

export interface IIntegraciones {
  wechatia: IWaEstado | null;
  canales: ICanales | null;
  ml: IMlEstado | null;
  drive: IDriveEstado | null;
  maps: { google: boolean } | null;
  ia: IIaEstado | null;
}
