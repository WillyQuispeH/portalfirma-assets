// Interfaz pública de Mis operaciones para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useOperacionStore } from '../zustand/operacion.store';
import { operacionService } from '../services/operacion.service';

export function useOperacion() {
  return useOperacionStore(useShallow((s) => ({
    items: s.items, lastSync: s.lastSync, cuenta: s.cuenta, filtro: s.filtro, q: s.q, sel: s.sel, detalle: s.detalle, errorDetalle: s.errorDetalle,
    sincronizando: s.sincronizando, operacionesGetAll: s.operacionesGetAll, operacionesSincronizar: s.operacionesSincronizar,
    operacionesCompletar: s.operacionesCompletar, operacionElegir: s.operacionElegir, operacionesSetFiltro: s.operacionesSetFiltro, operacionesSetCuenta: s.operacionesSetCuenta,
  })));
}
// acciones sobre el documento de una operación (no cambian el estado de la pantalla)
export const operacionArchivo = { estado: operacionService.estado, ver: operacionService.getArchivo, guardar: operacionService.guardarArchivo, compartir: operacionService.compartir, reenviar: operacionService.reenviar };
// lectura del estado (pruebas y depuración: window.Operaciones._ops)
export const estadoOperaciones = () => useOperacionStore.getState();
export { estadoOperacion, grupoOperacion } from '../zustand/operacion.store';
export type { TFiltroOps } from '../zustand/operacion.store';
