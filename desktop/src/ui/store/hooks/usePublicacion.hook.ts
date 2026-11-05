// Interfaz pública de Publicaciones para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { usePublicacionStore } from '../zustand/publicacion.store';

export function usePublicacion() {
  return usePublicacionStore(useShallow((s) => ({
    tab: s.tab,
    filtro: s.filtro,
    q: s.q,
    panel: s.panel,
    nuevos: s.nuevos,
    interesados: s.interesados,
    portales: s.portales,
    error: s.error,
    sincronizando: s.sincronizando,
    publicacionAbrir: s.publicacionAbrir,
    publicacionSetTab: s.publicacionSetTab,
    interesadosSetFiltro: s.interesadosSetFiltro,
    interesadoSetEstado: s.interesadoSetEstado,
    interesadoResponder: s.interesadoResponder,
    portalGuardar: s.portalGuardar,
    portalExportarFeed: s.portalExportarFeed,
    publicacionSincronizar: s.publicacionSincronizar,
  })));
}
