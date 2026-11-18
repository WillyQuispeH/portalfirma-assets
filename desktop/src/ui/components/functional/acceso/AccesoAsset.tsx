// Pantalla de ingreso a PortalFirma Asset (login propio, contra la API de Asset). Cubre toda la ventana hasta que
// hay sesión: al abrir la app (si no hay sesión guardada), al cerrar sesión y si la sesión vence.
// Mientras revisa la sesión guardada muestra solo el logo. Los id (#acEmail, #acClave, #acEntrar, #acError) los usan las pruebas.
import { useState, type FormEvent } from 'react';
import { useAcceso } from '../../../store/hooks/useAcceso.hook';

const CAMPO = 'tw:w-full tw:mt-1.5 tw:px-3 tw:py-2.5 tw:rounded-control tw:border tw:border-line tw:bg-bg tw:text-text tw:text-[15px] tw:outline-none tw:focus:border-brand';

export default function AccesoAsset() {
  const { estado, usuario, error, enviando, accesoIngresar, accesoRestaurar, cambiandoClave } = useAcceso();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  if (estado === 'dentro') return usuario?.debeCambiarClave || cambiandoClave ? <CambiarClave obligatoria={!!usuario?.debeCambiarClave} /> : null;

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
        <form onSubmit={entrar} className="tw:w-full tw:max-w-[400px] tw:bg-card tw:border tw:border-line tw:rounded-card tw:p-8 tw:shadow-[0_10px_40px_rgba(0,0,0,.08)]">
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

/**
 * «Crea tu clave»: obligatoria al primer ingreso (la clave inicial la puso el administrador, p. ej. el RUT) y a pedido
 * desde el menú de usuario. Ids para pruebas: #ccActual, #ccNueva, #ccRepetir, #ccGuardar, #ccError.
 */
function CambiarClave({ obligatoria }: { obligatoria: boolean }) {
  const { usuario, error, enviando, accesoCambiarClave, accesoPedirClave, accesoSalir } = useAcceso();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const aviso = nueva && nueva.length < 8 ? 'Usa al menos 8 caracteres.'
    : repetir && nueva !== repetir ? 'Las dos claves nuevas no son iguales.'
      : nueva && actual && nueva === actual ? 'La clave nueva tiene que ser distinta de la actual.' : '';
  const listo = actual && nueva.length >= 8 && nueva === repetir && nueva !== actual;
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!listo) return;
    if (await accesoCambiarClave(actual, nueva)) { setActual(''); setNueva(''); setRepetir(''); }
  };
  return (
    <div id="assetClave" className="tw:fixed tw:inset-0 tw:z-[2000] tw:grid tw:place-items-center tw:bg-bg tw:p-4">
      <form onSubmit={guardar} className="tw:w-full tw:max-w-[400px] tw:bg-card tw:border tw:border-line tw:rounded-card tw:p-8 tw:shadow-[0_10px_40px_rgba(0,0,0,.08)]">
        <img src="assets/logo.png" alt="PortalFirma Asset" className="login-logo" />
        <h1 className="tw:text-center tw:text-[22px] tw:font-bold tw:mt-2 tw:mb-1">{obligatoria ? 'Crea tu clave' : 'Cambia tu clave'}</h1>
        <p className="tw:text-center tw:text-muted tw:text-sm tw:mb-5">
          {obligatoria ? `Hola${usuario?.nombre ? ' ' + usuario.nombre.split(' ')[0] : ''}: tu clave actual es la que te dio el administrador. Antes de seguir, crea una que solo tú sepas.`
            : 'Escribe tu clave actual y la nueva. Las sesiones abiertas en otros equipos se cierran.'}
        </p>
        <label className="tw:block tw:text-sm tw:font-semibold tw:mb-3">{obligatoria ? 'Clave que te dieron' : 'Clave actual'}
          <input id="ccActual" type="password" autoComplete="current-password" autoFocus required className={CAMPO} value={actual} onChange={(e) => setActual(e.target.value)} />
        </label>
        <label className="tw:block tw:text-sm tw:font-semibold tw:mb-3">Clave nueva
          <input id="ccNueva" type="password" autoComplete="new-password" required className={CAMPO} value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </label>
        <label className="tw:block tw:text-sm tw:font-semibold tw:mb-4">Repite la clave nueva
          <input id="ccRepetir" type="password" autoComplete="new-password" required className={CAMPO} value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </label>
        {(error || aviso) && <p id="ccError" role="alert" className="tw:text-err tw:text-sm tw:mb-3 tw:text-center">{error || aviso}</p>}
        <button id="ccGuardar" type="submit" className="primary wide" disabled={enviando || !listo}>{enviando ? 'Guardando…' : 'Guardar clave'}</button>
        {obligatoria
          ? <button type="button" className="ghost small tw:w-full tw:mt-2" onClick={() => accesoSalir()}>Cerrar sesión</button>
          : <button type="button" className="ghost small tw:w-full tw:mt-2" onClick={() => accesoPedirClave(false)}>Cancelar</button>}
      </form>
    </div>
  );
}
