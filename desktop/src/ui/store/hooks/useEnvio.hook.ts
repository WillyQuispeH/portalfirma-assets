// Interfaz pública de «Enviar a firmar» para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useEnvioStore } from '../zustand/envio.store';
import { envioService } from '../services/envio.service';

export function useEnvio() {
  return useEnvioStore(useShallow((s) => ({
    archivo: s.archivo, analisis: s.analisis, ocupado: s.ocupado, pasoAnalisis: s.pasoAnalisis,
    firmantes: s.firmantes, requeridos: s.requeridos, tipoFirma: s.tipoFirma, protocolizacion: s.protocolizacion,
    posiciones: s.posiciones, paginaExtra: s.paginaExtra, error: s.error,
    ultimaOp: s.ultimaOp, mensaje: s.mensaje, detalle: s.detalle, errorDetalle: s.errorDetalle, crudo: s.crudo,
    envioCampo: s.envioCampo, envioSalirCampo: s.envioSalirCampo, envioAgregar: s.envioAgregar, envioQuitar: s.envioQuitar,
    envioReordenar: s.envioReordenar, envioTocarTodos: s.envioTocarTodos, envioDatos: s.envioDatos, envioCancelar: s.envioCancelar,
    envioDetalle: s.envioDetalle,
  })));
}

// Fuera de React (el controlador y los formularios en ventana)
export const envioEstado = () => useEnvioStore.getState();
// Acciones sobre una operación ya enviada (enlaces, documento, reenviar)
export const envioOperacion = {
  detalle: envioService.detalle,
  reenviar: envioService.reenviar,
  leerPdf: envioService.leerPdf,
  vistaPrevia: envioService.vistaPrevia,
  archivo: envioService.archivoOperacion,
  revisarArchivo: envioService.revisarArchivo,
  elegirArchivo: envioService.elegirArchivo,
  enviar: envioService.enviar,
};
