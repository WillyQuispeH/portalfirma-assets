// La cuenta de Portalfirma en la interfaz. Se instala al cargar el bundle (index.tsx), antes que app.js:
//  · window.Usuario (refresh, close, _u): el menú del usuario. setAccount() de app.js llama a refresh();
//    app.js, escrituras y las pruebas leen (y las pruebas fijan) Usuario._u.user.
//  · window.ApiDiag (open, login): conexión directa con correo y contraseña, y el diagnóstico de la API.
//  · window.__cuenta: lo que app.js le pide a la pantalla «Conecta tu cuenta de Portalfirma» (motivo, aviso).
//  · Monta la cuenta arriba a la derecha (#account) con su propia raíz, como el chat del Agente.
// La sesión del conector (state.session), requireLogin(), members(), setAccount() y api() siguen en app.js:
// los usan muchos módulos.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import MenuUsuario from './MenuUsuario';
import { ConexionDirecta, IniciarConCorreo } from './Ventanas';
import { alCambiarCuenta, cuentaEstado } from '../../../store/hooks/useCuenta.hook';
import { asistenteEstado } from '../../../store/hooks/useAsistente.hook';
import { abrirModal, cerrarModal } from '../../../utils/modal';
import { sesionPortalfirma, toast } from '../../../utils/app';
import type { IUsuarioPf } from '../../../store/interfaces/cuenta.interface';

// Vuelve a leer el usuario, el saldo y los tokens (sin bloquear: el saldo y los tokens llegan después)
export async function refrescarCuenta() {
  const C = cuentaEstado();
  const listo = C.cuentaRefrescar(sesionPortalfirma());
  asistenteEstado().asistenteBilletera(true)
    .then((w) => cuentaEstado().cuentaFijarTokens(typeof w?.balance === 'number' ? w.balance : null)).catch(() => {});
  await listo;
}

// Conexión directa: si no hay sesión, pide correo y contraseña; si la hay, muestra la cuenta y el diagnóstico
export async function abrirConexionDirecta() {
  const r = await cuentaEstado().cuentaRefrescar(sesionPortalfirma()).then(() => cuentaEstado().usuario);
  if (!r) return iniciarConCorreo();
  abrirModal(<ConexionDirecta usuario={r} alSalir={async () => { await cuentaEstado().cuentaSalirApi(); cerrarModal(); toast('Sesión cerrada'); refrescarCuenta(); }} />);
}

// Inicio de sesión con correo y contraseña; al terminar sigue con `despues` (si no, muestra la conexión)
export function iniciarConCorreo(despues?: () => void, motivo?: string) {
  abrirModal(<IniciarConCorreo motivo={motivo} alEntrar={() => {
    refrescarCuenta();
    if (despues) { cerrarModal(); despues(); } else abrirConexionDirecta();
  }} />);
}

export function instalarCuenta() {
  // Usuario._u: el usuario, el saldo, los tokens y Drive, leídos (y el usuario también fijado) en el store
  const U = {
    get user() { return cuentaEstado().usuario; },
    set user(u: IUsuarioPf | null) { cuentaEstado().cuentaFijarUsuario(u); },
    get amount() { return cuentaEstado().saldo; },
    get tokens() { return cuentaEstado().tokens; },
    get drive() { return cuentaEstado().drive; },
  };
  window.Usuario = { refresh: refrescarCuenta, close: () => cuentaEstado().cuentaMenu(false), _u: U };
  window.ApiDiag = { open: abrirConexionDirecta, login: iniciarConCorreo };
  window.__cuenta = {
    motivo: (t?: string) => cuentaEstado().cuentaMotivo(t),
    aviso: (t?: string) => cuentaEstado().cuentaAviso(t),
  };
  // con la cuenta de Portalfirma (conexión directa o conector) no se muestran candados
  // (setAccount() de app.js solo mira la sesión del conector; esto lo corrige al terminar cada refresco)
  alCambiarCuenta((s) => { document.body.classList.toggle('guest', !(s.usuario || s.sesion)); });
  const montar = () => {
    const el = document.getElementById('account'); if (!el) return;
    createRoot(el).render(<StrictMode><MenuUsuario /></StrictMode>);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
}
