// «Conecta tu cuenta de Portalfirma» (#view-login): la pantalla que aparece cuando una función necesita la cuenta.
// La abre requireLogin() de app.js, que también fija el motivo (#loginWhy). Al iniciar sesión, toLoggedIn() de
// app.js guarda la sesión y sigue con lo que se había pedido. Los id los usan las pruebas.
import { useCuenta } from '../../../store/hooks/useCuenta.hook';
import { cancelarInicioSesion, irAlEditor, sesionIniciada } from '../../../utils/app';
import { abrirConexionDirecta } from './controlador';

export default function InicioSesion() {
  const { motivo, aviso, entrando, cuentaEntrarConNavegador, cuentaAviso } = useCuenta();
  const entrar = async () => {
    const r = await cuentaEntrarConNavegador();
    if (r.error) cuentaAviso('No se pudo iniciar sesión: ' + r.error);
    else sesionIniciada(r.sesion ?? null);
  };
  return (
    <div className="card narrow">
      <img src="assets/logo.png" alt="Portalfirma" className="login-logo" />
      <h1>Conecta tu cuenta de Portalfirma</h1>
      <p className="muted" id="loginWhy">{motivo}</p>
      <button className="primary wide" id="loginBtn" disabled={entrando} onClick={entrar}>{entrando ? 'Esperando inicio de sesión en el navegador…' : 'Iniciar sesión con Portalfirma'}</button>
      <p className="muted small" id="loginHint">{aviso}</p>
      <button className="ghost small" id="loginApi" onClick={() => abrirConexionDirecta()}>Probar inicio con correo y contraseña</button>
      <button className="ghost small" id="loginBack" onClick={() => { cancelarInicioSesion(); irAlEditor(); }}>Volver al editor</button>
    </div>
  );
}
