// Integraciones: los servicios conectados a Asset, en un solo lugar, cada uno con su estado y su botón.
//  · Firma: Portalfirma (la sesión de la corredora, en el servidor).
//  · Mensajes y redes: wechatia (la cuenta de mensajes de la corredora) y sus canales: WhatsApp, Instagram, Facebook,
//    correo y chat del sitio. La API de wechatia no conecta canales: «Conectar» abre la página de su panel donde se hace
//    (con el inicio de sesión de Meta). Un canal aparece «En uso» cuando hay conversaciones recientes por él.
//  · Portales (Mercado Libre / Portal Inmobiliario), archivos (Google Drive) y otros (Google Maps, asistente de IA).
// Conectar o cambiar lo que es de toda la corredora (Portalfirma, wechatia, Mercado Libre) es del administrador.
import { useEffect, useState, type ReactNode } from 'react';
import Layout from '../../ui/Layout';
import Card from '../../ui/Card';
import ItemLista from '../../ui/ItemLista';
import Badge from '../../ui/Badge';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import Icono from '../../ui/Icono';
import Esqueleto, { EsqueletoZona } from '../../ui/Esqueleto';
import { useIntegraciones } from '../../../store/hooks/useIntegraciones.hook';
import { useCuenta } from '../../../store/hooks/useCuenta.hook';
import { useAcceso } from '../../../store/hooks/useAcceso.hook';
import { integracionesService as svc, type IChilepropiedadesEstado, type IConvectaEstado, type IGoogleEstado, type IPfApiEstado } from '../../../store/services/integraciones.service';
import { refrescarCuenta } from '../cuenta/controlador';
import { abrirConfiguracion } from './controlador';
import { abrirPublicaciones, abrirUrl, pedirInicioSesion, toast } from '../../../utils/app';
import { api } from '../../../utils/api';
import { LogoPortal } from '../publicaciones/comun';
import { abrirCorreoPortal } from './CorreoPortal';
import type { IPortal } from '../../../store/interfaces/publicacion.interface';
import type { IUsuarioAsset } from '../../../store/interfaces/acceso.interface';
import { fechaHora } from '../../../utils/formato';
import type { ICanal, IMlEstado } from '../../../store/interfaces/integraciones.interface';

// ---------------------------------------------------------------- piezas

/** el logo de cada servicio: un ícono de la app (o una letra) sobre su color */
function Logo({ icono, letra, color }: { icono?: string; letra?: string; color: string }) {
  return (
    <span className="tw:inline-grid tw:place-items-center tw:size-10 tw:rounded-icono tw:text-white tw:font-bold tw:text-lg" style={{ background: color }}>
      {icono ? <Icono nombre={icono} tam={20} /> : letra}
    </span>
  );
}

type TEstado = 'conectado' | 'en-uso' | 'sin-conectar' | 'atencion' | 'incluido' | 'no-disponible' | 'en-tramite';
const ESTADO: Record<TEstado, [string, Parameters<typeof Badge>[0]['tono']]> = {
  conectado: ['Conectado', 'verde'],
  'en-uso': ['En uso', 'verde'],
  'sin-conectar': ['Sin conectar', 'gris'],
  atencion: ['Revisar', 'amarillo'],
  incluido: ['Incluido', 'azul'],
  'no-disponible': ['No disponible', 'gris'],
  'en-tramite': ['En trámite', 'amarillo'],
};

function Fila({ id, logo, nombre, detalle, estado, children }: { id: string; logo: ReactNode; nombre: string; detalle: ReactNode; estado: TEstado; children?: ReactNode }) {
  const [texto, tono] = ESTADO[estado];
  return (
    <ItemLista data-integracion={id} media={logo} titulo={nombre} detalle={detalle}
      derecha={<span className="tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-2">
        <Badge tono={tono} punto>{texto}</Badge>
        {children}
      </span>} />
  );
}

/** una lista de filas separadas por una línea */
function Lista({ children }: { children: ReactNode }) {
  return <div className="tw:flex tw:flex-col tw:divide-y tw:divide-line tw:[&>*]:py-3 tw:-my-3">{children}</div>;
}

/** notas de un formulario, debajo de los campos (no van bajo cada input: desarman la fila) */
function NotasForm({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-1 tw:p-0 tw:text-xs tw:text-muted">
      {items.map((t) => <li key={t}>· {t}</li>)}
    </ul>
  );
}

// ---------------------------------------------------------------- pantalla

