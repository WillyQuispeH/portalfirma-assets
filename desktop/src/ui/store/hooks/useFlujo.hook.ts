// Interfaz pública de Flujos documentales para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useFlujoStore } from '../zustand/flujo.store';
import { flujoService } from '../services/flujo.service';

export function useFlujo() {
  return useFlujoStore(useShallow((s) => ({
    vista: s.vista, modelos: s.modelos, recetas: s.recetas, ejecuciones: s.ejecuciones, cola: s.cola, ops: s.ops, w: s.w,
    flujosRecargar: s.flujosRecargar, flujosVerInicio: s.flujosVerInicio, flujosSetCola: s.flujosSetCola, asistenteIniciar: s.asistenteIniciar,
    asistenteVerEjecucion: s.asistenteVerEjecucion, asistenteModelo: s.asistenteModelo, asistenteIr: s.asistenteIr, asistenteNomina: s.asistenteNomina,
    asistenteRegla: s.asistenteRegla, asistenteRevisar: s.asistenteRevisar, asistenteFijar: s.asistenteFijar, asistenteGuardar: s.asistenteGuardar,
    asistenteEjecutar: s.asistenteEjecutar, flujosSincronizarFirmas: s.flujosSincronizarFirmas, recetaBorrar: s.recetaBorrar, ejecucionBorrar: s.ejecucionBorrar,
  })));
}
export const nominaFlujo = { elegir: flujoService.elegirNomina, leer: flujoService.leerNomina, detener: flujoService.detener };
export { puedeIr, pedido } from '../zustand/flujo.store';
// lectura del estado (pruebas y depuración: window.Flujos._fl)
export const estadoFlujos = () => useFlujoStore.getState();
