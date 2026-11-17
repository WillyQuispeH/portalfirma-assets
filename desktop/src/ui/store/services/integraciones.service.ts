// Llamadas al proceso principal para la pantalla Integraciones. Devuelven la respuesta tal cual ({ ok, data, error }):
// el store decide qué mostrar si una falla (las demás integraciones se siguen viendo).
import { apiCruda } from '../../utils/api';
import type { IDriveEstado } from '../interfaces/drive.interface';
import type { IWaEstado } from '../interfaces/whatsapp.interface';
import type { ICanales, IIaEstado, IMlEstado } from '../interfaces/integraciones.interface';

/** las conexiones con Google: la cuenta del usuario (calendario y Drive) y el Drive de la empresa */
export interface IGoogleConexion { conectada: boolean; estado: string | null; cuenta: string | null; conectadoEn: string | null; error: string | null }
export interface IGoogleEstado { disponible: boolean; admin: boolean; usuario: IGoogleConexion; empresa: IGoogleConexion }

export const integracionesService = {
  wechatia: () => apiCruda<IWaEstado>('waEstado'),
  conectarWechatia: (token: string, locationId: string) => apiCruda<IWaEstado>('pvClaveWa', { token, locationId }),
  canales: () => apiCruda<ICanales>('waCanales'),
  ml: () => apiCruda<IMlEstado>('mlEstado'),
  mlConectar: () => apiCruda('mlConectar'),
  mlDesconectar: () => apiCruda('mlDesconectar'),
  google: () => apiCruda<IGoogleEstado>('googleEstado'),
  googleConectar: (proveedor: 'google' | 'google_corredora') => apiCruda<IGoogleEstado>('googleConectar', proveedor),
  googleDesconectar: (proveedor: 'google' | 'google_corredora') => apiCruda<IGoogleEstado>('googleDesconectar', proveedor),
  drive: () => apiCruda<IDriveEstado>('driveStatus'),
  driveConectar: () => apiCruda<{ email?: string }>('driveConnect'),
  driveDesconectar: () => apiCruda('driveDisconnect'),
  maps: () => apiCruda<{ google: boolean }>('dirEstado'),
  ia: () => apiCruda<IIaEstado>('aiStatus'),
};