/** las tarjetas de las integraciones (pantalla Configuración › Integraciones) */
export function IntegracionesContenido() {
  const { wechatia, canales, ml, drive, maps, ia, cargando, ocupado, integCargar, integAccion } = useIntegraciones();
  const { conectado: pfConectado, usuario: pfUsuario, sesion, saldo } = useCuenta();
  const { usuario: yo } = useAcceso();
  const admin = yo?.rol === 'ADMIN';
  // los portales que leen un feed (Chilepropiedades, Broku, TOCTOC, Yapo): los mismos y con el mismo estado que en Publicaciones › Portales
  const [portales, setPortales] = useState<IPortal[]>([]);
  const cargarPortales = () => { api<IPortal[]>('pubCatalogo').then(setPortales).catch(() => setPortales([])); };
  // Google (calendario y Drive): la cuenta de cada usuario y el Drive de la empresa; las sesiones viven en el servidor
  const [google, setGoogle] = useState<IGoogleEstado | null>(null); const [ocupadoG, setOcupadoG] = useState<string | null>(null);
  const cargarGoogle = () => { svc.google().then((r) => setGoogle(r.ok ? r.data ?? null : null)).catch(() => setGoogle(null)); };
  const accionGoogle = async (prov: 'google' | 'google_corredora', fn: typeof svc.googleConectar, listo: string) => {
    setOcupadoG(prov);
    const r = await fn(prov).catch((e: Error) => ({ ok: false, error: e.message, data: undefined }));
    setOcupadoG(null);
    if (r.ok) { setGoogle(r.data ?? null); toast(listo); } else toast(r.error || 'No se pudo completar.', 6000);
  };
  // API de Portalfirma: clave id, customer_id, correo y contraseña de la corredora (quedan cifradas en el servidor)
  const [pfApi, setPfApi] = useState<IPfApiEstado | null>(null); const [ocupadoPa, setOcupadoPa] = useState(false);
  const [paAbierto, setPaAbierto] = useState(false); const [pa, setPa] = useState({ id: '', customerId: '', email: '', password: '' });
  const cargarPfApi = () => { svc.pfApi().then((r) => setPfApi(r.ok ? r.data ?? null : null)).catch(() => setPfApi(null)); };
  const accionPfApi = async (fn: () => ReturnType<typeof svc.pfApiDesconectar>, listo: string) => {
    setOcupadoPa(true);
    const r = await fn().catch((e: Error) => ({ ok: false, error: e.message, data: undefined }));
    setOcupadoPa(false);
    if (r.ok) { setPfApi(r.data ?? null); setPaAbierto(false); setPa({ id: '', customerId: '', email: '', password: '' }); toast(listo); } else toast(r.error || 'No se pudo completar.', 6000);
  };
  const paListo = !!(pa.id.trim() && pa.customerId.trim() && pa.email.trim() && pa.password);
  // Convecta: la cuenta de la corredora de donde se importa la cartera (la clave queda en el servidor)
  const [convecta, setConvecta] = useState<IConvectaEstado | null>(null); const [ocupadoCv, setOcupadoCv] = useState(false);
  const [cvAbierto, setCvAbierto] = useState(false); const [cvClave, setCvClave] = useState('');
  const cargarConvecta = () => { svc.convecta().then((r) => setConvecta(r.ok ? r.data ?? null : null)).catch(() => setConvecta(null)); };
  const accionConvecta = async (fn: () => ReturnType<typeof svc.convectaDesconectar>, listo: string) => {
    setOcupadoCv(true);
    const r = await fn().catch((e: Error) => ({ ok: false, error: e.message, data: undefined }));
    setOcupadoCv(false);
    if (r.ok) { setConvecta(r.data ?? null); setCvAbierto(false); setCvClave(''); toast(listo); } else toast(r.error || 'No se pudo completar.', 6000);
  };
  useEffect(() => { integCargar(); refrescarCuenta(); cargarPortales(); cargarGoogle(); cargarConvecta(); cargarPfApi(); }, [integCargar]);

  const accion = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, listo?: string) => {
    const error = await integAccion(id, fn);
    if (error) toast(error, 5000); else if (listo) toast(listo);
    return !error;
  };

  const pfCuenta = (pfUsuario as { email?: string } | null)?.email || (sesion as { email?: string } | null)?.email || '';
  const saldoTxt = saldo != null ? ` · saldo $${Number(saldo).toLocaleString('es-CL')}` : '';

  return (
    <div id="integraciones" className="tw:flex tw:flex-col tw:gap-4">
      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
        <p className="tw:m-0 tw:flex-1 tw:text-sm tw:text-muted">Los servicios con los que trabaja tu corredora: firma, mensajes y redes, portales y Google.</p>
        <Boton variante="secundario" tamano="sm" icono="rotateR" cargando={cargando} onClick={() => { integCargar(); refrescarCuenta(); cargarPortales(); }}>Actualizar</Boton>
      </div>
      <Card titulo="Firma electrónica">
        <Lista>
          <Fila id="portalfirma" logo={<Logo icono="sign" color="#3346c7" />} nombre="Portalfirma"
            detalle={pfConectado ? `Firma, plantillas y notaría virtual${pfCuenta ? ' · ' + pfCuenta : ''}${saldoTxt}` : 'Para enviar documentos a firmar y usar las plantillas. La conecta una vez el administrador.'}
            estado={pfConectado ? 'conectado' : 'sin-conectar'}>
            {!pfConectado && (
              <Boton tamano="sm" icono="link" disabled={!admin} title={admin ? undefined : 'La conecta el administrador de la corredora'}
                onClick={() => pedirInicioSesion(() => { abrirConfiguracion('integraciones'); refrescarCuenta(); toast('Portalfirma conectado.'); }, 'Conecta la cuenta de Portalfirma de tu corredora.')}>
                Conectar
              </Boton>
            )}
          </Fila>
          <Fila id="portalfirmaApi" logo={<Logo icono="sign" color="#3346c7" />} nombre="API de Portalfirma"
            detalle={pfApi?.conectado ? `Enviar a firmar, seguir las firmas y bajar el PDF firmado${pfApi.email ? ' · ' + pfApi.email : ''}.` : 'Ingresa la clave «id», el customer_id, el correo y la contraseña del usuario de integración de tu empresa en Portalfirma.'}
            estado={pfApi?.conectado ? 'conectado' : 'sin-conectar'}>
            {pfApi?.admin ? (pfApi.conectado
              ? <Boton tamano="sm" variante="fantasma" cargando={ocupadoPa} onClick={() => accionPfApi(svc.pfApiDesconectar, 'API de Portalfirma desconectada.')}>Desconectar</Boton>
              : <Boton tamano="sm" icono="link" onClick={() => setPaAbierto((x) => !x)}>{paAbierto ? 'Cerrar' : 'Conectar'}</Boton>)
              : !pfApi?.conectado && <Boton tamano="sm" icono="link" disabled title="La conecta el administrador de la corredora">Conectar</Boton>}
          </Fila>
          {paAbierto && pfApi?.admin && !pfApi.conectado && (
            <form className="tw:flex tw:flex-col tw:gap-ui tw:pl-[52px]"
              onSubmit={(e) => { e.preventDefault(); accionPfApi(() => svc.pfApiConectar({ id: pa.id.trim(), customerId: pa.customerId.trim(), email: pa.email.trim(), password: pa.password }), 'API de Portalfirma conectada.'); }}>
              <div className="tw:flex tw:flex-wrap tw:items-end tw:justify-end tw:gap-ui">
                <Input id="paId" autoFocus clasesCampo="tw:flex-1 tw:min-w-[220px]" etiqueta="Clave «id» de la API" type="password" autoComplete="off" value={pa.id} onChange={(e) => setPa({ ...pa, id: e.target.value })} />
                <Input id="paCustomer" clasesCampo="tw:flex-1 tw:min-w-[220px]" etiqueta="customer_id" autoComplete="off" value={pa.customerId} onChange={(e) => setPa({ ...pa, customerId: e.target.value })} />
                <Input id="paEmail" clasesCampo="tw:flex-1 tw:min-w-[220px]" etiqueta="Correo del usuario" type="email" autoComplete="off" value={pa.email} onChange={(e) => setPa({ ...pa, email: e.target.value })} />
                <Input id="paClave" clasesCampo="tw:flex-1 tw:min-w-[220px]" etiqueta="Contraseña" type="password" autoComplete="new-password" value={pa.password} onChange={(e) => setPa({ ...pa, password: e.target.value })} />
                <Boton variante="secundario" tamano="lg" type="button" onClick={() => setPaAbierto(false)}>Cancelar</Boton>
                <Boton tamano="lg" type="submit" cargando={ocupadoPa} disabled={!paListo}>Guardar</Boton>
              </div>
              <NotasForm items={[
                'customer_id: el id de la empresa (entity_id), en Portalfirma › Configuración › Integraciones.',
                'Contraseña: se prueba con Portalfirma antes de guardarla y queda cifrada en el servidor.',
              ]} />
            </form>
          )}
        </Lista>
      </Card>

      <Card titulo="Mensajes y redes sociales"
        subtitulo="Llegan a través de wechatia: el servidor de Asset los lee y responden Sofía (leads), Tomás (clientes) y la postventa.">
        <Lista>
          <Wechatia conectado={!!wechatia?.conectado} locationId={wechatia?.locationId} numero={wechatia?.numero ?? null} panel={canales?.panel ?? null} admin={admin}
            ocupado={ocupado === 'wechatia'}
            conectar={(token, loc) => accion('wechatia', () => svc.conectarWechatia(token, loc), 'wechatia conectado.')}
            guardarNumero={(n) => accion('wechatia', () => svc.guardarNumeroWa(n), n ? 'Número de WhatsApp guardado.' : 'Número de WhatsApp borrado.')} />
          {(canales?.canales ?? []).map((c) => (
            <Canal key={c.id} c={c} cuentaLista={!!wechatia?.conectado} local={!!canales?.local} />
          ))}
        </Lista>
        {canales?.error && <p className="tw:mt-3 tw:mb-0 tw:text-xs tw:text-muted">No se pudo leer la actividad de los canales: {canales.error}</p>}
      </Card>

      <Card titulo="Cartera">
        <Lista>
          <Fila id="convecta" logo={<Logo letra="C" color="#0f766e" />} nombre="Convecta"
            detalle={!convecta?.disponible ? 'Todavía no está activado en el servidor de Asset.'
              : convecta.conectado ? 'De aquí se importa la cartera (Cartera › Importar desde Convecta). Cada corredora usa su propia cuenta.'
                : 'Pega la clave de suscripción de la cuenta de Convecta de tu corredora para importar su cartera.'}
            estado={!convecta?.disponible ? 'no-disponible' : convecta.conectado ? 'conectado' : 'sin-conectar'}>
            {convecta?.disponible && convecta.admin && (convecta.propia
              ? <Boton tamano="sm" variante="fantasma" cargando={ocupadoCv} onClick={() => accionConvecta(svc.convectaDesconectar, 'Convecta desconectado.')}>Desconectar</Boton>
              : <Boton tamano="sm" icono="link" onClick={() => setCvAbierto((x) => !x)}>Conectar</Boton>)}
          </Fila>
          {cvAbierto && convecta?.admin && (
            <form className="tw:flex tw:flex-col tw:gap-ui tw:pl-[52px]"
              onSubmit={(e) => { e.preventDefault(); accionConvecta(() => svc.convectaConectar(cvClave.trim()), 'Convecta conectado.'); }}>
              <div className="tw:flex tw:flex-wrap tw:items-end tw:justify-end tw:gap-ui">
                <Input id="cvClave" clasesCampo="tw:flex-1 tw:min-w-[220px]" etiqueta="Clave de suscripción de Convecta" type="password" autoComplete="off"
                  value={cvClave} onChange={(e) => setCvClave(e.target.value)} />
                <Boton variante="secundario" tamano="lg" type="button" onClick={() => setCvAbierto(false)}>Cancelar</Boton>
                <Boton tamano="lg" type="submit" cargando={ocupadoCv} disabled={cvClave.trim().length < 10}>Guardar</Boton>
              </div>
              <NotasForm items={['La entrega Convecta («Ocp-Apim-Subscription-Key»). Se prueba antes de guardarla.']} />
            </form>
          )}
        </Lista>
      </Card>

      <Card titulo="Portales inmobiliarios">
        <Lista>
          {!ml && cargando ? (
            <EsqueletoZona etiqueta="Cargando los portales">
              {[0, 1, 2].map((i) => (
                <div key={i} className="tw:flex tw:items-center tw:gap-3 tw:py-3">
                  <Esqueleto forma="icono" ancho={40} /><div className="tw:flex tw:flex-1 tw:flex-col tw:gap-2"><Esqueleto ancho="35%" alto={12} /><Esqueleto ancho="70%" alto={10} /></div>
                </div>
              ))}
            </EsqueletoZona>
          ) : ml?.via === 'konver' ? (
            <PortalesKonver ml={ml} admin={admin} ocupado={ocupado} accion={accion} />
          ) : (
          <Fila id="mercadolibre" logo={<Logo icono="house" color="#e9b200" />} nombre="Mercado Libre y Portal Inmobiliario"
              detalle={ml?.conectada ? `Publica y sincroniza avisos${ml.cuenta?.nickname ? ' · ' + ml.cuenta.nickname : ''}` : 'Publica tus propiedades y recibe los interesados en Leads.'}
              estado={!ml?.configurada ? 'no-disponible' : ml.conectada ? 'conectado' : 'sin-conectar'}>
              {/* la cuenta es de toda la corredora (la sesión vive en el servidor): la conecta y desconecta el administrador */}
              {ml?.configurada && (ml.conectada
                ? <Boton tamano="sm" variante="fantasma" cargando={ocupado === 'ml'} disabled={!admin} title={admin ? undefined : 'La desconecta el administrador de la corredora'}
                    onClick={() => accion('ml', svc.mlDesconectar, 'Mercado Libre desconectado.')}>Desconectar</Boton>
                : <Boton tamano="sm" icono="link" cargando={ocupado === 'ml'} disabled={!admin} title={admin ? undefined : 'La conecta el administrador de la corredora'}
                    onClick={() => accion('ml', svc.mlConectar, 'Mercado Libre conectado.')}>Conectar</Boton>)}
            </Fila>
          )}
          {portales.filter((x) => x.id !== 'pi' && x.via !== 'api').map((x) => (
            <PortalFeed key={x.id} x={x} admin={admin} yo={yo ?? null} alCambiar={cargarPortales} />
          ))}
        </Lista>
      </Card>

      <Card titulo="Google: calendario y Drive" subtitulo="Cada persona conecta su propia cuenta (el administrador también). El administrador conecta además la cuenta de la empresa, que todos usan como copia extra.">
        <Lista>
          <Fila id="google" logo={<Logo icono="calendar" color="#1a73e8" />} nombre="Tu cuenta de Google"
            detalle={!google?.disponible ? 'Todavía no está activada en el servidor de Asset.' : google.usuario.conectada ? `Tus visitas y eventos se crean en tu Google Calendar, y lo que envías a firmar deja una copia en tu Drive${google.usuario.cuenta ? ' · ' + google.usuario.cuenta : ''}.` : google.usuario.estado ? 'La sesión con Google venció: vuelve a conectarla.' : 'Conéctala para ver tus visitas en tu Google Calendar y guardar copias de los documentos en tu Drive.'}
            estado={!google?.disponible ? 'no-disponible' : google.usuario.conectada ? 'conectado' : google.usuario.estado ? 'atencion' : 'sin-conectar'}>
            {google?.disponible && (google.usuario.conectada
              ? <Boton tamano="sm" variante="fantasma" cargando={ocupadoG === 'google'} onClick={() => accionGoogle('google', svc.googleDesconectar, 'Google desconectado.')}>Desconectar</Boton>
              : <Boton tamano="sm" icono="link" cargando={ocupadoG === 'google'} onClick={() => accionGoogle('google', svc.googleConectar, 'Google conectado.')}>Conectar</Boton>)}
          </Fila>
          <Fila id="google_corredora" logo={<Logo icono="drive" color="#188038" />} nombre="Drive de la empresa"
            detalle={!google?.disponible ? 'Todavía no está activado en el servidor de Asset.'
              : google.empresa.conectada ? `Cada documento que envías a firmar deja además una copia en «Asset / Documentos enviados a firmar» de la empresa${google.empresa.cuenta ? ' · ' + google.empresa.cuenta : ''}. Es un extra: tu propio Drive sigue aparte.`
                : google.empresa.estado ? 'La sesión con Google venció: vuelve a conectarla.'
                  : google.admin ? 'Un Drive general para toda la empresa. Conéctalo tú (administrador), además de tu propia cuenta.'
                    : 'Un Drive general para toda la empresa. Lo conecta el administrador; cuando esté conectado, tus documentos también quedan copiados ahí.'}
            estado={!google?.disponible ? 'no-disponible' : google.empresa.conectada ? 'conectado' : google.empresa.estado ? 'atencion' : 'sin-conectar'}>
            {google?.disponible && (google.empresa.conectada
              ? <Boton tamano="sm" variante="fantasma" cargando={ocupadoG === 'google_corredora'} disabled={!google.admin} title={google.admin ? undefined : 'Lo desconecta el administrador de la corredora'}
                  onClick={() => accionGoogle('google_corredora', svc.googleDesconectar, 'Drive de la empresa desconectado.')}>Desconectar</Boton>
              : <Boton tamano="sm" icono="link" cargando={ocupadoG === 'google_corredora'} disabled={!google.admin} title={google.admin ? undefined : 'Lo conecta el administrador de la corredora'}
                  onClick={() => accionGoogle('google_corredora', svc.googleConectar, 'Drive de la empresa conectado.')}>Conectar</Boton>)}
          </Fila>
          {drive?.configured && (
            <Fila id="drive" logo={<Logo icono="drive" color="#1a73e8" />} nombre="Traer documentos desde Drive"
              detalle={drive?.connected ? `Expedientes y fotos${drive.email ? ' · ' + drive.email : ''}` : drive?.reconnect ? 'Vuelve a conectar: cambió el permiso que pide Asset.' : 'Para traer documentos y fotos desde tu Drive. Se conecta en cada equipo.'}
              estado={!drive?.configured ? 'no-disponible' : drive.connected ? 'conectado' : drive.reconnect ? 'atencion' : 'sin-conectar'}>
              {drive?.configured && (drive.connected
                ? <Boton tamano="sm" variante="fantasma" cargando={ocupado === 'drive'} onClick={() => accion('drive', svc.driveDesconectar, 'Google Drive desconectado.')}>Desconectar</Boton>
                : <Boton tamano="sm" icono="link" cargando={ocupado === 'drive'} onClick={() => accion('drive', svc.driveConectar, 'Google Drive conectado.')}>Conectar</Boton>)}
            </Fila>
          )}
        </Lista>
      </Card>

      <Card titulo="Otros servicios">
        <Lista>
          <Fila id="maps" logo={<Logo icono="pin" color="#34a853" />} nombre="Google Maps"
            detalle="Sugiere y completa direcciones al crear propiedades." estado={maps?.google ? 'conectado' : 'no-disponible'} />
          <Fila id="ia" logo={<Logo icono="sparkle" color="#7c3aed" />} nombre="Asistente de IA"
            detalle={ia?.managed ? (ia.propia ? 'Con una clave propia que reemplaza a la incluida.' : 'Incluido con tu cuenta de Portalfirma: no hay que configurar nada.') : 'El asistente que redacta, revisa documentos y atiende por WhatsApp.'}
            estado={ia?.managed ? 'incluido' : ia?.hasKey ? 'conectado' : 'sin-conectar'} />
        </Lista>
      </Card>
    </div>
  );
}

