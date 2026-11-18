// Pantalla de ingreso a PortalFirma Asset (login propio, contra la API de Asset). Cubre toda la ventana hasta que
// hay sesión: al abrir la app (si no hay sesión guardada), al cerrar sesión y si la sesión vence.
// Diseño partido: marca a la izquierda, formulario a la derecha (en angosto, solo el formulario con logo).
// Mientras revisa la sesión guardada muestra el marco con el logo. Ids: #acEmail, #acClave, #acEntrar, #acError,
// #ccActual, #ccNueva, #ccRepetir, #ccGuardar, #ccError.
import { useState, type FormEvent, type ReactNode } from 'react';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import { useAcceso } from '../../../store/hooks/useAcceso.hook';

/** marco partido: panel de marca + columna del formulario */
function Marco({
  tituloMarca, textoMarca, children, cargando,
}: {
  tituloMarca: string; textoMarca: string; children?: ReactNode; cargando?: boolean;
}) {
  return (
    <div id="assetAccesoShell" className="tw:fixed tw:inset-0 tw:z-[2000] tw:flex tw:bg-bg">
      {/* panel de marca: solo en pantallas anchas */}
      <aside
        aria-hidden={cargando || undefined}
        className="tw:relative tw:hidden tw:w-[min(44%,480px)] tw:shrink-0 tw:overflow-hidden tw:border-0 tw:border-r tw:border-solid tw:border-edge tw:p-10 tw:lg:flex tw:lg:flex-col tw:lg:justify-between"
        style={{
          // tono claro: el logo (azul/violeta) contrasta sin caja
          background:
            'radial-gradient(900px 520px at -10% 110%, color-mix(in srgb, var(--brand) 14%, transparent), transparent 60%),'
            + ' radial-gradient(700px 420px at 110% -5%, color-mix(in srgb, #9b30e6 8%, transparent), transparent 55%),'
            + ' linear-gradient(165deg, #f5f7fc 0%, #e9eef8 48%, #e2e8f4 100%)',
        }}
      >
        <div aria-hidden className="tw:pointer-events-none tw:absolute tw:-right-16 tw:top-24 tw:size-[280px] tw:rounded-full tw:border tw:border-solid tw:border-edge" />
        <div aria-hidden className="tw:pointer-events-none tw:absolute tw:-right-8 tw:top-32 tw:size-[200px] tw:rounded-full tw:border tw:border-solid tw:border-edge" />
        <div aria-hidden className="tw:pointer-events-none tw:absolute tw:-bottom-20 tw:-left-16 tw:size-[260px] tw:rounded-full tw:blur-2xl"
          style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)' }} />

        <div className="tw:relative tw:z-[1]">
          <img src="assets/logo.png" alt="" className="tw:block tw:h-auto tw:w-[200px] tw:max-w-full" />
        </div>
        <div className="tw:relative tw:z-[1] tw:flex tw:max-w-[340px] tw:flex-col tw:gap-3">
          <p className="tw:m-0 tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-[0.14em] tw:text-muted">PortalFirma Asset</p>
          <h2
            className="tw:m-0 tw:text-[28px] tw:font-bold tw:leading-tight tw:tracking-tight"
            style={{
              // mismo degradado del logo / botón Ingresar (fijo: el panel es claro)
              backgroundImage: 'linear-gradient(90deg, #14259a 0%, #2a3fd6 55%, #9b30e6 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {tituloMarca}
          </h2>
          <p className="tw:m-0 tw:text-[15px] tw:leading-relaxed tw:text-[color:var(--navy)] tw:opacity-80">{textoMarca}</p>
        </div>
        <p className="tw:relative tw:z-[1] tw:m-0 tw:text-xs tw:leading-relaxed tw:text-muted">Para corredoras que firman, publican y gestionan en un solo lugar.</p>
      </aside>

      <main className="tw:relative tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:px-4 tw:py-8">
        <div
          aria-hidden
          className="tw:pointer-events-none tw:absolute tw:inset-0 tw:opacity-[0.55]"
          style={{
            background:
              'radial-gradient(700px 320px at 85% 0%, color-mix(in srgb, var(--brand) 10%, transparent), transparent 70%), var(--bg)',
          }}
        />
        {cargando ? (
          <img src="assets/logo.png" alt="PortalFirma Asset" className="login-logo tw:relative tw:z-[1] tw:opacity-80" />
        ) : (
          <div className="tw:relative tw:z-[1] tw:w-full tw:max-w-[400px]">
            {/* logo solo cuando no hay panel izquierdo */}
            <img src="assets/logo.png" alt="PortalFirma Asset" className="login-logo tw:mb-4 tw:lg:hidden" />
            {children}
          </div>
        )}
      </main>
    </div>
  );
}

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

  if (estado === 'cargando') {
    return (
      <div id="assetAcceso">
        <Marco cargando tituloMarca="Tu oficina inmobiliaria, en un solo lugar" textoMarca="Revisando tu sesión…" />
      </div>
    );
  }

  return (
    <div id="assetAcceso">
      <Marco
        tituloMarca="Tu oficina inmobiliaria, en un solo lugar"
        textoMarca="Entrá con el correo y la clave que te dio el administrador de tu corredora."
      >
        <form onSubmit={entrar} className="tw:flex tw:flex-col tw:gap-ui">
          <div className="tw:mb-1">
            <h1 className="tw:m-0 tw:text-[22px] tw:font-bold tw:leading-tight tw:tracking-tight">Ingresa a Asset</h1>
            <p className="tw:mt-1.5 tw:mb-0 tw:text-sm tw:leading-relaxed tw:text-muted">Con el email y la clave de tu corredora.</p>
          </div>
          <Input id="acEmail" type="email" autoComplete="username" autoFocus required etiqueta="Email" icono="mail"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input id="acClave" type="password" autoComplete="current-password" required etiqueta="Clave" icono="lock"
            value={clave} onChange={(e) => setClave(e.target.value)} />
          {error && <p id="acError" role="alert" className="tw:m-0 tw:text-center tw:text-sm tw:text-err">{error}</p>}
          <Boton id="acEntrar" type="submit" bloque cargando={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</Boton>
          {sinConexion && <Boton type="button" id="acReintentar" variante="fantasma" bloque onClick={() => accesoRestaurar()}>Reintentar</Boton>}
          <p className="tw:m-0 tw:text-center tw:text-xs tw:text-muted">¿Olvidaste tu clave? Pídele al administrador de tu corredora que te asigne una nueva.</p>
        </form>
      </Marco>
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
  const nombre = usuario?.nombre ? usuario.nombre.split(' ')[0] : '';

  return (
    <div id="assetClave">
      <Marco
        tituloMarca={obligatoria ? 'Una clave que solo tú sepas' : 'Actualiza tu clave'}
        textoMarca={obligatoria
          ? 'La que te dio el administrador es temporal. Antes de entrar a Asset, crea la tuya.'
          : 'Al cambiarla, las sesiones abiertas en otros equipos se cierran.'}
      >
        <form onSubmit={guardar} className="tw:flex tw:flex-col tw:gap-ui">
          <div className="tw:mb-1">
            <h1 className="tw:m-0 tw:text-[22px] tw:font-bold tw:leading-tight tw:tracking-tight">
              {obligatoria ? 'Crea tu clave' : 'Cambia tu clave'}
            </h1>
            <p className="tw:mt-1.5 tw:mb-0 tw:text-sm tw:leading-relaxed tw:text-muted">
              {obligatoria
                ? `Hola${nombre ? ` ${nombre}` : ''}: tu clave actual es la que te dio el administrador. Antes de seguir, crea una que solo tú sepas.`
                : 'Escribe tu clave actual y la nueva.'}
            </p>
          </div>
          <Input id="ccActual" type="password" autoComplete="current-password" autoFocus required icono="lock"
            etiqueta={obligatoria ? 'Clave que te dieron' : 'Clave actual'}
            value={actual} onChange={(e) => setActual(e.target.value)} />
          <Input id="ccNueva" type="password" autoComplete="new-password" required etiqueta="Clave nueva" icono="lock"
            value={nueva} onChange={(e) => setNueva(e.target.value)} />
          <Input id="ccRepetir" type="password" autoComplete="new-password" required etiqueta="Repite la clave nueva" icono="lock"
            value={repetir} onChange={(e) => setRepetir(e.target.value)} />
          {(error || aviso) && <p id="ccError" role="alert" className="tw:m-0 tw:text-center tw:text-sm tw:text-err">{error || aviso}</p>}
          <Boton id="ccGuardar" type="submit" bloque disabled={!listo} cargando={enviando}>{enviando ? 'Guardando…' : 'Guardar clave'}</Boton>
          {obligatoria
            ? <Boton type="button" variante="fantasma" bloque onClick={() => accesoSalir()}>Cerrar sesión</Boton>
            : <Boton type="button" variante="fantasma" bloque onClick={() => accesoPedirClave(false)}>Cancelar</Boton>}
        </form>
      </Marco>
    </div>
  );
}
