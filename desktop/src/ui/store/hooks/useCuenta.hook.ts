// Interfaz pública de la cuenta de Portalfirma para los componentes (no importan el store directo).
import { useShallow } from 'zustand/react/shallow';
import { useCuentaStore } from '../zustand/cuenta.store';

export function useCuenta() {
  return useCuentaStore(useShallow((s) => ({
    usuario: s.usuario, sesion: s.sesion, saldo: s.saldo, tokens: s.tokens, drive: s.drive, menu: s.menu,
    motivo: s.motivo, aviso: s.aviso, entrando: s.entrando,
    // con la cuenta de Portalfirma (conexión directa o conector)
    conectado: !!(s.usuario || s.sesion),
    cuentaMenu: s.cuentaMenu, cuentaDrive: s.cuentaDrive, cuentaAviso: s.cuentaAviso,
    cuentaEntrarConNavegador: s.cuentaEntrarConNavegador, cuentaEntrarConCorreo: s.cuentaEntrarConCorreo,
    cuentaSalirApi: s.cuentaSalirApi, cuentaSalir: s.cuentaSalir, cuentaDiagnostico: s.cuentaDiagnostico,
  })));
}

// Fuera de React (el controlador de la cuenta)
export const cuentaEstado = () => useCuentaStore.getState();
export const alCambiarCuenta = useCuentaStore.subscribe;