/** la pantalla sola (se mantiene por compatibilidad; desde el menú se abre Configuración › Integraciones) */
export default function Integraciones() {
  return <Layout titulo="Integraciones" ilustracion={{ imagen: 'img/formas/portales.svg', tinte: '#3346c7' }}><IntegracionesContenido /></Layout>;
}

// ---------------------------------------------------------------- KONVER: Portal Inmobiliario y TOCTOC

type TAccion = (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, listo?: string) => Promise<boolean>;

/** La llave de KONVER (de la corredora, en el servidor), la cuenta de Mercado Libre («Conectar» abre el navegador, como Google)
 *  y TOCTOC (sus 3 llaves). Conectar y desconectar es del administrador; cada portal se desconecta por separado
 *  (DELETE /v1/cuenta/mercadolibre y /v1/cuenta/toctoc de KONVER) y quitar la llave suelta los dos. */
function PortalesKonver({ ml, admin, ocupado, accion }: { ml: IMlEstado; admin: boolean; ocupado: string | null; accion: TAccion }) {
  const kv = ml.konver; const tt = ml.toctoc;
  const { usuario: yo } = useAcceso();
  const [llaveAbierta, setLlaveAbierta] = useState(false); const [llave, setLlave] = useState('');
  const [ttAbierto, setTtAbierto] = useState(false);
  // qué se está por desconectar (se confirma abajo de su fila): la llave de KONVER entera, solo Mercado Libre o solo TOCTOC
  const [desconectando, setDesconectando] = useState<'konver' | 'ml' | 'toctoc' | null>(null);
  const alternar = (q: 'konver' | 'ml' | 'toctoc') => setDesconectando((x) => (x === q ? null : q));
  const [tl, setTl] = useState({ keyCliente: '', keyIntegrador: '', corredorId: '' });
  const ttListo = !!(tl.keyCliente.trim() && tl.keyIntegrador.trim() && tl.corredorId.trim());
  const soloAdmin = (q: string) => (admin ? undefined : `${q} el administrador de la corredora`);
  return (
    <>
      <Fila id="konver" logo={<Logo letra="K" color="#1f7a3a" />} nombre="KONVER"
        detalle={kv?.conectado ? (kv.error || `Publica en Portal Inmobiliario y TOCTOC con una sola cuenta${kv.cliente ? ' · ' + kv.cliente : ''}${kv.propia ? '' : ' · incluida por PortalFirma'}.`) : 'La cuenta que publica en Portal Inmobiliario y TOCTOC. Pega la llave que te entregó KONVER.'}
        estado={kv?.conectado ? (kv.error ? 'atencion' : 'conectado') : 'sin-conectar'}>
        {kv?.conectado
          ? (kv.propia && <Boton tamano="sm" variante="fantasma" disabled={!admin || ocupado === 'konver'} title={soloAdmin('Lo desconecta')}
              onClick={() => alternar('konver')}>{desconectando === 'konver' ? 'Cerrar' : 'Desconectar'}</Boton>)
          : <Boton tamano="sm" icono="link" disabled={!admin || ocupado === 'konver'} title={soloAdmin('La pega')} onClick={() => setLlaveAbierta((x) => !x)}>{llaveAbierta ? 'Cerrar' : 'Conectar'}</Boton>}
      </Fila>
      {llaveAbierta && !kv?.conectado && admin && (
        <form className="tw:flex tw:flex-col tw:gap-ui tw:pl-[52px]"
          onSubmit={async (e) => { e.preventDefault(); if (await accion('konver', () => svc.kvLlave(llave.trim()), 'KONVER conectado.')) { setLlave(''); setLlaveAbierta(false); } }}>
          <div className="tw:flex tw:flex-wrap tw:items-end tw:justify-end tw:gap-ui">
            <Input id="kvLlave" autoFocus clasesCampo="tw:flex-1 tw:min-w-[220px]" etiqueta="Llave de KONVER" type="password" autoComplete="off" placeholder="kp_…"
              value={llave} onChange={(e) => setLlave(e.target.value)} />
            <Boton variante="secundario" tamano="lg" type="button" onClick={() => setLlaveAbierta(false)}>Cancelar</Boton>
            <Boton tamano="lg" type="submit" cargando={ocupado === 'konver'} disabled={!/^kp_\S{20,}$/.test(llave.trim())}>Guardar</Boton>
          </div>
          <NotasForm items={['Empieza con «kp_». Se prueba antes de guardarla y queda cifrada en el servidor.']} />
        </form>
      )}
      {desconectando === 'konver' && kv?.conectado && admin && (
        <Confirmar id="konver" cargando={ocupado === 'konver'} alCancelar={() => setDesconectando(null)}
          alConfirmar={async () => { if (await accion('konver', svc.kvQuitarLlave, 'KONVER desconectado.')) setDesconectando(null); }}>
          Se quita la llave de KONVER: se desconectan Portal Inmobiliario y TOCTOC, y dejan de llegar sus interesados.
          Los avisos ya publicados siguen en los portales, pero Asset deja de actualizarlos.
        </Confirmar>
      )}
      <Fila id="mercadolibre" logo={<Logo icono="house" color="#e9b200" />} nombre="Mercado Libre y Portal Inmobiliario"
        detalle={!kv?.conectado ? 'Primero conecta KONVER.' : ml.conectada ? `Publica, actualiza, pausa y finaliza avisos; los interesados llegan a Leads${ml.cuenta?.nickname ? ' · ' + ml.cuenta.nickname : ''}.` : 'Conecta la cuenta de Mercado Libre de la corredora: se abre el navegador para autorizar.'}
        estado={!kv?.conectado ? 'no-disponible' : ml.conectada ? 'conectado' : 'sin-conectar'}>
        {kv?.conectado && !ml.conectada && (
          <Boton tamano="sm" icono="link" cargando={ocupado === 'ml'} disabled={!admin} title={soloAdmin('La conecta')}
            onClick={() => accion('ml', svc.mlConectar, 'Mercado Libre conectado.')}>{ocupado === 'ml' ? 'Esperando la autorización…' : 'Conectar'}</Boton>
        )}
        {kv?.conectado && ml.conectada && (
          <Boton tamano="sm" variante="fantasma" disabled={!admin || ocupado === 'ml'} title={soloAdmin('La desconecta')}
            onClick={() => alternar('ml')}>{desconectando === 'ml' ? 'Cerrar' : 'Desconectar'}</Boton>
        )}
      </Fila>
      {desconectando === 'ml' && kv?.conectado && ml.conectada && admin && (
        <Confirmar id="ml" cargando={ocupado === 'ml'} alCancelar={() => setDesconectando(null)}
          alConfirmar={async () => { if (await accion('ml', svc.mlDesconectar, 'Mercado Libre desconectado.')) setDesconectando(null); }}>
          Se le quita a KONVER el permiso en la cuenta de Mercado Libre{ml.cuenta?.nickname ? ` ${ml.cuenta.nickname}` : ''}. Los avisos publicados y los interesados
          ya recibidos no se tocan, pero Asset deja de publicar y actualizar en Portal Inmobiliario. Para usar otra cuenta, pulsa «Conectar» de nuevo.
        </Confirmar>
      )}
      <Fila id="toctoc" logo={<LogoPortal id="toctoc" nombre="TOCTOC" />} nombre="TOCTOC"
        detalle={!kv?.conectado ? 'Primero conecta KONVER.' : tt?.conectado ? (tt.planActivo ? `Publica, actualiza y retira avisos; los interesados llegan a Leads${tt.corredorId ? ' · corredor ' + tt.corredorId : ''}.` : 'Llaves válidas, pero la cuenta no tiene plan activo o se acabó el cupo.') : 'Pega las 3 llaves que TOCTOC (integraciones@toctoc.com) entrega a las corredoras con plan activo.'}
        estado={!kv?.conectado ? 'no-disponible' : tt?.conectado ? (tt.planActivo ? 'conectado' : 'atencion') : 'sin-conectar'}>
        {!tt?.conectado && <Boton tamano="sm" variante="secundario" icono="mail" onClick={() => abrirCorreoPortal('toctoc', yo ?? null)}>Solicitar llaves</Boton>}
        {kv?.conectado && (tt?.conectado
          ? <Boton tamano="sm" variante="fantasma" cargando={ocupado === 'toctoc'} disabled={!admin} title={soloAdmin('Lo desconecta')}
              onClick={() => alternar('toctoc')}>{desconectando === 'toctoc' ? 'Cerrar' : 'Desconectar'}</Boton>
          : <Boton tamano="sm" icono="link" disabled={!admin || ocupado === 'toctoc'} title={soloAdmin('Lo conecta')} onClick={() => setTtAbierto((x) => !x)}>{ttAbierto ? 'Cerrar' : 'Conectar'}</Boton>)}
      </Fila>
      {desconectando === 'toctoc' && kv?.conectado && tt?.conectado && admin && (
        <Confirmar id="toctoc" cargando={ocupado === 'toctoc'} alCancelar={() => setDesconectando(null)}
          alConfirmar={async () => { if (await accion('toctoc', svc.kvToctocQuitar, 'TOCTOC desconectado.')) setDesconectando(null); }}>
          Se borran las llaves de TOCTOC en KONVER. Los avisos publicados siguen en TOCTOC, pero Asset deja de publicarlos y actualizarlos.
          Para volver a conectar, pega las 3 llaves otra vez.
        </Confirmar>
      )}
      {ttAbierto && kv?.conectado && !tt?.conectado && admin && (
        <form className="tw:flex tw:flex-wrap tw:items-end tw:justify-end tw:gap-ui tw:pl-[52px]"
          onSubmit={async (e) => { e.preventDefault(); if (await accion('toctoc', () => svc.kvToctoc({ keyCliente: tl.keyCliente.trim(), keyIntegrador: tl.keyIntegrador.trim(), corredorId: tl.corredorId.trim() }), 'TOCTOC conectado.')) { setTl({ keyCliente: '', keyIntegrador: '', corredorId: '' }); setTtAbierto(false); } }}>
          <Input id="ttCliente" autoFocus clasesCampo="tw:flex-1 tw:min-w-[180px]" etiqueta="Llave del cliente" type="password" autoComplete="off" value={tl.keyCliente} onChange={(e) => setTl({ ...tl, keyCliente: e.target.value })} />
          <Input id="ttIntegrador" clasesCampo="tw:flex-1 tw:min-w-[180px]" etiqueta="Llave del integrador" type="password" autoComplete="off" value={tl.keyIntegrador} onChange={(e) => setTl({ ...tl, keyIntegrador: e.target.value })} />
          <Input id="ttCorredor" clasesCampo="tw:w-[140px]" etiqueta="Id del corredor" autoComplete="off" value={tl.corredorId} onChange={(e) => setTl({ ...tl, corredorId: e.target.value })} />
          <Boton variante="secundario" tamano="lg" type="button" onClick={() => setTtAbierto(false)}>Cancelar</Boton>
          <Boton tamano="lg" type="submit" cargando={ocupado === 'toctoc'} disabled={!ttListo}>Guardar</Boton>
        </form>
      )}
    </>
  );
}

