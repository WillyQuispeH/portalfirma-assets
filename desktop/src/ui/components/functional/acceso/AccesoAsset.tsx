// Pantalla de ingreso a PortalFirma Asset (login propio, contra la API de Asset). Cubre toda la ventana hasta que
// hay sesión: al abrir la app (si no hay sesión guardada), al cerrar sesión y si la sesión vence.
// Mientras revisa la sesión guardada muestra solo el logo. Los id (#acEmail, #acClave, #acEntrar, #acError) los usan las pruebas.
import { useState, type FormEvent } from 'react';
import { useAcceso } from '../../../store/hooks/useAcceso.hook';

const CAMPO = 'tw:w-full tw:mt-1.5 tw:px-3 tw:py-2.5 tw:rounded-[10px] tw:border tw:border-line tw:bg-bg tw:text-text tw:text-[15px] tw:outline-none tw:focus:border-brand';

export default function AccesoAsset() {
  const { estado, error, enviando, accesoIngresar, accesoRestaurar } = useAcceso();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  if (estado === 'dentro') return null;

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !clave) return;
    if (await accesoIngresar(email, clave)) setClave('');
  };
  const sinConexion = /conectar con el servidor|dirección del servidor/i.test(error);

  return (
    <div id="assetAcceso" className="tw:fixed tw:inset-0 tw:z-[2000] tw:grid tw:place-items-center tw:bg-bg tw:p-4">
      {estado === 'cargando' ? (
        <img src="assets/logo.png" alt="PortalFirma Asset" className="login-logo tw:opacity-80" />
      ) : (
        <form onSubmit={entrar} className="tw:w-full tw:max-w-[400px] tw:bg-card tw:border tw:border-line tw:rounded-2xl tw:p-8 tw:shadow-[0_10px_40px_rgba(0,0,0,.08)]">
          <img src="assets/logo.png" alt="PortalFirma Asset" className="login-logo" />
          <h1 className="tw:text-center tw:text-[22px] tw:font-bold tw:mt-2 tw:mb-1">Ingresa a PortalFirma Asset</h1>
          <p className="tw:text-center tw:text-muted tw:text-sm tw:mb-5">Con el email y la clave que te dio el administrador de tu corredora.</p>
          <label className="tw:block tw:text-sm tw:font-semibold tw:mb-3">Email
            <input id="acEmail" type="email" autoComplete="username" autoFocus required className={CAMPO} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="tw:block tw:text-sm tw:font-semibold tw:mb-4">Clave
            <input id="acClave" type="password" autoComplete="current-password" required className={CAMPO} value={clave} onChange={(e) => setClave(e.target.value)} />
          </label>
          {error && <p id="acError" role="alert" className="tw:text-err tw:text-sm tw:mb-3 tw:text-center">{error}</p>}
          <button id="acEntrar" type="submit" className="primary wide" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
          {sinConexion && <button type="button" id="acReintentar" className="ghost small tw:w-full tw:mt-2" onClick={() => accesoRestaurar()}>Reintentar</button>}
          <p className="tw:text-center tw:text-muted tw:text-xs tw:mt-5">¿Olvidaste tu clave? Pídele al administrador de tu corredora que te asigne una nueva.</p>
        </form>
      )}
    </div>
  );
}
