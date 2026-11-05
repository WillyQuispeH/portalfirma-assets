// Interfaz pública de la Notaría virtual para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useNotariaStore } from '../zustand/notaria.store';

export function useNotaria() {
  return useNotariaStore(useShallow((s) => ({
    cargado: s.cargado, categoria: s.categoria, consulta: s.consulta, buscando: s.buscando, errorCatalogo: s.errorCatalogo, resultados: s.resultados,
    abriendo: s.abriendo, actual: s.actual, valores: s.valores, tocado: s.tocado,
    notariaBuscar: s.notariaBuscar, notariaAbrir: s.notariaAbrir, notariaVolver: s.notariaVolver, notariaValor: s.notariaValor,
    notariaTocar: s.notariaTocar, notariaReiniciar: s.notariaReiniciar,
  })));
}
