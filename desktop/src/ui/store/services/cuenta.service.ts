// Llamadas al proceso principal de la cuenta de Portalfirma. Sin manejo de errores: eso lo hace el store.
import { api, apiCruda } from '../../utils/api';
import type { IDiagnostico, IDriveCuenta, ISesionPf, IUsuarioPf } from '../interfaces/cuenta.interface';

export const cuentaService = {
  // conexión directa (correo y contraseña)
  usuario: () => apiCruda<IUsuarioPf>('apiUser'),
  billetera: () => apiCruda<{ amount: number | null }>('apiWallet'),
  entrarConCorreo: (email: string, clave: string) => apiCruda<IUsuarioPf>('apiLogin', email, clave),
  salirApi: () => apiCruda('apiLogout'),
  diagnostico: () => apiCruda<IDiagnostico>('apiDiag'),
  // conector de Portalfirma (se abre el navegador)
  entrarConNavegador: () => api<ISesionPf>('login'),
  salir: () => apiCruda('logout'),
  drive: () => apiCruda<IDriveCuenta>('driveStatus'),
};
