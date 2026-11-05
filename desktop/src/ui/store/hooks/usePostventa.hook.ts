// Interfaz pública de Postventa para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { usePostventaStore } from '../zustand/postventa.store';
import { postventaService } from '../services/postventa.service';

export function usePostventa() {
  return usePostventaStore(useShallow((s) => ({
    tab: s.tab,
    filtro: s.filtro,
    q: s.q,
    sel: s.sel,
    tablero: s.tablero,
    config: s.config,
    reclamos: s.reclamos,
    chats: s.chats,
    proyectos: s.proyectos,
    unidades: s.unidades,
    contratistas: s.contratistas,
    error: s.error,
    pvAbrir: s.pvAbrir,
    pvSetTab: s.pvSetTab,
    reclamosSetFiltro: s.reclamosSetFiltro,
    pvSeleccionar: s.pvSeleccionar,
    contratistasGetAll: s.contratistasGetAll,
    unidadesPlantilla: s.unidadesPlantilla,
    unidadesImportar: s.unidadesImportar,
    waGuardarClave: s.waGuardarClave,
    waQuitarClave: s.waQuitarClave,
    waSetAuto: s.waSetAuto,
    waRevisar: s.waRevisar,
    asistenteGuardar: s.asistenteGuardar,
  })));
}

// la vista previa del asistente no guarda nada: va directo al service (no es estado de la pantalla)
export const muestraAsistente = postventaService.muestra;
export const probarEstiloAsistente = postventaService.probarEstilo;
