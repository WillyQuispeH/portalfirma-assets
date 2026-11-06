// Llamadas al proceso principal para la pantalla Integraciones. Devuelven la respuesta tal cual ({ ok, data, error }):
// el store decide qué mostrar si una falla (las demás integraciones se siguen viendo).
import { apiCruda } from '../../utils/api';
import type { IDriveEstado } from '../interfaces/drive.interface';
import type { IWaEstado } from '../interfaces/whatsapp.interface';
import type { ICanales, IIaEstado, IMlEstado } from '../interfaces/integraciones.interface';

export const integracionesService = {
  wechatia: () => apiCruda<IWaEstado>('waEstado'),
  conectarWechatia: (token: string, locationId: string) => apiCruda<IWaEstado>('pvClaveWa', { token, locationId }),
  canales: () => apiCruda<ICanales>('waCanales'),
  ml: () => apiCruda<IMlEstado>('mlEstado'),
  mlConectar: () => apiCruda('mlConectar'),
  mlDesconectar: () => apiCruda('mlDesconectar'),
  drive: () => apiCruda<IDriveEstado>('driveStatus'),
  driveConectar: () => apiCruda<{ email?: string }>('driveConnect'),
  driveDesconectar: () => apiCruda('driveDisconnect'),
  maps: () => apiCruda<{ google: boolean }>('dirEstado'),
  ia: () => apiCruda<IIaEstado>('aiStatus'),
};
