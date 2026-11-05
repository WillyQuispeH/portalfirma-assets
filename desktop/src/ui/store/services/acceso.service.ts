// Llamadas al proceso principal para la cuenta de Asset (src/asset.js). Sin manejo de errores: eso lo hace el store.
import { apiCruda } from '../../utils/api';
import type { IUsuarioAsset } from '../interfaces/acceso.interface';

export const accesoService = {
  restaurar: () => apiCruda<IUsuarioAsset | null>('assetRestaurar'),
  ingresar: (email: string, clave: string) => apiCruda<IUsuarioAsset>('assetIngresar', email, clave),
  salir: () => apiCruda<boolean>('assetSalir'),
};