// Broku y Yapo quedan desactivados por ahora: se ven, pero no se pueden conectar
const FEED_DESACTIVADOS = ['broku', 'yapo'];

/** un portal por feed: todos con «Conectar» / «Desconectar». Chilepropiedades se conecta con el token de la cuenta de la
 *  corredora (trae los contactos de los avisos a Leads) y tiene «Solicitar llaves» (abre el correo al portal) */
function PortalFeed({ x, admin, yo, alCambiar }: { x: IPortal; admin: boolean; yo: IUsuarioAsset | null; alCambiar: () => void }) {
  const cp = x.id === 'chilepropiedades';
  const [cpEstado, setCpEstado] = useState<IChilepropiedadesEstado | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [token, setToken] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    if (!cp) return;
    svc.chilepropiedades().then((r) => setCpEstado(r.ok ? r.data ?? null : null)).catch(() => setCpEstado(null));
  }, [cp]);
  const desactivado = FEED_DESACTIVADOS.includes(x.id);
  const conectado = cp ? !!cpEstado?.conectado : x.listo;
  const soloAdmin = admin ? undefined : 'Lo hace el administrador de la corredora';
  const correr = async (fn: () => Promise<{ ok: boolean; data?: IChilepropiedadesEstado; error?: string }>, listo: string) => {
    setCargando(true);
    try {
      const r = await fn();
      if (!r.ok) { toast(r.error || 'No se pudo completar.'); return false; }
      if (r.data) setCpEstado(r.data);
      toast(listo);
      alCambiar();
      return true;
    } finally {
      setCargando(false);
    }
  };
  const desconectar = async () => {
    if (cp) { if (await correr(svc.chilepropiedadesDesconectar, 'Chilepropiedades desconectado.')) setConfirmando(false); return; }
    setCargando(true);
    try {
      await api('pubConfigurar', x.id, { activo: false, feedUrl: x.feedUrl ?? '' });
      toast(`${x.nombre} desconectado.`);
      setConfirmando(false);
      alCambiar();
    } catch (e) {
      toast((e as Error).message || `No se pudo desconectar ${x.nombre}.`);
    } finally {
      setCargando(false);
    }
  };
  const detalle = desactivado ? 'Próximamente.'
    : cp ? (cpEstado?.error && cpEstado.estado === 'error' ? 'Chilepropiedades rechazó el token: vuelve a conectarlo.'
      : conectado ? `Los contactos de tus avisos llegan a Leads${cpEstado?.leads ? ` · ${cpEstado.leads} recibidos` : ''}.`
      : 'Solicita las llaves al portal y pega el token que te entregue.')
    : conectado ? `${x.estado}. Publica y retira avisos desde Asset.` : 'Solicita las llaves al portal y conéctalo cuando te las entregue.';
  return (
    <>
      <Fila id={x.id} logo={<LogoPortal id={x.id} nombre={x.nombre} />} nombre={x.nombre} detalle={detalle}
        estado={desactivado ? 'no-disponible' : cp && cpEstado?.estado === 'error' ? 'atencion' : conectado ? 'conectado' : 'sin-conectar'}>
        {!desactivado && !conectado && cp && (
          <Boton tamano="sm" variante="secundario" icono="mail" onClick={() => abrirCorreoPortal('chilepropiedades', yo)}>Solicitar llaves</Boton>
        )}
        {conectado && !desactivado
          ? <Boton tamano="sm" variante="fantasma" disabled={!admin} title={soloAdmin} onClick={() => setConfirmando((v) => !v)}>{confirmando ? 'Cerrar' : 'Desconectar'}</Boton>
          : <Boton tamano="sm" icono="link" disabled={desactivado || !admin} title={desactivado ? undefined : soloAdmin}
              onClick={() => (cp ? setAbierto((v) => !v) : abrirPublicaciones('portales'))}>{cp && abierto ? 'Cerrar' : 'Conectar'}</Boton>}
      </Fila>
      {cp && abierto && !conectado && admin && (
        <form className="tw:flex tw:flex-wrap tw:items-end tw:justify-end tw:gap-ui tw:pl-[52px]"
          onSubmit={async (e) => { e.preventDefault(); if (await correr(() => svc.chilepropiedadesConectar(token.trim()), 'Chilepropiedades conectado.')) { setToken(''); setAbierto(false); } }}>
          <Input id="cpToken" autoFocus clasesCampo="tw:flex-1 tw:min-w-[260px]" etiqueta="Token de Chilepropiedades" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          <Boton variante="secundario" tamano="lg" type="button" onClick={() => setAbierto(false)}>Cancelar</Boton>
          <Boton tamano="lg" type="submit" cargando={cargando} disabled={!token.trim()}>Guardar</Boton>
        </form>
      )}
      {confirmando && admin && (
        <Confirmar id={x.id} cargando={cargando} alCancelar={() => setConfirmando(false)} alConfirmar={() => void desconectar()}>
          {cp ? 'Se borra el token: los contactos de Chilepropiedades dejan de llegar a Leads. Para volver, pega el token otra vez.'
            : `Asset deja de enviar tus avisos a ${x.nombre}. Para volver a publicar, pulsa «Conectar».`}
        </Confirmar>
      )}
    </>
  );
}

