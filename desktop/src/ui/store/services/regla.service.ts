// Llamadas al proceso principal de las reglas de detección (reglas:*). Sin manejo de errores: eso lo hace el store.
import { apiCruda } from '../../utils/api';
import type { IReglaBase, IReglaCaso, IReglaContexto, IReglaPropuesta, IReglaPrueba, IReglas } from '../interfaces/regla.interface';

export const reglaService = {
  casos: () => apiCruda<IReglaCaso[]>('reglasCasos'),
  reglas: () => apiCruda<IReglas>('reglasGet'),
  borrarCaso: (id: string) => apiCruda('reglasBorrarCaso', id),
  proponer: (ctx: IReglaContexto) => apiCruda<{ propuestas: IReglaPropuesta[]; uso?: { modelo?: string } }>('reglasProponer', ctx),
  probar: (p: IReglaBase) => apiCruda<IReglaPrueba>('reglasProbar', p),
  decidir: (d: { id: string; accion: 'aprobar' | 'descartar'; patron?: string }) => apiCruda<IReglas>('reglasDecidir', d),
  activar: (d: { id: string; activo: boolean }) => apiCruda<IReglas>('reglasActivar', d),
  eliminar: (id: string) => apiCruda<IReglas>('reglasEliminar', id),
  exportar: () => apiCruda<unknown>('reglasExportar'),
};