/** confirmación bajo la fila de un portal antes de desconectarlo (texto a la izquierda, botones a la derecha) */
function Confirmar({ id, cargando, alCancelar, alConfirmar, children }: { id: string; cargando: boolean; alCancelar: () => void; alConfirmar: () => void; children: ReactNode }) {
  return (
    <div data-kv="desconectar" data-kv-que={id} className="tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-3 tw:pl-[52px]">
      <p className="tw:m-0 tw:flex-1 tw:min-w-[240px] tw:text-[13px] tw:text-muted">{children}</p>
      <Boton variante="secundario" onClick={alCancelar}>Cancelar</Boton>
      <Boton variante="peligro" cargando={cargando} onClick={alConfirmar}>Desconectar</Boton>
    </div>
  );
}

// ---------------------------------------------------------------- wechatia y sus canales

function Wechatia({ conectado, locationId, numero, panel, admin, ocupado, conectar, guardarNumero }: {
  conectado: boolean; locationId?: string; numero: string | null; panel: string | null; admin: boolean; ocupado: boolean;
  conectar: (token: string, locationId: string) => void;
  guardarNumero: (numero: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [token, setToken] = useState('');
  const [loc, setLoc] = useState(locationId || '');
  const [editNum, setEditNum] = useState(false);
  const [num, setNum] = useState(numero || '');
  const numValido = !num.trim() || /^(\+?56)?9\d{8}$/.test(num.replace(/[\s.-]/g, ''));
  return <>
    <Fila id="wechatia" logo={<Logo letra="w" color="#16a34a" />} nombre="wechatia"
      detalle={conectado ? `La cuenta de mensajes de la corredora${locationId ? ' · ' + locationId : ''}` : 'La cuenta de mensajes de la corredora: sin ella no hay WhatsApp, Instagram ni Facebook.'}
      estado={conectado ? 'conectado' : 'sin-conectar'}>
      {conectado && panel && <Boton tamano="sm" variante="fantasma" iconoDerecha="arrowR" onClick={() => abrirUrl(panel)}>Abrir panel</Boton>}
      {admin && <Boton tamano="sm" variante={conectado ? 'fantasma' : 'principal'} icono={conectado ? 'edit' : 'link'} onClick={() => setAbierto((x) => !x)}>
        {conectado ? 'Cambiar clave' : 'Conectar'}
      </Boton>}
    </Fila>
    {abierto && admin && (
      <form className="tw:flex tw:flex-col tw:gap-ui tw:pl-[52px]"
        onSubmit={(e) => { e.preventDefault(); conectar(token.trim(), loc.trim()); setToken(''); setAbierto(false); }}>
        <div className="tw:flex tw:flex-wrap tw:items-end tw:gap-ui">
          <Input clasesCampo="tw:flex-1 tw:min-w-[220px]" etiqueta="Clave de la integración privada" type="password" autoComplete="off"
            value={token} onChange={(e) => setToken(e.target.value)} placeholder="pit-…" />
          <Input clasesCampo="tw:w-[220px]" etiqueta="Id de la cuenta (location)" value={loc} onChange={(e) => setLoc(e.target.value)} />
          <Boton tamano="lg" type="submit" cargando={ocupado} disabled={token.trim().length < 20 || loc.trim().length < 4}>Guardar</Boton>
        </div>
        <NotasForm items={['Id de la cuenta: está en la dirección del panel (…/location/XXXX/…).']} />
      </form>
    )}
    {conectado && (
      <Fila id="wechatia-numero" logo={<Logo icono="whatsapp" color="#25d366" />} nombre="Número de WhatsApp de la empresa"
        detalle={numero ? `${numero} · Asset solo lee los WhatsApp que llegan a este número y envía desde él. Es el número al que los corredores vinculan su celular.`
          : 'Sin indicar: Asset lee todos los WhatsApp de la cuenta y envía desde su número por defecto. Indícalo si la cuenta de wechatia tiene más de un número.'}
        estado={numero ? 'conectado' : 'atencion'}>
        {admin && <Boton tamano="sm" variante="fantasma" icono="edit" onClick={() => { setNum(numero || ''); setEditNum((x) => !x); }}>{numero ? 'Cambiar' : 'Indicar'}</Boton>}
      </Fila>
    )}
    {conectado && editNum && admin && (
      <form className="tw:flex tw:flex-col tw:gap-ui tw:pl-[52px]"
        onSubmit={(e) => { e.preventDefault(); guardarNumero(num.trim()); setEditNum(false); }}>
        <div className="tw:flex tw:flex-wrap tw:items-end tw:justify-end tw:gap-ui">
          <Input id="waNumeroEmpresa" clasesCampo="tw:flex-1 tw:min-w-[220px]" etiqueta="Celular de WhatsApp de la empresa" value={num}
            onChange={(e) => setNum(e.target.value)} placeholder="+56 9 1234 5678" />
          <Boton variante="secundario" tamano="lg" type="button" onClick={() => setEditNum(false)}>Cancelar</Boton>
          <Boton tamano="lg" type="submit" cargando={ocupado} disabled={!numValido}>Guardar</Boton>
        </div>
        <NotasForm items={[numValido
          ? 'El número conectado en la cuenta de wechatia de la corredora. Déjalo vacío para no filtrar.'
          : 'Escribe un celular chileno: +56 9 y 8 dígitos.']} />
      </form>
    )}
  </>;
}

const LOGO_CANAL: Record<string, { icono?: string; letra?: string; color: string }> = {
  whatsapp: { icono: 'whatsapp', color: '#25d366' },
  instagram: { icono: 'instagram', color: '#d62976' },
  facebook: { letra: 'f', color: '#1877f2' },
  correo: { icono: 'mail', color: '#64748b' },
  chat: { icono: 'phone', color: '#0ea5e9' },
};
const PARA_QUE: Record<string, string> = {
  whatsapp: 'Conversaciones con clientes y leads, recordatorios y avisos.',
  instagram: 'Mensajes directos: los interesados entran como leads.',
  facebook: 'Mensajes de tu página: los interesados entran como leads.',
  correo: 'Correos de portales y clientes, en la misma bandeja.',
  chat: 'El chat de tu sitio web.',
};

function Canal({ c, cuentaLista, local }: { c: ICanal; cuentaLista: boolean; local: boolean }) {
  const detalle = c.enUso && c.ultimo ? `${PARA_QUE[c.id] ?? ''} Último mensaje: ${fechaHora(c.ultimo)}.` : PARA_QUE[c.id] ?? '';
  return (
    <Fila id={`canal-${c.id}`} logo={<Logo {...(LOGO_CANAL[c.id] ?? { icono: 'link', color: '#64748b' })} />} nombre={c.nombre}
      detalle={local ? `${PARA_QUE[c.id] ?? ''} Entra con tu cuenta de Asset para ver su estado.` : detalle}
      estado={c.enUso ? 'en-uso' : 'sin-conectar'}>
      {c.conectar && (
        <Boton tamano="sm" variante={c.enUso ? 'fantasma' : 'secundario'} iconoDerecha="arrowR" disabled={!cuentaLista}
          title="Se abre el panel de wechatia, donde se conecta con el inicio de sesión de Meta o del correo"
          onClick={() => abrirUrl(c.conectar!)}>
          {c.enUso ? 'Administrar' : 'Conectar'}
        </Boton>
      )}
    </Fila>
  );
}
